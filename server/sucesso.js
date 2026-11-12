// Ponte para o "De Volta para o Sucesso" (projeto do Lucas, em /sucesso).
// A API original (sucesso/server/api.js) roda sem alterações: ela recebe um Request
// no formato Fetch e um banco com a interface do D1, que aqui é o SQLite do Node
// (sucesso/scripts/sqlite-db.mjs). A identidade do apresentador, que lá vinha da
// conta ChatGPT, aqui vem do login do Painel do Doc (cookie assinado com a senha de admin).
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..', 'sucesso');
const PUBLIC = path.join(ROOT, 'public');
const PRESENTER_ID = 'painel-do-doc';
const COOKIE = 'bttf_admin';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 16384;
const SQL_NOW = "CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)";
// Como no painel do Lucas: depois de encerrar, as dinâmicas 2 e 3 têm sorteio e tempo de fala.
const TALK_SECONDS = { d2: 120, d3: 180 };
const GUIDE = { d3: ['DESAFIO', 'COMO USOU IA', 'IMPACTO'] };
// Quem responde pelo app entra na API do Lucas com um "participantId" derivado do check-in:
// assim cada resposta fica ligada à pessoa (nome certo, sorteio avisa o celular dela).
const PERSON_PREFIX = 'b77f0000-0000-4000-8000-';
const personUuid = id => PERSON_PREFIX + Number(id).toString(16).padStart(12, '0');
const personOfUuid = uuid => (typeof uuid === 'string' && uuid.startsWith(PERSON_PREFIX) ? parseInt(uuid.slice(PERSON_PREFIX.length), 16) : null);

