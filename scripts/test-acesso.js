// Acesso e abertura do evento:
//  · dois níveis de acesso ao painel (senha mestra e senha das dinâmicas) e o modo confidencial;
//  · as "duas palavras" depois do login e a nuvem das boas-vindas;
//  · o login que não se perde (o celular refaz o check-in sozinho se o servidor esquecer todo mundo);
//  · perguntas das Conexões e paradas da Reflexão também em espanhol; o roteiro novo (vídeo de abertura).
// 1) o motor direto, com banco em memória · 2) pelo servidor de verdade (HTTP e WebSocket).
process.env.DB_PATH = ':memory:';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert/strict');
const WebSocket = require('ws');
const { Engine } = require('../server/engine');
const { kvGet, kvSet } = require('../server/db');
const { createReflexao } = require('../server/reflexao');

/* ---------------- 1) o motor ---------------- */
{
  const e = new Engine(), kind = x => (x.type === 'cena' ? x.cena : x.type === 'sucesso' ? x.activity : x.type);
  // roteiro padrão: check-in → vídeo de abertura → boas-vindas → plano de voo → Conexões → o resto como era
  assert.deepEqual(e.settings.steps.map(kind), ['checkin', 'abertura', 'boasvindas', 'agenda', 'connections', 'almanaque', 'reflexao', 'reconhecimento', 'intervalo', 'visao', 'd1', 'd2', 'd3', 'd4', 'doc', 'mph', 'closing']);
  assert.equal(e.settings.steps[1].transition, false, 'o vídeo de abertura entra direto'); assert.equal(e.settings.steps[3].transition, undefined, 'o plano de voo entra com a transição');
  assert.equal(e.settings.confidencial, true, 'o modo confidencial vem ligado'); assert.match(e.settings.welcomeText, /^Hang tight/, 'os textos padrão do app são em inglês');

  // duas palavras: limpeza, uma resposta por pessoa, nuvem sem nomes (maiúsculas e minúsculas contam juntas)
  const t1 = e.checkin(1).token; e.checkin(2); e.checkin(3);
  assert.equal(e.wordsOf(1), null); assert.equal(e.meState(1).words, null);
  assert.deepEqual(e.setWords(1, ['  Muito   Animado ', '<b>curiosa</b>', 'terceira']), ['Muito Animado', 'b curiosa /b'], 'no máximo duas, sem símbolos soltos');
  assert.deepEqual(e.setWords(1, ['Animado', 'x'.repeat(40)]), ['Animado', 'x'.repeat(20)], 'responder de novo troca; cada palavra tem até 20 letras');
  e.setWords(2, ['animado', 'Grata']); e.setWords(3, 'ANIMADO');
  assert.throws(() => e.setWords(3, ['', '   ']), /at least one word/);
  let w = e.publicState().words;
  assert.equal(w.open, true, 'no check-in o celular pergunta'); assert.equal(w.live, true); assert.equal(w.count, 3);
  assert.deepEqual(w.top[0], ['Animado', 3]); assert.equal(w.top.length, 3); assert.ok(!JSON.stringify(w).includes('Claudia'), 'a nuvem não leva nomes');
  assert.deepEqual(e.meState(1).words, ['Animado', 'x'.repeat(20)]); assert.equal(e.wordsList().length, 3); assert.equal(e.adminOverview().words[0].name, e.personById(1).name);
  e.removeWords(1); assert.equal(e.wordsOf(1), null); assert.equal(e.publicState().words.count, 2);
  // a pergunta vale durante a abertura (check-in, vídeo, boas-vindas, plano de voo); das Conexões em diante, não
  const id = k => e.settings.steps.find(x => kind(x) === k).id;
  for (const k of ['abertura', 'boasvindas', 'agenda']) { e.applyStep(id(k)); assert.equal(e.publicState().words.open, true, k); }
  e.applyStep(id('connections')); assert.equal(e.publicState().words.open, false); e.applyStep(id('almanaque')); assert.equal(e.publicState().words.open, false);
  // reiniciar: as palavras vão junto com os check-ins (e ficam se os check-ins ficam)
  e.resetEvent({ keepCheckins: true }); assert.equal(e.publicState().words.count, 2, 'manter os check-ins mantém as palavras');
  e.resetCheckins(); assert.equal(e.publicState().words.count, 0); assert.equal(e.personByToken(t1), null);

  // o celular refaz o check-in sozinho: vale o nome guardado se o número daquela pessoa mudou
  const nico = e.listPeople().find(p => p.name === 'Nicolas Kuhnast');
  assert.equal(e.checkin(nico.id, null, 'Nicolas Kuhnast').person.id, nico.id);
  assert.equal(e.checkin(99999, null, 'nicolas kuhnast').person.id, nico.id, 'número desconhecido: acha pelo nome');
  assert.equal(e.checkin(1, null, 'Nicolas Kuhnast').person.id, nico.id, 'o número é de outra pessoa: vale o nome');
  assert.throws(() => e.checkin(1, null, 'Ninguém Com Esse Nome'), /não encontrada/);
  assert.equal(typeof e.epoch, 'string'); assert.ok(e.epoch.length >= 8); assert.equal(e.publicState().epoch, e.epoch); assert.equal(new Engine().epoch, e.epoch, 'a época é do banco: não muda enquanto o banco for o mesmo');

  // perguntas das Conexões: português e espanhol
  let qs = e.listQuestions(); assert.equal(qs.length, 30); assert.ok(qs.every(q => q.es && /[¿?]/.test(q.es)), 'todas as perguntas do banco padrão têm a versão em espanhol');
  e.updateQuestion(qs[0].id, { es: '¿Otra versión?' }); assert.equal(e.listQuestions()[0].es, '¿Otra versión?');
  e.addQuestion({ text: 'Pergunta nova?', cat: 'conexao', es: '¿Pregunta nueva?' }); assert.equal(e.listQuestions().find(q => q.text === 'Pergunta nova?').es, '¿Pregunta nueva?');
  e.replaceQuestions([{ text: qs[1].text, cat: 'quebragelo' }, { text: 'Só em português?', cat: 'alem' }, { text: qs[2].text, cat: 'quebragelo', es: '' }]);
  qs = e.listQuestions(); assert.equal(qs[0].es.length > 10, true, 'texto que não mudou mantém a tradução'); assert.equal(qs[1].es, ''); assert.equal(qs[2].es, '', 'tradução apagada de propósito fica apagada');
  e.resetQuestions(); assert.ok(e.listQuestions().every(q => q.es));
  for (const p of e.listPeople().slice(0, 8)) e.checkin(p.id);
  e.startJourney(); const g = e.meState(e.listPeople().find(p => p.checkedInAt).id).group; assert.ok(g.queue.length); assert.ok(g.queue.every(q => q.text && q.es), 'a fila da dupla leva a pergunta nos dois idiomas');
  e.resetConnections();

  // Reflexão: os textos originais ganham a versão em espanhol; o que for editado aparece como foi escrito
  const rf = createReflexao(); let ps = rf.publicState();
  assert.equal(ps.titleEs, 'Acto 1 · El Combustible del Futuro'); assert.equal(ps.themes[0].tEs, 'El Condensador de Flujo'); assert.match(ps.themes[5].qEs, /^¿Quién ayudó/);
  rf.setConfig({ themes: [{ t: 'Tema novo', q: 'Pergunta nova?' }, ...ps.themes.slice(1).map(x => ({ t: x.t, q: x.q }))] }); ps = rf.publicState();
  assert.equal(ps.themes[0].tEs, ''); assert.equal(ps.themes[1].tEs, 'Cambiamos la Línea del Tiempo'); rf.resetConfig();
  assert.equal(rf.catalog().projects.find(x => /não identificado/.test(x.owner)).ownerEs, 'Responsable no identificado en la planilla');

  // avisos: as dinâmicas levam a versão em espanhol; os das cenas são marcados como conteúdo do townhall
  const notes = []; e.onChange(n => { if (n) notes.push(n); });
  e.applyStep(id('connections')); assert.equal(notes.at(-1).title, 'Conexões'); assert.equal(notes.at(-1).es.title, 'Conexiones'); assert.match(notes.at(-1).body, /📱/);
  e.applyStep(id('reflexao')); assert.equal(notes.at(-1).es.title, 'Reflexión');
  e.applyStep(id('agenda')); assert.deepEqual(notes.at(-1), { title: 'Flight plan', body: 'Look at the big screen.', secret: true });
  e.applyStep(id('closing')); assert.equal(notes.at(-1).title, 'End of the journey'); assert.equal(notes.at(-1).secret, true);

  // roteiro e textos guardados antes destas mudanças: o vídeo de abertura entra depois do check-in, a agenda vai para depois
  // das boas-vindas e os textos padrão antigos (português) passam para o inglês; o que foi escrito à mão fica
  const s = kvGet('settings'); delete s.roteiroV20; delete s.enV1;
  s.steps = [{ id: 'a1', type: 'checkin' }, { id: 'a2', type: 'cena', cena: 'agenda' }, { id: 'a3', type: 'cena', cena: 'boasvindas', transition: false }, { id: 'a4', type: 'connections' }, { id: 'a5', type: 'closing', transition: false }];
  s.welcomeText = 'Aguarde: a viagem começa em breve.'; s.closingText = 'Obrigado, pessoal!'; kvSet('settings', s);
  const st = kvGet('state'); st.step = 'a4'; kvSet('state', st);
  const e2 = new Engine();
  assert.deepEqual(e2.settings.steps.map(kind), ['checkin', 'abertura', 'boasvindas', 'agenda', 'connections', 'closing']); assert.equal(e2.settings.steps[1].transition, false);
  assert.equal(e2.state.step, 'a4', 'o passo que estava no ar continua no ar'); assert.match(e2.settings.welcomeText, /^Hang tight/); assert.equal(e2.settings.closingText, 'Obrigado, pessoal!');
  assert.deepEqual(new Engine().settings.steps.map(kind), ['checkin', 'abertura', 'boasvindas', 'agenda', 'connections', 'closing'], 'a mudança vale uma vez só');
  console.log('OK · motor: roteiro novo, duas palavras, check-in refeito pelo nome, espanhol nas dinâmicas e avisos');
}

