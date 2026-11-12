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
  const av = p => `<span class="av" style="--c:${color(p.area)}">${esc(ini(p.name))}</span>`;
  const WLS = ['Estag', 'WL1', 'WL2', 'WL3'];
  const PHASE_LABEL = { idle: 'sem duplas', ready: 'duplas prontas', matching: 'duplas se encontrando', talk: 'conversa em andamento', roundEnd: '88 MPH (intervalo)', ranking: 'avaliação aberta', results: 'resultados publicados' };
  const TIMER_LABEL = { matching: 'encontro', talk: 'conversa', break: 'intervalo', ranking: 'avaliação' };
  // roteiro do evento
  const STEP_ICON = { checkin: '🚪', stage: '🎤', connections: '⚡', sucesso: '🚀', message: '📣', standby: '📺', closing: '🏁' };
  const STEP_KIND = { checkin: 'Check-in', stage: 'Bloco de fala', connections: 'Dinâmica · Conexões', sucesso: 'Dinâmica · Sucesso', message: 'Aviso', standby: 'Olhos no telão', closing: 'Encerramento' };
  const STEP_HINT = { checkin: 'as pessoas entram pelo nome', connections: '3 viagens em duplas e avaliação', sucesso: 'pergunta ao vivo, nuvem de palavras', standby: 'celulares em pausa, atenção no telão', closing: 'agradecimento e créditos' };
  const SUC_NAME = { d1: 'Antes de Partir', d2: 'Look Back', d3: 'Uso de IA', d4: 'Look Ahead' };
  const SUC_COLOR = { d1: 'var(--cyan)', d2: 'var(--yellow)', d3: 'var(--magenta)', d4: 'var(--orange)' };
  const SUC_PHASE = { idle: 'aguardando você iniciar', run: 'recebendo respostas', paused: 'recebimento pausado', done: 'recebimento encerrado' };
  const TALK = { d2: 120, d3: 180 }; // dinâmicas com sorteio e tempo de fala (como no painel do Lucas)
  const stepTitle = x => (x.type === 'checkin' ? 'Check-in' : x.type === 'stage' ? x.title : x.type === 'connections' ? 'Conexões' : x.type === 'sucesso' ? `Sucesso ${x.activity.slice(1).padStart(2, '0')} · ${SUC_NAME[x.activity]}` : x.type === 'message' ? x.title : x.type === 'standby' ? 'Olhos no telão' : 'Encerramento');
  const DEFAULT_STEPS = () => [{ type: 'checkin' }, { type: 'stage', title: 'Bloco 1', theme: '', speaker: '' }, { type: 'connections' }, { type: 'stage', title: 'Bloco 2', theme: '', speaker: '' },
    { type: 'sucesso', activity: 'd1' }, { type: 'sucesso', activity: 'd2' }, { type: 'sucesso', activity: 'd3' }, { type: 'sucesso', activity: 'd4' }, { type: 'stage', title: 'Bloco 3', theme: '', speaker: '' }, { type: 'closing' }];
  const AUDIO_LABEL = { music: '🎵 Música', ambient: '🎼 Trilha', off: '🔇 Sem áudio' };

  const A = { key: localStorage.getItem('bttf.admin') || '', O: null, tab: 'live', prep: 'roteiro', open: new Set(), edit: null, stepsDraft: null, round: 1, offset: 0, socket: null, peopleQ: '', connected: false, lastHtml: '', pressing: false };

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
  }
  function onHello(res) {
    if (!res || !res.ok) { localStorage.removeItem('bttf.admin'); A.key = ''; $('#login').classList.remove('hidden'); $('#loginMsg').textContent = 'Senha inválida.'; return; }
    // mesmo login libera o painel 3D do Sucesso (/painel): o servidor grava um cookie
    if (!A.cookie) { A.cookie = true; api('POST', '/api/admin/login', { password: A.key }).then(() => {
      const next = new URLSearchParams(location.search).get('next');
      if (next && next.startsWith('/') && !next.startsWith('//')) location.assign(next);
    }).catch(() => { A.cookie = false; }); }
    A.connected = true; A.O = res.overview; A.offset = res.overview.now - Date.now(); render(true);
  }

  /* ---------- render ---------- */
  // Duas áreas: "Ao vivo" (o roteiro e o passo que está no ar) e "Preparar" (roteiro, pessoas, perguntas, ajustes, testes).
  const PREP = [['roteiro', 'Roteiro'], ['people', 'Pessoas'], ['questions', 'Perguntas'], ['config', 'Ajustes'], ['tests', 'Testes']];
  function render(force) {
    if (!A.O) return;
    renderStatus(); renderAudio();
    if (A.pressing) { clearTimeout(A.renderLater); A.renderLater = setTimeout(() => render(force), 250); return; }
    const view = A.tab === 'live' ? 'live' : 'prep-' + A.prep;
    if (!force && ['prep-config', 'prep-tests'].includes(view) && $('#main').dataset.view === view) return;
    const html = A.tab === 'live' ? vLive()
      : `<div class="subtabs prepnav">${PREP.map(([k, l]) => `<button class="${A.prep === k ? 'on' : ''}" data-prep="${k}">${l}</button>`).join('')}</div>` + ({ roteiro: vRoteiro, people: vPeople, questions: vQuestions, config: vConfig, tests: vTests })[A.prep]();
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
  const liveStep = () => { const steps = A.O.settings.steps, i = Math.max(0, steps.findIndex(x => x.id === A.O.state.step)); return { steps, i, step: steps[i], next: steps[i + 1] || null, prev: steps[i - 1] || null }; };
  const sucAct = k => (A.O.sucesso && A.O.sucesso.acts[k]) || {};
  const sucEff = a => (a.phase === 'run' && a.endsAt && a.endsAt <= Date.now() + A.offset ? 'done' : a.phase || null); // o prazo pode acabar entre dois avisos do servidor
  const sucLeft = a => (a.phase === 'run' && a.endsAt ? Math.max(0, Math.ceil((a.endsAt - Date.now() - A.offset) / 1000)) : a.remainingSeconds || 0);
  // O que está no ar agora, em uma linha
  function nowText() {
    const O = A.O, { steps, i, step } = liveStep();
    if (O.state.detour) return `fora do roteiro · ${O.state.detour === 'message' ? 'aviso: ' + (O.state.message.title || '') : 'olhos no telão'}`;
    let extra = '';
    if (step.type === 'connections') { const c = O.state.conn, t = c.timer; extra = ` · ${c.round ? `viagem ${c.round}/3 · ` : ''}${t ? `${TIMER_LABEL[t.kind] || t.kind} ${fmt(timerLeft(t))}${t.paused ? ' ⏸' : ''}` : PHASE_LABEL[c.phase] || c.phase}`; }
    if (step.type === 'sucesso') { const a = sucAct(step.activity), ph = sucEff(a); if (ph) extra = ` · ${ph === 'run' ? 'recebendo' + (a.endsAt ? ' ' + fmt(sucLeft(a)) : '') : ph === 'done' ? 'encerrado' : ph === 'paused' ? 'pausado' : 'não iniciado'} · ${a.responseCount} resp.`; }
    if (step.type === 'stage' && step.theme) extra = ` · ${step.theme}`;
    return `${i + 1}/${steps.length} · ${step.type === 'sucesso' ? 'Sucesso ' + step.activity.slice(1).padStart(2, '0') : stepTitle(step)}${extra}`;
  }
  function renderStatus() {
    const O = A.O; if (!O) return;
    const tl = O.telao || { count: 0 };
    const html = `<span class="dot ${A.connected ? 'on' : 'off'}" title="${A.connected ? 'Conectado ao servidor' : 'Sem conexão com o servidor'}"></span>
      ${A.connected ? '' : '<span class="pill off">sem conexão</span>'}
      <span class="nowchip" title="No ar agora: ${esc(nowText())}"><small>NO AR</small><span>${esc(nowText())}</span></span>
      <span class="pill" title="Pessoas que já fizeram check-in">👥 ${O.counts.checkedIn}/${O.counts.total}</span>
      <a class="pill ${tl.count ? (tl.auth ? 'on' : 'hot') : 'off'}" href="/telao.html" target="_blank" title="${tl.count ? (tl.auth ? 'Telão aberto e logado' : 'Telão aberto sem login: não mostra as respostas do Sucesso') : 'Nenhum telão aberto. Clique para abrir.'}">📽 Telão ${tl.count ? (tl.auth ? '✓' : 'sem login') : 'fechado'}</a>`;
    if (html !== A.statusHtml) { A.statusHtml = html; $('#status').innerHTML = html; }
  }
  setInterval(renderStatus, 500);

  /* ---------- som: três botões sempre à mão (música animada, trilha de fundo, sem áudio) ---------- */
  function renderAudio() {
    const O = A.O; if (!O) return;
    const a = O.state.audio || { mode: 'off', volume: 60, out: 'telao' }, key = JSON.stringify([a, O.telao]);
    if (window.Trilha) Trilha.apply({ mode: a.out === 'painel' ? a.mode : 'off', volume: a.volume, musicUrl: O.settings.musicUrl, ambientUrl: O.settings.ambientUrl });
    if (key === A.audioKey || A.pressing) return;
    A.audioKey = key;
    const tl = O.telao || { count: 0 };
    const warn = a.out === 'painel' || a.mode === 'off' ? '' : !tl.count ? 'abra o telão' : !tl.sound ? 'clique na tela do telão para liberar o som' : '';
    $('#audioCtl').innerHTML = `<button type="button" class="k" data-act="audioOut" data-out="${a.out === 'painel' ? 'telao' : 'painel'}" title="Clique para trocar: o som pode sair do computador do telão ou deste painel">SOM · ${a.out === 'painel' ? 'este painel' : 'telão'} ⇄</button>
      ${warn ? `<span class="warn">⚠ ${warn}</span>` : ''}
      ${['music', 'ambient', 'off'].map(m => `<button type="button" class="${a.mode === m ? 'on' : ''}" data-act="audio" data-mode="${m}">${AUDIO_LABEL[m]}</button>`).join('')}
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
    return STEP_HINT[x.type] || '';
  }
  function vLive() {
    const O = A.O, { steps, i, step, next, prev } = liveStep(), detour = O.state.detour, scene = (O.state.screen && O.state.screen.scene) || 'auto';
    // viagem interrompida no meio (o evento saiu do passo Conexões): fica marcada como em pausa, não como feita
    const held = x => x.type === 'connections' && ['matching', 'talk', 'roundEnd', 'ranking'].includes(O.state.conn.phase);
    const road = steps.map((x, n) => `<button class="rs ${n === i ? 'now' : held(x) ? 'held' : n < i ? 'done' : ''}" data-act="jumpStep" data-id="${x.id}" title="Ir para este passo">
        <span class="n">${n === i ? n + 1 : held(x) ? '⏸' : n < i ? '✓' : n + 1}</span><span class="ic">${STEP_ICON[x.type]}</span>
        <span class="tx"><b>${esc(stepTitle(x))}</b><small>${esc(stepSub(x))}</small></span></button>`).join('');
    const extras = `<div class="road-extra">
        <div class="small">Fora do roteiro</div>
        <div class="actions">${btn('📣 Aviso rápido', 'quickMessage', { cls: 'ghost sm' })}${btn('📺 Olhos no telão', 'standbyNow', { cls: 'ghost sm' })}</div>
        ${det('telao', '📽 Tela do telão', `<div class="actions" style="margin-top:8px">${[['auto', 'Segue o roteiro'], ['clock', 'Relógio'], ['logo', 'Logo']].map(([k, l]) => `<button class="btn xs ${scene === k ? '' : 'ghost'}" data-act="setScene" data-scene="${k}">${l}</button>`).join('')}</div>
          <label class="sw" style="margin-top:8px"><input type="checkbox" data-act="toggleMutual" ${O.settings.showMutualOnScreen ? 'checked' : ''}> Mostrar no telão os nomes das conexões mútuas</label>`)}
        <a href="#" class="small" data-go="roteiro">✎ Editar roteiro</a>
      </div>`;
    return `<div class="live"><aside class="road"><div class="road-title">Roteiro</div>${road}${extras}</aside>${detour ? panelDetour(detour, step) : panelStep(step, i, steps.length, next, prev)}</div>`;
  }
  // Painel do passo atual: um botão principal por vez; quando o passo não pede mais nada, o principal é "Próximo".
  function panelStep(step, i, total, next, prev) {
    const p = ({ checkin: pCheckin, stage: pStage, connections: pConnections, sucesso: pSucesso, message: pMessage, standby: pStandby, closing: pClosing })[step.type](step);
    // "Próximo" vira o botão principal quando o passo não pede mais nada; com algo em andamento ele fica discreto
    const nextBig = !p.primary && !p.busy;
    const nextBtn = next ? btn(`Próximo: ${esc(stepTitle(next))} ▶`, 'goStep', { cls: nextBig ? 'big next' : 'ghost next', data: { id: next.id, guard: p.busy || '' } }) : '';
    return `<section class="stepbox t-${step.type}" ${step.type === 'sucesso' ? `style="--c:${SUC_COLOR[step.activity]}"` : ''}>
      <div class="sb-head"><span class="kick">Passo ${i + 1} de ${total} · ${STEP_KIND[step.type]}</span><span class="onair">${esc(p.onair || '')}</span></div>
      <h1>${STEP_ICON[step.type]} ${esc(p.title || stepTitle(step))}</h1>
      ${p.body || ''}
      ${p.warn ? `<div class="sb-warn">${p.warn}</div>` : ''}
      <div class="sb-actions">${p.primary || (nextBig ? nextBtn : '')}${(p.secondary || []).join('')}${nextBig && !next ? '<span class="ok">✔ Último passo do roteiro</span>' : ''}</div>
      <div class="sb-nav">${prev ? `<a href="#" data-act="jumpStep" data-id="${prev.id}">← voltar para ${esc(stepTitle(prev))}</a>` : '<span></span>'}${nextBig ? '' : nextBtn}</div>
      ${p.more ? det('more-' + step.type, 'Mais opções', `<div class="sb-more-in">${p.more}</div>`, 'sb-more') : ''}
    </section>`;
  }
  function panelDetour(kind, step) {
    const O = A.O, m = O.state.message;
    return `<section class="stepbox t-detour">
      <div class="sb-head"><span class="kick">Fora do roteiro</span><span class="onair">Celulares e telão: ${kind === 'message' ? 'este aviso' : 'tela de pausa'}</span></div>
      <h1>${kind === 'message' ? `${esc(m.emoji || '📣')} ${esc(m.title)}` : '📺 Olhos no telão'}</h1>
      <p class="lead">${esc(kind === 'message' ? m.body : O.settings.standbyText || '')}</p>
      <div class="sb-actions">${btn(`↩ Voltar ao roteiro: ${esc(stepTitle(step))}`, 'goStep', { cls: 'big', data: { id: step.id } })}${kind === 'message' ? btn('✎ Editar aviso', 'quickMessage', { cls: 'ghost' }) : ''}</div>
    </section>`;
  }

  function pCheckin() {
    const O = A.O, missing = O.people.filter(p => p.active && !p.checkedInAt);
    return { onair: 'Celulares: cada pessoa digita o nome e embarca · Telão: QR do app',
      body: `<div class="bigstat"><b>${O.counts.checkedIn}</b><span>de ${O.counts.total} a bordo</span></div>
        <div class="bar"><i style="width:${Math.round(100 * O.counts.checkedIn / Math.max(1, O.counts.total))}%"></i></div>
        ${missing.length ? det('missing', `Quem ainda não entrou (${missing.length})`, `<p class="small" style="margin-top:6px">${esc(missing.map(p => p.name).join(' · '))}</p>`) : '<p class="ok">✔ Todo mundo a bordo</p>'}` };
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
  const pStandby = () => ({ onair: 'Celulares em pausa · Telão: relógio', body: `<p class="lead">${esc(A.O.settings.standbyText || '')}</p>` });
  function pClosing() {
    return { onair: 'Celulares: agradecimento e a conexão de cada um · Telão: créditos',
      body: `<p class="lead">${esc(A.O.settings.closingText || '')}</p>
        <div class="actions" style="align-items:center"><span class="small">Respostas do Sucesso:</span>${['d1', 'd2', 'd3', 'd4'].map(k => btn(`${k.slice(1).padStart(2, '0')} · ${SUC_NAME[k]}`, 'sucAnswers', { cls: 'ghost xs', data: { k } })).join('')}</div>` };
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
          ${round.groups.map(g => `<div class="grp"><span class="code">${esc(g.code)}</span>${g.members.map((m, n) => `${n ? '<span class="x">⇄</span>' : ''}<span class="m">${av(m)}<b>${esc(m.name)}</b><span class="meta">(${esc(m.area)} · ${esc(m.wl)})</span></span>`).join('')}<span class="${g.flags.area && g.flags.wl ? 'ok' : 'warn'}" style="margin-left:auto">${g.flags.area ? '✔ área' : '! área'} ${g.flags.wl ? '✔ WL' : '! WL'}</span>${round.round === c.round && ph === 'talk' && g.currentQuestion ? `<div class="q">pergunta ${g.position + 1}/${g.queueLen}: ${esc(g.currentQuestion)}</div>` : ''}</div>`).join('')}` : '<p class="muted">Rodada ainda não gerada.</p>'}`) : '';
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
    let body = `<p class="question">${esc(a.question || '')}</p>${stats}`, primary = null, secondary = [], busy = '';
    const cmd = (label, c, cls) => btn(label, 'sucCmd', { cls, data: { k, cmd: c } }), dr = (label, c, cls) => btn(label, 'sucDraw', { cls, data: { cmd: c } });
    if (!onScreen) { body += '<p class="warn">Esta dinâmica não está na tela agora.</p>'; primary = btn('📺 Exibir no telão e nos celulares', 'goStep', { cls: 'big', data: { id: step.id } }); }
    else if (ph === 'idle') primary = cmd(`▶ Iniciar recebimento${k === 'd1' ? '' : ' (2 min)'}`, 'start', 'big');
    else if (ph === 'run') { primary = cmd('⏭ Encerrar recebimento', 'end', 'big'); secondary = [cmd('❚❚ Pausar', 'pause', 'ghost')]; busy = 'O recebimento ainda está aberto. Avançar mesmo assim?'; }
    else if (ph === 'paused') { primary = cmd('▶ Retomar recebimento', 'start', 'big'); secondary = [cmd('⏭ Encerrar', 'end', 'ghost')]; }
    else if (ph === 'done' && TALK[k]) {
      if (draw) {
        const left = talkLeft(draw.talk), running = !!draw.talk.endsAt && left > 0;
        body += `<div class="suc-draw on"><div class="small">🎲 VIAJANTE SORTEADO${draw.personId ? ' · avisado no celular' : ''}</div><div class="who">${esc(draw.name)}</div><div class="what">“${esc(draw.answer)}”</div>
          <div class="tcx ${running && left <= 30 ? 'alert' : ''}" style="--c:var(--orange);align-self:flex-start"><b data-timer="talk">${fmt(left)}</b><span>TEMPO DE FALA</span></div></div>`;
        primary = running ? dr('❚❚ Pausar tempo de fala', 'talkPause', 'big') : dr('▶ Iniciar tempo de fala', 'talkStart', 'big');
        secondary = [dr('↺ Zerar tempo', 'talkReset', 'ghost'), dr('🎲 Sortear outro', 'draw', 'ghost'), dr('Voltar para a nuvem', 'close', 'ghost')];
      } else if (n && !drawnBefore) primary = dr('🎲 Sortear viajante', 'draw', 'big');
      else if (n) secondary = [dr('🎲 Sortear outro', 'draw', 'ghost')];
    }
    const warn = !onScreen ? '' : !tl.count ? '⚠ Nenhum telão aberto. <a href="/telao.html" target="_blank">Abrir telão ↗</a>' : !tl.auth ? '⚠ O telão está aberto sem login e não vai mostrar as respostas, a nuvem nem o sorteio. Abra-o neste navegador: <a href="/telao.html" target="_blank">abrir telão ↗</a>' : '';
    const more = `<div class="actions">${btn(`Ver e baixar as respostas (${n})`, 'sucAnswers', { cls: 'ghost sm', data: { k } })}${btn('↺ Reabrir o recebimento', 'sucCmd', { cls: 'ghost sm', data: { k, cmd: 'reset' }, disabled: !(ph === 'done' || ph === 'paused') })}${btn('🗑 Apagar as respostas', 'sucCmd', { cls: 'red sm', data: { k, cmd: 'clear' } })}</div>
      <p class="small" style="margin-top:8px"><a href="/painel?sala=${encodeURIComponent(room || '')}&d=${k}" target="_blank">Abrir o painel 3D original ↗</a></p>`;
    return { title: `Dinâmica ${k.slice(1)} · ${a.title || SUC_NAME[k]}`, body, primary, secondary, more, warn, busy, onair: 'Celulares: pergunta e resposta · Telão: carro, nuvem e sorteio' };
  }
  // cronômetros e viradas de fase que dependem só do relógio
  function tickLive() {
    if (!A.O || A.tab !== 'live') return;
    const t = A.O.state.conn.timer, c = $('[data-timer=conn]'); if (c && t) c.textContent = fmt(timerLeft(t));
    const su = $('[data-timer=suc]'); if (su) su.textContent = fmt(sucLeft(sucAct(su.dataset.k)));
    const d = A.O.state.presentation && A.O.state.presentation.draw, tk = $('[data-timer=talk]'); if (tk && d) tk.textContent = fmt(talkLeft(d.talk));
  }
  setInterval(() => {
    if (!A.O || A.tab !== 'live') return;
    tickLive();
    const { step } = liveStep(), a = step.type === 'sucesso' ? sucAct(step.activity) : null, d = A.O.state.presentation && A.O.state.presentation.draw, left = d ? talkLeft(d.talk) : -1;
    const key = [step.id, a ? sucEff(a) : '', a && a.phase === 'run' ? sucLeft(a) <= 30 : '', d ? (left > 30 ? 'a' : left > 0 ? 'b' : 'c') : ''].join('|');
    if (key !== A.liveKey) { A.liveKey = key; render(); }
  }, 500);

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
    const has = t => list.some(x => x.type === t), hasAct = k => list.some(x => x.type === 'sucesso' && x.activity === k);
    const row = (x, i) => {
      const f = (field, ph, cls) => `<input class="input ${cls}" data-rs="${i}" data-f="${field}" id="rs-${field}-${i}" value="${esc(x[field] || '')}" placeholder="${ph}" aria-label="${ph}">`;
      const fields = x.type === 'stage' ? `${f('title', 'Nome do bloco', 'w1')}${f('theme', 'Tema (aparece no celular e no telão)', 'w3')}${f('speaker', 'Quem fala (opcional)', 'w2')}`
        : x.type === 'message' ? `${f('emoji', '📣', 'w0')}${f('title', 'Título do aviso', 'w2')}${f('body', 'Texto do aviso', 'w3')}`
        : `<span class="fixed">${esc(stepTitle(x))}<small>${x.type === 'sucesso' && TALK[x.activity] ? 'pergunta ao vivo, nuvem, sorteio e tempo de fala' : STEP_HINT[x.type]}</small></span>`;
      return `<div class="rrow ${!dirty && x.id === O.state.step ? 'now' : ''}"><span class="n">${i + 1}</span><span class="ic" title="${STEP_KIND[x.type]}">${STEP_ICON[x.type]}</span><div class="rf">${fields}</div>
        <div class="rc">${!dirty && x.id === O.state.step ? '<span class="pill hot">no ar</span>' : ''}<button class="btn ghost xs" data-act="rsMove" data-i="${i}" data-d="-1" ${i ? '' : 'disabled'} title="Subir">↑</button><button class="btn ghost xs" data-act="rsMove" data-i="${i}" data-d="1" ${i < list.length - 1 ? '' : 'disabled'} title="Descer">↓</button><button class="btn ghost xs" data-act="rsDel" data-i="${i}" ${list.length > 1 ? '' : 'disabled'} title="Remover">✕</button></div></div>`;
    };
    const add = (label, type, extra = '') => `<button class="btn ghost xs" data-act="rsAdd" data-type="${type}" ${extra}>＋ ${label}</button>`;
    return `<div class="card"><h2>Roteiro do evento</h2>
      <p class="small">A ordem dos passos do evento. No <a href="#" data-go="live">Ao vivo</a> você percorre o roteiro com o botão "Próximo". Dá para mudar a qualquer momento, inclusive durante o evento.</p>
      <div class="rlist">${list.map(row).join('')}</div>
      <div class="actions radd"><span class="small">Adicionar:</span>${add('Bloco de fala', 'stage')}${add('Aviso / intervalo', 'message')}${add('Olhos no telão', 'standby')}${add('Check-in', 'checkin')}${has('connections') ? '' : add('Conexões', 'connections')}${['d1', 'd2', 'd3', 'd4'].filter(k => !hasAct(k)).map(k => add(`Sucesso ${k.slice(1).padStart(2, '0')}`, 'sucesso', `data-activity="${k}"`)).join('')}${add('Encerramento', 'closing')}</div>
      <div class="actions" style="margin-top:14px;align-items:center">${dirty ? '<button class="btn" data-act="rsSave">Salvar roteiro</button><button class="btn ghost" data-act="rsDiscard">Descartar alterações</button><span class="warn">alterações não salvas</span>' : '<span class="ok">✔ Roteiro salvo</span>'}<button class="btn ghost sm" data-act="rsDefault" style="margin-left:auto">Restaurar o roteiro padrão</button></div>
    </div>`;
  }
  const draftSteps = () => (A.stepsDraft = A.stepsDraft || A.O.settings.steps.map(x => ({ ...x })));

  function vPeople() {
    const O = A.O, q = A.peopleQ.trim().toLowerCase();
    const list = O.people.filter(p => !q || [p.name, p.email, p.area, p.wl, p.team, p.manager].join(' ').toLowerCase().includes(q));
    const n = { total: O.people.length, active: O.people.filter(p => p.active).length, in: O.people.filter(p => p.active && p.checkedInAt).length, form: O.people.filter(p => p.hasForm).length };
    return `
      <div class="card"><div class="stats">
        <div class="stat"><b>${n.total}</b><span class="small">na lista</span></div>
        <div class="stat"><b>${n.active}</b><span class="small">participando</span></div>
        <div class="stat"><b>${n.in}</b><span class="small">a bordo (check-in)</span></div>
        <div class="stat"><b>${n.form}</b><span class="small">com respostas do forms</span></div>
      </div></div>
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <h2 style="margin:0">Pessoas</h2>
          <div class="actions">
            <button class="btn sm" data-act="addPerson">+ Adicionar</button>
            <button class="btn sm cyan" data-act="importPeople">📋 Importar lista</button>
            <button class="btn sm cyan" data-act="importForm">📝 Importar forms</button>
            <button class="btn sm ghost" data-act="exportCsv">⬇ Exportar CSV</button>
          </div>
        </div>
        <p class="small" style="margin-top:6px">Área e WL ficam só aqui no painel (para o sorteio): os viajantes não veem esses dados uns dos outros.</p>
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
              <button class="btn xs ghost" data-act="toggleCheckin" data-id="${p.id}" data-v="${p.checkedInAt ? 0 : 1}">${p.checkedInAt ? 'desfazer check-in' : 'check-in manual'}</button>
              <button class="btn xs ghost" data-act="toggleActive" data-id="${p.id}" data-v="${p.active ? 0 : 1}">${p.active ? 'marcar ausente' : 'reativar'}</button>
              <button class="btn xs red" data-act="deletePerson" data-id="${p.id}">excluir</button>
            </div></td></tr>`).join('')}
        </table></div>
      </div>`;
  }

  function vQuestions() {
    const O = A.O, byEra = {};
    O.questions.forEach(q => { (byEra[q.era] = byEra[q.era] || []).push(q); });
    const eraName = e => (O.eras[e] ? `${O.eras[e].icon} ${O.eras[e].label} · ${O.eras[e].year}` : e);
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
        <p class="small" style="margin-top:8px">Viagem 1 usa prioritariamente as perguntas do <b>presente</b>, viagem 2 do <b>passado</b> e viagem 3 do <b>futuro</b>. Ninguém recebe a mesma pergunta duas vezes, e cada dupla começa em um ponto diferente da lista.</p>
      </div>
      ${['presente', 'passado', 'futuro'].map(e => `<div class="card"><h2>${esc(eraName(e))} <span class="small">(${(byEra[e] || []).length})</span></h2>
        <table class="tbl">${(byEra[e] || []).map(q => `<tr style="${q.active ? '' : 'opacity:.45'}"><td>${esc(q.text)}</td><td class="r" style="white-space:nowrap"><div class="actions" style="justify-content:flex-end">
          <button class="btn xs ghost" data-act="editQuestion" data-id="${q.id}">editar</button>
          <button class="btn xs ghost" data-act="toggleQuestion" data-id="${q.id}" data-v="${q.active ? 0 : 1}">${q.active ? 'desativar' : 'ativar'}</button>
          <button class="btn xs red" data-act="deleteQuestion" data-id="${q.id}">excluir</button></div></td></tr>`).join('') || '<tr><td class="muted">Nenhuma pergunta nesta era.</td></tr>'}</table></div>`).join('')}
      ${Object.keys(byEra).filter(e => !O.eras[e]).map(e => `<div class="card"><h2>${esc(e)}</h2><table class="tbl">${byEra[e].map(q => `<tr><td>${esc(q.text)}</td><td class="r"><button class="btn xs ghost" data-act="editQuestion" data-id="${q.id}">editar</button></td></tr>`).join('')}</table></div>`).join('')}`;
  }

  function vConfig() {
    const O = A.O, s = O.settings;
    return `
      <div class="grid">
        <div class="card"><h2>Tempos das viagens</h2><div class="form">
          <label class="sw"><input type="checkbox" id="cfgAuto" ${s.autoFlow ? 'checked' : ''}> Fluxo automático (encontro → conversa → próxima dupla → avaliação, sem precisar liberar)</label>
          <label class="f">Conversa de cada viagem (segundos)<input class="input" id="cfgSeconds" type="number" min="10" max="3600" value="${s.roundSeconds}"><span class="small">240 = 4 minutos</span></label>
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
          <label class="f">Roteiro (uma linha por item: <span class="mono">horário | título</span>)<textarea class="input" id="cfgAgenda">${esc((s.agenda || []).map(a => `${a.time}${a.time ? ' | ' : ''}${a.title}`).join('\n'))}</textarea></label>
          <label class="sw"><input type="checkbox" id="cfgHints" ${s.showFormHints ? 'checked' : ''}> Mostrar respostas do forms na tela da dupla ("para puxar assunto")</label>
          <div class="actions"><button class="btn" data-act="saveSettings">Salvar</button></div>
        </div></div>
        <div class="card"><h2>Som e blocos de fala</h2><div class="form">
          <label class="f">Onde o som toca<select class="input" id="cfgAudioOut"><option value="telao" ${(O.state.audio || {}).out !== 'painel' ? 'selected' : ''}>No computador do telão (página /telao.html)</option><option value="painel" ${(O.state.audio || {}).out === 'painel' ? 'selected' : ''}>Neste computador (Painel do Doc)</option></select><span class="small">No telão, clique uma vez na tela para o navegador liberar o som.</span></label>
          <label class="f">Música própria (opcional)<input class="input" id="cfgMusicUrl" value="${esc(s.musicUrl || '')}" placeholder="https://… .mp3"><span class="small">Endereço de um arquivo de áudio para o botão "Música". Vazio = música original do app.</span></label>
          <label class="f">Trilha de fundo própria (opcional)<input class="input" id="cfgAmbientUrl" value="${esc(s.ambientUrl || '')}" placeholder="https://… .mp3"></label>
          <label class="f">Texto dos blocos de fala (celular)<input class="input" id="cfgStageText" value="${esc(s.stageText || '')}"></label>
          <label class="sw"><input type="checkbox" id="cfgStageMutes" ${s.stageMutes ? 'checked' : ''}> Desligar o som ao exibir um bloco de fala</label>
          <div class="actions"><button class="btn" data-act="saveSettings">Salvar</button></div>
        </div></div>
        <div class="card"><h2>Acesso</h2><p class="small">A senha do painel é definida pela variável de ambiente <span class="mono">ADMIN_PASSWORD</span> no servidor. Link do app para os viajantes: <span class="mono">${esc(location.origin)}/</span> · Telão: <span class="mono">${esc(location.origin)}/telao.html</span></p>
          <div class="actions" style="margin-top:10px"><button class="btn ghost sm" data-act="logout">Sair do painel</button></div></div>
      </div>`;
  }

  function vTests() {
    return `
      <div class="card"><h2>Modo teste / ensaio</h2><p class="small" style="margin-bottom:12px">Para ensaiar a dinâmica sem 47 pessoas na sala. Nada disso é necessário no dia.</p>
        <div class="actions">
          <button class="btn cyan" data-act="testCheckinAll">✔ Check-in de todos</button>
          <button class="btn cyan" data-act="demoTime">⏱ Modo demo (10s encontro · 30s conversa · 3s intervalo · 30s avaliação)</button>
          <button class="btn ghost" data-act="normalTime">⏱ Tempos normais (60s · 4 min · 6s · 2 min)</button>
          <button class="btn cyan" data-act="testRandomRankings">🎲 Avaliações aleatórias (na fase de avaliação)</button>
        </div></div>
      <div class="card"><h2>Zona de perigo</h2>
        <div class="actions">
          <button class="btn red" data-act="resetConnections">Resetar bloco de conexões</button>
          <button class="btn red" data-act="resetEvent">Resetar o evento inteiro</button>
        </div>
        <p class="small" style="margin-top:8px">Resetar o evento volta o roteiro para o primeiro passo e apaga check-ins, duplas, avaliações e as respostas do Sucesso (bom para usar depois do ensaio). A lista de pessoas, as perguntas e o roteiro são mantidos.</p></div>`;
  }

  /* ---------- diálogos ---------- */
  function dialog(html, onMount) {
    const d = $('#dlg'); $('#dlgBody').innerHTML = html; const m = $('#dlgMsg'); if (m) m.remove(); d.showModal(); if (onMount) onMount(d);
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
      case 'resetConnections': return confirmRun('Resetar o bloco de conexões? Apaga duplas, avaliações e resultados.', () => act('resetConnections'), 'Bloco resetado');
      case 'resetEvent': return confirmRun('Resetar o EVENTO inteiro? O roteiro volta para o primeiro passo e são apagados check-ins, duplas, avaliações e as respostas do Sucesso.', () => act('resetEvent'), 'Evento resetado');
      case 'testCheckinAll': return run(() => act('testCheckinAll'), 'Check-in de todos feito');
      case 'testRandomRankings': return run(() => act('testRandomRankings'), 'Avaliações aleatórias enviadas');
      case 'demoTime': return run(() => act('settings', { settings: { roundSeconds: 30, findSeconds: 10, breakSeconds: 3, rankingSeconds: 30 } }), 'Modo demo: tempos curtos');
      case 'normalTime': return run(() => act('settings', { settings: { roundSeconds: 240, findSeconds: 60, breakSeconds: 6, rankingSeconds: 120 } }), 'Tempos normais');
      case 'saveSettings': {
        const num = (id, min, max) => { const v = +$(id).value; return Number.isFinite(v) && v >= min && v <= max ? v : null; };
        const secs = num('#cfgSeconds', 10, 3600), find = num('#cfgFind', 0, 600), brk = num('#cfgBreak', 0, 120), rk = num('#cfgRanking', 0, 1800);
        if ([secs, find, brk, rk].some(v => v === null)) return toast('Confira os tempos: conversa 10–3600 s, encontro 0–600 s, intervalo 0–120 s, avaliação 0–1800 s.', true);
        const agenda = $('#cfgAgenda').value.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const i = l.indexOf('|'); return i >= 0 ? { time: l.slice(0, i).trim(), title: l.slice(i + 1).trim() } : { time: '', title: l }; });
        return run(async () => { await act('settings', { settings: { autoFlow: $('#cfgAuto').checked, roundSeconds: secs, findSeconds: find, breakSeconds: brk, rankingSeconds: rk, eventName: $('#cfgName').value, showFormHints: $('#cfgHints').checked, welcomeText: $('#cfgWelcome').value, closingText: $('#cfgClosing').value, standbyText: $('#cfgStandby').value, agenda, stageText: $('#cfgStageText').value, stageMutes: $('#cfgStageMutes').checked, musicUrl: $('#cfgMusicUrl').value, ambientUrl: $('#cfgAmbientUrl').value } }); await act('setAudio', { out: $('#cfgAudioOut').value }); setTimeout(() => render(true), 600); }, 'Configurações salvas');
      }
      case 'saveMessage': case 'showMessage': return run(() => act('setMessage', { message: { emoji: $('#msgEmoji').value, title: $('#msgTitle').value, body: $('#msgBody').value }, show: act_ === 'showMessage' }), act_ === 'showMessage' ? 'Mensagem exibida nos celulares' : 'Mensagem salva');
      case 'logout': localStorage.removeItem('bttf.admin'); api('POST', '/api/admin/logout').finally(() => location.reload()); return;
      case 'audio': return run(() => act('setAudio', { mode: el.dataset.mode }), el.dataset.mode === 'off' ? 'Som desligado' : `${el.dataset.mode === 'music' ? '🎵 Música animada' : '🎼 Trilha de fundo'} ligada · o som sai ${(O.state.audio || {}).out === 'painel' ? 'deste computador' : 'do telão'}`);
      case 'audioOut': return run(() => act('setAudio', { out: el.dataset.out }), el.dataset.out === 'painel' ? 'O som agora sai deste computador' : 'O som agora sai do telão');
      case 'audioVol': return run(() => act('setAudio', { volume: +el.value }));
      // --- roteiro: ao vivo ---
      case 'goStep': {
        if (el.dataset.guard && !confirm(el.dataset.guard)) return;
        A.edit = null;
        return run(() => api('POST', '/api/admin/step', { id }));
      }
      case 'jumpStep': {
        const { step } = liveStep(), target = O.settings.steps.find(x => x.id === id);
        if (!target || (target.id === step.id && !O.state.detour)) return;
        if (!confirm(`Ir para "${stepTitle(target)}" agora? Os celulares e o telão mudam na hora.`)) return;
        A.edit = null;
        return run(() => api('POST', '/api/admin/step', { id }));
      }
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
        list.push(t === 'stage' ? { type: t, title: `Bloco ${list.filter(x => x.type === 'stage').length + 1}`, theme: '', speaker: '' } : t === 'message' ? { type: t, emoji: '☕', title: 'Intervalo', body: 'Voltamos em 15 minutos.' } : t === 'sucesso' ? { type: t, activity: el.dataset.activity } : { type: t });
        return render(true);
      }
      case 'rsDel': draftSteps().splice(+el.dataset.i, 1); return render(true);
      case 'rsMove': { const list = draftSteps(), a = +el.dataset.i, b = a + +el.dataset.d; if (b < 0 || b >= list.length) return; [list[a], list[b]] = [list[b], list[a]]; return render(true); }
      case 'rsDiscard': A.stepsDraft = null; return render(true);
      case 'rsDefault': if (!confirm('Trocar o roteiro pelo padrão? Você ainda precisa salvar para valer.')) return; A.stepsDraft = DEFAULT_STEPS(); return render(true);
      case 'rsSave': return run(async () => { await act('settings', { settings: { steps: A.stepsDraft } }); A.stepsDraft = null; }, 'Roteiro salvo');
      // --- dinâmicas do Sucesso ---
      case 'sucDraw': return run(() => api('POST', '/api/admin/sucesso/draw', { action: el.dataset.cmd }));
      case 'sucAnswers': return run(() => sucAnswersDialog(el.dataset.k));
      case 'sucDownload': return sucDownload(el.dataset.type);
      case 'sucCmd': {
        const k = el.dataset.k, cmd = el.dataset.cmd, room = O.sucesso && O.sucesso.roomId;
        if (!room) return toast('As dinâmicas do Sucesso ainda estão carregando.', true);
        if (cmd === 'clear' && !confirm('Apagar as respostas desta dinâmica? Não dá para desfazer.')) return;
        if (cmd === 'end' && !confirm('Encerrar o recebimento agora? O carro entra no portal e aparece a nuvem de palavras.')) return;
        return run(() => api('POST', `/api/rooms/${room}/activities/${k}/command`, { action: cmd }));
      }
      case 'addPerson': return dialog(personForm(), () => { $('#fSave').onclick = () => run(async () => { await api('POST', '/api/admin/people', personFromForm()); closeDialog(); }, 'Pessoa adicionada'); });
      case 'editPerson': { const p = O.people.find(x => x.id === +id); return dialog(personForm(p), () => { $('#fSave').onclick = () => run(async () => { await api('PUT', `/api/admin/people/${id}`, personFromForm()); closeDialog(); }, 'Salvo'); }); }
      case 'toggleCheckin': return run(() => api('PUT', `/api/admin/people/${id}`, { checkedIn: el.dataset.v === '1' }));
      case 'toggleActive': return run(() => api('PUT', `/api/admin/people/${id}`, { active: el.dataset.v === '1' }));
      case 'deletePerson': { const p = O.people.find(x => x.id === +id); return confirmRun(`Excluir ${p.name} da lista?${p.inRounds ? ' Essa pessoa está em duplas já geradas: marque como ausente em vez de excluir.' : ''}`, () => api('DELETE', `/api/admin/people/${id}`), 'Excluída'); }
      case 'viewForm': { const p = O.people.find(x => x.id === +id); return dialog(`<h3>${esc(p.name)} · respostas do forms</h3>${Object.entries(p.form || {}).map(([q, a]) => `<p style="margin:8px 0"><b class="small" style="display:block;color:var(--cyan)">${esc(q)}</b>${esc(a)}</p>`).join('') || '<p class="muted">Sem respostas.</p>'}<div class="actions" style="margin-top:12px"><button class="btn ghost" data-close>Fechar</button></div>`); }
      case 'importPeople': return importPeopleDialog();
      case 'importForm': return importFormDialog();
      case 'exportCsv': return exportCsv();
      case 'addQuestion': case 'editQuestion': {
        const q = id ? O.questions.find(x => x.id === +id) : { text: '', era: 'presente' };
        return dialog(`<h3>${id ? 'Editar pergunta' : 'Nova pergunta'}</h3><div class="form">
          <label class="f">Pergunta<textarea class="input" id="qText">${esc(q.text)}</textarea></label>
          <label class="f">Era<select class="input" id="qEra">${['presente', 'passado', 'futuro'].map(e => `<option value="${e}" ${q.era === e ? 'selected' : ''}>${O.eras[e].icon} ${O.eras[e].label} · ${O.eras[e].year}</option>`).join('')}</select></label>
          <div class="actions"><button class="btn" id="qSave">Salvar</button><button class="btn ghost" data-close>Cancelar</button></div></div>`, () => {
          $('#qSave').onclick = () => run(async () => { const body = { text: $('#qText').value, era: $('#qEra').value }; if (id) await api('PUT', `/api/admin/questions/${id}`, body); else await api('POST', '/api/admin/questions', body); closeDialog(); }, 'Pergunta salva');
        });
      }
      case 'toggleQuestion': return run(() => api('PUT', `/api/admin/questions/${id}`, { active: el.dataset.v === '1' }));
      case 'deleteQuestion': return confirmRun('Excluir esta pergunta?', () => api('DELETE', `/api/admin/questions/${id}`), 'Excluída');
      case 'resetQuestions': return confirmRun('Restaurar o banco de perguntas padrão? As edições atuais serão perdidas.', () => api('POST', '/api/admin/questions/reset'), 'Banco restaurado');
      case 'bulkQuestions': return dialog(`<h3>Substituir perguntas em massa</h3><p class="small">Uma pergunta por linha. Use um prefixo para a era: <span class="mono">[passado]</span>, <span class="mono">[presente]</span> ou <span class="mono">[futuro]</span>. Sem prefixo, a linha herda a última era usada (começa em presente). <span class="mono">[off]</span> marca uma pergunta desativada. Perguntas cujo texto não mudou mantêm o histórico (quem já viu não vê de novo).</p>
        <textarea class="input" id="bulkText" style="min-height:220px;margin:10px 0">${esc(O.questions.map(q => `[${q.era}]${q.active ? '' : '[off]'} ${q.text}`).join('\n'))}</textarea>
        <div class="actions"><button class="btn red" id="bulkGo">Substituir todas</button><button class="btn ghost" data-close>Cancelar</button></div>`, () => {
        $('#bulkGo').onclick = () => confirmRun('Substituir TODO o banco de perguntas?', async () => {
          let era = 'presente'; const list = [];
          for (const line of $('#bulkText').value.split('\n')) {
            let t = line.trim(); if (!t) continue;
            let active = true;
            const m = t.match(/^\[(passado|presente|futuro)\]\s*(.*)$/i); if (m) { era = m[1].toLowerCase(); t = m[2]; }
            const off = t.match(/^\[off\]\s*(.*)$/i); if (off) { active = false; t = off[1]; }
            if (t) list.push({ era, text: t, active });
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
    const go = e.target.closest('[data-go]'); if (go) { e.preventDefault(); if (go.dataset.go === 'live') A.tab = 'live'; else { A.tab = 'prep'; A.prep = go.dataset.go; } render(true); window.scrollTo(0, 0); return; }
    const rt = e.target.closest('[data-roundtab]'); if (rt) { A.round = +rt.dataset.roundtab; render(true); return; }
    const el = e.target.closest('[data-act]'); if (el && el.tagName !== 'INPUT' && el.tagName !== 'SELECT') { if (el.tagName === 'A') e.preventDefault(); onAction(el); }
  });
  document.addEventListener('change', e => { const el = e.target.closest('input[data-act],select[data-act]'); if (el) onAction(el); });
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
