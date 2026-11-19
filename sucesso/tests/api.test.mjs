import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../scripts/sqlite-db.mjs';
import { createWorker } from '../server/api.js';

const origin = 'https://townhall.example';
const ownerA = 'presenter-a';
const ownerB = 'presenter-b';

function fixture(t) {
  const DB = openDatabase();
  t.after(() => DB.close());
  const worker = createWorker({ '/index.html': '<h1>Início</h1>', '/painel.html': '<h1>Painel</h1>', '/participar.html': '<h1>Participar</h1>' });
  async function request(path, { owner, method = 'GET', body, headers = {} } = {}) {
    const h = new Headers(headers);
    if (owner) h.set('oai-authenticated-user-id', owner);
    if (body !== undefined) h.set('Content-Type', 'application/json');
    const response = await worker.fetch(new Request(origin + path, { method, headers: h, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), { DB });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, headers: response.headers, data };
  }
  async function create(owner = ownerA) {
    const result = await request('/api/rooms', { owner, method: 'POST', body: { name: 'Townhall de teste' } });
    assert.equal(result.status, 201);
    return result.data;
  }
  const status = async id => (await request(`/api/rooms/${id}/status`)).data;
  const command = (id, activityId, action, owner = ownerA) => request(`/api/rooms/${id}/activities/${activityId}/command`, { owner, method: 'POST', body: { action } });
  async function submission(id, activityId = 'd1', overrides = {}) {
    const current = await status(id);
    return { activityId, roundId: current.activities.find(a => a.id === activityId).roundId, clientRequestId: randomUUID(), participantId: randomUUID(), name: 'Pessoa de teste', answer: 'Colaboração', ...overrides };
  }
  const send = (id, body) => request(`/api/rooms/${id}/responses`, { method: 'POST', body });
  const snapshot = (id, after = 0, owner = ownerA) => request(`/api/rooms/${id}/snapshot?after=${after}`, { owner });
  return { DB, worker, request, create, status, command, submission, send, snapshot };
}

test('D1 adapter returns metadata and rolls a batch back atomically', t => {
  const f = fixture(t);
  const id = randomUUID();
  const inserted = f.DB.prepare('INSERT INTO rooms(id,owner_id,name,created_at) VALUES(?,?,?,?)').bind(id, ownerA, 'First', 1).run();
  assert.equal(inserted.meta.changes, 1);
  assert.equal(typeof inserted.meta.last_row_id, 'number');
  assert.equal(f.DB.prepare('SELECT name FROM rooms WHERE id=?').bind(id).first('name'), 'First');
  assert.equal(f.DB.prepare('SELECT name FROM rooms WHERE id=?').bind(randomUUID()).first(), null);
  assert.throws(() => f.DB.batch([
    f.DB.prepare('UPDATE rooms SET name=? WHERE id=?').bind('Changed', id),
    f.DB.prepare('INSERT INTO rooms(id,owner_id,name,created_at) VALUES(?,?,?,?)').bind(id, ownerA, 'Duplicate', 2),
  ]));
  assert.equal(f.DB.prepare('SELECT name FROM rooms WHERE id=?').bind(id).first().name, 'First');
  const results = f.DB.batch([f.DB.prepare('SELECT * FROM rooms'), f.DB.prepare('SELECT * FROM activities')]);
  assert.equal(results[0].results.length, 1);
  assert.equal(results[1].results.length, 0);
});

test('local database preserves records and applies migrations only once on reopening', () => {
  const directory = mkdtempSync(join(tmpdir(), 'townhall-db-test-'));
  const filename = join(directory, 'test.sqlite');
  let db;
  try {
    db = openDatabase(filename);
    const id = randomUUID();
    db.prepare('INSERT INTO rooms(id,owner_id,name,created_at) VALUES(?,?,?,?)').bind(id, ownerA, 'Persisted', 1).run();
    db.close();
    db = openDatabase(filename);
    assert.equal(db.prepare('SELECT name FROM rooms WHERE id=?').bind(id).first().name, 'Persisted');
    const migrations = readdirSync(new URL('../drizzle/', import.meta.url)).filter(name => name.endsWith('.sql')).sort();
    const applied = db.prepare('SELECT name FROM __local_migrations ORDER BY name').all().results;
    assert.deepEqual(applied.map(row => row.name), migrations);
  } finally {
    db?.close();
    unlinkSync(filename);
    rmdirSync(directory);
  }
});

