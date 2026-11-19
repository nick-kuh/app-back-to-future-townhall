// Teste de integração: townhall + "De Volta para o Sucesso" no mesmo servidor.
// Sobe o servidor numa porta livre com banco temporário e percorre o fluxo do Doc.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert/strict');
const crypto = require('crypto');

const PORT = 3900 + Math.floor(Math.random() * 90);
const B = `http://localhost:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'th-sucesso-'));
const srv = spawn(process.execPath, ['--no-warnings', path.join(__dirname, '..', 'server', 'index.js')], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR, ADMIN_PASSWORD: 'teste' }, stdio: ['ignore', 'pipe', 'inherit'],
});
let cookie = '';
async function call(method, url, body, { auth = true, origin = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && cookie) headers.cookie = cookie;
  if (origin) headers.Origin = B;
  const r = await fetch(B + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  const set = r.headers.get('set-cookie'); if (set && set.startsWith('bttf_admin=')) cookie = set.split(';')[0];
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, json, headers: r.headers };
}
const waitUp = async () => { for (let i = 0; i < 50; i++) { try { await fetch(B + '/health'); return; } catch { await new Promise(r => setTimeout(r, 100)); } } throw new Error('servidor não subiu'); };

(async () => {
  try {
    await waitUp();
    // painel exige login do Doc
    let r = await call('GET', '/painel', undefined, { auth: false });
    assert.equal(r.status, 302); assert.match(r.headers.get('location'), /admin\.html\?next=/);
    r = await call('GET', '/api/rooms', undefined, { auth: false }); assert.equal(r.status, 401);
    r = await call('POST', '/api/admin/login', { password: 'errada' }); assert.equal(r.json.ok, false); assert.equal(cookie, '');
    r = await call('POST', '/api/admin/login', { password: 'teste' }); assert.equal(r.json.ok, true); assert.ok(cookie);
    r = await call('GET', '/painel'); assert.equal(r.status, 200);
    // identidade forjada pelo navegador é ignorada
    r = await fetch(B + '/api/rooms', { headers: { 'oai-authenticated-user-id': 'painel-do-doc' } }); assert.equal(r.status, 401);

    // viagem em andamento (timer correndo)
    const people = (await call('GET', '/api/people')).json, tokens = [];
    for (const p of people.slice(0, 8)) tokens.push((await call('POST', '/api/checkin', { personId: p.id })).json.token);
    r = await call('POST', '/api/admin/action', { type: 'startJourney' }); assert.equal(r.status, 200, JSON.stringify(r.json));
    let st = (await call('GET', '/api/state')).json; assert.equal(st.conn.phase, 'matching'); assert.equal(st.conn.timer.paused, false);

    // sala + dinâmica no telão: a viagem pausa
    const room = (await call('POST', '/api/rooms', { name: 'Ensaio' })).json; assert.ok(room.id);
    r = await call('POST', '/api/admin/presentation', { roomId: room.id, activityId: 'd3' });
    assert.equal(r.status, 200); assert.equal(r.json.presentation.activityId, 'd3');
    st = (await call('GET', '/api/state')).json;
    assert.equal(st.presentation.title, 'Uso de IA'); assert.equal(st.conn.timer.paused, true);
    assert.equal(st.presentation.live.phase, 'idle'); assert.equal(st.presentation.live.talkSeconds, 180); assert.deepEqual(st.presentation.live.guide, ['DESAFIO', 'COMO USOU IA', 'IMPACTO']);
    r = await call('POST', '/api/admin/action', { type: 'skip' }); assert.equal(r.status, 409);
    r = await call('POST', '/api/admin/presentation', { roomId: room.id, activityId: 'd9' }); assert.equal(r.status, 400);

    // resposta pelo app: o nome vem do check-in (não de um formulário)
    const answer = (token, text, extra = {}) => call('POST', '/api/sucesso/answer', { token, answer: text, clientRequestId: crypto.randomUUID(), ...extra }, { auth: false });
    r = await answer(tokens[0], 'cedo demais'); assert.equal(r.status, 409);                       // recebimento ainda fechado
    r = await call('POST', `/api/rooms/${room.id}/activities/d3/command`, { action: 'start' }); assert.equal(r.json.phase, 'run');
    r = await answer('token-invalido', 'x'); assert.equal(r.status, 401);
    r = await answer(tokens[0], 'Agente de TPRM'); assert.equal(r.status, 200);
    assert.equal(r.json.me.person.name, people[0].name); assert.equal(r.json.me.sucesso.answers[0].answer, 'Agente de TPRM');
    const retry = { token: tokens[1], answer: 'Relatórios com IA', clientRequestId: crypto.randomUUID() };  // reenvio com o mesmo identificador não duplica
    r = await call('POST', '/api/sucesso/answer', retry, { auth: false }); assert.equal(r.json.duplicate, false);
    r = await call('POST', '/api/sucesso/answer', retry, { auth: false }); assert.equal(r.json.duplicate, true);
    r = await answer(tokens[0], 'rápido demais'); assert.equal(r.status, 429);                     // 2 s entre envios da mesma pessoa
    // formulário original (QR do painel 3D) continua valendo e entra na mesma contagem
    const status = (await call('GET', `/api/rooms/${room.id}/status`, undefined, { auth: false })).json;
    const roundId = status.activities.find(a => a.id === 'd3').roundId;
    assert.equal(status.presentation.activityId, 'd3');
    r = await call('POST', `/api/rooms/${room.id}/responses`, { activityId: 'd3', roundId, clientRequestId: crypto.randomUUID(), participantId: crypto.randomUUID(), name: 'Visitante', answer: 'Pelo formulário' }, { auth: false });
    assert.equal(r.status, 201);
    r = await call('GET', `/participar/${room.id}?d=d3`, undefined, { auth: false }); assert.equal(r.status, 200);
    // estado público: fase e contagem, sem textos; os textos só para o telão logado
    st = (await call('GET', '/api/state')).json; assert.equal(st.presentation.live.phase, 'run'); assert.equal(st.presentation.live.responseCount, 3);
    r = await call('GET', '/api/sucesso/screen', undefined, { auth: false });
    assert.equal(r.json.authenticated, false); assert.equal(r.json.responses, undefined); assert.equal(r.json.presentation.live.responseCount, 3);
    r = await call('GET', '/api/sucesso/screen');
    assert.deepEqual(r.json.responses.map(x => x.name), [people[0].name, people[1].name, 'Visitante']);

    // sorteio: só depois de encerrar; avisa o celular do sorteado; tempo de fala; não repete ninguém
    r = await call('POST', '/api/admin/sucesso/draw', { action: 'draw' }); assert.equal(r.status, 409);
    r = await call('POST', '/api/admin/sucesso/draw', { action: 'reveal' }); assert.equal(r.status, 409);     // as respostas só são reveladas depois de encerrar
    r = await call('POST', `/api/rooms/${room.id}/activities/d3/command`, { action: 'end' }); assert.equal(r.json.phase, 'done');
    st = (await call('GET', '/api/state')).json; assert.equal(st.presentation.revealed, false);               // encerrou: a nuvem continua guardada
    const winners = [];
    for (let i = 0; i < 3; i++) {
      r = await call('POST', '/api/admin/sucesso/draw', { action: 'draw' }); assert.equal(r.status, 200, JSON.stringify(r.json));
      st = (await call('GET', '/api/state')).json; winners.push(st.presentation.draw.name);
      assert.equal(st.presentation.draw.answer, undefined); assert.equal(st.presentation.draw.talk.duration, 180);
    }
    assert.deepEqual(winners.slice().sort(), [people[0].name, people[1].name, 'Visitante'].sort());
    r = await call('POST', '/api/admin/sucesso/draw', { action: 'draw' }); assert.equal(r.status, 409);        // todos já foram sorteados
    const last = winners[2], lastToken = last === people[0].name ? tokens[0] : last === people[1].name ? tokens[1] : null;
    if (lastToken) { const me = (await call('GET', '/api/me?token=' + lastToken, undefined, { auth: false })).json.me; assert.equal(me.sucesso.drawn, true); assert.ok(me.sucesso.drawnAnswer); }
    r = await call('POST', '/api/admin/sucesso/draw', { action: 'talkStart' }); assert.equal(r.status, 200);
    st = (await call('GET', '/api/state')).json; assert.ok(st.presentation.draw.talk.endsAt > Date.now());
    r = await call('POST', '/api/admin/sucesso/draw', { action: 'talkPause' }); st = (await call('GET', '/api/state')).json; assert.equal(st.presentation.draw.talk.endsAt, null);
    r = await call('GET', '/api/sucesso/screen'); assert.ok(r.json.drawAnswer);
    r = await call('POST', '/api/admin/sucesso/draw', { action: 'close' }); st = (await call('GET', '/api/state')).json; assert.equal(st.presentation.draw, null);
    // revelar as respostas é um comando do Doc; reabrir o recebimento guarda a nuvem de novo
    r = await call('POST', '/api/admin/sucesso/draw', { action: 'reveal' }); assert.equal(r.status, 200);
    st = (await call('GET', '/api/state')).json; assert.equal(st.presentation.revealed, true);
    r = await call('POST', '/api/admin/sucesso/draw', { action: 'hide' }); st = (await call('GET', '/api/state')).json; assert.equal(st.presentation.revealed, false);
    r = await call('POST', '/api/admin/sucesso/draw', { action: 'reveal' }); assert.equal(r.status, 200);
    r = await call('POST', `/api/rooms/${room.id}/activities/d3/command`, { action: 'reset' }); assert.equal(r.status, 200);
    await new Promise(done => setTimeout(done, 400));
    st = (await call('GET', '/api/state')).json; assert.equal(st.presentation.revealed, false); assert.equal(st.presentation.live.phase, 'idle');
    r = await call('POST', `/api/rooms/${room.id}/activities/d3/command`, { action: 'end' }); assert.equal(r.json.phase, 'done');

    // dinâmica 4: a pessoa pode enviar sem o nome
    r = await call('POST', '/api/admin/presentation', { roomId: room.id, activityId: 'd4' });
    await call('POST', `/api/rooms/${room.id}/activities/d4/command`, { action: 'start' });
    r = await answer(tokens[2], 'IA em todos os processos', { anonymous: true }); assert.equal(r.status, 200); assert.equal(r.json.me.sucesso.answers[0].anonymous, true);
    r = await call('GET', '/api/sucesso/screen'); assert.equal(r.json.responses[0].name, 'Anônimo');

    // voltar ao townhall: a viagem retoma
    r = await call('POST', '/api/admin/presentation', { roomId: null }); assert.equal(r.json.presentation, null);
    st = (await call('GET', '/api/state')).json;
    assert.equal(st.presentation, null); assert.equal(st.conn.timer.paused, false);
    r = await call('POST', '/api/admin/action', { type: 'skip' }); assert.equal(r.status, 200);

    // ---------- roteiro do evento ----------
    const step = id => call('POST', '/api/admin/step', { id });
    const state = async () => (await call('GET', '/api/state')).json;
    let ov = (await call('GET', '/api/admin/overview')).json; const steps = ov.settings.steps;
    assert.deepEqual(steps.map(x => x.type), ['checkin', 'connections', 'stage', 'reflexao', 'stage', 'stage', 'sucesso', 'sucesso', 'sucesso', 'sucesso', 'closing']);
    const stage1 = steps.find(x => x.type === 'stage');
    const of = (type, activity) => steps.find(x => x.type === type && (!activity || x.activity === activity)).id;
    assert.equal(ov.state.step, of('connections'));                 // as viagens levaram o cursor para o passo Conexões
    assert.ok(ov.sucesso.roomId); assert.equal(ov.sucesso.acts.d3.responseCount, 3);
    // sair do passo Conexões segura a viagem; voltar solta
    stage1.title = 'Abertura'; stage1.theme = 'O ano que passou'; stage1.speaker = 'Diretoria';
    r = await call('POST', '/api/admin/action', { type: 'settings', settings: { steps } }); assert.equal(r.status, 200);
    r = await call('POST', '/api/admin/action', { type: 'setAudio', mode: 'music', volume: 70 }); assert.equal(r.status, 200);
    st = await state(); assert.equal(st.audio.mode, 'music'); assert.equal(st.audio.volume, 70);
    r = await step(stage1.id); assert.equal(r.status, 200);
    st = await state();
    assert.equal(st.block, 'stage'); assert.deepEqual(st.stage, { title: 'Abertura', theme: 'O ano que passou', speaker: 'Diretoria' });
    assert.equal(st.audio.mode, 'off');                             // bloco de fala desliga o som
    assert.equal(st.conn.timer.paused, true);                       // a viagem espera
    r = await step(of('connections')); st = await state(); assert.equal(st.block, 'connections'); assert.equal(st.conn.timer.paused, false);

    // ---------- Reflexão: paradas, voto com o nome do check-in e sorteio de 2 projetos ----------
    const rf = action => call('POST', '/api/admin/reflexao', action);
    const vote = (token, project) => call('POST', '/api/reflexao/vote', { token, project }, { auth: false });
    r = await rf({ action: 'start' }); assert.equal(r.status, 409);                                // a Reflexão ainda não está no ar
    r = await step(of('reflexao')); st = await state();
    assert.equal(st.block, 'reflexao'); assert.equal(st.reflexao.open, null); assert.equal(st.reflexao.themes.length, 6); assert.equal(st.conn.timer.paused, true);
    r = await call('GET', '/api/reflexao/projects', undefined, { auth: false }); assert.equal(r.json.projects.length, 36);
    const projects = r.json.projects.map(x => x.name), ownerOf = Object.fromEntries(r.json.projects.map(x => [x.name, x.owner]));
    r = await rf({ action: 'open', idx: 0 }); assert.equal(r.status, 200);
    r = await vote(tokens[0], projects[0]); assert.equal(r.status, 409);                           // votação ainda não começou
    r = await rf({ action: 'start' }); st = await state(); assert.equal(st.reflexao.cur.phase, 'run'); assert.ok(st.reflexao.cur.endsAt > Date.now());
    r = await vote(tokens[0], projects[0]); assert.equal(r.status, 200); assert.equal(r.json.me.reflexao.votes[0].project, projects[0]);
    r = await vote(tokens[0], projects[1]); assert.equal(r.status, 409);                           // um voto por parada
    r = await vote('token-invalido', projects[1]); assert.equal(r.status, 401);
    r = await vote(tokens[1], 'Projeto que não existe'); assert.equal(r.status, 400);
    r = await vote(tokens[1], projects[1]); assert.equal(r.status, 200);
    r = await rf({ action: 'reveal' }); assert.equal(r.status, 409);                               // os mais votados só depois de encerrar
    // sair da Reflexão pausa a votação; ao voltar, o Doc retoma
    r = await step(stage1.id); st = await state(); assert.equal(st.reflexao, null);
    ov = (await call('GET', '/api/admin/overview')).json; assert.equal(ov.reflexao.paradas[0].phase, 'paused');
    r = await vote(tokens[2], projects[2]); assert.equal(r.status, 409);                           // fora do ar
    r = await step(of('reflexao')); st = await state(); assert.equal(st.reflexao.cur.phase, 'paused');
    r = await rf({ action: 'start' }); r = await vote(tokens[2], projects[2]); assert.equal(r.status, 200);
    // os 2 mais votados, sem repetir responsável: projetos[3] e [4] são da mesma pessoa; o [4] fica de fora e entra o seguinte
    assert.equal(ownerOf[projects[3]], ownerOf[projects[4]]); assert.notEqual(ownerOf[projects[3]], ownerOf[projects[5]]);
    for (const [i, proj] of [[3, 3], [4, 3], [5, 3], [6, 4], [7, 4]]) { r = await vote(tokens[i], projects[proj]); assert.equal(r.status, 200, JSON.stringify(r.json)); }
    r = await rf({ action: 'end' }); st = await state(); assert.equal(st.reflexao.cur.phase, 'done'); assert.equal(st.reflexao.cur.votes, 8); assert.equal(st.reflexao.cur.top, null);
    r = await vote(tokens[0], projects[3]); assert.equal(r.status, 409); assert.match(r.json.error, /encerrada/);   // votação encerrada
    // votos: [3] × 3 (Papucci), [4] × 2 (Papucci), [0], [1], [2] × 1 → 1º = [3]; 2º = [0], o primeiro dos empatados com outro responsável
    r = await rf({ action: 'reveal' }); assert.equal(r.status, 200); st = await state();
    assert.deepEqual(st.reflexao.cur.top.items, [{ name: projects[3], owner: ownerOf[projects[3]] }, { name: projects[0], owner: ownerOf[projects[0]] }]);   // sem a quantidade de votos
    assert.ok(Date.now() - st.reflexao.cur.top.at < 3000); assert.equal(st.reflexao.themes[0].revealed, true);
    ov = (await call('GET', '/api/admin/overview')).json;
    assert.deepEqual(ov.reflexao.paradas[0].tally.slice(0, 3).map(x => [x.p, x.n, x.pick, x.skip]), [[projects[3], 3, 1, false], [projects[4], 2, 0, true], [projects[0], 1, 2, false]]);
    assert.deepEqual(ov.reflexao.paradas[0].top.map(x => x.n), [3, 1]);                             // o Doc vê a quantidade
    r = await rf({ action: 'counts', on: true }); st = await state(); assert.deepEqual(st.reflexao.cur.top.items.map(x => x.votes), [3, 1]);   // e pode mostrar no telão
    r = await rf({ action: 'counts', on: false }); st = await state(); assert.equal(st.reflexao.cur.top.items[0].votes, undefined);
    r = await rf({ action: 'showTop', on: false }); st = await state(); assert.equal(st.reflexao.cur.top, null);
    r = await rf({ action: 'reveal' }); st = await state(); assert.equal(st.reflexao.cur.top.items.length, 2);               // revelar de novo repete o suspense
    r = await rf({ action: 'draw' }); assert.equal(r.status, 400);                                 // o sorteio não existe mais
    r = await rf({ action: 'fake', n: 4 }); assert.equal(r.status, 409);                           // votação encerrada: nem voto de teste entra
    r = await rf({ action: 'open', idx: 1 }); r = await rf({ action: 'fake', n: 4 }); assert.equal(r.json.added, 4);          // modo ensaio abre a votação e vota
    st = await state(); assert.equal(st.reflexao.cur.idx, 1); assert.equal(st.reflexao.cur.phase, 'run'); assert.equal(st.reflexao.cur.votes, 4); assert.equal(st.reflexao.votes, 12);
    r = await fetch(B + '/api/admin/reflexao/votes.csv', { headers: { cookie } }); assert.equal(r.status, 200);
    const csv = await r.text(); assert.ok(csv.includes(projects[0]) && csv.includes(people[0].name) && csv.includes('(teste)')); assert.equal(csv.trim().split('\r\n').length, 13);
    r = await call('GET', '/api/admin/reflexao/votes.csv', undefined, { auth: false }); assert.equal(r.status, 401);
    r = await rf({ action: 'config', config: { projects: [{ name: 'Só um' }] } }); assert.equal(r.status, 400);
    r = await rf({ action: 'config', config: { voteSeconds: 45 } }); assert.equal(r.status, 200);
    ov = (await call('GET', '/api/admin/overview')).json;
    assert.equal(ov.reflexao.config.voteSeconds, 45); assert.equal(ov.reflexao.paradas[2].remaining, 45); assert.equal(ov.reflexao.paradas[0].votes, 8); assert.equal(ov.reflexao.paradas[1].phase, 'paused');
    // extração de dados: conexões (duplas, perguntas, ranking, match), reflexão (votos e resultado) e sucesso (respostas por pergunta)
    r = await call('GET', '/api/admin/export', undefined, { auth: false }); assert.equal(r.status, 401);
    const ex = (await call('GET', '/api/admin/export')).json;
    assert.equal(ex.conexoes.rounds.length, 3); assert.ok(ex.conexoes.rounds[0].groups.length >= 4);
    const g0 = ex.conexoes.rounds[0].groups[0]; assert.ok(g0.code && g0.members.length >= 2 && g0.members[0].name && g0.questions.length > 0 && typeof g0.questions[0].text === 'string');
    assert.ok(ex.conexoes.rounds[0].talked ? g0.questions[0].shown : !g0.questions[0].shown);     // a dupla só "teve" perguntas se a conversa aconteceu
    assert.deepEqual(ex.reflexao.paradas[0].top.map(x => [x.project, x.votes]), [[projects[3], 3], [projects[0], 1]]);
    assert.equal(ex.reflexao.paradas[0].votes.length, 8); assert.equal(ex.reflexao.paradas[0].tally[1].skipped, true); assert.equal(ex.reflexao.paradas[1].votes.every(v => v.test), true);
    const d3 = ex.sucesso.acts.find(a => a.id === 'd3'); assert.equal(d3.question.length > 10, true); assert.deepEqual(d3.responses.map(x => x.name).sort(), [people[0].name, people[1].name, 'Visitante'].sort()); assert.ok(d3.responses[0].answer && d3.responses[0].at);
    // quem coordena um bloco fica de fora dele: não vota na Reflexão, não responde no Sucesso e não entra no sorteio das duplas
    r = await call('POST', '/api/admin/action', { type: 'settings', settings: { skip: { reflexao: [people[5].id, 999999, 'x'], sucesso: [people[6].id] } } }); assert.equal(r.status, 200);
    ov = (await call('GET', '/api/admin/overview')).json; assert.deepEqual(ov.settings.skip, { connections: [], reflexao: [people[5].id, 999999], sucesso: [people[6].id] });
    r = await step(of('reflexao')); r = await rf({ action: 'open', idx: 2 }); r = await rf({ action: 'start' });
    r = await vote(tokens[5], projects[7]); assert.equal(r.status, 403); r = await vote(tokens[6], projects[7]); assert.equal(r.status, 200);
    let me = (await call('GET', '/api/me?token=' + tokens[5], undefined, { auth: false })).json.me; assert.deepEqual(me.skip, { connections: false, reflexao: true, sucesso: false });
    r = await rf({ action: 'end' });
    r = await step(of('sucesso', 'd1')); r = await answer(tokens[6], 'não entra'); assert.equal(r.status, 403); r = await answer(tokens[5], 'Entregar valor'); assert.equal(r.status, 200);
    r = await step(of('connections'));
    // o modo "relógio" do telão não existe mais
    r = await call('POST', '/api/admin/action', { type: 'setScene', scene: 'clock' }); st = await state(); assert.equal(st.screen.scene, 'auto');
    r = await call('POST', '/api/admin/action', { type: 'setScene', scene: 'logo' }); st = await state(); assert.equal(st.screen.scene, 'logo');
    r = await call('POST', '/api/admin/action', { type: 'setScene', scene: 'auto' });
    // bipes do cronômetro e transições: ligados por padrão, o Doc pode desligar
    st = await state(); assert.equal(st.audio.beeps, true); assert.equal(st.settings.transitions, true);
    assert.equal(st.settings.transitionSeconds, 15);                // transição longa por padrão; o Doc ajusta entre 3 e 30 s
    r = await call('POST', '/api/admin/action', { type: 'settings', settings: { transitionSeconds: 99 } }); st = await state(); assert.equal(st.settings.transitionSeconds, 30);
    r = await call('POST', '/api/admin/action', { type: 'settings', settings: { transitionSeconds: 15 } }); st = await state(); assert.equal(st.settings.transitionSeconds, 15);
    r = await call('POST', '/api/admin/action', { type: 'setAudio', beeps: false }); r = await call('POST', '/api/admin/action', { type: 'settings', settings: { transitions: false } });
    st = await state(); assert.equal(st.audio.beeps, false); assert.equal(st.settings.transitions, false);
    r = await call('POST', '/api/admin/action', { type: 'setAudio', beeps: true }); r = await call('POST', '/api/admin/action', { type: 'settings', settings: { transitions: true } });
    r = await step(of('connections')); st = await state(); assert.equal(st.block, 'connections'); assert.equal(st.reflexao, null);
    // passo do Sucesso: a dinâmica entra no ar na sala do evento; tela avulsa tira; voltar ao roteiro recoloca
    r = await step(of('sucesso', 'd1')); assert.equal(r.status, 200);
    st = await state(); assert.equal(st.presentation.activityId, 'd1'); assert.equal(st.conn.timer.paused, true);
    ov = (await call('GET', '/api/admin/overview')).json; assert.equal(ov.sucesso.roomId, st.presentation.roomId);
    r = await call('POST', '/api/admin/action', { type: 'setMessage', message: { title: 'Intervalo', body: '10 min', emoji: '☕' }, show: true }); assert.equal(r.status, 200);
    st = await state(); assert.equal(st.presentation, null); assert.equal(st.block, 'message');
    ov = (await call('GET', '/api/admin/overview')).json; assert.equal(ov.state.detour, 'message'); assert.equal(ov.state.step, of('sucesso', 'd1'));
    r = await step(of('sucesso', 'd1')); st = await state(); assert.equal(st.presentation.activityId, 'd1');
    ov = (await call('GET', '/api/admin/overview')).json; assert.equal(ov.state.detour, null);
    r = await step('nao-existe'); assert.equal(r.status, 404);
    r = await step(of('closing')); st = await state(); assert.equal(st.block, 'closing'); assert.equal(st.presentation, null);
    // roteiro editado: tipos desconhecidos e repetidos saem; o passo no ar removido volta o cursor para o começo
    r = await call('POST', '/api/admin/action', { type: 'settings', settings: { steps: [{ type: 'checkin' }, { type: 'connections' }, { type: 'connections' }, { type: 'reflexao' }, { type: 'reflexao' }, { type: 'sucesso', activity: 'd9' }, { type: 'message', title: 'Intervalo' }, { type: 'xyz' }] } });
    ov = (await call('GET', '/api/admin/overview')).json; assert.deepEqual(ov.settings.steps.map(x => x.type), ['checkin', 'connections', 'reflexao', 'message']); assert.equal(ov.state.step, ov.settings.steps[0].id);
    r = await call('POST', '/api/admin/action', { type: 'settings', settings: { steps: [] } }); assert.equal(r.status, 400);
    r = await call('POST', '/api/admin/action', { type: 'setAudio', mode: 'rock' }); assert.equal(r.status, 400);
    // resetar o evento: check-ins, roteiro e respostas do Sucesso voltam ao zero
    r = await call('POST', '/api/admin/action', { type: 'resetEvent' }); assert.equal(r.status, 200);
    await new Promise(done => setTimeout(done, 400));
    ov = (await call('GET', '/api/admin/overview')).json;
    assert.equal(ov.counts.checkedIn, 0); assert.equal(ov.state.block, 'welcome'); assert.equal(ov.sucesso.acts.d3.responseCount, 0); assert.equal(ov.sucesso.acts.d4.responseCount, 0);
    assert.equal(ov.reflexao.open, null); assert.ok(ov.reflexao.paradas.every(p => p.votes === 0 && p.phase === 'idle' && !p.top.length));   // os votos da Reflexão também
    const again = [];
    for (const p of people.slice(0, 7)) again.push((await call('POST', '/api/checkin', { personId: p.id })).json.token);
    r = await call('POST', '/api/admin/action', { type: 'settings', settings: { skip: { connections: [people[0].id] } } });
    r = await call('POST', '/api/admin/action', { type: 'generate' }); assert.equal(r.status, 200, JSON.stringify(r.json));
    ov = (await call('GET', '/api/admin/overview')).json;
    const paired = ov.rounds[0].groups.flatMap(g => g.members.map(m => m.id));
    assert.equal(paired.length, 6); assert.ok(!paired.includes(people[0].id)); assert.equal(ov.people.find(p => p.id === people[0].id).late, false);
    me = (await call('GET', '/api/me?token=' + again[0], undefined, { auth: false })).json.me; assert.equal(me.skip.connections, true); assert.equal(me.person.name, people[0].name);
    console.log('OK · townhall + De Volta para o Sucesso + Reflexão integrados');
  } catch (e) {
    console.error('FALHOU:', e); process.exitCode = 1;
  } finally {
    srv.kill(); fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }
})();
