/* ===== DeLorean máquina do tempo · modelo 3D (Three.js) =====
 * Modelo procedural, sem arquivos externos: carroceria de aço inox escovado, portas asa de gaivota,
 * exaustores traseiros, reator, bobinas de fluxo, rodas, lanternas em grade e a placa OUTATIME.
 * Usado por delorean3d.js (telão, celulares e painel do Sucesso) por cima do cenário 2D.
 *
 *   const view = createCarView(canvasWebGL)
 *   view.resize(w, h, dpr); view.setCamera(pos, look, fov); view.update({pos, ry, e, flash, spin, visible}); view.render()
 */
import * as THREE from '/vendor/three/three.module.min.js';

const { PI } = Math;
const STEEL = 0, FASCIA = 1, BLACK = 2, GLASS = 3;

/* ---------- medidas (metros; +x = frente, +y = cima, +z = lado direito) ---------- */
const AXLE_F = 1.27, AXLE_R = -1.14;
const WHEEL_F = { r: 0.30, w: 0.21, arch: 0.375 }, WHEEL_R = { r: 0.335, w: 0.25, arch: 0.405 };
// Seções da carroceria (meia seção, espelhada): [x, yb, wb, yr, wr, ys, ws, ye, we, yc, wc, yt]
//  yb/wb = assoalho · yr/wr = friso lateral · ys/ws = linha de cintura · ye/we = borda do capô/teto · yt = centro
const SECTIONS = [
  [2.14, .27, .76, .41, .83, .50, .83, .545, .78, .555, .40, .56],
  [2.04, .20, .89, .44, .965, .58, .955, .615, .90, .625, .45, .63],
  [1.55, .17, .93, .47, .99, .69, .975, .715, .91, .725, .45, .73],
  [0.96, .16, .94, .50, .995, .78, .965, .80, .90, .81, .45, .815],
  [0.86, .16, .94, .50, .995, .79, .96, .805, .885, .816, .44, .822],
  [0.05, .16, .94, .50, .995, .80, .955, 1.115, .60, 1.135, .30, 1.14],
  [-0.72, .16, .94, .50, .995, .81, .955, 1.115, .60, 1.13, .30, 1.135],
  [-1.95, .18, .93, .50, .99, .80, .95, .875, .83, .88, .42, .882],
  [-2.09, .22, .90, .48, .955, .76, .92, .82, .84, .825, .42, .83],
  [-2.14, .29, .83, .46, .89, .69, .87, .73, .81, .735, .40, .74],
];
const section = s => [[s[1], 0], [s[1], s[2]], [s[3] - .02, s[4]], [s[3] + .02, s[4]], [s[5], s[6]], [s[7], s[8]], [s[9], s[10]], [s[11], 0]];
function bodyMaterial(i, j) {
  if (j === 0 || j === 2) return BLACK;                    // assoalho e friso de borracha
  if (i === 0 || i === 8) return FASCIA;                   // para-choques
  if (j === 1) return i === 7 ? FASCIA : STEEL;
  if (j === 4) return i === 4 || i === 5 ? GLASS : STEEL;  // vidros laterais
  if (j >= 5) return i === 4 ? GLASS : i === 6 ? BLACK : STEEL; // para-brisa · base das persianas
  return STEEL;
}

