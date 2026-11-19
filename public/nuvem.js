/* ===== Nuvem de palavras 3D ("ciberespaço") =====
 * Extraída do painel "De Volta para o Sucesso" (sucesso/public/painel.html, feito pelo Lucas) para o
 * telão do townhall mostrar a mesma nuvem: respostas curtas entram inteiras, as longas são quebradas
 * em palavras (sem artigos e preposições); quanto mais repetida, maior. Desenha até 100 termos, a
 * até 30 quadros/s, para em abas ocultas e respeita a preferência de movimento reduzido.
 *
 *   const nuvem = new NuvemDePalavras(canvas); nuvem.add('texto da resposta'); nuvem.reset(); nuvem.dim = true
 */
(function () {
  'use strict';
  const STOP = new Set('o a os as de da do das dos que para por com em no na nos nas um uma uns umas e é ser foi meu minha nosso nossa mais se ao à como eu me mas ou já ter tem'.split(' '));
  const COLS = ['#22d3ee', '#ff2e88', '#ffd23f', '#ff6b1a', '#a78bfa', '#7df9ff'];
  const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  function Nuvem(canvas, opts) {
    this.cv = canvas; this.o = opts || {};
    this.words = []; this.byKey = new Map(); this.ranked = []; this.rankDirty = true; this.dirty = true; this.rot = 0; this.dim = false;
    this.parts = Array.from({ length: 140 }, () => ({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random() * 2 - 1 }));
    this.at = performance.now();
    const loop = now => { if (!this.cv.isConnected && this.started) return; this.started = this.started || this.cv.isConnected; requestAnimationFrame(loop); this.frame(now); };
    requestAnimationFrame(loop);
  }
  Nuvem.prototype.reset = function () { this.words = []; this.byKey.clear(); this.ranked = []; this.rankDirty = true; this.dirty = true; };
  Nuvem.prototype.add = function (txt) {
    txt = String(txt || '').trim(); if (!txt) return;
    const phrase = txt.length <= 28;
    const tokens = phrase ? [txt] : txt.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
    for (const t of tokens) {
      const key = t.toLowerCase(); let w = this.byKey.get(key);
      if (w) { w.c++; w.pulse = 1; }
      else {
        const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
        w = { key, t, c: 1, x: r * Math.cos(th), y: u, z: r * Math.sin(th), col: COLS[this.words.length % COLS.length], pulse: 1, born: 0 };
        this.words.push(w); this.byKey.set(key, w);
      }
    }
    this.rankDirty = true; this.dirty = true;
  };
  Nuvem.prototype.size = function () {
    const r = this.cv.getBoundingClientRect(); if (!r.width || !r.height) return false;
    const dp = Math.min(devicePixelRatio || 1, 1.5), w = Math.round(r.width * dp), h = Math.round(r.height * dp);
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; this.dirty = true; }
    this.dpr = dp; return true;
  };
  Nuvem.prototype.frame = function (now) {
    if (document.hidden) { this.at = now; return; }
    if (now - this.at < 1000 / 30) return;
    const dt = Math.min(.1, (now - this.at) / 1000); this.at = now;
    if (!this.size()) return;
    const still = motion.matches; if (still && !this.dirty) return;
    const cv = this.cv, c = cv.getContext('2d'), W = cv.width, H = cv.height, dp = this.dpr || 1;
    if (this.rankDirty) { this.ranked = this.words.slice().sort((a, b) => b.c - a.c).slice(0, 100); this.rankDirty = false; }
    this.dirty = false;
    c.clearRect(0, 0, W, H);
    if (!still) this.rot += .24 * dt;
    const R = Math.min(W, H) * .32, cx = W / 2, cy = H * .44, f = Math.min(W, H) * .9, cs = Math.cos(this.rot), sn = Math.sin(this.rot);
    const ax = 1.25 * (this.o.wide ? Math.max(1, Math.min(2.2, W / H * .8)) : 1); // caixas largas: a nuvem se espalha na horizontal
    const proj = p => { const x = p.x * cs - p.z * sn, z = p.x * sn + p.z * cs, y = p.y * .8, s = f / (f + z * R * 1.2); return { x: cx + x * R * ax * s, y: cy + y * R * 1.15 * s, s, z }; };
    const pp = this.parts.map(proj); c.fillStyle = '#7df9ff';
    pp.forEach(p => { c.globalAlpha = .25 + .5 * (1 - p.z) / 2; c.fillRect(p.x, p.y, 1.6 * dp * p.s, 1.6 * dp * p.s); });
    c.globalAlpha = 1; c.lineWidth = dp; c.strokeStyle = 'rgba(34,211,238,.12)';
    for (let i = 0; i < pp.length; i += 3) for (let j = i + 1; j < pp.length; j += 7) { const dx = pp[i].x - pp[j].x, dy = pp[i].y - pp[j].y; if (dx * dx + dy * dy < (60 * dp) ** 2) { c.beginPath(); c.moveTo(pp[i].x, pp[i].y); c.lineTo(pp[j].x, pp[j].y); c.stroke(); } }
    const mx = Math.max(1, this.ranked[0] ? this.ranked[0].c : 1);
    this.ranked.map(w => ({ w, p: proj(w) })).sort((a, b) => b.p.z - a.p.z).forEach(({ w, p }) => {
      w.born = still ? 1 : Math.min(1, w.born + 3 * dt); w.pulse = still ? 0 : Math.max(0, w.pulse - 1.2 * dt);
      const size = (11 + 15 * (w.c / mx) + w.pulse * 8) * dp * p.s * Math.min(1.4, Math.max(.75, W / (1000 * dp))) * (w.t.length > 16 ? .8 : 1) * (this.o.scale || 1);
      c.font = `800 ${size}px Inter,"Segoe UI",Arial`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.globalAlpha = w.born * (.45 + .55 * (1 - p.z) / 2) * (this.dim ? .35 : 1); c.shadowColor = w.col; c.shadowBlur = 18 * dp; c.fillStyle = w.col; c.fillText(w.t, p.x, p.y); c.shadowBlur = 0;
    });
    c.globalAlpha = 1;
    if (!this.words.length) { c.fillStyle = '#a9a3d9'; c.font = `700 ${18 * dp}px "Share Tech Mono",Consolas,monospace`; c.textAlign = 'center'; c.fillText('AGUARDANDO TRANSMISSÕES DO CIBERESPAÇO...', W / 2, H * .44); }
    if (!still && this.words.some(w => w.pulse > 0 || w.born < 1)) this.dirty = true;
  };
  window.NuvemDePalavras = Nuvem;
})();
