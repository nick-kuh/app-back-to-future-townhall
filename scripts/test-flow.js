// Teste de fluxo completo do motor (sem rede): check-in → duplas → 3 viagens → avaliação → resultados.
process.env.DB_PATH = ':memory:';
const assert = require('assert');
const { Engine } = require('../server/engine');

const e = new Engine();
e.updateSettings({ autoFlow: false }); // primeira parte: fluxo manual (o painel no modo manual)
const people = e.listPeople();
assert.strictEqual(people.length, 47, '47 pessoas na lista inicial');
assert.strictEqual(e.listQuestions().length, 42, '42 perguntas no banco');

// check-in de 40 pessoas via token (simula celulares)
const tokens = {};
for (const p of people.slice(0, 40)) tokens[p.id] = e.checkin(p.id).token;
assert.strictEqual(e.publicState().counts.checkedIn, 40);
assert.strictEqual(e.personByToken(tokens[1]).id, 1, 'token identifica a pessoa');
assert.strictEqual(e.personByToken({ toString: 1 }), null, 'token malformado não quebra');
assert.strictEqual(e.personByToken(['x']), null);

// re-check-in no mesmo aparelho mantém o token; outro aparelho troca
assert.strictEqual(e.checkin(1, tokens[1]).token, tokens[1]);
assert.notStrictEqual(e.checkin(1, 'outro').token, tokens[1]);
tokens[1] = e.personById(1).token;

// escolheu o nome errado: checkout libera o nome de novo
{
  const t = e.checkin(41).token;
  assert.strictEqual(e.publicState().counts.checkedIn, 41);
  e.checkout(t);
  assert.strictEqual(e.publicState().counts.checkedIn, 40, 'checkout desfaz o check-in');
  assert.strictEqual(e.personById(41).checkedInAt, null);
  assert.strictEqual(e.personByToken(t), null);
}

// geração
const gen = e.generate();
assert.strictEqual(gen.rounds, 3);
assert.strictEqual(e.state.conn.phase, 'ready');
assert.strictEqual(gen.repeats, false);
assert.throws(() => e.checkout(tokens[1]), /já foram sorteadas/, 'checkout bloqueado depois do sorteio');
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

// viagens (manual)
e.updateSettings({ roundSeconds: 10 });
for (let r = 1; r <= 3; r++) {
  e.reveal(r);
  assert.strictEqual(e.state.conn.phase, 'matching');
  assert.strictEqual(e.state.conn.timer, null, 'modo manual: sem timer de encontro');
  const me = e.meState(1);
  assert(me.group && !me.group.missing && me.group.queue.length > 5, 'fila de perguntas montada');
  assert.strictEqual(me.group.partners.length >= 1, true);
  assert.strictEqual(me.group.partners[0].area, undefined, 'viajante não vê a área da dupla');
  assert.strictEqual(me.group.partners[0].wl, undefined, 'viajante não vê o WL da dupla');
  const firsts = e.groupsOfRound(r).map(g => g.queue[0]);
  assert(new Set(firsts).size >= Math.min(firsts.length, 10), 'duplas começam em perguntas diferentes');
  const era = ['presente', 'passado', 'futuro'][r - 1];
  const qs = Object.fromEntries(e.listQuestions().map(q => [q.id, q]));
  assert.strictEqual(qs[me.group.queue[0].id].era, era, `rodada ${r} começa com pergunta da era ${era}`);
  e.startTalk();
  assert.strictEqual(e.state.conn.phase, 'talk');
  assert.strictEqual(e.state.conn.timer.kind, 'talk');
  assert(e.state.conn.timer.endsAt > Date.now());
  const step = e.groupStep(1, 1);
  assert.strictEqual(step.position, 1);
  const partnerId = step.members.find(id => id !== 1);
  assert.strictEqual(e.meState(partnerId).group.position, 1, 'parceiro vê a mesma posição');
  assert.strictEqual(e.groupStep(partnerId, -1).position, 0);
  e.groupStep(1, 1); e.groupStep(1, 1);
  e.pause(); assert(e.state.conn.timer.paused); e.addTime(30); assert.strictEqual(e.state.conn.timer.remaining >= 30, true); e.resume(); assert(!e.state.conn.timer.paused);
  e.endTalk();
  assert.strictEqual(e.state.conn.phase, 'roundEnd');
  assert.strictEqual(e.state.conn.timer, null, 'modo manual: sem intervalo automático');
}
// ninguém repete pergunta entre rodadas
for (let r = 2; r <= 3; r++) {
  const before = {};
  for (let rr = 1; rr < r; rr++) for (const g of e.groupsOfRound(rr)) for (const m of g.members) for (let i = 0; i <= g.position; i++) (before[m] = before[m] || new Set()).add(g.queue[i]);
  for (const g of e.groupsOfRound(r)) for (const m of g.members) for (const q of g.queue) assert(!(before[m] || new Set()).has(q), `pessoa ${m} não repete pergunta na rodada ${r}`);
}

