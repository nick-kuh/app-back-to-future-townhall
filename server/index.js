// Servidor: Express (API + estáticos) + Socket.IO (tempo real).
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { Engine, TOTAL_ROUNDS } = require('./engine');
const { DB_PATH } = require('./db');

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'doc1985';

const engine = new Engine();
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, pingInterval: 10000, pingTimeout: 20000 });

app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, '..', 'public'), { etag: true, maxAge: 0 }));

const wrap = fn => (req, res) => {
  try { const out = fn(req, res); if (out !== undefined) res.json(out); }
  catch (e) { res.status(400).json({ error: e.message || String(e) }); }
};
const isAdmin = req => (req.get('x-admin-key') || req.query.key) === ADMIN_PASSWORD;
const adminOnly = (req, res, next) => (isAdmin(req) ? next() : res.status(401).json({ error: 'Senha de admin inválida.' }));

/* ---------- participante ---------- */
app.get('/api/people', wrap(() => engine.listPeople().filter(p => p.active).map(p => ({ id: p.id, name: p.name, area: p.area, wl: p.wl, team: p.team, checkedIn: !!p.checkedInAt }))));
app.post('/api/checkin', wrap(req => engine.checkin(req.body.personId, req.body.token)));
app.get('/api/me', wrap(req => {
  const p = engine.personByToken(req.query.token);
  if (!p) return { ok: false };
  return { ok: true, me: engine.meState(p.id), state: engine.publicState() };
}));
app.get('/api/state', wrap(() => engine.publicState()));
app.get('/health', (req, res) => res.json({ ok: true, db: DB_PATH, phase: engine.state.conn.phase, block: engine.state.block }));

/* ---------- admin ---------- */
app.post('/api/admin/login', wrap(req => ({ ok: (req.body.password || '') === ADMIN_PASSWORD })));
app.use('/api/admin', adminOnly);
app.get('/api/admin/overview', wrap(() => engine.adminOverview()));

app.post('/api/admin/action', wrap(req => {
  const a = req.body || {};
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
    if (!socket.data.personId) continue;
    const me = engine.meState(socket.data.personId);
    if (!me) { socket.leave('person:' + socket.data.personId); socket.data.personId = null; }
    socket.emit('me', me);
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

// Após uma reconexão, eventos enfileirados chegam antes do 'hello': identifica pelo token do próprio evento.
function personOf(socket, payload) {
  if (!socket.data.personId && payload && payload.token) {
    const p = engine.personByToken(payload.token);
    if (p) { socket.data.personId = p.id; socket.join('person:' + p.id); }
  }
  return socket.data.personId;
}
io.on('connection', socket => {
  socket.on('hello', (payload, ack) => {
    const p = engine.personByToken(payload && payload.token);
    socket.data.personId = p ? p.id : null;
    if (p) socket.join('person:' + p.id);
    const res = { ok: !!p, state: engine.publicState(), me: p ? engine.meState(p.id) : null, now: Date.now() };
    if (typeof ack === 'function') ack(res); else socket.emit('snapshot', res);
  });
  socket.on('group:step', (payload, ack) => {
    try {
      const pid = personOf(socket, payload);
      if (!pid) throw new Error('Conexão restabelecida: toque de novo.');
      const r = engine.groupStep(pid, (payload && payload.dir) || 1, payload ? payload.from : undefined);
      if (!r.ignored) { for (const id of r.members) io.to('person:' + id).emit('group:update', { groupId: r.groupId, position: r.position }); pushAdmin(); }
      if (typeof ack === 'function') ack({ ok: true, position: r.position, groupId: r.groupId });
    } catch (e) { if (typeof ack === 'function') ack({ ok: false, error: e.message }); }
  });
  socket.on('ranking:submit', (payload, ack) => {
    try {
      const pid = personOf(socket, payload);
      if (!pid) throw new Error('Conexão restabelecida: toque de novo.');
      engine.submitRanking(pid, (payload && payload.ranks) || {});
      if (typeof ack === 'function') ack({ ok: true });
    } catch (e) { if (typeof ack === 'function') ack({ ok: false, error: e.message }); }
  });
  socket.on('admin:hello', (payload, ack) => {
    const ok = payload && payload.key === ADMIN_PASSWORD;
    if (ok) socket.join('admin');
    if (typeof ack === 'function') ack(ok ? { ok: true, overview: engine.adminOverview() } : { ok: false, error: 'Senha inválida.' });
  });
  socket.on('time', (payload, ack) => { if (typeof ack === 'function') ack({ now: Date.now() }); });
});

server.listen(PORT, () => {
  console.log(`⚡ De Volta ao Futuro · townhall rodando em http://localhost:${PORT}`);
  console.log(`   Painel do Doc: http://localhost:${PORT}/admin.html  (senha: ${ADMIN_PASSWORD === 'doc1985' ? 'doc1985 · defina ADMIN_PASSWORD para trocar' : 'definida via ADMIN_PASSWORD'})`);
  console.log(`   Banco: ${DB_PATH} · rodadas: ${TOTAL_ROUNDS}`);
});
