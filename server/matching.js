// Algoritmo de pareamento.
// Regras: área diferente + WL diferente; nunca repetir a mesma dupla entre as rodadas.
// Número ímpar de pessoas → forma-se um trio (compatível entre os três).
// Se não houver solução, relaxa as regras por rodada, nesta ordem:
//   1) libera WL (mantém área ≠)  2) libera área (mantém WL ≠)  3) sem restrição.

const WL_ORDER = { Estag: 0, WL1: 1, WL2: 2, WL3: 3 };

const LEVELS = [
  { id: 'strict', label: 'área ≠ e WL ≠', ok: (a, b) => a.area !== b.area && a.wl !== b.wl },
  { id: 'wl', label: 'área ≠ (WL liberado)', ok: (a, b) => a.area !== b.area },
  { id: 'area', label: 'WL ≠ (área liberada)', ok: (a, b) => a.wl !== b.wl },
  { id: 'all', label: 'sem restrição', ok: () => true },
];

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Preferência "suave" (só ordena candidatos, não é regra):
// distância de WL maior (ex.: Estag ↔ WL2/WL3, WL1 ↔ WL3) e times diferentes.
function preference(a, b) {
  let s = 0;
  const wa = WL_ORDER[a.wl], wb = WL_ORDER[b.wl];
  if (wa !== undefined && wb !== undefined) {
    const d = Math.abs(wa - wb);
    if (d >= 2) s += 0.6; else if (d === 1) s += 0.2;
  }
  if (a.team && b.team && a.team !== b.team) s += 0.3;
  return s;
}

function perfectMatching(ids, byId, can, budget) {
  if (ids.length === 0) return [];
  if (--budget.n < 0) return null;
  let pick = null, pickOpts = null;
  for (const x of ids) {
    const opts = [];
    for (const y of ids) if (y !== x && can(x, y)) opts.push(y);
    if (opts.length === 0) return null;
    if (!pickOpts || opts.length < pickOpts.length) { pick = x; pickOpts = opts; }
  }
  const ordered = pickOpts
    .map(y => ({ y, s: Math.random() + preference(byId[pick], byId[y]) }))
    .sort((p, q) => q.s - p.s)
    .map(o => o.y);
  for (const y of ordered) {
    const rest = ids.filter(z => z !== pick && z !== y);
    const r = perfectMatching(rest, byId, can, budget);
    if (r) return [[pick, y], ...r];
  }
  return null;
}

function matchRound(people, used, ok, trioHistory) {
  const byId = Object.fromEntries(people.map(p => [p.id, p]));
  const ids = shuffle(people.map(p => p.id));
  const can = (a, b) => !used.has(pairKey(a, b)) && ok(byId[a], byId[b]);
  if (ids.length < 2) return ids.length ? null : [];
  if (ids.length % 2 === 0) return perfectMatching(ids, byId, can, { n: 20000 });
  // ímpar: escolhe quem entra no trio (preferindo quem ainda não esteve em trio)
  const solos = shuffle(ids).sort((a, b) => (trioHistory.has(a) ? 1 : 0) - (trioHistory.has(b) ? 1 : 0));
  for (const solo of solos.slice(0, 12)) {
    const pairs = perfectMatching(ids.filter(x => x !== solo), byId, can, { n: 20000 });
    if (!pairs) continue;
    const hosts = shuffle(pairs.filter(([x, y]) => can(solo, x) && can(solo, y)));
    if (hosts.length) { hosts[0].push(solo); return pairs; }
  }
  return null;
}

/**
 * Gera as rodadas `fromRound..totalRounds`.
 * @returns {{rounds:{round:number, level:string, groups:number[][]}[], worstLevel:string}|null}
 */
function generateRounds({ people, totalRounds = 3, fromRound = 1, usedPairs = new Set(), trioHistory = new Set(), attempts = 20 }) {
  let best = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const used = new Set(usedPairs);
    const trios = new Set(trioHistory);
    const rounds = [];
    let failed = false;
    for (let r = fromRound; r <= totalRounds; r++) {
      let found = null, level = null;
      for (const L of LEVELS) {
        for (let t = 0; t < 8 && !found; t++) found = matchRound(people, used, L.ok, trios);
        if (found) { level = L.id; break; }
      }
      if (!found) { failed = true; break; }
      rounds.push({ round: r, level, groups: found });
      for (const g of found) {
        for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) used.add(pairKey(g[i], g[j]));
        if (g.length === 3) g.forEach(id => trios.add(id));
      }
    }
    if (failed) continue;
    const score = rounds.reduce((s, r) => s + LEVELS.findIndex(L => L.id === r.level), 0);
    if (!best || score < best.score) best = { rounds, score };
    if (score === 0) break;
  }
  if (!best) return null;
  const worst = best.rounds.reduce((w, r) => Math.max(w, LEVELS.findIndex(L => L.id === r.level)), 0);
  return { rounds: best.rounds, worstLevel: LEVELS[worst].id, worstLabel: LEVELS[worst].label };
}

// Relatório de conformidade de um conjunto de grupos (para o painel do admin).
function checkGroups(groups, byId) {
  let ok = 0, total = 0;
  const detail = groups.map(g => {
    const flags = { area: true, wl: true };
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
      const a = byId[g[i]], b = byId[g[j]];
      total++;
      if (!a || !b) continue;
      if (a.area === b.area) flags.area = false;
      if (a.wl === b.wl) flags.wl = false;
      if (a.area !== b.area && a.wl !== b.wl) ok++;
    }
    return flags;
  });
  return { ok, total, detail };
}

module.exports = { generateRounds, checkGroups, pairKey, LEVELS, shuffle, WL_ORDER };
