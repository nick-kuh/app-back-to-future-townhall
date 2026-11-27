// Servidor: Express (API + estáticos) + Socket.IO (tempo real).
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { Engine, TOTAL_ROUNDS, CONFIDENTIAL_STEPS } = require('./engine');
const { DB_PATH, DATA_DIR } = require('./db');
const { createSucesso } = require('./sucesso');
const { createReflexao } = require('./reflexao');
const { createCenas } = require('./cenas');
const doc = require('./doc');

const PORT = Number(process.env.PORT) || 3000;
// Dois níveis de acesso ao painel:
//   senha mestra (ADMIN_PASSWORD): o Painel do Doc completo, com todo o conteúdo do townhall (roteiro, cenas, prêmios, estratégia);
//   senha das dinâmicas (DINAMICAS_PASSWORD, opcional): o "segundo app", só com Conexões, Reflexão e Sucesso. Quem entra com
//   ela não vê nem mexe em nada do resto: o servidor não envia esse conteúdo e recusa os comandos.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'doc1985';
const TEAM_PASSWORD = (() => { const t = String(process.env.DINAMICAS_PASSWORD || '').trim(); return t && t !== ADMIN_PASSWORD ? t : ''; })();
const sameText = (a, b) => { const x = Buffer.from(String(a ?? '')), y = Buffer.from(String(b ?? '')); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const roleOfKey = key => (typeof key !== 'string' || !key ? null : sameText(key, ADMIN_PASSWORD) ? 'master' : TEAM_PASSWORD && sameText(key, TEAM_PASSWORD) ? 'team' : null);
// Versão dos arquivos do app (muda a cada publicação): os celulares abertos percebem e recarregam sozinhos.
const BUILD = (() => {
  const h = crypto.createHash('sha1'), dir = path.join(__dirname, '..', 'public');
  try { for (const f of fs.readdirSync(dir).sort()) if (/\.(js|css|html)$/.test(f)) h.update(f).update(fs.readFileSync(path.join(dir, f))); } catch { /* segue com o que deu para ler */ }
  return h.digest('hex').slice(0, 12);
})();

// Um bug em qualquer handler não pode derrubar o evento inteiro: registra e segue.
process.on('uncaughtException', err => console.error('[uncaughtException]', err));
process.on('unhandledRejection', err => console.error('[unhandledRejection]', err));

const engine = new Engine();
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, pingInterval: 10000, pingTimeout: 20000 });

const sucesso = createSucesso({ dbPath: process.env.SUCESSO_DB_PATH || path.join(DATA_DIR, 'sucesso.db'), adminPassword: ADMIN_PASSWORD, teamPassword: TEAM_PASSWORD });
// Bloco Reflexão (paradas com votação em projetos): está no ar quando o roteiro está nesse passo e não há dinâmica do Sucesso na tela
const reflexao = createReflexao();
const reflexaoOnAir = () => engine.state.block === 'reflexao' && !engine.state.presentation;
// Cenas do deck do townhall (plano de voo, almanaque 2026, reconhecimento, intervalo, estratégia 2027, 88 MPH…):
// a cena no ar é a do passo atual do roteiro, quando não há dinâmica do Sucesso nem tela avulsa por cima
const cenas = createCenas();
const cenaOnAir = () => (engine.state.block === 'cena' && !engine.state.presentation ? engine.currentStep().cena || null : null);

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
// Quem está pedindo: senha no cabeçalho (painel) ou cookie do login (telão, painel do Sucesso). 'master', 'team' ou null.
const roleOf = req => roleOfKey(req.get('x-admin-key') || req.query.key) || sucesso.cookieRole(req);
const isAdmin = req => !!roleOf(req);              // qualquer um dos dois níveis
const isMaster = req => roleOf(req) === 'master';  // só a senha mestra
// Modo confidencial (Painel do Doc → 🔒): o conteúdo do townhall só vai para quem entrou com a senha mestra.
const confidential = () => engine.settings.confidencial !== false;
// O Sucesso lê o corpo cru das requisições: as rotas dele entram antes do express.json().
sucesso.mount(app, { isAdmin, roleOf });
app.use(express.json({ limit: '5mb' }));
// A Estratégia 2027 é conteúdo do townhall: no modo confidencial, só abre para a senha mestra (o telão do Doc).
app.get('/estrategia-2027.html', (req, res, next) => (!confidential() || isMaster(req) ? next() : res.status(403).type('html').send('<!doctype html><meta charset="utf-8"><title>🔒</title><body style="background:#0b0618;color:#bcaee0;font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0"><p>🔒 Confidential until the event.</p></body>')));
// O "segundo app": o painel só das dinâmicas (Conexões, Reflexão e Sucesso). É a mesma página do painel; o que ela mostra depende da senha.
app.get(['/dinamicas', '/dinamicas.html'], (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'admin.html')));
app.use(express.static(path.join(__dirname, '..', 'public'), { etag: true, maxAge: 0 }));

