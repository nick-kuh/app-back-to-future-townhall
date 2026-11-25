/* ===== Visão 2027 · o Doc no telão (direção de cinema) =====
 * O encerramento do "De Volta para o Sucesso": o Doc (personagem original, public/doc-retrato.js) chega de
 * 2027 e conta, em voz alta, o que viu, a partir do que todo mundo escreveu nas quatro dinâmicas.
 *
 * Linguagem de cinema: barras pretas (2,39:1), granulação, névoa, poeira na luz, fundo desfocado, cortes secos
 * entre planos (silhueta contra a luz, plano médio, close), legendas de cinema e cartelas de capítulo.
 *
 * Partes: chegada, abertura, uma por dinâmica, jornal de 2027 e encerramento. O Painel do Doc começa,
 * pausa, pula ou volta partes; dentro de cada parte o telão segue sozinho, no ritmo da fala.
 *
 *   DocCena.html(state) · DocCena.mount(el, state) · DocCena.update(state) · DocCena.unmount()
 *   DocCena.progress() → { seq, part, speaking, done, voice } · DocCena.onChange(fn) · DocCena.speaking
 */
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  const ACT = { d1: { n: '01', c: '#2ee6d6' }, d2: { n: '02', c: '#ffd21f' }, d3: { n: '03', c: '#ff2d95' }, d4: { n: '04', c: '#ff8a1f' } };
  // plano de cada dinâmica (variar o enquadramento deixa a cena com cara de filme)
  const ACT_SHOT = { d1: 'cu', d2: 'mcu-r', d3: 'ecu', d4: 'mcu' };
  const sfx = (n, a, d) => { if (window.Trilha) Trilha.sfx(n, a, d); };
  const portrait = () => (window.DocRetrato ? DocRetrato.portrait() : '');
  const silhouette = () => (window.DocRetrato ? DocRetrato.silhouette() : '');

  /* ---------- a cena ---------- */
  const ledDate = d => `${MONTHS[d.getMonth()]} ${pad(d.getDate())} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  function partsOf(m) { return m ? ['chegada', 'abertura', ...(m.blocos || []).map(b => b.id), 'jornal', 'final'] : []; }
  function html(st) {
    const set = st.settings || {}, img = set.docImageUrl, idle = set.docIdleVideoUrl || set.docTalkVideoUrl, talk = set.docTalkVideoUrl || set.docIdleVideoUrl;
    // o Doc: vídeos feitos com IA (parado / falando, alternando no ritmo da voz), um retrato feito com IA ou o desenho
    const doc = idle ? `<div class="doc-vid"><video class="v-idle" src="${esc(idle)}" muted loop playsinline autoplay preload="auto"></video><video class="v-talk" src="${esc(talk)}" muted loop playsinline autoplay preload="auto"></video></div>`
      : img ? `<img class="doc-img" src="${esc(img)}" alt="">` : portrait();
    return `<section class="docx" id="docx" data-part="espera" data-shot="none">
      <div class="cx-world" id="cxWorld">
        <div class="cx-portal"></div>
        <div class="cx-fog f1"></div><div class="cx-fog f2"></div>
        <div class="dx-cloud"><canvas id="dxCloud"></canvas></div>
        <div class="dx-sil">${silhouette()}</div>
        <div class="dx-doc ${idle ? 'is-video' : img ? 'is-img' : ''}" id="dxDoc" data-pose="idle" data-mouth="0">${doc}</div>
      </div>
      <div class="dx-car"><canvas class="car3d" id="dxCar"></canvas><div class="cx-gw" id="dxGw">0.00 GW</div></div>
      <div class="cx-rays"></div>
      <canvas class="cx-dust" id="cxDust"></canvas>
      <div class="cx-grade"></div><div class="cx-vignette"></div><div class="cx-grain"></div>
      <div class="dx-circ circuits">
        <div class="tc r"><label>DESTINATION TIME</label><div class="led" id="dxDest">JAN 01 2027 00:00</div></div>
        <div class="tc g"><label>PRESENT TIME</label><div class="led" id="dxNow">${ledDate(new Date())}</div></div>
        <div class="tc a"><label>LAST TIME DEPARTED</label><div class="led">DEZ 31 2026 23:59</div></div>
      </div>
      <div class="dx-wait">
        <div class="cx-kick">DE VOLTA PARA O SUCESSO · ENCERRAMENTO</div>
        <div class="dx-big"><span class="bttf">VISÃO 2027</span></div>
        <div class="dx-signal"><i></i><i></i><i></i> SINAL VINDO DO FUTURO…</div>
      </div>
      <div class="cx-title" id="cxTitle"></div>
      <div class="cx-chapter" id="cxChapter"></div>
      <div class="dx-paper" id="dxPaper" hidden></div>
      <div class="dx-final" id="dxFinal" hidden></div>
      <div class="cx-bars"><i></i><i></i></div>
      <div class="cx-sub" id="cxSub"></div>
      <div class="dx-pause" id="dxPause" hidden>❚❚ PAUSADO PELO DOC</div>
      <button class="dx-voice" id="dxVoice" type="button" hidden>🔊 Clique aqui para liberar a voz do Doc</button>
      <video class="dx-video" id="dxVideo" playsinline hidden></video>
      <div class="cx-cut" id="cxCut"></div>
      <div class="dx-flash" id="dxFlash"></div>
      <div class="dx-fire"></div><div class="dx-fire f2"></div>
    </section>`;
  }

  /* ---------- voz ---------- */
  const synth = window.speechSynthesis || null;
  let voices = [];
  const loadVoices = () => { if (synth) voices = synth.getVoices() || []; };
  if (synth) { loadVoices(); synth.addEventListener && synth.addEventListener('voiceschanged', loadVoices); }
  // A melhor voz em português do Brasil, de preferência masculina e "natural" (Edge/Windows), ou a pedida no painel
  function pickVoice(want) {
    if (!voices.length) loadVoices();
    const pt = voices.filter(v => /^pt[-_]BR/i.test(v.lang)), any = pt.length ? pt : voices.filter(v => /^pt/i.test(v.lang));
    if (!any.length) return null;
    if (want) { const w = want.toLowerCase(), hit = any.find(v => v.name.toLowerCase().includes(w)); if (hit) return hit; }
    const prefs = [/Antonio.*Natural/i, /(Donato|Fabio|Julio|Humberto|Valerio|Nicolau).*Natural/i, /Natural/i, /Daniel|Felipe|Ricardo/i, /Google/i];
    for (const re of prefs) { const v = any.find(x => re.test(x.name)); if (v) return v; }
    return any[0];
  }
  const canTalk = () => !!synth && (!navigator.userActivation || navigator.userActivation.hasBeenActive);

  /* ---------- estado ---------- */
  const C = { el: null, st: null, m: null, seq: null, part: -1, paused: false, timers: [], ivs: [], tok: 0, speaking: false, done: false,
    car: null, cloud: null, words: null, voice: '', listeners: [], clock: null, dust: null };
  const later = (ms, fn) => { const t = setTimeout(fn, ms); C.timers.push(t); return t; };
  const every = (ms, fn) => { const t = setInterval(fn, ms); C.ivs.push(t); return t; };
  function clearAll() {
    C.timers.forEach(clearTimeout); C.ivs.forEach(clearInterval); C.timers = []; C.ivs = [];
    C.tok++; if (synth) synth.cancel(); setSpeaking(false); mouth(0); sub('');
    const v = C.el && $('#dxVideo', C.el); if (v && !v.hidden) { v.pause(); v.hidden = true; }
  }
  function notify() { for (const fn of C.listeners) { try { fn(); } catch { /* segue */ } } }
  function setSpeaking(on) {
    if (C.speaking === on) return; C.speaking = on;
    if (C.el) {
      C.el.classList.toggle('talking', on);
      const v = C.el.querySelector(on ? '.v-talk' : '.v-idle'); if (v && v.paused) v.play().catch(() => {}); // vídeos do Doc: o certo na frente
    }
    notify();
  }
  const docEl = () => C.el && $('#dxDoc', C.el);
  function mouth(k) { const d = docEl(); if (d) d.dataset.mouth = String(k); }
  function pose(p) { const d = docEl(); if (d) d.dataset.pose = p; }
  function flash(strong) { const f = C.el && $('#dxFlash', C.el); if (!f) return; f.classList.remove('on', 'strong'); void f.offsetWidth; f.classList.add('on'); if (strong) f.classList.add('strong'); }
  function fire() { if (!C.el) return; C.el.classList.remove('fire'); void C.el.offsetWidth; C.el.classList.add('fire'); }
  function sub(text) { const s = C.el && $('#cxSub', C.el); if (!s) return; if (!text) { s.classList.remove('on'); return; } s.textContent = text; s.classList.remove('on'); void s.offsetWidth; s.classList.add('on'); }
  // corte seco para outro plano (um instante de preto, como na montagem de um filme)
  function shot(name, { cut = true } = {}) {
    const el = C.el; if (!el) return;
    const apply = () => { el.dataset.shot = name; const w = $('#cxWorld', el); w.classList.remove('push'); void w.offsetWidth; w.classList.add('push'); };
    if (!cut || el.dataset.shot === name) return apply();
    const k = $('#cxCut', el); k.classList.remove('on'); void k.offsetWidth; k.classList.add('on');
    later(140, apply);
  }
  function title(htmlStr, ms) {
    const t = C.el && $('#cxTitle', C.el); if (!t) return;
    t.innerHTML = htmlStr; t.classList.remove('on'); void t.offsetWidth; t.classList.add('on');
    if (ms) later(ms, () => t.classList.remove('on'));
  }

  // Fala o texto frase a frase (o Chrome corta falas longas), com a frase atual como legenda de cinema.
  // Sem voz (desligada no painel, navegador sem português ou sem o clique que libera o som), as legendas
  // avançam no ritmo de leitura. Chama done() no fim.
  function speak(text, done) {
    const tok = C.tok, set = (C.st && C.st.settings) || {}, rate = Number(set.docRate) || 1;
    const voice = set.docVoice !== false && canTalk() ? pickVoice(set.docVoiceName) : null;
    C.voice = voice ? voice.name : ''; notify();
    setSpeaking(true); pose('talk');
    let mk = 0; every(115, () => { if (!C.speaking) return mouth(0); mk = (mk + 1 + Math.floor(Math.random() * 2)) % 3; mouth(mk === 0 && Math.random() < .5 ? 1 : mk); });
    every(3200, () => { if (C.speaking) pose(['talk', 'point', 'talk', 'wave', 'talk'][Math.floor(Math.random() * 5)]); });
    const chunks = (String(text).match(/[^.!?…]+[.!?…]*\s*/g) || [String(text)]).map(x => x.trim()).filter(Boolean);
    const finish = () => { if (tok !== C.tok) return; setSpeaking(false); mouth(0); pose('idle'); later(350, () => sub('')); done && done(); };
    let i = 0;
    if (!voice) { // ritmo de leitura: ~2,6 palavras por segundo
      const next = () => {
        if (tok !== C.tok) return;
        if (i >= chunks.length) return finish();
        const ch = chunks[i++]; sub(ch);
        later(Math.max(1600, ch.split(/\s+/).length / (2.6 * rate) * 1000), next);
      };
      return next();
    }
    const next = () => {
      if (tok !== C.tok) return;
      if (i >= chunks.length) return finish();
      const ch = chunks[i++], u = new SpeechSynthesisUtterance(ch);
      u.voice = voice; u.lang = voice.lang; u.rate = rate; u.pitch = .92; u.volume = 1;
      let ended = false;
      const end = () => { if (ended) return; ended = true; clearTimeout(guard); later(160, next); };
      u.onstart = () => { if (tok === C.tok) sub(ch); };
      u.onend = end;
      u.onerror = e => { if (e.error === 'not-allowed') showVoiceChip(); end(); };
      const guard = later(Math.max(6000, ch.split(/\s+/).length / (1.1 * rate) * 1000 + 4000), end); // o onend às vezes não chega
      sub(ch); synth.speak(u);
    };
    if (synth.speaking || synth.pending) synth.cancel();
    later(60, next);
  }
  function showVoiceChip() { const b = C.el && $('#dxVoice', C.el); if (b) b.hidden = false; }

  /* ---------- palavras ao fundo (fora de foco) e poeira na luz ---------- */
  function feedCloud(list, max = 14) {
    if (!C.cloud || !list) return;
    for (const [w, c] of list) { if (C.words.has(w)) continue; C.words.add(w); for (let k = 0; k < Math.min(max, c); k++) C.cloud.add(w); }
  }
  function dust(cv) {
    const ctx = cv.getContext('2d'), P = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: .6 + Math.random() * 2.2, v: .004 + Math.random() * .012, d: Math.random() * 6.28, c: Math.random() < .5 ? '255,200,150' : '120,240,255' }));
    let last = 0, alive = true;
    const loop = t => {
      if (!alive) return; requestAnimationFrame(loop);
      if (document.hidden || t - last < 40) return; const dt = Math.min(.1, (t - last) / 1000); last = t;
      const w = cv.clientWidth, h = cv.clientHeight; if (!w) return;
      if (cv.width !== w) { cv.width = w; cv.height = h; }
      ctx.clearRect(0, 0, w, h);
      for (const p of P) {
        p.y -= p.v * dt * 6; p.d += dt; p.x += Math.sin(p.d) * .0004; if (p.y < -.02) { p.y = 1.02; p.x = Math.random(); }
        const a = .25 + .35 * Math.sin(p.d * 2.3) ** 2;
        ctx.beginPath(); ctx.fillStyle = `rgba(${p.c},${a})`; ctx.shadowColor = `rgba(${p.c},.9)`; ctx.shadowBlur = 8;
        ctx.arc(p.x * w, p.y * h, p.r, 0, 6.29); ctx.fill();
      }
    };
    requestAnimationFrame(loop);
    return { stop() { alive = false; } };
  }

  /* ---------- partes ---------- */
  function next() { const list = partsOf(C.m); if (C.part < list.length - 1) play(C.part + 1); }
  function play(idx) {
    clearAll();
    const list = partsOf(C.m); if (!list.length) return;
    C.part = Math.max(0, Math.min(list.length - 1, idx)); C.done = false;
    const id = list[C.part], m = C.m, el = C.el;
    el.dataset.part = ['chegada', 'abertura', 'jornal', 'final'].includes(id) ? id : 'bloco';
    el.dataset.stage = ''; // pulou de parte no meio da chegada: os mostradores e o carro saem da tela
    $('#dxPaper', el).hidden = id !== 'jornal'; $('#dxFinal', el).hidden = id !== 'final';
    $('#cxTitle', el).classList.remove('on'); $('#cxChapter', el).classList.remove('on');
    if (C.cloud) C.cloud.dim = true;
    notify();
    if (id === 'chegada') return arrival();
    if (id === 'abertura') {
      shot('mcu'); pose('wave');
      title(`<small>DE VOLTA PARA O SUCESSO APRESENTA</small><b>${esc(m.titulo)}</b>`, 5200);
      return later(1400, () => speak(m.abertura, () => later(1100, next)));
    }
    if (id === 'jornal') return newspaper();
    if (id === 'final') return finale();
    // uma dinâmica: cartela de capítulo e, depois, o Doc conta o que viu
    const b = (m.blocos || []).find(x => x.id === id); if (!b) return later(10, next);
    const a = ACT[id] || ACT.d1, ch = $('#cxChapter', el);
    ch.style.setProperty('--c', a.c);
    ch.innerHTML = `<small>CAPÍTULO ${a.n}</small><b>${esc(b.titulo)}</b><i></i><span>${(b.palavras || []).slice(0, 5).map(esc).join('  ·  ')}</span>`;
    void ch.offsetWidth; ch.classList.add('on'); sfx('blip');
    feedCloud((b.palavras || []).map(w => [w, 5]));
    later(2800, () => { ch.classList.remove('on'); shot(ACT_SHOT[id] || 'cu'); later(500, () => speak(b.fala, () => later(1000, next))); });
  }

  // Chegada: os circuitos de tempo marcam 2027; o carro (plano aberto) carrega até 1,21 GW; três raios; e,
  // no clarão, a silhueta do Doc sai da fumaça contra a luz do portal. Com vídeo no painel, ele toca no lugar.
  function arrival() {
    const el = C.el, set = (C.st && C.st.settings) || {};
    el.classList.remove('arrived'); pose('idle'); shot('none', { cut: false });
    const video = $('#dxVideo', el);
    if (set.docVideoUrl && video) {
      video.hidden = false; video.src = set.docVideoUrl; video.currentTime = 0; video.volume = 1;
      // vídeo com a fala completa (ex.: o curta feito com IA): depois dele, direto para o jornal e o 2027
      const full = !!set.docVideoFull, jornal = partsOf(C.m).indexOf('jornal');
      const go = () => { video.onended = video.onerror = null; video.pause(); video.hidden = true; el.classList.add('arrived'); flash(true); later(1200, () => (full && jornal > 0 ? play(jornal) : next())); };
      video.onended = go; video.onerror = () => { video.hidden = true; video.onended = video.onerror = null; arrivalShow(); };
      video.play().catch(() => { video.muted = true; video.play().catch(() => { video.hidden = true; arrivalShow(); }); });
      return;
    }
    arrivalShow();
  }
  function arrivalShow() {
    const el = C.el, dest = $('#dxDest', el), target = 'JAN 01 2027 10:21';
    el.dataset.stage = 'circuits'; dest.textContent = '';
    [...target].forEach((ch, i) => later(150 + i * 95, () => { dest.textContent = target.slice(0, i + 1); if (ch !== ' ') sfx('key', i); }));
    const t = 150 + target.length * 95 + 500;
    // o carro, em plano aberto, carregando
    const gw = $('#dxGw', el); let e = .1;
    const show = () => { if (C.car) C.car.setEnergy(e); if (gw) gw.textContent = e >= 1 ? '⚡ 1.21 GIGAWATTS' : `${(e * 1.21).toFixed(2)} GIGAWATTS`; };
    later(t, () => { el.dataset.stage = 'car'; flash(); show(); sfx('hum', 1.8); const iv = every(80, () => { e = Math.min(1, e + .045); show(); if (e >= 1) clearInterval(iv); }); });
    [0, 260, 560].forEach(d => later(t + 2000 + d, () => { flash(d === 560); sfx('thunder'); if (C.car) { if (d === 560) C.car.charge(1); else C.car.spark(); } }));
    // a silhueta contra a luz, no meio da fumaça
    later(t + 2900, () => { el.dataset.stage = 'silhouette'; fire(); shot('wide', { cut: false }); sfx('reveal'); });
    later(t + 6000, () => { el.dataset.stage = ''; el.classList.add('arrived'); shot('mcu'); pose('wave'); });
    later(t + 7200, next);
  }
  function newspaper() {
    const el = C.el, m = C.m, paper = $('#dxPaper', el), heads = m.manchetes || [];
    shot('paper');
    paper.innerHTML = `<div class="np-top"><span>EDIÇÃO ESPECIAL · VIAGEM NO TEMPO</span><span>PREÇO: 1,21 GIGAWATTS</span></div>
      <h2 class="np-name">GAZETA DO FUTURO</h2>
      <div class="np-date"><span>HILL VALLEY</span><span>SEXTA-FEIRA, 1º DE JANEIRO DE 2027</span><span>ANO 42 · Nº 2027</span></div>
      <div class="np-main">${esc(heads[0] || '')}</div>
      <div class="np-cols"><div class="np-photo"><svg viewBox="0 0 200 120" aria-hidden="true"><path d="M10 92 L40 70 L120 62 L170 74 L190 92 Z" fill="#2b2b2b"/><circle cx="55" cy="96" r="13" fill="#111"/><circle cx="150" cy="96" r="13" fill="#111"/>
          <path d="M60 64 L80 46 L130 46 L150 64" fill="#555"/><path d="M0 104 H200" stroke="#111" stroke-width="3"/><path d="M180 30 l-8 18 h8 l-6 16" stroke="#111" stroke-width="3" fill="none"/></svg><small>A MÁQUINA DO TEMPO CHEGA AO FUTURO · FOTO: ARQUIVO 2027</small></div>
        <ul class="np-list">${heads.slice(1).map(h => `<li>${esc(h)}</li>`).join('')}</ul></div>`;
    paper.classList.remove('in'); void paper.offsetWidth; paper.classList.add('in');
    sfx('roll', 1.6);
    const text = `Vejam só o jornal de 2027! ${heads.map(h => h.replace(/[.!?]*$/, '.')).join(' ')}`;
    later(2100, () => speak(text, () => later(1500, next)));
  }
  function finale() {
    const el = C.el, m = C.m, fin = $('#dxFinal', el);
    feedCloud(m.palavras || [], 10);
    fin.innerHTML = `<div class="fx-flare"></div><div class="fx-year"><span class="bttf">2027</span></div><div class="fx-sub">O FUTURO É O QUE VOCÊS FIZEREM DELE</div><div class="fx-end">CONTINUA…</div>`;
    fin.classList.remove('in');
    const landing = () => { // corte para o "2027" em letras do logo, com raio e rastros de fogo
      flash(true); fire(); sfx('thunder'); later(300, () => sfx('reveal'));
      el.dataset.part = 'fim'; shot('end', { cut: false }); void fin.offsetWidth; fin.classList.add('in');
      if (C.cloud) C.cloud.dim = false;
      C.done = true; notify();
    };
    const set = (C.st && C.st.settings) || {}, inVideo = !!(set.docVideoFull && set.docVideoUrl); // o vídeo já disse o encerramento
    if (inVideo) return later(1000, landing);
    shot('cu'); pose('idle');
    later(700, () => speak(m.encerramento, () => { pose('point'); later(900, landing); }));
  }

  /* ---------- ciclo de vida ---------- */
  function mount(el, st) {
    unmount();
    C.el = $('#docx', el) || el; C.st = st; C.m = st.doc && st.doc.message; C.seq = null; C.part = -1; C.words = new Set();
    document.body.classList.add('doc-cine'); // fundo desfocado e escurecido (profundidade de campo)
    const cv = $('#dxCar', C.el), cl = $('#dxCloud', C.el), du = $('#cxDust', C.el);
    C.car = cv && window.Delorean3D ? Delorean3D.car(cv, { dprMax: 1.25 }) : null;
    if (C.car) C.car.setEnergy(.15);
    C.cloud = cl && window.NuvemDePalavras ? new NuvemDePalavras(cl, { scale: 1.1, wide: true }) : null;
    if (C.cloud) C.cloud.dim = true;
    C.dust = du ? dust(du) : null;
    const vb = $('#dxVoice', C.el); if (vb) vb.onclick = () => { vb.hidden = true; if (C.part >= 0) play(C.part); };
    C.el.addEventListener('pointerdown', e => { if (vb && e.target !== vb) vb.hidden = true; }); // qualquer clique na tela já libera a voz
    C.clock = setInterval(() => { const n = C.el && $('#dxNow', C.el); if (n) n.textContent = ledDate(new Date()); }, 1000);
    update(st);
  }
  function update(st) {
    if (!C.el) return;
    C.st = st; const d = st.doc || {};
    if (d.message) C.m = d.message;
    const p = d.play;
    // a voz precisa de um clique na página (regra dos navegadores): avisa antes da cena
    const vb = $('#dxVoice', C.el); if (vb && synth) vb.hidden = !(st.settings && st.settings.docVoice !== false && !canTalk());
    if (!p || !C.m) { if (C.part !== -1) stopScene(); C.seq = null; return; }
    const pz = $('#dxPause', C.el); if (pz) pz.hidden = !p.paused;
    if (p.seq === C.seq && p.paused === C.paused) return;
    const fresh = p.seq !== C.seq; C.seq = p.seq; C.paused = !!p.paused;
    if (p.paused) { clearAll(); C.part = p.part; notify(); return; }
    if (fresh || C.part !== p.part) {
      if (C.cloud && C.part === -1) feedCloud((C.m.palavras || []).slice(0, 25), 3); // palavras mais citadas, fora de foco, ao fundo
      if (p.part > 0) C.el.classList.add('arrived'); // telão recarregado no meio da cena: o Doc já chegou
      play(p.part);
    }
  }
  function stopScene() {
    clearAll(); C.part = -1; C.done = false;
    if (C.el) { const el = C.el; el.dataset.part = 'espera'; el.dataset.stage = ''; el.dataset.shot = 'none'; el.classList.remove('arrived', 'fire'); $('#dxPaper', el).hidden = true; $('#dxFinal', el).hidden = true; $('#cxTitle', el).classList.remove('on'); $('#cxChapter', el).classList.remove('on'); }
    notify();
  }
  function unmount() {
    document.body.classList.remove('doc-cine');
    if (!C.el) return;
    clearAll(); clearInterval(C.clock); C.clock = null; if (C.dust) C.dust.stop();
    C.el = null; C.car = null; C.cloud = null; C.dust = null; C.part = -1; C.seq = null; notify();
  }
  // fala a frase de teste no telão (o Doc testa a voz antes do evento)
  function testVoice(st) {
    const set = (st && st.settings) || {}, v = synth && pickVoice(set.docVoiceName);
    if (!v) return '';
    synth.cancel(); const u = new SpeechSynthesisUtterance('Teste de voz. O capacitor de fluxo está pronto para 2027!');
    u.voice = v; u.lang = v.lang; u.rate = Number(set.docRate) || 1; u.pitch = .92; synth.speak(u);
    return v.name;
  }

  window.DocCena = {
    html, mount, update, unmount, testVoice,
    get speaking() { return C.speaking; },
    progress: () => (C.el ? { seq: C.seq || 0, part: Math.max(0, C.part), speaking: C.speaking, done: C.done, voice: C.voice || (synth && pickVoice(((C.st && C.st.settings) || {}).docVoiceName) || {}).name || '' } : null),
    onChange(fn) { C.listeners.push(fn); },
    voices: () => (voices.length ? voices : (loadVoices(), voices)).filter(v => /^pt/i.test(v.lang)).map(v => v.name),
  };
})();
