// Acesso e abertura do evento:
//  · dois níveis de acesso ao painel (senha mestra e senha das dinâmicas) e o modo confidencial;
//  · a nuvem de palavras (duas perguntas, texto livre, logo depois das boas-vindas) e o feedback do encerramento;
//  · o login que não se perde (o celular refaz o check-in sozinho se o servidor esquecer todo mundo);
//  · perguntas das Conexões e paradas da Reflexão também em espanhol; o roteiro novo (vídeo de abertura, nuvem, Estratégia 2026, capas);
//  · o alerta de volta do intervalo, que chega a todos.
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
  // roteiro padrão: check-in → vídeo de abertura → boas-vindas → nuvem de palavras → plano de voo → Conexões → Estratégia 2026 → Jornada 2026 → …
  assert.deepEqual(e.settings.steps.map(kind), ['checkin', 'abertura', 'boasvindas', 'nuvem', 'agenda', 'connections', 'capajornada', 'plano26', 'almanaque', 'reflexao', 'reconhecimento', 'intervalo', 'visao', 'capasucesso', 'd1', 'd2', 'd3', 'd4', 'doc', 'mph', 'closing']);
  assert.equal(e.settings.steps[1].transition, false, 'o vídeo de abertura entra direto'); assert.equal(e.settings.steps[3].transition, false, 'a nuvem de palavras também'); assert.equal(e.settings.steps[4].transition, undefined, 'o plano de voo entra com a transição');
  assert.equal(e.settings.confidencial, true, 'o modo confidencial vem ligado'); assert.match(e.settings.welcomeText, /^Hang tight/, 'os textos padrão do app são em inglês');
  assert.equal(e.settings.transitionSeconds, 8, 'a transição entre blocos ficou mais rápida'); assert.equal(e.publicState().settings.transitionSeconds, 8);
  const id = k => e.settings.steps.find(x => kind(x) === k).id;

  // nuvem de palavras: duas perguntas, texto livre, respondidas logo depois do login; uma resposta por pessoa; as nuvens não levam nomes
  const t1 = e.checkin(1).token; e.checkin(2); e.checkin(3);
  assert.equal(e.wordsOf(1), null); assert.equal(e.meState(1).words, null);
  let w0 = e.publicState().words; assert.equal(w0.open, true, 'desde o check-in o celular pede as duas respostas'); assert.equal(w0.live, false, 'mas as palavras só vão para todos no passo da nuvem'); assert.deepEqual(w0.clouds, [[], []]);
  assert.throws(() => e.setWords(1, ['Animado', '   ']), /both questions/); assert.throws(() => e.setWords(1, 'Animado'), /both questions/);
  assert.deepEqual(e.setWords(1, ['  Muito   animado ', '<b>Entregas</b>', 'terceira']), ['Muito animado', 'b Entregas /b'], 'duas respostas, sem símbolos soltos');
  assert.deepEqual(e.setWords(1, ['Animado', 'x'.repeat(120)]), ['Animado', 'x'.repeat(80)], 'responder de novo troca; cada resposta tem até 80 letras');
  e.setWords(1, ['Animado', 'Transformação']); e.setWords(2, ['animado', 'Foi um ano de muito aprendizado e entregas para o time']); e.setWords(3, ['ANIMADO!', 'transformação']);
  e.applyStep(id('nuvem'));
  let w = e.publicState().words;
  assert.equal(w.open, true); assert.equal(w.live, true, 'com o passo da nuvem no ar, as palavras de todo mundo aparecem'); assert.equal(w.count, 3);
  assert.deepEqual(w.clouds[0], [['Animado', 3]], 'maiúsculas, minúsculas e pontuação contam juntas'); assert.deepEqual(w.clouds[1][0], ['Transformação', 2]);
  const terms = w.clouds[1].map(x => x[0]); assert.deepEqual(terms.slice(1), ['ano', 'aprendizado', 'entregas', 'time'], 'uma frase vira palavras, sem os conectivos');
  assert.ok(!JSON.stringify(w).includes('Claudia'), 'as nuvens não levam nomes');
  assert.deepEqual(e.meState(1).words, ['Animado', 'Transformação']); assert.equal(e.wordsList().length, 3); assert.equal(e.adminOverview().words[0].name, e.personById(1).name); assert.equal(e.adminOverview().wordsCloud.count, 3);
  e.removeWords(1); assert.equal(e.wordsOf(1), null); assert.equal(e.publicState().words.count, 2);
  // as respostas são aceitas do check-in até o passo da nuvem; as nuvens só aparecem nesse passo; depois dele, fecha
  for (const k of ['checkin', 'abertura', 'boasvindas']) { e.applyStep(id(k)); const x = e.publicState().words; assert.equal(x.open, true, k); assert.equal(x.live, false, k); assert.deepEqual(x.clouds, [[], []], k); assert.equal(x.count, 2); }
  for (const k of ['agenda', 'connections', 'almanaque', 'closing']) { e.applyStep(id(k)); const x = e.publicState().words; assert.equal(x.open, false, k); assert.equal(x.live, false, k); assert.deepEqual(x.clouds, [[], []]); assert.equal(x.count, 2); }
  // sem o passo da nuvem no roteiro, as perguntas não aparecem
  const full = e.settings.steps.map(x => ({ ...x })); e.updateSettings({ steps: full.filter(x => x.cena !== 'nuvem') }); e.applyStep(e.settings.steps[0].id); assert.equal(e.publicState().words.open, false);
  e.updateSettings({ steps: full }); assert.ok(e.settings.steps.some(x => x.cena === 'nuvem')); e.applyStep(id('checkin')); assert.equal(e.publicState().words.open, true);
  // idioma do app no celular: o que cada pessoa escolhe (padrão) ou sempre em inglês
  assert.equal(e.publicState().settings.appLang, 'pessoa'); e.updateSettings({ appLang: 'en' }); assert.equal(e.publicState().settings.appLang, 'en'); e.updateSettings({ appLang: 'xx' }); assert.equal(e.publicState().settings.appLang, 'pessoa');

  // feedback do encerramento: nota de 1 a 5 e dois textos opcionais; uma resposta por pessoa; "sem o meu nome" não mostra o nome
  assert.equal(e.publicState().feedback.open, false); assert.equal(e.meState(2).feedback, null);
  assert.throws(() => e.setFeedback(2, { rating: 0 }), /1 to 5/); assert.throws(() => e.setFeedback(2, { rating: 9 }), /1 to 5/);
  e.setFeedback(2, { rating: 5, liked: '  Conexões  ', improve: '' }); e.setFeedback(3, { rating: 3, liked: '', improve: 'Mais tempo', anonymous: true }); /* a opção "sem o meu nome" não existe mais: é ignorada */ e.setFeedback(2, { rating: 4, liked: 'Conexões', improve: 'x'.repeat(900) });
  assert.deepEqual(e.meState(2).feedback, { rating: 4, liked: 'Conexões', improve: 'x'.repeat(600) }, 'enviar de novo troca');
  assert.deepEqual(e.feedbackStats(), { count: 2, avg: 3.5, dist: [0, 0, 1, 1, 0] });
  const fl = e.feedbackList(); assert.equal(fl.length, 2); assert.deepEqual(fl.map(f => f.name).sort(), [e.personById(2).name, e.personById(3).name].sort(), 'o feedback vai sempre com o nome'); assert.ok(fl.every(f => !('anonymous' in f)));
  e.applyStep(id('closing')); assert.deepEqual(e.publicState().feedback, { open: true, count: 2 }); assert.equal(e.adminOverview().feedback.stats.count, 2);
  // reiniciar tudo apaga as respostas da nuvem e o feedback (mesmo mantendo os check-ins); reiniciar o check-in também
  e.resetEvent({ keepCheckins: true }); assert.equal(e.publicState().words.count, 0); assert.equal(e.feedbackStats().count, 0); assert.ok(e.personByToken(t1), 'os check-ins ficaram');
  e.setWords(1, ['a', 'b']); e.setFeedback(1, { rating: 5 });
  e.resetCheckins(); assert.equal(e.publicState().words.count, 0); assert.equal(e.feedbackStats().count, 0); assert.equal(e.personByToken(t1), null);

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
  // os avisos das telas do townhall são em inglês, com a versão em português e em espanhol (o celular mostra no idioma da pessoa)
  e.applyStep(id('agenda')); assert.deepEqual(notes.at(-1), { title: 'Flight plan', body: 'Look at the big screen.', pt: { title: 'Flight plan', body: 'Olhe para o telão.' }, es: { title: 'Flight plan', body: 'Mira la pantalla.' }, secret: true });
  e.applyStep(id('visao')); assert.equal(notes.at(-1).secret, true); e.applyStep(id('plano26')); assert.equal(notes.at(-1).title, '2026 Strategy'); assert.equal(notes.at(-1).secret, true);
  // nuvem de palavras, intervalo, capa do Sucesso e encerramento não são confidenciais: o aviso vai para todos
  e.applyStep(id('nuvem')); assert.equal(notes.at(-1).title, 'Word cloud'); assert.equal(notes.at(-1).pt.title, 'Nuvem de palavras'); assert.match(notes.at(-1).es.body, /pantalla/); assert.equal(notes.at(-1).secret, undefined);
  e.applyStep(id('intervalo')); assert.equal(notes.at(-1).title, 'Break'); assert.equal(notes.at(-1).secret, false);
  e.applyStep(id('capasucesso')); assert.equal(notes.at(-1).title, 'De Volta para o Sucesso'); assert.equal(notes.at(-1).es.title, 'De Vuelta al Éxito'); assert.equal(notes.at(-1).secret, undefined);
  e.applyStep(id('closing')); assert.equal(notes.at(-1).title, 'End of the journey'); assert.match(notes.at(-1).body, /📱/); assert.equal(notes.at(-1).pt.title, 'Fim da viagem'); assert.equal(notes.at(-1).secret, undefined);

  // roteiro e textos guardados antes destas mudanças: o vídeo de abertura entra depois do check-in, a agenda vai para depois das
  // boas-vindas, entram a nuvem de palavras (depois das boas-vindas), a Estratégia 2026 (antes da Jornada 2026, que passa a entrar
  // direto), a capa da Jornada 2026 (antes da Estratégia 2026) e a capa do Sucesso (antes da primeira dinâmica); a Visão 2027 ganha a transição; a transição de 15 s passa para 8 s;
  // e os textos padrão antigos (português) passam para o inglês. O que foi escrito à mão fica.
  const s = kvGet('settings'); delete s.roteiroV20; delete s.roteiroV21; delete s.roteiroV22; delete s.fastV1; delete s.enV1; s.transitionSeconds = 15;
  s.steps = [{ id: 'a1', type: 'checkin' }, { id: 'a2', type: 'cena', cena: 'agenda' }, { id: 'a3', type: 'cena', cena: 'boasvindas', transition: false }, { id: 'a4', type: 'connections' }, { id: 'a6', type: 'cena', cena: 'almanaque' },
    { id: 'a7', type: 'cena', cena: 'visao', transition: false }, { id: 'a8', type: 'sucesso', activity: 'd1', transition: false }, { id: 'a5', type: 'closing', transition: false }];
  s.welcomeText = 'Aguarde: a viagem começa em breve.'; s.closingText = 'Obrigado, pessoal!'; kvSet('settings', s);
  const st = kvGet('state'); st.step = 'a4'; kvSet('state', st);
  const e2 = new Engine(), migrated = ['checkin', 'abertura', 'boasvindas', 'nuvem', 'agenda', 'connections', 'capajornada', 'plano26', 'almanaque', 'visao', 'capasucesso', 'd1', 'closing'];
  assert.deepEqual(e2.settings.steps.map(kind), migrated);
  assert.deepEqual(e2.settings.steps.map(x => x.transition !== false), [true, false, false, false, true, true, true, false, false, true, true, false, false], 'quem entra com a transição do filme (a capa da Jornada 2026 sim; a Estratégia 2026 e o almanaque entram direto)');
  assert.equal(e2.settings.transitionSeconds, 8);
  assert.equal(e2.state.step, 'a4', 'o passo que estava no ar continua no ar'); assert.match(e2.settings.welcomeText, /^Hang tight/); assert.equal(e2.settings.closingText, 'Obrigado, pessoal!');
  e2.updateSettings({ transitionSeconds: 15 }); e2.save();
  const e3 = new Engine(); assert.deepEqual(e3.settings.steps.map(kind), migrated, 'a mudança vale uma vez só'); assert.equal(e3.settings.transitionSeconds, 15, 'quem escolher 15 s de novo fica com 15 s');
  console.log('OK · motor: roteiro novo, nuvem de palavras (duas perguntas), feedback, check-in refeito pelo nome, espanhol nas dinâmicas e avisos');
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
    assert.equal(ovM.role, 'master'); assert.equal(ovM.team, true); assert.ok(ovM.cenas); assert.equal(steps.length, 21);

    /* ----- senha das dinâmicas: só Conexões, Reflexão e Sucesso ----- */
    let ovT = (await call('GET', '/api/admin/overview', undefined, T)).json;
    assert.equal(ovT.role, 'team'); assert.deepEqual(ovT.words, []); assert.equal(ovT.wordsCloud, null); assert.equal(ovT.feedback, null); assert.equal(ovT.hidden, false);
    // das cenas, só a capa do bloco Sucesso (o nome dela e quem conduz)
    assert.equal(ovT.cenas.team, true); assert.deepEqual(ovT.cenas.kinds, ['capasucesso']); assert.deepEqual(Object.keys(ovT.cenas.config), ['capasucesso', 'anfitrioes']); assert.deepEqual(Object.keys(ovT.cenas.config.anfitrioes), ['sucesso']); assert.deepEqual(ovT.cenas.state, {});
    assert.deepEqual(ovT.settings.steps.map(x => x.cena || x.activity || x.type), ['checkin', 'connections', 'reflexao', 'capasucesso', 'd1', 'd2', 'd3', 'd4', 'doc']);
    assert.ok(!('confidencial' in ovT.settings) && !('agenda' in ovT.settings) && !('welcomeText' in ovT.settings), 'só os ajustes das dinâmicas');
    assert.ok(!/Monserrat|Clock Tower|Flight plan|almanac|EXECUTIVE PRODUCERS|Desire at Scale|Emergency alert|flight plan/i.test(JSON.stringify({ ...ovT, people: null })), 'nada do conteúdo do townhall vai para o painel das dinâmicas');
    for (const [url, body] of [['/api/admin/step', { id: id('agenda') }], ['/api/admin/step', { id: id('closing') }], ['/api/admin/step', { id: id('nuvem') }], ['/api/admin/step', { id: id('plano26') }], ['/api/admin/step', { id: id('capajornada') }], ['/api/admin/step', { id: id('intervalo') }],
      ['/api/admin/cena', { kind: 'intervalo', action: 'alerta' }], ['/api/admin/reset', { scope: 'feedback' }], ['/api/admin/cena', { action: 'config', config: { evento: { titulo: 'x' } } }], ['/api/admin/cena', { kind: 'mph', action: 'go' }],
      ['/api/admin/reset', { scope: 'all' }], ['/api/admin/reset', { scope: 'checkin' }], ['/api/admin/reset', { scope: 'roteiro' }], ['/api/admin/reset', { scope: 'cenas' }], ['/api/admin/reset', { scope: 'words' }], ['/api/admin/words', { action: 'clear' }],
      ['/api/admin/action', { type: 'resetEvent' }], ['/api/admin/action', { type: 'setBlock', block: 'standby' }], ['/api/admin/action', { type: 'setMessage', message: { title: 'x' }, show: true }], ['/api/admin/action', { type: 'setScene', scene: 'logo' }]]) {
      r = await call('POST', url, body, T); assert.equal(r.status, 403, `${url} ${JSON.stringify(body)}`); assert.match(r.json.error, /senha mestra/);
    }
    // os ajustes que não são das dinâmicas são ignorados (o roteiro e o modo confidencial não mudam)
    r = await call('POST', '/api/admin/action', { type: 'settings', settings: { confidencial: false, steps: [{ type: 'checkin' }], eventName: 'Hackeado', roundSeconds: 95, skip: { reflexao: [3] } } }, T); assert.equal(r.status, 200);
    let s2 = (await call('GET', '/api/admin/overview', undefined, M)).json.settings;
    assert.equal(s2.confidencial, true); assert.equal(s2.steps.length, 21); assert.notEqual(s2.eventName, 'Hackeado'); assert.equal(s2.roundSeconds, 95); assert.deepEqual(s2.skip.reflexao, [3]);
    // o que é das dinâmicas funciona: pôr no ar, conduzir, reiniciar, extrair os dados, pessoas e perguntas
    r = await call('POST', '/api/admin/action', { type: 'testCheckinAll' }, T); assert.equal(r.status, 200);
    r = await call('POST', '/api/admin/step', { id: id('connections') }, T); assert.equal(r.status, 200);
    r = await call('POST', '/api/admin/action', { type: 'startJourney' }, T); assert.equal(r.status, 200);
    r = await call('POST', '/api/admin/reset', { scope: 'connections' }, T); assert.equal(r.status, 200);
    r = await call('POST', '/api/admin/step', { id: id('reflexao') }, T); assert.equal(r.status, 200);
    r = await call('POST', '/api/admin/reflexao', { action: 'open', idx: 0 }, T); assert.equal(r.status, 200);
    r = await call('POST', '/api/admin/reset', { scope: 'reflexao' }, T); assert.equal(r.status, 200);
    // a capa do bloco Sucesso faz parte do Sucesso: a senha das dinâmicas coloca no ar e ela chega a todos, mesmo no modo confidencial
    r = await call('POST', '/api/admin/step', { id: id('capasucesso') }, T); assert.equal(r.status, 200);
    let cv = (await call('GET', '/api/state')).json; assert.equal(cv.cena.kind, 'capasucesso'); assert.equal(cv.cena.quem, 'Lucas Barbosa, Giovana Romão & Maria Eduarda'); assert.equal(cv.step.transition, true);
    ovT = (await call('GET', '/api/admin/overview', undefined, T)).json; assert.equal(ovT.hidden, false); assert.equal(ovT.state.step, id('capasucesso'));
    r = await call('POST', '/api/admin/step', { id: id('d1') }, T); assert.equal(r.status, 200); r = await call('POST', '/api/admin/reset', { scope: 'sucesso:d1' }, T); assert.equal(r.status, 200);
    r = await call('GET', '/api/admin/export', undefined, T); assert.equal(r.status, 200); assert.ok(r.json.conexoes && r.json.reflexao && r.json.sucesso); assert.equal(r.json.feedback, undefined, 'o feedback e a nuvem são só da senha mestra'); assert.equal(r.json.nuvem, undefined);
    r = await call('POST', '/api/admin/questions', { text: 'Pergunta da equipe?', cat: 'alem', es: '¿Pregunta del equipo?' }, T); assert.equal(r.status, 200);
    assert.equal((await call('GET', '/api/admin/overview', undefined, T)).json.questions.at(-1).es, '¿Pregunta del equipo?');
    r = await call('POST', '/api/admin/reset', { scope: 'checkin' }, M); assert.equal(r.status, 200); r = await call('POST', '/api/admin/step', { id: id('checkin') }, M);

    /* ----- nuvem de palavras pelo app: as duas perguntas logo depois do login; as nuvens só no passo da nuvem ----- */
    r = await call('POST', '/api/checkin', { personId: 1 }); const tok = r.json.token, epoch = r.json.epoch; assert.ok(tok); assert.ok(epoch);
    r = await call('POST', '/api/words', { token: 'não-existe', words: ['a', 'b'] }); assert.equal(r.status, 401);
    // logo depois do login (ainda no check-in) o celular já manda as duas respostas; as perguntas vêm nos três idiomas
    let st = (await call('GET', '/api/state')).json; assert.equal(st.block, 'welcome'); assert.equal(st.words.open, true); assert.equal(st.words.live, false);
    assert.deepEqual(Object.keys(st.words.q), ['en', 'pt', 'es']); assert.equal(st.words.q.en.length, 2); assert.match(st.words.q.pt[0], /Townhall/); assert.match(st.words.q.es[1], /2026/); assert.ok(st.words.tip.pt);
    r = await call('POST', '/api/words', { token: tok, words: ['Curioso'] }); assert.equal(r.status, 400, 'as duas respostas são obrigatórias');
    r = await call('POST', '/api/words', { token: tok, words: ['Curioso', 'Entregas'] }); assert.equal(r.status, 200); assert.deepEqual(r.json.me.words, ['Curioso', 'Entregas']);
    r = await call('POST', '/api/checkin', { personId: 3 }); const tokB = r.json.token; await call('POST', '/api/words', { token: tokB, words: ['CURIOSO', 'Foi um ano de muitas entregas'] });
    st = (await call('GET', '/api/state')).json; assert.equal(st.words.count, 2); assert.deepEqual(st.words.clouds, [[], []], 'antes do passo da nuvem, as palavras não vão para ninguém');
    // o passo da nuvem entra: o telão (e os celulares) já recebem tudo o que chegou; mesmo no modo confidencial, chega a todos
    r = await call('POST', '/api/admin/step', { id: id('nuvem') }, M); assert.equal(r.status, 200);
    st = (await call('GET', '/api/state')).json; assert.equal(st.block, 'cena'); assert.equal(st.cena.kind, 'nuvem'); assert.equal(st.cena.perguntas.length, 2); assert.equal(st.cena.perguntasPt.length, 2);
    assert.equal(st.words.open, true); assert.equal(st.words.live, true); assert.equal(st.words.count, 2); assert.deepEqual(st.words.clouds, [[['Curioso', 2]], [['Entregas', 2], ['ano', 1]]]); assert.ok(st.build); assert.equal(st.epoch, epoch);
    // quem ainda não respondeu responde na hora e a nuvem cresce
    r = await call('POST', '/api/checkin', { personId: 4 }); const tokC = r.json.token; r = await call('POST', '/api/words', { token: tokC, words: ['Feliz', 'Entregas'] }); assert.equal(r.status, 200);
    st = (await call('GET', '/api/state')).json; assert.equal(st.words.count, 3); assert.deepEqual(st.words.clouds[1][0], ['Entregas', 3]); assert.deepEqual(st.words.clouds[0], [['Curioso', 2], ['Feliz', 1]]);
    r = await call('POST', '/api/admin/words', { action: 'remove', id: 4 }, M); assert.equal(r.status, 200);
    // quem entra de novo (outro celular) não responde de novo: a resposta é da pessoa
    r = await call('POST', '/api/checkin', { personId: 1 }); const tok2 = r.json.token; assert.notEqual(tok2, tok);
    r = await call('GET', `/api/me?token=${tok2}`); assert.equal(r.json.ok, true); assert.deepEqual(r.json.me.words, ['Curioso', 'Entregas']); assert.equal(r.json.epoch, epoch);
    r = await call('GET', `/api/me?token=${tok}`); assert.equal(r.json.ok, false); assert.equal(r.json.epoch, epoch, 'a época é a mesma: foi outro aparelho que assumiu o nome, não o servidor que esqueceu'); assert.ok(r.json.state);
    // check-in refeito pelo celular (com o nome guardado)
    r = await call('POST', '/api/checkin', { personId: 77777, name: 'Felipe Resck' }); assert.equal(r.json.person.name, 'Felipe Resck');
    // o Doc vê as respostas, destaca uma pergunta e modera
    const ovW = (await call('GET', '/api/admin/overview', undefined, M)).json; assert.deepEqual(ovW.words.map(x => x.words.join('+')), ['Curioso+Entregas', 'CURIOSO+Foi um ano de muitas entregas']); assert.equal(ovW.wordsCloud.clouds[0][0][1], 2);
    r = await call('POST', '/api/admin/cena', { kind: 'nuvem', action: 'foco', n: 2 }, M); assert.equal(r.status, 200); assert.equal((await call('GET', '/api/state')).json.cena.live.foco, 2);
    r = await call('POST', '/api/admin/words', { action: 'remove', id: 3 }, M); assert.equal(r.status, 200); assert.equal((await call('GET', '/api/state')).json.words.count, 1);
    // depois do passo da nuvem as perguntas fecham; só o celular que refez o check-in sozinho devolve as respostas que tinha guardado (se o servidor não as tem)
    r = await call('POST', '/api/admin/step', { id: id('agenda') }, M); st = (await call('GET', '/api/state')).json; assert.equal(st.words.open, false); assert.equal(st.words.live, false); assert.equal(st.words.count, 1); assert.deepEqual(st.words.clouds, [[], []]);
    r = await call('POST', '/api/words', { token: tok2, words: ['Outra', 'Coisa'] }); assert.equal(r.status, 409, 'depois do passo da nuvem, as perguntas estão fechadas');
    r = await call('POST', '/api/words', { token: tokB, words: ['Curioso', 'Entregas'], restore: true }); assert.equal(r.status, 200);
    r = await call('POST', '/api/words', { token: tokB, words: ['Outra', 'Coisa'], restore: true }); assert.equal(r.status, 409);
    // o conteúdo das três versões das perguntas é editável; o idioma do app é um ajuste só da senha mestra
    r = await call('POST', '/api/admin/cena', { action: 'config', config: { nuvem: { perguntasPt: ['Como você chega hoje?', 'Uma palavra para 2026?'] } } }, M); assert.equal(r.status, 200);
    st = (await call('GET', '/api/state')).json; assert.deepEqual(st.words.q.pt, ['Como você chega hoje?', 'Uma palavra para 2026?']); assert.equal(st.words.q.en.length, 2);
    r = await call('POST', '/api/admin/cena', { action: 'config', config: { nuvem: { perguntasEs: ['Solo una', ''] } } }, M); assert.equal(r.status, 400);
    r = await call('POST', '/api/admin/action', { type: 'settings', settings: { appLang: 'en' } }, T); assert.equal((await call('GET', '/api/state')).json.settings.appLang, 'pessoa', 'a senha das dinâmicas não muda o idioma do app');
    r = await call('POST', '/api/admin/action', { type: 'settings', settings: { appLang: 'en' } }, M); assert.equal((await call('GET', '/api/state')).json.settings.appLang, 'en');
    r = await call('POST', '/api/admin/action', { type: 'settings', settings: { appLang: 'pessoa' } }, M);
    // reiniciar a nuvem apaga as respostas e tira o destaque
    r = await call('POST', '/api/admin/reset', { scope: 'words' }, M); assert.equal(r.status, 200); const ovR = (await call('GET', '/api/admin/overview', undefined, M)).json; assert.deepEqual(ovR.words, []); assert.equal(ovR.cenas.state.nuvem.foco, 0);
    r = await call('POST', '/api/words', { token: tok2, words: ['Curioso', 'Entregas'], restore: true }); assert.equal(r.status, 200);

    /* ----- feedback do encerramento ----- */
    r = await call('POST', '/api/feedback', { token: tok2, rating: 5 }); assert.equal(r.status, 409, 'o formulário só abre no encerramento');
    r = await call('POST', '/api/admin/step', { id: id('closing') }, M); assert.equal(r.status, 200);
    st = (await call('GET', '/api/state')).json; assert.equal(st.block, 'closing', 'o encerramento não é escondido dos celulares'); assert.equal(st.creditos, null, 'mas os créditos continuam guardados'); assert.deepEqual(st.feedback, { open: true, count: 0 });
    assert.ok((await call('GET', '/api/state', undefined, M)).json.creditos.blocos.length > 0);
    r = await call('POST', '/api/feedback', { token: 'não-existe', rating: 5 }); assert.equal(r.status, 401);
    r = await call('POST', '/api/feedback', { token: tok2, rating: 0 }); assert.equal(r.status, 400);
    r = await call('POST', '/api/feedback', { token: tok2, rating: 5, liked: 'Conexões', improve: '', anonymous: true }); assert.equal(r.status, 200); assert.deepEqual(r.json.me.feedback, { rating: 5, liked: 'Conexões', improve: '' });
    assert.equal((await call('GET', '/api/state')).json.feedback.count, 1);
    const ovF = (await call('GET', '/api/admin/overview', undefined, M)).json.feedback; assert.equal(ovF.stats.count, 1); assert.ok(ovF.list[0].name, 'o feedback vai com o nome de quem respondeu'); assert.equal(ovF.list[0].liked, 'Conexões');
    r = await call('GET', '/api/admin/export', undefined, M); assert.equal(r.json.feedback.stats.avg, 5); assert.equal(r.json.nuvem.perguntas.length, 2); assert.equal(r.json.nuvem.respostas.length, 1);
    r = await call('POST', '/api/admin/reset', { scope: 'feedback' }, M); assert.equal(r.status, 200); assert.equal((await call('GET', '/api/state')).json.feedback.count, 0);
    r = await call('POST', '/api/admin/step', { id: id('checkin') }, M);

    /* ----- modo confidencial: quem recebe o quê (HTTP e WebSocket) ----- */
    const anon = sock(), team = sock({ cookie: cookieT }), master = sock({ cookie: cookieM }); socks.push(anon, team, master);
    await Promise.all([anon.opened, team.opened, master.opened]);
    const phone = sock(); socks.push(phone); await phone.opened; const hello = await phone.emit('hello', { token: tok2 }); assert.equal(hello.ok, true); assert.equal(hello.epoch, epoch); assert.deepEqual(hello.me.words, ['Curioso', 'Entregas']); assert.equal(hello.me.feedback, null); assert.equal(hello.master, false);
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
    // intervalo: não é confidencial, e o alerta de volta chega a todos (no estado e como aviso)
    for (const x of [anon, phone, master]) x.clear();
    r = await call('POST', '/api/admin/step', { id: id('intervalo') }, M); r = await call('POST', '/api/admin/cena', { kind: 'intervalo', action: 'alerta' }, M); assert.equal(r.status, 200); await wait(250);
    for (const [name, x] of [['anônimo', anon], ['celular', phone], ['telão do Doc', master]]) { const d = x.last('state').data; assert.equal(d.cena.kind, 'intervalo', name); assert.ok(d.cena.live.alerta > 0, name); assert.match(x.last('notify').data.title, /Emergency alert/, name); }
    r = await call('POST', '/api/admin/cena', { kind: 'intervalo', action: 'silenciar' }, M); assert.equal((await call('GET', '/api/state')).json.cena.live.alerta, null);
    // a Visão 2027 abre a estratégia em tela cheia só para quem tem a senha mestra
    r = await call('POST', '/api/admin/step', { id: id('visao') }, M); r = await call('POST', '/api/admin/cena', { kind: 'visao', action: 'abrir', on: true }, M); assert.equal(r.status, 200);
    assert.equal((await call('GET', '/api/state', undefined, M)).json.cena.live.aberta, true); assert.equal((await call('GET', '/api/state')).json.cena, null);
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
    r = await master.emit('admin:hello', { key: 'dinamicas' }); assert.equal(r.role, 'team'); assert.equal(r.overview.cenas.team, true);
    r = await call('POST', '/api/admin/action', { type: 'settings', settings: { confidencial: true } }, M); master.clear();
    r = await call('POST', '/api/admin/step', { id: id('mph') }, M); await wait(250); assert.equal(master.last('state').data.cena, null);
    r = await master.emit('admin:hello', { key: 'mestra' }); assert.equal(r.role, 'master'); assert.ok(r.overview.cenas); assert.equal((await master.emit('hello', {})).state.cena.kind, 'mph');
    assert.equal((await anon.emit('admin:hello', { key: 'errada' })).ok, false);

    /* ----- sem a senha das dinâmicas definida (ou igual à mestra), só a mestra entra ----- */
    const P2 = PORT + 100, B2 = `http://localhost:${P2}`; srv2 = boot(P2, { DINAMICAS_PASSWORD: 'mestra' }); await waitUp(B2);
    assert.deepEqual((await call('POST', '/api/admin/login', { password: 'mestra' }, { base: B2 })).json, { ok: true, role: 'master' });
    assert.deepEqual((await call('POST', '/api/admin/login', { password: 'dinamicas' }, { base: B2 })).json, { ok: false, role: null });
    assert.equal((await call('GET', '/api/admin/overview', undefined, { key: 'mestra', base: B2 })).json.team, false);
    console.log('OK · servidor: senha mestra e senha das dinâmicas, modo confidencial (HTTP e WebSocket), nuvem de palavras, feedback, alerta do intervalo e vídeo de abertura');
  } catch (e) {
    console.error('FALHOU:', e); process.exitCode = 1;
  } finally {
    for (const x of socks) x.close();
    srv.kill(); if (srv2) srv2.kill(); await wait(200); fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }
})();
