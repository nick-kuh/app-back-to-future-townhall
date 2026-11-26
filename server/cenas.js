// Cenas do townhall: o conteúdo do deck "CDIO HC + BPC · Townhall 2026" (v18, agenda atualizada), em português
// e com a cara do app. Cada cena é um passo do roteiro (tipo "cena") que o Doc coloca no telão:
//   agenda (plano de voo) · boasvindas · almanaque (Jornada 2026) · ia (IA em 2026) · reconhecimento (prêmios)
//   intervalo (cronômetro) · visao (Estratégia 2027, arquivo original sem alterações) · manifesto · mph (88 MPH)
// Aqui ficam o conteúdo (editável em Preparar → Agenda e cenas), o estado ao vivo de cada cena (mês do almanaque,
// fase da cerimônia, cronômetro do intervalo…) e os comandos do Painel do Doc. Tudo guardado no banco.
const { kvGet, kvSet } = require('./db');

const KINDS = ['agenda', 'boasvindas', 'almanaque', 'ia', 'reconhecimento', 'intervalo', 'visao', 'manifesto', 'mph'];
// nome no roteiro, ato (0 a 3) e o que aparece na transição do telão (frase do deck)
const META = {
  agenda: { name: 'Plano de voo', icon: '🗺️', act: -1, hint: 'a agenda do dia em 4 atos', tr: 'Programem os circuitos de tempo' },
  boasvindas: { name: 'Boas-vindas e jornada', icon: '👋', act: 0, hint: 'abertura com Monserrat, William e Luciano', tr: 'O Doc reúne a tripulação' },
  almanaque: { name: 'Jornada 2026', icon: '📅', act: 1, hint: 'o almanaque do ano, mês a mês, e o resumo em uma página', tr: 'Nosso ano, mês a mês' },
  ia: { name: 'Como a IA nos ajudou em 2026', icon: '🦋', act: 1, hint: 'abertura da Frente 2 (antes da Reflexão)', tr: 'O efeito borboleta' },
  reconhecimento: { name: 'Reconhecimento 2026', icon: '🏆', act: 2, hint: 'tributo, Prêmios Torre do Relógio e Hall da Fama', tr: 'O raio está chegando' },
  intervalo: { name: 'Intervalo', icon: '☕', act: 2, hint: 'cronômetro: reabastecendo a DeLorean', tr: 'Mr. Fusion recarregando' },
  visao: { name: 'Visão 2027 · Estratégia', icon: '🔭', act: 3, hint: 'a Estratégia CDIO LATAM 2027 (arquivo original) no telão', tr: 'Para onde vamos…' },
  manifesto: { name: 'Manifesto 2027', icon: '📜', act: 3, hint: 'abertura da Frente 3 (antes das dinâmicas do Sucesso)', tr: 'O futuro de vocês é o que vocês fizerem dele' },
  mph: { name: '88 MPH · Encerramento', icon: '🏎️', act: 3, hint: 'o velocímetro chega a 88 e todo mundo chega a 2027', tr: 'Segurem firme…' },
};
const HOST_KEYS = ['connections', 'almanaque', 'reflexao', 'reconhecimento', 'visao', 'sucesso']; // blocos com anfitriões
const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const BUS = { HC: 'HC', BPC: 'BPC', X: 'CROSS BU' };
const TIPOS = { E: 'Entregue', M: 'Marco', R: 'Resultado', C: 'Contexto' };

// Almanaque 2026: [mês (0 a 11), tipo (E entregue · M marco · R resultado · C contexto), BU, benefício somado em €, texto]
// A classificação e os valores somados são os mesmos do deck (41 entregas · €51,3M).
const ALMANAQUE = [
  [0, 'C', '', 0, 'Davos 2026: a IA sai dos pilotos e ganha escala'],
  [0, 'E', 'HC', 0, 'Rebalanceamento automático de estoque no Kinaxis no ar · planejamento HC Brasil'],
  [1, 'E', 'HC', 37800, 'Manutenção Preditiva Igarassu · ML prevê falhas · €37,8K (€31,5K em 2026)'],
  [2, 'E', 'X', 0, 'SIDOM UY e PY + CR AR · compliance fiscal River Plate'],
  [2, 'E', 'X', 0, 'OTM Reloaded AR · Wave 1 (Q1)'],
  [2, 'E', 'X', 0, 'OTM BR · Wave 1 POB Tender e Pick-up / Delivery Appointment (Q1)'],
  [2, 'E', 'BPC', 0, 'Minecraft HUB FG · automação fiscal (Q1)'],
  [3, 'E', 'BPC', 11000000, 'Go-live do EOTTS Logistics Pack (Q2) · €11M'],
  [3, 'E', 'BPC', 30000000, 'Minecraft Wave 2 · HUB de Matérias-Primas (Q2) · €30M de valor do programa'],
  [3, 'E', 'HC', 1000000, 'Chuck Norris · linha de Suape com ativos reaproveitados · €1M de economia'],
  [4, 'M', 'BPC', 0, 'Digital Master Plan BR: MIRAI negado, ondas com escopo revisto'],
  [4, 'E', 'HC', 7300000, 'ARES · nova linha HC A10 em Vinhedo · €7,3M de economia com o McGuyver'],
  [4, 'E', 'HC', 0, 'Copilot Wave 1 HC Nordeste · 11 agentes · manutenção de 40h/semana → 10 min'],
  [5, 'E', 'HC', 660000, 'FEU 2.0 BR + MX · previsão autônoma · €660K de redução de estoque (€330K em 2026)'],
  [5, 'E', 'X', 0, 'Migração CAE Argentina (L&F) · €104M de risco evitado · Waves 3, 3.1 e 4 na sequência'],
  [5, 'E', 'X', 0, 'OTM BR · Wave 2 POB Planning dos CDs (PAV / auto bulk-plan / shuttle) (Q2)'],
  [5, 'E', 'X', 0, 'PlanGPT · treinamento no Q1 → go-live no Q2'],
  [5, 'E', 'X', 0, 'Discovery BR · fonte única para custos de frete, armazém e finanças (Q2)'],
  [5, 'E', 'X', 0, 'Frete Mínimo BR · conformidade com a ANTT (Q2)'],
  [5, 'E', 'X', 0, 'Data Foundation VTT · Global Data Lake (Q2)'],
  [5, 'E', 'X', 0, 'PEGA BRE WM MX · regras de desbloqueio de pedidos Walmart (Q2)'],
  [5, 'E', 'BPC', 0, 'EDDGIE OSA Horizon 2 MX · IA para vendas perdidas (Q2)'],
  [5, 'E', 'BPC', 0, 'SKY 3.0 MX · POC de geração de demanda com IA com o Walmart (Q2)'],
  [6, 'E', 'BPC', 0, 'Go-live do Yard Management BR e do Pack Guru BR'],
  [6, 'E', 'BPC', 0, 'Portfólio 94% no prazo · €35M+ de economia-alvo'],
  [6, 'E', 'X', 202000, 'AOF Argentina · €202K · 3.534 h liberadas · +26% de pedidos sem toque'],
  [7, 'E', 'BPC', 0, 'Go-live do Sky 2.0 / CPFR 4.0 BR'],
  [7, 'E', 'BPC', 0, 'DC Cost Allocation LA · aprovado no ARB'],
  [8, 'E', 'BPC', 0, 'AURA no ar no Teams para a liderança'],
  [8, 'R', 'BPC', 0, 'Agente Anvisa no ar (a validar)'],
  [8, 'E', 'HC', 0, 'McGuyver II · envasadora A09 em Vinhedo · parte dos €7,3M'],
  [8, 'E', 'HC', 0, 'Project Farewell L05 Vinhedo · 7 de setembro · entregue OTIF'],
  [8, 'E', 'HC', 0, 'Chanel – Comfort Boom Indaiatuba · 30 de setembro'],
  [8, 'E', 'HC', 0, 'Inbound WMS Indaiatuba · base do Appius · €10,4M esperados a partir do Q4\'27'],
  [8, 'E', 'X', 177000, 'Inventory 2.0 PLN · AGV + visão computacional · €177K'],
  [8, 'E', 'HC', 0, 'Copilot Wave 2 Tortuguitas HC · 5 agentes vs. meta de 3 · mais de 40 pessoas treinadas'],
  [9, 'E', 'HC', 0, 'Go-live do FTS Jaboatão (13/10)'],
  [9, 'M', 'BPC', 0, 'CAPEX do Phoenix BR em validação global'],
  [9, 'M', 'BPC', 0, 'Discussão de funding do Hermes AI 2027'],
  [9, 'E', 'HC', 0, 'Safety Suite Indaiatuba · IA para segurança · entregue antes do prazo (14 de outubro)'],
  [9, 'E', 'X', 378000, 'Wrong Addition Tortuguitas · €378K · menos erros de matéria-prima'],
  [9, 'E', 'X', 115000, 'HAP R&R + Chatbot · atendimento ao cliente automatizado · €115K'],
  [9, 'E', 'X', 0, 'Copilot Forward PC Supply Chain LATAM · BR, AR, MX · ES e PT'],
  [10, 'R', 'BPC', 0, 'Nº 1 em adoção de IA Copilot · BW'],
  [10, 'E', 'HC', 0, 'Project Orion AR · diagnóstico de Data Foundation · 75 stakeholders · 49 sessões · 13 fontes · roadmap em 4 ondas'],
  [10, 'E', 'HC', 301250, 'Phoenix · Data Squad BR · €301K de valor destravado · 7.712 h economizadas · 91 telas · +16 p.p. FA-CD'],
  [10, 'M', 'BPC', 0, 'EDDGIE BR H2 · CRM em teste'],
  [10, 'M', 'BPC', 0, 'Go-live do DMP México (planejado)'],
  [10, 'E', 'X', 120000, 'Mistral e Unitrack · priorização de OSA/STK · €120K · +0,2% de OSA'],
  [11, 'M', 'BPC', 0, 'EDDGIE BR H2 · deploy do CRM em 01/12'],
  [11, 'M', 'HC', 0, 'SPC Indaiatuba · Controle Estatístico de Processo (PGLS)'],
];