test('rooms and presenter operations are isolated between two owners', async t => {
  const f = fixture(t);
  assert.equal((await f.request('/api/rooms')).status, 401);
  assert.equal((await f.request('/api/rooms', { method: 'POST', body: { name: 'Anonymous' } })).status, 401);
  const a = await f.create(ownerA), b = await f.create(ownerB);
  assert.deepEqual((await f.request('/api/rooms', { owner: ownerA })).data.rooms.map(x => x.id), [a.id]);
  assert.deepEqual((await f.request('/api/rooms', { owner: ownerB })).data.rooms.map(x => x.id), [b.id]);
  assert.equal((await f.snapshot(a.id, 0, ownerB)).status, 403);
  assert.equal((await f.command(a.id, 'd2', 'start', ownerB)).status, 403);
  assert.equal((await f.command(a.id, 'd2', 'start', ownerA)).status, 200);
  assert.equal((await f.snapshot(b.id, 0, ownerB)).status, 200);
});

test('anonymous phones can read status and submit, but cannot read answers or administer', async t => {
  const f = fixture(t), room = await f.create();
  const status = await f.request(`/api/rooms/${room.id}/status`);
  assert.equal(status.status, 200);
  assert.equal(status.data.activities.length, 4);
  assert.equal(Object.hasOwn(status.data, 'responses'), false);
  assert.equal(Object.hasOwn(status.data.room, 'owner_id'), false);
  assert.equal((await f.request(`/api/rooms/${room.id}/snapshot`)).status, 401);
  assert.equal((await f.request(`/api/rooms/${room.id}/activities/d1/command`, { method: 'POST', body: { action: 'end' } })).status, 401);
  assert.equal((await f.send(room.id, await f.submission(room.id))).status, 201);
  assert.equal((await f.snapshot(room.id)).data.responses.length, 1);
  const panel = await f.request('/painel');
  assert.equal(panel.status, 302);
  assert.match(panel.headers.get('location'), /\/signin-with-chatgpt\?/);
  assert.equal((await f.request(`/participar/${room.id}`)).status, 200);
});

test('name is required in d1 but optional in d4, and text is bounded', async t => {
  const f = fixture(t), room = await f.create();
  assert.equal((await f.send(room.id, await f.submission(room.id, 'd1', { name: '  ' }))).status, 400);
  assert.equal((await f.send(room.id, await f.submission(room.id, 'd1', { answer: ' ' }))).status, 400);
  assert.equal((await f.send(room.id, await f.submission(room.id, 'd1', { answer: 'a'.repeat(201) }))).status, 400);
  assert.equal((await f.send(room.id, await f.submission(room.id, 'd1', { name: 'a'.repeat(81) }))).status, 400);
  await f.command(room.id, 'd4', 'start');
  const result = await f.send(room.id, await f.submission(room.id, 'd4', { name: '', answer: '  Mais tempo para aprender  ' }));
  assert.equal(result.status, 201);
  assert.equal(result.data.response.name, 'Anônimo');
  assert.equal(result.data.response.answer, 'Mais tempo para aprender');
});

test('retrying a confirmed send is idempotent even after collection closes', async t => {
  const f = fixture(t), room = await f.create(), body = await f.submission(room.id);
  const original = await f.send(room.id, body);
  assert.equal(original.status, 201);
  await f.command(room.id, 'd1', 'end');
  const retry = await f.send(room.id, body);
  assert.equal(retry.status, 200);
  assert.equal(retry.data.duplicate, true);
  assert.equal(retry.data.response.id, original.data.response.id);
  assert.equal((await f.send(room.id, { ...body, answer: 'Changed content' })).status, 409);
  assert.equal((await f.send(room.id, { ...body, participantId: randomUUID() })).status, 409);
  assert.equal((await f.snapshot(room.id)).data.responses.length, 1);
});

