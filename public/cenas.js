/* ===== Cenas do deck do townhall no telão =====
 * O conteúdo do deck "CDIO HC + BPC · 2026 Townhall" (agenda v18), em INGLÊS (como no deck) e com a cara do app:
 * vídeo de abertura, boas-vindas, nuvem de palavras (duas perguntas), plano de voo, Estratégia 2026, almanaque 2026, reconhecimento
 * (prêmios), intervalo, Visão 2027 (a estratégia, no arquivo original) e 88 MPH. ("IA em 2026" e "Manifesto 2027" continuam
 * disponíveis como cenas avulsas, mas no roteiro padrão são os próprios blocos Reflexão e Sucesso.)
 * O telão segue o estado do servidor: quem comanda é o Painel do Doc (server/cenas.js guarda conteúdo e estado).
 *   Cenas.html(state) → HTML da cena · Cenas.mount(el, state, hooks) · Cenas.update(state) · Cenas.unmount()
 *   Cenas.tick() (a cada 0,5 s) · Cenas.pulse(p) (carga do Flux Capacitor) · Cenas.calm(state) · Cenas.info(state)
 *   Cenas.videos() → quais vídeos (abertura, tributo) já estão carregados neste telão
 */
window.Cenas = (() => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fire = s => esc(s).replace(/\*([^*]+)\*/g, '<span class="fire">$1</span>'); // *palavras* em destaque
  const plain = s => String(s ?? '').replace(/\*/g, '');
  const ini = n => String(n || '?').replace('&', ' ').trim().split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const pad = n => String(n).padStart(2, '0');
  const fmt = s => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  const ACT_C = ['var(--cyan)', 'var(--orange)', 'var(--yellow)', 'var(--green)'];
  const BU_C = { HC: 'var(--green)', BPC: 'var(--cyan)', X: '#b08cff' };
  const TIPO_C = { E: 'var(--green)', M: 'var(--cyan)', R: 'var(--yellow)', C: '#b08cff' };
  const ICO = { i: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>', c: '<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M2 20c1-3.5 3.5-5 6-5s5 1.5 6 5M10 20c1-3.5 3.5-5 6-5s5 1.5 6 5"/>',
    b: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z"/>', f: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' };
  // a DeLorean do deck (desenho simples, de perfil): só entra na linha do tempo do almanaque se o carro 3D não puder ser desenhado
  const CAR = `<g transform="translate(340 0) scale(-1 1)"><path d="M10 72 L28 52 L120 44 L168 18 L236 16 L292 40 L328 48 L332 74 L10 78Z" fill="#a9b1bd" stroke="#3a3f4a" stroke-width="1.5"/><path d="M176 24 L232 22 L270 42 L160 44Z" fill="#1b2433" stroke="#3a3f4a"/>
    <rect x="44" y="58" width="260" height="3" fill="#59606c"/><path d="M300 54 h28 v8 h-28z" fill="#ff3b5c" opacity=".8"/><path d="M12 58 h20 v6 h-20z" fill="#fff3c4"/>
    <circle cx="80" cy="80" r="18" fill="#15181e"/><circle cx="80" cy="80" r="9" fill="#9aa2ad"/><circle cx="262" cy="80" r="19" fill="#15181e"/><circle cx="262" cy="80" r="9" fill="#9aa2ad"/></g>`;
  const FLUX = '<div class="flux"><i></i><i></i><i></i><b></b></div>';
  // rosto de quem aparece na cena: a foto de perfil (até duas, para duplas como "Giovana & Lucas") ou as iniciais
  const faces = x => { const f = (x && x.fotos) || []; return f.length ? `<div class="avs">${f.map(u => `<div class="av foto">${f.length === 1 ? esc(ini(x.nome)) : ''}<img src="${esc(u)}" alt=""></div>`).join('')}</div>` : `<div class="av">${esc(ini(x && x.nome))}</div>`; };
  document.addEventListener('error', e => { const t = e.target; if (t && t.tagName === 'IMG' && t.parentNode && t.parentNode.classList.contains('av')) { t.parentNode.classList.remove('foto'); t.remove(); } }, true);

  /* Vídeos (abertura e tributo): o arquivo arrastado para a tela fica guardado NESTE navegador (IndexedDB). Recarregar a
   * página, fechar o telão ou trocar de cena não perde o vídeo: ele só sai se outro for arrastado ou em "remover". */
  const Vid = (() => {
    const mem = {}, has = {};
    const open = () => new Promise((res, rej) => { const r = indexedDB.open('bttf-telao', 1); r.onupgradeneeded = () => r.result.createObjectStore('videos'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('videos', mode), q = fn(t.objectStore('videos')); t.oncomplete = () => { db.close(); res(q && q.result); }; t.onerror = t.onabort = () => { db.close(); rej(t.error); }; }); };
    return {
      has, // { abertura: true, tributo: true }: o que este telão já tem carregado (o Painel do Doc mostra)
      async get(k) { if (mem[k]) return mem[k]; try { const f = await tx('readonly', o => o.get(k)); if (f) { mem[k] = f; has[k] = true; } return f || null; } catch { return null; } },
      async set(k, f) { mem[k] = f; has[k] = true; try { await tx('readwrite', o => o.put(f, k)); return true; } catch { return false; } },
      async del(k) { delete mem[k]; delete has[k]; try { await tx('readwrite', o => o.delete(k)); } catch { /* segue */ } },
    };
  })();
  for (const k of ['abertura', 'tributo']) Vid.get(k); // já descobre o que está guardado (para avisar o painel antes de a cena entrar)
  const isVideo = f => !!f && /^video\//.test(f.type || 'video/');
  const mb = f => (f && f.size ? ` · ${f.size >= 1048576 ? (f.size / 1048576).toFixed(0) + ' MB' : Math.max(1, Math.round(f.size / 1024)) + ' KB'}` : '');

  let root = null, st = null, kind = null, hooks = {}, timers = [], L = {}, sig = '', offset = 0;
  const now = () => Date.now() + offset;
  const later = (ms, fn) => { const t = setTimeout(fn, Math.max(0, ms)); timers.push(t); return t; };
  const every = (ms, fn) => { const t = setInterval(fn, ms); timers.push(t); return t; };
  const sfx = (...a) => { if (window.Trilha) Trilha.sfx(...a); };
  const flash = () => { if (hooks.flash) hooks.flash(); };
  const cena = () => (st && st.cena) || null;

  /* ---------- peças ---------- */
  const head = (c, kick) => `<div class="cn-head">${c.ato ? `<span class="cn-act" style="--c:${ACT_C[c.ato.k]}">${esc(c.ato.n)}</span>` : ''}<span class="cn-kick">${esc(String(kick || c.kicker || '').toUpperCase())}</span></div>`;
  const chip = (html, c) => `<span class="cn-chip" ${c ? `style="--c:${c}"` : ''}><i></i>${html}</span>`;
  const strip = t => (t ? `<div class="cn-strip">${esc(t)}</div>` : '');
  // quem conduz o bloco: placas com a foto de perfil e o nome (vêm do servidor, em c.hosts)
  const hostsRow = (c, cls = '', label = 'WITH') => { const h = (c && c.hosts) || []; return h.length ? `<div class="hosts ${cls}">${label ? `<small>${label}</small>` : ''}${h.map(x => `<div class="host"><div class="av ${x.foto ? 'foto' : ''}">${esc(ini(x.nome))}${x.foto ? `<img src="${esc(x.foto)}" alt="">` : ''}</div><b>${esc(x.nome)}</b></div>`).join('')}</div>` : ''; };
  const who = c => `<div class="cn-chips">${c.quem ? chip(`With <b>${esc(c.quem)}</b>`, c.ato ? ACT_C[c.ato.k] : '') : ''}</div>`; // (sem os minutos do bloco)
  // Capa de bloco: o ato, o nome do bloco em letras do logo, a frase e quem conduz (placas com a foto), com a DeLorean na estrada
  const cover = (c, { title, sub = '', label = 'WITH', note = '' }) => `<div class="cv"><div class="cv-txt">${head(c)}<i class="cv-arrow"></i>
      <h1 class="cv-title ${plain(title).length > 22 ? 'long' : ''}"><span class="bttf">${esc(plain(title))}</span></h1>
      ${sub ? `<p class="cv-sub">${esc(sub)}</p>` : ''}${hostsRow(c, 'stack cv-hosts', label)}${note ? `<div class="cv-note">${note}</div>` : ''}</div>
    <div class="carbox cv-car"><canvas class="car3d" data-car></canvas></div></div>`;
  function coverLive(first) { // a DeLorean da capa fica carregada e soltando faíscas
    if (!first) return;
    const hero = () => (hooks.car ? hooks.car() : null);
    later(300, () => { const h = hero(); if (h && h.setEnergy) h.setEnergy(.6); });
    every(1300, () => { const h = hero(); if (h && h.spark && !document.hidden) h.spark(); });
  }
  function qrBox() {
    const url = location.origin + '/'; let svg = '';
    try { const q = qrcode(0, 'M'); q.addData(url); q.make(); svg = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); } catch { svg = ''; }
    return `<div class="cn-qr">${svg ? `<div class="qr">${svg}</div>` : ''}<small>OPEN THE APP ON YOUR PHONE</small><b>${esc(url.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</b></div>`;
  }
  function typeTo(el, text, ms = 45) { if (!el) return; let i = 0; el.textContent = ''; const iv = every(ms, () => { el.textContent = text.slice(0, ++i); if (i >= text.length) clearInterval(iv); }); }
  function scramble(el, text, ms = 600) {
    if (!el) return; let n = 0; const ch = 'ABCDEFGHJKLMNOPRSTUVXYZ0123456789';
    const iv = every(30, () => { el.textContent = [...text].map((c, k) => (k < n || c === ' ' ? c : ch[Math.floor(Math.random() * ch.length)])).join(''); n += text.length / (ms / 30); if (n >= text.length) { clearInterval(iv); el.textContent = text; } });
  }
  // confete (o mesmo do deck), num canvas por cima da cena
  function confetti(n = 200, ox = .5, oy = .48) {
    let cv = $('#cnConfetti');
    if (!cv) { cv = document.createElement('canvas'); cv.id = 'cnConfetti'; cv.className = 'cn-confetti'; document.body.appendChild(cv); }
    const W = cv.width = innerWidth, H = cv.height = innerHeight, x = cv.getContext('2d'), P = [], k0 = W / 1600;
    for (let i = 0; i < n; i++) P.push({ x: ox * W, y: oy * H, vx: (Math.random() - .5) * 30 * k0, vy: (Math.random() * -24 - 4) * k0, s: (Math.random() * 9 + 4) * k0, c: ['#ffd21f', '#ff6a00', '#2ee6d6', '#ff2d95', '#fff', '#39ff6a'][i % 6], r: Math.random() * 6 });
    let k = 0; const run = ++confetti.run;
    (function a() {
      x.clearRect(0, 0, W, H);
      if (run !== confetti.run || !cv.isConnected) return;
      for (const p of P) { p.x += p.vx; p.y += p.vy; p.vy += .6 * k0; p.vx *= .985; p.r += .2; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); x.restore(); }
      if (k++ < 150) requestAnimationFrame(a); else x.clearRect(0, 0, W, H);
    })();
  }
  confetti.run = 0;

  /* ================= VÍDEO DE ABERTURA =================
   * Antes de tocar, o telão mostra o cartão do evento. O vídeo vem do endereço configurado no painel ou do arquivo
   * arrastado para esta tela (fica guardado neste navegador). O Doc toca, pausa e recomeça pelo painel; no fim, o telão
   * avisa o painel e volta para o cartão. */
  function vAbertura(c) {
    return `<div class="ab-card" id="abCard">${FLUX}${head(c)}<h1 class="ab-title"><span class="bttf">${esc(plain(c.titulo))}</span></h1><p class="cn-sub">${esc(c.sub)}</p>
        <div class="ab-hint" id="abHint"></div></div>
      <video class="ab-video" id="abVideo" playsinline preload="auto"></video>
      <input type="file" id="abFile" accept="video/*" hidden>`;
  }
  function mAbertura(c, first) {
    const v = $('#abVideo'), hint = $('#abHint'), l = c.live || {}; if (!v) return;
    const has = () => !!v.getAttribute('src');
    const paint = () => { // o que quem opera o telão vê no cartão (some quando o vídeo está tocando)
      const f = L.abFile;
      hint.innerHTML = has() ? `<b>🎬 OPENING VIDEO READY</b><small>${f ? `${esc(f.name || 'video')}${mb(f)} · ${L.abSaved === false ? 'loaded for now, but this browser could not save it: keep this page open' : 'saved in this browser'} · <a href="#" id="abDel">remove</a>` : 'from the address set in the control panel'}</small>${L.abBlocked ? '<em>CLICK THE SCREEN TO START THE VIDEO</em>' : ''}`
        : '<b>DRAG &amp; DROP THE OPENING VIDEO HERE</b><small>or click anywhere to choose the file · it stays saved in this browser</small>';
      const del = $('#abDel'); if (del) del.onclick = e => { e.preventDefault(); e.stopPropagation(); Vid.del('abertura').then(() => { L.abFile = null; v.removeAttribute('src'); v.load(); paint(); hooks.report && hooks.report(); }); };
    };
    const full = on => { root.classList.toggle('playing', on); document.body.classList.toggle('ab-playing', on); }; // em tela cheia: sem o relógio e as linhas de TV por cima
    const play = () => { if (!has()) return; full(true); const p = v.play(); if (p && p.catch) p.catch(() => { L.abBlocked = true; full(false); paint(); }); }; // sem um clique na tela, o navegador não deixa tocar com som
    const apply = () => {
      const cur = cena(); if (!cur || cur.kind !== 'abertura') return; const s = cur.live || {};
      if (L.abAt !== s.at) { L.abAt = s.at; try { v.currentTime = 0; } catch { /* ainda carregando */ } }
      if (s.play && has()) play(); else { v.pause(); full(false); }
    };
    if (first) {
      L.abAt = l.at; L.abBlocked = false; L.abFile = null;
      const load = f => { if (!isVideo(f)) return; if (L.vurl) URL.revokeObjectURL(L.vurl); L.vurl = URL.createObjectURL(f); L.abFile = f; v.src = L.vurl; paint(); apply(); };
      const pick = f => { if (!isVideo(f)) return; load(f); Vid.set('abertura', f).then(ok => { L.abSaved = ok; paint(); if (hooks.report) hooks.report(); }); }; // se o navegador não conseguir guardar (arquivo grande demais), o telão avisa
      ['dragenter', 'dragover'].forEach(t => root.addEventListener(t, e => { e.preventDefault(); root.classList.add('drag'); }));
      ['dragleave', 'drop'].forEach(t => root.addEventListener(t, () => root.classList.remove('drag')));
      root.addEventListener('drop', e => { e.preventDefault(); pick(e.dataTransfer.files[0]); });
      $('#abFile').addEventListener('change', e => pick(e.target.files[0]));
      root.addEventListener('click', () => { if (L.abBlocked) { L.abBlocked = false; paint(); return apply(); } if (!has()) $('#abFile').click(); });
      v.addEventListener('play', () => hooks.duck && hooks.duck(true));
      ['pause', 'ended'].forEach(t => v.addEventListener(t, () => hooks.duck && hooks.duck(false)));
      v.addEventListener('ended', () => { full(false); if (hooks.emit) hooks.emit('cena:fim', { kind: 'abertura' }); });
      v.addEventListener('error', () => { if (has() && !L.abFile) { hint.innerHTML = '<b>THE VIDEO ADDRESS DID NOT LOAD</b><small>drag &amp; drop the file here instead</small>'; full(false); } });
      if (c.video) { v.src = c.video; paint(); apply(); }
      else { paint(); Vid.get('abertura').then(f => { if (f && v.isConnected && !has()) load(f); }); }
      return;
    }
    apply();
  }

  /* ================= PLANO DE VOO ================= */
  function vAgenda(c) {
    const [h, m] = c.inicio.split(':').map(Number), start = h * 60 + m, f = x => `${pad(Math.floor(x / 60) % 24)}:${pad(x % 60)}`, ticks = [];
    for (let t = 0; t <= c.total; t += 30) ticks.push(t);
    return `<div class="cn-top"><div>${head(c)}<h1 class="cn-h1">${fire(c.titulo)}</h1></div>
        <div class="cn-meta">${[['DATE', c.data], ['START', c.inicio], ['END', c.fim], ['ACTS', c.atos.length]].map(([l, v]) => `<div class="tcbox"><b>${esc(v)}</b><span>${l}</span></div>`).join('')}</div></div>
      <div class="ag-bar">${c.itens.map(x => `<i style="flex:${x.min};--c:${ACT_C[x.ato - 1]}"></i>`).join('')}</div>
      <div class="ag-scale">${ticks.map(t => `<span style="left:${t / c.total * 100}%">${f(start + t)}</span>`).join('')}</div>
      <div class="ag-acts">${c.atos.map((a, k) => `<div class="ag-act" style="--c:${ACT_C[k]}"><div class="n">${esc(a.n)}</div><h3>${esc(a.nome)}</h3><div class="r">${a.de} – ${a.ate}</div>
        ${c.itens.map((x, i) => (x.ato === k + 1 ? `<div class="ag-it" data-i="${i}"><span class="tm">${x.hora}</span><span class="tx"><b>${esc(x.t)}${x.fone ? ' <i class="fone" title="On your phone">📱</i>' : ''}</b><small>${esc(x.d)}</small></span></div>` : '')).join('')}</div>`).join('')}</div>
      <div class="ag-note">📱 = happens on your phone, in the app</div>`;
  }
  // Nenhum item fica marcado como "no ar": um destaque suave passeia por todos, um de cada vez, do começo ao fim do dia
  function mAgenda(c, first) {
    if (!first) return;
    const its = $$('.cn-agenda .ag-it'), bar = $$('.cn-agenda .ag-bar i'); if (!its.length) return;
    let i = -1; const step = () => { i = (i + 1) % its.length; its.forEach((el, k) => el.classList.toggle('sp', +el.dataset.i === i)); bar.forEach((el, k) => el.classList.toggle('sp', k === i)); };
    later(900, step); every(2600, step);
  }

  /* ================= BOAS-VINDAS ================= */
  function vBoasvindas(c) {
    let on = false, i = 0;
    const words = String(c.frase || '').split(/\s+/).filter(Boolean).map(w => { // palavra por palavra, com as *destacadas* em chamas
      const open = w.startsWith('*'), close = /\*[.,;:!?…]*$/.test(w); if (open) on = true;
      const html = `<span class="w ${on ? 'fire' : ''}" style="--i:${i++}">${esc(w.replace(/\*/g, ''))}</span>`; if (close) on = false; return html;
    }).join(' ');
    return `${head(c)}<div class="bv-quote">${words}</div>
      <div class="bv-people">${(c.pessoas || []).map(p => `<div class="cn-person">${faces(p)}<div><b>${esc(p.nome)}</b><small>${esc(p.papel)}</small></div></div>`).join('')}</div>
      ${strip(c.faixa)}`;
  }

  /* ================= NUVEM DE PALAVRAS · DUAS PERGUNTAS =================
   * Logo depois das boas-vindas: os celulares mostram as duas perguntas (texto livre) e cada uma forma a sua nuvem no telão.
   * No painel o Doc pode dar destaque a uma pergunta por vez (foco). */
  function vNuvem(c) {
    const q = c.perguntas || [];
    return `<div class="cn-top nv-top"><div>${head(c)}<h1 class="cn-h1">${fire(c.titulo)}</h1></div>
        <div class="nv-side"><div class="nv-call"><span>📱</span><div><b>NOT ANSWERED YET?</b><small>answer now on your phone · it goes straight to the cloud</small></div></div>
          <div class="nv-n"><b id="nvCount">0</b><small>ANSWERS</small></div></div></div>
      <div class="nv-grid" id="nvGrid" data-foco="0">${q.map((t, i) => `<div class="nv-box" data-i="${i + 1}" style="--c:${i ? 'var(--orange)' : 'var(--cyan)'}">
        <div class="nv-q"><b>${i + 1}</b><span>${esc(t)}</span></div><canvas id="nvC${i}"></canvas></div>`).join('')}</div>`;
  }
  function mNuvem(c, first) {
    const w = (st && st.words) || { clouds: [[], []], count: 0 }, foco = (c.live && c.live.foco) || 0, grid = $('#nvGrid'); if (!grid) return;
    if (first) L.nv = [0, 1].map(i => (window.NuvemDePalavras && $('#nvC' + i) ? new NuvemDePalavras($('#nvC' + i), { scale: 1.5, wide: true, radius: .33, cy: .5, empty: 'WAITING FOR THE FIRST ANSWERS…' }) : null));
    (L.nv || []).forEach((n, i) => { if (n) n.sync((w.clouds && w.clouds[i]) || []); });
    const n = $('#nvCount'); if (n) n.textContent = w.count;
    if (!first && w.count > (L.nvCount || 0)) sfx('blip');
    if (grid.dataset.foco !== String(foco)) { grid.dataset.foco = foco; if (!first) sfx('reveal'); }
    L.nvCount = w.count;
  }

  /* ================= ESTRATÉGIA 2026 =================
   * O plano estratégico LATAM GDT 2026 no visual do filme: o destino (Desire at Scale) em cima, os três motores do meio
   * (Growth, Operational Effectiveness, Net Productivity) e a estrada (Governance & Culture) embaixo. No painel o Doc pode
   * dar destaque a uma parte por vez. */
  const P26_C = { topo: '#ff4fa3', p1: 'var(--green)', p2: 'var(--cyan)', p3: 'var(--orange)', base: 'var(--yellow)' };
  function vPlano26(c) {
    const item = x => `<li><b>${esc(x.t)}</b>${x.d ? `<span>${esc(x.d)}</span>` : ''}</li>`;
    const band = (k, n, tag) => { const p = c[k] || { itens: [] }; return `<section class="p26-band" data-p="${n}" style="--c:${P26_C[k]};--i:${n - 1}">
        <div class="p26-bh"><small>${tag}</small><h3>${esc(p.t)}</h3>${p.s ? `<em>${esc(p.s)}</em>` : ''}</div><ul class="p26-row n${Math.min(4, p.itens.length)}">${p.itens.map(item).join('')}</ul></section>`; };
    const col = (k, n) => { const p = c[k] || { itens: [] }; return `<section class="p26-col ${p.itens.length > 6 ? 'cmp' : ''}" data-p="${n}" style="--c:${P26_C[k]};--i:${n - 1}">
        <div class="p26-ch"><i>0${n - 1}</i><div><small>ENGINE 0${n - 1}</small><h3>${esc(p.t)}</h3>${p.s ? `<em>${esc(p.s)}</em>` : ''}</div></div><ul>${p.itens.map(item).join('')}</ul></section>`; };
    return `<div class="cn-top p26-top"><div>${head(c)}<h1 class="cn-h1">${fire(c.titulo)}</h1></div>
        <div class="p26-leads">${(c.lideres || []).map(x => `<div class="cn-person">${faces(x)}<div><b>${esc(x.nome)}</b><small>${esc(x.papel)}</small></div></div>`).join('')}</div></div>
      <div class="p26" id="p26" data-foco="0">${band('topo', 1, 'DESTINATION')}<div class="p26-cols">${col('p1', 2)}${col('p2', 3)}${col('p3', 4)}</div>${band('base', 5, 'THE ROAD')}</div>`;
  }
  function mPlano26(c, first) {
    const f = (c.live && c.live.foco) || 0, el = $('#p26'); if (!el) return;
    if (el.dataset.foco !== String(f)) { el.dataset.foco = f; if (!first) sfx(f ? 'blip' : 'reveal'); }
  }

  /* ================= JORNADA 2026 · ALMANAQUE ================= */
  function vAlmanaque(c) {
    const s = c.stats, kp = [...c.kpis.map(k => [k.v, k.l]), [String(s.entregues), c.kpiEntregas], [s.beneficiosTxt, c.kpiBeneficios]], KC = ['var(--green)', 'var(--yellow)', 'var(--cyan)', 'var(--orange)', 'var(--yellow)'];
    return `<div class="cn-top al-top"><div>${head(c)}<h1 class="cn-h1">${fire(c.titulo)}</h1><p class="cn-sub">${esc(c.sub)}</p></div>
        <div class="al-kpis">${kp.map(([v, l], i) => `<div class="al-kpi" style="--c:${KC[i % 5]}"><b data-kpi="${esc(v)}">${esc(v)}</b><small>${esc(l)}</small></div>`).join('')}</div></div>
      <div class="al-rib"><div class="line"></div><div class="fill" id="alFill"></div>
        ${['Q1', 'Q2', 'Q3', 'Q4'].map((q, i) => `<span class="q" style="left:${(i * 3 + 1) / 11 * 100}%">${q}</span>`).join('')}
        ${c.meses.map((m, i) => `<div class="mo ${c.itens.some(x => x.m === i && x.k === 'E') ? 'dl' : ''}" data-i="${i}" style="left:${i / 11 * 100}%"><i></i><span>${m}</span></div>`).join('')}
        <span class="rw">◀◀ REWINDING 2026</span>
        <div class="car" id="alCar"><i class="trail"></i><canvas aria-hidden="true"></canvas></div></div>
      <div class="al-focus"><div class="al-month"><div class="q" id="alQ"></div><div class="mn"><span class="bttf" id="alMn"></span></div><div class="stt" id="alSt"></div>${hostsRow(c, 'col')}</div>
        <div class="al-cards" id="alCards"></div>
        <div class="al-hero"><div class="al-side">${head(c, c.ato ? c.ato.nome : c.kicker)}<div class="al-cover"><span class="bttf">${esc(c.name)}</span></div><p class="al-coversub">${fire(c.titulo)} · ${esc(c.sub)}</p>${hostsRow(c, 'stack')}</div>
          <div class="carbox"><canvas class="car3d" data-car></canvas></div></div></div>
      <div class="al-foot"><div class="al-leg" id="alLeg"></div><span class="src">${esc(c.fonte)}</span></div>
      <div class="al-page" id="alPage"></div>`;
  }
  function alPage(c) { // o ano em uma página: tudo o que foi entregue, por BU
    const s = c.stats, pg = c.pagina, del = c.itens.filter(x => x.k === 'E');
    return `<div class="pg-head"><div>${head(c, pg.kicker)}<h2 class="cn-h2">${fire(pg.titulo)}</h2></div>
        <div class="pg-kpis"><div style="--c:var(--yellow)"><b>${s.entregues}</b><small>DELIVERED</small></div><div style="--c:var(--yellow)"><b>${esc(s.beneficiosTxt)}</b><small>BENEFITS</small></div>
          ${s.bus.map(b => `<div style="--c:${BU_C[b.bu]}"><b>${b.n}</b><small>${esc(b.name)} · ${esc(b.txt)}</small></div>`).join('')}</div></div>
      <div class="pg-cols">${s.bus.map((b, k) => `<div class="pg-col" style="--c:${BU_C[b.bu]};--i:${k}"><h4><span>${esc(b.name)}</span><span>${b.n} · ${esc(b.txt)}</span></h4>
        ${del.filter(x => (x.bu || 'BPC') === b.bu).map(x => `<div class="pg-row"><span>${c.meses[x.m]}</span><div>${esc(x.t)}</div></div>`).join('')}</div>`).join('')}</div>
      <p class="pg-note">${esc(pg.nota)}</p>
      <div class="pg-lead"><b>2026 LEADERSHIP TAKEAWAYS</b><span>${esc(pg.lideranca)}</span></div>`;
  }
  function alMonth(c, i, animate) {
    // A viagem é de trás para a frente: a DeLorean parte de dezembro e vai de ré, mês a mês, até janeiro (o rastro fica à direita).
    const blank = i < 0, m = blank ? 11 : i, it = blank ? [] : c.itens.filter(x => x.m === m), off = new Set(c.live.off || []);
    const car = $('#alCar'); car.style.left = m / 11 * 100 + '%'; if (animate) { car.classList.add('mv'); later(1000, () => car.classList.remove('mv')); }
    root.classList.toggle('blank', blank); // antes de a viagem começar: a DeLorean na estrada, pronta para partir
    $('#alFill').style.width = (11 - m) / 11 * 100 + '%';
    $$('.al-rib .mo').forEach((d, k) => { d.classList.toggle('cur', !blank && k === m); d.classList.toggle('seen', !blank && k > m); });
    const mn = $('#alMn'); mn.textContent = c.meses[m]; if (animate) { mn.classList.remove('flip'); void mn.offsetWidth; mn.classList.add('flip'); }
    $('#alQ').textContent = `Q${Math.floor(m / 3) + 1} · 2026`;
    const dl = it.filter(x => x.k === 'E').length, ms = it.filter(x => x.k === 'M').length;
    $('#alSt').innerHTML = `<span><b>${dl}</b>delivered</span><span><b>${ms}</b>${ms === 1 ? 'milestone in motion' : 'milestones in motion'}</span>`;
    const box = $('#alCards'); box.className = `al-cards ${it.length > 4 ? 'cmp' : ''} ${it.length > 6 ? 'cmp3' : ''} ${animate ? 'anim' : ''}`;
    box.innerHTML = blank ? '' : it.map((e, k) => `<div class="al-card k${e.k} ${off.has(e.k) || (e.bu && off.has(e.bu)) ? 'hid' : ''}" style="--i:${k};--c:${TIPO_C[e.k]}"><small>${esc(c.tipos[e.k].toUpperCase())}${e.bu ? `<em style="--b:${BU_C[e.bu]}">${esc(c.bus[e.bu])}</em>` : ''}</small><p>${esc(e.t)}</p>${e.k === 'E' ? '<div class="stamp">DELIVERED<i>2026 ✓</i></div>' : ''}</div>`).join('');
    if (animate && !blank) { sfx('key', m); if (dl) { later(650, () => sfx('reveal')); later(900, () => { const r = $('.al-card.kE:not(.hid)'); if (r) { const b = r.getBoundingClientRect(); confetti(70, (b.right - 60) / innerWidth, (b.top + b.height / 2) / innerHeight); } }); } }
  }
  function alLegend(c) {
    const s = c.stats, off = new Set(c.live.off || []), b = (k, label, n, col) => `<span class="lg ${off.has(k) ? 'off' : ''}" style="--c:${col}"><i></i>${esc(label)} <b>${n}</b></span>`;
    $('#alLeg').innerHTML = Object.keys(c.bus).map(u => b(u, c.bus[u], s.porBu[u], BU_C[u])).join('') + '<span class="sep"></span>' + ['E', 'M', 'C'].map(k => b(k, c.tipos[k], s.porTipo[k], TIPO_C[k])).join('');
  }
  function kpiCount() { // os números sobem contando, como no deck
    $$('[data-kpi]').forEach((el, i) => {
      const txt = el.dataset.kpi, m = txt.match(/^([^0-9]*)([0-9]+(?:[.,][0-9]+)?)(.*)$/); if (!m) return;
      const target = parseFloat(m[2].replace(',', '.')), dec = (m[2].split(/[.,]/)[1] || '').length, sep = m[2].includes(',') ? ',' : '.', t0 = performance.now(), d = 1500 + i * 250;
      (function f(t) { const p = Math.min(1, (t - t0) / d), v = target * (1 - Math.pow(1 - p, 3)); el.textContent = m[1] + v.toFixed(dec).replace('.', sep) + m[3]; if (p < 1 && el.isConnected) requestAnimationFrame(f); else el.textContent = txt; })(t0);
    });
  }
  // A DeLorean de verdade (o modelo 3D do app, delorean-model.js) na linha do tempo: de perfil, com a frente para a direita
  // (o futuro). Quando o mês muda ela dá ré (as rodas giram para trás, luzes acesas e os rastros de fogo). Sem WebGL, entra o desenho simples.
  let carModule = null;
  function alCar3d() {
    const box = $('#alCar'), cv = box && box.querySelector('canvas'); if (!cv) return;
    const me = L.car = { raf: 0, view: null };
    const flat = () => { if (box.isConnected) box.innerHTML = `<svg viewBox="0 0 340 110">${CAR}</svg>`; };
    (carModule || (carModule = import('/delorean-model.js'))).then(m => {
      if (L.car !== me || !cv.isConnected) return;
      const view = me.view = m.createCarView(cv); let last = performance.now(), spin = 0, boost = 0;
      (function frame(t) {
        if (L.car !== me || !cv.isConnected) return;
        me.raf = requestAnimationFrame(frame);
        if (t - last < 33 || document.hidden) return;
        const dt = Math.min(.1, (t - last) / 1000), w = cv.clientWidth, h = cv.clientHeight; last = t; if (!w || !h || view.lost) return;
        boost += ((box.classList.contains('mv') ? 1 : 0) - boost) * Math.min(1, dt * 6); spin -= dt * boost * 26; // parada, as rodas não giram; de ré, giram para trás
        view.resize(w, h, Math.min(devicePixelRatio || 1, 2)); view.setCamera({ x: 0, y: 1.45, z: 7.2 }, { x: 0, y: .66, z: 0 }, 21);
        view.update({ pos: { x: 0, y: .012 + Math.sin(t * .009) * .006, z: 0 }, ry: -.32, e: .3 + boost * .7, flash: 0, pulse: boost * .6, spin, visible: true });
        view.render();
      })(last);
    }).catch(err => { console.warn('Carro 3D indisponível no almanaque; usando o desenho simples.', err); if (L.car === me) flat(); });
  }
  function mAlmanaque(c, first) {
    const l = c.live, p = L.al || {};
    if (first) {
      kpiCount(); alLegend(c); alMonth(c, l.mes, false); alCar3d();
      const hero = () => (hooks.car ? hooks.car() : null); // a DeLorean grande, na estrada, enquanto o ano não começa
      later(300, () => { const h = hero(); if (h && h.setEnergy) h.setEnergy(.5); });
      every(1300, () => { const h = hero(); if (h && h.spark && root && root.classList.contains('blank') && !document.hidden) h.spark(); });
    }
    else {
      if (p.mes !== l.mes) { alMonth(c, l.mes, true); if (p.mes < 0 && l.mes >= 0) kpiCount(); } // saiu da capa: os números sobem contando
      else if (p.off !== (l.off || []).join()) { alMonth(c, l.mes, false); alLegend(c); }
      if (l.fim && l.fim !== p.fim && now() - l.fim < 4000) { sfx('reveal'); flash(); confetti(220, .5, .46); } // chegou a janeiro: o ano inteiro foi revisto
    }
    const pg = $('#alPage');
    if (l.pagina && !pg.classList.contains('on')) { pg.innerHTML = alPage(c); void pg.offsetWidth; pg.classList.add('on'); if (!first) sfx('blip'); }
    else if (!l.pagina && pg.classList.contains('on')) pg.classList.remove('on');
    root.classList.toggle('playing', !!l.tocando);
    L.al = { mes: l.mes, off: (l.off || []).join(), fim: l.fim };
  }

  /* ================= IA EM 2026 ================= */
  const vIa = c => `<div class="cn-rings"><i></i><i></i><i></i><i></i></div>
    <div class="cn-split"><div class="cn-col">${head(c)}<h1 class="cn-h1">${fire(c.titulo)}</h1><p class="cn-big">${esc(c.texto)}</p>${who(c)}</div>${qrBox()}</div>${strip(c.faixa)}`;

  /* ================= RECONHECIMENTO 2026 ================= */
  const winnerOf = p => (p.vencedor === undefined ? null : p.indicados[p.vencedor] || null);
  function vReconhecimento(c) {
    const l = c.live, n = c.premios.length, done = c.premios.filter(p => p.feito).length;
    if (l.fase === 'intro') return `<div class="rc-intro">${FLUX}${head(c)}<div class="rc-lines">${(c.abertura || []).map((t, i) => `<span style="--i:${i}">${fire(t)}</span>`).join('')}</div><p class="rc-sub" style="--i:${(c.abertura || []).length}">${esc(c.aberturaSub)}</p>${hostsRow(c, 'center')}</div>`;
    if (l.fase === 'tributo') return `<div class="rc-trib">${head(c, `${c.kicker} · Tribute`)}<h2 class="cn-h2">${fire(c.tributo)}</h2>
        <div class="rc-vid" id="rcVid"><div class="hint" id="rcHint">${FLUX}<b>DRAG &amp; DROP THE TRIBUTE VIDEO HERE</b><small>or use this space for the leadership speech</small></div><video id="rcVideo" hidden playsinline controls></video></div>
        ${c.fala ? `<p class="rc-foot">Speaker: ${esc(c.fala)}</p>` : ''}</div>`;
    if (l.fase === 'premios') return `<div class="rc-board"><div class="cn-top"><div>${head(c, 'Live ceremony')}<h1 class="cn-h1">${fire(c.premiosTitulo)}</h1></div><div class="tcbox" style="--c:var(--yellow)"><b>${done} / ${n}</b><span>AWARDS REVEALED</span></div></div>
        <div class="rc-env n${n}">${c.premios.map((p, i) => { const w = p.feito && winnerOf(p); return w ? `<div class="env done" style="--i:${i}"><div class="k">${esc(p.n.toUpperCase())}</div>${faces(w)}<b>${esc(w.nome)}</b><small>${esc(w.projeto)}</small><span class="tag">REVEALED</span></div>`
          : `<div class="env" style="--i:${i}"><div class="seal"><svg viewBox="0 0 24 24">${ICO[p.ic] || ICO.i}</svg></div><div class="k">${esc(p.k)}</div><b>${esc(p.n)}</b><small>SEALED</small></div>`; }).join('')}</div>
        ${c.exemplo ? '<div class="rc-dummy">EXAMPLE NAMES · NOT FINAL NOMINATIONS</div>' : ''}</div>`;
    if (l.fase === 'hall') return `<div class="rc-hall">${head(c, `${c.kicker} · Grand finale`)}<div class="hof-t"><span class="bttf">${esc(c.hallTitulo)}</span></div><p class="cn-sub">${esc(c.hallSub)}</p>
        <div class="rc-hof n${n}">${c.premios.map((p, i) => { const w = p.feito && winnerOf(p); return `<div class="hc ${w ? '' : 'pending'}" style="--i:${i}"><div class="k">${esc(p.k)}</div><h4>${esc(p.n)}</h4>${w ? faces(w) : '<div class="av">?</div>'}<b>${w ? esc(w.nome) : 'To be revealed'}</b><small>${w ? esc(w.projeto) : '&nbsp;'}</small></div>`; }).join('')}</div></div>`;
    const p = c.premios[l.premio] || c.premios[0]; // cerimônia de um prêmio
    // como o Flux Capacitor carrega: pelos aplausos (o microfone do Painel do Doc ouve a sala), pelos toques nos celulares, ou pelos dois
    const mic = c.carga !== 'toques', tap = c.carga !== 'mic';
    const how = mic && tap ? 'Applause and taps on <b>⚡ CHARGE</b> on your phone: everything charges the flux capacitor!' : mic ? 'The louder the <b>applause</b>, the faster the flux capacitor charges. <b>Everyone together!</b>' : 'Your applause charges the flux capacitor. Tap <b>⚡ CHARGE</b> on your phone!';
    return `<div class="rc-cer" id="rcCer" data-passo="${l.passo}">
        <div class="rc-cerh"><div class="tcbox led" style="--c:var(--red)"><b id="rcLed">— — —</b><span>DESTINATION · WINNER</span></div><div class="rc-steps">${[0, 1, 2, 3, 4].map(() => '<i></i>').join('')}</div></div>
        <div class="rc-cat"><div class="ck">THE 2026 AWARD FOR ${esc(p.k)}</div><div class="cn2"><span class="bttf">${esc(p.n)}</span></div><p class="cw">${esc(p.porque)}</p><div class="cc">${p.criterios.map((x, i) => `<span style="--i:${i}">${esc(x)}</span>`).join('')}</div></div>
        <div class="rc-noms n${p.indicados.length}" id="rcNoms">${p.indicados.map((x, j) => `<div class="nom" data-j="${j}" style="--rt:${[-4, 3, -2, 4, -3, 2][j % 6]}deg"><div class="ph">${faces(x)}</div><b></b><small></small></div>`).join('')}</div>
        <div class="rc-gw ${mic ? 'mic' : ''}"><div class="gwl">${FLUX}<div class="gwx"><div class="gwt">MAKE SOME NOISE!</div><div class="gws">${how}</div></div>
            ${mic ? `<div class="vu" id="rcVu" title="Room sound"><span>👏 APPLAUSE</span><div class="bars">${Array.from({ length: 18 }, () => '<i></i>').join('')}</div></div>` : ''}</div>
          <div class="gbar"><i id="rcFill"></i><span>1.21 GW</span></div><div class="gnum"><b id="rcNum">0.00</b> GIGAWATTS</div></div>
        <svg class="rc-bolt" id="rcBolt"></svg>
        <div class="rc-win" id="rcWin"><div class="wk" id="rcWk"></div><div class="wav" id="rcWav"></div><div class="wn"><span class="bttf" id="rcWn"></span></div><div class="wp" id="rcWp"></div><div class="wc" id="rcWc"></div></div>
      </div>`;
  }
  const PASSOS = ['categoria', 'indicados', 'carga', 'sorteio', 'vencedor'];
  function rcShowNom(el, x, type) { if (!el || el.classList.contains('in')) return; el.classList.add('in'); const b = el.querySelector('b'); if (type) { sfx('blip'); typeTo(b, x.nome); } else b.textContent = x.nome; el.querySelector('small').textContent = x.projeto; }
  function rcCharge(v, nivel) {
    const f = $('#rcFill'); if (!f) return; v = Math.max(0, Math.min(1, v));
    const vu = $('#rcVu'); // medidor do som da sala: acende conforme o barulho; sem notícias do microfone por 1 s, apaga
    if (vu) {
      const n = Math.max(0, Math.min(1, Number(nivel) || 0)), bars = vu.querySelectorAll('.bars i'), on = Math.round(n * bars.length);
      bars.forEach((b, i) => b.classList.toggle('on', i < on)); vu.classList.toggle('loud', n > .6);
      const gw = vu.closest('.rc-gw'); if (gw) gw.style.setProperty('--n', n.toFixed(2));
      clearTimeout(L.vuT); if (n > 0) L.vuT = later(1000, () => rcCharge(v, 0));
    }
    f.style.width = v * 100 + '%'; $('#rcNum').textContent = (v * 1.21).toFixed(2);
    const cer = $('#rcCer'); if (cer && cer.dataset.passo === 'carga') { $('#rcLed').textContent = `CHARGING… ${Math.round(v * 100)}%`; cer.style.setProperty('--e', v); }
  }
  function rcStrike(card) { // o raio cai no vencedor
    const svg = $('#rcBolt'), cer = $('#rcCer'); if (!svg || !card || !cer) return;
    const W = innerWidth, H = innerHeight, r = card.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height * .3;
    let px = x + (Math.random() - .5) * W * .18, py = 0, d = `M${px} ${py}`;
    for (let i = 1; i <= 7; i++) { py = y * i / 7; px = i === 7 ? x : x + (Math.random() - .5) * W * .1 * (1 - i / 7); d += ` L${px} ${py}`; }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = `<path d="${d}"/><path d="M${x + (Math.random() - .5) * 60} ${y * .35} L${x + W * .11} ${y * .55} L${x + W * .09} ${y * .7}" style="stroke-width:3"/>`;
    svg.style.opacity = 1; let f = 0; const fl = every(70, () => { svg.style.opacity = f % 2 ? 0 : 1; if (++f > 7) { clearInterval(fl); svg.style.opacity = 0; } });
    sfx('thunder'); later(120, () => sfx('thunder')); flash(); cer.classList.add('shake'); later(600, () => cer.classList.remove('shake'));
    $$('#rcNoms .nom').forEach(el => { el.classList.remove('hot'); el.classList.add(el === card ? 'win' : 'out'); });
  }
  function rcWinner(c, p, fresh) {
    const w = winnerOf(p), o = $('#rcWin'); if (!w || !o) return;
    $('#rcWk').textContent = `AND THE ${p.n.toUpperCase()} AWARD GOES TO…`; $('#rcWav').innerHTML = faces(w); $('#rcWn').textContent = w.nome; $('#rcWp').textContent = w.projeto.toUpperCase();
    $$('#rcNoms .nom').forEach((el, j) => { el.classList.remove('hot'); el.classList.add(j === p.vencedor ? 'win' : 'out'); });
    o.classList.add('on'); $('#rcCer').classList.remove('dim');
    if (!fresh) { $('#rcLed').textContent = w.nome.toUpperCase(); $('#rcWc').textContent = `“${p.citacao}”`; return; }
    scramble($('#rcLed'), w.nome.toUpperCase(), 900);
    later(1100, () => { sfx('reveal'); confetti(260, .5, .4); }); later(1700, () => confetti(160, .19, .78)); later(2200, () => confetti(160, .81, .78));
    later(2000, () => typeTo($('#rcWc'), `“${p.citacao}”`, 35));
  }
  function rcPasso(c) {
    const l = c.live, p = c.premios[l.premio], cer = $('#rcCer'); if (!p || !cer) return;
    const el = $$('#rcNoms .nom'), since = now() - l.at, idx = PASSOS.indexOf(l.passo);
    cer.dataset.passo = l.passo; $$('.rc-steps i').forEach((x, i) => x.classList.toggle('on', i <= idx));
    cer.classList.toggle('dim', l.passo === 'sorteio');
    if (l.passo === 'categoria') { $('#rcLed').textContent = '— — —'; if (since < 1500) { sfx('thunder'); flash(); } return; }
    if (l.passo === 'indicados') { // um por um, com suspense
      if (since < 600) { scramble($('#rcLed'), 'THE NOMINEES ARE…'); sfx('roll', el.length + 1); } else $('#rcLed').textContent = 'THE NOMINEES ARE…';
      p.indicados.forEach((x, j) => { const d = 700 + j * 1000 - since; if (d <= 0) rcShowNom(el[j], x, false); else later(d, () => rcShowNom(el[j], x, true)); });
      return;
    }
    p.indicados.forEach((x, j) => rcShowNom(el[j], x, false));
    if (l.passo === 'carga') { if (since < 800) sfx('hum', 6); return rcCharge(l.carga, l.nivel); }
    rcCharge(1);
    if (l.passo === 'sorteio') { // holofote girando cada vez mais devagar até parar no vencedor; pausa; raio
      const n = el.length, win = p.vencedor, total = l.sorteioMs || 8600, strikeAt = total - 900, limit = strikeAt - 1300, seq = [];
      let t = 0, d = 55, k = Math.floor(l.at / 7) % n;
      for (;;) { seq.push([t, k % n]); if (t >= limit * .78 && k % n === win) break; k++; d = Math.min(560, d * 1.075); t += d; }
      const scale = Math.min(1, limit / Math.max(1, t));
      if (since < 400) { sfx('thunder'); flash(); sfx('roll', limit / 1000); }
      for (const [at, j] of seq) later(at * scale - since, () => { if (cer.dataset.passo !== 'sorteio') return; el.forEach(x => x.classList.remove('hot')); el[j].classList.add('hot'); $('#rcLed').textContent = p.indicados[j].nome.toUpperCase(); sfx('key', j); });
      later(strikeAt - since, () => { if (cer.dataset.passo === 'sorteio') rcStrike(el[win]); });
      return;
    }
    rcWinner(c, p, since < 1500);
  }
  function mReconhecimento(c, first) {
    const l = c.live, p = L.rc || {};
    if (l.fase === 'tributo') { // vídeo-tributo: endereço configurado no painel ou arquivo arrastado para a tela
      const v = $('#rcVideo'), hint = $('#rcHint'), box = $('#rcVid');
      if (first) {
        const load = (f, play) => { if (!isVideo(f)) return; if (L.vurl) URL.revokeObjectURL(L.vurl); L.vurl = URL.createObjectURL(f); v.src = L.vurl; v.hidden = false; hint.hidden = true; if (play) v.play().catch(() => {}); };
        ['dragenter', 'dragover'].forEach(t => box.addEventListener(t, e => { e.preventDefault(); box.classList.add('drag'); }));
        ['dragleave', 'drop'].forEach(t => box.addEventListener(t, () => box.classList.remove('drag')));
        box.addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (!isVideo(f)) return; load(f, true); Vid.set('tributo', f).then(() => hooks.report && hooks.report()); }); // fica guardado neste navegador
        v.addEventListener('play', () => hooks.duck && hooks.duck(true)); ['pause', 'ended'].forEach(t => v.addEventListener(t, () => hooks.duck && hooks.duck(false)));
        if (c.video) { v.src = c.video; v.hidden = false; hint.hidden = true; }
        else Vid.get('tributo').then(f => { if (f && v.isConnected && !v.getAttribute('src')) load(f, false); }); // o vídeo arrastado em outra hora (ensaio) continua aqui
      }
      if (c.video && v.getAttribute('src') === c.video) { if (l.video) v.play().catch(() => {}); else v.pause(); }
    }
    if (l.fase === 'hall' && first) { sfx('reveal'); c.premios.forEach((x, i) => later(500 + i * 350, () => confetti(90, .12 + i * (.76 / Math.max(1, c.premios.length - 1)), .62))); }
    if (l.fase === 'intro' && first) later(700, () => sfx('hum', 3));
    if (l.fase === 'cerimonia' && (first || p.passo !== l.passo || p.at !== l.at)) rcPasso(c);
    else if (l.fase === 'cerimonia' && l.passo === 'carga') rcCharge(l.carga, l.nivel);
    L.rc = { passo: l.passo, at: l.at };
  }

  /* ================= INTERVALO ================= */
  const IV_ST = { idle: 'THE BREAK IS ABOUT TO START', run: '● REFUELING…', paused: '❚❚ PAUSED', done: '⚡ 1.21 GW · FULL TANK · BACK TO YOUR SEATS' };
  const vIntervalo = c => `${head(c)}<h1 class="cn-h1">${fire(c.titulo)}</h1>
    <div class="iv-row"><div class="iv-ring"><svg viewBox="0 0 200 200"><circle class="bg" cx="100" cy="100" r="90"/><circle class="fg" id="ivRing" cx="100" cy="100" r="90" stroke-dasharray="565.5" stroke-dashoffset="0"/></svg><div class="cd" id="ivCd">--:--</div></div>
      <div class="iv-side"><p>${esc(c.texto)}</p><div class="iv-st" id="ivSt"></div></div></div>
    <div class="iv-alert" id="ivAlert" role="alert" aria-hidden="true"><i class="ia-stripes"></i>
      <div class="ia-box"><div class="ia-ico">⚠</div><div class="ia-k">${esc(c.alertaTitulo || 'Emergency alert')}</div><h2>BACK TO YOUR SEATS</h2><p>${esc(c.alertaTexto || '')}</p><small>${esc(c.alertaOrigem || '')}</small></div>
      <i class="ia-stripes"></i></div>`;
  function tIntervalo(c) {
    const l = c.live, cd = $('#ivCd'); if (!cd) return;
    const ph = l.phase === 'run' && l.endsAt && l.endsAt <= now() ? 'done' : l.phase, left = ph === 'run' ? Math.max(0, Math.ceil((l.endsAt - now()) / 1000)) : ph === 'done' ? 0 : l.remaining;
    cd.textContent = fmt(left); $('#ivRing').style.strokeDashoffset = 565.5 * (1 - left / Math.max(1, l.duration));
    root.dataset.phase = ph; root.classList.toggle('last', ph === 'run' && left <= 60);
    $('#ivSt').textContent = IV_ST[ph] || '';
    if (ph === 'done' && L.ivPhase === 'run') flash();
    L.ivPhase = ph;
    // Alerta de volta do intervalo (o cronômetro zerou ou o Doc disparou): tela cheia, no estilo de um alerta de emergência, com a sirene.
    const al = l.alerta || 0, box = $('#ivAlert');
    if (box && al !== (L.ivAlert || 0)) {
      L.ivAlert = al; clearInterval(L.ivSiren);
      box.classList.toggle('on', !!al); box.setAttribute('aria-hidden', String(!al)); document.body.classList.toggle('iv-alerting', !!al);
      if (al && now() - al < 20000) { let n = 0; flash(); sfx('alarm'); L.ivSiren = every(8000, () => { if (++n > 3) return clearInterval(L.ivSiren); sfx('alarm'); }); } // insiste mais três vezes
    }
  }

  /* ================= VISÃO 2027 =================
   * Primeiro a capa do bloco (o nome e quem conduz). Quando o Doc abre a estratégia, o arquivo original (sem alterações)
   * ocupa a tela inteira, por cima de tudo: sem moldura, sem o relógio do telão e sem as linhas de TV. */
  const vVisao = c => `${cover(c, { title: c.titulo, sub: c.nota })}
    <div class="vs-full" id="vsFull" aria-hidden="true"><iframe id="vsFrame" title="CDIO LATAM 2027 Strategy"></iframe></div>`;
  function mVisao(c, first) {
    const fr = $('#vsFrame'), full = $('#vsFull'), intro = !!c.live.intro, open = !!c.live.aberta; if (!fr) return;
    coverLive(first);
    // Sem a abertura em vídeo, a página vai direto para o mapa da estratégia (igual ao deck): o arquivo não é alterado,
    // só se clica no botão "Go to 2027 Strategy" dele depois de carregar.
    const skip = () => { try { const d = fr.contentDocument, w = fr.contentWindow; if (!d || !d.head || L.vsIntro) return; const s = d.createElement('style'); s.textContent = '#intro,#replay{display:none!important}'; d.head.appendChild(s); const k = d.getElementById('intro-skip'); if (k) k.click(); d.documentElement.classList.remove('intro-on'); setTimeout(() => { try { if (typeof w.fit === 'function') w.fit(); } catch { /* segue */ } }, 1000); } catch { /* outra origem: fica como está */ } };
    // Sem a abertura, a página já carrega atrás da capa (abre na hora). Com a abertura em vídeo, só carrega quando o Doc abre.
    if (first) { L.vsIntro = intro; L.vsOpen = false; fr.addEventListener('load', skip); if (!intro) fr.src = c.src; }
    else if (L.vsIntro !== intro) { L.vsIntro = intro; if (!intro || open) fr.src = c.src; } // o Doc ligou/desligou a abertura: carrega de novo
    if (open !== L.vsOpen) {
      L.vsOpen = open;
      if (open && intro) fr.src = c.src;
      full.classList.toggle('on', open); full.setAttribute('aria-hidden', String(!open)); document.body.classList.toggle('vs-open', open);
      if (open && !first) flash();
      if (open) later(700, () => { try { const w = fr.contentWindow; if (w && typeof w.fit === 'function') w.fit(); } catch { /* segue */ } });
    }
  }

  /* ================= CAPA DO BLOCO SUCESSO (em português, como a dinâmica) ================= */
  const vCapaSucesso = c => cover(c, { title: c.titulo, sub: c.sub, label: 'COM', note: '<span>📱</span><b>Em instantes, as dinâmicas acontecem no celular</b>' });

  /* ================= MANIFESTO 2027 ================= */
  const vManifesto = c => `<div class="cn-split"><div class="cn-col">${head(c)}
      <div class="mf-cal">${[['MONTH', c.mes], ['DAY', c.dia], ['YEAR', c.ano]].map(([l, v]) => `<div class="tcbox" style="--c:var(--green)"><b>${esc(v)}</b><span>${l}</span></div>`).join('')}</div>
      <h1 class="cn-h1">${esc(c.titulo)}<br><span class="fire typed" id="mfTy"></span></h1>${who(c)}</div>${qrBox()}</div>${strip(c.faixa)}`;

  /* ================= 88 MPH ================= */
  const MPH_MS = 6000; // do zero aos 88
  const vMph = c => `${head(c)}<div class="mp-row"><div class="mp-gauge"><svg viewBox="0 0 200 120"><defs><linearGradient id="mpG"><stop offset="0" stop-color="#2ee6d6"/><stop offset=".6" stop-color="#ff6a00"/><stop offset="1" stop-color="#ff2d55"/></linearGradient></defs>
        <path d="M20 110 A80 80 0 0 1 180 110" fill="none" stroke="#2a1d55" stroke-width="12" stroke-linecap="round"/><path id="mpArc" d="M20 110 A80 80 0 0 1 180 110" fill="none" stroke="url(#mpG)" stroke-width="12" stroke-linecap="round" stroke-dasharray="251.3" stroke-dashoffset="251.3"/></svg>
        <div class="mp-num"><b id="mpV">0</b><small>MPH</small></div></div>
      <div class="carbox warp"><canvas class="car3d" data-car></canvas></div></div>
    <div class="mp-msg" id="mpMsg"></div>`;
  function mpSet(v) { const el = $('#mpV'); if (!el) return; el.textContent = Math.round(v); $('#mpArc').style.strokeDashoffset = 251.3 * (1 - v / 88); }
  function mpArrive(c, fresh) {
    mpSet(88); root.classList.add('arrived');
    $('#mpMsg').innerHTML = `<span class="bttf">${esc(c.chegada)}</span><p>${esc(c.depois)}</p>`;
    if (fresh) { flash(); sfx('reveal'); confetti(260, .5, .45); later(600, () => confetti(160, .2, .7)); later(1100, () => confetti(160, .8, .7)); }
  }
  function mMph(c, first) {
    const at = c.live.at;
    if (!first && L.mpAt === at) return;
    L.mpAt = at; cancelAnimationFrame(L.mpRaf); root.classList.remove('arrived', 'go');
    const car = hooks.car && hooks.car();
    if (!at) { mpSet(0); $('#mpMsg').textContent = c.antes; if (car && car.reset) car.reset(0); return; }
    const since = now() - at;
    if (since >= MPH_MS) return mpArrive(c, false);
    root.classList.add('go'); $('#mpMsg').textContent = c.antes; sfx('warp', (MPH_MS - since) / 1000);
    let warped = false;
    (function f() {
      const k = Math.min(1, (now() - at) / MPH_MS), e = Math.pow(k, 1.6);
      mpSet(88 * e); if (car && car.setEnergy) car.setEnergy(Math.min(1, e * 1.1));
      if (!warped && MPH_MS * (1 - k) <= 2300 && car && car.doWarp) { warped = true; car.doWarp(); } // o carro entra no portal bem na hora dos 88
      if (k >= 1) return mpArrive(c, true);
      if (root && root.isConnected) L.mpRaf = requestAnimationFrame(f);
    })();
  }

  /* ---------- montagem ---------- */
  const VIEW = { abertura: vAbertura, agenda: vAgenda, boasvindas: vBoasvindas, nuvem: vNuvem, plano26: vPlano26, capasucesso: vCapaSucesso, almanaque: vAlmanaque, ia: vIa, reconhecimento: vReconhecimento, intervalo: vIntervalo, visao: vVisao, manifesto: vManifesto, mph: vMph };
  const LIVE = { abertura: mAbertura, agenda: mAgenda, nuvem: mNuvem, plano26: mPlano26, capasucesso: (c, first) => coverLive(first), almanaque: mAlmanaque, reconhecimento: mReconhecimento, visao: mVisao, mph: mMph, intervalo: tIntervalo };
  // o que obriga a desenhar a cena de novo (o conteúdo, ou a fase do reconhecimento); o resto é atualização por cima
  function signature(c) {
    const { live, ...content } = c;
    return JSON.stringify(content) + (c.kind === 'reconhecimento' ? `|${live.fase}|${live.premio}|${(live.feitos || []).join()}` : '');
  }
  function html(state) { const c = state && state.cena; return c && VIEW[c.kind] ? `<section class="cn cn-${c.kind}" id="cn">${VIEW[c.kind](c)}</section>` : ''; }
  function clear() {
    timers.forEach(t => { clearTimeout(t); clearInterval(t); }); timers = []; cancelAnimationFrame(L.mpRaf); if (L.vurl) URL.revokeObjectURL(L.vurl);
    if (L.car) { cancelAnimationFrame(L.car.raf); if (L.car.view) L.car.view.dispose(); } // o carro 3D da linha do tempo
    L = {};
  }
  function start(first) {
    const c = cena(); if (!c) return;
    if (first) document.body.classList.remove('vs-open', 'iv-alerting'); // a cena foi (re)desenhada: o que estava por cima de tudo sai
    if (c.kind === 'manifesto') later(600, () => typeTo($('#mfTy'), c.pergunta, 70));
    if (LIVE[c.kind]) LIVE[c.kind](c, first);
  }
  function mount(el, state, h) {
    clear(); st = state; hooks = h || {}; offset = state.now - Date.now();
    root = el.querySelector('#cn'); const c = cena(); if (!root || !c) return;
    kind = c.kind; sig = signature(c); start(true);
  }
  function update(state) {
    st = state; offset = state.now - Date.now();
    const c = cena(); if (!c || !root || !root.isConnected) return;
    const s = signature(c);
    if (s !== sig) { // o conteúdo ou a fase mudou: redesenha por dentro (sem a transição do telão)
      const keepCar = c.kind === 'mph'; if (keepCar) return (sig = s, LIVE.mph(c, false));
      clear(); sig = s; root.className = `cn cn-${c.kind}`; root.innerHTML = VIEW[c.kind](c);
      if (hooks.remount && root.querySelector('[data-car]')) hooks.remount(); // a cena foi redesenhada: o carro 3D ganha a tela nova
      start(true); return;
    }
    if (LIVE[c.kind]) LIVE[c.kind](c, false);
  }
  function unmount() { clear(); confetti.run++; const cv = $('#cnConfetti'); if (cv) cv.remove(); document.body.classList.remove('vs-open', 'iv-alerting', 'ab-playing'); root = null; kind = null; sig = ''; }
  function tick() { const c = cena(); if (c && root && c.kind === 'intervalo') tIntervalo(c); }
  function pulse(p) { if (p && p.kind === 'reconhecimento' && kind === 'reconhecimento') { const c = cena(); if (c && c.live.passo === 'carga') { c.live.carga = p.carga; c.live.nivel = p.nivel || 0; rcCharge(p.carga, p.nivel); } } }
  // O céu e a estrada continuam rodando no fundo em todas as cenas (parado, parecia que o telão tinha travado).
  // No vídeo de abertura o fundo fica bem escuro e sem raios (calm); nas cenas com texto, um pouco mais escuro (dim);
  // no intervalo, nas capas dos blocos e nos 88 MPH, com o céu vivo.
  const calm = state => { const c = state && state.cena; return !!c && c.kind === 'abertura'; };
  const dim = state => { const c = state && state.cena; return !!c && !['intervalo', 'mph', 'abertura', 'visao', 'capasucesso'].includes(c.kind); };
  // nome para os circuitos de tempo da transição e a frase do deck
  const TR = { abertura: ['circuits', 'Roads? Where we\'re going, we don\'t need roads.'], agenda: ['circuits', 'Set the time circuits.'], boasvindas: ['clock', 'Doc gathers the crew.'], nuvem: ['circuits', 'The crew has something to say.'], plano26: ['clock', 'First, where we said we would go.'], capasucesso: ['speed', 'Your future is whatever you make it.'], almanaque: ['speed', 'Our year, month by month.'], ia: ['fuel', 'The butterfly effect.'], reconhecimento: ['clock', 'The lightning is coming.'],
    intervalo: ['fuel', 'Mr. Fusion recharging.'], visao: ['speed', 'Where we\'re going…'], manifesto: ['speed', 'Your future is whatever you make it.'], mph: ['speed', 'Hold on…'] };
  const info = state => { const c = state && state.cena; if (!c) return null; const t = TR[c.kind] || TR.agenda; return { id: 'cena:' + c.kind, type: 'cena', name: plain(c.name), tr: { kind: t[0], ms: 3600, quote: [t[1], `${c.ato ? c.ato.n + ' · ' + c.ato.nome : 'CDIO HC + BPC · 2026 Townhall'}`] } }; };
  return { html, mount, update, unmount, tick, pulse, calm, dim, info, confetti, videos: () => ({ ...Vid.has }) };
})();
