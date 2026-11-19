// Cálculo das conexões a partir do ranking (1º = 3 pts, 2º = 2 pts, 3º = 1 pt).
// Para cada par que conversou: pontuação = pontos que A deu a B + pontos que B deu a A.
// A conexão sugerida de cada pessoa é o par com maior pontuação mútua
// (desempate: quem te colocou mais alto; depois quem você colocou mais alto).
const POINTS = { 1: 3, 2: 2, 3: 1 };

/**
 * @param {Array<{round:number, members:number[]}>} groups
 * @param {Object<number, Object<number, number>>} rankings  person -> round -> rank
 * @param {number[]} personIds
 */
function computeResults({ groups, rankings, personIds }) {
  const partners = {}; // person -> [{id, round}]
  for (const g of groups) {
    for (const a of g.members) for (const b of g.members) {
      if (a === b) continue;
      (partners[a] = partners[a] || []).push({ id: b, round: g.round });
    }
  }
  const pts = (from, round) => POINTS[(rankings[from] || {})[round]] || 0;
  const out = {};
  for (const p of personIds) {
    const list = (partners[p] || []).map(({ id, round }) => {
      const mine = pts(p, round), theirs = pts(id, round);
      return { id, round, mine, theirs, score: mine + theirs };
    });
    list.sort((a, b) => b.score - a.score || b.theirs - a.theirs || b.mine - a.mine || Math.random() - 0.5);
    const top = list[0] || null;
    out[p] = { match: top ? top.id : null, score: top ? top.score : 0, detail: list, mutual: 0 };
  }
  for (const p of personIds) {
    const m = out[p].match;
    if (m && out[m] && out[m].match === p) out[p].mutual = 1;
  }
  return out;
}

module.exports = { computeResults, POINTS };
