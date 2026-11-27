// Cenas do townhall: o conteúdo do deck "CDIO HC + BPC · 2026 Townhall" (v18, agenda atualizada), em INGLÊS (como
// no deck original) e com a cara do app. Cada cena é um passo do roteiro (tipo "cena") que o Doc coloca no telão:
//   abertura (vídeo de abertura) · boasvindas · nuvem (duas perguntas no celular e as nuvens de palavras) · agenda (plano de voo)
//   plano26 (Estratégia 2026) · almanaque (Jornada 2026, de dezembro para janeiro) · ia (IA em 2026)
//   reconhecimento (prêmios) · intervalo (cronômetro e o alerta de volta) · visao (capa e a Estratégia 2027 em tela cheia)
//   capasucesso (capa do bloco Sucesso) · manifesto · mph (88 MPH)
// Aqui ficam o conteúdo (editável em Preparar → Agenda e cenas), o estado ao vivo de cada cena (mês do almanaque,
// fase da cerimônia, cronômetro do intervalo…) e os comandos do Painel do Doc. Tudo guardado no banco.
// As dinâmicas (Conexões, Reflexão e Sucesso) continuam em português e não ficam neste arquivo.
const { kvGet, kvSet } = require('./db');

const KINDS = ['abertura', 'boasvindas', 'nuvem', 'agenda', 'plano26', 'almanaque', 'ia', 'reconhecimento', 'intervalo', 'visao', 'capasucesso', 'manifesto', 'mph'];
// Cenas que não são conteúdo confidencial do townhall: a nuvem de palavras (precisa dos celulares), o intervalo e a capa do Sucesso
const OPEN_KINDS = ['nuvem', 'intervalo', 'capasucesso'];
// name: o nome que aparece no telão e nos celulares (inglês) · label e hint: como o passo aparece no Painel do Doc (português)
// act: ato (0 a 3) · tr: a frase da transição do telão (do deck)
const META = {
  abertura: { name: 'Opening video', label: 'Vídeo de abertura', icon: '🎬', act: 0, hint: 'o vídeo que abre o townhall, em tela cheia', tr: 'Roads? Where we\'re going, we don\'t need roads' },
  boasvindas: { name: 'Welcome', label: 'Boas-vindas e jornada', icon: '👋', act: 0, hint: 'abertura com Monserrat, William e Luciano', tr: 'Doc gathers the crew' },
  nuvem: { name: 'Word cloud', label: 'Nuvem de palavras', icon: '☁️', act: 0, hint: 'as duas perguntas que cada pessoa responde logo depois do login viram as nuvens no telão', tr: 'The crew has something to say' },
  agenda: { name: 'Flight plan', label: 'Plano de voo (agenda)', icon: '🗺️', act: -1, hint: 'a agenda do dia em 4 atos', tr: 'Set the time circuits' },
  plano26: { name: '2026 Strategy', label: 'Estratégia 2026', icon: '🧭', act: 1, hint: 'o plano estratégico LATAM GDT 2026, no visual do filme (antes da Jornada 2026)', tr: 'First, where we said we would go' },
  almanaque: { name: '2026 Journey', label: 'Jornada 2026', icon: '📅', act: 1, hint: 'o almanaque do ano, de dezembro para janeiro (o carro vai de ré), e o resumo em uma página', tr: 'Our year, month by month' },
  ia: { name: 'How AI helped us in 2026', label: 'Como a IA nos ajudou em 2026', icon: '🦋', act: 1, hint: 'abertura da Frente 2 (antes da Reflexão)', tr: 'The butterfly effect' },
  reconhecimento: { name: 'Recognition 2026', label: 'Reconhecimento 2026', icon: '🏆', act: 2, hint: 'tributo, Prêmios Torre do Relógio e Hall da Fama', tr: 'The lightning is coming' },
  intervalo: { name: 'Break', label: 'Intervalo', icon: '☕', act: 2, hint: 'cronômetro: reabastecendo a DeLorean', tr: 'Mr. Fusion recharging' },
  visao: { name: '2027 Vision', label: 'Visão 2027 · Estratégia', icon: '🔭', act: 3, hint: 'a capa do bloco e, em seguida, a Estratégia CDIO LATAM 2027 (arquivo original) em tela cheia', tr: 'Where we\'re going…' },
  capasucesso: { name: 'De Volta para o Sucesso', label: 'Sucesso · capa do bloco', icon: '🚀', act: 3, hint: 'a capa do bloco Sucesso: o nome e quem conduz', tr: 'Your future is whatever you make it' },
  manifesto: { name: '2027 Manifesto', label: 'Manifesto 2027', icon: '📜', act: 3, hint: 'abertura da Frente 3 (antes das dinâmicas do Sucesso)', tr: 'Your future is whatever you make it' },
  mph: { name: '88 MPH', label: '88 MPH · Encerramento', icon: '🏎️', act: 3, hint: 'o velocímetro chega a 88 e todo mundo chega a 2027', tr: 'Hold on…' },
};
const HOST_KEYS = ['connections', 'almanaque', 'reflexao', 'reconhecimento', 'visao', 'sucesso']; // blocos com anfitriões
const PHONE_REFS = ['connections', 'reflexao', 'sucesso'];                                        // itens da agenda que usam o celular
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const BUS = { HC: 'HC', BPC: 'BPC', X: 'CROSS BU' };
const TIPOS = { E: 'Delivered', M: 'Milestone', R: 'Result', C: 'Context' };