/* ---------------- 2) pelo servidor ---------------- */
const PORT = 4300 + Math.floor(Math.random() * 90), B = `http://localhost:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'th-acesso-'));
const boot = (port, extra) => { const env = { ...process.env, PORT: String(port), DATA_DIR: fs.mkdtempSync(path.join(DATA_DIR, 's')), ADMIN_PASSWORD: 'mestra', FOTOS_PACK: path.join(DATA_DIR, 'sem-pacote'), ...extra }; delete env.DB_PATH; return spawn(process.execPath, ['--no-warnings', path.join(__dirname, '..', 'server', 'index.js')], { env, stdio: ['ignore', 'pipe', 'inherit'] }); };
const srv = boot(PORT, { DINAMICAS_PASSWORD: 'dinamicas' });
const call = async (method, url, body, { key, cookie, base = B } = {}) => {
  const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(key ? { 'x-admin-key': key } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, json, text, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
};
const waitUp = async (base = B) => { for (let i = 0; i < 60; i++) { try { await fetch(base + '/health'); return; } catch { await new Promise(r => setTimeout(r, 100)); } } throw new Error('servidor não subiu'); };
const wait = ms => new Promise(r => setTimeout(r, ms));
// cliente mínimo do Socket.IO (protocolo 4) em cima do "ws": o suficiente para ouvir eventos e mandar com resposta
function sock({ cookie } = {}) {
  const ws = new WebSocket(`ws://localhost:${PORT}/socket.io/?EIO=4&transport=websocket`, { headers: cookie ? { Cookie: cookie } : {} });
  const events = [], acks = new Map(); let n = 0, ready; const opened = new Promise(r => { ready = r; });
  ws.on('message', buf => {
    const m = String(buf);
    if (m === '2') return ws.send('3');
    if (m[0] === '0') return ws.send('40');
    if (m.startsWith('40')) return ready();
    if (m.startsWith('43')) { const k = m.match(/^43(\d+)/)[1], fn = acks.get(+k); if (fn) fn(JSON.parse(m.slice(2 + k.length))[0]); return; }
    if (m.startsWith('42')) { const [ev, data] = JSON.parse(m.slice(2)); events.push({ ev, data }); }
  });
  return { opened, events, emit: (ev, data) => new Promise(res => { const k = n++; acks.set(k, res); ws.send(`42${k}${JSON.stringify([ev, data])}`); }), send: (ev, data) => ws.send(`42${JSON.stringify([ev, data])}`),
    last: ev => [...events].reverse().find(x => x.ev === ev), clear: () => { events.length = 0; }, close: () => ws.close() };
}

