// Cria o pacote criptografado de fotos de perfil que acompanha o app (server/seed/fotos.enc).
//   FOTOS_KEY="a chave" node scripts/fotos-pack.js <pasta com as fotos>
// O nome de cada arquivo diz de quem é a foto (nome completo, parte do nome ou apelido). O pacote só abre no
// servidor que tiver a mesma FOTOS_KEY nas variáveis de ambiente; no repositório ficam só dados cifrados.
process.env.DB_PATH = process.env.DB_PATH || ':memory:';
const fs = require('fs');
const path = require('path');
const { pack, unpack, matchPerson, sniff, SEED_PACK } = require('../server/fotos');

const dir = process.argv[2], secret = process.env.FOTOS_KEY;
if (!dir || !secret) { console.error('Uso: FOTOS_KEY="a chave" node scripts/fotos-pack.js <pasta com as fotos>'); process.exit(1); }
const people = require('../server/seed/people').map((p, i) => ({ ...p, id: i + 1 }));
const files = fs.readdirSync(dir).filter(f => /\.(jpe?g|png|webp)$/i.test(f)).sort((a, b) => a.localeCompare(b))
  .map(f => ({ name: f, data: fs.readFileSync(path.join(dir, f)) })).filter(f => sniff(f.data));
if (!files.length) { console.error('Nenhuma imagem JPG, PNG ou WebP nessa pasta.'); process.exit(1); }
const out = pack(files, secret);
if (unpack(out, secret).length !== files.length) throw new Error('O pacote não abriu de volta: nada foi gravado.');
fs.writeFileSync(SEED_PACK, out);
const owners = new Map(), semDono = [];
for (const f of files) { const p = matchPerson(f.name, people); if (p && !owners.has(p.id)) owners.set(p.id, f.name); else semDono.push(f.name); }
console.log(`Pacote gravado em ${path.relative(process.cwd(), SEED_PACK)}: ${files.length} fotos, ${Math.round(out.length / 1024)} KB.`);
console.log(`Com a lista de pessoas padrão: ${owners.size} fotos com dono.`);
if (semDono.length) console.log(`Sem dono na lista padrão (entram se a pessoa for adicionada): ${semDono.join(', ')}`);
const sem = people.filter(p => !owners.has(p.id)).map(p => p.name); if (sem.length) console.log(`Pessoas sem foto: ${sem.join(', ')}`);