test('clearing answers creates a new round and rejects delayed sends from the old round', async t => {
  const f = fixture(t), room = await f.create(), oldBody = await f.submission(room.id);
  assert.equal((await f.send(room.id, oldBody)).status, 201);
  const oldSnapshot = (await f.snapshot(room.id)).data;
  const cleared = await f.command(room.id, 'd1', 'clear');
  assert.equal(cleared.status, 200);
  assert.notEqual(cleared.data.activity.roundId, oldBody.roundId);
  assert.equal((await f.send(room.id, { ...oldBody, clientRequestId: randomUUID(), participantId: randomUUID() })).status, 409);
  const newResult = await f.send(room.id, await f.submission(room.id));
  assert.equal(newResult.status, 201);
  assert.ok(newResult.data.response.sequence > oldSnapshot.cursor);
  const fresh = (await f.snapshot(room.id, oldSnapshot.cursor)).data;
  assert.equal(fresh.responses.length, 1);
  assert.equal(fresh.responses[0].roundId, cleared.data.activity.roundId);
});

test('start, pause, resume, end, and reset are enforced for participant writes', async t => {
  const f = fixture(t), room = await f.create();
  assert.equal((await f.send(room.id, await f.submission(room.id, 'd2'))).status, 409);
  const started = await f.command(room.id, 'd2', 'start');
  assert.equal(started.data.activity.phase, 'run');
  assert.ok(started.data.activity.endsAt > Date.now());
  assert.equal((await f.send(room.id, await f.submission(room.id, 'd2'))).status, 201);
  const paused = await f.command(room.id, 'd2', 'pause');
  assert.equal(paused.data.activity.phase, 'paused');
  assert.equal(paused.data.activity.endsAt, null);
  assert.equal((await f.send(room.id, await f.submission(room.id, 'd2'))).status, 409);
  await f.command(room.id, 'd2', 'start');
  assert.equal((await f.send(room.id, await f.submission(room.id, 'd2'))).status, 201);
  await f.command(room.id, 'd2', 'end');
  assert.equal((await f.send(room.id, await f.submission(room.id, 'd2'))).status, 409);
  assert.equal((await f.command(room.id, 'd2', 'start')).status, 409);
  assert.equal((await f.command(room.id, 'd2', 'reset')).data.activity.phase, 'idle');
  assert.equal((await f.command(room.id, 'd2', 'start')).status, 200);
});

test('the server rejects a late response without relying on a panel timer or status poll', async t => {
  const f = fixture(t), room = await f.create();
  await f.command(room.id, 'd3', 'start');
  const pending = await f.submission(room.id, 'd3');
  f.DB.prepare('UPDATE activities SET ends_at=? WHERE room_id=? AND id=?').bind(Date.now() - 100, room.id, 'd3').run();
  assert.equal((await f.send(room.id, pending)).status, 409);
  const state = (await f.status(room.id)).activities.find(x => x.id === 'd3');
  assert.equal(state.phase, 'done');
  assert.equal(state.remainingSeconds, 0);
  assert.equal((await f.snapshot(room.id)).data.responses.length, 0);
});

test('snapshots use an incremental cursor and resetting preserves accepted answers', async t => {
  const f = fixture(t), room = await f.create();
  const empty = (await f.snapshot(room.id)).data;
  assert.equal(empty.cursor, 0);
  assert.equal(empty.responses.length, 0);
  const first = await f.send(room.id, await f.submission(room.id));
  const initial = (await f.snapshot(room.id)).data;
  assert.equal(initial.responses.length, 1);
  assert.equal(initial.cursor, first.data.response.sequence);
  assert.equal((await f.snapshot(room.id, initial.cursor)).data.responses.length, 0);
  const second = await f.send(room.id, await f.submission(room.id));
  const delta = (await f.snapshot(room.id, initial.cursor)).data;
  assert.deepEqual(delta.responses.map(x => x.id), [second.data.response.id]);
  const originalRound = initial.activities.find(x => x.id === 'd1').roundId;
  await f.command(room.id, 'd1', 'end');
  await f.command(room.id, 'd1', 'reset');
  const reloaded = (await f.snapshot(room.id)).data;
  assert.equal(reloaded.responses.length, 2);
  assert.equal(reloaded.activities.find(x => x.id === 'd1').roundId, originalRound);
  assert.equal((await f.snapshot(room.id, -1)).status, 400);
});

