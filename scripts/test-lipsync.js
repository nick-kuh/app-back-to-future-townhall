// Teste do Doc com a boca sincronizada (server/lipsync.js): divisão da fala em clipes, o pedido à API de vídeo
// do Gemini (com uma API falsa local que confere o pedido), as quedas (erro, vídeo por endereço, cancelamento)
// e o fluxo no servidor: gerar os clipes, acompanhar, tocar no telão, texto editado, desligar e apagar.
// Nenhuma chamada sai para a internet.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert/strict');

const MSG = {
  titulo: 'Relatório de 2027',
  abertura: 'Pelo grande raio, acabei de voltar de 2027! E vocês precisam ouvir o que eu vi por lá.',
  blocos: [
    { id: 'd1', titulo: 'Antes de Partir', fala: 'Em 2027, sucesso tinha cara de equipe unida. Eu vi clientes felizes em todo canto, gente que confia em gente. E vi que tudo isso começou com vocês, aqui, hoje, quando ninguém ainda sabia o tamanho da viagem. Foi assim que a equipe virou referência e o futuro ficou do jeito que vocês sonharam.' },
    { id: 'd4', titulo: 'Look Ahead', fala: 'Inovação em tudo!' },
  ],
  manchetes: ['INOVAÇÃO DOMINA 2027', 'EQUIPE CRESCE'],
  encerramento: 'O futuro não está escrito. Construam 2027!',
};

function units() {
  const L = require('../server/lipsync');
  // a abertura não repete o que o vídeo da chegada já diz
  assert.equal(L.skipArrival(MSG.abertura), 'E vocês precisam ouvir o que eu vi por lá.');
  assert.equal(L.skipArrival('Olá, pessoal!'), 'Olá, pessoal!');
  let plan = L.plan(MSG, { arrival: true });
  assert.deepEqual([...new Set(plan.map(c => c.part))], ['abertura', 'd1', 'd4', 'jornal', 'final']);
  assert.equal(plan[0].text, 'E vocês precisam ouvir o que eu vi por lá.');
  assert.equal(L.plan(MSG, { arrival: false })[0].text, MSG.abertura);
  // fala longa vira mais de um clipe, sempre com frases inteiras, e cada clipe cabe no limite da API
  const d1 = plan.filter(c => c.part === 'd1');
  assert.ok(d1.length >= 2, 'a fala longa foi dividida'); assert.deepEqual(d1.map(c => c.i), d1.map((_, i) => i));
  assert.equal(d1.map(c => c.text).join(' '), MSG.blocos[0].fala, 'nada se perde na divisão');
  for (const c of plan) { assert.ok(c.seconds >= 3 && c.seconds <= 15, `${c.part}: ${c.seconds}s`); assert.match(c.text, /[.!?…]$/); }
  assert.equal(plan.find(c => c.part === 'jornal').text, 'Vejam só o jornal de 2027! INOVAÇÃO DOMINA 2027. EQUIPE CRESCE.');
  const est = L.estimate(plan);
  assert.equal(est.clips, plan.length); assert.equal(est.seconds, plan.reduce((n, c) => n + c.seconds, 0)); assert.equal(est.usd, Math.round(est.seconds * L.PRICE_PER_SECOND * 100) / 100);
  assert.deepEqual(L.plan(null), []);
  const p = L.promptFor('Olá, 2027!');
  assert.match(p, /saying exactly: "Olá, 2027!"/); assert.match(p, /Brazilian Portuguese/); assert.match(p, /Continue from this exact frame/); assert.match(p, /No music, no subtitles/);
  console.log('OK · divisão da fala em clipes, abertura sem repetir a chegada, estimativa e prompt');
}

