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
    const people = (await call('GET', '/api/people')).json;
    for (const p of people.slice(0, 8)) await call('POST', '/api/checkin', { personId: p.id });
    r = await call('POST', '/api/admin/action', { type: 'startJourney' }); assert.equal(r.status, 200, JSON.stringify(r.json));
    let st = (await call('GET', '/api/state')).json; assert.equal(st.conn.phase, 'matching'); assert.equal(st.conn.timer.paused, false);

    // sala + dinâmica no telão: a viagem pausa
    const room = (await call('POST', '/api/rooms', { name: 'Ensaio' })).json; assert.ok(room.id);
    r = await call('POST', '/api/admin/presentation', { roomId: room.id, activityId: 'd3' });
    assert.equal(r.status, 200); assert.equal(r.json.presentation.activityId, 'd3');
    st = (await call('GET', '/api/state')).json;
    assert.equal(st.presentation.title, 'Uso de IA'); assert.equal(st.conn.timer.paused, true);
    r = await call('POST', '/api/admin/action', { type: 'skip' }); assert.equal(r.status, 409);
    r = await call('POST', '/api/admin/presentation', { roomId: room.id, activityId: 'd9' }); assert.equal(r.status, 400);

    // recebimento + resposta pública (sem login)
    r = await call('POST', `/api/rooms/${room.id}/activities/d3/command`, { action: 'start' }); assert.equal(r.json.phase, 'run');
    const status = (await call('GET', `/api/rooms/${room.id}/status`, undefined, { auth: false })).json;
    const roundId = status.activities.find(a => a.id === 'd3').roundId;
    assert.equal(status.presentation.activityId, 'd3');
    r = await call('POST', `/api/rooms/${room.id}/responses`, { activityId: 'd3', roundId, clientRequestId: crypto.randomUUID(), participantId: crypto.randomUUID(), name: 'Ana', answer: 'Agente de TPRM' }, { auth: false });
    assert.equal(r.status, 201);
    r = await call('GET', '/api/sucesso/screen', undefined, { auth: false });
    assert.equal(r.json.liveActivity.responseCount, 1); assert.equal(r.json.liveActivity.latestResponses, undefined); // respostas só para o Doc
    r = await call('GET', '/api/sucesso/screen');
    assert.equal(r.json.liveActivity.latestResponses[0].answer, 'Agente de TPRM');
    r = await call('GET', `/participar/${room.id}?d=d3`, undefined, { auth: false }); assert.equal(r.status, 200);

    // voltar ao townhall: a viagem retoma
    r = await call('POST', '/api/admin/presentation', { roomId: null }); assert.equal(r.json.presentation, null);
    st = (await call('GET', '/api/state')).json;
    assert.equal(st.presentation, null); assert.equal(st.conn.timer.paused, false);
    r = await call('POST', '/api/admin/action', { type: 'skip' }); assert.equal(r.status, 200);
    console.log('OK · townhall + De Volta para o Sucesso integrados');
  } catch (e) {
    console.error('FALHOU:', e); process.exitCode = 1;
  } finally {
    srv.kill(); fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }
})();