function loftBody() {
  const tris = [[], [], [], []], uvs = [[], [], [], []];
  const secs = SECTIONS.map(section);
  const vlen = secs.map(p => { const out = [0]; for (let j = 1; j < p.length; j++) out.push(out[j - 1] + Math.hypot(p[j][0] - p[j - 1][0], p[j][1] - p[j - 1][1])); return out; });
  const push = (m, a, b, c, ua, ub, uc, ref) => {
    const n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
    const cen = [(a[0] + b[0] + c[0]) / 3 - ref[0], (a[1] + b[1] + c[1]) / 3 - ref[1], (a[2] + b[2] + c[2]) / 3 - ref[2]];
    if (n[0] * cen[0] + n[1] * cen[1] + n[2] * cen[2] < 0) { tris[m].push(...a, ...c, ...b); uvs[m].push(...ua, ...uc, ...ub); }
    else { tris[m].push(...a, ...b, ...c); uvs[m].push(...ua, ...ub, ...uc); }
  };
  for (let i = 0; i < secs.length - 1; i++) {
    const x0 = SECTIONS[i][0], x1 = SECTIONS[i + 1][0], A = secs[i], B = secs[i + 1];
    const ref = [Math.max(-1.6, Math.min(1.6, (x0 + x1) / 2)), .55, 0];
    for (let j = 0; j < A.length - 1; j++) for (const s of [1, -1]) {
      const m = bodyMaterial(i, j);
      const a = [x0, A[j][0], s * A[j][1]], b = [x1, B[j][0], s * B[j][1]], c = [x1, B[j + 1][0], s * B[j + 1][1]], d = [x0, A[j + 1][0], s * A[j + 1][1]];
      const ua = [x0 * .12, vlen[i][j] * 1.6], ub = [x1 * .12, vlen[i + 1][j] * 1.6], uc = [x1 * .12, vlen[i + 1][j + 1] * 1.6], ud = [x0 * .12, vlen[i][j + 1] * 1.6];
      push(m, a, b, c, ua, ub, uc, ref); push(m, a, c, d, ua, uc, ud, ref);
    }
  }
  for (const [i, m] of [[0, FASCIA], [secs.length - 1, BLACK]]) { // tampas dianteira e traseira
    const x = SECTIONS[i][0], P = secs[i], cy = (P[0][0] + P[P.length - 1][0]) / 2, ref = [x > 0 ? x - 1 : x + 1, cy, 0];
    for (let j = 0; j < P.length - 1; j++) for (const s of [1, -1]) push(m, [x, cy, 0], [x, P[j][0], s * P[j][1]], [x, P[j + 1][0], s * P[j + 1][1]], [0, 0], [0, .1], [.1, .1], ref);
  }
  const pos = [], uv = [], g = new THREE.BufferGeometry();
  let start = 0;
  tris.forEach((t, m) => { pos.push(...t); uv.push(...uvs[m]); g.addGroup(start, t.length / 3, m); start += t.length / 3; });
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(creaseNormals(pos, 24), 3));
  return g;
}
// Normais suaves nos painéis quase planos e vinco vivo nas dobras (como chapa de aço dobrada)
function creaseNormals(pos, degrees) {
  const nf = pos.length / 9, fn = [], un = [], byVertex = new Map(), cos = Math.cos(degrees * PI / 180), out = new Array(pos.length);
  const key = i => `${Math.round(pos[i] * 2e3)},${Math.round(pos[i + 1] * 2e3)},${Math.round(pos[i + 2] * 2e3)}`;
  for (let f = 0; f < nf; f++) {
    const o = f * 9, ax = pos[o + 3] - pos[o], ay = pos[o + 4] - pos[o + 1], az = pos[o + 5] - pos[o + 2], bx = pos[o + 6] - pos[o], by = pos[o + 7] - pos[o + 1], bz = pos[o + 8] - pos[o + 2];
    const n = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx], l = Math.hypot(...n);
    fn.push(n); un.push(l > 1e-9 ? n.map(v => v / l) : null);
    for (let v = 0; v < 3; v++) { const k = key(o + v * 3); if (!byVertex.has(k)) byVertex.set(k, []); byVertex.get(k).push(f); }
  }
  for (let f = 0; f < nf; f++) for (let v = 0; v < 3; v++) {
    const o = f * 9 + v * 3, u = un[f]; let n = [0, 0, 0];
    if (u) for (const g of byVertex.get(key(o))) { const w = un[g]; if (w && u[0] * w[0] + u[1] * w[1] + u[2] * w[2] > cos) { n[0] += fn[g][0]; n[1] += fn[g][1]; n[2] += fn[g][2]; } }
    const l = Math.hypot(...n) || 1; out[o] = n[0] / l; out[o + 1] = n[1] / l; out[o + 2] = n[2] / l || 0;
    if (!u) { out[o] = 0; out[o + 1] = 1; out[o + 2] = 0; }
  }
  return out;
}

