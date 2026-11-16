/* ===== Telão · segue o estado do evento (sem identidade) ===== */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const fmt = s => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  const ERA_KEYS = ['presente', 'passado', 'futuro'];
  const linkify = s => esc(s).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  const QUOTES = [
    ['Para onde vamos, não precisamos de estradas.', 'Doc Brown · 1985'],
    ['Great Scott!', 'Doc Brown'],
    ['Isso é pesado, Doc.', 'Marty McFly · 1985'],
    ['1,21 gigawatts!', 'Doc Brown · 1985'],
    ['Se você vai construir uma máquina do tempo num carro, por que não fazer isso com estilo?', 'Doc Brown · 1985'],
    ['O futuro ainda não está escrito. Ele é o que você fizer dele.', 'Doc Brown · 1990'],
    ['Ninguém me chama de covarde.', 'Marty McFly · 1989'],
    ['Hill Valley: um bom lugar para viver.', 'placa da cidade · 1955'],
    ['Salve a torre do relógio!', 'panfleto · 1985'],
    ['Hoverboards não funcionam na água!', 'Hill Valley · 2015'],
    ['Tubarão 19: desta vez é realmente pessoal.', 'cinema de Hill Valley · 2015'],
    ['Nós precisamos voltar... de volta para o futuro!', 'Doc Brown · 1985'],
    ['Você não está pensando em quatro dimensões!', 'Doc Brown · 1990'],
    ['Tênis que amarram sozinhos. Casacos que se secam. 2015.', 'Hill Valley · 2015'],
    ['Baile do Encantamento Submarino, 12 de novembro de 1955.', 'Hill Valley High · 1955'],
    ['Quando essa belezinha chega a 88 milhas por hora, você vai ver algo sério.', 'Doc Brown · 1985'],
    ['Só um raio pode gerar 1,21 gigawatts.', 'Doc Brown · 1955'],
    ['Clara, você é a mulher mais incrível que já conheci.', 'Doc Brown · 1885'],
    ['O Almanaque Esportivo Grays: 1950 a 2000.', 'Biff Tannen · 2015'],
    ['Oitenta e oito milhas por hora!', 'Marty McFly · 1985'],
  ];
  const ERAS_FILM = [
    { y: '1885', f: 'FILME III · VELHO OESTE', d: 'Doc vira ferreiro em Hill Valley, conhece Clara e uma locomotiva empurra a DeLorean a 88 mph.' },
    { y: '1955', f: 'FILME I · O RAIO', d: 'Baile do Encantamento Submarino. O raio na torre do relógio gera os 1,21 gigawatts da volta.' },
    { y: '1985', f: 'FILME I · HILL VALLEY', d: 'Twin Pines Mall, 1h21 da manhã: a DeLorean atinge 88 mph pela primeira vez.' },
    { y: '2015', f: 'FILME II · O FUTURO', d: 'Hoverboards, carros voadores, tênis que amarram sozinhos e Tubarão 19 em 3D.' },
    { y: '1985-A', f: 'FILME II · LINHA ALTERNATIVA', d: 'Biff rouba o almanaque e Hill Valley vira uma cidade sombria. A missão: consertar o tempo.' },
  ];

  const S = { state: null, offset: 0, socket: null, key: '', people: null, eraIdx: 0, quoteIdx: 0,
    car: null, energy: 0, checked: null, pollT: null,
    // De Volta para o Sucesso em exibição
    responses: null, auth: false, drawAnswer: null, seen: new Set(), roundId: null, liveCount: null, prevPhase: null, endStage: null, endTok: 0,
    cloud: null, drawAt: null, reelT: null, revealed: false, talkDone: null,
    // Reflexão em exibição
    fx: null, rf: null, rfProjects: null, rfRev: null, rfTimers: [] };
  // De Volta para o Sucesso: as quatro dinâmicas (mesmas cores do painel do Lucas)
  const DYN = { d1: { n: '01', c: 'var(--cyan)' }, d2: { n: '02', c: 'var(--yellow)' }, d3: { n: '03', c: 'var(--magenta)' }, d4: { n: '04', c: 'var(--orange)' } };
  const TARGET = 20; // respostas para energia máxima (igual ao painel)
  const PHASES = { idle: 'AGUARDANDO INÍCIO', run: 'RECEBENDO RESPOSTAS', paused: 'RECEBIMENTO PAUSADO', done: 'RECEBIMENTO ENCERRADO' };
  const serverNow = () => Date.now() + S.offset;
  const ledNow = (sec = false) => { const d = new Date(serverNow()); return `${MONTHS[d.getMonth()]} ${pad(d.getDate())} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}${sec ? ':' + pad(d.getSeconds()) : ''}`; };
  const roundEra = r => (S.state && S.state.conn.eras[ERA_KEYS[(Math.max(1, r) - 1) % 3]]) || { label: '', year: '', led: '' };
  const flash = () => { const f = $('#skyFlash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); };

  /* ---------- rede ---------- */
  function connect() {
    S.socket = io({ transports: ['websocket', 'polling'], tryAllTransports: true });
    S.socket.on('connect', () => S.socket.emit('hello', {}, res => { if (res && res.state) { S.state = res.state; S.offset = res.now - Date.now(); render(); } }));
    S.socket.on('state', st => { S.state = st; S.offset = st.now - Date.now(); render(); });
    S.socket.on('sucesso:pulse', () => pollScreen());
    S.socket.on('connect', () => { pollScreen(); checkAuth(); });
  }
  // Avisa o Painel do Doc como este telão está: logado (pode mostrar respostas) e com o som liberado.
  function report() { if (S.socket && S.socket.connected) S.socket.emit('telao:status', { locked: !!(window.Trilha && Trilha.locked), auth: S.auth }); }
  async function checkAuth() {
    try { const d = await (await fetch('/api/sucesso/screen', { cache: 'no-store', credentials: 'same-origin' })).json(); S.auth = !!d.authenticated; } catch { /* segue */ }
    report();
  }
  // Textos das respostas (nuvem, feed, resposta do sorteado): só chegam se este navegador estiver
  // logado no Painel do Doc. Fase, contagem, cronômetro e nome do sorteado vêm no estado público.
  async function pollScreen() {
    clearTimeout(S.pollT);
    if (!S.state || !S.state.presentation) { S.responses = null; S.drawAnswer = null; return; }
    try {
      const d = await (await fetch('/api/sucesso/screen', { cache: 'no-store', credentials: 'same-origin' })).json();
      const p = S.state && S.state.presentation;
      if (p && d.presentation && d.presentation.roomId === p.roomId && d.presentation.activityId === p.activityId) {
        if (S.auth !== !!d.authenticated) { S.auth = !!d.authenticated; report(); }
        S.responses = Array.isArray(d.responses) ? d.responses : null; S.drawAnswer = d.drawAnswer || null;
        patchProjection();
      }
    } catch { /* tenta de novo */ }
    S.pollT = setTimeout(pollScreen, document.hidden ? 6000 : 2500);
  }
  async function loadPeople() { try { S.people = await (await fetch('/api/people')).json(); } catch { S.people = []; } }

  /* ---------- peças ---------- */
  const logo = () => `<div class="logo"><div class="l1">DE VOLTA AO</div><div class="l2">FUTURO</div><div class="bar"></div><div class="l3">TOWNHALL · HILL VALLEY</div></div>`;
  const flux = () => `<div class="flux"><i></i><i></i><i></i><b></b></div>`;
  const quoteBlock = i => { const q = QUOTES[i % QUOTES.length]; return `<div class="quote" id="quote">“${esc(q[0])}”<small>${esc(q[1])}</small></div>`; };
  const eras = () => `<div class="eras" id="eras">${ERAS_FILM.map((e, i) => `<div class="era ${i === S.eraIdx ? 'on' : ''}"><div class="y">${esc(e.y)}</div><div class="f">${esc(e.f)}</div><div class="d">${esc(e.d)}</div></div>`).join('')}</div>`;
  const circuits = (dest, last) => `<div class="circuits">
      <div class="tc r"><label>DESTINATION TIME</label><div class="led">${esc(dest)}</div></div>
      <div class="tc g"><label>PRESENT TIME</label><div class="led" id="ledNow">${ledNow(true)}</div></div>
      <div class="tc a"><label>LAST TIME DEPARTED</label><div class="led">${esc(last)}</div></div>
    </div>`;
  const huge = (kind, cls = '') => `<div class="cdwrap" id="cdwrap" data-kind="${kind}"><div class="huge ${cls}" id="cd">--:--</div><div class="ptag">❚❚ PAUSADO</div></div>`;
  function gauge() {
    const cx = 125, cy = 112, R = 96;
    const ang = v => (-90 + (v / 88) * 180) * Math.PI / 180;
    const pt = (v, r) => ({ x: +(cx + r * Math.sin(ang(v))).toFixed(1), y: +(cy - r * Math.cos(ang(v))).toFixed(1) });
    const a0 = pt(0, R), a1 = pt(88, R);
    let ticks = '';
    for (let v = 0; v <= 88; v += 8) {
      const major = v % 16 === 0 || v === 88, p1 = pt(v, R), p2 = pt(v, R - (major ? 12 : 7));
      ticks += `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="${v === 88 ? '#ffd21f' : '#bcaee0'}" stroke-width="${v === 88 ? 3 : 2}" stroke-linecap="round"/>`;
      if (v % 32 === 0 || v === 88) { const pl = pt(v, R - 26); ticks += `<text x="${pl.x}" y="${pl.y + 4}" text-anchor="middle" font-family="Orbitron" font-size="${v === 88 ? 13 : 10}" font-weight="900" fill="${v === 88 ? '#ffd21f' : '#bcaee0'}">${v}</text>`; }
    }
    const arc = `M ${a0.x} ${a0.y} A ${R} ${R} 0 0 1 ${a1.x} ${a1.y}`;
    return `<div class="gauge"><svg viewBox="0 0 250 130"><defs><linearGradient id="gg" x1="0" x2="1"><stop offset="0" stop-color="#2ee6d6"/><stop offset=".55" stop-color="#ffd21f"/><stop offset="1" stop-color="#ff2a00"/></linearGradient></defs>
      <path d="${arc}" fill="none" stroke="#2a1d55" stroke-width="10" stroke-linecap="round"/><path id="gaugeArc" d="${arc}" fill="none" stroke="url(#gg)" stroke-width="10" stroke-linecap="round" pathLength="100" stroke-dasharray="0 100"/>${ticks}
      <text x="125" y="96" text-anchor="middle" font-family="Orbitron" font-size="8" font-weight="700" fill="#bcaee0" letter-spacing="3">MPH</text>
      <g id="needle" class="needle"><line x1="125" y1="112" x2="125" y2="32" stroke="#ff3b30" stroke-width="4" stroke-linecap="round"/><circle cx="125" cy="112" r="8" fill="#1d1142" stroke="#bcaee0" stroke-width="2"/></g></svg></div>`;
  }
  function qrBox() {
    const url = location.origin + '/';
    let svg = '';
    try { const q = qrcode(0, 'M'); q.addData(url); q.make(); svg = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); } catch { svg = ''; }
    return `<div class="qrbox">${svg ? `<div class="qr">${svg}</div>` : ''}<div class="url">${esc(url.replace(/^https?:\/\//, ''))}</div></div>`;
  }

  // Carro 3D + flux capacitor (do painel "De Volta para o Sucesso")
  const carBox = (cls = '', extra = '') => `<div class="carbox ${cls}"><canvas class="car3d" data-car></canvas>${extra}
      <div class="energy"><div class="lbl"><span><svg class="fluxi" viewBox="0 0 24 24"><line x1="4" y1="4" x2="12" y2="12"/><line x1="20" y1="4" x2="12" y2="12"/><line x1="12" y1="12" x2="12" y2="21"/></svg>FLUX CAPACITOR</span><span id="gw">0.00 / 1.21 GIGAWATTS</span></div><div class="ebar" id="ebarW"><i id="ebar"></i></div></div></div>`;
  function setEnergy(e, animate) {
    e = Math.max(0, Math.min(1, e || 0));
    const gain = e - S.energy; S.energy = e;
    const bar = $('#ebar'), gw = $('#gw');
    if (bar) bar.style.width = (e * 100).toFixed(1) + '%';
    if (gw) gw.textContent = e >= 1 ? '⚡ 1.21 GIGAWATTS · PRONTO PARA A VIAGEM' : `${(e * 1.21).toFixed(2)} / 1.21 GIGAWATTS`;
    if (!S.car) return;
    if (animate && gain > 0) {
      S.car.charge(e);
      const box = $('.carbox'), w = $('#ebarW');
      if (box) { const g = document.createElement('div'); g.className = 'gwplus'; g.textContent = `+${(gain * 1.21).toFixed(2)} GW ⚡`; box.appendChild(g); setTimeout(() => g.remove(), 1300); }
      if (w) { w.classList.remove('hit'); void w.offsetWidth; w.classList.add('hit'); }
    } else S.car.setEnergy(e);
  }
  function mountCar(key) {
    const cv = $('[data-car]');
    S.car = cv && window.Delorean3D ? Delorean3D.car(cv) : null;
    S.energy = 0;
    if (!S.car) return;
    if (key === 'welcome') setEnergy(S.state.counts.checkedIn / Math.max(1, S.state.counts.total), false);
    if (key === 'roundEnd') { setEnergy(1, false); setTimeout(() => S.car && S.car.doWarp(), 500); }
    if (key === 'projection') { resetProjection(); patchProjection(); }
  }
  // faíscas contínuas no carro (mais energia, mais faíscas)
  setInterval(() => { if (S.car && !document.hidden && S.energy > 0 && Math.random() < S.energy * .7) S.car.spark(); }, 700);

  /* ---------- De Volta para o Sucesso ----------
   * Enquanto recebe, o telão mostra só o carro carregando a cada resposta (nenhum texto aparece).
   * Ao encerrar, o carro entra no portal. A nuvem de palavras só aparece quando o Doc clica em
   * "Revelar respostas"; nas dinâmicas 2 e 3 ele sorteia um viajante (nome, resposta, guia e tempo de fala). */
  function projectionScene(p) {
    const d = DYN[p.activityId] || DYN.d1;
    const guide = p.live && p.live.guide;
    return `<section class="live-projection" style="--c:${d.c}">
      <div class="kicker">DE VOLTA PARA O SUCESSO · DINÂMICA ${d.n} · ${esc(String(p.title).toUpperCase())}</div>
      <h1 class="pq">${esc(p.question)}</h1>
      <div class="carbox wide" id="pStage" data-mode="car">
        <div class="layer car-layer"><canvas class="car3d" data-car></canvas>
          <div class="energy"><div class="lbl"><span><svg class="fluxi" viewBox="0 0 24 24"><line x1="4" y1="4" x2="12" y2="12"/><line x1="20" y1="4" x2="12" y2="12"/><line x1="12" y1="12" x2="12" y2="21"/></svg>FLUX CAPACITOR</span><span id="gw">0.00 / 1.21 GIGAWATTS</span></div><div class="ebar" id="ebarW"><i id="ebar"></i></div></div>
        </div>
        <div class="layer cloud-layer"><canvas id="pCloud"></canvas></div>
        <div class="tcbox count"><b id="pCount">000</b><span>RESPOSTAS</span></div>
        <div class="phase" id="pPhase">SINCRONIZANDO…</div>
        <div class="tcbox timer" id="pTimerW" hidden><b id="pTimer">--:--</b><span>RECEBIMENTO</span></div>
        <div class="portal-msg" id="pDone">${p.activityId === 'd4' ? 'DESTINO: 2027 ⚡' : 'MISSÃO CUMPRIDA ⚡'}</div>
        <div class="draw" id="pDraw" hidden>
          <div class="dk">VIAJANTE SORTEADO</div>
          <div class="reel" id="pReel">???</div>
          <div class="ans" id="pAns" hidden></div>
          ${guide ? `<div class="guide">${guide.map(g => `<span>${esc(g)}</span>`).join('<i>→</i>')}</div>` : ''}
          <div class="tcbox big" id="pTalkW"><b id="pTalk">--:--</b><span>TEMPO DE FALA</span></div>
        </div>
      </div>
    </section>`;
  }
  const sucPhase = l => (l ? (l.phase === 'run' && l.endsAt && l.endsAt <= serverNow() ? 'done' : l.phase) : null);
  function resetProjection() {
    clearInterval(S.reelT);
    Object.assign(S, { seen: new Set(), roundId: null, liveCount: null, prevPhase: null, endStage: null, drawAt: null, revealed: false, talkDone: null, cloud: null });
    S.endTok++;
  }
  function patchProjection() {
    const box = $('#pStage'), p = S.state && S.state.presentation; if (!box || !p) return;
    const l = p.live, ph = sucPhase(l), n = l ? l.responseCount : null, texts = Array.isArray(S.responses) ? S.responses : null;
    if (!S.cloud && window.NuvemDePalavras) S.cloud = new NuvemDePalavras($('#pCloud'), { scale: 1.25, wide: true });
    // rodada nova (o Doc limpou as respostas): zera nuvem e energia
    if (l && S.roundId !== l.roundId) { if (S.roundId !== null) { S.seen = new Set(); S.liveCount = null; if (S.cloud) S.cloud.reset(); } S.roundId = l.roundId; }
    // as respostas entram na nuvem em silêncio: ela só aparece quando o Doc revela
    if (texts) for (const r of texts) if (!S.seen.has(r.id)) { S.seen.add(r.id); if (S.cloud) S.cloud.add(r.answer); }
    $('#pCount').textContent = n === null ? '---' : String(n).padStart(3, '0');
    const phEl = $('#pPhase'); phEl.textContent = ph ? PHASES[ph] || '' : 'SINCRONIZANDO…'; phEl.dataset.phase = ph || '';
    if (n !== null) { const grew = S.liveCount !== null && n > S.liveCount; setEnergy(n / TARGET, grew && ph !== 'done'); if (grew && window.Trilha) Trilha.sfx('blip'); S.liveCount = n; }
    // encerramento: o carro entra no portal e a tela troca para a nuvem
    if (ph === 'done' && S.endStage === null) {
      if (S.prevPhase && S.prevPhase !== 'done' && S.car) {
        S.endStage = 'warp'; S.car.doWarp(); const tok = ++S.endTok;
        setTimeout(() => { if (tok === S.endTok) flash(); }, 2300);
        setTimeout(() => { if (tok === S.endTok) { S.endStage = 'shown'; patchProjection(); } }, 2700);
      } else S.endStage = 'shown';
    } else if (ph && ph !== 'done' && S.endStage !== null) { S.endStage = null; S.endTok++; if (S.car) S.car.reset(S.energy); }
    if (ph) S.prevPhase = ph;
    const ended = S.endStage === 'shown', mode = p.revealed && texts && ended ? 'cloud' : ended ? 'arrived' : 'car';
    if (mode === 'cloud' && box.dataset.mode === 'arrived') { flash(); if (window.Trilha) Trilha.sfx('reveal'); } // o Doc revelou as respostas
    box.dataset.mode = mode;
    box.classList.toggle('final', ended && p.activityId === 'd4');
    if (S.cloud) S.cloud.dim = ended && p.activityId === 'd4';
    // sorteio
    const d = p.draw, ov = $('#pDraw');
    if (d && S.drawAt !== d.at) {
      S.drawAt = d.at; S.revealed = false; S.talkDone = null; clearInterval(S.reelT);
      const reel = $('#pReel'), ans = $('#pAns'); ov.hidden = false; ans.hidden = true;
      const reveal = () => { clearInterval(S.reelT); S.revealed = true; reel.classList.remove('spin'); reel.textContent = d.name; if (window.Trilha) Trilha.sfx('reveal'); patchProjection(); };
      const wait = 2400 - (serverNow() - d.at);
      if (wait > 150) {
        const names = texts && texts.length ? texts.map(r => r.name) : ['• • •', '• •', '•'];
        reel.classList.add('spin'); S.reelT = setInterval(() => { reel.textContent = names[Math.floor(Math.random() * names.length)]; }, 90);
        const at = d.at; setTimeout(() => { if (S.drawAt === at) reveal(); }, wait);
      } else reveal();
    } else if (!d && S.drawAt !== null) { S.drawAt = null; clearInterval(S.reelT); ov.hidden = true; }
    if (d && S.revealed) { const ans = $('#pAns'); if (S.drawAnswer) { ans.textContent = `“${S.drawAnswer}”`; ans.hidden = false; } else ans.hidden = true; }
    tickProjection();
  }
  function tickProjection() {
    const w = $('#pTimerW'), p = S.state && S.state.presentation; if (!w || !p) return;
    const l = p.live, ph = sucPhase(l);
    if (l && ph !== S.prevPhase && S.prevPhase !== null) return patchProjection(); // o prazo acabou entre dois avisos do servidor
    const running = ph === 'run' && l.endsAt, paused = ph === 'paused' && p.activityId !== 'd1';
    w.hidden = !running && !paused;
    if (!w.hidden) { const sec = running ? Math.max(0, Math.ceil((l.endsAt - serverNow()) / 1000)) : l.remainingSeconds; $('#pTimer').textContent = fmt(sec); w.classList.toggle('alert', !!running && sec <= 30); }
    const t = p.draw && p.draw.talk, tk = $('#pTalk');
    if (t && tk) {
      const left = t.endsAt ? Math.max(0, Math.ceil((t.endsAt - serverNow()) / 1000)) : t.remaining;
      tk.textContent = fmt(left); $('#pTalkW').classList.toggle('alert', !!t.endsAt && left > 0 && left <= 30);
      if (t.endsAt && left === 0 && S.talkDone !== t.endsAt) { S.talkDone = t.endsAt; if (window.Trilha) Trilha.sfx('timeup'); }
    }
  }

  /* ---------- Reflexão · Ato 1: O Combustível do Futuro ----------
   * Menu com as paradas (votos e energia de cada uma) e, com uma parada aberta, a pergunta, o Flux
   * Capacitor carregando a cada voto, o cronômetro da votação e os 2 projetos sorteados. */
  const RF_STATUS = { idle: 'AGUARDANDO INÍCIO', run: '● VOTAÇÃO ABERTA', paused: '❚❚ VOTAÇÃO PAUSADA', done: 'VOTAÇÃO ENCERRADA' };
  const clockNow = () => { const d = new Date(serverNow()); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const rfPhase = c => (c.phase === 'run' && c.endsAt && c.endsAt <= serverNow() ? 'done' : c.phase);
  const rfLeft = c => (c.phase === 'run' && c.endsAt ? Math.max(0, Math.ceil((c.endsAt - serverNow()) / 1000)) : c.remaining);
  async function loadProjects(rev) {
    if (S.rfRev === rev) return; S.rfRev = rev;
    try { const d = await (await fetch('/api/reflexao/projects', { cache: 'no-store' })).json(); S.rfProjects = (d.projects || []).map(x => x.name); } catch { S.rfRev = null; }
  }
  function reflexaoScene(r) {
    if (r.open === null || !r.cur) {
      return `<section class="rfx rfx-menu">
        <div class="rfx-tcs"><div class="tcbox" style="--c:var(--yellow)"><b>2026</b><span>LAST TIME DEPARTED</span></div><div class="tcbox" style="--c:var(--cyan)"><b id="rClock">${clockNow()}</b><span>PRESENT TIME</span></div><div class="tcbox" style="--c:var(--orange)"><b>2027</b><span>DESTINATION TIME</span></div></div>
        <h1 class="rfx-title">${esc(r.title.toUpperCase())}</h1>
        <div class="rfx-sub">${esc(r.subtitle.toUpperCase())}</div>
        <div class="rfx-cards n${r.themes.length}">${r.themes.map((t, i) => `<div class="rcard" data-i="${i}" style="--c:${t.c}"><div class="n">${t.n}</div><div class="tx"><h3>${esc(t.t)}</h3><p>${esc(t.q)}</p><div class="k"></div></div><span class="badge">✓ SORTEADO</span></div>`).join('')}</div>
        <div class="rfx-gbar"><div class="lbl"><span>⚡ FLUX CAPACITOR · ENERGIA TOTAL</span><span id="rGTot"></span></div><div class="ebar"><i id="rGBar"></i></div></div>
      </section>`;
    }
    const t = r.themes[r.open];
    return `<section class="rfx rfx-theme" style="--c:${t.c}">
      <div class="rfx-top"><div class="ttl">PARADA ${t.n} · ${esc(t.t.toUpperCase())}</div><div class="tcbox" style="--c:${t.c}"><b id="rGw">0.00</b><span>GW NESTA PARADA</span></div></div>
      <div class="rfx-stage">
        <div class="rfx-side">
          <div class="q">${esc(t.q)}</div>
          <div class="scan">▲ ESCOLHA 1 PROJETO NO APP ▲</div>
          <div class="tcbox" style="--c:var(--cyan)"><b id="rCnt">000</b><span>VOTOS</span></div>
        </div>
        <div class="rfx-view" id="rView">
          <canvas id="rFlux"></canvas>
          <div class="rfeed" id="rFeed"></div>
          <div class="rstatus" id="rStatus"></div>
          <div class="tcbox timer" id="rTimerW" style="--c:var(--yellow)"><b id="rTimer">--:--</b><span>TEMPO DE VOTAÇÃO</span></div>
          <div class="energy"><div class="lbl"><span>⚡ FLUX CAPACITOR</span><span id="rLvl"></span></div><div class="ebar" id="rBarW"><i id="rBar"></i></div></div>
          <div class="rflash" id="rFlash"></div>
          <div class="rdraw" id="rDraw" hidden>
            <div class="dk">VIAJANTES SORTEADOS</div>
            <h2>${esc(t.t)}</h2>
            <div class="tcards" id="rCards"></div>
          </div>
        </div>
      </div>
    </section>`;
  }
  function mountReflexao() {
    S.rfTimers.forEach(clearTimeout); S.rfTimers = [];
    if (S.fx) { S.fx.destroy(); S.fx = null; }
    S.rf = null;
    const r = S.state && S.state.reflexao; if (!r) return;
    loadProjects(r.rev);
    if (r.cur && window.FluxCapacitor && $('#rFlux')) { S.fx = FluxCapacitor($('#rFlux')); S.fx.setColor(r.themes[r.open].c); S.fx.setEnergy(r.cur.energy); }
    patchReflexao();
  }
  // roleta de um cartão: nomes de projetos girando até parar no sorteado
  function spinCard(k, item, ms) {
    const reel = $('#rReel' + k), owner = $('#rOwner' + k); if (!reel) return;
    const names = S.rfProjects && S.rfProjects.length ? S.rfProjects : ['• • •', '• •', '•'];
    reel.classList.add('spin'); reel.textContent = '???'; owner.textContent = '';
    const iv = setInterval(() => { reel.textContent = names[Math.floor(Math.random() * names.length)]; }, 85);
    S.rfTimers.push(setTimeout(() => {
      clearInterval(iv); if (!reel.isConnected) return;
      reel.classList.remove('spin'); reel.textContent = item.name; owner.textContent = item.owner;
      if (S.fx) S.fx.burst(); if (window.Trilha) Trilha.sfx('reveal');
    }, ms), iv);
  }
  function patchReflexao() {
    const r = S.state && S.state.reflexao; if (!r) return;
    const gw = e => (e * 1.21).toFixed(2);
    if (r.open === null || !r.cur) { // menu das paradas
      document.querySelectorAll('.rcard').forEach(el => { const t = r.themes[+el.dataset.i]; if (!t) return; el.querySelector('.k').textContent = `${t.votes} ${t.votes === 1 ? 'voto' : 'votos'} · ${t.gw.toFixed(2)} GW`; el.classList.toggle('done', t.drawn); });
      const b = $('#rGBar'); if (b) b.style.width = (r.energy * 100).toFixed(1) + '%';
      const g = $('#rGTot'); if (g) g.textContent = `${gw(r.energy)} / 1.21 GIGAWATTS`;
      return;
    }
    const c = r.cur, t = r.themes[r.open], ph = rfPhase(c), prev = S.rf, first = !prev;
    if (!$('#rCnt')) return;
    $('#rCnt').textContent = String(c.votes).padStart(3, '0');
    $('#rBar').style.width = (c.energy * 100).toFixed(1) + '%';
    $('#rLvl').textContent = c.energy >= 1 ? '⚡ ENERGIA MÁXIMA' : `NÍVEL ${Math.round(c.energy * 100)}%`;
    $('#rGw').textContent = t.gw.toFixed(2);
    const st = $('#rStatus'); st.textContent = RF_STATUS[ph] || ''; st.dataset.phase = ph;
    if (S.fx) S.fx.setEnergy(c.energy);
    // voto novo: o Flux Capacitor carrega, o nome de quem votou passa na tela
    if (!first && c.votes > prev.votes && ph !== 'done') {
      if (S.fx) S.fx.charge(false);
      if (c.last && c.last.name) { const f = $('#rFeed'), el = document.createElement('div'), b = document.createElement('b'); b.textContent = c.last.name; el.append(b, document.createTextNode(' votou ⚡')); f.prepend(el); setTimeout(() => el.remove(), 3100); while (f.children.length > 5) f.lastChild.remove(); }
      const view = $('#rView'), g = document.createElement('div'); g.className = 'gwplus'; g.textContent = `+${((c.votes - prev.votes) * 1.21 / r.themes.length / r.fullVotes).toFixed(3)} GW ⚡`; view.appendChild(g); setTimeout(() => g.remove(), 1300);
      const w = $('#rBarW'); w.classList.remove('hit'); void w.offsetWidth; w.classList.add('hit');
      if (window.Trilha) Trilha.sfx('blip');
    }
    if (!first && ph === 'done' && prev.phase !== 'done') { if (S.fx) S.fx.burst(); const f = $('#rFlash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); if (window.Trilha) Trilha.sfx('timeup'); }
    // sorteio dos 2 projetos (e troca de um deles)
    const d = c.draw, ov = $('#rDraw'), drawAt = d ? d.at : null, swapAt = d && d.swap ? d.swap.at : null;
    if (d && (first || prev.drawAt !== drawAt)) {
      const fresh = serverNow() - d.at < 1500 && !(d.swap && d.swap.at > d.at);
      ov.hidden = false;
      $('#rCards').innerHTML = d.items.map((v, k) => `<div class="tcard"><span class="star">★</span><div class="lb">PROJETO SORTEADO · 0${k + 1}</div><div class="reel" id="rReel${k}">${fresh ? '???' : esc(v.name)}</div><div class="lb mu">RESPONSÁVEL PELO PROJETO</div><div class="owner" id="rOwner${k}">${fresh ? '' : esc(v.owner)}</div></div>`).join('');
      if (fresh) d.items.forEach((v, k) => spinCard(k, v, 1800 + k * 700));
    } else if (d && swapAt && prev.swapAt !== swapAt) {
      const k = d.swap.k;
      if (serverNow() - swapAt < 1500) spinCard(k, d.items[k], 1500); else { const reel = $('#rReel' + k), owner = $('#rOwner' + k); if (reel) { reel.textContent = d.items[k].name; owner.textContent = d.items[k].owner; } }
    } else if (!d && !ov.hidden) { ov.hidden = true; S.rfTimers.forEach(clearTimeout); S.rfTimers = []; }
    S.rf = { votes: c.votes, phase: ph, drawAt, swapAt };
    tickReflexao();
  }
  function tickReflexao() {
    const r = S.state && S.state.reflexao; if (!r) return;
    const ck = $('#rClock'); if (ck) ck.textContent = clockNow();
    const c = r.cur, w = $('#rTimerW'); if (!c || !w) return;
    if (S.rf && rfPhase(c) !== S.rf.phase) return patchReflexao(); // o prazo acabou entre dois avisos do servidor
    const left = rfLeft(c);
    $('#rTimer').textContent = fmt(left);
    w.classList.toggle('alert', c.phase === 'run' && left <= 15 && left > 0);
  }

  /* ---------- cenas ---------- */
  function sceneFor() {
    const st = S.state, c = st.conn, sc = (st.screen && st.screen.scene) || 'auto';
    if (st.presentation) return ['projection', projectionScene(st.presentation)];
    if (sc === 'clock') return ['clock', sceneClock()];
    if (sc === 'logo') return ['logo', `${logo()}${flux()}`];
    if (st.reflexao) return ['reflexao', reflexaoScene(st.reflexao)];

    const b = st.block;
    if (b === 'welcome') return ['welcome', `${logo()}<div class="rowx welcome-row">${qrBox()}<div class="checkin-car">${carBox()}<div class="count"><span id="count">${st.counts.checkedIn}</span><small> / ${st.counts.total} a bordo</small></div></div></div>`];
    if (b === 'standby') return ['clock', sceneClock()];
    if (b === 'stage') { // bloco de fala: tela calma, só o nome e o tema do bloco
      const g = st.stage || {}, theme = (g.theme || '').trim();
      return ['stage', `<div class="stage-calm">${theme ? `<div class="sk">${esc(g.title)}</div>` : ''}<div class="st">${esc(theme || g.title || '')}</div>${g.speaker ? `<div class="ss">${esc(g.speaker)}</div>` : ''}</div>`];
    }
    if (b === 'message') { const m = st.message; return ['message', `<div class="msg"><div class="e">${esc(m.emoji || '📣')}</div></div><div class="title">${esc(m.title)}</div><div class="msg"><p>${linkify(m.body)}</p></div>`]; }
    if (b === 'closing') return ['closing', `<div class="title">FIM DA VIAGEM</div><div class="sub">${esc(st.event.closingText)}</div>${credits()}`];
    // conexões
    const r = c.round, era = roundEra(r), t = c.timer;
    if (c.phase === 'idle' || c.phase === 'ready') return ['prep', `<div class="kicker">BLOCO CONEXÕES</div><div class="title">ROTAS TEMPORAIS</div>${flux()}`];
    if (c.phase === 'matching') return ['matching', `<div class="kicker">VIAGEM ${r}/3 · ${esc(era.label)} · ${esc(era.year)}</div><div class="title">ENCONTRE SUA DUPLA</div>${t && t.kind === 'matching' ? huge('matching', 'amber') : ''}<div class="sub">Encontre quem tem a mesma placa no celular.</div>`];
    if (c.phase === 'talk') return ['talk', `<div class="kicker">VIAGEM ${r}/3 · ${esc(era.label)} · ${esc(era.year)}</div><div class="rowx">${gauge()}${huge('talk')}</div>`];
    if (c.phase === 'roundEnd') return ['roundEnd', `<div class="title">88 MPH!</div>${carBox('warp')}${t && t.kind === 'break' ? huge('break', 'amber') : ''}`];
    if (c.phase === 'ranking') return ['ranking', `<div class="kicker">AVALIAÇÃO</div><div class="title cy">AVALIE NO CELULAR</div><div class="count"><span id="rankDone">${c.rankingDone}</span><small> / ${c.rankingTotal} avaliaram</small></div><div class="bar"><i id="rankBar" style="width:${Math.round(100 * c.rankingDone / Math.max(1, c.rankingTotal))}%"></i></div>${t && t.kind === 'ranking' ? huge('ranking', 'green') : ''}`];
    if (c.phase === 'results') return ['results', `<div class="kicker">CONEXÕES CALCULADAS</div><div class="title">OLHE O CELULAR</div><div class="sub"><b>${c.mutualCount}</b> conexões mútuas</div>${c.mutualPairs && c.mutualPairs.length ? `<div class="mutual">${c.mutualPairs.map(p => `<span>${esc(p[0].split(' ')[0])} ⚡ ${esc(p[1].split(' ')[0])}</span>`).join('')}</div>` : ''}`];
    return ['clock', sceneClock()];
  }
  function sceneClock() {
    const c = S.state.conn, r = c.round || 0;
    const dest = r ? roundEra(Math.min(3, r + (c.phase === 'results' ? 0 : 0))).led : 'OUT 26 1985 01:21';
    const last = r > 1 ? roundEra(r - 1).led : '--- -- ---- --:--';
    return `${circuits(dest, last)}`;
  }
  function credits() {
    if (!S.people) { loadPeople().then(render); return ''; }
    const names = S.people.map(p => p.name);
    const dur = Math.max(40, names.length * 2.2);
    return `<div class="credits"><div class="roll" style="--dur:${dur}s"><div class="h">ELENCO · VIAJANTES DO TEMPO</div>${names.map(n => `<div>${esc(n)}</div>`).join('')}<div class="h">DIREÇÃO · DOC BROWN</div><div>Hill Valley, 1985</div></div></div>`;
  }

  /* ---------- render / tick ---------- */
  function render() {
    if (!S.state) return;
    applyAudio();
    const [key, html] = sceneFor();
    const pr = S.state.presentation, rf = key === 'reflexao' ? S.state.reflexao : null;
    const k = `${key}|${rf ? `${rf.open}:${rf.rev}` : ''}|${pr ? pr.roomId + pr.activityId : ''}|${key === 'stage' ? JSON.stringify(S.state.stage) : ''}|${S.state.conn.round}|${S.state.conn.timer ? S.state.conn.timer.kind : ''}|${JSON.stringify(S.state.message)}|${S.state.conn.mutualCount}|${(S.state.conn.mutualPairs || []).length}|${S.people ? S.people.length : -1}`;
    if (k !== S.key) {
      S.key = k; $('#scene').innerHTML = html;
      $('#scene').classList.toggle('projection-scene', key === 'projection' || key === 'reflexao');
      $('#scene').dataset.key = key;
      mountCar(key);
      mountReflexao();
      if (key === 'roundEnd' || key === 'results') flash();
      if (key === 'projection') pollScreen(); else { clearTimeout(S.pollT); S.responses = null; }
      // telas calmas (bloco de fala): fundo parado e escurecido, sem raios
      S.calm = key === 'stage'; document.body.classList.toggle('calm', S.calm); if (window.Delorean3D) Delorean3D.pause(S.calm);
    } else {
      const c = $('#count'); if (c) { c.textContent = S.state.counts.checkedIn; setEnergy(S.state.counts.checkedIn / Math.max(1, S.state.counts.total), S.checked !== null && S.state.counts.checkedIn > S.checked); }
      if (key === 'projection') patchProjection();
      if (key === 'reflexao') patchReflexao();
      const rd = $('#rankDone'); if (rd) { rd.textContent = S.state.conn.rankingDone; const b = $('#rankBar'); if (b) b.style.width = Math.round(100 * S.state.conn.rankingDone / Math.max(1, S.state.conn.rankingTotal)) + '%'; }
    }
    S.checked = S.state.counts.checkedIn;
    tick();
  }
  function tick() {
    $('#osdNow').textContent = ledNow();
    const led = $('#ledNow'); if (led) led.textContent = ledNow(true);
    if (!S.state) return;
    tickProjection();
    tickReflexao();
    const t = S.state.conn.timer, wrap = $('#cdwrap');
    if (!t || !wrap || wrap.dataset.kind !== t.kind) return;
    const left = t.paused ? t.remaining : Math.max(0, Math.round((t.endsAt - serverNow()) / 1000));
    $('#cd').textContent = fmt(left);
    wrap.classList.toggle('hurry', !t.paused && left <= 10);
    wrap.classList.toggle('paused', !!t.paused);
    if (t.kind === 'talk') {
      const frac = Math.min(1, Math.max(0, 1 - left / Math.max(1, t.duration)));
      const n = $('#needle'); if (n) n.style.transform = `rotate(${-90 + frac * 180}deg)`;
      const a = $('#gaugeArc'); if (a) a.setAttribute('stroke-dasharray', `${(frac * 100).toFixed(1)} 100`);
    }
  }
  setInterval(tick, 500);
  setInterval(() => { if (!S.calm && Math.random() < .2) flash(); }, 9000);
  // som do telão (música, trilha de fundo ou silêncio, escolhido no Painel do Doc)
  function applyAudio() {
    if (!window.Trilha || !S.state || !S.state.audio) return;
    const a = S.state.audio;
    Trilha.apply({ mode: a.out === 'painel' ? 'off' : a.mode, volume: a.volume, musicUrl: a.musicUrl, ambientUrl: a.ambientUrl });
  }
  if (window.Trilha) {
    const chip = $('#soundChip');
    Trilha.onChange(locked => { chip.hidden = !locked; report(); });
    const unlock = () => Trilha.unlock();
    document.addEventListener('pointerdown', unlock); document.addEventListener('keydown', unlock);
  }
  // fundo 3D: o mesmo céu e a mesma estrada do painel do Sucesso
  if (window.Delorean3D) Delorean3D.background($('#bg3d'), { dprMax: 1 });
  connect();
})();
