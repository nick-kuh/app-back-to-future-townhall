// Fotos de perfil dos viajantes.
// - Ficam no banco (tabela photos), uma por pessoa, e são servidas em /api/photo/<id>.
// - Chegam pelo Painel do Doc (Preparar → Pessoas → Importar fotos): vários arquivos de uma vez, cada um com o
//   nome da pessoa no nome do arquivo ("claudia guid.jpg", "will.jpg", "Alex Gonçalves.jpg"…). O app descobre de
//   quem é cada foto comparando o nome do arquivo com a lista de pessoas.
// - Fotos que acompanham a instalação entram sozinhas quando o banco começa sem nenhuma foto (útil onde o banco
//   zera a cada reinício):
//     · o pacote criptografado server/seed/fotos.enc, aberto com a chave da variável de ambiente FOTOS_KEY.
//       É assim que as fotos vão junto com o código sem ficarem visíveis num repositório público;
//     · ou a pasta server/seed/fotos (ou a de FOTOS_DIR), com os arquivos de imagem como estão.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db } = require('./db');

const MAX_BYTES = 400 * 1024; // cada foto (o painel reduz para 320 px antes de enviar)
const SEED_DIR = process.env.FOTOS_DIR || path.join(__dirname, 'seed', 'fotos');
const SEED_PACK = process.env.FOTOS_PACK || path.join(__dirname, 'seed', 'fotos.enc');
const MAGIC = Buffer.from('BTTFFOTOS1'); // início do pacote: identifica o formato
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

/* ---------- de quem é a foto? ---------- */
// "Alex Gon#U00e7alves.jpg" (acento escapado por alguns compactadores) → "alex goncalves"
const norm = s => String(s || '').replace(/#U([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/\.(jpe?g|png|webp)$/i, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function distance(a, b) { // distância de edição (para erros de digitação: "souza" × "sousa", "silotoo" × "silotto")
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// Quanto um pedaço do rótulo ("guid", "vini", "souza") combina com um pedaço do nome da pessoa. 0 = não combina.
function tokenScore(t, n) {
  if (t === n) return 10 + n.length;                                           // igual
  if (n.length === 1) return t[0] === n ? 1 : 0;                               // inicial no nome ("Maria E Oliveira" × "eduarda")
  if (t.length >= 3 && n.startsWith(t)) return 5 + t.length;                   // apelido ou abreviação ("vini", "pasq", "will")
  const lim = Math.min(t.length, n.length) >= 7 ? 2 : Math.min(t.length, n.length) >= 5 ? 1 : 0;
  return lim && distance(t, n) <= lim ? 3 + Math.min(t.length, n.length) - distance(t, n) : 0; // erro de digitação
}
// Pontuação do rótulo contra uma pessoa: todos os pedaços do rótulo precisam achar um pedaço diferente do nome.
function score(label, name) {
  // números soltos no nome do arquivo não contam ("will (2).jpg", "claudia meira 1.png")
  const ts = norm(label).split(' ').filter(t => t && !/^\d+$/.test(t)), ns = norm(name).split(' ').filter(Boolean), used = new Set();
  if (!ts.length || !ns.length) return 0;
  let total = 0;
  for (const t of ts) {
    let best = 0, at = -1;
    ns.forEach((n, i) => { if (used.has(i)) return; const s = tokenScore(t, n); if (s > best) { best = s; at = i; } });
    if (!best) return 0;
    used.add(at); total += best;
  }
  return total + (ts.length === ns.length ? 2 : 0); // nome completo vale um pouco mais
}
// A pessoa da lista que melhor combina com o rótulo; null se ninguém combina ou se há empate (ex.: só "Felipe" com dois Felipes).
function matchPerson(label, people) {
  let best = 0, who = null, tie = false;
  for (const p of people) { const s = score(label, p.name); if (s > best) { best = s; who = p; tie = false; } else if (s && s === best) tie = true; }
  return best && !tie ? who : null;
}

/* ---------- arquivos ---------- */
// Só imagens de verdade: confere a assinatura do arquivo (não o nome nem o tipo declarado)
function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}
function decode(data) { // aceita "data:image/jpeg;base64,…" ou só o base64
  const b64 = String(data || '').replace(/^data:[^;,]*;base64,/, '');
  if (!b64 || b64.length > MAX_BYTES * 1.4) fail('Foto grande demais (máximo de 400 KB). Reduza a imagem e tente de novo.');
  const buf = Buffer.from(b64, 'base64'), mime = sniff(buf);
  if (!mime) fail('O arquivo não é uma imagem JPG, PNG ou WebP.');
  if (buf.length > MAX_BYTES) fail('Foto grande demais (máximo de 400 KB). Reduza a imagem e tente de novo.');
  return { buf, mime };
}

