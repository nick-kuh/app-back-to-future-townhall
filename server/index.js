// Servidor: Express (API + estáticos) + Socket.IO (tempo real).
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { Engine, TOTAL_ROUNDS } = require('./engine');
const { DB_PATH, DATA_DIR } = require('./db');
const { createSucesso } = require('./sucesso');

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'doc1985';

// Um bug em qualquer handler não pode derrubar o evento inteiro: registra e segue.
process.on('uncaughtException', err => console.error('[uncaughtException]', err));
process.on('unhandledRejection', err => console.error('[unhandledRejection]', err));

const engine = new Engine();
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, pingInterval: 10000, pingTimeout: 20000 });

const sucesso = createSucesso({ dbPath: process.env.SUCESSO_DB_PATH || path.join(DATA_DIR, 'sucesso.db'), adminPassword: ADMIN_PASSWORD });

app.disable('x-powered-by');
app.use(require('compression')()); // gzip: páginas e scripts chegam mais rápido no Wi-Fi do evento
// Fontes dos mostradores de LED (DSEG, licença OFL), servidas da própria instalação
const DSEG = path.join(__dirname, '..', 'node_modules', 'dseg', 'fonts');
app.get('/fonts/dseg14.woff2', (req, res) => res.sendFile(path.join(DSEG, 'DSEG14-Classic', 'DSEG14Classic-Bold.woff2'), { maxAge: '7d', immutable: true }));
app.get('/fonts/dseg7.woff2', (req, res) => res.sendFile(path.join(DSEG, 'DSEG7-Classic', 'DSEG7Classic-Bold.woff2'), { maxAge: '7d', immutable: true }));
// Fonte do logo: se houver um arquivo de fonte em public/fonts (ex.: "Back to the Future 2002"), o logo passa a usá-lo.
app.get('/fonts/logo.css', (req, res) => {
  let file = null;
  try { file = fs.readdirSync(path.join(__dirname, '..', 'public', 'fonts')).find(f => /\.(woff2?|ttf|otf)$/i.test(f)) || null; } catch { /* pasta ausente */ }
  res.type('css').set('Cache-Control', 'no-cache').send(file ? `@font-face{font-family:"BTTF Logo";src:url("/fonts/${encodeURIComponent(file)}");font-display:swap}` : '/* sem fonte própria em public/fonts: o logo usa a fonte padrão */');
});
// Three.js (carro 3D) servido da própria instalação, sem CDN
app.get('/vendor/three/three.module.min.js', (req, res) => res.sendFile(path.join(__dirname, '..', 'node_modules', 'three', 'build', 'three.module.min.js'), { maxAge: '7d', immutable: true }));
app.set('trust proxy', true); // Render/HTTPS: req.protocol correto para a checagem de origem da API do Sucesso
// Admin: senha no cabeçalho (Painel do Doc) ou cookie do login (Painel do Sucesso, /painel).
const isAdmin = req => (req.get('x-admin-key') || req.query.key) === ADMIN_PASSWORD || sucesso.hasCookie(req);
// O Sucesso lê o corpo cru das requisições: as rotas dele entram antes do express.json().
sucesso.mount(app, { isAdmin });
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, '..', 'public'), { etag: true, maxAge: 0 }));

// Estado público + situação da dinâmica do Sucesso em exibição (fase, cronômetro, quantidade de respostas)
function publicState() {
  const s = engine.publicState();
  if (s.presentation) s.presentation.live = sucesso.ready() ? sucesso.live(engine.state.presentation) : null;
  return s;
}
// Estado da pessoa + o que ela já respondeu na dinâmica em exibição e se foi a sorteada
function meState(pid) {
  const m = engine.meState(pid), p = engine.state.presentation;
  if (m && p && sucesso.ready()) {
    const d = p.draw, drawn = !!(d && d.personId === pid);
    m.sucesso = { answers: sucesso.mine(p, pid), drawn, drawnAnswer: drawn ? d.answer : null };
  }
  return m;
}