// Fotos nas cenas: quem fala nas boas-vindas e os indicados dos prêmios ganham a foto de perfil quando o nome escrito
// na cena aponta para uma pessoa só da lista. "Giovana & Lucas" são duas pessoas (até duas fotos).
function withPhotos(c) {
  if (!c || (c.kind !== 'boasvindas' && c.kind !== 'reconhecimento')) return c;
  const people = engine.listPeople(), of = nome => String(nome || '').split(/\s*(?:&|\/| e )\s*/i).map(n => engine.photoByName(n, people)).filter(Boolean).slice(0, 2);
  if (c.kind === 'boasvindas') return { ...c, pessoas: (c.pessoas || []).map(p => ({ ...p, fotos: of(p.nome) })) };
  return { ...c, premios: c.premios.map(p => ({ ...p, indicados: p.indicados.map(x => ({ ...x, fotos: of(x.nome) })) })) };
}
// Modo confidencial: quem não entrou com a senha mestra não recebe as cenas do deck, os blocos de fala nem os créditos.
// Enquanto um desses passos está no ar, os celulares e os outros telões veem a tela de "olhos no telão".
function redact(s) {
  const out = { ...s, cena: null, creditos: null, stage: { title: '', theme: '', speaker: '' } };
  if (!s.presentation && ['cena', 'stage', 'closing'].includes(s.block)) { out.block = 'standby'; out.hosts = []; out.step = { ...s.step, type: 'standby', cena: null, transition: false }; }
  else out.step = { ...s.step, cena: null };
  return out;
}
// Estado público + situação da dinâmica do Sucesso em exibição (fase, cronômetro, quantidade de respostas)
// master: quem pede entrou com a senha mestra (recebe tudo, mesmo no modo confidencial)
function publicState(master = false) {
  const s = fullState();
  return master || !confidential() ? s : redact(s);
}
function fullState() {
  const s = engine.publicState();
  s.build = BUILD;
  if (s.presentation) s.presentation.live = sucesso.ready() ? sucesso.live(engine.state.presentation) : null;
  s.reflexao = reflexaoOnAir() ? reflexao.publicState() : null;
  const kind = cenaOnAir();
  s.cena = kind ? withPhotos(cenas.publicState(kind, { steps: engine.settings.steps, index: s.step.index })) : null;
  s.evento = cenas.evento();                                         // nome do evento e circuitos de tempo (check-in, créditos)
  // quem conduz o bloco que está no ar, com a foto de perfil (Conexões, Reflexão, Sucesso e as cenas que têm anfitrião)
  const hk = s.presentation || s.block === 'doc' ? 'sucesso' : kind || s.block, names = cenas.hosts(hk);
  if (names.length) { const people = engine.listPeople(); s.hosts = names.map(nome => ({ nome, foto: engine.photoByName(nome, people) })); } else s.hosts = [];
  // Conexões: participação especial (quem ajudou a organizar), com a foto, abaixo de quem conduz
  if (hk === 'connections') { const e = cenas.especial(), people = engine.listPeople(); s.especial = { nota: e.nota, pessoas: e.nomes.map(nome => ({ nome, foto: engine.photoByName(nome, people) })) }; }
  if (s.cena) s.cena.hosts = s.hosts;                                // a cena leva os seus anfitriões (muda o nome → o telão redesenha)
  s.creditos = engine.state.block === 'closing' ? cenas.creditos() : null;
  return s;
}
// Estado da pessoa + o que ela já respondeu na dinâmica em exibição e se foi a sorteada
function meState(pid) {
  const m = engine.meState(pid), p = engine.state.presentation;
  if (m && p && sucesso.ready()) {
    const d = p.draw, drawn = !!(d && d.personId === pid);
    m.sucesso = { answers: sucesso.mine(p, pid), drawn, drawnAnswer: drawn ? d.answer : null };
  }
  if (m && reflexaoOnAir()) m.reflexao = reflexao.mine(pid);
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
const adminOnly = (req, res, next) => { req.role = roleOf(req); return req.role ? next() : res.status(401).json({ error: 'Senha de admin inválida.' }); };
// O que a senha das dinâmicas alcança: os passos do roteiro, os comandos, os ajustes e os reinícios de Conexões, Reflexão e Sucesso.
const TEAM_STEPS = ['checkin', 'connections', 'reflexao', 'sucesso', 'doc']; // o check-in é a porta de entrada; o Doc fecha o Sucesso
const TEAM_ACTIONS = new Set(['generate', 'reveal', 'startTalk', 'pause', 'resume', 'addTime', 'endTalk', 'skip', 'startJourney', 'openRanking', 'computeResults', 'resetConnections',
  'testCheckinAll', 'testRandomRankings', 'setAudio', 'settings']);
const TEAM_SETTINGS = ['roundSeconds', 'findSeconds', 'questionMode', 'breakSeconds', 'rankingSeconds', 'autoFlow', 'showMutualOnScreen', 'showFormHints', 'skip', 'docVoice', 'docVoiceName', 'docRate', 'docVideoUrl', 'docVideoFull'];
const TEAM_SETTINGS_VIEW = [...TEAM_SETTINGS, 'eventName', 'musicUrl', 'ambientUrl', 'transitions', 'transitionSeconds'];
const TEAM_RESET = scope => ['connections', 'reflexao', 'sucesso', 'doc'].includes(scope) || /^sucesso:d[1-4]$/.test(scope);
const onlyMaster = () => Object.assign(new Error('Isto é conteúdo do townhall: só a senha mestra do Painel do Doc alcança.'), { status: 403 });
const masterOnly = (req, res, next) => (req.role === 'master' ? next() : res.status(403).json({ error: onlyMaster().message }));

/* ---------- participante ---------- */
app.get('/api/people', wrap(() => engine.listPeople().filter(p => p.active).map(p => ({ id: p.id, name: p.name, checkedIn: !!p.checkedInAt, ...(p.photo ? { photo: p.photo } : {}) }))));
// Foto de perfil. O endereço leva a versão da foto (?v=…): o navegador pode guardar para sempre e busca de novo quando ela muda.
app.get('/api/photo/:id', (req, res) => {
  const f = /^\d{1,9}$/.test(req.params.id) ? engine.fotos.get(req.params.id) : null;
  if (!f) return res.status(404).json({ error: 'Sem foto.' });
  res.set({ 'Content-Type': f.mime, 'Cache-Control': req.query.v === f.version ? 'public, max-age=31536000, immutable' : 'no-cache', 'X-Content-Type-Options': 'nosniff' }).send(f.data);
});
// name (opcional): o celular que refaz o check-in sozinho depois de o servidor reiniciar manda o nome guardado
app.post('/api/checkin', wrap(req => ({ ...engine.checkin(req.body.personId, req.body.token, req.body.name), epoch: engine.epoch })));
// "Duas palavras": como a pessoa está chegando (logo depois do login). Vale uma resposta por pessoa; enviar de novo troca.
app.post('/api/words', wrap(req => {
  const b = req.body || {}, person = engine.personByToken(b.token);
  if (!person || !person.checkedInAt || !person.active) throw Object.assign(new Error('Your check-in is no longer active. Pick your name again.'), { status: 401 });
  engine.setWords(person.id, b.words);
  return { ok: true, me: meState(person.id) };
}));
app.post('/api/checkout', wrap(req => engine.checkout(req.body.token)));
app.get('/api/me', wrap(req => {
  const p = engine.personByToken(req.query.token);
  if (!p || !p.checkedInAt || !p.active) return { ok: false, epoch: engine.epoch, state: publicState(isMaster(req)), now: Date.now() };
  return { ok: true, me: meState(p.id), state: publicState(isMaster(req)), epoch: engine.epoch, now: Date.now() };
}));
app.get('/api/state', wrap(req => publicState(isMaster(req))));
// Telão: dinâmica do Sucesso em exibição. Fase, cronômetro e contagem são públicos; os textos das
// respostas (nuvem de palavras, sorteio) só vão para o telão aberto no navegador logado no Painel do Doc.
app.get('/api/sucesso/screen', wrap(req => {
  const p = engine.state.presentation, admin = isAdmin(req), ready = sucesso.ready();
  const out = { now: Date.now(), authenticated: admin, master: isMaster(req), presentation: p ? { ...engine.presentation(), live: ready ? sucesso.live(p) : null } : null };
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
  if (engine.skips('sucesso', person.id)) throw Object.assign(new Error('Você está na coordenação deste bloco e não participa das respostas.'), { status: 403 });
  const r = await sucesso.answer(p, person, { answer: b.answer, anonymous: !!b.anonymous, clientRequestId: String(b.clientRequestId || '') });
  return { ok: true, duplicate: r.duplicate, me: meState(person.id) };
}));
// Reflexão: lista de projetos (para o celular escolher) e o voto, sempre com o nome do check-in.
app.get('/api/reflexao/projects', wrap(() => reflexao.catalog()));
app.post('/api/reflexao/vote', wrap(req => {
  const b = req.body || {}, person = engine.personByToken(b.token);
  if (!person || !person.checkedInAt || !person.active) throw Object.assign(new Error('Seu check-in não está mais ativo. Escolha seu nome de novo.'), { status: 401 });
  if (!reflexaoOnAir()) throw Object.assign(new Error('A Reflexão não está no ar agora.'), { status: 409 });
  if (engine.skips('reflexao', person.id)) throw Object.assign(new Error('Você está na coordenação deste bloco e não participa da votação.'), { status: 403 });
  reflexao.vote(person, String(b.project || ''));
  return { ok: true, me: meState(person.id) };
}));
app.get('/health', (req, res) => res.json({ ok: true, db: DB_PATH, phase: engine.state.conn.phase, block: engine.state.block }));

/* ---------- admin ---------- */
app.post('/api/admin/login', wrap((req, res) => {
  const role = roleOfKey(String((req.body || {}).password || ''));
  if (role) sucesso.setCookie(req, res, role); // libera também o telão e o painel do Sucesso (/painel), no mesmo nível de acesso
  return { ok: !!role, role };
}));
app.post('/api/admin/logout', wrap((req, res) => { sucesso.clearCookie(res); return { ok: true }; }));
app.use('/api/admin', adminOnly);
app.get('/api/admin/overview', wrap(req => overviewFor(req.role)));

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
  if (req.role !== 'master') { // senha das dinâmicas: só os comandos das dinâmicas e os ajustes delas
    if (!TEAM_ACTIONS.has(a.type)) throw onlyMaster();
    if (a.type === 'settings') a.settings = Object.fromEntries(Object.entries(a.settings || {}).filter(([k]) => TEAM_SETTINGS.includes(k)));
  }
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
    case 'setAudio': engine.setAudio({ mode: a.mode, volume: a.volume, out: a.out, beeps: a.beeps }); break;
    case 'openRanking': engine.openRanking(); break;
    case 'computeResults': engine.computeResults(); break;
    case 'resetConnections': engine.resetConnections(); break;
    case 'resetEvent': reflexao.clearAll({ silent: true }); cenas.resetState({ silent: true }); engine.resetEvent(); sucesso.clearRoom(engine.state.sucessoRoom).catch(e => console.error('[sucesso] limpar sala:', e.message)); break;
    case 'testCheckinAll': engine.testCheckinAll(); break;
    case 'testRandomRankings': engine.testRandomRankings(); break;
    default: throw new Error('Ação desconhecida: ' + a.type);
  }
  return { ok: true };
}));

