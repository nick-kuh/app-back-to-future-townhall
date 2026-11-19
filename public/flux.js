/* ===== Flux Capacitor 3D (sem bibliotecas) =====
 * Motor do protótipo "Ato 1 · O Combustível do Futuro" (bloco Reflexão), separado para o telão usar:
 * a caixa com os três braços, o núcleo que pulsa, raios, anéis de choque, esferas de voto e partículas.
 * Quanto mais energia (0 a 1), mais rápido e mais brilhante.
 *
 *   const fx = FluxCapacitor(canvas); fx.setColor('#22d3ee'); fx.setEnergy(.4); fx.charge(); fx.burst(); fx.destroy();
 */
(function () {
  'use strict';
  const V = (x, y, z) => ({ x, y, z }), sub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z), add = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z), mul = (a, s) => V(a.x * s, a.y * s, a.z * s);
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z, cross = (a, b) => V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x), nrm = a => { const l = Math.hypot(a.x, a.y, a.z) || 1; return mul(a, 1 / l); };
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const rgba = (c, a) => `rgba(${Math.min(255, c[0]) | 0},${Math.min(255, c[1]) | 0},${Math.min(255, c[2]) | 0},${a})`;
  const CY = hex('#22d3ee'), MG = hex('#ff2e88'), YL = hex('#ffd23f'), OR = hex('#ff6b1a'), WH = [255, 255, 255], R = Math.random;
  function Cam(fov) { this.fov = fov; }
  Cam.prototype.set = function (pos, t) { this.pos = pos; this.fwd = nrm(sub(t, pos)); this.right = nrm(cross(this.fwd, V(0, 1, 0))); this.up = cross(this.right, this.fwd); };
  Cam.prototype.view = function (W, H) { this.W = W; this.H = H; this.f = H / (2 * Math.tan(this.fov * Math.PI / 360)); };
  Cam.prototype.p = function (p) { const d = sub(p, this.pos), z = dot(d, this.fwd); if (z < .1) return null; return { x: this.W / 2 + dot(d, this.right) * this.f / z, y: this.H / 2 - dot(d, this.up) * this.f / z, z }; };
  function fit(cv, max) {
    const d = Math.min(window.devicePixelRatio || 1, max), w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return null;
    if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
    const c = cv.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0); return { c, w, h };
  }
  const still = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  window.FluxCapacitor = function (canvas) {
    const FX = { cam: new Cam(45), t: 0, e: 0, flash: 0, col: CY, bolts: [], parts: [], rings: [], orbs: [], dead: false,
      ARMS: [V(-1.15, 1.0, 0), V(1.15, 1.0, 0), V(0, -1.25, 0)], C: V(0, .12, 0),
      setColor(h) { this.col = hex(h); },
      setEnergy(e) { this.e = Math.max(0, Math.min(1, e || 0)); },
      T(p) { const a = this.ry, b = this.rx; const x = p.x * Math.cos(a) + p.z * Math.sin(a), z = -p.x * Math.sin(a) + p.z * Math.cos(a); const y = p.y * Math.cos(b) - z * Math.sin(b), z2 = p.y * Math.sin(b) + z * Math.cos(b); return V(x, y, z2); },
      // um voto chegou: clarão, anel de choque, raios e uma esfera voando até o núcleo
      charge(quiet) {
        this.flash = 1; this.rings.push({ t: 0 });
        if (!quiet) { const a = R() * Math.PI * 2; this.orbs.push({ p: V(Math.cos(a) * 6, Math.sin(a) * 3 + 1, -1 + R() * 2), t: 0 }); }
        for (let i = 0; i < 2 + Math.round(this.e * 5); i++) this.bolt();
        for (let i = 0; i < 12 + this.e * 22; i++) { const d = nrm(V(R() - .5, R() - .5, R() - .5)); this.parts.push({ p: this.C, v: mul(d, 1.5 + R() * 4), l: .5 + R() * .7, m: 1.2, c: [CY, YL, WH, this.col][R() * 4 | 0] }); }
      },
      // votação encerrada ou projeto sorteado: explosão
      burst() {
        this.flash = 1.2; this.rings.push({ t: 0 }, { t: -.12 }, { t: -.24 });
        for (let i = 0; i < 8; i++) this.bolt();
        for (let i = 0; i < 90; i++) { const d = nrm(V(R() - .5, R() - .5, R() - .5)); this.parts.push({ p: this.C, v: mul(d, 2 + R() * 6), l: .7 + R() * .9, m: 1.6, c: [CY, YL, WH, MG, OR][R() * 5 | 0] }); }
      },
      bolt() {
        const tg = this.ARMS[R() * 3 | 0], a = R() * Math.PI * 2, src = V(Math.cos(a) * (2.6 + R()), Math.sin(a) * (2 + R()), (R() - .5) * 1.5), pts = [];
        for (let j = 0; j <= 8; j++) { const t = j / 8, p = add(src, mul(sub(tg, src), t)); pts.push(j && j < 8 ? add(p, V((R() - .5) * .35, (R() - .5) * .35, (R() - .5) * .35)) : p); }
        this.bolts.push({ pts, l: .35, m: .35 });
      },
      destroy() { this.dead = true; },
      frame(dt) {
        const F = fit(canvas, 1.25); if (!F) return; const { c, w, h } = F, cam = this.cam; this.t += dt; const t = this.t, e = this.e, col = this.col;
        if (this.bolts.length > 26) this.bolts.splice(0, this.bolts.length - 26); if (this.parts.length > 300) this.parts.splice(0, this.parts.length - 300);
        this.ry = Math.sin(t * .5) * .55; this.rx = -.12 + Math.sin(t * .37) * .12; this.flash *= .9;
        cam.set(V(0, .2, 7.2), V(0, .1, 0)); cam.view(w, h); c.clearRect(0, 0, w, h);
        const P = p => cam.p(this.T(p)), L = (a, b) => { const A = P(a), B = P(b); if (A && B) { c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); } };
        // halo
        const cp = P(this.C); if (cp) { const rr = Math.min(w, h) * (.22 + .18 * e + .1 * this.flash); const g = c.createRadialGradient(cp.x, cp.y, 0, cp.x, cp.y, rr); g.addColorStop(0, rgba(col, .1 + .18 * e)); g.addColorStop(1, rgba(col, 0)); c.fillStyle = g; c.fillRect(0, 0, w, h); }
        // caixa (painel traseiro + moldura 3D)
        const bx = 2.1, by = 2.1, bz = .55, back = [V(-bx, -by, -bz), V(bx, -by, -bz), V(bx, by, -bz), V(-bx, by, -bz)], front = back.map(p => V(p.x, p.y, bz));
        const bp = back.map(P); if (bp.every(Boolean)) { c.beginPath(); bp.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath(); const g = c.createLinearGradient(bp[0].x, bp[2].y, bp[1].x, bp[0].y); g.addColorStop(0, '#1a1733'); g.addColorStop(1, '#0c0a1c'); c.fillStyle = g; c.fill(); }
        // grade interna
        c.strokeStyle = 'rgba(169,163,217,.12)'; c.lineWidth = 1; c.beginPath(); for (let k = -3; k <= 3; k++) { L(V(k * .6, -by, -bz), V(k * .6, by, -bz)); L(V(-bx, k * .6, -bz), V(bx, k * .6, -bz)); } c.stroke();
        // braços (tubos 3D: sombra + tubo + núcleo brilhante)
        this.ARMS.forEach((A, i) => {
          const a = P(A), m = P(this.C); if (!a || !m) return; const thick = cam.f / a.z;
          c.lineCap = 'round'; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(m.x, m.y); c.strokeStyle = '#05040c'; c.lineWidth = .42 * thick; c.stroke();
          c.strokeStyle = '#5b6274'; c.lineWidth = .32 * thick; c.stroke(); c.strokeStyle = '#9aa3b2'; c.lineWidth = .12 * thick; c.stroke();
          c.strokeStyle = rgba(col, .35 + .6 * e + .4 * this.flash); c.lineWidth = .07 * thick; c.shadowColor = rgba(col, 1); c.shadowBlur = 10 + 28 * e; c.stroke(); c.shadowBlur = 0;
          // anéis ao longo do tubo
          for (let k = 1; k <= 4; k++) { const q = add(A, mul(sub(this.C, A), k / 5)), qp = P(q); if (qp) { c.fillStyle = '#2b2f3a'; c.beginPath(); c.arc(qp.x, qp.y, .2 * thick, 0, 7); c.fill(); c.strokeStyle = rgba(col, .4 + .5 * e); c.lineWidth = 1.5; c.stroke(); } }
          // pulsos de energia viajando até o centro
          const sp = .5 + e * 2.2, np = 1 + Math.round(e * 3); for (let k = 0; k < np; k++) { const u = ((t * sp + k / np + i * .17) % 1), q = add(A, mul(sub(this.C, A), u)), qp = P(q); if (qp) { const r = (.08 + .08 * e) * thick; const g = c.createRadialGradient(qp.x, qp.y, 0, qp.x, qp.y, r * 2.2); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(.4, rgba(col, .8)); g.addColorStop(1, rgba(col, 0)); c.fillStyle = g; c.beginPath(); c.arc(qp.x, qp.y, r * 2.2, 0, 7); c.fill(); } }
          // terminais
          c.fillStyle = '#1f2230'; c.beginPath(); c.arc(a.x, a.y, .3 * thick, 0, 7); c.fill(); c.strokeStyle = rgba(YL, .8); c.lineWidth = 2; c.stroke();
        });
        // núcleo
        if (cp) { const thick = cam.f / cp.z, r = (.28 + .12 * Math.sin(t * 6) * e + .15 * this.flash) * thick; const g = c.createRadialGradient(cp.x, cp.y, 0, cp.x, cp.y, r * 2.4); g.addColorStop(0, '#fff'); g.addColorStop(.3, rgba(col, .95)); g.addColorStop(1, rgba(col, 0)); c.fillStyle = g; c.beginPath(); c.arc(cp.x, cp.y, r * 2.4, 0, 7); c.fill(); }
        // moldura frontal (vidro)
        const fp = front.map(P); if (fp.every(Boolean)) {
          c.beginPath(); fp.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath(); c.fillStyle = 'rgba(120,220,255,.04)'; c.fill();
          c.strokeStyle = '#c7ced9'; c.lineWidth = 5; c.stroke(); c.strokeStyle = rgba(col, .5 + .4 * e); c.lineWidth = 1.5; c.stroke();
          c.beginPath(); for (let i = 0; i < 4; i++) L(back[i], front[i]); c.strokeStyle = '#7d8597'; c.lineWidth = 3; c.stroke();
          c.beginPath(); c.moveTo(fp[3].x + 10, fp[3].y + 10); c.lineTo(fp[3].x + 60, fp[3].y + 10); c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 3; c.stroke();
        }
        // anéis de choque
        c.save(); c.globalCompositeOperation = 'lighter'; this.rings = this.rings.filter(r => {
          r.t += dt; if (r.t < 0) return true; const k = r.t / .8; if (k >= 1) return false; const rad = .3 + k * 3.2; c.beginPath();
          for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2, p = P(add(this.C, V(Math.cos(a) * rad, Math.sin(a) * rad, 0))); if (p) { if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); } }
          c.strokeStyle = rgba(col, 1 - k); c.lineWidth = 3 * (1 - k) + 1; c.shadowColor = rgba(col, 1); c.shadowBlur = 16; c.stroke(); return true;
        });
        // esferas de voto voando até o núcleo
        this.orbs = this.orbs.filter(o => {
          o.t += dt * 1.6; if (o.t >= 1) { this.flash = Math.max(this.flash, .8); return false; } const k = o.t * o.t, p = P(add(o.p, mul(sub(this.C, o.p), k)));
          if (p) { const r = 10 * (1 - k * .5); const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2); g.addColorStop(0, '#fff'); g.addColorStop(.4, rgba(YL, .9)); g.addColorStop(1, rgba(MG, 0)); c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, r * 2, 0, 7); c.fill(); } return true;
        });
        // raios
        this.bolts = this.bolts.filter(b => { b.l -= dt; if (b.l <= 0) return false; if (R() < .3) return true; [[CY, 6, .5], [[210, 250, 255], 2, 1]].forEach(([cc, lw, a]) => { c.beginPath(); for (let i = 0; i < b.pts.length - 1; i++) L(b.pts[i], b.pts[i + 1]); c.strokeStyle = rgba(cc, a * (b.l / b.m + .3)); c.lineWidth = lw; c.shadowColor = '#22d3ee'; c.shadowBlur = 18; c.stroke(); }); return true; });
        // partículas
        this.parts = this.parts.filter(q => { q.l -= dt; if (q.l <= 0) return false; q.p = add(q.p, mul(q.v, dt)); q.v = mul(q.v, .97); const p = P(q.p); if (p) { const s = Math.max(1.5, .05 * cam.f / p.z); c.fillStyle = rgba(q.c, Math.min(1, q.l / q.m * 1.5)); c.fillRect(p.x - s / 2, p.y - s / 2, s, s); } return true; });
        c.restore();
        // faíscas ambientes proporcionais à energia
        if (e > 0 && R() < e * .05) this.bolt();
      },
    };
    let last = performance.now(), started = false;
    const loop = now => {
      if (FX.dead || (started && !canvas.isConnected)) return; // a cena saiu da tela: o motor para
      started = started || canvas.isConnected;
      requestAnimationFrame(loop);
      const raw = (now - last) / 1000, dt = Math.min(.05, raw);
      if (document.hidden) { last = now; return; }
      if (still.matches && FX.t > 0 && raw < 1) return; // movimento reduzido: 1 quadro por segundo
      last = now;
      try { FX.frame(dt); } catch (err) { console.error(err); }
    };
    requestAnimationFrame(loop);
    return FX;
  };
})();
