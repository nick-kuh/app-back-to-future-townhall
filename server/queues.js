// Monta a fila de perguntas de cada dupla em uma rodada.
// - Prioriza as perguntas da "era" da rodada (presente / passado / futuro).
// - Nenhuma pessoa recebe pergunta que já viu em rodada anterior.
// - Cada dupla começa em um ponto diferente da lista (rotação), então duplas
//   vizinhas não discutem a mesma pergunta ao mesmo tempo.
const { shuffle } = require('./matching');

const ERAS = {
  presente: { key: 'presente', label: 'PRESENTE', year: '1985', led: 'OUT 26 1985 01:21', icon: '⚡', tagline: 'Hill Valley, 1985 · quem você é hoje' },
  passado: { key: 'passado', label: 'PASSADO', year: '1955', led: 'NOV 05 1955 06:00', icon: '🕰️', tagline: 'Hill Valley, 1955 · de onde você veio' },
  futuro: { key: 'futuro', label: 'FUTURO', year: '2015', led: 'OUT 21 2015 16:29', icon: '🛹', tagline: 'Hill Valley, 2015 · para onde você vai' },
};
const ROUND_ERA = ['presente', 'passado', 'futuro'];
const eraOfRound = r => ERAS[ROUND_ERA[(r - 1) % ROUND_ERA.length]];

function buildQueues({ groups, round, questions, seenByPerson }) {
  const era = eraOfRound(round).key;
  const active = questions.filter(q => q.active);
  const eraQs = shuffle(active.filter(q => q.era === era));
  const otherQs = shuffle(active.filter(q => q.era !== era));
  const rotate = (arr, i) => {
    if (!arr.length) return [];
    const off = i % arr.length;
    return arr.slice(off).concat(arr.slice(0, off));
  };
  return groups.map((members, i) => {
    const seen = new Set();
    for (const id of members) for (const q of (seenByPerson[id] || [])) seen.add(q);
    const list = [...rotate(eraQs, i), ...rotate(otherQs, i)].filter(q => !seen.has(q.id));
    // garantia: se tudo já foi visto (banco pequeno), libera o banco inteiro
    const final = list.length ? list : [...rotate(eraQs, i), ...rotate(otherQs, i)];
    return final.map(q => q.id);
  });
}

module.exports = { buildQueues, ERAS, ROUND_ERA, eraOfRound };
