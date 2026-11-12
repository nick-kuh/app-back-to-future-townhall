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
  const BLOCK_LABEL = { standby: 'Olhos no telão', welcome: 'Check-in', message: 'Mensagem', connections: 'Conexões', closing: 'Encerramento', stage: 'Bloco de fala' };
  const BLOCK_ICON = { standby: '📺', welcome: '🚪', message: '📣', connections: '⚡', closing: '🏁', stage: '🎤' };
  const AUDIO_LABEL = { music: '🎵 Música', ambient: '🎼 Trilha sonora', off: '🔇 Sem áudio' };

  const A = { key: localStorage.getItem('bttf.admin') || '', O: null, tab: 'control', round: 1, offset: 0, socket: null, peopleQ: '', connected: false, lastHtml: '', pressing: false };

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
  function render(force) {
    if (!A.O) return;
    renderStatus(); renderAudio();
    if (A.pressing) { clearTimeout(A.renderLater); A.renderLater = setTimeout(() => render(force), 250); return; }
    const live = ['control', 'people', 'questions', 'sucesso'].includes(A.tab);
    if (A.tab === 'sucesso') sucStart(); else sucStop();
    if (!force && !live && $('#main').dataset.view === A.tab) return;
    const html = ({ control: vControl, sucesso: vSucesso, people: vPeople, questions: vQuestions, config: vConfig, tests: vTests })[A.tab]();
    if (!force && $('#main').dataset.view === A.tab && html === A.lastHtml) return;
    A.lastHtml = html;
    const y = window.scrollY;
    const ae = document.activeElement, focusId = ae && ae.id && $('#main').contains(ae) ? ae.id : null;
    const caret = focusId && typeof ae.selectionStart === 'number' ? ae.selectionStart : null;
    $('#main').dataset.view = A.tab;
    $('#main').innerHTML = html;
    window.scrollTo(0, y);
    if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus(); if (caret !== null && el.setSelectionRange) el.setSelectionRange(caret, caret); } }
  }
  function timerLeft(t) { return t ? (t.paused ? t.remaining : Math.max(0, Math.round((t.endsAt - (Date.now() + A.offset)) / 1000))) : null; }
  function renderStatus() {
    const O = A.O; if (!O) return;
    const c = O.state.conn, t = c.timer, left = timerLeft(t);
    $('#status').innerHTML = `
      <span class="pill ${A.connected ? 'on' : 'off'}">${A.connected ? '● conectado' : '○ desconectado'}</span>
      <span class="pill hot ${O.state.presentation ? 'suc' : ''}">Celulares: ${O.state.presentation ? '🚀 Sucesso · ' + esc(O.state.presentation.title) : O.state.block === 'stage' ? '🎤 ' + esc(stageNow().title) : BLOCK_LABEL[O.state.block]}</span>
      <span class="pill">Conexões: ${PHASE_LABEL[c.phase] || c.phase}${c.round ? ` · viagem ${c.round}/3` : ''}</span>
      ${t ? `<span class="pill led ${t.paused ? 'paused' : ''}">${TIMER_LABEL[t.kind] || t.kind} ${fmt(left)}${t.paused ? ' ⏸' : ''}</span>` : ''}
      <span class="pill">A bordo: ${O.counts.checkedIn}/${O.counts.total}</span>`;
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
  const stageNow = () => { const O = A.O, list = O.settings.stages || []; return list[Math.min(list.length - 1, O.state.stage || 0)] || { title: 'Bloco', theme: '', speaker: '' }; };

  function blockCard(key, body, extra = '') {
    const on = !A.O.state.presentation && A.O.state.block === key;
    return `<div class="block ${on ? 'active' : ''}" id="blk-${key}">
      <div class="bh"><span class="bi">${BLOCK_ICON[key]}</span><div class="bt">${BLOCK_LABEL[key]}<div class="small">${on ? '● na tela dos celulares agora' : 'pronto para exibir'}</div></div>
        ${extra}<button class="btn sm ${on ? 'ghost' : 'cyan'}" data-act="setBlock" data-block="${key}" ${on || A.O.state.presentation ? 'disabled' : ''}>${on ? 'Exibindo' : '▶ Exibir nos celulares'}</button></div>
      <div class="bb">${body}</div></div>`;
  }
  /* ---------- De Volta para o Sucesso ---------- */
  // As quatro dinâmicas do painel do Lucas (/painel). Aqui o Doc escolhe a sala, libera a dinâmica
  // no telão e nos celulares e controla o recebimento; o carro, a nuvem e o sorteio ficam no painel 3D.
  const SUC = { rooms: null, roomId: localStorage.getItem('bttf.sucessoRoom') || '', states: {}, resp: new Map(), cursor: 0, offset: 0, timer: null, error: '', loading: false };
  const DYN = {
    d1: { n: '01', c: 'var(--cyan)', hint: 'Abre recebendo · nuvem de palavras ao vivo' },
    d2: { n: '02', c: 'var(--yellow)', hint: '2 min · carro carrega 1,21 GW · depois nuvem + sorteio com 2 min de fala' },
    d3: { n: '03', c: 'var(--magenta)', hint: '2 min · carro · depois nuvem + sorteio com 3 min de fala (desafio → IA → impacto)' },
    d4: { n: '04', c: 'var(--orange)', hint: '2 min · carro · a pessoa pode enviar sem nome · nuvem + "Destino: 2027"' },
  };
  const SUC_PHASE = { idle: 'aguardando abertura', run: 'recebendo respostas', paused: 'recebimento pausado', done: 'recebimento encerrado' };
  function sucStart() { if (!SUC.timer && !SUC.loading) sucPoll(); }
  function sucStop() { clearTimeout(SUC.timer); SUC.timer = null; }
  async function sucPoll() {
    clearTimeout(SUC.timer); SUC.timer = null; SUC.loading = true;
    try {
      if (!SUC.rooms) {
        const r = await api('GET', '/api/rooms'); SUC.rooms = r.rooms || [];
        if (!SUC.rooms.some(x => x.id === SUC.roomId)) { SUC.roomId = SUC.rooms[0] ? SUC.rooms[0].id : ''; SUC.cursor = 0; SUC.resp.clear(); }
      }
      if (SUC.roomId) {
        const d = await api('GET', `/api/rooms/${SUC.roomId}/snapshot?after=${SUC.cursor}`);
        SUC.offset = d.serverNow - Date.now();
        for (const a of d.activities) SUC.states[a.id] = a;
        for (const x of d.responses || []) SUC.resp.set(x.id, { a: x.activityId, r: x.roundId, n: x.name, t: x.answer, at: x.createdAt });
        SUC.cursor = d.cursor || SUC.cursor;
      }
      SUC.error = '';
    } catch (e) { SUC.error = e.message; SUC.rooms = SUC.rooms && SUC.rooms.length ? SUC.rooms : null; }
    SUC.loading = false;
    if (A.tab === 'sucesso') { SUC.timer = setTimeout(sucPoll, document.hidden ? 6000 : 2000); render(); }
  }
  const sucAnswers = k => { const st = SUC.states[k], out = []; if (st) for (const v of SUC.resp.values()) if (v.a === k && v.r === st.roundId) out.push(v); return out; };
  const sucCount = k => sucAnswers(k).length;
  const TALK = { d2: 120, d3: 180 }; // dinâmicas com sorteio e tempo de fala (como no painel do Lucas)
  function talkLeft(t) { return t ? (t.endsAt ? Math.max(0, Math.ceil((t.endsAt - Date.now() - A.offset) / 1000)) : t.remaining) : 0; }
  // Registro das respostas (.txt ou Word), como o botão de download do painel 3D
  function sucDownload(k, type) {
    const st = SUC.states[k], list = sucAnswers(k), date = new Date().toLocaleString('pt-BR');
    if (!st || !list.length) return toast('Nenhuma resposta para baixar.', true);
    const title = `De Volta para o Sucesso | Dinâmica ${k.slice(1)}: ${st.title}`;
    let blob, name = `Respostas_${st.title.replace(/[^\p{L}\p{N}]+/gu, '')}`;
    if (type === 'txt') { blob = new Blob([`${title.toUpperCase()}\nPergunta: ${st.question}\nData: ${date}\nTotal: ${list.length}\n\n` + list.map((r, i) => `${i + 1}. ${r.n}: ${r.t}`).join('\n')], { type: 'text/plain;charset=utf-8' }); name += '.txt'; }
    else {
      const h = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"></head><body style="font-family:Calibri"><h1 style="color:#FF6B1A">${esc(title)}</h1><p><b>Pergunta:</b> ${esc(st.question)}</p><p><b>Data:</b> ${date} &nbsp; <b>Total:</b> ${list.length}</p><table border="1" cellpadding="6" style="border-collapse:collapse;width:100%"><tr style="background:#17142E;color:#fff"><th>#</th><th>Nome</th><th>Resposta</th></tr>${list.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.n)}</td><td>${esc(r.t)}</td></tr>`).join('')}</table></body></html>`;
      blob = new Blob(['\ufeff', h], { type: 'application/msword' }); name += '.doc';
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); toast('Download iniciado');
  }
  function sucLeft(st) {
    if (!st) return null;
    if (st.phase === 'run' && st.endsAt) return Math.max(0, Math.ceil((st.endsAt - Date.now() - SUC.offset) / 1000));
    return st.id === 'd1' ? null : st.remainingSeconds;
  }
  function sucBanner() {
    const p = A.O && A.O.state.presentation;
    if (!p) return '';
    const d = DYN[p.activityId] || DYN.d1;
    return `<div class="card suc-live" style="--c:${d.c}"><div class="suc-live-row"><div><div class="kicker">🚀 No telão e nos celulares agora</div>
      <h2 style="margin:4px 0 2px">De Volta para o Sucesso · Dinâmica ${d.n} · ${esc(p.title)}</h2>
      <p class="small">${esc(p.question)} · A viagem do bloco Conexões fica pausada e volta sozinha quando você voltar ao Townhall.</p></div>
      <div class="actions"><a class="btn ghost sm" href="/painel?sala=${encodeURIComponent(p.roomId)}&d=${encodeURIComponent(p.activityId)}" target="_blank">Painel 3D ↗</a><button class="btn sm" data-act="sucStop">⏮ Voltar ao Townhall</button></div></div></div>`;
  }
  function vSucesso() {
    const pres = A.O.state.presentation, room = (SUC.rooms || []).find(r => r.id === SUC.roomId);
    const clock = new Date(Date.now() + A.offset).toTimeString().slice(0, 5);
    const rooms = SUC.rooms || [];
    const cards = Object.keys(DYN).map(k => {
      const d = DYN[k], st = SUC.states[k], live = pres && pres.roomId === SUC.roomId && pres.activityId === k;
      const answers = sucAnswers(k), n = answers.length, left = sucLeft(st), ph = st ? st.phase : null, draw = live ? pres.draw : null;
      return `<div class="suc-card ${live ? 'live' : ''}" style="--c:${d.c}">
        <div class="suc-head"><span class="n">${d.n}</span><div><div class="t">Dinâmica ${+d.n}: ${esc(st ? st.title : '')}</div><div class="small">${esc(d.hint)}</div></div>${live ? '<span class="pill hot">● no telão</span>' : ''}</div>
        <p class="q">${esc(st ? st.question : 'Carregando…')}</p>
        <div class="suc-stats"><div class="tcx"><b>${String(n).padStart(3, '0')}</b><span>RESPOSTAS</span></div>${left !== null && left !== undefined ? `<div class="tcx ${ph === 'run' && left <= 30 ? 'alert' : ''}" style="--c:var(--yellow)"><b class="suc-left" data-k="${k}">${fmt(left)}</b><span>RECEBIMENTO</span></div>` : ''}<span class="suc-ph" data-phase="${ph || ''}">${ph ? SUC_PHASE[ph] : '—'}</span></div>
        <div class="actions">
          ${live ? `<button class="btn sm ghost" data-act="sucStop">⏮ Voltar ao Townhall</button>` : `<button class="btn sm cyan" data-act="sucShow" data-k="${k}" ${SUC.roomId ? '' : 'disabled'}>📺 Liberar no telão e celulares</button>`}
          <button class="btn sm" data-act="sucCmd" data-cmd="start" data-k="${k}" ${st && (ph === 'idle' || ph === 'paused') ? '' : 'disabled'}>▶ ${ph === 'paused' ? 'Retomar' : k === 'd1' ? 'Abrir' : 'Iniciar'} recebimento${k === 'd1' || ph === 'paused' ? '' : ' (2 min)'}</button>
          <button class="btn sm ghost" data-act="sucCmd" data-cmd="pause" data-k="${k}" ${ph === 'run' ? '' : 'disabled'}>❚❚ Pausar</button>
          <button class="btn sm ghost" data-act="sucCmd" data-cmd="end" data-k="${k}" ${st && ph !== 'done' ? '' : 'disabled'}>⏭ Encerrar</button>
          <button class="btn sm ghost" data-act="sucCmd" data-cmd="reset" data-k="${k}" ${ph === 'done' || ph === 'paused' ? '' : 'disabled'}>↺ Reiniciar</button>
        </div>
        ${live && TALK[k] ? (draw ? `<div class="suc-draw on"><div class="small">🎲 VIAJANTE SORTEADO${draw.personId ? ' · avisado no celular' : ''}</div><div class="who">${esc(draw.name)}</div><div class="what">“${esc(draw.answer)}”</div>
            <div class="suc-stats"><div class="tcx ${draw.talk.endsAt && talkLeft(draw.talk) <= 30 ? 'alert' : ''}" style="--c:var(--orange)"><b class="suc-talk">${fmt(talkLeft(draw.talk))}</b><span>TEMPO DE FALA</span></div>
              <div class="actions">${draw.talk.endsAt && talkLeft(draw.talk) > 0 ? '<button class="btn sm ghost" data-act="sucDraw" data-cmd="talkPause">❚❚ Pausar</button>' : '<button class="btn sm cyan" data-act="sucDraw" data-cmd="talkStart">▶ Iniciar fala</button>'}<button class="btn sm ghost" data-act="sucDraw" data-cmd="talkReset">↺ Reiniciar</button></div></div>
            <div class="actions"><button class="btn sm" data-act="sucDraw" data-cmd="draw">🎲 Sortear outro</button><button class="btn sm ghost" data-act="sucDraw" data-cmd="close">Voltar para a nuvem</button></div></div>`
          : `<div class="suc-draw"><button class="btn sm" data-act="sucDraw" data-cmd="draw" ${ph === 'done' && n ? '' : 'disabled'}>🎲 Sortear viajante</button><span class="small">${ph === 'done' ? (n ? `${fmt(TALK[k])} de fala para quem for sorteado` : 'sem respostas para sortear') : 'disponível depois de encerrar o recebimento'}</span></div>`) : ''}
        ${n ? `<details class="suc-answers"><summary>Ver respostas (${n})</summary><div class="list">${answers.slice().reverse().map(r => `<p><b>${esc(r.n)}</b> · ${esc(r.t)}</p>`).join('')}</div>
            <div class="actions"><button class="btn ghost xs" data-act="sucDownload" data-k="${k}" data-type="txt">⬇ Baixar .txt</button><button class="btn ghost xs" data-act="sucDownload" data-k="${k}" data-type="doc">⬇ Baixar Word</button></div></details>` : ''}
        <div class="actions suc-links"><a href="/painel?sala=${encodeURIComponent(SUC.roomId)}&d=${k}" target="_blank" ${SUC.roomId ? '' : 'aria-disabled="true"'}>🚗 Abrir no painel 3D ↗</a><a href="#" data-act="sucCopy" data-k="${k}">🔗 Copiar link de resposta</a><a href="#" class="danger" data-act="sucCmd" data-cmd="clear" data-k="${k}">🗑 Limpar respostas</a></div>
      </div>`;
    }).join('');
    return `${sucBanner()}
      <div class="card suc-hero">
        <div class="suc-circuits"><div class="tcx" style="--c:var(--yellow)"><b>2026</b><span>LAST TIME DEPARTED</span></div><div class="tcx" style="--c:var(--cyan)"><b>${clock}</b><span>PRESENT TIME</span></div><div class="tcx" style="--c:var(--orange)"><b>2027</b><span>DESTINATION TIME</span></div></div>
        <h1 class="suc-title">DE VOLTA PARA O SUCESSO</h1>
        <p class="small center">As quatro dinâmicas do Lucas, agora no fluxo do evento. <b>Liberar</b> põe a pergunta no telão e abre a resposta no app de cada pessoa, já com o nome do check-in. Ao <b>encerrar</b>, o carro entra no portal e o telão mostra a nuvem de palavras; nas dinâmicas 2 e 3 você <b>sorteia</b> um viajante e controla o tempo de fala por aqui. <b>Voltar ao Townhall</b> devolve o evento de onde parou.</p>
        <p class="small center">${(A.O.telao || {}).count ? ((A.O.telao || {}).auth ? '<span class="ok">✔ Telão aberto e logado: mostra respostas, nuvem e sorteio.</span>' : '<span class="warn">⚠ O telão está aberto sem login: não vai mostrar as respostas, a nuvem nem o texto do sorteado.</span>') : '<span class="warn">⚠ Nenhum telão aberto.</span>'} As respostas só aparecem no telão aberto <b>neste navegador</b> (logado): <a href="/telao.html" target="_blank">abrir telão ↗</a>. O <a href="/painel${SUC.roomId ? '?sala=' + encodeURIComponent(SUC.roomId) : ''}" target="_blank">painel 3D ↗</a> original continua disponível.</p>
        <div class="actions suc-room">
          ${rooms.length ? `<label class="small">Sala <select class="input" data-act="sucRoom">${rooms.map(r => `<option value="${esc(r.id)}" ${r.id === SUC.roomId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>` : `<span class="small">${SUC.rooms ? 'Nenhuma sala ainda.' : 'Carregando salas…'}</span>`}
          <button class="btn sm ${rooms.length ? 'ghost' : ''}" data-act="sucNewRoom">＋ ${rooms.length ? 'Nova sala' : 'Criar a sala do evento'}</button>
          ${room ? `<span class="small">${esc(room.name)} · respostas salvas no servidor</span>` : ''}
        </div>
        ${SUC.error ? `<div class="warn">⚠ ${esc(SUC.error)}</div>` : ''}
      </div>
      <div class="suc-grid">${cards}</div>`;
  }
  setInterval(() => {
    if (A.tab !== 'sucesso') return;
    document.querySelectorAll('.suc-left').forEach(b => { const left = sucLeft(SUC.states[b.dataset.k]); if (left !== null && left !== undefined) b.textContent = fmt(left); });
    const d = A.O && A.O.state.presentation && A.O.state.presentation.draw, tk = $('.suc-talk');
    if (d && tk) { const left = talkLeft(d.talk); if (tk.textContent !== fmt(left)) { tk.textContent = fmt(left); if (left === 0 || left === 30) render(); } }
  }, 500);

  function vControl() {
    const O = A.O, s = O.state, c = s.conn, ph = c.phase, t = c.timer, S = O.settings;
    const late = O.people.filter(p => p.late);
    const notRanked = O.people.filter(p => p.active && p.checkedInAt && p.inRounds && !p.ranked);
    const round = O.rounds[A.round - 1];
    const regenFrom = ph === 'matching' ? c.round : c.round + 1;
    const levelTxt = { strict: 'área ≠ e WL ≠ em todas as duplas', wl: 'precisou liberar WL igual em algumas duplas', area: 'precisou liberar área igual em algumas duplas', all: 'sem restrição em algumas duplas' };
    const ranked = O.people.filter(p => p.ranked).length, rankTotal = O.people.filter(p => p.inRounds && p.active && p.checkedInAt).length;
    const inProgress = ['matching', 'talk', 'roundEnd', 'ranking'].includes(ph);

    const welcome = `<div class="small">Os viajantes escolhem o próprio nome na lista; quem já escolheu some da lista. Quem errou tem o botão "voltar e escolher outro nome".</div>
      <div class="stats" style="margin-top:10px"><div class="stat"><b>${O.counts.checkedIn}</b><span class="small">a bordo</span></div><div class="stat"><b>${O.counts.total - O.counts.checkedIn}</b><span class="small">ainda não entraram</span></div></div>
      <div class="bar"><i style="width:${Math.round(100 * O.counts.checkedIn / Math.max(1, O.counts.total))}%"></i></div>
      <div class="small">No telão: QR code + link para o check-in. Lista de quem falta na aba <a href="#" data-go="people">Pessoas</a>.</div>`;
    const standby = `<div class="small">Tela "apagada" nos celulares: <i>"${esc(S.standbyText || '')}"</i>. Use quando a atenção deve estar no telão (PPT, fala do Doc). Texto editável na aba <a href="#" data-go="config">Config</a>.</div>`;
    const message = `<div class="form two">
        <label class="f">Emoji<input class="input" id="msgEmoji" value="${esc(s.message.emoji)}"></label>
        <label class="f">Título<input class="input" id="msgTitle" value="${esc(s.message.title)}"></label>
        <label class="f" style="grid-column:1/-1">Texto (URLs viram links)<textarea class="input" id="msgBody">${esc(s.message.body)}</textarea></label>
      </div><div class="actions" style="margin-top:8px"><button class="btn ghost sm" data-act="saveMessage">Salvar</button><button class="btn sm" data-act="showMessage">📣 Salvar e exibir nos celulares</button></div>`;
    const closing = `<div class="small">Agradecimento + lembrete da conexão de cada pessoa. No telão: créditos com o nome de todos. Texto editável na aba <a href="#" data-go="config">Config</a>.</div>`;

    const connections = `
      <div class="steps">
        <div class="step ${!c.generatedAt ? 'active' : 'done'}"><div class="n">1</div><div class="b">
          <div class="t">Duplas (${O.counts.checkedIn} viajantes a bordo)</div>
          <div class="small">Área diferente, WL diferente, sem repetir dupla; ímpar forma trio.${c.generatedAt ? ` · Geradas às ${new Date(c.generatedAt).toLocaleTimeString('pt-BR')} · ${levelTxt[c.worstLevel] || ''}` : ''}</div>
          ${c.repeats ? '<div class="warn">⚠ Com menos de 6 viajantes algumas duplas se repetem (modo ensaio).</div>' : ''}
          ${late.length ? `<div class="warn">⚠ ${late.length} pessoa(s) entraram depois do sorteio e estão fora das rotas: ${esc(late.map(p => p.name).join(', '))}.${regenFrom <= 3 && inProgress ? ' Recalcule as viagens restantes.' : ''}</div>` : ''}
          <div class="actions">
            ${!(c.played >= 1) ? `<button class="btn ghost sm" data-act="generate" ${O.counts.checkedIn < 2 ? 'disabled' : ''}>⚡ ${c.generatedAt ? 'Sortear de novo' : 'Sortear duplas'}</button>` : ''}
            ${c.generatedAt && inProgress && ph !== 'ranking' && regenFrom <= 3 ? `<button class="btn ghost sm" data-act="regenRest">↻ Recalcular ${ph === 'matching' ? `a partir da viagem ${regenFrom}` : `viagens ${regenFrom}–3`}</button>` : ''}
          </div>
        </div></div>

        <div class="step ${['ready'].includes(ph) || (ph === 'idle' && O.counts.checkedIn >= 2) ? 'active' : inProgress || ph === 'results' ? 'done' : ''}"><div class="n">2</div><div class="b">
          <div class="t">Iniciar as viagens</div>
          <div class="small">${S.autoFlow ? `Automático: ${fmt(S.findSeconds)} para se encontrar → ${fmt(S.roundSeconds)} de conversa → ${S.breakSeconds}s de "88 MPH" → próxima dupla. Depois da 3ª, a avaliação abre sozinha e fecha em ${fmt(S.rankingSeconds)} ou quando todos avaliarem.` : 'Modo manual: você revela cada viagem, inicia e encerra cada conversa pelos botões abaixo.'} <a href="#" data-go="config">Ajustar tempos</a></div>
          <div class="actions"><button class="btn" data-act="startJourney" ${O.counts.checkedIn >= 2 && !inProgress && ph !== 'results' ? '' : 'disabled'}>▶ Iniciar viagens${c.generatedAt ? '' : ' (sorteia e começa)'}</button></div>
        </div></div>

        <div class="step ${inProgress ? 'active' : ''}"><div class="n">3</div><div class="b">
          <div class="t">Ao vivo · ${PHASE_LABEL[ph]}${c.round ? ` · viagem ${c.round}/3` : ''}${t ? ` · ${TIMER_LABEL[t.kind]} <span class="mono" id="liveTimer">${fmt(timerLeft(t))}</span>${t.paused ? ' ⏸' : ''}` : ''}</div>
          <div class="actions">
            ${t ? (t.paused ? '<button class="btn cyan sm" data-act="resume">▶ Retomar</button>' : '<button class="btn ghost sm" data-act="pause">⏸ Pausar</button>') : ''}
            <button class="btn ghost sm" data-act="addTime" ${t ? '' : 'disabled'}>+30s</button>
            <button class="btn ghost sm" data-act="skip" ${inProgress ? '' : 'disabled'}>⏭ Pular etapa</button>
            ${ph === 'ranking' ? `<button class="btn sm" data-act="computeResults">🔮 Calcular conexões agora</button>` : ''}
            ${ph === 'results' ? `<button class="btn ghost sm" data-act="computeResults">🔮 Recalcular e reenviar</button><button class="btn sm" data-act="setBlock" data-block="closing">🏁 Ir para o encerramento</button>` : ''}
          </div>
          ${ph === 'ranking' || ph === 'results' ? `<div class="small">${ranked} de ${rankTotal} avaliaram</div><div class="bar"><i style="width:${Math.round(100 * ranked / Math.max(1, rankTotal))}%"></i></div>${notRanked.length ? `<div class="small">Faltam: ${esc(notRanked.map(p => p.name).join(', '))}</div>` : '<div class="ok">✔ Todos avaliaram</div>'}` : ''}
          <details class="manual"><summary>Controle manual (se precisar interferir)</summary><div class="actions" style="margin-top:8px">
            <button class="btn ghost sm" data-act="reveal" data-round="${ph === 'ready' ? 1 : c.round + 1}" ${(ph === 'ready' || ph === 'roundEnd') && (ph === 'ready' ? 1 : c.round + 1) <= 3 ? '' : 'disabled'}>👥 Revelar viagem ${ph === 'ready' ? 1 : Math.min(3, c.round + 1)}</button>
            <button class="btn ghost sm" data-act="startTalk" ${ph === 'matching' ? '' : 'disabled'}>▶ Iniciar conversa</button>
            <button class="btn ghost sm" data-act="endTalk" ${ph === 'talk' ? '' : 'disabled'}>⏹ Encerrar conversa</button>
            <button class="btn ghost sm" data-act="openRanking" ${c.played >= 1 && ph !== 'ranking' && ph !== 'results' ? '' : 'disabled'}>📋 Abrir avaliação</button>
            ${ph === 'matching' ? `<button class="btn ghost sm" data-act="reveal" data-round="${c.round}">↻ Re-revelar viagem ${c.round}</button>` : ''}
            <button class="btn red sm" data-act="resetConnections">Resetar bloco</button>
          </div></details>
        </div></div>
      </div>`;

    const screenUrl = `${location.origin}/telao.html`;
    const scene = (s.screen && s.screen.scene) || 'auto';
    const telao = `<div class="card"><h2>📽 Telão</h2>
      <p class="small"><a href="${esc(screenUrl)}" target="_blank">${esc(screenUrl)}</a> · automático segue o bloco; relógio e logo servem de fundo.</p>
      <div class="actions" style="margin-top:10px">${[['auto', '🔁 Automático'], ['clock', '🕰 Relógio'], ['logo', '⚡ Logo']].map(([k, l]) => `<button class="btn sm ${scene === k ? '' : 'ghost'}" data-act="setScene" data-scene="${k}">${l}</button>`).join('')}</div>
      <label class="sw" style="margin-top:10px"><input type="checkbox" data-act="toggleMutual" ${S.showMutualOnScreen ? 'checked' : ''}> Mostrar os nomes das conexões mútuas no telão (só primeiros nomes)</label></div>`;

    // Blocos do evento (falas): rascunho local para não perder o que está sendo digitado quando o painel atualiza
    const stages = A.stageDraft || S.stages || [], dirty = !!A.stageDraft, stageOn = !s.presentation && s.block === 'stage';
    const stagesCard = `<div class="card"><h2>🎤 Blocos do evento</h2>
        <p class="small">Para os momentos de fala: ao exibir um bloco, os celulares mostram o nome e o tema dele, o telão fica calmo (sem animação)${S.stageMutes ? ' e o som desliga' : ''}. Edite os textos à vontade.</p>
        <div class="stages">${stages.map((g, i) => { const on = stageOn && !dirty && (s.stage || 0) === i; return `<div class="stage-row ${on ? 'active' : ''}">
            <input class="input" data-stage="${i}" data-f="title" id="stg-t-${i}" value="${esc(g.title)}" placeholder="Bloco ${i + 1}" aria-label="Nome do bloco">
            <input class="input" data-stage="${i}" data-f="theme" id="stg-h-${i}" value="${esc(g.theme)}" placeholder="Tema do bloco (aparece no celular e no telão)" aria-label="Tema">
            <input class="input" data-stage="${i}" data-f="speaker" id="stg-s-${i}" value="${esc(g.speaker)}" placeholder="Quem fala (opcional)" aria-label="Quem fala">
            <button class="btn sm ${on ? 'ghost' : 'cyan'}" data-act="showStage" data-i="${i}" ${on || s.presentation ? 'disabled' : ''}>${on ? '● Exibindo' : '▶ Exibir'}</button>
            <button class="btn ghost xs" data-act="delStage" data-i="${i}" title="Remover bloco" ${stages.length <= 1 ? 'disabled' : ''}>✕</button>
          </div>`; }).join('')}</div>
        <div class="actions" style="margin-top:10px"><button class="btn ghost sm" data-act="addStage" ${stages.length >= 12 ? 'disabled' : ''}>＋ Adicionar bloco</button>${dirty ? '<button class="btn sm" data-act="saveStages">Salvar blocos</button><button class="btn ghost sm" data-act="discardStages">Descartar</button><span class="warn">alterações não salvas</span>' : ''}</div>
      </div>`;

    return `${sucBanner()}
      ${stagesCard}
      <div class="card"><h2>Telas e dinâmicas</h2>
        ${blockCard('welcome', welcome)}
        ${blockCard('standby', standby)}
        ${blockCard('message', message)}
        ${blockCard('connections', connections)}
        ${blockCard('closing', closing)}
      </div>
      ${telao}
      ${O.results.length ? `<div class="card ok"><h2>Conexões calculadas (${O.results.length})</h2><div class="tblwrap"><table class="tbl"><tr><th>Viajante</th><th>Conexão sugerida</th><th>Pts</th><th>Mútua</th></tr>
        ${O.results.slice().sort((a, b) => (b.mutual - a.mutual) || (b.score - a.score)).map(r => `<tr><td>${av(r.person)}${esc(r.person.name)}</td><td>${r.match ? av(r.match) + esc(r.match.name) : '<span class="x">—</span>'}</td><td class="mono">${r.score}</td><td>${r.mutual ? '<span class="ok">⚡ sim</span>' : '<span class="x">não</span>'}</td></tr>`).join('')}</table></div></div>` : ''}
      ${c.generatedAt ? `<div class="card"><h2>Duplas por viagem</h2>
        <div class="subtabs">${O.rounds.map(r => `<button class="${A.round === r.round ? 'on' : ''}" data-roundtab="${r.round}">Viagem ${r.round} · ${esc(r.era.year)} ${r.round === c.round ? '●' : ''}</button>`).join('')}</div>
        ${round && round.groups.length ? `<div class="small" style="margin-bottom:6px">${round.groups.length} grupos · ${round.check.ok}/${round.check.total} pares com área ≠ e WL ≠ · nível: ${esc(levelTxt[round.level] || round.level || '')}</div>
          ${round.groups.map(g => `<div class="grp"><span class="code">${esc(g.code)}</span>${g.members.map((m, i) => `${i ? '<span class="x">⇄</span>' : ''}<span class="m">${av(m)}<b>${esc(m.name)}</b><span class="meta">(${esc(m.area)} · ${esc(m.wl)})</span></span>`).join('')}<span class="${g.flags.area && g.flags.wl ? 'ok' : 'warn'}" style="margin-left:auto">${g.flags.area ? '✔ área' : '! área'} ${g.flags.wl ? '✔ WL' : '! WL'}</span>${round.round === c.round && ph === 'talk' && g.currentQuestion ? `<div class="q">pergunta ${g.position + 1}/${g.queueLen}: ${esc(g.currentQuestion)}</div>` : ''}</div>`).join('')}` : '<p class="muted">Rodada ainda não gerada.</p>'}
      </div>` : ''}`;
  }
  setInterval(() => { const el = $('#liveTimer'); const t = A.O && A.O.state.conn.timer; if (el && t) el.textContent = fmt(timerLeft(t)); }, 500);

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
          <button class="btn red" data-act="resetEvent">Resetar evento (check-ins + conexões)</button>
        </div>
        <p class="small" style="margin-top:8px">Resetar o evento desfaz os check-ins: todo mundo precisa selecionar o nome de novo. A lista de pessoas e as perguntas são mantidas.</p></div>`;
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
      case 'startJourney': return confirmRun(`Iniciar as viagens agora com ${O.counts.checkedIn} viajantes a bordo?${O.state.conn.generatedAt ? '' : ' As duplas serão sorteadas.'}`, () => act('startJourney'), 'Viagem 1 começou ⚡');
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
      case 'resetEvent': return confirmRun('Resetar o EVENTO inteiro? Desfaz check-ins, duplas, avaliações e resultados.', () => act('resetEvent'), 'Evento resetado');
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
      case 'audio': return run(() => act('setAudio', { mode: el.dataset.mode }), el.dataset.mode === 'off' ? 'Som desligado' : `${AUDIO_LABEL[el.dataset.mode]} ligada · o som sai ${(O.state.audio || {}).out === 'painel' ? 'deste computador' : 'do telão'}`);
      case 'audioOut': return run(() => act('setAudio', { out: el.dataset.out }), el.dataset.out === 'painel' ? 'O som agora sai deste computador' : 'O som agora sai do telão');
      case 'audioVol': return run(() => act('setAudio', { volume: +el.value }));
      case 'addStage': A.stageDraft = (A.stageDraft || O.settings.stages || []).map(x => ({ ...x })).concat({ title: `Bloco ${(A.stageDraft || O.settings.stages || []).length + 1}`, theme: '', speaker: '' }); return render(true);
      case 'delStage': A.stageDraft = (A.stageDraft || O.settings.stages || []).map(x => ({ ...x })).filter((_, i) => i !== +el.dataset.i); return render(true);
      case 'discardStages': A.stageDraft = null; return render(true);
      case 'saveStages': return run(async () => { await act('settings', { settings: { stages: A.stageDraft } }); A.stageDraft = null; }, 'Blocos salvos');
      case 'showStage': return run(async () => { if (A.stageDraft) { await act('settings', { settings: { stages: A.stageDraft } }); A.stageDraft = null; } await act('setStage', { index: +el.dataset.i }); }, 'Bloco exibido nos celulares e no telão');
      case 'sucDraw': return run(() => api('POST', '/api/admin/sucesso/draw', { action: el.dataset.cmd }));
      case 'sucDownload': return sucDownload(el.dataset.k, el.dataset.type);
      case 'sucShow': return run(async () => { await api('POST', '/api/admin/presentation', { roomId: SUC.roomId, activityId: el.dataset.k }); sucPoll(); }, 'Dinâmica no telão e nos celulares 🚀');
      case 'sucStop': return run(async () => { await api('POST', '/api/admin/presentation', { roomId: null }); sucPoll(); }, 'De volta ao townhall');
      case 'sucCmd': {
        const k = el.dataset.k, cmd = el.dataset.cmd;
        const go = () => run(async () => { await api('POST', `/api/rooms/${SUC.roomId}/activities/${k}/command`, { action: cmd }); await sucPoll(); });
        if (cmd === 'clear') return confirm('Apagar as respostas desta dinâmica? Não dá para desfazer.') && go();
        if (cmd === 'end') return confirm('Encerrar o recebimento agora? No painel 3D o carro entra no portal.') && go();
        return go();
      }
      case 'sucRoom': SUC.roomId = el.value; localStorage.setItem('bttf.sucessoRoom', SUC.roomId); SUC.cursor = 0; SUC.resp.clear(); SUC.states = {}; return sucPoll();
      case 'sucNewRoom': {
        const name = prompt('Nome da sala (ex.: Townhall · Novembro 2026):', 'Townhall · De Volta para o Sucesso');
        if (!name) return;
        return run(async () => { const r = await api('POST', '/api/rooms', { name }); SUC.roomId = r.id; localStorage.setItem('bttf.sucessoRoom', r.id); SUC.rooms = null; SUC.cursor = 0; SUC.resp.clear(); SUC.states = {}; await sucPoll(); }, 'Sala criada');
      }
      case 'sucCopy': {
        const url = `${location.origin}/participar/${SUC.roomId}?d=${el.dataset.k}`;
        return navigator.clipboard.writeText(url).then(() => toast('Link copiado'), () => prompt('Copie o link:', url));
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
    const tab = e.target.closest('#tabs [data-tab]'); if (tab) { A.tab = tab.dataset.tab; document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b === tab)); render(true); return; }
    const go = e.target.closest('[data-go]'); if (go) { e.preventDefault(); A.tab = go.dataset.go; document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === A.tab)); render(true); return; }
    const rt = e.target.closest('[data-roundtab]'); if (rt) { A.round = +rt.dataset.roundtab; render(true); return; }
    const el = e.target.closest('[data-act]'); if (el && el.tagName !== 'INPUT' && el.tagName !== 'SELECT') { if (el.tagName === 'A') e.preventDefault(); onAction(el); }
  });
  document.addEventListener('change', e => { const el = e.target.closest('input[data-act],select[data-act]'); if (el) onAction(el); });
  document.addEventListener('pointerup', () => setTimeout(renderAudio, 300), true);
  document.addEventListener('input', e => {
    if (e.target.id === 'peopleQ') { A.peopleQ = e.target.value; render(true); }
    const st = e.target.closest('[data-stage]'); // rascunho dos blocos do evento
    if (st) { const first = !A.stageDraft; A.stageDraft = A.stageDraft || (A.O.settings.stages || []).map(x => ({ ...x })); A.stageDraft[+st.dataset.stage][st.dataset.f] = st.value; if (first) render(true); }
  });
  document.addEventListener('pointerdown', () => { A.pressing = true; }, true);
  document.addEventListener('pointerup', () => { A.pressing = false; }, true);
  document.addEventListener('pointercancel', () => { A.pressing = false; }, true);

  if (A.key) { $('#login').classList.add('hidden'); connect(); }
})();