const wrap = fn => (req, res) => {
  try { const out = fn(req, res); if (out !== undefined) res.json(out); }
  catch (e) { res.status(e.status && e.status >= 400 && e.status < 500 ? e.status : 400).json({ error: e.message || String(e) }); }
};
const wrapAsync = fn => (req, res) => {
  Promise.resolve().then(() => fn(req, res)).then(out => { if (out !== undefined) res.json(out); })
    .catch(e => res.status(e.status && e.status >= 400 && e.status < 600 ? e.status : 400).json({ error: e.message || String(e) }));
};
const adminOnly = (req, res, next) => (isAdmin(req) ? next() : res.status(401).json({ error: 'Senha de admin inválida.' }));

/* ---------- participante ---------- */
app.get('/api/people', wrap(() => engine.listPeople().filter(p => p.active).map(p => ({ id: p.id, name: p.name, checkedIn: !!p.checkedInAt }))));
app.post('/api/checkin', wrap(req => engine.checkin(req.body.personId, req.body.token)));
app.post('/api/checkout', wrap(req => engine.checkout(req.body.token)));
app.get('/api/me', wrap(req => {
  const p = engine.personByToken(req.query.token);
  if (!p) return { ok: false };
  return { ok: true, me: meState(p.id), state: publicState() };
}));
app.get('/api/state', wrap(() => publicState()));
// Telão: dinâmica do Sucesso em exibição. Fase, cronômetro e contagem são públicos; os textos das
// respostas (nuvem de palavras, sorteio) só vão para o telão aberto no navegador logado no Painel do Doc.
app.get('/api/sucesso/screen', wrap(req => {
  const p = engine.state.presentation, admin = isAdmin(req), ready = sucesso.ready();
  const out = { now: Date.now(), authenticated: admin, presentation: p ? { ...engine.presentation(), live: ready ? sucesso.live(p) : null } : null };
  if (p && admin && ready) {
    out.responses = sucesso.responses(p).map(r => ({ id: r.id, name: r.name, answer: r.answer }));
    if (p.draw) out.drawAnswer = p.draw.answer;
  }
  return out;
}));
// Resposta de uma dinâmica do Sucesso enviada pelo app: o nome vem do check-in, não de um formulário.
app.post('/api/sucesso/answer', wrapAsync(async req => {
  const b = req.body || {}, person = engine.personByToken(b.token);
  if (!person || !person.checkedInAt || !person.active) throw Object.assign(new Error('Seu check-in não está mais ativo. Escolha seu nome de novo.'), { status: 401 });
  const p = engine.state.presentation;
  if (!p || !sucesso.ready()) throw Object.assign(new Error('Nenhuma dinâmica está aberta agora.'), { status: 409 });
  const r = await sucesso.answer(p, person, { answer: b.answer, anonymous: !!b.anonymous, clientRequestId: String(b.clientRequestId || '') });
  return { ok: true, duplicate: r.duplicate, me: meState(person.id) };
}));
app.get('/health', (req, res) => res.json({ ok: true, db: DB_PATH, phase: engine.state.conn.phase, block: engine.state.block }));

/* ---------- admin ---------- */
app.post('/api/admin/login', wrap((req, res) => {
  const ok = (req.body.password || '') === ADMIN_PASSWORD;
  if (ok) sucesso.setCookie(req, res); // libera também o painel do Sucesso (/painel)
  return { ok };
}));
app.post('/api/admin/logout', wrap((req, res) => { sucesso.clearCookie(res); return { ok: true }; }));
app.use('/api/admin', adminOnly);
app.get('/api/admin/overview', wrap(() => adminOverview()));

// Enquanto uma dinâmica do Sucesso está no telão, a viagem fica congelada (como no projeto do Lucas).
const JOURNEY_ACTIONS = new Set(['setBlock', 'generate', 'reveal', 'startTalk', 'pause', 'resume', 'addTime', 'endTalk', 'skip',
  'startJourney', 'openRanking', 'computeResults', 'resetConnections', 'testRandomRankings']);