/* ---------- texturas geradas em canvas ---------- */
function canvasTexture(w, h, draw, srgb = true) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const rnd = (seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; })(88);
function brushedTexture() { // riscos horizontais do aço escovado (canal verde = rugosidade)
  const t = canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = 'rgb(0,205,0)'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y++) { const v = 185 + rnd() * 70 | 0; c.fillStyle = `rgba(0,${v},0,${.35 + rnd() * .5})`; c.fillRect(0, y, w, 1); }
    for (let i = 0; i < 300; i++) { const v = 165 + rnd() * 90 | 0; c.fillStyle = `rgba(0,${v},0,.5)`; c.fillRect(rnd() * w, rnd() * h, 20 + rnd() * 120, 1); }
  }, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function environmentTexture() { // estúdio noturno: céu azul-escuro, pôr do sol à frente e caixas de luz para o brilho do aço
  return canvasTexture(1024, 512, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1b2032'); g.addColorStop(.28, '#2b3350'); g.addColorStop(.44, '#6c7391'); g.addColorStop(.498, '#b9bdcc'); g.addColorStop(.505, '#6a6d7c'); g.addColorStop(.6, '#3b3d48'); g.addColorStop(.8, '#1c1d24'); g.addColorStop(1, '#0c0c10');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    const glow = (x, y, r, col) => { const q = c.createRadialGradient(x, y, 0, x, y, r); q.addColorStop(0, col); q.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = q; c.fillRect(x - r, y - r, 2 * r, 2 * r); };
    glow(w * .25, h * .47, 230, 'rgba(255,150,90,.85)'); glow(w * .25, h * .49, 70, 'rgba(255,236,200,1)');   // sol (-z)
    const soft = (u, v, bw, bh, col) => { c.save(); c.filter = 'blur(12px)'; c.fillStyle = col; c.fillRect(w * u - bw / 2, h * v - bh / 2, bw, bh); c.restore(); };
    soft(.66, .15, 300, 80, '#ffffff'); soft(.95, .2, 220, 60, '#f2f6ff'); soft(.03, .2, 120, 60, '#f2f6ff'); soft(.44, .1, 170, 46, '#e6ecff'); soft(.12, .26, 130, 36, '#fff0dc');
    soft(.7, .36, 420, 14, '#ffffff'); soft(.98, .37, 200, 12, '#eef2ff');
  });
}
function tailTexture() { // lanternas em grade: âmbar (fora) · vermelho · branco (ré)
  return canvasTexture(256, 64, (c, w, h) => {
    c.fillStyle = '#050505'; c.fillRect(0, 0, w, h);
    const cols = 8, rows = 3, cw = w / cols, ch = h / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      c.fillStyle = i < 2 ? '#ff9a1a' : i < 6 ? '#e3121c' : '#f3efe6';
      c.fillRect(i * cw + 3, j * ch + 3, cw - 6, ch - 6);
      c.fillStyle = 'rgba(255,255,255,.22)'; c.fillRect(i * cw + 3, j * ch + 3, cw - 6, 3);
    }
  });
}
function plateTexture() {
  return canvasTexture(256, 128, (c, w, h) => {
    c.fillStyle = '#f4f1e8'; c.fillRect(0, 0, w, h); c.strokeStyle = '#1b2a6b'; c.lineWidth = 5; c.strokeRect(5, 5, w - 10, h - 10);
    c.fillStyle = '#c8202a'; c.font = 'italic 700 24px Georgia,serif'; c.textAlign = 'center'; c.fillText('California', w / 2, 34);
    c.fillStyle = '#1b2a6b'; c.font = '900 50px "Arial Narrow",Arial,sans-serif'; c.fillText('OUTATIME', w / 2, 92, w - 30);
  });
}
function rimTexture() { // roda de liga com aletas radiais (estilo turbina)
  return canvasTexture(256, 256, (c, w) => {
    const m = w / 2; c.fillStyle = '#0c0c0d'; c.fillRect(0, 0, w, w);
    const g = c.createRadialGradient(m, m, 10, m, m, m); g.addColorStop(0, '#e8eaee'); g.addColorStop(.55, '#b4b8bf'); g.addColorStop(.9, '#d9dce2'); g.addColorStop(1, '#8b8f97');
    c.fillStyle = g; c.beginPath(); c.arc(m, m, m - 2, 0, 7); c.fill();
    c.strokeStyle = 'rgba(20,22,26,.75)'; c.lineWidth = 3;
    for (let i = 0; i < 44; i++) { const a = i / 44 * PI * 2; c.beginPath(); c.moveTo(m + Math.cos(a) * m * .34, m + Math.sin(a) * m * .34); c.lineTo(m + Math.cos(a + .1) * m * .86, m + Math.sin(a + .1) * m * .86); c.stroke(); }
    c.strokeStyle = '#70747c'; c.lineWidth = 5; c.beginPath(); c.arc(m, m, m * .9, 0, 7); c.stroke();
    c.fillStyle = '#c9ccd2'; c.beginPath(); c.arc(m, m, m * .3, 0, 7); c.fill(); c.strokeStyle = '#6c7078'; c.lineWidth = 3; c.stroke();
    c.fillStyle = '#2a2c30'; for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2; c.beginPath(); c.arc(m + Math.cos(a) * m * .2, m + Math.sin(a) * m * .2, 5, 0, 7); c.fill(); }
  });
}

