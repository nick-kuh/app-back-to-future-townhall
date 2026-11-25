/* ===== Visão 2027 · o Doc no telão =====
 * O encerramento do "De Volta para o Sucesso": o Doc (personagem original desenhado aqui em SVG) chega de
 * 2027 com raios e rastros de fogo, lê em voz alta (voz em português do navegador) o resumo do que todo
 * mundo escreveu nas quatro dinâmicas, mostra o jornal de 2027 e fecha com o "2027" em letras do logo.
 *
 * A cena é dividida em partes (chegada, abertura, uma por dinâmica, jornal, encerramento). O Painel do Doc
 * começa a cena, pausa, pula ou volta partes; dentro de cada parte o telão segue sozinho, no ritmo da fala.
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
  const ACT = { d1: { n: '01', c: 'var(--cyan)' }, d2: { n: '02', c: 'var(--yellow)' }, d3: { n: '03', c: 'var(--magenta)' }, d4: { n: '04', c: 'var(--orange)' } };
  const sfx = (n, a, d) => { if (window.Trilha) Trilha.sfx(n, a, d); };

  /* ---------- o Doc (personagem original) ---------- */
  // cabelo branco arrepiado: pontas em volta da cabeça (atrás dela, para a testa aparecer)
  function hairPath() {
    const cx = 160, cy = 150, pts = [];
    for (let i = 0; i <= 26; i++) {
      const a = (160 + i * (220 / 26)) * Math.PI / 180, out = i % 2 ? 92 + (i * 37 % 13) : 70;
      pts.push(`${(cx + Math.cos(a) * out * 1.08).toFixed(1)},${(cy + Math.sin(a) * out).toFixed(1)}`);
    }
    return `M${pts.join(' L')} Z`;
  }
  const DOC_SVG = `<svg class="doc-svg" viewBox="0 0 320 470" aria-hidden="true">
    <defs>
      <radialGradient id="dcLens" cx=".35" cy=".35"><stop offset="0" stop-color="#e6fffc"/><stop offset=".45" stop-color="#2ee6d6"/><stop offset="1" stop-color="#0b6f78"/></radialGradient>
      <linearGradient id="dcCoat" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cfd6f2"/></linearGradient>
      <linearGradient id="dcShirt" x1="0" x2="1"><stop offset="0" stop-color="#ff2d95"/><stop offset="1" stop-color="#ff6a00"/></linearGradient>
    </defs>
    <g class="dc-body">
      <!-- braço esquerdo (parado) -->
      <path d="M78 282 Q52 340 56 404 L84 408 Q86 350 104 300 Z" fill="url(#dcCoat)" stroke="#8d96bd" stroke-width="3"/>
      <circle cx="70" cy="414" r="15" fill="#f2c9a8" stroke="#b9805f" stroke-width="3"/>
      <!-- jaleco -->
      <path d="M70 284 Q78 248 126 238 L160 266 L194 238 Q242 248 250 284 L262 470 L58 470 Z" fill="url(#dcCoat)" stroke="#8d96bd" stroke-width="3"/>
      <path d="M128 240 L160 268 L192 240 L184 330 L160 352 L136 330 Z" fill="url(#dcShirt)"/>
      <path d="M126 238 L160 268 L142 338 L110 270 Z" fill="#e3e8f8" stroke="#8d96bd" stroke-width="2.5"/>
      <path d="M194 238 L160 268 L178 338 L210 270 Z" fill="#e3e8f8" stroke="#8d96bd" stroke-width="2.5"/>
      <path d="M146 262 L160 270 L146 280 Z M174 262 L160 270 L174 280 Z" fill="#2ee6d6" stroke="#0b6f78" stroke-width="2"/>
      <circle cx="160" cy="270" r="4" fill="#0b6f78"/>
      <!-- bolso com canetas e o crachá do capacitor de fluxo -->
      <rect x="86" y="318" width="40" height="34" rx="4" fill="#e3e8f8" stroke="#8d96bd" stroke-width="2.5"/>
      <path d="M96 318 v-16 M106 318 v-20 M116 318 v-14" stroke-width="5" stroke-linecap="round" class="dc-pens"/>
      <g class="dc-badge"><rect x="198" y="318" width="38" height="44" rx="6" fill="#1d1142" stroke="#ffd21f" stroke-width="2.5"/>
        <path d="M206 326 L217 340 L228 326 M217 340 V354" stroke="#ffd21f" stroke-width="3.5" stroke-linecap="round" fill="none"/></g>
      <!-- pescoço -->
      <rect x="142" y="208" width="36" height="36" rx="10" fill="#e8b994"/>
    </g>
    <!-- braço direito: aponta, gesticula, acena -->
    <g class="dc-arm">
      <path d="M236 278 Q270 330 266 400 L238 404 Q236 350 214 300 Z" fill="url(#dcCoat)" stroke="#8d96bd" stroke-width="3"/>
      <g class="dc-hand"><circle cx="252" cy="410" r="15" fill="#f2c9a8" stroke="#b9805f" stroke-width="3"/>
        <rect x="246" y="418" width="9" height="24" rx="4.5" fill="#f2c9a8" stroke="#b9805f" stroke-width="3"/></g>
    </g>
    <g class="dc-head">
      <path class="dc-hair" d="${hairPath()}" fill="#f6f8ff" stroke="#c4cbe6" stroke-width="3" stroke-linejoin="round"/>
      <ellipse cx="98" cy="160" rx="12" ry="18" fill="#efc19e" stroke="#b9805f" stroke-width="3"/>
      <ellipse cx="222" cy="160" rx="12" ry="18" fill="#efc19e" stroke="#b9805f" stroke-width="3"/>
      <ellipse cx="160" cy="150" rx="62" ry="74" fill="#f2c9a8" stroke="#b9805f" stroke-width="3"/>
      <!-- óculos de proteção na testa -->
      <path d="M100 102 Q160 84 220 102" stroke="#6b3d1f" stroke-width="9" fill="none" stroke-linecap="round"/>
      <circle cx="136" cy="98" r="18" fill="url(#dcLens)" stroke="#d4a017" stroke-width="5"/>
      <circle cx="184" cy="98" r="18" fill="url(#dcLens)" stroke="#d4a017" stroke-width="5"/>
      <circle cx="130" cy="92" r="4" fill="#fff" opacity=".8"/><circle cx="178" cy="92" r="4" fill="#fff" opacity=".8"/>
      <g class="dc-brows"><path d="M116 130 Q134 114 152 127" /><path d="M168 127 Q186 114 204 130" /></g>
      <g class="dc-eyes">
        <ellipse cx="137" cy="147" rx="12" ry="13" fill="#fff" stroke="#8a5a3c" stroke-width="2"/><ellipse cx="183" cy="147" rx="12" ry="13" fill="#fff" stroke="#8a5a3c" stroke-width="2"/>
        <g class="dc-pupils"><circle cx="139" cy="148" r="5.5" fill="#1d1142"/><circle cx="185" cy="148" r="5.5" fill="#1d1142"/>
          <circle cx="141" cy="146" r="1.8" fill="#fff"/><circle cx="187" cy="146" r="1.8" fill="#fff"/></g>
      </g>
      <path d="M160 152 Q149 174 157 180 Q166 183 171 176" stroke="#b9805f" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <circle cx="122" cy="178" r="9" fill="#ff8aa0" opacity=".35"/><circle cx="198" cy="178" r="9" fill="#ff8aa0" opacity=".35"/>
      <g class="dc-mouth">
        <path class="m0" d="M136 194 Q160 212 184 194" stroke="#7a2a1a" stroke-width="4" fill="none" stroke-linecap="round"/>
        <path class="m1" d="M136 192 Q160 230 184 192 Q160 200 136 192 Z" fill="#5a1020" stroke="#7a2a1a" stroke-width="3"/>
        <path class="m1" d="M142 194 Q160 199 178 194 L176 200 Q160 204 144 200 Z" fill="#fff"/>
        <ellipse class="m2" cx="160" cy="200" rx="10" ry="13" fill="#5a1020" stroke="#7a2a1a" stroke-width="3"/>
      </g>
    </g>
  </svg>`;

  /* ---------- peças da cena ---------- */
  const ledDate = d => `${MONTHS[d.getMonth()]} ${pad(d.getDate())} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const circuits = () => `<div class="dx-circ circuits">
      <div class="tc r"><label>DESTINATION TIME</label><div class="led" id="dxDest">JAN 01 2027 00:00</div></div>
      <div class="tc g"><label>PRESENT TIME</label><div class="led" id="dxNow">${ledDate(new Date())}</div></div>
      <div class="tc a"><label>LAST TIME DEPARTED</label><div class="led">DEZ 31 2026 23:59</div></div>
    </div>`;
  function partsOf(m) {
    if (!m) return [];
    return ['chegada', 'abertura', ...(m.blocos || []).map(b => b.id), 'jornal', 'final'];
  }
  function html(st) {
    const d = st.doc || {}, m = d.message;
    return `<section class="docx" id="docx" data-part="${m ? 'chegada' : 'espera'}">
      ${circuits()}
      <div class="dx-cloud"><canvas id="dxCloud"></canvas></div>
      <div class="dx-car carbox"><canvas class="car3d" id="dxCar"></canvas>
        <div class="energy"><div class="lbl"><span>⚡ FLUX CAPACITOR</span><span id="dxGw">0.00 / 1.21 GIGAWATTS</span></div><div class="ebar"><i id="dxBar"></i></div></div></div>
      <div class="dx-wait">
        <div class="dx-kick">DE VOLTA PARA O SUCESSO · ENCERRAMENTO</div>
        <div class="dx-big"><span class="bttf">VISÃO 2027</span></div>
        <div class="dx-signal"><i></i><i></i><i></i> SINAL VINDO DO FUTURO…</div>
      </div>
      <div class="dx-doc" id="dxDoc">${DOC_SVG}<div class="dx-shadow"></div></div>
      <div class="dx-panel" id="dxPanel"></div>
      <div class="dx-paper" id="dxPaper" hidden></div>
      <div class="dx-final" id="dxFinal" hidden></div>
      <div class="dx-pause" id="dxPause" hidden>❚❚ PAUSADO PELO DOC</div>
      <button class="dx-voice" id="dxVoice" type="button" hidden>🔊 Clique aqui para liberar a voz do Doc</button>
      <video class="dx-video" id="dxVideo" playsinline hidden></video>
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

  /* ---------- estado da cena ---------- */
  const C = { el: null, st: null, m: null, seq: null, part: -1, paused: false, timers: [], ivs: [], tok: 0, speaking: false, done: false,
    car: null, cloud: null, words: null, voice: '', listeners: [], blocked: false };
  const later = (ms, fn) => { const t = setTimeout(fn, ms); C.timers.push(t); return t; };
  const every = (ms, fn) => { const t = setInterval(fn, ms); C.ivs.push(t); return t; };
  function clearAll() {
    C.timers.forEach(clearTimeout); C.ivs.forEach(clearInterval); C.timers = []; C.ivs = [];
    C.tok++; if (synth) synth.cancel(); setSpeaking(false); mouth(0);
    const v = C.el && $('#dxVideo', C.el); if (v && !v.hidden) { v.pause(); v.hidden = true; }
  }
  function notify() { for (const fn of C.listeners) { try { fn(); } catch { /* segue */ } } }
  function setSpeaking(on) { if (C.speaking === on) return; C.speaking = on; if (C.el) C.el.classList.toggle('talking', on); notify(); }
  const docEl = () => C.el && $('#dxDoc', C.el);
  function mouth(k) { const d = docEl(); if (d) d.dataset.mouth = String(k); }
  function pose(p) { const d = docEl(); if (d) d.dataset.pose = p; }
  function flash(strong) { const f = C.el && $('#dxFlash', C.el); if (!f) return; f.classList.remove('on', 'strong'); void f.offsetWidth; f.classList.add('on'); if (strong) f.classList.add('strong'); }
  function fire() { if (!C.el) return; C.el.classList.remove('fire'); void C.el.offsetWidth; C.el.classList.add('fire'); }

  // texto da fala com as palavras em <span> (a palavra falada acende, como num teleprompter)
  function karaoke(text) {
    const out = []; let pos = 0;
    for (const w of String(text).split(/(\s+)/)) { if (/^\s+$/.test(w) || !w) { out.push(w); pos += w.length; continue; } out.push(`<span data-at="${pos}">${esc(w)}</span>`); pos += w.length; }
    return out.join('');
  }
  function lightUpTo(box, at) { if (!box) return; for (const s of box.querySelectorAll('span[data-at]')) s.classList.toggle('on', +s.dataset.at <= at); }

  // Fala o texto em pedaços (frase a frase: o Chrome corta falas longas) e acende as palavras.
  // Sem voz (desligada no painel, navegador sem português ou sem o clique que libera o som), o texto
  // avança no ritmo de leitura. Chama done() no fim.
  function speak(text, box, done) {
    const tok = C.tok, set = (C.st && C.st.settings) || {}, rate = Number(set.docRate) || 1;
    const words = String(text).split(/\s+/).filter(Boolean).length;
    const voice = set.docVoice !== false && canTalk() ? pickVoice(set.docVoiceName) : null;
    C.voice = voice ? voice.name : ''; notify();
    setSpeaking(true); pose('talk');
    // boca mexendo enquanto fala (com voz ou sem)
    let mk = 0; every(115, () => { if (!C.speaking) return mouth(0); mk = (mk + 1 + Math.floor(Math.random() * 2)) % 3; mouth(mk === 0 && Math.random() < .5 ? 1 : mk); });
    // gestos de vez em quando
    every(2600, () => { if (C.speaking) pose(['talk', 'point', 'talk', 'wave'][Math.floor(Math.random() * 4)]); });
    const finish = () => { if (tok !== C.tok) return; setSpeaking(false); mouth(0); pose('idle'); lightUpTo(box, Infinity); done && done(); };
    if (!voice) { // ritmo de leitura: ~2,6 palavras por segundo
      const total = Math.max(3500, words / (2.6 * rate) * 1000), t0 = performance.now(), len = String(text).length;
      const iv = every(120, () => { const k = (performance.now() - t0) / total; lightUpTo(box, k * len); if (k >= 1 && tok === C.tok) { clearInterval(iv); finish(); } });
      return;
    }
    const chunks = []; const re = /[^.!?…]+[.!?…]*\s*/g; let m;
    while ((m = re.exec(text))) if (m[0].trim()) chunks.push({ text: m[0], at: m.index });
    let i = 0;
    const next = () => {
      if (tok !== C.tok) return;
      if (i >= chunks.length) return finish();
      const ch = chunks[i++], u = new SpeechSynthesisUtterance(ch.text.trim());
      u.voice = voice; u.lang = voice.lang; u.rate = rate; u.pitch = .92; u.volume = 1;
      let ended = false, heard = false;
      const end = () => { if (ended) return; ended = true; clearTimeout(guard); lightUpTo(box, ch.at + ch.text.length); later(140, next); };
      u.onboundary = e => { heard = true; if (tok === C.tok) lightUpTo(box, ch.at + (e.charIndex || 0)); };
      u.onstart = () => { // sem eventos de palavra (algumas vozes não mandam): acende no ritmo estimado
        const t0 = performance.now(), est = Math.max(900, ch.text.split(/\s+/).length / (2.6 * rate) * 1000);
        const iv = every(150, () => { if (ended) return clearInterval(iv); if (!heard) lightUpTo(box, ch.at + Math.min(1, (performance.now() - t0) / est) * ch.text.length); });
      };
      u.onend = end;
      u.onerror = e => { if (e.error === 'not-allowed') { C.blocked = true; showVoiceChip(); } end(); };
      const guard = later(Math.max(6000, ch.text.split(/\s+/).length / (1.1 * rate) * 1000 + 4000), end); // o onend às vezes não chega
      synth.speak(u);
    };
    if (synth.speaking || synth.pending) synth.cancel();
    later(60, next);
  }
  function showVoiceChip() { const b = C.el && $('#dxVoice', C.el); if (b) b.hidden = false; }

  /* ---------- nuvem e carro ---------- */
  function feedCloud(list, max = 14) {
    if (!C.cloud || !list) return;
    for (const [w, c] of list) { if (C.words.has(w)) continue; C.words.add(w); for (let k = 0; k < Math.min(max, c); k++) C.cloud.add(w); }
  }

  /* ---------- partes ---------- */
  function panel(htmlStr, cls = '') { const p = $('#dxPanel', C.el); p.className = 'dx-panel ' + cls; p.innerHTML = htmlStr; void p.offsetWidth; p.classList.add('in'); return p; }
  function next() {
    const list = partsOf(C.m);
    if (C.part < list.length - 1) play(C.part + 1);
  }
  function play(idx) {
    clearAll();
    const list = partsOf(C.m); if (!list.length) return;
    C.part = Math.max(0, Math.min(list.length - 1, idx)); C.done = false;
    const id = list[C.part], m = C.m, el = C.el;
    el.dataset.part = ['chegada', 'abertura', 'jornal', 'final'].includes(id) ? id : 'bloco';
    if (id !== 'chegada') el.classList.add('arrived'); // telão recarregado no meio da cena: o Doc já está lá
    $('#dxPaper', el).hidden = id !== 'jornal'; $('#dxFinal', el).hidden = id !== 'final';
    if (C.cloud) C.cloud.dim = id !== 'final';
    notify();
    if (id === 'chegada') return arrival();
    if (id === 'abertura') {
      pose('wave');
      const p = panel(`<div class="dx-title">${esc(m.titulo)}</div><div class="dx-say" id="dxSay">${karaoke(m.abertura)}</div>`, 'open');
      return later(700, () => speak(m.abertura, $('#dxSay', p), () => later(1300, next)));
    }
    if (id === 'jornal') return newspaper();
    if (id === 'final') return finale();
    // uma dinâmica: número, título, as palavras mais citadas e a fala do Doc
    const b = (m.blocos || []).find(x => x.id === id); if (!b) return later(10, next);
    const a = ACT[id] || ACT.d1;
    const p = panel(`<div class="dx-act" style="--c:${a.c}"><b>${a.n}</b><span>${esc(b.titulo)}</span></div>
      <div class="dx-chips">${(b.palavras || []).map((w, i) => `<span style="--c:${a.c};--i:${i}">${esc(w)}</span>`).join('')}</div>
      <div class="dx-say" id="dxSay">${karaoke(b.fala)}</div>`, 'act');
    feedCloud((b.palavras || []).map(w => [w, 4]));
    sfx('blip');
    later(900, () => speak(b.fala, $('#dxSay', p), () => later(1200, next)));
  }

  // Chegada: os circuitos de tempo marcam 2027, três raios, o carro aparece em chamas e o Doc salta dele.
  // Com um vídeo configurado no painel (ex.: a chegada feita com IA), o vídeo toca no lugar.
  function arrival() {
    const el = C.el, set = (C.st && C.st.settings) || {};
    el.classList.remove('arrived'); pose('idle');
    const video = $('#dxVideo', el);
    if (set.docVideoUrl && video) {
      video.hidden = false; video.src = set.docVideoUrl; video.currentTime = 0; video.volume = 1;
      const go = () => { video.onended = video.onerror = null; video.pause(); video.hidden = true; el.classList.add('arrived'); flash(true); later(1200, next); };
      video.onended = go; video.onerror = () => { video.hidden = true; video.onended = video.onerror = null; arrivalShow(); };
      video.play().catch(() => { video.muted = true; video.play().catch(() => { video.hidden = true; arrivalShow(); }); });
      return;
    }
    arrivalShow();
  }
  function arrivalShow() {
    const el = C.el, dest = $('#dxDest', el), target = 'JAN 01 2027 10:21';
    panel(''); dest.textContent = '';
    [...target].forEach((ch, i) => later(150 + i * 95, () => { dest.textContent = target.slice(0, i + 1); if (ch !== ' ') sfx('key', i); }));
    const t = 150 + target.length * 95 + 300;
    // o carro carrega até 1,21 gigawatts
    const gw = $('#dxGw', el), bar = $('#dxBar', el); let e = .1;
    const show = () => { if (C.car) C.car.setEnergy(e); if (bar) bar.style.width = (e * 100).toFixed(0) + '%'; if (gw) gw.textContent = e >= 1 ? '⚡ 1.21 GIGAWATTS' : `${(e * 1.21).toFixed(2)} / 1.21 GIGAWATTS`; };
    show();
    later(t, () => { sfx('hum', 1.7); const iv = every(80, () => { e = Math.min(1, e + .04); show(); if (e >= 1) clearInterval(iv); }); });
    [0, 260, 560].forEach(d => later(t + 1700 + d, () => { flash(d === 560); sfx('thunder'); if (C.car) { if (d === 560) C.car.charge(1); else C.car.spark(); } }));
    later(t + 2300, () => { fire(); el.classList.add('arrived'); sfx('reveal'); });
    later(t + 3300, () => { pose('wave'); panel(`<div class="dx-kick">ACABOU DE CHEGAR DE 2027</div><div class="dx-title big">${esc(C.m.titulo)}</div>`, 'title'); });
    later(t + 6200, next);
  }
  function newspaper() {
    const el = C.el, m = C.m, paper = $('#dxPaper', el), heads = m.manchetes || [];
    panel('');
    paper.innerHTML = `<div class="np-top"><span>EDIÇÃO ESPECIAL · VIAGEM NO TEMPO</span><span>PREÇO: 1,21 GIGAWATTS</span></div>
      <h2 class="np-name">GAZETA DO FUTURO</h2>
      <div class="np-date"><span>HILL VALLEY</span><span>SEXTA-FEIRA, 1º DE JANEIRO DE 2027</span><span>ANO 42 · Nº 2027</span></div>
      <div class="np-main">${esc(heads[0] || '')}</div>
      <div class="np-cols"><div class="np-photo"><svg viewBox="0 0 200 120" aria-hidden="true"><path d="M10 92 L40 70 L120 62 L170 74 L190 92 Z" fill="#2b2b2b"/><circle cx="55" cy="96" r="13" fill="#111"/><circle cx="150" cy="96" r="13" fill="#111"/>
          <path d="M60 64 L80 46 L130 46 L150 64" fill="#555"/><path d="M0 104 H200" stroke="#111" stroke-width="3"/><path d="M180 30 l-8 18 h8 l-6 16" stroke="#111" stroke-width="3" fill="none"/></svg><small>A MÁQUINA DO TEMPO CHEGA AO FUTURO · FOTO: ARQUIVO 2027</small></div>
        <ul class="np-list">${heads.slice(1).map(h => `<li>${esc(h)}</li>`).join('')}</ul></div>`;
    paper.classList.remove('in'); void paper.offsetWidth; paper.classList.add('in');
    sfx('roll', 1.6);
    pose('point');
    const text = `Vejam só o jornal de 2027! ${heads.map(h => h.replace(/[.!?]*$/, '.')).join(' ')}`;
    later(2000, () => speak(text, null, () => later(1600, next)));
  }
  function finale() {
    const el = C.el, m = C.m, fin = $('#dxFinal', el);
    feedCloud(m.palavras || [], 10);
    const p = panel(`<div class="dx-say" id="dxSay">${karaoke(m.encerramento)}</div>`, 'end');
    fin.innerHTML = `<div class="fx-year"><span class="bttf">2027</span></div><div class="fx-sub">O FUTURO É O QUE VOCÊS FIZEREM DELE</div><div class="fx-end">CONTINUA…</div>`;
    fin.classList.remove('in');
    later(600, () => speak(m.encerramento, $('#dxSay', p), () => {
      pose('point'); flash(true); fire(); sfx('thunder'); later(300, () => sfx('reveal'));
      el.dataset.part = 'fim'; void fin.offsetWidth; fin.classList.add('in');
      if (C.cloud) C.cloud.dim = false;
      C.done = true; notify();
    }));
  }

  /* ---------- ciclo de vida ---------- */
  function mount(el, st) {
    unmount();
    C.el = $('#docx', el) || el; C.st = st; C.m = st.doc && st.doc.message; C.seq = null; C.part = -1; C.words = new Set();
    const cv = $('#dxCar', C.el), cl = $('#dxCloud', C.el);
    C.car = cv && window.Delorean3D ? Delorean3D.car(cv, { dprMax: 1.25 }) : null;
    if (C.car) C.car.setEnergy(.15);
    C.cloud = cl && window.NuvemDePalavras ? new NuvemDePalavras(cl, { scale: 1.1, wide: true }) : null;
    if (C.cloud) C.cloud.dim = true;
    // sem mensagem pública ainda: a nuvem mostra as palavras quando a cena começar
    const vb = $('#dxVoice', C.el); if (vb) vb.onclick = () => { vb.hidden = true; C.blocked = false; if (C.part >= 0) play(C.part); };
    C.clock = setInterval(() => { const n = C.el && $('#dxNow', C.el); if (n) n.textContent = ledDate(new Date()); }, 1000); // relógio (fora das partes)
    update(st);
  }
  function update(st) {
    if (!C.el) return;
    C.st = st; const d = st.doc || {};
    if (d.message) C.m = d.message;
    const p = d.play;
    // a voz precisa de um clique na página (regra dos navegadores): avisa antes da cena
    const vb = $('#dxVoice', C.el); if (vb && st.settings && st.settings.docVoice !== false && synth && !canTalk()) vb.hidden = false;
    if (!p || !C.m) { if (C.part !== -1) { stopScene(); } C.seq = null; return; }
    const pz = $('#dxPause', C.el); if (pz) pz.hidden = !p.paused;
    if (p.seq === C.seq && p.paused === C.paused) return;
    const fresh = p.seq !== C.seq; C.seq = p.seq; C.paused = !!p.paused;
    if (p.paused) { clearAll(); C.part = p.part; notify(); return; }
    if (fresh || C.part !== p.part) {
      if (C.cloud && C.part === -1) feedCloud((C.m.palavras || []).slice(0, 25), 3); // nuvem de fundo com as palavras mais citadas
      play(p.part);
    }
  }
  function stopScene() { clearAll(); C.part = -1; C.done = false; if (C.el) { C.el.dataset.part = 'espera'; C.el.classList.remove('arrived', 'fire'); panel(''); $('#dxPaper', C.el).hidden = true; $('#dxFinal', C.el).hidden = true; } notify(); }
  function unmount() {
    if (!C.el) return;
    clearAll(); clearInterval(C.clock); C.clock = null;
    C.el = null; C.car = null; C.cloud = null; C.part = -1; C.seq = null; notify();
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
