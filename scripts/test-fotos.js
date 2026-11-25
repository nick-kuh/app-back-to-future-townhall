// Fotos de perfil: de quem é cada arquivo (pelo nome), importação, validação e onde a foto aparece.
process.env.DB_PATH = ':memory:';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert/strict');
const { matchPerson, norm, sniff, pack, unpack } = require('../server/fotos');
const { Engine } = require('../server/engine');

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='; // 1 × 1
const png = () => 'data:image/png;base64,' + PNG;

/* ---------------- 1) de quem é a foto ---------------- */
{
  const people = require('../server/seed/people').map((p, i) => ({ ...p, id: i + 1 }));
  const who = label => (matchPerson(label, people) || {}).name || null;
  // os nomes dos arquivos enviados pela organização (apelidos, abreviações e erros de digitação incluídos)
  const FILES = {
    'Alderley.jpg': 'Alderley Mendonça', 'Ale Santos.jpg': 'Alexandre Santos', 'ale soares.jpg': 'Alexandre Soares', 'Alex Gon#U00e7alves.jpg': 'Alex Gonçalves', 'amanda.jpg': 'Amanda Papucci',
    'Ana Cardoso.jpg': 'Ana Cardoso', 'bolivar.jpg': 'Fernando Bolivar', 'bruno.jpg': 'Bruno Theodoro', 'caio souza.jpg': 'Caio Sousa', 'carolina pasq.jpg': 'Carolina Pasqualin',
    'claudia guid.jpg': 'Claudia Guiducci', 'claudia meira.jpg': 'Claudia Meira', 'claudia sawada.jpg': 'Claudia Sawada', 'Douglas.jpg': 'Douglas Hamasaki', 'Estela Tirconia.jpg': 'Estela Tiscornia',
    'evelyn aguiar.jpg': null, 'Fabio mariani.jpg': 'Fabio Mariani', 'Felipe zompero.jpg': 'Felipe Zompero', 'fermin.jpg': 'Fermin Grandas', 'franscisco navarrete.jpg': 'Francisco Navarrete',
    'gabriel candido.jpg': 'Gabriel Candido', 'Geovanna.jpg': 'Geovanna Moreira', 'giovana romao.jpg': 'Giovana Romão', 'horacio.jpg': 'Horacio Mendez', 'italo.jpg': 'Italo V Santos',
    'jesus.jpg': 'Jesus Regajo', 'Kaique.jpg': 'Kaique Oliveira', 'liliana.jpg': 'Liliana Marchueta', 'liza bornia.jpg': 'Liza Bornia', 'lucas barbosa.jpg': 'Lucas Barbosa', 'Luciano.jpg': 'Luciano Barbosa',
    'maria eduarda.jpg': 'Maria E Oliveira', 'marianna.jpg': 'Marianna Dellamea', 'maximilliano.jpg': 'Maximiliano Lalla', 'mayara gomes.jpg': 'Mayara Gomes', 'mayara tavares.jpg': 'Mayara Tavares',
    'monse.jpg': 'Monserrat Diaz', 'nicolas.jpg': 'Nicolas Kuhnast', 'patricia gois.jpg': 'Patricia Gois', 'pedro teixeira.jpg': 'Pedro Teixeira', 'rafael silotoo.jpg': 'Rafael Silotto',
    'renato malvino.jpg': null, 'resck.jpg': 'Felipe Resck', 'Scapin.jpg': 'Rodrigo Scapin', 'Thaiz cabral.jpg': 'Thaiz Cabral', 'vini deffendi.jpg': 'Vinicius Deffendi', 'Vini santos.jpg': 'Vinicius Santos', 'will.jpg': 'William Manganeli',
  };
  for (const [file, name] of Object.entries(FILES)) assert.equal(who(file), name, file);
  const owners = Object.values(FILES).filter(Boolean); assert.equal(owners.length, 46); assert.equal(new Set(owners).size, 46, 'ninguém recebe duas fotos');
  assert.deepEqual(people.map(p => p.name).filter(n => !owners.includes(n)), ['Jonathan Toledo'], 'só uma pessoa fica sem foto');
  // nomes escritos nas cenas: só valem quando apontam para uma pessoa só
  assert.equal(who('Caio Souza'), 'Caio Sousa'); assert.equal(who('Monserrat Diaz'), 'Monserrat Diaz'); assert.equal(who('Fermín Grandas'), 'Fermin Grandas'); assert.equal(who('Lucas'), 'Lucas Barbosa'); assert.equal(who('Giovana'), 'Giovana Romão');
  assert.equal(who('Vinicius'), null, 'dois Vinicius: empate'); assert.equal(who('Felipe'), null, 'dois Felipes: empate'); assert.equal(who('Claudia'), null); assert.equal(who('Mayara'), null);
  assert.equal(who('Fulano de Tal'), null); assert.equal(who(''), null); assert.equal(who('.jpg'), null);
  assert.equal(norm('Alex Gon#U00e7alves.JPG'), 'alex goncalves'); assert.equal(norm('  Thaíz_Cabral (1).png'), 'thaiz cabral 1');
  assert.equal(sniff(Buffer.from(PNG, 'base64')), 'image/png'); assert.equal(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2])), 'image/jpeg'); assert.equal(sniff(Buffer.from('<svg onload=alert(1)>')), null);
  console.log('OK · fotos: os 48 arquivos enviados casam com as pessoas certas (46 com dono, 2 fora da lista)');
}

