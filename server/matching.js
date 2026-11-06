// Algoritmo de pareamento.
// Regras: área diferente + WL diferente; nunca repetir a mesma dupla entre as rodadas.
// Número ímpar de pessoas → forma-se um trio (compatível entre os três).
// Se não houver solução, relaxa as regras por rodada, nesta ordem:
//   1) libera WL (mantém área ≠)  2) libera área (mantém WL ≠)  3) sem restrição.

const WL_ORDER = { Estag: 0, WL1: 1, WL2: 2, WL3: 3 };

const LEVELS = [
  { id: 'strict', label: 'área ≠ e WL ≠', needs: ['area', 'wl'], ok: (a, b) => a.area !== b.area && a.wl !== b.wl },
  { id: 'wl', label: 'área ≠ (WL liberado)', needs: ['area'], ok: (a, b) => a.area !== b.area },
  { id: 'area', label: 'WL ≠ (área liberada)', needs: ['wl'], ok: (a, b) => a.wl !== b.wl },
  { id: 'all', label: 'sem restrição', needs: [], ok: () => true },
];

// Condição necessária para um pareamento perfeito com "atributo ≠": nenhuma classe
// pode ter mais que floor(n/2) pessoas (cada dupla/trio leva no máximo uma delas).
// Evita buscas longas em níveis que não têm solução (ex.: 20 WL2 entre 38 presentes).
function maxClass(people, key) {
  const m = new Map(); let max = 0;
  for (const p of people) { const v = (m.get(p[key]) || 0) + 1; m.set(p[key], v); if (v > max) max = v; }
  return max;
}
function feasible(people, L) {
  const half = Math.floor(people.length / 2);
  return L.needs.every(k => maxClass(people, k) <= half);
}

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
  if (--budget.n < 0 || Date.now() > budget.deadline) return null;
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

function matchRound(people, used, ok, trioHistory, deadline, allowRepeats) {
  const byId = Object.fromEntries(people.map(p => [p.id, p]));
  const ids = shuffle(people.map(p => p.id));
  const can = (a, b) => (allowRepeats || !used.has(pairKey(a, b))) && ok(byId[a], byId[b]);
  if (ids.length < 2) return ids.length ? null : [];
  if (ids.length % 2 === 0) return perfectMatching(ids, byId, can, { n: 6000, deadline });
  // ímpar: escolhe quem entra no trio (preferindo quem ainda não esteve em trio)
  const solos = shuffle(ids).sort((a, b) => (trioHistory.has(a) ? 1 : 0) - (trioHistory.has(b) ? 1 : 0));
  for (const solo of solos.slice(0, 12)) {
    if (Date.now() > deadline) return null;
    const pairs = perfectMatching(ids.filter(x => x !== solo), byId, can, { n: 6000, deadline });
    if (!pairs) continue;
    const hosts = shuffle(pairs.filter(([x, y]) => can(solo, x) && can(solo, y)));
    if (hosts.length) { hosts[0].push(solo); return pairs; }
  }
  return null;
}

/**
 * Gera as rodadas `fromRound..totalRounds`.
 * - Níveis sem solução possível são pulados (ver feasible).
 * - timeLimitMs: depois desse tempo, devolve a melhor solução já encontrada; a busca é
 *   abortada de vez em 2,5x esse tempo (o servidor nunca fica travado por minutos).
 * - Com menos de 6 pessoas não existem 3 rodadas sem repetir dupla: repete (ensaios).
 * @returns {{rounds:{round:number, level:string, groups:number[][]}[], worstLevel:string, worstLabel:string, repeats:boolean}|null}
 */
function generateRounds({ people, totalRounds = 3, fromRound = 1, usedPairs = new Set(), trioHistory = new Set(), attempts = 20, timeLimitMs = 2000 }) {
  if (people.length < 2) return null;
  const allowRepeats = people.length < 6;
  const firstLevel = Math.max(0, LEVELS.findIndex(L => feasible(people, L)));
  const bestPossible = (totalRounds - fromRound + 1) * firstLevel;
  const start = Date.now();
  const softDeadline = start + timeLimitMs, hardDeadline = start + timeLimitMs * 2.5;
  let best = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (best && Date.now() > softDeadline) break;
    if (Date.now() > hardDeadline) break;
    const used = new Set(usedPairs);
    const trios = new Set(trioHistory);
    const rounds = [];
    let failed = false;
    for (let r = fromRound; r <= totalRounds; r++) {
      let found = null, level = null;
      for (let li = firstLevel; li < LEVELS.length && !found; li++) {
        const L = LEVELS[li];
        for (let t = 0; t < 6 && !found; t++) found = matchRound(people, used, L.ok, trios, hardDeadline, allowRepeats);
        if (found) level = L.id;
      }
      if (!found) { failed = true; break; }
      rounds.push({ round: r, level, groups: found });
      for (const g of found) {
        for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) used.add(pairKey(g[i], g[j]));
        if (g.length === 3) g.forEach(id => trios.add(id));
      }
    }
    if (failed) continue;
    const score = rounds.reduce((acc, r) => acc + LEVELS.findIndex(L => L.id === r.level), 0);
    if (!best || score < best.score) best = { rounds, score };
    if (score <= bestPossible) break;
  }
  if (!best) return null;
  const worst = best.rounds.reduce((w, r) => Math.max(w, LEVELS.findIndex(L => L.id === r.level)), 0);
  return { rounds: best.rounds, worstLevel: LEVELS[worst].id, worstLabel: LEVELS[worst].label, repeats: allowRepeats, ms: Date.now() - start };
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

module.exports = { generateRounds, checkGroups, pairKey, LEVELS, shuffle, WL_ORDER, feasible };
