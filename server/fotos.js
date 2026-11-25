// Fotos de perfil dos viajantes.
// - Ficam no banco (tabela photos), uma por pessoa, e são servidas em /api/photo/<id>.
// - Chegam pelo Painel do Doc (Preparar → Pessoas → Importar fotos): vários arquivos de uma vez, cada um com o
//   nome da pessoa no nome do arquivo ("claudia guid.jpg", "will.jpg", "Alex Gonçalves.jpg"…). O app descobre de
//   quem é cada foto comparando o nome do arquivo com a lista de pessoas.
// - Se existir a pasta server/seed/fotos (ou a apontada por FOTOS_DIR), as fotos dela entram sozinhas quando o
//   banco começa vazio: útil onde o banco zera a cada reinício.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db } = require('./db');

const MAX_BYTES = 400 * 1024; // cada foto (o painel reduz para 320 px antes de enviar)
const SEED_DIR = process.env.FOTOS_DIR || path.join(__dirname, 'seed', 'fotos');
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

  // Pasta de fotos que acompanha a instalação: entra sozinha quando ainda não há nenhuma foto no banco.
  function seedFromDir(people, dir = SEED_DIR) {
    if (count() > 0) return null;
    let names; try { names = fs.readdirSync(dir).filter(f => /\.(jpe?g|png|webp)$/i.test(f)); } catch { return null; }
    if (!names.length) return null;
    const taken = new Set(); let n = 0;
    for (const f of names.sort((a, b) => a.localeCompare(b))) {
      const p = matchPerson(f, people); if (!p || taken.has(p.id)) continue;
      try { const buf = fs.readFileSync(path.join(dir, f)), mime = sniff(buf); if (!mime || buf.length > MAX_BYTES) continue; put(p.id, buf, mime); taken.add(p.id); n++; } catch { /* arquivo ilegível: segue */ }
    }
    return { files: names.length, matched: n };
  }

  return { url, get, put, setOne, remove, clear, count, prune, importMany, seedFromDir, match: matchPerson };
}

module.exports = { createFotos, matchPerson, score, norm, sniff };