/* ---------------- 2) no motor ---------------- */
{
  const e = new Engine(), id = name => e.listPeople().find(p => p.name === name).id;
  assert.ok(e.listPeople().every(p => p.photo === null), 'sem pasta de fotos, ninguém começa com foto');
  const r = e.importPhotos([{ name: 'will.png', data: png() }, { name: 'claudia guid.png', data: PNG }, { name: 'renato malvino.png', data: png() }, { name: 'monse.png', data: 'data:image/png;base64,' + Buffer.from('não é imagem').toString('base64') },
    { name: 'will (2).png', data: png() }, { name: 'bolivar.png', data: 'data:image/png;base64,' + Buffer.alloc(500 * 1024, 1).toString('base64') }]);
  assert.deepEqual(r.matched.map(m => m.person), ['William Manganeli', 'Claudia Guiducci']);
  assert.deepEqual(r.unmatched.map(u => u.file), ['renato malvino.png', 'monse.png', 'will (2).png', 'bolivar.png']);
  assert.match(r.unmatched[1].reason, /não é uma imagem/); assert.match(r.unmatched[2].reason, /já recebeu/); assert.match(r.unmatched[3].reason, /grande demais/);
  assert.equal(r.missing.length, 45); assert.ok(!r.missing.includes('William Manganeli'));
  const will = e.personById(id('William Manganeli')); assert.match(will.photo, /^\/api\/photo\/\d+\?v=[0-9a-f]{10}$/);
  assert.equal(e.publicPerson(will).photo, will.photo, 'a foto vai para os outros viajantes'); assert.equal(e.publicPerson(e.personById(id('Jonathan Toledo'))).photo, undefined);
  assert.equal(e.adminOverview().people.find(p => p.name === 'Claudia Guiducci').photo.split('?')[0], `/api/photo/${id('Claudia Guiducci')}`);
  const f = e.fotos.get(will.id); assert.equal(f.mime, 'image/png'); assert.equal(f.data.toString('base64'), PNG); assert.equal(e.fotos.get(99999), null);
  assert.equal(e.photoByName('William Manganeli'), will.photo); assert.equal(e.photoByName('Felipe'), null);
  // a dupla das Conexões e o resultado levam a foto
  e.testCheckinAll(); e.generate(); e.reveal(1);
  const g = e.groupOfPerson(will.id, 1), partner = g.members.find(x => x !== will.id), me = e.meState(partner);
  assert.equal(me.group.partners.find(p => p.id === will.id).photo, will.photo, 'o celular da dupla recebe a foto');
  // uma pessoa: trocar e tirar; excluir a pessoa leva a foto junto
  e.setPhoto(id('Jonathan Toledo'), png()); assert.ok(e.personById(id('Jonathan Toledo')).photo);
  assert.throws(() => e.setPhoto(id('Jonathan Toledo'), 'data:text/html;base64,' + Buffer.from('<script>').toString('base64')), /não é uma imagem/); assert.throws(() => e.setPhoto(99999, png()), /não encontrada/);
  e.removePhoto(id('Jonathan Toledo')); assert.equal(e.personById(id('Jonathan Toledo')).photo, null);
  e.resetConnections(); const gone = id('Claudia Guiducci'); e.deletePerson(gone); assert.equal(e.fotos.get(gone), null); assert.equal(e.fotos.count(), 1);
  e.resetEvent(); assert.equal(e.fotos.count(), 1, 'resetar o evento não apaga as fotos');
  // pasta de fotos da instalação: entra quando o banco não tem nenhuma foto
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'th-fotos-'));
  for (const n of ['claudia meira.png', 'fermin.png', 'quem e esse.png', 'leia-me.txt']) fs.writeFileSync(path.join(dir, n), Buffer.from(PNG, 'base64'));
  assert.equal(e.fotos.seedFromDir(e.listPeople(), dir), null, 'com fotos no banco, a pasta não mexe em nada');
  e.fotos.clear(); assert.deepEqual(e.fotos.seedFromDir(e.listPeople(), dir), { files: 3, matched: 2 }); assert.ok(e.personById(id('Fermin Grandas')).photo); assert.equal(e.fotos.count(), 2);
  assert.equal(e.fotos.seedFromDir(e.listPeople(), path.join(dir, 'nao-existe')), null); fs.rmSync(dir, { recursive: true, force: true });
  // pacote criptografado da instalação: só abre com a chave; sem ela, o app segue com as iniciais
  const KEY = 'uma-chave-de-teste-bem-comprida', img = Buffer.from(PNG, 'base64');
  const bundle = pack([{ name: 'claudia meira.png', data: img }, { name: 'will.png', data: img }, { name: 'renato malvino.png', data: img }, { name: 'nota.txt', data: Buffer.from('texto') }], KEY);
  assert.ok(bundle.subarray(0, 10).equals(Buffer.from('BTTFFOTOS1'))); assert.ok(!bundle.includes('claudia') && !bundle.includes(img.subarray(0, 8)), 'nem os nomes nem as imagens aparecem no pacote');
  assert.deepEqual(unpack(bundle, KEY).map(f => f.name), ['claudia meira.png', 'will.png', 'renato malvino.png', 'nota.txt']); assert.ok(unpack(bundle, KEY)[0].data.equals(img));
  assert.throws(() => unpack(bundle, 'outra-chave-qualquer-123'), /não abre/); assert.throws(() => unpack(Buffer.from('lixo'), KEY), /formato/); assert.throws(() => pack([], 'curta'), /16 caracteres/);
  const tampered = Buffer.from(bundle); tampered[tampered.length - 1] ^= 1; assert.throws(() => unpack(tampered, KEY), /não abre/, 'pacote adulterado não abre');
  const file = path.join(os.tmpdir(), `th-fotos-${process.pid}.enc`); fs.writeFileSync(file, bundle);
  e.fotos.clear();
  assert.equal(e.fotos.seedFromPack(e.listPeople(), { file: file + '.nao-existe', secret: KEY }), null, 'sem pacote, nada acontece');
  assert.deepEqual(e.fotos.seedFromPack(e.listPeople(), { file, secret: '' }), { locked: true, reason: 'falta a variável de ambiente FOTOS_KEY' }); assert.equal(e.fotos.seedStatus(), 'locked'); assert.equal(e.adminOverview().fotosSeed, 'locked');
  assert.equal(e.fotos.seedFromPack(e.listPeople(), { file, secret: 'chave-errada-123456789' }).locked, true); assert.equal(e.fotos.count(), 0);
  assert.deepEqual(e.fotos.seedFromPack(e.listPeople(), { file, secret: KEY }), { files: 4, matched: 2 }); assert.equal(e.fotos.seedStatus(), 'ok'); assert.ok(e.personById(id('Claudia Meira')).photo);
  assert.equal(e.fotos.seedFromPack(e.listPeople(), { file, secret: KEY }), null, 'com fotos no banco, o pacote não mexe em nada');
  // quem entra na lista depois ganha a foto que já estava no pacote
  const novo = e.addPerson({ name: 'Renato Malvino', wl: 'WL1', area: 'Strategy' }); assert.ok(novo.photo, 'pessoa nova com foto no pacote já entra com foto');
  const outro = e.addPerson({ name: 'Renata M.' }); assert.equal(outro.photo, null); e.removePhoto(novo.id); e.updatePerson(novo.id, { name: 'Renato Malvino' }); assert.ok(e.personById(novo.id).photo);
  fs.rmSync(file, { force: true });
  console.log('OK · fotos no motor: importar, validar, trocar, tirar, pasta e pacote criptografado da instalação, foto na dupla');
}

