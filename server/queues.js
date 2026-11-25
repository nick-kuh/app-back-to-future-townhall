// Monta a fila de perguntas de cada dupla em uma rodada.
// O banco tem três categorias (do "Speed Dating · Banco de Perguntas"): Quebra-gelo, Conexão e Além do óbvio.
// - As perguntas são SORTEADAS: cada dupla recebe a sua própria ordem, embaralhada de forma independente.
// - Modo "rodada" (padrão): cada viagem tem a sua categoria (1 · Quebra-gelo, 2 · Conexão, 3 · Além do óbvio);
//   a dupla recebe primeiro as perguntas dessa categoria e, se passar por todas, as das outras.
// - Modo "mix": em toda viagem a dupla recebe as três categorias intercaladas (uma de cada, em ordem sorteada).
// - Nenhuma pessoa recebe pergunta que já viu em rodada anterior.
// - Duplas diferentes começam por perguntas diferentes enquanto houver perguntas sobrando na categoria.
const { shuffle } = require('./matching');

// As "eras" são o tema de cada viagem (1985 · 1955 · 2015): continuam valendo para as telas das Conexões.
const ERAS = {
  presente: { key: 'presente', label: 'PRESENTE', year: '1985', led: 'OUT 26 1985 01:21', icon: '⚡', tagline: 'Hill Valley, 1985 · quem você é hoje' },
  passado: { key: 'passado', label: 'PASSADO', year: '1955', led: 'NOV 05 1955 06:00', icon: '🕰️', tagline: 'Hill Valley, 1955 · de onde você veio' },
  futuro: { key: 'futuro', label: 'FUTURO', year: '2015', led: 'OUT 21 2015 16:29', icon: '🛹', tagline: 'Hill Valley, 2015 · para onde você vai' },
};
const ROUND_ERA = ['presente', 'passado', 'futuro'];
const eraOfRound = r => ERAS[ROUND_ERA[(r - 1) % ROUND_ERA.length]];

// Categorias das perguntas (mesmas cores do PDF: verde, amarelo, azul)
const CATEGORIES = {
  quebragelo: { key: 'quebragelo', label: 'QUEBRA-GELO', name: 'Quebra-gelo', icon: '🧊', dot: '🟢', color: '#39ff6a', hint: 'Perguntas leves e fáceis para começar a conversa' },
  conexao: { key: 'conexao', label: 'CONEXÃO', name: 'Conexão', icon: '🤝', dot: '🟡', color: '#ffd21f', hint: 'Perguntas que estimulam histórias e descobertas' },
  alem: { key: 'alem', label: 'ALÉM DO ÓBVIO', name: 'Além do óbvio', icon: '🔭', dot: '🔵', color: '#5cc8ff', hint: 'Perguntas um pouco mais reflexivas, mas ainda confortáveis' },
};
const CAT_KEYS = Object.keys(CATEGORIES);
const ROUND_CAT = ['quebragelo', 'conexao', 'alem'];
const catOfRound = r => CATEGORIES[ROUND_CAT[(Math.max(1, r) - 1) % ROUND_CAT.length]];
const QUESTION_MODES = ['rodada', 'mix'];
// Aceita o nome da categoria escrito de vários jeitos (e as "eras" do banco antigo): devolve a chave ou null.
const LEGACY = { presente: 'quebragelo', passado: 'conexao', futuro: 'alem' };
function catKey(v) {
  const s = String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  if (CATEGORIES[s]) return s;
  if (LEGACY[s]) return LEGACY[s];
  if (s.startsWith('quebra') || s === 'gelo' || s === 'icebreaker') return 'quebragelo';
  if (s.startsWith('conex')) return 'conexao';
  if (s.startsWith('alem') || s === 'obvio') return 'alem';
  return null;
}

function buildQueues({ groups, round, questions, seenByPerson, mode = 'rodada' }) {
  const active = questions.filter(q => q.active).map(q => ({ ...q, cat: catKey(q.cat) || ROUND_CAT[0] }));
  const main = catOfRound(round).key;
  const firsts = new Map(); // quantas duplas já começam por cada pergunta (para espalhar o começo)
  return groups.map(members => {
    const seen = new Set();
    for (const id of members) for (const q of (seenByPerson[id] || [])) seen.add(q);
    // devolve a fila e o trecho inicial de onde pode sair a primeira pergunta (head), em blocos de "step" perguntas
    const build = pool => {
      const of = cat => shuffle(pool.filter(q => q.cat === cat));
      if (mode === 'mix') { // uma de cada categoria por vez; a ordem das categorias é sorteada a cada volta
        const piles = CAT_KEYS.map(of).filter(p => p.length), full = piles.length ? Math.min(...piles.map(p => p.length)) * piles.length : 0, out = [];
        const step = piles.length || 1;
        while (piles.some(p => p.length)) for (const p of shuffle(piles.filter(x => x.length))) out.push(p.shift());
        return { list: out, head: full, step };
      }
      const first = of(main);
      return { list: [...first, ...shuffle(pool.filter(q => q.cat !== main))], head: first.length, step: 1 };
    };
    const fresh = active.filter(q => !seen.has(q.id));
    // garantia: se tudo já foi visto (banco pequeno), libera o banco inteiro
    const { list, head, step } = build(fresh.length ? fresh : active);
    // a dupla começa pela pergunta menos usada como "primeira" até aqui (duplas vizinhas não abrem com a mesma)
    let best = 0;
    for (let i = step; i < (head || list.length); i += step) if ((firsts.get(list[i].id) || 0) < (firsts.get(list[best].id) || 0)) best = i;
    if (best > 0) list.unshift(...list.splice(best, step));
    if (list.length) firsts.set(list[0].id, (firsts.get(list[0].id) || 0) + 1);
    return list.map(q => q.id);
  });
}

module.exports = { buildQueues, ERAS, ROUND_ERA, eraOfRound, CATEGORIES, CAT_KEYS, ROUND_CAT, catOfRound, catKey, QUESTION_MODES };
