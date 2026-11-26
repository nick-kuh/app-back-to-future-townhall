// Teste da Visão 2027 (o Doc): palavras mais citadas, roteiro automático, chamada à IA (com uma API
// falsa local que confere o pedido) e o fluxo no servidor: gerar, editar, conduzir a cena, enviar aos
// celulares e baixar o .txt. Nenhuma chamada sai para a internet.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert/strict');
const crypto = require('crypto');
const doc = require('../server/doc');

const ACTS = [
  { id: 'd1', title: 'Antes de Partir', question: 'O que você considera um sucesso?', responses: [
    { name: 'Ana', answer: 'Equipe unida e clientes felizes' }, { name: 'Bruno', answer: 'Clientes satisfeitos' }, { name: 'Anônimo', answer: 'equipe feliz' }] },
  { id: 'd2', title: 'Look Back', question: 'Olhando para 2026...', responses: [{ name: 'Carla', answer: 'Lançamos o novo portal em 2026, um sucesso' }] },
  { id: 'd3', title: 'Uso de IA', question: 'O que você fez com IA?', responses: [{ name: 'Davi', answer: 'Agente de IA para automação de relatórios' }, { name: 'Eva', answer: 'Automação de testes com IA' }] },
  { id: 'd4', title: 'Look Ahead', question: '2027 foi um sucesso?', responses: [{ name: 'Fabi', answer: 'Mais inovação e crescimento' }, { name: 'Anônimo', answer: 'Crescimento da equipe e inovação' }] },
];
const exported = { roomId: 'x', acts: ACTS };