// Tela avulsa (mensagem rápida, olhos no telão): tira a dinâmica do Sucesso do ar; o Doc volta ao roteiro depois.
const isDetour = a => (a.type === 'setMessage' && a.show) || (a.type === 'setBlock' && (a.block === 'message' || a.block === 'standby'));
function dropPresentation() {
  if (!engine.state.presentation) return;
  engine.setPresentation(null, { silent: true }); sucesso.storePresentation(null); armExpiry();
}
app.post('/api/admin/action', wrap(req => {
  const a = req.body || {};
  if (isDetour(a) || a.type === 'resetEvent') dropPresentation();
  else if (JOURNEY_ACTIONS.has(a.type)) engine.requireJourney();
  switch (a.type) {
    case 'setBlock': engine.setBlock(a.block); break;
    case 'setMessage': engine.setMessage(a.message || {}, !!a.show); break;
    case 'settings': engine.updateSettings(a.settings || {}); break;
    case 'generate': return { ok: true, ...engine.generate({ fromRound: a.fromRound || 1 }) };
    case 'reveal': engine.reveal(a.round); break;
    case 'startTalk': engine.startTalk(); break;
    case 'pause': engine.pause(); break;
    case 'resume': engine.resume(); break;
    case 'addTime': engine.addTime(a.seconds || 30); break;
    case 'endTalk': engine.endTalk(); break;
    case 'skip': engine.skip(); break;
    case 'startJourney': engine.startJourney(); break;
    case 'setScene': engine.setScene(a.scene); break;
    case 'setAudio': engine.setAudio({ mode: a.mode, volume: a.volume, out: a.out }); break;
    case 'openRanking': engine.openRanking(); break;
    case 'computeResults': engine.computeResults(); break;
    case 'resetConnections': engine.resetConnections(); break;
    case 'resetEvent': engine.resetEvent(); sucesso.clearRoom(engine.state.sucessoRoom).catch(e => console.error('[sucesso] limpar sala:', e.message)); break;
    case 'testCheckinAll': engine.testCheckinAll(); break;
    case 'testRandomRankings': engine.testRandomRankings(); break;
    default: throw new Error('Ação desconhecida: ' + a.type);
  }
  return { ok: true };
}));

// Exibir uma dinâmica do Sucesso no telão e nos celulares ({roomId, activityId}) ou voltar ao townhall ({roomId: null}).
// A sala das dinâmicas do Sucesso é escolhida sozinha: a que já está em uso, a mais recente ou uma nova.
async function ensureRoom() {
  let id = engine.state.sucessoRoom;
  if (id && sucesso.roomExists(id)) return id;
  id = sucesso.latestRoom() || await sucesso.createRoom('Townhall');
  engine.state.sucessoRoom = id; engine.save();
  return id;
}
// Roteiro: coloca um passo no ar. Passo do Sucesso = dinâmica no telão e nos celulares; qualquer outro
// tira a dinâmica do ar e mostra a tela do passo. Chamar com o passo atual também serve para "voltar ao roteiro".
async function goStep(id) {
  const step = engine.stepById(id);
  if (!step) throw Object.assign(new Error('Esse passo não está mais no roteiro.'), { status: 404 });
  if (step.type === 'sucesso') {
    if (!sucesso.ready()) throw Object.assign(new Error('As dinâmicas do Sucesso ainda estão carregando. Tente de novo em instantes.'), { status: 503 });
    const selection = await sucesso.prepare(await ensureRoom(), step.activity);
    engine.applyStep(step.id, { silent: true });
    if (engine.state.presentation) engine.setPresentation(null, { silent: true });
    engine.setPresentation(selection);
    sucesso.storePresentation(engine.state.presentation);
  } else {
    if (engine.state.presentation) { engine.setPresentation(null, { silent: true }); sucesso.storePresentation(null); }
    engine.applyStep(step.id);
  }
  armExpiry();
  return { ok: true, step: engine.state.step };
}
app.post('/api/admin/step', wrapAsync(req => goStep(String((req.body || {}).id || ''))));