// Reiniciar: tudo de uma vez ou um bloco por vez. Apaga o que foi feito durante o evento ou o ensaio (check-ins, duplas,
// votos, respostas, prêmios revelados, cronômetros). Não mexe no que foi preparado: pessoas, fotos, perguntas, roteiro,
// textos e conteúdo das cenas.
//   scope: all (keepCheckins opcional) · checkin · connections · reflexao · sucesso · sucesso:d1..d4 · doc · cenas ·
//          cena:<abertura|boasvindas|almanaque|reconhecimento|intervalo|visao|mph> · words (as duas palavras) · roteiro (só volta para o primeiro passo)
app.post('/api/admin/reset', wrapAsync(async req => {
  const b = req.body || {}, scope = String(b.scope || ''), room = engine.state.sucessoRoom, bad = () => { throw Object.assign(new Error('Não sei reiniciar isso.'), { status: 400 }); };
  if (req.role !== 'master' && !TEAM_RESET(scope)) throw onlyMaster();
  if (scope === 'all') {
    dropPresentation(); reflexao.clearAll({ silent: true }); cenas.resetState({ silent: true });
    engine.resetEvent({ keepCheckins: !!b.keepCheckins });
    await sucesso.clearRoom(room).catch(e => console.error('[sucesso] limpar sala:', e.message));
  } else if (scope === 'checkin') engine.resetCheckins();
  else if (scope === 'connections') engine.resetConnections();
  else if (scope === 'reflexao') reflexao.clearAll();
  else if (scope === 'sucesso') { if (!sucesso.ready()) bad(); await sucesso.clearRoom(room); }
  else if (/^sucesso:d[1-4]$/.test(scope)) { if (!sucesso.ready()) bad(); await sucesso.clearActivity(room, scope.slice(8)); }
  else if (scope === 'doc') engine.setDocMessage(null);
  else if (scope === 'words') engine.clearWords();
  else if (scope === 'cenas') cenas.resetState();
  else if (scope.startsWith('cena:')) cenas.resetKind(scope.slice(5));
  else if (scope === 'roteiro') return goStep(engine.settings.steps[0].id);
  else bad();
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
  if (step.type === 'cena' && engine.state.step !== step.id) cenas.enter(step.cena); // vindo de outro passo, a cena começa do início (voltar de um aviso rápido não recomeça)
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
app.post('/api/admin/step', wrapAsync(req => {
  const id = String((req.body || {}).id || ''), step = engine.stepById(id);
  if (req.role !== 'master' && step && !TEAM_STEPS.includes(step.type)) throw onlyMaster();
  return goStep(id);
}));

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
  else if (action === 'reveal') { // a nuvem de palavras só vai para o telão quando o Doc revela
    const l = sucesso.live(p);
    if (!l || l.phase !== 'done') fail('Encerre o recebimento antes de revelar as respostas.');
    engine.setReveal(true);
  } else if (action === 'hide') engine.setReveal(false);
  else fail('Comando inválido.', 400);
  return { ok: true };
}));