// Almanaque 2026: [mês (0 a 11), tipo (E entregue · M marco · R resultado · C contexto), BU, benefício somado em €, texto]
// Os textos são os do deck (em inglês); a classificação e os valores somados são os mesmos (41 entregas · €51.3M).
const ALMANAQUE = [
  [0, 'C', '', 0, 'Davos 2026: AI moves from pilots to scale'],
  [0, 'E', 'HC', 0, 'Automated Stock Rebalance in Kinaxis live · HC Brazil planning'],
  [1, 'E', 'HC', 37800, 'Predictive Maintenance Igarassu · ML predicts failures · €37.8K (€31.5K in 2026)'],
  [2, 'E', 'X', 0, 'SIDOM UY & PY + CR AR · fiscal compliance River Plate'],
  [2, 'E', 'X', 0, 'OTM Reloaded AR · Wave 1 (Q1)'],
  [2, 'E', 'X', 0, 'OTM BR · Wave 1 POB Tender & Pick-up / Delivery Appointment (Q1)'],
  [2, 'E', 'BPC', 0, 'Minecraft HUB FG · tax automation (Q1)'],
  [3, 'E', 'BPC', 11000000, 'EOTTS Logistics Pack Go-Live (Q2) · €11M'],
  [3, 'E', 'BPC', 30000000, 'Minecraft Wave 2 · Raw Materials HUB (Q2) · €30M program value'],
  [3, 'E', 'HC', 1000000, 'Chuck Norris · Suape line from repurposed assets · €1M savings'],
  [4, 'M', 'BPC', 0, 'Digital Master Plan BR: MIRAI denied, waves re-scoped'],
  [4, 'E', 'HC', 7300000, 'ARES · new HC line A10 Vinhedo · €7.3M savings with McGuyver'],
  [4, 'E', 'HC', 0, 'Copilot Wave 1 HC Northeast · 11 agents · maintenance 40h/week → 10 min'],
  [5, 'E', 'HC', 660000, 'FEU 2.0 BR + MX · autonomous forecasting · €660K inventory reduction (€330K in 2026)'],
  [5, 'E', 'X', 0, 'CAE Migration Argentina (L&F) · €104M risk avoided · Waves 3, 3.1 & 4 follow'],
  [5, 'E', 'X', 0, 'OTM BR · Wave 2 POB Planning DCs (PAV / auto bulk-plan / shuttle) (Q2)'],
  [5, 'E', 'X', 0, 'PlanGPT · training Q1 → go-live Q2'],
  [5, 'E', 'X', 0, 'Discovery BR · single source for freight, WH & finance costs (Q2)'],
  [5, 'E', 'X', 0, 'Frete Mínimo BR · ANTT compliance (Q2)'],
  [5, 'E', 'X', 0, 'Data Foundation VTT · Global Data Lake (Q2)'],
  [5, 'E', 'X', 0, 'PEGA BRE WM MX · Walmart order-unblock rules (Q2)'],
  [5, 'E', 'BPC', 0, 'EDDGIE OSA Horizon 2 MX · AI lost-sales (Q2)'],
  [5, 'E', 'BPC', 0, 'SKY 3.0 MX · AI demand generation POC with Walmart (Q2)'],
  [6, 'E', 'BPC', 0, 'Yard Management BR & Pack Guru BR Go-Live'],
  [6, 'E', 'BPC', 0, 'Portfolio 94% on track · €35M+ targeted savings'],
  [6, 'E', 'X', 202000, 'AOF Argentina · €202K · 3,534 h unlocked · +26% non-touch orders'],
  [7, 'E', 'BPC', 0, 'Sky 2.0 / CPFR 4.0 BR Go-Live'],
  [7, 'E', 'BPC', 0, 'DC Cost Allocation LA · ARB approved'],
  [8, 'E', 'BPC', 0, 'AURA live in Teams for leadership'],
  [8, 'R', 'BPC', 0, 'Anvisa Agent live (to validate)'],
  [8, 'E', 'HC', 0, 'McGuyver II · filling machine A09 Vinhedo · part of €7.3M'],
  [8, 'E', 'HC', 0, 'Project Farewell L05 Vinhedo · Sep 7 · delivered OTIF'],
  [8, 'E', 'HC', 0, 'Chanel – Comfort Boom Indaiatuba · Sep 30'],
  [8, 'E', 'HC', 0, 'Inbound WMS Indaiatuba · Appius foundation · €10.4M expected from Q4\'27'],
  [8, 'E', 'X', 177000, 'Inventory 2.0 PLN · AGV + computer vision · €177K'],
  [8, 'E', 'HC', 0, 'Copilot Wave 2 Tortuguitas HC · 5 agents vs. goal 3 · 40+ trained'],
  [9, 'E', 'HC', 0, 'FTS Jaboatão Go-Live (13/10)'],
  [9, 'M', 'BPC', 0, 'Phoenix BR CAPEX in global validation'],
  [9, 'M', 'BPC', 0, 'Hermes AI 2027 funding discussion'],
  [9, 'E', 'HC', 0, 'Safety Suite Indaiatuba · AI for safety · delivered early (Oct 14)'],
  [9, 'E', 'X', 378000, 'Wrong Addition Tortuguitas · €378K · fewer raw-material errors'],
  [9, 'E', 'X', 115000, 'HAP R&R + Chatbot · automated customer support · €115K'],
  [9, 'E', 'X', 0, 'Copilot Forward PC Supply Chain LATAM · BR, AR, MX · ES & PT'],
  [10, 'R', 'BPC', 0, 'Copilot AI Adoption #1 BW'],
  [10, 'E', 'HC', 0, 'Project Orion AR · Data Foundation assessment · 75 stakeholders · 49 sessions · 13 sources · 4-wave roadmap'],
  [10, 'E', 'HC', 301250, 'Phoenix · Data Squad BR · €301K value unlock · 7,712 h saved · 91 screens · +16 p.p. FA-CD'],
  [10, 'M', 'BPC', 0, 'EDDGIE BR H2 · CRM in test'],
  [10, 'M', 'BPC', 0, 'DMP Mexico Go-Live (planned)'],
  [10, 'E', 'X', 120000, 'Mistral & Unitrack · OSA/STK prioritization · €120K · +0.2% OSA'],
  [11, 'M', 'BPC', 0, 'EDDGIE BR H2 · CRM deploy 01/12'],
  [11, 'M', 'HC', 0, 'SPC Indaiatuba · Statistical Process Control (PGLS)'],
];

