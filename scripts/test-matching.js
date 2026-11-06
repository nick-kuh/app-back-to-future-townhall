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
console.log('\nOK');
