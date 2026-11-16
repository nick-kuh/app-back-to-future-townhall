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
    assert.deepEqual(steps.map(x => x.type), ['checkin', 'stage', 'reflexao', 'connections', 'stage', 'sucesso', 'sucesso', 'sucesso', 'sucesso', 'stage', 'closing']);
    const of = (type, activity) => steps.find(x => x.type === type && (!activity || x.activity === activity)).id;
    assert.equal(ov.state.step, of('connections'));                 // as viagens levaram o cursor para o passo Conexões
    assert.ok(ov.sucesso.roomId); assert.equal(ov.sucesso.acts.d3.responseCount, 3);
    // sair do passo Conexões segura a viagem; voltar solta
    steps[1].title = 'Abertura'; steps[1].theme = 'O ano que passou'; steps[1].speaker = 'Diretoria';
    r = await call('POST', '/api/admin/action', { type: 'settings', settings: { steps } }); assert.equal(r.status, 200);
    r = await call('POST', '/api/admin/action', { type: 'setAudio', mode: 'music', volume: 70 }); assert.equal(r.status, 200);
    st = await state(); assert.equal(st.audio.mode, 'music'); assert.equal(st.audio.volume, 70);
    r = await step(steps[1].id); assert.equal(r.status, 200);
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
    const projects = r.json.projects.map(x => x.name);
    r = await rf({ action: 'open', idx: 0 }); assert.equal(r.status, 200);
    r = await vote(tokens[0], projects[0]); assert.equal(r.status, 409);                           // votação ainda não começou
    r = await rf({ action: 'start' }); st = await state(); assert.equal(st.reflexao.cur.phase, 'run'); assert.ok(st.reflexao.cur.endsAt > Date.now());
    r = await vote(tokens[0], projects[0]); assert.equal(r.status, 200); assert.equal(r.json.me.reflexao.votes[0].project, projects[0]);
    r = await vote(tokens[0], projects[1]); assert.equal(r.status, 409);                           // um voto por parada
    r = await vote('token-invalido', projects[1]); assert.equal(r.status, 401);
    r = await vote(tokens[1], 'Projeto que não existe'); assert.equal(r.status, 400);
    r = await vote(tokens[1], projects[1]); assert.equal(r.status, 200);
    r = await rf({ action: 'draw' }); assert.equal(r.status, 409);                                 // sorteio só depois de encerrar
    // sair da Reflexão pausa a votação; ao voltar, o Doc retoma
    r = await step(steps[1].id); st = await state(); assert.equal(st.reflexao, null);
    ov = (await call('GET', '/api/admin/overview')).json; assert.equal(ov.reflexao.paradas[0].phase, 'paused');
    r = await vote(tokens[2], projects[2]); assert.equal(r.status, 409);                           // fora do ar
    r = await step(of('reflexao')); st = await state(); assert.equal(st.reflexao.cur.phase, 'paused');
    r = await rf({ action: 'start' }); r = await vote(tokens[2], projects[2]); assert.equal(r.status, 200);
    r = await rf({ action: 'end' }); st = await state(); assert.equal(st.reflexao.cur.phase, 'done'); assert.equal(st.reflexao.cur.votes, 3); assert.equal(st.reflexao.cur.draw, null);
    r = await vote(tokens[3], projects[3]); assert.equal(r.status, 409);                           // votação encerrada
    r = await rf({ action: 'draw' }); assert.equal(r.status, 200); st = await state();
    const drawn = st.reflexao.cur.draw.items; assert.equal(drawn.length, 2); assert.notEqual(drawn[0].name, drawn[1].name);
    assert.ok(drawn.every(x => projects.slice(0, 3).includes(x.name) && x.owner)); assert.equal(st.reflexao.themes[0].drawn, true);
    r = await rf({ action: 'swap', k: 0 }); assert.equal(r.status, 200); st = await state();
    assert.deepEqual([...drawn.map(x => x.name), st.reflexao.cur.draw.items[0].name].sort(), projects.slice(0, 3).sort());   // o terceiro projeto votado entrou
    r = await rf({ action: 'swap', k: 1 }); assert.equal(r.status, 409);                           // não há mais projetos votados
    r = await rf({ action: 'draw' }); assert.equal(r.status, 409);
    r = await rf({ action: 'fake', n: 4 }); assert.equal(r.status, 409);                           // votação encerrada: nem voto de teste entra
    r = await rf({ action: 'open', idx: 1 }); r = await rf({ action: 'fake', n: 4 }); assert.equal(r.json.added, 4);          // modo ensaio abre a votação e vota
    st = await state(); assert.equal(st.reflexao.cur.idx, 1); assert.equal(st.reflexao.cur.phase, 'run'); assert.equal(st.reflexao.cur.votes, 4); assert.equal(st.reflexao.votes, 7);
    r = await fetch(B + '/api/admin/reflexao/votes.csv', { headers: { cookie } }); assert.equal(r.status, 200);
    const csv = await r.text(); assert.ok(csv.includes(projects[0]) && csv.includes(people[0].name) && csv.includes('(teste)')); assert.equal(csv.trim().split('\r\n').length, 8);
    r = await call('GET', '/api/admin/reflexao/votes.csv', undefined, { auth: false }); assert.equal(r.status, 401);
    r = await rf({ action: 'config', config: { projects: [{ name: 'Só um' }] } }); assert.equal(r.status, 400);
    r = await rf({ action: 'config', config: { voteSeconds: 45 } }); assert.equal(r.status, 200);
    ov = (await call('GET', '/api/admin/overview')).json;
    assert.equal(ov.reflexao.config.voteSeconds, 45); assert.equal(ov.reflexao.paradas[2].remaining, 45); assert.equal(ov.reflexao.paradas[0].votes, 3); assert.equal(ov.reflexao.paradas[1].phase, 'paused');
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
    assert.equal(ov.reflexao.open, null); assert.ok(ov.reflexao.paradas.every(p => p.votes === 0 && p.phase === 'idle' && !p.drawn.length));   // os votos da Reflexão também
    console.log('OK · townhall + De Volta para o Sucesso + Reflexão integrados');
  } catch (e) {
    console.error('FALHOU:', e); process.exitCode = 1;
  } finally {
    srv.kill(); fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }
})();
