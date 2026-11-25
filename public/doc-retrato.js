/* ===== O Doc: retrato cinematográfico (personagem original) =====
 * Busto em estilo graphic novel com luz de cinema: luz quente do pôr do sol pela direita, contorno
 * azul-turquesa do portal do tempo pela esquerda, sombras fortes. Partes animáveis: pálpebras (piscar),
 * boca (.m0 fechada, .m1 aberta, .m2 "o"), sobrancelhas e a mão que aparece apontando para cima.
 * Também a silhueta de corpo inteiro (contra a luz) para o plano geral da chegada.
 *
 *   DocRetrato.portrait() → <svg> · DocRetrato.silhouette() → <svg>
 */
(function () {
  'use strict';
  // gerador pseudoaleatório fixo: o cabelo sai sempre igual
  let seed = 1985;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const f = n => n.toFixed(1);

  // mechas do cabelo: nascem numa elipse em volta da cabeça e saem para fora, afinando até a ponta
  function locks({ cx, cy, rx, ry, from, to, n, len, width, curl }) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? .5 : i / (n - 1), a = (from + (to - from) * t + (rnd() - .5) * 6) * Math.PI / 180;
      const L = len[0] + rnd() * (len[1] - len[0]), w = width[0] + rnd() * (width[1] - width[0]), c = (rnd() - .5) * curl * Math.PI / 180;
      const x0 = cx + Math.cos(a) * rx, y0 = cy + Math.sin(a) * ry, dir = a + c;
      const px = -Math.sin(a), py = Math.cos(a); // perpendicular na raiz
      const tx = x0 + Math.cos(dir) * L, ty = y0 + Math.sin(dir) * L;
      const p1x = x0 + Math.cos(a) * L * .38, p1y = y0 + Math.sin(a) * L * .38, p2x = x0 + Math.cos(a + c * .5) * L * .78, p2y = y0 + Math.sin(a + c * .5) * L * .78;
      const wv = (rnd() - .5) * w * 1.2; // ondulação: o tufo faz um "S"
      out.push({ d: `M${f(x0 + px * w)} ${f(y0 + py * w)} C${f(p1x + px * (w * 1.25 + wv))} ${f(p1y + py * (w * 1.25 + wv))} ${f(p2x + px * (w * .55 - wv))} ${f(p2y + py * (w * .55 - wv))} ${f(tx)} ${f(ty)} C${f(p2x - px * (w * .35 + wv))} ${f(p2y - py * (w * .35 + wv))} ${f(p1x - px * (w * .9 - wv))} ${f(p1y - py * (w * .9 - wv))} ${f(x0 - px * w)} ${f(y0 - py * w)} Z`, a: a * 180 / Math.PI, x0, y0, tx, ty });
    }
    return out;
  }
  // juba: uma massa só, com o contorno irregular (jogada para trás em cima, caindo pelos lados até os ombros)
  function mane(cx, cy, k, bumps) {
    const R = th => { // raio da juba em cada direção (graus; 90 = para baixo)
      const t = ((th % 360) + 360) % 360, up = Math.max(0, -Math.sin(t * Math.PI / 180)), side = Math.abs(Math.cos(t * Math.PI / 180));
      const low = t > 95 && t < 150 || t > 30 && t < 85 ? 58 : 0; // os lados caem até os ombros
      return (152 + 46 * side + 62 * up * up + low) * k;
    };
    const path = [], n = 90;
    for (let i = 0; i < n; i++) {
      const th = 112 + (i / (n - 1)) * 316; // de baixo-esquerda (112°), por cima, até baixo-direita (428° = 68°)
      const r = R(th) + Math.sin(th * Math.PI / 180 * 5) * bumps * 1.4 * k + (rnd() - .5) * bumps * 2.4 * k; // tufos grandes + irregularidade
      path.push([cx + Math.cos(th * Math.PI / 180) * r * 1.08, cy + Math.sin(th * Math.PI / 180) * r]);
    }
    path.push([cx + 70 * k, cy + 190 * k], [cx - 70 * k, cy + 190 * k]); // fecha atrás do pescoço (escondido pelo rosto e o jaleco)
    let d = `M${f((path[0][0] + path[path.length - 1][0]) / 2)} ${f((path[0][1] + path[path.length - 1][1]) / 2)}`;
    for (let i = 0; i < path.length; i++) { const p0 = path[i], p1 = path[(i + 1) % path.length]; d += ` Q${f(p0[0])} ${f(p0[1])} ${f((p0[0] + p1[0]) / 2)} ${f((p0[1] + p1[1]) / 2)}`; }
    return { d: d + ' Z', R };
  }
  // fios que seguem o penteado, da raiz (perto da cabeça) até perto da borda da juba
  function flow(cx, cy, k, R, n, color) {
    let s = '';
    for (let i = 0; i < n; i++) {
      const th = 112 + rnd() * 316, a = th * Math.PI / 180, r0 = (98 + rnd() * 30) * k, r1 = R(th) * (.82 + rnd() * .16);
      const sweep = (Math.sin(a) < 0 ? 18 : 10) * (Math.cos(a) < 0 ? -1 : 1) * Math.PI / 180; // em cima vai para trás; dos lados desce
      const x0 = cx + Math.cos(a) * r0 * 1.08, y0 = cy + Math.sin(a) * r0, x1 = cx + Math.cos(a + sweep) * r1 * 1.08, y1 = cy + Math.sin(a + sweep) * r1 + (Math.sin(a) > -.2 ? 22 * k : 0);
      const mx = (x0 + x1) / 2 + (rnd() - .5) * 30 * k, my = (y0 + y1) / 2 + (rnd() - .5) * 30 * k;
      s += `<path d="M${f(x0)} ${f(y0)} Q${f(mx)} ${f(my)} ${f(x1)} ${f(y1)}" stroke="${color ? color(rnd()) : '#fff'}" stroke-width="${f((1.2 + rnd() * 2.6) * k)}" fill="none" stroke-linecap="round" opacity="${f(.35 + rnd() * .55)}"/>`;
    }
    return s;
  }
  // fiapos soltos na borda (o cabelo "elétrico")
  function wisps(cx, cy, k, R, n) {
    let s = '';
    for (let i = 0; i < n; i++) {
      const th = 112 + rnd() * 316, a = th * Math.PI / 180, r = R(th) * (.96 + rnd() * .08), L = (8 + rnd() * 26) * k, dev = (rnd() - .5) * 1.2;
      const x0 = cx + Math.cos(a) * r * 1.08, y0 = cy + Math.sin(a) * r;
      s += `<path d="M${f(x0)} ${f(y0)} q${f(Math.cos(a + dev) * L * .6)} ${f(Math.sin(a + dev) * L * .6 - 4 * k)} ${f(Math.cos(a + dev * 1.6) * L)} ${f(Math.sin(a + dev * 1.6) * L)}" stroke="#f4f7ff" stroke-width="${f((.8 + rnd()) * k)}" fill="none" stroke-linecap="round" opacity="${f(.5 + rnd() * .4)}"/>`;
    }
    return s;
  }
  // juba fofa: volumes arredondados ao longo de um caminho (por cima da cabeça e caindo pelos lados)
  function puffs(path, r0, r1, jitter) {
    const out = [];
    for (const [x, y, k] of path) out.push({ x: x + (rnd() - .5) * jitter, y: y + (rnd() - .5) * jitter, r: r0 + rnd() * (r1 - r0) * (k || 1) });
    return out;
  }
  // fios ondulados que seguem o penteado (de dentro para fora)
  function strands(n, from, to, ctr, len, spread) {
    let s = '';
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), a = (from + (to - from) * t + (rnd() - .5) * spread) * Math.PI / 180, L = len[0] + rnd() * (len[1] - len[0]);
      const x0 = ctr.x + Math.cos(a) * ctr.r, y0 = ctr.y + Math.sin(a) * ctr.r * .92, x1 = x0 + Math.cos(a) * L, y1 = y0 + Math.sin(a) * L + L * .25 * Math.max(0, Math.cos(a) * Math.cos(a));
      const w = (rnd() - .5) * 26;
      s += `<path d="M${f(x0)} ${f(y0)} C${f(x0 + Math.cos(a) * L * .4 - Math.sin(a) * w)} ${f(y0 + Math.sin(a) * L * .4 + Math.cos(a) * w)} ${f(x1 - Math.cos(a) * L * .3 + Math.sin(a) * w)} ${f(y1 - Math.sin(a) * L * .3 - Math.cos(a) * w)} ${f(x1)} ${f(y1)}" stroke="${rnd() < .6 ? '#ffffff' : '#a9b2c8'}" stroke-width="${f(1.4 + rnd() * 2.2)}" fill="none" stroke-linecap="round" opacity="${f(.45 + rnd() * .45)}"/>`;
    }
    return s;
  }
  // sobrancelha espessa: muitos fios curtos ao longo de uma curva
  function brow(x0, y0, x1, y1, lift, flip) {
    let s = '';
    for (let i = 0; i < 26; i++) {
      const t = i / 25, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * lift;
      const ang = (flip ? 200 : -20) + (rnd() - .5) * 40 + (flip ? -t * 30 : t * 30), len = 9 + rnd() * 10;
      const ex = x + Math.cos(ang * Math.PI / 180) * len, ey = y + Math.sin(ang * Math.PI / 180) * len * .6 - 3;
      s += `<path d="M${f(x)} ${f(y + 4)} Q${f((x + ex) / 2)} ${f(Math.min(y, ey) - 3)} ${f(ex)} ${f(ey)}" stroke="${rnd() < .7 ? '#f4f6fb' : '#b8bfd0'}" stroke-width="${f(2.4 + rnd() * 2)}"/>`;
    }
    return s;
  }

  function portrait() {
    seed = 1985;
    const head = { cx: 300, cy: 262, rx: 122, ry: 118 };
    const M = mane(300, 300, 1, 9), M2 = mane(300, 302, .86, 7);
    const lockFill = (l, layer) => {
      const left = Math.cos(l.a * Math.PI / 180) < -.15, right = Math.cos(l.a * Math.PI / 180) > .15;
      return `<path d="${l.d}" fill="url(#${layer})" stroke="${left ? 'rgba(110,240,255,.55)' : right ? 'rgba(255,190,130,.45)' : 'rgba(200,210,235,.35)'}" stroke-width="1.6"/>`;
    };
    return `<svg class="doc-svg" viewBox="0 0 600 760" aria-hidden="true">
  <defs>
    <linearGradient id="dHairB" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#e9edf6"/><stop offset="1" stop-color="#7d86a3"/></linearGradient>
    <linearGradient id="dHairRim" x1="0" x2="1"><stop offset="0" stop-color="#6ff6ff"/><stop offset=".5" stop-color="#ffffff" stop-opacity=".2"/><stop offset="1" stop-color="#ffc890"/></linearGradient>
    <linearGradient id="dHairF" x1="0" x2="1"><stop offset="0" stop-color="#cfe9f2"/><stop offset=".5" stop-color="#ffffff"/><stop offset="1" stop-color="#ffe2c4"/></linearGradient>
    <linearGradient id="dSkin" x1="0" x2="1"><stop offset="0" stop-color="#b98473"/><stop offset=".45" stop-color="#e3a98a"/><stop offset="1" stop-color="#f6c39b"/></linearGradient>
    <linearGradient id="dCoat" x1="0" x2="1"><stop offset="0" stop-color="#5d6684"/><stop offset=".5" stop-color="#c9cfdf"/><stop offset="1" stop-color="#f6e2cf"/></linearGradient>
    <linearGradient id="dLapel" x1="0" x2="1"><stop offset="0" stop-color="#3f4763"/><stop offset="1" stop-color="#d9c8ba"/></linearGradient>
    <linearGradient id="dSuit" x1="0" x2="1"><stop offset="0" stop-color="#8790ad"/><stop offset=".42" stop-color="#e6eaf3"/><stop offset=".7" stop-color="#f7f8fc"/><stop offset="1" stop-color="#fff0e0"/></linearGradient>
    <pattern id="dScarf" width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(18)"><rect width="26" height="26" fill="#d9662a"/><path d="M4 8 C8 2 16 4 14 10 C12 15 6 14 4 8 Z" fill="#2f8f6a"/><circle cx="19" cy="19" r="3.2" fill="#f4d35e"/><circle cx="21" cy="5" r="1.8" fill="#8a1f3c"/><path d="M2 20 l5 4" stroke="#1e3d6b" stroke-width="2"/></pattern>
    <linearGradient id="dWatch" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#f4f6fa"/><stop offset=".5" stop-color="#9aa1b0"/><stop offset="1" stop-color="#5b6170"/></linearGradient>
    <radialGradient id="dLens" cx=".38" cy=".35" r=".75"><stop offset="0" stop-color="#8fd6a8"/><stop offset=".3" stop-color="#2f7a52"/><stop offset=".75" stop-color="#0f3a24"/><stop offset="1" stop-color="#06180f"/></radialGradient>
    <radialGradient id="dWarm" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd8b0" stop-opacity=".75"/><stop offset="1" stop-color="#ffd8b0" stop-opacity="0"/></radialGradient>
    <linearGradient id="dShade" x1="0" x2="1"><stop offset="0" stop-color="#2a1640" stop-opacity=".7"/><stop offset=".4" stop-color="#2a1640" stop-opacity=".18"/><stop offset=".6" stop-color="#2a1640" stop-opacity="0"/></linearGradient>
    <filter id="dGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
    <filter id="dGlowW" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>
    <radialGradient id="dAO" cx=".56" cy=".44" r=".62"><stop offset=".62" stop-color="#2a1640" stop-opacity="0"/><stop offset="1" stop-color="#2a1640" stop-opacity=".55"/></radialGradient>
    <linearGradient id="dTop" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#2a1640" stop-opacity=".35"/><stop offset=".22" stop-color="#2a1640" stop-opacity="0"/></linearGradient>
    <clipPath id="dFace"><path d="M300 150 C372 150 420 204 421 282 C422 326 416 362 402 392 C388 424 352 462 300 468 C248 462 212 424 198 392 C184 362 178 326 179 282 C180 204 228 150 300 150 Z"/></clipPath>
  </defs>
  <!-- cabelo de trás -->
  <g class="dc-hair">
    ${wisps(300, 300, 1, M.R, 120)}
    <path d="${M.d}" fill="url(#dHairB)"/>
    <path d="${M.d}" fill="none" stroke="url(#dHairRim)" stroke-width="5" opacity=".8"/>
    <path d="${M2.d}" fill="url(#dHairF)" opacity=".75"/>
    ${flow(300, 300, 1, M.R, 150, r => (r < .55 ? '#ffffff' : r < .8 ? '#c3cad9' : '#8790a8'))}
  </g>
  <!-- jaleco, camisa e gravata -->
  <g class="dc-body">
    <!-- pescoço -->
    <path d="M254 428 C254 466 250 496 242 522 L358 522 C350 496 346 466 346 428 Z" fill="url(#dSkin)"/>
    <path d="M254 428 C254 466 250 496 242 522 L290 522 C282 494 280 466 284 446 Z" fill="#2a1640" opacity=".4"/>
    <path d="M20 760 C30 640 100 548 212 506 C240 498 270 494 300 494 C330 494 360 498 388 506 C500 548 570 640 580 760 Z" fill="url(#dSuit)"/>
    <!-- lenço estampado na abertura da gola -->
    <path d="M258 470 C280 482 320 482 342 470 L326 548 L300 584 L274 548 Z" fill="url(#dScarf)"/>
    <path d="M258 470 C280 482 320 482 342 470 L326 548 L300 584 L274 548 Z" fill="url(#dShade)" opacity=".5"/>
    <!-- gola alta e zíper -->
    <path d="M226 510 C228 484 242 462 264 450 L282 512 C262 520 240 520 226 510 Z" fill="#d7dcea" stroke="#8d96b4" stroke-width="2"/>
    <path d="M374 510 C372 484 358 462 336 450 L318 512 C338 520 360 520 374 510 Z" fill="#fbf4ea" stroke="#c9bba8" stroke-width="2"/>
    <path d="M300 586 V760" stroke="#7d869f" stroke-width="3"/><path d="M300 590 V760" stroke="#e8ecf4" stroke-width="7" stroke-dasharray="2.5 3.5" opacity=".8"/>
    <rect x="293" y="584" width="14" height="22" rx="3" fill="#b9c0cf" stroke="#6b7389" stroke-width="1.5"/>
    <!-- dobras do tecido e o contorno de luz -->
    <path d="M118 700 C150 650 190 620 230 606 M484 690 C452 650 414 624 372 610 M250 640 C262 680 266 720 262 760 M350 640 C340 680 336 720 340 760" stroke="rgba(40,40,70,.18)" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M24 756 C34 640 102 550 212 508" stroke="rgba(110,240,255,.6)" stroke-width="3" fill="none"/>
    <!-- o cabo e o controle remoto da máquina do tempo -->
    <path d="M262 514 C240 560 214 610 206 676" stroke="#15151d" stroke-width="5" fill="none" stroke-linecap="round"/>
    <g class="dc-remote"><rect x="178" y="672" width="52" height="74" rx="8" fill="#2a2d36" stroke="#0e0f14" stroke-width="2.5"/><path d="M188 672 V634" stroke="#15151d" stroke-width="4" stroke-linecap="round"/><circle cx="188" cy="632" r="4" fill="#c33"/>
      <circle cx="194" cy="690" r="4.5" fill="#ff3b30"/><circle cx="212" cy="690" r="4.5" fill="#39ff6a"/><rect x="188" y="704" width="32" height="8" rx="2" fill="#111"/><rect x="188" y="718" width="32" height="18" rx="2" fill="#555b66"/></g>
    <!-- remendo com o capacitor de fluxo -->
    <g class="dc-badge"><rect x="414" y="620" width="44" height="44" rx="8" fill="#140b24" stroke="#ffd21f" stroke-width="2.5"/><path d="M424 630 L436 644 L448 630 M436 644 V656" stroke="#ffd21f" stroke-width="4" stroke-linecap="round" fill="none"/></g>
  </g>
  <g class="dc-head">
    <!-- orelhas -->
    <path d="M186 296 C164 290 158 330 168 354 C174 370 186 376 196 368 Z" fill="#b8806c"/><path d="M182 312 C174 320 174 338 182 350" stroke="#7a4a44" stroke-width="3" fill="none"/>
    <path d="M414 296 C436 290 442 330 432 354 C426 370 414 376 404 368 Z" fill="#f2b892"/><path d="M418 312 C426 320 426 338 418 350" stroke="#b46d55" stroke-width="3" fill="none"/>
    <!-- rosto -->
    <path d="M300 150 C372 150 420 204 421 282 C422 326 416 362 402 392 C388 424 352 462 300 468 C248 462 212 424 198 392 C184 362 178 326 179 282 C180 204 228 150 300 150 Z" fill="url(#dSkin)"/>
    <g clip-path="url(#dFace)">
      <rect x="170" y="140" width="260" height="340" fill="url(#dShade)"/>
      <rect x="170" y="140" width="260" height="340" fill="url(#dAO)"/><rect x="170" y="140" width="260" height="340" fill="url(#dTop)"/>
      <path d="M236 352 C246 380 262 396 282 404 M364 352 C354 380 338 396 318 404" stroke="#7a3a3a" stroke-width="10" fill="none" opacity=".12" stroke-linecap="round"/>
      <ellipse cx="362" cy="240" rx="70" ry="60" fill="url(#dWarm)"/><ellipse cx="366" cy="350" rx="48" ry="44" fill="url(#dWarm)"/>
      <!-- órbitas fundas, maçãs do rosto e sombra do queixo -->
      <ellipse cx="256" cy="298" rx="40" ry="24" fill="#3a1d3c" opacity=".25"/><ellipse cx="344" cy="298" rx="38" ry="22" fill="#5a2d3a" opacity=".14"/>
      <ellipse cx="236" cy="372" rx="20" ry="14" fill="#ff8f86" opacity=".18"/><ellipse cx="366" cy="372" rx="22" ry="15" fill="#ff8f86" opacity=".22"/>
      <path d="M248 448 C276 468 324 468 352 448 C336 470 264 470 248 448 Z" fill="#2a1640" opacity=".35"/>
      <!-- rugas: testa, pés de galinha e o bigode chinês -->
      <g stroke="#8e4f42" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".4">
        <path d="M250 216 C276 208 324 208 350 216"/><path d="M258 228 C282 222 318 222 342 228"/>
        <path d="M210 292 l-11 -7 M211 302 l-13 0 M390 292 l11 -7 M389 302 l13 0"/>
        <path d="M270 360 C254 380 252 396 258 412"/><path d="M330 360 C346 380 348 396 342 412"/>
      </g>
    </g>
    <!-- contorno de luz azul-turquesa (portal) à esquerda e quente à direita -->
    <g clip-path="url(#dFace)"><path d="M296 151 C232 154 184 204 181 282 C180 330 186 366 200 394 C214 424 244 456 286 466" fill="none" stroke="#6ff6ff" stroke-width="12" filter="url(#dGlowW)" opacity=".55"/></g>
    <path d="M330 153 C386 164 418 214 420 282 C421 330 414 364 400 394" fill="none" stroke="#ffcf9e" stroke-width="3" filter="url(#dGlow)" opacity=".7"/>
    <!-- olhos -->
    <g class="dc-eyes">
      <path d="M220 302 C230 272 280 270 294 300 C282 328 234 330 220 302 Z" fill="#efe6dc"/>
      <path d="M306 300 C320 270 370 272 380 302 C366 330 318 328 306 300 Z" fill="#fbf2e8"/>
      <g class="dc-pupils">
        <circle cx="257" cy="301" r="10" fill="#6a8aa8"/><circle cx="257" cy="301" r="10" fill="none" stroke="#1d2f45" stroke-width="2"/><circle cx="257" cy="301" r="4.6" fill="#0b0814"/><circle cx="261" cy="297" r="2.4" fill="#fff"/>
        <circle cx="343" cy="301" r="10" fill="#7a9ab8"/><circle cx="343" cy="301" r="10" fill="none" stroke="#1d2f45" stroke-width="2"/><circle cx="343" cy="301" r="4.6" fill="#0b0814"/><circle cx="347" cy="297" r="2.4" fill="#fff"/>
      </g>
      <g class="dc-lids"><!-- pálpebras fechadas (aparecem só na piscada) -->
        <path d="M216 302 C228 268 282 266 298 300 C284 332 232 334 216 302 Z" fill="#c48a74"/><path d="M224 310 C240 318 270 318 290 310" stroke="#2b141c" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M302 300 C318 266 372 268 384 302 C368 334 316 332 302 300 Z" fill="#eeb08e"/><path d="M310 310 C330 318 360 318 376 310" stroke="#2b141c" stroke-width="3" fill="none" stroke-linecap="round"/>
      </g>
      <path d="M218 300 C230 270 280 268 296 298" stroke="#2b141c" stroke-width="3.8" fill="none" stroke-linecap="round"/>
      <path d="M304 298 C320 268 370 270 382 300" stroke="#2b141c" stroke-width="3.8" fill="none" stroke-linecap="round"/>
      <path d="M226 284 C240 266 272 264 288 280 M312 280 C328 264 360 266 374 284" stroke="#8e4f42" stroke-width="2" fill="none" opacity=".5"/>
      <path d="M232 324 C246 332 268 332 282 324 M318 324 C332 332 354 332 368 324" stroke="#8e4f42" stroke-width="2" fill="none" opacity=".45"/>
    </g>
    <!-- sobrancelhas brancas, espessas, erguidas -->
    <g class="dc-brows">
      <path d="M212 256 C226 224 268 216 294 236 C272 234 244 238 216 262 Z" fill="#f2f4fa" stroke="#9aa3bb" stroke-width="1.5"/>
      <path d="M388 256 C374 224 332 216 306 236 C328 234 356 238 384 262 Z" fill="#fff6ec" stroke="#c9b8a8" stroke-width="1.5"/>
      <g fill="none" stroke-linecap="round">${brow(214, 250, 262, 232, 4, false)}${brow(338, 232, 386, 250, 4, true)}</g>
      <path d="M218 262 C240 244 268 240 292 242 M382 262 C360 244 332 240 308 242" stroke="#5a3240" stroke-width="2.5" fill="none" opacity=".5"/>
      <path d="M296 250 C294 258 294 266 297 274 M306 250 C308 258 308 266 305 274" stroke="#8e4f42" stroke-width="2.2" fill="none" opacity=".45"/>
    </g>
    <!-- nariz -->
    <path d="M294 306 C290 334 284 356 280 370 C288 378 296 380 300 378 Z" fill="#2a1640" opacity=".3"/>
    <path d="M308 312 C311 336 314 354 316 364" stroke="#ffe0c2" stroke-width="3" fill="none" stroke-linecap="round" opacity=".75"/>
    <path d="M284 370 C286 360 294 356 302 358 C312 356 320 362 320 371 C319 380 310 384 302 383 C293 384 284 380 284 370 Z" fill="#e6a587"/>
    <circle cx="309" cy="366" r="3" fill="#ffe6cf" opacity=".8"/>
    <path d="M280 372 C276 380 282 386 290 385 M324 373 C328 380 322 386 314 385" stroke="#8e4f42" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <!-- boca -->
    <g class="dc-mouth">
      <g class="m0"><path d="M270 414 C286 406 316 406 332 414 C326 430 312 438 301 438 C290 438 276 430 270 414 Z" fill="#2c0a14" stroke="#7a2d36" stroke-width="3"/>
        <path d="M276 415 C290 410 312 410 326 415 L324 420 C310 423 292 423 278 420 Z" fill="#efe7dc"/>
        <path d="M282 442 C294 448 308 448 320 442" stroke="#b76a6a" stroke-width="4" fill="none" stroke-linecap="round" opacity=".55"/></g>
      <g class="m1"><path d="M256 404 C282 418 320 418 346 404 C338 442 318 458 301 458 C284 458 264 442 256 404 Z" fill="#2c0a14" stroke="#7a2d36" stroke-width="3"/>
        <path d="M264 410 C288 420 314 420 338 410 L334 422 C314 428 288 428 268 422 Z" fill="#f1e9df"/>
        <ellipse cx="301" cy="448" rx="18" ry="7" fill="#a13f50"/></g>
      <g class="m2"><ellipse cx="301" cy="428" rx="17" ry="22" fill="#2c0a14" stroke="#7a2d36" stroke-width="3.5"/><ellipse cx="301" cy="440" rx="10" ry="6" fill="#a13f50"/></g>
    </g>
    <!-- óculos de proteção na testa (por cima do cabelo da frente) -->

    <path d="M176 200 C226 168 374 168 424 200" stroke="#111216" stroke-width="16" fill="none" stroke-linecap="round"/>
    <path d="M180 194 C228 164 372 164 420 194" stroke="#3a3d47" stroke-width="2.5" fill="none" opacity=".9"/>
    <g class="dc-goggles">
      <path d="M284 180 C292 172 308 172 316 180" stroke="#1d2a22" stroke-width="8" fill="none" stroke-linecap="round"/>
      <circle cx="252" cy="182" r="34" fill="#141a16"/><circle cx="348" cy="182" r="34" fill="#141a16"/>
      <circle cx="252" cy="182" r="26" fill="url(#dLens)"/><circle cx="348" cy="182" r="26" fill="url(#dLens)"/>
      <circle cx="252" cy="182" r="30" fill="none" stroke="#2c4a38" stroke-width="7"/><circle cx="348" cy="182" r="30" fill="none" stroke="#335a44" stroke-width="7"/>
      <circle cx="252" cy="182" r="30" fill="none" stroke="#9fe0b8" stroke-width="1.5" stroke-dasharray="18 170" transform="rotate(200 252 182)" opacity=".7"/>
      <circle cx="348" cy="182" r="30" fill="none" stroke="#ffd2a0" stroke-width="1.5" stroke-dasharray="18 170" transform="rotate(330 348 182)" opacity=".6"/>
      <path d="M236 170 C242 162 252 160 260 163" stroke="#e6fff0" stroke-width="3.5" fill="none" stroke-linecap="round" opacity=".7"/>
      <path d="M332 170 C338 162 348 160 356 163" stroke="#e6fff0" stroke-width="3.5" fill="none" stroke-linecap="round" opacity=".7"/>
    </g>
  </g>
  <!-- a mão que sobe, com o dedo para cima ("eureka!") -->
  <g class="dc-hand">
    <path d="M476 760 C472 700 468 640 466 612 L522 612 C524 640 526 700 532 760 Z" fill="url(#dSuit)"/>
    <path d="M462 604 C458 574 466 552 486 548 C506 546 522 556 524 578 C526 596 518 606 500 610 C482 612 466 612 462 604 Z" fill="#e8ad8c"/>
    <path d="M484 552 C482 520 482 488 488 470 C492 460 502 460 504 472 C508 492 506 524 504 552 Z" fill="#f2bc98" stroke="#b46d55" stroke-width="2"/>
    <path d="M466 580 C450 572 446 556 456 552 C464 550 472 560 476 570" fill="#d89a7c" stroke="#b46d55" stroke-width="2"/>
    <path d="M486 470 C486 480 486 520 486 552" stroke="#6ff6ff" stroke-width="2.4" opacity=".7"/>
    <rect x="463" y="604" width="62" height="16" rx="5" fill="url(#dWatch)" stroke="#4a4f5c" stroke-width="1.5"/>
    <circle cx="494" cy="612" r="14" fill="#e9ecf2" stroke="#6b7280" stroke-width="3"/><path d="M494 612 V603 M494 612 L501 615" stroke="#1d2230" stroke-width="2" stroke-linecap="round"/>
  </g>
</svg>`;
  }

  // silhueta de corpo inteiro contra a luz (plano geral da chegada, no meio da fumaça)
  function silhouette() {
    seed = 2027;
    const M = mane(150, 112, .27, 7);
    return `<svg class="doc-sil" viewBox="0 0 300 640" aria-hidden="true">
  <g fill="#05030a">
    <path d="${M.d}"/>
    <g stroke="#05030a" fill="none">${wisps(150, 112, .27, M.R, 60).replace(/stroke="#f4f7ff"/g, '')}</g>
    <ellipse cx="150" cy="112" rx="33" ry="41"/>
    <path d="M134 146 h32 v26 h-32 Z"/>
    <path d="M66 182 C88 160 212 160 234 182 L252 300 L266 476 L172 476 L150 392 L128 476 L34 476 L48 300 Z"/>
    <path d="M70 186 C48 246 40 306 46 368 C48 380 62 382 66 370 C64 312 72 256 92 206 Z"/>
    <path d="M230 186 C252 246 260 306 254 368 C252 380 238 382 234 370 C236 312 228 256 208 206 Z"/>
    <path d="M118 470 L110 628 L140 628 L148 470 Z M152 470 L160 628 L190 628 L182 470 Z"/>
    <path d="M102 624 h44 v12 h-48 Z M156 624 h44 v12 h-48 Z"/>
  </g>
</svg>`;
  }

  window.DocRetrato = { portrait, silhouette };
})();