// avaliação
assert.throws(() => e.submitRanking(1, { 1: 1, 2: 2, 3: 3 }), /não está aberta/);
e.openRanking();
assert.strictEqual(e.state.conn.timer, null, 'modo manual: avaliação sem timer');
assert.throws(() => e.submitRanking(1, { 1: 1, 2: 1, 3: 3 }), /sem repetir/);
e.submitRanking(1, { 1: 2, 2: 1, 3: 3 });
assert.deepStrictEqual(e.meState(1).ranking, { 1: 2, 2: 1, 3: 3 });
e.testRandomRankings();
assert.strictEqual(e.publicState().conn.rankingDone, 40);
assert.strictEqual(e.state.conn.phase, 'ranking', 'modo manual: não calcula sozinho');

// resultados
e.computeResults();
assert.strictEqual(e.state.conn.phase, 'results');
const res = e.meState(1).result;
assert(res && res.match && res.match.id, 'conexão calculada');
assert.strictEqual(res.match.area, undefined, 'resultado sem área');
assert(res.detail.length >= 3, 'detalhe com todas as conversas');
assert(res.detail.every((d, i, a) => i === 0 || a[i - 1].score >= d.score), 'detalhe ordenado por pontuação');
const ov = e.adminOverview();
assert.strictEqual(ov.results.length, 40);
assert(ov.results.some(r => r.mutual), 'existe ao menos uma conexão mútua');
assert(ov.rounds[0].groups[0].members[0].area !== undefined, 'painel continua vendo a área');
assert(e.publicState().conn.mutualCount >= 1);
assert.deepStrictEqual(e.publicState().conn.mutualPairs, [], 'nomes das conexões mútuas só vão ao telão se ligado');
e.updateSettings({ showMutualOnScreen: true });
assert(e.publicState().conn.mutualPairs.length >= 1);

// guardas: rodadas já realizadas não podem ser refeitas
assert.throws(() => e.generate({ fromRound: 4 }), /Não há rodadas restantes/, 'fromRound 4 é recusado');
assert.throws(() => e.generate({ fromRound: 1 }), /já aconteceu/, 'rodada jogada não é regenerada');
assert.throws(() => e.deletePerson(1), /duplas já geradas/, 'não exclui quem está em duplas');
assert.throws(() => e.updatePerson(1, { name: '   ' }), /Nome obrigatório/, 'nome vazio é recusado');

// avanço com posição esperada (toque simultâneo não pula pergunta)
e.resetConnections(); e.generate(); e.reveal(1); e.startTalk();
{
  const st = e.groupStep(1, 1, 0); assert.strictEqual(st.position, 1);
  const partnerId = st.members.find(id => id !== 1);
  const dup = e.groupStep(partnerId, 1, 0);
  assert.strictEqual(dup.ignored, true); assert.strictEqual(dup.position, 1, 'segundo toque simultâneo não avança duas vezes');
  assert.strictEqual(e.groupStep(partnerId, 1, 1).position, 2, 'toque com posição atual avança');
}
// banco de perguntas: recusado durante a conversa, preserva ids ao substituir
assert.throws(() => e.replaceQuestions([{ era: 'presente', text: 'x' }]), /conversa em andamento/);
e.endTalk();
{
  const before = e.listQuestions();
  const list = before.map(q => ({ era: q.era, text: q.text, active: q.id !== before[0].id }));
  list.push({ era: 'futuro', text: 'Pergunta nova de teste?' });
  list.splice(1, 1);
  e.replaceQuestions(list);
  const after = e.listQuestions();
  assert.strictEqual(after.find(q => q.id === before[0].id).active, false, 'id preservado e inativa respeitada');
  assert(!after.some(q => q.id === before[1].id), 'pergunta removida some');
  assert.strictEqual(after.filter(q => q.text === 'Pergunta nova de teste?').length, 1, 'nova pergunta inserida');
  e.resetQuestions();
  assert.strictEqual(e.listQuestions().length, 42, 'banco padrão restaurado');
}
// ids inexistentes em duplas não quebram resultados
e.reveal(2); e.startTalk(); e.endTalk(); e.reveal(3); e.startTalk(); e.endTalk();
{
  const { db } = require('../server/db');
  const g = e.groupsOfRound(1)[0];
  db.prepare('UPDATE groups SET members = ? WHERE id = ?').run(JSON.stringify([...g.members, 99999]), g.id);
  e.openRanking(); e.testRandomRankings(); e.computeResults();
  for (const id of g.members) { const r = e.meState(id).result; assert(r && r.match && r.match.id !== 99999, 'fantasma não vira conexão'); }
  assert.strictEqual(e.publicState().conn.rankingTotal, e.participants().length, 'fantasma não conta no total');
}