/* ---------- unidades ---------- */
function units() {
  // plural soma no singular; artigos, preposições e o eco da pergunta ficam de fora
  const w = doc.countWords(['Clientes felizes', 'cliente feliz', 'o sucesso da equipe'], ['sucesso']);
  assert.deepEqual(w[0], ['cliente', 2]); assert.ok(w.some(([x]) => x === 'equipe'));
  assert.ok(!w.some(([x]) => x === 'sucesso' || x === 'da' || x === 'o'));
  const acts = doc.collect(exported);
  assert.deepEqual(acts.map(a => a.answers.length), [3, 1, 2, 2]);
  assert.ok(!acts.find(a => a.id === 'd3').words.some(([x]) => x === 'ia'), 'a palavra da pergunta (IA) não entra nas mais citadas da dinâmica 3');
  assert.equal(acts.find(a => a.id === 'd3').words[0][0], 'automação');

  // roteiro automático: uma fala por dinâmica com respostas, manchetes com as palavras da d4
  const auto = doc.normalize(doc.autoMessage(acts), acts);
  assert.deepEqual(auto.blocos.map(b => b.id), ['d1', 'd2', 'd3', 'd4']);
  assert.match(auto.blocos[0].fala, /equipe|clientes/); assert.equal(auto.total, 8);
  assert.ok(auto.manchetes.length >= 1 && auto.manchetes.every(m => m.length <= 90));
  assert.match(auto.manchetes.join(' '), /CRESCIMENTO|INOVAÇÃO/);
  assert.ok(auto.palavras.length && auto.palavras.every(([x, c]) => typeof x === 'string' && c >= 1));
  assert.ok(!JSON.stringify(auto).includes('Ana'), 'o resumo nunca leva nomes');
  // sem respostas: a mensagem continua de pé
  const empty = doc.normalize(doc.autoMessage(doc.collect({ acts: [] })), doc.collect({ acts: [] }));
  assert.equal(empty.blocos.length, 0); assert.ok(empty.abertura && empty.encerramento && empty.manchetes.length);

  // o que vem da IA é validado: dinâmica sem fala recebe a do roteiro automático; textos longos são cortados
  const n = doc.normalize({ titulo: 'T', abertura: 'A'.repeat(2000), blocos: [{ dinamica: 'd1', fala: 'fala 1' }, { dinamica: 'dX', fala: 'x' }], manchetes: ['M1', '', 'M2'], encerramento: 'E' }, acts);
  assert.equal(n.abertura.length, 700); assert.equal(n.blocos.length, 4); assert.equal(n.blocos[0].fala, 'fala 1');
  assert.match(n.blocos[1].fala, /2026/); assert.deepEqual(n.manchetes, ['M1', 'M2']);
  assert.deepEqual(n.blocos[0].palavras.slice(0, 2).sort(), ['clientes', 'equipe']);

  // edição no painel
  const ed = doc.edit({ ...auto, fonte: 'ia' }, { abertura: 'Nova abertura', manchetes: ['UMA'] }, exported);
  assert.equal(ed.abertura, 'Nova abertura'); assert.deepEqual(ed.manchetes, ['UMA']); assert.equal(ed.fonte, 'editado-ia'); assert.equal(ed.blocos.length, 4);

  // partes da cena e arquivo .txt
  assert.deepEqual(doc.parts(auto).map(p => p.id), ['chegada', 'abertura', 'd1', 'd2', 'd3', 'd4', 'jornal', 'final']);
  const txt = doc.toTxt(auto, exported, 'Townhall Teste');
  assert.match(txt, /VISÃO 2027/); assert.match(txt, /JORNAL DE 2027/); assert.match(txt, /PALAVRAS MAIS CITADAS/);
  assert.match(txt, /1\. Ana: Equipe unida e clientes felizes/); assert.match(txt, /roteiro automático/);
  // kit do vídeo do Doc: chegada, saída do carro, uma cena por dinâmica, jornal e encerramento, ~7 s cada
  const kit = doc.videoKit(auto, { eventName: 'Townhall Teste' });
  assert.equal(kit.segments.length, 2 + auto.blocos.length + 2); assert.ok(kit.total >= 40 && kit.total <= 70, String(kit.total));
  assert.equal(kit.segments[0].line, ''); assert.match(kit.segments[kit.segments.length - 2].line, /^Vejam só a manchete/); assert.ok(!/2027: 2027/.test(kit.text), 'manchete sem o ano repetido');
  for (const sg of kit.segments.slice(1)) assert.ok(sg.line.split(/\s+/).length <= 20, `fala longa demais: ${sg.line}`);
  for (const k of ['Nano Banana Pro', '[G4 · falando, 8 s]', 'BRIEFING 1', 'BRIEFING 2', 'loop_parado.mp4', 'loop_falando.mp4', 'retrato_doc.png', 'ficha_doc.png', 'jornal_2027.png', 'Project Save', '12 GB', 'personagem original', 'SEGMENTO 1 · 0:00–0:06']) assert.ok(kit.text.includes(k), k);
  assert.ok(!kit.text.includes('Ana'), 'o kit não leva nomes');
  console.log('OK · palavras, roteiro automático, validação, edição, .txt e kit do vídeo');
}

/* ---------- API falsa do Claude (confere o pedido e responde) ---------- */
function fakeClaude(reply) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', c => { body += c; });
    req.on('end', () => {
      const json = JSON.parse(body || '{}'); seen.push({ url: req.url, headers: req.headers, body: json });
      const out = typeof reply === 'function' ? reply(json) : reply;
      res.writeHead(out.status || 200, { 'Content-Type': 'application/json', 'request-id': 'req_teste' });
      res.end(JSON.stringify(out.body));
    });
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ server, seen, url: `http://127.0.0.1:${server.address().port}` })));
}
const okReply = data => ({ body: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_sequence: null,
  content: [{ type: 'text', text: JSON.stringify(data) }], usage: { input_tokens: 10, output_tokens: 10 } } });
const AI = { titulo: 'Relatório de 2027', abertura: 'Cheguei de 2027!', blocos: [{ dinamica: 'd1', fala: 'Sucesso é equipe.' }, { dinamica: 'd2', fala: 'O portal.' }, { dinamica: 'd3', fala: 'Automação.' }, { dinamica: 'd4', fala: 'Inovação.' }], manchetes: ['INOVAÇÃO DOMINA 2027', 'EQUIPE CRESCE'], encerramento: 'O futuro é de vocês.' };

