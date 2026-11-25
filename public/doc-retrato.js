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
    const back = locks({ ...head, from: 145, to: 395, n: 30, len: [70, 135], width: [24, 40], curl: 80 });
    const front = locks({ ...head, rx: 112, ry: 104, from: 200, to: 340, n: 14, len: [36, 70], width: [16, 26], curl: 90 });
    const tufts = [...locks({ cx: 196, cy: 320, rx: 16, ry: 34, from: 125, to: 235, n: 8, len: [46, 92], width: [18, 28], curl: 70 }),
      ...locks({ cx: 404, cy: 320, rx: 16, ry: 34, from: -55, to: 55, n: 8, len: [46, 92], width: [18, 28], curl: 70 })];
    const lockFill = (l, layer) => {
      const left = Math.cos(l.a * Math.PI / 180) < -.15, right = Math.cos(l.a * Math.PI / 180) > .15;
      return `<path d="${l.d}" fill="url(#${layer})" stroke="${left ? 'rgba(110,240,255,.55)' : right ? 'rgba(255,190,130,.45)' : 'rgba(200,210,235,.35)'}" stroke-width="1.6"/>`;
    };
    return `<svg class="doc-svg" viewBox="0 0 600 760" aria-hidden="true">
  <defs>
    <linearGradient id="dHairB" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#e9edf6"/><stop offset="1" stop-color="#7d86a3"/></linearGradient>
    <linearGradient id="dHairF" x1="0" x2="1"><stop offset="0" stop-color="#cfe9f2"/><stop offset=".5" stop-color="#ffffff"/><stop offset="1" stop-color="#ffe2c4"/></linearGradient>
    <linearGradient id="dSkin" x1="0" x2="1"><stop offset="0" stop-color="#b98473"/><stop offset=".45" stop-color="#e3a98a"/><stop offset="1" stop-color="#f6c39b"/></linearGradient>
    <linearGradient id="dCoat" x1="0" x2="1"><stop offset="0" stop-color="#5d6684"/><stop offset=".5" stop-color="#c9cfdf"/><stop offset="1" stop-color="#f6e2cf"/></linearGradient>
    <linearGradient id="dLapel" x1="0" x2="1"><stop offset="0" stop-color="#3f4763"/><stop offset="1" stop-color="#d9c8ba"/></linearGradient>
    <radialGradient id="dLens" cx=".38" cy=".35" r=".7"><stop offset="0" stop-color="#e8ffff"/><stop offset=".35" stop-color="#4ff0f0"/><stop offset=".8" stop-color="#0b6874"/><stop offset="1" stop-color="#062c33"/></radialGradient>
    <radialGradient id="dWarm" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd8b0" stop-opacity=".75"/><stop offset="1" stop-color="#ffd8b0" stop-opacity="0"/></radialGradient>
    <linearGradient id="dShade" x1="0" x2="1"><stop offset="0" stop-color="#2a1640" stop-opacity=".7"/><stop offset=".4" stop-color="#2a1640" stop-opacity=".18"/><stop offset=".6" stop-color="#2a1640" stop-opacity="0"/></linearGradient>
    <filter id="dGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
    <filter id="dGlowW" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>
    <radialGradient id="dAO" cx=".56" cy=".44" r=".62"><stop offset=".62" stop-color="#2a1640" stop-opacity="0"/><stop offset="1" stop-color="#2a1640" stop-opacity=".55"/></radialGradient>
    <linearGradient id="dTop" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#2a1640" stop-opacity=".35"/><stop offset=".22" stop-color="#2a1640" stop-opacity="0"/></linearGradient>
    <clipPath id="dFace"><path d="M300 150 C372 150 420 204 421 282 C422 326 416 362 402 392 C388 424 352 462 300 468 C248 462 212 424 198 392 C184 362 178 326 179 282 C180 204 228 150 300 150 Z"/></clipPath>
  </defs>
  <!-- cabelo de trás -->
  <g class="dc-hair">${back.map(l => lockFill(l, 'dHairB')).join('')}${tufts.map(l => lockFill(l, 'dHairB')).join('')}</g>
  <!-- jaleco, camisa e gravata -->
  <g class="dc-body">
    <!-- pescoço -->
    <path d="M254 428 C254 466 250 496 242 522 L358 522 C350 496 346 466 346 428 Z" fill="url(#dSkin)"/>
    <path d="M254 428 C254 466 250 496 242 522 L290 522 C282 494 280 466 284 446 Z" fill="#2a1640" opacity=".4"/>
    <path d="M20 760 C30 640 100 548 212 510 L300 562 L388 510 C500 548 570 640 580 760 Z" fill="url(#dCoat)"/>
    <path d="M230 498 L300 564 L370 498 L362 760 L238 760 Z" fill="#24142c"/>
    <path d="M244 494 L300 548 L280 560 L232 506 Z" fill="#dfe3ee"/><path d="M356 494 L300 548 L320 560 L368 506 Z" fill="#f6ead9"/>
    <path d="M212 510 L300 566 L262 760 L140 760 C170 680 192 590 212 510 Z" fill="url(#dLapel)"/>
    <path d="M388 510 L300 566 L338 760 L460 760 C430 680 408 590 388 510 Z" fill="url(#dLapel)"/>
    <path d="M212 510 L300 566 L262 760" fill="none" stroke="rgba(110,240,255,.55)" stroke-width="2"/>
    <path d="M388 510 L300 566 L338 760" fill="none" stroke="rgba(255,205,160,.75)" stroke-width="2"/>
    <path d="M96 690 C126 646 160 626 192 616 M480 680 C458 650 426 632 402 626" stroke="rgba(30,25,50,.3)" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M272 552 L300 564 L272 578 Z M328 552 L300 564 L328 578 Z" fill="#16958f" stroke="#0a4d4a" stroke-width="2"/>
    <path d="M328 554 L314 564" stroke="#8ff6ee" stroke-width="2"/><circle cx="300" cy="564" r="6" fill="#0c5f5b"/>
    <g class="dc-pens"><rect x="112" y="652" width="58" height="8" rx="3" fill="#2a2f45"/><path d="M124 652 v-26" stroke="#ff2d95" stroke-width="6" stroke-linecap="round"/><path d="M138 652 v-32" stroke="#2ee6d6" stroke-width="6" stroke-linecap="round"/><path d="M152 652 v-22" stroke="#ffd21f" stroke-width="6" stroke-linecap="round"/></g>
    <g class="dc-badge"><rect x="420" y="640" width="46" height="54" rx="7" fill="#140b24" stroke="#ffd21f" stroke-width="2.5"/><path d="M430 650 L443 668 L456 650 M443 668 V684" stroke="#ffd21f" stroke-width="4" stroke-linecap="round" fill="none"/></g>
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
        <path d="M246 222 C272 214 328 214 354 222"/><path d="M256 236 C280 230 320 230 344 236"/>
        <path d="M210 292 l-11 -7 M211 302 l-13 0 M390 292 l11 -7 M389 302 l13 0"/>
        <path d="M270 360 C254 380 252 396 258 412"/><path d="M330 360 C346 380 348 396 342 412"/>
      </g>
    </g>
    <!-- contorno de luz azul-turquesa (portal) à esquerda e quente à direita -->
    <g clip-path="url(#dFace)"><path d="M296 151 C232 154 184 204 181 282 C180 330 186 366 200 394 C214 424 244 456 286 466" fill="none" stroke="#6ff6ff" stroke-width="12" filter="url(#dGlowW)" opacity=".55"/></g>
    <path d="M330 153 C386 164 418 214 420 282 C421 330 414 364 400 394" fill="none" stroke="#ffcf9e" stroke-width="3" filter="url(#dGlow)" opacity=".7"/>
    <!-- olhos -->
    <g class="dc-eyes">
      <path d="M224 302 C236 282 274 280 288 300 C274 318 238 320 224 302 Z" fill="#efe6dc"/>
      <path d="M312 300 C326 280 364 282 376 302 C362 320 326 318 312 300 Z" fill="#fbf2e8"/>
      <g class="dc-pupils">
        <circle cx="258" cy="300" r="11" fill="#5b7fa3"/><circle cx="258" cy="300" r="11" fill="none" stroke="#1d2f45" stroke-width="2"/><circle cx="258" cy="300" r="5" fill="#0b0814"/><circle cx="262" cy="296" r="2.6" fill="#fff"/>
        <circle cx="344" cy="300" r="11" fill="#6c90b4"/><circle cx="344" cy="300" r="11" fill="none" stroke="#1d2f45" stroke-width="2"/><circle cx="344" cy="300" r="5" fill="#0b0814"/><circle cx="348" cy="296" r="2.6" fill="#fff"/>
      </g>
      <g class="dc-lids"><!-- pálpebras fechadas (aparecem só na piscada) -->
        <path d="M220 301 C236 277 274 275 292 299 C274 319 238 321 220 301 Z" fill="#c48a74"/><path d="M226 306 C242 314 268 314 286 306" stroke="#2b141c" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M308 299 C326 275 364 277 380 301 C362 321 326 319 308 299 Z" fill="#eeb08e"/><path d="M314 306 C332 314 358 314 374 306" stroke="#2b141c" stroke-width="3" fill="none" stroke-linecap="round"/>
      </g>
      <path d="M222 300 C236 279 274 277 290 298" stroke="#2b141c" stroke-width="3.8" fill="none" stroke-linecap="round"/>
      <path d="M310 298 C326 277 364 279 378 300" stroke="#2b141c" stroke-width="3.8" fill="none" stroke-linecap="round"/>
      <path d="M234 318 C246 325 266 325 278 318 M322 318 C334 325 354 325 366 318" stroke="#8e4f42" stroke-width="2" fill="none" opacity=".45"/>
    </g>
    <!-- sobrancelhas brancas, espessas, erguidas -->
    <g class="dc-brows">
      <path d="M218 268 C232 242 266 234 290 250 C270 248 244 252 222 274 Z" fill="#f2f4fa" stroke="#9aa3bb" stroke-width="1.5"/>
      <path d="M382 268 C368 242 334 234 310 250 C330 248 356 252 378 274 Z" fill="#fff6ec" stroke="#c9b8a8" stroke-width="1.5"/>
      <g fill="none" stroke-linecap="round">${brow(220, 262, 262, 248, 4, false)}${brow(338, 248, 380, 262, 4, true)}</g>
      <path d="M224 274 C244 258 268 254 288 256 M376 274 C356 258 332 254 312 256" stroke="#5a3240" stroke-width="2.5" fill="none" opacity=".5"/>
    </g>
    <!-- nariz -->
    <path d="M294 306 C290 334 284 356 280 370 C288 378 296 380 300 378 Z" fill="#2a1640" opacity=".3"/>
    <path d="M308 312 C311 336 314 354 316 364" stroke="#ffe0c2" stroke-width="3" fill="none" stroke-linecap="round" opacity=".75"/>
    <path d="M284 370 C286 360 294 356 302 358 C312 356 320 362 320 371 C319 380 310 384 302 383 C293 384 284 380 284 370 Z" fill="#e6a587"/>
    <circle cx="309" cy="366" r="3" fill="#ffe6cf" opacity=".8"/>
    <path d="M280 372 C276 380 282 386 290 385 M324 373 C328 380 322 386 314 385" stroke="#8e4f42" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <!-- boca -->
    <g class="dc-mouth">
      <g class="m0"><path d="M258 406 C280 424 322 424 344 406" stroke="#6b2430" stroke-width="4.5" fill="none" stroke-linecap="round"/>
        <path d="M272 422 C290 432 312 432 330 422" stroke="#b76a6a" stroke-width="5" fill="none" stroke-linecap="round" opacity=".6"/>
        <path d="M254 402 l-5 -6 M348 402 l5 -6" stroke="#8e4f42" stroke-width="2.6" stroke-linecap="round"/></g>
      <g class="m1"><path d="M256 404 C282 418 320 418 346 404 C338 442 318 458 301 458 C284 458 264 442 256 404 Z" fill="#2c0a14" stroke="#7a2d36" stroke-width="3"/>
        <path d="M264 410 C288 420 314 420 338 410 L334 422 C314 428 288 428 268 422 Z" fill="#f1e9df"/>
        <ellipse cx="301" cy="448" rx="18" ry="7" fill="#a13f50"/></g>
      <g class="m2"><ellipse cx="301" cy="428" rx="17" ry="22" fill="#2c0a14" stroke="#7a2d36" stroke-width="3.5"/><ellipse cx="301" cy="440" rx="10" ry="6" fill="#a13f50"/></g>
    </g>
    <!-- óculos de proteção na testa (por cima do cabelo da frente) -->
    <g class="dc-hairf">${front.filter(l => Math.sin(l.a * Math.PI / 180) < -.25).map(l => lockFill(l, 'dHairF')).join('')}</g>
    <path d="M176 206 C226 174 374 174 424 206" stroke="#3b2214" stroke-width="20" fill="none" stroke-linecap="round"/>
    <path d="M180 200 C228 170 372 170 420 200" stroke="#8a5a36" stroke-width="3" fill="none" opacity=".8"/>
    <g class="dc-goggles">
      <rect x="290" y="178" width="20" height="12" rx="4" fill="#9a7020"/>
      <circle cx="254" cy="186" r="34" fill="#1b130a"/><circle cx="346" cy="186" r="34" fill="#1b130a"/>
      <circle cx="254" cy="186" r="28" fill="url(#dLens)"/><circle cx="346" cy="186" r="28" fill="url(#dLens)"/>
      <circle cx="254" cy="186" r="31" fill="none" stroke="#d6a43a" stroke-width="6"/><circle cx="346" cy="186" r="31" fill="none" stroke="#e8b84a" stroke-width="6"/>
      <circle cx="254" cy="186" r="31" fill="none" stroke="#fff1c4" stroke-width="1.5" stroke-dasharray="20 160" transform="rotate(200 254 186)"/>
      <path d="M236 172 C242 164 254 162 262 166" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity=".85"/>
      <path d="M328 172 C334 164 346 162 354 166" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity=".85"/>
      <circle cx="254" cy="186" r="28" fill="#4ff0f0" opacity=".25" filter="url(#dGlow)" class="dc-lensglow"/><circle cx="346" cy="186" r="28" fill="#4ff0f0" opacity=".25" filter="url(#dGlow)" class="dc-lensglow"/>
    </g>
  </g>
  <!-- a mão que sobe, com o dedo para cima ("eureka!") -->
  <g class="dc-hand">
    <path d="M478 760 C474 700 470 640 468 600 L520 600 C522 640 524 700 530 760 Z" fill="url(#dCoat)"/>
    <path d="M462 604 C458 574 466 552 486 548 C506 546 522 556 524 578 C526 596 518 606 500 610 C482 612 466 612 462 604 Z" fill="#e8ad8c"/>
    <path d="M484 552 C482 520 482 488 488 470 C492 460 502 460 504 472 C508 492 506 524 504 552 Z" fill="#f2bc98" stroke="#b46d55" stroke-width="2"/>
    <path d="M466 580 C450 572 446 556 456 552 C464 550 472 560 476 570" fill="#d89a7c" stroke="#b46d55" stroke-width="2"/>
    <path d="M486 470 C486 480 486 520 486 552" stroke="#6ff6ff" stroke-width="2.4" opacity=".7"/>
  </g>
</svg>`;
  }

  // silhueta de corpo inteiro contra a luz (plano geral da chegada, no meio da fumaça)
  function silhouette() {
    seed = 2027;
    const hair = locks({ cx: 150, cy: 104, rx: 34, ry: 32, from: 145, to: 395, n: 32, len: [22, 62], width: [9, 15], curl: 90 });
    return `<svg class="doc-sil" viewBox="0 0 300 640" aria-hidden="true">
  <g fill="#05030a">
    <ellipse cx="150" cy="106" rx="40" ry="38"/>
    ${hair.map(l => `<path d="${l.d}"/>`).join('')}
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