/* ---------- materiais ---------- */
function makeMaterials(env) {
  const brushed = brushedTexture();
  const std = o => new THREE.MeshStandardMaterial(Object.assign({ envMap: env, envMapIntensity: 1.25 }, o));
  // recorte das caixas de roda + frisos das portas/capô direto no shader (sem mexer na malha)
  const patch = (mat, seams) => {
    mat.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLocal;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vLocal;
        float ln(float v, float c){ return 1.0 - smoothstep(.004, .009, abs(v - c)); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
        float az = abs(vLocal.z);
        if (az > .55) {
          vec2 d1 = vLocal.xy - vec2(${AXLE_F.toFixed(3)}, ${WHEEL_F.r.toFixed(3)}), d2 = vLocal.xy - vec2(${AXLE_R.toFixed(3)}, ${WHEEL_R.r.toFixed(3)});
          if (dot(d1, d1) < ${(WHEEL_F.arch ** 2).toFixed(4)} || dot(d2, d2) < ${(WHEEL_R.arch ** 2).toFixed(4)}) discard;
        }
        ${seams ? `float seam = 0.0;
        float side = step(.8, az), x = vLocal.x, y = vLocal.y;
        seam += ln(x, .86) * side * step(.245, y) * step(y, .80);
        seam += ln(x, -.62) * step(.245, y) * step(.13, az);
        seam += ln(y, .245) * side * step(-.62, x) * step(x, .86);
        seam += ln(az, .13) * step(1.0, y) * step(-.62, x) * step(x, .05);
        seam += ln(x, .97) * step(.6, y) * step(az, .9);
        seam += ln(az, .87) * step(.58, y) * step(.97, x) * step(x, 2.02) * step(az, .9);
        seam += ln(x, -1.93) * step(.2, y);
        diffuseColor.rgb *= mix(1.0, .06, clamp(seam, 0.0, 1.0));` : ''}`);
    };
    return mat;
  };
  const M = {
    steel: patch(std({ color: 0xcdd1d7, metalness: 1, roughness: .56, roughnessMap: brushed, envMapIntensity: 1.5 }), true),
    fascia: patch(std({ color: 0x8d9197, metalness: .35, roughness: .58 }), false),
    bodyBlack: patch(std({ color: 0x0b0b0d, metalness: .2, roughness: .75 }), false),
    glass: std({ color: 0x10181d, metalness: 1, roughness: .05, transparent: true, opacity: .93, envMapIntensity: 1.6 }),
    bumper: std({ color: 0x34363b, metalness: .3, roughness: .6 }),
    black: std({ color: 0x141518, metalness: .55, roughness: .5 }),
    matte: std({ color: 0x08080a, metalness: 0, roughness: .95 }),
    tire: std({ color: 0x0b0b0c, metalness: 0, roughness: .88 }),
    chrome: std({ color: 0xe6e9ee, metalness: 1, roughness: .12, envMapIntensity: 1.8 }),
    alu: std({ color: 0xaab0b8, metalness: 1, roughness: .38 }),
    white: std({ color: 0xe9e9e4, metalness: .1, roughness: .5 }),
    red: std({ color: 0xc0161c, metalness: .3, roughness: .35 }),
    blue: std({ color: 0x1d4fd0, metalness: .2, roughness: .4 }),
    coil: std({ color: 0x2a2d33, metalness: .6, roughness: .45, emissive: 0x7fe6ff, emissiveIntensity: 0 }),
    vent: std({ color: 0x1a0a04, metalness: 0, roughness: 1, emissive: 0xff5a14, emissiveIntensity: 0 }),
    head: std({ color: 0xfff6dc, emissive: 0xfff0c8, emissiveIntensity: .9, roughness: .2 }),
    amber: std({ color: 0xff9a1a, emissive: 0xff8a10, emissiveIntensity: .5, roughness: .3 }),
    tailSide: std({ color: 0xd0141c, emissive: 0xd0141c, emissiveIntensity: .6, roughness: .3 }),
  };
  M.rim = std({ map: rimTexture(), metalness: .85, roughness: .35 });
  const tail = tailTexture();
  M.tail = std({ map: tail, emissive: 0xffffff, emissiveMap: tail, emissiveIntensity: 1.1, roughness: .25, metalness: 0 });
  M.plate = std({ map: plateTexture(), roughness: .5, metalness: 0 });
  return M;
}

/* ---------- construção do carro ---------- */
function buildCar(M) {
  const car = new THREE.Group(), wheels = [];
  const add = (mesh, parent = car) => { parent.add(mesh); return mesh; };
  const box = (sx, sy, sz, mat, x, y, z, parent) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); m.position.set(x, y, z); return add(m, parent); };
  const cyl = (r, h, mat, x, y, z, axis = 'y', seg = 24, parent) => { const g = new THREE.CylinderGeometry(r, r, h, seg); if (axis === 'x') g.rotateZ(PI / 2); if (axis === 'z') g.rotateX(PI / 2); const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); return add(m, parent); };
  const tube = (pts, r, mat, seg = 40, parent) => add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), seg, r, 8, false), mat), parent);
  const mirror = fn => { fn(1); fn(-1); };

  add(new THREE.Mesh(loftBody(), [M.steel, M.fascia, M.bodyBlack, M.glass]));
  box(1.9, .57, 1.16, M.matte, .0, .485, 0); box(1.2, .34, 1.16, M.matte, 1.45, .36, 0); box(1.25, .6, 1.16, M.matte, -1.5, .5, 0); // interior (não deixa ver através)

  // rodas + caixas de roda
  const tireGeo = w => { const hw = w.w / 2, p = [[.62, -hw], [.9, -hw], [1, -hw + .035], [1, hw - .035], [.9, hw], [.62, hw]].map(q => new THREE.Vector2(q[0] * w.r, q[1])); const g = new THREE.LatheGeometry(p, 40); g.rotateX(PI / 2); return g; };
  for (const [ax, w] of [[AXLE_F, WHEEL_F], [AXLE_R, WHEEL_R]]) mirror(s => {
    const zc = s * (.985 - w.w / 2);
    const liner = new THREE.Mesh(new THREE.CylinderGeometry(w.arch + .004, w.arch + .004, .40, 32, 1, true, PI / 2 - .5, PI + 1), M.matte); liner.material.side = THREE.DoubleSide; liner.geometry.rotateX(PI / 2); liner.position.set(ax, w.r, s * .765); car.add(liner);
    const g = new THREE.Group(); g.position.set(ax, w.r, zc); car.add(g); wheels.push({ g, r: w.r });
    g.add(new THREE.Mesh(tireGeo(w), M.tire));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(w.r * .67, 40), M.rim); disc.position.z = s * (w.w / 2 - .012); if (s < 0) disc.rotation.y = PI; g.add(disc);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(w.r * .67, .012, 8, 40), M.alu); lip.position.z = s * (w.w / 2 - .008); g.add(lip);
    cyl(w.r * .6, w.w * .78, M.matte, 0, 0, 0, 'z', 24, g);
  });

  // frente: grade, quatro faróis retangulares, piscas
  box(.03, .095, 1.56, M.black, 2.142, .487, 0);
  mirror(s => { box(.03, .07, .16, M.head, 2.15, .487, s * .66); box(.03, .07, .16, M.head, 2.15, .487, s * .48); box(.03, .035, .15, M.amber, 2.142, .365, s * .67); });
  box(.12, .05, 1.5, M.black, 2.07, .225, 0);
  mirror(s => { box(.09, .03, .012, M.amber, 1.86, .53, s * .978); box(.09, .03, .012, M.tailSide, -1.86, .56, s * .972); });

  // traseira: lanternas em grade, painel central, placa e escapamentos
  mirror(s => { const t = new THREE.Mesh(new THREE.PlaneGeometry(.52, .15), M.tail); t.position.set(-2.146, .60, s * .575); t.rotation.y = -PI / 2; if (s > 0) t.scale.x = -1; car.add(t); });
  box(.02, .15, .58, M.black, -2.146, .60, 0);
  for (let i = 0; i < 5; i++) box(.025, .008, .56, M.alu, -2.15, .545 + i * .028, 0);
  { const p = new THREE.Mesh(new THREE.PlaneGeometry(.31, .155), M.plate); p.position.set(-2.172, .385, 0); p.rotation.y = -PI / 2; car.add(p); box(.03, .19, 1.7, M.bumper, -2.15, .375, 0); box(.02, .175, .33, M.black, -2.158, .385, 0); }
  mirror(s => { cyl(.036, .16, M.chrome, -2.12, .225, s * .56, 'x'); cyl(.028, .162, M.matte, -2.121, .225, s * .56, 'x'); });

  // colunas, molduras dos vidros, retrovisores
  const bar = (a, b, t, mat) => { const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), m = new THREE.Mesh(new THREE.BoxGeometry(A.distanceTo(B), t, t), mat); m.position.copy(A).add(B).multiplyScalar(.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), B.clone().sub(A).normalize()); car.add(m); };
  mirror(s => {
    bar([.86, .805, s * .885], [.05, 1.115, s * .60], .045, M.black);       // coluna A
    bar([.05, 1.118, s * .60], [-.72, 1.118, s * .60], .04, M.black);       // calha do teto
    bar([-.72, 1.115, s * .60], [-.72, .81, s * .955], .07, M.black);       // coluna B
    bar([.86, .79, s * .962], [-.72, .81, s * .957], .028, M.black);        // linha de cintura
    bar([-.28, .80, s * .957], [-.28, 1.115, s * .602], .03, M.black);      // divisão do vidro da porta
    box(.13, .085, .05, M.black, .70, .87, s * 1.035); box(.05, .03, .1, M.black, .74, .845, s * .99);
  });
  bar([.86, .822, -.885], [.86, .822, .885], .03, M.black); bar([.05, 1.142, -.60], [.05, 1.142, .60], .03, M.black);

  // persianas do vidro traseiro
  for (let i = 0; i < 5; i++) { const x = -.80 - i * .115, we = .60 + (x + .72) / -1.23 * .23, y = 1.115 + (x + .72) * .195; const l = box(.10, .012, we * 2 - .06, M.black, x, y + .03, 0); l.rotation.z = .32; }

  /* --- máquina do tempo --- */
  // dois exaustores do reator (grade 2 x 3) que acendem com a energia
  mirror(s => {
    const v = new THREE.Group(); v.position.set(-1.84, 1.02, s * .47); v.rotation.z = -.40; car.add(v);
    const L = .78, W = .52, H = .40, t = .016;
    box(L, t, W, M.black, 0, H / 2, 0, v); box(L, t, W, M.black, 0, -H / 2, 0, v);
    for (const z of [-W / 2, 0, W / 2]) box(L, H, t, M.black, 0, 0, z, v);
    for (const y of [-H / 6, H / 6]) box(L * .96, t, W, M.black, 0, y, 0, v);
    box(t, H, W, M.vent, L / 2 - .1, 0, 0, v);
    box(.3, t, W + .03, M.black, L / 2 - .12, H / 2 + .05, 0, v).rotation.z = .5;
    cyl(.022, .5, M.alu, .1, -H / 2 - .12, s * .2, 'y', 12, v).rotation.z = .4;
  });
  // reator (câmara de plutônio) entre os exaustores
  cyl(.21, .05, M.black, -1.42, .955, 0); cyl(.15, .17, M.white, -1.42, 1.06, 0); cyl(.17, .035, M.chrome, -1.42, 1.16, 0); cyl(.06, .07, M.chrome, -1.42, 1.21, 0); cyl(.025, .05, M.red, -1.42, 1.265, 0);
  // conduítes, cilindros e fiação atrás da cabine
  box(.42, .09, .9, M.black, -1.02, 1.03, 0).rotation.z = .19;
  tube([[-1.38, 1.02, .16], [-1.2, 1.24, .2], [-.98, 1.3, .3], [-.86, 1.16, .42]], .055, M.alu, 30);
  tube([[-1.38, 1.02, -.16], [-1.22, 1.2, -.22], [-1.0, 1.22, -.36], [-.88, 1.12, -.44]], .04, M.alu, 30);
  for (let i = 0; i < 3; i++) { cyl(.042, .17, M.red, -.93 - i * .012, 1.13, .26 + i * .1); cyl(.046, .1, M.alu, -1.08, 1.085, .30 + i * .11); }
  { const pts = []; for (let i = 0; i <= 60; i++) { const k = i / 60, a = k * PI * 14; pts.push([-.9 - k * .34, 1.12 - k * .1 + Math.sin(a) * .03, .62 + Math.cos(a) * .03 + k * .08]); } tube(pts, .008, M.blue, 180); }
  cyl(.012, .34, M.chrome, -1.18, 1.2, -.12); box(.05, .035, .26, M.white, -1.18, 1.38, -.12); box(.2, .12, .22, M.alu, -.98, 1.1, -.3); box(.16, .07, .18, M.black, -1.2, 1.05, -.5);
  mirror(s => tube([[-.78, 1.12, s * .5], [-1.2, 1.06, s * .68], [-1.6, .99, s * .78], [-1.95, .9, s * .8]], .02, M.chrome, 30));
  // bobinas de fluxo: faixa sobre os para-lamas dianteiros e o capô, arcos sobre as rodas traseiras e trilho lateral
  const clip = (p, parent = car) => box(.05, .05, .05, M.white, p[0], p[1], p[2], parent);
  mirror(s => {
    const front = [[.80, .30, s * 1.0], [.86, .5, s * 1.012], [1.0, .68, s * 1.0], [1.27, .745, s * .985], [1.6, .715, s * .99], [1.92, .64, s * .975], [2.12, .575, s * .86], [2.165, .57, s * .45], [2.17, .57, 0]];
    tube(front, .024, M.coil, 60);
    const curve = new THREE.CatmullRomCurve3(front.map(p => new THREE.Vector3(...p)));
    for (let i = 1; i < 13; i++) { const p = curve.getPoint(i / 13.5); clip([p.x, p.y, p.z]); }
    tube([[-.70, .30, s * 1.0], [-.76, .55, s * 1.01], [-.9, .76, s * 1.0], [-1.14, .845, s * .985], [-1.5, .86, s * .97], [-1.9, .84, s * .93], [-2.06, .8, s * .86]], .034, M.coil, 50);
    tube([[-.72, .34, s * 1.03], [-.8, .56, s * 1.04], [-.95, .78, s * 1.02], [-1.16, .9, s * .96], [-1.4, .96, s * .86]], .018, M.chrome, 40);
    cyl(.02, 1.44, M.chrome, .05, .30, s * 1.012, 'x', 12);
    for (const x of [-.6, -.2, .2, .6]) cyl(.032, .07, M.alu, x, .30, s * 1.012, 'x', 12);
    tube([[-.66, .32, s * 1.0], [-.68, .6, s * .985], [-.7, .84, s * .95], [-.8, 1.08, s * .66]], .009, M.red, 30);
    tube([[-.64, .32, s * 1.0], [-.655, .6, s * .99], [-.67, .84, s * .955], [-.76, 1.1, s * .64]], .009, M.matte, 30);
  });
  return { car, wheels };
}

/* ---------- visualização ---------- */
export function createCarView(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envSource = environmentTexture(); envSource.mapping = THREE.EquirectangularReflectionMapping;
  const env = pmrem.fromEquirectangular(envSource).texture; envSource.dispose(); pmrem.dispose();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, 1, .1, 200);
  const M = makeMaterials(env), { car, wheels } = buildCar(M);
  const rig = new THREE.Group(); rig.add(car); rig.scale.setScalar(1.06); scene.add(rig);
  scene.add(new THREE.HemisphereLight(0xc8d2ff, 0x2a2430, .7));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(5, 7, 8); scene.add(key);
  const sun = new THREE.DirectionalLight(0xffb487, 1.5); sun.position.set(-1, 2.5, -12); scene.add(sun);
  const zap = new THREE.PointLight(0xa8ecff, 0, 14, 1.6); zap.position.set(0, 2.2, 0); rig.add(zap);

  let lost = false;
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; });
  return {
    get lost() { return lost; },
    resize(w, h, dpr) {
      if (renderer.getPixelRatio() !== dpr) renderer.setPixelRatio(dpr);
      const s = renderer.getSize(new THREE.Vector2());
      if (s.x !== w || s.y !== h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    },
    setCamera(pos, look, fov) {
      if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
      camera.position.set(pos.x, pos.y, pos.z); camera.lookAt(look.x, look.y, look.z);
    },
    update({ pos, ry, e = 0, flash = 0, pulse = 0, spin = 0, visible = true }) {
      rig.visible = visible; rig.position.set(pos.x, pos.y, pos.z); rig.rotation.y = ry;
      for (const w of wheels) w.g.rotation.z = -spin / w.r;
      M.coil.emissiveIntensity = .03 + e * e * 1.1 + pulse * 1.2 + flash * 3;
      M.vent.emissiveIntensity = .15 + e * 2.2 + flash * 2;
      M.tail.emissiveIntensity = 1.1 + flash * .8;
      zap.intensity = flash * 60 + pulse * 6;
    },
    render() { if (!lost) renderer.render(scene, camera); },
    dispose() { renderer.dispose(); renderer.forceContextLoss(); },
  };
}