// Painel 3D do Lucas ("Exibir no telão e nos celulares" / "Voltar ao Townhall"): o roteiro acompanha.
app.post('/api/admin/presentation', wrapAsync(async req => {
  const { roomId = null, activityId = null } = req.body || {};
  if (roomId === null) { // volta para o passo em que o evento estava antes da dinâmica
    if (engine.state.presentation) {
      engine.setPresentation(null, { silent: true }); sucesso.storePresentation(null);
      const steps = engine.settings.steps, at = steps.findIndex(x => x.id === engine.state.step);
      const back = engine.stepById(engine.state.returnStep) || steps.slice(0, Math.max(0, at)).reverse().find(x => x.type !== 'sucesso') || steps.find(x => x.type !== 'sucesso');
      if (back && back.type !== 'sucesso') engine.applyStep(back.id); else engine.commit({ title: 'De volta ao townhall', body: 'Olhe para o seu celular.' });
    }
    armExpiry();
    return { presentation: null };
  }
  const selection = await sucesso.prepare(roomId, activityId);
  engine.state.sucessoRoom = roomId;
  const step = engine.settings.steps.find(x => x.type === 'sucesso' && x.activity === activityId);
  if (step) engine.applyStep(step.id, { silent: true });
  else { const cur = engine.currentStep(); if (cur.type !== 'sucesso') engine.state.returnStep = cur.id; engine.holdJourney(); }
  if (engine.state.presentation) engine.setPresentation(null, { silent: true });
  engine.setPresentation(selection);
  sucesso.storePresentation(engine.state.presentation);
  armExpiry();
  return { presentation: engine.presentation() };
}));
// Sorteio de viajante e tempo de fala (dinâmicas 2 e 3, depois de encerrar o recebimento), como no painel do Lucas.
app.post('/api/admin/sucesso/draw', wrap(req => {
  const action = (req.body || {}).action, p = engine.state.presentation;
  const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
  if (!p) fail('Libere uma dinâmica no telão antes de sortear.');
  if (action === 'draw') {
    const l = sucesso.live(p);
    if (!l) fail('Dinâmica não encontrada.', 404);
    if (!l.talkSeconds) fail('Esta dinâmica não tem sorteio.', 400);
    if (l.phase !== 'done') fail('Encerre o recebimento antes de sortear.');
    const all = sucesso.responses(p), drawn = new Set(engine.drawnIds(l.roundId)), pool = all.filter(r => !drawn.has(r.id));
    if (!pool.length) fail(all.length ? 'Todos já foram sorteados.' : 'Nenhuma resposta recebida.');
    engine.setDraw(pool[crypto.randomInt(pool.length)], l.roundId, l.talkSeconds);
  } else if (action === 'close') engine.closeDraw();
  else if (['talkStart', 'talkPause', 'talkReset'].includes(action)) engine.drawTalk(action.slice(4).toLowerCase());
  else fail('Comando inválido.', 400);
  return { ok: true };
}));

app.post('/api/admin/people', wrap(req => engine.addPerson(req.body || {})));
app.put('/api/admin/people/:id', wrap(req => engine.updatePerson(req.params.id, req.body || {})));
app.delete('/api/admin/people/:id', wrap(req => { engine.deletePerson(req.params.id); return { ok: true }; }));
app.post('/api/admin/people/import', wrap(req => engine.importPeople(req.body.rows || [], req.body.mode || 'merge')));
app.post('/api/admin/form/import', wrap(req => engine.importForm(req.body.rows || [], req.body.keyColumn)));

