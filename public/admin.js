/* ===== Painel do Doc (admin) ===== */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ini = n => String(n || '?').trim().split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const pad = n => String(n).padStart(2, '0');
  const fmt = s => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  const PALETTE = ['#ff6a00', '#ff2d95', '#2ee6d6', '#39ff6a', '#ffd21f', '#b980ff', '#ff5c5c', '#5cffd6', '#ffa94d', '#7fb2ff', '#f58cff', '#a8ff5c'];
  const FIXED = { Consumer: '#ffd21f', 'Customer Development': '#39ff6a', 'Focus Market': '#ff2d95', Strategy: '#2ee6d6', 'Make (Business Ops)': '#ff6a00', 'Tax Reform': '#b980ff', Cybersecurity: '#5cffd6', Architecture: '#ffa94d', Diretora: '#ff5c5c' };
  const color = area => FIXED[area] || PALETTE[[...String(area || '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % PALETTE.length];
  const av = p => `<span class="av ${p.photo ? 'foto' : ''}" style="--c:${color(p.area)}">${esc(ini(p.name))}${p.photo ? `<img src="${esc(p.photo)}" alt="" loading="lazy">` : ''}</span>`;
  const WLS = ['Estag', 'WL1', 'WL2', 'WL3'];
  const PHASE_LABEL = { idle: 'sem duplas', ready: 'duplas prontas', matching: 'duplas se encontrando', talk: 'conversa em andamento', roundEnd: '88 MPH (intervalo)', ranking: 'avaliação aberta', results: 'resultados publicados' };
  const TIMER_LABEL = { matching: 'encontro', talk: 'conversa', break: 'intervalo', ranking: 'avaliação' };
  // roteiro do evento
  const STEP_ICONS = { checkin: '🚪', stage: '🎤', connections: '⚡', sucesso: '🚀', doc: '🧪', reflexao: '💭', cena: '🎬', message: '📣', standby: '📺', closing: '🏁', hidden: '🔒' };
  const PHONE_STEPS = ['connections', 'reflexao', 'sucesso']; // dinâmicas que acontecem no celular (o telão e o roteiro avisam)
  const phoneStep = x => PHONE_STEPS.includes(x.type) || x.type === 'closing' || (x.type === 'cena' && x.cena === 'nuvem'); // + nuvem de palavras e o feedback do encerramento
  // passos com conteúdo do townhall (confidencial até liberar): blocos de fala e cenas, menos nuvem de palavras, intervalo e capa do Sucesso
  const confStep = x => !!x && (x.type === 'stage' || (x.type === 'cena' && !(((A.O && A.O.cenas && A.O.cenas.open) || [])).includes(x.cena)));
  // cenas do deck do townhall: nome, ícone e resumo vêm do servidor (server/cenas.js)
  const cenaMeta = x => { const m = ((A.O && A.O.cenas && A.O.cenas.meta) || {})[x.cena]; return m ? { ...m, name: m.label || m.name } : { name: 'Cena', icon: '🎬', hint: '' }; }; // no painel, o nome da cena em português
  const STEP_ICON = new Proxy({}, { get: (_, t) => STEP_ICONS[t] }); // por tipo (o editor do roteiro usa); stepIcon(x) sabe o ícone de cada cena
  const stepIcon = x => (x.type === 'cena' ? cenaMeta(x).icon : STEP_ICONS[x.type]);
  const STEP_KIND = { checkin: 'Chegada · check-in', stage: 'Bloco de fala', connections: 'Dinâmica · Conexões', sucesso: 'Dinâmica · Sucesso', doc: 'Encerramento do Sucesso', reflexao: 'Dinâmica · Reflexão', cena: 'Cena do townhall', message: 'Aviso', standby: 'Olhos no telão', closing: 'Encerramento', hidden: 'Bloco do townhall' };
  const STEP_HINT = { checkin: 'as pessoas entram pelo nome', connections: '3 viagens em duplas e avaliação', sucesso: 'pergunta ao vivo, nuvem de palavras', doc: 'o Doc chega de 2027 e resume tudo o que foi escrito', reflexao: 'paradas com votação em projetos e os 2 mais votados', standby: 'celulares em pausa, atenção no telão', closing: 'créditos no telão e o formulário de feedback nos celulares' };
  const SUC_NAME = { d1: 'Antes de Partir', d2: 'Look Back', d3: 'Uso de IA', d4: 'Look Ahead' };
  const SUC_COLOR = { d1: 'var(--cyan)', d2: 'var(--yellow)', d3: 'var(--magenta)', d4: 'var(--orange)' };
  const SUC_PHASE = { idle: 'aguardando você iniciar', run: 'recebendo respostas', paused: 'recebimento pausado', done: 'recebimento encerrado' };
  const TALK = { d2: 120, d3: 180 }; // dinâmicas com sorteio e tempo de fala (como no painel do Lucas)
  const stepTitle = x => (x.type === 'checkin' ? 'Chegada · Check-in' : x.type === 'stage' ? x.title : x.type === 'connections' ? 'Conexões' : x.type === 'sucesso' ? `Sucesso ${x.activity.slice(1).padStart(2, '0')} · ${SUC_NAME[x.activity]}` : x.type === 'message' ? x.title : x.type === 'standby' ? 'Olhos no telão' : x.type === 'reflexao' ? 'Reflexão' : x.type === 'doc' ? 'Visão 2027 · o Doc' : x.type === 'cena' ? cenaMeta(x).name : x.type === 'hidden' ? 'um bloco do townhall' : 'Encerramento · créditos e feedback');
  // roteiro padrão: a agenda do townhall em 4 atos (o mesmo do servidor)
  // ("Como a IA nos ajudou" é o próprio bloco Reflexão e o "Manifesto 2027" é o bloco Sucesso: um passo só para cada)
  const NO_TRANSITION = x => ['sucesso', 'doc', 'closing'].includes(x.type) || (x.type === 'cena' && ['abertura', 'boasvindas', 'nuvem', 'almanaque', 'reconhecimento', 'intervalo', 'mph'].includes(x.cena)); // passos que entram direto
  const DEFAULT_STEPS = () => { const cena = k => ({ type: 'cena', cena: k }), suc = k => ({ type: 'sucesso', activity: k });
    return [{ type: 'checkin' }, cena('abertura'), cena('boasvindas'), cena('nuvem'), cena('agenda'), { type: 'connections' }, cena('plano26'), cena('almanaque'), { type: 'reflexao' }, cena('reconhecimento'), cena('intervalo'),
      cena('visao'), cena('capasucesso'), suc('d1'), suc('d2'), suc('d3'), suc('d4'), { type: 'doc' }, cena('mph'), { type: 'closing' }].map(x => (NO_TRANSITION(x) ? { ...x, transition: false } : x)); };
  const AUDIO_LABEL = { music: '🎵 Música', ambient: '🎼 Trilha', spotify: '🎧 Spotify', off: '🔇 Sem áudio' };
  const SP = window.Spoti || null; // Spotify de quem está no painel (public/spotify.js)
  const spState = () => (SP ? SP.state : { configured: false, connected: false, player: null, devices: [], error: '' });

  const A = { key: localStorage.getItem('bttf.admin') || '', O: null, tab: 'live', prep: 'roteiro', sel: null, open: new Set(), edit: null, stepsDraft: null, round: 1, offset: 0, socket: null, peopleQ: '', connected: false, lastHtml: '', pressing: false };

  function toast(msg, err) {
    const t = $('#toast'); t.textContent = msg; t.classList.toggle('err', !!err); t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 3500);
    const d = $('#dlg'); if (d && d.open) { let m = $('#dlgMsg'); if (!m) { m = document.createElement('p'); m.id = 'dlgMsg'; m.className = 'small'; m.style.marginTop = '10px'; d.appendChild(m); } m.textContent = msg; m.style.color = err ? 'var(--red)' : 'var(--green)'; }
  }
  async function api(method, path, body) {
    const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json', 'x-admin-key': A.key }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
    return j;
  }
  const act = (type, extra = {}) => api('POST', '/api/admin/action', { type, ...extra });
  async function run(fn, okMsg) { try { const r = await fn(); if (okMsg) toast(okMsg); return r; } catch (e) { toast(e.message, true); } }
  const confirmRun = (msg, fn, okMsg) => { if (confirm(msg)) run(fn, okMsg); };

  /* ---------- login / socket ---------- */
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const pwd = $('#pwd').value;
    try {
      const r = await api('POST', '/api/admin/login', { password: pwd });
      if (!r.ok) { $('#loginMsg').textContent = 'Senha inválida.'; return; }
      A.key = pwd; localStorage.setItem('bttf.admin', pwd); $('#login').classList.add('hidden'); connect();
    } catch (err) { $('#loginMsg').textContent = err.message; }
  });
  function connect() {
    if (A.socket) { A.socket.emit('admin:hello', { key: A.key }, onHello); return; }
    A.socket = io({ transports: ['websocket', 'polling'], tryAllTransports: true });
    A.socket.on('connect', () => A.socket.emit('admin:hello', { key: A.key }, onHello));
    A.socket.on('disconnect', () => { A.connected = false; renderStatus(); });
    A.socket.on('admin:overview', o => { A.O = o; A.offset = o.now - Date.now(); render(); });
    A.socket.on('cena:pulse', p => { // carga do Flux Capacitor subindo com os toques dos celulares
      if (!A.O || !A.O.cenas || !A.O.cenas.state.reconhecimento || !p || p.kind !== 'reconhecimento') return; A.O.cenas.state.reconhecimento.carga = p.carga;
      const n = $('#recPct'), b = $('#recBar'); if (n) n.textContent = Math.round(p.carga * 100) + '%'; if (b) b.style.width = Math.round(p.carga * 100) + '%';
    });
  }
  function onHello(res) {
    if (!res || !res.ok) { localStorage.removeItem('bttf.admin'); A.key = ''; $('#login').classList.remove('hidden'); $('#loginMsg').textContent = 'Senha inválida.'; return; }
    // mesmo login libera o painel 3D do Sucesso (/painel): o servidor grava um cookie
    if (!A.cookie) { A.cookie = true; api('POST', '/api/admin/login', { password: A.key }).then(() => {
      const next = new URLSearchParams(location.search).get('next');
      if (next && next.startsWith('/') && !next.startsWith('//')) location.assign(next);
    }).catch(() => { A.cookie = false; }); }
    A.connected = true; A.O = res.overview; A.offset = res.overview.now - Date.now(); brand(); render(true);
  }
  // Dois níveis de acesso: a senha mestra abre o Painel do Doc completo; a senha das dinâmicas abre o "segundo app",
  // só com Conexões, Reflexão e Sucesso (o servidor não envia o resto e recusa os comandos).
  const team = () => !!(A.O && A.O.role === 'team');
  function brand() {
    document.body.classList.toggle('team', team());
    document.title = team() ? 'Painel das Dinâmicas · Conexões, Reflexão e Sucesso' : 'Painel do Doc · De Volta ao Futuro';
    const k = $('.brand .k'), n = $('.brand .n'); if (k) k.textContent = team() ? 'PAINEL DAS DINÂMICAS' : 'PAINEL DO DOC'; if (n) n.textContent = team() ? 'Conexões · Reflexão · Sucesso' : 'De Volta ao Futuro · Townhall';
    if (team() && A.prep !== 'reflexao' && !PREP_TEAM.some(([key]) => key === A.prep)) A.prep = 'people';
  }

  /* ---------- render ---------- */
  // Duas áreas: "Ao vivo" (o roteiro e o passo que está no ar) e "Preparar" (roteiro, pessoas, perguntas, ajustes, testes).
  const PREP = [['roteiro', 'Roteiro'], ['cenas', 'Agenda e cenas'], ['reflexao', 'Reflexão'], ['people', 'Pessoas'], ['questions', 'Perguntas'], ['config', 'Ajustes'], ['tests', 'Testes']];
  const PREP_TEAM = PREP.filter(([k]) => !['roteiro', 'cenas'].includes(k)); // a senha das dinâmicas não vê o roteiro nem as cenas
  function render(force) {
    if (!A.O) return;
    if (SP) spConfigure();
    renderStatus(); renderAudio(); micAuto();
    if (A.pressing) { clearTimeout(A.renderLater); A.renderLater = setTimeout(() => render(force), 250); return; }
    const view = A.tab === 'live' ? 'live' : 'prep-' + A.prep;
    if (!force && ['prep-config', 'prep-tests', 'prep-reflexao', 'prep-cenas'].includes(view) && $('#main').dataset.view === view) return;
    const html = A.tab === 'live' ? vLive()
      : `<div class="subtabs prepnav">${(team() ? PREP_TEAM : PREP).map(([k, l]) => `<button class="${A.prep === k ? 'on' : ''}" data-prep="${k}">${l}</button>`).join('')}<a class="datalink" href="/dados.html" target="_blank" title="Página de extração: Conexões, Reflexão e Sucesso, com download em .csv">📊 Dados do evento ↗</a></div>` + ({ roteiro: vRoteiro, cenas: vCenasCfg, reflexao: vReflexaoCfg, people: vPeople, questions: vQuestions, config: vConfig, tests: vTests })[A.prep]();
    if (!force && $('#main').dataset.view === view && html === A.lastHtml) return;
    A.lastHtml = html;
    const y = window.scrollY;
    const ae = document.activeElement, focusId = ae && ae.id && $('#main').contains(ae) ? ae.id : null;
    const caret = focusId && typeof ae.selectionStart === 'number' ? ae.selectionStart : null;
    $('#main').dataset.view = view;
    $('#main').innerHTML = html;
    window.scrollTo(0, y);
    if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus(); if (caret !== null && el.setSelectionRange) el.setSelectionRange(caret, caret); } }
    document.querySelectorAll('#tabs [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === A.tab));
    tickLive();
  }
  function timerLeft(t) { return t ? (t.paused ? t.remaining : Math.max(0, Math.round((t.endsAt - (Date.now() + A.offset)) / 1000))) : null; }
  function talkLeft(t) { return t ? (t.endsAt ? Math.max(0, Math.ceil((t.endsAt - Date.now() - A.offset) / 1000)) : t.remaining) : 0; }
  const HIDDEN_STEP = { id: '__townhall', type: 'hidden' }; // senha das dinâmicas: o que está no ar é um bloco do townhall, que este painel não vê
  const liveStep = () => {
    const steps = A.O.settings.steps, at = steps.findIndex(x => x.id === A.O.state.step);
    if (team() && at < 0) return { steps, i: -1, step: HIDDEN_STEP, next: null, prev: null };
    const i = Math.max(0, at); return { steps, i, step: steps[i], next: steps[i + 1] || null, prev: steps[i - 1] || null };
  };
  const sucAct = k => (A.O.sucesso && A.O.sucesso.acts[k]) || {};
  const sucEff = a => (a.phase === 'run' && a.endsAt && a.endsAt <= Date.now() + A.offset ? 'done' : a.phase || null); // o prazo pode acabar entre dois avisos do servidor
  const sucLeft = a => (a.phase === 'run' && a.endsAt ? Math.max(0, Math.ceil((a.endsAt - Date.now() - A.offset) / 1000)) : a.remainingSeconds || 0);
  // Reflexão: parada aberta, fase e tempo que falta
  const rfxOnAir = () => A.O.state.block === 'reflexao' && !A.O.state.presentation;
  const rfxLeft = p => (p.phase === 'run' && p.endsAt ? Math.max(0, Math.ceil((p.endsAt - Date.now() - A.offset) / 1000)) : p.remaining || 0);
  const RFX_PHASE = { idle: 'aguardando você iniciar', run: 'votação aberta', paused: 'votação pausada', done: 'votação encerrada' };
  // O que está no ar agora, em uma linha
  function nowText() {
    const O = A.O, { steps, i, step } = liveStep();
    if (O.state.detour) return `fora do roteiro · ${O.state.detour === 'message' ? 'aviso: ' + (O.state.message.title || '') : 'olhos no telão'}`;
    if (step.type === 'hidden') return 'um bloco do townhall (fora das dinâmicas)';
    let extra = '';
    if (step.type === 'connections') { const c = O.state.conn, t = c.timer; extra = ` · ${c.round ? `viagem ${c.round}/3 · ` : ''}${t ? `${TIMER_LABEL[t.kind] || t.kind} ${fmt(timerLeft(t))}${t.paused ? ' ⏸' : ''}` : PHASE_LABEL[c.phase] || c.phase}`; }
    if (step.type === 'sucesso') { const a = sucAct(step.activity), ph = sucEff(a); if (ph) extra = ` · ${ph === 'run' ? 'recebendo' + (a.endsAt ? ' ' + fmt(sucLeft(a)) : '') : ph === 'done' ? 'encerrado' : ph === 'paused' ? 'pausado' : 'não iniciado'} · ${a.responseCount} resp.`; }
    if (step.type === 'stage' && step.theme) extra = ` · ${step.theme}`;
    if (step.type === 'reflexao' && O.reflexao) { const R = O.reflexao, p = R.open === null ? null : R.paradas[R.open]; extra = p ? ` · parada ${pad(R.open + 1)} · ${p.phase === 'run' ? 'votando ' + fmt(rfxLeft(p)) : p.phase === 'done' ? 'encerrada' : p.phase === 'paused' ? 'pausada' : 'não iniciada'} · ${p.votes} votos` : ' · menu das paradas'; }
    if (step.type === 'cena') extra = cenaSub(step, true) ? ` · ${cenaSub(step, true)}` : '';
    return `${i + 1}/${steps.length} · ${step.type === 'sucesso' ? 'Sucesso ' + step.activity.slice(1).padStart(2, '0') : stepTitle(step)}${extra}`;
  }
  function renderStatus() {
    const O = A.O; if (!O) return;
    const tl = O.telao || { count: 0 };
    const html = `<span class="dot ${A.connected ? 'on' : 'off'}" title="${A.connected ? 'Conectado ao servidor' : 'Sem conexão com o servidor'}"></span>
      ${A.connected ? '' : '<span class="pill off">sem conexão</span>'}
      <span class="nowchip" title="No ar agora: ${esc(nowText())}"><small>NO AR</small><span>${esc(nowText())}</span></span>
      <span class="pill" title="Pessoas que já fizeram check-in">👥 ${O.counts.checkedIn}/${O.counts.total}</span>
      ${team() ? '<span class="pill" title="Você entrou com a senha das dinâmicas: este painel alcança só Conexões, Reflexão e Sucesso.">🔑 dinâmicas</span>'
        : `<button type="button" class="pill ${O.settings.confidencial !== false ? 'hot' : 'on'}" data-act="confOpen" title="${O.settings.confidencial !== false ? 'Modo confidencial LIGADO: as cenas do townhall só aparecem neste painel e no telão aberto neste navegador. Os celulares veem “olhe para o telão”. Clique para liberar no dia do evento.' : 'Conteúdo do townhall liberado para todos os celulares e telões. Clique para voltar ao modo confidencial.'}">${O.settings.confidencial !== false ? '🔒 confidencial' : '🔓 liberado para todos'}</button>`}
      ${team() || micMode() === 'toques' ? '' : Mic.on ? '<a class="pill on" href="#" data-go="tests" title="O microfone deste aparelho está ouvindo a sala (aplausos do Reconhecimento). O som não é gravado. Clique para ver a barra do som.">🎤 ouvindo</a>'
        : `<button type="button" class="pill ${Mic.perm === 'denied' ? 'off' : 'hot'}" data-act="micTop" title="Microfone dos aplausos (Reconhecimento): clique para liberar e testar">🎤 ${Mic.starting ? 'aguardando…' : Mic.perm === 'granted' ? 'microfone liberado ✓' : Mic.perm === 'denied' ? 'microfone bloqueado' : 'liberar microfone'}</button>`}
      ${(() => { // o telão precisa estar aberto neste navegador (logado). No modo confidencial, só o telão logado com a senha mestra mostra as cenas.
        const noMaster = !team() && O.settings.confidencial !== false && tl.count && tl.auth && !tl.master;
        const tip = !tl.count ? 'Nenhum telão aberto. Clique para abrir.' : !tl.auth ? 'Telão aberto sem login: não mostra as respostas do Sucesso' + (team() ? '' : ' nem as cenas do townhall (modo confidencial)') : noMaster ? 'O telão está logado com a senha das dinâmicas: no modo confidencial ele não mostra as cenas do townhall. Abra o telão neste navegador.' : 'Telão aberto e logado';
        return `<a class="pill ${tl.count ? (tl.auth && !noMaster ? 'on' : 'hot') : 'off'}" href="/telao.html" target="_blank" title="${tip}">📽 Telão ${tl.count ? (!tl.auth ? 'sem login' : noMaster ? 'sem a senha mestra' : '✓') : 'fechado'}</a>`; })()}`;
    if (html !== A.statusHtml) { A.statusHtml = html; $('#status').innerHTML = html; }
  }
  setInterval(renderStatus, 500);

  /* ---------- som: três botões sempre à mão (música animada, trilha de fundo, sem áudio) ---------- */
  function renderAudio() {
    const O = A.O; if (!O) return;
    const a = O.state.audio || { mode: 'off', volume: 60, out: 'telao' }, sp = spState(), pl = sp.player, beeps = a.beeps !== false;
    const key = JSON.stringify([a, O.telao, sp.configured, sp.connected, pl && [pl.name, pl.artists, pl.playing], sp.error]);
    const own = a.mode === 'spotify' ? 'off' : a.mode; // no modo Spotify a trilha do app fica calada (a música vem do Spotify)
    if (window.Trilha) Trilha.apply({ mode: a.out === 'painel' ? own : 'off', beeps: a.out === 'painel' && beeps, volume: a.volume, musicUrl: O.settings.musicUrl, ambientUrl: O.settings.ambientUrl });
    // modo Spotify: ao entrar nele o Spotify toca; ao sair, pausa (vale para o painel que está conectado ao Spotify)
    if (SP && sp.connected && A.spMode !== undefined && A.spMode !== a.mode && Date.now() - (A.spQuiet || 0) > 3000) {
      if (a.mode === 'spotify') SP.play().catch(e => toast(e.message, true)); else if (A.spMode === 'spotify') SP.pause().catch(() => {});
    }
    A.spMode = a.mode;
    if (key === A.audioKey || A.pressing) return;
    A.audioKey = key;
    const tl = O.telao || { count: 0 };
    // som no telão: com música ligada e nenhum telão aberto, avisa; com o telão aberto mas ainda sem clique, pede o clique (os bipes também dependem dele)
    const warn = a.mode === 'spotify' && !sp.connected ? 'conecte o Spotify neste painel (clique em 🎧)' : a.out === 'painel' ? '' : !tl.count ? (own === 'off' ? '' : 'abra o telão') : !tl.sound && (own !== 'off' || beeps) ? 'clique na tela do telão para liberar o som' : '';
    const track = pl && pl.name ? `${pl.playing ? '♪' : '❚❚'} ${pl.name}${pl.artists ? ' · ' + pl.artists : ''}` : 'nada tocando';
    $('#audioCtl').innerHTML = `<button type="button" class="k" data-act="audioOut" data-out="${a.out === 'painel' ? 'telao' : 'painel'}" title="Clique para trocar: o som pode sair do computador do telão ou deste painel">SOM · ${a.out === 'painel' ? 'este painel' : 'telão'} ⇄</button>
      ${warn ? `<span class="warn">⚠ ${warn}</span>` : ''}
      ${['music', 'ambient', 'spotify', 'off'].map(m => `<button type="button" class="${a.mode === m ? 'on' : ''}" data-act="audio" data-mode="${m}" ${m === 'spotify' ? 'title="A música do seu Spotify: o que você escolher lá toca no evento"' : ''}>${AUDIO_LABEL[m]}</button>`).join('')}
      ${sp.connected ? `<button type="button" class="spchip" data-act="spOpen" title="Spotify: o que está tocando, playlists, busca e aparelhos">${esc(track)} ▾</button>` : ''}
      <button type="button" class="beeps ${beeps ? 'on' : ''}" data-act="audioBeeps" data-on="${beeps ? '' : 1}" title="Bipes do cronômetro: um aos 30 segundos e um por segundo nos últimos 10. Tocam mesmo com 'Sem áudio'.">⏱ Bipes</button>
      <input type="range" min="0" max="100" step="5" value="${a.volume}" data-act="audioVol" title="Volume" aria-label="Volume">`;
  }
  document.addEventListener('pointerdown', () => { if (window.Trilha) Trilha.unlock(); });
  /* ====================== AO VIVO: o roteiro e o passo que está no ar ====================== */
  const btn = (label, act, o = {}) => `<button class="btn ${o.cls || ''}" data-act="${act}"${Object.entries(o.data || {}).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('')} ${o.disabled ? 'disabled' : ''}>${label}</button>`;
  // <details> que continua aberto quando o painel se redesenha
  const det = (key, summary, content, cls = 'mini') => `<details class="${cls}" data-d="${key}" ${A.open.has(key) ? 'open' : ''}><summary>${summary}</summary>${content}</details>`;
  document.addEventListener('toggle', e => { const d = e.target; if (d && d.dataset && d.dataset.d) { if (d.open) A.open.add(d.dataset.d); else A.open.delete(d.dataset.d); } }, true);

  function stepSub(x) {
    const O = A.O;
    if (x.type === 'checkin') return `${O.counts.checkedIn} de ${O.counts.total} a bordo`;
    if (x.type === 'stage') return x.theme || 'sem tema definido';
    if (x.type === 'connections') { const c = O.state.conn, here = liveStep().step.id === x.id && !O.state.detour; return c.phase === 'idle' || c.phase === 'ready' ? '3 viagens em duplas' : c.phase === 'results' ? 'conexões enviadas' : `${here ? PHASE_LABEL[c.phase] : 'em pausa'}${c.round ? ` · viagem ${c.round}/3` : ''}`; }
    if (x.type === 'sucesso') {
      // a dinâmica 01 não tem cronômetro: nasce aberta, então só conta como "recebendo" quando está na tela
      const a = sucAct(x.activity), ph = sucEff(a), here = liveStep().step.id === x.id && !O.state.detour, open = ph === 'run' && (a.endsAt || here);
      return ph ? `${a.responseCount} respostas · ${ph === 'done' ? 'encerrado' : open ? 'recebendo' : ph === 'run' ? 'sem cronômetro' : ph === 'paused' ? 'pausado' : 'não iniciado'}` : '';
    }
    if (x.type === 'message') return x.body || '';
    if (x.type === 'doc') { const d = O.state.doc || {}, n = docTotal(); return d.status === 'generating' ? 'o Doc está escrevendo…' : d.play ? (d.play.paused ? 'cena pausada' : 'cena no telão') : d.message ? `mensagem pronta${d.phones ? ' · nos celulares' : ''}` : `${n} ${n === 1 ? 'resposta' : 'respostas'} para o Doc ler`; }
    if (x.type === 'cena') return cenaSub(x) || cenaMeta(x).hint;
    if (x.type === 'reflexao' && O.reflexao) { const R = O.reflexao, done = R.paradas.filter(p => p.top.length).length, votes = R.paradas.reduce((a, p) => a + p.votes, 0); return votes || done ? `${done} de ${R.paradas.length} paradas reveladas · ${votes} votos` : `${R.paradas.length} paradas · votação em projetos`; }
    return STEP_HINT[x.type] || '';
  }
  // Quem fica de fora de um bloco (coordenação): nomes e botão para editar a lista
  const SKIP_OF = { connections: 'connections', reflexao: 'reflexao', sucesso: 'sucesso' };
  const SKIP_LABEL = { connections: 'Conexões', reflexao: 'Reflexão', sucesso: 'Sucesso (as 4 dinâmicas)' };
  const skipIds = block => ((A.O.settings.skip || {})[block] || []);
  function skipLine(block) {
    const ids = new Set(skipIds(block)), names = A.O.people.filter(p => ids.has(p.id)).map(p => p.name);
    return `<div class="skipline"><span class="small">🚫 Não participam deste bloco: ${names.length ? `<b>${esc(names.join(', '))}</b>` : 'ninguém (todos participam)'}</span>${btn(names.length ? 'Editar' : 'Escolher quem fica de fora', 'skipEdit', { cls: 'ghost xs', data: { block } })}</div>`;
  }
  function vLive() {
    const O = A.O, { steps, i, step, next, prev } = liveStep(), detour = O.state.detour, scene = (O.state.screen && O.state.screen.scene) || 'auto';
    // clicar em um passo só abre o passo aqui no painel; o telão e os celulares mudam no botão "Mostrar"
    const sel = A.sel && A.sel !== step.id ? steps.find(x => x.id === A.sel) : null;
    if (A.sel && !sel && !detour) A.sel = null;
    // viagem interrompida no meio (o evento saiu do passo Conexões): fica marcada como em pausa, não como feita
    const held = x => x.type === 'connections' && ['matching', 'talk', 'roundEnd', 'ranking'].includes(O.state.conn.phase);
    const road = steps.map((x, n) => `<button class="rs ${n === i ? 'now' : held(x) ? 'held' : n < i ? 'done' : ''} ${sel && sel.id === x.id ? 'sel' : ''}" data-act="jumpStep" data-id="${x.id}" title="${n === i ? 'Este passo está no ar' : 'Abrir este passo aqui no painel (o telão só muda quando você clicar em Mostrar)'}">
        <span class="n">${n === i ? n + 1 : held(x) ? '⏸' : n < i ? '✓' : n + 1}</span><span class="ic">${stepIcon(x)}</span>
        <span class="tx"><b>${esc(stepTitle(x))}${phoneStep(x) ? ' <i class="fone" title="Este passo acontece no celular: o telão mostra o ícone do celular no canto">📱</i>' : ''}</b><small>${esc(stepSub(x))}</small></span>${n === i ? `<span class="air">${detour ? 'pausado' : 'no ar'}</span>` : ''}</button>`).join('');
    const extras = team() ? `<div class="road-extra">
        <div class="small">🔑 Painel das dinâmicas: aqui ficam só Conexões, Reflexão e Sucesso (com o check-in e o Doc). O resto do townhall é conduzido pelo Painel do Doc.</div>
        <div class="actions">${btn('↺ Reiniciar…', 'resetOpen', { cls: 'ghost sm' })}</div>
        <label class="sw" style="margin-top:8px"><input type="checkbox" data-act="toggleMutual" ${O.settings.showMutualOnScreen ? 'checked' : ''}> Mostrar no telão os nomes das conexões mútuas</label>
      </div>` : `<div class="road-extra">
        <div class="small">Fora do roteiro</div>
        <div class="actions">${btn('📣 Aviso rápido', 'quickMessage', { cls: 'ghost sm' })}${btn('📺 Olhos no telão', 'standbyNow', { cls: 'ghost sm' })}</div>
        <div class="actions">${btn('↺ Reiniciar…', 'resetOpen', { cls: 'ghost sm' })}</div>
        ${det('telao', '📽 Tela do telão', `<div class="actions" style="margin-top:8px">${[['auto', 'Segue o roteiro'], ['logo', 'Só o logo']].map(([k, l]) => `<button class="btn xs ${scene === k ? '' : 'ghost'}" data-act="setScene" data-scene="${k}">${l}</button>`).join('')}</div>
          <label class="sw" style="margin-top:8px"><input type="checkbox" data-act="toggleMutual" ${O.settings.showMutualOnScreen ? 'checked' : ''}> Mostrar no telão os nomes das conexões mútuas</label>`)}
        <a href="#" class="small" data-go="roteiro">✎ Editar roteiro</a>
      </div>`;
    const panel = sel ? panelPreview(sel, steps.indexOf(sel), steps.length, step, detour) : detour ? panelDetour(detour, step) : step.type === 'hidden' ? panelHidden() : panelStep(step, i, steps.length, next, prev);
    return `<div class="live"><aside class="road"><div class="road-title">Roteiro</div>${road}${extras}</aside>${panel}</div>`;
  }
  // Passo aberto no painel, mas ainda fora do ar: mostra o que ele é e o botão para colocar no telão e nos celulares
  function panelPreview(x, n, total, live, detour) {
    const ed = editing(x), O = A.O;
    const what = { checkin: 'Celulares: cada pessoa escolhe o idioma, digita o nome, embarca e responde as duas perguntas · Telão: QR do app e o carro carregando a cada check-in', stage: 'Celulares: nome e tema do bloco · Telão calmo, com o título do bloco', connections: 'Celulares: dupla, perguntas e avaliação · Telão: cronômetros',
      reflexao: 'Celulares: escolher 1 projeto por parada · Telão: Flux Capacitor e os 2 mais votados', doc: 'Celulares: "olhe para o telão" e, depois, a mensagem · Telão: o Doc chega de 2027 e lê o resumo das 4 dinâmicas', sucesso: 'Celulares: pergunta e resposta · Telão: carro carregando; a nuvem só quando você revelar', message: 'Celulares e telão: este aviso', standby: 'Celulares em pausa · Telão: logo', closing: 'Celulares: agradecimento e o formulário de feedback (nota de 1 a 5 e dois textos) · Telão: as frases finais e os créditos', cena: x.type === 'cena' ? CENA_AIR[x.cena] : '' }[x.type];
    let body = `<p class="lead">${esc(what)}</p>`;
    if (x.type === 'stage') body += ed ? `<div class="form editstep">${editField('Nome do bloco', 'title', ed.title)}${editField('Tema (aparece no celular e no telão)', 'theme', ed.theme)}${editField('Quem fala (opcional)', 'speaker', ed.speaker)}${editActions}</div>`
      : `<div class="theme">${esc(x.theme || 'Sem tema definido')}</div>${x.speaker ? `<div class="speaker">com ${esc(x.speaker)}</div>` : ''}<div class="actions">${btn('✎ Editar tema', 'editStep', { cls: 'ghost sm', data: { id: x.id } })}</div>`;
    if (x.type === 'message') body += ed ? `<div class="form editstep">${editField('Emoji', 'emoji', ed.emoji)}${editField('Título', 'title', ed.title)}${editField('Texto (links viram clicáveis)', 'body', ed.body, 'textarea')}${editActions}</div>`
      : `<div class="theme">${esc(x.body || 'Sem texto.')}</div><div class="actions">${btn('✎ Editar aviso', 'editStep', { cls: 'ghost sm', data: { id: x.id } })}</div>`;
    if (x.type === 'sucesso') body += `<p class="question">${esc(sucAct(x.activity).question || '')}</p>`;
    if (x.type === 'doc') body += `<p class="small">${docTotal()} respostas nas 4 dinâmicas · ${O.state.doc && O.state.doc.message ? 'mensagem pronta' : 'a mensagem pode ser gerada agora, antes de colocar no ar'}</p>${O.state.doc && O.state.doc.message ? '' : `<div class="actions">${btn('✨ Gerar a mensagem agora', 'docGen', { cls: 'ghost sm', disabled: O.state.doc && O.state.doc.status === 'generating' })}</div>`}`;
    if (x.type === 'reflexao' && O.reflexao) body += `<p class="small">${O.reflexao.config.themes.length} paradas · ${O.reflexao.config.projects.length} projetos na lista · <a href="#" data-go="reflexao">editar</a></p>`;
    if (x.type === 'cena') body += `<p class="small">${esc(cenaMeta(x).hint)}${team() ? '' : ` · <a href="#" data-go="cenas" data-sec="${x.cena}">editar o conteúdo</a>`}</p>`;
    if (SKIP_OF[x.type]) body += skipLine(SKIP_OF[x.type]);
    return `<section class="stepbox preview t-${x.type}" ${x.type === 'sucesso' ? `style="--c:${SUC_COLOR[x.activity]}"` : ''}>
      <div class="sb-head"><span class="kick">Passo ${n + 1} de ${total} · ${STEP_KIND[x.type]}</span><span class="offair">fora do ar · aberto só aqui no painel</span></div>
      <h1>${stepIcon(x)} ${esc(stepTitle(x))}</h1>
      ${body}
      <div class="sb-actions">${btn('📺 Mostrar no telão e nos celulares', 'goStep', { cls: 'big', data: { id: x.id } })}</div>
      ${phoneStep(x) ? '<p class="small" style="margin-top:8px">📱 Este passo acontece no celular: enquanto o celular é necessário, o telão mostra um ícone de celular no canto (nada em tela cheia).</p>' : ''}
      <div class="sb-nav"><a href="#" data-act="jumpStep" data-id="${live.id}">← voltar para o que está no ar: ${esc(detour ? (detour === 'message' ? 'aviso' : 'olhos no telão') : stepTitle(live))}</a><span></span></div>
    </section>`;
  }
  // Painel do passo atual: um botão principal por vez; quando o passo não pede mais nada, o principal é "Próximo".
  function panelStep(step, i, total, next, prev) {
    const p = ({ checkin: pCheckin, stage: pStage, connections: pConnections, sucesso: pSucesso, doc: pDoc, reflexao: pReflexao, cena: pCena, message: pMessage, standby: pStandby, closing: pClosing })[step.type](step);
    // "Próximo" vira o botão principal quando o passo não pede mais nada; com algo em andamento ele fica discreto
    const nextBig = !p.primary && !p.busy;
    const nextBtn = next ? btn(`Mostrar o próximo: ${esc(stepTitle(next))} ▶`, 'goStep', { cls: nextBig ? 'big next' : 'ghost next', data: { id: next.id, guard: p.busy || '' } }) : '';
    return `<section class="stepbox t-${step.type}" ${step.type === 'sucesso' ? `style="--c:${SUC_COLOR[step.activity]}"` : p.color ? `style="--c:${p.color}"` : ''}>
      <div class="sb-head"><span class="kick">Passo ${i + 1} de ${total} · ${STEP_KIND[step.type]}</span><span class="onair">${esc(p.onair || '')}</span></div>
      <h1>${stepIcon(step)} ${esc(p.title || stepTitle(step))}</h1>
      ${p.body || ''}
      ${p.warn ? `<div class="sb-warn">${p.warn}</div>` : ''}
      <div class="sb-actions">${p.primary || (nextBig ? nextBtn : '')}${(p.secondary || []).join('')}${nextBig && !next ? '<span class="ok">✔ Último passo do roteiro</span>' : ''}</div>
      <div class="sb-nav">${prev ? `<a href="#" data-act="jumpStep" data-id="${prev.id}">← abrir o passo anterior: ${esc(stepTitle(prev))}</a>` : '<span></span>'}${nextBig ? '' : nextBtn}</div>
      ${p.after || ''}
      ${p.more ? det('more-' + step.type, 'Mais opções', `<div class="sb-more-in">${p.more}</div>`, 'sb-more') : ''}
      ${(r => (r ? `<div class="sb-reset"><a href="#" data-act="resetOne" data-id="${step.id}" class="${r.dirty ? '' : 'off'}" title="${esc(r.what)}">↺ Reiniciar este bloco</a><span class="small">${r.dirty ? esc(r.what) : 'este bloco já está no começo'}</span><a href="#" data-act="resetOpen" class="small">reiniciar outro bloco ou tudo…</a></div>` : ''))(resetInfo(step))}
    </section>`;
  }
  // Senha das dinâmicas: o que está no ar é um bloco do townhall. O painel não mostra qual; só oferece os seus passos.
  function panelHidden() {
    const steps = A.O.settings.steps.filter(x => PHONE_STEPS.includes(x.type) && (x.type !== 'sucesso' || x.activity === 'd1'));
    return `<section class="stepbox t-detour">
      <div class="sb-head"><span class="kick">Fora das dinâmicas</span><span class="offair">no ar: um bloco do townhall</span></div>
      <h1>🔒 O townhall está em outro bloco</h1>
      <p class="lead">Agora está no ar uma parte do townhall que é conduzida pelo Painel do Doc. Este painel alcança só <b>Conexões, Reflexão e Sucesso</b>.</p>
      <p class="small">Abra um dos passos no roteiro ao lado para conferir ou preparar. Ele só vai para o telão e os celulares quando você clicar em <b>📺 Mostrar</b>: combine o momento com quem está no Painel do Doc.</p>
      <div class="actions" style="margin-top:12px">${steps.map(x => btn(`${stepIcon(x)} Abrir ${esc(x.type === 'sucesso' ? 'Sucesso' : stepTitle(x))}`, 'jumpStep', { cls: 'ghost', data: { id: x.id } })).join('')}</div>
    </section>`;
  }
  function panelDetour(kind, step) {
    const O = A.O, m = O.state.message;
    return `<section class="stepbox t-detour">
      <div class="sb-head"><span class="kick">Fora do roteiro</span><span class="onair">Celulares e telão: ${kind === 'message' ? 'este aviso' : 'tela de pausa'}</span></div>
      <h1>${kind === 'message' ? `${esc(m.emoji || '📣')} ${esc(m.title)}` : '📺 Olhos no telão'}</h1>
      <p class="lead">${esc(kind === 'message' ? m.body : O.settings.standbyText || '')}</p>
      <div class="sb-actions">${step.type === 'hidden' ? '<span class="small">Quem volta ao roteiro é o Painel do Doc.</span>' : btn(`↩ Voltar ao roteiro: ${esc(stepTitle(step))}`, 'goStep', { cls: 'big', data: { id: step.id } })}${kind === 'message' && !team() ? btn('✎ Editar aviso', 'quickMessage', { cls: 'ghost' }) : ''}</div>
    </section>`;
  }

  // Nuvem de palavras: as respostas das duas perguntas (só a senha mestra vê e modera)
  function wordsBox() {
    const O = A.O, W = O.words || [], q = ((O.cenas && O.cenas.config.nuvem) || {}).perguntas || ['Pergunta 1', 'Pergunta 2'];
    if (team() || !W.length) return '';
    return det('words', `Ver e moderar as respostas (${W.length})`, `<div class="tblwrap" style="margin-top:8px;max-height:44vh;overflow:auto"><table class="tbl"><tr><th>Pessoa</th><th>1 · ${esc(q[0])}</th><th>2 · ${esc(q[1])}</th><th></th></tr>
      ${W.map(w => `<tr><td>${esc(w.name)}</td><td><b>${esc(w.words[0] || '')}</b></td><td><b>${esc(w.words[1] || '')}</b></td><td class="r"><button class="btn xs ghost" data-act="wordsRemove" data-id="${w.id}" title="Tira as respostas desta pessoa das nuvens. Ela pode responder de novo enquanto o passo estiver no ar.">remover</button></td></tr>`).join('')}</table></div>
      <div class="actions" style="margin-top:8px">${btn('🗑 Apagar todas as respostas', 'wordsClear', { cls: 'red sm' })}</div>`);
  }
  function pCheckin() {
    const O = A.O, missing = O.people.filter(p => p.active && !p.checkedInAt);
    const n = (O.words || []).length, hasCloud = O.settings.steps.some(x => x.type === 'cena' && x.cena === 'nuvem');
    return { onair: 'Celulares: cada pessoa escolhe o idioma, digita o nome, embarca e responde as duas perguntas · Telão: QR do app e o carro carregando a cada check-in',
      body: `<div class="bigstat"><b>${O.counts.checkedIn}</b><span>de ${O.counts.total} a bordo</span></div>
        <div class="bar"><i style="width:${Math.round(100 * O.counts.checkedIn / Math.max(1, O.counts.total))}%"></i></div>
        ${missing.length ? det('missing', `Quem ainda não entrou (${missing.length})`, `<p class="small" style="margin-top:6px">${esc(missing.map(p => p.name).join(' · '))}</p>`) : '<p class="ok">✔ Todo mundo a bordo</p>'}
        ${team() || !hasCloud ? '' : `<p style="margin-top:12px">☁️ <b>Duas perguntas</b> · ${n} de ${O.counts.checkedIn} a bordo já responderam <span class="small">(é a primeira tela depois do login; as palavras só aparecem no telão quando você colocar o passo <b>Nuvem de palavras</b> no ar)</span></p>${wordsBox()}`}` };
  }
  // edição rápida do passo que está no ar (tema do bloco, texto do aviso)
  const editing = step => (A.edit && A.edit.id === step.id ? A.edit : null);
  const editField = (label, field, value, tag = 'input') => `<label class="f">${label}${tag === 'textarea' ? `<textarea class="input" id="ed-${field}" data-edit="${field}">${esc(value)}</textarea>` : `<input class="input" id="ed-${field}" data-edit="${field}" value="${esc(value)}">`}</label>`;
  const editActions = `<div class="actions">${btn('Salvar', 'saveEdit', { cls: 'sm' })}${btn('Cancelar', 'cancelEdit', { cls: 'ghost sm' })}</div>`;
  function pStage(step) {
    const ed = editing(step);
    return { onair: `Celulares: nome e tema do bloco · Telão calmo${A.O.settings.stageMutes ? ' · som desligado' : ''}`,
      body: ed ? `<div class="form editstep">${editField('Nome do bloco', 'title', ed.title)}${editField('Tema (aparece no celular e no telão)', 'theme', ed.theme)}${editField('Quem fala (opcional)', 'speaker', ed.speaker)}${editActions}</div>`
        : `<div class="theme">${esc(step.theme || 'Sem tema definido')}</div>${step.speaker ? `<div class="speaker">com ${esc(step.speaker)}</div>` : ''}<div class="actions">${btn('✎ Editar tema', 'editStep', { cls: 'ghost sm', data: { id: step.id } })}</div>` };
  }
  function pMessage(step) {
    const ed = editing(step);
    return { title: `${step.emoji || ''} ${step.title}`.trim(), onair: 'Celulares e telão: este aviso',
      body: ed ? `<div class="form editstep">${editField('Emoji', 'emoji', ed.emoji)}${editField('Título', 'title', ed.title)}${editField('Texto (links viram clicáveis)', 'body', ed.body, 'textarea')}${editActions}</div>`
        : `<p class="lead">${esc(step.body || 'Sem texto.')}</p><div class="actions">${btn('✎ Editar aviso', 'editStep', { cls: 'ghost sm', data: { id: step.id } })}</div>` };
  }
  const pStandby = () => ({ onair: 'Celulares em pausa · Telão: logo', body: `<p class="lead">${esc(A.O.settings.standbyText || '')}</p>` });
  // Encerramento: os créditos no telão e, nos celulares, o formulário de feedback (nota de 1 a 5 e dois textos opcionais)
  function pClosing() {
    const O = A.O, F = O.feedback || { stats: { count: 0, avg: 0, dist: [0, 0, 0, 0, 0] }, list: [] }, S = F.stats, mx = Math.max(1, ...S.dist);
    const txt = F.list.filter(f => f.liked || f.improve);
    return { onair: 'Celulares: agradecimento e o formulário de feedback · Telão: as frases finais e os créditos',
      body: `<p class="lead">${esc(O.settings.closingText || '')}</p>
        <div class="bigstat"><b>${S.count}</b><span>de ${O.counts.checkedIn} a bordo já mandaram o feedback${S.count ? ` · nota média <b style="font-size:inherit">${String(S.avg).replace('.', ',')}</b> de 5` : ''}</span></div>
        <div class="fbdist">${[5, 4, 3, 2, 1].map(n => `<div><span>${'⚡'.repeat(n)}</span><i><b style="width:${Math.round(100 * S.dist[n - 1] / mx)}%"></b></i><em>${S.dist[n - 1]}</em></div>`).join('')}</div>
        ${txt.length ? det('fbList', `Ler os comentários (${txt.length})`, `<div class="tblwrap" style="margin-top:8px;max-height:46vh;overflow:auto"><table class="tbl"><tr><th>Quem</th><th>Nota</th><th>O que mais gostou</th><th>O que melhorar</th></tr>
          ${txt.map(f => `<tr><td>${f.anonymous ? '<span class="small">sem nome</span>' : esc(f.name)}</td><td>${f.rating}</td><td>${esc(f.liked)}</td><td>${esc(f.improve)}</td></tr>`).join('')}</table></div>`) : ''}
        <p class="small" style="margin-top:10px">Os créditos (produtores, frentes, agradecimentos) e as frases finais ficam em <a href="#" data-go="cenas" data-sec="creditos">Preparar → Agenda e cenas</a>. O elenco (todos os nomes do check-in) entra sozinho. O feedback completo sai em <a href="/dados.html" target="_blank">📊 Dados → Feedback</a>.</p>
        <div class="actions"><a class="btn ghost" href="/dados.html" target="_blank">📊 Extrair os dados do evento ↗</a></div>
        <div class="actions" style="align-items:center"><span class="small">Respostas do Sucesso:</span>${['d1', 'd2', 'd3', 'd4'].map(k => btn(`${k.slice(1).padStart(2, '0')} · ${SUC_NAME[k]}`, 'sucAnswers', { cls: 'ghost xs', data: { k } })).join('')}</div>` };
  }
  /* ---------- cenas do deck do townhall: o que cada uma mostra e os comandos do Doc ---------- */
  const CENA_AIR = { abertura: 'Celulares: "olhe para o telão" · Telão: o vídeo de abertura em tela cheia', agenda: 'Celulares: a agenda do dia · Telão: o plano de voo em 4 atos', boasvindas: 'Celulares: "olhe para o telão" · Telão: a frase de abertura e quem fala',
    nuvem: 'Celulares: as nuvens (e as duas perguntas para quem ainda não respondeu) · Telão: uma nuvem de palavras por pergunta, já com tudo o que chegou desde o check-in',
    plano26: 'Celulares: "olhe para o telão" · Telão: o plano estratégico LATAM GDT 2026, no visual do filme',
    capasucesso: 'Celulares: a capa do bloco Sucesso · Telão: o nome do bloco e quem conduz',
    almanaque: 'Celulares: "olhe para o telão" · Telão: o almanaque 2026, de dezembro para janeiro (a DeLorean vai de ré)', ia: 'Celulares: "olhe para o telão" · Telão: abertura da Frente 2 e o QR do app',
    reconhecimento: 'Celulares: o prêmio, o botão de carregar e o vencedor · Telão: a cerimônia', intervalo: 'Celulares e telão: o cronômetro do intervalo e, quando ele zera, o alerta de volta · a música entra',
    visao: 'Celulares: "olhe para o telão" · Telão: a capa do bloco e, depois, a Estratégia CDIO LATAM 2027 em tela cheia', manifesto: 'Celulares: "olhe para o telão" · Telão: a pergunta do manifesto e o QR do app', mph: 'Celulares e telão: o velocímetro até 88 MPH e a chegada a 2027' };
  const cenaBtn = (label, kind, a, o = {}) => btn(label, 'cena', { ...o, data: { kind, a, ...(o.data || {}) } });
  const cfgLink = (sec, label = 'editar o conteúdo') => `<a href="#" data-go="cenas" data-sec="${sec}">${label}</a>`;
  const ivLeft = () => { const C = A.O.cenas, s = C.state.intervalo; return s.phase === 'run' && s.endsAt ? Math.max(0, Math.ceil((s.endsAt - Date.now() - A.offset) / 1000)) : s.remaining === null ? C.config.intervalo.min * 60 : s.remaining; };
  const ivPhase = () => { const s = A.O.cenas.state.intervalo; return s.phase === 'run' && s.endsAt && s.endsAt <= Date.now() + A.offset ? 'done' : s.phase; };
  const P26_PART = c => ['topo', 'p1', 'p2', 'p3', 'base'].map(k => (c[k] || {}).t || k);
  const REC_FASE = { intro: 'abertura', tributo: 'tributo', premios: 'prêmios', cerimonia: 'cerimônia', hall: 'Hall da Fama' };
  const REC_PASSO = { categoria: 'a categoria', indicados: 'os indicados', carga: 'carregando o Flux Capacitor', sorteio: 'sorteio (o raio vai cair)', vencedor: 'vencedor revelado' };
  // resumo de uma linha (roteiro e "no ar")
  function cenaSub(x, live) {
    const C = A.O.cenas; if (!C) return '';
    if (x.cena === 'abertura') { const s = C.state.abertura || {}; return s.play ? 'vídeo tocando' : s.fim ? 'o vídeo terminou' : live ? 'vídeo parado' : ''; }
    if (x.cena === 'nuvem') { const n = (A.O.words || []).length, f = (C.state.nuvem || {}).foco || 0; return n || live ? `${n} ${n === 1 ? 'pessoa respondeu' : 'pessoas responderam'}${f ? ` · pergunta ${f} em destaque` : ''}` : ''; }
    if (x.cena === 'plano26') { const f = (C.state.plano26 || {}).foco || 0; return f ? `em destaque: ${P26_PART(C.config.plano26)[f - 1]}` : live ? 'o plano inteiro' : ''; }
    if (x.cena === 'visao') { const v = C.state.visao || {}; return v.aberta ? 'estratégia em tela cheia' : live ? 'capa do bloco' : ''; }
    if (x.cena === 'almanaque') { const s = C.state.almanaque; return s.pagina ? 'o ano em uma página' : s.mes >= 0 ? `${C.months[s.mes]}${s.tocando ? ' · tocando o ano' : ''}` : live ? 'em branco' : ''; }
    if (x.cena === 'reconhecimento') { const s = C.state.reconhecimento, n = C.config.reconhecimento.premios.length; return s.feitos.length || live ? `${live ? REC_FASE[s.fase] + ' · ' : ''}${s.feitos.length} de ${n} prêmios revelados` : ''; }
    if (x.cena === 'intervalo' && C.state.intervalo.alerta) return '🚨 alerta de volta no ar';
    if (x.cena === 'intervalo') { const ph = ivPhase(); return ph === 'run' ? `faltam ${fmt(ivLeft())}` : ph === 'paused' ? `pausado em ${fmt(ivLeft())}` : ph === 'done' ? 'terminou' : live ? 'cronômetro parado' : `${C.config.intervalo.min} min`; }
    if (x.cena === 'mph') return C.state.mph.at ? 'chegamos a 2027' : '';
    return '';
  }
  // quem conduz um bloco (Preparar → Agenda e cenas → Quem conduz): "Fulano e Beltrana"
  const hostNames = k => { const l = ((A.O.cenas.config.anfitrioes || {})[k] || []); return l.length > 1 ? `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}` : l[0] || ''; };

  /* ---------- microfone dos aplausos (Reconhecimento) ----------
   * Na cerimônia dos prêmios, o Flux Capacitor do telão carrega com o barulho da sala. Quem ouve é o microfone do
   * aparelho em que este painel está aberto: o som não é gravado nem enviado, só o volume é medido aqui mesmo, e o
   * painel manda para o servidor "quanto a carga anda" algumas vezes por segundo.
   * Para quem apresenta é um clique só ("Liberar o microfone" → "Permitir" no navegador), uma única vez. Depois disso:
   *   - o microfone liga sozinho quando o Reconhecimento entra no ar e desliga quando ele sai;
   *   - o painel descobre sozinho o "silêncio da sala" e, se o microfone for fraco, ajusta a régua ao volume dos aplausos;
   *   - quanto mais alto, mais rápido carrega (aplauso forte enche em uns 7 segundos).
   * "Ajuste fino" (sensibilidade e calibrar com palmas) é opcional. */
  const MIC_GATE = 6, MIC_FILL = 7, MIC_SPAN_MIN = 16, MIC_AUTO_MS = 5000, clamp01 = v => Math.max(0, Math.min(1, v));
  const Mic = { on: false, starting: false, auto: false, userOff: false, autoTried: false, perm: '', permAsked: false, stream: null, ctx: null, src: null, an: null, buf: null, timer: null,
    floor: null, avg: -100, level: 0, acc: 0, last: 0, sent: 0, err: '', cal: null, chargeAt: 0, peak: -120,
    span: Math.max(8, Math.min(44, +localStorage.getItem('bttf.micSpan') || 28)) };
  const micMode = () => ((A.O && A.O.cenas && A.O.cenas.config.reconhecimento && A.O.cenas.config.reconhecimento.carga) || 'mic');
  const recOnAir = () => { const O = A.O; if (!O || !O.cenas) return false; const { step } = liveStep(); return step.type === 'cena' && step.cena === 'reconhecimento' && O.state.block === 'cena' && !O.state.presentation; };
  const micWanted = () => recOnAir() && micMode() !== 'toques';
  const micCharging = () => { if (!micWanted()) return false; const s = A.O.cenas.state.reconhecimento; return s.fase === 'cerimonia' && s.passo === 'carga'; };
  async function micStart(auto) {
    if (Mic.on || Mic.starting) return;
    Mic.starting = true; Mic.err = ''; render(true);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error('sem acesso'), { name: 'NoApi' });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
      const C = new (window.AudioContext || window.webkitAudioContext)(); if (C.state === 'suspended') C.resume().catch(() => {});
      const an = C.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0; const src = C.createMediaStreamSource(stream); src.connect(an);
      // ligado com o Reconhecimento no ar: desliga sozinho quando o bloco sair; ligado fora dele (teste): fica até você desligar
      Object.assign(Mic, { on: true, auto: recOnAir(), userOff: false, perm: 'granted', stream, ctx: C, src, an, buf: new Float32Array(an.fftSize), floor: null, avg: -100, level: 0, acc: 0, last: performance.now(), sent: 0, cal: null, chargeAt: 0 });
      stream.getTracks().forEach(t => t.addEventListener('ended', () => micStop(false)));
      Mic.timer = setInterval(micTick, 80);
    } catch (e) {
      const n = e && e.name;
      if (n === 'NotAllowedError' || n === 'SecurityError') Mic.perm = 'denied';
      Mic.err = n === 'NoApi' ? 'Este navegador não libera o microfone aqui. Abra o painel pelo endereço https, no Chrome ou no Edge.'
        : n === 'NotAllowedError' || n === 'SecurityError' ? 'O navegador está bloqueando o microfone para este site. Clique no cadeado (ou no ícone de câmera/microfone) ao lado do endereço, escolha "Permitir" no microfone e clique de novo em "Liberar o microfone".'
        : n === 'NotFoundError' ? 'Nenhum microfone encontrado neste aparelho.' : `Não deu para ligar o microfone (${(e && e.message) || e}).`;
      if (!auto) micHelp();
    } finally { Mic.starting = false; render(true); }
  }
  // Não deu para ligar: explica o motivo e o que fazer, com o caminho no navegador
  function micHelp() {
    const blocked = Mic.perm === 'denied';
    dialog(`<h3>🎤 Não consegui ligar o microfone</h3><div class="sb-warn" style="margin-bottom:12px">${esc(Mic.err || 'O navegador não liberou o microfone.')}</div>
      ${blocked ? `<p><b>Como liberar (Chrome ou Edge, no computador):</b></p>
        <ol class="small steps" style="margin-top:8px">
          <li>Olhe a barra de endereço, lá em cima: à <b>esquerda</b> do endereço do site há um ícone pequeno (um cadeado 🔒 ou dois risquinhos com bolinhas). Clique nele.</li>
          <li>Na janelinha que abre, procure <b>Microfone</b> e mude para <b>Permitir</b> (ou ligue a chave). Se não aparecer, clique em "Configurações do site" e mude Microfone para Permitir.</li>
          <li>Recarregue a página (F5) e clique de novo em <b>🎤 liberar microfone</b>, no topo do painel.</li>
        </ol>
        <p class="small" style="margin-top:10px">Se a opção Microfone estiver cinza ou não deixar mudar, é o computador da empresa que bloqueia. Nesse caso: abra o painel em outro navegador, em outro computador ou no celular (o microfone que vale é o do aparelho em que o painel está aberto).</p>`
        : '<p class="small">Confira se este aparelho tem microfone e se o sistema (Windows: Configurações → Privacidade → Microfone; Mac: Ajustes do Sistema → Privacidade → Microfone) deixa o navegador usá-lo. Depois clique de novo em <b>🎤 liberar microfone</b>, no topo do painel.</p>'}
      <p class="small" style="margin-top:10px"><b>Plano B, sem microfone:</b> a cerimônia funciona do mesmo jeito com o botão <b>"+15% de carga"</b> do painel, ou trocando para "toques nos celulares" em Agenda e cenas → Reconhecimento.</p>
      <div class="actions" style="margin-top:14px"><button class="btn ghost" data-close>Entendi</button></div>`);
  }
  function micStop(byUser) {
    clearInterval(Mic.timer); if (Mic.stream) Mic.stream.getTracks().forEach(t => t.stop()); if (Mic.ctx) Mic.ctx.close().catch(() => {});
    Object.assign(Mic, { on: false, auto: false, stream: null, ctx: null, src: null, an: null, level: 0, acc: 0, cal: null, chargeAt: 0 });
    if (byUser) Mic.userOff = true; // desligado de propósito: não liga sozinho de novo neste bloco
    render(true);
  }
  // se o navegador já deixou usar o microfone ('granted'), ele liga sozinho quando o Reconhecimento entra no ar e desliga quando sai
  function micAuto() {
    if (!Mic.permAsked && navigator.permissions && navigator.permissions.query) {
      Mic.permAsked = true;
      navigator.permissions.query({ name: 'microphone' }).then(p => { Mic.perm = p.state; p.onchange = () => { Mic.perm = p.state; render(true); }; render(true); }).catch(() => {});
    }
    if (!micWanted()) { // fora do Reconhecimento
      Mic.autoTried = false; Mic.userOff = false;
      if (Mic.on && Mic.auto) setTimeout(() => { if (Mic.on && Mic.auto && !micWanted()) micStop(false); }, 0);
      return;
    }
    if (Mic.on) { Mic.auto = true; return; }
    if (Mic.starting || Mic.userOff || Mic.autoTried || Mic.perm !== 'granted') return;
    Mic.autoTried = true; micStart(true);
  }
  // sem um clique na página o navegador pode deixar o áudio "dormindo": o primeiro clique acorda
  document.addEventListener('pointerdown', () => { if (Mic.ctx && Mic.ctx.state === 'suspended') Mic.ctx.resume().catch(() => {}); }, true);
  function micTick() {
    if (!Mic.on) return;
    const t = performance.now(), dt = Math.min(1.5, (t - Mic.last) / 1000); Mic.last = t;
    Mic.an.getFloatTimeDomainData(Mic.buf); let sum = 0; for (let i = 0; i < Mic.buf.length; i++) sum += Mic.buf[i] * Mic.buf[i];
    const db = 20 * Math.log10(Math.sqrt(sum / Mic.buf.length) + 1e-6);   // −120 (silêncio total) … 0 (o máximo do microfone)
    const charging = micCharging();
    Mic.avg += (db - Mic.avg) * Math.min(1, dt / .3);
    // "silêncio da sala": acompanha os momentos mais quietos. Desce rápido sempre que a sala fica mais quieta; sobe bem devagar,
    // e nunca durante a carga ou a calibragem (senão os próprios aplausos virariam "silêncio"). Microfones que cortam o som
    // baixo entregam silêncio absoluto: o piso não desce de −65 dB.
    if (Mic.floor === null) Mic.floor = db; else if (db < Mic.floor) Mic.floor += (db - Mic.floor) * Math.min(1, dt / .4); else if (!charging && !Mic.cal) Mic.floor += (db - Mic.floor) * Math.min(1, dt / 25);
    Mic.floor = Math.max(-65, Mic.floor);
    // Régua do volume: "aplauso forte" = Mic.span decibéis acima do silêncio. Ajuste automático: se depois de 5 s de carga o som
    // mais alto que a sala fez ainda está longe disso (microfone fraco ou longe das pessoas), a régua encolhe para esse som
    // valer uns 80%, e a cerimônia não empaca. Volta a crescer sozinha se vier um barulho mais forte.
    if (charging) { if (!Mic.chargeAt) { Mic.chargeAt = t; Mic.peak = -120; } Mic.peak = Math.max(Mic.peak, Mic.avg); } else Mic.chargeAt = 0;
    let span = Mic.span;
    if (charging && t - Mic.chargeAt > MIC_AUTO_MS) span = Math.max(Math.min(MIC_SPAN_MIN, Mic.span), Math.min(Mic.span, (Mic.peak - Mic.floor - MIC_GATE) / .8));
    const x = clamp01((db - Mic.floor - MIC_GATE) / span);
    Mic.level += (x - Mic.level) * (x > Mic.level ? .65 : .22);           // sobe rápido, desce devagar (como um medidor de volume)
    if (Mic.cal) { Mic.cal.peak = Math.max(Mic.cal.peak, Mic.avg); if (t >= Mic.cal.until) micCalDone(); }
    if (charging) {
      Mic.acc += Mic.level > .08 ? Math.pow(Mic.level, 1.5) * dt / MIC_FILL : -dt * .02; // aplauso forte enche em ~7 s; no silêncio, a carga escorre devagar
      if (t - Mic.sent >= 240 && A.socket && A.socket.connected) { Mic.sent = t; A.socket.emit('cena:mic', { delta: Mic.acc, nivel: Mic.level }); Mic.acc = 0; }
    } else Mic.acc = 0;
    const bar = $('#micLvl'); if (bar) { bar.style.width = (Mic.level * 100).toFixed(0) + '%'; bar.parentNode.classList.toggle('loud', Mic.level > .6); }
  }
  // "Calibrar" (opcional): por 4 segundos ouve uma salva de palmas de teste e ajusta a sensibilidade para ela valer como aplauso forte
  function micCal() { if (!Mic.on || Mic.cal) return; Mic.cal = { until: performance.now() + 4000, peak: -120 }; render(true); toast('👏 Peça uma salva de palmas agora (4 segundos)…'); }
  function micCalDone() {
    const gain = Mic.cal.peak - Mic.floor - MIC_GATE; Mic.cal = null;
    if (gain < 6) toast('Quase não ouvi diferença entre o silêncio e as palmas. Aproxime o microfone da sala e tente de novo.', true);
    else { Mic.span = Math.max(8, Math.min(44, gain * .9)); localStorage.setItem('bttf.micSpan', Mic.span.toFixed(1)); toast('Microfone calibrado ✔ Palmas como essas enchem o Flux Capacitor em uns 7 segundos.'); }
    render(true);
  }
  // O quadro do microfone: um botão só para liberar; ligado, mostra o som da sala. "test" = cartão de Preparar → Testes
  function micBox(where) {
    if (micMode() === 'toques') return where === 'test' ? '<p class="small">Hoje o Flux Capacitor está configurado para carregar só com os <b>toques nos celulares</b>, então o microfone não é usado. Para carregar com os aplausos, troque em <a href="#" data-go="cenas" data-sec="reconhecimento">Agenda e cenas → Reconhecimento</a>.</p>' : '';
    const sens = Math.round((44 - Mic.span) / 4) + 1; // 1 (pouco sensível) … 10 (muito sensível)
    const pill = Mic.on ? '<span class="pill on">✔ ouvindo a sala</span>' : Mic.starting ? '<span class="pill hot">clique em "Permitir" no aviso do navegador…</span>' : Mic.perm === 'denied' ? '<span class="pill off">bloqueado no navegador</span>' : Mic.perm === 'granted' ? '<span class="pill">liberado · desligado agora</span>' : '<span class="pill off">ainda não liberado</span>';
    const fine = `<div class="microw"><label class="small">Sensibilidade <input type="range" min="1" max="10" step="1" value="${sens}" data-act="micSens" aria-label="Sensibilidade do microfone"></label>${btn(Mic.cal ? '👏 Ouvindo as palmas…' : '🎚 Calibrar com uma salva de palmas', 'micCal', { cls: 'ghost xs', disabled: !!Mic.cal })}</div>
      <p class="small" style="margin-top:6px">Normalmente não precisa mexer: o painel descobre sozinho o silêncio da sala e se ajusta ao volume dos aplausos. Use só se, no ensaio, a barra subir pouco com palmas fortes (aumente) ou encher com qualquer conversa (diminua).</p>`;
    return `<div class="micbox ${Mic.on ? 'on' : ''}">
      <div class="mich"><b>🎤 Microfone dos aplausos</b>${pill}${Mic.on ? btn('Desligar', 'micOff', { cls: 'ghost xs' }) : ''}</div>
      ${Mic.on ? `<div class="micmeter" title="Som da sala agora"><i id="micLvl" style="width:${(Mic.level * 100).toFixed(0)}%"></i></div>
          <p class="small"><b>Pronto, não precisa fazer mais nada.</b> Bata palmas para testar: a barra tem de subir. Na hora da carga, é só a sala fazer barulho (aplauso forte enche o Flux Capacitor em uns 7 segundos). O som não é gravado.${where === 'test' ? ' No dia, ele liga sozinho quando o Reconhecimento entrar no ar.' : ''}</p>${det('micFine', 'Ajuste fino (opcional)', fine)}`
        : `${Mic.err ? `<div class="sb-warn">${esc(Mic.err)}</div>` : ''}
          <div class="actions"><button class="btn ${where === 'test' ? '' : 'sm'}" data-act="micOn" ${Mic.starting ? 'disabled' : ''}>🎤 ${Mic.perm === 'granted' ? 'Ligar o microfone' : 'Liberar o microfone'}</button></div>
          <p class="small">${Mic.perm === 'granted' ? 'O microfone já está liberado neste navegador: ele liga sozinho quando o Reconhecimento entra no ar (e neste botão, para testar).' : 'É um clique só. O navegador vai perguntar se este site pode usar o microfone: clique em <b>Permitir</b>. Depois disso ele não pergunta mais, e o microfone liga sozinho sempre que o Reconhecimento entrar no ar.'} O som não é gravado: só o volume da sala é medido.</p>`}
    </div>`;
  }

  /* ---------- Spotify: a música do evento vem da conta de quem está no painel ---------- */
  const spItem = (x, sub) => `<button type="button" class="spitem" data-act="spPlay" data-uri="${esc(x.uri)}" title="Tocar agora">${x.image ? `<img src="${esc(x.image)}" alt="" loading="lazy">` : '<span class="noart">♪</span>'}<span class="t"><b>${esc(x.name)}</b><small>${esc(sub || '')}</small></span><i>▶</i></button>`;
  function spPaint() { // atualiza "tocando agora" e os aparelhos, se a janela do Spotify estiver aberta
    const now = $('#spNow'), dev = $('#spDev'); if (!now || !dev || !SP) return;
    const s = SP.state, p = s.player, set = (el, html) => { if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; } };
    set(now, `${s.error ? `<div class="sb-warn" style="margin-bottom:10px">${esc(s.error)}</div>` : ''}<div class="spnow">${p && p.image ? `<img src="${esc(p.image)}" alt="">` : '<div class="noart">♪</div>'}
      <div class="t"><b>${esc(p && p.name ? p.name : 'Nada tocando agora')}</b><span>${esc(p && p.name ? p.artists : 'Escolha uma música no seu Spotify, ou toque uma playlist aqui embaixo.')}</span><small>${p && p.device ? `🔊 tocando em: ${esc(p.device.name)}` : 'Nenhum aparelho com o Spotify ativo'}</small></div>
      <div class="ctl"><button class="btn ghost" data-act="spPrev" title="Música anterior">⏮</button><button class="btn" data-act="spToggle">${p && p.playing ? '⏸ Pausar' : '▶ Tocar'}</button><button class="btn ghost" data-act="spNext" title="Próxima música">⏭</button></div></div>`);
    const cur = p && p.device ? p.device.id : '', list = s.devices.some(d => d.id === cur) || !cur ? s.devices : [{ id: cur, name: p.device.name }, ...s.devices];
    set(dev, `<div class="spdev"><label class="small">Onde toca <select class="input" data-act="spDevice">${list.length ? '' : '<option value="">(abra o Spotify em um aparelho)</option>'}${list.map(d => `<option value="${esc(d.id)}" ${d.id === cur ? 'selected' : ''}>${esc(d.name)}${d.id === s.local ? ' (este navegador)' : ''}</option>`).join('')}</select></label>
      <button class="btn ghost xs" data-act="spDevs" title="Procurar de novo os aparelhos com o Spotify aberto">↻ Atualizar</button><button class="btn ghost xs" data-act="spLocal" title="Faz este navegador virar um aparelho do Spotify: o som sai deste computador">🔊 Tocar neste computador</button>
      ${p && p.device && p.device.canVolume && p.device.volume !== null ? `<label class="small">Volume do Spotify <input type="range" min="0" max="100" step="5" value="${p.device.volume}" data-act="spVol"></label>` : ''}</div>`);
  }
  function spDialog() {
    if (!SP) return toast('O Spotify não carregou nesta página. Recarregue o painel.', true);
    const s = SP.state, close = '<button class="btn ghost" data-close style="margin-left:auto">Fechar</button>';
    if (!s.configured) return dialog(`<h3>🎧 Spotify</h3><p>Para tocar a música do seu Spotify no evento, falta uma preparação de uns 5 minutos (uma vez só): criar um "app" na página de desenvolvedores do Spotify e colar o código dele aqui.</p>
      <p class="small" style="margin-top:8px">O passo a passo está em Preparar → Ajustes → Spotify. O Spotify exige conta Premium.</p><div class="actions" style="margin-top:14px"><button class="btn" data-act="spCfg">Abrir o passo a passo</button>${close}</div>`);
    if (!s.connected) return dialog(`<h3>🎧 Spotify</h3>${s.error ? `<div class="sb-warn" style="margin-bottom:10px">${esc(s.error)}</div>` : ''}<p>Conecte a sua conta do Spotify a este painel. Você vai para a página do Spotify, autoriza e volta para cá.</p>
      <p class="small" style="margin-top:8px">A conexão fica guardada só neste navegador. Depois de conectar, escolha a música no seu Spotify (celular ou computador) e use o botão "🎧 Spotify" da barra de som.</p>
      <div class="actions" style="margin-top:14px"><button class="btn" data-act="spLogin">Conectar ao Spotify</button>${close}</div>`);
    dialog(`<h3>🎧 Spotify</h3><div id="spNow"></div><div id="spDev"></div>
      <div class="spcols"><div><h4>Suas playlists</h4><div id="spLists" class="splist"><p class="small">Carregando…</p></div></div>
        <div><h4>Buscar</h4><form id="spForm" class="spsearch"><input class="input" id="spQ" placeholder="Música, artista ou playlist" autocomplete="off"><button class="btn sm" type="submit">Buscar</button></form><div id="spRes" class="splist"><p class="small">Digite e aperte Enter. Um toque em ▶ já toca no evento.</p></div></div></div>
      <p class="small" style="margin-top:10px">O que você escolher no aplicativo do Spotify também aparece aqui. Com o botão "🎧 Spotify" da barra de som ligado, a música do app fica calada; ao trocar para "Sem áudio" (ou entrar num bloco de fala), o Spotify pausa.</p>
      <div class="actions" style="margin-top:12px"><button class="btn ghost sm" data-act="spLogout">Desconectar do Spotify</button>${close}</div>`, d => {
      d.classList.add('wide'); spPaint(); SP.refresh(); SP.devices().catch(() => {});
      SP.playlists().then(list => { const el = $('#spLists'); if (el) el.innerHTML = list.length ? list.map(x => spItem(x, [x.owner, x.total !== null ? `${x.total} músicas` : ''].filter(Boolean).join(' · '))).join('') : '<p class="small">Nenhuma playlist na sua conta.</p>'; })
        .catch(e => { const el = $('#spLists'); if (el) el.innerHTML = `<p class="small" style="color:var(--amber)">${esc(e.message)}</p>`; });
      $('#spForm').onsubmit = e => {
        e.preventDefault(); const el = $('#spRes'); el.innerHTML = '<p class="small">Buscando…</p>';
        SP.search($('#spQ').value).then(r => { el.innerHTML = [...r.tracks.map(x => spItem(x, x.artists)), ...r.playlists.map(x => spItem(x, `playlist${x.owner ? ' · ' + x.owner : ''}`))].join('') || '<p class="small">Nada encontrado.</p>'; })
          .catch(err => { el.innerHTML = `<p class="small" style="color:var(--amber)">${esc(err.message)}</p>`; });
      };
    });
  }
  const spCfgState = () => { const s = spState(), p = s.player; return !SP ? '' : !s.configured ? '<span class="pill off">falta o Client ID</span>' : !s.connected ? '<span class="pill hot">app configurado · falta conectar a conta</span> <button class="btn sm" data-act="spLogin">Conectar ao Spotify</button>'
    : `<span class="pill on">conectado ✔</span> <span class="small">${p && p.name ? `tocando: ${esc(p.name)}${p.device ? ' · ' + esc(p.device.name) : ''}` : 'nada tocando agora'}</span> <button class="btn ghost sm" data-act="spOpen">Abrir o Spotify do painel</button> <button class="btn ghost sm" data-act="spLogout">Desconectar</button>`; };
  // O Client ID do Spotify fica nos ajustes do servidor. Como o servidor gratuito esquece os ajustes quando reinicia,
  // o navegador de quem configurou guarda uma cópia e devolve ao servidor sozinho (a conexão em si já mora no navegador).
  function spConfigure() {
    const srv = A.O.settings.spotifyClientId || ''; let local = ''; try { local = localStorage.getItem('bttf.spotify.cid') || ''; } catch { /* sem armazenamento */ }
    if (srv) { if (srv !== local) { try { localStorage.setItem('bttf.spotify.cid', srv); } catch { /* segue */ } } }
    else if (local && !A.spRestored) { A.spRestored = true; act('settings', { settings: { spotifyClientId: local } }).catch(() => { A.spRestored = false; }); }
    SP.configure(srv || local);
  }
  if (SP) {
    SP.onChange(() => { renderAudio(); spPaint(); const c = $('#spCfgState'); if (c) c.innerHTML = spCfgState(); });
    SP.handleRedirect().then(ok => { if (ok) toast('Spotify conectado 🎧 Agora é só escolher a música e ligar o botão "🎧 Spotify".'); else if (SP.state.error) toast(SP.state.error, true); });
  }

  function pCena(step) {
    const O = A.O, C = O.cenas, k = step.cena, cfg = C.config[k], st = C.state[k] || {}, note = team() ? '' : `<p class="small" style="margin-top:10px">${cfgLink(k)} em Preparar → Agenda e cenas.</p>`;
    const out = { onair: CENA_AIR[k] };
    if (k === 'abertura') { // vídeo de abertura: o arquivo é arrastado para a tela do telão (fica guardado lá) ou vem de um endereço
      const tl = O.telao || { count: 0 }, onTelao = !!(tl.videos && tl.videos.abertura), ready = !!cfg.video || onTelao;
      out.body = `<div class="phase">${st.play ? (ready ? '▶ O vídeo está tocando no telão' : '⏳ No ar, esperando o vídeo: assim que o arquivo for carregado no telão, ele começa') : st.fim ? '✔ O vídeo terminou' : 'No telão: o cartão do evento, pronto para o vídeo'}</div>
        <p class="lead">${cfg.video ? 'Vídeo configurado por endereço.' : onTelao ? '✔ O vídeo já está carregado no telão (guardado no navegador do telão).' : !tl.count ? '⚠ Nenhum telão aberto. Abra o telão e arraste o arquivo do vídeo para a tela dele.' : '⚠ Ainda não há vídeo no telão: <b>arraste o arquivo do vídeo para a tela do telão</b> (ou clique na tela do telão para escolher o arquivo).'}</p>
        <p class="small">O arquivo fica guardado no navegador do telão: pode carregar antes do evento, fechar e abrir de novo, que ele continua lá. No dia, use o mesmo computador e navegador. O vídeo toca com som depois de um clique na tela do telão (o mesmo clique que libera o som). ${cfg.auto ? 'Ele começa sozinho quando este passo entra no ar.' : 'Ele só começa quando você clicar em Tocar.'}</p>`;
      out.primary = st.play ? cenaBtn('⏸ Pausar o vídeo', k, 'play', { cls: 'big', data: { on: '' } }) : st.fim ? null : cenaBtn('▶ Tocar o vídeo de abertura', k, 'play', { cls: 'big', data: { on: 1 }, disabled: !ready });
      out.secondary = [cenaBtn('↺ Tocar do começo', k, 'reiniciar', { cls: 'ghost', disabled: !ready }), st.play ? cenaBtn('⏹ Encerrar o vídeo', k, 'fim', { cls: 'ghost' }) : ''];
      out.busy = st.play ? 'O vídeo ainda está tocando no telão. Avançar mesmo assim?' : '';
      if (!ready) out.warn = '⚠ Sem vídeo carregado, o telão mostra só o cartão do evento com o pedido do arquivo.';
      out.more = `<p class="small">Endereço do vídeo (opcional) e se ele começa sozinho: ${cfgLink('abertura', 'Preparar → Agenda e cenas → Vídeo de abertura')}.</p>`;
    } else if (k === 'agenda') {
      const v = C.config.agenda; let t = v.inicio.split(':').reduce((h, m) => +h * 60 + +m);
      const hm = x => `${pad(Math.floor(x / 60) % 24)}:${pad(x % 60)}`;
      out.body = `<p class="lead">O plano de voo de hoje, em 4 atos, só com os horários (a duração de cada bloco não aparece). No telão, um destaque suave passeia por todos os itens; 📱 marca o que acontece no celular.</p>
        <div class="tblwrap"><table class="tbl">${v.itens.map(x => { const h = hm(t); t += x.min; return `<tr><td class="mono">${h}</td><td><b>${esc(x.t)}</b>${PHONE_STEPS.includes(x.ref) ? ' 📱' : ''}<div class="small">${esc(x.d)}</div></td><td class="small">ATO ${['I', 'II', 'III', 'IV'][x.ato - 1]}</td></tr>`; }).join('')}</table></div>${note}`;
    } else if (k === 'boasvindas') {
      out.body = `<div class="theme">${esc(cfg.frase.replace(/\*/g, ''))}</div><div class="speaker">com ${esc(cfg.pessoas.map(p => p.nome).join(', '))}</div>
        <p class="small" style="margin-top:10px">O próximo passo do roteiro é a <b>nuvem de palavras</b>: as duas perguntas aparecem nos celulares quando você avançar.</p>${note}`;
    } else if (k === 'nuvem') { // as duas perguntas nos celulares e uma nuvem por pergunta no telão
      const n = (O.words || []).length, f = st.foco || 0, q = cfg.perguntas || [], wc = O.wordsCloud || { clouds: [[], []] };
      const top = i => (wc.clouds[i] || []).slice(0, 6).map(([w, c]) => `${esc(w)}${c > 1 ? ` <span class="small">×${c}</span>` : ''}`).join(' · ');
      out.body = `<div class="phase">${f ? `No telão: a pergunta ${f} em destaque` : 'No telão: as duas nuvens, lado a lado'}</div>
        <div class="bigstat"><b>${n}</b><span>de ${O.counts.checkedIn} a bordo já responderam</span></div>
        <div class="bar"><i style="width:${Math.round(100 * n / Math.max(1, O.counts.checkedIn))}%"></i></div>
        ${q.map((t, i) => `<p style="margin-top:10px"><b>${i + 1} · ${esc(t)}</b><br><span class="small">${top(i) || 'ainda sem respostas'}</span></p>`).join('')}
        <p class="small" style="margin-top:8px">As respostas vêm chegando desde o check-in: as duas perguntas são a primeira tela do celular depois do login, no idioma que a pessoa escolheu. Agora o telão mostra tudo o que chegou; quem ainda não respondeu vê as perguntas de novo e a nuvem vai crescendo. Quem já respondeu não vê o formulário de novo, mesmo entrando por outro aparelho (dá para trocar a resposta até este passo). As respostas param de chegar quando você avança no roteiro.</p>${wordsBox()}`;
      out.secondary = [cenaBtn('☁️☁️ As duas nuvens', k, 'foco', { cls: f === 0 ? 'sm' : 'ghost sm', data: { n: 0 } }), cenaBtn('1 · Destacar a pergunta 1', k, 'foco', { cls: f === 1 ? 'sm' : 'ghost sm', data: { n: 1 } }), cenaBtn('2 · Destacar a pergunta 2', k, 'foco', { cls: f === 2 ? 'sm' : 'ghost sm', data: { n: 2 } })];
      if (!n) out.warn = 'Ainda não chegou nenhuma resposta: as perguntas aparecem no celular logo depois do login (e agora, para quem ainda não respondeu).';
      out.more = note;
    } else if (k === 'plano26') { // o plano estratégico 2026: tudo de uma vez, ou uma parte em destaque
      const f = st.foco || 0, parts = P26_PART(cfg);
      out.body = `<div class="theme">${esc(cfg.titulo.replace(/\*/g, ''))}</div><div class="speaker">${esc((cfg.lideres || []).map(x => `${x.nome} (${x.papel})`).join(' · '))}</div>
        <div class="phase" style="margin-top:12px">${f ? `No telão: em destaque, ${esc(parts[f - 1])}` : 'No telão: o plano inteiro'}</div>
        <p class="small">Em cima, o destino (${esc(parts[0])}); no meio, os três motores (${esc(parts.slice(1, 4).join(', '))}); embaixo, a estrada (${esc(parts[4])}). Para explicar uma parte por vez, use o destaque: as outras ficam apagadas.</p>
        <div class="subtabs" style="margin:10px 0;flex-wrap:wrap"><button class="${f === 0 ? 'on' : ''}" data-act="cena" data-kind="plano26" data-a="foco" data-n="0">Tudo</button>${parts.map((t, i) => `<button class="${f === i + 1 ? 'on' : ''}" data-act="cena" data-kind="plano26" data-a="foco" data-n="${i + 1}">${i + 1} · ${esc(t)}</button>`).join('')}</div>
        <p class="small">O próximo passo do roteiro é a <b>Jornada 2026</b> (o almanaque com a DeLorean), que entra direto, sem transição.</p>`;
      out.secondary = [cenaBtn(f === 5 ? '↺ Mostrar tudo' : `Destacar a próxima parte → ${esc(parts[f])}`, k, 'prox', { cls: 'ghost' })];
      out.more = note;
    } else if (k === 'capasucesso') {
      out.body = `<div class="theme">${esc(cfg.titulo.replace(/\*/g, ''))}</div><div class="speaker">com ${esc(hostNames('sucesso') || 'quem conduz o Sucesso')}</div><p class="lead">${esc(cfg.sub)}</p>
        <p class="small">É a capa do bloco: o nome e quem conduz, com a transição do filme na entrada. O próximo passo do roteiro é a primeira dinâmica do Sucesso (que entra direto).${team() ? '' : ` Quem conduz: ${cfgLink('anfitrioes', 'Preparar → Agenda e cenas → Quem conduz cada bloco')}.`}</p>${note}`;
    } else if (k === 'almanaque') {
      const m = st.mes, its = m >= 0 ? cfg.itens.filter(x => x.m === m) : [], dl = its.filter(x => x.k === 'E').length, off = new Set(st.off || []);
      out.body = `<div class="phase">${st.pagina ? 'No telão: o ano em uma página' : m >= 0 ? `No telão: ${C.months[m]} · ${dl} ${dl === 1 ? 'entregue' : 'entregues'} de ${its.length} ${its.length === 1 ? 'item' : 'itens'}${st.tocando ? ' · voltando no tempo' : ''}` : 'No telão: a capa da Jornada 2026, com a DeLorean pronta para dar ré'}</div>
        <p class="small">A viagem é de trás para a frente: começa em <b>dezembro</b> e a DeLorean vai de ré, mês a mês, até <b>janeiro</b>. ${C.stats.entregues} entregas · ${esc(C.stats.beneficiosTxt)} em benefícios · com ${esc(hostNames(k) || cfg.quem)}</p>
        <div class="subtabs" style="margin:10px 0">${C.months.map((n, i) => `<button class="${m === i && !st.pagina ? 'on' : ''}" data-act="cena" data-kind="almanaque" data-a="mes" data-mes="${i}" title="${cfg.itens.filter(x => x.m === i).length} itens">${n}</button>`).join('')}</div>
        ${m >= 0 && !st.pagina ? det('almItens', `O que aparece em ${C.months[m]} (${its.length})`, `<ul class="small" style="margin:6px 0 0 18px">${its.map(x => `<li><b>${esc(C.tipos[x.k])}${x.bu ? ' · ' + esc(C.bus[x.bu]) : ''}</b> · ${esc(x.t)}</li>`).join('')}</ul>`) : ''}`;
      out.primary = st.pagina ? cenaBtn('← Voltar ao almanaque', k, 'pagina', { cls: 'big' }) : st.tocando ? cenaBtn('⏸ Pausar a viagem', k, 'tocar', { cls: 'big' }) : cenaBtn(m === 0 ? '★ Mostrar o ano em uma página' : m > 0 ? '◀◀ Continuar voltando no tempo' : '◀◀ Voltar no tempo: de dezembro a janeiro (um mês a cada 3 s)', k, m === 0 ? 'pagina' : 'tocar', { cls: 'big', data: m === 0 ? { on: 1 } : {} });
      out.secondary = st.pagina ? [] : [cenaBtn(m < 0 ? '◀ Começar em dezembro' : '◀ Mês anterior (de ré)', k, 'prox', { cls: 'ghost', disabled: m === 0 }), cenaBtn('Mês seguinte ▶', k, 'ant', { cls: 'ghost', disabled: m < 0 || m >= 11 }), cenaBtn('★ O ano em uma página', k, 'pagina', { cls: 'ghost', data: { on: 1 } })];
      out.busy = st.tocando ? 'A viagem pelo ano ainda está passando no telão. Avançar mesmo assim?' : '';
      out.more = `<div class="actions" style="align-items:center"><span class="small">Mostrar nos cartões:</span>${[...Object.keys(C.bus).map(u => [u, C.bus[u]]), ['E', 'Entregue'], ['M', 'Marco'], ['C', 'Contexto']].map(([key, l]) => `<button class="btn xs ${off.has(key) ? 'ghost' : ''}" data-act="cena" data-kind="almanaque" data-a="filtro" data-key="${key}">${off.has(key) ? '○' : '●'} ${esc(l)}</button>`).join('')}</div>
        ${note}`;
    } else if (k === 'ia') {
      out.body = `<div class="theme">${esc(cfg.titulo.replace(/\*/g, ''))}</div><div class="speaker">com ${esc(cfg.quem)}</div><p class="lead">${esc(cfg.texto)}</p>
        ${cfg.nota ? `<div class="sb-warn">📝 Para quem apresenta (não aparece no telão): ${esc(cfg.nota)}</div>` : ''}<p class="small" style="margin-top:8px">O telão mostra o QR do app. A parte interativa da Frente 2 é o próximo passo: a Reflexão.</p>${note}`;
    } else if (k === 'reconhecimento') {
      const P = cfg.premios, done = new Set(st.feitos), p = st.premio !== null ? P[st.premio] : null, w = p ? p.indicados[p.vencedor - 1] : null, next = P.findIndex((x, i) => !done.has(i));
      const list = `<div class="tblwrap"><table class="tbl">${P.map((x, i) => `<tr><td>${done.has(i) ? '🏆' : '✉️'} <b>${esc(x.n)}</b><div class="small">${esc(x.k)}</div></td><td class="small">${done.has(i) ? `revelado: <b>${esc(x.indicados[x.vencedor - 1].nome)}</b>` : `lacrado · vencedor definido: ${esc(x.indicados[x.vencedor - 1].nome)}`}</td><td class="r">${cenaBtn(done.has(i) ? 'Refazer a cerimônia' : 'Abrir a cerimônia', k, 'abrir', { cls: 'ghost xs', data: { premio: i } })}</td></tr>`).join('')}</table></div>`;
      const back = cenaBtn('← Todos os prêmios', k, 'fase', { cls: 'ghost', data: { fase: 'premios' } });
      const mode = cfg.carga || 'mic', byMic = mode !== 'toques', how = mode === 'mic' ? 'os aplausos da sala (microfone deste painel) carregam' : mode === 'ambos' ? 'os aplausos (microfone deste painel) e os toques nos celulares carregam' : 'cada toque nos celulares soma energia';
      if (st.fase === 'intro') { out.body = `<div class="phase">No telão: a abertura</div><p class="lead">${esc(cfg.abertura.join(' ').replace(/\*/g, ''))}</p><p class="small">${esc(cfg.aberturaSub)}${hostNames(k) ? ` · com ${esc(hostNames(k))}` : ''}</p>`; out.primary = cenaBtn('▶ Tributo', k, 'fase', { cls: 'big', data: { fase: 'tributo' } }); out.secondary = [cenaBtn('Pular para os prêmios ⚡', k, 'fase', { cls: 'ghost', data: { fase: 'premios' } })]; }
      else if (st.fase === 'tributo') {
        out.body = `<div class="phase">No telão: o tributo</div><p class="lead">${esc(cfg.tributo.replace(/\*/g, ''))}</p><p class="small">Fala: ${esc(cfg.fala)}</p>
          <p class="small" style="margin-top:6px">${cfg.video ? `Vídeo-tributo configurado · ${st.video ? 'tocando no telão' : 'pausado'}.` : `Sem vídeo configurado: arraste o arquivo do vídeo para a tela do telão, ou cole o endereço dele em ${cfgLink('reconhecimento', 'Agenda e cenas → Reconhecimento')}. Sem vídeo, este espaço fica para a fala da liderança.`}</p>`;
        out.primary = cenaBtn('Abrir os Prêmios Torre do Relógio ⚡', k, 'fase', { cls: 'big', data: { fase: 'premios' } });
        out.secondary = [cfg.video ? cenaBtn(st.video ? '⏸ Pausar o vídeo' : '▶ Tocar o vídeo', k, 'video', { cls: 'ghost', data: { on: st.video ? '' : 1 } }) : '', cenaBtn('← Abertura', k, 'fase', { cls: 'ghost', data: { fase: 'intro' } })];
      } else if (st.fase === 'premios') {
        out.body = `<div class="phase">No telão: os ${P.length} envelopes · ${done.size} de ${P.length} revelados</div>${list}`;
        out.primary = next >= 0 ? cenaBtn(`Abrir a cerimônia: ${esc(P[next].n)} →`, k, 'abrir', { cls: 'big', data: { premio: next } }) : cenaBtn('Grande final · Hall da Fama ★', k, 'fase', { cls: 'big', data: { fase: 'hall' } });
        out.secondary = [next >= 0 && done.size ? cenaBtn('Hall da Fama ★', k, 'fase', { cls: 'ghost', data: { fase: 'hall' } }) : '', cenaBtn('← Tributo', k, 'fase', { cls: 'ghost', data: { fase: 'tributo' } })];
      } else if (st.fase === 'hall') {
        out.body = `<div class="phase">No telão: o Hall da Fama 2026</div>${list}`; out.secondary = [back];
      } else if (p) {
        const pct = Math.round((st.carga || 0) * 100);
        out.body = `<div class="phase">Cerimônia · ${esc(p.n)} (${esc(p.k)}) · no telão: ${REC_PASSO[st.passo]}</div>
          <p class="small">Indicados: ${esc(p.indicados.map(x => x.nome).join(' · '))}</p><p class="small">Vencedor definido: <b>${esc(w.nome)}</b> (${esc(w.projeto)}) · “${esc(p.citacao)}”</p>
          ${st.passo === 'carga' ? `<p style="margin-top:10px">Flux Capacitor: <b id="recPct">${pct}%</b> · ${how}; com 100% o raio cai sozinho.</p><div class="bar"><i id="recBar" style="width:${pct}%"></i></div>` : ''}
          ${byMic && !Mic.on && !Mic.starting && st.passo === 'carga' ? '<div class="sb-warn" style="margin-top:8px">🎤 O microfone está desligado: sem ele os aplausos não carregam o Flux Capacitor. Clique em "Liberar o microfone" logo abaixo (ou use "+15% de carga").</div>' : ''}`;
        if (st.passo === 'categoria') out.primary = cenaBtn('Conhecer os indicados →', k, 'indicados', { cls: 'big' });
        else if (st.passo === 'indicados') { out.primary = cenaBtn(byMic && !Mic.on ? '🎤 Liberar o microfone e carregar o Flux Capacitor' : `⚡ Carregar o Flux Capacitor (${mode === 'mic' ? 'aplausos' : mode === 'ambos' ? 'aplausos e celulares' : 'celulares'})`, k, 'carregar', { cls: 'big' }); out.secondary = [cenaBtn('Raio agora ⚡ (sem a carga)', k, 'raio', { cls: 'ghost' })]; }
        else if (st.passo === 'carga') { out.primary = cenaBtn('⚡ +15% de carga', k, 'carga', { cls: 'big', data: { v: .15 } }); out.secondary = [cenaBtn('Raio agora ⚡', k, 'raio', { cls: 'ghost' })]; }
        else if (st.passo === 'sorteio') { out.secondary = [cenaBtn('Revelar já', k, 'vencedor', { cls: 'ghost' })]; out.busy = 'O sorteio está acontecendo no telão. Avançar mesmo assim?'; out.primary = '<span class="phase">🥁 O holofote está girando…</span>'; }
        else { out.primary = cenaBtn(next >= 0 ? 'Voltar aos prêmios →' : 'Grande final · Hall da Fama ★', k, 'fase', { cls: 'big', data: { fase: next >= 0 ? 'premios' : 'hall' } }); out.secondary = [cenaBtn('Bis ✦ (refazer esta cerimônia)', k, 'abrir', { cls: 'ghost', data: { premio: st.premio } })]; }
        if (st.passo !== 'vencedor') out.secondary = [...(out.secondary || []), back];
        if (st.passo !== 'vencedor' && st.passo !== 'sorteio') out.busy = 'A cerimônia deste prêmio ainda não terminou. Avançar mesmo assim?';
      }
      out.body = (out.body || '') + micBox();
      if (cfg.exemplo) out.warn = `⚠ Os indicados e os vencedores ainda são os <b>nomes de exemplo</b> do deck (o telão avisa isso na tela dos prêmios). Troque em ${cfgLink('reconhecimento', 'Preparar → Agenda e cenas → Reconhecimento')}.`;
      out.more = note;
    } else if (k === 'intervalo') {
      const ph = ivPhase();
      out.body = `<div class="phase">${st.alerta ? '🚨 Alerta de volta no telão e nos celulares' : { idle: 'Cronômetro parado', run: 'Intervalo em andamento', paused: 'Cronômetro pausado', done: 'O intervalo terminou' }[ph]}</div>
        <div class="clock ${ph === 'paused' ? 'paused' : ''}"><b data-timer="iv">${fmt(ivLeft())}</b><span>intervalo</span></div><p class="small">${esc(cfg.texto)}</p>
        <p class="small" style="margin-top:8px">🚨 Quando o cronômetro zera, o telão (tela cheia, com sirene) e os celulares (um cartão por cima do app, com toque e vibração) mostram o <b>alerta de volta</b>: “${esc(cfg.alertaTexto)}”. Ele sai quando você silencia ou avança no roteiro. Nos celulares ele aparece para quem está com o app aberto na tela.</p>`;
      out.primary = st.alerta ? cenaBtn('🔕 Silenciar o alerta', k, 'silenciar', { cls: 'big' }) : ph === 'idle' ? cenaBtn(`▶ Iniciar intervalo (${cfg.min} min)`, k, 'start', { cls: 'big' }) : ph === 'run' ? cenaBtn('⏸ Pausar', k, 'pause', { cls: 'big' }) : ph === 'paused' ? cenaBtn('▶ Retomar', k, 'resume', { cls: 'big' }) : null;
      out.secondary = [cenaBtn('+1 min', k, 'add', { cls: 'ghost', data: { seconds: 60 } }), cenaBtn('−1 min', k, 'add', { cls: 'ghost', data: { seconds: -60 } }), cenaBtn('↺ Zerar', k, 'reset', { cls: 'ghost' }), cenaBtn(st.alerta ? '🚨 Tocar o alerta de novo' : '🚨 Chamar todo mundo de volta agora', k, 'alerta', { cls: 'ghost' })];
      out.more = `<div class="actions" style="align-items:center"><span class="small">Começar com:</span>${[5, 10, 15, 20].map(n => cenaBtn(`${n} min`, k, 'start', { cls: 'ghost xs', data: { min: n } })).join('')}</div><p class="small" style="margin-top:8px">O cronômetro continua contando se você mostrar outro passo. A música entra sozinha neste passo${O.settings.spotifyBreak ? ' (o seu Spotify, como escolhido em Ajustes → Spotify)' : ''}; para não entrar, desligue em Ajustes → "Desligar o som ao exibir um bloco de fala". Para trocar a música do app pelo seu Spotify aqui, veja <a href="#" data-go="config">Ajustes → Spotify</a>.</p>${note}`;
      out.busy = ph === 'run' ? 'O intervalo ainda não terminou. Avançar mesmo assim?' : '';
    } else if (k === 'visao') { // primeiro a capa do bloco; depois, a estratégia em tela cheia
      out.body = `<div class="theme">${esc(cfg.titulo)}</div><div class="speaker">com ${esc(hostNames(k) || cfg.quem)}</div>
        <div class="phase" style="margin-top:12px">${st.aberta ? 'No telão: a Estratégia CDIO LATAM 2027, em tela cheia' : 'No telão: a capa do bloco (o nome e quem conduz)'}</div>
        <p class="lead">${st.aberta ? 'A estratégia (o arquivo original, sem alterações) ocupa a <b>tela inteira</b> do telão, sem moldura. Ela é interativa: os filtros e os pilares são clicados <b>direto na tela do telão</b>.' : 'O bloco começa pela capa. Quando a Claudia e o Fermín estiverem prontos, abra a estratégia: ela ocupa a tela inteira do telão.'}</p>
        <div class="actions"><a class="btn ghost sm" href="/estrategia-2027.html" target="_blank">Abrir a estratégia em outra aba ↗</a><span class="small">${O.settings.confidencial !== false ? '🔒 No modo confidencial, este endereço só abre no navegador logado com a senha mestra.' : ''}</span></div>
        <label class="sw" style="margin-top:10px"><input type="checkbox" data-act="cena" data-kind="visao" data-a="intro" ${st.intro ? 'checked' : ''}> Começar pela abertura em vídeo da página (senão, vai direto para o mapa da estratégia, como no deck)</label>${note}`;
      out.primary = st.aberta ? null : cenaBtn('🔭 Abrir a estratégia em tela cheia', k, 'abrir', { cls: 'big', data: { on: 1 } });
      out.secondary = st.aberta ? [cenaBtn('← Voltar para a capa do bloco', k, 'abrir', { cls: 'ghost', data: { on: '' } })] : [];
    } else if (k === 'manifesto') {
      out.body = `<div class="theme">${esc(cfg.titulo)} ${esc(cfg.pergunta)}</div><div class="speaker">com ${esc(cfg.quem)}</div><p class="small">O telão mostra o calendário de ${esc(cfg.dia)} ${esc(cfg.mes)} ${esc(cfg.ano)}, a pergunta e o QR do app. O manifesto coletivo acontece nos próximos passos: as dinâmicas do Sucesso e a mensagem do Doc.</p>${note}`;
    } else if (k === 'mph') {
      out.body = `<div class="phase">${st.at ? 'Chegamos: "' + esc(cfg.chegada) + '"' : 'No telão: o velocímetro em 0 MPH'}</div><p class="lead">${esc(st.at ? cfg.depois : cfg.antes)}</p><p class="small">${esc(cfg.quem)}</p>`;
      out.primary = st.at ? null : cenaBtn('🏎️ Acelerar até 2027 (88 MPH)', k, 'go', { cls: 'big' });
      out.secondary = st.at ? [cenaBtn('↺ Voltar a 0 MPH', k, 'reset', { cls: 'ghost' })] : [];
      out.more = note;
    }
    return out;
  }

  function pConnections() {
    const O = A.O, s = O.state, c = s.conn, ph = c.phase, t = c.timer, S = O.settings;
    const late = O.people.filter(p => p.late), inProgress = ['matching', 'talk', 'roundEnd', 'ranking'].includes(ph);
    const ranked = O.people.filter(p => p.ranked).length, rankTotal = O.people.filter(p => p.inRounds && p.active && p.checkedInAt).length;
    const notRanked = O.people.filter(p => p.active && p.checkedInAt && p.inRounds && !p.ranked);
    const regenFrom = ph === 'matching' ? c.round : c.round + 1, round = O.rounds[A.round - 1];
    const levelTxt = { strict: 'área ≠ e WL ≠ em todas as duplas', wl: 'precisou liberar WL igual em algumas duplas', area: 'precisou liberar área igual em algumas duplas', all: 'sem restrição em algumas duplas' };
    const clock = t ? `<div class="clock ${t.paused ? 'paused' : ''}"><b data-timer="conn">${fmt(timerLeft(t))}</b><span>${TIMER_LABEL[t.kind] || t.kind}${t.paused ? ' · pausado' : ''}</span></div>` : '';
    const timerBtns = t ? [t.paused ? btn('▶ Retomar', 'resume', { cls: 'cyan' }) : btn('⏸ Pausar', 'pause', { cls: 'ghost' }), btn('+30 s', 'addTime', { cls: 'ghost' }), btn('⏭ Pular etapa', 'skip', { cls: 'ghost' })] : [];
    let body, primary = null, secondary = [];
    if (ph === 'idle' || ph === 'ready') {
      body = `<p class="lead">${O.counts.checkedIn} pessoas a bordo. O app sorteia as duplas (área e WL diferentes) e conduz as 3 viagens${S.autoFlow ? ' sozinho' : ''}: ${fmt(S.findSeconds)} para a dupla se encontrar, ${fmt(S.roundSeconds)} de conversa e, no fim, a avaliação.</p>`;
      body += skipLine('connections');
      primary = btn('▶ Iniciar viagens', 'startJourney', { cls: 'big', disabled: O.counts.checkedIn < 2 });
    } else if (ph === 'ranking') {
      body = `<div class="phase">Avaliação aberta nos celulares</div>${clock}<p>${ranked} de ${rankTotal} avaliaram</p><div class="bar"><i style="width:${Math.round(100 * ranked / Math.max(1, rankTotal))}%"></i></div>
        ${notRanked.length ? det('notranked', `Quem falta avaliar (${notRanked.length})`, `<p class="small" style="margin-top:6px">${esc(notRanked.map(p => p.name).join(' · '))}</p>`) : '<p class="ok">✔ Todos avaliaram</p>'}`;
      primary = btn('🔮 Calcular conexões agora', 'computeResults', { cls: 'big' }); secondary = timerBtns.slice(0, 2);
    } else if (ph === 'results') {
      const mutual = Math.floor(O.results.filter(r => r.mutual).length / 2);
      body = `<div class="phase">Conexões enviadas para os celulares</div><p class="lead">${O.results.length} pessoas receberam a conexão sugerida · ${mutual} ${mutual === 1 ? 'conexão mútua' : 'conexões mútuas'}.</p>`;
      secondary = [btn('🔮 Recalcular e reenviar', 'computeResults', { cls: 'ghost' })];
    } else {
      body = `<div class="phase">Viagem ${c.round} de 3 · ${PHASE_LABEL[ph]}</div>${clock}${S.autoFlow ? '<p class="small">Avança sozinho quando o tempo acaba.</p>' : ''}`;
      secondary = timerBtns;
      if (!S.autoFlow) primary = ph === 'matching' ? btn('▶ Iniciar conversa', 'startTalk', { cls: 'big' }) : ph === 'talk' ? btn('⏹ Encerrar conversa', 'endTalk', { cls: 'big' }) : c.round < 3 ? btn(`👥 Revelar viagem ${c.round + 1}`, 'reveal', { cls: 'big', data: { round: c.round + 1 } }) : btn('📋 Abrir avaliação', 'openRanking', { cls: 'big' });
    }
    const warn = [c.repeats ? '⚠ Com menos de 6 pessoas algumas duplas se repetem (modo ensaio).' : '',
      late.length ? `⚠ ${late.length} pessoa(s) entraram depois do sorteio e estão sem dupla: ${esc(late.map(p => p.name).join(', '))}. ${regenFrom <= 3 && inProgress && ph !== 'ranking' ? btn(`↻ Incluir ${ph === 'matching' ? `a partir da viagem ${regenFrom}` : `nas viagens ${regenFrom}–3`}`, 'regenRest', { cls: 'ghost xs' }) : ''}` : ''].filter(Boolean).join('<br>');
    const pairs = c.generatedAt ? det('pairs', 'Ver as duplas de cada viagem', `<div class="subtabs" style="margin-top:8px">${O.rounds.map(r => `<button class="${A.round === r.round ? 'on' : ''}" data-roundtab="${r.round}">Viagem ${r.round} · ${esc(r.era.year)} ${r.round === c.round ? '●' : ''}</button>`).join('')}</div>
        ${round && round.groups.length ? `<div class="small" style="margin-bottom:6px">${round.groups.length} grupos · ${round.check.ok}/${round.check.total} pares com área ≠ e WL ≠ · ${esc(levelTxt[round.level] || round.level || '')}</div>
          ${round.groups.map(g => `<div class="grp"><span class="code">${esc(g.code)}</span>${g.members.map((m, n) => `${n ? '<span class="x">⇄</span>' : ''}<span class="m">${av(m)}<b>${esc(m.name)}</b><span class="meta">(${esc(m.area)} · ${esc(m.wl)})</span></span>`).join('')}<span class="${g.flags.area && g.flags.wl ? 'ok' : 'warn'}" style="margin-left:auto">${g.flags.area ? '✔ área' : '! área'} ${g.flags.wl ? '✔ WL' : '! WL'}</span>${round.round === c.round && ph === 'talk' && g.currentQuestion ? `<div class="q">${g.position + 1}ª pergunta: ${esc(g.currentQuestion)}</div>` : ''}</div>`).join('')}` : '<p class="muted">Rodada ainda não gerada.</p>'}`) : '';
    const results = O.results.length ? det('results', `Ver as conexões calculadas (${O.results.length})`, `<div class="tblwrap" style="margin-top:8px"><table class="tbl"><tr><th>Viajante</th><th>Conexão sugerida</th><th>Pts</th><th>Mútua</th></tr>
        ${O.results.slice().sort((a, b) => (b.mutual - a.mutual) || (b.score - a.score)).map(r => `<tr><td>${av(r.person)}${esc(r.person.name)}</td><td>${r.match ? av(r.match) + esc(r.match.name) : '<span class="x">—</span>'}</td><td class="mono">${r.score}</td><td>${r.mutual ? '<span class="ok">⚡ sim</span>' : '<span class="x">não</span>'}</td></tr>`).join('')}</table></div>`) : '';
    const more = `<div class="actions">
        ${!(c.played >= 1) ? btn(c.generatedAt ? '⚡ Sortear as duplas de novo' : '⚡ Sortear as duplas agora (sem começar)', 'generate', { cls: 'ghost sm', disabled: O.counts.checkedIn < 2 }) : ''}
        ${S.autoFlow && inProgress ? `${btn('▶ Iniciar conversa', 'startTalk', { cls: 'ghost sm', disabled: ph !== 'matching' })}${btn('⏹ Encerrar conversa', 'endTalk', { cls: 'ghost sm', disabled: ph !== 'talk' })}${btn('📋 Abrir avaliação', 'openRanking', { cls: 'ghost sm', disabled: !(c.played >= 1 && ph !== 'ranking') })}` : ''}
        ${btn('Zerar as Conexões', 'resetConnections', { cls: 'red sm' })}
      </div>${pairs}${results}<p class="small" style="margin-top:8px">Tempos e modo manual em <a href="#" data-go="config">Ajustes</a>.</p>`;
    return { body, primary, secondary, warn, more, busy: inProgress ? 'As viagens ainda não terminaram. Elas ficam em pausa até você voltar para este passo. Avançar mesmo assim?' : '',
      onair: 'Celulares: dupla, perguntas e avaliação · Telão: cronômetro' };
  }
  function pSucesso(step) {
    const O = A.O, k = step.activity, a = sucAct(k), pres = O.state.presentation, room = O.sucesso && O.sucesso.roomId, tl = O.telao || { count: 0 };
    const onScreen = !!(pres && pres.activityId === k && pres.roomId === room), ph = sucEff(a), n = a.responseCount || 0, draw = onScreen ? pres.draw : null;
    const drawnBefore = ((O.state.drawn || {})[`${room}:${k}:${a.roundId}`] || []).length > 0;
    if (!O.sucesso) return { title: `Dinâmica ${k.slice(1)} · ${SUC_NAME[k]}`, body: '<p class="lead">As dinâmicas do Sucesso estão carregando…</p>' };
    const stats = `<div class="suc-stats"><div class="tcx"><b>${String(n).padStart(3, '0')}</b><span>RESPOSTAS</span></div>${k !== 'd1' && ph && ph !== 'done' ? `<div class="tcx ${ph === 'run' && sucLeft(a) <= 30 ? 'alert' : ''}" style="--c:var(--yellow)"><b data-timer="suc" data-k="${k}">${fmt(sucLeft(a))}</b><span>RECEBIMENTO</span></div>` : ''}<span class="suc-ph" data-phase="${ph || ''}">${ph ? SUC_PHASE[ph] : ''}</span></div>`;
    const shown = onScreen && !!pres.revealed;
    let body = `<p class="question">${esc(a.question || '')}</p>${stats}${onScreen && ph && n ? `<p class="small reveal ${shown ? 'on' : ''}">${shown ? '✨ Respostas reveladas no telão (nuvem de palavras).' : '🙈 O telão mostra só o carro carregando. As respostas ficam guardadas até você revelar.'}</p>` : ''}`, primary = null, secondary = [], busy = '';
    const cmd = (label, c, cls) => btn(label, 'sucCmd', { cls, data: { k, cmd: c } }), dr = (label, c, cls) => btn(label, 'sucDraw', { cls, data: { cmd: c } });
    if (!onScreen) { body += '<p class="warn">Esta dinâmica não está na tela agora.</p>'; primary = btn('📺 Exibir no telão e nos celulares', 'goStep', { cls: 'big', data: { id: step.id } }); }
    else if (ph === 'idle') primary = cmd(`▶ Iniciar recebimento${k === 'd1' ? '' : ' (2 min)'}`, 'start', 'big');
    else if (ph === 'run') { primary = cmd('⏭ Encerrar recebimento', 'end', 'big'); secondary = [cmd('❚❚ Pausar', 'pause', 'ghost')]; busy = 'O recebimento ainda está aberto. Avançar mesmo assim?'; }
    else if (ph === 'paused') { primary = cmd('▶ Retomar recebimento', 'start', 'big'); secondary = [cmd('⏭ Encerrar', 'end', 'ghost')]; }
    else if (ph === 'done') {
      const hide = shown ? [dr('🙈 Esconder respostas', 'hide', 'ghost')] : [];
      if (draw) {
        const left = talkLeft(draw.talk), running = !!draw.talk.endsAt && left > 0;
        body += `<div class="suc-draw on"><div class="small">🎲 VIAJANTE SORTEADO${draw.personId ? ' · avisado no celular' : ''}</div><div class="who">${esc(draw.name)}</div><div class="what">“${esc(draw.answer)}”</div>
          <div class="tcx ${running && left <= 30 ? 'alert' : ''}" style="--c:var(--orange);align-self:flex-start"><b data-timer="talk">${fmt(left)}</b><span>TEMPO DE FALA</span></div></div>`;
        primary = running ? dr('❚❚ Pausar tempo de fala', 'talkPause', 'big') : dr('▶ Iniciar tempo de fala', 'talkStart', 'big');
        secondary = [dr('↺ Zerar tempo', 'talkReset', 'ghost'), dr('🎲 Sortear outro', 'draw', 'ghost'), dr('Fechar o sorteio', 'close', 'ghost')];
      } else if (n && !shown) { // primeiro a revelação; o sorteio fica à mão para quem preferir sortear antes
        primary = dr('✨ Revelar respostas no telão', 'reveal', 'big');
        if (TALK[k]) secondary = [dr(drawnBefore ? '🎲 Sortear outro' : '🎲 Sortear viajante', 'draw', 'ghost')];
      } else if (n && TALK[k] && !drawnBefore) { primary = dr('🎲 Sortear viajante', 'draw', 'big'); secondary = hide; }
      else if (n) secondary = [...(TALK[k] ? [dr('🎲 Sortear outro', 'draw', 'ghost')] : []), ...hide];
    }
    const warn = !onScreen ? '' : !tl.count ? '⚠ Nenhum telão aberto. <a href="/telao.html" target="_blank">Abrir telão ↗</a>' : !tl.auth ? '⚠ O telão está aberto sem login e não vai mostrar as respostas, a nuvem nem o sorteio. Abra-o neste navegador: <a href="/telao.html" target="_blank">abrir telão ↗</a>' : '';
    const more = `<div class="actions">${btn(`Ver e baixar as respostas (${n})`, 'sucAnswers', { cls: 'ghost sm', data: { k } })}${btn('↺ Reabrir o recebimento', 'sucCmd', { cls: 'ghost sm', data: { k, cmd: 'reset' }, disabled: !(ph === 'done' || ph === 'paused') })}${btn('🗑 Apagar as respostas', 'sucCmd', { cls: 'red sm', data: { k, cmd: 'clear' } })}</div>
      ${skipLine('sucesso')}
      <p class="small" style="margin-top:8px"><a href="/painel?sala=${encodeURIComponent(room || '')}&d=${k}" target="_blank">Abrir o painel 3D original ↗</a></p>`;
    return { title: `Dinâmica ${k.slice(1)} · ${a.title || SUC_NAME[k]}`, body, primary, secondary, more, warn, busy, onair: 'Celulares: pergunta e resposta · Telão: carro carregando; a nuvem só quando você revelar' };
  }
  // Reflexão: uma parada por vez. Abrir parada → iniciar votação → encerrar → revelar os 2 mais votados → próxima parada.
  /* ---------- Visão 2027 · o Doc ---------- */
  const docTotal = () => ['d1', 'd2', 'd3', 'd4'].reduce((n, k) => n + (sucAct(k).responseCount || 0), 0);
  const DOC_SRC = { ia: '🤖 escrita pela IA (Claude)', auto: '⚙ montada com as palavras mais citadas', editado: '✎ editada por você', 'editado-ia': '🤖 escrita pela IA e ✎ editada por você' };
  function docPreview(m) {
    return `<div class="doc-msg">
      <div class="doc-src">${esc(DOC_SRC[m.fonte] || '')}${m.aviso ? ` · <span class="warn">${esc(m.aviso)}</span>` : ''}</div>
      <h3>${esc(m.titulo)}</h3>
      <p><b>Abertura.</b> ${esc(m.abertura)}</p>
      ${m.blocos.map(b => `<p style="--c:${SUC_COLOR[b.id]}"><b class="doc-act">${b.id.slice(1).padStart(2, '0')} · ${esc(b.titulo)}</b> ${esc(b.fala)}${b.palavras && b.palavras.length ? `<span class="doc-words">${b.palavras.map(w => `<i>${esc(w)}</i>`).join('')}</span>` : ''}</p>`).join('')}
      <div class="doc-paper"><b>GAZETA DO FUTURO · 2027</b>${m.manchetes.map(h => `<span>${esc(h)}</span>`).join('')}</div>
      <p><b>Encerramento.</b> ${esc(m.encerramento)}</p>
    </div>`;
  }
  function pDoc() {
    const O = A.O, d = O.state.doc || {}, m = d.message, info = O.doc || { ai: false, parts: [] }, tl = O.telao || { count: 0 }, tp = tl.doc;
    const n = docTotal(), play = d.play, here = tp && play && tp.seq === play.seq ? tp : null, cur = play ? (here ? here.part : play.part) : -1, done = !!(here && here.done);
    const counts = ['d1', 'd2', 'd3', 'd4'].map(k => `<span class="doc-count" style="--c:${SUC_COLOR[k]}"><b>${String(sucAct(k).responseCount || 0).padStart(2, '0')}</b> ${SUC_NAME[k]}</span>`).join('');
    let body = `<p class="lead">O Doc chega de 2027, lê tudo o que foi escrito nas quatro dinâmicas e conta o que "viu" no futuro: uma fala por dinâmica, o jornal de 2027 e o encerramento.</p>
      <div class="doc-counts">${counts}</div>
      <p class="small">${info.ai ? '🤖 A IA (Claude) escreve o texto a partir das respostas, sem os nomes de quem respondeu. Você revisa antes de ir para o telão.' : '⚙ Sem IA configurada: o texto é montado com as palavras mais citadas. Para a IA escrever, defina <span class="mono">ANTHROPIC_API_KEY</span> no Render.'}</p>`;
    if (d.status === 'generating') body += '<div class="phase">🧪 O Doc está lendo as respostas e escrevendo a mensagem… (até 1 minuto)</div>';
    if (d.error) body += `<p class="warn">⚠ ${esc(d.error)}</p>`;
    if (m && play) body += `<div class="doc-parts">${info.parts.map((x, i) => `<button class="btn xs ${i === cur ? '' : 'ghost'} ${i < cur ? 'past' : ''}" data-act="docCmd" data-cmd="goto" data-part="${i}" title="Pular para esta parte">${i === cur ? (play.paused ? '❚❚ ' : here && here.speaking ? '🔊 ' : '▶ ') : ''}${esc(x.label)}</button>`).join('')}</div>
      <p class="small">${play.paused ? '❚❚ Cena pausada.' : done ? '✔ A cena terminou no telão.' : here ? `No telão agora: <b>${esc((info.parts[cur] || {}).label || '')}</b>${here.speaking ? ' · o Doc está falando' : ''}.` : tl.count ? 'Aguardando o telão…' : '⚠ Nenhum telão aberto.'} ${tp && tp.voice ? `Voz: ${esc(tp.voice)}.` : tl.count && O.settings.docVoice !== false ? 'O telão ainda não tem voz em português liberada: o texto aparece na tela, sem som.' : ''}</p>`;
    if (m) body += play ? det('docmsg', 'Ver o texto do Doc', docPreview(m)) : docPreview(m); // durante a cena, os controles ficam à mão
    let primary = null, secondary = [], busy = '';
    const cmd = (label, c, cls, extra = {}) => btn(label, 'docCmd', { cls, data: { cmd: c, ...extra } });
    if (!m) primary = btn(d.status === 'generating' ? '🧪 Escrevendo…' : '✨ Gerar a mensagem do Doc', 'docGen', { cls: 'big', disabled: d.status === 'generating' });
    else if (!play) { primary = cmd('🎬 Começar a cena no telão', 'start', 'big'); secondary = [btn('✎ Editar o texto', 'docEdit', { cls: 'ghost' }), btn('↻ Gerar de novo', 'docGen', { cls: 'ghost', disabled: d.status === 'generating' })]; }
    else if (play.paused) { primary = cmd('▶ Retomar a cena', 'resume', 'big'); secondary = [cmd('⏹ Parar a cena', 'stop', 'ghost')]; busy = 'A cena do Doc está pausada no telão. Avançar mesmo assim?'; }
    else if (!done) { primary = cmd('❚❚ Pausar', 'pause', 'big'); secondary = [cmd('⏭ Próxima parte', 'next', 'ghost'), cmd('⏮ Parte anterior', 'prev', 'ghost'), cmd('↺ Recomeçar', 'start', 'ghost')]; busy = 'A cena do Doc ainda está no telão. Avançar mesmo assim?'; }
    else if (!d.phones) { primary = btn('📱 Enviar a mensagem para os celulares', 'docPhones', { cls: 'big', data: { on: '1' } }); secondary = [cmd('↺ Repetir a cena', 'start', 'ghost')]; }
    else secondary = [cmd('↺ Repetir a cena', 'start', 'ghost')];
    if (m && play && !(done && !d.phones)) secondary.push(d.phones ? btn('📱 Tirar dos celulares', 'docPhones', { cls: 'ghost' }) : btn('📱 Enviar aos celulares', 'docPhones', { cls: 'ghost', data: { on: '1' } }));
    const warn = !tl.count ? '⚠ Nenhum telão aberto. <a href="/telao.html" target="_blank">Abrir telão ↗</a>' : !tl.sound && O.settings.docVoice !== false ? '⚠ Clique uma vez na tela do telão para o navegador liberar o som e a voz do Doc.' : '';
    const S2 = O.settings, rates = [[.85, 'mais devagar'], [.95, 'um pouco devagar'], [1, 'normal'], [1.1, 'um pouco rápido'], [1.2, 'rápido']];
    const more = `<div class="actions">${m ? `${btn('⬇ Baixar o .txt (mensagem + todas as respostas)', 'docTxt', { cls: 'ghost sm' })}${btn('✎ Editar o texto', 'docEdit', { cls: 'ghost sm' })}${btn('↻ Gerar de novo', 'docGen', { cls: 'ghost sm', disabled: d.status === 'generating' })}` : btn('⬇ Baixar o .txt (todas as respostas)', 'docTxt', { cls: 'ghost sm' })}
        ${info.ai ? btn('⚙ Gerar sem IA (palavras mais citadas)', 'docGen', { cls: 'ghost sm', data: { ai: '0' }, disabled: d.status === 'generating' }) : ''}${m ? btn('🗑 Apagar a mensagem', 'docClear', { cls: 'red sm' }) : ''}</div>
      <div class="doc-kit"><b>🎬 Vídeo do Doc feito com IA (opcional)</b>
        <p class="small">Para fazer um curta do Doc no seu computador, com o método do tutorial de vídeo com IA (placa de vídeo com 12 GB ou mais): o kit traz o passo a passo, os prompts das imagens de referência (ficha do Doc, carro, cenários), ~8 segmentos com as falas tiradas ${m ? 'desta mensagem' : 'das respostas'} e o briefing para colar no seu agente de IA. Gerar leva tempo: faça antes do evento ou, com as respostas do dia, só se houver pelo menos 1 hora até o encerramento.</p>
        <div class="actions">${btn('🎬 Baixar o kit do vídeo do Doc (.txt)', 'docKit', { cls: 'ghost sm' })}</div></div>
      <div class="form doc-cfg">
        <label class="sw"><input type="checkbox" id="docVoice" ${S2.docVoice !== false ? 'checked' : ''}> O telão lê o texto em voz alta (voz em português do navegador do telão)</label>
        <label class="f">Voz preferida (parte do nome, opcional)<input class="input" id="docVoiceName" value="${esc(S2.docVoiceName || '')}" placeholder="ex.: Antonio · vazio = a melhor voz masculina em português"></label>
        <label class="f">Velocidade da fala<select class="input" id="docRate">${rates.map(([v, l]) => `<option value="${v}" ${Math.abs((S2.docRate || 1) - v) < .01 ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="f">Vídeo do Doc (opcional: .mp4 feito com IA, tocado na chegada)<input class="input" id="docVideoUrl" value="${esc(S2.docVideoUrl || '')}" placeholder="https://… ou /videos/doc.mp4"></label>
        <label class="sw"><input type="checkbox" id="docVideoFull" ${S2.docVideoFull ? 'checked' : ''}> O vídeo já traz a fala completa do Doc (depois dele, o telão vai direto para o jornal de 2027 e o "2027" final, sem repetir a fala)</label>
        <div class="actions">${btn('Salvar', 'docSaveCfg', { cls: 'sm' })}${btn('🔈 Testar a voz no telão', 'docTestVoice', { cls: 'ghost sm' })}</div>
        <p class="small">${tp && tp.voice ? `Voz em uso no telão: <b>${esc(tp.voice)}</b>.` : 'O telão escolhe a voz quando abre. No Windows, o Microsoft Edge tem as vozes mais naturais (ex.: "Antonio").'}</p>
      </div>`;
    return { title: 'Visão 2027 · o Doc', body, primary, secondary, more, warn, busy, color: 'var(--orange)', onair: 'Celulares: olhe para o telão · Telão: o Doc chega de 2027' };
  }
  function docEditDialog() {
    const m = A.O.state.doc && A.O.state.doc.message; if (!m) return toast('Gere a mensagem antes.', true);
    const ta = (id, label, v, rows = 3) => `<label class="f">${label}<textarea class="input" id="${id}" rows="${rows}">${esc(v)}</textarea></label>`;
    dialog(`<h3>✎ Texto do Doc</h3><p class="small">O telão lê exatamente este texto. As palavras de cada dinâmica (os destaques coloridos) vêm das respostas e não mudam.</p>
      <div class="form" style="margin-top:10px"><label class="f">Título<input class="input" id="deTitulo" value="${esc(m.titulo)}"></label>
      ${ta('deAbertura', 'Abertura', m.abertura)}
      ${m.blocos.map(b => ta('deB_' + b.id, `${b.id.slice(1).padStart(2, '0')} · ${esc(b.titulo)}`, b.fala)).join('')}
      ${ta('deManchetes', 'Manchetes do jornal de 2027 (uma por linha)', m.manchetes.join('\n'), 4)}
      ${ta('deEncerramento', 'Encerramento', m.encerramento)}</div>
      <div class="actions" style="margin-top:12px"><button class="btn" id="deSave">Salvar</button><button class="btn ghost" data-close>Cancelar</button></div>`, () => {
      $('#deSave').onclick = () => run(async () => {
        await api('POST', '/api/admin/doc', { action: 'edit', message: { titulo: $('#deTitulo').value, abertura: $('#deAbertura').value, encerramento: $('#deEncerramento').value,
          manchetes: $('#deManchetes').value.split('\n').map(x => x.trim()).filter(Boolean), blocos: m.blocos.map(b => ({ id: b.id, fala: $('#deB_' + b.id).value })) } });
        closeDialog();
      }, 'Texto salvo');
    });
  }
  async function docTxt(path = '/api/admin/doc.txt', name = 'Visao_2027_Doc.txt') {
    const r = await fetch(path, { headers: { 'x-admin-key': A.key } });
    if (!r.ok) throw new Error('Não foi possível baixar o arquivo.');
    const link = document.createElement('a'); link.href = URL.createObjectURL(await r.blob()); link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 5000);
  }
  function pReflexao(step) {
    const O = A.O, R = O.reflexao, on = rfxOnAir();
    if (!R) return { title: 'Reflexão', body: '<p class="lead">Carregando…</p>' };
    const cfg = R.config, n = cfg.themes.length, i = R.open, p = i === null ? null : R.paradas[i], COLORS = ['#22d3ee', '#ff2e88', '#ffd23f', '#ff6b1a'];
    const cmd = (label, c, cls, data = {}) => btn(label, 'rfx', { cls, data: { cmd: c, ...data } });
    const undone = k => !R.paradas[k].top.length, order = [...Array(n).keys()];
    const nextIdx = i === null ? order.find(undone) : [...order.filter(k => k > i), ...order.filter(k => k < i)].find(undone);
    const openNext = (label, cls) => (nextIdx === undefined ? null : cmd(`${label} ${pad(nextIdx + 1)} · ${esc(cfg.themes[nextIdx].t)}${label.startsWith('▶') ? '' : ' ▶'}`, 'open', cls, { idx: nextIdx }));
    const state = q => (q.top.length ? '✓ revelada' : q.phase === 'done' ? 'encerrada' : q.phase === 'run' ? 'votando' : q.phase === 'paused' ? 'pausada' : '');
    const chips = `<div class="rfx-chips">${cfg.themes.map((t, k) => { const q = R.paradas[k]; return `<button type="button" class="chip ${k === i ? 'on' : ''} ${q.top.length ? 'done' : ''}" style="--c:${COLORS[k % 4]}" data-act="rfx" data-cmd="open" data-idx="${k}" title="${esc(t.q)}" ${on ? '' : 'disabled'}><b>${pad(k + 1)}</b><span>${esc(t.t)}<small>${q.votes} ${q.votes === 1 ? 'voto' : 'votos'}${state(q) ? ' · ' + state(q) : ''}</small></span></button>`; }).join('')}</div>`;
    const more = `<div class="actions">${cmd('🤖 +5 votos de teste', 'fake', 'ghost sm', { n: 5 })}${btn('Ver os votos', 'rfxVotes', { cls: 'ghost sm' })}${btn('⬇ Exportar votos (.csv)', 'rfxCsv', { cls: 'ghost sm' })}${cmd('↺ Reiniciar a votação desta parada', 'reset', 'ghost sm')}${cmd('🗑 Limpar os votos desta parada', 'clear', 'red sm')}${cmd('🗑 Limpar tudo', 'clearAll', 'red sm')}</div>
      ${skipLine('reflexao')}
      <p class="small" style="margin-top:8px">Os votos de teste servem para ensaiar sem os celulares (os nomes saem marcados como "teste"). Paradas e projetos: <a href="#" data-go="reflexao">Preparar → Reflexão</a>.</p>`;
    const base = { title: cfg.title, more, onair: 'Celulares: escolher 1 projeto · Telão: Flux Capacitor e os 2 mais votados' };
    if (!on) return { ...base, body: `<p class="warn">A Reflexão não está na tela agora.</p>${chips}`, primary: btn('📺 Exibir no telão e nos celulares', 'goStep', { cls: 'big', data: { id: step.id } }) };
    if (!p) { // menu das paradas
      const total = R.paradas.reduce((a, q) => a + q.votes, 0);
      return { ...base, body: `<p class="lead">${esc(cfg.subtitle)}. O telão mostra as ${n} paradas, os votos de cada uma e a energia total do Flux Capacitor${total ? ` (${total} votos até agora)` : ''}.</p>${chips}`,
        primary: openNext(R.paradas.some(q => q.top.length) ? 'Próxima parada:' : '▶ Abrir a parada', 'big') };
    }
    const t = cfg.themes[i], left = rfxLeft(p), ph = p.phase;
    const stats = `<div class="suc-stats"><div class="tcx"><b>${String(p.votes).padStart(3, '0')}</b><span>VOTOS</span></div>${ph !== 'done' ? `<div class="tcx ${ph === 'run' && left <= 15 ? 'alert' : ''}" style="--c:var(--yellow)"><b data-timer="rfx">${fmt(left)}</b><span>VOTAÇÃO</span></div>` : ''}<span class="suc-ph" data-phase="${ph}">${RFX_PHASE[ph]}${p.votes ? ` · ${p.projects} ${p.projects === 1 ? 'projeto votado' : 'projetos votados'}` : ''}</span></div>`;
    let body = `<div class="phase">Parada ${pad(i + 1)} de ${n} · ${esc(t.t)}</div><p class="question">${esc(t.q)}</p>${stats}`, primary = null, secondary = [], busy = '';
    if (ph === 'idle') primary = cmd(`▶ Iniciar votação (${fmt(p.remaining)})`, 'start', 'big');
    else if (ph === 'run') { primary = cmd('⏭ Encerrar votação', 'end', 'big'); secondary = [cmd('❚❚ Pausar', 'pause', 'ghost')]; busy = 'A votação ainda está aberta. Avançar mesmo assim?'; }
    else if (ph === 'paused') { primary = cmd('▶ Retomar votação', 'start', 'big'); secondary = [cmd('⏭ Encerrar', 'end', 'ghost')]; }
    else if (!p.top.length) {
      if (p.votes) { primary = cmd('🏆 Revelar os 2 mais votados', 'reveal', 'big'); body += '<p class="small reveal">O telão faz o suspense: primeiro aparece o 2º mais votado e, por último, o 1º. Nunca saem dois projetos do mesmo responsável.</p>'; }
      else { body += '<p class="warn">Nenhum voto nesta parada.</p>'; primary = openNext('Próxima parada:', 'big'); secondary = [cmd('↺ Reiniciar a votação', 'reset', 'ghost')]; }
    } else {
      body += `<div class="rfx-drawn">${p.top.map((v, k) => `<div class="suc-draw on"><div class="small">${k ? '★' : '🏆'} ${k + 1}º MAIS VOTADO · ${v.n} ${v.n === 1 ? 'voto' : 'votos'}</div><div class="who">${esc(v.p)}</div><div class="what">${esc(v.o)}</div></div>`).join('')}</div>
        <p class="small reveal ${cfg.showCounts ? 'on' : ''}">${cfg.showCounts ? 'O telão e os celulares mostram a quantidade de votos de cada um.' : 'A quantidade de votos aparece só aqui para você. No telão e nos celulares, só o projeto e o responsável.'}</p>`;
      primary = openNext('Próxima parada:', 'big');
      secondary = [cmd('↻ Revelar de novo (com suspense)', 'reveal', 'ghost'), p.show ? cmd('Ver o Flux Capacitor', 'showTop', 'ghost', { on: '' }) : cmd('Mostrar os mais votados', 'showTop', 'ghost', { on: 1 }),
        cfg.showCounts ? cmd('Esconder nº de votos no telão', 'counts', 'ghost', { on: '' }) : cmd('Mostrar nº de votos no telão', 'counts', 'ghost', { on: 1 })];
    }
    secondary.push(cmd('☰ Menu das paradas', 'menu', 'ghost'));
    if (ph === 'done' && p.tally.length) body += det('rfx-tally', `Ver a contagem de todos os projetos (${p.tally.length})`, `<div class="anslist" style="margin-top:6px">${p.tally.map(x => `<p><b>${x.n}</b> · ${esc(x.p)} <span class="small">· ${esc(x.o)}</span>${x.pick ? ` <span class="ok">· ${x.pick}º</span>` : x.skip ? ' <span class="warn">· pulado: mesmo responsável de um dos escolhidos</span>' : ''}</p>`).join('')}</div>`);
    return { ...base, color: COLORS[i % 4], body, after: `<div class="small" style="margin-top:16px">Paradas (clique para abrir outra):</div>${chips}`, primary, secondary, busy };
  }
  // Preparar → Reflexão: título, tempo, paradas e a lista de projetos (um por linha)
  function vReflexaoCfg() {
    const R = A.O.reflexao; if (!R) return '<div class="card"><p class="lead">Carregando…</p></div>';
    const c = R.config;
    return `<div class="card"><h2>Reflexão · paradas e projetos</h2>
      <p class="small">Em cada parada as pessoas escolhem 1 projeto pelo celular (com o nome do check-in), o Flux Capacitor do telão carrega e você revela os 2 mais votados (nunca dois do mesmo responsável). Aqui você ajusta os textos e a lista. No <a href="#" data-go="live">Ao vivo</a> a Reflexão é um passo do roteiro.</p>
      <div class="form two" style="margin-top:12px">
        <label class="f">Título no telão<input class="input" id="rfTitle" value="${esc(c.title)}"></label>
        <label class="f">Subtítulo<input class="input" id="rfSub" value="${esc(c.subtitle)}"></label>
        <label class="f">Tempo de votação por parada (segundos)<input class="input" id="rfSeconds" type="number" min="10" max="900" value="${c.voteSeconds}"><span class="small">90 = 1min30</span></label>
        <label class="f">Votos para carregar 100% do Flux Capacitor em uma parada<input class="input" id="rfFull" type="number" min="1" max="500" value="${c.fullVotes}"></label>
      </div>
      <h3 style="margin-top:16px">Paradas</h3>
      <p class="small">Uma por linha: <span class="mono">nome da parada | pergunta</span> (até 8).</p>
      <textarea class="input mono" id="rfThemes" rows="${Math.max(6, c.themes.length + 1)}" spellcheck="false">${esc(c.themes.map(t => `${t.t} | ${t.q}`).join('\n'))}</textarea>
      <h3 style="margin-top:16px">Projetos (${c.projects.length})</h3>
      <p class="small">Um por linha: <span class="mono">projeto | responsável</span>. É a lista que aparece no celular e o que o telão mostra ao revelar os mais votados. Para vários responsáveis no mesmo projeto, separe os nomes com <span class="mono">/</span>.</p>
      <textarea class="input mono" id="rfProjects" rows="18" spellcheck="false">${esc(c.projects.map(x => `${x.name} | ${x.owner}`).join('\n'))}</textarea>
      <div class="actions" style="margin-top:14px"><button class="btn" data-act="rfxSaveCfg">Salvar</button><button class="btn ghost sm" data-act="rfxResetCfg" style="margin-left:auto">Restaurar o padrão</button></div>
    </div>`;
  }
  async function rfxVotesDialog() {
    const R = A.O.reflexao, d = await api('GET', '/api/admin/reflexao/votes'), list = d.votes || [];
    dialog(`<h3>Reflexão · ${list.length} ${list.length === 1 ? 'voto' : 'votos'}</h3>
      <div class="anslist">${list.length ? R.config.themes.map((t, k) => { const v = list.filter(x => x.parada === k); return v.length ? `<p class="small" style="margin-top:8px"><b>${pad(k + 1)} · ${esc(t.t)}</b> (${v.length})</p>${v.map(x => `<p><b>${esc(x.name)}</b> · ${esc(x.project)}</p>`).join('')}` : ''; }).join('') : '<p class="muted">Nenhum voto ainda.</p>'}</div>
      <div class="actions" style="margin-top:12px"><button class="btn sm" data-act="rfxCsv" ${list.length ? '' : 'disabled'}>⬇ Exportar votos (.csv)</button><button class="btn ghost sm" data-close>Fechar</button></div>`);
  }
  async function rfxCsv() {
    const r = await fetch('/api/admin/reflexao/votes.csv', { headers: { 'x-admin-key': A.key } });
    if (!r.ok) throw new Error('Não foi possível exportar os votos.');
    const link = document.createElement('a'); link.href = URL.createObjectURL(await r.blob()); link.download = 'Votos_Reflexao.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 5000); toast('Download iniciado');
  }
  // cronômetros e viradas de fase que dependem só do relógio
  function tickLive() {
    if (!A.O || A.tab !== 'live') return;
    const t = A.O.state.conn.timer, c = $('[data-timer=conn]'); if (c && t) c.textContent = fmt(timerLeft(t));
    const su = $('[data-timer=suc]'); if (su) su.textContent = fmt(sucLeft(sucAct(su.dataset.k)));
    const rx = $('[data-timer=rfx]'), R = A.O.reflexao; if (rx && R && R.open !== null) rx.textContent = fmt(rfxLeft(R.paradas[R.open]));
    const d = A.O.state.presentation && A.O.state.presentation.draw, tk = $('[data-timer=talk]'); if (tk && d) tk.textContent = fmt(talkLeft(d.talk));
    const iv = $('[data-timer=iv]'); if (iv && A.O.cenas) iv.textContent = fmt(ivLeft());
  }
  setInterval(() => {
    if (!A.O || A.tab !== 'live') return;
    tickLive();
    const { step } = liveStep(), a = step.type === 'sucesso' ? sucAct(step.activity) : null, d = A.O.state.presentation && A.O.state.presentation.draw, left = d ? talkLeft(d.talk) : -1;
    const key = [step.id, a ? sucEff(a) : '', a && a.phase === 'run' ? sucLeft(a) <= 30 : '', d ? (left > 30 ? 'a' : left > 0 ? 'b' : 'c') : '', step.type === 'cena' && step.cena === 'intervalo' ? ivPhase() : ''].join('|');
    if (key !== A.liveKey) { A.liveKey = key; render(); }
  }, 500);

  // Bipes dos cronômetros: saem daqui só quando o som está configurado para este computador (senão, saem do telão)
  setInterval(() => {
    const O = A.O; if (!O || !window.Trilha) return;
    const sec = at => at - Date.now() - A.offset; // milissegundos que faltam
    const t = O.state.conn.timer, pr = O.state.presentation, l = pr ? sucAct(pr.activityId) : null, talk = pr && pr.draw && pr.draw.talk, R = O.reflexao, c = R && R.open !== null && rfxOnAir() ? R.paradas[R.open] : null;
    Trilha.countdown('conn', t && !t.paused && t.kind !== 'break' && !pr && O.state.block === 'connections' ? sec(t.endsAt) : null);
    Trilha.countdown('suc', l && l.phase === 'run' && l.endsAt ? sec(l.endsAt) : null);
    Trilha.countdown('talk', talk && talk.endsAt ? sec(talk.endsAt) : null);
    Trilha.countdown('rfx', c && c.phase === 'run' && c.endsAt ? sec(c.endsAt) : null);
  }, 100);

  // Respostas de uma dinâmica do Sucesso: lista + download (.txt ou Word), como no painel 3D
  async function sucAnswersDialog(k) {
    const room = A.O.sucesso && A.O.sucesso.roomId, a = sucAct(k); if (!room) return toast('As dinâmicas do Sucesso ainda estão carregando.', true);
    const d = await api('GET', `/api/rooms/${room}/snapshot?after=0`);
    const list = (d.responses || []).filter(r => r.activityId === k).map(r => ({ n: r.name, t: r.answer }));
    A.sucList = { k, list, title: a.title || SUC_NAME[k], question: a.question || '' };
    dialog(`<h3>Dinâmica ${k.slice(1)} · ${esc(A.sucList.title)} · ${list.length} ${list.length === 1 ? 'resposta' : 'respostas'}</h3>
      <div class="anslist">${list.length ? list.slice().reverse().map(r => `<p><b>${esc(r.n)}</b> · ${esc(r.t)}</p>`).join('') : '<p class="muted">Nenhuma resposta ainda.</p>'}</div>
      <div class="actions" style="margin-top:12px"><button class="btn sm" data-act="sucDownload" data-type="txt" ${list.length ? '' : 'disabled'}>⬇ Baixar .txt</button><button class="btn sm" data-act="sucDownload" data-type="doc" ${list.length ? '' : 'disabled'}>⬇ Baixar Word</button><button class="btn ghost sm" data-close>Fechar</button></div>`);
  }
  function sucDownload(type) {
    const L = A.sucList; if (!L || !L.list.length) return toast('Nenhuma resposta para baixar.', true);
    const date = new Date().toLocaleString('pt-BR'), title = `De Volta para o Sucesso | Dinâmica ${L.k.slice(1)}: ${L.title}`;
    let blob, name = `Respostas_${L.title.replace(/[^\p{L}\p{N}]+/gu, '')}`;
    if (type === 'txt') { blob = new Blob([`${title.toUpperCase()}\nPergunta: ${L.question}\nData: ${date}\nTotal: ${L.list.length}\n\n` + L.list.map((r, n) => `${n + 1}. ${r.n}: ${r.t}`).join('\n')], { type: 'text/plain;charset=utf-8' }); name += '.txt'; }
    else {
      const h = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"></head><body style="font-family:Calibri"><h1 style="color:#FF6B1A">${esc(title)}</h1><p><b>Pergunta:</b> ${esc(L.question)}</p><p><b>Data:</b> ${date} &nbsp; <b>Total:</b> ${L.list.length}</p><table border="1" cellpadding="6" style="border-collapse:collapse;width:100%"><tr style="background:#17142E;color:#fff"><th>#</th><th>Nome</th><th>Resposta</th></tr>${L.list.map((r, n) => `<tr><td>${n + 1}</td><td>${esc(r.n)}</td><td>${esc(r.t)}</td></tr>`).join('')}</table></body></html>`;
      blob = new Blob(['﻿', h], { type: 'application/msword' }); name += '.doc';
    }
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 5000); toast('Download iniciado');
  }
  // Quem não participa de um bloco (ex.: quem coordena): continua fazendo o login, mas fica fora das duplas, da votação ou das respostas
  function skipDialog(block) {
    const O = A.O, on = new Set(skipIds(block)), people = O.people.filter(p => p.active).slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const inGroups = block === 'connections' && O.state.conn.generatedAt;
    dialog(`<h3>🚫 Quem não participa · ${esc(SKIP_LABEL[block])}</h3>
      <p class="small">Marque quem coordena ou não vai participar deste bloco. A pessoa faz o login normalmente (conta presença), mas ${block === 'connections' ? 'não entra no sorteio das duplas' : block === 'reflexao' ? 'não vota nos projetos' : 'não envia respostas'} e vê no celular que está na coordenação.</p>
      ${inGroups ? '<p class="warn" style="margin-top:6px">⚠ As duplas já foram sorteadas. Para tirar alguém agora, sorteie as duplas de novo depois de salvar (enquanto nenhuma viagem aconteceu).</p>' : ''}
      <input class="input" id="skQ" placeholder="🔎 Buscar pelo nome…" style="margin-top:10px">
      <div class="sklist" id="skList">${people.map(p => `<label class="sk" data-n="${esc(p.name.toLowerCase())}"><input type="checkbox" value="${p.id}" ${on.has(p.id) ? 'checked' : ''}> <span>${esc(p.name)} <small>${esc([p.area, p.wl].filter(Boolean).join(' · '))}</small></span></label>`).join('')}</div>
      <div class="actions" style="margin-top:12px"><button class="btn" id="skSave">Salvar</button><button class="btn ghost" data-close>Cancelar</button><span class="small" id="skCount"></span></div>`, () => {
      const count = () => { $('#skCount').textContent = `${document.querySelectorAll('#skList input:checked').length} fora deste bloco`; };
      count(); $('#skList').addEventListener('change', count);
      $('#skQ').addEventListener('input', e => { const q = e.target.value.trim().toLowerCase(); document.querySelectorAll('#skList .sk').forEach(l => { l.hidden = !!q && !l.dataset.n.includes(q); }); });
      $('#skSave').onclick = () => run(async () => { await act('settings', { settings: { skip: { [block]: [...document.querySelectorAll('#skList input:checked')].map(i => +i.value) } } }); closeDialog(); }, 'Lista salva');
    });
  }
  /* ====================== REINICIAR: tudo ou um bloco ======================
   * Reiniciar apaga o que foi feito durante o evento ou o ensaio; não mexe no que foi preparado (pessoas, fotos,
   * perguntas, roteiro, textos e conteúdo das cenas). Cada bloco do roteiro tem o seu "escopo" no servidor. */
  const CENA_RESET = { abertura: 'Volta o vídeo de abertura para o começo (parado).', plano26: 'Tira o destaque: o telão volta a mostrar o plano inteiro.', almanaque: 'Volta o almanaque para a capa (antes de dezembro, sem filtros).', reconhecimento: 'Lacra todos os prêmios de novo e volta para a abertura.', intervalo: 'Zera o cronômetro do intervalo e tira o alerta de volta.', visao: 'Volta para a capa do bloco e a página da estratégia para o modo padrão (direto no mapa).', mph: 'Volta o velocímetro para 0 MPH.' };
  // o que dá para reiniciar em um passo do roteiro: escopo, como está agora, se há algo para apagar e o que o reinício faz
  function resetInfo(x) {
    const O = A.O, C = O.cenas;
    if (x.type === 'checkin') return team() ? null : { scope: 'checkin', now: `${O.counts.checkedIn} de ${O.counts.total} a bordo`, dirty: O.counts.checkedIn > 0 || !!O.state.conn.generatedAt, what: 'Desfaz o check-in de todo mundo: cada pessoa escolhe o nome de novo. As respostas da nuvem de palavras e o feedback saem junto, e as Conexões são reiniciadas, porque as duplas dependem de quem está a bordo.' };
    if (x.type === 'cena' && x.cena === 'nuvem' && C && !C.team) { const n = (O.words || []).length; return { scope: 'words', now: `${n} ${n === 1 ? 'pessoa respondeu' : 'pessoas responderam'}`, dirty: n > 0 || !!(C.state.nuvem || {}).foco, what: 'Apaga as respostas das duas perguntas (cada pessoa responde de novo) e volta a mostrar as duas nuvens.' }; }
    if (x.type === 'closing' && !team()) { const n = ((O.feedback || {}).stats || {}).count || 0; return { scope: 'feedback', now: `${n} ${n === 1 ? 'feedback' : 'feedbacks'}`, dirty: n > 0, what: 'Apaga as respostas do formulário de feedback (cada pessoa pode responder de novo).' }; }
    if (x.type === 'connections') { const c = O.state.conn; return { scope: 'connections', now: c.phase === 'idle' ? 'sem duplas' : c.phase === 'ready' ? 'duplas sorteadas' : c.phase === 'results' ? 'conexões enviadas' : `${PHASE_LABEL[c.phase]}${c.round ? ` · viagem ${c.round}/3` : ''}`, dirty: c.phase !== 'idle', what: 'Apaga as duplas sorteadas, as perguntas já vistas, as avaliações e as conexões calculadas. Os check-ins ficam.' }; }
    if (x.type === 'reflexao' && O.reflexao) { const R = O.reflexao, votes = R.paradas.reduce((a, p) => a + p.votes, 0), done = R.paradas.filter(p => p.top.length).length; return { scope: 'reflexao', now: `${votes} ${votes === 1 ? 'voto' : 'votos'} · ${done} de ${R.paradas.length} paradas reveladas`, dirty: votes > 0 || done > 0 || R.open !== null || R.paradas.some(p => p.phase !== 'idle'), what: 'Apaga os votos e os mais votados de todas as paradas e volta para o menu das paradas.' }; }
    if (x.type === 'sucesso') { const a = sucAct(x.activity), n = a.responseCount || 0; return { scope: 'sucesso:' + x.activity, now: `${n} ${n === 1 ? 'resposta' : 'respostas'}`, dirty: n > 0 || ['paused', 'done'].includes(a.phase) || (a.phase === 'run' && !!a.endsAt), what: 'Apaga as respostas desta dinâmica, o sorteio e a nuvem revelada. O recebimento volta ao começo.' }; }
    if (x.type === 'doc') { const d = O.state.doc || {}; return { scope: 'doc', now: d.message ? `mensagem pronta${d.play ? ' · cena no telão' : ''}` : 'sem mensagem', dirty: !!d.message || d.status === 'generating', what: 'Apaga a mensagem do Doc e tira a cena do telão. Dá para gerar de novo.' }; }
    if (x.type === 'cena' && C && CENA_RESET[x.cena]) { const st = C.state[x.cena] || {};
      const dirty = x.cena === 'abertura' ? !!st.play || !!st.fim : x.cena === 'plano26' ? !!st.foco : x.cena === 'almanaque' ? st.mes >= 0 || !!st.pagina || (st.off || []).length > 0 : x.cena === 'reconhecimento' ? (st.feitos || []).length > 0 || st.fase !== 'intro' : x.cena === 'intervalo' ? st.phase !== 'idle' || !!st.alerta : x.cena === 'visao' ? !!st.intro || !!st.aberta : !!st.at;
      return { scope: 'cena:' + x.cena, now: cenaSub(x, true) || 'no começo', dirty, what: CENA_RESET[x.cena] }; }
    return null;
  }
  const resetScope = (scope, extra = {}) => api('POST', '/api/admin/reset', { scope, ...extra });
  function resetDialog() {
    const O = A.O, { steps, i } = liveStep(), rows = [], seen = new Set();
    for (const x of steps) { const r = resetInfo(x); if (r && !seen.has(r.scope)) { seen.add(r.scope); rows.push({ x, ...r }); } }
    const dirtyN = rows.filter(r => r.dirty).length, atStart = i === 0 && !O.state.detour;
    dialog(`<h3>↺ Reiniciar</h3>
      <p class="small">Reiniciar apaga o que foi feito durante o evento ou o ensaio: ${team() ? 'duplas, votos e respostas' : 'check-ins, duplas, votos, respostas, prêmios revelados e cronômetros'}. <b>Não mexe no que foi preparado</b>: lista de pessoas e fotos, perguntas${team() ? ' e textos' : ', roteiro, textos e conteúdo das cenas'}. Para guardar os dados antes, use <a href="/dados.html" target="_blank">📊 Dados</a>.</p>
      <div class="rs-all" ${team() ? 'hidden' : ''}><div><b>Reiniciar tudo</b><span class="small">O roteiro volta para o primeiro passo e todos os blocos abaixo voltam ao começo, de uma vez.</span>
          <label class="sw" style="margin-top:8px"><input type="checkbox" id="rsKeep"> Manter os check-ins (as ${O.counts.checkedIn} pessoas a bordo continuam a bordo)</label></div>
        <button class="btn red" id="rsAll">↺ Reiniciar tudo</button></div>
      <h3 style="margin-top:16px">Reiniciar um bloco</h3>
      <p class="small">Só o bloco escolhido volta ao começo; o resto fica como está. ${dirtyN ? '' : 'Agora todos os blocos já estão no começo.'}</p>
      <div class="tblwrap" style="margin-top:8px;max-height:46vh;overflow:auto"><table class="tbl rs-tbl">
        ${rows.map(r => `<tr class="${r.dirty ? '' : 'clean'}"><td>${stepIcon(r.x)} <b>${esc(stepTitle(r.x))}</b><div class="small">${esc(r.what)}</div></td><td class="small" style="white-space:nowrap">${r.dirty ? esc(r.now) : '✓ no começo'}</td>
          <td class="r"><button class="btn xs ${r.dirty ? 'red' : 'ghost'}" data-reset="1" data-scope="${r.scope}" data-title="${esc(stepTitle(r.x))}" data-what="${esc(r.what)}" ${r.dirty ? '' : 'disabled'}>↺ Reiniciar</button></td></tr>`).join('')}
        <tr class="${atStart ? 'clean' : ''}" ${team() ? 'hidden' : ''}><td>🧭 <b>Roteiro</b><div class="small">Volta o telão e os celulares para o primeiro passo, sem apagar nada.</div></td><td class="small" style="white-space:nowrap">${atStart ? '✓ no começo' : `passo ${i + 1} de ${steps.length}`}</td>
          <td class="r"><button class="btn xs ghost" data-reset="1" data-scope="roteiro" data-title="o roteiro" data-what="O telão e os celulares voltam para o primeiro passo. Nada é apagado." ${atStart ? 'disabled' : ''}>↺ Voltar ao início</button></td></tr>
      </table></div>
      <div class="actions" style="margin-top:12px"><button class="btn ghost" data-close>Fechar</button></div>`, () => {
      $('#dlg').classList.add('wide'); // esta janela tem uma tabela: fica mais larga
      const again = () => setTimeout(() => { if ($('#dlg').open && $('#dlg [data-reset]')) resetDialog(); }, 800); // mostra como ficou depois de reiniciar
      if (!team()) $('#rsAll').onclick = () => { const keep = $('#rsKeep').checked;
        if (!confirm(`Reiniciar TUDO? O roteiro volta para o primeiro passo e são apagados ${keep ? '' : 'os check-ins, '}as duplas e avaliações, os votos da Reflexão, as respostas do Sucesso, a mensagem do Doc, os prêmios revelados e os cronômetros.${keep ? ' Os check-ins ficam.' : ''} Não dá para desfazer.`)) return;
        run(async () => { await resetScope('all', { keepCheckins: keep }); A.sel = null; again(); }, 'Tudo reiniciado'); };
      document.querySelectorAll('#dlg [data-reset]').forEach(b => { b.onclick = () => { const d = b.dataset;
        if (!confirm(`Reiniciar ${d.title}? ${d.what}${d.scope === 'roteiro' ? '' : ' Não dá para desfazer.'}`)) return;
        run(async () => { await resetScope(d.scope); again(); }, d.scope === 'roteiro' ? 'Roteiro no primeiro passo' : `${d.title}: reiniciado`); }; });
    });
  }

  // Modo confidencial: explica e liga/desliga
  function confDialog() {
    const O = A.O, conf = O.settings.confidencial !== false;
    dialog(`<h3>${conf ? '🔒 Modo confidencial ligado' : '🔓 Conteúdo liberado para todos'}</h3>
      <p class="small">${conf ? 'O conteúdo do townhall (vídeo de abertura, boas-vindas, plano de voo, Jornada 2026, prêmios, estratégia 2027, 88 MPH e créditos) só aparece <b>neste painel e no telão aberto neste navegador</b>. Enquanto uma dessas cenas está no ar, os celulares e os outros telões veem só “olhe para o telão”. Quem entra com a senha das dinâmicas não vê nada disso.' : 'Quando uma cena do townhall entra no ar, <b>todos os celulares e telões</b> a veem. É como deve ficar no dia do evento.'}</p>
      <p class="small" style="margin-top:8px">Conexões, Reflexão e Sucesso não são confidenciais: aparecem para todos nos dois modos.</p>
      <div class="actions" style="margin-top:12px"><button class="btn" data-act="confSet" data-on="${conf ? '' : 1}">${conf ? '🔓 Liberar para todos (dia do evento)' : '🔒 Voltar ao modo confidencial'}</button><button class="btn ghost" data-close>Fechar</button></div>`);
  }
  // Uma cena do townhall vai entrar no ar com o modo confidencial ligado: é o evento (libera para todos) ou é ensaio?
  function confStepDialog(x) {
    dialog(`<h3>🔒 ${esc(stepTitle(x))}: é o evento ou é ensaio?</h3>
      <p class="small">O modo confidencial está ligado. Este passo é conteúdo do townhall.</p>
      <div class="rs-all" style="margin-top:10px"><div><b>É o evento</b><span class="small">Libera o conteúdo para todos os celulares e telões e coloca o passo no ar. Daqui em diante tudo aparece para todos.</span></div><button class="btn" id="cfGo">🔓 Liberar e mostrar</button></div>
      <div class="rs-all" style="margin-top:8px"><div><b>É ensaio</b><span class="small">Mostra só para você: neste painel e no telão aberto neste navegador. Os celulares veem “olhe para o telão”.</span></div><button class="btn ghost" id="cfRehearse">🔒 Mostrar só para mim</button></div>
      <div class="actions" style="margin-top:12px"><button class="btn ghost" data-close>Cancelar</button></div>`, () => {
      const go = free => run(async () => { if (free) await act('settings', { settings: { confidencial: false } }); await api('POST', '/api/admin/step', { id: x.id }); closeDialog(); A.sel = null; A.edit = null; render(true); }, free ? '🔓 Liberado para todos · passo no ar' : '🔒 No ar só para você (ensaio)');
      $('#cfGo').onclick = () => go(true); $('#cfRehearse').onclick = () => go(false);
    });
  }

  function quickMessageDialog() {
    const m = A.O.state.message;
    dialog(`<h3>📣 Aviso rápido</h3><p class="small">Aparece na hora em todos os celulares e no telão, fora do roteiro (intervalo, recado, link). Depois é só voltar ao roteiro.</p>
      <div class="form" style="margin-top:10px"><label class="f">Emoji<input class="input" id="qmEmoji" value="${esc(m.emoji)}"></label><label class="f">Título<input class="input" id="qmTitle" value="${esc(m.title)}"></label><label class="f">Texto (links viram clicáveis)<textarea class="input" id="qmBody">${esc(m.body)}</textarea></label></div>
      <div class="actions" style="margin-top:12px"><button class="btn" id="qmShow">📣 Exibir agora</button><button class="btn ghost" data-close>Cancelar</button></div>`, () => {
      $('#qmShow').onclick = () => run(async () => { await act('setMessage', { message: { emoji: $('#qmEmoji').value, title: $('#qmTitle').value, body: $('#qmBody').value }, show: true }); closeDialog(); }, 'Aviso no ar');
    });
  }

  /* ====================== PREPARAR → ROTEIRO ====================== */
  function vRoteiro() {
    const O = A.O, list = A.stepsDraft || O.settings.steps, dirty = !!A.stepsDraft;
    const has = t => list.some(x => x.type === t), hasAct = k => list.some(x => x.type === 'sucesso' && x.activity === k), hasCena = k => list.some(x => x.type === 'cena' && x.cena === k);
    const row = (x, i) => {
      const f = (field, ph, cls) => `<input class="input ${cls}" data-rs="${i}" data-f="${field}" id="rs-${field}-${i}" value="${esc(x[field] || '')}" placeholder="${ph}" aria-label="${ph}">`;
      const fields = x.type === 'stage' ? `${f('title', 'Nome do bloco', 'w1')}${f('theme', 'Tema (aparece no celular e no telão)', 'w3')}${f('speaker', 'Quem fala (opcional)', 'w2')}`
        : x.type === 'message' ? `${f('emoji', '📣', 'w0')}${f('title', 'Título do aviso', 'w2')}${f('body', 'Texto do aviso', 'w3')}`
        : `<span class="fixed">${esc(stepTitle(x))}${phoneStep(x) ? ' 📱' : ''}<small>${x.type === 'cena' ? esc(cenaMeta(x).hint) : x.type === 'sucesso' && TALK[x.activity] ? 'pergunta ao vivo, nuvem, sorteio e tempo de fala' : STEP_HINT[x.type]}</small></span>${SKIP_OF[x.type] ? `<button class="btn ghost xs" data-act="skipEdit" data-block="${x.type}" title="Quem coordena ou não participa deste bloco">🚫 Fora deste bloco (${skipIds(x.type).length})</button>` : ''}`;
      return `<div class="rrow ${!dirty && x.id === O.state.step ? 'now' : ''}"><span class="n">${i + 1}</span><span class="ic" title="${STEP_KIND[x.type]}">${stepIcon(x)}</span><div class="rf">${fields}</div>
        <div class="rc">${!dirty && x.id === O.state.step ? '<span class="pill hot">no ar</span>' : ''}${['message', 'standby'].includes(x.type) ? '' : `<button class="btn ghost xs trb ${x.transition === false ? 'off' : ''}" data-act="rsTr" data-i="${i}" title="${x.transition === false ? 'Este passo entra direto, sem a transição do filme. Clique para ligar a transição.' : 'Este passo entra com a transição do filme (88 MPH). Clique para ele entrar direto.'}">${x.transition === false ? '⏭ direto' : '⚡ transição'}</button>`}<button class="btn ghost xs" data-act="rsMove" data-i="${i}" data-d="-1" ${i ? '' : 'disabled'} title="Subir">↑</button><button class="btn ghost xs" data-act="rsMove" data-i="${i}" data-d="1" ${i < list.length - 1 ? '' : 'disabled'} title="Descer">↓</button><button class="btn ghost xs" data-act="rsDel" data-i="${i}" ${list.length > 1 ? '' : 'disabled'} title="Remover">✕</button></div></div>`;
    };
    const add = (label, type, extra = '') => `<button class="btn ghost xs" data-act="rsAdd" data-type="${type}" ${extra}>＋ ${label}</button>`;
    return `<div class="card"><h2>Roteiro do evento</h2>
      <p class="small">O roteiro padrão segue a agenda do townhall em 4 atos: check-in → vídeo de abertura → boas-vindas → plano de voo → Conexões e o resto (as cenas do deck mais Conexões, Reflexão e Sucesso). O conteúdo de cada cena fica em <a href="#" data-go="cenas">Agenda e cenas</a>. 📱 marca as dinâmicas que acontecem no celular.</p>
      <p class="small">Em cada passo, o botão <b>⚡ transição</b> / <b>⏭ direto</b> escolhe se ele entra com a viagem no tempo (os segundos de 88 MPH no telão e nos celulares) ou direto. Os nomes e as fotos de quem conduz cada bloco ficam em <a href="#" data-go="cenas" data-sec="anfitrioes">Agenda e cenas → Quem conduz</a>.</p>
      <p class="small">A ordem dos passos do evento. No <a href="#" data-go="live">Ao vivo</a> você abre cada passo e clica em "Mostrar" para ele ir para o telão e os celulares. Dá para mudar a qualquer momento, inclusive durante o evento. Em Conexões, Reflexão e Sucesso, o botão 🚫 marca quem coordena e não participa.</p>
      <div class="rlist">${list.map(row).join('')}</div>
      <div class="actions radd"><span class="small">Adicionar:</span>${add('Bloco de fala', 'stage')}${add('Aviso / intervalo', 'message')}${add('Olhos no telão', 'standby')}${add('Check-in', 'checkin')}${has('connections') ? '' : add('Conexões', 'connections')}${has('reflexao') ? '' : add('Reflexão', 'reflexao')}${has('doc') ? '' : add('Visão 2027 · o Doc', 'doc')}${['d1', 'd2', 'd3', 'd4'].filter(k => !hasAct(k)).map(k => add(`Sucesso ${k.slice(1).padStart(2, '0')}`, 'sucesso', `data-activity="${k}"`)).join('')}${add('Créditos', 'closing')}</div>
      ${(O.cenas ? O.cenas.kinds : []).some(k => !hasCena(k) && !EXTRA_CENAS.includes(k)) ? `<div class="actions radd"><span class="small">Cenas do townhall:</span>${O.cenas.kinds.filter(k => !hasCena(k) && !EXTRA_CENAS.includes(k)).map(k => add(`${O.cenas.meta[k].icon} ${O.cenas.meta[k].label}`, 'cena', `data-cena="${k}"`)).join('')}</div>` : ''}
      ${(O.cenas ? O.cenas.kinds : []).some(k => !hasCena(k) && EXTRA_CENAS.includes(k)) ? det('rsExtras', 'Cenas extras (telas de abertura que hoje fazem parte dos blocos Reflexão e Sucesso)', `<div class="actions radd" style="margin-top:8px">${O.cenas.kinds.filter(k => !hasCena(k) && EXTRA_CENAS.includes(k)).map(k => add(`${O.cenas.meta[k].icon} ${O.cenas.meta[k].label}`, 'cena', `data-cena="${k}"`)).join('')}</div>`) : ''}
      <div class="actions" style="margin-top:14px;align-items:center">${dirty ? '<button class="btn" data-act="rsSave">Salvar roteiro</button><button class="btn ghost" data-act="rsDiscard">Descartar alterações</button><span class="warn">alterações não salvas</span>' : '<span class="ok">✔ Roteiro salvo</span>'}<button class="btn ghost sm" data-act="rsDefault" style="margin-left:auto">Restaurar o roteiro padrão</button></div>
    </div>`;
  }
  const draftSteps = () => (A.stepsDraft = A.stepsDraft || A.O.settings.steps.map(x => ({ ...x })));

  /* ====================== PREPARAR → AGENDA E CENAS ======================
   * O conteúdo das cenas do deck (em português): textos, horários, itens do almanaque, prêmios e créditos.
   * Listas são digitadas uma por linha, com as colunas separadas por " | ". *Asteriscos* marcam palavras em destaque. */
  const SEL = (k, l, opts) => ({ k, l, t: 'sel', opts }), T = (k, l) => ({ k, l, t: 'text' }), AREA = (k, l) => ({ k, l, t: 'area' }), NUM = (k, l) => ({ k, l, t: 'num' }), LIST = (k, l) => ({ k, l, t: 'list' }), LINES = (k, l, cols, map) => ({ k, l, t: 'lines', cols, map }), CHECK = (k, l) => ({ k, l, t: 'check' });
  const MONTH_MAP = { out: v => A.O.cenas.months[v] || 'JAN', in: v => { const i = A.O.cenas.months.indexOf(String(v).trim().toUpperCase().slice(0, 3)); return i < 0 ? Math.max(0, Math.min(11, (parseInt(v, 10) || 1) - 1)) : i; } };
  const BU_MAP = { out: v => v || '-', in: v => { const u = String(v).trim().toUpperCase(); return u === 'HC' || u === 'BPC' ? u : u.startsWith('X') || u.startsWith('CROSS') ? 'X' : ''; } };
  const TIPO_MAP = { out: v => v, in: v => { const u = String(v).trim().toUpperCase()[0]; return 'EMRC'.includes(u) ? u : 'M'; } };
  const BLOCO_MAP = { out: v => (Array.isArray(v) ? v.join(' | ') : v), in: v => String(v).split('|').map(x => x.trim()).filter(Boolean) };
  const CENA_FORM = {
    evento: ['Evento · check-in e créditos', 'O nome do evento aparece no telão do check-in e nos créditos.',
      [T('titulo', 'Título'), T('sub', 'Subtítulo'), T('data', 'Data'), T('local', 'Local')]],
    anfitrioes: ['🎙️ Quem conduz cada bloco', 'Aparecem no telão com a foto de perfil e o nome (como nas boas-vindas), e nos celulares. Um nome por linha, escrito como na lista de pessoas (é assim que a foto é encontrada). Deixe em branco para não mostrar ninguém.',
      [LIST('connections', '⚡ Conexões'), LIST('almanaque', '📅 Jornada 2026 · almanaque'), LIST('reflexao', '💭 Reflexão'), LIST('reconhecimento', '🏆 Reconhecimento 2026'), LIST('visao', '🔭 Visão 2027'), LIST('sucesso', '🚀 Sucesso'),
        LIST('especial', '★ Conexões · participação especial (aparece em uma placa dourada, abaixo de quem conduz)'), T('especialNota', '★ Participação especial · frase que aparece embaixo do nome')]],
    abertura: ['🎬 Vídeo de abertura', 'O vídeo toca em tela cheia no telão. O jeito mais seguro é arrastar o arquivo para a tela do telão (ele fica guardado no navegador do telão, mesmo fechando e abrindo de novo). O endereço abaixo é opcional: só para um arquivo de vídeo que esteja em um endereço direto (.mp4 ou .webm).',
      [T('kicker', 'Linha de cima'), T('titulo', 'Título do cartão (antes de o vídeo tocar)'), T('sub', 'Subtítulo'), T('video', 'Endereço do vídeo (opcional: https://… ou caminho do site; vazio = arrastar o arquivo para o telão)'), CHECK('auto', 'Começar a tocar assim que o passo entrar no ar (senão, só no botão Tocar)')]],
    agenda: ['🗺️ Plano de voo (agenda)', 'Os horários são calculados a partir do início e dos minutos de cada item. Os minutos servem só para essa conta: na tela aparecem os horários, não a duração de cada bloco.',
      [T('kicker', 'Linha de cima'), T('titulo', 'Título'), T('inicio', 'Início (HH:MM)'), LINES('itens', 'Itens, um por linha: ato (1 a 4) | título | detalhe | minutos (só para calcular os horários)', ['ato', 't', 'd', 'min'])]],
    boasvindas: ['👋 Boas-vindas e jornada', '', [T('kicker', 'Linha de cima'), AREA('frase', 'Frase de abertura'), LINES('pessoas', 'Quem fala, um por linha: nome | papel', ['nome', 'papel']), T('faixa', 'Faixa de baixo')]],
    nuvem: ['☁️ Nuvem de palavras · duas perguntas', 'As duas perguntas são a primeira tela do celular depois do login, cada uma com um campo de texto, no idioma que a pessoa escolheu (por isso as três versões). Quando este passo entra no ar, o telão mostra uma nuvem por pergunta (com as perguntas em inglês), já com tudo o que chegou. Respostas curtas (uma ou duas palavras) deixam a nuvem mais bonita; frases longas são quebradas em palavras.',
      [T('kicker', 'Linha de cima (telão)'), T('titulo', 'Título no telão'),
        T('perguntas.0', 'Pergunta 1 · English (também aparece no telão)'), T('perguntasPt.0', 'Pergunta 1 · Português'), T('perguntasEs.0', 'Pergunta 1 · Español'),
        T('perguntas.1', 'Pergunta 2 · English (também aparece no telão)'), T('perguntasPt.1', 'Pergunta 2 · Português'), T('perguntasEs.1', 'Pergunta 2 · Español'),
        T('dica', 'Dica embaixo dos campos · English'), T('dicaPt', 'Dica embaixo dos campos · Português'), T('dicaEs', 'Dica embaixo dos campos · Español')]],
    plano26: ['🧭 Estratégia 2026', 'O plano estratégico LATAM GDT 2026 no visual do filme: o destino em cima, os três motores no meio e a estrada embaixo. Nas listas, um item por linha: título | detalhe. A foto dos líderes aparece quando o nome está escrito como na lista de pessoas.',
      [T('kicker', 'Linha de cima'), T('titulo', 'Título'), LINES('lideres', 'Líderes, um por linha: nome | cargo', ['nome', 'papel']),
        T('topo.t', 'Destino (faixa de cima) · título'), T('topo.s', 'Destino · frase'), LINES('topo.itens', 'Destino · itens (até 4): título | detalhe', ['t', 'd']),
        T('p1.t', 'Motor 01 · título'), T('p1.s', 'Motor 01 · frase'), LINES('p1.itens', 'Motor 01 · itens: título | detalhe', ['t', 'd']),
        T('p2.t', 'Motor 02 · título'), T('p2.s', 'Motor 02 · frase'), LINES('p2.itens', 'Motor 02 · itens: título | detalhe', ['t', 'd']),
        T('p3.t', 'Motor 03 · título'), T('p3.s', 'Motor 03 · frase'), LINES('p3.itens', 'Motor 03 · itens: título | detalhe', ['t', 'd']),
        T('base.t', 'Estrada (faixa de baixo) · título'), T('base.s', 'Estrada · frase (opcional)'), LINES('base.itens', 'Estrada · itens (até 4): título | detalhe', ['t', 'd'])]],
    almanaque: ['📅 Jornada 2026 · almanaque', 'Os números "entregues" e "benefícios" são calculados a partir dos itens: contam os do tipo E (entregue) e somam o valor em euros.',
      [T('kicker', 'Linha de cima'), T('titulo', 'Título'), T('sub', 'Subtítulo'),
        LINES('kpis', 'Indicadores fixos, um por linha: valor | rótulo', ['v', 'l']), T('kpiEntregas', 'Rótulo do total de entregas'), T('kpiBeneficios', 'Rótulo do total de benefícios'),
        LINES('itens', 'Itens do ano, um por linha: mês | tipo (E entregue · M marco · R resultado · C contexto) | BU (HC, BPC, X ou -) | benefício somado em € (0 se não soma) | texto', ['m', 'k', 'bu', 'v', 't'], { m: MONTH_MAP, k: TIPO_MAP, bu: BU_MAP }),
        AREA('fonte', 'Fonte (rodapé)'), T('pagina.kicker', 'Uma página · linha de cima'), T('pagina.titulo', 'Uma página · título'), AREA('pagina.nota', 'Uma página · nota dos benefícios'), AREA('pagina.lideranca', 'Uma página · aprendizados da liderança')]],
    ia: ['🦋 Como a IA nos ajudou em 2026', '', [T('kicker', 'Linha de cima'), T('titulo', 'Título'), AREA('texto', 'Texto'), T('quem', 'Quem apresenta'), T('faixa', 'Faixa de baixo'), AREA('nota', 'Nota para quem apresenta (só aparece no painel)')]],
    reconhecimento: ['🏆 Reconhecimento 2026', 'Os vencedores já ficam definidos aqui: o "sorteio" no telão é o suspense da cerimônia. Só o Painel do Doc vê o vencedor antes da revelação.',
      [T('kicker', 'Linha de cima'), LIST('abertura', 'Frases da abertura, uma por linha'), T('aberturaSub', 'Abertura · frase menor'), T('tributo', 'Tributo · título'), T('fala', 'Tributo · quem fala'),
        T('video', 'Vídeo-tributo (endereço https://… ou caminho do site; vazio = arrastar o arquivo para o telão, onde ele fica guardado)'), T('premiosTitulo', 'Prêmios · título'), T('hallTitulo', 'Hall da Fama · título'), T('hallSub', 'Hall da Fama · frase'),
        SEL('carga', 'Na cerimônia, o Flux Capacitor carrega com…', [['mic', '🎤 Os aplausos da sala (o microfone do Painel do Doc ouve)'], ['ambos', '🎤 + 📱 Os aplausos e os toques nos celulares'], ['toques', '📱 Só os toques no botão dos celulares']]),
        CHECK('exemplo', 'Os nomes ainda são de exemplo (mostra o aviso "NOMES DE EXEMPLO" no telão)')]],
    intervalo: ['☕ Intervalo', 'Quando o cronômetro zera, o telão e os celulares mostram um alerta de volta, no estilo dos alertas de emergência da defesa civil.',
      [T('kicker', 'Linha de cima'), T('titulo', 'Título'), NUM('min', 'Duração (minutos)'), AREA('texto', 'Texto'), T('alertaTitulo', '🚨 Alerta de volta · título'), AREA('alertaTexto', '🚨 Alerta de volta · mensagem'), T('alertaOrigem', '🚨 Alerta de volta · quem assina')]],
    visao: ['🔭 Visão 2027 · Estratégia', 'O bloco começa por uma capa (o nome do bloco e quem conduz) e depois a estratégia abre em tela cheia. A página da estratégia é o arquivo original (public/estrategia-2027.html), sem alterações: aqui só mudam os textos da capa.', [T('kicker', 'Linha de cima'), T('titulo', 'Nome do bloco (título da capa)'), T('nota', 'Frase embaixo do título')]],
    capasucesso: ['🚀 Sucesso · capa do bloco', 'A capa que entra antes da primeira dinâmica do Sucesso, em português (como a dinâmica). Quem conduz vem de "Quem conduz cada bloco" → Sucesso.', [T('kicker', 'Linha de cima'), T('titulo', 'Nome do bloco'), T('sub', 'Frase embaixo do título')]],
    manifesto: ['📜 Manifesto 2027', '', [T('kicker', 'Linha de cima'), T('mes', 'Calendário · mês'), T('dia', 'Calendário · dia'), T('ano', 'Calendário · ano'), T('titulo', 'Título'), T('pergunta', 'Pergunta (aparece sendo digitada)'), T('faixa', 'Faixa de baixo'), T('quem', 'Quem conduz')]],
    mph: ['🏎️ 88 MPH · Encerramento', '', [T('kicker', 'Linha de cima'), T('antes', 'Frase antes de acelerar'), T('chegada', 'Chegada (em letras do logo)'), T('depois', 'Frase da chegada'), T('quem', 'Quem conduz')]],
    creditos: ['🏁 Créditos', 'O elenco (todos os nomes do check-in) entra sozinho depois destes blocos.',
      [LINES('blocos', 'Blocos, um por linha: TÍTULO | nome | nome…', ['h', 'l'], { l: BLOCO_MAP }), LINES('final', 'Frases finais (passam antes dos créditos), uma por linha: palavra | frase', ['0', '1']), T('fim', 'Última palavra'), T('fimSub', 'Última frase')]],
  };
  // "Como a IA nos ajudou" e "Manifesto 2027" viraram os blocos Reflexão e Sucesso: as cenas avulsas continuam existindo, mas só aparecem para quem as colocar no roteiro
  const EXTRA_CENAS = ['ia', 'manifesto'];
  const cfGet = (o, k) => k.split('.').reduce((v, p) => (v == null ? v : v[p]), o);
  const cfSet = (o, k, v) => { const ps = k.split('.'); let t = o; ps.slice(0, -1).forEach(p => { t = t[p] = t[p] || {}; }); t[ps[ps.length - 1]] = v; };
  const linesOut = (list, f) => (list || []).map(x => f.cols.map(c => (f.map && f.map[c] ? f.map[c].out(x[c]) : x[c] ?? '')).join(' | ')).join('\n');
  const linesIn = (text, f) => String(text).split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const parts = l.split('|').map(x => x.trim()), row = /^\d+$/.test(f.cols[0]) ? [] : {};
    f.cols.forEach((c, i) => { const v = i === f.cols.length - 1 ? parts.slice(i).join(' | ') : parts[i] ?? ''; row[c] = f.map && f.map[c] ? f.map[c].in(v) : v; });
    return row;
  });
  function cenaField(f, cfg) {
    const v = cfGet(cfg, f.k), id = `cf-${f.k.replace(/\./g, '-')}`;
    if (f.t === 'sel') return `<label class="f">${esc(f.l)}<select class="input" id="${id}" data-cf="${f.k}">${f.opts.map(([val, l]) => `<option value="${esc(val)}" ${val === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    if (f.t === 'check') return `<label class="sw"><input type="checkbox" id="${id}" data-cf="${f.k}" ${v ? 'checked' : ''}> ${esc(f.l)}</label>`;
    if (f.t === 'area') return `<label class="f">${esc(f.l)}<textarea class="input" id="${id}" data-cf="${f.k}">${esc(v ?? '')}</textarea></label>`;
    if (f.t === 'list') return `<label class="f">${esc(f.l)}<textarea class="input" id="${id}" data-cf="${f.k}">${esc((v || []).join('\n'))}</textarea></label>`;
    if (f.t === 'lines') return `<label class="f">${esc(f.l)}<textarea class="input mono" id="${id}" data-cf="${f.k}" style="min-height:${Math.min(420, 60 + (v || []).length * 21)}px;white-space:pre;overflow-x:auto">${esc(linesOut(v, f))}</textarea></label>`;
    return `<label class="f">${esc(f.l)}<input class="input" id="${id}" data-cf="${f.k}" ${f.t === 'num' ? 'type="number" min="0"' : ''} value="${esc(v ?? '')}"></label>`;
  }
  // lê o formulário da seção aberta e devolve só o que o servidor entende
  function cenaCollect(sec) {
    const out = {}, [, , fields] = CENA_FORM[sec];
    for (const f of fields) {
      const el = document.querySelector(`[data-cf="${f.k}"]`); if (!el) continue;
      cfSet(out, f.k, f.t === 'check' ? el.checked : f.t === 'num' ? +el.value : f.t === 'list' ? el.value.split('\n').map(x => x.trim()).filter(Boolean) : f.t === 'lines' ? linesIn(el.value, f) : el.value);
    }
    const patch = { [sec]: out };
    if (sec === 'nuvem') for (const k of ['perguntas', 'perguntasPt', 'perguntasEs']) if (out[k]) out[k] = [out[k][0] || '', out[k][1] || '']; // as duas perguntas (em cada idioma) vão como lista
    if (sec === 'agenda') patch.atos = [0, 1, 2, 3].map(i => ($(`#cf-ato${i}`) || {}).value || '');
    if (sec === 'reconhecimento') out.premios = A.O.cenas.config.reconhecimento.premios.map((p, i) => { const g = k => ($(`#pf-${i}-${k}`) || {}).value ?? '';
      return { ic: g('ic'), n: g('n'), k: g('k'), porque: g('porque'), criterios: g('criterios').split('\n').map(x => x.trim()).filter(Boolean), indicados: linesIn(g('indicados'), { cols: ['nome', 'projeto'] }), vencedor: +g('vencedor') || 1, citacao: g('citacao') }; });
    return patch;
  }
  function vCenasCfg() {
    const C = A.O.cenas; if (!C || C.team) return ''; // (a senha das dinâmicas não recebe o conteúdo das cenas)
    const sec = CENA_FORM[A.cenaSec] ? A.cenaSec : 'agenda', [title, hint, fields] = CENA_FORM[sec], cfg = C.config[sec];
    A.cenaSec = sec;
    let extra = '';
    if (sec === 'agenda') extra = `<div class="grid" style="grid-template-columns:repeat(4,1fr);gap:10px">${C.config.atos.map((a, i) => `<label class="f">Ato ${['I', 'II', 'III', 'IV'][i]}<input class="input" id="cf-ato${i}" value="${esc(a)}"></label>`).join('')}</div>`;
    if (sec === 'reconhecimento') extra = cfg.premios.map((p, i) => { const f = (k, l, tag = 'input', v = p[k]) => `<label class="f">${l}${tag === 'area' ? `<textarea class="input" id="pf-${i}-${k}" ${k === 'indicados' ? 'style="min-height:110px"' : ''}>${esc(v)}</textarea>` : `<input class="input" id="pf-${i}-${k}" value="${esc(v)}">`}</label>`;
      return `<div class="card" style="margin-top:12px"><h2>Prêmio ${i + 1} · ${esc(p.n)}</h2><div class="form">
        <div class="grid" style="grid-template-columns:2fr 2fr 1fr;gap:10px">${f('n', 'Nome do prêmio')}${f('k', 'Categoria')}<label class="f">Ícone<select class="input" id="pf-${i}-ic">${[['i', '⚡ raio'], ['c', '👥 dupla'], ['b', '🔧 ferramenta'], ['f', '🕒 relógio']].map(([v, l]) => `<option value="${v}" ${p.ic === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
        ${f('porque', 'Por que este prêmio', 'area')}${f('criterios', 'Critérios, um por linha', 'area', p.criterios.join('\n'))}
        ${f('indicados', 'Indicados, um por linha: nome | projeto', 'area', p.indicados.map(x => `${x.nome} | ${x.projeto}`).join('\n'))}
        <label class="f">Vencedor: a posição na lista de indicados (1 = primeira linha)<input class="input" id="pf-${i}-vencedor" type="number" min="1" max="6" value="${p.vencedor}"><span class="small">Hoje: <b>${esc((p.indicados[p.vencedor - 1] || {}).nome || '?')}</b></span></label>
        ${f('citacao', 'Citação lida na revelação', 'area')}</div></div>`; }).join('');
    return `<div class="card"><h2>Agenda e cenas</h2>
        <p class="small">O conteúdo do deck do townhall, <b>em inglês</b> (como no deck original; as dinâmicas Conexões, Reflexão e Sucesso continuam em português). Cada seção é uma cena do roteiro; o que você salvar aqui vai para o telão e os celulares. <span class="mono">*Asteriscos*</span> marcam as palavras em destaque. Nas listas, uma linha por item, com as colunas separadas por <span class="mono"> | </span>.</p>
        <div class="subtabs" style="margin-top:10px;flex-wrap:wrap">${Object.keys(CENA_FORM).filter(k => !EXTRA_CENAS.includes(k) || k === sec || A.O.settings.steps.some(x => x.type === 'cena' && x.cena === k)).map(k => `<button class="${k === sec ? 'on' : ''}" data-act="cenaSec" data-sec="${k}">${esc(CENA_FORM[k][0])}</button>`).join('')}</div></div>
      <div class="card"><h2>${esc(title)}</h2>${hint ? `<p class="small" style="margin-bottom:10px">${esc(hint)}</p>` : ''}
        <div class="form">${extra && sec === 'agenda' ? extra : ''}${fields.map(f => cenaField(f, cfg)).join('')}
          ${['almanaque', 'visao', 'reconhecimento', 'capasucesso'].includes(sec) ? '<p class="small">Quem apresenta este bloco (nomes e fotos no telão): em <a href="#" data-go="cenas" data-sec="anfitrioes">Quem conduz cada bloco</a>.</p>' : ''}
          <div class="actions"><button class="btn" data-act="cenaSave">Salvar</button><button class="btn ghost sm" data-act="cenaReset" style="margin-left:auto">Restaurar o conteúdo original desta seção</button></div></div></div>
      ${sec === 'reconhecimento' ? `${extra}<div class="card"><div class="actions"><button class="btn" data-act="cenaSave">Salvar os prêmios</button></div></div>` : ''}`;
  }

  /* ---------- fotos de perfil ---------- */
  // abre o seletor de arquivos do computador (várias imagens de uma vez ou uma só)
  function pickFiles(multiple, cb) { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.multiple = !!multiple; i.onchange = () => cb([...i.files]); i.click(); }
  // prepara a foto para envio: imagens pequenas vão como estão; as grandes são reduzidas para um quadrado de 320 px (corte central)
  function photoData(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader(); r.onerror = () => reject(new Error(`Não consegui ler "${file.name}".`));
      r.onload = () => { const img = new Image(); img.onerror = () => reject(new Error(`"${file.name}" não é uma imagem que o navegador abre.`));
        img.onload = () => {
          if (file.size <= 150 * 1024 && Math.max(img.width, img.height) <= 400 && /image\/(jpeg|png|webp)/.test(file.type)) return resolve(r.result);
          const side = Math.min(img.width, img.height), out = Math.min(320, side), c = document.createElement('canvas'); c.width = c.height = out;
          c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, out, out); resolve(c.toDataURL('image/jpeg', .88));
        }; img.src = r.result; };
      r.readAsDataURL(file);
    });
  }
  function importPhotosDialog() {
    dialog(`<h3>📷 Importar fotos de perfil</h3>
      <p class="small">Escolha todas as fotos de uma vez. O <b>nome de cada arquivo</b> diz de quem é a foto: pode ser o nome completo, só uma parte ou o apelido (<span class="mono">claudia guid.jpg</span>, <span class="mono">will.jpg</span>, <span class="mono">Alex Gonçalves.jpg</span>). Quem já tem foto e aparece de novo fica com a nova.</p>
      <div class="actions" style="margin-top:12px"><button class="btn" id="phPick">Escolher as fotos…</button><button class="btn ghost" data-close>Fechar</button></div>
      <div id="phReport" style="margin-top:12px"></div>`, () => {
      $('#phPick').onclick = () => pickFiles(true, async files => {
        const rep = $('#phReport'); if (!files.length) return;
        const tot = { matched: [], unmatched: [], missing: [] };
        try {
          for (let i = 0; i < files.length; i += 12) { // em lotes, para o envio não ficar pesado
            rep.innerHTML = `<p class="small">Enviando ${Math.min(i + 12, files.length)} de ${files.length}…</p>`;
            const batch = []; for (const f of files.slice(i, i + 12)) { try { batch.push({ name: f.name, data: await photoData(f) }); } catch (e) { tot.unmatched.push({ file: f.name, reason: e.message }); } }
            const r = await api('POST', '/api/admin/photos', { files: batch }); tot.matched.push(...r.matched); tot.unmatched.push(...r.unmatched); tot.missing = r.missing;
          }
        } catch (e) { rep.innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
        rep.innerHTML = `<p class="ok">✔ ${tot.matched.length} ${tot.matched.length === 1 ? 'foto associada' : 'fotos associadas'}.</p>
          ${tot.unmatched.length ? `<p class="warn" style="margin-top:8px">${tot.unmatched.length} ${tot.unmatched.length === 1 ? 'arquivo ficou' : 'arquivos ficaram'} sem dono:</p><ul class="small" style="margin:4px 0 0 18px">${tot.unmatched.map(u => `<li><b>${esc(u.file)}</b> · ${esc(u.reason)}</li>`).join('')}</ul><p class="small" style="margin-top:6px">Para esses, adicione a pessoa na lista e importe de novo, ou use o botão "📷 foto" na linha da pessoa.</p>` : ''}
          ${tot.missing.length ? `<p class="small" style="margin-top:8px">Ainda sem foto: <b>${esc(tot.missing.join(', '))}</b>.</p>` : '<p class="small" style="margin-top:8px">Todo mundo da lista tem foto.</p>'}
          ${det('phList', `Ver quem recebeu qual arquivo (${tot.matched.length})`, `<ul class="small" style="margin:6px 0 0 18px">${tot.matched.map(m => `<li>${esc(m.file)} → <b>${esc(m.person)}</b></li>`).join('')}</ul>`)}`;
      });
    });
  }

  function vPeople() {
    const O = A.O, q = A.peopleQ.trim().toLowerCase();
    const list = O.people.filter(p => !q || [p.name, p.email, p.area, p.wl, p.team, p.manager].join(' ').toLowerCase().includes(q));
    const n = { total: O.people.length, active: O.people.filter(p => p.active).length, in: O.people.filter(p => p.active && p.checkedInAt).length, form: O.people.filter(p => p.hasForm).length, photo: O.people.filter(p => p.photo).length };
    const noPhoto = O.people.filter(p => p.active && !p.photo);
    return `
      <div class="card"><div class="stats">
        <div class="stat"><b>${n.total}</b><span class="small">na lista</span></div>
        <div class="stat"><b>${n.active}</b><span class="small">participando</span></div>
        <div class="stat"><b>${n.in}</b><span class="small">a bordo (check-in)</span></div>
        <div class="stat"><b>${n.form}</b><span class="small">com respostas do forms</span></div>
        <div class="stat"><b>${n.photo}</b><span class="small">com foto de perfil</span></div>
      </div></div>
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <h2 style="margin:0">Pessoas</h2>
          <div class="actions">
            <button class="btn sm" data-act="addPerson">+ Adicionar</button>
            <button class="btn sm cyan" data-act="importPeople">📋 Importar lista</button>
            <button class="btn sm cyan" data-act="importForm">📝 Importar forms</button>
            <button class="btn sm cyan" data-act="importPhotos">📷 Importar fotos</button>
            <button class="btn sm ghost" data-act="exportCsv">⬇ Exportar CSV</button>
          </div>
        </div>
        <p class="small" style="margin-top:6px">Área e WL ficam só aqui no painel (para o sorteio): os viajantes não veem esses dados uns dos outros.</p>
        <p class="small" style="margin-top:4px">📷 A foto de perfil aparece no lugar das iniciais (no celular, no telão e aqui). ${n.photo ? (noPhoto.length ? `Sem foto: <b>${esc(noPhoto.map(p => p.name).join(', '))}</b>.` : 'Todo mundo tem foto.') : 'Ninguém tem foto ainda: use "Importar fotos".'}</p>
        ${O.fotosSeed === 'locked' ? '<div class="sb-warn" style="margin-top:8px">🔒 As fotos que acompanham o app não foram abertas: falta a variável de ambiente <span class="mono">FOTOS_KEY</span> no servidor (ou ela está diferente da usada para criar o pacote). Enquanto isso, dá para usar "Importar fotos".</div>' : ''}
        <input class="input search" id="peopleQ" placeholder="Buscar nome, área, WL…" value="${esc(A.peopleQ)}" style="margin:10px 0">
        <div class="tblwrap"><table class="tbl">
          <tr><th>Nome</th><th>WL</th><th>Área</th><th>Time</th><th>Gestor</th><th>Status</th><th>Forms</th><th class="r">Ações</th></tr>
          ${list.map(p => `<tr style="${p.active ? '' : 'opacity:.45'}">
            <td>${av(p)}<b>${esc(p.name)}</b><div class="small">${esc(p.email)}</div></td>
            <td><span class="tag">${esc(p.wl || '—')}</span></td>
            <td><span class="tag area" style="--c:${color(p.area)}">${esc(p.area || '—')}</span></td>
            <td class="small">${esc(p.team)}</td><td class="small">${esc(p.manager)}</td>
            <td>${!p.active ? '<span class="bad">ausente</span>' : p.checkedInAt ? `<span class="ok">a bordo</span>${p.late ? ' <span class="warn">(fora das rotas)</span>' : ''}` : '<span class="x">sem check-in</span>'}</td>
            <td>${p.hasForm ? `<button class="btn xs ghost" data-act="viewForm" data-id="${p.id}">ver</button>` : '<span class="x">—</span>'}</td>
            <td class="r"><div class="actions" style="justify-content:flex-end">
              <button class="btn xs ghost" data-act="editPerson" data-id="${p.id}">editar</button>
              <button class="btn xs ghost" data-act="personPhoto" data-id="${p.id}" title="Escolher a foto de perfil desta pessoa">📷 ${p.photo ? 'trocar foto' : 'foto'}</button>${p.photo ? `<button class="btn xs ghost" data-act="personPhotoDel" data-id="${p.id}" title="Tirar a foto (voltam as iniciais)">sem foto</button>` : ''}
              <button class="btn xs ghost" data-act="toggleCheckin" data-id="${p.id}" data-v="${p.checkedInAt ? 0 : 1}">${p.checkedInAt ? 'desfazer check-in' : 'check-in manual'}</button>
              <button class="btn xs ghost" data-act="toggleActive" data-id="${p.id}" data-v="${p.active ? 0 : 1}">${p.active ? 'marcar ausente' : 'reativar'}</button>
              <button class="btn xs red" data-act="deletePerson" data-id="${p.id}">excluir</button>
            </div></td></tr>`).join('')}
        </table></div>
      </div>`;
  }

  // Banco de perguntas das Conexões: três categorias (Quebra-gelo, Conexão, Além do óbvio), sorteadas para cada dupla
  const CAT_ORDER = ['quebragelo', 'conexao', 'alem'];
  const catName = k => { const c = (A.O.cats || {})[k]; return c ? `${c.dot} ${c.name}` : k; };
  function vQuestions() {
    const O = A.O, byCat = {}, mix = O.settings.questionMode === 'mix';
    O.questions.forEach(q => { (byCat[q.cat] = byCat[q.cat] || []).push(q); });
    return `
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <h2 style="margin:0">Banco de perguntas (${O.questions.length} · ${O.questions.filter(q => q.active).length} ativas)</h2>
          <div class="actions">
            <button class="btn sm" data-act="addQuestion">+ Nova pergunta</button>
            <button class="btn sm cyan" data-act="bulkQuestions">📋 Substituir em massa</button>
            <button class="btn sm ghost" data-act="resetQuestions">↺ Restaurar banco padrão</button>
          </div>
        </div>
        <p class="small" style="margin-top:8px">Cada pergunta tem a versão em português e em espanhol: a dupla vê a mesma pergunta, cada pessoa no idioma que escolheu no login.</p>
        <p class="small" style="margin-top:8px">As perguntas são <b>sorteadas</b>: cada dupla recebe a sua própria ordem e ninguém recebe a mesma pergunta duas vezes. No celular aparece só a pergunta (sem "pergunta 2 de 10").</p>
        <div class="actions" style="margin-top:10px;align-items:center"><span class="small">Como sortear:</span>
          <button class="btn sm ${mix ? 'ghost' : ''}" data-act="questionMode" data-mode="rodada" title="Viagem 1: Quebra-gelo · Viagem 2: Conexão · Viagem 3: Além do óbvio. Dentro da categoria, a ordem é sorteada para cada dupla.">Uma categoria por viagem</button>
          <button class="btn sm ${mix ? '' : 'ghost'}" data-act="questionMode" data-mode="mix" title="Em toda viagem a dupla recebe as três categorias misturadas: uma de cada, em ordem sorteada.">As três categorias misturadas</button>
        </div>
        <p class="small" style="margin-top:8px">${mix ? 'Agora: em toda viagem a dupla recebe as três categorias intercaladas (uma de cada, em ordem sorteada).' : 'Agora: viagem 1 sorteia do <b>Quebra-gelo</b>, viagem 2 da <b>Conexão</b> e viagem 3 do <b>Além do óbvio</b>. Se a dupla passar por todas as da categoria, entram as outras.'}</p>
      </div>
      ${CAT_ORDER.map(k => `<div class="card"><h2>${esc(catName(k))} <span class="small">(${(byCat[k] || []).length})</span></h2><p class="small" style="margin:-4px 0 8px">${esc(((O.cats || {})[k] || {}).hint || '')}</p>
        <table class="tbl">${(byCat[k] || []).map(q => `<tr style="${q.active ? '' : 'opacity:.45'}"><td>${esc(q.text)}${q.es ? `<div class="small">ES · ${esc(q.es)}</div>` : '<div class="small warn">sem versão em espanhol</div>'}</td><td class="r" style="white-space:nowrap"><div class="actions" style="justify-content:flex-end">
          <button class="btn xs ghost" data-act="editQuestion" data-id="${q.id}">editar</button>
          <button class="btn xs ghost" data-act="toggleQuestion" data-id="${q.id}" data-v="${q.active ? 0 : 1}">${q.active ? 'desativar' : 'ativar'}</button>
          <button class="btn xs red" data-act="deleteQuestion" data-id="${q.id}">excluir</button></div></td></tr>`).join('') || '<tr><td class="muted">Nenhuma pergunta nesta categoria.</td></tr>'}</table></div>`).join('')}`;
  }

  // Acesso: as duas senhas, os endereços e o modo confidencial
  function accessCard() {
    const O = A.O, conf = O.settings.confidencial !== false, o = esc(location.origin);
    if (team()) return `<div class="card"><h2>Acesso</h2><p class="small">Você entrou com a <b>senha das dinâmicas</b>: este painel alcança só Conexões, Reflexão e Sucesso. Link do app para os viajantes: <span class="mono">${o}/</span> · Telão: <span class="mono">${o}/telao.html</span></p>
      <div class="actions" style="margin-top:10px"><button class="btn ghost sm" data-act="logout">Sair do painel</button></div></div>`;
    return `<div class="card"><h2>🔐 Acesso e modo confidencial</h2>
      <p class="small"><b>Senha mestra</b> (variável <span class="mono">ADMIN_PASSWORD</span> no servidor): abre este Painel do Doc completo, em <span class="mono">${o}/admin.html</span>.</p>
      <p class="small" style="margin-top:6px"><b>Senha das dinâmicas</b> (variável <span class="mono">DINAMICAS_PASSWORD</span>): abre o painel só com Conexões, Reflexão e Sucesso, em <span class="mono copy" data-act="copy" data-text="${o}/dinamicas" title="Clique para copiar">${o}/dinamicas 📋</span>. Quem entra com ela não vê o roteiro, a agenda, as cenas, os prêmios nem a estratégia, e não consegue mexer neles. ${O.team ? '<span class="ok">✔ ligada</span>' : '<span class="warn">⚠ ainda não definida no servidor: hoje só a senha mestra entra</span>'}</p>
      <p class="small" style="margin-top:6px"><b>Modo confidencial:</b> ${conf ? '<span class="warn">🔒 ligado</span>. As cenas do townhall (vídeo, boas-vindas, plano de voo, Jornada 2026, prêmios, estratégia 2027, créditos) só aparecem neste painel e no telão aberto neste navegador. Os celulares e os outros telões veem “olhe para o telão”.' : '<span class="ok">🔓 liberado</span>. Quando uma cena entra no ar, todos os celulares e telões a veem (é assim no dia do evento).'}</p>
      <div class="actions" style="margin-top:10px"><button class="btn ${conf ? '' : 'ghost'} sm" data-act="confSet" data-on="${conf ? '' : 1}">${conf ? '🔓 Liberar para todos (dia do evento)' : '🔒 Voltar ao modo confidencial'}</button><button class="btn ghost sm" data-act="logout">Sair do painel</button></div>
      <p class="small" style="margin-top:8px">Link do app para os viajantes: <span class="mono">${o}/</span> · Telão: <span class="mono">${o}/telao.html</span> (abra o telão neste navegador, já logado).</p></div>`;
  }
  function vConfig() {
    const O = A.O, s = O.settings;
    if (team()) return `
      <div class="grid">
        <div class="card"><h2>Tempos das viagens (Conexões)</h2><div class="form">
          <label class="sw"><input type="checkbox" id="cfgAuto" ${s.autoFlow ? 'checked' : ''}> Fluxo automático (encontro → conversa → próxima dupla → avaliação, sem precisar liberar)</label>
          <label class="f">Conversa de cada viagem (segundos)<input class="input" id="cfgSeconds" type="number" min="10" max="3600" value="${s.roundSeconds}"><span class="small">120 = 2 minutos</span></label>
          <label class="f">Tempo para a dupla se encontrar (segundos)<input class="input" id="cfgFind" type="number" min="0" max="600" value="${s.findSeconds}"></label>
          <label class="f">Intervalo "88 MPH" entre viagens (segundos)<input class="input" id="cfgBreak" type="number" min="0" max="120" value="${s.breakSeconds}"></label>
          <label class="f">Avaliação fecha em (segundos)<input class="input" id="cfgRanking" type="number" min="0" max="1800" value="${s.rankingSeconds}"><span class="small">Fecha antes se todos avaliarem. 0 = só quando você clicar em "Calcular".</span></label>
          <label class="sw"><input type="checkbox" id="cfgHints" ${s.showFormHints ? 'checked' : ''}> Mostrar respostas do forms na tela da dupla ("para puxar assunto")</label>
          <div class="actions"><button class="btn" data-act="saveSettings">Salvar</button></div>
        </div></div>
        ${accessCard()}
      </div>`;
    return `
      <div class="grid">
        <div class="card"><h2>Tempos das viagens</h2><div class="form">
          <label class="sw"><input type="checkbox" id="cfgAuto" ${s.autoFlow ? 'checked' : ''}> Fluxo automático (encontro → conversa → próxima dupla → avaliação, sem precisar liberar)</label>
          <label class="f">Conversa de cada viagem (segundos)<input class="input" id="cfgSeconds" type="number" min="10" max="3600" value="${s.roundSeconds}"><span class="small">120 = 2 minutos</span></label>
          <label class="f">Tempo para a dupla se encontrar (segundos)<input class="input" id="cfgFind" type="number" min="0" max="600" value="${s.findSeconds}"><span class="small">0 = a conversa começa na hora em que a dupla aparece</span></label>
          <label class="f">Intervalo "88 MPH" entre viagens (segundos)<input class="input" id="cfgBreak" type="number" min="0" max="120" value="${s.breakSeconds}"></label>
          <label class="f">Avaliação fecha em (segundos)<input class="input" id="cfgRanking" type="number" min="0" max="1800" value="${s.rankingSeconds}"><span class="small">Fecha antes se todos avaliarem. 0 = só quando você clicar em "Calcular".</span></label>
          <div class="actions"><button class="btn" data-act="saveSettings">Salvar</button></div>
        </div></div>
        <div class="card"><h2>Textos</h2><div class="form">
          <label class="f">Nome do evento<input class="input" id="cfgName" value="${esc(s.eventName)}"></label>
          <label class="f">Boas-vindas (check-in)<textarea class="input" id="cfgWelcome">${esc(s.welcomeText)}</textarea></label>
          <label class="f">Olhos no telão<textarea class="input" id="cfgStandby">${esc(s.standbyText || '')}</textarea></label>
          <label class="f">Encerramento<textarea class="input" id="cfgClosing">${esc(s.closingText)}</textarea></label>
          <p class="small">A agenda do dia (plano de voo), os textos das cenas e os créditos ficam em <a href="#" data-go="cenas">Agenda e cenas</a>.</p>
          <label class="sw"><input type="checkbox" id="cfgHints" ${s.showFormHints ? 'checked' : ''}> Mostrar respostas do forms na tela da dupla ("para puxar assunto")</label>
          <div class="actions"><button class="btn" data-act="saveSettings">Salvar</button></div>
        </div></div>
        <div class="card"><h2>Som e blocos de fala</h2><div class="form">
          <label class="f">Onde o som toca<select class="input" id="cfgAudioOut"><option value="telao" ${(O.state.audio || {}).out !== 'painel' ? 'selected' : ''}>No computador do telão (página /telao.html)</option><option value="painel" ${(O.state.audio || {}).out === 'painel' ? 'selected' : ''}>Neste computador (Painel do Doc)</option></select><span class="small">No telão, clique uma vez na tela para o navegador liberar o som.</span></label>
          <label class="f">Música própria (opcional)<input class="input" id="cfgMusicUrl" value="${esc(s.musicUrl || '')}" placeholder="https://… .mp3"><span class="small">Endereço de um arquivo de áudio para o botão "Música". Vazio = música original do app.</span></label>
          <label class="f">Trilha de fundo própria (opcional)<input class="input" id="cfgAmbientUrl" value="${esc(s.ambientUrl || '')}" placeholder="https://… .mp3"></label>
          <label class="f">Texto dos blocos de fala (celular)<input class="input" id="cfgStageText" value="${esc(s.stageText || '')}"></label>
          <label class="sw"><input type="checkbox" id="cfgStageMutes" ${s.stageMutes ? 'checked' : ''}> Desligar o som ao exibir um bloco de fala</label>
          <label class="sw"><input type="checkbox" id="cfgTransitions" ${s.transitions !== false ? 'checked' : ''}> Transições do filme ao trocar de bloco (alguns segundos, no telão e nos celulares)</label>
          <p class="small">Com isto ligado, cada passo decide se entra com a transição ou direto: escolha em <a href="#" data-go="roteiro">Roteiro</a> (botão ⚡ transição / ⏭ direto).</p>
          <label class="f">Idioma do app no celular<select class="input" id="cfgAppLang"><option value="pessoa" ${s.appLang === 'en' ? '' : 'selected'}>O que cada pessoa escolhe na entrada: Português, Español ou English</option><option value="en" ${s.appLang === 'en' ? 'selected' : ''}>Sempre em inglês (a escolha vale só para as dinâmicas e para as duas perguntas)</option></select><span class="small">A escolha do idioma é a primeira tela do app. As dinâmicas (Conexões, Reflexão e Sucesso) existem em português e espanhol: quem escolhe English as vê em português. O telão e o conteúdo do deck continuam em inglês.</span></label>
          <label class="f">Duração da transição entre blocos (segundos)<input class="input" id="cfgTransSecs" type="number" min="3" max="30" value="${s.transitionSeconds || 8}"><span class="small">8 = sequência completa, em ritmo rápido (programar o destino, Flux Capacitor, 88 MPH, raios); 15 = a mesma sequência, mais lenta. Menos de 7 = versão curta. Avisos e "olhos no telão" entram sempre em 3 s. No telão, a tecla Esc pula a transição.</span></label>
          <div class="actions"><button class="btn" data-act="saveSettings">Salvar</button></div>
        </div></div>
        <div class="card"><h2>🎧 Spotify</h2><div class="form">
          <p class="small">Para a música do evento ser a que você escolher no <b>seu Spotify</b>: o painel mostra o que está tocando, dá play e pausa, abre as suas playlists e busca músicas. O Spotify exige <b>conta Premium</b> e uma preparação de uns 5 minutos, uma vez só:</p>
          <ol class="small steps">
            <li>Abra <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener">developer.spotify.com/dashboard</a>, entre com a sua conta do Spotify e clique em <b>Create app</b>.</li>
            <li>Dê um nome qualquer (ex.: Townhall). Em <b>Redirect URIs</b>, cole exatamente este endereço e clique em Add: <span class="mono copy" data-act="copy" data-text="${esc(location.origin)}/admin.html" title="Clique para copiar">${esc(location.origin)}/admin.html 📋</span></li>
            <li>Em "Which API/SDKs are you planning to use?", marque <b>Web API</b> e <b>Web Playback SDK</b>. Salve.</li>
            <li>Na página do app, copie o <b>Client ID</b> e cole no campo abaixo. Clique em Salvar e depois em <b>Conectar ao Spotify</b>.</li>
          </ol>
          <p class="small">Quem vai conectar é a mesma pessoa que criou o app? Então está pronto. Se for outra pessoa, o dono do app precisa incluí-la em <b>User Management</b> na mesma página (até 5 pessoas).${/^https:|^http:\/\/127\.0\.0\.1/.test(location.origin) ? '' : ' <b style="color:var(--amber)">Atenção: o Spotify só aceita endereços https (ou http://127.0.0.1). Abra o painel pelo endereço https para conectar.</b>'}</p>
          <label class="f">Client ID do app do Spotify<input class="input mono" id="cfgSpotifyId" value="${esc(s.spotifyClientId || '')}" placeholder="32 letras e números" autocomplete="off" spellcheck="false"></label>
          <label class="sw"><input type="checkbox" id="cfgSpotifyBreak" ${s.spotifyBreak ? 'checked' : ''}> No intervalo, tocar o meu Spotify em vez da música do app</label>
          <div class="actions" style="align-items:center"><button class="btn" data-act="saveSettings">Salvar</button><span id="spCfgState" style="display:inline-flex;gap:8px;align-items:center;flex-wrap:wrap">${spCfgState()}</span></div>
          <p class="small">A conexão fica guardada só neste navegador (o servidor do townhall não vê a sua conta). No dia, use o mesmo computador e navegador em que conectou. A música sai do aparelho em que o seu Spotify estiver tocando (celular ligado na caixa de som, computador…) ou deste computador, com "Tocar neste computador".</p>
        </div></div>
        ${accessCard()}
      </div>`;
  }

  function vTests() {
    return `
      <div class="card"><h2>Modo teste / ensaio</h2><p class="small" style="margin-bottom:12px">Para ensaiar a dinâmica sem todo mundo na sala. Nada disso é necessário no dia.</p>
        <div class="actions">
          <button class="btn cyan" data-act="testCheckinAll">✔ Check-in de todos</button>
          <button class="btn cyan" data-act="demoTime">⏱ Modo demo (10s encontro · 30s conversa · 3s intervalo · 30s avaliação)</button>
          <button class="btn ghost" data-act="normalTime">⏱ Tempos normais (40s encontro · 2 min conversa · 6s intervalo · 2 min avaliação)</button>
          <button class="btn cyan" data-act="testRandomRankings">🎲 Avaliações aleatórias (na fase de avaliação)</button>
        </div></div>
      ${team() ? '' : `<div class="card"><h2>🎤 Microfone dos aplausos (Reconhecimento)</h2>
        <p class="small" style="margin-bottom:4px">Na cerimônia dos prêmios, os aplausos da sala carregam o Flux Capacitor do telão. Quem ouve é o microfone <b>deste aparelho</b>. Libere aqui uma vez, antes do evento, no mesmo computador e navegador que você vai usar no dia; depois é automático.</p>
        ${micBox('test')}</div>`}
      <div class="card"><h2>↺ Reiniciar</h2>
        <p class="small" style="margin-bottom:10px">${team() ? 'Depois do ensaio, reinicie o bloco que você testou (Conexões, Reflexão ou cada dinâmica do Sucesso). O que foi preparado (pessoas, fotos e perguntas) não é apagado.' : 'Depois do ensaio, reinicie tudo para o evento começar do zero. Dá para reiniciar tudo de uma vez ou um bloco por vez; o que foi preparado (pessoas, fotos, perguntas, roteiro e textos) não é apagado.'}</p>
        <div class="actions">
          <button class="btn red" data-act="resetOpen">${team() ? '↺ Reiniciar um bloco…' : '↺ Reiniciar tudo ou um bloco…'}</button>
        </div>
        ${team() ? '' : '<p class="small" style="margin-top:8px">Resetar o evento volta o roteiro para o primeiro passo e apaga check-ins, as respostas da nuvem de palavras, duplas, avaliações, as respostas do Sucesso e o feedback (bom para usar depois do ensaio). A lista de pessoas, as perguntas e o roteiro são mantidos.</p>'}</div>`;
  }

  /* ---------- diálogos ---------- */
  function dialog(html, onMount) {
    const d = $('#dlg'); $('#dlgBody').innerHTML = html; const m = $('#dlgMsg'); if (m) m.remove(); d.classList.remove('wide'); if (!d.open) d.showModal(); if (onMount) onMount(d);
  }
  const closeDialog = () => $('#dlg').close();
  function personForm(p = {}) {
    return `<h3>${p.id ? 'Editar viajante' : 'Novo viajante'}</h3><div class="form two">
      <label class="f">Nome<input class="input" id="fName" value="${esc(p.name || '')}"></label>
      <label class="f">E-mail<input class="input" id="fEmail" value="${esc(p.email || '')}"></label>
      <label class="f">WL<select class="input" id="fWl">${['', ...WLS, ...(p.wl && !WLS.includes(p.wl) ? [p.wl] : [])].map(w => `<option value="${esc(w)}" ${(p.wl || '') === w ? 'selected' : ''}>${esc(w) || '—'}</option>`).join('')}</select></label>
      <label class="f">Área<input class="input" id="fArea" value="${esc(p.area || '')}" list="areas"><datalist id="areas">${[...new Set(A.O.people.map(x => x.area).filter(Boolean))].map(a => `<option value="${esc(a)}">`).join('')}</datalist></label>
      <label class="f">Time<input class="input" id="fTeam" value="${esc(p.team || '')}"></label>
      <label class="f">Gestor(a)<input class="input" id="fManager" value="${esc(p.manager || '')}"></label>
    </div><div class="actions" style="margin-top:12px"><button class="btn" id="fSave">Salvar</button><button class="btn ghost" data-close>Cancelar</button></div>`;
  }
  const personFromForm = () => ({ name: $('#fName').value, email: $('#fEmail').value, wl: $('#fWl').value, area: $('#fArea').value, team: $('#fTeam').value, manager: $('#fManager').value });

  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/)[0] || '';
    const delim = [['\t', (firstLine.match(/\t/g) || []).length], [';', (firstLine.match(/;/g) || []).length], [',', (firstLine.match(/,/g) || []).length]].sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], field = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += ch; }
      else if (ch === '"') inQ = true;
      else if (ch === delim) { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
      else field += ch;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    const clean = rows.filter(r => r.some(c => String(c).trim()));
    if (!clean.length) return { headers: [], rows: [] };
    const headers = clean[0].map(h => String(h).trim());
    return { headers, rows: clean.slice(1).map(r => Object.fromEntries(headers.map((h, i) => [h, String(r[i] ?? '').trim()]))) };
  }
  const findCol = (headers, ...pats) => headers.find(h => pats.some(p => p.test(h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))));

  function importPeopleDialog() {
    dialog(`<h3>Importar lista de pessoas</h3><p class="small">Cole a tabela do Excel (com cabeçalho: Name, Email, WL, Team, Line Manager, Area) ou um CSV.</p>
      <textarea class="input" id="impText" style="min-height:160px;margin:10px 0" placeholder="#	Name	Email	WL	Team	Line Manager	Area&#10;1	Fulana	fulana@…	WL2	CDIO BPC	Ciclano	Consumer"></textarea>
      <div class="actions"><button class="btn ghost" id="impPreview">Pré-visualizar</button></div><div id="impOut" style="margin-top:10px"></div>`, () => {
      let parsed = null;
      $('#impPreview').onclick = () => {
        const { headers, rows } = parseCSV($('#impText').value);
        const cName = findCol(headers, /^(name|nome)/), cEmail = findCol(headers, /mail/), cWl = findCol(headers, /^wl|work ?level|cargo|nivel/), cTeam = findCol(headers, /^(team|time|equipe)/), cMgr = findCol(headers, /manager|gestor|lider|líder/), cArea = findCol(headers, /^(area|área)/);
        if (!cName) { $('#impOut').innerHTML = '<p class="bad">Não encontrei a coluna de nome.</p>'; return; }
        parsed = rows.map(r => ({ name: r[cName], email: cEmail ? r[cEmail] : '', wl: cWl ? r[cWl] : '', team: cTeam ? r[cTeam] : '', manager: cMgr ? r[cMgr] : '', area: cArea ? r[cArea] : '' })).filter(r => r.name);
        $('#impOut').innerHTML = `<p class="small">${parsed.length} pessoas encontradas. Colunas: nome=${esc(cName)}, email=${esc(cEmail || '—')}, WL=${esc(cWl || '—')}, área=${esc(cArea || '—')}.</p>
          <pre class="code">${esc(parsed.slice(0, 5).map(r => `${r.name} · ${r.wl} · ${r.area}`).join('\n'))}${parsed.length > 5 ? '\n…' : ''}</pre>
          <div class="actions"><button class="btn" id="impMerge">Mesclar com a lista atual</button><button class="btn red" id="impReplace">Substituir toda a lista</button></div>`;
        $('#impMerge').onclick = () => run(async () => { const r = await api('POST', '/api/admin/people/import', { rows: parsed, mode: 'merge' }); toast(`Importado: ${r.inserted} novas, ${r.updated} atualizadas.`); closeDialog(); });
        $('#impReplace').onclick = () => confirmRun('Substituir TODA a lista? Isso também apaga duplas, avaliações e resultados.', async () => { const r = await api('POST', '/api/admin/people/import', { rows: parsed, mode: 'replace' }); toast(`Lista substituída: ${r.inserted} pessoas.`); closeDialog(); });
      };
    });
  }
  function importFormDialog() {
    dialog(`<h3>Importar respostas do forms</h3><p class="small">Exporte as respostas do Microsoft Forms / Google Forms como CSV (ou copie a planilha) e cole abaixo. As respostas de cada pessoa aparecem na tela da dupla como "para puxar assunto".</p>
      <textarea class="input" id="frmText" style="min-height:160px;margin:10px 0" placeholder="Email,Qual seu hobby?,Lugar favorito&#10;fulana@unilever.com,Corrida,Chapada"></textarea>
      <div class="actions"><button class="btn ghost" id="frmPreview">Pré-visualizar</button></div><div id="frmOut" style="margin-top:10px"></div>`, () => {
      $('#frmPreview').onclick = () => {
        const { headers, rows } = parseCSV($('#frmText').value);
        if (!headers.length) { $('#frmOut').innerHTML = '<p class="bad">Nada para importar.</p>'; return; }
        const guess = headers.find(h => rows.some(r => /@/.test(r[h] || ''))) || findCol(headers, /mail/, /^(name|nome)/) || headers[0];
        $('#frmOut').innerHTML = `<p class="small">${rows.length} respostas · ${headers.length} colunas.</p>
          <label class="f">Coluna que identifica a pessoa (e-mail ou nome)<select class="input" id="frmKey">${headers.map(h => `<option value="${esc(h)}" ${h === guess ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select></label>
          <pre class="code" style="margin-top:8px">${esc(headers.join(' | '))}</pre>
          <div class="actions"><button class="btn" id="frmGo">Importar respostas</button></div>`;
        $('#frmGo').onclick = () => run(async () => {
          const r = await api('POST', '/api/admin/form/import', { rows, keyColumn: $('#frmKey').value });
          $('#frmOut').innerHTML = `<p class="ok">✔ ${r.matched} pessoas atualizadas.</p>${r.unmatched.length ? `<p class="warn">Não encontrados (${r.unmatched.length}): ${esc(r.unmatched.join(', '))}</p>` : ''}<div class="actions" style="margin-top:8px"><button class="btn ghost" data-close>Fechar</button></div>`;
        });
      };
    });
  }
  function exportCsv() {
    const rows = [['Nome', 'Email', 'WL', 'Time', 'Gestor', 'Área', 'Participa', 'Check-in', 'Avaliou'], ...A.O.people.map(p => [p.name, p.email, p.wl, p.team, p.manager, p.area, p.active ? 'sim' : 'não', p.checkedInAt || '', p.ranked ? 'sim' : 'não'])];
    const csv = '﻿' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'viajantes.csv'; a.click();
  }

  /* ---------- ações ---------- */
  async function onAction(el) {
    const act_ = el.dataset.act, id = el.dataset.id, O = A.O;
    switch (act_) {
      case 'generate': return confirmRun(O.state.conn.generatedAt ? 'Sortear de novo TODAS as duplas? As atuais serão descartadas.' : `Sortear as duplas com ${O.counts.checkedIn} viajantes a bordo?`, async () => { const r = await act('generate', { fromRound: 1 }); toast(`Duplas sorteadas · ${r.worstLabel}`); });
      case 'startJourney': return confirmRun(`Iniciar as viagens agora com ${O.counts.checkedIn} pessoas a bordo?${O.state.conn.generatedAt ? '' : ' As duplas serão sorteadas.'}`, () => act('startJourney'), 'Viagem 1 começou ⚡');
      case 'regenRest': { const from = O.state.conn.phase === 'matching' ? O.state.conn.round : O.state.conn.round + 1; if (from > 3) return toast('Não há viagens restantes para recalcular.', true); return confirmRun(`Recalcular as duplas da${from < 3 ? 's viagens' : ' viagem'} ${from < 3 ? `${from} a 3` : '3'} com quem está a bordo agora? As viagens já realizadas não mudam.`, async () => { const r = await act('generate', { fromRound: from }); toast(`Viagens ${from}–3 recalculadas · ${r.worstLabel}`); }); }
      case 'reveal': return run(() => act('reveal', { round: +el.dataset.round }), `Duplas da viagem ${el.dataset.round} reveladas`);
      case 'startTalk': return run(() => act('startTalk'), 'Conversa iniciada');
      case 'pause': return run(() => act('pause'));
      case 'resume': return run(() => act('resume'));
      case 'addTime': return run(() => act('addTime', { seconds: 30 }), '+30 segundos');
      case 'skip': return confirmRun('Pular a etapa atual agora?', () => act('skip'));
      case 'endTalk': return confirmRun('Encerrar a conversa agora?', () => act('endTalk'));
      case 'openRanking': return confirmRun('Abrir a avaliação em todos os celulares?', () => act('openRanking'), 'Avaliação aberta');
      case 'computeResults': return confirmRun('Calcular as conexões e notificar todos os celulares agora?', () => act('computeResults'), 'Conexões enviadas ⚡');
      case 'setBlock': return run(() => act('setBlock', { block: el.dataset.block }));
      case 'setScene': return run(() => act('setScene', { scene: el.dataset.scene }));
      case 'toggleMutual': return run(() => act('settings', { settings: { showMutualOnScreen: el.checked } }));
      case 'resetConnections': return confirmRun('Reiniciar as Conexões? Apaga duplas, avaliações e resultados. Os check-ins ficam.', () => resetScope('connections'), 'Conexões reiniciadas');
      case 'resetOpen': return resetDialog();
      case 'resetOne': { // "Reiniciar este bloco", no passo aberto no Ao vivo
        const x = O.settings.steps.find(y => y.id === id), r = x && resetInfo(x); if (!r) return;
        if (!r.dirty) return toast('Este bloco já está no começo.');
        return confirmRun(`Reiniciar ${stepTitle(x)}? ${r.what} Não dá para desfazer.`, () => resetScope(r.scope), `${stepTitle(x)}: reiniciado`);
      }
      case 'testCheckinAll': return run(() => act('testCheckinAll'), 'Check-in de todos feito');
      case 'testRandomRankings': return run(() => act('testRandomRankings'), 'Avaliações aleatórias enviadas');
      case 'demoTime': return run(() => act('settings', { settings: { roundSeconds: 30, findSeconds: 10, breakSeconds: 3, rankingSeconds: 30 } }), 'Modo demo: tempos curtos');
      case 'normalTime': return run(() => act('settings', { settings: { roundSeconds: 120, findSeconds: 40, breakSeconds: 6, rankingSeconds: 120 } }), 'Tempos normais');
      case 'questionMode': return run(() => act('settings', { settings: { questionMode: el.dataset.mode } }), el.dataset.mode === 'mix' ? 'Perguntas: as três categorias misturadas' : 'Perguntas: uma categoria por viagem');
      case 'saveSettings': {
        const num = (id, min, max) => { const v = +$(id).value; return Number.isFinite(v) && v >= min && v <= max ? v : null; };
        const secs = num('#cfgSeconds', 10, 3600), find = num('#cfgFind', 0, 600), brk = num('#cfgBreak', 0, 120), rk = num('#cfgRanking', 0, 1800);
        if ([secs, find, brk, rk].some(v => v === null)) return toast('Confira os tempos: conversa 10–3600 s, encontro 0–600 s, intervalo 0–120 s, avaliação 0–1800 s.', true);
        if (team()) return run(async () => { await act('settings', { settings: { autoFlow: $('#cfgAuto').checked, roundSeconds: secs, findSeconds: find, breakSeconds: brk, rankingSeconds: rk, showFormHints: $('#cfgHints').checked } }); setTimeout(() => render(true), 600); }, 'Configurações salvas'); // senha das dinâmicas: só os ajustes das Conexões
        const spId = $('#cfgSpotifyId').value.trim();
        if (spId && !/^[0-9a-zA-Z]{20,64}$/.test(spId)) return toast('O Client ID do Spotify tem 32 letras e números, sem espaços. Copie de novo da página do app.', true);
        if (!spId) { A.spRestored = true; try { localStorage.removeItem('bttf.spotify.cid'); } catch { /* segue */ } } // apagou de propósito: o navegador não devolve
        return run(async () => { await act('settings', { settings: { spotifyClientId: spId, spotifyBreak: $('#cfgSpotifyBreak').checked, autoFlow: $('#cfgAuto').checked, roundSeconds: secs, findSeconds: find, breakSeconds: brk, rankingSeconds: rk, eventName: $('#cfgName').value, showFormHints: $('#cfgHints').checked, welcomeText: $('#cfgWelcome').value, closingText: $('#cfgClosing').value, standbyText: $('#cfgStandby').value, stageText: $('#cfgStageText').value, stageMutes: $('#cfgStageMutes').checked, transitions: $('#cfgTransitions').checked, transitionSeconds: +$('#cfgTransSecs').value || 8, appLang: $('#cfgAppLang').value, musicUrl: $('#cfgMusicUrl').value, ambientUrl: $('#cfgAmbientUrl').value } }); await act('setAudio', { out: $('#cfgAudioOut').value }); setTimeout(() => render(true), 600); }, 'Configurações salvas');
      }
      case 'saveMessage': case 'showMessage': return run(() => act('setMessage', { message: { emoji: $('#msgEmoji').value, title: $('#msgTitle').value, body: $('#msgBody').value }, show: act_ === 'showMessage' }), act_ === 'showMessage' ? 'Mensagem exibida nos celulares' : 'Mensagem salva');
      case 'logout': localStorage.removeItem('bttf.admin'); api('POST', '/api/admin/logout').finally(() => location.reload()); return;
      case 'audio':
        if (el.dataset.mode === 'spotify') { // a música vem do Spotify de quem está neste painel
          if (!spState().connected) return spDialog();
          return run(() => act('setAudio', { mode: 'spotify' }), '🎧 Spotify ligado · a música do app fica calada');
        }
        return run(() => act('setAudio', { mode: el.dataset.mode }), el.dataset.mode === 'off' ? 'Som desligado' : `${el.dataset.mode === 'music' ? '🎵 Música animada' : '🎼 Trilha de fundo'} ligada · o som sai ${(O.state.audio || {}).out === 'painel' ? 'deste computador' : 'do telão'}`);
      // --- Spotify ---
      case 'spOpen': return spDialog();
      case 'spCfg': closeDialog(); A.tab = 'prep'; A.prep = 'config'; render(true); { const c = $('#cfgSpotifyId'); if (c) { c.scrollIntoView({ block: 'center' }); c.focus(); } } return;
      case 'spLogin': return run(() => SP.login());
      case 'spLogout': return confirmRun('Desconectar o Spotify deste painel?', async () => { SP.logout(); if ($('#dlg').open) closeDialog(); if ((O.state.audio || {}).mode === 'spotify') await act('setAudio', { mode: 'off' }); render(true); }, 'Spotify desconectado');
      case 'spToggle': return run(async () => { const playing = SP.state.player && SP.state.player.playing; A.spQuiet = Date.now(); await SP.toggle(); if (!playing && (O.state.audio || {}).mode !== 'spotify') await act('setAudio', { mode: 'spotify' }); });
      case 'spNext': return run(() => SP.next());
      case 'spPrev': return run(() => SP.prev());
      case 'spVol': return run(() => SP.volume(+el.value));
      case 'spDevs': return run(async () => { await SP.devices(); await SP.refresh(); }, 'Aparelhos atualizados');
      case 'spDevice': if (!el.value) return; return run(() => SP.transfer(el.value, true), 'Tocando no aparelho escolhido');
      case 'spLocal': return run(async () => { await SP.startLocal(); await SP.devices().catch(() => {}); }, '🔊 Este computador agora é um aparelho do Spotify');
      case 'spPlay': return run(async () => { A.spQuiet = Date.now(); await SP.play({ uri: el.dataset.uri }); if ((O.state.audio || {}).mode !== 'spotify') await act('setAudio', { mode: 'spotify' }); }, '▶ Tocando no Spotify');
      case 'copy': return run(async () => { await navigator.clipboard.writeText(el.dataset.text); }, 'Endereço copiado');
      // --- microfone dos aplausos (Reconhecimento) ---
      case 'micOn': Mic.userOff = false; return micStart(false);
      case 'micTop': Mic.userOff = false; await micStart(false); if (Mic.on && !recOnAir()) { A.tab = 'prep'; A.prep = 'tests'; render(true); toast('🎤 Microfone liberado ✔ Bata palmas: a barra tem de subir.'); } return; // botão do topo: libera e mostra a barra do som
      case 'micOff': return micStop(true);
      case 'micCal': return micCal();
      case 'micSens': Mic.span = 44 - (Math.max(1, Math.min(10, +el.value)) - 1) * 4; localStorage.setItem('bttf.micSpan', String(Mic.span)); return;
      case 'audioBeeps': return run(() => act('setAudio', { beeps: !!el.dataset.on }), el.dataset.on ? '⏱ Bipes do cronômetro ligados' : 'Bipes do cronômetro desligados');
      case 'audioOut': return run(() => act('setAudio', { out: el.dataset.out }), el.dataset.out === 'painel' ? 'O som agora sai deste computador' : 'O som agora sai do telão');
      case 'audioVol': if ((O.state.audio || {}).mode === 'spotify' && spState().connected) SP.volume(+el.value).catch(() => {}); // no modo Spotify, o volume também vai para o Spotify (quando o aparelho deixa)
        return run(() => act('setAudio', { volume: +el.value }));
      // --- roteiro: ao vivo ---
      // --- modo confidencial e nuvem de palavras (só a senha mestra) ---
      case 'confOpen': return confDialog();
      case 'confSet': { const on = !!el.dataset.on;
        if (!on && !confirm('Liberar o conteúdo do townhall para todos? A partir de agora, quando uma cena entrar no ar, todos os celulares e telões vão ver (é o que se quer no dia do evento).')) return;
        return run(async () => { await act('settings', { settings: { confidencial: on } }); if ($('#dlg').open) closeDialog(); setTimeout(() => render(true), 600); }, on ? '🔒 Modo confidencial ligado' : '🔓 Conteúdo liberado para todos'); }
      case 'wordsRemove': return run(() => api('POST', '/api/admin/words', { action: 'remove', id: +id }), 'Respostas removidas das nuvens');
      case 'wordsClear': return confirmRun('Apagar as respostas das duas perguntas de todo mundo? Cada pessoa volta a ver as perguntas no celular (do check-in até o passo da nuvem de palavras).', () => api('POST', '/api/admin/words', { action: 'clear' }), 'Respostas apagadas');
      case 'goStep': { // coloca o passo no ar: é aqui (e só aqui) que o telão e os celulares mudam
        if (el.dataset.guard && !confirm(el.dataset.guard)) return;
        { // modo confidencial: este passo é conteúdo do townhall. Antes de pôr no ar, pergunta se é ensaio ou o evento.
          const x = O.settings.steps.find(y => y.id === id), cur = liveStep().step;
          if (!team() && confStep(x) && O.settings.confidencial !== false && !el.dataset.ok && x.id !== cur.id) return confStepDialog(x);
        }
        { // o Reconhecimento vai entrar no ar: aproveita este clique para já pedir/ligar o microfone dos aplausos
          const x = O.settings.steps.find(y => y.id === id);
          if (x && x.type === 'cena' && x.cena === 'reconhecimento' && micMode() !== 'toques' && !Mic.on) { Mic.userOff = false; Mic.autoTried = true; micStart(true); }
        }
        A.edit = null;
        return run(async () => { await api('POST', '/api/admin/step', { id }); A.sel = null; render(true); });
      }
      case 'jumpStep': { // abre o passo no painel, sem mexer no telão
        const { step } = liveStep();
        A.edit = null; A.sel = id === step.id ? null : id;
        render(true); window.scrollTo(0, 0); return;
      }
      case 'skipEdit': return skipDialog(el.dataset.block);
      case 'standbyNow': return confirmRun('Colocar os celulares em "olhos no telão" agora? Depois é só voltar ao roteiro.', () => act('setBlock', { block: 'standby' }));
      case 'quickMessage': return quickMessageDialog();
      case 'editStep': { const x = O.settings.steps.find(y => y.id === id); if (x) { A.edit = { ...x }; render(true); const f = $('#ed-theme') || $('#ed-title'); if (f) f.focus(); } return; }
      case 'cancelEdit': A.edit = null; return render(true);
      case 'saveEdit': {
        if (!A.edit) return;
        const steps = O.settings.steps.map(x => (x.id === A.edit.id ? { ...A.edit } : x));
        return run(async () => { await act('settings', { settings: { steps } }); A.edit = null; }, 'Salvo');
      }
      // --- roteiro: editor (Preparar) ---
      case 'rsAdd': {
        const t = el.dataset.type, list = draftSteps();
        list.push(t === 'stage' ? { type: t, title: `Bloco ${list.filter(x => x.type === 'stage').length + 1}`, theme: '', speaker: '' } : t === 'message' ? { type: t, emoji: '☕', title: 'Intervalo', body: 'Voltamos em 15 minutos.' } : t === 'sucesso' ? { type: t, activity: el.dataset.activity } : t === 'cena' ? { type: t, cena: el.dataset.cena } : { type: t });
        return render(true);
      }
      case 'rsDel': draftSteps().splice(+el.dataset.i, 1); return render(true);
      case 'rsMove': { const list = draftSteps(), a = +el.dataset.i, b = a + +el.dataset.d; if (b < 0 || b >= list.length) return; [list[a], list[b]] = [list[b], list[a]]; return render(true); }
      case 'rsTr': { const x = draftSteps()[+el.dataset.i]; if (!x) return; if (x.transition === false) delete x.transition; else x.transition = false; return render(true); } // com ou sem a transição do filme
      case 'rsDiscard': A.stepsDraft = null; return render(true);
      case 'rsDefault': if (!confirm('Trocar o roteiro pelo padrão? Você ainda precisa salvar para valer.')) return; A.stepsDraft = DEFAULT_STEPS(); return render(true);
      case 'rsSave': return run(async () => { await act('settings', { settings: { steps: A.stepsDraft } }); A.stepsDraft = null; }, 'Roteiro salvo');
      // --- cenas do deck do townhall ---
      case 'cena': {
        const d = el.dataset, body = { kind: d.kind, action: d.a };
        if (d.confirm && !confirm(d.confirm)) return;
        for (const f of ['mes', 'premio', 'min', 'seconds', 'v', 'n']) if (d[f] !== undefined) body[f] = +d[f];
        for (const f of ['fase', 'key']) if (d[f] !== undefined) body[f] = d[f];
        if (el.type === 'checkbox') body.on = el.checked; else if (d.on !== undefined) body.on = !!d.on; else if (d.a === 'pagina') body.on = false;
        // "Carregar o Flux Capacitor": se os aplausos é que carregam e o microfone ainda está desligado, este mesmo clique o liga
        // (o navegador pergunta uma vez; a carga começa depois da resposta, com ou sem microfone)
        if (d.kind === 'reconhecimento' && d.a === 'carregar' && micMode() !== 'toques' && !Mic.on) { Mic.userOff = false; await micStart(true); if (!Mic.on && Mic.err) toast(`${Mic.err} A carga começou mesmo assim: use "+15% de carga".`, true); }
        return run(() => api('POST', '/api/admin/cena', body));
      }
      case 'cenaSec': A.cenaSec = el.dataset.sec; return render(true);
      case 'cenaSave': return run(async () => { await api('POST', '/api/admin/cena', { action: 'config', config: cenaCollect(A.cenaSec) }); setTimeout(() => render(true), 600); }, 'Conteúdo salvo');
      case 'cenaReset': return confirmRun('Voltar esta seção para o conteúdo original do deck? O que foi editado nela se perde.', async () => { await api('POST', '/api/admin/cena', { action: 'resetConfig', key: A.cenaSec }); setTimeout(() => render(true), 600); }, 'Seção restaurada');
      // --- dinâmicas do Sucesso ---
      case 'sucDraw': return run(() => api('POST', '/api/admin/sucesso/draw', { action: el.dataset.cmd }));
      // --- Reflexão ---
      case 'rfx': {
        const cmd = el.dataset.cmd, R = O.reflexao, d = el.dataset;
        if (cmd === 'open' && R && R.open === +d.idx) return;
        if (cmd === 'open' && R && R.open !== null && R.paradas[R.open].phase === 'run' && !confirm('A votação desta parada ainda está aberta. Ela fica pausada se você trocar de parada. Trocar mesmo assim?')) return;
        if (cmd === 'end' && !confirm('Encerrar a votação agora?')) return;
        if (cmd === 'clear' && !confirm('Apagar os votos e o resultado desta parada? Não dá para desfazer.')) return;
        if (cmd === 'clearAll' && !confirm('Apagar os votos e os resultados de TODAS as paradas? Não dá para desfazer.')) return;
        return run(() => api('POST', '/api/admin/reflexao', { action: cmd, idx: d.idx === undefined ? undefined : +d.idx, k: d.k === undefined ? undefined : +d.k, n: d.n === undefined ? undefined : +d.n, on: !!d.on }));
      }
      case 'rfxVotes': return run(() => rfxVotesDialog());
      case 'rfxCsv': return run(() => rfxCsv());
      case 'rfxSaveCfg': {
        const lines = v => v.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const at = l.lastIndexOf('|'); return at < 0 ? [l, ''] : [l.slice(0, at).trim(), l.slice(at + 1).trim()]; });
        const config = { title: $('#rfTitle').value, subtitle: $('#rfSub').value, voteSeconds: +$('#rfSeconds').value, fullVotes: +$('#rfFull').value,
          themes: lines($('#rfThemes').value).map(([t, q]) => ({ t, q })), projects: lines($('#rfProjects').value).map(([name, owner]) => ({ name, owner })) };
        return run(async () => { await api('POST', '/api/admin/reflexao', { action: 'config', config }); render(true); }, 'Reflexão salva');
      }
      case 'rfxResetCfg': if (!confirm('Voltar as paradas e os projetos para a lista original?')) return; return run(async () => { await api('POST', '/api/admin/reflexao', { action: 'resetConfig' }); render(true); }, 'Lista original restaurada');
      // --- Visão 2027 (o Doc) ---
      case 'docGen': {
        const d = O.state.doc || {};
        if (d.message && !confirm('Gerar a mensagem de novo? O texto atual (e as suas edições) será substituído.')) return;
        if (!docTotal() && !confirm('Ainda não há respostas nas dinâmicas. Gerar uma mensagem genérica mesmo assim?')) return;
        return run(async () => { const r = await api('POST', '/api/admin/doc', { action: 'generate', ai: el.dataset.ai !== '0' }); if (r.aviso) toast(r.aviso, true); else toast(r.fonte === 'ia' ? 'Mensagem escrita pela IA ✨' : 'Mensagem pronta'); });
      }
      case 'docEdit': return docEditDialog();
      case 'docCmd': {
        const c = el.dataset.cmd;
        if (c === 'stop' && !confirm('Parar a cena do Doc? O telão volta para a tela de espera.')) return;
        return run(() => api('POST', '/api/admin/doc', { action: c, part: el.dataset.part === undefined ? undefined : +el.dataset.part }));
      }
      case 'docPhones': return run(() => api('POST', '/api/admin/doc', { action: 'phones', on: !!el.dataset.on }), el.dataset.on ? 'Mensagem enviada para os celulares 📱' : 'Mensagem tirada dos celulares');
      case 'docClear': return confirmRun('Apagar a mensagem do Doc? Dá para gerar de novo depois.', () => api('POST', '/api/admin/doc', { action: 'clear' }), 'Mensagem apagada');
      case 'docTxt': return run(() => docTxt(), 'Download iniciado');
      case 'docKit': return run(() => docTxt('/api/admin/doc-video.txt', 'Kit_Video_do_Doc.txt'), 'Kit do vídeo baixado 🎬');
      case 'docTestVoice': return run(() => api('POST', '/api/admin/doc', { action: 'testVoice' }), 'O telão vai falar uma frase de teste');
      case 'docSaveCfg': return run(() => act('settings', { settings: { docVoice: $('#docVoice').checked, docVoiceName: $('#docVoiceName').value, docRate: +$('#docRate').value, docVideoUrl: $('#docVideoUrl').value, docVideoFull: $('#docVideoFull').checked } }), 'Ajustes do Doc salvos');
      case 'sucAnswers': return run(() => sucAnswersDialog(el.dataset.k));
      case 'sucDownload': return sucDownload(el.dataset.type);
      case 'sucCmd': {
        const k = el.dataset.k, cmd = el.dataset.cmd, room = O.sucesso && O.sucesso.roomId;
        if (!room) return toast('As dinâmicas do Sucesso ainda estão carregando.', true);
        if (cmd === 'clear' && !confirm('Apagar as respostas desta dinâmica? Não dá para desfazer.')) return;
        if (cmd === 'end' && !confirm('Encerrar o recebimento agora? O carro entra no portal. As respostas só aparecem quando você revelar.')) return;
        return run(() => api('POST', `/api/rooms/${room}/activities/${k}/command`, { action: cmd }));
      }
      case 'addPerson': return dialog(personForm(), () => { $('#fSave').onclick = () => run(async () => { await api('POST', '/api/admin/people', personFromForm()); closeDialog(); }, 'Pessoa adicionada'); });
      case 'editPerson': { const p = O.people.find(x => x.id === +id); return dialog(personForm(p), () => { $('#fSave').onclick = () => run(async () => { await api('PUT', `/api/admin/people/${id}`, personFromForm()); closeDialog(); }, 'Salvo'); }); }
      case 'toggleCheckin': return run(() => api('PUT', `/api/admin/people/${id}`, { checkedIn: el.dataset.v === '1' }));
      case 'toggleActive': return run(() => api('PUT', `/api/admin/people/${id}`, { active: el.dataset.v === '1' }));
      case 'deletePerson': { const p = O.people.find(x => x.id === +id); return confirmRun(`Excluir ${p.name} da lista?${p.inRounds ? ' Essa pessoa está em duplas já geradas: marque como ausente em vez de excluir.' : ''}`, () => api('DELETE', `/api/admin/people/${id}`), 'Excluída'); }
      case 'viewForm': { const p = O.people.find(x => x.id === +id); return dialog(`<h3>${esc(p.name)} · respostas do forms</h3>${Object.entries(p.form || {}).map(([q, a]) => `<p style="margin:8px 0"><b class="small" style="display:block;color:var(--cyan)">${esc(q)}</b>${esc(a)}</p>`).join('') || '<p class="muted">Sem respostas.</p>'}<div class="actions" style="margin-top:12px"><button class="btn ghost" data-close>Fechar</button></div>`); }
      case 'importPeople': return importPeopleDialog();
      case 'importPhotos': return importPhotosDialog();
      case 'personPhoto': return pickFiles(false, async files => { if (!files.length) return; await run(async () => { await api('PUT', `/api/admin/people/${id}/photo`, { data: await photoData(files[0]) }); }, 'Foto salva'); });
      case 'personPhotoDel': return confirmRun('Tirar a foto desta pessoa? Voltam as iniciais.', () => api('DELETE', `/api/admin/people/${id}/photo`), 'Foto removida');
      case 'importForm': return importFormDialog();
      case 'exportCsv': return exportCsv();
      case 'addQuestion': case 'editQuestion': {
        const q = id ? O.questions.find(x => x.id === +id) : { text: '', es: '', cat: 'quebragelo' };
        return dialog(`<h3>${id ? 'Editar pergunta' : 'Nova pergunta'}</h3><div class="form">
          <label class="f">Pergunta (português)<textarea class="input" id="qText">${esc(q.text)}</textarea></label>
          <label class="f">A mesma pergunta em espanhol (para quem escolhe "Español" no login; vazio = aparece em português)<textarea class="input" id="qEs">${esc(q.es || '')}</textarea></label>
          <label class="f">Categoria<select class="input" id="qCat">${CAT_ORDER.map(k => `<option value="${k}" ${q.cat === k ? 'selected' : ''}>${esc(catName(k))}</option>`).join('')}</select></label>
          <div class="actions"><button class="btn" id="qSave">Salvar</button><button class="btn ghost" data-close>Cancelar</button></div></div>`, () => {
          $('#qSave').onclick = () => run(async () => { const body = { text: $('#qText').value, es: $('#qEs').value, cat: $('#qCat').value }; if (id) await api('PUT', `/api/admin/questions/${id}`, body); else await api('POST', '/api/admin/questions', body); closeDialog(); }, 'Pergunta salva');
        });
      }
      case 'toggleQuestion': return run(() => api('PUT', `/api/admin/questions/${id}`, { active: el.dataset.v === '1' }));
      case 'deleteQuestion': return confirmRun('Excluir esta pergunta?', () => api('DELETE', `/api/admin/questions/${id}`), 'Excluída');
      case 'resetQuestions': return confirmRun('Restaurar o banco de perguntas padrão? As edições atuais serão perdidas.', () => api('POST', '/api/admin/questions/reset'), 'Banco restaurado');
      case 'bulkQuestions': return dialog(`<h3>Substituir perguntas em massa</h3><p class="small">Uma pergunta por linha. Use um prefixo para a categoria: <span class="mono">[quebra-gelo]</span>, <span class="mono">[conexão]</span> ou <span class="mono">[além do óbvio]</span>. Sem prefixo, a linha herda a última categoria usada (começa em quebra-gelo). <span class="mono">[off]</span> marca uma pergunta desativada. Perguntas cujo texto não mudou mantêm o histórico (quem já viu não vê de novo). Para a versão em espanhol, escreva depois de <span class="mono"> || </span> na mesma linha (opcional).</p>
        <textarea class="input" id="bulkText" style="min-height:220px;margin:10px 0">${esc(O.questions.map(q => `[${{ quebragelo: 'quebra-gelo', conexao: 'conexão', alem: 'além do óbvio' }[q.cat] || q.cat}]${q.active ? '' : '[off]'} ${q.text}${q.es ? ' || ' + q.es : ''}`).join('\n'))}</textarea>
        <div class="actions"><button class="btn red" id="bulkGo">Substituir todas</button><button class="btn ghost" data-close>Cancelar</button></div>`, () => {
        $('#bulkGo').onclick = () => confirmRun('Substituir TODO o banco de perguntas?', async () => {
          let cat = 'quebra-gelo'; const list = [];
          for (const line of $('#bulkText').value.split('\n')) {
            let t = line.trim(); if (!t) continue;
            let active = true;
            const m = t.match(/^\[(?!off\])([^\]]{3,20})\]\s*(.*)$/i); if (m) { cat = m[1]; t = m[2]; } // o servidor entende o nome da categoria (e as eras do banco antigo)
            const off = t.match(/^\[off\]\s*(.*)$/i); if (off) { active = false; t = off[1]; }
            const at = t.indexOf('||'), es = at < 0 ? '' : t.slice(at + 2).trim(); if (at >= 0) t = t.slice(0, at).trim(); // "pergunta || pregunta": a versão em espanhol
            if (t) list.push({ cat, text: t, es, active });
          }
          await api('POST', '/api/admin/questions/replace', { questions: list }); closeDialog();
        }, 'Banco substituído');
      });
    }
  }
  document.addEventListener('click', e => {
    const close = e.target.closest('[data-close]'); if (close) { closeDialog(); return; }
    const tab = e.target.closest('#tabs [data-tab]'); if (tab) { A.tab = tab.dataset.tab; render(true); window.scrollTo(0, 0); return; }
    const prep = e.target.closest('[data-prep]'); if (prep) { A.prep = prep.dataset.prep; render(true); return; }
    const go = e.target.closest('[data-go]'); if (go) { e.preventDefault(); if (go.dataset.go === 'live') A.tab = 'live'; else { A.tab = 'prep'; A.prep = go.dataset.go; if (go.dataset.sec) A.cenaSec = go.dataset.sec; } render(true); window.scrollTo(0, 0); return; }
    const rt = e.target.closest('[data-roundtab]'); if (rt) { A.round = +rt.dataset.roundtab; render(true); return; }
    const el = e.target.closest('[data-act]'); if (el && el.tagName !== 'INPUT' && el.tagName !== 'SELECT') { if (el.tagName === 'A') e.preventDefault(); onAction(el); }
  });
  document.addEventListener('change', e => { const el = e.target.closest('input[data-act],select[data-act]'); if (el) onAction(el); });
  // foto de perfil que não carregou: sai, e as iniciais aparecem
  document.addEventListener('error', e => { const t = e.target; if (t && t.tagName === 'IMG' && t.parentNode && t.parentNode.classList.contains('av')) { t.parentNode.classList.remove('foto'); t.remove(); } }, true);
  document.addEventListener('pointerup', () => setTimeout(renderAudio, 300), true);
  document.addEventListener('input', e => {
    if (e.target.id === 'peopleQ') { A.peopleQ = e.target.value; render(true); }
    const rs = e.target.closest('[data-rs]'); // rascunho do roteiro: nada se perde quando o painel atualiza
    if (rs) { const first = !A.stepsDraft; draftSteps()[+rs.dataset.rs][rs.dataset.f] = rs.value; if (first) render(true); }
    const ed = e.target.closest('[data-edit]'); if (ed && A.edit) A.edit[ed.dataset.edit] = ed.value;
  });
  document.addEventListener('pointerdown', () => { A.pressing = true; }, true);
  document.addEventListener('pointerup', () => { A.pressing = false; }, true);
  document.addEventListener('pointercancel', () => { A.pressing = false; }, true);

  if (A.key) { $('#login').classList.add('hidden'); connect(); }
})();