// Nos textos, *asteriscos* marcam as palavras em destaque (as que no deck aparecem "em chamas").
const DEFAULT_CONFIG = () => ({
  evento: { titulo: 'CDIO HC + BPC', sub: 'Townhall 2026', sobre: 'TOWNHALL DE FIM DE ANO', data: '11 DEZ 2026', local: 'The Garage', destino: 'DEZ 11 2027', presente: 'DEZ 11 2026', partida: 'JAN 01 2026' },
  atos: ['Reconectar', 'Rebobinar 2026', 'Reconhecer', 'Avançar para 2027'],
  agenda: {
    kicker: 'Roteiro do dia · The Garage', titulo: 'O *plano de voo* de hoje', inicio: '14:00',
    // ato (1 a 4) · título · detalhe · minutos · passo do roteiro a que o item corresponde (para marcar onde o evento está)
    itens: [
      { ato: 1, t: 'Chegada e vídeo de abertura', d: 'Música · De Volta para o Futuro / gancho da DeLorean', min: 10, ref: 'checkin' },
      { ato: 1, t: 'Boas-vindas e jornada', d: 'Monserrat, William e Luciano', min: 10, ref: 'boasvindas' },
      { ato: 1, t: 'Conexão', d: 'Speed-connection em duplas · Nicolas e Douglas', min: 20, ref: 'connections' },
      { ato: 2, t: 'Jornada 2026', d: 'Resultados, impacto e aprendizados da liderança · Claudia e Fermín', min: 35, ref: 'almanaque' },
      { ato: 2, t: 'Reflexão', d: 'Como a IA nos ajudou em 2026 · da experimentação à geração de valor', min: 15, ref: 'reflexao' },
      { ato: 3, t: 'Reconhecimento 2026', d: 'Homenagens aos stakeholders · 2 BPC + 2 HC', min: 25, ref: 'reconhecimento' },
      { ato: 3, t: 'Intervalo', d: 'Fechar 2026 · reabastecer antes da viagem para 2027', min: 15, ref: 'intervalo' },
      { ato: 4, t: 'Transição e visão 2027', d: 'De Volta para o Futuro · Claudia e Fermín', min: 30, ref: 'visao' },
      { ato: 4, t: 'Sucesso', d: 'Manifesto 2027 · compromisso coletivo no app', min: 15, ref: 'sucesso' },
      { ato: 4, t: '88 MPH · Encerramento', d: 'Vozes jovens · acelerar juntos', min: 5, ref: 'mph' },
    ],
  },
  boasvindas: {
    kicker: 'Boas-vindas', frase: 'Fechar 2026 com *orgulho*. Sair com um *destino* claro para 2027.', min: 10,
    pessoas: [{ nome: 'Monserrat Diaz', papel: 'BOAS-VINDAS E JORNADA' }, { nome: 'William Manganeli', papel: 'BOAS-VINDAS E JORNADA' }, { nome: 'Luciano Barbosa', papel: 'CONTEXTO DA LIDERANÇA' }],
    faixa: 'BOAS-VINDAS · DE VOLTA PARA O FUTURO · 2026 → 2027',
  },
  almanaque: {
    kicker: 'Frente 2 · Reconectar 2026', titulo: 'Nosso *almanaque* 2026', sub: 'Um ano de entregas, mês a mês.', quem: 'Claudia Meira e Fermín Grandas', min: 35,
    kpis: [{ v: '94%', l: 'Portfólio no prazo' }, { v: '€35M+', l: 'Economia-alvo' }, { v: '#1', l: 'Adoção de IA Copilot · BW' }],
    kpiEntregas: 'Entregues HC + BPC', kpiBeneficios: 'Benefícios entregues em 2026',
    itens: ALMANAQUE.map(([m, k, bu, v, t]) => ({ m, k, bu, v, t })),
    fonte: 'Fonte: AURA, Monthly Portfolio Update, Big Rocks Tracking (10 Deployed · 09 PGLS), CDIO LATAM 2026 H2 Results (Roadmap 2026 & Core Projects), decks dos Townhalls de HC Supply Chain BR e Argentina/River Plate.',
    pagina: {
      kicker: 'Jornada 2026 · Entregue', titulo: 'Um ano, *uma página*: tudo o que o CDIO HC + BPC entregou em 2026',
      nota: 'Benefícios = economia e valor entregues, reportados por projeto. Não somados: €104M de risco evitado (CAE Argentina) · €10,4M esperados a partir do Q4\'27 (Inbound WMS). Valores pendentes de validação dos responsáveis.',
      lideranca: 'Claudia Meira, Diretora de BPC, e Fermín Grandas, Diretor de HC · Resultados, impacto e os poucos aprendizados que definem 2026. O almanaque é evidência visual, não uma revisão projeto a projeto.',
    },
  },
  ia: {
    kicker: 'Frente 2 · IA em 2026', titulo: 'Como a IA nos ajudou em *2026*', min: 15, quem: 'Giovana, Pedro e Felipe',
    texto: 'Da experimentação à adoção, aos casos de uso e à geração de valor. Uma visão concisa dos destaques que mudaram a nossa linha do tempo.',
    faixa: 'DESTAQUES DE IA 2026 · EXPERIMENTAÇÃO → GERAÇÃO DE VALOR',
    nota: 'Use apenas destaques selecionados, exemplos e impacto mensurável. Deixe os bloqueios e o dashboard completo fora da narrativa do Townhall.',
  },
  reconhecimento: {
    kicker: 'Reconhecimento 2026', min: 25,
    abertura: ['A tecnologia nos move.', '*As pessoas nos levam até lá.*'], aberturaSub: 'Antes de o raio cair, vamos ouvir por que isso é o que mais importa.',
    tributo: 'Nossas pessoas são o *Flux Capacitor*', fala: 'Claudia Meira / Luciano Barbosa (a confirmar) · 3–5 min', video: '',
    premiosTitulo: 'Os *Prêmios Torre do Relógio* 2026', hallTitulo: 'Hall da Fama 2026', hallSub: 'As pessoas que tornaram possível a linha do tempo de 2026.',
    exemplo: true, // os nomes do deck são de exemplo: o aviso sai quando os indicados forem editados
    // como o Flux Capacitor carrega na cerimônia: 'mic' = o microfone ouve os aplausos da sala (quanto mais barulho, mais rápido);
    // 'toques' = cada toque no botão dos celulares soma energia; 'ambos' = as duas coisas
    carga: 'mic',
    // ic: ícone (i raio · c dupla · b ferramenta · f relógio) · n: prêmio · k: categoria · indicados: nome e projeto · vencedor: posição na lista (1 a 4)
    premios: [
      { ic: 'i', n: 'Flux Capacitor', k: 'IMPACTO', porque: 'A fonte de energia do ano. Reconhece a entrega de valor de negócio mensurável em 2026.',
        criterios: ['Valor mensurável (economia, crescimento, produtividade)', 'Compromissos cumpridos', 'Visível para o negócio'],
        indicados: [{ nome: 'Caio Souza', projeto: 'Phoenix BR' }, { nome: 'William Manganeli', projeto: 'Portfólio' }, { nome: 'Fernando Bolivar', projeto: 'Democratização da IA' }, { nome: 'Thaiz Cabral', projeto: 'Entregas' }],
        vencedor: 1, citacao: 'Por fazer o Phoenix avançar e transformar o trabalho de base de dados em valor para o negócio.' },
      { ic: 'c', n: 'Marty & Doc', k: 'COLABORAÇÃO', porque: 'Sem a dupla, não há viagem no tempo. Reconhece as pontes construídas entre negócio, mercados, BUs e CDIO.',
        criterios: ['Trabalho entre times ou entre mercados', 'Responsabilidade compartilhada', 'Fez os outros terem sucesso'],
        indicados: [{ nome: 'Vinicius & Nicolas', projeto: 'Conexões do Townhall' }, { nome: 'Giovana & Lucas', projeto: 'App Sucesso 2027' }, { nome: 'Felipe & Pedro', projeto: 'Reconectar 2026' }, { nome: 'Nicolas Kuhnast', projeto: 'Adoção do Copilot' }],
        vencedor: 2, citacao: 'Por construírem juntos, entre times, uma experiência que toda a organização vai usar.' },
      { ic: 'b', n: 'The Garage', k: 'BASTIDORES', porque: 'Onde a máquina é construída. Reconhece o trabalho invisível que mantém tudo funcionando.',
        criterios: ['Governança, dados, relatórios, rituais', 'Consistência e confiabilidade', 'Pouca visibilidade, alta dependência'],
        indicados: [{ nome: 'Nicolas Kuhnast', projeto: 'Relatórios' }, { nome: 'Thaiz Cabral', projeto: 'Operações' }, { nome: 'Monserrat Diaz', projeto: 'Governança e AURA' }, { nome: 'William Manganeli', projeto: 'Rituais de portfólio' }],
        vencedor: 1, citacao: 'Por manter os números, os rituais e os relatórios em dia, todos os meses.' },
      { ic: 'f', n: 'Great Scott!', k: 'PRONTOS PARA O FUTURO', porque: 'A descoberta que muda a linha do tempo. Reconhece quem está nos preparando para 2027.',
        criterios: ['IA e novas capacidades', 'Aprendizado e adoção', 'Destrava as prioridades de 2027'],
        indicados: [{ nome: 'Fernando Bolivar', projeto: 'Democratização da IA' }, { nome: 'Monserrat Diaz', projeto: 'Agente AURA' }, { nome: 'Caio Souza', projeto: 'Hermes AI' }, { nome: 'Lucas', projeto: 'App DeLorean' }],
        vencedor: 2, citacao: 'Por construir um agente de IA que muda a forma como a liderança acompanha e decide.' },
    ],
  },
  intervalo: { kicker: 'Intervalo', titulo: 'Reabastecendo a *DeLorean*', min: 15, texto: 'O Mr. Fusion está recarregando. Pegue um café, conheça alguém novo e volte antes de o relógio zerar.' },
  visao: { kicker: 'Visão 2027', titulo: 'Para onde vamos…', nota: 'Estratégia CDIO LATAM 2027 · interativa', quem: 'Claudia Meira e Fermín Grandas', min: 30 },
  manifesto: { kicker: 'Frente 3 · Compromisso 2027', mes: 'DEZ', dia: '11', ano: '2027', titulo: 'Nós conhecemos o destino de 2027.', pergunta: 'O que fez dele um sucesso?', faixa: 'QR INTERATIVO / APP · MANIFESTO COLETIVO 2027', quem: 'Lucas e Giovana', min: 15 },
  mph: { kicker: 'Encerramento', antes: '2026 nos deu o impulso.', chegada: 'Bem-vindos a 2027', depois: 'Para onde vamos, construímos a estrada juntos.', quem: 'Vozes jovens · acelerar juntos', min: 5 },
  // Quem conduz cada bloco: aparece no telão com o nome e a foto de perfil (como nas boas-vindas).
  // connections, reflexao e sucesso são os blocos interativos; os outros são cenas.
  anfitrioes: {
    connections: ['Nicolas Kuhnast', 'Douglas Hamasaki'],
    almanaque: ['Claudia Meira', 'Fermín Grandas'],
    reflexao: ['Felipe Zompero', 'Mayara Gomes', 'Pedro Teixeira', 'Geovanna Moreira'],
    reconhecimento: ['Felipe Resck'],
    visao: ['Claudia Meira', 'Fermín Grandas'],
    sucesso: ['Lucas Barbosa', 'Giovana Romão', 'Maria Eduarda'],
    // participação especial nas Conexões: quem ajudou a organizar e merece o crédito, mesmo sem estar na sala
    especial: ['Vinicius Santos'], especialNota: 'Ajudou em toda a organização. Obrigado!',
  },
  creditos: {
    // "TÍTULO: nome, nome" por linha; o elenco (todos os nomes do check-in) entra sozinho no fim
    blocos: [
      { h: 'PRODUTORES EXECUTIVOS', l: ['Claudia Meira', 'Luciano Barbosa'] },
      { h: 'FRENTE 1 · CONEXÃO', l: ['Nicolas Kuhnast', 'Douglas Hamasaki'] },
      { h: 'PARTICIPAÇÃO ESPECIAL · ORGANIZAÇÃO', l: ['Vinicius Santos'] },
      { h: 'FRENTE 2 · IA EM 2026', l: ['Giovana', 'Pedro', 'Felipe'] },
      { h: 'FRENTE 3 · MANIFESTO 2027', l: ['Lucas', 'Giovana'] },
      { h: 'ESTRATÉGIA E NARRATIVA', l: ['Monserrat Diaz', 'William Manganeli'] },
      { h: 'APP DELOREAN E PERSONAGEM DE IA', l: ['Lucas & Giovana'] },
      { h: 'LOCAL', l: ['The Garage'] },
      { h: 'ESTRELANDO', l: ['Cada integrante do CDIO HC + BPC LATAM', 'que fez 2026 acontecer'] },
      { h: 'AGRADECIMENTOS ESPECIAIS', l: ['Nossos parceiros de negócio no Brasil, México, River Plate e Andina', 'Times globais de CDIO e D&T', 'Todo mundo que compartilhou sua história de IA hoje'] },
    ],
    // frases que passam antes dos créditos (o final estendido do deck)
    final: [['2026', 'O ano em que entregamos'], ['Obrigado', 'A cada integrante do CDIO HC + BPC LATAM'], ['Juntos', 'Brasil · México · River Plate · Andina'], ['Cada go-live', 'Cada ritual · cada relatório · cada história'], ['2027', 'Para onde vamos, construímos a estrada juntos']],
    fim: 'Obrigado', fimSub: 'Nos vemos no futuro.',
  },
});

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const int = (v, lo, hi, fb) => (Number.isFinite(Number(v)) ? clamp(Math.round(Number(v)), lo, hi) : fb);
const url = v => { const u = String(v ?? '').trim(); return /^(https?:\/\/|\/)[^\s"'<>]*$/i.test(u) ? u.slice(0, 500) : ''; };
const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
const hhmm = v => { const m = String(v || '').trim().match(/^(\d{1,2})[:h](\d{2})$/); return m && +m[1] < 24 && +m[2] < 60 ? `${String(+m[1]).padStart(2, '0')}:${m[2]}` : null; };
const fmtE = v => (v >= 1e6 ? `€${(v / 1e6).toFixed(1).replace('.', ',')}M` : `€${Math.round(v / 1e3)}K`);

// Confere uma seção vinda do painel: só campos conhecidos, com os tipos e tamanhos certos. O que não vier fica como está.
function cleanSection(key, cur, p) {
  if (!p || typeof p !== 'object') return cur;
  const out = { ...cur }, txt = (k, n = 200) => { if (p[k] !== undefined) out[k] = clip(p[k], n); }, min = () => { if (p.min !== undefined) out.min = int(p.min, 0, 600, cur.min); };
  switch (key) {
    case 'evento': ['titulo', 'sub', 'sobre', 'data', 'local', 'destino', 'presente', 'partida'].forEach(k => txt(k, 60)); break;
    case 'agenda':
      txt('kicker', 80); txt('titulo', 80);
      if (p.inicio !== undefined) out.inicio = hhmm(p.inicio) || cur.inicio;
      if (Array.isArray(p.itens)) {
        const itens = p.itens.slice(0, 30).map(x => ({ ato: int(x && x.ato, 1, 4, 1), t: clip(x && x.t, 80), d: clip(x && x.d, 160), min: int(x && x.min, 0, 600, 10), ref: clip(x && x.ref, 20) })).filter(x => x.t);
        if (!itens.length) fail('A agenda precisa de pelo menos um item.', 400);
        // quem edita não precisa saber o "ref": o item herda o do item padrão com o mesmo título, ou o do antigo na mesma posição
        const refs = new Map(cur.itens.map(x => [x.t.toLowerCase(), x.ref]));
        out.itens = itens.map((x, i) => ({ ...x, ref: x.ref || refs.get(x.t.toLowerCase()) || (cur.itens[i] && cur.itens.length === itens.length ? cur.itens[i].ref : '') }));
      }
      break;
    case 'boasvindas':
      txt('kicker', 80); txt('frase', 240); txt('faixa', 120); min();
      if (Array.isArray(p.pessoas)) out.pessoas = p.pessoas.slice(0, 6).map(x => ({ nome: clip(x && x.nome, 60), papel: clip(x && x.papel, 60) })).filter(x => x.nome);
      break;
    case 'almanaque':
      txt('kicker', 80); txt('titulo', 80); txt('sub', 160); txt('quem', 80); txt('kpiEntregas', 60); txt('kpiBeneficios', 60); txt('fonte', 400); min();
      if (Array.isArray(p.kpis)) out.kpis = p.kpis.slice(0, 4).map(x => ({ v: clip(x && x.v, 12), l: clip(x && x.l, 60) })).filter(x => x.v);
      if (Array.isArray(p.itens)) {
        const itens = p.itens.slice(0, 200).map(x => ({ m: int(x && x.m, 0, 11, 0), k: TIPOS[x && x.k] ? x.k : 'M', bu: BUS[x && x.bu] ? x.bu : '', v: int(x && x.v, 0, 1e10, 0), t: clip(x && x.t, 220) })).filter(x => x.t);
        if (!itens.length) fail('O almanaque precisa de pelo menos um item.', 400);
        out.itens = itens.sort((a, b) => a.m - b.m); // estável: dentro do mês vale a ordem digitada
      }
      if (p.pagina && typeof p.pagina === 'object') out.pagina = { kicker: clip(p.pagina.kicker ?? cur.pagina.kicker, 80), titulo: clip(p.pagina.titulo ?? cur.pagina.titulo, 160), nota: clip(p.pagina.nota ?? cur.pagina.nota, 400), lideranca: clip(p.pagina.lideranca ?? cur.pagina.lideranca, 400) };
      break;
    case 'ia': txt('kicker', 80); txt('titulo', 100); txt('texto', 400); txt('faixa', 120); txt('nota', 400); txt('quem', 80); min(); break;
    case 'reconhecimento':
      txt('kicker', 80); txt('aberturaSub', 200); txt('tributo', 120); txt('fala', 160); txt('premiosTitulo', 100); txt('hallTitulo', 80); txt('hallSub', 160); min();
      if (p.video !== undefined) out.video = url(p.video);
      if (p.exemplo !== undefined) out.exemplo = !!p.exemplo;
      if (p.carga !== undefined) out.carga = ['mic', 'toques', 'ambos'].includes(p.carga) ? p.carga : cur.carga;
      if (Array.isArray(p.abertura)) out.abertura = p.abertura.slice(0, 3).map(x => clip(x, 120)).filter(Boolean);
      if (Array.isArray(p.premios)) {
        const premios = p.premios.slice(0, 8).map((x, i) => {
          const old = cur.premios[i] || {}, indicados = (Array.isArray(x && x.indicados) ? x.indicados : []).slice(0, 6).map(y => ({ nome: clip(y && y.nome, 60), projeto: clip(y && y.projeto, 80) })).filter(y => y.nome);
          return { ic: ['i', 'c', 'b', 'f'].includes(x && x.ic) ? x.ic : old.ic || 'i', n: clip(x && x.n, 40), k: clip(x && x.k, 40), porque: clip(x && x.porque, 240),
            criterios: (Array.isArray(x && x.criterios) ? x.criterios : []).slice(0, 5).map(y => clip(y, 100)).filter(Boolean), indicados, vencedor: int(x && x.vencedor, 1, Math.max(1, indicados.length), 1), citacao: clip(x && x.citacao, 240) };
        }).filter(x => x.n);
        if (!premios.length || premios.some(x => x.indicados.length < 2)) fail('Cada prêmio precisa de um nome e de pelo menos 2 indicados.', 400);
        out.premios = premios;
        if (p.exemplo === undefined && JSON.stringify(premios.map(x => x.indicados)) !== JSON.stringify(cur.premios.map(x => x.indicados))) out.exemplo = false; // indicados editados: deixam de ser "de exemplo"
      }
      break;
    case 'intervalo': txt('kicker', 80); txt('titulo', 100); txt('texto', 300); if (p.min !== undefined) out.min = int(p.min, 1, 120, cur.min); break;
    case 'visao': txt('kicker', 100); txt('titulo', 80); txt('nota', 100); txt('quem', 80); min(); break;
    case 'manifesto': txt('kicker', 80); txt('mes', 6); txt('dia', 4); txt('ano', 6); txt('titulo', 120); txt('pergunta', 120); txt('faixa', 120); txt('quem', 80); min(); break;
    case 'mph': txt('kicker', 80); txt('antes', 160); txt('chegada', 60); txt('depois', 160); txt('quem', 80); min(); break;
    case 'anfitrioes':
      for (const k of [...HOST_KEYS, 'especial']) if (Array.isArray(p[k])) out[k] = p[k].slice(0, 6).map(x => clip(x, 60)).filter(Boolean);
      txt('especialNota', 120);
      break;
    case 'creditos':
      txt('fim', 40); txt('fimSub', 80);
      if (Array.isArray(p.blocos)) out.blocos = p.blocos.slice(0, 20).map(x => ({ h: clip(x && x.h, 60), l: (Array.isArray(x && x.l) ? x.l : []).slice(0, 12).map(y => clip(y, 100)).filter(Boolean) })).filter(x => x.h && x.l.length);
      if (Array.isArray(p.final)) out.final = p.final.slice(0, 8).map(x => [clip(x && x[0], 40), clip(x && x[1], 100)]).filter(x => x[0]);
      break;
    default: return cur;
  }
  return out;
}
function cleanConfig(saved) {
  const d = DEFAULT_CONFIG();
  if (!saved || typeof saved !== 'object') return d;
  for (const key of Object.keys(d)) {
    if (key === 'atos') { if (Array.isArray(saved.atos) && saved.atos.length === 4) d.atos = saved.atos.map((x, i) => clip(x, 40) || d.atos[i]); continue; }
    try { d[key] = cleanSection(key, d[key], saved[key]); } catch { /* seção guardada inválida: fica o padrão */ }
  }
  return d;
}

const DRAW_MS = 8600;      // sorteio do prêmio: holofote girando, pausa, raio (o telão anima; o servidor vira para "vencedor")
const PLAY_MS = 3200;      // "tocar o ano": um mês a cada 3,2 s (como no deck)
const defaultState = () => ({
  almanaque: { mes: -1, tocando: false, pagina: false, fim: 0, off: [] },                       // mês -1 = ainda em branco
  reconhecimento: { fase: 'intro', premio: null, passo: 'categoria', at: 0, carga: 0, feitos: [], video: false },
  intervalo: { phase: 'idle', endsAt: null, remaining: null },
  visao: { intro: false },
  mph: { at: null },
});

const CONFIG_VERSION = 2; // v2: Reflexão e Sucesso na agenda, anfitriões por bloco (na Visão 2027 os nomes saem da linha de cima e vão para as placas)
function createCenas() {
  const saved = kvGet('cenas', {}) || {};
  if (saved.config && (saved.v || 1) < CONFIG_VERSION) for (const k of ['agenda', 'visao']) delete saved.config[k];
  let config = cleanConfig(saved.config);
  const state = defaultState();
  for (const k of Object.keys(state)) if (saved.state && saved.state[k] && typeof saved.state[k] === 'object') Object.assign(state[k], saved.state[k]);
  state.almanaque.tocando = false;                                                                   // o servidor reiniciou: nada fica "tocando"
  if (['carga', 'sorteio'].includes(state.reconhecimento.passo)) state.reconhecimento.passo = 'indicados';
  const listeners = [], pulses = [];
  let playT = null, drawT = null, breakT = null, pulseT = null, pageT = null;

  const save = () => kvSet('cenas', { v: CONFIG_VERSION, config, state });
  const emit = notice => { save(); for (const fn of listeners) fn(notice || null); };
  const now = () => Date.now();

  /* ---------- números do almanaque ---------- */
  function almanaqueStats() {
    const it = config.almanaque.itens, del = it.filter(x => x.k === 'E'), sum = r => r.reduce((a, x) => a + (x.v || 0), 0);
    const bus = Object.keys(BUS).map(u => { const r = del.filter(x => (x.bu || 'BPC') === u); return { bu: u, name: BUS[u], n: r.length, total: sum(r), txt: fmtE(sum(r)) }; });
    return { entregues: del.length, beneficios: sum(del), beneficiosTxt: fmtE(sum(del)), bus,
      porBu: Object.fromEntries(Object.keys(BUS).map(u => [u, it.filter(x => x.bu === u).length])), porTipo: Object.fromEntries(Object.keys(TIPOS).map(k => [k, it.filter(x => x.k === k).length])) };
  }

  /* ---------- agenda: horários a partir do início e onde o evento está ---------- */
  function agendaView(ctx) {
    const a = config.agenda, [h, m] = a.inicio.split(':').map(Number);
    let t = h * 60 + m;
    const f = x => `${String(Math.floor(x / 60) % 24).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
    // posição de cada item no roteiro (pelo passo a que ele corresponde), para marcar o que já passou e o que está no ar
    const steps = (ctx && ctx.steps) || [], cur = ctx ? ctx.index : -1;
    const at = ref => steps.findIndex(s => (s.type === 'cena' ? s.cena : s.type) === ref);
    const itens = a.itens.map((x, i) => { const start = t; t += x.min; const pos = x.ref ? at(x.ref) : -1; return { ...x, i, hora: f(start), fim: f(t), pos }; });
    // o item "no ar" é o último cujo passo já chegou (os passos entre dois itens, como as dinâmicas do Sucesso, contam para o anterior)
    let live = -1; itens.forEach(x => { if (x.pos >= 0 && x.pos <= cur) live = x.i; });
    const total = itens.reduce((s, x) => s + x.min, 0);
    return { kicker: a.kicker, titulo: a.titulo, inicio: a.inicio, fim: f(h * 60 + m + total), total, data: config.evento.data, local: config.evento.local,
      atos: config.atos.map((nome, k) => { const r = itens.filter(x => x.ato === k + 1); return { n: `ATO ${['I', 'II', 'III', 'IV'][k]}`, nome, de: r.length ? r[0].hora : '', ate: r.length ? r[r.length - 1].fim : '', min: r.reduce((s, x) => s + x.min, 0) }; }),
      itens: itens.map(x => ({ ato: x.ato, t: x.t, d: x.d, min: x.min, hora: x.hora, estado: x.i === live ? 'agora' : live >= 0 && x.i < live ? 'feito' : '' })) };
  }

  /* ---------- o que vai para todos (telão e celulares) ---------- */
  const actOf = kind => { const k = META[kind].act; return k < 0 ? null : { n: `ATO ${['I', 'II', 'III', 'IV'][k]}`, nome: config.atos[k], k }; };
  function publicState(kind, ctx) {
    if (!META[kind]) return null;
    const base = { kind, name: META[kind].name, ato: actOf(kind) };
    switch (kind) {
      case 'agenda': return { ...base, ...agendaView(ctx) };
      case 'boasvindas': return { ...base, ...config.boasvindas };
      case 'almanaque': { const c = config.almanaque, s = state.almanaque; return { ...base, kicker: c.kicker, titulo: c.titulo, sub: c.sub, quem: names(hosts('almanaque')) || c.quem, kpis: c.kpis, kpiEntregas: c.kpiEntregas, kpiBeneficios: c.kpiBeneficios, itens: c.itens, fonte: c.fonte, pagina: c.pagina, stats: almanaqueStats(), meses: MONTHS, bus: BUS, tipos: TIPOS, live: { ...s } }; }
      case 'ia': { const { nota, ...c } = config.ia; return { ...base, ...c }; } // a nota é para quem apresenta: fica só no painel
      case 'reconhecimento': {
        const c = config.reconhecimento, s = state.reconhecimento, feitos = new Set(s.feitos);
        // o vencedor de cada prêmio só vai para os aparelhos quando o sorteio dele começa (o telão precisa saber onde o holofote para)
        const aberto = i => feitos.has(i) || (s.fase === 'cerimonia' && s.premio === i && ['sorteio', 'vencedor'].includes(s.passo));
        return { ...base, kicker: c.kicker, abertura: c.abertura, aberturaSub: c.aberturaSub, tributo: c.tributo, fala: c.fala.replace(/\s*\(a confirmar\)/i, ''), video: c.video, premiosTitulo: c.premiosTitulo, hallTitulo: c.hallTitulo, hallSub: c.hallSub, exemplo: !!c.exemplo,
          premios: c.premios.map((p, i) => ({ ic: p.ic, n: p.n, k: p.k, porque: p.porque, criterios: p.criterios, indicados: p.indicados, feito: feitos.has(i), ...(aberto(i) ? { vencedor: p.vencedor - 1, citacao: p.citacao } : {}) })),
          carga: c.carga || 'mic', quem: names(hosts('reconhecimento')),
          live: { fase: s.fase, premio: s.premio, passo: s.passo, at: s.at, carga: s.carga, nivel: s.passo === 'carga' ? s.nivel || 0 : 0, feitos: s.feitos, video: !!s.video, sorteioMs: DRAW_MS } };
      }
      case 'intervalo': { const c = config.intervalo, s = state.intervalo; return { ...base, ...c, live: { phase: s.phase, endsAt: s.endsAt, remaining: s.remaining === null ? c.min * 60 : s.remaining, duration: s.duration || c.min * 60 } }; }
      case 'visao': return { ...base, ...config.visao, quem: names(hosts('visao')) || config.visao.quem, src: '/estrategia-2027.html', live: { ...state.visao } };
      case 'manifesto': return { ...base, ...config.manifesto };
      case 'mph': return { ...base, ...config.mph, live: { ...state.mph } };
      default: return base;
    }
  }
  // quem conduz um bloco (nomes): o servidor junta a foto de perfil de cada um
  const hosts = key => (HOST_KEYS.includes(key) ? (config.anfitrioes[key] || []).slice() : []);
  const especial = () => ({ nomes: (config.anfitrioes.especial || []).slice(), nota: config.anfitrioes.especialNota || '' }); // participação especial (Conexões)
  const names = list => (list.length > 1 ? `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}` : list[0] || '');
  const evento = () => ({ ...config.evento });
  const creditos = () => ({ ...config.creditos, titulo: config.evento.titulo, sub: config.evento.sub });
  const adminState = () => ({ kinds: KINDS, meta: META, config, state, stats: almanaqueStats(), months: MONTHS, bus: BUS, tipos: TIPOS, drawMs: DRAW_MS });

  /* ---------- almanaque ---------- */
  function stopPlay() { clearInterval(playT); playT = null; clearTimeout(pageT); pageT = null; state.almanaque.tocando = false; }
  function almanaque(a) {
    const s = state.almanaque;
    switch (a.action) {
      case 'mes': stopPlay(); s.mes = int(a.mes, -1, 11, 0); s.pagina = false; break;
      case 'prox': stopPlay(); s.mes = Math.min(11, s.mes + 1); s.pagina = false; break;
      case 'ant': stopPlay(); s.mes = Math.max(0, s.mes - 1); s.pagina = false; break;
      case 'tocar': {
        if (s.tocando) { stopPlay(); break; }
        stopPlay(); s.pagina = false; s.tocando = true;
        if (s.mes < 0 || s.mes >= 11) s.mes = 0;
        playT = setInterval(() => {
          if (s.mes >= 11) { // chegou a dezembro: fanfarra no telão e, logo depois, o resumo em uma página
            clearInterval(playT); playT = null; s.tocando = false; s.fim = now(); emit();
            pageT = setTimeout(() => { pageT = null; s.pagina = true; emit(); }, 2600);
            return;
          }
          s.mes++; emit();
        }, PLAY_MS);
        break;
      }
      case 'pagina': stopPlay(); s.pagina = !!a.on; break;
      case 'filtro': { // esconde/mostra uma BU (HC, BPC, X) ou um tipo (E, M, R, C) nos cartões do mês
        const k = String(a.key || ''); if (!BUS[k] && !TIPOS[k]) fail('Filtro inválido.', 400);
        s.off = s.off.includes(k) ? s.off.filter(x => x !== k) : [...s.off, k]; break;
      }
      case 'reiniciar': stopPlay(); Object.assign(s, defaultState().almanaque); break;
      default: fail('Comando inválido.', 400);
    }
    emit();
  }

  /* ---------- reconhecimento: abertura → tributo → prêmios → cerimônia de cada prêmio → Hall da Fama ---------- */
  function winner() {
    const s = state.reconhecimento; clearTimeout(drawT); drawT = null;
    if (s.fase !== 'cerimonia' || s.premio === null) return;
    s.passo = 'vencedor'; s.at = now(); s.carga = 1;
    if (!s.feitos.includes(s.premio)) s.feitos.push(s.premio);
    const p = config.reconhecimento.premios[s.premio], w = p && p.indicados[p.vencedor - 1];
    emit(w ? { title: `🏆 ${p.n}`, body: w.nome } : null);
  }
  function draw() {
    const s = state.reconhecimento;
    s.passo = 'sorteio'; s.at = now(); s.carga = 1;
    clearTimeout(drawT); drawT = setTimeout(winner, DRAW_MS);
    emit();
  }
  function reconhecimento(a) {
    const s = state.reconhecimento, c = config.reconhecimento, inCeremony = passo => { if (s.fase !== 'cerimonia' || s.premio === null) fail('Abra a cerimônia de um prêmio antes.'); if (passo && !passo.includes(s.passo)) fail('Esse passo da cerimônia já passou.'); };
    switch (a.action) {
      case 'fase': {
        if (!['intro', 'tributo', 'premios', 'hall'].includes(a.fase)) fail('Fase inválida.', 400);
        clearTimeout(drawT); drawT = null;
        s.fase = a.fase; s.premio = null; s.passo = 'categoria'; s.carga = 0; s.at = now(); s.video = a.fase === 'tributo' && !!c.video;
        break;
      }
      case 'video': if (s.fase !== 'tributo') fail('O vídeo toca na fase do tributo.'); s.video = !!a.on; s.at = now(); break;
      case 'abrir': {
        const i = int(a.premio, 0, c.premios.length - 1, -1); if (i < 0) fail('Prêmio inválido.', 400);
        clearTimeout(drawT); drawT = null;
        s.fase = 'cerimonia'; s.premio = i; s.passo = 'categoria'; s.carga = 0; s.at = now(); s.feitos = s.feitos.filter(x => x !== i); // abrir de novo refaz a cerimônia
        break;
      }
      case 'indicados': inCeremony(['categoria']); s.passo = 'indicados'; s.at = now(); break;
      case 'carregar': inCeremony(['indicados']); s.passo = 'carga'; s.carga = 0; s.nivel = 0; s.at = now(); break;
      case 'carga': inCeremony(['carga']); s.carga = clamp(s.carga + clamp(Number(a.v) || .15, .01, 1), 0, 1); if (s.carga >= 1) return draw(); break;
      case 'raio': inCeremony(['indicados', 'carga']); return draw();
      case 'vencedor': inCeremony(['sorteio']); return winner(); // pular o suspense
      case 'reset': clearTimeout(drawT); drawT = null; Object.assign(s, defaultState().reconhecimento); break;
      default: fail('Comando inválido.', 400);
    }
    emit();
  }
  // Aplausos pelo microfone: o Painel do Doc ouve a sala e manda, algumas vezes por segundo, quanto a carga anda
  // (delta pode ser negativo: sem barulho, a carga escorre devagar) e o nível do som (0 a 1), para o medidor do telão.
  function mic(delta, nivel) {
    const s = state.reconhecimento;
    if (s.fase !== 'cerimonia' || s.passo !== 'carga' || config.reconhecimento.carga === 'toques') return false;
    s.carga = clamp(s.carga + clamp(Number(delta) || 0, -.1, .2), 0, 1); s.nivel = clamp(Number(nivel) || 0, 0, 1);
    if (s.carga >= 1) { s.nivel = 0; draw(); return true; }
    for (const fn of pulses) fn({ kind: 'reconhecimento', carga: s.carga, nivel: s.nivel });
    return true;
  }
  // Toques de "aplauso" nos celulares durante a carga: somam energia; os avisos saem agrupados (no máximo 4 por segundo)
  const taps = new Map();
  function tap(personId, people) {
    const s = state.reconhecimento;
    if (s.fase !== 'cerimonia' || s.passo !== 'carga' || config.reconhecimento.carga === 'mic') return false;
    const t = now(), mine = taps.get(personId) || { at: 0, n: 0 };
    if (t - mine.at > 1000) { mine.at = t; mine.n = 0; }
    if (++mine.n > 12) { taps.set(personId, mine); return false; }  // no máximo 12 toques por segundo por pessoa
    taps.set(personId, mine);
    s.carga = clamp(s.carga + 1 / Math.max(40, (Number(people) || 0) * 6), 0, 1); // em média, 6 toques por pessoa enchem o capacitor
    if (s.carga >= 1) { clearTimeout(pulseT); pulseT = null; draw(); return true; }
    if (!pulseT) pulseT = setTimeout(() => { pulseT = null; save(); for (const fn of pulses) fn({ kind: 'reconhecimento', carga: state.reconhecimento.carga }); }, 250);
    return true;
  }

  /* ---------- intervalo: cronômetro ---------- */
  function armBreak() {
    clearTimeout(breakT); breakT = null;
    const s = state.intervalo;
    if (s.phase === 'run' && s.endsAt) breakT = setTimeout(() => { breakT = null; s.phase = 'done'; s.endsAt = null; s.remaining = 0; emit({ title: 'Fim do intervalo', body: 'A DeLorean está abastecida. Voltem aos seus lugares!' }); }, Math.max(0, s.endsAt - now()) + 50);
  }
  function intervalo(a) {
    const s = state.intervalo, left = () => (s.phase === 'run' && s.endsAt ? Math.max(0, Math.ceil((s.endsAt - now()) / 1000)) : s.remaining === null ? config.intervalo.min * 60 : s.remaining);
    switch (a.action) {
      case 'start': { const d = a.min ? int(a.min, 1, 120, config.intervalo.min) * 60 : config.intervalo.min * 60; s.duration = d; s.remaining = d; s.endsAt = now() + d * 1000; s.phase = 'run'; break; }
      case 'pause': if (s.phase === 'run') { s.remaining = left(); s.endsAt = null; s.phase = 'paused'; } break;
      case 'resume': if (s.phase === 'paused') { s.endsAt = now() + s.remaining * 1000; s.phase = 'run'; } break;
      case 'add': { const d = int(a.seconds, -600, 600, 60), r = Math.max(0, left() + d); s.duration = Math.max(1, (s.duration || config.intervalo.min * 60) + d); if (s.phase === 'run') s.endsAt = now() + r * 1000; else { s.remaining = r; if (s.phase === 'done' && r > 0) s.phase = 'paused'; } break; }
      case 'reset': Object.assign(s, defaultState().intervalo); break;
      default: fail('Comando inválido.', 400);
    }
    armBreak(); emit();
  }

  function command(kind, a) {
    if (!a || typeof a !== 'object') fail('Comando inválido.', 400);
    switch (kind) {
      case 'almanaque': return almanaque(a);
      case 'reconhecimento': return reconhecimento(a);
      case 'intervalo': return intervalo(a);
      case 'visao': if (a.action !== 'intro') fail('Comando inválido.', 400); state.visao.intro = !!a.on; return emit();
      case 'mph': if (a.action === 'go') state.mph.at = now(); else if (a.action === 'reset') state.mph.at = null; else fail('Comando inválido.', 400); return emit(a.action === 'go' ? { title: '88 MPH!', body: config.mph.chegada } : null);
      default: fail('Esta cena não tem comandos.', 400);
    }
  }
  // A cena entrou no ar vinda de outro passo: começa do início, como no deck (o almanaque em branco, o reconhecimento
  // na abertura, o velocímetro em zero). Os prêmios já revelados e o cronômetro do intervalo ficam como estão.
  function enter(kind) {
    if (kind === 'almanaque') { stopPlay(); Object.assign(state.almanaque, { mes: -1, tocando: false, pagina: false, fim: 0 }); }
    if (kind === 'reconhecimento') { clearTimeout(drawT); drawT = null; Object.assign(state.reconhecimento, { fase: 'intro', premio: null, passo: 'categoria', carga: 0, at: now(), video: false }); }
    if (kind === 'mph') state.mph.at = null;
    save();
  }
  // O evento saiu de uma cena (outro passo, aviso, dinâmica): o que estava "tocando" para. O cronômetro do intervalo segue contando.
  function sync(onAir) {
    if (onAir !== 'almanaque' && state.almanaque.tocando) { stopPlay(); save(); }
    const s = state.reconhecimento;
    if (onAir !== 'reconhecimento' && (s.passo === 'carga' || s.passo === 'sorteio') && s.fase === 'cerimonia') { clearTimeout(drawT); drawT = null; s.passo = 'indicados'; s.carga = 0; save(); }
  }

  /* ---------- conteúdo (Preparar → Agenda e cenas) ---------- */
  function setConfig(patch) {
    if (!patch || typeof patch !== 'object') fail('Nada para salvar.', 400);
    const next = { ...config };
    for (const key of Object.keys(patch)) {
      if (key === 'atos') { if (Array.isArray(patch.atos) && patch.atos.length === 4) next.atos = patch.atos.map((x, i) => clip(x, 40) || config.atos[i]); continue; }
      if (!(key in config)) fail(`Seção desconhecida: ${key}.`, 400);
      next[key] = cleanSection(key, config[key], patch[key]);
    }
    config = next;
    // prêmios mudaram de quantidade: a cerimônia volta para um estado válido
    const s = state.reconhecimento, n = config.reconhecimento.premios.length;
    s.feitos = s.feitos.filter(i => i < n); if (s.premio !== null && s.premio >= n) { s.premio = null; s.fase = 'premios'; }
    emit();
  }
  function resetConfig(key) {
    const d = DEFAULT_CONFIG();
    if (key) { if (!(key in d)) fail('Seção desconhecida.', 400); config = { ...config, [key]: d[key] }; } else config = d;
    if (!key || key === 'reconhecimento') Object.assign(state.reconhecimento, defaultState().reconhecimento);
    emit();
  }
  // Recomeça as cenas (ensaio, reset do evento): volta tudo ao início, sem mexer no conteúdo
  function resetState({ silent = false } = {}) {
    stopPlay(); clearTimeout(drawT); drawT = null; clearTimeout(breakT); breakT = null;
    Object.assign(state, defaultState());
    if (silent) save(); else emit();
  }

  // Reinicia uma cena só (o mês do almanaque, os prêmios revelados, o cronômetro, o velocímetro…), sem mexer no conteúdo
  function resetKind(kind) {
    if (!(kind in state)) fail('Esta cena não tem nada para reiniciar.', 400);
    if (kind === 'almanaque') stopPlay();
    if (kind === 'reconhecimento') { clearTimeout(drawT); drawT = null; }
    if (kind === 'intervalo') { clearTimeout(breakT); breakT = null; }
    for (const k of Object.keys(state[kind])) delete state[kind][k];
    Object.assign(state[kind], defaultState()[kind]);
    emit();
  }

  armBreak();
  return { publicState, adminState, evento, creditos, hosts, especial, command, tap, mic, enter, sync, setConfig, resetConfig, resetState, resetKind,
    onChange: fn => listeners.push(fn), onPulse: fn => pulses.push(fn), agendaView, config: () => config };
}

module.exports = { createCenas, KINDS, META, MONTHS, HOST_KEYS, DEFAULT_CONFIG };