/* ---------- pacote criptografado (AES-256-GCM) ----------
 * [MAGIC][sal 16][iv 12][etiqueta 16][conteúdo cifrado]; o conteúdo é um JSON [{ name, data (base64) }].
 * A chave sai da frase em FOTOS_KEY (scrypt). Sem a chave certa, o pacote não abre e não revela nem os nomes. */
const keyOf = (secret, salt) => crypto.scryptSync(String(secret), salt, 32);
function pack(files, secret) {
  if (!secret || String(secret).length < 16) fail('Defina FOTOS_KEY com pelo menos 16 caracteres para criar o pacote.');
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', keyOf(secret, salt), iv);
  const body = Buffer.concat([c.update(JSON.stringify(files.map(f => ({ name: f.name, data: Buffer.from(f.data).toString('base64') }))), 'utf8'), c.final()]);
  return Buffer.concat([MAGIC, salt, iv, c.getAuthTag(), body]);
}
function unpack(buf, secret) {
  if (!Buffer.isBuffer(buf) || buf.length < MAGIC.length + 44 || !buf.subarray(0, MAGIC.length).equals(MAGIC)) fail('O pacote de fotos não está no formato esperado.');
  let o = MAGIC.length; const salt = buf.subarray(o, o += 16), iv = buf.subarray(o, o += 12), tag = buf.subarray(o, o += 16);
  const d = crypto.createDecipheriv('aes-256-gcm', keyOf(secret, salt), iv); d.setAuthTag(tag);
  let json; try { json = Buffer.concat([d.update(buf.subarray(o)), d.final()]).toString('utf8'); } catch { fail('A chave das fotos (FOTOS_KEY) não abre este pacote.'); }
  return JSON.parse(json).map(f => ({ name: String(f.name), data: Buffer.from(String(f.data), 'base64') }));
}