// Nos textos, *asteriscos* marcam as palavras em destaque (as que no deck aparecem "em chamas").
const DEFAULT_CONFIG = () => ({
  evento: { titulo: 'CDIO HC + BPC', sub: '2026 Townhall', sobre: 'YEAR-END TOWNHALL', data: 'DEC 11 2026', local: 'The Garage', destino: 'DEC 11 2027', presente: 'DEC 11 2026', partida: 'JAN 01 2026' },
  atos: ['Reconnect', 'Rewind 2026', 'Recognize', 'Fast-forward 2027'],
  // Vídeo de abertura: o endereço do arquivo (https://… ou caminho do site). Vazio = o arquivo é arrastado para a tela do telão
  // (ele fica guardado no navegador do telão). auto: começa a tocar assim que o passo entra no ar.
  abertura: { kicker: 'Opening', titulo: 'Back to the *Future*', sub: 'CDIO HC + BPC · 2026 Townhall', video: '', auto: true },
  agenda: {
    kicker: 'Run of show · The Garage', titulo: 'Today\'s *flight plan*', inicio: '14:00',
    // ato (1 a 4) · título · detalhe · minutos (só para calcular os horários: não aparecem na tela) · passo do roteiro a que o item corresponde
    itens: [
      { ato: 1, t: 'Arrival & opening video', d: 'Check-in in the app · Back to the Future / DeLorean hook', min: 10, ref: 'checkin' },
      { ato: 1, t: 'Welcome & journey', d: 'Monserrat, William & Luciano', min: 10, ref: 'boasvindas' },
      { ato: 1, t: 'Connection', d: 'Speed-connection in pairs · Nicolas & Douglas', min: 20, ref: 'connections' },
      { ato: 2, t: '2026 Journey', d: 'Outcomes, impact & leadership takeaways · Claudia & Fermín', min: 35, ref: 'almanaque' },
      { ato: 2, t: 'Reflection', d: 'How AI helped us in 2026 · from experimentation to value realization', min: 15, ref: 'reflexao' },
      { ato: 3, t: 'Recognition 2026', d: 'Stakeholder tributes · 2 BPC + 2 HC', min: 25, ref: 'reconhecimento' },
      { ato: 3, t: 'Break', d: 'Close 2026 · refuel before the journey to 2027', min: 15, ref: 'intervalo' },
      { ato: 4, t: '2027 transition & vision', d: 'Back to the Future · Claudia & Fermín', min: 30, ref: 'visao' },
      { ato: 4, t: 'Success', d: '2027 Manifesto · collective commitment in the app', min: 15, ref: 'sucesso' },
      { ato: 4, t: '88 MPH · Closing', d: 'Young voices · accelerate together', min: 5, ref: 'mph' },
    ],
  },
  boasvindas: {
    kicker: 'Welcome', frase: 'Close 2026 with *pride*. Leave with a clear 2027 *destination*.',
    pessoas: [{ nome: 'Monserrat Diaz', papel: 'WELCOME & JOURNEY' }, { nome: 'William Manganeli', papel: 'WELCOME & JOURNEY' }, { nome: 'Luciano Barbosa', papel: 'LEADERSHIP CONTEXT' }],
    faixa: 'WELCOME · BACK TO THE FUTURE · 2026 → 2027',
  },
  // Nuvem de palavras: cada pessoa responde duas perguntas no celular (texto livre) logo depois do login, no idioma que escolheu.
  // Quando o Doc coloca este passo no ar (depois das boas-vindas), o telão mostra uma nuvem por pergunta, já com tudo o que chegou;
  // quem ainda não respondeu responde na hora e a nuvem vai crescendo. No telão as perguntas aparecem em inglês.
  nuvem: {
    kicker: 'Two questions · word cloud', titulo: 'The crew, in *your own words*',
    perguntas: ['How are you arriving at the Townhall today?', 'Which word best describes your 2026?'],
    perguntasPt: ['Como você está chegando ao Townhall hoje?', 'Que palavra descreve melhor o seu 2026?'],
    perguntasEs: ['¿Cómo llegas hoy al Townhall?', '¿Qué palabra describe mejor tu 2026?'],
    dica: 'Short answers work best: one or two words.',
    dicaPt: 'Respostas curtas funcionam melhor: uma ou duas palavras.',
    dicaEs: 'Las respuestas cortas funcionan mejor: una o dos palabras.',
  },
  // Estratégia 2026 (o slide "LATAM GDT 2026 Strategic Plan"), antes da Jornada 2026: uma faixa de cima, três pilares e a base.
  plano26: {
    kicker: '2026 Strategy', titulo: 'LATAM GDT *2026* Strategic Plan',
    lideres: [{ nome: 'Claudia Meira', papel: 'CDIO BPC LATAM' }, { nome: 'Fermín Grandas', papel: 'CDIO HC LATAM' }, { nome: 'Aldo Medina', papel: 'CDIO Foods LATAM' }],
    topo: { t: 'Desire at Scale', s: 'Master our Social First Demand Generation Model',
      itens: [{ t: 'Content & Social First', d: 'Content Studio | UCA (AR) | Insights' }, { t: 'Measurement', d: 'Rapid ROI (BR and MX)' }, { t: 'Influencer & Social Commerce', d: 'Social + dCom | Influencer @ Scale' }] },
    p1: { t: 'Growth', s: 'Excellence in Frontline Execution · CSP & CD Tooling', itens: [
      { t: 'Perfect Store', d: 'EDDGIE Horizon 1 & 2' },
      { t: 'Pricing & Promo Management', d: 'TPM & TPA improvements (MX & BR), Business Process Review, HC BR NRM & Upose' },
      { t: 'Data Governance & Accuracy', d: 'Brazil Phoenix Data Foundation (BR & Arg), Sellout Governance (BR)' },
      { t: 'Analytics and Insights delivery', d: 'Enabling better decisions through insights generation' },
      { t: 'DCommerce Perfect Store Online', d: 'improve operational efficiency & execution (BW paper WIP)' },
      { t: 'Hermes AI (HPC)', d: '' },
      { t: 'One view of performance to Action – Foods MX', d: 'Performance Hub joins sell-in, sell-out and customer data for a comprehensive view' },
    ] },
    p2: { t: 'Operational Effectiveness', s: 'Reduce complexity, unlock capacity, scale AI', itens: [
      { t: 'AI at Scale', d: 'Unlock Productivity at Scale @ Copilot' },
      { t: 'BR Tax Reform (45M UOP)', d: 'Risk 9MM/Day' },
      { t: 'Improve Cost to Serve', d: '& Capital allocation to boost economy' },
      { t: 'Customer Ops Efficiency', d: 'LATAM Forecast (FEU), BR & AR Fix the S&OP, BR Demand Plan (SKY 2.0), BR Logistic Tower (Optimums Prime), BR New Hubs: Minecraft H1 (14.2M total), MX Service Optimization' },
      { t: 'Apolo', d: 'Local and global TSA agreements' },
    ] },
    p3: { t: 'Net Productivity', s: 'Digital Manufacturing', itens: [
      { t: 'PC - MES Aguaí', d: 'Automation, integration, efficiency & cost control' },
      { t: 'PC - Streamline Valinhos', d: 'WMS Implementation, Smart WH' },
      { t: 'Factory Capacity Expansion', d: 'HC - Appius (Indaiatuba), BW - Macgyver (Vinhedo), PC - Dreamland (Aguaí), BPC - Hidalgo (Cuernavaca)' },
      { t: 'BW Reimagine Program', d: 'Spotify I & II, Automatic Goods Receipt (RFID), Specialties (BR & MX)' },
      { t: 'Foods', d: 'Pouso: Automatic labelling and LGVs. Lerma: Traceability waste avoidance. Pilar: Wrong Addition' },
      { t: 'Logistic Master Plan', d: 'Digital Dispatch (RFID, BR & MX), WMS Improvements, Yard Management, Factory Digital Dispatch (MX & AR)' },
    ] },
    base: { t: 'Governance & Culture', s: '',
      itens: [{ t: 'Cost Management', d: 'BU\'s Budget Model' }, { t: 'Governance on Projects', d: 'Prioritization with clear results' }, { t: 'Strengthen Relationship', d: 'Business Leaders / BG&BU leaders / GDT team' }] },
  },
  almanaque: {
    kicker: 'Front 2 · Reconnect 2026', titulo: 'Our 2026 *almanac*', sub: 'A year of delivery, month by month.', quem: 'Claudia Meira & Fermín Grandas',
    kpis: [{ v: '94%', l: 'Portfolio on track' }, { v: '€35M+', l: 'Targeted savings' }, { v: '#1', l: 'Copilot AI Adoption BW' }],
    kpiEntregas: 'Delivered HC + BPC', kpiBeneficios: 'Benefits delivered 2026',
    itens: ALMANAQUE.map(([m, k, bu, v, t]) => ({ m, k, bu, v, t })),
    fonte: 'Source: AURA, Monthly Portfolio Update, Big Rocks Tracking (10 Deployed · 09 PGLS), CDIO LATAM 2026 H2 Results (Roadmap 2026 & Core Projects), HC Supply Chain BR & Argentina/River Plate Townhall decks.',
    pagina: {
      kicker: '2026 Journey · Delivered', titulo: 'One year, *one page*: everything CDIO HC + BPC delivered in 2026',
      nota: 'Benefits = delivered savings & value reported per project. Not summed: €104M risk avoided (CAE Argentina) · €10.4M expected from Q4\'27 (Inbound WMS). Values pending owner validation.',
      lideranca: 'Claudia Meira, BPC Director & Fermín Grandas, HC Director · Outcomes, impact and the few lessons that define 2026. The almanac is visual evidence, not a project-by-project review.',
    },
  },
  ia: {
    kicker: 'Front 2 · AI in 2026', titulo: 'How AI helped us in *2026*', quem: 'Giovana, Pedro & Felipe',
    texto: 'From experimentation to adoption, use cases and value realization. A concise view of the highlights that changed our timeline.',
    faixa: 'AI 2026 HIGHLIGHTS · EXPERIMENTATION → VALUE REALIZATION',
    nota: 'Use apenas destaques selecionados, exemplos e impacto mensurável. Deixe os bloqueios e o dashboard completo fora da narrativa do Townhall.',
  },
  reconhecimento: {
    kicker: 'Recognition 2026',
    abertura: ['Technology moves us.', '*People take us there.*'], aberturaSub: 'Before the lightning strikes, let\'s hear why this matters most.',
    tributo: 'Our people are the *flux capacitor*', fala: 'Claudia Meira / Luciano Barbosa (to confirm) · 3–5 min', video: '',
    premiosTitulo: 'The 2026 *Clock Tower Awards*', hallTitulo: 'Hall of Fame 2026', hallSub: 'The people who made the 2026 timeline possible.',
    exemplo: true, // os nomes do deck são de exemplo: o aviso sai quando os indicados forem editados
    // como o Flux Capacitor carrega na cerimônia: 'mic' = o microfone ouve os aplausos da sala (quanto mais barulho, mais rápido);
    // 'toques' = cada toque no botão dos celulares soma energia; 'ambos' = as duas coisas
    carga: 'mic',
    // ic: ícone (i raio · c dupla · b ferramenta · f relógio) · n: prêmio · k: categoria · indicados: nome e projeto · vencedor: posição na lista (1 a 4)
    premios: [
      { ic: 'i', n: 'Flux Capacitor', k: 'IMPACT', porque: 'The power source of the year. Recognizes delivery of measurable business value in 2026.',
        criterios: ['Measurable value (savings, growth, productivity)', 'Delivered on commitments', 'Visible to the business'],
        indicados: [{ nome: 'Caio Souza', projeto: 'Phoenix BR' }, { nome: 'William Manganeli', projeto: 'Portfolio' }, { nome: 'Fernando Bolivar', projeto: 'AI Democratization' }, { nome: 'Thaiz Cabral', projeto: 'Delivery' }],
        vencedor: 1, citacao: 'For moving Phoenix forward and turning data foundation work into business value.' },
      { ic: 'c', n: 'Marty & Doc', k: 'COLLABORATION', porque: 'No time travel without the duo. Recognizes bridges built across business, markets, BU and CDIO.',
        criterios: ['Cross-team or cross-market work', 'Shared ownership', 'Made others successful'],
        indicados: [{ nome: 'Vinicius & Nicolas', projeto: 'Townhall Connection' }, { nome: 'Giovana & Lucas', projeto: 'Success 2027 app' }, { nome: 'Felipe & Pedro', projeto: 'Reconnect 2026' }, { nome: 'Nicolas Kuhnast', projeto: 'Copilot Adoption' }],
        vencedor: 2, citacao: 'For building together, across teams, an experience the whole organization will use.' },
      { ic: 'b', n: 'The Garage', k: 'BEHIND THE SCENES', porque: 'Where the machine gets built. Recognizes invisible work that keeps everything running.',
        criterios: ['Governance, data, reporting, rituals', 'Consistency and reliability', 'Low visibility, high dependency'],
        indicados: [{ nome: 'Nicolas Kuhnast', projeto: 'Reporting' }, { nome: 'Thaiz Cabral', projeto: 'Operations' }, { nome: 'Monserrat Diaz', projeto: 'Governance & AURA' }, { nome: 'William Manganeli', projeto: 'Portfolio rituals' }],
        vencedor: 1, citacao: 'For keeping the numbers, rituals and reports right, every single month.' },
      { ic: 'f', n: 'Great Scott!', k: 'FUTURE READY', porque: 'The breakthrough that changes the timeline. Recognizes those preparing us for 2027.',
        criterios: ['AI and new capabilities', 'Learning and adoption', 'Unlocks 2027 priorities'],
        indicados: [{ nome: 'Fernando Bolivar', projeto: 'AI Democratization' }, { nome: 'Monserrat Diaz', projeto: 'AURA agent' }, { nome: 'Caio Souza', projeto: 'Hermes AI' }, { nome: 'Lucas', projeto: 'DeLorean app' }],
        vencedor: 2, citacao: 'For building an AI agent that changes how leadership tracks and decides.' },
    ],
  },
  intervalo: { kicker: 'Break', titulo: 'Refueling the *DeLorean*', min: 15, texto: 'Mr. Fusion is recharging. Grab a coffee, meet someone new, and be back before the clock hits zero.',
    // quando o cronômetro zera, o telão e os celulares mostram um "alerta de emergência" (no estilo da defesa civil) chamando todo mundo de volta
    alertaTitulo: 'Emergency alert', alertaTexto: 'The break is over. The DeLorean leaves for 2027 in a moment: return to your seat now.', alertaOrigem: 'Hill Valley Civil Defense · Time Travel Division' },
  // Visão 2027: a capa do bloco (o nome do bloco, a frase e quem conduz) e, em seguida, a estratégia em tela cheia
  visao: { kicker: 'Fast-forward to 2027', titulo: '2027 Vision', nota: 'Where we\'re going… the CDIO LATAM 2027 Strategy.', quem: 'Claudia Meira & Fermín Grandas' },
  // Capa do bloco Sucesso (a dinâmica é em português): o nome do bloco e quem conduz (Quem conduz cada bloco → Sucesso)
  capasucesso: { kicker: 'Frente 3 · Compromisso 2027', titulo: 'De Volta para o *Sucesso*', sub: 'Quatro perguntas no celular. Um manifesto coletivo para 2027.' },
  manifesto: { kicker: 'Front 3 · 2027 Commitment', mes: 'DEC', dia: '11', ano: '2027', titulo: 'We know the 2027 destination.', pergunta: 'What made it a success?', faixa: 'INTERACTIVE QR / APP · COLLECTIVE 2027 MANIFESTO', quem: 'Lucas & Giovana' },
  mph: { kicker: 'Closing', antes: '2026 gave us the momentum.', chegada: 'Welcome to 2027', depois: 'Where we\'re going, we build the road together.', quem: 'Young voices · accelerate together' },
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
    especial: ['Vinicius Santos'], especialNota: 'Ajudou em toda a organização.',
  },
  creditos: {
    // "TÍTULO: nome, nome" por linha; o elenco (todos os nomes do check-in) entra sozinho no fim
    blocos: [
      { h: 'EXECUTIVE PRODUCERS', l: ['Claudia Meira', 'Luciano Barbosa'] },
      { h: 'FRONT 1 · CONNECTION', l: ['Nicolas Kuhnast', 'Douglas Hamasaki'] },
      { h: 'SPECIAL GUEST · ORGANIZATION', l: ['Vinicius Santos'] },
      { h: 'FRONT 2 · AI IN 2026', l: ['Giovana', 'Pedro', 'Felipe'] },
      { h: 'FRONT 3 · 2027 MANIFESTO', l: ['Lucas', 'Giovana'] },
      { h: 'STRATEGY & STORYLINE', l: ['Monserrat Diaz', 'William Manganeli'] },
      { h: 'DELOREAN APP & AI CHARACTER', l: ['Lucas & Giovana'] },
      { h: 'LOCATION', l: ['The Garage'] },
      { h: 'STARRING', l: ['Every member of CDIO HC + BPC LATAM', 'who made 2026 happen'] },
      { h: 'SPECIAL THANKS', l: ['Our business partners across Brazil, Mexico, River Plate and Andina', 'Global CDIO & D&T teams', 'Everyone who shared their AI story today'] },
    ],
    // frases que passam antes dos créditos (o final estendido do deck)
    final: [['2026', 'The year we delivered'], ['Thank you', 'To every member of CDIO HC + BPC LATAM'], ['Together', 'Brazil · Mexico · River Plate · Andina'], ['Every go-live', 'Every ritual · every report · every story'], ['2027', 'Where we\'re going, we build the road together']],
    fim: 'Thank you', fimSub: 'See you in the future.',
  },
});

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const int = (v, lo, hi, fb) => (Number.isFinite(Number(v)) ? clamp(Math.round(Number(v)), lo, hi) : fb);
const url = v => { const u = String(v ?? '').trim(); return /^(https?:\/\/|\/)[^\s"'<>]*$/i.test(u) ? u.slice(0, 500) : ''; };
const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
const hhmm = v => { const m = String(v || '').trim().match(/^(\d{1,2})[:h](\d{2})$/); return m && +m[1] < 24 && +m[2] < 60 ? `${String(+m[1]).padStart(2, '0')}:${m[2]}` : null; };
const fmtE = v => (v >= 1e6 ? `€${(v / 1e6).toFixed(1)}M` : `€${Math.round(v / 1e3)}K`); // em inglês, como no deck: €51.3M

// Confere uma seção vinda do painel: só campos conhecidos, com os tipos e tamanhos certos. O que não vier fica como está.
function cleanSection(key, cur, p) {
  if (!p || typeof p !== 'object') return cur;
  const out = { ...cur }, txt = (k, n = 200) => { if (p[k] !== undefined) out[k] = clip(p[k], n); };
  switch (key) {
    case 'evento': ['titulo', 'sub', 'sobre', 'data', 'local', 'destino', 'presente', 'partida'].forEach(k => txt(k, 60)); break;
    case 'abertura': txt('kicker', 80); txt('titulo', 80); txt('sub', 120); if (p.video !== undefined) out.video = url(p.video); if (p.auto !== undefined) out.auto = !!p.auto; break;
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
      txt('kicker', 80); txt('frase', 240); txt('faixa', 120);
      if (Array.isArray(p.pessoas)) out.pessoas = p.pessoas.slice(0, 6).map(x => ({ nome: clip(x && x.nome, 60), papel: clip(x && x.papel, 60) })).filter(x => x.nome);
      break;
    case 'nuvem':
      txt('kicker', 80); txt('titulo', 100); txt('dica', 160); txt('dicaPt', 160); txt('dicaEs', 160);
      for (const k of ['perguntas', 'perguntasPt', 'perguntasEs']) if (Array.isArray(p[k])) { const q = p[k].slice(0, 2).map(x => clip(x, 140)); if (q.length < 2 || q.some(x => !x)) fail('A nuvem de palavras precisa das duas perguntas (em inglês, português e espanhol).', 400); out[k] = q; }
      break;
    case 'plano26': {
      txt('kicker', 80); txt('titulo', 100);
      const itens = (list, n) => list.slice(0, n).map(x => ({ t: clip(x && x.t, 80), d: clip(x && x.d, 260) })).filter(x => x.t);
      if (Array.isArray(p.lideres)) out.lideres = p.lideres.slice(0, 5).map(x => ({ nome: clip(x && x.nome, 60), papel: clip(x && x.papel, 60) })).filter(x => x.nome);
      for (const k of ['topo', 'p1', 'p2', 'p3', 'base']) {
        const v = p[k]; if (!v || typeof v !== 'object') continue;
        out[k] = { t: clip(v.t ?? cur[k].t, 60) || cur[k].t, s: clip(v.s ?? cur[k].s, 140), itens: Array.isArray(v.itens) ? itens(v.itens, ['topo', 'base'].includes(k) ? 4 : 10) : cur[k].itens };
        if (!out[k].itens.length) fail('Cada parte da Estratégia 2026 precisa de pelo menos um item.', 400);
      }
      break;
    }
    case 'capasucesso': txt('kicker', 80); txt('titulo', 80); txt('sub', 160); break;
    case 'almanaque':
      txt('kicker', 80); txt('titulo', 80); txt('sub', 160); txt('quem', 80); txt('kpiEntregas', 60); txt('kpiBeneficios', 60); txt('fonte', 400);
      if (Array.isArray(p.kpis)) out.kpis = p.kpis.slice(0, 4).map(x => ({ v: clip(x && x.v, 12), l: clip(x && x.l, 60) })).filter(x => x.v);
      if (Array.isArray(p.itens)) {
        const itens = p.itens.slice(0, 200).map(x => ({ m: int(x && x.m, 0, 11, 0), k: TIPOS[x && x.k] ? x.k : 'M', bu: BUS[x && x.bu] ? x.bu : '', v: int(x && x.v, 0, 1e10, 0), t: clip(x && x.t, 220) })).filter(x => x.t);
        if (!itens.length) fail('O almanaque precisa de pelo menos um item.', 400);
        out.itens = itens.sort((a, b) => a.m - b.m); // estável: dentro do mês vale a ordem digitada
      }
      if (p.pagina && typeof p.pagina === 'object') out.pagina = { kicker: clip(p.pagina.kicker ?? cur.pagina.kicker, 80), titulo: clip(p.pagina.titulo ?? cur.pagina.titulo, 160), nota: clip(p.pagina.nota ?? cur.pagina.nota, 400), lideranca: clip(p.pagina.lideranca ?? cur.pagina.lideranca, 400) };
      break;
    case 'ia': txt('kicker', 80); txt('titulo', 100); txt('texto', 400); txt('faixa', 120); txt('nota', 400); txt('quem', 80); break;
    case 'reconhecimento':
      txt('kicker', 80); txt('aberturaSub', 200); txt('tributo', 120); txt('fala', 160); txt('premiosTitulo', 100); txt('hallTitulo', 80); txt('hallSub', 160);
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
    case 'intervalo': txt('kicker', 80); txt('titulo', 100); txt('texto', 300); txt('alertaTitulo', 40); txt('alertaTexto', 200); txt('alertaOrigem', 80); if (p.min !== undefined) out.min = int(p.min, 1, 120, cur.min); break;
    case 'visao': txt('kicker', 100); txt('titulo', 80); txt('nota', 100); txt('quem', 80); break;
    case 'manifesto': txt('kicker', 80); txt('mes', 6); txt('dia', 4); txt('ano', 6); txt('titulo', 120); txt('pergunta', 120); txt('faixa', 120); txt('quem', 80); break;
    case 'mph': txt('kicker', 80); txt('antes', 160); txt('chegada', 60); txt('depois', 160); txt('quem', 80); break;
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
  abertura: { play: false, at: 0, fim: false },                                                 // vídeo de abertura: tocando, desde quando, terminou
  nuvem: { foco: 0 },                                                                           // nuvens de palavras: 0 = as duas perguntas · 1 ou 2 = só uma em destaque
  plano26: { foco: 0 },                                                                         // Estratégia 2026: 0 = tudo · 1 a 5 = uma parte em destaque
  almanaque: { mes: -1, tocando: false, pagina: false, fim: 0, off: [] },                       // mês -1 = ainda em branco
  reconhecimento: { fase: 'intro', premio: null, passo: 'categoria', at: 0, carga: 0, feitos: [], video: false },
  intervalo: { phase: 'idle', endsAt: null, remaining: null, alerta: null },                 // alerta: quando o "alerta de emergência" de volta do intervalo foi disparado
  visao: { intro: false, aberta: false },                                                     // aberta: false = a capa do bloco · true = a estratégia em tela cheia
  mph: { at: null },
});

// v2: Reflexão e Sucesso na agenda, anfitriões por bloco · v3: o conteúdo das cenas passou para o inglês (deck original),
// entrou o vídeo de abertura e saíram os minutos de cada bloco
const CONFIG_VERSION = 3;
function createCenas() {
  const saved = kvGet('cenas', {}) || {};
  if (saved.config && (saved.v || 1) < CONFIG_VERSION) {
    // Dos textos guardados em português fica só o que não depende do idioma: quem conduz cada bloco, o início da agenda, a
    // duração do intervalo, o vídeo-tributo e como o Flux Capacitor carrega; e, se os indicados já foram trocados pelos de
    // verdade, os indicados, o vencedor e a citação de cada prêmio.
    const old = saved.config, keep = {}, r = old.reconhecimento;
    if (old.anfitrioes) keep.anfitrioes = old.anfitrioes;
    if (old.agenda && old.agenda.inicio) keep.agenda = { inicio: old.agenda.inicio };
    if (old.intervalo && old.intervalo.min) keep.intervalo = { min: old.intervalo.min };
    if (r) {
      const d = DEFAULT_CONFIG().reconhecimento, real = r.exemplo === false && Array.isArray(r.premios);
      keep.reconhecimento = { video: r.video || '', carga: r.carga, ...(real ? { exemplo: false, premios: d.premios.map((p, i) => (r.premios[i] ? { ...p, indicados: r.premios[i].indicados, vencedor: r.premios[i].vencedor, citacao: r.premios[i].citacao || p.citacao } : p)) } : {}) };
    }
    saved.config = keep;
  }
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
      atos: config.atos.map((nome, k) => { const r = itens.filter(x => x.ato === k + 1); return { n: `ACT ${['I', 'II', 'III', 'IV'][k]}`, nome, de: r.length ? r[0].hora : '', ate: r.length ? r[r.length - 1].fim : '', min: r.reduce((s, x) => s + x.min, 0) }; }),
      itens: itens.map(x => ({ ato: x.ato, t: x.t, d: x.d, min: x.min, hora: x.hora, fone: PHONE_REFS.includes(x.ref), estado: x.i === live ? 'agora' : live >= 0 && x.i < live ? 'feito' : '' })) };
  }

  /* ---------- o que vai para todos (telão e celulares) ---------- */
  const actOf = kind => { const k = META[kind].act; return k < 0 ? null : { n: `ACT ${['I', 'II', 'III', 'IV'][k]}`, nome: config.atos[k], k }; };
  function publicState(kind, ctx) {
    if (!META[kind]) return null;
    const base = { kind, name: META[kind].name, ato: actOf(kind) };
    switch (kind) {
      case 'abertura': return { ...base, ...config.abertura, live: { ...state.abertura } };
      case 'agenda': return { ...base, ...agendaView(ctx) };
      case 'boasvindas': return { ...base, ...config.boasvindas };
      case 'nuvem': return { ...base, ...config.nuvem, live: { ...state.nuvem } };
      case 'plano26': return { ...base, ...config.plano26, live: { ...state.plano26 } };
      case 'capasucesso': return { ...base, ...config.capasucesso, quem: names(hosts('sucesso')) };
      case 'almanaque': { const c = config.almanaque, s = state.almanaque; return { ...base, kicker: c.kicker, titulo: c.titulo, sub: c.sub, quem: names(hosts('almanaque')) || c.quem, kpis: c.kpis, kpiEntregas: c.kpiEntregas, kpiBeneficios: c.kpiBeneficios, itens: c.itens, fonte: c.fonte, pagina: c.pagina, stats: almanaqueStats(), meses: MONTHS, bus: BUS, tipos: TIPOS, live: { ...s } }; }
      case 'ia': { const { nota, ...c } = config.ia; return { ...base, ...c }; } // a nota é para quem apresenta: fica só no painel
      case 'reconhecimento': {
        const c = config.reconhecimento, s = state.reconhecimento, feitos = new Set(s.feitos);
        // o vencedor de cada prêmio só vai para os aparelhos quando o sorteio dele começa (o telão precisa saber onde o holofote para)
        const aberto = i => feitos.has(i) || (s.fase === 'cerimonia' && s.premio === i && ['sorteio', 'vencedor'].includes(s.passo));
        return { ...base, kicker: c.kicker, abertura: c.abertura, aberturaSub: c.aberturaSub, tributo: c.tributo, fala: c.fala.replace(/\s*\((a confirmar|to confirm)\)/i, ''), video: c.video, premiosTitulo: c.premiosTitulo, hallTitulo: c.hallTitulo, hallSub: c.hallSub, exemplo: !!c.exemplo,
          premios: c.premios.map((p, i) => ({ ic: p.ic, n: p.n, k: p.k, porque: p.porque, criterios: p.criterios, indicados: p.indicados, feito: feitos.has(i), ...(aberto(i) ? { vencedor: p.vencedor - 1, citacao: p.citacao } : {}) })),
          carga: c.carga || 'mic', quem: names(hosts('reconhecimento')),
          live: { fase: s.fase, premio: s.premio, passo: s.passo, at: s.at, carga: s.carga, nivel: s.passo === 'carga' ? s.nivel || 0 : 0, feitos: s.feitos, video: !!s.video, sorteioMs: DRAW_MS } };
      }
      case 'intervalo': { const c = config.intervalo, s = state.intervalo; return { ...base, ...c, live: { phase: s.phase, endsAt: s.endsAt, remaining: s.remaining === null ? c.min * 60 : s.remaining, duration: s.duration || c.min * 60, alerta: s.alerta || null } }; }
      case 'visao': return { ...base, ...config.visao, quem: names(hosts('visao')) || config.visao.quem, src: '/estrategia-2027.html', live: { ...state.visao } };
      case 'manifesto': return { ...base, ...config.manifesto };
      case 'mph': return { ...base, ...config.mph, live: { ...state.mph } };
      default: return base;
    }
  }
  // quem conduz um bloco (nomes): o servidor junta a foto de perfil de cada um
  const hosts = key => { const k = key === 'capasucesso' ? 'sucesso' : key; return HOST_KEYS.includes(k) ? (config.anfitrioes[k] || []).slice() : []; }; // a capa do Sucesso mostra quem conduz o Sucesso
  // as duas perguntas (e a dica) em cada idioma: os celulares precisam delas desde o check-in, antes de a cena entrar no ar
  const nuvemTexts = () => { const n = config.nuvem; return { q: { en: n.perguntas, pt: n.perguntasPt, es: n.perguntasEs }, tip: { en: n.dica, pt: n.dicaPt, es: n.dicaEs } }; };
  const especial = () => ({ nomes: (config.anfitrioes.especial || []).slice(), nota: config.anfitrioes.especialNota || '' }); // participação especial (Conexões)
  const names = list => (list.length > 1 ? `${list.slice(0, -1).join(', ')} & ${list[list.length - 1]}` : list[0] || '');
  const evento = () => ({ ...config.evento });
  const creditos = () => ({ ...config.creditos, titulo: config.evento.titulo, sub: config.evento.sub });
  const adminState = () => ({ kinds: KINDS, open: OPEN_KINDS, meta: META, config, state, stats: almanaqueStats(), months: MONTHS, bus: BUS, tipos: TIPOS, drawMs: DRAW_MS });

  /* ---------- almanaque ---------- */
  function stopPlay() { clearInterval(playT); playT = null; clearTimeout(pageT); pageT = null; state.almanaque.tocando = false; }
  // A Jornada 2026 é contada de trás para a frente: começa em dezembro e o carro vai de ré, mês a mês, até janeiro.
  function almanaque(a) {
    const s = state.almanaque;
    switch (a.action) {
      case 'mes': stopPlay(); s.mes = int(a.mes, -1, 11, 11); s.pagina = false; break;
      case 'prox': stopPlay(); s.mes = s.mes < 0 ? 11 : Math.max(0, s.mes - 1); s.pagina = false; break;   // próximo passo da viagem: um mês para trás
      case 'ant': stopPlay(); s.mes = s.mes < 0 ? 11 : Math.min(11, s.mes + 1); s.pagina = false; break;   // volta um passo: um mês para a frente
      case 'tocar': {
        if (s.tocando) { stopPlay(); break; }
        stopPlay(); s.pagina = false; s.tocando = true;
        if (s.mes <= 0) s.mes = 11;                                                                         // em branco (ou já em janeiro): parte de dezembro
        playT = setInterval(() => {
          if (s.mes <= 0) { // chegou a janeiro: fanfarra no telão e, logo depois, o resumo em uma página
            clearInterval(playT); playT = null; s.tocando = false; s.fim = now(); emit();
            pageT = setTimeout(() => { pageT = null; s.pagina = true; emit(); }, 2600);
            return;
          }
          s.mes--; emit();
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
    // o cronômetro zerou: dispara o "alerta de emergência" no telão e nos celulares
    if (s.phase === 'run' && s.endsAt) breakT = setTimeout(() => { breakT = null; s.phase = 'done'; s.endsAt = null; s.remaining = 0; s.alerta = now(); emit({ title: `🚨 ${config.intervalo.alertaTitulo}`, body: config.intervalo.alertaTexto }); }, Math.max(0, s.endsAt - now()) + 50);
  }
  function intervalo(a) {
    const s = state.intervalo, left = () => (s.phase === 'run' && s.endsAt ? Math.max(0, Math.ceil((s.endsAt - now()) / 1000)) : s.remaining === null ? config.intervalo.min * 60 : s.remaining);
    switch (a.action) {
      case 'start': { const d = a.min ? int(a.min, 1, 120, config.intervalo.min) * 60 : config.intervalo.min * 60; s.duration = d; s.remaining = d; s.endsAt = now() + d * 1000; s.phase = 'run'; s.alerta = null; break; }
      case 'alerta': s.alerta = now(); armBreak(); return emit({ title: `🚨 ${config.intervalo.alertaTitulo}`, body: config.intervalo.alertaTexto }); // dispara (ou repete) o alerta na hora
      case 'silenciar': s.alerta = null; break;
      case 'pause': if (s.phase === 'run') { s.remaining = left(); s.endsAt = null; s.phase = 'paused'; } break;
      case 'resume': if (s.phase === 'paused') { s.endsAt = now() + s.remaining * 1000; s.phase = 'run'; } break;
      case 'add': { const d = int(a.seconds, -600, 600, 60), r = Math.max(0, left() + d); s.duration = Math.max(1, (s.duration || config.intervalo.min * 60) + d); if (s.phase === 'run') s.endsAt = now() + r * 1000; else { s.remaining = r; if (s.phase === 'done' && r > 0) { s.phase = 'paused'; s.alerta = null; } } break; }
      case 'reset': Object.assign(s, defaultState().intervalo); break;
      default: fail('Comando inválido.', 400);
    }
    armBreak(); emit();
  }

  /* ---------- vídeo de abertura: tocar, pausar, recomeçar, terminou ---------- */
  function abertura(a) {
    const s = state.abertura;
    switch (a.action) {
      case 'play': s.play = a.on === undefined ? true : !!a.on; if (s.play) { s.fim = false; if (!s.at) s.at = now(); } break;
      case 'reiniciar': s.play = true; s.fim = false; s.at = now(); break;   // "at" novo: o telão volta o vídeo para o começo
      case 'fim': s.play = false; s.fim = true; break;                       // o vídeo chegou ao fim (o telão avisa) ou o Doc encerrou
      case 'reset': Object.assign(s, defaultState().abertura); break;
      default: fail('Comando inválido.', 400);
    }
    emit();
  }

  function command(kind, a) {
    if (!a || typeof a !== 'object') fail('Comando inválido.', 400);
    switch (kind) {
      case 'abertura': return abertura(a);
      case 'nuvem': if (a.action !== 'foco') fail('Comando inválido.', 400); state.nuvem.foco = int(a.n, 0, 2, 0); return emit();
      case 'plano26': // uma parte em destaque por vez (1 a 5), ou tudo (0)
        if (a.action === 'foco') state.plano26.foco = int(a.n, 0, 5, 0); else if (a.action === 'prox') state.plano26.foco = (state.plano26.foco + 1) % 6; else fail('Comando inválido.', 400);
        return emit();
      case 'almanaque': return almanaque(a);
      case 'reconhecimento': return reconhecimento(a);
      case 'intervalo': return intervalo(a);
      case 'visao': // capa do bloco → a estratégia em tela cheia; a página pode começar pela abertura em vídeo dela
        if (a.action === 'intro') state.visao.intro = !!a.on; else if (a.action === 'abrir') state.visao.aberta = a.on === undefined ? true : !!a.on; else fail('Comando inválido.', 400);
        return emit();
      case 'mph': if (a.action === 'go') state.mph.at = now(); else if (a.action === 'reset') state.mph.at = null; else fail('Comando inválido.', 400); return emit(a.action === 'go' ? { title: '88 MPH!', body: config.mph.chegada } : null);
      default: fail('Esta cena não tem comandos.', 400);
    }
  }
  // A cena entrou no ar vinda de outro passo: começa do início, como no deck (o almanaque em branco, o reconhecimento
  // na abertura, o velocímetro em zero). Os prêmios já revelados e o cronômetro do intervalo ficam como estão.
  function enter(kind) {
    if (kind === 'abertura') Object.assign(state.abertura, { play: !!config.abertura.auto, at: now(), fim: false }); // o vídeo começa do início
    if (kind === 'nuvem') state.nuvem.foco = 0;
    if (kind === 'plano26') state.plano26.foco = 0;
    if (kind === 'visao') state.visao.aberta = false;                                                // o bloco começa pela capa
    if (kind === 'intervalo') state.intervalo.alerta = null;                                         // um alerta antigo não volta para a tela
    if (kind === 'almanaque') { stopPlay(); Object.assign(state.almanaque, { mes: -1, tocando: false, pagina: false, fim: 0 }); }
    if (kind === 'reconhecimento') { clearTimeout(drawT); drawT = null; Object.assign(state.reconhecimento, { fase: 'intro', premio: null, passo: 'categoria', carga: 0, at: now(), video: false }); }
    if (kind === 'mph') state.mph.at = null;
    save();
  }
  // O evento saiu de uma cena (outro passo, aviso, dinâmica): o que estava "tocando" para. O cronômetro do intervalo segue contando.
  function sync(onAir) {
    if (onAir !== 'abertura' && state.abertura.play) { state.abertura.play = false; save(); }
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
  return { publicState, adminState, evento, creditos, hosts, especial, nuvemTexts, command, tap, mic, enter, sync, setConfig, resetConfig, resetState, resetKind,
    onChange: fn => listeners.push(fn), onPulse: fn => pulses.push(fn), agendaView, config: () => config };
}

module.exports = { createCenas, KINDS, OPEN_KINDS, META, MONTHS, HOST_KEYS, PHONE_REFS, DEFAULT_CONFIG };