function createSucesso({ dbPath, adminPassword }) {
  let mod = null, DB = null, worker = null;
  const listeners = [];

  async function init() {
    const api = await import(pathToFileURL(path.join(ROOT, 'server', 'api.js')).href);
    const { openDatabase } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'sqlite-db.mjs')).href);
    DB = openDatabase(dbPath);
    worker = api.createWorker({});
    mod = api;
  }

  /* ---------- login do apresentador (cookie) ---------- */
  const signature = () => crypto.createHmac('sha256', String(adminPassword)).update('painel-do-doc').digest('hex');
  function readCookie(req) {
    const raw = req.headers.cookie || '';
    for (const part of raw.split(';')) {
      const i = part.indexOf('=');
      if (i > 0 && part.slice(0, i).trim() === COOKIE) return decodeURIComponent(part.slice(i + 1).trim());
    }
    return '';
  }
  function hasCookie(req) {
    const value = readCookie(req), expected = signature();
    return value.length === expected.length && crypto.timingSafeEqual(Buffer.from(value), Buffer.from(expected));
  }
  function setCookie(req, res) {
    const secure = req.secure ? '; Secure' : '';
    res.append('Set-Cookie', `${COOKIE}=${signature()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}${secure}`);
  }
  function clearCookie(res) { res.append('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`); }

  /* ---------- apresentação (o que o telão e os celulares mostram) ---------- */
  // A API do Lucas lê a dinâmica em exibição de townhall_state.snapshot.settings.presentation.
  function storePresentation(setting) {
    const snapshot = JSON.stringify({ settings: { presentation: setting || null } });
    DB.prepare(`INSERT INTO townhall_state(id, revision, snapshot) VALUES (1, 1, ?)
      ON CONFLICT(id) DO UPDATE SET revision = revision + 1, snapshot = excluded.snapshot`).bind(snapshot).run();
  }
  async function prepare(roomId, activityId) {
    return mod.preparePresentation(DB, roomId, activityId, PRESENTER_ID);
  }
  const publicPresentation = setting => (mod ? mod.publicPresentation(setting) : null);

  /* ---------- leitura direta (síncrona) da dinâmica em exibição ---------- */
  const valid = setting => !!(mod && setting && UUID.test(String(setting.roomId || '')) && Object.hasOwn(mod.DEFINITIONS, setting.activityId));
  // Estado público da dinâmica: fase, cronômetro e quantidade de respostas (nunca nomes nem textos).
  function live(setting) {
    if (!valid(setting)) return null;
    const row = DB.prepare(`SELECT a.*, ${SQL_NOW} AS read_at,
      (SELECT COUNT(*) FROM responses p WHERE p.room_id = a.room_id AND p.activity_id = a.id AND p.round_id = a.round_id) AS n
      FROM activities a WHERE a.room_id = ? AND a.id = ?`).bind(setting.roomId, setting.activityId).first();
    if (!row) return null;
    const expired = row.phase === 'run' && row.ends_at !== null && row.ends_at <= row.read_at; // mesma regra da API original
    return {
      phase: expired ? 'done' : row.phase,
      endsAt: expired ? null : row.ends_at,
      remainingSeconds: expired ? 0 : row.ends_at !== null ? Math.max(0, Math.ceil((row.ends_at - row.read_at) / 1000)) : row.remaining_seconds,
      roundId: row.round_id, responseCount: row.n, serverNow: row.read_at,
      nameRequired: !!mod.DEFINITIONS[row.id].nameRequired,
      talkSeconds: TALK_SECONDS[row.id] || 0, guide: GUIDE[row.id] || null,
    };
  }
  // Respostas da rodada atual (só para o apresentador logado e para o próprio servidor).
  function responses(setting) {
    if (!valid(setting)) return [];
    return DB.prepare(`SELECT r.id, r.name, r.answer, r.participant_id, r.created_at FROM responses r
      JOIN activities a ON a.room_id = r.room_id AND a.id = r.activity_id AND a.round_id = r.round_id
      WHERE r.room_id = ? AND r.activity_id = ? ORDER BY r.sequence`).bind(setting.roomId, setting.activityId).all().results
      .map(r => ({ id: r.id, name: r.name, answer: r.answer, personId: personOfUuid(r.participant_id), createdAt: r.created_at }));
  }
  const mine = (setting, personId) => responses(setting).filter(r => r.personId === personId).map(r => ({ id: r.id, answer: r.answer, anonymous: r.name === 'Anônimo' }));
  // Resposta enviada pelo app: passa pela API original (fase, prazo, limite de 200 caracteres,
  // 2 s entre envios, reenvio sem duplicar), com o nome do check-in.
  async function answer(setting, person, { answer: text, anonymous, clientRequestId }) {
    if (!valid(setting)) throw Object.assign(new Error('Nenhuma dinâmica está aberta agora.'), { status: 409 });
    const state = live(setting);
    if (!state) throw Object.assign(new Error('Dinâmica não encontrada.'), { status: 404 });
    const name = anonymous && !state.nameRequired ? '' : String(person.name).slice(0, 80);
    const body = JSON.stringify({ activityId: setting.activityId, roundId: state.roundId, clientRequestId, participantId: personUuid(person.id), name, answer: String(text ?? '') });
    const result = await worker.fetch(new Request(`http://townhall.local/api/rooms/${setting.roomId}/responses`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }), { DB });
    const data = await result.json().catch(() => ({}));
    if (!result.ok) throw Object.assign(new Error(data.error || 'Não foi possível enviar agora. Tente de novo.'), { status: result.status });
    for (const fn of listeners) fn();
    return { id: data.response.id, duplicate: !!data.duplicate };
  }

  /* ---------- API /api/rooms (sem alterações, via Request/Response) ---------- */
  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = []; let size = 0;
      req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('Mensagem muito longa.'), { status: 413 })); req.destroy(); } else chunks.push(c); });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }
  let isPresenter = hasCookie;
  async function forward(req, res) {
    if (!worker) return res.status(503).json({ error: 'A sala está sendo preparada. Tente novamente em instantes.' });
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : String(v));
    // Nunca confiar em uma identidade enviada pelo navegador: só o cookie do Painel do Doc vale.
    headers.delete('oai-authenticated-user-id');
    if (isPresenter(req)) headers.set('oai-authenticated-user-id', PRESENTER_ID);
    const hasBody = !['GET', 'HEAD'].includes(req.method);
    const body = hasBody ? await readBody(req) : undefined;
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const result = await worker.fetch(new Request(url, { method: req.method, headers, body }), { DB });
    res.status(result.status);
    result.headers.forEach((value, key) => { if (key !== 'content-length' && key !== 'content-encoding') res.setHeader(key, value); });
    res.end(Buffer.from(await result.arrayBuffer()));
    if (hasBody && result.status < 300) for (const fn of listeners) fn();
  }

  // O painel do Lucas é servido como está, com uma única linha a mais no fim: o script que troca o
  // carro de polígonos pelo DeLorean 3D realista (public/painel-carro.js). O arquivo dele não muda.
  let painelCache = null;
  function painelHtml() {
    if (!painelCache || process.env.NODE_ENV !== 'production') {
      const html = fs.readFileSync(path.join(PUBLIC, 'painel.html'), 'utf8');
      const at = html.lastIndexOf('</body>'); // o último: há outro "</body>" dentro do script de exportar para Word
      painelCache = html.slice(0, at) + '<script src="/delorean3d.js"></script><script src="/painel-carro.js"></script>\n' + html.slice(at);
    }
    return painelCache;
  }

  // O formulário do Lucas também é servido como está, com um script no começo que preenche o nome
  // com o do check-in (public/participar-login.js) antes de o formulário carregar.
  let participarCache = null;
  function participarHtml() {
    if (!participarCache || process.env.NODE_ENV !== 'production') {
      const html = fs.readFileSync(path.join(PUBLIC, 'participar.html'), 'utf8'), at = html.indexOf('<body>') + 6;
      participarCache = html.slice(0, at) + '\n<script src="/participar-login.js"></script>' + html.slice(at);
    }
    return participarCache;
  }

  /* ---------- rotas ---------- */
  function mount(app, { isAdmin }) {
    isPresenter = req => hasCookie(req) || isAdmin(req);
    const send = file => (req, res) => res.sendFile(path.join(PUBLIC, file), { headers: { 'Cache-Control': 'no-store' } });
    app.all(/^\/api\/rooms(\/.*)?$/, (req, res) => {
      forward(req, res).catch(e => {
        if (!e.status) console.error('[sucesso]', e);
        if (!res.headersSent) res.status(e.status || 500).json({ error: e.status ? e.message : 'Não foi possível concluir agora. Tente novamente.' });
      });
    });
    // Painel do apresentador: o login é o mesmo do Painel do Doc.
    app.get(['/painel', '/painel.html'], (req, res, next) => {
      if (hasCookie(req) || isAdmin(req)) { if (!hasCookie(req)) setCookie(req, res); return res.set('Cache-Control', 'no-store').type('html').send(painelHtml()); }
      res.redirect(302, '/admin.html?next=' + encodeURIComponent('/painel' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '')));
    });
    // O painel original manda "entrar de novo" para o login do ChatGPT: aqui vira o login do Doc.
    app.get('/signin-with-chatgpt', (req, res) => {
      const back = String(req.query.return_to || '/painel');
      res.redirect(302, '/admin.html?next=' + encodeURIComponent(back.startsWith('/') && !back.startsWith('//') ? back : '/painel'));
    });
    // Formulário original de resposta (QR do painel 3D): entra com o nome do check-in do app.
    app.get('/participar/:roomId', (req, res, next) => (UUID.test(req.params.roomId) ? res.set('Cache-Control', 'no-store').type('html').send(participarHtml()) : next()));
    app.get('/ao-vivo', send('index.html'));
    for (const file of ['live-panel.js', 'live-panel.css', 'townhall-sync.js', 'vendor/qrcode.js']) app.get('/' + file, send(file));
  }

  return {
    init, mount, prepare, storePresentation, publicPresentation,
    live, responses, mine, answer,
    hasCookie, setCookie, clearCookie,
    onChange: fn => listeners.push(fn),
    ready: () => !!mod,
    PRESENTER_ID,
  };
}

module.exports = { createSucesso };
