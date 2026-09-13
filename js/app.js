/**
 * app.js — orkestrator utama Catur Romantis 💕
 *
 * Mode:
 * - ONLINE  : kamu & pacar di HP berbeda, sinkron lewat TIM (chat) + TRTC (voice)
 * - SATU-HP : main berdua di satu layar (pass-and-play), chat lokal
 *
 * Protokol jaringan (aksi pesan):
 *   hello, hello_ack, move, undo_req, undo_ack, undo_deny,
 *   draw_offer, draw_accept, draw_decline, resign, rematch,
 *   chat, heart
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const Board = window.RomanticBoard;
  const Net = window.Net;
  const Snd = window.Snd;

  // ================= STATE =================
  const state = {
    mode: 'local',            // 'local' | 'online'
    myName: 'Kamu',
    peerName: 'Pacarmu',
    myColor: 'w',             // lokal: keduanya main di satu papan
    game: null,               // diisi saat mulai (butuh Chess terlebih dahulu)
    selected: null,
    lastMove: null,
    promoPending: null,       // { from, to, callbackResolve }
    over: false,
    drawOfferBy: null,       // userId penawar remis
    undoReqBy: null,
    undoReqColor: null,      // warna pihak yang meminta undo (untuk protokol undo online)
    undoPendingMove: null,    // move terakhir untuk tombol undo online (2 langkah)
    unreadChat: 0,
    peerOnline: false,
    flipped: false,           // papan dibalik? (untuk hitam di layar)
    finishedReason: null,
  };

  const AVATARS = ['💗', '💖', '💘', '💝', '😍', '🥰', '🌹', '✨'];
  let myAvatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
  let peerAvatar = '💗';

  // ================= DOM =================
  let board;
  const boardEl = $('board');

  // ================= UTILITAS =================
  function toast(msg, ms) {
    const box = $('toast-box');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.remove(), ms || 2600);
  }

  function hearts(n) {
    const layer = $('hearts-layer');
    const emojis = ['❤️', '💕', '💖', '💘', '💗', '🌹'];
    for (let i = 0; i < (n || 6); i++) {
      setTimeout(() => {
        const h = document.createElement('div');
        h.className = 'fly-heart';
        h.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        h.style.left = (8 + Math.random() * 84) + 'vw';
        h.style.setProperty('--rot', (Math.random() * 60 - 30) + 'deg');
        const dur = 3.2 + Math.random() * 2.5;
        h.style.animationDuration = dur + 's';
        h.style.fontSize = (18 + Math.random() * 20) + 'px';
        layer.appendChild(h);
        setTimeout(() => h.remove(), dur * 1000 + 100);
      }, i * 160);
    }
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function modal(html, buttons) {
    const modalEl = $('modal');
    $('modal-content').innerHTML = html;
    const act = $('modal-actions');
    act.innerHTML = '';
    for (const b of buttons || []) {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (b.cls || 'btn-ghost');
      btn.textContent = b.label;
      btn.addEventListener('click', () => { if (!b.keepOpen) hideModal(); b.onClick && b.onClick(); });
      act.appendChild(btn);
    }
    modalEl.hidden = false;
  }
  function hideModal() { $('modal').hidden = true; }

  // ================= SETUP SCREEN =================
  async function initSetup() {
    // cek konfigurasi server
    try {
      const r = await fetch('/api/config');
      const cfg = await r.json();
      const badge = $('net-badge');
      const txt = $('net-text');
      if (cfg.online) {
        badge.classList.add('ok');
        txt.textContent = 'Server online — chat & suara aktif 💕';
      } else {
        txt.textContent = 'Mode satu HP — isi .env untuk main terpisah';
      }
    } catch (e) {
      $('net-text').textContent = 'Server tidak merespons';
    }

    $('btn-join').addEventListener('click', async () => {
      Snd.unlock(); Snd.tap();
      const name = $('in-name').value.trim() || 'Pemain';
      const room = $('in-room').value.trim().toLowerCase().replace(/\s+/g, '-');
      if (!room) { showSetupError('Isi dulu kode kamarnya ya 💕'); return; }
      $('btn-join').disabled = true;
      // suffix acak agar dua nama mirip (slug sama) tidak saling tendang di TIM
      const uid = slug(name) + '-' + Math.random().toString(36).slice(2, 6);
      const ok = await Net.connect({ roomCode: room, userName: uid, displayName: name });
      try {
        await waitChess();
      } catch (e) {
        $('btn-join').disabled = false;
        showSetupError('Mesin catur gagal dimuat — muat ulang halaman');
        return;
      }
      $('btn-join').disabled = false;
      if (ok) {
        state.mode = 'online';
        state.myName = name;
        startGame();
      } else if (Net.mode === 'error') {
        showSetupError(Net._lastErr || 'Gagal tersambung. Coba lagi.');
      } else {
        // online tapi TIM gagal -> tetap masuk, mode lokal
        state.mode = 'online';
        state.myName = name;
        startGame();
        toast('Chat/suara gagal — main dulu ya 💕');
      }
    });

    $('btn-local').addEventListener('click', async () => {
      Snd.unlock(); Snd.tap();
      state.mode = 'local';
      state.myName = $('in-name').value.trim() || 'Kamu';
      state.peerName = 'Pemain 2';
      try {
        await waitChess();
      } catch (e) {
        showSetupError('Mesin catur gagal dimuat — muat ulang halaman');
        return;
      }
      startGame();
    });

    ['in-name', 'in-room'].forEach(id =>
      $(id).addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-join').click(); })
    );
  }

  function showSetupError(msg) {
    const el = $('setup-error');
    el.textContent = msg;
    el.hidden = false;
    setTimeout(() => { el.hidden = true; }, 4000);
  }

  function slug(s) {
    return s.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32) || 'pemain';
  }

  /** tunggu chess.js (ES module) siap dipakai */
  let chessWait = null;
  function waitChess() {
    if (window.Chess) return Promise.resolve();
    if (!chessWait) {
      chessWait = new Promise((resolve, reject) => {
        const t0 = Date.now();
        const iv = setInterval(() => {
          if (window.Chess) { clearInterval(iv); resolve(); }
          else if (Date.now() - t0 > 8000) { clearInterval(iv); reject(new Error('chess.js gagal dimuat')); }
        }, 50);
      });
    }
    return chessWait;
  }

  // ================= GAME FLOW =================
  function startGame() {
    // chess.js dimuat asinkron (ES module) — tunggu sampai tersedia
    if (!state.game) state.game = new window.Chess();
    $('screen-setup').hidden = true;
    $('screen-game').hidden = false;
    $('hd-room').textContent = Net.roomCode || 'satu-hp';
    $('me-name').textContent = state.myName;
    $('me-avatar').textContent = myAvatar;
    board = new Board(boardEl, { onSquareTapped: onSquareTapped });
    // warna online: pemilik/pembuat grup = putih; pengikut = hitam (papan dibalik)
    if (state.mode === 'online') {
      state.myColor = decideColor(null, false) ? 'w' : 'b';
      state.flipped = state.myColor === 'b';
    }
    refreshAll();
    hearts(5);
    if (state.mode === 'online') wireNetEvents();
    updateNetStatus();
  }

  function refreshAll() {
    const view = {
      selected: state.selected,
      moves: Board.moveDests(state.game, state.selected),
      lastMove: state.lastMove,
      checkSq: Board.findCheckSquare(state.game),
    };
    board.setFlipped(state.flipped);
    board.render(state.game, view);
    updateStatus();
    updateCaptured();
    updateMoves();
    updateTurnChips();
  }

  function updateStatus() {
    const el = $('status');
    el.classList.remove('win');
    if (state.over) {
      el.textContent = state.finishedReason;
      el.classList.add('win');
      return;
    }
    const g = state.game;
    if (g.in_check()) {
      el.textContent = '⚠️ ' + turnLabel() + ' dalam skak!';
    } else {
      el.textContent = 'Giliran: ' + turnLabel();
    }
  }

  function turnLabel() {
    return state.game.turn() === 'w' ? 'Putih ♔' : 'Hitam ♚';
  }

  function updateTurnChips() {
    const turn = state.game.turn();
    // chip "giliran" muncul pada sisi yang jalan
    $('turn-chip-me').classList.toggle('show', !state.over && turn === state.myColor);
  }

  function updateCaptured() {
    // bidak yang dimakan pihak putih / hitam diambil dari riwayat langkah
    const hist = state.game.history({ verbose: true });
    const capByW = [], capByB = [];
    for (const m of hist) {
      if (m.captured) {
        (m.color === 'w' ? capByW : capByB).push(symbol(m.captured, m.color === 'w' ? 'b' : 'w'));
      }
    }
    // sesuaikan label: online -> "kamu" selalu warna state.myColor
    const mine = state.myColor === 'w' ? capByW : capByB;
    const theirs = state.myColor === 'w' ? capByB : capByW;
    $('captured-me').textContent = mine.length ? 'Kamu makan: ' + mine.join(' ') : '';
    $('captured-peer').textContent = theirs.length ? 'Dia makan: ' + theirs.join(' ') : '';
  }
  function symbol(type, color) {
    const map = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' };
    return color === 'w' ? map[type] : map[type].toLowerCase();
  }

  function updateMoves() {
    const box = $('move-list');
    const hist = state.game.history();
    box.innerHTML = '';
    for (let i = 0; i < hist.length; i += 2) {
      const num = document.createElement('span');
      num.className = 'n';
      num.textContent = (i / 2 + 1) + '.';
      box.appendChild(num);
      const a = document.createElement('span');
      a.textContent = hist[i];
      box.appendChild(a);
      if (hist[i + 1]) {
        const b = document.createElement('span');
        b.textContent = hist[i + 1];
        box.appendChild(b);
      }
    }
    box.scrollTop = box.scrollHeight;
  }

  // ================= INTERAKSI PAPAN =================
  function onSquareTapped(sq) {
    if (state.over || state.promoPending) return;
    const g = state.game;
    const myTurn = state.mode === 'local' ? true : g.turn() === state.myColor;
    if (!myTurn) { Snd.tap(); return; }

    const piece = g.get(sq);
    const color = piece && piece.color;

    if (state.selected) {
      const moves = Board.moveDests(g, state.selected);
      if (moves[sq]) {
        attemptMove(state.selected, sq);
        return;
      }
      if (piece && color === g.turn()) {
        state.selected = sq;
        Snd.tap();
        refreshAll();
        return;
      }
      state.selected = null;
      refreshAll();
      return;
    }

    if (piece && color === g.turn()) {
      state.selected = sq;
      Snd.tap();
      refreshAll();
    }
  }

  function attemptMove(from, to) {
    const g = state.game;
    const moves = g.moves({ square: from, verbose: true }).filter(m => m.to === to);
    if (!moves.length) return;
    // promosi pion?
    const promo = moves[0].promotion;
    if (promo) {
      state.promoPending = { from, to };
      askPromotion(moves);
      return;
    }
    applyMove(from, to);
  }

  function askPromotion(moves) {
    modal(
      `<div class="big-icon">👑</div><h2>Pion jadi apa?</h2>`,
      moves.map(m => ({
        label: symbol(m.promotion, 'w'),
        cls: '',
        onClick: () => applyMove(state.promoPending.from, state.promoPending.to, m.promotion),
        keepOpen: false,
      })).concat([{
        label: 'Batal', cls: 'btn-ghost',
        // WAJIB membersihkan promoPending — kalau tidak, papan terkunci selamanya
        onClick: () => { state.promoPending = null; refreshAll(); },
      }])
    );
    // tombol bidak promosi dibuat besar dan terlihat di papan
    const btns = $('modal-actions').querySelectorAll('button');
    btns.forEach(b => { if (b.textContent.length <= 2) b.classList.add('promo-btn'); });
  }

  function applyMove(from, to, promo) {
    const g = state.game;
    const move = g.move({ from, to, promotion: promo || 'q' });
    if (!move) { refreshAll(); return; }

    state.selected = null;
    state.lastMove = { from, to };
    state.promoPending = null;

    // suara
    if (g.in_check()) Snd.check();
    else if (move.captured) Snd.capture();
    else Snd.move();

    refreshAll();
    checkGameEnd();

    if (state.mode === 'online') {
      Net.send('move', { from, to, promo: promo || null, fen: g.fen(), n: g.history().length })
        .then(ok => { if (!ok) toast('⚠️ Langkah tidak terkirim — cek koneksi 💔', 3500); });
    }
  }

  function checkGameEnd() {
    const g = state.game;
    if (g.game_over()) {
      state.over = true;
      let reason, icon = '💕';
      if (g.in_checkmate()) {
        const winner = g.turn() === 'w' ? 'Hitam' : 'Putih';
        reason = 'Skakmat! ' + winner + ' menang 👑';
        icon = '👑';
        if (state.mode === 'local') Snd.win();
        else if (g.turn() === state.myColor) Snd.lose();
        else Snd.win();
      } else if (g.in_stalemate()) {
        reason = 'Remis — pat (stalemate) 🤝';
      } else if (g.in_threefold_repetition()) {
        reason = 'Remis — pengulangan 3x 🤝';
      } else if (g.insufficient_material()) {
        reason = 'Remis — material tidak cukup 🤝';
      } else if (g.in_draw()) {
        reason = 'Remis — aturan 50 langkah 🤝';
      } else {
        reason = 'Permainan selesai';
      }
      state.finishedReason = reason;
      updateStatus();
      hearts(14);
      modal(
        `<div class="big-icon">${icon}</div><h2>${reason}</h2><p>Satu papan, dua hati 💕</p>`,
        [
          { label: '🔁 Main Lagi', cls: 'btn-primary', onClick: doRematch },
          { label: 'Lihat Papan', cls: 'btn-ghost' },
        ]
      );
    }
  }

  // ================= AKSI: UNDO / REMIS / MENYERAH / BALIK =================
  function wireActions() {
    $('btn-undo').addEventListener('click', onUndo);
    $('btn-draw').addEventListener('click', onDrawOffer);
    $('btn-resign').addEventListener('click', onResign);
    $('btn-flip').addEventListener('click', () => {
      state.flipped = !state.flipped;
      refreshAll();
    });
    $('btn-heart').addEventListener('click', sendHeart);
    $('btn-voice').addEventListener('click', onVoice);
    $('btn-chat').addEventListener('click', toggleChat);
    $('chat-close').addEventListener('click', () => toggleChat(false));
    $('chat-send').addEventListener('click', sendChat);
    $('chat-emoji').addEventListener('click', () => { $('emoji-row').hidden = !$('emoji-row').hidden; });
    $('chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
    document.querySelectorAll('#emoji-row button').forEach(b =>
      b.addEventListener('click', () => {
        $('chat-input').value += b.dataset.e;
        $('chat-input').focus();
      })
    );
    $('btn-menu').addEventListener('click', openDrawer);
    $('drawer-close').addEventListener('click', closeDrawer);
    $('drawer-mask').addEventListener('click', closeDrawer);
    $('btn-rematch').addEventListener('click', doRematch);
    $('btn-quit').addEventListener('click', quitRoom);
    $('btn-mute').addEventListener('click', toggleMuteBtn);
  }

  /**
   * Undo online yang sinkron di KEDUA papan (dipakai peminta & penyetuju).
   * Aturan: bila sekarang giliran pihak peminta undo, langkah terakhir papan
   * adalah (kita balas + dia minta undo dicabut) -> mundur 2 plies; jika tidak
   * cukup 1. Kedua papan identik saat protokol jalan, jadi rumus yang sama
   * menghasilkan posisi yang sama di keduanya.
   */
  function applyUndoShared(reqColor) {
    const g = state.game;
    if (state.over || g.history().length === 0) return;
    const plies = g.turn() === (reqColor || state.myColor) ? 2 : 1;
    for (let i = 0; i < plies && g.history().length > 0; i++) g.undo();
    state.undoReqColor = null;
    state.selected = null;
    syncLastMove();
    Snd.undo();
    refreshAll();
  }

  function onUndo() {
    if (state.over) { toast('Permainan sudah selesai'); return; }
    if (state.mode === 'local') {
      if (state.game.history().length === 0) { toast('Belum ada langkah'); return; }
      state.game.undo();
      syncLastMove();
      Snd.undo();
      refreshAll();
      return;
    }
    // online: minta izin lawan — sertakan warna kita agar undo sinkron di kedua papan
    const n = state.game.history().length;
    if (n === 0) { toast('Belum ada langkah'); return; }
    state.undoReqColor = state.myColor;
    Net.send('undo_req', { n, color: state.myColor });
    toast('Permintaan undo dikirim… 🥺');
  }

  function syncLastMove() {
    const h = state.game.history({ verbose: true });
    state.lastMove = h.length ? { from: h[h.length - 1].from, to: h[h.length - 1].to } : null;
  }

  function onDrawOffer() {
    if (state.over) return;
    if (state.mode === 'local') {
      modal(`<div class="big-icon">🤝</div><h2>Tawari remis?</h2>`,
        [
          { label: 'Remis', cls: 'btn-primary', onClick: () => finishLocalDraw() },
          { label: 'Lanjut Main', cls: 'btn-ghost' },
        ]);
      return;
    }
    Net.send('draw_offer');
    toast('Penawaran remis dikirim 🤝');
  }

  function finishLocalDraw() {
    state.over = true;
    state.finishedReason = 'Remis — disepakati berdua 🤝';
    refreshAll();
    modal(`<div class="big-icon">🤝</div><h2>${state.finishedReason}</h2>`,
      [{ label: '🔁 Main Lagi', cls: 'btn-primary', onClick: doRematch }, { label: 'Tutup', cls: 'btn-ghost' }]);
  }

  function onResign() {
    if (state.over) return;
    modal(`<div class="big-icon">🏳️</div><h2>Yakin menyerah?</h2><p>Kamu kalah dan dia menang 💔</p>`,
      [
        {
          label: 'Ya, Menyerah', cls: 'btn-primary', onClick: () => {
            if (state.mode === 'online') Net.send('resign');
            finishByResign(state.mode === 'online' ? 'me' : null);
          }
        },
        { label: 'Batal', cls: 'btn-ghost' },
      ]);
  }

  function finishByResign(who) {
    state.over = true;
    if (state.mode === 'local' || who === 'me') {
      state.finishedReason = 'Menyerah — lawan menang 🏳️';
      Snd.lose();
    } else {
      state.finishedReason = 'Dia menyerah — kamu menang! 🏆';
      Snd.win();
    }
    refreshAll();
    modal(`<div class="big-icon">🏳️</div><h2>${state.finishedReason}</h2>`,
      [{ label: '🔁 Main Lagi', cls: 'btn-primary', onClick: doRematch }, { label: 'Tutup', cls: 'btn-ghost' }]);
  }

  function doRematch() {
    if (state.mode === 'online') Net.send('rematch');
    closeDrawer();
    resetGame();
  }

  function resetGame() {
    state.game = new window.Chess();
    state.selected = null;
    state.lastMove = null;
    state.over = false;
    state.finishedReason = null;
    state.drawOfferBy = null;
    state.undoReqBy = null;
    hideModal();
    refreshAll();
    toast('Permainan baru dimulai 💕');
    hearts(4);
  }

  function quitRoom() {
    if (state.mode === 'online') {
      modal(`<div class="big-icon">🚪</div><h2>Keluar kamar?</h2><p>Koneksi chat & suara akan diputus.</p>`,
        [
          { label: 'Keluar', cls: 'btn-primary', onClick: () => { Net.disconnect(); location.reload(); } },
          { label: 'Batal', cls: 'btn-ghost' },
        ]);
    } else {
      location.reload();
    }
  }

  // ================= VOICE =================
  async function onVoice() {
    const btn = $('btn-voice');
    if (state.mode !== 'online') { toast('Voice hanya untuk mode online 💕'); return; }
    if (!Net.online) { toast('Chat belum tersambung — cek .env'); return; }
    if (Net.voiceState.joined) {
      await Net.leaveVoice();
      btn.classList.remove('on', 'mic-on');
      $('voice-note').hidden = true;
      toast('Voice dimatikan');
      return;
    }
    btn.disabled = true;
    try {
      await Net.joinVoice();
      btn.classList.add('on');
      $('voice-note').hidden = false;
      $('voice-note').textContent = '🎙️ Voice aktif — pakai earphone biar lebih asyik 🎧';
      toast('Voice menyala 💬🎧');
    } catch (e) {
      const msg = (e && e.message) || 'gagal';
      toast('Voice gagal: ' + msg.slice(0, 90));
      $('voice-note').hidden = false;
      $('voice-note').textContent = '⚠️ Voice gagal: ' + msg.slice(0, 120) + ' (butuh HTTPS + izin mic)';
    } finally {
      btn.disabled = false;
    }
  }

  function toggleMuteBtn() {
    const muted = Snd.muted;
    Snd.setMuted(!muted);
    $('btn-mute').textContent = Snd.muted ? '🔊 Nyala Suara' : '🔇 Bisukan Suara';
    toast(Snd.muted ? 'Suara efek dibisukan' : 'Suara efek nyala');
  }

  // ================= CHAT =================
  function bubble(kind, who, text) {
    const box = $('chat-msgs');
    const el = document.createElement('div');
    el.className = 'bubble ' + kind;
    if (who) el.innerHTML = `<span class="who">${esc(who)}</span>${esc(text)}`;
    else el.textContent = text;
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
  }

  function toggleChat(force) {
    const panel = $('chat-panel');
    const show = force !== undefined ? force : panel.hidden;
    panel.hidden = !show;
    if (show) {
      state.unreadChat = 0;
      updateChatBadge();
      $('chat-input').focus();
    }
  }

  function updateChatBadge() {
    let badge = document.querySelector('#btn-chat .badge');
    if (!state.unreadChat) { if (badge) badge.remove(); return; }
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'badge';
      $('btn-chat').appendChild(badge);
    }
    badge.textContent = state.unreadChat;
  }

  function sendChat() {
    const input = $('chat-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    bubble('me', null, text);
    Snd.chat();
    if (state.mode === 'online') Net.send('chat', { text });
  }

  function sendHeart() {
    Snd.heart();
    hearts(10);
    toast('Hati terkirim 💘');
    if (state.mode === 'online') Net.send('heart', {});
  }

  // ================= NET EVENTS =================
  /**
   * Tentukan "apakah aku putih?" secara deterministik (kedua sisi harus
   * menghasilkan jawaban yang sama):
   * 1. pemilik grup TIM = putih (tetap stabil walau keduanya reload);
   * 2. bila owner tak diketahui: pembuat grup pada sesi ini = putih;
   * 3. rejoin grup lama tanpa info owner: userId lebih kecil = putih.
   */
  function decideColor(peerId, peerCreated) {
    if (Net._groupOwner) return Net.userId === Net._groupOwner;
    if (Net._createdGroup) return true;
    if (peerCreated) return false;
    return String(Net.userId) < String(peerId || '');
  }

  function wireNetEvents() {
    Net.on('hello', (ev) => {
      // lawan bergabung
      state.peerName = ev.data.name || ev.from;
      state.peerOnline = true;
      peerAvatar = AVATARS[(ev.from || 'x').length % AVATARS.length];
      $('peer-name').textContent = state.peerName;
      $('peer-avatar').textContent = peerAvatar;
      $('peer-state').textContent = 'online';
      $('peer-state').className = 'peer-state on';
      bubble('sys', null, state.peerName + ' masuk kamar 💕');
      Snd.chat();
      // sinkron warna: jangan ubah bila permainanku sedang berjalan
      // (lawan rejoin — dia yang harus ikut warnaku via hello_ack)
      if (!state.game || state.game.history().length === 0) {
        const iAmWhite = decideColor(ev.from, !!ev.data.created);
        state.myColor = iAmWhite ? 'w' : 'b';
        state.flipped = !iAmWhite;
        refreshAll();
      }
      Net.send('hello_ack', { name: state.myName, created: !!Net._createdGroup, color: state.myColor });
    });
    Net.on('hello_ack', (ev) => {
      if (!state.peerOnline) {
        state.peerName = ev.data.name || ev.from;
        state.peerOnline = true;
        $('peer-name').textContent = state.peerName;
        $('peer-state').textContent = 'online';
        $('peer-state').className = 'peer-state on';
        bubble('sys', null, state.peerName + ' ada di sini 💕');
      }
      // lawan mengirim warna yang ia pegang (bisa jadi ia host yang sedang
      // asyik main) -> selama game-ku masih kosong, aku ambil kebalikannya
      const peerColor = ev.data && ev.data.color;
      if (peerColor && (!state.game || state.game.history().length === 0)) {
        const iAmWhite = peerColor !== 'w';
        if (iAmWhite !== (state.myColor === 'w')) {
          state.myColor = iAmWhite ? 'w' : 'b';
          state.flipped = !iAmWhite;
          refreshAll();
        }
      }
    });

    Net.on('move', (ev) => {
      const d = ev.data;
      const g = state.game;
      // proteksi: jangan terima ulang langkah yang sudah ada
      if (typeof d.n === 'number' && d.n <= g.history().length) return;
      const ok = g.move({ from: d.from, to: d.to, promotion: d.promo || 'q' });
      if (ok) {
        state.lastMove = { from: d.from, to: d.to };
        if (g.in_check()) Snd.check(); else if (ok.captured) Snd.capture(); else Snd.move();
        refreshAll();
        checkGameEnd();
      } else {
        // desync -> pulihkan dari FEN yang dikirim
        if (d.fen) {
          state.game = new window.Chess(d.fen);
          syncLastMove();
          refreshAll();
          toast('Sinkron ulang posisi');
        }
      }
    });

    Net.on('undo_req', (ev) => {
      if (state.over) return;
      Net._lastUndoBy = ev.from;
      state.undoReqColor = (ev.data && ev.data.color) || null;
      modal(`<div class="big-icon">🥺</div><h2>${esc(state.peerName)} minta undo</h2><p>Bolehkah langkah terakhir diambil kembali?</p>`,
        [
          {
            label: 'Boleh 🥰', cls: 'btn-primary',
            onClick: () => {
              // penyetuju juga harus mundur di papannya sendiri (pakai aturan
              // plies yang sama) — kalau tidak, kedua papan jadi beda
              Net.send('undo_ack', { color: state.undoReqColor });
              applyUndoShared(state.undoReqColor);
              toast('Undo disetujui — langkah dibatalkan ↩️');
            },
          },
          { label: 'Jangan 😤', cls: 'btn-ghost', onClick: () => Net.send('undo_deny', {}) },
        ]);
    });
    Net.on('undo_ack', (ev) => {
      hideModal();
      const reqColor = (ev.data && ev.data.color) || state.undoReqColor || state.myColor;
      applyUndoShared(reqColor);
      toast('Undo disetujui — langkah dibatalkan ↩️');
    });
    Net.on('undo_deny', () => toast('Permintaan undo ditolak 😢'));

    Net.on('draw_offer', () => {
      if (state.over) return;
      modal(`<div class="big-icon">🤝</div><h2>${esc(state.peerName)} tawari remis</h2>`,
        [
          { label: 'Remis 🤝', cls: 'btn-primary', onClick: () => { Net.send('draw_accept', {}); acceptDraw(); } },
          { label: 'Lanjut 😎', cls: 'btn-ghost', onClick: () => Net.send('draw_decline', {}) },
        ]);
    });
    Net.on('draw_accept', () => { hideModal(); acceptDraw(); });
    Net.on('draw_decline', () => toast('Remis ditolak — lanjut! ♟️'));

    Net.on('resign', () => {
      hideModal();
      finishByResign('peer');
    });

    Net.on('rematch', () => {
      hideModal();
      resetGame();
      bubble('sys', null, state.peerName + ' mulai permainan baru 🔁');
    });

    Net.on('chat', (ev) => {
      bubble('peer', state.peerName, ev.data.text || '');
      Snd.chat();
      if ($('chat-panel').hidden) {
        state.unreadChat++;
        updateChatBadge();
      }
    });

    Net.on('heart', () => {
      Snd.heart();
      hearts(12);
      toast(state.peerName + ' mengirim hati 💘');
    });

    Net.on('voice_peer_speaking', (speaking) => {
      const el = $('peer-state');
      if (speaking) { el.textContent = 'bersuara 🔊'; el.className = 'peer-state speaking'; }
      else { el.textContent = 'online'; el.className = 'peer-state on'; }
    });

    Net.on('voice_error', (e) => {
      toast('Voice error: ' + ((e && (e.message || e.code)) || '').toString().slice(0, 80));
    });
  }

  function acceptDraw() {
    state.over = true;
    state.finishedReason = 'Remis — disepakati berdua 🤝';
    refreshAll();
    modal(`<div class="big-icon">🤝</div><h2>${state.finishedReason}</h2>`,
      [{ label: '🔁 Main Lagi', cls: 'btn-primary', onClick: doRematch }, { label: 'Tutup', cls: 'btn-ghost' }]);
  }

  // ================= NET STATUS STRIP =================
  function updateNetStatus() {
    const el = $('hd-status');
    if (state.mode === 'local') {
      el.textContent = 'Mode satu HP 📱';
      el.className = 'tb-status';
      $('peer-state').textContent = 'sebelahmu 💗';
      $('peer-state').className = 'peer-state on';
      return;
    }
    const upd = () => {
      const m = Net.mode;
      if (m === 'online') { el.textContent = 'Tersambung 💕'; el.className = 'tb-status ok'; }
      else if (m === 'connecting') { el.textContent = 'Menyambung…'; el.className = 'tb-status'; }
      else if (m === 'error') { el.textContent = Net._lastErr || 'Koneksi bermasalah'; el.className = 'tb-status bad'; }
      else { el.textContent = 'Offline'; el.className = 'tb-status'; }
    };
    upd();
    Net.on('net_state', upd);
  }

  // simpan pesan error terakhir dari net
  const origSetMode = Net.setMode;
  Net.setMode = function (mode, errMsg) {
    Net._lastErr = errMsg || Net._lastErr;
    origSetMode.call(Net, mode, errMsg);
  };

  // ================= DRAWER =================
  function openDrawer() {
    $('drawer').hidden = false;
    $('drawer-mask').hidden = false;
    $('btn-mute').textContent = Snd.muted ? '🔊 Nyala Suara' : '🔇 Bisukan Suara';
    $('drawer-info').innerHTML = esc(
      'Kamar: ' + (Net.roomCode || 'satu-hp') +
      '\nNama kamu: ' + state.myName +
      (state.peerName ? '\nLawan: ' + state.peerName : '') +
      '\nMode: ' + (state.mode === 'online' ? 'online (Tencent Cloud)' : 'satu HP')
    ).replace(/\n/g, '<br>');
  }
  function closeDrawer() {
    $('drawer').hidden = true;
    $('drawer-mask').hidden = true;
  }

  // ================= BOOT =================
  document.addEventListener('DOMContentLoaded', () => {
    initSetup();
    wireActions();
    // lanjutkan state mute tersimpan
    $('btn-mute').textContent = Snd.muted ? '🔊 Nyala Suara' : '🔇 Bisukan Suara';
  });
})();