function createFotos() {
  let versions = null; // id da pessoa → versão da foto (entra no endereço: o navegador guarda a foto e troca quando ela muda)
  const load = () => { versions = new Map(db.prepare('SELECT person_id, version FROM photos').all().map(r => [r.person_id, r.version])); };
  const ensure = () => { if (!versions) load(); return versions; };

  function put(personId, buf, mime) {
    const id = Number(personId), version = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10);
    db.prepare('INSERT INTO photos (person_id, mime, data, version, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(person_id) DO UPDATE SET mime = excluded.mime, data = excluded.data, version = excluded.version, updated_at = excluded.updated_at')
      .run(id, mime, buf, version, new Date().toISOString());
    ensure().set(id, version);
  }
  const url = personId => { const v = ensure().get(Number(personId)); return v ? `/api/photo/${Number(personId)}?v=${v}` : null; };
  const get = personId => { const r = db.prepare('SELECT mime, data, version FROM photos WHERE person_id = ?').get(Number(personId)); return r ? { mime: r.mime, data: Buffer.from(r.data), version: r.version } : null; };
  const remove = personId => { db.prepare('DELETE FROM photos WHERE person_id = ?').run(Number(personId)); ensure().delete(Number(personId)); };
  const clear = () => { db.exec('DELETE FROM photos'); load(); };
  const count = () => ensure().size;
  // fotos de quem não está mais na lista saem (pessoa excluída, lista substituída)
  const prune = () => { db.exec('DELETE FROM photos WHERE person_id NOT IN (SELECT id FROM people)'); load(); };

  // Importa várias fotos de uma vez: files = [{ name, data }]. Devolve o que casou, o que ficou sem dono e quem segue sem foto.
  function importMany(files, people) {
    const matched = [], unmatched = [], taken = new Map();
    for (const f of (Array.isArray(files) ? files : []).slice(0, 300)) {
      const name = String((f && f.name) || '').slice(0, 120);
      let img; try { img = decode(f && f.data); } catch (e) { unmatched.push({ file: name, reason: e.message }); continue; }
      const p = matchPerson(name, people);
      if (!p) { unmatched.push({ file: name, reason: 'ninguém na lista com esse nome (ou mais de uma pessoa possível)' }); continue; }
      if (taken.has(p.id)) { unmatched.push({ file: name, reason: `${p.name} já recebeu a foto "${taken.get(p.id)}" neste envio` }); continue; }
      put(p.id, img.buf, img.mime); taken.set(p.id, name); matched.push({ file: name, id: p.id, person: p.name });
    }
    const have = ensure();
    return { matched, unmatched, missing: people.filter(p => p.active !== false && !have.has(p.id)).map(p => p.name) };
  }
  const setOne = (personId, data) => { const img = decode(data); put(personId, img.buf, img.mime); };

  // Guarda as fotos de uma lista [{ name, data (Buffer) }], cada uma para a pessoa que o nome do arquivo indica
  function putAll(list, people) {
    const taken = new Set(); let n = 0;
    for (const f of list.slice().sort((x, y) => x.name.localeCompare(y.name))) {
      const p = matchPerson(f.name, people); if (!p || taken.has(p.id)) continue;
      const mime = sniff(f.data); if (!mime || f.data.length > MAX_BYTES) continue;
      put(p.id, f.data, mime); taken.add(p.id); n++;
    }
    return n;
  }
  // Pasta de fotos que acompanha a instalação: entra sozinha quando ainda não há nenhuma foto no banco.
  function seedFromDir(people, dir = SEED_DIR) {
    if (count() > 0) return null;
    let names; try { names = fs.readdirSync(dir).filter(f => /\.(jpe?g|png|webp)$/i.test(f)); } catch { return null; }
    if (!names.length) return null;
    const list = []; for (const f of names) { try { list.push({ name: f, data: fs.readFileSync(path.join(dir, f)) }); } catch { /* arquivo ilegível: segue */ } }
    return { files: names.length, matched: putAll(list, people) };
  }
  // Pacote criptografado que acompanha a instalação: mesma regra, e só abre com a chave de FOTOS_KEY.
  // seedStatus conta para o painel o que aconteceu: 'ok' | 'locked' (falta a chave ou ela não abre) | null (sem pacote).
  let seedStatus = null, seedList = []; // seedList: as fotos da instalação já abertas (para quem entrar na lista depois)
  function seedFromPack(people, { file = SEED_PACK, secret = process.env.FOTOS_KEY } = {}) {
    let buf; try { buf = fs.readFileSync(file); } catch { return null; }
    if (!secret) { seedStatus = 'locked'; return { locked: true, reason: 'falta a variável de ambiente FOTOS_KEY' }; }
    let list; try { list = unpack(buf, secret); } catch (e) { seedStatus = 'locked'; return { locked: true, reason: e.message.replace(/\.$/, '') }; }
    seedStatus = 'ok'; seedList = list;
    return count() > 0 ? null : { files: list.length, matched: putAll(list, people) };
  }
  // Alguém entrou na lista depois (ou teve o nome corrigido): se as fotos da instalação têm uma foto para essa pessoa, ela entra.
  function seedFor(personId, people) {
    const id = Number(personId); if (ensure().has(id) || !seedList.length) return false;
    const f = seedList.find(x => { const p = matchPerson(x.name, people); return p && p.id === id; }), mime = f && sniff(f.data);
    if (!mime || f.data.length > MAX_BYTES) return false;
    put(id, f.data, mime); return true;
  }

  return { url, get, put, setOne, remove, clear, count, prune, importMany, seedFromDir, seedFromPack, seedFor, seedStatus: () => seedStatus, match: matchPerson };
}

module.exports = { createFotos, matchPerson, score, norm, sniff, pack, unpack, SEED_PACK };