// Reflexão: comandos do Doc (abrir parada, votação, revelar os 2 mais votados), votos e configuração.
app.post('/api/admin/reflexao', wrap(req => {
  const a = req.body || {}, live = ['open', 'menu', 'start', 'pause', 'end', 'reset', 'reveal', 'showTop', 'fake'];
  if (live.includes(a.action) && !reflexaoOnAir()) throw Object.assign(new Error('Coloque a Reflexão no ar (no roteiro) antes.'), { status: 409 });
  switch (a.action) {
    case 'open': reflexao.open(a.idx); break;
    case 'menu': reflexao.menu(); break;
    case 'start': reflexao.start(); break;
    case 'pause': reflexao.pause(); break;
    case 'end': reflexao.end(); break;
    case 'reset': reflexao.reset(); break;
    case 'reveal': reflexao.reveal(); break;
    case 'showTop': reflexao.showTop(!!a.on); break;
    case 'counts': reflexao.setCounts(!!a.on); break;
    case 'fake': return { ok: true, added: reflexao.fake(a.n) };
    case 'clear': reflexao.clear(); break;
    case 'clearAll': reflexao.clearAll(); break;
    case 'config': reflexao.setConfig(a.config || {}); break;
    case 'resetConfig': reflexao.resetConfig(); break;
    default: throw Object.assign(new Error('Comando inválido.'), { status: 400 });
  }
  return { ok: true };
}));
// Cenas do deck: comandos do Doc (mês do almanaque, cerimônia dos prêmios, cronômetro do intervalo, 88 MPH) e o conteúdo.
app.post('/api/admin/cena', masterOnly, wrap(req => {
  const a = req.body || {};
  if (a.action === 'config') { cenas.setConfig(a.config || {}); return { ok: true }; }
  if (a.action === 'resetConfig') { cenas.resetConfig(a.key ? String(a.key) : null); return { ok: true }; }
  if (a.action === 'resetState') { cenas.resetState(); return { ok: true }; }
  const kind = String(a.kind || '');
  if (cenaOnAir() !== kind) throw Object.assign(new Error('Coloque essa cena no ar (no roteiro) antes.'), { status: 409 });
  cenas.command(kind, a);
  return { ok: true };
}));
// "Duas palavras" (nuvem das boas-vindas): tirar a resposta de uma pessoa ou apagar todas
app.post('/api/admin/words', masterOnly, wrap(req => {
  const a = req.body || {};
  if (a.action === 'remove') engine.removeWords(a.id);
  else if (a.action === 'clear') engine.clearWords();
  else throw Object.assign(new Error('Comando inválido.'), { status: 400 });
  return { ok: true };
}));
// Página de extração de dados (/dados.html): tudo o que o evento gerou, em um pedido só.
app.get('/api/admin/export', wrap(() => {
  const c = engine.publicState().counts;
  return { now: Date.now(), event: engine.settings.eventName, counts: c,
    conexoes: engine.exportConnections(), reflexao: reflexao.exportData(), sucesso: sucesso.ready() ? sucesso.exportData(engine.state.sucessoRoom) : { roomId: null, acts: [] } };
}));
// Visão 2027: o Doc escreve a mensagem (IA ou roteiro automático), o Doc do painel revisa e conduz a cena no telão.
const sucessoExport = () => (sucesso.ready() ? sucesso.exportData(engine.state.sucessoRoom) : { roomId: null, acts: [] });
app.post('/api/admin/doc', wrapAsync(async req => {
  const a = req.body || {};
  switch (a.action) {
    case 'generate': {
      if (!sucesso.ready()) throw Object.assign(new Error('As dinâmicas do Sucesso ainda estão carregando. Tente de novo em instantes.'), { status: 503 });
      engine.setDocGenerating();
      try {
        const message = await doc.generate(sucessoExport(), { useAI: a.ai !== false });
        engine.setDocMessage(message);
        return { ok: true, fonte: message.fonte, aviso: message.aviso || '' };
      } catch (e) { engine.setDocError(e.message); throw e; }
    }
    case 'edit': {
      const cur = engine.state.doc.message;
      if (!cur) throw Object.assign(new Error('Gere a mensagem do Doc antes.'), { status: 409 });
      engine.setDocMessage(doc.edit(cur, a.message || {}, sucessoExport()));
      return { ok: true };
    }
    case 'clear': engine.setDocMessage(null); return { ok: true };
    case 'testVoice': io.emit('doc:test'); return { ok: true }; // o telão fala uma frase de teste (ensaio)
    case 'phones': engine.setDocPhones(!!a.on); return { ok: true };
    case 'start': case 'stop': case 'pause': case 'resume': case 'next': case 'prev': case 'goto':
      engine.docPlay(a.action, { part: a.part, total: doc.parts(engine.state.doc.message).length });
      return { ok: true };
    default: throw Object.assign(new Error('Comando inválido.'), { status: 400 });
  }
}));
// O arquivo .txt do encerramento: a mensagem do Doc, as palavras mais citadas e todas as respostas das 4 dinâmicas.
app.get('/api/admin/doc.txt', (req, res) => res.type('text/plain; charset=utf-8').set('Content-Disposition', 'attachment; filename="Visao_2027_Doc.txt"')
  .send(doc.toTxt(engine.state.doc.message, sucessoExport(), engine.settings.eventName)));