app.post('/api/admin/questions', wrap(req => { engine.addQuestion(req.body || {}); return { ok: true }; }));
app.put('/api/admin/questions/:id', wrap(req => { engine.updateQuestion(req.params.id, req.body || {}); return { ok: true }; }));
app.delete('/api/admin/questions/:id', wrap(req => { engine.deleteQuestion(req.params.id); return { ok: true }; }));
app.post('/api/admin/questions/replace', wrap(req => { engine.replaceQuestions(req.body.questions || []); return { ok: true }; }));
app.post('/api/admin/questions/reset', wrap(() => { engine.resetQuestions(); return { ok: true }; }));

app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

/* ---------- tempo real ---------- */
function pushAll(notice) {
  const state = publicState();
  io.emit('state', state);
  for (const [, socket] of io.of('/').sockets) {
    if (!socket.data.token && !socket.data.personId) continue;
    const pid = bind(socket); // revalida o token a cada push (check-in desfeito, reset, outro aparelho assumiu o nome)
    socket.emit('me', pid ? meState(pid) : null);
  }
  if (notice) io.emit('notify', notice);
  pushAdmin();
}
let adminTimer = null;
function pushAdmin() {
  if (adminTimer) return;
  adminTimer = setTimeout(() => { adminTimer = null; io.to('admin').emit('admin:overview', adminOverview()); }, 500);
}
engine.onChange(pushAll);
// Resposta nova ou comando numa dinâmica do Sucesso: celulares, telão e painel atualizam na hora.
let pulseTimer = null, expiryTimer = null;
function armExpiry() { // o prazo de recebimento acaba sem nenhum comando: avisa os aparelhos nessa hora
  clearTimeout(expiryTimer); expiryTimer = null;
  const p = engine.state.presentation, l = p && sucesso.ready() ? sucesso.live(p) : null;
  if (l && l.phase === 'run' && l.endsAt) expiryTimer = setTimeout(sucessoChanged, Math.max(50, l.endsAt - l.serverNow + 150));
}
function sucessoChanged() {
  if (pulseTimer) return;
  pulseTimer = setTimeout(() => {
    pulseTimer = null;
    const p = engine.state.presentation, l = p && sucesso.ready() ? sucesso.live(p) : null;
    if (p && p.draw && (!l || l.phase !== 'done')) engine.closeDraw(); // dinâmica reiniciada ou limpa: o sorteio sai da tela
    else pushAll();
    io.emit('sucesso:pulse'); armExpiry();
  }, 150);
}
sucesso.onChange(sucessoChanged);

// Estado dos telões abertos (a página /telao.html avisa se está logada e se o navegador já liberou o som),
// para o Painel do Doc mostrar antes do evento se falta algum clique.
function telaoStatus() {
  const list = [];
  for (const [, s] of io.of('/').sockets) if (s.data.telao) list.push(s.data.telao);
  return { count: list.length, sound: list.some(t => !t.locked), auth: list.some(t => t.auth) };
}
const adminOverview = () => ({ ...engine.adminOverview(), telao: telaoStatus(), sucesso: sucesso.ready() ? sucesso.overview(engine.state.sucessoRoom) : null });

