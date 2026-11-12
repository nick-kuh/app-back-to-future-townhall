/* ===== Trilha sonora do townhall =====
 * Música original, gerada no navegador com a Web Audio API: nenhuma gravação e nenhum arquivo.
 *   "music"   → synth-pop animado, estilo anos 80 (duas músicas que se revezam)
 *   "ambient" → trilha de fundo calma (pads, arpejo com eco e sinos)
 * Se o Doc informar um arquivo de áudio próprio (URL) para um dos modos, ele toca no lugar.
 *
 *   Trilha.apply({ mode: 'off' | 'music' | 'ambient', volume: 0..100, musicUrl, ambientUrl })
 *   Trilha.unlock()   chamar num clique/tecla: os navegadores só liberam som depois de um gesto
 *   Trilha.locked     true quando há som pedido mas o navegador ainda não liberou
 *   Trilha.sfx('blip' | 'reveal' | 'timeup')   efeitos curtos (só tocam se o som estiver ligado)
 */
(function () {
  'use strict';
  const AC = window.AudioContext || window.webkitAudioContext;
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);

  /* ---------- instrumentos (funcionam em qualquer contexto, inclusive offline para teste) ---------- */
  function tone(C, dest, o) {
    const t = o.t, dur = o.dur, peak = o.gain || .1, attack = Math.min(o.attack || .006, dur * .5), release = Math.min(o.release || .08, dur * .6);
    const g = C.createGain();
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + dur - release); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    let head = g;
    if (o.cutoff) {
      const f = C.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = o.q || .8;
      f.frequency.setValueAtTime(o.cutoff + (o.cutEnv || 0), t);
      if (o.cutEnv) f.frequency.exponentialRampToValueAtTime(o.cutoff, t + Math.min(dur, o.cutTime || .22));
      f.connect(g); head = f;
    }
    for (const det of o.detune || [0]) {
      const osc = C.createOscillator(); osc.type = o.type || 'sawtooth'; osc.frequency.setValueAtTime(o.f, t); osc.detune.value = det;
      osc.connect(head); osc.start(t); osc.stop(t + dur + .03);
    }
    g.connect(dest);
  }
  function kick(C, dest, t, gain) {
    const o = C.createOscillator(), g = C.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(46, t + .11);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.001, t + .27);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + .3);
  }
  function hit(C, dest, nbuf, t, o) { // ruído filtrado: chimbal, caixa, palmas
    const s = C.createBufferSource(), f = C.createBiquadFilter(), g = C.createGain();
    s.buffer = nbuf; f.type = o.type || 'highpass'; f.frequency.value = o.freq || 7000; f.Q.value = o.q || .7;
    g.gain.setValueAtTime(o.gain, t); g.gain.exponentialRampToValueAtTime(.001, t + o.dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, (t * 7.3) % .6); s.stop(t + o.dur + .02);
  }
  function snare(C, dest, nbuf, t, gain) {
    hit(C, dest, nbuf, t, { type: 'bandpass', freq: 1900, q: .9, gain, dur: .17 });
    tone(C, dest, { type: 'triangle', f: 196, t, dur: .09, gain: gain * .55, attack: .002, release: .07 });
  }
  function bell(C, dest, f, t, gain) { // sino FM: portadora senoidal + moduladora que decai
    const car = C.createOscillator(), mod = C.createOscillator(), mg = C.createGain(), g = C.createGain();
    car.type = 'sine'; mod.type = 'sine'; car.frequency.setValueAtTime(f, t); mod.frequency.setValueAtTime(f * 3.01, t);
    mg.gain.setValueAtTime(f * 1.6, t); mg.gain.exponentialRampToValueAtTime(1, t + 1.4);
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(gain, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + 3.2);
    mod.connect(mg); mg.connect(car.frequency); car.connect(g); g.connect(dest);
    car.start(t); mod.start(t); car.stop(t + 3.3); mod.stop(t + 3.3);
  }
  function impulse(C, seconds) { // resposta de sala sintética para o reverb
    const n = Math.floor(C.sampleRate * seconds), b = C.createBuffer(2, n, C.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let seed = 1234 + ch * 77; for (let i = 0; i < n; i++) { seed = (seed * 16807) % 2147483647; d[i] = (seed / 1073741823 - 1) * Math.pow(1 - i / n, 2.6); } }
    return b;
  }
  function noiseBuffer(C) { const b = C.createBuffer(1, C.sampleRate, C.sampleRate), d = b.getChannelData(0); let seed = 4242; for (let i = 0; i < d.length; i++) { seed = (seed * 16807) % 2147483647; d[i] = seed / 1073741823 - 1; } return b; }

  /* ---------- "Música": duas músicas originais em compasso 4/4, grade de semicolcheias ---------- */
  // acordes e baixo em notas MIDI; melodia = [passo dentro de 8 compassos, nota, duração em passos]
  const SONGS = [
    { bpm: 118, chords: [[59, 62, 66], [55, 59, 62], [57, 62, 66], [57, 61, 64]], bass: [47, 43, 50, 45], bassPattern: [0, 12, 0, 12, 0, 12, 0, 12],
      melody: [[0, 78, 3], [3, 74, 3], [6, 71, 2], [8, 74, 4], [12, 78, 4], [16, 79, 3], [19, 74, 3], [22, 71, 2], [24, 74, 6], [32, 81, 3], [35, 78, 3], [38, 74, 2], [40, 78, 4], [44, 81, 4], [48, 76, 3], [51, 73, 3], [54, 69, 2], [56, 73, 4], [60, 76, 4],
        [64, 78, 3], [67, 74, 3], [70, 71, 2], [72, 74, 4], [76, 78, 4], [80, 79, 3], [83, 83, 3], [86, 79, 2], [88, 74, 6], [96, 81, 3], [99, 78, 3], [102, 74, 2], [104, 81, 4], [108, 86, 4], [112, 85, 3], [115, 81, 3], [118, 76, 2], [120, 73, 8]] },
    { bpm: 124, chords: [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]], bass: [45, 41, 48, 43], bassPattern: [0, 0, 12, 0, 0, 7, 12, 7],
      melody: [[0, 76, 2], [2, 72, 2], [4, 69, 2], [6, 72, 2], [8, 76, 4], [12, 79, 4], [16, 77, 3], [19, 72, 3], [22, 69, 2], [24, 72, 6], [32, 79, 2], [34, 76, 2], [36, 72, 2], [38, 76, 2], [40, 79, 4], [44, 84, 4], [48, 83, 3], [51, 79, 3], [54, 74, 2], [56, 79, 4], [60, 74, 4],
        [64, 76, 2], [66, 72, 2], [68, 69, 2], [70, 72, 2], [72, 76, 4], [76, 81, 4], [80, 81, 3], [83, 77, 3], [86, 72, 2], [88, 77, 6], [96, 84, 2], [98, 79, 2], [100, 76, 2], [102, 79, 2], [104, 84, 4], [108, 88, 4], [112, 86, 3], [115, 83, 3], [118, 79, 2], [120, 74, 8]] },
  ];
  const SECTIONS = ['intro', 'A', 'B', 'A', 'B', 'break', 'B']; // cada seção tem 8 compassos
  function musicTrack(C, dest, wet, nbuf, t0) {
    let songIndex = 0, song = SONGS[0], step = 0, t = t0, sd = 60 / song.bpm / 4;
    const bus = C.createGain(); bus.gain.value = .62; bus.connect(dest);
    const pad = C.createGain(); pad.connect(bus);
    const padWet = C.createGain(); padWet.gain.value = .22; pad.connect(padWet); padWet.connect(wet);
    const delay = C.createDelay(2), fb = C.createGain(), tame = C.createBiquadFilter(), echo = C.createGain();
    fb.gain.value = .33; tame.type = 'lowpass'; tame.frequency.value = 2600; echo.gain.value = .3; delay.delayTime.value = sd * 3;
    delay.connect(tame); tame.connect(fb); fb.connect(delay); delay.connect(echo); echo.connect(bus);
    const lead = C.createGain(); lead.connect(bus); lead.connect(delay);
    const melodies = SONGS.map(s => { const m = new Map(); s.melody.forEach(n => m.set(n[0], n)); return m; });
    function one() {
      const inBar = step % 16, bar = Math.floor(step / 16), section = SECTIONS[Math.floor(bar / 8) % SECTIONS.length], barInSec = bar % 8;
      const chord = song.chords[bar % 4], root = song.bass[bar % 4];
      const groove = section === 'A' || section === 'B' || (section === 'intro' && barInSec >= 4);
      if (groove && inBar % 4 === 0) { kick(C, bus, t, .95); pad.gain.setValueAtTime(1, t - .012); pad.gain.linearRampToValueAtTime(.45, t); pad.gain.linearRampToValueAtTime(1, t + sd * 3.2); } // bumbo + "bombeio" do pad
      if (groove && (inBar === 4 || inBar === 12)) snare(C, bus, nbuf, t, .4);
      if (barInSec === 7 && inBar >= 12 && (groove || section === 'break')) snare(C, bus, nbuf, t, .16 + .07 * (inBar - 12));       // virada no fim da seção
      if (section !== 'break' || barInSec >= 4) { if (inBar % 2 === 0) hit(C, bus, nbuf, t, { gain: inBar % 4 === 2 ? .15 : .08, dur: inBar % 4 === 2 ? .07 : .035 }); else if (groove) hit(C, bus, nbuf, t, { gain: .04, dur: .025 }); }
      if (groove && inBar % 2 === 0) tone(C, bus, { type: 'sawtooth', f: hz(root + song.bassPattern[(inBar / 2) % 8]), t, dur: sd * 1.75, gain: .36, cutoff: 380, cutEnv: 950, q: 4, release: .05 });
      if (inBar === 0) { const level = { intro: 1.5, A: .5, B: 1, break: 1.3 }[section]; for (const n of chord) tone(C, pad, { type: 'sawtooth', detune: [-8, 8], f: hz(n), t, dur: sd * 16.2, gain: .042 * level, attack: section === 'break' ? .5 : .06, release: .35, cutoff: 1500 }); }
      { const i = [0, 1, 2, 1, 0, 1, 2, 3][inBar % 8], n = i === 3 ? chord[0] + 24 : chord[i] + 12; tone(C, lead, { type: 'square', f: hz(n), t, dur: sd * .92, gain: section === 'intro' ? .095 : section === 'break' ? .06 : .062, cutoff: 2000, cutEnv: 1700, cutTime: .09, release: .05 }); }
      if (section === 'B' || section === 'break') { const m = melodies[songIndex].get(step % 128); if (m) tone(C, lead, { type: 'sawtooth', detune: [-5, 5], f: hz(m[1]), t, dur: sd * m[2] * .96, gain: .058, attack: .012, release: .09, cutoff: 3000, cutEnv: 1500 }); }
      step++; t += sd;
      if (step >= SECTIONS.length * 128) { step = 0; songIndex = (songIndex + 1) % SONGS.length; song = SONGS[songIndex]; sd = 60 / song.bpm / 4; delay.delayTime.setValueAtTime(sd * 3, t); }
    }
    return { out: bus, schedule(until) { while (t < until) one(); } };
  }

  /* ---------- "Trilha sonora": fundo calmo, um acorde a cada dois compassos ---------- */
  const AMBIENT = { bpm: 72, chords: [[50, 57, 61, 66], [47, 57, 62, 66], [43, 59, 62, 66], [45, 61, 64, 69]], top: [78, 74, 71, 76] };
  function ambientTrack(C, dest, wet, nbuf, t0) {
    let step = 0, t = t0, seed = 2027; const sd = 60 / AMBIENT.bpm / 2; // passo = colcheia
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const bus = C.createGain(); bus.gain.value = .8; bus.connect(dest);
    const send = C.createGain(); send.gain.value = .55; bus.connect(send); send.connect(wet);
    const delay = C.createDelay(2), fb = C.createGain(), tame = C.createBiquadFilter(), echo = C.createGain();
    delay.delayTime.value = sd * 1.5; fb.gain.value = .46; tame.type = 'lowpass'; tame.frequency.value = 2200; echo.gain.value = .5;
    delay.connect(tame); tame.connect(fb); fb.connect(delay); delay.connect(echo); echo.connect(bus);
    const pluck = C.createGain(); pluck.connect(bus); pluck.connect(delay);
    function one() {
      const inChord = step % 16, ci = Math.floor(step / 16) % 4, chord = AMBIENT.chords[ci], len = sd * 16;
      if (inChord === 0) {
        for (const n of chord) { // pad: ataque lento, cauda longa, os acordes se sobrepõem
          const g = C.createGain(), f = C.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = .6;
          f.frequency.setValueAtTime(420, t); f.frequency.linearRampToValueAtTime(950, t + len * .55); f.frequency.linearRampToValueAtTime(480, t + len + 2);
          g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.05, t + 1.9); g.gain.setValueAtTime(.05, t + len - .3); g.gain.linearRampToValueAtTime(.0001, t + len + 2.4);
          for (const det of [-7, 7]) { const o = C.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(hz(n), t); o.detune.value = det; o.connect(f); o.start(t); o.stop(t + len + 2.5); }
          f.connect(g); g.connect(bus);
        }
        tone(C, bus, { type: 'sine', f: hz(chord[0] - 12), t, dur: len + .4, gain: .11, attack: 1.2, release: 1.6 });
        bell(C, pluck, hz(AMBIENT.top[ci] + (Math.floor(step / 64) % 2 ? 12 : 0)), t + sd * 2, .05);
      }
      if (rnd() < (inChord % 2 ? .5 : .78)) { // arpejo suave: notas do acorde uma ou duas oitavas acima
        const n = chord[1 + Math.floor(rnd() * 3)] + (rnd() < .4 ? 24 : 12);
        tone(C, pluck, { type: 'triangle', f: hz(n), t, dur: sd * 1.9, gain: .05 + rnd() * .025, attack: .008, release: .5, cutoff: 2600, cutEnv: 900 });
      }
      step++; t += sd;
    }
    return { out: bus, schedule(until) { while (t < until) one(); } };
  }
  const makeTrack = (C, dest, wet, nbuf, mode, t0) => (mode === 'ambient' ? ambientTrack : musicTrack)(C, dest, wet, nbuf, t0);
  function chain(C) { // saída: volume → compressor (segura os picos) → alto-falante; reverb em paralelo
    const master = C.createGain(), comp = C.createDynamicsCompressor(), reverb = C.createConvolver(), rg = C.createGain();
    comp.threshold.value = -16; comp.knee.value = 20; comp.ratio.value = 5; comp.attack.value = .004; comp.release.value = .2;
    reverb.buffer = impulse(C, 2.8); rg.gain.value = .8; reverb.connect(rg); rg.connect(master);
    master.connect(comp); comp.connect(C.destination);
    return { master, reverb, noise: noiseBuffer(C) };
  }

  /* ---------- motor em tempo real ---------- */
  let ctx = null, io = null, playing = null, timer = null;
  let want = { mode: 'off', volume: 60, musicUrl: '', ambientUrl: '' };
  const volumeGain = () => Math.pow(Math.max(0, Math.min(100, want.volume)) / 100, 1.6) * .95;
  function ensure() {
    if (ctx || !AC) return ctx;
    ctx = new AC({ latencyHint: 'playback' }); io = chain(ctx); io.master.gain.value = volumeGain();
    ctx.addEventListener('statechange', notify);
    return ctx;
  }
  const listeners = [];
  function notify() { for (const fn of listeners) { try { fn(api.locked); } catch { /* segue */ } } }
  function stopCurrent() {
    const p = playing; playing = null; if (!p) return;
    if (p.el) { const el = p.el; clearInterval(p.fade); let v = el.volume; const down = setInterval(() => { v -= .08; if (v <= 0) { clearInterval(down); el.pause(); el.src = ''; } else el.volume = v; }, 60); return; }
    clearInterval(p.timer);
    const now = ctx.currentTime; p.gain.gain.cancelScheduledValues(now); p.gain.gain.setValueAtTime(p.gain.gain.value, now); p.gain.gain.linearRampToValueAtTime(0, now + .9);
    setTimeout(() => { try { p.gain.disconnect(); } catch { /* já desligado */ } }, 2600);
  }
  function startSynth(id, mode) {
    const gain = ctx.createGain(); gain.gain.value = 0; gain.connect(io.master);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.4);
    const track = makeTrack(ctx, gain, io.reverb, io.noise, mode, ctx.currentTime + .12);
    const tick = () => track.schedule(ctx.currentTime + 1.2); // agenda 1,2 s à frente: não falha se a aba for para segundo plano por instantes
    tick();
    return { id, gain, timer: setInterval(tick, 120) };
  }
  function startMedia(id, url) {
    const el = new Audio(); el.loop = true; el.preload = 'auto'; el.volume = 0; el.src = url;
    const p = { id, el, blocked: false };
    const target = () => Math.min(1, volumeGain() / .95);
    p.fade = setInterval(() => { const d = target() - el.volume; el.volume = Math.max(0, Math.min(1, el.volume + Math.sign(d) * Math.min(Math.abs(d), .05))); }, 60);
    el.play().then(() => { p.blocked = false; notify(); }).catch(() => { p.blocked = true; notify(); });
    el.addEventListener('error', () => { p.blocked = false; p.failed = true; notify(); });
    return p;
  }
  function sync() {
    if (want.mode === 'off') { stopCurrent(); notify(); return; }
    const url = want.mode === 'music' ? want.musicUrl : want.ambientUrl, id = want.mode + '|' + (url || 'synth');
    if (!url) { if (!ensure()) return; if (ctx.state !== 'running') ctx.resume().catch(() => {}); io.master.gain.setTargetAtTime(volumeGain(), ctx.currentTime, .15); }
    if (!playing || playing.id !== id) { stopCurrent(); playing = url ? startMedia(id, url) : startSynth(id, want.mode); }
    notify();
  }
  function beep(f, t, dur, gain, type) { tone(ctx, io.master, { type: type || 'triangle', f, t, dur, gain, attack: .004, release: dur * .6 }); }
  const api = {
    apply(next) { for (const k of ['mode', 'volume', 'musicUrl', 'ambientUrl']) if (next && next[k] !== undefined) want[k] = next[k]; if (!['off', 'music', 'ambient'].includes(want.mode)) want.mode = 'off'; sync(); },
    unlock() {
      if (want.mode === 'off') return;
      if (playing && playing.el) { if (playing.el.paused) playing.el.play().then(() => { playing.blocked = false; notify(); }).catch(() => {}); return; }
      if (ensure() && ctx.state !== 'running') ctx.resume().then(notify).catch(() => {});
    },
    get locked() { if (want.mode === 'off') return false; if (playing && playing.el) return !!playing.blocked; return !ctx || ctx.state !== 'running'; },
    get mode() { return want.mode; },
    onChange(fn) { listeners.push(fn); },
    sfx(name) {
      if (want.mode === 'off' || !ctx || ctx.state !== 'running') return;
      const t = ctx.currentTime + .02;
      if (name === 'blip') { beep(880, t, .09, .05, 'sine'); beep(1320, t + .07, .12, .04, 'sine'); }
      else if (name === 'reveal') [523, 659, 784, 1047].forEach((f, i) => beep(f, t + i * .11, .22, .09));
      else if (name === 'timeup') { beep(440, t, .35, .12, 'square'); beep(440, t + .5, .35, .12, 'square'); beep(880, t + 1, .6, .12, 'square'); }
    },
    get _debug() { return { ctx, io, playing }; },
    // teste: renderiza alguns segundos fora do tempo real e devolve os níveis (pico, RMS por segundo)
    async _render(mode, seconds) {
      const C = new OfflineAudioContext(2, Math.floor(44100 * seconds), 44100), c = chain(C); c.master.gain.value = .95;
      makeTrack(C, c.master, c.reverb, c.noise, mode, .05).schedule(seconds);
      const buf = await C.startRendering(), a = buf.getChannelData(0), b = buf.getChannelData(1), rms = []; let peak = 0, bad = 0;
      for (let s = 0; s < seconds; s++) { let sum = 0; const from = s * 44100, to = Math.min(a.length, from + 44100); for (let i = from; i < to; i++) { const v = (a[i] + b[i]) / 2; if (!Number.isFinite(v)) bad++; sum += v * v; peak = Math.max(peak, Math.abs(a[i]), Math.abs(b[i])); } rms.push(+Math.sqrt(sum / (to - from)).toFixed(4)); }
      return { peak: +peak.toFixed(3), bad, rms, buffer: buf };
    },
  };
  window.Trilha = api;
})();
