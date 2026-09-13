/**
 * sound.js — efek suara ringan tanpa file audio (WebAudio).
 * Move, capture, check, menang, kalah, chat, hati — semua disintesis.
 * Volume ikut state mute global (localStorage).
 */
(function () {
  'use strict';

  let ctx = null;
  let muted = localStorage.getItem('catur-mute') === '1';

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, gainPeak, when) {
    const c = ensure();
    if (!ctx || muted) return;
    try {
      const t0 = ctx.currentTime + (when || 0);
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gainPeak || 0.18, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (e) { /* abaikan */ }
  }

  function noise(dur, gainPeak) {
    const c = ensure();
    if (!ctx || muted) return;
    try {
      const t0 = ctx.currentTime;
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = gainPeak || 0.14;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1600;
      src.connect(f).connect(g).connect(ctx.destination);
      src.start(t0);
    } catch (e) { /* abaikan */ }
  }

  const S = {
    unlock() { ensure(); },
    get muted() { return muted; },
    setMuted(v) {
      muted = v;
      localStorage.setItem('catur-mute', v ? '1' : '0');
    },
    move()   { tone(420, 0.10, 'sine', 0.16); noise(0.06, 0.10); },
    capture(){ noise(0.16, 0.22); tone(180, 0.14, 'triangle', 0.2, 0.01); },
    check()  { tone(660, 0.09, 'square', 0.10); tone(880, 0.10, 'square', 0.10, 0.10); },
    win()    { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'sine', 0.16, i * 0.12)); },
    lose()   { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.2, 'sine', 0.14, i * 0.14)); },
    chat()   { tone(880, 0.07, 'sine', 0.10); tone(1175, 0.08, 'sine', 0.10, 0.07); },
    heart()  { tone(784, 0.1, 'sine', 0.12); tone(1047, 0.14, 'sine', 0.12, 0.09); },
    tap()    { tone(500, 0.045, 'sine', 0.07); },
    undo()   { tone(300, 0.1, 'triangle', 0.12); tone(240, 0.12, 'triangle', 0.12, 0.09); },
  };

  window.Snd = S;
})();
