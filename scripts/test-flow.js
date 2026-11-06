// Teste de fluxo completo do motor (sem rede): check-in → duplas → 3 viagens → avaliação → resultados.
process.env.DB_PATH = ':memory:';
const assert = require('assert');
const { Engine } = require('../server/engine');

const e = new Engine();
const people = e.listPeople();
assert.strictEqual(people.length, 47, '47 pessoas na lista inicial');
assert.strictEqual(e.listQuestions().length, 42, '42 perguntas no banco');

// check-in de 40 pessoas via token (simula celulares)
const tokens = {};
for (const p of people.slice(0, 40)) tokens[p.id] = e.checkin(p.id).token;
assert.strictEqual(e.publicState().counts.checkedIn, 40);
assert.strictEqual(e.personByToken(tokens[1]).id, 1, 'token identifica a pessoa');

// re-check-in no mesmo aparelho mantém o token; outro aparelho troca
assert.strictEqual(e.checkin(1, tokens[1]).token, tokens[1]);
assert.notStrictEqual(e.checkin(1, 'outro').token, tokens[1]);

// geração
const gen = e.generate();
assert.strictEqual(gen.rounds, 3);
assert.strictEqual(e.state.conn.phase, 'ready');
const seenPairs = new Set();
for (let r = 1; r <= 3; r++) {
  const groups = e.groupsOfRound(r);
  const ids = groups.flatMap(g => g.members);
  assert.strictEqual(new Set(ids).size, 40, `rodada ${r}: todos pareados uma vez`);
  for (const g of groups) for (let i = 0; i < g.members.length; i++) for (let j = i + 1; j < g.members.length; j++) {
    const k = [g.members[i], g.members[j]].sort().join('|');
    assert(!seenPairs.has(k), 'dupla não se repete'); seenPairs.add(k);
  }
}

// viagens
e.settings.roundSeconds = 10;
const seenByPerson = {};
for (let r = 1; r <= 3; r++) {
  e.reveal(r);
  assert.strictEqual(e.state.conn.phase, 'matching');
  const me = e.meState(1);
  assert(me.group && !me.group.missing && me.group.queue.length > 5, 'fila de perguntas montada');
  assert.strictEqual(me.group.partners.length >= 1, true);
  // duplas diferentes começam com perguntas diferentes (rotação)
  const firsts = e.groupsOfRound(r).map(g => g.queue[0]);
  assert(new Set(firsts).size >= Math.min(firsts.length, 10), 'duplas começam em perguntas diferentes');
  // era prioritária
  const era = ['presente', 'passado', 'futuro'][r - 1];
  const qs = Object.fromEntries(e.listQuestions().map(q => [q.id, q]));
  assert.strictEqual(qs[me.group.queue[0].id].era, era, `rodada ${r} começa com pergunta da era ${era}`);
  e.startTalk();
  assert.strictEqual(e.state.conn.phase, 'talk');
  assert(e.state.conn.talk.endsAt > Date.now());
  // avanço sincronizado
  const step = e.groupStep(1, 1);
  assert.strictEqual(step.position, 1);
  const partnerId = step.members.find(id => id !== 1);
  assert.strictEqual(e.meState(partnerId).group.position, 1, 'parceiro vê a mesma posição');
  assert.strictEqual(e.groupStep(partnerId, -1).position, 0);
  e.groupStep(1, 1); e.groupStep(1, 1); // posição 2
  // pausa / retomada / +30s
  e.pause(); assert(e.state.conn.talk.paused); e.addTime(30); assert.strictEqual(e.state.conn.talk.remaining >= 30, true); e.resume(); assert(!e.state.conn.talk.paused);
  e.endTalk();
  assert.strictEqual(e.state.conn.phase, 'roundEnd');
  // perguntas vistas registradas
  for (const g of e.groupsOfRound(r)) for (const m of g.members) for (let i = 0; i <= g.position; i++) (seenByPerson[m] = seenByPerson[m] || new Set()).add(g.queue[i]);
}
// ninguém repete pergunta entre rodadas (fila da rodada seguinte exclui as vistas)
for (let r = 2; r <= 3; r++) {
  // reconstrói o que cada pessoa viu até a rodada anterior e confere a fila da rodada r
  const before = {};
  for (let rr = 1; rr < r; rr++) for (const g of e.groupsOfRound(rr)) for (const m of g.members) for (let i = 0; i <= g.position; i++) (before[m] = before[m] || new Set()).add(g.queue[i]);
  for (const g of e.groupsOfRound(r)) for (const m of g.members) for (const q of g.queue) assert(!(before[m] || new Set()).has(q), `pessoa ${m} não repete pergunta na rodada ${r}`);
}