// Kit do vídeo do Doc: o curta de ~1 minuto em segmentos (prompts, falas, imagens de referência e o passo a passo)
app.get('/api/admin/doc-video.txt', (req, res) => {
  const message = engine.state.doc.message || doc.autoFrom(sucessoExport());
  res.type('text/plain; charset=utf-8').set('Content-Disposition', 'attachment; filename="Kit_Video_do_Doc.txt"').send(doc.videoKit(message, { eventName: engine.settings.eventName }).text);
});
app.get('/api/admin/reflexao/votes', wrap(() => ({ votes: reflexao.votes() })));
app.get('/api/admin/reflexao/votes.csv', (req, res) => res.type('text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="Votos_Reflexao.csv"').send(reflexao.votesCsv()));

app.post('/api/admin/people', wrap(req => engine.addPerson(req.body || {})));
app.put('/api/admin/people/:id', wrap(req => engine.updatePerson(req.params.id, req.body || {})));
app.delete('/api/admin/people/:id', wrap(req => { engine.deletePerson(req.params.id); return { ok: true }; }));
app.post('/api/admin/people/import', wrap(req => engine.importPeople(req.body.rows || [], req.body.mode || 'merge')));
// Fotos de perfil: várias de uma vez (o nome de cada arquivo diz de quem é), ou a de uma pessoa
app.post('/api/admin/photos', wrap(req => engine.importPhotos((req.body || {}).files || [])));
app.put('/api/admin/people/:id/photo', wrap(req => { engine.setPhoto(req.params.id, (req.body || {}).data); return { ok: true }; }));
app.delete('/api/admin/people/:id/photo', wrap(req => { engine.removePhoto(req.params.id); return { ok: true }; }));
app.post('/api/admin/form/import', wrap(req => engine.importForm(req.body.rows || [], req.body.keyColumn)));