async function aiCall() {
  const fake = await fakeClaude(okReply(AI));
  const Anthropic = require('@anthropic-ai/sdk');
  doc._setClient(new Anthropic({ apiKey: 'teste', baseURL: fake.url, maxRetries: 0 }));
  try {
    const m = await doc.generate(exported);
    assert.equal(m.fonte, 'ia'); assert.equal(m.abertura, 'Cheguei de 2027!'); assert.equal(m.blocos.length, 4); assert.deepEqual(m.manchetes, AI.manchetes);
    const req = fake.seen[0];
    assert.match(req.url, /\/v1\/messages/);
    assert.equal(req.body.model, 'claude-opus-5-5'); assert.equal(req.body.fallbacks, 'default');
    assert.match(req.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
    assert.equal(req.body.output_config.format.type, 'json_schema'); assert.equal(req.body.output_config.effort, 'medium');
    assert.equal(req.body.thinking, undefined); assert.equal(req.body.temperature, undefined);
    const content = req.body.messages[0].content;
    assert.match(content, /Equipe unida e clientes felizes/); assert.ok(!content.includes('Ana') && !content.includes('Bruno'), 'os nomes não vão para a IA');

    // recusa da IA, erro de autenticação e JSON quebrado: cai no roteiro automático e explica o motivo
    fake.server.close();
    const refusal = await fakeClaude({ body: { ...okReply(AI).body, stop_reason: 'refusal', content: [] } });
    doc._setClient(new Anthropic({ apiKey: 'teste', baseURL: refusal.url, maxRetries: 0 }));
    let r = await doc.generate(exported); assert.equal(r.fonte, 'auto'); assert.match(r.aviso, /não quis/); refusal.server.close();
    const denied = await fakeClaude({ status: 401, body: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } });
    doc._setClient(new Anthropic({ apiKey: 'teste', baseURL: denied.url, maxRetries: 0 }));
    r = await doc.generate(exported); assert.equal(r.fonte, 'auto'); assert.match(r.aviso, /chave da IA/); denied.server.close();
    const broken = await fakeClaude({ body: { ...okReply(AI).body, content: [{ type: 'text', text: '{"titulo": ' }] } });
    doc._setClient(new Anthropic({ apiKey: 'teste', baseURL: broken.url, maxRetries: 0 }));
    r = await doc.generate(exported); assert.equal(r.fonte, 'auto'); assert.match(r.aviso, /formato inesperado/); broken.server.close();
    // sem IA pedida: nem chama
    r = await doc.generate(exported, { useAI: false }); assert.equal(r.fonte, 'auto');
  } finally { doc._setClient(null); fake.server.close(); }
  console.log('OK · chamada à IA (modelo, fallback, formato JSON, sem nomes) e quedas para o roteiro automático');
}

