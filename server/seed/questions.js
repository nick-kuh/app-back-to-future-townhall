// Banco de perguntas inicial. Tom: descontraído e adulto, fora do trabalho.
// era: 'presente' (viagem 1 · 1985) | 'passado' (viagem 2 · 1955) | 'futuro' (viagem 3 · 2015)
// O admin pode editar, adicionar e desativar perguntas pelo painel.
const Q = [];
const add = (era, list) => list.forEach(text => Q.push({ era, text }));

add('presente', [
  'Qual é a pequena coisa do dia a dia que sempre melhora o seu humor?',
  'Se o seu ano fosse um filme, qual seria o título? E quem faria o papel principal?',
  'Qual música ou álbum representa a sua fase atual?',
  'O que você faz quando ganha um tempo livre só para você?',
  'Qual é a sua melhor forma de desligar a cabeça depois de um dia puxado?',
  'Qual hobby ou interesse seu as pessoas aqui provavelmente não imaginam?',
  'Em viagens, você é mais "roteiro planejado" ou "deixa a vida me levar"? Conte uma que prova isso.',
  'Qual lugar você sempre indica para quem visita a sua cidade?',
  'Qual prato você faz bem (ou qual restaurante você defende até o fim)?',
  'Série, livro ou podcast que você está consumindo agora e recomendaria?',
  'Como é o seu domingo ideal, do começo ao fim?',
  'Qual momento deste ano te deixou genuinamente feliz?',
  'Que mania ou ritual seu é meio inexplicável, mas você não abre mão?',
  'Se tivesse um dia inteiro livre na cidade, sem compromisso nenhum, o que faria?',
]);

add('passado', [
  'Qual lembrança de infância ainda te faz sorrir?',
  'Quem te ensinou algo importante, e o que ficou desse aprendizado?',
  'Qual foi uma decisão ousada que você tomou e que valeu a pena?',
  'Qual perrengue, olhando para trás, virou uma ótima história?',
  'Qual lugar ou experiência mudou o jeito como você vê o mundo?',
  'Se pudesse voltar a um ano da sua vida só para revivê-lo, qual seria e por quê?',
  'O que você adorava fazer aos 15 anos e deixou de lado? Vale a pena retomar?',
  'Qual foi a primeira viagem que te marcou de verdade?',
  'Que conselho você daria para a sua versão do início deste ano?',
  'Qual música te transporta na hora para outra época da sua vida?',
  'Qual hábito do passado (seu ou do mundo) você traria de volta?',
  'Conte uma história de família que sempre é repetida nos encontros.',
  'Qual foi o melhor "não" que você já recebeu na vida?',
  'Que tradição da sua cidade natal ou da sua família você mais valoriza?',
]);

add('futuro', [
  'Qual é um sonho ou vontade que você tem guardado e adoraria realizar um dia?',
  'Se pudesse aprender uma habilidade nova só por prazer, qual seria?',
  'O que você quer levar deste ano para 2027, e o que pode ficar para trás?',
  'Se pudesse desejar uma coisa boa para este fim de ano, qual seria?',
  'Qual destino está no topo da sua lista de viagens? O que te atrai nele?',
  'Daqui a 10 anos, como você imagina um dia comum na sua vida?',
  'Qual invenção "do futuro" você gostaria que já existisse hoje?',
  'Que experiência você quer viver pelo menos uma vez na vida?',
  'Se tivesse um ano sabático garantido, como usaria esse tempo?',
  'Qual pequena mudança você quer fazer na sua rotina em 2027?',
  'O que você diria para você mesmo(a) daqui a 30 anos?',
  'Em que lugar do mundo você gostaria de morar por um ano?',
  'Se o futuro te garantisse que vai dar certo, o que você começaria amanhã?',
  'Qual causa ou assunto você gostaria de se envolver mais daqui para frente?',
]);

module.exports = Q.map((q, i) => ({ ...q, sort_order: i + 1 }));
