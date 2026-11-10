// Servidor: Express (API + estáticos) + Socket.IO (tempo real).
const path = require('path');
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
app.set('trust proxy', true); // Render/HTTPS: req.protocol correto para a checagem de origem da API do Sucesso
// Admin: senha no cabeçalho (Painel do Doc) ou cookie do login (Painel do Sucesso, /painel).
const isAdmin = req => (req.get('x-admin-key') || req.query.key) === ADMIN_PASSWORD || sucesso.hasCookie(req);
// O Sucesso lê o corpo cru das requisições: as rotas dele entram antes do express.json().
sucesso.mount(app, { isAdmin });
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, '..', 'public'), { etag: true, maxAge: 0 }));

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
  return { ok: true, me: engine.meState(p.id), state: engine.publicState() };
}));
app.get('/api/state', wrap(() => engine.publicState()));
// Telão: dinâmica do Sucesso em exibição (contagem, cronômetro; respostas só para o apresentador logado).
app.get('/api/sucesso/screen', wrapAsync(async req => {
  const p = engine.state.presentation;
  return { now: Date.now(), presentation: engine.presentation(), liveActivity: p && sucesso.ready() ? await sucesso.screen(p, isAdmin(req)) : null };
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
app.get('/api/admin/overview', wrap(() => engine.adminOverview()));

// Enquanto uma dinâmica do Sucesso está no telão, a viagem fica congelada (como no projeto do Lucas).
const JOURNEY_ACTIONS = new Set(['setBlock', 'generate', 'reveal', 'startTalk', 'pause', 'resume', 'addTime', 'endTalk', 'skip',
  'startJourney', 'openRanking', 'computeResults', 'resetConnections', 'resetEvent', 'testRandomRankings']);
app.post('/api/admin/action', wrap(req => {
  const a = req.body || {};
  if (JOURNEY_ACTIONS.has(a.type) || (a.type === 'setMessage' && a.show)) engine.requireJourney();
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
    case 'openRanking': engine.openRanking(); break;
    case 'computeResults': engine.computeResults(); break;
    case 'resetConnections': engine.resetConnections(); break;
    case 'resetEvent': engine.resetEvent(); break;
    case 'testCheckinAll': engine.testCheckinAll(); break;
    case 'testRandomRankings': engine.testRandomRankings(); break;
    default: throw new Error('Ação desconhecida: ' + a.type);
  }
  return { ok: true };
}));

// Exibir uma dinâmica do Sucesso no telão e nos celulares ({roomId, activityId}) ou voltar ao townhall ({roomId: null}).
app.post('/api/admin/presentation', wrapAsync(async req => {
  const { roomId = null, activityId = null } = req.body || {};
  if (roomId === null) { engine.setPresentation(null); sucesso.storePresentation(null); return { presentation: null }; }
  const selection = await sucesso.prepare(roomId, activityId);
  engine.setPresentation(selection);
  sucesso.storePresentation(engine.state.presentation);
  return { presentation: engine.presentation() };
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
  const state = engine.publicState();
  io.emit('state', state);
  for (const [, socket] of io.of('/').sockets) {
    if (!socket.data.token && !socket.data.personId) continue;
    const pid = bind(socket); // revalida o token a cada push (check-in desfeito, reset, outro aparelho assumiu o nome)
    socket.emit('me', pid ? engine.meState(pid) : null);
  }
  if (notice) io.emit('notify', notice);
  pushAdmin();
}
let adminTimer = null;
function pushAdmin() {
  if (adminTimer) return;
  adminTimer = setTimeout(() => { adminTimer = null; io.to('admin').emit('admin:overview', engine.adminOverview()); }, 500);
}
engine.onChange(pushAll);
// Resposta nova ou comando numa dinâmica do Sucesso: o telão atualiza na hora (além da consulta periódica).
let pulseTimer = null;
sucesso.onChange(() => { if (pulseTimer) return; pulseTimer = setTimeout(() => { pulseTimer = null; io.emit('sucesso:pulse'); }, 250); });

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
      safeAck(ack, { ok: !!pid, state: engine.publicState(), me: pid ? engine.meState(pid) : null, now: Date.now() });
    } catch (e) { console.error('[hello]', e); safeAck(ack, { ok: false, error: 'Erro no servidor.', state: engine.publicState(), me: null, now: Date.now() }); }
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
      safeAck(ack, ok ? { ok: true, overview: engine.adminOverview() } : { ok: false, error: 'Senha inválida.' });
    } catch (e) { console.error('[admin:hello]', e); safeAck(ack, { ok: false, error: 'Erro no servidor.' }); }
  });
  socket.on('time', (payload, ack) => safeAck(ack, { now: Date.now() }));
  socket.on('error', err => console.error('[socket error]', err && err.message));
});

server.on('error', err => { console.error('[listen]', err.message); process.exit(1); });
sucesso.init().then(() => {
  // mantém a API do Sucesso alinhada com o que está em exibição (sobrevive a reinícios)
  sucesso.storePresentation(engine.state.presentation);
}).catch(err => console.error('[sucesso] falhou ao iniciar:', err)).finally(() => server.listen(PORT, () => {
  console.log(`⚡ De Volta ao Futuro · townhall rodando em http://localhost:${PORT}`);
  console.log(`   Painel do Doc: http://localhost:${PORT}/admin.html  (senha: ${ADMIN_PASSWORD === 'doc1985' ? 'doc1985 · defina ADMIN_PASSWORD para trocar' : 'definida via ADMIN_PASSWORD'})`);
  console.log(`   Banco: ${DB_PATH} · rodadas: ${TOTAL_ROUNDS}`);
  console.log(`   De Volta para o Sucesso: http://localhost:${PORT}/painel (mesma senha do Painel do Doc)`);
}));
