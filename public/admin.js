/* ===== Painel do Doc (admin) ===== */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ini = n => String(n || '?').trim().split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const pad = n => String(n).padStart(2, '0');
  const fmt = s => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  const PALETTE = ['#ff7a1a', '#ff2d95', '#35d6ff', '#3dff7a', '#ffd000', '#b980ff', '#ff5c5c', '#5cffd6', '#ffa94d', '#7fb2ff', '#f58cff', '#a8ff5c'];
  const FIXED = { Consumer: '#ffd000', 'Customer Development': '#3dff7a', 'Focus Market': '#ff2d95', Strategy: '#35d6ff', 'Make (Business Ops)': '#ff7a1a', 'Tax Reform': '#b980ff', Cybersecurity: '#5cffd6', Architecture: '#ffa94d', Diretora: '#ff5c5c' };
  const color = area => FIXED[area] || PALETTE[[...String(area || '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % PALETTE.length];
  const av = p => `<span class="av" style="--c:${color(p.area)}">${esc(ini(p.name))}</span>`;
  const WLS = ['Estag', 'WL1', 'WL2', 'WL3'];
  const PHASE_LABEL = { idle: 'sem duplas', ready: 'duplas prontas', matching: 'duplas reveladas', talk: 'conversa em andamento', roundEnd: 'fim da rodada', ranking: 'avaliação aberta', results: 'resultados publicados' };
  const BLOCK_LABEL = { standby: 'Espera (off)', welcome: 'Boas-vindas', message: 'Mensagem', connections: 'Conexões', closing: 'Encerramento' };
  const BLOCK_ICON = { standby: '⏻', welcome: '🚪', message: '📣', connections: '⚡', closing: '🏁' };

  const A = { key: localStorage.getItem('bttf.admin') || '', O: null, tab: 'control', round: 1, offset: 0, socket: null, peopleQ: '', connected: false };

  function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.classList.toggle('err', !!err); t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 3500); }
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
    A.socket = io({ transports: ['websocket', 'polling'] });
    A.socket.on('connect', () => A.socket.emit('admin:hello', { key: A.key }, onHello));
    A.socket.on('disconnect', () => { A.connected = false; renderStatus(); });
    A.socket.on('admin:overview', o => { A.O = o; A.offset = o.now - Date.now(); render(); });
  }
  function onHello(res) {
    if (!res || !res.ok) { localStorage.removeItem('bttf.admin'); A.key = ''; $('#login').classList.remove('hidden'); $('#loginMsg').textContent = 'Senha inválida.'; return; }
    A.connected = true; A.O = res.overview; A.offset = res.overview.now - Date.now(); render(true);
  }

  /* ---------- render ---------- */
  function render(force) {
    if (!A.O) return;
    renderStatus();
    const live = ['control', 'people', 'questions'].includes(A.tab);
    if (!force && !live && $('#main').dataset.view === A.tab) return;
    const y = window.scrollY;
    const ae = document.activeElement, focusId = ae && ae.id && $('#main').contains(ae) ? ae.id : null;
    const caret = focusId && typeof ae.selectionStart === 'number' ? ae.selectionStart : null;
    $('#main').dataset.view = A.tab;
    $('#main').innerHTML = ({ control: vControl, people: vPeople, questions: vQuestions, config: vConfig, tests: vTests })[A.tab]();
    window.scrollTo(0, y);
    if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus(); if (caret !== null && el.setSelectionRange) el.setSelectionRange(caret, caret); } }
  }
  function renderStatus() {
    const O = A.O; if (!O) return;
    const c = O.state.conn;
    const t = c.talk;
    const left = t ? (t.paused ? t.remaining : Math.max(0, Math.round((t.endsAt - (Date.now() + A.offset)) / 1000))) : null;
    $('#status').innerHTML = `
      <span class="pill ${A.connected ? 'on' : 'off'}">${A.connected ? '● conectado' : '○ desconectado'}</span>
      <span class="pill hot">Bloco: ${BLOCK_LABEL[O.state.block]}</span>
      <span class="pill">Conexões: ${PHASE_LABEL[c.phase] || c.phase}${c.round ? ` · viagem ${c.round}/3` : ''}</span>
      ${t ? `<span class="pill led ${t.paused ? 'paused' : ''}">${fmt(left)}${t.paused ? ' ⏸' : ''}</span>` : ''}
      <span class="pill">A bordo: ${O.counts.checkedIn}/${O.counts.total}</span>`;
  }
  setInterval(renderStatus, 500);

  function vControl() {
    const O = A.O, s = O.state, c = s.conn, ph = c.phase;
    const canGenerate = ['idle', 'ready'].includes(ph);
    const nextRound = ph === 'ready' ? 1 : ph === 'roundEnd' ? c.round + 1 : null;
    const lastDone = ph === 'roundEnd' && c.round >= 3;
    const late = O.people.filter(p => p.late);
    const notRanked = O.people.filter(p => p.active && p.checkedInAt && p.inRounds && !p.ranked);
    const round = O.rounds[A.round - 1];
    const levelTxt = { strict: 'área ≠ e WL ≠ em todas as duplas', wl: 'precisou liberar WL igual em algumas duplas', area: 'precisou liberar área igual em algumas duplas', all: 'sem restrição em algumas duplas' };
    return `
      <div class="card">
        <h2>Tela dos celulares</h2>
        <div class="blocks">
          ${['standby', 'welcome', 'message', 'connections', 'closing'].map(b => `<button class="${s.block === b ? 'on' : ''}" data-block="${b}"><span class="e">${BLOCK_ICON[b]}</span>${BLOCK_LABEL[b]}</button>`).join('')}
        </div>
        <p class="small" style="margin-top:8px"><b>Espera (off)</b> apaga a tela dos celulares entre um bloco e outro; ao trocar para qualquer outro bloco, os celulares acendem, vibram e avisam.</p>
        ${s.block === 'message' ? `<p class="small" style="margin-top:8px">Mensagem atual: <b>${esc(s.message.emoji)} ${esc(s.message.title)}</b> — ${esc(s.message.body)} · <a href="#" data-go="config">editar na aba Config</a></p>` : ''}
      </div>

      <div class="card hot">
        <h2>Bloco Conexões · 3 viagens no tempo</h2>
        <div class="steps">
          <div class="step ${canGenerate ? 'active' : 'done'}"><div class="n">1</div><div class="b">
            <div class="t">Gerar duplas com quem está a bordo (${O.counts.checkedIn} viajantes)</div>
            <div class="small">Regras: área diferente, WL diferente, nunca repetir dupla. Número ímpar forma um trio.${c.generatedAt ? ` · Geradas em ${new Date(c.generatedAt).toLocaleTimeString('pt-BR')} · ${levelTxt[c.worstLevel] || ''}` : ''}</div>
            ${late.length ? `<div class="warn">⚠ ${late.length} pessoa(s) fizeram check-in depois do cálculo e estão fora das rotas: ${esc(late.map(p => p.name).join(', '))}. Recalcule as rodadas restantes para incluí-las.</div>` : ''}
            <div class="actions">
              <button class="btn" data-act="generate" ${O.counts.checkedIn < 2 ? 'disabled' : ''}>⚡ ${c.generatedAt ? 'Gerar novamente (todas)' : 'Gerar duplas'}</button>
              ${c.generatedAt && !canGenerate && ph !== 'ranking' && ph !== 'results' ? `<button class="btn ghost" data-act="regenRest">↻ Recalcular ${ph === 'matching' ? 'a partir desta viagem' : 'rodadas restantes'}</button>` : ''}
            </div>
          </div></div>

          <div class="step ${['ready', 'matching', 'talk', 'roundEnd'].includes(ph) && !lastDone ? 'active' : (ph === 'ranking' || ph === 'results' || lastDone) ? 'done' : ''}"><div class="n">2</div><div class="b">
            <div class="t">Viagens (${c.round}/3) · tempo por conversa: ${fmt(O.settings.roundSeconds)}</div>
            <div class="actions">
              <button class="btn cyan" data-act="reveal" data-round="${nextRound || ''}" ${nextRound && nextRound <= 3 ? '' : 'disabled'}>👥 Revelar duplas da viagem ${nextRound && nextRound <= 3 ? nextRound : '—'}</button>
              <button class="btn" data-act="startTalk" ${ph === 'matching' ? '' : 'disabled'}>▶ Iniciar conversa</button>
              ${ph === 'talk' ? (c.talk.paused ? '<button class="btn ghost" data-act="resume">▶ Retomar</button>' : '<button class="btn ghost" data-act="pause">⏸ Pausar</button>') : ''}
              <button class="btn ghost" data-act="addTime" ${ph === 'talk' ? '' : 'disabled'}>+30s</button>
              <button class="btn ghost" data-act="endTalk" ${ph === 'talk' ? '' : 'disabled'}>⏭ Encerrar conversa</button>
              ${ph === 'matching' ? `<button class="btn ghost" data-act="reveal" data-round="${c.round}">↻ Re-revelar viagem ${c.round}</button>` : ''}
            </div>
            <div class="small">${ph === 'matching' ? `As duplas da viagem ${c.round} estão nos celulares. Quando todos se encontrarem, inicie a conversa.` : ph === 'talk' ? 'Conversa em andamento. O timer encerra sozinho e os celulares avisam.' : ph === 'roundEnd' ? (lastDone ? 'Última viagem concluída. Abra a avaliação.' : `Viagem ${c.round} encerrada. Revele as duplas da próxima.`) : ph === 'ready' ? 'Duplas prontas. Revele a viagem 1 quando quiser.' : ''}</div>
          </div></div>

          <div class="step ${ph === 'ranking' ? 'active' : ph === 'results' ? 'done' : ''}"><div class="n">3</div><div class="b">
            <div class="t">Avaliação · cada viajante ordena as conversas (1º, 2º, 3º)</div>
            <div class="actions">
              <button class="btn cyan" data-act="openRanking" ${c.played >= 1 && ph !== 'ranking' && ph !== 'results' ? '' : 'disabled'}>📋 Abrir avaliação</button>
            </div>
            ${ph === 'ranking' || ph === 'results' ? `<div class="small">${O.people.filter(p => p.ranked).length} de ${O.people.filter(p => p.inRounds && p.active && p.checkedInAt).length} avaliaram</div><div class="bar"><i style="width:${Math.round(100 * O.people.filter(p => p.ranked).length / Math.max(1, O.people.filter(p => p.inRounds && p.active && p.checkedInAt).length))}%"></i></div>${notRanked.length ? `<div class="small">Faltam: ${esc(notRanked.map(p => p.name).join(', '))}</div>` : '<div class="ok">✔ Todos avaliaram</div>'}` : ''}
          </div></div>

          <div class="step ${ph === 'results' ? 'done' : ph === 'ranking' ? 'active' : ''}"><div class="n">4</div><div class="b">
            <div class="t">Calcular conexões e notificar os celulares</div>
            <div class="actions">
              <button class="btn" data-act="computeResults" ${ph === 'ranking' || ph === 'results' ? '' : 'disabled'}>🔮 ${ph === 'results' ? 'Recalcular e reenviar' : 'Calcular conexões'}</button>
              <button class="btn ghost" data-act="setBlock" data-block="closing" ${ph === 'results' ? '' : 'disabled'}>🏁 Ir para o encerramento</button>
              <button class="btn ghost" data-act="setBlock" data-block="standby" ${ph === 'results' ? '' : 'disabled'}>⏻ Colocar em espera</button>
            </div>
            <div class="small">1º lugar = 3 pts, 2º = 2, 3º = 1. A conexão de cada pessoa é o par com maior soma dos dois lados. Quem não avaliou conta 0.</div>
          </div></div>
        </div>
        <div class="actions" style="margin-top:12px"><button class="btn red sm" data-act="resetConnections">Resetar bloco de conexões</button></div>
      </div>

      ${O.results.length ? `<div class="card ok"><h2>Conexões calculadas (${O.results.length})</h2><div class="tblwrap"><table class="tbl"><tr><th>Viajante</th><th>Conexão sugerida</th><th>Pts</th><th>Mútua</th></tr>
        ${O.results.slice().sort((a, b) => (b.mutual - a.mutual) || (b.score - a.score)).map(r => `<tr><td>${av(r.person)}${esc(r.person.name)}</td><td>${r.match ? av(r.match) + esc(r.match.name) : '<span class="x">—</span>'}</td><td class="mono">${r.score}</td><td>${r.mutual ? '<span class="ok">⚡ sim</span>' : '<span class="x">não</span>'}</td></tr>`).join('')}</table></div></div>` : ''}

      ${c.generatedAt ? `<div class="card"><h2>Duplas por viagem</h2>
        <div class="subtabs">${O.rounds.map(r => `<button class="${A.round === r.round ? 'on' : ''}" data-roundtab="${r.round}">Viagem ${r.round} · ${esc(r.era.year)} ${r.round === c.round ? '●' : ''}</button>`).join('')}</div>
        ${round && round.groups.length ? `<div class="small" style="margin-bottom:6px">${round.groups.length} grupos · ${round.check.ok}/${round.check.total} pares com área ≠ e WL ≠ · nível: ${esc(levelTxt[round.level] || round.level || '')}</div>
          ${round.groups.map(g => `<div class="grp"><span class="code">${esc(g.code)}</span>${g.members.map((m, i) => `${i ? '<span class="x">⇄</span>' : ''}<span class="m">${av(m)}<b>${esc(m.name)}</b><span class="meta">(${esc(m.area)} · ${esc(m.wl)})</span></span>`).join('')}<span class="${g.flags.area && g.flags.wl ? 'ok' : 'warn'}" style="margin-left:auto">${g.flags.area ? '✔ área' : '! área'} ${g.flags.wl ? '✔ WL' : '! WL'}</span>${round.round === c.round && ph === 'talk' && g.currentQuestion ? `<div class="q">pergunta ${g.position + 1}/${g.queueLen}: ${esc(g.currentQuestion)}</div>` : ''}</div>`).join('')}` : '<p class="muted">Rodada ainda não gerada.</p>'}
      </div>` : ''}`;
  }

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
    const O = A.O, s = O.settings, m = O.state.message;
    return `
      <div class="grid">
        <div class="card"><h2>Evento</h2><div class="form">
          <label class="f">Nome do evento<input class="input" id="cfgName" value="${esc(s.eventName)}"></label>
          <label class="f">Tempo de cada conversa (segundos)<input class="input" id="cfgSeconds" type="number" min="10" max="3600" value="${s.roundSeconds}"><span class="small">240 = 4 minutos</span></label>
          <label class="sw"><input type="checkbox" id="cfgHints" ${s.showFormHints ? 'checked' : ''}> Mostrar respostas do forms na tela da dupla ("para puxar assunto")</label>
          <label class="f">Texto de boas-vindas<textarea class="input" id="cfgWelcome">${esc(s.welcomeText)}</textarea></label>
          <label class="f">Texto de encerramento<textarea class="input" id="cfgClosing">${esc(s.closingText)}</textarea></label>
          <label class="f">Texto da tela de espera (off)<textarea class="input" id="cfgStandby">${esc(s.standbyText || '')}</textarea></label>
          <label class="f">Roteiro (uma linha por item: <span class="mono">horário | título</span>)<textarea class="input" id="cfgAgenda">${esc((s.agenda || []).map(a => `${a.time}${a.time ? ' | ' : ''}${a.title}`).join('\n'))}</textarea></label>
          <div class="actions"><button class="btn" data-act="saveSettings">Salvar configurações</button></div>
        </div></div>
        <div class="card"><h2>Bloco "Mensagem"</h2><p class="small" style="margin-bottom:10px">Use para intervalos, avisos ou qualquer recado na tela de todos.</p><div class="form">
          <label class="f">Emoji<input class="input" id="msgEmoji" value="${esc(m.emoji)}"></label>
          <label class="f">Título<input class="input" id="msgTitle" value="${esc(m.title)}"></label>
          <label class="f">Texto<textarea class="input" id="msgBody">${esc(m.body)}</textarea></label>
          <div class="actions"><button class="btn ghost" data-act="saveMessage">Salvar</button><button class="btn" data-act="showMessage">📣 Salvar e exibir nos celulares</button></div>
        </div></div>
        <div class="card"><h2>Acesso</h2><p class="small">A senha do painel é definida pela variável de ambiente <span class="mono">ADMIN_PASSWORD</span> no servidor (padrão: <span class="mono">doc1985</span>). Link do app para os viajantes: <span class="mono">${esc(location.origin)}/</span></p>
          <div class="actions" style="margin-top:10px"><button class="btn ghost sm" data-act="logout">Sair do painel</button></div></div>
      </div>`;
  }

  function vTests() {
    return `
      <div class="card"><h2>Modo teste / ensaio</h2><p class="small" style="margin-bottom:12px">Para ensaiar a dinâmica sem 47 pessoas na sala. Nada disso é necessário no dia.</p>
        <div class="actions">
          <button class="btn cyan" data-act="testCheckinAll">✔ Check-in de todos</button>
          <button class="btn cyan" data-act="demoTime">⏱ Conversas de 30s (modo demo)</button>
          <button class="btn ghost" data-act="normalTime">⏱ Voltar para 4 min</button>
          <button class="btn cyan" data-act="testRandomRankings">🎲 Avaliações aleatórias (na fase de avaliação)</button>
        </div></div>
      <div class="card"><h2>Zona de perigo</h2>
        <div class="actions">
          <button class="btn red" data-act="resetConnections">Resetar bloco de conexões</button>
          <button class="btn red" data-act="resetEvent">Resetar evento (check-ins + conexões)</button>
        </div>
        <p class="small" style="margin-top:8px">Resetar o evento desfaz os check-ins: todo mundo precisa selecionar o nome de novo. A lista de pessoas e as perguntas são mantidas.</p></div>`;
  }

  /* ---------- diálogos ---------- */
  function dialog(html, onMount) {
    const d = $('#dlg'); $('#dlgBody').innerHTML = html; d.showModal(); if (onMount) onMount(d);
  }
  const closeDialog = () => $('#dlg').close();
  function personForm(p = {}) {
    return `<h3>${p.id ? 'Editar viajante' : 'Novo viajante'}</h3><div class="form two">
      <label class="f">Nome<input class="input" id="fName" value="${esc(p.name || '')}"></label>
      <label class="f">E-mail<input class="input" id="fEmail" value="${esc(p.email || '')}"></label>
      <label class="f">WL<select class="input" id="fWl">${['', ...WLS].map(w => `<option value="${w}" ${(p.wl || '') === w ? 'selected' : ''}>${w || '—'}</option>`).join('')}</select></label>
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
      case 'generate': return confirmRun(O.state.conn.generatedAt ? 'Gerar novamente TODAS as duplas? As rodadas atuais serão descartadas.' : `Gerar as duplas com ${O.counts.checkedIn} viajantes a bordo?`, async () => { const r = await act('generate', { fromRound: 1 }); toast(`Duplas geradas · ${r.worstLabel}`); });
      case 'regenRest': { const from = O.state.conn.phase === 'matching' ? O.state.conn.round : O.state.conn.round + 1; return confirmRun(`Recalcular as duplas a partir da viagem ${from} com quem está a bordo agora?`, async () => { const r = await act('generate', { fromRound: from }); toast(`Rodadas ${from}–3 recalculadas · ${r.worstLabel}`); }); }
      case 'reveal': return run(() => act('reveal', { round: +el.dataset.round }), `Duplas da viagem ${el.dataset.round} reveladas`);
      case 'startTalk': return run(() => act('startTalk'), 'Conversa iniciada');
      case 'pause': return run(() => act('pause'));
      case 'resume': return run(() => act('resume'));
      case 'addTime': return run(() => act('addTime', { seconds: 30 }), '+30 segundos');
      case 'endTalk': return confirmRun('Encerrar a conversa agora?', () => act('endTalk'));
      case 'openRanking': return confirmRun('Abrir a avaliação em todos os celulares?', () => act('openRanking'), 'Avaliação aberta');
      case 'computeResults': return confirmRun('Calcular as conexões e notificar todos os celulares agora?', () => act('computeResults'), 'Conexões enviadas ⚡');
      case 'setBlock': return run(() => act('setBlock', { block: el.dataset.block }));
      case 'resetConnections': return confirmRun('Resetar o bloco de conexões? Apaga duplas, avaliações e resultados.', () => act('resetConnections'), 'Bloco resetado');
      case 'resetEvent': return confirmRun('Resetar o EVENTO inteiro? Desfaz check-ins, duplas, avaliações e resultados.', () => act('resetEvent'), 'Evento resetado');
      case 'testCheckinAll': return run(() => act('testCheckinAll'), 'Check-in de todos feito');
      case 'testRandomRankings': return run(() => act('testRandomRankings'), 'Avaliações aleatórias enviadas');
      case 'demoTime': return run(() => act('settings', { settings: { roundSeconds: 30 } }), 'Conversas de 30s');
      case 'normalTime': return run(() => act('settings', { settings: { roundSeconds: 240 } }), 'Conversas de 4 min');
      case 'saveSettings': {
        const agenda = $('#cfgAgenda').value.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [a, b] = l.split('|').map(x => x.trim()); return b !== undefined ? { time: a, title: b } : { time: '', title: a }; });
        return run(() => act('settings', { settings: { eventName: $('#cfgName').value, roundSeconds: +$('#cfgSeconds').value, showFormHints: $('#cfgHints').checked, welcomeText: $('#cfgWelcome').value, closingText: $('#cfgClosing').value, standbyText: $('#cfgStandby').value, agenda } }), 'Configurações salvas');
      }
      case 'saveMessage': case 'showMessage': return run(() => act('setMessage', { message: { emoji: $('#msgEmoji').value, title: $('#msgTitle').value, body: $('#msgBody').value }, show: act_ === 'showMessage' }), act_ === 'showMessage' ? 'Mensagem exibida nos celulares' : 'Mensagem salva');
      case 'logout': localStorage.removeItem('bttf.admin'); location.reload(); return;
      case 'addPerson': return dialog(personForm(), () => { $('#fSave').onclick = () => run(async () => { await api('POST', '/api/admin/people', personFromForm()); closeDialog(); }, 'Pessoa adicionada'); });
      case 'editPerson': { const p = O.people.find(x => x.id === +id); return dialog(personForm(p), () => { $('#fSave').onclick = () => run(async () => { await api('PUT', `/api/admin/people/${id}`, personFromForm()); closeDialog(); }, 'Salvo'); }); }
      case 'toggleCheckin': return run(() => api('PUT', `/api/admin/people/${id}`, { checkedIn: el.dataset.v === '1' }));
      case 'toggleActive': return run(() => api('PUT', `/api/admin/people/${id}`, { active: el.dataset.v === '1' }));
      case 'deletePerson': { const p = O.people.find(x => x.id === +id); return confirmRun(`Excluir ${p.name} da lista?${p.inRounds ? ' Essa pessoa está em duplas já geradas: recalcule as rodadas depois.' : ''}`, () => api('DELETE', `/api/admin/people/${id}`), 'Excluída'); }
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
      case 'bulkQuestions': return dialog(`<h3>Substituir perguntas em massa</h3><p class="small">Uma pergunta por linha. Use um prefixo para a era: <span class="mono">[passado]</span>, <span class="mono">[presente]</span> ou <span class="mono">[futuro]</span>. Sem prefixo, a linha herda a última era usada (começa em presente).</p>
        <textarea class="input" id="bulkText" style="min-height:220px;margin:10px 0">${esc(O.questions.map(q => `[${q.era}] ${q.text}`).join('\n'))}</textarea>
        <div class="actions"><button class="btn red" id="bulkGo">Substituir todas</button><button class="btn ghost" data-close>Cancelar</button></div>`, () => {
        $('#bulkGo').onclick = () => confirmRun('Substituir TODO o banco de perguntas?', async () => {
          let era = 'presente'; const list = [];
          for (const line of $('#bulkText').value.split('\n')) { const t = line.trim(); if (!t) continue; const m = t.match(/^\[(passado|presente|futuro)\]\s*(.*)$/i); if (m) { era = m[1].toLowerCase(); if (m[2]) list.push({ era, text: m[2] }); } else list.push({ era, text: t }); }
          await api('POST', '/api/admin/questions/replace', { questions: list }); closeDialog();
        }, 'Banco substituído');
      });
    }
  }
  document.addEventListener('click', e => {
    const close = e.target.closest('[data-close]'); if (close) { closeDialog(); return; }
    const tab = e.target.closest('#tabs [data-tab]'); if (tab) { A.tab = tab.dataset.tab; document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b === tab)); render(true); return; }
    const go = e.target.closest('[data-go]'); if (go) { e.preventDefault(); A.tab = go.dataset.go; document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === A.tab)); render(true); return; }
    const rt = e.target.closest('[data-roundtab]'); if (rt) { A.round = +rt.dataset.roundtab; render(true); return; }
    const bl = e.target.closest('[data-block]'); if (bl && !bl.dataset.act) { run(() => act('setBlock', { block: bl.dataset.block })); return; }
    const el = e.target.closest('[data-act]'); if (el) onAction(el);
  });
  document.addEventListener('input', e => { if (e.target.id === 'peopleQ') { A.peopleQ = e.target.value; render(true); } });

  if (A.key) { $('#login').classList.add('hidden'); connect(); }
})();