/* ---------- API falsa do Gemini (interactions) ---------- */
function fakeGemini(handler) {
  const seen = []; let active = 0, peak = 0;
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', c => { body += c; });
    req.on('end', async () => {
      const json = body ? JSON.parse(body) : null; seen.push({ method: req.method, url: req.url, headers: req.headers, body: json });
      active++; peak = Math.max(peak, active);
      try { await handler(req, res, json, seen); } finally { active--; }
    });
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ server, seen, peak: () => peak, url: `http://127.0.0.1:${server.address().port}` })));
}
const textOf = json => json.input.find(x => x.type === 'text').text.match(/saying exactly: "(.*)" Natural/)[1];
const fakeMp4 = text => Buffer.concat([Buffer.from('\0\0\0\x18ftypmp42'), Buffer.from(text)]);
const ok = (res, text) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ id: 'int_1', status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'video', mime_type: 'video/mp4', data: fakeMp4(text).toString('base64') }] }] })); };
const wait = ms => new Promise(r => setTimeout(r, ms));

async function apiCalls() {
  const L = require('../server/lipsync');
  const image = fs.readFileSync(path.join(__dirname, '..', 'public', 'videos', 'doc-quadro.jpg'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-lip-'));
  const fake = await fakeGemini(async (req, res, json) => {
    if (req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'video/mp4' }); return res.end(fakeMp4('baixado')); }
    await wait(40);
    const text = textOf(json);
    if (/Inovação em tudo/.test(text)) { res.writeHead(500, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: { code: 500, message: 'falha de teste', status: 'INTERNAL' } })); }
    if (/^Vejam só/.test(text)) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ outputs: [{ type: 'video', uri: `http://${req.headers.host}/v1beta/files/abc:download?alt=media` }] })); }
    ok(res, text);
  });
  const old = { key: process.env.GEMINI_API_KEY, base: process.env.GEMINI_BASE_URL };
  try {
    delete process.env.GEMINI_API_KEY;
    await assert.rejects(L.generate(MSG, { rev: 1, dataDir: dir, image }), /GEMINI_API_KEY/);
    process.env.GEMINI_API_KEY = 'chave-teste'; process.env.GEMINI_BASE_URL = fake.url;
    const progress = [];
    const r = await L.generate(MSG, { rev: 7, dataDir: dir, image, onProgress: p => progress.push({ done: p.done, failed: p.failed }) });
    const plan = L.plan(MSG);
    // o pedido: endpoint, chave no cabeçalho, modelo, quadro do Doc em base64, texto exato e duração
    const posts = fake.seen.filter(x => x.method === 'POST');
    assert.equal(posts.length, plan.length);
    for (const q of posts) {
      assert.equal(q.url, '/v1beta/interactions'); assert.equal(q.headers['x-goog-api-key'], 'chave-teste'); assert.ok(!q.url.includes('chave-teste'), 'a chave não vai na URL');
      assert.equal(q.body.model, 'gemini-omni-1.2-flash');
      assert.deepEqual(q.body.input[0], { type: 'image', data: image.toString('base64'), mime_type: 'image/jpeg' });
      const c = plan.find(x => x.text === textOf(q.body)); assert.ok(c, 'cada pedido leva um trecho da fala');
      assert.deepEqual(q.body.response_format, { type: 'video', aspect_ratio: '16:9', resolution: '720p', duration: `${c.seconds}s` });
    }
    assert.ok(fake.peak() <= 3, `no máximo 3 de cada vez (${fake.peak()})`); assert.ok(fake.peak() >= 2, 'em paralelo');
    // progresso a cada clipe; a parte com erro fica de fora (o telão usa a voz do navegador nela)
    assert.equal(progress.length, plan.length); assert.equal(progress[progress.length - 1].done, plan.length);
    assert.equal(r.total, plan.length); assert.equal(r.failed, 1); assert.match(r.errors[0], /^d4 1: falha de teste/);
    assert.deepEqual(Object.keys(r.clips).sort(), ['abertura', 'd1', 'final', 'jornal']);
    assert.equal(r.clips.d1.length, plan.filter(c => c.part === 'd1').length);
    const c0 = r.clips.d1[1]; assert.equal(c0.url, '/doc-clips/7/d1-1.mp4');
    assert.deepEqual(fs.readFileSync(path.join(dir, 'doc-clips', '7', 'd1-1.mp4')), fakeMp4(c0.text));
    // vídeo entregue por endereço: baixado com a chave no cabeçalho
    assert.deepEqual(fs.readFileSync(path.join(dir, 'doc-clips', '7', 'jornal-0.mp4')), fakeMp4('baixado'));
    assert.equal(fake.seen.find(x => x.method === 'GET').headers['x-goog-api-key'], 'chave-teste');
    // cancelar no meio: para de pedir clipes
    const before = fake.seen.length, ac = new AbortController();
    const pr = L.generate(MSG, { rev: 8, dataDir: dir, image, signal: ac.signal });
    await wait(15); ac.abort(); await pr;
    assert.ok(fake.seen.length - before <= 3, 'depois de cancelar, nenhum pedido novo');
    console.log('OK · pedido à API do Gemini (chave, quadro, texto, duração), paralelo, erro, vídeo por endereço e cancelamento');
  } finally {
    if (old.key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = old.key;
    if (old.base === undefined) delete process.env.GEMINI_BASE_URL; else process.env.GEMINI_BASE_URL = old.base;
    fake.server.close(); fs.rmSync(dir, { recursive: true, force: true });
  }
}

