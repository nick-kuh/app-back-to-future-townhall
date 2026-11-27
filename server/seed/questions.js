// Banco de perguntas das Conexões: "SPEED DATING · Banco de Perguntas · Town Hall de Final de Ano · CDIO BPC LATAM".
// Três categorias (cat): 'quebragelo' | 'conexao' | 'alem'. As perguntas são sorteadas para cada dupla
// (ver server/queues.js). O admin pode editar, adicionar e desativar perguntas pelo painel.
// Cada pergunta vem em português e em espanhol: [português, español]. Quem escolhe "Español" no login vê a mesma
// pergunta (a dupla continua sincronizada) no seu idioma.
const Q = [];
const add = (cat, list) => list.forEach(([text, es]) => Q.push({ cat, text, es }));

// 🟢 QUEBRA-GELO · perguntas leves e fáceis para começar a conversa
add('quebragelo', [
  ['Se este ano fosse um filme, qual seria o título e o gênero?', 'Si este año fuera una película, ¿cuál sería el título y el género?'],
  ['Qual música mais tocou na sua vida este ano, e em que momento ela aparecia?', '¿Qué canción sonó más en tu vida este año y en qué momento aparecía?'],
  ['Qual comida ou prato você descobriu este ano e quer comer de novo?', '¿Qué comida o plato descubriste este año y quieres volver a comer?'],
  ['Se você pudesse ganhar uma habilidade inútil, mas divertida, qual escolheria?', 'Si pudieras tener una habilidad inútil pero divertida, ¿cuál elegirías?'],
  ['Qual foi a lembrança mais engraçada do seu ano?', '¿Cuál fue el recuerdo más gracioso de tu año?'],
  ['Qual app, série ou conteúdo te acompanhou nos momentos de pausa?', '¿Qué app, serie o contenido te acompañó en tus momentos de pausa?'],
  ['Qual é aquele item que você sempre leva consigo e que diz muito sobre você?', '¿Cuál es ese objeto que siempre llevas contigo y que dice mucho de ti?'],
  ['Se você tivesse um dia extra no ano só para você, como ele seria do começo ao fim?', 'Si tuvieras un día extra en el año solo para ti, ¿cómo sería de principio a fin?'],
  ['Qual é a sua tradição favorita de fim de ano, mesmo que seja simples ou inusitada?', '¿Cuál es tu tradición favorita de fin de año, aunque sea simple o poco común?'],
  ['Qual personagem de filme, série ou desenho tem mais a ver com você?', '¿Qué personaje de película, serie o dibujos animados se parece más a ti?'],
]);

// 🟡 CONEXÃO · perguntas que estimulam histórias e descobertas
add('conexao', [
  ['Qual momento deste ano foi mais marcante para você?', '¿Qué momento de este año fue el más significativo para ti?'],
  ['Que atividade você descobriu ou retomou no seu tempo livre, e como isso começou?', '¿Qué actividad descubriste o retomaste en tu tiempo libre y cómo empezó?'],
  ['Qual lugar você visitou ou redescobriu este ano que te surpreendeu?', '¿Qué lugar visitaste o redescubriste este año que te sorprendió?'],
  ['Qual desafio, olhando para trás, virou uma boa história para contar?', '¿Qué desafío, mirando hacia atrás, se convirtió en una buena historia para contar?'],
  ['Qual decisão ousada você tomou e valeu a pena?', '¿Qué decisión audaz tomaste y valió la pena?'],
  ['Qual conversa inesperada com alguém ficou na sua cabeça?', '¿Qué conversación inesperada con alguien se te quedó en la cabeza?'],
  ['Que habilidade ou talento seu pouca gente aqui conhece?', '¿Qué habilidad o talento tuyo conoce poca gente aquí?'],
  ['Qual foi a melhor recomendação que alguém te deu este ano: livro, lugar, receita ou série?', '¿Cuál fue la mejor recomendación que te dieron este año: libro, lugar, receta o serie?'],
  ['Qual cheiro, sabor ou som te leva direto para a sua infância?', '¿Qué olor, sabor o sonido te lleva directo a tu infancia?'],
  ['Qual é uma história da sua cidade ou da sua família que você adora contar?', '¿Cuál es una historia de tu ciudad o de tu familia que te encanta contar?'],
]);

// 🔵 ALÉM DO ÓBVIO · perguntas um pouco mais reflexivas, mas ainda confortáveis
add('alem', [
  ['Que experiência mudou sua forma de ver as coisas?', '¿Qué experiencia cambió tu forma de ver las cosas?'],
  ['Quem te ensinou algo importante este ano, mesmo sem perceber?', '¿Quién te enseñó algo importante este año, incluso sin darse cuenta?'],
  ['Qual pequeno hábito da rotina fez diferença no seu bem-estar este ano?', '¿Qué pequeño hábito de tu rutina marcó la diferencia en tu bienestar este año?'],
  ['Do que você sentiu orgulho em silêncio este ano?', '¿De qué te sentiste orgulloso(a) en silencio este año?'],
  ['Qual gentileza, recebida ou oferecida, marcou o seu ano?', '¿Qué gesto de amabilidad, recibido u ofrecido, marcó tu año?'],
  ['Se você pudesse mandar um recado para você mesmo de janeiro, o que diria?', 'Si pudieras enviarle un mensaje a tu yo de enero, ¿qué le dirías?'],
  ['O que você quer levar deste ano para o próximo, e o que prefere deixar para trás?', '¿Qué quieres llevarte de este año al próximo y qué prefieres dejar atrás?'],
  ['Que coisa nova você quer experimentar no próximo ano só pelo prazer de tentar?', '¿Qué cosa nueva quieres probar el próximo año solo por el placer de intentarlo?'],
  ['Qual sonho antigo ainda mora em você e merece um próximo capítulo?', '¿Qué sueño antiguo sigue vivo en ti y merece un próximo capítulo?'],
  ['Se o próximo ano tivesse uma palavra-guia, qual seria e por quê?', 'Si el próximo año tuviera una palabra guía, ¿cuál sería y por qué?'],
]);

module.exports = Q.map((q, i) => ({ ...q, sort_order: i + 1 }));