/* ---------------- 3) pelo servidor ---------------- */
const PORT = 4200 + Math.floor(Math.random() * 90), B = `http://localhost:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'th-fotos-srv-'));
const env = { ...process.env, PORT: String(PORT), DATA_DIR, ADMIN_PASSWORD: 'teste', FOTOS_DIR: path.join(DATA_DIR, 'sem-pasta') }; delete env.DB_PATH;
const srv = spawn(process.execPath, ['--no-warnings', path.join(__dirname, '..', 'server', 'index.js')], { env, stdio: ['ignore', 'pipe', 'inherit'] });
const call = async (method, url, body, auth = true) => {
  const r = await fetch(B + url, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { 'x-admin-key': 'teste' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const buf = Buffer.from(await r.arrayBuffer()); let json = null; try { json = JSON.parse(buf.toString()); } catch { /* imagem */ }
  return { status: r.status, json, buf, headers: r.headers };
};
const waitUp = async () => { for (let i = 0; i < 50; i++) { try { await fetch(B + '/health'); return; } catch { await new Promise(r => setTimeout(r, 100)); } } throw new Error('servidor não subiu'); };
(async () => {
  try {
    await waitUp();
    let r = await call('POST', '/api/admin/photos', { files: [{ name: 'will.png', data: png() }] }, false); assert.equal(r.status, 401, 'só o Doc importa fotos');
    r = await call('POST', '/api/admin/photos', { files: [{ name: 'will.png', data: png() }, { name: 'monse.png', data: png() }, { name: 'luciano.png', data: png() }, { name: 'caio souza.png', data: png() }, { name: 'x.png', data: png() }] });
    assert.equal(r.status, 200); assert.equal(r.json.matched.length, 4); assert.equal(r.json.unmatched.length, 1);
    const people = (await call('GET', '/api/people', undefined, false)).json, will = people.find(p => p.name === 'William Manganeli'), semFoto = people.find(p => p.name === 'Jonathan Toledo');
    assert.ok(will.photo); assert.equal(semFoto.photo, undefined);
    r = await call('GET', will.photo, undefined, false); assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'image/png'); assert.match(r.headers.get('cache-control'), /immutable/); assert.equal(r.buf.toString('base64'), PNG);
    r = await call('GET', `/api/photo/${will.id}`, undefined, false); assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-cache', 'sem a versão no endereço, o navegador confere de novo');
    r = await call('GET', `/api/photo/${semFoto.id}`, undefined, false); assert.equal(r.status, 404); r = await call('GET', '/api/photo/abc', undefined, false); assert.equal(r.status, 404);
    r = await call('PUT', `/api/admin/people/${semFoto.id}/photo`, { data: png() }, false); assert.equal(r.status, 401);
    r = await call('PUT', `/api/admin/people/${semFoto.id}/photo`, { data: png() }); assert.equal(r.status, 200);
    r = await call('DELETE', `/api/admin/people/${semFoto.id}/photo`); assert.equal(r.status, 200); assert.equal((await call('GET', `/api/photo/${semFoto.id}`, undefined, false)).status, 404);
    // nas cenas: quem fala nas boas-vindas e os indicados dos prêmios ganham a foto pelo nome
    const steps = (await call('GET', '/api/admin/overview')).json.settings.steps, go = k => call('POST', '/api/admin/step', { id: steps.find(s => s.cena === k).id });
    await go('boasvindas'); let st = (await call('GET', '/api/state', undefined, false)).json;
    assert.deepEqual(st.cena.pessoas.map(p => p.fotos.length), [1, 1, 1]); assert.equal(st.cena.pessoas[1].fotos[0], will.photo);
    await go('reconhecimento'); st = (await call('GET', '/api/state', undefined, false)).json;
    assert.equal(st.cena.premios[0].indicados[0].nome, 'Caio Souza'); assert.equal(st.cena.premios[0].indicados[0].fotos.length, 1); assert.deepEqual(st.cena.premios[0].indicados[2].fotos, [], 'sem foto importada, ficam as iniciais');
    console.log('OK · fotos no servidor: importação com login, endereço com versão e fotos nas cenas');
  } catch (e) {
    console.error('FALHOU:', e); process.exitCode = 1;
  } finally {
    srv.kill(); fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }
})();
