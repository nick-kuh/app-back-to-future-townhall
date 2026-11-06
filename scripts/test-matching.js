// Teste do algoritmo de pareamento com a lista real do townhall.
const { generateRounds, checkGroups, pairKey } = require('../server/matching');
const seed = require('../server/seed/people');

function run(people, label) {
  const byId = Object.fromEntries(people.map(p => [p.id, p]));
  const t0 = Date.now();
  const res = generateRounds({ people, totalRounds: 3 });
  const ms = Date.now() - t0;
  if (!res) { console.log(`${label}: SEM SOLUÇÃO (${ms} ms)`); return false; }
  const used = new Set();
  let okAll = true;
  for (const r of res.rounds) {
    const seen = new Set();
    for (const g of r.groups) {
      for (const id of g) { if (seen.has(id)) okAll = false; seen.add(id); }
      for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
        const k = pairKey(g[i], g[j]);
        if (used.has(k)) { okAll = false; console.log('  dupla repetida', k); }
        used.add(k);
      }
    }
    if (seen.size !== people.length) { okAll = false; console.log('  pessoas faltando na rodada', r.round); }
    const chk = checkGroups(r.groups, byId);
    const trios = r.groups.filter(g => g.length === 3).length;
    console.log(`${label} · rodada ${r.round}: ${r.groups.length} grupos (${trios} trio) · nível ${r.level} · ${chk.ok}/${chk.total} pares com área≠ e WL≠`);
  }
  console.log(`${label}: pior nível = ${res.worstLevel} · ${ms} ms · consistência ${okAll ? 'OK' : 'FALHOU'}`);
  return okAll && res.worstLevel === 'strict';
}

const all = seed.map((p, i) => ({ ...p, id: i + 1 }));
let strictCount = 0;
const N = 10;
for (let i = 0; i < N; i++) if (run(all, `47 pessoas #${i + 1}`)) strictCount++;
console.log(`\nSoluções estritas: ${strictCount}/${N}`);

// Subconjuntos (quem aparece no dia varia)
for (const n of [12, 23, 30, 40]) {
  const sub = all.slice().sort(() => Math.random() - 0.5).slice(0, n);
  run(sub, `${n} pessoas`);
}
if (strictCount < N) { console.error('FALHA: nem todas as execuções com 47 pessoas foram estritas'); process.exit(1); }

// Caso patológico: um WL com mais da metade dos presentes (20 WL2 entre 38) → nível estrito impossível.
// Precisa responder rápido (antes travava o servidor por dezenas de segundos) e devolver duplas válidas.
{
  const wl2 = all.filter(p => p.wl === 'WL2');
  const others = all.filter(p => p.wl !== 'WL2');
  for (const n of [38, 39]) {
    const subset = [...wl2, ...others.slice(0, n - wl2.length)];
    const t0 = Date.now();
    const res = generateRounds({ people: subset, totalRounds: 3 });
    const ms = Date.now() - t0;
    if (!res) { console.error('FALHA: sem solução para o caso patológico', n); process.exit(1); }
    const sizes = res.rounds.map(r => r.groups.flat().length);
    console.log(`patológico · ${n} presentes (20 WL2): ${ms} ms · nível ${res.worstLevel} · pessoas por rodada ${sizes.join('/')}`);
    if (ms > 3500) { console.error('FALHA: demorou demais'); process.exit(1); }
    if (res.worstLevel !== 'wl') { console.error('FALHA: nível inesperado', res.worstLevel); process.exit(1); }
    if (sizes.some(s => s !== n)) { console.error('FALHA: pessoas faltando'); process.exit(1); }
  }
}
// Grupos minúsculos (ensaio): 2, 3 e 5 pessoas funcionam repetindo duplas; 6 não repete.
for (const n of [2, 3, 4, 5, 6]) {
  const res = generateRounds({ people: all.slice(0, n), totalRounds: 3 });
  if (!res || res.rounds.length !== 3) { console.error('FALHA: grupo pequeno sem solução', n); process.exit(1); }
  if ((n < 6) !== !!res.repeats) { console.error('FALHA: flag de repetição errada para', n); process.exit(1); }
  console.log(`${n} pessoas: ok · repete duplas: ${res.repeats}`);
}
console.log('\nOK');
