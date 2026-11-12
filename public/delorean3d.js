/* ===== DeLorean 3D · motor compartilhado =====
 * Extraído do painel "De Volta para o Sucesso" (sucesso/public/painel.html, "MOTOR 3D",
 * feito pelo Lucas) para o townhall usar o mesmo céu synthwave, a mesma estrada e o mesmo
 * carro que se energiza. Canvas 2D puro, sem bibliotecas externas; até 30 quadros/s,
 * para em abas ocultas e respeita a preferência de movimento reduzido.
 *
 *   Delorean3D.background(canvas)            → céu + sol + montanhas + estrada em movimento
 *   Delorean3D.car(canvas, {camPos, camLook}) → cena do carro: .charge(e) .spark() .doWarp() .reset(e) .setEnergy(e)
 *
 * O carro em si é o modelo WebGL de delorean-model.js (Three.js), desenhado numa camada por cima do
 * cenário com a mesma câmera. Se o WebGL não estiver disponível, cai no desenho simples em polígonos.
 */
(function () {
  'use strict';
  const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener() {} };
  let reducedMotion = motion.matches;
  const V = (x, y, z) => ({ x, y, z });
  const sub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z), add = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z), mul = (a, s) => V(a.x * s, a.y * s, a.z * s);
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z, cross = (a, b) => V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  const nrm = a => { const l = Math.hypot(a.x, a.y, a.z) || 1; return mul(a, 1 / l); };
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const rgba = (c, a) => `rgba(${Math.min(255, c[0]) | 0},${Math.min(255, c[1]) | 0},${Math.min(255, c[2]) | 0},${a})`;
  const CY = hex('#22d3ee'), MG = hex('#ff2e88'), YL = hex('#ffd23f'), OR = hex('#ff6b1a'), WH = [255, 255, 255];
  const R = Math.random;

  function Cam(pos, look, fov) { this.fov = fov || 55; this.set(pos, look); }
  Cam.prototype.set = function (pos, t) { this.pos = pos; this.fwd = nrm(sub(t, pos)); this.right = nrm(cross(this.fwd, V(0, 1, 0))); this.up = cross(this.right, this.fwd); };
  Cam.prototype.view = function (W, H) { this.W = W; this.H = H; this.f = H / (2 * Math.tan(this.fov * Math.PI / 360)); };
  Cam.prototype.cz = function (p) { return dot(sub(p, this.pos), this.fwd); };
  Cam.prototype.p = function (p) { const d = sub(p, this.pos), z = dot(d, this.fwd); if (z < 0.1) return null; return { x: this.W / 2 + dot(d, this.right) * this.f / z, y: this.H / 2 - dot(d, this.up) * this.f / z, z }; };
  Cam.prototype.seg = function (c, a, b) {
    let za = this.cz(a), zb = this.cz(b); const n = .2; if (za < n && zb < n) return;
    if (za < n) a = add(a, mul(sub(b, a), (n - za) / (zb - za))); else if (zb < n) b = add(b, mul(sub(a, b), (n - zb) / (za - zb)));
    const A = this.p(a), B = this.p(b); if (A && B) { c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); }
  };

  const STARS = Array.from({ length: 140 }, () => [R(), R(), R() * 1.4 + .4]);
  function hgt(x, z) {
    const ax = Math.abs(x); if (ax < 8) return 0;
    return Math.max(0, (ax - 8) * .6 * (.62 + .38 * Math.sin(z * .29 + x * .7) * Math.cos(z * .13 + x * .21)) + (ax > 16 ? Math.sin(z * .09 + x * .5) * 1.4 : 0));
  }

  function sky(c, cam, t) {
    const W = cam.W, H = cam.H; const hp = cam.p(add(cam.pos, V(cam.fwd.x * 5000, -cam.pos.y, cam.fwd.z * 5000)));
    const hy = hp ? hp.y : H * .45;
    const g = c.createLinearGradient(0, 0, 0, hy); g.addColorStop(0, '#07061a'); g.addColorStop(.55, '#24104a'); g.addColorStop(1, '#8a2470');
    c.fillStyle = g; c.fillRect(0, 0, W, hy + 1); c.fillStyle = '#0b0a1f'; c.fillRect(0, hy, W, H - hy);
    c.fillStyle = '#fff'; STARS.forEach(s => { const y = s[1] * hy * .92; c.globalAlpha = .35 + .65 * Math.abs(Math.sin(t * s[2] + s[0] * 20)); c.fillRect(s[0] * W, y, s[2], s[2]); }); c.globalAlpha = 1;
    // sol synthwave
    const sp = cam.p(V(cam.pos.x, 7, cam.pos.z - 150)); if (sp) {
      const r = 24 * cam.f / sp.z;
      const gl = c.createRadialGradient(sp.x, sp.y, r * .5, sp.x, sp.y, r * 2.2); gl.addColorStop(0, 'rgba(255,46,136,.45)'); gl.addColorStop(1, 'rgba(255,46,136,0)'); c.fillStyle = gl; c.fillRect(sp.x - r * 2.2, sp.y - r * 2.2, r * 4.4, r * 4.4);
      c.save(); c.beginPath(); c.arc(sp.x, sp.y, r, 0, 7); c.clip(); const sg = c.createLinearGradient(0, sp.y - r, 0, sp.y + r);
      sg.addColorStop(0, '#ffe46b'); sg.addColorStop(.5, '#ff6b1a'); sg.addColorStop(1, '#ff2e88'); c.fillStyle = sg; c.fillRect(sp.x - r, sp.y - r, 2 * r, 2 * r);
      c.fillStyle = '#4a1550'; for (let i = 0; i < 7; i++) { const y = sp.y + r * (.05 + i * .14) + ((t * 8) % (r * .14)); c.fillRect(sp.x - r, y, 2 * r, r * (.02 + i * .014)); } c.restore();
    }
    return hy;
  }

  function terrain(c, cam, travel, o) {
    const st = 3, off = ((travel % st) + st) % st; const xs = []; for (let x = -o.xw; x <= o.xw; x += o.dx) xs.push(x);
    let prev = null; c.lineWidth = o.lw || 1.2;
    for (let zr = o.zFar + off; zr <= o.zNear; zr += st) {
      const pts = xs.map(x => cam.p(V(x, hgt(x, zr - travel), zr)));
      if (pts.some(p => !p)) { prev = null; continue; }
      const a = Math.max(.08, 1 - (cam.pos.z - zr) / (cam.pos.z - o.zFar));
      c.beginPath(); c.moveTo(pts[0].x, cam.H + 50); pts.forEach(p => c.lineTo(p.x, p.y)); c.lineTo(pts[pts.length - 1].x, cam.H + 50); c.closePath(); c.fillStyle = '#0d0b24'; c.fill();
      c.beginPath(); if (prev) pts.forEach((p, i) => { c.moveTo(prev[i].x, prev[i].y); c.lineTo(p.x, p.y); });
      pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.strokeStyle = rgba(MG, a * .9); c.stroke(); prev = pts;
    }
  }

  function road(c, cam, travel, zFar, zNear) {
    c.save(); c.beginPath();
    cam.seg(c, V(-2.6, .01, zFar), V(-2.6, .01, zNear)); cam.seg(c, V(2.6, .01, zFar), V(2.6, .01, zNear)); c.lineWidth = 9; c.strokeStyle = 'rgba(255,46,136,.22)'; c.stroke(); c.lineWidth = 2.5; c.strokeStyle = 'rgba(255,120,190,1)'; c.stroke();
    c.strokeStyle = '#ffd23f'; c.lineWidth = 3; c.beginPath();
    for (let z = zFar + ((travel % 5) + 5) % 5; z < zNear; z += 5) cam.seg(c, V(0, .01, z), V(0, .01, Math.min(z + 2, zNear))); c.stroke(); c.restore();
  }

  /* ---------- modelo do carro (low-poly) ---------- */
  function extrude(prof, z0, z1, fill, edge, o) {
    const n = prof.length, v = []; prof.forEach(p => v.push(V(p[0], p[1], z1))); prof.forEach(p => v.push(V(p[0], p[1], z0)));
    const f = [{ i: [...Array(n).keys()] }, { i: [...Array(n).keys()].map(i => n + i).reverse() }];
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; f.push({ i: [i, j, n + j, n + i] }); }
    let cc = V(0, 0, 0); v.forEach(p => { cc = add(cc, p); }); return Object.assign({ v, f, c: mul(cc, 1 / v.length), fill: hex(fill), edge }, o || {});
  }
  const box = (x0, x1, y0, y1, z0, z1, fill, edge, o) => extrude([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z0, z1, fill, edge, o);
  const circ = (cx, cy, r, n) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos(i / n * Math.PI * 2), cy + r * Math.sin(i / n * Math.PI * 2)]);
  function buildCar() {
    const P = [];
    P.push(extrude([[-2.15, .32], [2.1, .32], [2.22, .55], [2.06, .7], [.85, .87], [-1.9, .98], [-2.2, .82]], -.92, .92, '#b7c0cf', 'cy', { body: 1 }));
    P.push(extrude([[.85, .87], [-.1, 1.38], [-1.25, 1.4], [-1.86, .98]], -.72, .72, '#1d5f78', 'cy', { glass: 1 }));
    P.push(box(-2.05, -1.5, .98, 1.2, -.7, -.12, '#2b2f3a', 'yl')); P.push(box(-2.05, -1.5, .98, 1.2, .12, .7, '#2b2f3a', 'yl'));
    P.push(box(-2.26, -2.17, .55, .72, -.86, .86, '#ff2e88', null, { emit: 1 }));
    P.push(box(2.14, 2.24, .45, .56, -.82, -.4, '#ffd23f', null, { emit: 1 })); P.push(box(2.14, 2.24, .45, .56, .4, .82, '#ffd23f', null, { emit: 1 }));
    P.push(box(-1.6, -1.0, 1.2, 1.32, -.25, .25, '#22d3ee', null, { emit: 1, flux: 1 }));
    [[1.35, .84, 1.04], [1.35, -1.04, -.84], [-1.35, .84, 1.04], [-1.35, -1.04, -.84]].forEach(w => P.push(extrude(circ(w[0], .4, .4, 14), w[1], w[2], '#121218', 'wheel', { wheel: 1 })));
    return P;
  }

  function Scene(canvas, opts) {
    this.cv = canvas; this.c = canvas.getContext('2d'); this.o = opts || {}; this.t = 0; this.travel = 0; this.speed = 7; this.dirty = true;
    this.cam = new Cam(V(5.4, 2.6, 7.4), V(0, 1.0, -1.6), 52); this.car = buildCar(); this.e = 0; this.flash = 0; this.shake = 0;
    this.bolts = []; this.rings = []; this.parts = []; this.warp = -1; this.pos = V(0, 0, 0); this.ry = Math.PI / 2; this.wv = [];
    this.swirl = Array.from({ length: 160 }, () => ({ a: R() * 7, r: .15 + R() * .95, s: .6 + R() * 1.4, c: [CY, MG, YL, WH][R() * 4 | 0] }));
    this.dprMax = this.o.dprMax || 1.25;
  }
  Scene.prototype.size = function () {
    const dpr = Math.min(devicePixelRatio || 1, this.dprMax || 1.25), w = this.cv.clientWidth, h = this.cv.clientHeight; if (!w || !h) return false;
    this.dpr = dpr;
    if (this.cv.width !== Math.round(w * dpr) || this.cv.height !== Math.round(h * dpr)) { this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); }
    this.c.setTransform(dpr, 0, 0, dpr, 0, 0); this.cam.view(w, h); return true;
  };
  Scene.prototype.T = function (v) { const c = Math.cos(this.ry), s = Math.sin(this.ry); const X = v.x * c + v.z * s, Z = -v.x * s + v.z * c; return V(X + this.pos.x, v.y + this.pos.y, Z + this.pos.z); };
  Scene.prototype.carPos = function () { if (!this.cam.W) return null; const p = this.cam.p(add(this.pos, V(0, .9, 0))); return p ? { x: p.x, y: p.y } : null; };
  Scene.prototype.setEnergy = function (e) { this.e = Math.max(0, Math.min(1, e)); this.dirty = true; };
  Scene.prototype.charge = function (e) {
    this.e = e; this.dirty = true; if (reducedMotion) { this.flash = 0; this.shake = 0; return; } this.flash = 1; this.shake = .18; this.rings.push({ t: 0, col: CY }, { t: -.15, col: MG });
    const n = 2 + Math.round(e * 7); for (let i = 0; i < n; i++) this.bolt(2.2 + R() * 1.6, .38);
    for (let i = 0; i < 30 + e * 50; i++) { const d = nrm(V(R() - .5, R() * .9, R() - .5)); this.parts.push({ p: add(this.pos, V(0, .8, 0)), v: mul(d, 2 + R() * 5), l: .6 + R() * .7, m: 1.3, c: [CY, YL, WH, MG][R() * 4 | 0] }); }
  };
  Scene.prototype.spark = function () { if (reducedMotion) return; this.bolt(1.6 + R(), .22); if (R() < .5) this.bolt(1.6 + R(), .22); };
  Scene.prototype.bolt = function (dist, life) {
    const tg = this.wv.length ? this.wv[R() * this.wv.length | 0] : add(this.pos, V(0, .8, 0));
    const a = R() * Math.PI * 2, src = add(tg, V(Math.cos(a) * dist, .2 + R() * 2.2, Math.sin(a) * dist)); const pts = [];
    for (let j = 0; j <= 9; j++) { const t = j / 9, p = add(src, mul(sub(tg, src), t)); pts.push(j && j < 9 ? add(p, V((R() - .5) * .5, (R() - .5) * .5, (R() - .5) * .5)) : p); }
    this.bolts.push({ pts, l: life, m: life });
  };
  Scene.prototype.doWarp = function () { if (this.warp < 0) this.warp = 0; this.dirty = true; };
  Scene.prototype.reset = function (e) { this.warp = -1; this.pos = V(0, 0, 0); this.e = e || 0; this.bolts = []; this.parts = []; this.rings = []; this.speed = 7; this.scale = 1; this.dirty = true; };

  /* ----- carro realista (WebGL) por cima do cenário: delorean-model.js ----- */
  let modelPromise = null;
  const pool = []; // contexto WebGL reaproveitado quando a tela troca de cena
  Scene.prototype.initGL = function () {
    this.glState = 'loading';
    (modelPromise || (modelPromise = import('/delorean-model.js'))).then(m => {
      if (this.disposed) return;
      const slot = pool.pop() || (() => { const gl = document.createElement('canvas'); return { gl, view: m.createCarView(gl) }; })();
      const fx = document.createElement('canvas');
      slot.gl.className = fx.className = this.cv.className; slot.gl.setAttribute('aria-hidden', 'true'); fx.setAttribute('aria-hidden', 'true');
      this.cv.after(slot.gl, fx);
      this.slot = slot; this.view = slot.view; this.fxc = fx; this.fx = fx.getContext('2d'); this.glState = 'ready'; this.dirty = true;
    }).catch(err => { console.warn('Carro 3D indisponível; usando o desenho simples.', err); this.glState = 'failed'; this.dirty = true; });
  };
  Scene.prototype.dispose = function () {
    this.disposed = true;
    if (this.slot) { this.slot.gl.remove(); if (this.slot.view.lost || pool.length >= 2) this.slot.view.dispose(); else pool.push(this.slot); this.slot = this.view = null; }
    if (this.fxc) this.fxc.remove();
  };
  const ANCHORS = [[2.1, .5, .9], [2.1, .5, -.9], [-2.1, .6, .9], [-2.1, .6, -.9], [0, 1.15, .6], [0, 1.15, -.6], [-1.9, 1.2, .5], [-1.9, 1.2, -.5], [1.3, .7, 1], [1.3, .7, -1], [-1.2, .8, 1], [-1.2, .8, -1], [-1.4, 1.25, 0]];

  Scene.prototype.frame = function (dt) {
    if (!this.size()) return; this.dirty = false; if (reducedMotion) { dt = 0; this.flash = 0; this.shake = 0; this.bolts = []; this.parts = []; this.rings = []; }
    if (!this.glState && !this.o.flat) this.initGL();
    if (this.bolts.length > 24) this.bolts.splice(0, this.bolts.length - 24); if (this.parts.length > 260) this.parts.splice(0, this.parts.length - 260); if (this.rings.length > 6) this.rings.splice(0, this.rings.length - 6);
    let c = this.c; const cam = this.cam; this.t += dt; const t = this.t;
    // estado
    let carVis = true, tw = 0;
    if (this.warp >= 0) {
      this.warp += dt; tw = Math.max(0, this.warp - .9); this.speed = 7 + tw * 90;
      const k = Math.min(1, tw / 1.4); this.pos = V(0, tw * .55, -34 * k * k); this.ry += (Math.PI / 2 - this.ry) * .1; this.shake = Math.max(this.shake, .06);
      if (R() < .6) this.bolt(1.5 + R() * 2, .18); if (this.pos.z < -32.5) carVis = false; this.e = 1;
    } else { this.pos = V(0, reducedMotion ? 0 : .012 + Math.sin(t * 9) * .006, 0); this.ry = Math.PI / 2 + (reducedMotion ? 0 : .26 * Math.sin(t * .45)); this.speed = 7 + this.e * 10; }
    this.travel += dt * this.speed;
    const sh = this.shake; this.shake *= .88; this.flash *= .9;
    const base = this.o.camPos; cam.set(add(base, V((R() - .5) * sh, (R() - .5) * sh, 0)), this.o.camLook); cam.view(cam.W, cam.H);
    this.wv = ANCHORS.map(a => this.T(V(a[0], a[1], a[2])));
    // cenário
    sky(c, cam, t); terrain(c, cam, this.travel, { xw: 44, dx: 2.2, zFar: -110, zNear: 6 }); road(c, cam, this.travel, -110, 7);
    // portal
    if (this.warp >= 0) {
      const ps = Math.min(1, this.warp / .8), C = V(0, 2.1, -34), rad = 3.9 * ps; const cp = cam.p(C);
      if (cp) { const rr = rad * cam.f / cp.z; const g = c.createRadialGradient(cp.x, cp.y, 0, cp.x, cp.y, rr * 1.1); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(.35, 'rgba(34,211,238,.6)'); g.addColorStop(1, 'rgba(34,211,238,0)'); c.fillStyle = g; c.beginPath(); c.arc(cp.x, cp.y, rr * 1.1, 0, 7); c.fill(); }
      c.save(); c.globalCompositeOperation = 'lighter'; [[CY, 1, 1.6], [MG, .8, -2.2], [YL, .6, 3]].forEach(([col, f, sp]) => {
        c.beginPath();
        for (let i = 0; i <= 56; i++) { const a = i / 56 * Math.PI * 2 + t * sp, r = rad * f * (1 + .05 * Math.sin(a * 7 + t * 9)); const p = cam.p(add(C, V(Math.cos(a) * r, Math.sin(a) * r, 0))); if (p) i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); }
        c.strokeStyle = rgba(col, .95); c.lineWidth = 4; c.shadowColor = rgba(col, 1); c.shadowBlur = 22; c.stroke();
      });
      this.swirl.forEach(s => { const a = s.a + t * s.s * (2.2 - s.r), r = rad * s.r; const p = cam.p(add(C, V(Math.cos(a) * r, Math.sin(a) * r, (s.r - .5) * 2))); if (p) { c.fillStyle = rgba(s.c, .9); c.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); } }); c.restore();
    }
    // rastros de fogo (as duas linhas de fogo que o carro deixa na estrada)
    if (this.warp > .9) {
      c.save(); c.globalCompositeOperation = 'lighter'; [-.85, .85].forEach(x => {
        for (let k = 0; k < 3; k++) {
          c.beginPath(); const z0 = Math.min(this.pos.z + 2.2, 7); cam.seg(c, V(x + (R() - .5) * .08, .03, z0), V(x + (R() - .5) * .08, .03, Math.min(z0 + 3 + tw * 14, 7.5)));
          c.strokeStyle = k ? rgba(YL, .7) : rgba(OR, .85); c.lineWidth = k ? 3 : 9; c.shadowColor = '#ff6b1a'; c.shadowBlur = 25; c.stroke();
        }
      }); c.restore();
    }
    // sombra de contato, brilho no chão (underglow) e ondas de choque
    const e = this.e, ground = (rx, rz) => { const pts = []; for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2; const p = cam.p(add(this.T(V(Math.cos(a) * rx, 0, Math.sin(a) * rz)), V(0, -this.pos.y + .02, 0))); if (p) pts.push(p); } return pts; };
    const path = pts => { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath(); };
    if (carVis) {
      const lift = Math.max(0, 1 - this.pos.y / 1.2), sd = ground(2.45, 1.12);
      if (sd.length > 3 && lift > 0) { c.save(); path(sd); c.fillStyle = `rgba(2,2,8,${.78 * lift})`; c.shadowColor = `rgba(2,2,8,${.8 * lift})`; c.shadowBlur = 22; c.fill(); c.restore(); }
      const ug = ground(2.7, 1.3);
      if (ug.length > 3 && (e > 0 || this.flash > .02)) { c.save(); c.globalCompositeOperation = 'lighter'; path(ug); c.fillStyle = rgba(CY, .22 * e + .25 * this.flash); c.shadowColor = '#22d3ee'; c.shadowBlur = 30; c.fill(); c.restore(); }
    }
    c.save(); c.globalCompositeOperation = 'lighter'; this.rings = this.rings.filter(r => {
      r.t += dt; if (r.t < 0) return true; const k = r.t / .9; if (k >= 1) return false; const rad = .8 + k * 6.5;
      c.beginPath(); for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2; const p = cam.p(V(this.pos.x + Math.cos(a) * rad, .03, this.pos.z + Math.sin(a) * rad)); if (p) i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); }
      c.strokeStyle = rgba(r.col, 1 - k); c.lineWidth = 4 * (1 - k) + 1; c.shadowColor = rgba(r.col, 1); c.shadowBlur = 18; c.stroke(); return true;
    }); c.restore();
    // carro
    const pulse = e >= 1 ? .5 + .5 * Math.sin(t * 6) : 0;
    if (this.view && !this.view.lost) {
      this.view.resize(cam.W, cam.H, Math.min(devicePixelRatio || 1, 2));
      this.view.setCamera(cam.pos, this.o.camLook, cam.fov);
      this.view.update({ pos: this.pos, ry: this.ry, e, flash: this.flash, pulse, spin: this.travel, visible: carVis });
      this.view.render();
    } else if (carVis) {
      const L = nrm(V(-.4, 1, .6)), polys = [];
      this.car.forEach(P => {
        const wv = P.v.map(v => this.T(v)), wc = this.T(P.c);
        P.f.forEach(f => {
          const pts = f.i.map(i => wv[i]); let n = nrm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
          let fc = V(0, 0, 0); pts.forEach(p => { fc = add(fc, p); }); fc = mul(fc, 1 / pts.length); if (dot(n, sub(fc, wc)) < 0) n = mul(n, -1);
          if (dot(n, sub(cam.pos, fc)) <= 0) return; const pp = pts.map(p => cam.p(p)); if (pp.some(p => !p)) return;
          let col; if (P.emit) { const b = P.flux ? .4 + .6 * e + .4 * pulse : 1; col = P.fill.map(v => v * b + (P.flux ? 120 * this.flash : 0)); }
          else { const k = .28 + .72 * Math.max(0, dot(n, L)) + .25 * Math.max(0, dot(n, nrm(V(1, .2, .4)))); col = P.fill.map((v, i) => v * k + 255 * this.flash * .55 + CY[i] * (e * .16 + pulse * .08)); }
          polys.push({ pp, d: cam.cz(fc), col, P });
        });
      });
      polys.sort((a, b) => b.d - a.d).forEach(({ pp, col, P }) => {
        c.beginPath(); pp.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath();
        c.fillStyle = rgba(col, P.glass ? .92 : 1); if (P.flux) { c.shadowColor = rgba(P.fill, 1); c.shadowBlur = 8 + 24 * e; } c.fill(); c.shadowBlur = 0;
        if (P.edge) {
          const ec = P.edge === 'yl' ? YL : CY, w = P.wheel; c.strokeStyle = rgba(ec, w ? .25 + .75 * e : .35 + .45 * e + .2 * this.flash); c.lineWidth = w ? 1.2 + 3 * e : 1.1;
          if (w && e > .15) { c.shadowColor = rgba(ec, 1); c.shadowBlur = 16 * e; } c.stroke(); c.shadowBlur = 0;
        }
      });
    }
    // raios + partículas (na camada da frente quando o carro é WebGL)
    if (this.fx && this.view) {
      const f = this.fxc; if (f.width !== this.cv.width || f.height !== this.cv.height) { f.width = this.cv.width; f.height = this.cv.height; }
      c = this.fx; c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, cam.W, cam.H);
    }
    c.save(); c.globalCompositeOperation = 'lighter'; this.bolts = this.bolts.filter(b => {
      b.l -= dt; if (b.l <= 0) return false; if (R() < .35) return true;
      [[CY, 6, .5], [[200, 250, 255], 2, 1]].forEach(([col, w, a]) => { c.beginPath(); for (let i = 0; i < b.pts.length - 1; i++) cam.seg(c, b.pts[i], b.pts[i + 1]); c.strokeStyle = rgba(col, a * (b.l / b.m + .3)); c.lineWidth = w; c.shadowColor = '#22d3ee'; c.shadowBlur = 20; c.stroke(); }); return true;
    });
    this.parts = this.parts.filter(q => {
      q.l -= dt; if (q.l <= 0) return false; q.v.y -= dt * 4; q.p = add(q.p, mul(q.v, dt)); const p = cam.p(q.p);
      if (p) { const s = Math.max(1.5, .07 * cam.f / p.z); c.fillStyle = rgba(q.c, Math.min(1, q.l / q.m * 1.5)); c.fillRect(p.x - s / 2, p.y - s / 2, s, s); } return true;
    }); c.restore();
  };

  /* ---------- fundo 3D ---------- */
  function BG(canvas, opts) {
    this.cv = canvas; this.c = canvas.getContext('2d'); this.t = 0; this.travel = 0; this.mx = 0; this.my = 0; this.tx = 0; this.ty = 0; this.cam = new Cam(V(0, 2.6, 8), V(0, 2, -20), 60);
    this.dprMax = (opts && opts.dprMax) || 1; this.speed = (opts && opts.speed) || 9;
    addEventListener('mousemove', e => { this.tx = e.clientX / innerWidth - .5; this.ty = e.clientY / innerHeight - .5; });
  }
  BG.prototype.frame = function (dt) {
    const s = Scene.prototype.size.call(this); if (!s) return; this.dirty = false; this.t += dt; this.travel += dt * this.speed;
    this.mx += (this.tx - this.mx) * .04; this.my += (this.ty - this.my) * .04; const t = this.t;
    this.cam.set(V(this.mx * 3, 2.8 + Math.sin(t * .6) * .25 - this.my, 9), V(this.mx * 1.2, 2.1 - this.my * 1.5, -20)); this.cam.view(this.cam.W, this.cam.H);
    sky(this.c, this.cam, t); terrain(this.c, this.cam, this.travel, { xw: 52, dx: 2.6, zFar: -120, zNear: 8, lw: 1.3 }); road(this.c, this.cam, this.travel, -120, 9);
  };

  /* ---------- laço único de animação ---------- */
  const items = new Set();
  let last = performance.now(), fps = 30, painted = false;
  function loop(now) {
    requestAnimationFrame(loop);
    if (document.hidden) { last = now; return; }
    if (now - last < 1000 / fps) return;
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    for (const it of items) {
      if (!it.cv.isConnected) { items.delete(it); if (it.dispose) it.dispose(); continue; }
      try { if (!reducedMotion || !painted || it.dirty) it.frame(reducedMotion ? 0 : dt); } catch (err) { console.error(err); }
    }
    painted = true;
  }
  requestAnimationFrame(loop);
  motion.addEventListener && motion.addEventListener('change', () => { reducedMotion = motion.matches; painted = false; items.forEach(it => { it.dirty = true; }); });
  addEventListener('resize', () => { painted = false; items.forEach(it => { it.dirty = true; }); });

  window.Delorean3D = {
    background(canvas, opts) { const b = new BG(canvas, opts); b.dirty = true; items.add(b); return b; },
    car(canvas, opts) {
      const o = Object.assign({ camPos: V(2.7, 1.45, 4.9), camLook: V(-.15, .78, -2.6) }, opts || {});
      if (Array.isArray(o.camPos)) o.camPos = V(...o.camPos);
      if (Array.isArray(o.camLook)) o.camLook = V(...o.camLook);
      const s = new Scene(canvas, o); if (!o.manual) items.add(s); return s; // manual: quem chama cuida do laço (painel do Sucesso)
    },
    setFps(n) { fps = Math.max(10, Math.min(60, n)); },
    get reducedMotion() { return reducedMotion; },
  };
})();
