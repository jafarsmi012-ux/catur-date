/**
 * net.js — lapisan jaringan: Tencent TIM (chat custom message) + TRTC (voice).
 *
 * Arsitektur pesan: semua event game dikirim sebagai TIM Custom Message
 * ke grup sementara bernama `catur-<kode kamar>` (type: GRP_CHATROOM),
 * dengan payload JSON { a: aksi, ...data }.
 * TRTC memakai room id numerik (hash dari kode kamar) untuk voice.
 *
 * Bila server belum punya env (mode satu HP), semua method no-op dan
 * state tetap 'offline' — game lokal tetap jalan penuh.
 */
(function () {
  'use strict';

  /** hash string -> angka 1..2^30 (room id TRTC memakai stringRoomId agar konsisten) */
  function hash32(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return String(Math.abs(h) % 2147483000 + 1);
  }

  const listeners = {}; // aksi -> [fn]
  function emit(aksi, data) {
    (listeners[aksi] || []).forEach(fn => {
      try { fn(data); } catch (e) { console.error('[net] listener error', aksi, e); }
    });
  }

  const Net = {
    online: false,
    mode: 'offline', // 'offline' | 'connecting' | 'online' | 'error'
    userId: null,
    roomCode: null,
    groupId: null,
    trtcRoomId: null,
    peerId: null,     // userId lawan
    peerName: null,
    on: function (aksi, fn) {
      (listeners[aksi] = listeners[aksi] || []).push(fn);
    },

    // ---------------- TIM ----------------
    tim: null,
    voice: null, // wrapper TRTC di bawah

    /** Pastikan grup chat ada; dibuat bila belum. Catat pemilik grup (owner = putih). */
    async ensureGroup() {
      const tim = this.tim;
      const gid = this.groupId;
      this._createdGroup = false;
      this._groupOwner = null;
      const lookup = async () => {
        try {
          const res = await tim.searchGroupByID(gid);
          if (res && res.data && res.data.group) {
            this._groupOwner = res.data.group.ownerID || null;
            return true;
          }
        } catch (e) { /* belum ada -> nanti dibuat */ }
        return false;
      };
      if (await lookup()) return;
      try {
        await tim.createGroup({
          groupID: gid,
          name: 'Catur ' + this.roomCode,
          type: TIM.TYPES.GRP_CHATROOM,
          joinOption: TIM.TYPES.JOIN_OPTIONS_FREE_ACCESS,
        });
        this._createdGroup = true; // kita pemilik grup -> putih
        this._groupOwner = this.userId;
      } catch (e) {
        // 10025: pesaing membuat grup sepersekian detik lebih dulu — cari pemiliknya
        if (String(e && e.code) !== '10025') throw e;
        await lookup();
      }
    },

    async connect(opts) {
      // opts: { roomCode, userName, displayName }
      this.roomCode = opts.roomCode;
      this.userId = opts.userName;
      this.displayName = opts.displayName || null;
      this.groupId = 'catur-' + opts.roomCode.toLowerCase().replace(/[^a-z0-9-]/g, '');
      this.trtcRoomId = hash32(this.groupId);
      this.setMode('connecting');

      if (typeof TIM === 'undefined' || typeof TRTC === 'undefined') {
        this.setMode('offline');
        return false;
      }
      // ambil usersig dari backend kita
      let cred;
      try {
        const r = await fetch('/api/usersig?user=' + encodeURIComponent(this.userId));
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'HTTP ' + r.status);
        cred = await r.json();
      } catch (e) {
        this.setMode('error', 'Gagal ambil UserSig: ' + e.message);
        return false;
      }

      // ---- TIM ----
      try {
        this.tim = TIM.create({ SDKAppID: cred.sdkAppId });
        this.tim.setLogLevel(1); // 1 = info minimal
        this.tim.on(TIM.EVENT.SDK_READY, () => this.setMode('online'));
        this.tim.on(TIM.EVENT.SDK_NOT_READY, () => this.setMode('online')); // tetap online, siap retry
        this.tim.on(TIM.EVENT.MESSAGE_RECEIVED, (ev) => this._onMessage(ev));
        this.tim.on(TIM.EVENT.KICKED_OUT, () => this.setMode('error', 'Sesi ditendang (login di tempat lain?)'));
        this.tim.on(TIM.EVENT.ERROR, (ev) => {
          const code = ev && ev.data && ev.data.code;
          // 70001: usersig invalid/expired — tampilkan dengan jelas
          if (code === 70001) this.setMode('error', 'UserSig tidak valid — periksa SDKAPPID/SECRETKEY di .env');
        });
        await this.tim.login({
          userID: cred.userId,
          userSig: cred.userSig,
        });
        await this.ensureGroup();
        try {
          await this.tim.joinGroup({ groupID: this.groupId });
        } catch (e) {
          // 10013: sudah jadi anggota (pembuat grup otomatis anggota) — aman diabaikan
          if (String(e && e.code) !== '10013') throw e;
        }
        this.online = true; // WAJIB sebelum hello: send() menolak pesan saat offline
        // umumkan identitas (nama tampilan) + status pembuat grup untuk bagi warna
        this._iCreatedGroup = this._createdGroup;
        await this.send('hello', {
          name: this.displayName || this.userId,
          created: !!this._createdGroup,
          ts: Date.now(),
        });
      } catch (e) {
        const msg = (e && (e.message || e.toString())) || '';
        this.setMode('error', 'Chat gagal: ' + msg.slice(0, 140));
        // jangan blok game — biarkan berjalan offline
        return false;
      }
      return true;
    },

    _onMessage(ev) {
      const msgs = (ev && ev.data) || [];
      for (const m of msgs) {
        if (!m || m.type !== 'TIMCustomElem') continue;
        if (m.to !== this.groupId && m.conversationID !== 'GROUP' + this.groupId) continue;
        let payload;
        try {
          payload = JSON.parse(m.payload && m.payload.data);
        } catch (e) { continue; }
        if (!payload || !payload.a) continue;
        if (m.from === this.userId) continue; // pesan sendiri
        this.peerId = m.from;
        emit(payload.a, { from: m.from, data: payload });
      }
    },

    /** kirim aksi ke grup. return true bila sukses */
    async send(aksi, data) {
      if (!this.tim || !this.online) return false;
      try {
        const msg = this.tim.createCustomMessage({
          to: this.groupId,
          conversationType: TIM.TYPES.CONV_GROUP,
          priority: TIM.TYPES.MSG_PRIORITY_HIGH,
          payload: { data: JSON.stringify(Object.assign({ a: aksi, from: this.userId }, data || {})) },
        });
        await this.tim.sendMessage(msg);
        return true;
      } catch (e) {
        console.warn('[net] kirim gagal', aksi, e);
        return false;
      }
    },

    disconnect() {
      try { if (this.tim) this.tim.destroy(); } catch (e) {}
      try { if (this.voice) this.voice.leave(); } catch (e) {}
      this.tim = null;
      this.voice = null;
      this.online = false;
      this.setMode('offline');
    },

    // ---------------- TRTC voice ----------------
    voiceState: { joined: false, muted: false, peerSpeaking: false },

    async joinVoice() {
      if (!this.online) throw new Error('Voice butuh koneksi online');
      if (this.voiceState.joined) return;
      const client = TRTC.createClient({
        mode: 'rtc',
        sdkAppId: (await this._sdkAppId()),
        userId: this.userId,
        userSig: (await this._userSigFresh()),
      });
      this.trtcClient = client;

      client.on('stream-added', async (ev) => {
        try { await client.subscribe(ev.stream, { audio: true, video: false }); } catch (e) { console.warn(e); }
      });
      client.on('stream-subscribed', (ev) => {
        ev.stream.play(); // audio saja
        emit('voice_peer_on', {});
      });
      client.on('stream-removed', () => emit('voice_peer_off', {}));
      client.on('peer-join', () => emit('voice_peer_on', {}));
      client.on('peer-leave', () => emit('voice_peer_off', {}));
      client.on('error', (e) => emit('voice_error', e));
      client.enableAudioVolumeEvaluation(300);
      client.on('audio-volume', (ev) => {
        const arr = (ev && ev.result) || [];
        for (const u of arr) {
          if (u.userId !== this.userId) {
            const speaking = u.volume > 8;
            if (speaking !== this.voiceState.peerSpeaking) {
              this.voiceState.peerSpeaking = speaking;
              emit('voice_peer_speaking', speaking);
            }
          }
        }
      });

      this.localStream = TRTC.createStream({ audio: true, video: false });
      await this.localStream.initialize();
      await client.join({ roomId: Number(this.trtcRoomId) }); // TRTC butuh angka, bukan string
      await client.publish(this.localStream);
      this.voiceState.joined = true;
      this.voiceState.muted = false;
      return true;
    },

    async toggleMute() {
      if (!this.voiceState.joined || !this.localStream) return false;
      if (this.voiceState.muted) {
        await this.localStream.unmuteAudio();
      } else {
        await this.localStream.muteAudio();
      }
      this.voiceState.muted = !this.voiceState.muted;
      return this.voiceState.muted;
    },

    async leaveVoice() {
      if (this.trtcClient) {
        try {
          if (this.localStream) await this.trtcClient.unpublish(this.localStream);
          await this.trtcClient.leave();
          if (this.localStream) this.localStream.close();
        } catch (e) { console.warn(e); }
      }
      this.trtcClient = null;
      this.localStream = null;
      this.voiceState = { joined: false, muted: false, peerSpeaking: false };
    },

    _sdkAppIdCache: null,
    async _sdkAppId() {
      if (this._sdkAppIdCache) return this._sdkAppIdCache;
      const r = await fetch('/api/usersig?user=' + encodeURIComponent(this.userId));
      const j = await r.json();
      this._sdkAppIdCache = j.sdkAppId;
      return j.sdkAppId;
    },
    async _userSigFresh() {
      const r = await fetch('/api/usersig?user=' + encodeURIComponent(this.userId));
      const j = await r.json();
      return j.userSig;
    },

    // ---------------- status ----------------
    setMode(mode, errMsg) {
      this.mode = mode;
      emit('net_state', { mode, errMsg: errMsg || null });
    },
  };

  window.Net = Net;
})();