/* ---------- servidor: gerar os clipes, acompanhar, telão, texto editado, desligar e apagar ---------- */
async function serverFlow() {
  let slow = false;
  const fake = await fakeGemini(async (req, res, json) => { await wait(slow ? 400 : 30); ok(res, textOf(json)); });
  const PORT = 4010 + Math.floor(Math.random() * 9), B = `http://localhost:${PORT}`;
  const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'th-lips-'));
  const env = { ...process.env, PORT: String(PORT), DATA_DIR, ADMIN_PASSWORD: 'teste', GEMINI_API_KEY: 'chave-teste', GEMINI_BASE_URL: fake.url };
  delete env.ANTHROPIC_API_KEY;
  const srv = spawn(process.execPath, ['--no-warnings', path.join(__dirname, '..', 'server', 'index.js')], { env, stdio: ['ignore', 'pipe', 'inherit'] });
  const H = { 'Content-Type': 'application/json', 'x-admin-key': 'teste', Origin: B };
  const call = async (method, url, body, headers = H) => { const r = await fetch(B + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); const t = await r.text(); let json = null; try { json = JSON.parse(t); } catch { /* texto */ } return { status: r.status, json, text: t }; };
  const overview = async () => (await call('GET', '/api/admin/overview')).json;
  const until = async (fn, ms = 8000) => { const t0 = Date.now(); for (;;) { const ov = await overview(); if (fn(ov)) return ov; if (Date.now() - t0 > ms) throw new Error('tempo esgotado: ' + JSON.stringify(ov.state.doc.lip)); await wait(80); } };
  try {
    for (let i = 0; i < 60; i++) { try { await fetch(B + '/health'); break; } catch { await wait(100); } }
    let ov = await overview();
    for (let i = 0; i < 30 && !ov.sucesso; i++) { await wait(100); ov = await overview(); }
    assert.equal(ov.doc.lip.key, true); assert.equal(ov.doc.lip.model, 'gemini-omni-1.2-flash'); assert.equal(ov.doc.lip.estimate.clips, 0);
    let r = await call('POST', '/api/admin/doc', { action: 'lipsync' }); assert.equal(r.status, 409, 'sem mensagem, sem clipes');
    r = await call('POST', '/api/admin/doc', { action: 'generate', ai: false }); assert.equal(r.status, 200, JSON.stringify(r.json));
    ov = await overview(); const est = ov.doc.lip.estimate; assert.ok(est.clips >= 4 && est.usd > 0, JSON.stringify(est));

    r = await call('POST', '/api/admin/doc', { action: 'lipsync' }); assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.clips, est.clips); assert.equal(r.json.usd, est.usd);
    ov = await overview(); assert.equal(ov.state.doc.lip.status, 'generating'); assert.equal(ov.state.doc.lip.total, est.clips);
    r = await call('POST', '/api/admin/doc', { action: 'lipsync' }); assert.equal(r.status, 409, 'uma geração por vez');
    ov = await until(o => o.state.doc.lip.status !== 'generating');
    const lip = ov.state.doc.lip;
    assert.equal(lip.status, 'ready'); assert.equal(lip.done, lip.total); assert.equal(lip.failed, 0); assert.equal(lip.rev, ov.state.doc.rev); assert.equal(lip.use, true);
    assert.ok(ov.doc.parts.slice(1).every(p => lip.clips[p.id]), 'um ou mais clipes para cada parte falada');
    const first = lip.clips.abertura[0];
    // os clipes ficam no servidor e o telão baixa sem senha
    const v = await fetch(B + first.url); assert.equal(v.status, 200); assert.match(v.headers.get('content-type'), /video\/mp4/);
    assert.deepEqual(Buffer.from(await v.arrayBuffer()), fakeMp4(first.text));
    assert.equal((await fetch(B + '/doc-clips/1/../../townhall.db')).status, 404); assert.equal((await fetch(B + '/doc-clips/99/x.mp4')).status, 404);

    // estado público: os clipes só com a cena no telão, como a mensagem
    let st = (await call('GET', '/api/state')).json; assert.equal(st.doc.lip, null);
    const docStep = ov.settings.steps.find(x => x.type === 'doc');
    await call('POST', '/api/admin/step', { id: docStep.id }); await call('POST', '/api/admin/doc', { action: 'start' });
    st = (await call('GET', '/api/state')).json;
    assert.equal(st.doc.lip.rev, st.doc.rev); assert.deepEqual(st.doc.lip.clips.abertura[0], { url: first.url, text: first.text, seconds: first.seconds });
    // desligar no painel: o telão volta para a voz do navegador
    await call('POST', '/api/admin/doc', { action: 'lipUse', on: false }); st = (await call('GET', '/api/state')).json; assert.equal(st.doc.lip, null);
    await call('POST', '/api/admin/doc', { action: 'lipUse', on: true }); st = (await call('GET', '/api/state')).json; assert.ok(st.doc.lip);
    // texto editado depois dos clipes: os antigos não entram (a fala mudou)
    await call('POST', '/api/admin/doc', { action: 'edit', message: { encerramento: 'Outro final!' } });
    st = (await call('GET', '/api/state')).json; assert.equal(st.doc.lip, null);
    ov = await overview(); assert.notEqual(ov.state.doc.lip.rev, ov.state.doc.rev);

    // gerar de novo e cancelar no meio: para, apaga os arquivos e não volta
    slow = true;
    r = await call('POST', '/api/admin/doc', { action: 'lipsync' }); assert.equal(r.status, 200);
    await wait(150);
    r = await call('POST', '/api/admin/doc', { action: 'lipClear' }); assert.equal(r.status, 200);
    const n = fake.seen.length; await wait(900);
    ov = await overview(); assert.equal(ov.state.doc.lip, null, 'cancelado não volta');
    assert.ok(fake.seen.length - n <= 3, 'depois de cancelar, nenhum pedido novo');
    assert.ok(!fs.existsSync(path.join(DATA_DIR, 'doc-clips')), 'os arquivos foram apagados');
    // apagar a mensagem também apaga os clipes
    slow = false;
    await call('POST', '/api/admin/doc', { action: 'lipsync' }); await until(o => o.state.doc.lip && o.state.doc.lip.status === 'ready');
    await call('POST', '/api/admin/doc', { action: 'clear' }); ov = await overview(); assert.equal(ov.state.doc.lip, null);
    console.log('OK · clipes no servidor: gerar, acompanhar, servir ao telão, desligar, texto editado, cancelar e apagar');
  } finally { srv.kill(); fake.server.close(); fs.rmSync(DATA_DIR, { recursive: true, force: true }); }
}

(async () => {
  try { units(); await apiCalls(); await serverFlow(); process.exit(0); }
  catch (e) { console.error('FALHOU:', e); process.exit(1); }
})();