app.post('/api/admin/questions', wrap(req => { engine.addQuestion(req.body || {}); return { ok: true }; }));
app.put('/api/admin/questions/:id', wrap(req => { engine.updateQuestion(req.params.id, req.body || {}); return { ok: true }; }));
app.delete('/api/admin/questions/:id', wrap(req => { engine.deleteQuestion(req.params.id); return { ok: true }; }));
app.post('/api/admin/questions/replace', wrap(req => { engine.replaceQuestions(req.body.questions || []); return { ok: true }; }));
app.post('/api/admin/questions/reset', wrap(() => { engine.resetQuestions(); return { ok: true }; }));

app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

/* ---------- tempo real ---------- */
function pushAll(notice) {
  // quem entrou com a senha mestra (sala "master": o painel e o telão do Doc) recebe tudo; no modo confidencial,
  // os outros aparelhos recebem o estado sem o conteúdo do townhall
  const full = fullState(), secret = confidential();
  if (secret) { io.to('master').emit('state', full); io.except('master').emit('state', redact(full)); } else io.emit('state', full);
  for (const [, socket] of io.of('/').sockets) {
    if (!socket.data.token && !socket.data.personId) continue;
    const pid = bind(socket); // revalida o token a cada push (check-in desfeito, reset, outro aparelho assumiu o nome)
    socket.emit('me', pid ? meState(pid) : null);
  }
  if (notice) { const { secret: hush, ...n } = notice; (hush && secret ? io.to('master') : io).emit('notify', n); } // aviso de uma cena: confidencial também
  pushAdmin();
}
let adminTimer = null;
function pushAdmin() {
  if (adminTimer) return;
  adminTimer = setTimeout(() => { adminTimer = null; io.to('admin').emit('admin:overview', overviewFor('master')); io.to('team').emit('admin:overview', overviewFor('team')); }, 500);
}
// O evento saiu da Reflexão (outro passo, aviso, dinâmica do Sucesso): a votação em andamento fica pausada.
engine.onChange(() => { if (!reflexaoOnAir()) reflexao.hold(); });
engine.onChange(() => cenas.sync(cenaOnAir())); // saiu de uma cena: o que estava tocando para
engine.onChange(pushAll);
reflexao.onChange(pushAll);
cenas.onChange(n => pushAll(n ? { ...n, secret: true } : null)); // tudo o que vem das cenas é conteúdo do townhall
cenas.onPulse(p => (confidential() ? io.to('master') : io).emit('cena:pulse', p));   // carga do Flux Capacitor subindo com os toques dos celulares
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
    const reopened = !!p && (!l || l.phase !== 'done');
    if (reopened && p.revealed) { p.revealed = false; engine.save(); } // recebimento reaberto ou respostas apagadas: a nuvem volta a ficar guardada
    if (reopened && p.draw) engine.closeDraw(); // dinâmica reiniciada ou limpa: o sorteio sai da tela
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
  const doc = list.map(t => t.doc).filter(Boolean).sort((a, b) => b.at - a.at)[0] || null; // onde a cena do Doc está no telão
  return { count: list.length, sound: list.some(t => !t.locked), auth: list.some(t => t.auth), master: list.some(t => t.master), videos: { abertura: list.some(t => t.videos && t.videos.abertura), tributo: list.some(t => t.videos && t.videos.tributo) }, doc };
}
const adminOverview = () => ({ ...engine.adminOverview(), role: 'master', team: !!TEAM_PASSWORD, telao: telaoStatus(), sucesso: sucesso.ready() ? sucesso.overview(engine.state.sucessoRoom) : null, reflexao: reflexao.adminState(), cenas: cenas.adminState(),
  doc: { ai: doc.hasAI(), model: doc.MODEL, parts: doc.parts(engine.state.doc.message) } });
