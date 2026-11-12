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
  async function screen(setting, presenter) {
    return mod.readScreenActivity(DB, mod.publicPresentation(setting), presenter ? PRESENTER_ID : null);
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
    app.get('/participar/:roomId', (req, res, next) => (UUID.test(req.params.roomId) ? send('participar.html')(req, res, next) : next()));
    app.get('/ao-vivo', send('index.html'));
    for (const file of ['live-panel.js', 'live-panel.css', 'townhall-sync.js', 'vendor/qrcode.js']) app.get('/' + file, send(file));
  }

  return {
    init, mount, prepare, storePresentation, publicPresentation, screen,
    hasCookie, setCookie, clearCookie,
    onChange: fn => listeners.push(fn),
    ready: () => !!mod,
    PRESENTER_ID,
  };
}

module.exports = { createSucesso };