// pessoa que chegou depois aparece como "fora da rota" e o recálculo da rodada seguinte a inclui
e.resetConnections(); e.generate(); e.reveal(1); e.startTalk(); e.endTalk();
e.checkin(45);
assert(e.adminOverview().people.find(p => p.id === 45).late, 'check-in tardio sinalizado');
e.generate({ fromRound: 2 });
assert(e.groupsOfRound(1).flatMap(g => g.members).includes(45) === false, 'rodada 1 preservada');
assert(e.groupsOfRound(2).flatMap(g => g.members).includes(45), 'rodada 2 inclui a pessoa nova');

// ===== fluxo automático: encontro → conversa → 88 MPH → próxima → avaliação → resultados =====
e.resetConnections();
e.updateSettings({ autoFlow: true, findSeconds: 45, breakSeconds: 5, rankingSeconds: 90, roundSeconds: 240 });
e.startJourney();
assert.strictEqual(e.state.conn.phase, 'matching'); assert.strictEqual(e.state.conn.round, 1);
assert.strictEqual(e.state.conn.timer.kind, 'matching'); assert.strictEqual(e.state.conn.timer.duration, 45);
assert.throws(() => e.startJourney(), /já começaram|já aconteceu/, 'não recomeça viagens em andamento');
e.expireTimer(); assert.strictEqual(e.state.conn.phase, 'talk'); assert.strictEqual(e.state.conn.timer.kind, 'talk'); assert.strictEqual(e.state.conn.timer.duration, 240);
e.pause(); e.expireTimer(); // expirar com timer pausado não deve acontecer na prática; garante que não quebra
assert.strictEqual(e.state.conn.phase, 'roundEnd'); assert.strictEqual(e.state.conn.timer.kind, 'break');
e.expireTimer(); assert.strictEqual(e.state.conn.phase, 'matching'); assert.strictEqual(e.state.conn.round, 2);
e.skip(); assert.strictEqual(e.state.conn.phase, 'talk');
e.skip(); assert.strictEqual(e.state.conn.phase, 'roundEnd');
e.skip(); assert.strictEqual(e.state.conn.round, 3); assert.strictEqual(e.state.conn.phase, 'matching');
e.skip(); e.skip(); // conversa 3 e intervalo
assert.strictEqual(e.state.conn.phase, 'roundEnd');
e.skip(); assert.strictEqual(e.state.conn.phase, 'ranking'); assert.strictEqual(e.state.conn.timer.kind, 'ranking');
e.testRandomRankings();
assert.strictEqual(e.state.conn.phase, 'results', 'todos avaliaram → resultados automáticos');
assert.strictEqual(e.state.conn.timer, null);
// avaliação fecha pelo tempo mesmo sem todos avaliarem
e.resetConnections(); e.updateSettings({ findSeconds: 0, breakSeconds: 0 });
e.startJourney();
assert.strictEqual(e.state.conn.phase, 'matching'); assert.strictEqual(e.state.conn.timer, null, 'findSeconds 0 → sem timer de encontro');
e.skip(); assert.strictEqual(e.state.conn.phase, 'talk');
e.skip(); assert.strictEqual(e.state.conn.phase, 'matching', 'breakSeconds 0 → próxima viagem na hora'); assert.strictEqual(e.state.conn.round, 2);
e.skip(); e.skip(); e.skip(); e.skip();
assert.strictEqual(e.state.conn.phase, 'ranking');
e.submitRanking(1, { 1: 1, 2: 2, 3: 3 });
assert.strictEqual(e.state.conn.phase, 'ranking');
e.expireTimer();
assert.strictEqual(e.state.conn.phase, 'results', 'timer da avaliação → resultados');

// blocos, telão e settings
e.setBlock('standby');
assert.strictEqual(e.publicState().block, 'standby', 'bloco de espera');
e.setScene('clock'); assert.strictEqual(e.publicState().screen.scene, 'clock');
e.setScene('x'); assert.strictEqual(e.publicState().screen.scene, 'auto');
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
assert.strictEqual(hinted.area, undefined, 'dicas sem área');
e.updateSettings({ showFormHints: false });
assert.strictEqual(e.publicPerson(pedro, true).hints, undefined, 'dicas podem ser desligadas');

e.clearTimer();
console.log('OK · fluxo completo validado');