/* ---------- servidor: gerar, editar, cena, celulares, .txt ---------- */
async function serverFlow() {
  const fake = await fakeClaude(okReply(AI));
  const PORT = 3990 + Math.floor(Math.random() * 9), B = `http://localhost:${PORT}`;
  const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'th-doc-'));
  const srv = spawn(process.execPath, ['--no-warnings', path.join(__dirname, '..', 'server', 'index.js')], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR, ADMIN_PASSWORD: 'teste', ANTHROPIC_API_KEY: 'teste', ANTHROPIC_BASE_URL: fake.url }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  const H = { 'Content-Type': 'application/json', 'x-admin-key': 'teste', Origin: B };
  const call = async (method, url, body, headers = H) => { const r = await fetch(B + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); const t = await r.text(); let json = null; try { json = JSON.parse(t); } catch { /* texto */ } return { status: r.status, json, text: t, headers: r.headers }; };
  try {
    for (let i = 0; i < 60; i++) { try { await fetch(B + '/health'); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
    let ov = (await call('GET', '/api/admin/overview')).json;
    for (let i = 0; i < 30 && !ov.sucesso; i++) { await new Promise(r => setTimeout(r, 100)); ov = (await call('GET', '/api/admin/overview')).json; }
    assert.equal(ov.doc.ai, true); assert.equal(ov.state.doc.status, 'idle');
    const steps = ov.settings.steps, docStep = steps.find(x => x.type === 'doc');
    assert.ok(docStep, 'o roteiro padrão tem a Visão 2027'); assert.equal(steps[steps.indexOf(docStep) + 1].type, 'closing');

    // respostas nas dinâmicas pelo app (com o nome do check-in)
    const people = (await call('GET', '/api/people')).json, tokens = [];
    for (const p of people.slice(0, 4)) tokens.push((await call('POST', '/api/checkin', { personId: p.id })).json.token);
    const room = ov.sucesso.roomId;
    // (cada pessoa responde uma vez: a API do Sucesso pede 2 s entre envios da mesma pessoa)
    for (const [k, texts, from] of [['d1', ['Equipe unida', 'Clientes felizes'], 0], ['d4', ['Inovação em tudo', 'Crescimento e inovação'], 2]]) {
      await call('POST', '/api/admin/step', { id: steps.find(x => x.type === 'sucesso' && x.activity === k).id });
      await call('POST', `/api/rooms/${room}/activities/${k}/command`, { action: 'start' });
      for (let i = 0; i < texts.length; i++) { const r = await call('POST', '/api/sucesso/answer', { token: tokens[from + i], answer: texts[i], clientRequestId: crypto.randomUUID() }, { 'Content-Type': 'application/json' }); assert.equal(r.status, 200, JSON.stringify(r.json)); }
    }
    // sem a Visão 2027 no ar, a cena não começa
    let r = await call('POST', '/api/admin/doc', { action: 'start' }); assert.equal(r.status, 409);
    r = await call('POST', '/api/admin/doc', { action: 'generate' }); assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.fonte, 'ia');
    const sent = fake.seen[fake.seen.length - 1].body.messages[0].content;
    assert.match(sent, /Inovação em tudo/); assert.ok(!people.slice(0, 4).some(p => sent.includes(p.name)), 'os nomes não vão para a IA');
    ov = (await call('GET', '/api/admin/overview')).json;
    assert.equal(ov.state.doc.status, 'ready'); assert.equal(ov.state.doc.message.abertura, 'Cheguei de 2027!');
    assert.deepEqual(ov.doc.parts.map(p => p.id), ['chegada', 'abertura', 'd1', 'd4', 'jornal', 'final']);
    // o estado público não mostra a mensagem antes da hora
    let st = (await call('GET', '/api/state')).json; assert.equal(st.doc.ready, true); assert.equal(st.doc.message, null);

    // edição no painel
    r = await call('POST', '/api/admin/doc', { action: 'edit', message: { encerramento: 'Construam 2027!' } }); assert.equal(r.status, 200);
    ov = (await call('GET', '/api/admin/overview')).json; assert.equal(ov.state.doc.message.encerramento, 'Construam 2027!'); assert.equal(ov.state.doc.message.fonte, 'editado-ia');

    // a cena: no ar, começa, avança, pausa e volta
    r = await call('POST', '/api/admin/step', { id: docStep.id }); assert.equal(r.status, 200);
    st = (await call('GET', '/api/state')).json; assert.equal(st.block, 'doc'); assert.equal(st.presentation, null); assert.equal(st.doc.message, null);
    r = await call('POST', '/api/admin/doc', { action: 'next' }); assert.equal(r.status, 409);
    r = await call('POST', '/api/admin/doc', { action: 'start' }); assert.equal(r.status, 200);
    st = (await call('GET', '/api/state')).json; assert.equal(st.doc.play.part, 0); assert.equal(st.doc.message.encerramento, 'Construam 2027!');
    const seq0 = st.doc.play.seq;
    for (let i = 0; i < 9; i++) await call('POST', '/api/admin/doc', { action: 'next' });
    st = (await call('GET', '/api/state')).json; assert.equal(st.doc.play.part, 5, 'para na última parte'); assert.ok(st.doc.play.seq > seq0);
    await call('POST', '/api/admin/doc', { action: 'pause' }); st = (await call('GET', '/api/state')).json; assert.equal(st.doc.play.paused, true);
    await call('POST', '/api/admin/doc', { action: 'goto', part: 2 }); st = (await call('GET', '/api/state')).json; assert.equal(st.doc.play.part, 2); assert.equal(st.doc.play.paused, false);
    r = await call('POST', '/api/admin/doc', { action: 'phones', on: true }); assert.equal(r.status, 200);
    st = (await call('GET', '/api/state')).json; assert.equal(st.doc.phones, true);
    await call('POST', '/api/admin/doc', { action: 'stop' }); st = (await call('GET', '/api/state')).json; assert.equal(st.doc.play, null); assert.ok(st.doc.message, 'com os celulares liberados a mensagem continua pública');

    // .txt: só com a senha
    r = await call('GET', '/api/admin/doc.txt', undefined, {}); assert.equal(r.status, 401);
    r = await call('GET', '/api/admin/doc.txt');
    assert.equal(r.status, 200); assert.match(r.headers.get('content-disposition'), /Visao_2027_Doc\.txt/);
    assert.match(r.text, /Construam 2027!/); assert.match(r.text, /Inovação em tudo/); assert.match(r.text, /IA \(Claude\), editado/);

    // kit do vídeo do Doc: só com a senha, com as falas da mensagem atual
    r = await call('GET', '/api/admin/doc-video.txt', undefined, {}); assert.equal(r.status, 401);
    r = await call('GET', '/api/admin/doc-video.txt'); assert.equal(r.status, 200); assert.match(r.headers.get('content-disposition'), /Kit_Video_do_Doc\.txt/);
    assert.match(r.text, /Construam 2027!/); assert.match(r.text, /BRIEFING 2 PARA O AGENTE DE IA/);

    // ajustes da voz e do vídeo (endereços inválidos são descartados)
    r = await call('POST', '/api/admin/action', { type: 'settings', settings: { docVoice: false, docRate: 3, docVoiceName: 'Antonio', docVideoUrl: 'javascript:alert(1)' } }); assert.equal(r.status, 200);
    st = (await call('GET', '/api/state')).json; assert.equal(st.settings.docVoice, false); assert.equal(st.settings.docRate, 1.4); assert.equal(st.settings.docVideoUrl, '');
    await call('POST', '/api/admin/action', { type: 'settings', settings: { docVideoUrl: '/videos/doc.mp4', docVideoFull: true, docImageUrl: 'https://exemplo.com/doc.png' } });
    st = (await call('GET', '/api/state')).json; assert.equal(st.settings.docVideoUrl, '/videos/doc.mp4'); assert.equal(st.settings.docVideoFull, true); assert.equal(st.settings.docImageUrl, 'https://exemplo.com/doc.png');
    await call('POST', '/api/admin/action', { type: 'settings', settings: { docIdleVideoUrl: '/videos/parado.mp4', docTalkVideoUrl: 'https://exemplo.com/falando.mp4' } });
    st = (await call('GET', '/api/state')).json; assert.equal(st.settings.docIdleVideoUrl, '/videos/parado.mp4'); assert.equal(st.settings.docTalkVideoUrl, 'https://exemplo.com/falando.mp4');
    await call('POST', '/api/admin/action', { type: 'settings', settings: { docTalkVideoUrl: '/videos/a.mp4, /videos/b.mp4\njavascript:alert(1) https://x.com/c.mp4' } });
    st = (await call('GET', '/api/state')).json; assert.equal(st.settings.docTalkVideoUrl, '/videos/a.mp4 /videos/b.mp4 https://x.com/c.mp4', 'vários vídeos, sem endereços inválidos');
    await call('POST', '/api/admin/action', { type: 'settings', settings: { docImageUrl: 'data:image/png;base64,xx' } });
    st = (await call('GET', '/api/state')).json; assert.equal(st.settings.docImageUrl, '', 'só endereços http(s) ou do próprio site');

    // abertura e encerramento fixos (vídeo com a boca sincronizada): validação e a mensagem segue o texto fixo
    const OPEN = 'Vocês não vão acreditar no que eu vi! Prestem atenção!', CLOSE = 'O futuro não está escrito. Construam 2027!';
    await call('POST', '/api/admin/action', { type: 'settings', settings: { docOpenText: `  ${OPEN}\n `, docOpenVideo: '/videos/doc-abertura.mp4', docCloseText: CLOSE + ' '.repeat(3), docCloseVideo: 'javascript:alert(1)' } });
    st = (await call('GET', '/api/state')).json;
    assert.equal(st.settings.docOpenText, OPEN); assert.equal(st.settings.docOpenVideo, '/videos/doc-abertura.mp4'); assert.equal(st.settings.docCloseText, CLOSE); assert.equal(st.settings.docCloseVideo, '', 'endereço inválido descartado');
    await call('POST', '/api/admin/action', { type: 'settings', settings: { docCloseText: 'x'.repeat(900) } });
    st = (await call('GET', '/api/state')).json; assert.equal(st.settings.docCloseText.length, 600, 'texto fixo com no máximo 600 caracteres');
    await call('POST', '/api/admin/action', { type: 'settings', settings: { docCloseText: CLOSE } });
    r = await call('POST', '/api/admin/doc', { action: 'generate', ai: false }); assert.equal(r.status, 200);
    ov = (await call('GET', '/api/admin/overview')).json; assert.equal(ov.state.doc.message.abertura, OPEN); assert.equal(ov.state.doc.message.encerramento, CLOSE);
    await call('POST', '/api/admin/doc', { action: 'edit', message: { abertura: 'Outra abertura', encerramento: 'Outro fim' } });
    ov = (await call('GET', '/api/admin/overview')).json; assert.equal(ov.state.doc.message.abertura, OPEN, 'o texto fixo continua depois de editar'); assert.equal(ov.state.doc.message.encerramento, CLOSE);
    r = await call('GET', '/api/admin/doc.txt'); assert.match(r.text, /Construam 2027!/);
    await call('POST', '/api/admin/action', { type: 'settings', settings: { docOpenText: '', docOpenVideo: '', docCloseText: '' } });
    await call('POST', '/api/admin/doc', { action: 'generate', ai: false }); ov = (await call('GET', '/api/admin/overview')).json; assert.notEqual(ov.state.doc.message.abertura, OPEN, 'sem texto fixo, volta a ser gerado');

    // apagar a mensagem e resetar o evento
    r = await call('POST', '/api/admin/doc', { action: 'clear' }); st = (await call('GET', '/api/state')).json; assert.equal(st.doc.ready, false); assert.equal(st.doc.phones, false);
    await call('POST', '/api/admin/doc', { action: 'generate', ai: false }); ov = (await call('GET', '/api/admin/overview')).json; assert.equal(ov.state.doc.message.fonte, 'auto');
    await call('POST', '/api/admin/action', { type: 'resetEvent' }); ov = (await call('GET', '/api/admin/overview')).json; assert.equal(ov.state.doc.message, null);
    console.log('OK · Visão 2027 no servidor: gerar com IA, editar, cena no telão, celulares, .txt e ajustes');
  } finally { srv.kill(); fake.server.close(); fs.rmSync(DATA_DIR, { recursive: true, force: true }); }
}

(async () => {
  try { units(); await aiCall(); await serverFlow(); process.exit(0); }
  catch (e) { console.error('FALHOU:', e); process.exit(1); }
})();
