/**
 * net.js — lapisan jaringan: Trystero (P2P WebRTC, sinyal lewat jaringan Nostr).
 *
 * Gratis total, tanpa akun / API key / server: begitu dua browser membuka
 * URL yang sama dan memasukkan kode room yang sama, mereka tersambung
 * langsung (peer-to-peer). Chat, langkah catur, undo, dan voice (mic)
 * semuanya jalan di koneksi WebRTC itu — terenkripsi DTLS ujung-ke-ujung.
 *
 * API publik sengaja disamakan dengan versi Tencent (TIM + TRTC) sebelumnya:
 * connect / send / on / disconnect / joinVoice / leaveVoice / toggleMute /
 * voiceState / setMode — sehingga app.js nyaris tidak perlu berubah.
 *
 * Catatan warna: _groupOwner & _createdGroup dipertahankan tapi kosong/false;
 * pembagian putih-hitam jatuh ke pembanding selfId (deterministik dan
 * saling komplemen di kedua sisi).
 */
(function () {
  'use strict';

  const listeners = {}; // aksi -> [fn]
  function emit(aksi, data) {
    (listeners[aksi] || []).forEach(fn => {
      try { fn(data); } catch (e) { console.error('[net] listener error', aksi, e); }
    });
  }

  const Net = {
    online: false,
    mode: 'offline', // 'offline' | 'connecting' | 'online' | 'error'
    userId: null,      // selfId Trystero (acak, unik per tab)
    displayName: null, // nama cantik yang diketik user
    roomCode: null,
    peerId: null,      // selfId lawan
    peerName: null,

    // kompatibilitas app.js (konsep grup Tencent sudah tidak ada)
    _groupOwner: null,
    _createdGroup: false,
    _lastUndoBy: null,
    _lastErr: null,

    _room: null,
    _proto: null,

    on: function (aksi, fn) {
      (listeners[aksi] = listeners[aksi] || []).push(fn);
    },

    /** Mode -> status global + bendera online (dipakai guard send()). */
    setMode(mode, errMsg) {
      this.mode = mode;
      this.online = mode === 'online';
      this._lastErr = errMsg || null;
      emit('net_state', { mode, errMsg: errMsg || null });
    },

    async connect(opts) {
      // opts: { roomCode, userName, displayName }
      this.roomCode = opts.roomCode;
      this.displayName = opts.displayName || opts.userName || null;
      this.setMode('connecting');

      const T = globalThis.Trystero;
      if (!T || typeof T.joinRoom !== 'function') {
        this.setMode('error', 'Trystero gagal dimuat — muat ulang halaman');
        return false;
      }
      const rc = String(opts.roomCode || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60);
      if (!rc) {
        this.setMode('error', 'Kode room kosong / tidak valid');
        return false;
      }

      try {
        const { joinRoom, selfId } = T;
        this.userId = selfId;

        const room = joinRoom({ appId: 'catur-romantis' }, rc);
        this._room = room;

        // satu channel aksi: payload { a: aksi, from: userId, ...data }
        const proto = room.makeAction('proto');
        this._proto = proto;
        proto.onMessage = (payload, meta) => {
          const peerId = meta && meta.peerId;
          if (!payload || !payload.a || !peerId || peerId === selfId) return;
          this.peerId = peerId;
          emit(payload.a, { from: peerId, data: payload });
        };

        room.onPeerJoin = (peerId) => {
          this.peerId = peerId;
          // jabat tangan identitas tiap kali lawan tersambung (termasuk rejoin)
          this.send('hello', {
            name: this.displayName || this.userId,
            created: false,
            ts: Date.now(),
          });
          // bila voice sedang nyala, kirim mic ke peer baru
          if (this._localStream && this.voiceState.joined) {
            try { room.addStream(this._localStream, { target: peerId }); } catch (e) {}
          }
        };

        room.onPeerLeave = (peerId) => {
          this._detachRemote();
          emit('peer_leave', { from: peerId });
        };

        room.onPeerStream = (stream) => this._attachRemote(stream);

        this.setMode('online');
        return true;
      } catch (e) {
        const msg = (e && (e.message || e.toString())) || '';
        this.setMode('error', 'Koneksi gagal: ' + msg.slice(0, 140));
        return false;
      }
    },

    _hasPeers() {
      try {
        const peers = this._room && this._room.getPeers && this._room.getPeers();
        return !!(peers && Object.keys(peers).length > 0);
      } catch (e) { return false; }
    },

    /** kirim aksi ke lawan. return true bila sempat dikirim ke >=1 peer */
    async send(aksi, data) {
      if (!this._proto || !this.online) return false;
      if (!this._hasPeers()) return false;
      try {
        this._proto.send(Object.assign({ a: aksi, from: this.userId }, data || {}));
        return true;
      } catch (e) {
        console.warn('[net] kirim gagal', aksi, e);
        return false;
      }
    },

    disconnect() {
      try { this.leaveVoice(); } catch (e) {}
      try { if (this._room) this._room.leave(); } catch (e) {}
      this._room = null;
      this._proto = null;
      this.peerId = null;
      this.setMode('offline');
    },

    // ---------------- VOICE (WebRTC stream, bukan TRTC) ----------------
    voiceState: { joined: false, muted: false, peerSpeaking: false },
    _localStream: null,
    _remote: null, // { el, ctx, timer }

    async joinVoice() {
      if (!this.online || !this._room) throw new Error('Voice butuh koneksi online');
      if (this.voiceState.joined) return true;
      const md = navigator.mediaDevices;
      if (!md || !md.getUserMedia) throw new Error('Browser tidak mendukung mikrofon');
      const stream = await md.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      this._localStream = stream;
      this._room.addStream(stream); // ke peer sekarang; yang baru bergabung ditangani onPeerJoin
      this.voiceState.joined = true;
      this.voiceState.muted = false;
      return true;
    },

    async toggleMute() {
      if (!this.voiceState.joined || !this._localStream) return false;
      const enable = this.voiceState.muted; // toggle
      this._localStream.getAudioTracks().forEach(t => { t.enabled = enable; });
      this.voiceState.muted = !this.voiceState.muted;
      return this.voiceState.muted;
    },

    async leaveVoice() {
      try { if (this._room && this._localStream) this._room.removeStream(this._localStream); } catch (e) {}
      try { if (this._localStream) this._localStream.getTracks().forEach(t => t.stop()); } catch (e) {}
      this._localStream = null;
      this._detachRemote();
      this.voiceState = { joined: false, muted: false, peerSpeaking: false };
    },

    /** pasang stream mic lawan ke elemen audio + deteksi "sedang bicara" */
    _attachRemote(stream) {
      this._detachRemote();
      const el = document.createElement('audio');
      el.autoplay = true;
      el.srcObject = stream;
      document.body.appendChild(el);
      const p = el.play();
      if (p && p.catch) p.catch(() => emit('voice_error', { message: 'Autoplay diblokir browser — ketuk layar sekali' }));
      emit('voice_peer_on', {});

      // volume meter sederhana untuk indikator "pacar sedang bicara"
      let ctx = null;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          ctx = new AC();
          const src = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          src.connect(analyser);
          const buf = new Uint8Array(analyser.frequencyBinCount);
          const timer = setInterval(() => {
            analyser.getByteFrequencyData(buf);
            let sum = 0;
            for (let i = 0; i < buf.length; i++) sum += buf[i];
            const speaking = sum / buf.length > 12;
            if (speaking !== this.voiceState.peerSpeaking) {
              this.voiceState.peerSpeaking = speaking;
              emit('voice_peer_speaking', speaking);
            }
          }, 300);
          this._remote = { el, ctx, timer };
          return;
        }
      } catch (e) { /* tanpa meteran tak apa */ }
      this._remote = { el, ctx, timer: null };
    },

    _detachRemote() {
      const r = this._remote;
      if (!r) { return; }
      try { if (r.timer) clearInterval(r.timer); } catch (e) {}
      try { if (r.ctx) r.ctx.close(); } catch (e) {}
      try { if (r.el) r.el.remove(); } catch (e) {}
      this._remote = null;
      if (this.voiceState.peerSpeaking) {
        this.voiceState.peerSpeaking = false;
        emit('voice_peer_off', {});
      }
    },
  };

  window.Net = Net;
})();
