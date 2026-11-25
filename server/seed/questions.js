// Banco de perguntas das Conexões: "SPEED DATING · Banco de Perguntas · Town Hall de Final de Ano · CDIO BPC LATAM".
// Três categorias (cat): 'quebragelo' | 'conexao' | 'alem'. As perguntas são sorteadas para cada dupla
// (ver server/queues.js). O admin pode editar, adicionar e desativar perguntas pelo painel.
const Q = [];
const add = (cat, list) => list.forEach(text => Q.push({ cat, text }));

// 🟢 QUEBRA-GELO · perguntas leves e fáceis para começar a conversa
add('quebragelo', [
  'Se este ano fosse um filme, qual seria o título e o gênero?',
  'Qual música mais tocou na sua vida este ano, e em que momento ela aparecia?',
  'Qual comida ou prato você descobriu este ano e quer comer de novo?',
  'Se você pudesse ganhar uma habilidade inútil, mas divertida, qual escolheria?',
  'Qual foi a lembrança mais engraçada do seu ano?',
  'Qual app, série ou conteúdo te acompanhou nos momentos de pausa?',
  'Qual é aquele item que você sempre leva consigo e que diz muito sobre você?',
  'Se você tivesse um dia extra no ano só para você, como ele seria do começo ao fim?',
  'Qual é a sua tradição favorita de fim de ano, mesmo que seja simples ou inusitada?',
  'Qual personagem de filme, série ou desenho tem mais a ver com você?',
]);

// 🟡 CONEXÃO · perguntas que estimulam histórias e descobertas
add('conexao', [
  'Qual momento deste ano foi mais marcante para você?',
  'Que atividade você descobriu ou retomou no seu tempo livre, e como isso começou?',
  'Qual lugar você visitou ou redescobriu este ano que te surpreendeu?',
  'Qual desafio, olhando para trás, virou uma boa história para contar?',
  'Qual decisão ousada você tomou e valeu a pena?',
  'Qual conversa inesperada com alguém ficou na sua cabeça?',
  'Que habilidade ou talento seu pouca gente aqui conhece?',
  'Qual foi a melhor recomendação que alguém te deu este ano: livro, lugar, receita ou série?',
  'Qual cheiro, sabor ou som te leva direto para a sua infância?',
  'Qual é uma história da sua cidade ou da sua família que você adora contar?',
]);

// 🔵 ALÉM DO ÓBVIO · perguntas um pouco mais reflexivas, mas ainda confortáveis
add('alem', [
  'Que experiência mudou sua forma de ver as coisas?',
  'Quem te ensinou algo importante este ano, mesmo sem perceber?',
  'Qual pequeno hábito da rotina fez diferença no seu bem-estar este ano?',
  'Do que você sentiu orgulho em silêncio este ano?',
  'Qual gentileza, recebida ou oferecida, marcou o seu ano?',
  'Se você pudesse mandar um recado para você mesmo de janeiro, o que diria?',
  'O que você quer levar deste ano para o próximo, e o que prefere deixar para trás?',
  'Que coisa nova você quer experimentar no próximo ano só pelo prazer de tentar?',
  'Qual sonho antigo ainda mora em você e merece um próximo capítulo?',
  'Se o próximo ano tivesse uma palavra-guia, qual seria e por quê?',
]);

module.exports = Q.map((q, i) => ({ ...q, sort_order: i + 1 }));
