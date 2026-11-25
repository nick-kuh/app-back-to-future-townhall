// Reiniciar: tudo de uma vez ou um bloco por vez (POST /api/admin/reset). Confere que cada escopo apaga só o que
// promete e que o que foi preparado (pessoas, fotos, perguntas, roteiro, conteúdo) continua lá.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert/strict');
const crypto = require('crypto');

const PORT = 4300 + Math.floor(Math.random() * 90), B = `http://localhost:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'th-reset-'));
const srv = spawn(process.execPath, ['--no-warnings', path.join(__dirname, '..', 'server', 'index.js')], { env: { ...process.env, PORT: String(PORT), DATA_DIR, ADMIN_PASSWORD: 'teste', FOTOS_PACK: path.join(DATA_DIR, 'sem-pacote') }, stdio: ['ignore', 'pipe', 'inherit'] });
const call = async (method, url, body, auth = true) => {
  const r = await fetch(B + url, { method, headers: { 'Content-Type': 'application/json', Origin: B, ...(auth ? { 'x-admin-key': 'teste' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await r.json(); } catch { /* sem corpo */ }
  return { status: r.status, json };
};
const waitUp = async () => { for (let i = 0; i < 50; i++) { try { await fetch(B + '/health'); return; } catch { await new Promise(r => setTimeout(r, 100)); } } throw new Error('servidor não subiu'); };
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

(async () => {
  try {
    await waitUp();
    const ov = async () => (await call('GET', '/api/admin/overview')).json, state = async () => (await call('GET', '/api/state', undefined, false)).json;
    const reset = (scope, extra) => call('POST', '/api/admin/reset', { scope, ...extra }), action = (type, extra) => call('POST', '/api/admin/action', { type, ...extra });
    let o = await ov(); const steps = o.settings.steps, id = k => steps.find(s => (s.type === 'cena' ? s.cena : s.type === 'sucesso' ? s.activity : s.type) === k).id, go = k => call('POST', '/api/admin/step', { id: id(k) });
    const cena = (kind, a) => call('POST', '/api/admin/cena', { kind, ...a });
    const tokenOf = async name => { const p = (await call('GET', '/api/people', undefined, false)).json.find(x => x.name === name); return (await call('POST', '/api/checkin', { personId: p.id }, false)).json.token; };

    // deixa o evento "usado": check-ins, viagens, votos, respostas, mensagem do Doc, cenas avançadas, foto, pergunta editada
    // (cada chamada usa duas pessoas diferentes: o Sucesso pede um intervalo de 2 s entre respostas da mesma pessoa)
    const NAMES = ['Claudia Meira', 'Fermin Grandas', 'Luciano Barbosa', 'Monserrat Diaz', 'William Manganeli', 'Nicolas Kuhnast', 'Thaiz Cabral', 'Caio Sousa']; let turn = 0;
    async function useEverything() {
      await action('testCheckinAll');
      const token = await tokenOf(NAMES[turn++]), token2 = await tokenOf(NAMES[turn++]);
      await go('connections'); await action('startJourney');
      await go('reflexao'); await call('POST', '/api/admin/reflexao', { action: 'open', idx: 0 }); await call('POST', '/api/admin/reflexao', { action: 'fake', n: 5 });
      await go('d2'); const room = (await ov()).sucesso.roomId;
      await call('POST', `/api/rooms/${room}/activities/d2/command`, { action: 'start' });
      let r = await call('POST', '/api/sucesso/answer', { token, answer: 'Entregamos o Phoenix', clientRequestId: crypto.randomUUID() }, false); assert.equal(r.status, 200, JSON.stringify(r.json));
      await go('d4'); await call('POST', `/api/rooms/${room}/activities/d4/command`, { action: 'start' });
      r = await call('POST', '/api/sucesso/answer', { token: token2, answer: 'Dobrar a adoção de IA', clientRequestId: crypto.randomUUID() }, false); assert.equal(r.status, 200, JSON.stringify(r.json));
      r = await call('POST', '/api/admin/doc', { action: 'generate', ai: false }); assert.equal(r.status, 200, JSON.stringify(r.json));
      await go('almanaque'); await cena('almanaque', { action: 'mes', mes: 6 });
      await go('reconhecimento'); await cena('reconhecimento', { action: 'fase', fase: 'premios' }); await cena('reconhecimento', { action: 'abrir', premio: 0 }); await cena('reconhecimento', { action: 'indicados' }); await cena('reconhecimento', { action: 'raio' }); await cena('reconhecimento', { action: 'vencedor' });
      await go('intervalo'); await cena('intervalo', { action: 'start' });
      await go('mph'); await cena('mph', { action: 'go' });
      await new Promise(done => setTimeout(done, 300));
      return token;
    }
    const snap = async () => { const x = await ov(), c = x.cenas.state; return { in: x.counts.checkedIn, conn: x.state.conn.phase, votes: x.reflexao.paradas.reduce((a, p) => a + p.votes, 0), d2: x.sucesso.acts.d2.responseCount, d4: x.sucesso.acts.d4.responseCount, doc: !!x.state.doc.message, mes: c.almanaque.mes, premios: c.reconhecimento.feitos.length, iv: c.intervalo.phase, mph: !!c.mph.at, step: x.settings.steps.findIndex(s => s.id === x.state.step) }; };

    await call('POST', '/api/admin/photos', { files: [{ name: 'will.png', data: PNG }] });
    await call('POST', '/api/admin/cena', { action: 'config', config: { intervalo: { min: 20 } } });
    await action('settings', { settings: { closingText: 'Texto do encerramento', roundSeconds: 90 } });
    let token = await useEverything();
    const used = { in: 48, conn: 'matching', votes: 5, d2: 1, d4: 1, doc: true, mes: 6, premios: 1, iv: 'run', mph: true, step: steps.findIndex(s => s.cena === 'mph') };
    assert.deepEqual(await snap(), used, 'o evento está em uso');

    // só o Doc reinicia; escopo desconhecido é recusado
    let r = await call('POST', '/api/admin/reset', { scope: 'all' }, false); assert.equal(r.status, 401);
    r = await reset('xyz'); assert.equal(r.status, 400); r = await reset('cena:agenda'); assert.equal(r.status, 400, 'cena sem estado não tem o que reiniciar');
    assert.deepEqual(await snap(), used, 'pedidos recusados não mexem em nada');

    // ---- um bloco por vez: só ele volta ao começo ----
    r = await reset('cena:mph'); assert.equal(r.status, 200); assert.deepEqual(await snap(), { ...used, mph: false });
    r = await reset('cena:intervalo'); assert.deepEqual(await snap(), { ...used, mph: false, iv: 'idle' });
    r = await reset('cena:reconhecimento'); assert.deepEqual(await snap(), { ...used, mph: false, iv: 'idle', premios: 0 }); assert.equal((await ov()).cenas.state.reconhecimento.fase, 'intro');
    r = await reset('cena:almanaque'); assert.deepEqual(await snap(), { ...used, mph: false, iv: 'idle', premios: 0, mes: -1 });
    r = await reset('doc'); assert.deepEqual(await snap(), { ...used, mph: false, iv: 'idle', premios: 0, mes: -1, doc: false });
    r = await reset('sucesso:d2'); await new Promise(done => setTimeout(done, 300)); assert.deepEqual(await snap(), { ...used, mph: false, iv: 'idle', premios: 0, mes: -1, doc: false, d2: 0 }, 'só a dinâmica 02 perde as respostas');
    r = await reset('sucesso'); await new Promise(done => setTimeout(done, 300)); assert.deepEqual(await snap(), { ...used, mph: false, iv: 'idle', premios: 0, mes: -1, doc: false, d2: 0, d4: 0 });
    r = await reset('reflexao'); assert.deepEqual(await snap(), { ...used, mph: false, iv: 'idle', premios: 0, mes: -1, doc: false, d2: 0, d4: 0, votes: 0 }); assert.equal((await ov()).reflexao.open, null);
    r = await reset('connections'); o = await ov(); assert.equal(o.state.conn.phase, 'idle'); assert.equal(o.rounds[0].groups.length, 0); assert.equal(o.counts.checkedIn, 48, 'reiniciar as Conexões mantém os check-ins');
    r = await reset('roteiro'); assert.equal(r.status, 200); assert.equal((await snap()).step, 0); assert.equal((await state()).block, 'welcome'); assert.equal((await ov()).counts.checkedIn, 48, 'voltar o roteiro não apaga nada');
    // check-in: todo mundo sai, e as Conexões vão junto
    await go('connections'); await action('startJourney'); assert.equal((await ov()).state.conn.phase, 'matching');
    r = await reset('checkin'); o = await ov(); assert.equal(o.counts.checkedIn, 0); assert.equal(o.state.conn.phase, 'idle'); assert.equal(o.rounds[0].groups.length, 0);
    assert.equal((await call('GET', '/api/me?token=' + token, undefined, false)).json.ok, false, 'o celular volta para a escolha do nome');

    // ---- cenas de uma vez ----
    token = await useEverything(); assert.deepEqual(await snap(), used);
    r = await reset('cenas'); assert.deepEqual(await snap(), { ...used, mes: -1, premios: 0, iv: 'idle', mph: false });

    // ---- tudo, mantendo os check-ins ----
    token = await useEverything();
    r = await reset('all', { keepCheckins: true }); assert.equal(r.status, 200); await new Promise(done => setTimeout(done, 400));
    const zero = { in: 48, conn: 'idle', votes: 0, d2: 0, d4: 0, doc: false, mes: -1, premios: 0, iv: 'idle', mph: false, step: 0 };
    assert.deepEqual(await snap(), zero, 'tudo no começo, com as pessoas ainda a bordo');
    assert.equal((await call('GET', '/api/me?token=' + token, undefined, false)).json.ok, true, 'o celular continua logado');
    let st = await state(); assert.equal(st.block, 'welcome'); assert.equal(st.presentation, null); assert.equal(st.cena, null);

    // ---- tudo ----
    token = await useEverything();
    r = await reset('all'); assert.equal(r.status, 200); await new Promise(done => setTimeout(done, 400));
    assert.deepEqual(await snap(), { ...zero, in: 0 }, 'tudo no começo, sem check-ins');
    assert.equal((await call('GET', '/api/me?token=' + token, undefined, false)).json.ok, false);

    // ---- o que foi preparado continua lá ----
    o = await ov();
    assert.equal(o.people.length, 48); assert.ok(o.people.find(p => p.name === 'William Manganeli').photo, 'as fotos ficam');
    assert.equal(o.questions.length, 30); assert.equal(o.settings.steps.length, steps.length); assert.deepEqual(o.settings.steps.map(s => s.id), steps.map(s => s.id), 'o roteiro fica');
    assert.equal(o.settings.closingText, 'Texto do encerramento'); assert.equal(o.settings.roundSeconds, 90); assert.equal(o.cenas.config.intervalo.min, 20, 'o conteúdo das cenas fica');
    assert.equal(o.reflexao.config.projects.length, 36);
    // os comandos antigos continuam funcionando (ensaios e integrações)
    await action('testCheckinAll'); r = await action('resetEvent'); assert.equal(r.status, 200); assert.equal((await ov()).counts.checkedIn, 0);
    console.log('OK · reiniciar: tudo (com e sem os check-ins), cada bloco separado, e o que foi preparado continua lá');
  } catch (e) {
    console.error('FALHOU:', e); process.exitCode = 1;
  } finally {
    srv.kill(); fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }
})();
