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
    blk: null, trT: [], trI: null, // transição entre blocos
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
    S.socket.on('cena:pulse', p => { if (window.Cenas) Cenas.pulse(p); }); // Reconhecimento: a carga do Flux Capacitor subindo com os toques dos celulares
    S.socket.on('doc:test', () => { if (window.DocCena) { DocCena.testVoice(S.state); setTimeout(report, 300); } }); // Painel do Doc: "Testar a voz no telão"
    S.socket.on('connect', () => { pollScreen(); checkAuth(); });
  }
  // Avisa o Painel do Doc como este telão está: logado (pode mostrar respostas) e com o som liberado.
  function report() { if (S.socket && S.socket.connected) S.socket.emit('telao:status', { locked: !!(window.Trilha && Trilha.locked), auth: S.auth, doc: window.DocCena ? DocCena.progress() : null }); }
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
  // o nome do evento vem do conteúdo das cenas (Preparar → Agenda e cenas): "CDIO HC + BPC · TOWNHALL 2026"
  const eventLine = () => { const ev = (S.state && S.state.evento) || {}; return [ev.titulo, ev.sub].filter(Boolean).join(' · ').toUpperCase() || 'TOWNHALL · HILL VALLEY'; };
  const logo = () => `<div class="logo"><div class="l1">DE VOLTA AO</div><div class="l2">FUTURO</div><div class="bar"></div><div class="l3">${esc(eventLine())}</div></div>`;
  const flux = () => `<div class="flux"><i></i><i></i><i></i><b></b></div>`;
  // Quem conduz o bloco que está no ar (Preparar → Agenda e cenas → Quem conduz): placas com a foto de perfil e o nome
  const hostIni = n => String(n || '?').trim().split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const hosts = (cls = '', label = 'COM') => { const h = (S.state && S.state.hosts) || []; return h.length ? `<div class="hosts ${cls}">${label ? `<small>${label}</small>` : ''}${h.map(x => `<div class="host"><div class="av ${x.foto ? 'foto' : ''}">${esc(hostIni(x.nome))}${x.foto ? `<img src="${esc(x.foto)}" alt="">` : ''}</div><b>${esc(x.nome)}</b></div>`).join('')}</div>` : ''; };
  const quoteBlock = i => { const q = QUOTES[i % QUOTES.length]; return `<div class="quote" id="quote">“${esc(q[0])}”<small>${esc(q[1])}</small></div>`; };
  const eras = () => `<div class="eras" id="eras">${ERAS_FILM.map((e, i) => `<div class="era ${i === S.eraIdx ? 'on' : ''}"><div class="y">${esc(e.y)}</div><div class="f">${esc(e.f)}</div><div class="d">${esc(e.d)}</div></div>`).join('')}</div>`;
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

  // Participação especial (Conexões): quem ajudou a organizar e merece o crédito, mesmo sem estar na sala
  const guests = () => { const e = (S.state && S.state.especial) || {}, p = e.pessoas || []; return p.length ? `<div class="guest"><small>PARTICIPAÇÃO ESPECIAL</small><div class="hosts">${p.map(x => `<div class="host star"><div class="av ${x.foto ? 'foto' : ''}">${esc(hostIni(x.nome))}${x.foto ? `<img src="${esc(x.foto)}" alt="">` : ''}</div><b>${esc(x.nome)}</b></div>`).join('')}</div>${e.nota ? `<p>${esc(e.nota)}</p>` : ''}</div>` : ''; };

  /* ---------- De Volta para o Sucesso ----------
   * Enquanto recebe, o telão mostra só o carro carregando a cada resposta (nenhum texto aparece).
   * Ao encerrar, o carro entra no portal. A nuvem de palavras só aparece quando o Doc clica em
   * "Revelar respostas"; nas dinâmicas 2 e 3 ele sorteia um viajante (nome, resposta, guia e tempo de fala). */
  function projectionScene(p) {
    const d = DYN[p.activityId] || DYN.d1;
    const guide = p.live && p.live.guide;
    return `<section class="live-projection" style="--c:${d.c}">
      <div class="lp-head"><div class="kicker">DE VOLTA PARA O SUCESSO · DINÂMICA ${d.n} · ${esc(String(p.title).toUpperCase())}</div>${hosts('sm')}</div>
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
    }
  }

  /* ---------- Reflexão · Ato 1: O Combustível do Futuro ----------
   * Menu com as paradas (votos e energia de cada uma) e, com uma parada aberta, a pergunta, o Flux
   * Capacitor carregando a cada voto, o cronômetro da votação e, com suspense, os 2 projetos mais votados. */
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
        <div class="rfx-sub">${esc(r.subtitle.toUpperCase())}</div>${hosts('sm')}
        <div class="rfx-cards n${r.themes.length}">${r.themes.map((t, i) => `<div class="rcard" data-i="${i}" style="--c:${t.c}"><div class="n">${t.n}</div><div class="tx"><h3>${esc(t.t)}</h3><p>${esc(t.q)}</p><div class="k"></div></div><span class="badge">✓ REVELADA</span></div>`).join('')}</div>
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
            <div class="dk" id="rDk">OS PROJETOS MAIS VOTADOS</div>
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
  // suspense de um cartão: nomes de projetos girando até parar no mais votado
  function spinCard(k, item, ms, last) {
    const reel = $('#rReel' + k), owner = $('#rOwner' + k), card = reel && reel.closest('.tcard'); if (!reel) return;
    const names = S.rfProjects && S.rfProjects.length ? S.rfProjects : ['• • •', '• •', '•'];
    reel.classList.add('spin'); reel.textContent = '???'; owner.textContent = '';
    const iv = setInterval(() => { reel.textContent = names[Math.floor(Math.random() * names.length)]; }, 85);
    S.rfTimers.push(setTimeout(() => {
      clearInterval(iv); if (!reel.isConnected) return;
      reel.classList.remove('spin'); reel.textContent = item.name; owner.textContent = item.owner; card.classList.add('shown');
      if (S.fx) S.fx.burst(); if (window.Trilha) Trilha.sfx('reveal');
      if (last) { const f = $('#rFlash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); $('#rDk').textContent = 'OS PROJETOS MAIS VOTADOS'; }
    }, ms), iv);
  }
  const SUSPENSE = [5600, 3200]; // o 2º mais votado aparece primeiro; o 1º fica para o final
  function patchReflexao() {
    const r = S.state && S.state.reflexao; if (!r) return;
    const gw = e => (e * 1.21).toFixed(2);
    if (r.open === null || !r.cur) { // menu das paradas
      document.querySelectorAll('.rcard').forEach(el => { const t = r.themes[+el.dataset.i]; if (!t) return; el.querySelector('.k').textContent = `${t.votes} ${t.votes === 1 ? 'voto' : 'votos'} · ${t.gw.toFixed(2)} GW`; el.classList.toggle('done', t.revealed); });
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
    // os 2 mais votados: suspense (roleta de nomes), primeiro o 2º lugar e por último o 1º
    const d = c.top, ov = $('#rDraw'), topAt = d ? d.at : null, counts = d ? d.items.map(v => v.votes).join() : '';
    const card = (v, k, hidden) => `<div class="tcard ${hidden ? '' : 'shown'} p${k + 1}"><span class="star">${k ? '★' : '🏆'}</span><div class="lb">${k + 1}º MAIS VOTADO</div><div class="reel" id="rReel${k}">${hidden ? '???' : esc(v.name)}</div><div class="lb mu">RESPONSÁVEL PELO PROJETO</div><div class="owner" id="rOwner${k}">${hidden ? '' : esc(v.owner)}</div>${v.votes === undefined ? '' : `<div class="nv">${v.votes} ${v.votes === 1 ? 'VOTO' : 'VOTOS'}</div>`}</div>`;
    if (d && (first || prev.topAt !== topAt)) {
      const fresh = serverNow() - d.at < 1500, n = d.items.length;
      S.rfTimers.forEach(clearTimeout); S.rfTimers = [];
      ov.hidden = false;
      $('#rDk').textContent = fresh ? 'E OS MAIS VOTADOS SÃO…' : 'OS PROJETOS MAIS VOTADOS';
      $('#rCards').innerHTML = d.items.map((v, k) => card(v, k, fresh)).join('');
      if (fresh) { d.items.forEach((v, k) => spinCard(k, v, n === 1 ? SUSPENSE[1] : SUSPENSE[k], k === 0)); if (window.Trilha) Trilha.sfx('roll', (n === 1 ? SUSPENSE[1] : SUSPENSE[0]) / 1000); }
    } else if (d && prev.counts !== counts && !$('#rCards .spin')) $('#rCards').innerHTML = d.items.map((v, k) => card(v, k, false)).join(''); // o Doc ligou/desligou a quantidade de votos
    else if (!d && !ov.hidden) { ov.hidden = true; S.rfTimers.forEach(clearTimeout); S.rfTimers = []; }
    S.rf = { votes: c.votes, phase: ph, topAt, counts };
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

  /* ---------- transições entre blocos (viagem no tempo) ----------
   * Ao trocar de bloco, o telão mostra por alguns segundos os circuitos de tempo (de onde saímos, para
   * onde vamos) e um elemento do filme: velocímetro até 88 MPH com rastros de fogo, o Flux Capacitor
   * chegando a 1,21 gigawatts, o relógio da torre às 10:04, ou o "CONTINUA…" do final. Termina no raio. */
  const TR = {
    checkin: { kind: 'circuits', ms: 2800, quote: ['Circuitos de tempo ligados.', 'Doc Brown · 1985'] },
    stage: { kind: 'clock', ms: 3200, quote: ['Salve a torre do relógio!', 'Hill Valley · 1985'] },
    connections: { kind: 'speed', ms: 3800, quote: ['Para onde vamos, não precisamos de estradas.', 'Doc Brown · 1985'] },
    reflexao: { kind: 'fuel', ms: 3800, quote: ['Só um raio pode gerar 1,21 gigawatts!', 'Doc Brown · 1955'] },
    sucesso: { kind: 'speed', ms: 3800, quote: ['Quando essa belezinha chegar a 88 milhas por hora, você vai ver algo sério.', 'Doc Brown · 1985'] },
    message: { kind: 'circuits', ms: 2400, quote: ['Great Scott!', 'Doc Brown'] },
    standby: { kind: 'circuits', ms: 2400, quote: ['Isso é pesado, Doc.', 'Marty McFly · 1985'] },
    closing: { kind: 'end', ms: 4400, quote: ['O futuro ainda não está escrito. Ele é o que você fizer dele.', 'Doc Brown · 1990'] },
    doc: { kind: 'fuel', ms: 3800, quote: ['Você não está pensando em quatro dimensões!', 'Doc Brown · 1990'] },
    cena: { kind: 'speed', ms: 3600, quote: ['Para onde vamos, não precisamos de estradas.', 'Doc Brown · 1985'] }, // cada cena do deck traz a sua frase (Cenas.info)
  };
  // o bloco que está no ar: identidade (para saber quando mudou) e nome (para os circuitos de tempo)
  function blockInfo(st) {
    const pr = st.presentation, i = st.step ? st.step.index : 0;
    if (pr) { const d = DYN[pr.activityId] || DYN.d1; return { id: 'sucesso:' + pr.activityId, type: 'sucesso', name: `SUCESSO ${d.n} · ${pr.title}` }; }
    if (st.reflexao || st.block === 'reflexao') return { id: 'reflexao', type: 'reflexao', name: 'REFLEXÃO' };
    if (st.block === 'doc') return { id: 'doc', type: 'doc', name: 'VISÃO 2027' };
    if (st.block === 'cena' && st.cena && window.Cenas) return Cenas.info(st);
    switch (st.block) {
      case 'stage': return { id: 'stage:' + i, type: 'stage', name: (st.stage && st.stage.title) || 'BLOCO' };
      case 'connections': return { id: 'connections', type: 'connections', name: 'CONEXÕES' };
      case 'message': return { id: 'message:' + st.message.title, type: 'message', name: st.message.title || 'AVISO' };
      case 'standby': return { id: 'standby', type: 'standby', name: 'OLHOS NO TELÃO' };
      case 'closing': return { id: 'closing', type: 'closing', name: 'CONCLUSÃO' };
      default: return { id: 'welcome', type: 'checkin', name: 'CHECK-IN' };
    }
  }
  function playTransition(from, to) {
    const el = $('#tr'), cfg = to.tr || TR[to.type] || TR.checkin, led = v => String(v).toUpperCase().slice(0, 26);
    const secs = Number(S.state.settings.transitionSeconds) || 15, quick = to.type === 'message' || to.type === 'standby';
    stopTransition();
    $('#trLast').textContent = led(from.name); $('#trNow').textContent = ledNow(true);
    $('#trQuote').innerHTML = `“${esc(cfg.quote[0])}”<small>${esc(cfg.quote[1])}</small>`;
    const later = (ms, fn) => S.trT.push(setTimeout(fn, ms));
    const finish = ms => { later(ms, () => el.classList.add('out')); later(ms + 650, stopTransition); };      // a tela nova surge do clarão
    el.classList.remove('on', 'go', 'out', 'long'); delete el.dataset.phase;
    if (quick || secs < 7) { // versão curta (avisos, "olhos no telão" ou duração curta nos Ajustes): circuitos, mostrador e raio
      const ms = quick ? 3000 : Math.max(2400, secs * 1000);
      el.dataset.kind = cfg.kind; $('#trDest').textContent = led(to.name);
      void el.offsetWidth; el.classList.add('on');
      const num = $('#trNum'), ramp = ms - 1100, t0 = performance.now();
      const show = { speed: k => String(Math.round(88 * k)).padStart(2, '0'), fuel: k => (1.21 * k).toFixed(2).replace('.', ','), clock: k => `10:0${Math.min(4, Math.floor(k * 4.999))}` }[cfg.kind];
      $('#trUnit').textContent = { speed: 'MPH', fuel: 'GIGAWATTS', clock: 'PM · TORRE DO RELÓGIO' }[cfg.kind] || '';
      if (show) { num.textContent = show(0); S.trI = setInterval(() => { const k = Math.min(1, (performance.now() - t0) / ramp); num.textContent = show(k * k * (3 - 2 * k)); if (k >= 1) clearInterval(S.trI); }, 40); }
      if (window.Trilha) Trilha.sfx('warp', (ms - 900) / 1000);
      later(ms - 900, () => el.classList.add('go'));
      return finish(ms);
    }
    // Versão longa, em quatro atos, para todo mundo olhar para o telão:
    //  1) PROGRAMAR o destino nos circuitos de tempo (o nome do bloco é digitado letra a letra)
    //  2) CARREGAR o Flux Capacitor até 1,21 gigawatts
    //  3) ACELERAR até 88 milhas por hora (as linhas correm cada vez mais rápido, a tela treme)
    //  4) CHEGADA: três raios, rastros de fogo e o nome do bloco em letras do logo
    const D = secs * 1000, T = { type: .03 * D, fuel: .27 * D, speed: .46 * D, arrive: .83 * D, end: D };
    const dest = led(to.name), num = $('#trNum'), unit = $('#trUnit'), step = $('#trStep'), bar = $('#trBar');
    const phase = (name, text) => { el.dataset.phase = name; step.textContent = text; };
    el.dataset.kind = 'trip'; $('#trDest').textContent = '';
    $('#trName').textContent = to.name; $('#trName').classList.toggle('long', to.name.length > 18);
    $('#trArrive').textContent = to.type === 'closing' ? 'CONTINUA…' : '88 MPH!';
    void el.offsetWidth; el.classList.add('on', 'long'); phase('type', 'PROGRAMANDO O DESTINO…');
    bar.style.transition = 'none'; bar.style.width = '0'; void bar.offsetWidth; bar.style.transition = `width ${T.arrive}ms linear`; bar.style.width = '100%';
    // 1) digita o destino
    const per = (T.fuel - T.type - 500) / Math.max(1, dest.length);
    [...dest].forEach((ch, i) => later(T.type + i * per, () => { $('#trDest').textContent = dest.slice(0, i + 1); if (ch !== ' ' && window.Trilha) Trilha.sfx('key', i); }));
    // 2) Flux Capacitor
    later(T.fuel, () => {
      phase('fuel', 'CARREGANDO O FLUX CAPACITOR…'); unit.textContent = 'GIGAWATTS'; if (window.Trilha) Trilha.sfx('hum', (T.speed - T.fuel) / 1000);
      const t0 = performance.now(), ramp = T.speed - T.fuel - 350; clearInterval(S.trI);
      S.trI = setInterval(() => { const k = Math.min(1, (performance.now() - t0) / ramp); num.textContent = (1.21 * k * k * (3 - 2 * k)).toFixed(2).replace('.', ','); if (k >= 1) clearInterval(S.trI); }, 40);
    });
    // 3) 88 milhas por hora
    later(T.speed, () => {
      phase('speed', 'ACELERANDO ATÉ 88 MILHAS POR HORA…'); unit.textContent = 'MPH'; if (window.Trilha) Trilha.sfx('warp', (T.arrive - T.speed) / 1000);
      const t0 = performance.now(), ramp = T.arrive - T.speed - 150, lines = $('.tr-lines'); clearInterval(S.trI);
      S.trI = setInterval(() => {
        const k = Math.min(1, (performance.now() - t0) / ramp), v = Math.round(88 * Math.pow(k, 1.35));
        num.textContent = String(v).padStart(2, '0'); lines.style.animationDuration = (.5 - .42 * k).toFixed(2) + 's'; el.classList.toggle('shake', v >= 70);
        if (k >= 1) clearInterval(S.trI);
      }, 40);
    });
    // 4) chegada
    el.style.setProperty('--arrive', (T.end - T.arrive) + 'ms');
    later(T.arrive, () => { clearInterval(S.trI); el.classList.remove('shake'); $('.tr-lines').style.animationDuration = ''; phase('arrive', ''); el.classList.add('go'); });
    [0, .035, .075].forEach(k => later(T.arrive + k * D, () => { if (window.Trilha) Trilha.sfx('thunder'); }));
    finish(T.end);
  }
  function stopTransition() {
    const el = $('#tr');
    S.trT.forEach(clearTimeout); S.trT = []; clearInterval(S.trI);
    el.classList.remove('on', 'go', 'out', 'long', 'shake'); delete el.dataset.phase; $('.tr-lines').style.animationDuration = '';
  }
  // Esc pula a transição (se o apresentador quiser ir direto para a tela)
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#tr').classList.contains('on')) stopTransition(); });

  /* ---------- cenas ---------- */
  function sceneFor() {
    const st = S.state, c = st.conn, sc = (st.screen && st.screen.scene) || 'auto';
    if (st.presentation) return ['projection', projectionScene(st.presentation)];
    if (sc === 'logo') return ['logo', `${logo()}${flux()}`];
    if (st.reflexao) return ['reflexao', reflexaoScene(st.reflexao)];
    if (st.block === 'doc' && window.DocCena) return ['doc', DocCena.html(st)]; // Visão 2027: o Doc chega de 2027
    if (st.block === 'cena' && st.cena && window.Cenas) return ['cena', Cenas.html(st)]; // cenas do deck do townhall (plano de voo, almanaque, prêmios, estratégia…)

    const b = st.block;
    if (b === 'welcome') { // chegada: QR do app, o carro carregando a cada check-in e os circuitos de tempo do evento
      const circ = ''; // (os três circuitos de tempo do evento saíram desta tela, a pedido da organização)
      return ['welcome', `${logo()}<div class="rowx welcome-row">${qrBox()}<div class="checkin-car">${carBox()}<div class="count"><span id="count">${st.counts.checkedIn}</span><small> / ${st.counts.total} a bordo</small></div></div></div>${circ}`];
    }
    if (b === 'standby') return ['logo', `${logo()}${flux()}`]; // olhos no telão: só o logo
    if (b === 'stage') { // bloco de fala: tela calma, com o título no estilo do logo do filme
      const g = st.stage || {}, theme = (g.theme || '').trim(), title = (g.title || 'Bloco').trim();
      // "BLOCO 1 ⟶" com a seta, como o "BACK TO THE" do logo; embaixo, em letras grandes, o tema (ou o próprio nome do bloco)
      return ['stage', `<div class="stage-film">
          <div class="sf-top"><span class="sf-kick bttf">${esc(theme ? title : 'No palco agora')}</span><i class="sf-arrow"></i></div>
          <div class="sf-title ${(theme || title).length > 26 ? 'long' : ''}"><span class="bttf">${esc(theme || title)}</span></div>
          <div class="sf-fire"><i></i><i></i></div>
          ${g.speaker ? `<div class="sf-plate"><small>HILL VALLEY · NO PALCO</small><b>${esc(g.speaker)}</b></div>` : ''}
          <div class="sf-circ"><span class="r"><small>DESTINATION TIME</small><b>OCT 21 2015 04:29</b></span><span class="g"><small>PRESENT TIME</small><b>OCT 26 1985 01:21</b></span><span class="a"><small>LAST TIME DEPARTED</small><b>NOV 05 1955 06:00</b></span></div>
        </div>`];
    }
    if (b === 'message') { const m = st.message; return ['message', `<div class="msg"><div class="e">${esc(m.emoji || '📣')}</div></div><div class="title">${esc(m.title)}</div><div class="msg"><p>${linkify(m.body)}</p></div>`]; }
    if (b === 'closing') return ['closing', `<div class="fin" id="fin"><div class="a"><span class="bttf" id="finA">FIM DA VIAGEM</span></div><div class="b" id="finB"></div></div><div class="sub">${esc(st.event.closingText)}</div>${credits()}`];
    // conexões
    const r = c.round, era = roundEra(r), t = c.timer;
    if (c.phase === 'idle' || c.phase === 'ready') return ['prep', `<div class="kicker">BLOCO CONEXÕES</div><div class="title">ROTAS TEMPORAIS</div>${flux()}${hosts()}${guests()}`];
    if (c.phase === 'matching') return ['matching', `<div class="kicker">VIAGEM ${r}/3 · ${esc(era.label)} · ${esc(era.year)}</div><div class="title">ENCONTRE SUA DUPLA</div>${t && t.kind === 'matching' ? huge('matching', 'amber') : ''}<div class="sub">Encontre quem tem a mesma placa no celular.</div>`];
    if (c.phase === 'talk') return ['talk', `<div class="kicker">VIAGEM ${r}/3 · ${esc(era.label)} · ${esc(era.year)}</div><div class="rowx">${gauge()}${huge('talk')}</div>`];
    if (c.phase === 'roundEnd') return ['roundEnd', `<div class="title">88 MPH!</div>${carBox('warp')}${t && t.kind === 'break' ? huge('break', 'amber') : ''}`];
    if (c.phase === 'ranking') return ['ranking', `<div class="kicker">AVALIAÇÃO</div><div class="title cy">AVALIE NO CELULAR</div><div class="count"><span id="rankDone">${c.rankingDone}</span><small> / ${c.rankingTotal} avaliaram</small></div><div class="bar"><i id="rankBar" style="width:${Math.round(100 * c.rankingDone / Math.max(1, c.rankingTotal))}%"></i></div>${t && t.kind === 'ranking' ? huge('ranking', 'green') : ''}`];
    if (c.phase === 'results') return ['results', `<div class="kicker">CONEXÕES CALCULADAS</div><div class="title">OLHE O CELULAR</div><div class="sub"><b>${c.mutualCount}</b> conexões mútuas</div>${c.mutualPairs && c.mutualPairs.length ? `<div class="mutual">${c.mutualPairs.map(p => `<span>${esc(p[0].split(' ')[0])} ⚡ ${esc(p[1].split(' ')[0])}</span>`).join('')}</div>` : ''}`];
    return ['logo', `${logo()}${flux()}`];
  }
  // Créditos: os blocos do deck (produtores, frentes, local, agradecimentos) e, em seguida, o elenco: todos os nomes do check-in
  function credits() {
    if (!S.people) { loadPeople().then(render); return ''; }
    const c = S.state.creditos || {}, blocos = c.blocos || [], names = S.people.map(p => p.name);
    const dur = Math.max(40, (names.length + blocos.reduce((n, x) => n + 1 + x.l.length, 0)) * 2.2);
    return `<div class="credits"><div class="roll" style="--dur:${dur}s">${c.titulo ? `<div class="t">${esc(c.titulo)}</div><div class="s">${esc(c.sub || '')}</div>` : ''}
      ${blocos.map(x => `<div class="h">${esc(x.h)}</div>${x.l.map(n => `<div>${esc(n)}</div>`).join('')}`).join('')}
      <div class="h">ELENCO · VIAJANTES DO TEMPO</div>${names.map(n => `<div>${esc(n)}</div>`).join('')}<div class="h">DIREÇÃO · DOC BROWN</div><div>Hill Valley, 1985</div>
      ${c.fim ? `<div class="end">${esc(c.fim)}</div><div class="s">${esc(c.fimSub || '')}</div>` : ''}</div></div>`;
  }
  // O final do deck: as frases passam uma a uma por cima dos créditos e param no agradecimento
  function startFinale() {
    clearInterval(S.finT);
    const c = (S.state && S.state.creditos) || {}, lines = [...(c.final || []), [c.fim || 'FIM DA VIAGEM', c.fimSub || '']];
    let i = 0; const show = () => { const f = $('#fin'); if (!f) return clearInterval(S.finT); $('#finA').textContent = lines[i][0]; $('#finB').textContent = lines[i][1]; f.classList.remove('sw'); void f.offsetWidth; f.classList.add('sw'); };
    show(); if (lines.length > 1) S.finT = setInterval(() => { if (++i >= lines.length - 1) clearInterval(S.finT); show(); }, 5000);
  }

  /* ---------- render / tick ---------- */
  function render() {
    if (!S.state) return;
    applyAudio();
    // mudou o bloco no ar: transição do filme (não na primeira tela, nem com o telão preso em "relógio"/"logo")
    const info = blockInfo(S.state), auto = ((S.state.screen && S.state.screen.scene) || 'auto') === 'auto';
    const stepTr = !S.state.step || S.state.step.transition !== false || info.type === 'message' || info.type === 'standby'; // Preparar → Roteiro: cada passo diz se entra com a transição
    if (S.blk && S.blk.id !== info.id && auto && stepTr && S.state.settings && S.state.settings.transitions !== false) playTransition(S.blk, info);
    else if (S.blk && S.blk.id !== info.id) stopTransition(); // entrou direto: uma transição que ainda estivesse passando sai da frente
    S.blk = info;
    const [key, html] = sceneFor();
    const pr = S.state.presentation, rf = key === 'reflexao' ? S.state.reflexao : null;
    const dk = key === 'doc' && S.state.doc ? `${S.state.doc.rev}:${S.state.doc.message ? 1 : 0}` : ''; // nova mensagem (ou a cena começou): monta de novo
    const ck = key === 'cena' ? S.state.cena.kind : key === 'closing' ? JSON.stringify(S.state.creditos || '').length : key === 'welcome' || key === 'logo' ? JSON.stringify(S.state.evento || '') : ''; // cena do deck no ar / conteúdo do evento
    const k = `${key}|${dk}|${ck}|${rf ? `${rf.open}:${rf.rev}` : ''}|${pr ? pr.roomId + pr.activityId : ''}|${key === 'stage' ? JSON.stringify(S.state.stage) : ''}|${S.state.conn.round}|${S.state.conn.timer ? S.state.conn.timer.kind : ''}|${JSON.stringify(S.state.message)}|${S.state.conn.mutualCount}|${(S.state.conn.mutualPairs || []).length}|${S.people ? S.people.length : -1}|${key === 'cena' ? '' : (S.state.hosts || []).map(h => h.nome + (h.foto || '')).join() + JSON.stringify(S.state.especial || '')}`;
    if (k !== S.key) {
      if (window.DocCena) DocCena.unmount();
      if (window.Cenas) Cenas.unmount();
      clearInterval(S.finT);
      S.key = k; $('#scene').innerHTML = html;
      $('#scene').classList.toggle('projection-scene', key === 'projection' || key === 'reflexao' || key === 'cena');
      $('#scene').dataset.key = key;
      mountCar(key);
      mountReflexao();
      if (key === 'doc') DocCena.mount($('#scene'), S.state);
      if (key === 'cena') Cenas.mount($('#scene'), S.state, { car: () => S.car, remount: () => mountCar('cena'), flash, duck: on => { S.duck = !!on; applyAudio(); } });
      if (key === 'closing' && S.people) startFinale();
      if (key === 'roundEnd' || key === 'results') flash();
      if (key === 'projection') pollScreen(); else { clearTimeout(S.pollT); S.responses = null; }
      // O céu e a estrada rodam em loop em TODOS os blocos (parado, parecia que o telão tinha travado).
      // Telas calmas (bloco de fala, estratégia): fundo bem mais escuro e sem raios. Nas outras cenas do deck, só um pouco
      // mais escuro, para o texto ficar fácil de ler.
      S.calm = key === 'stage' || (key === 'cena' && Cenas.calm(S.state)); document.body.classList.toggle('calm', S.calm);
      document.body.classList.toggle('dim', key === 'cena' && !S.calm && Cenas.dim(S.state));
      if (key !== 'cena') S.duck = false; if (window.Delorean3D) Delorean3D.pause(false);
    } else {
      const c = $('#count'); if (c) { c.textContent = S.state.counts.checkedIn; setEnergy(S.state.counts.checkedIn / Math.max(1, S.state.counts.total), S.checked !== null && S.state.counts.checkedIn > S.checked); }
      if (key === 'projection') patchProjection();
      if (key === 'reflexao') patchReflexao();
      if (key === 'doc') DocCena.update(S.state);
      if (key === 'cena') Cenas.update(S.state);
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
    if (window.Cenas) Cenas.tick();
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
  // Bipes dos cronômetros (Conexões, recebimento do Sucesso, tempo de fala, votação da Reflexão):
  // um "pi" aos 30 s e um por segundo nos últimos 10 s. Saem do telão, a não ser que o som esteja no painel.
  setInterval(() => {
    if (!window.Trilha || !S.state) return;
    const st = S.state, sec = at => at - serverNow(); // milissegundos que faltam
    const t = st.conn.timer, pr = st.presentation, l = pr && pr.live, talk = pr && pr.draw && pr.draw.talk, c = st.reflexao && st.reflexao.cur;
    Trilha.countdown('conn', t && !t.paused && t.kind !== 'break' && !pr && st.block === 'connections' ? sec(t.endsAt) : null);
    Trilha.countdown('suc', l && l.phase === 'run' && l.endsAt ? sec(l.endsAt) : null);
    Trilha.countdown('talk', talk && talk.endsAt ? sec(talk.endsAt) : null);
    Trilha.countdown('rfx', c && c.phase === 'run' && c.endsAt ? sec(c.endsAt) : null, { end: false }); // o fim da votação já tem o seu som
    const iv = st.cena && st.cena.kind === 'intervalo' ? st.cena.live : null;                            // cronômetro do intervalo
    Trilha.countdown('brk', iv && iv.phase === 'run' && iv.endsAt ? sec(iv.endsAt) : null);
  }, 100);
  setInterval(() => { if (!S.calm && Math.random() < .2) flash(); }, 9000);
  // som do telão (música, trilha de fundo ou silêncio, escolhido no Painel do Doc)
  function applyAudio() {
    if (!window.Trilha || !S.state || !S.state.audio) return;
    const a = S.state.audio, duck = (window.DocCena && DocCena.speaking) || S.duck ? .22 : 1; // a música abaixa enquanto o Doc fala (e durante o vídeo-tributo)
    Trilha.apply({ mode: a.out === 'painel' || a.mode === 'spotify' ? 'off' : a.mode, beeps: a.out !== 'painel' && a.beeps !== false, volume: a.volume * duck, musicUrl: a.musicUrl, ambientUrl: a.ambientUrl });
  }
  // a cena do Doc avisa quando começa/para de falar e em que parte está: abaixa a música e conta para o Painel do Doc
  if (window.DocCena) { let rt = null; DocCena.onChange(() => { applyAudio(); clearTimeout(rt); rt = setTimeout(report, 150); }); }
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