// Liga o socket à pessoa dona do token (do evento ou guardado no socket) e revalida sempre:
// se o token foi trocado (outro aparelho assumiu o nome) ou o check-in foi desfeito, desliga.
function unbind(socket) {
  if (socket.data.personId) socket.leave('person:' + socket.data.personId);
  socket.data.personId = null; socket.data.token = null;
}
function bind(socket, token) {
  const t = (typeof token === 'string' && token && token.length <= 128) ? token : socket.data.token;
  const p = t ? engine.personByToken(t) : null;
  if (!p || !p.checkedInAt || !p.active) { unbind(socket); return null; }
  if (socket.data.personId !== p.id) { if (socket.data.personId) socket.leave('person:' + socket.data.personId); socket.join('person:' + p.id); }
  socket.data.personId = p.id; socket.data.token = t;
  return p.id;
}
const safeAck = (ack, value) => { if (typeof ack === 'function') ack(value); };
io.on('connection', socket => {
  socket.on('hello', (payload, ack) => {
    try {
      const pid = bind(socket, payload && payload.token);
      safeAck(ack, { ok: !!pid, state: publicState(), me: pid ? meState(pid) : null, now: Date.now() });
    } catch (e) { console.error('[hello]', e); safeAck(ack, { ok: false, error: 'Erro no servidor.', state: publicState(), me: null, now: Date.now() }); }
  });
  socket.on('group:step', (payload, ack) => {
    try {
      const pid = bind(socket, payload && payload.token);
      if (!pid) throw new Error('Seu check-in não está mais ativo. Escolha seu nome de novo.');
      engine.requireJourney();
      const r = engine.groupStep(pid, Number(payload && payload.dir) < 0 ? -1 : 1, payload && Number.isFinite(Number(payload.from)) ? Number(payload.from) : undefined);
      if (!r.ignored) { for (const id of r.members) io.to('person:' + id).emit('group:update', { groupId: r.groupId, position: r.position }); pushAdmin(); }
      if (typeof ack === 'function') ack({ ok: true, position: r.position, groupId: r.groupId });
    } catch (e) { if (typeof ack === 'function') ack({ ok: false, error: e.message }); }
  });
  socket.on('ranking:submit', (payload, ack) => {
    try {
      const pid = bind(socket, payload && payload.token);
      if (!pid) throw new Error('Seu check-in não está mais ativo. Escolha seu nome de novo.');
      engine.requireJourney();
      const ranks = payload && payload.ranks && typeof payload.ranks === 'object' && !Array.isArray(payload.ranks) ? payload.ranks : {};
      engine.submitRanking(pid, ranks);
      if (typeof ack === 'function') ack({ ok: true });
    } catch (e) { if (typeof ack === 'function') ack({ ok: false, error: e.message }); }
  });
  socket.on('admin:hello', (payload, ack) => {
    try {
      const ok = !!payload && payload.key === ADMIN_PASSWORD;
      if (ok) socket.join('admin');
      safeAck(ack, ok ? { ok: true, overview: adminOverview() } : { ok: false, error: 'Senha inválida.' });
    } catch (e) { console.error('[admin:hello]', e); safeAck(ack, { ok: false, error: 'Erro no servidor.' }); }
  });
  socket.on('telao:status', payload => { socket.data.telao = { locked: !!(payload && payload.locked), auth: !!(payload && payload.auth) }; pushAdmin(); });
  socket.on('disconnect', () => { if (socket.data.telao) pushAdmin(); });
  socket.on('time', (payload, ack) => safeAck(ack, { now: Date.now() }));
  socket.on('error', err => console.error('[socket error]', err && err.message));
});

server.on('error', err => { console.error('[listen]', err.message); process.exit(1); });
sucesso.init().then(() => {
  // mantém a API do Sucesso alinhada com o que está em exibição (sobrevive a reinícios)
  sucesso.storePresentation(engine.state.presentation);
  armExpiry();
  return ensureRoom();
}).catch(err => console.error('[sucesso] falhou ao iniciar:', err)).finally(() => server.listen(PORT, () => {
  console.log(`⚡ De Volta ao Futuro · townhall rodando em http://localhost:${PORT}`);
  console.log(`   Painel do Doc: http://localhost:${PORT}/admin.html  (senha: ${ADMIN_PASSWORD === 'doc1985' ? 'doc1985 · defina ADMIN_PASSWORD para trocar' : 'definida via ADMIN_PASSWORD'})`);
  console.log(`   Banco: ${DB_PATH} · rodadas: ${TOTAL_ROUNDS}`);
  console.log(`   De Volta para o Sucesso: http://localhost:${PORT}/painel (mesma senha do Painel do Doc)`);
}));