// avaliação
assert.throws(() => e.submitRanking(1, { 1: 1, 2: 2, 3: 3 }), /não está aberta/);
e.openRanking();
assert.throws(() => e.submitRanking(1, { 1: 1, 2: 1, 3: 3 }), /sem repetir/);
e.submitRanking(1, { 1: 2, 2: 1, 3: 3 });
assert.deepStrictEqual(e.meState(1).ranking, { 1: 2, 2: 1, 3: 3 });
e.testRandomRankings();
assert.strictEqual(e.publicState().conn.rankingDone, 40);

// resultados
e.computeResults();
assert.strictEqual(e.state.conn.phase, 'results');
const res = e.meState(1).result;
assert(res && res.match && res.match.id, 'conexão calculada');
assert(res.detail.length >= 3, 'detalhe com todas as conversas');
assert(res.detail.every((d, i, a) => i === 0 || a[i - 1].score >= d.score), 'detalhe ordenado por pontuação');
const ov = e.adminOverview();
assert.strictEqual(ov.results.length, 40);
assert(ov.results.some(r => r.mutual), 'existe ao menos uma conexão mútua');

// pessoa que chegou depois aparece como "fora da rota" e o recálculo da rodada seguinte a inclui
e.resetConnections(); e.generate(); e.reveal(1); e.startTalk(); e.endTalk();
e.checkin(45);
assert(e.adminOverview().people.find(p => p.id === 45).late, 'check-in tardio sinalizado');
e.generate({ fromRound: 2 });
assert(e.groupsOfRound(1).flatMap(g => g.members).includes(45) === false, 'rodada 1 preservada');
assert(e.groupsOfRound(2).flatMap(g => g.members).includes(45), 'rodada 2 inclui a pessoa nova');

// bloco de mensagem e settings
e.setBlock('standby');
assert.strictEqual(e.publicState().block, 'standby', 'bloco de espera');
e.updateSettings({ standbyText: 'Já voltamos' });
assert.strictEqual(e.publicState().event.standbyText, 'Já voltamos');
e.setMessage({ title: 'Intervalo', body: '15 min', emoji: '☕' }, true);
assert.strictEqual(e.publicState().block, 'message');
e.updateSettings({ roundSeconds: 240, agenda: [{ time: '09:00', title: 'Abertura' }] });
assert.strictEqual(e.publicState().event.agenda[0].title, 'Abertura');

// importação de pessoas (mesclar) e de respostas do forms
const imp = e.importPeople([
  { name: 'Claudia Meira', email: 'claudia.meira@unilever.com', wl: 'wl3', team: 'CDIO BPC', manager: 'Meenakshi Burra', area: 'Diretora' },
  { name: 'Pessoa Nova', email: 'pessoa.nova@unilever.com', wl: 'Estagiário', team: 'CDIO HC', manager: 'Alguém', area: 'Consumer' },
], 'merge');
assert.deepStrictEqual([imp.inserted, imp.updated], [1, 1], 'mescla atualiza existente e insere nova');
const nova = e.listPeople().find(p => p.name === 'Pessoa Nova');
assert.strictEqual(nova.wl, 'Estag', 'WL normalizado');
const frm = e.importForm([
  { 'ID': '1', 'Start time': 'x', 'Email': 'Pedro.Teixeira2@unilever.com', 'Name': 'Pedro', 'Qual seu hobby?': 'Surf', 'Lugar favorito': 'Ubatuba' },
  { 'ID': '2', 'Start time': 'x', 'Email': 'ninguem@unilever.com', 'Name': 'X', 'Qual seu hobby?': '—', 'Lugar favorito': '' },
  { 'ID': '3', 'Start time': 'x', 'Email': '', 'Name': 'Ana Cardoso', 'Qual seu hobby?': 'Corrida', 'Lugar favorito': 'Chapada' },
], 'Email');
assert.strictEqual(frm.matched, 1, 'uma pessoa casada por e-mail');
assert.deepStrictEqual(frm.unmatched, ['ninguem@unilever.com']);
const frm2 = e.importForm([{ 'Nome': 'ana cardoso', 'Qual seu hobby?': 'Corrida' }], 'Nome');
assert.strictEqual(frm2.matched, 1, 'casamento por nome (sem acento/caixa)');
const pedro = e.listPeople().find(p => p.name === 'Pedro Teixeira');
assert.deepStrictEqual(pedro.form, { 'Qual seu hobby?': 'Surf', 'Lugar favorito': 'Ubatuba' }, 'colunas de sistema ignoradas');
const hinted = e.publicPerson(pedro, true);
assert.strictEqual(hinted.hints.length, 2, 'dicas aparecem para a dupla');
e.updateSettings({ showFormHints: false });
assert.strictEqual(e.publicPerson(pedro, true).hints, undefined, 'dicas podem ser desligadas');

e.clearTimer();
console.log('OK · fluxo completo validado');