(async () => {
  let srv2 = null; const socks = [];
  try {
    await waitUp();
    const M = { key: 'mestra' }, T = { key: 'dinamicas' };
    /* ----- as duas senhas ----- */
    let r = await call('POST', '/api/admin/login', { password: 'mestra' }); assert.deepEqual(r.json, { ok: true, role: 'master' }); const cookieM = r.cookie; assert.match(cookieM, /^bttf_admin=/);
    r = await call('POST', '/api/admin/login', { password: 'dinamicas' }); assert.deepEqual(r.json, { ok: true, role: 'team' }); const cookieT = r.cookie; assert.notEqual(cookieT, cookieM);
    r = await call('POST', '/api/admin/login', { password: 'errada' }); assert.deepEqual(r.json, { ok: false, role: null }); assert.equal(r.cookie, '');
    assert.equal((await call('GET', '/api/admin/overview')).status, 401); assert.equal((await call('GET', '/api/admin/overview', undefined, { key: 'errada' })).status, 401);
    assert.match((await call('GET', '/dinamicas')).text, /id="loginForm"/, 'o painel das dinâmicas tem o seu endereço');
    const ovM = (await call('GET', '/api/admin/overview', undefined, M)).json, steps = ovM.settings.steps, id = k => steps.find(s => (s.type === 'cena' ? s.cena : s.activity || s.type) === k).id;
    assert.equal(ovM.role, 'master'); assert.equal(ovM.team, true); assert.ok(ovM.cenas); assert.equal(steps.length, 17);

    /* ----- senha das dinâmicas: só Conexões, Reflexão e Sucesso ----- */
    let ovT = (await call('GET', '/api/admin/overview', undefined, T)).json;
    assert.equal(ovT.role, 'team'); assert.equal(ovT.cenas, null); assert.deepEqual(ovT.words, []); assert.equal(ovT.hidden, false);
    assert.deepEqual(ovT.settings.steps.map(x => x.activity || x.type), ['checkin', 'connections', 'reflexao', 'd1', 'd2', 'd3', 'd4', 'doc']);
    assert.ok(!('confidencial' in ovT.settings) && !('agenda' in ovT.settings) && !('welcomeText' in ovT.settings), 'só os ajustes das dinâmicas');
    assert.ok(!/Monserrat|Clock Tower|Flight plan|almanac|EXECUTIVE PRODUCERS/i.test(JSON.stringify({ ...ovT, people: null })), 'nada do conteúdo do townhall vai para o painel das dinâmicas');
    for (const [url, body] of [['/api/admin/step', { id: id('agenda') }], ['/api/admin/step', { id: id('closing') }], ['/api/admin/cena', { action: 'config', config: { evento: { titulo: 'x' } } }], ['/api/admin/cena', { kind: 'mph', action: 'go' }],
      ['/api/admin/reset', { scope: 'all' }], ['/api/admin/reset', { scope: 'checkin' }], ['/api/admin/reset', { scope: 'roteiro' }], ['/api/admin/reset', { scope: 'cenas' }], ['/api/admin/reset', { scope: 'words' }], ['/api/admin/words', { action: 'clear' }],
      ['/api/admin/action', { type: 'resetEvent' }], ['/api/admin/action', { type: 'setBlock', block: 'standby' }], ['/api/admin/action', { type: 'setMessage', message: { title: 'x' }, show: true }], ['/api/admin/action', { type: 'setScene', scene: 'logo' }]]) {
      r = await call('POST', url, body, T); assert.equal(r.status, 403, `${url} ${JSON.stringify(body)}`); assert.match(r.json.error, /senha mestra/);
    }
    // os ajustes que não são das dinâmicas são ignorados (o roteiro e o modo confidencial não mudam)
    r = await call('POST', '/api/admin/action', { type: 'settings', settings: { confidencial: false, steps: [{ type: 'checkin' }], eventName: 'Hackeado', roundSeconds: 95, skip: { reflexao: [3] } } }, T); assert.equal(r.status, 200);
    let s2 = (await call('GET', '/api/admin/overview', undefined, M)).json.settings;
    assert.equal(s2.confidencial, true); assert.equal(s2.steps.length, 17); assert.notEqual(s2.eventName, 'Hackeado'); assert.equal(s2.roundSeconds, 95); assert.deepEqual(s2.skip.reflexao, [3]);
    // o que é das dinâmicas funciona: pôr no ar, conduzir, reiniciar, extrair os dados, pessoas e perguntas
    r = await call('POST', '/api/admin/action', { type: 'testCheckinAll' }, T); assert.equal(r.status, 200);
    r = await call('POST', '/api/admin/step', { id: id('connections') }, T); assert.equal(r.status, 200);
    r = await call('POST', '/api/admin/action', { type: 'startJourney' }, T); assert.equal(r.status, 200);
    r = await call('POST', '/api/admin/reset', { scope: 'connections' }, T); assert.equal(r.status, 200);
    r = await call('POST', '/api/admin/step', { id: id('reflexao') }, T); assert.equal(r.status, 200);
    r = await call('POST', '/api/admin/reflexao', { action: 'open', idx: 0 }, T); assert.equal(r.status, 200);
    r = await call('POST', '/api/admin/reset', { scope: 'reflexao' }, T); assert.equal(r.status, 200);
    r = await call('POST', '/api/admin/step', { id: id('d1') }, T); assert.equal(r.status, 200); r = await call('POST', '/api/admin/reset', { scope: 'sucesso:d1' }, T); assert.equal(r.status, 200);
    r = await call('GET', '/api/admin/export', undefined, T); assert.equal(r.status, 200); assert.ok(r.json.conexoes && r.json.reflexao && r.json.sucesso);
    r = await call('POST', '/api/admin/questions', { text: 'Pergunta da equipe?', cat: 'alem', es: '¿Pregunta del equipo?' }, T); assert.equal(r.status, 200);
    assert.equal((await call('GET', '/api/admin/overview', undefined, T)).json.questions.at(-1).es, '¿Pregunta del equipo?');
    r = await call('POST', '/api/admin/reset', { scope: 'checkin' }, M); assert.equal(r.status, 200); r = await call('POST', '/api/admin/step', { id: id('checkin') }, M);

    /* ----- duas palavras pelo app ----- */
    r = await call('POST', '/api/checkin', { personId: 1 }); const tok = r.json.token, epoch = r.json.epoch; assert.ok(tok); assert.ok(epoch);
    r = await call('POST', '/api/words', { token: 'não-existe', words: ['a'] }); assert.equal(r.status, 401);
    r = await call('POST', '/api/words', { token: tok, words: [] }); assert.equal(r.status, 400);
    r = await call('POST', '/api/words', { token: tok, words: ['Curioso', 'animado'] }); assert.equal(r.status, 200); assert.deepEqual(r.json.me.words, ['Curioso', 'animado']);
    r = await call('POST', '/api/checkin', { personId: 2 }); await call('POST', '/api/words', { token: r.json.token, words: ['ANIMADO'] });
    let st = (await call('GET', '/api/state')).json; assert.deepEqual(st.words, { open: true, live: true, count: 2, top: [['animado', 2], ['Curioso', 1]] }); assert.ok(st.build); assert.equal(st.epoch, epoch);
    // quem entra de novo (outro celular) não responde de novo: a resposta é da pessoa
    r = await call('POST', '/api/checkin', { personId: 1 }); const tok2 = r.json.token; assert.notEqual(tok2, tok);
    r = await call('GET', `/api/me?token=${tok2}`); assert.equal(r.json.ok, true); assert.deepEqual(r.json.me.words, ['Curioso', 'animado']); assert.equal(r.json.epoch, epoch);
    r = await call('GET', `/api/me?token=${tok}`); assert.equal(r.json.ok, false); assert.equal(r.json.epoch, epoch, 'a época é a mesma: foi outro aparelho que assumiu o nome, não o servidor que esqueceu'); assert.ok(r.json.state);
    // check-in refeito pelo celular (com o nome guardado)
    r = await call('POST', '/api/checkin', { personId: 77777, name: 'Felipe Resck' }); assert.equal(r.json.person.name, 'Felipe Resck');
    // o Doc modera: tirar uma resposta, desligar a nuvem ao vivo
    const ovW = (await call('GET', '/api/admin/overview', undefined, M)).json; assert.deepEqual(ovW.words.map(x => x.words.join('+')), ['Curioso+animado', 'ANIMADO']);
    r = await call('POST', '/api/admin/words', { action: 'remove', id: 2 }, M); assert.equal(r.status, 200); assert.equal((await call('GET', '/api/state')).json.words.count, 1);
    r = await call('POST', '/api/admin/action', { type: 'settings', settings: { wordsLive: false } }, M); assert.equal((await call('GET', '/api/state')).json.words.live, false);

    /* ----- modo confidencial: quem recebe o quê (HTTP e WebSocket) ----- */
    const anon = sock(), team = sock({ cookie: cookieT }), master = sock({ cookie: cookieM }); socks.push(anon, team, master);
    await Promise.all([anon.opened, team.opened, master.opened]);
    const phone = sock(); socks.push(phone); await phone.opened; const hello = await phone.emit('hello', { token: tok2 }); assert.equal(hello.ok, true); assert.equal(hello.epoch, epoch); assert.deepEqual(hello.me.words, ['Curioso', 'animado']); assert.equal(hello.master, false);
    assert.equal((await master.emit('hello', {})).master, true); assert.equal((await team.emit('hello', {})).master, false);
    for (const x of [anon, team, master, phone]) x.clear();
    r = await call('POST', '/api/admin/step', { id: id('boasvindas') }, M); assert.equal(r.status, 200); await wait(250);
    assert.equal(master.last('state').data.cena.kind, 'boasvindas', 'o telão do Doc (cookie da senha mestra) recebe a cena'); assert.equal(master.last('notify').data.title, 'Welcome');
    for (const [name, x] of [['anônimo', anon], ['dinâmicas', team], ['celular', phone]]) {
      const d = x.last('state').data; assert.equal(d.block, 'standby', name); assert.equal(d.cena, null, name); assert.equal(d.step.cena, null, name);
      assert.ok(!JSON.stringify(x.events).includes('Monserrat'), `${name}: nada da cena`); assert.equal(x.last('notify'), undefined, `${name}: nem o aviso da cena`);
    }
    for (const opt of [{}, { cookie: cookieT }, T]) { st = (await call('GET', '/api/state', undefined, opt)).json; assert.equal(st.block, 'standby'); assert.equal(st.cena, null); }
    for (const opt of [{ cookie: cookieM }, M]) assert.equal((await call('GET', '/api/state', undefined, opt)).json.cena.kind, 'boasvindas');
    assert.equal((await call('GET', `/api/me?token=${tok2}`)).json.state.cena, null);
    assert.equal((await call('GET', '/estrategia-2027.html', undefined, T)).status, 403); assert.equal((await call('GET', '/estrategia-2027.html', undefined, { cookie: cookieM })).status, 200);
    assert.equal((await call('GET', '/api/sucesso/screen', undefined, { cookie: cookieT })).json.master, false); assert.equal((await call('GET', '/api/sucesso/screen', undefined, { cookie: cookieM })).json.master, true);
    // o painel das dinâmicas só fica sabendo que "há outro bloco no ar"
    ovT = (await call('GET', '/api/admin/overview', undefined, T)).json; assert.equal(ovT.hidden, true); assert.equal(ovT.state.step, null); assert.equal(ovT.state.block, 'hidden');
    // a nuvem das boas-vindas é um comando do Doc
    r = await call('POST', '/api/admin/cena', { kind: 'boasvindas', action: 'nuvem', on: true }, M); assert.equal(r.status, 200); assert.equal((await call('GET', '/api/state', undefined, M)).json.cena.live.nuvem, true);
    // vídeo de abertura: só o telão do Doc avisa que o vídeo terminou
    r = await call('POST', '/api/admin/step', { id: id('abertura') }, M); await wait(150);
    anon.send('cena:fim', { kind: 'abertura' }); team.send('cena:fim', { kind: 'abertura' }); await wait(200); assert.equal((await call('GET', '/api/state', undefined, M)).json.cena.live.fim, false);
    master.send('cena:fim', { kind: 'abertura' }); await wait(200); assert.deepEqual((({ play, fim }) => [play, fim])((await call('GET', '/api/state', undefined, M)).json.cena.live), [false, true]);
    r = await call('POST', '/api/admin/cena', { kind: 'abertura', action: 'reiniciar' }, M); assert.equal((await call('GET', '/api/state', undefined, M)).json.cena.live.play, true);
    // as dinâmicas não são confidenciais: todo mundo recebe, com o aviso também em espanhol
    for (const x of [anon, phone]) x.clear();
    r = await call('POST', '/api/admin/step', { id: id('reflexao') }, M); await wait(250);
    assert.equal(anon.last('state').data.block, 'reflexao'); assert.ok(anon.last('state').data.reflexao.themes[0].tEs); assert.equal(phone.last('notify').data.es.title, 'Reflexión');
    // o Doc libera (dia do evento): as cenas passam a ir para todos
    r = await call('POST', '/api/admin/action', { type: 'settings', settings: { confidencial: false } }, M); for (const x of [anon, team, phone]) x.clear();
    r = await call('POST', '/api/admin/step', { id: id('agenda') }, M); await wait(250);
    for (const x of [anon, team, phone]) { assert.equal(x.last('state').data.cena.kind, 'agenda'); assert.equal(x.last('notify').data.title, 'Flight plan'); assert.equal(x.last('notify').data.secret, undefined); }
    assert.equal((await call('GET', '/estrategia-2027.html')).status, 200);
    // um socket que entra no painel com a senha das dinâmicas não vira "master" (mesmo vindo de um navegador com o cookie mestre)
    r = await master.emit('admin:hello', { key: 'dinamicas' }); assert.equal(r.role, 'team'); assert.equal(r.overview.cenas, null);
    r = await call('POST', '/api/admin/action', { type: 'settings', settings: { confidencial: true } }, M); master.clear();
    r = await call('POST', '/api/admin/step', { id: id('mph') }, M); await wait(250); assert.equal(master.last('state').data.cena, null);
    r = await master.emit('admin:hello', { key: 'mestra' }); assert.equal(r.role, 'master'); assert.ok(r.overview.cenas); assert.equal((await master.emit('hello', {})).state.cena.kind, 'mph');
    assert.equal((await anon.emit('admin:hello', { key: 'errada' })).ok, false);

    /* ----- sem a senha das dinâmicas definida (ou igual à mestra), só a mestra entra ----- */
    const P2 = PORT + 100, B2 = `http://localhost:${P2}`; srv2 = boot(P2, { DINAMICAS_PASSWORD: 'mestra' }); await waitUp(B2);
    assert.deepEqual((await call('POST', '/api/admin/login', { password: 'mestra' }, { base: B2 })).json, { ok: true, role: 'master' });
    assert.deepEqual((await call('POST', '/api/admin/login', { password: 'dinamicas' }, { base: B2 })).json, { ok: false, role: null });
    assert.equal((await call('GET', '/api/admin/overview', undefined, { key: 'mestra', base: B2 })).json.team, false);
    console.log('OK · servidor: senha mestra e senha das dinâmicas, modo confidencial (HTTP e WebSocket), duas palavras e vídeo de abertura');
  } catch (e) {
    console.error('FALHOU:', e); process.exitCode = 1;
  } finally {
    for (const x of socks) x.close();
    srv.kill(); if (srv2) srv2.kill(); await wait(200); fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }
})();