// O painel de quem entrou com a senha das dinâmicas: só os passos de Conexões, Reflexão e Sucesso (mais o check-in e o Doc),
// só os ajustes delas e nada das cenas. Se o que está no ar é um passo do townhall, o painel só fica sabendo que "há outro bloco no ar".
function teamOverview() {
  const o = adminOverview(), live = engine.currentStep(), st = o.state;
  const hidden = !st.presentation && !st.detour && !TEAM_STEPS.includes(live.type);
  return { ...o, role: 'team', cenas: null, words: [], hidden,
    settings: { ...Object.fromEntries(TEAM_SETTINGS_VIEW.map(k => [k, o.settings[k]])), steps: o.settings.steps.filter(x => TEAM_STEPS.includes(x.type)) },
    state: { ...st, block: hidden ? 'hidden' : st.block, step: TEAM_STEPS.includes(live.type) ? st.step : null, returnStep: null, message: st.detour === 'message' ? st.message : { title: '', body: '', emoji: '' } } };
}
const overviewFor = role => (role === 'master' ? adminOverview() : teamOverview());

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
  // o navegador que fez login com a senha mestra (cookie) entra na sala "master": é assim que o telão do Doc recebe as cenas no modo confidencial
  if (sucesso.cookieRole(socket.request) === 'master') socket.join('master');
  const master = () => socket.rooms.has('master');
  socket.on('hello', (payload, ack) => {
    try {
      const pid = bind(socket, payload && payload.token);
      safeAck(ack, { ok: !!pid, state: publicState(master()), me: pid ? meState(pid) : null, now: Date.now(), epoch: engine.epoch, master: master() });
    } catch (e) { console.error('[hello]', e); safeAck(ack, { ok: false, error: 'Server error.', state: publicState(master()), me: null, now: Date.now(), epoch: engine.epoch }); }
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
  // Reconhecimento: cada toque no celular ("aplauso") soma energia ao Flux Capacitor do telão
  socket.on('cena:tap', (payload, ack) => {
    try {
      const pid = bind(socket, payload && payload.token);
      if (!pid || cenaOnAir() !== 'reconhecimento') return safeAck(ack, { ok: false });
      safeAck(ack, { ok: cenas.tap(pid, engine.publicState().counts.checkedIn) });
    } catch (e) { safeAck(ack, { ok: false }); }
  });
  // Reconhecimento: o Painel do Doc ouve os aplausos pelo microfone e manda a carga andar (só sockets logados como admin)
  socket.on('cena:mic', payload => {
    try { if (socket.rooms.has('admin') && cenaOnAir() === 'reconhecimento') cenas.mic(payload && payload.delta, payload && payload.nivel); } catch (e) { /* segue */ }
  });
  socket.on('admin:hello', (payload, ack) => {
    try {
      const role = roleOfKey(payload && payload.key);
      socket.leave('admin'); socket.leave('team');
      if (role === 'master') { socket.join('admin'); socket.join('master'); } else if (role === 'team') { socket.join('team'); socket.leave('master'); }
      safeAck(ack, role ? { ok: true, role, overview: overviewFor(role) } : { ok: false, error: 'Senha inválida.' });
    } catch (e) { console.error('[admin:hello]', e); safeAck(ack, { ok: false, error: 'Erro no servidor.' }); }
  });
  // Vídeo de abertura: o telão do Doc avisa quando o vídeo chega ao fim (o painel mostra "terminou" e oferece o próximo passo)
  socket.on('cena:fim', payload => {
    try { if (master() && payload && payload.kind === 'abertura' && cenaOnAir() === 'abertura') cenas.command('abertura', { action: 'fim' }); } catch (e) { /* segue */ }
  });
  socket.on('telao:status', payload => {
    const d = payload && payload.doc && typeof payload.doc === 'object' ? { seq: Number(payload.doc.seq) || 0, part: Number(payload.doc.part) || 0, speaking: !!payload.doc.speaking, done: !!payload.doc.done, voice: String(payload.doc.voice || '').slice(0, 80), at: Date.now() } : null;
    const v = payload && payload.videos && typeof payload.videos === 'object' ? { abertura: !!payload.videos.abertura, tributo: !!payload.videos.tributo } : null; // vídeos já carregados neste telão
    socket.data.telao = { locked: !!(payload && payload.locked), auth: !!(payload && payload.auth), master: master(), videos: v, doc: d }; pushAdmin();
  });
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
  console.log(`   Painel do Doc: http://localhost:${PORT}/admin.html  (senha mestra: ${ADMIN_PASSWORD === 'doc1985' ? 'doc1985 · defina ADMIN_PASSWORD para trocar' : 'definida via ADMIN_PASSWORD'})`);
  console.log(`   Painel das dinâmicas (só Conexões, Reflexão e Sucesso): http://localhost:${PORT}/dinamicas  (${TEAM_PASSWORD ? 'senha definida via DINAMICAS_PASSWORD' : 'desligado · defina DINAMICAS_PASSWORD para ligar'})`);
  console.log(`   Banco: ${DB_PATH} · rodadas: ${TOTAL_ROUNDS}`);
  console.log(`   De Volta para o Sucesso: http://localhost:${PORT}/painel (mesma senha do Painel do Doc)`);
}));