test('local workload: 100 concurrent phone clients are recorded once and retries stay idempotent', async t => {
  const f = fixture(t), room = await f.create(), current = await f.status(room.id);
  const roundId = current.activities.find(x => x.id === 'd1').roundId;
  const payloads = Array.from({ length: 100 }, (_, i) => ({ activityId: 'd1', roundId, clientRequestId: randomUUID(), participantId: randomUUID(), name: `Participante ${i + 1}`, answer: `Ideia ${i + 1}` }));
  const sent = await Promise.all(payloads.map(body => f.send(room.id, body)));
  assert.ok(sent.every(result => result.status === 201));
  assert.equal(new Set(sent.map(x => x.data.response.id)).size, 100);
  const panel = (await f.snapshot(room.id)).data;
  assert.equal(panel.responses.length, 100);
  assert.equal(new Set(panel.responses.map(x => x.sequence)).size, 100);
  const retries = await Promise.all(payloads.map(body => f.send(room.id, body)));
  assert.ok(retries.every(result => result.status === 200 && result.data.duplicate));
  assert.equal((await f.snapshot(room.id, panel.cursor)).data.responses.length, 0);
});

test('cross-origin writes and rapid duplicate participant submissions are rejected', async t => {
  const f = fixture(t), room = await f.create(), body = await f.submission(room.id);
  assert.equal((await f.request(`/api/rooms/${room.id}/responses`, { method: 'POST', body, headers: { Origin: 'https://unrelated.example' } })).status, 403);
  assert.equal((await f.send(room.id, body)).status, 201);
  assert.equal((await f.send(room.id, { ...body, clientRequestId: randomUUID() })).status, 429);
  assert.equal((await f.request(`/api/rooms/${randomUUID()}/status`)).status, 404);
});

test('inherited JavaScript property names are not accepted as activity identifiers', async t => {
  const f = fixture(t), room = await f.create(), body = await f.submission(room.id);
  for (const activityId of ['constructor', 'toString', '__proto__']) {
    assert.equal((await f.send(room.id, { ...body, activityId })).status, 400);
    assert.equal((await f.command(room.id, activityId, 'start')).status, 404);
  }
});

test('UUID fields reject arrays and objects instead of coercing malformed JSON into database binds', async t => {
  const f=fixture(t),room=await f.create(),body=await f.submission(room.id);
  for(const field of ['roundId','clientRequestId','participantId']){
    for(const value of [[body[field]],{toString:body[field]},null,123]){
      assert.equal((await f.send(room.id,{...body,[field]:value})).status,400);
    }
  }
  assert.equal((await f.snapshot(room.id)).data.responses.length,0);
});

test('concurrent presenter commands report a revision conflict rather than false success', async t => {
  const f=fixture(t),room=await f.create();
  await f.command(room.id,'d2','start');
  const results=await Promise.all(['pause','end'].map(action=>f.command(room.id,'d2',action)));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const accepted=results.find(r=>r.status===200);
  const actual=(await f.status(room.id)).activities.find(a=>a.id==='d2');
  assert.equal(actual.phase,accepted.data.activity.phase);
  assert.equal(actual.revision,accepted.data.activity.revision);
  assert.match(results.find(r=>r.status===409).data.error,/outra tela/);
});

test('a conflicting clear command does not delete answers after losing its revision check', async t => {
  const f=fixture(t),room=await f.create();
  await f.command(room.id,'d2','start');
  await f.send(room.id,await f.submission(room.id,'d2'));
  const [paused,cleared]=await Promise.all([f.command(room.id,'d2','pause'),f.command(room.id,'d2','clear')]);
  assert.deepEqual([paused.status,cleared.status].sort(),[200,409]);
  assert.equal((await f.snapshot(room.id)).data.responses.length,cleared.status===200?0:1);
});

test('status and snapshots project elapsed deadlines using only reads and no MAX cursor query', async t => {
  const f=fixture(t),room=await f.create();
  await f.command(room.id,'d2','start');
  f.DB.prepare('UPDATE activities SET ends_at=? WHERE room_id=? AND id=?').bind(Date.now()-100,room.id,'d2').run();
  const before=f.DB.prepare('SELECT * FROM activities WHERE room_id=? AND id=?').bind(room.id,'d2').first();
  const queries=[];
  const DB={prepare(sql){queries.push(sql);return f.DB.prepare(sql)},batch(statements){return f.DB.batch(statements)}};
  const status=await f.worker.fetch(new Request(`${origin}/api/rooms/${room.id}/status`),{DB});
  const data=await status.json();
  assert.equal(data.activities.find(a=>a.id==='d2').phase,'done');
  assert.equal(data.activities.find(a=>a.id==='d2').remainingSeconds,0);
  assert.equal(queries.length,2);
  assert.ok(queries.every(sql=>sql.startsWith('SELECT')));
  queries.length=0;
  const result=await f.worker.fetch(new Request(`${origin}/api/rooms/${room.id}/snapshot?after=42`,{headers:{'oai-authenticated-user-id':ownerA}}),{DB});
  const snapshot=await result.json();
  assert.equal(snapshot.cursor,42);
  assert.equal(queries.length,3);
  assert.ok(queries.every(sql=>sql.startsWith('SELECT')&&!/MAX\(sequence\)/.test(sql)));
  const after=f.DB.prepare('SELECT * FROM activities WHERE room_id=? AND id=?').bind(room.id,'d2').first();
  assert.equal(after.phase,before.phase);
  assert.equal(after.revision,before.revision);
});

test('a response body arriving after the database deadline is rejected even if the request began earlier', async t => {
  const f=fixture(t),room=await f.create();
  await f.command(room.id,'d3','start');
  const pending=await f.submission(room.id,'d3');
  f.DB.prepare('UPDATE activities SET ends_at=? WHERE room_id=? AND id=?').bind(Date.now()+60,room.id,'d3').run();
  const encoded=new TextEncoder().encode(JSON.stringify(pending));
  const delayedBody=new ReadableStream({async start(controller){await new Promise(resolve=>setTimeout(resolve,120));controller.enqueue(encoded);controller.close()}});
  const req=new Request(`${origin}/api/rooms/${room.id}/responses`,{method:'POST',headers:{'Content-Type':'application/json'},body:delayedBody,duplex:'half'});
  const res=await f.worker.fetch(req,{DB:f.DB});
  assert.equal(res.status,409);
  assert.match((await res.json()).error,/encerrado/);
  assert.equal((await f.snapshot(room.id)).data.responses.length,0);
});

test('write timestamps, rate limits and timer commands use the database clock despite a stale application clock', async t => {
  const f=fixture(t),room=await f.create(),pending=await f.submission(room.id);
  const originalNow=Date.now,actual=originalNow();
  try{
    Date.now=()=>actual-86400000;
    const secondRoom=await f.create();
    assert.ok(secondRoom.createdAt>=actual-5);
    const sent=await f.send(room.id,pending);
    assert.equal(sent.status,201);
    assert.ok(sent.data.response.createdAt>=actual-5);
    const started=await f.command(room.id,'d2','start');
    assert.equal(started.status,200);
    assert.ok(started.data.endsAt>=actual+119000);
    assert.ok(started.data.serverNow>=actual-5);
    Date.now=()=>actual+86400000;
    assert.equal((await f.send(room.id,{...pending,clientRequestId:randomUUID()})).status,429);
    const paused=await f.command(room.id,'d2','pause');
    assert.equal(paused.status,200);
    assert.equal(paused.data.phase,'paused');
    assert.ok(paused.data.remainingSeconds>=119);
  }finally{Date.now=originalNow}
});
