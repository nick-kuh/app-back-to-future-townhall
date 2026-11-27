// Motor do evento: estado do townhall (blocos), bloco de conexões (fases, timer,
// duplas, filas de perguntas, ranking e resultados), pessoas e perguntas.
const crypto = require('crypto');
const { db, kvGet, kvSet, seedIfEmpty, resetQuestions, dbEpoch } = require('./db');
const { generateRounds, checkGroups, pairKey } = require('./matching');
const { buildQueues, ERAS, eraOfRound, CATEGORIES, catKey, catOfRound, QUESTION_MODES } = require('./queues');
const { computeResults, POINTS } = require('./results');
const { KINDS: CENA_KINDS, META: CENA_META, OPEN_KINDS } = require('./cenas');
const { createFotos } = require('./fotos');

const TOTAL_ROUNDS = 3;
const BLOCKS = ['standby', 'welcome', 'message', 'connections', 'closing', 'stage', 'reflexao', 'doc', 'cena'];
const AUDIO_MODES = ['off', 'music', 'ambient', 'spotify']; // spotify: a música vem do Spotify de quem está no Painel do Doc (o telão fica sem a trilha do app)

// Roteiro do evento: a ordem dos passos que o Doc percorre no painel ("Próximo ▶").
//  checkin · stage (bloco de fala: título, tema, quem fala) · connections · sucesso (dinâmica d1..d4)
//  reflexao (as paradas com votação em projetos) · doc (Visão 2027: o Doc chega de 2027 e resume as respostas do Sucesso)
//  cena (uma cena do deck do townhall: plano de voo, boas-vindas, almanaque 2026, IA, reconhecimento, intervalo,
//        estratégia 2027, manifesto, 88 MPH; o conteúdo e os comandos ficam em server/cenas.js)
//  message (aviso/intervalo) · standby (olhos no telão) · closing
const STEP_TYPES = ['checkin', 'stage', 'connections', 'sucesso', 'doc', 'reflexao', 'cena', 'message', 'standby', 'closing'];
const SUCESSO_ACTS = ['d1', 'd2', 'd3', 'd4'];
const clip = (v, n) => String(v ?? '').trim().slice(0, n);
// Roteiro padrão: a agenda do townhall (deck v18) em 4 atos. Conexões, Reflexão e as dinâmicas do Sucesso são os
// blocos interativos de sempre; os outros passos são as cenas do deck.
//   ATO I · Reconectar: chegada (check-in) · vídeo de abertura · boas-vindas · nuvem de palavras · plano de voo · Conexões
//   ATO II · Rebobinar 2026: Estratégia 2026 · Jornada 2026 (almanaque) · IA em 2026 + Reflexão
//   ATO III · Reconhecer: Reconhecimento 2026 · intervalo
//   ATO IV · Avançar para 2027: Visão 2027 (capa + estratégia) · capa do Sucesso + Sucesso 01 a 04 + o Doc · 88 MPH · créditos e feedback
// "Como a IA nos ajudou em 2026" é o próprio bloco Reflexão, e o "Manifesto 2027" é o bloco Sucesso: um passo só para cada.
function defaultSteps() {
  const cena = k => ({ type: 'cena', cena: k });
  return [
    { type: 'checkin' },                // a porta de entrada: é por aqui que todo mundo faz o login
    cena('abertura'),                   // quando o evento começa: o vídeo de abertura
    cena('boasvindas'),                 // boas-vindas
    cena('nuvem'),                      // duas perguntas no celular: as respostas viram as nuvens de palavras
    cena('agenda'),                     // o plano de voo do dia
    { type: 'connections' },
    cena('plano26'), cena('almanaque'), // a Estratégia 2026 e, em seguida, a Jornada 2026 (de dezembro para janeiro)
    { type: 'reflexao' },
    cena('reconhecimento'), cena('intervalo'),
    cena('visao'),                      // capa do bloco e a Estratégia 2027 em tela cheia
    cena('capasucesso'),                // capa do bloco Sucesso
    { type: 'sucesso', activity: 'd1' }, { type: 'sucesso', activity: 'd2' }, { type: 'sucesso', activity: 'd3' }, { type: 'sucesso', activity: 'd4' },
    { type: 'doc' },                    // Visão 2027 do Doc: fecha o Sucesso com o resumo do que todo mundo escreveu
    cena('mph'),
    { type: 'closing' },                // créditos e o formulário de feedback nos celulares
  ].map((x, i) => ({ id: 'p' + (i + 1), ...x, ...(noTransition(x) ? { transition: false } : {}) }));
}
// Passos que entram direto, sem a "viagem no tempo" de transição (pedido da organização): vídeo de abertura, boas-vindas, nuvem de palavras,
// Jornada 2026 (a transição do bloco acontece antes, na Estratégia 2026), reconhecimento, intervalo, as dinâmicas do Sucesso (a transição
// acontece na capa do bloco) e o Doc, 88 MPH e os créditos. Em Preparar → Roteiro dá para ligar e desligar em cada passo.
const NO_TRANSITION_CENAS = ['abertura', 'boasvindas', 'nuvem', 'almanaque', 'reconhecimento', 'intervalo', 'mph'];
function noTransition(x) { return ['sucesso', 'doc', 'closing'].includes(x.type) || (x.type === 'cena' && NO_TRANSITION_CENAS.includes(x.cena)); }
// Valida o roteiro vindo do painel: tipos conhecidos, textos com limite, ids únicos; Conexões, Reflexão,
// Visão 2027 e cada dinâmica do Sucesso só entram uma vez (o estado delas é um só).
function cleanSteps(list) {
  const out = [], ids = new Set(), once = new Set();
  for (const raw of (Array.isArray(list) ? list : []).slice(0, 40)) {
    if (!raw || !STEP_TYPES.includes(raw.type)) continue;
    if (raw.type === 'sucesso' && !SUCESSO_ACTS.includes(raw.activity)) continue;
    if (raw.type === 'cena' && !CENA_KINDS.includes(raw.cena)) continue;
    const unique = ['connections', 'reflexao', 'doc'].includes(raw.type) ? raw.type : raw.type === 'sucesso' ? raw.activity : raw.type === 'cena' ? 'cena:' + raw.cena : null;
    if (unique) { if (once.has(unique)) continue; once.add(unique); }
    let id = typeof raw.id === 'string' && /^[a-z0-9]{1,16}$/i.test(raw.id) && !ids.has(raw.id) ? raw.id : null;
    while (!id || ids.has(id)) id = 'p' + crypto.randomBytes(4).toString('hex');
    ids.add(id);
    const step = { id, type: raw.type };
    if (raw.type === 'stage') { step.title = clip(raw.title, 60) || 'Bloco'; step.theme = clip(raw.theme, 200); step.speaker = clip(raw.speaker, 80); }
    if (raw.type === 'message') { step.emoji = clip(raw.emoji, 8) || '📣'; step.title = clip(raw.title, 80) || 'Aviso'; step.body = clip(raw.body, 600); }
    if (raw.type === 'sucesso') step.activity = raw.activity;
    if (raw.type === 'cena') step.cena = raw.cena;
    if (raw.transition === false) step.transition = false; // este passo entra direto, sem a transição do filme
    out.push(step);
  }
  return out;
}
const PHASES = ['idle', 'ready', 'matching', 'talk', 'roundEnd', 'ranking', 'results'];

const DEFAULT_SETTINGS = {
  eventName: 'CDIO HC + BPC · Townhall 2026',
  roundSeconds: 120,      // conversa de cada viagem (2 minutos)
  findSeconds: 40,        // tempo para a dupla se encontrar antes da conversa
  questionMode: 'rodada', // perguntas sorteadas: 'rodada' = uma categoria por viagem · 'mix' = as três categorias misturadas em toda viagem
  breakSeconds: 6,        // "88 MPH!" entre uma viagem e a próxima
  rankingSeconds: 120,    // avaliação fecha sozinha depois disso (ou quando todos avaliarem)
  autoFlow: true,         // viagens e avaliação avançam sozinhas
  showMutualOnScreen: false,
  showFormHints: true,
  welcomeText: 'Hang tight: the journey is about to begin.',
  closingText: 'Thank you for travelling with us. Now go grab that coffee with your connection!',
  standbyText: 'You don\'t need your phone right now.',
  steps: null,            // roteiro do evento (montado no construtor; editável em Preparar → Roteiro)
  stageText: 'All eyes on the stage.',
  stageMutes: true,       // exibir um bloco de fala desliga o som do telão
  transitions: true,      // transição do filme no telão e nos celulares ao trocar de bloco
  transitionSeconds: 8,   // quanto dura a transição entre blocos (avisos e "olhos no telão" entram em 3 s)
  // Modo confidencial: o conteúdo do townhall (cenas do deck, blocos de fala, créditos e a estratégia 2027) só aparece para
  // quem entrou com a senha mestra (Painel do Doc e o telão aberto nesse navegador). Os celulares e os outros telões veem
  // "olhe para o telão". No dia do evento o Doc libera para todos (Painel do Doc → 🔒 Confidencial).
  confidencial: true,
  // Idioma do app no celular: 'pessoa' = o que cada pessoa escolhe no login (português, espanhol ou inglês) · 'en' = sempre em inglês
  // (aí a escolha vale só para as dinâmicas e para as duas perguntas da nuvem de palavras)
  appLang: 'pessoa',
  // quem não participa de cada bloco (ex.: quem coordena): faz o login e conta presença, mas fica fora das duplas, da votação ou das respostas
  skip: { connections: [], reflexao: [], sucesso: [] },
  musicUrl: '',           // opcional: arquivo de áudio próprio para "Música" (senão, toca a trilha gerada no navegador)
  ambientUrl: '',         // opcional: arquivo de áudio próprio para "Trilha sonora"
  // Visão 2027 (o Doc no telão): voz do navegador do telão lendo a fala, e um vídeo de abertura opcional
  docVoice: true,         // o telão fala o texto (voz em português do navegador)
  docVoiceName: '',       // parte do nome da voz preferida (ex.: "Antonio"); vazio = escolhe a melhor voz masculina em pt-BR
  docRate: 1,             // velocidade da fala (0,7 a 1,4)
  docVideoUrl: '',        // opcional: vídeo do Doc (ex.: feito com IA), tocado na chegada
  docVideoFull: false,    // o vídeo já traz a fala completa: depois dele o telão vai direto para o jornal e o 2027
  spotifyClientId: '',    // Client ID do app do Spotify (Preparar → Ajustes → Spotify); a conexão em si fica no navegador do Doc
  spotifyBreak: false,    // no intervalo, tocar o Spotify em vez da música do app
  agenda: [
    { time: '', title: 'Boas-vindas e check-in' },
    { time: '', title: 'Conexões · 3 viagens no tempo' },
    { time: '', title: 'Encerramento' },
  ],
};
const DEFAULT_MESSAGE = { title: 'Break', body: 'Back in 15 minutes.', emoji: '☕' };
// Textos padrão antigos (em português): quem ainda os tem guardados passa para os novos, em inglês (o app agora é em inglês)
const OLD_TEXTS = { welcomeText: 'Aguarde: a viagem começa em breve.', closingText: 'Obrigado por viajar com a gente. Marque aquele café com a sua conexão!', standbyText: 'Agora você não precisa do celular.', stageText: 'Agora a atenção é no palco.' };
// Passos do roteiro com conteúdo do townhall (confidencial até o Doc liberar): as cenas do deck e os blocos de fala. Ficam de fora
// as cenas que não contam nada do townhall (nuvem de palavras, intervalo e a capa do Sucesso) e o encerramento (só os créditos são guardados).
// Avisos das telas do townhall: em inglês, com a versão em português e em espanhol (o celular mostra no idioma que a pessoa escolheu).
// Os avisos das dinâmicas são em português, com a versão em espanhol.
const tri = (en, pt, es, extra = {}) => ({ title: en[0], body: en[1], pt: { title: pt[0], body: pt[1] }, es: { title: es[0], body: es[1] }, ...extra });
const lookNotice = (name, secret) => tri([name, 'Look at the big screen.'], [name, 'Olhe para o telão.'], [name, 'Mira la pantalla.'], { secret });
const NOTICES = {
  closing: () => tri(['End of the journey', '📱 One last thing: tell us how the Townhall was.'], ['Fim da viagem', '📱 Só mais uma coisa: conte como foi o Townhall.'], ['Fin del viaje', '📱 Una última cosa: cuéntanos cómo estuvo el Townhall.']),
  back: () => tri(['Time circuits on', 'We are back. Check your phone.'], ['Circuitos do tempo ligados', 'Voltamos. Olhe o celular.'], ['Circuitos del tiempo encendidos', 'Volvimos. Mira tu celular.']),
  nuvem: () => tri(['Word cloud', '👀 The answers are on the big screen. Not answered yet? Do it now on your phone.'], ['Nuvem de palavras', '👀 As respostas estão no telão. Ainda não respondeu? Responda agora no celular.'], ['Nube de palabras', '👀 Las respuestas están en la pantalla. ¿Aún no respondiste? Hazlo ahora en tu celular.']),
};
const confidentialStep = step => !!step && (step.type === 'stage' || (step.type === 'cena' && !OPEN_KINDS.includes(step.cena)));
// Nuvem de palavras: a resposta de cada pergunta é um texto livre curto (sem quebras de linha nem símbolos soltos, até 80 letras)
const cleanAnswer = v => String(v ?? '').normalize('NFC').replace(/[\u0000-\u001f<>"`{}\[\]\\|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
// O que entra na nuvem: a resposta curta inteira (até 3 palavras) ou, se a pessoa escreveu uma frase, as palavras dela sem os conectivos
const STOP = new Set(('a o os as um uma uns umas de do da dos das e em no na nos nas com por para pra que eu me meu minha muito muita muitos muitas mais mas como estou esta está to tô é foi ser sou ao à às bem hoje chegando '
  + 'el la los las un una unos unas y del al en con que yo mi muy más mucho mucha muchos muchas pero estoy es soy lo se hoy llegando '
  + 'the an and of to in on for with i im i\'m my me is am are was very so it this that at be but a lot much many really today feel feeling arriving').split(' '));
function termsOf(answer) {
  const s = String(answer || '').replace(/[.,;:!?¡¿()“”…]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return [];
  const parts = s.split(' ');
  if (s.length <= 24 && parts.length <= 3) return [s];
  const seen = new Set(), out = [];
  for (const w of parts) { const k = w.toLocaleLowerCase('pt-BR'); if (w.length < 3 || STOP.has(k) || seen.has(k)) continue; seen.add(k); out.push(w); }
  return out.slice(0, 8);
}
const defaultConn = () => ({ phase: 'idle', round: 0, played: 0, timer: null, generatedAt: null, worstLevel: null, levels: {}, resultsAt: null, repeats: false });
const DEFAULT_SCREEN = { scene: 'auto' }; // telão: auto (segue o bloco) | clock | logo | quote
// Visão 2027: a mensagem do Doc (gerada no servidor) e a cena no telão (play: qual parte, pausada ou não)
const defaultDoc = () => ({ status: 'idle', message: null, error: '', rev: 0, play: null, phones: false });

const now = () => Date.now();
const iso = () => new Date().toISOString();
const bool = v => (v ? 1 : 0);
const human = (s, and = 'e') => (s >= 60 ? `${Math.floor(s / 60)} min${s % 60 ? ` ${and} ${s % 60} s` : ''}` : `${s} s`);
const parse = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };

function normalizeWl(s) {
  const u = String(s || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!u) return '';
  if (/^(ESTAG|ESTAGIARI|ESTAGIÁRI|INTERN|TRAINEE)/.test(u)) return 'Estag';
  const m = u.match(/^WL?\s*([0-9])$/) || u.match(/^WL([0-9])/);
  if (m) return 'WL' + m[1];
  return String(s).trim();
}
const normName = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const normText = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

class Engine {
  constructor() {
    seedIfEmpty();
    // Atualização da lista pedida pela organização (vale uma vez, para bancos que já tinham a lista antiga):
    // sai Jonathan Toledo; entram Evelyn Aguiar e Renato Malvino.
    const added = []; // quem entrou na lista agora (para buscar a foto no pacote da instalação)
    if (!kvGet('peopleV2', false)) {
      const byName = name => db.prepare('SELECT id FROM people WHERE name = ?').get(name);
      const out = byName('Jonathan Toledo');
      if (out) {
        // quem já está em duplas sorteadas não pode sumir da lista: fica marcado como ausente
        if (this.allGroups().some(g => g.members.includes(out.id))) db.prepare('UPDATE people SET active = 0 WHERE id = ?').run(out.id);
        else for (const sql of ['DELETE FROM people WHERE id = ?', 'DELETE FROM rankings WHERE person_id = ?', 'DELETE FROM results WHERE person_id = ?', 'DELETE FROM seen WHERE person_id = ?', 'DELETE FROM photos WHERE person_id = ?']) db.prepare(sql).run(out.id);
      }
      let order = db.prepare('SELECT COALESCE(MAX(sort_order),0) AS m FROM people').get().m;
      for (const p of require('./seed/people').filter(x => ['Evelyn Aguiar', 'Renato Malvino'].includes(x.name))) {
        if (!byName(p.name)) added.push(Number(db.prepare('INSERT INTO people (name, email, wl, team, manager, area, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)').run(p.name, p.email, p.wl, p.team, p.manager, p.area, ++order).lastInsertRowid));
      }
      kvSet('peopleV2', true);
    }
    // Acerto dos dois que entraram (vale uma vez, e só se a linha ainda estiver como entrou): a Evelyn é do time
    // Consumer do BPC, com o Felipe Resck; a área do Renato é Tech Foundation, com a Claudia Meira.
    if (!kvGet('peopleV3', false)) {
      db.prepare("UPDATE people SET team = 'CDIO BPC', manager = 'Felipe Resck' WHERE name = 'Evelyn Aguiar' AND team = '' AND manager = ''").run();
      db.prepare("UPDATE people SET area = 'Tech Foundation' WHERE name = 'Renato Malvino' AND area = 'Architecture' AND team = 'Tech Found'").run();
      kvSet('peopleV3', true);
    }
    // fotos de perfil: guardadas no banco; a pasta de fotos da instalação (se houver) entra quando o banco começa vazio
    this.fotos = createFotos();
    { // fotos que acompanham a instalação: a pasta (se houver) e o pacote criptografado (aberto com FOTOS_KEY)
      const people = db.prepare('SELECT id, name FROM people').all();
      this.fotos.seedFromDir(people);
      const r = this.fotos.seedFromPack(people);
      for (const id of added) this.fotos.seedFor(id, people); // quem entrou na lista agora ganha a foto que já está no pacote
      const quiet = process.env.DB_PATH === ':memory:'; // nos testes, sem avisos
      if (r && r.locked) { if (!quiet) console.warn(`[fotos] o pacote de fotos da instalação não foi aberto: ${r.reason}. O app segue com as iniciais.`); }
      else if (r && !quiet) console.log(`[fotos] ${r.matched} fotos de perfil carregadas do pacote da instalação.`);
    }
    const saved = kvGet('state', {});
    if (saved.message && saved.message.title === 'Intervalo' && saved.message.body === 'Voltamos em 15 minutos.') delete saved.message; // aviso padrão antigo
    this.state = {
      block: BLOCKS.includes(saved.block) ? saved.block : 'welcome',
      message: Object.assign({}, DEFAULT_MESSAGE, saved.message || {}),
      conn: Object.assign(defaultConn(), saved.conn || {}),
      screen: Object.assign({}, DEFAULT_SCREEN, saved.screen || {}),
      // Dinâmica do "De Volta para o Sucesso" em exibição no telão e nos celulares (null = townhall)
      presentation: saved.presentation && saved.presentation.roomId ? saved.presentation : null,
      step: typeof saved.step === 'string' ? saved.step : null,      // passo do roteiro que está no ar
      detour: saved.detour === 'message' || saved.detour === 'standby' ? saved.detour : null, // tela avulsa fora do roteiro
      returnStep: typeof saved.returnStep === 'string' ? saved.returnStep : null,           // de onde o evento saiu para uma dinâmica do Sucesso
      sucessoRoom: typeof saved.sucessoRoom === 'string' ? saved.sucessoRoom : null,        // sala das dinâmicas do Sucesso (criada sozinha)
      audio: Object.assign({ mode: 'off', volume: 60, out: 'telao', beeps: true }, saved.audio || {}), // som: off | music | ambient · sai do telão ou do painel · bipes do cronômetro
      drawn: saved.drawn && typeof saved.drawn === 'object' ? saved.drawn : {}, // respostas já sorteadas por dinâmica/rodada
      doc: Object.assign(defaultDoc(), saved.doc || {}),
    };
    if (this.state.doc.status === 'generating') this.state.doc.status = this.state.doc.message ? 'ready' : 'idle'; // o servidor reiniciou no meio da geração
    delete this.state.conn.talk; // modelo antigo
    this.settings = Object.assign({}, DEFAULT_SETTINGS, kvGet('settings', {}));
    this.settings.skip = this.cleanSkip(this.settings.skip);
    if (!QUESTION_MODES.includes(this.settings.questionMode)) this.settings.questionMode = 'rodada';
    // Ajustes das Conexões pedidos pela organização (valem uma vez; o que for mudado depois no painel fica):
    // 2 minutos de conversa por viagem e 40 segundos para a dupla se encontrar.
    if (!this.settings.connV2) {
      this.settings.roundSeconds = DEFAULT_SETTINGS.roundSeconds; this.settings.findSeconds = DEFAULT_SETTINGS.findSeconds;
      this.settings.connV2 = true;
    }
    // Banco de perguntas antigo (eras presente/passado/futuro) dá lugar ao banco do "Speed Dating" em três categorias.
    if (db.prepare("SELECT COUNT(*) AS n FROM questions WHERE era IN ('presente', 'passado', 'futuro')").get().n && !['matching', 'talk'].includes(this.state.conn.phase)) {
      resetQuestions(); db.exec('DELETE FROM seen WHERE question_id NOT IN (SELECT id FROM questions)');
    }
    if (this.state.screen.scene === 'clock') this.state.screen.scene = 'auto'; // o modo "relógio" do telão saiu
    // Roteiro na agenda do townhall (deck v18): vale uma vez para quem tinha o roteiro antigo guardado; depois,
    // o que for mudado em Preparar → Roteiro fica.
    if (!this.settings.agendaV18) {
      this.settings.steps = null; this.settings.agendaV18 = true;
      if (!kvGet('settings', {}).eventName || this.settings.eventName === 'Townhall · De Volta ao Futuro') this.settings.eventName = DEFAULT_SETTINGS.eventName;
    }
    let steps = cleanSteps(this.settings.steps);
    // Roteiros guardados antes destes ajustes (valem uma vez): "IA em 2026" e "Manifesto 2027" saem, porque são os
    // próprios blocos Reflexão e Sucesso; e os passos que entram sem transição ficam marcados.
    // Spotify: o Client ID também pode vir da instalação (variável SPOTIFY_CLIENT_ID), para não se perder quando o servidor reinicia
    if (!this.settings.spotifyClientId && /^[0-9a-zA-Z]{20,64}$/.test(process.env.SPOTIFY_CLIENT_ID || '')) this.settings.spotifyClientId = process.env.SPOTIFY_CLIENT_ID;
    if (!this.settings.roteiroV19) {
      steps = steps.filter(x => !(x.type === 'cena' && ['ia', 'manifesto'].includes(x.cena))).map(x => (noTransition(x) ? { ...x, transition: false } : x));
      this.settings.roteiroV19 = true;
    }
    // Novo começo do evento (vale uma vez para roteiros guardados): check-in → vídeo de abertura → boas-vindas → plano de voo.
    if (!this.settings.roteiroV20) {
      if (steps.length && !steps.some(x => x.type === 'cena' && x.cena === 'abertura')) {
        const at = steps.findIndex(x => x.type === 'checkin');
        steps.splice(at < 0 ? 0 : at + 1, 0, { id: 'p' + crypto.randomBytes(4).toString('hex'), type: 'cena', cena: 'abertura', transition: false });
      }
      const ag = steps.findIndex(x => x.type === 'cena' && x.cena === 'agenda'), bv = steps.findIndex(x => x.type === 'cena' && x.cena === 'boasvindas');
      if (ag >= 0 && bv === ag + 1) [steps[ag], steps[bv]] = [steps[bv], steps[ag]]; // a agenda passa para depois das boas-vindas
      this.settings.roteiroV20 = true;
    }
    // Ajustes do roteiro (valem uma vez para roteiros guardados): a nuvem de palavras depois das boas-vindas, a Estratégia 2026 antes da
    // Jornada 2026 (que passa a entrar direto), a capa do bloco Sucesso antes da primeira dinâmica e a Visão 2027 com transição.
    if (!this.settings.roteiroV21) {
      const has = k => steps.some(x => x.type === 'cena' && x.cena === k), at = k => steps.findIndex(x => x.type === 'cena' && x.cena === k);
      const put = (i, k, tr) => steps.splice(i, 0, { id: 'p' + crypto.randomBytes(4).toString('hex'), type: 'cena', cena: k, ...(tr ? {} : { transition: false }) });
      if (steps.length) {
        if (!has('nuvem')) { const i = at('boasvindas') >= 0 ? at('boasvindas') : at('abertura') >= 0 ? at('abertura') : steps.findIndex(x => x.type === 'checkin'); put(i + 1, 'nuvem', false); }
        if (!has('plano26') && has('almanaque')) { put(at('almanaque'), 'plano26', true); steps[at('almanaque')].transition = false; }
        if (!has('capasucesso') && steps.some(x => x.type === 'sucesso')) put(steps.findIndex(x => x.type === 'sucesso'), 'capasucesso', true);
        if (has('visao')) delete steps[at('visao')].transition;
      }
      this.settings.roteiroV21 = true;
    }
    // Transição entre blocos mais rápida (vale uma vez): quem estava com os 15 s de antes passa para 8 s.
    if (!this.settings.fastV1) { if ((this.settings.transitionSeconds || 15) >= 15) this.settings.transitionSeconds = 8; this.settings.fastV1 = true; }
    delete this.settings.wordsLive;
    // O app passou para o inglês: quem ainda tem os textos padrão antigos (em português) guardados recebe os novos, uma vez.
    if (!this.settings.enV1) {
      for (const [k, old] of Object.entries(OLD_TEXTS)) if (this.settings[k] === old) this.settings[k] = DEFAULT_SETTINGS[k];
      this.settings.enV1 = true;
    }
    // Perguntas guardadas antes de existir a versão em espanhol recebem a tradução do banco padrão (pelo texto em português)
    if (!kvGet('questionsEs', false)) {
      const es = new Map(require('./seed/questions').map(q => [normText(q.text), q.es])), upd = db.prepare("UPDATE questions SET text_es = ? WHERE id = ? AND COALESCE(text_es, '') = ''");
      for (const q of db.prepare('SELECT id, text FROM questions').all()) if (es.has(normText(q.text))) upd.run(es.get(normText(q.text)), q.id);
      kvSet('questionsEs', true);
    }
    this.epoch = dbEpoch(); // muda quando o banco nasce de novo (servidor reiniciado sem disco): os celulares refazem o check-in sozinhos
    this.settings.steps = steps.length ? steps : defaultSteps();
    delete this.settings.stages;
    // roteiros salvos antes de existir o bloco Reflexão ganham o passo uma vez (depois do primeiro bloco de fala)
    if (!this.settings.reflexaoStep) {
      const list = this.settings.steps;
      if (!list.some(x => x.type === 'reflexao')) { const at = list.findIndex(x => x.type === 'stage'); list.splice(at < 0 ? Math.min(1, list.length) : at + 1, 0, { id: 'p' + crypto.randomBytes(4).toString('hex'), type: 'reflexao' }); }
      this.settings.reflexaoStep = true;
    }
    // roteiros salvos antes de existir a Visão 2027 ganham o passo uma vez (depois da última dinâmica do Sucesso)
    if (!this.settings.docStep) {
      const list = this.settings.steps;
      if (!list.some(x => x.type === 'doc')) {
        const lastSuc = list.map(x => x.type).lastIndexOf('sucesso'), closing = list.findIndex(x => x.type === 'closing');
        list.splice(lastSuc >= 0 ? lastSuc + 1 : closing >= 0 ? closing : list.length, 0, { id: 'p' + crypto.randomBytes(4).toString('hex'), type: 'doc' });
      }
      this.settings.docStep = true;
    }
    if (!this.stepById(this.state.step)) this.state.step = this.settings.steps[0].id;
    this.listeners = [];
    this.timer = null;
    this.rearmTimer();
  }

  onChange(fn) { this.listeners.push(fn); }
  save() { kvSet('state', this.state); kvSet('settings', this.settings); }
  commit(notice) {
    this.save();
    for (const fn of this.listeners) fn(notice || null);
  }

  /* ---------------- pessoas ---------------- */
  rowToPerson(r) {
    if (!r) return null;
    return {
      id: r.id, name: r.name, email: r.email || '', wl: r.wl || '', team: r.team || '', manager: r.manager || '',
      area: r.area || '', active: !!r.active, checkedInAt: r.checked_in_at || null, token: r.token || null,
      form: parse(r.form_json, null), sortOrder: r.sort_order || 0, photo: this.fotos.url(r.id),
    };
  }
  listPeople() {
    return db.prepare('SELECT * FROM people ORDER BY sort_order, name').all().map(r => this.rowToPerson(r));
  }
  personById(id) { return this.rowToPerson(db.prepare('SELECT * FROM people WHERE id = ?').get(Number(id))); }
  personByToken(token) {
    if (typeof token !== 'string' || !token || token.length > 128) return null;
    return this.rowToPerson(db.prepare('SELECT * FROM people WHERE token = ?').get(token));
  }
  // quem entra nas duplas das Conexões: fez check-in e não está na lista de quem fica de fora desse bloco
  participants() { const out = new Set(this.settings.skip.connections); return this.listPeople().filter(p => p.active && p.checkedInAt && !out.has(p.id)); }
  cleanSkip(v) {
    const ids = list => [...new Set((Array.isArray(list) ? list : []).map(Number).filter(n => Number.isInteger(n) && n > 0))].slice(0, 500);
    return { connections: ids(v && v.connections), reflexao: ids(v && v.reflexao), sucesso: ids(v && v.sucesso) };
  }
  skips(block, personId) { return (this.settings.skip[block] || []).includes(Number(personId)); }
  // full=true só para o painel do admin: os viajantes não veem área, WL nem time uns dos outros.
  publicPerson(p, withHints = false, full = false) {
    if (!p) return null;
    const out = full ? { id: p.id, name: p.name, area: p.area, wl: p.wl, team: p.team } : { id: p.id, name: p.name };
    if (p.photo) out.photo = p.photo; // foto de perfil (quem não tem aparece com as iniciais)
    if (withHints && this.settings.showFormHints && p.form) {
      out.hints = Object.entries(p.form).filter(([, v]) => String(v || '').trim()).map(([q, a]) => ({ q, a: String(a) }));
    }
    return out;
  }

  // name (opcional): o celular que refaz o check-in sozinho (o servidor reiniciou e esqueceu todo mundo) manda também
  // o nome guardado. Se o número daquela pessoa mudou no banco novo, vale o nome.
  checkin(personId, existingToken, name) {
    let p = this.personById(personId);
    if (name !== undefined && name !== null && (!p || normName(p.name) !== normName(name))) p = this.listPeople().find(x => normName(x.name) === normName(name)) || null;
    if (!p) throw new Error('Pessoa não encontrada.');
    if (!p.active) throw new Error('Essa pessoa está marcada como ausente. Fale com o apresentador.');
    const token = (p.token && existingToken && existingToken === p.token) ? p.token : crypto.randomBytes(16).toString('hex');
    db.prepare('UPDATE people SET checked_in_at = COALESCE(checked_in_at, ?), token = ? WHERE id = ?').run(iso(), token, p.id);
    this.commit();
    return { token, person: this.publicPerson(this.personById(p.id)) };
  }

  // Desfaz o próprio check-in (nome errado). Só antes das duplas existirem.
  checkout(token) {
    const p = this.personByToken(token);
    if (!p) return { ok: true };
    if (this.allGroups().some(g => g.members.includes(p.id))) throw new Error('As duplas já foram sorteadas com você. Fale com o Doc para trocar.');
    db.prepare('UPDATE people SET checked_in_at = NULL, token = NULL WHERE id = ?').run(p.id);
    this.commit();
    return { ok: true };
  }

  /* ---------------- nuvem de palavras: duas perguntas, texto livre ---------------- */
  // Cada pessoa responde as duas perguntas (o texto vem do conteúdo da cena "nuvem") logo depois do login, em texto livre. A
  // resposta fica ligada à pessoa: quem entrar de novo (outro celular, navegador limpo) não responde de novo. As respostas são
  // aceitas do começo do roteiro até o passo da nuvem (inclusive): é nele que o telão mostra uma nuvem por pergunta, já com tudo
  // o que chegou, e quem ainda não respondeu responde na hora. Depois dele, quem chega atrasado vai direto para o que está no ar.
  wordsOpen() {
    const steps = this.settings.steps, at = steps.findIndex(x => x.type === 'cena' && x.cena === 'nuvem'), cur = steps.findIndex(x => x.id === this.state.step);
    return at >= 0 && cur <= at && !this.state.presentation;
  }
  // as nuvens estão no telão (o passo da nuvem está no ar): só aí as palavras de todo mundo aparecem
  wordsLive() { const st = this.currentStep(); return this.state.block === 'cena' && !this.state.presentation && st.type === 'cena' && st.cena === 'nuvem'; }
  wordsOf(personId) { const r = db.prepare('SELECT w1, w2 FROM words WHERE person_id = ?').get(Number(personId)); return r ? [r.w1, r.w2 || ''] : null; }
  setWords(personId, answers) {
    const list = [0, 1].map(i => cleanAnswer(Array.isArray(answers) ? answers[i] : ''));
    if (list.some(x => !x)) throw Object.assign(new Error('Answer both questions.'), { status: 400 });
    db.prepare('INSERT INTO words (person_id, w1, w2, at) VALUES (?, ?, ?, ?) ON CONFLICT(person_id) DO UPDATE SET w1 = excluded.w1, w2 = excluded.w2, at = excluded.at').run(Number(personId), list[0], list[1], iso());
    this.commit();
    return list;
  }
  removeWords(personId) { db.prepare('DELETE FROM words WHERE person_id = ?').run(Number(personId)); this.commit(); }
  clearWords({ silent = false } = {}) { db.exec('DELETE FROM words'); if (!silent) this.commit(); }
  // As nuvens (uma por pergunta): cada termo com quantas pessoas o escreveram, sem nomes. Maiúsculas e minúsculas contam como o mesmo termo.
  wordsCloud() {
    const maps = [new Map(), new Map()]; let count = 0;
    for (const r of db.prepare('SELECT w.w1, w.w2 FROM words w JOIN people p ON p.id = w.person_id ORDER BY w.at').all()) {
      count++;
      [r.w1, r.w2].forEach((ans, i) => { for (const w of termsOf(ans)) { const k = w.toLocaleLowerCase('pt-BR'), t = maps[i].get(k); if (t) t[1]++; else maps[i].set(k, [w, 1]); } });
    }
    return { count, clouds: maps.map(m => [...m.values()].sort((a, b) => b[1] - a[1]).slice(0, 80)) };
  }
  wordsList() { return db.prepare('SELECT w.person_id AS id, p.name, w.w1, w.w2, w.at FROM words w JOIN people p ON p.id = w.person_id ORDER BY w.at').all().map(r => ({ id: r.id, name: r.name, words: [r.w1, r.w2 || ''], at: r.at })); }

  /* ---------------- feedback do encerramento ---------------- */
  // No encerramento, cada pessoa conta no celular como foi o townhall: uma nota de 1 a 5 e dois textos opcionais (o que mais gostou e
  // o que pode melhorar). Vale uma resposta por pessoa (enviar de novo troca). Quem marca "sem o meu nome" não tem o nome mostrado
  // no painel nem na extração de dados.
  feedbackOpen() { return this.state.block === 'closing' && !this.state.presentation; }
  feedbackOf(personId) { const r = db.prepare('SELECT rating, liked, improve, anonymous FROM feedback WHERE person_id = ?').get(Number(personId)); return r ? { rating: r.rating, liked: r.liked || '', improve: r.improve || '', anonymous: !!r.anonymous } : null; }
  setFeedback(personId, f) {
    const rating = Math.round(Number(f && f.rating));
    if (!(rating >= 1 && rating <= 5)) throw Object.assign(new Error('Pick a rating from 1 to 5.'), { status: 400 });
    const text = v => String(v ?? '').normalize('NFC').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, 600);
    db.prepare('INSERT INTO feedback (person_id, rating, liked, improve, anonymous, at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(person_id) DO UPDATE SET rating = excluded.rating, liked = excluded.liked, improve = excluded.improve, anonymous = excluded.anonymous, at = excluded.at')
      .run(Number(personId), rating, text(f.liked), text(f.improve), f.anonymous ? 1 : 0, iso());
    this.commit();
    return this.feedbackOf(personId);
  }
  clearFeedback({ silent = false } = {}) { db.exec('DELETE FROM feedback'); if (!silent) this.commit(); }
  feedbackStats() {
    const dist = [0, 0, 0, 0, 0]; let sum = 0, count = 0;
    for (const r of db.prepare('SELECT rating, COUNT(*) AS n FROM feedback GROUP BY rating').all()) if (r.rating >= 1 && r.rating <= 5) { dist[r.rating - 1] = r.n; sum += r.rating * r.n; count += r.n; }
    return { count, avg: count ? Math.round(sum / count * 10) / 10 : 0, dist };
  }
  // Para o painel e a extração de dados: quem pediu "sem o meu nome" aparece sem nome
  feedbackList() {
    return db.prepare('SELECT f.rating, f.liked, f.improve, f.anonymous, f.at, p.name, p.area FROM feedback f LEFT JOIN people p ON p.id = f.person_id ORDER BY f.at').all()
      .map(r => ({ name: r.anonymous ? '' : r.name || '', area: r.anonymous ? '' : r.area || '', rating: r.rating, liked: r.liked || '', improve: r.improve || '', anonymous: !!r.anonymous, at: r.at }));
  }

  addPerson(f) {
    const name = String(f.name || '').trim();
    if (!name) throw new Error('Nome obrigatório.');
    const max = db.prepare('SELECT COALESCE(MAX(sort_order),0) AS m FROM people').get().m;
    const r = db.prepare('INSERT INTO people (name, email, wl, team, manager, area, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(name, String(f.email || '').trim().toLowerCase(), normalizeWl(f.wl), String(f.team || '').trim(), String(f.manager || '').trim(), String(f.area || '').trim(), max + 1);
    this.fotos.seedFor(r.lastInsertRowid, this.listPeople()); // se as fotos da instalação têm a foto dessa pessoa, ela já entra com foto
    this.commit();
    return this.personById(r.lastInsertRowid);
  }
  updatePerson(id, f) {
    const p = this.personById(id);
    if (!p) throw new Error('Pessoa não encontrada.');
    const fields = [], vals = [];
    if (f.name !== undefined) { const name = String(f.name).trim(); if (!name) throw new Error('Nome obrigatório.'); fields.push('name = ?'); vals.push(name); }
    if (f.email !== undefined) { fields.push('email = ?'); vals.push(String(f.email).trim().toLowerCase()); }
    if (f.wl !== undefined) { fields.push('wl = ?'); vals.push(normalizeWl(f.wl)); }
    if (f.team !== undefined) { fields.push('team = ?'); vals.push(String(f.team).trim()); }
    if (f.manager !== undefined) { fields.push('manager = ?'); vals.push(String(f.manager).trim()); }
    if (f.area !== undefined) { fields.push('area = ?'); vals.push(String(f.area).trim()); }
    if (f.active !== undefined) { fields.push('active = ?'); vals.push(bool(f.active)); }
    if (f.checkedIn !== undefined) { fields.push('checked_in_at = ?'); vals.push(f.checkedIn ? (p.checkedInAt || iso()) : null); if (!f.checkedIn) { fields.push('token = ?'); vals.push(null); } }
    if (f.form !== undefined) { fields.push('form_json = ?'); vals.push(f.form ? JSON.stringify(f.form) : null); }
    if (fields.length) { vals.push(p.id); db.prepare(`UPDATE people SET ${fields.join(', ')} WHERE id = ?`).run(...vals); }
    if (f.name !== undefined) this.fotos.seedFor(p.id, this.listPeople()); // nome corrigido: pode passar a casar com uma foto da instalação
    this.commit();
    return this.personById(p.id);
  }
  deletePerson(id) {
    if (this.allGroups().some(g => g.members.includes(Number(id)))) throw new Error('Essa pessoa está em duplas já geradas. Marque como ausente em vez de excluir, ou resete o bloco de conexões.');
    db.prepare('DELETE FROM people WHERE id = ?').run(Number(id));
    db.prepare('DELETE FROM rankings WHERE person_id = ?').run(Number(id));
    db.prepare('DELETE FROM results WHERE person_id = ?').run(Number(id));
    db.prepare('DELETE FROM seen WHERE person_id = ?').run(Number(id));
    db.prepare('DELETE FROM words WHERE person_id = ?').run(Number(id)); db.prepare('DELETE FROM feedback WHERE person_id = ?').run(Number(id));
    this.fotos.remove(id);
    this.commit();
  }
  /* ---------------- fotos de perfil ---------------- */
  // Várias de uma vez (o nome do arquivo diz de quem é), uma só para uma pessoa, ou remover.
  importPhotos(files) { const r = this.fotos.importMany(files, this.listPeople()); this.commit(); return r; }
  setPhoto(id, data) { if (!this.personById(id)) throw new Error('Pessoa não encontrada.'); this.fotos.setOne(id, data); this.commit(); }
  removePhoto(id) { this.fotos.remove(id); this.commit(); }
  // A foto de alguém pelo nome escrito em uma cena ("Caio Souza", "Monserrat Diaz"): só quando o nome aponta para uma pessoa só
  photoByName(name, people) { const p = this.fotos.match(name, people || this.listPeople()); return p ? this.fotos.url(p.id) : null; }
  importPeople(rows, mode = 'merge') {
    const clean = rows.map(r => ({
      name: String(r.name || '').trim(), email: String(r.email || '').trim().toLowerCase(), wl: normalizeWl(r.wl),
      team: String(r.team || '').trim(), manager: String(r.manager || '').trim(), area: String(r.area || '').trim(),
    })).filter(r => r.name);
    db.exec('BEGIN');
    try {
      let inserted = 0, updated = 0;
      if (mode === 'replace') {
        db.exec('DELETE FROM people; DELETE FROM groups; DELETE FROM seen; DELETE FROM rankings; DELETE FROM results; DELETE FROM words; DELETE FROM feedback;');
        this.state.conn = defaultConn();
      }
      const existing = this.listPeople();
      const byEmail = new Map(existing.filter(p => p.email).map(p => [p.email, p]));
      const byName = new Map(existing.map(p => [normName(p.name), p]));
      let order = db.prepare('SELECT COALESCE(MAX(sort_order),0) AS m FROM people').get().m;
      const ins = db.prepare('INSERT INTO people (name, email, wl, team, manager, area, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)');
      const upd = db.prepare('UPDATE people SET name = ?, email = ?, wl = ?, team = ?, manager = ?, area = ? WHERE id = ?');
      for (const r of clean) {
        const found = (r.email && byEmail.get(r.email)) || byName.get(normName(r.name));
        if (found && mode !== 'replace') { upd.run(r.name, r.email || found.email, r.wl || found.wl, r.team || found.team, r.manager || found.manager, r.area || found.area, found.id); updated++; }
        else { ins.run(r.name, r.email, r.wl, r.team, r.manager, r.area, ++order); inserted++; }
      }
      db.exec('COMMIT');
      this.fotos.prune(); // lista substituída: as fotos de quem saiu vão junto
      this.commit();
      return { inserted, updated, total: clean.length };
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  // rows: [{col: val}], keyColumn: coluna com e-mail ou nome
  importForm(rows, keyColumn) {
    const people = this.listPeople();
    const byEmail = new Map(people.filter(p => p.email).map(p => [p.email, p]));
    const byName = new Map(people.map(p => [normName(p.name), p]));
    const matched = [], unmatched = [];
    const upd = db.prepare('UPDATE people SET form_json = ? WHERE id = ?');
    for (const row of rows) {
      const key = String(row[keyColumn] || '').trim();
      if (!key) continue;
      const person = byEmail.get(key.toLowerCase()) || byName.get(normName(key))
        || people.find(p => normName(p.name) && normName(key).includes(normName(p.name)));
      if (!person) { unmatched.push(key); continue; }
      const answers = {};
      for (const [k, v] of Object.entries(row)) {
        if (k === keyColumn) continue;
        if (/e-?mail|timestamp|carimbo|start time|completion time|hora de (in[ií]cio|conclus[aã]o)|last modified|^id$|^nome$|^name$/i.test(k.trim())) continue;
        if (String(v || '').trim()) answers[k] = String(v).trim();
      }
      upd.run(JSON.stringify(answers), person.id);
      matched.push(person.name);
    }
    this.commit();
    return { matched: matched.length, unmatched };
  }

  /* ---------------- perguntas ---------------- */
  listQuestions() {
    // a coluna "era" do banco guarda a categoria da pergunta (quebragelo | conexao | alem)
    return db.prepare('SELECT * FROM questions ORDER BY sort_order, id').all().map(q => ({ id: q.id, text: q.text, es: q.text_es || '', cat: catKey(q.era) || 'quebragelo', active: !!q.active, sortOrder: q.sort_order }));
  }
  guardQuestions() {
    if (this.state.conn.phase === 'talk') throw new Error('Há uma conversa em andamento. Encerre-a antes de mexer no banco de perguntas.');
  }
  afterQuestionsChange() {
    if (this.state.conn.phase === 'matching') this.assignQueues(this.state.conn.round);
    this.commit();
  }
  addQuestion({ text, cat, era, es }) {
    this.guardQuestions();
    const t = String(text || '').trim();
    if (!t) throw new Error('Texto da pergunta obrigatório.');
    const max = db.prepare('SELECT COALESCE(MAX(sort_order),0) AS m FROM questions').get().m;
    db.prepare('INSERT INTO questions (text, text_es, era, sort_order) VALUES (?, ?, ?, ?)').run(t, String(es || '').trim(), catKey(cat ?? era) || 'quebragelo', max + 1);
    this.afterQuestionsChange();
  }
  updateQuestion(id, f) {
    this.guardQuestions();
    const fields = [], vals = [];
    if (f.text !== undefined) { const t = String(f.text).trim(); if (!t) throw new Error('Texto da pergunta obrigatório.'); fields.push('text = ?'); vals.push(t); }
    if (f.es !== undefined) { fields.push('text_es = ?'); vals.push(String(f.es).trim()); } // a mesma pergunta em espanhol (opcional)
    if (f.cat !== undefined || f.era !== undefined) { fields.push('era = ?'); vals.push(catKey(f.cat ?? f.era) || 'quebragelo'); }
    if (f.active !== undefined) { fields.push('active = ?'); vals.push(bool(f.active)); }
    if (fields.length) { vals.push(Number(id)); db.prepare(`UPDATE questions SET ${fields.join(', ')} WHERE id = ?`).run(...vals); }
    this.afterQuestionsChange();
  }
  deleteQuestion(id) { this.guardQuestions(); db.prepare('DELETE FROM questions WHERE id = ?').run(Number(id)); this.afterQuestionsChange(); }
  // Substitui o banco preservando o id das perguntas cujo texto não mudou (filas e histórico continuam válidos).
  replaceQuestions(list) {
    this.guardQuestions();
    const existing = this.listQuestions();
    const byText = new Map(existing.map(q => [normText(q.text), q]));
    db.exec('BEGIN');
    try {
      const keep = new Set();
      const upd = db.prepare('UPDATE questions SET text = ?, text_es = ?, era = ?, active = ?, sort_order = ? WHERE id = ?');
      const ins = db.prepare('INSERT INTO questions (text, text_es, era, active, sort_order) VALUES (?, ?, ?, ?, ?)');
      let i = 0;
      for (const q of list) {
        const t = String(q.text || '').trim();
        if (!t) continue;
        const cat = catKey(q.cat ?? q.era) || 'quebragelo';
        const active = (q.active === false || q.active === 0) ? 0 : 1;
        const found = byText.get(normText(t));
        // espanhol: o que veio na lista; sem isso, a pergunta cujo texto não mudou mantém a tradução que já tinha
        const es = q.es !== undefined ? String(q.es || '').trim() : (found && !keep.has(found.id) ? found.es : '');
        if (found && !keep.has(found.id)) { upd.run(t, es, cat, active, ++i, found.id); keep.add(found.id); }
        else { const r = ins.run(t, es, cat, active, ++i); keep.add(Number(r.lastInsertRowid)); }
      }
      const del = db.prepare('DELETE FROM questions WHERE id = ?');
      for (const q of existing) if (!keep.has(q.id)) del.run(q.id);
      db.exec('DELETE FROM seen WHERE question_id NOT IN (SELECT id FROM questions)');
      db.exec('COMMIT');
    } catch (err) { db.exec('ROLLBACK'); throw err; }
    this.afterQuestionsChange();
  }
  resetQuestions() { this.replaceQuestions(require('./seed/questions')); }

  /* ---------------- grupos ---------------- */
  rowToGroup(r) { return r ? { id: r.id, round: r.round, idx: r.idx, members: parse(r.members, []), queue: parse(r.queue, []), position: r.position || 0 } : null; }
  allGroups() { return db.prepare('SELECT * FROM groups ORDER BY round, idx').all().map(r => this.rowToGroup(r)); }
  groupsOfRound(round) { return db.prepare('SELECT * FROM groups WHERE round = ? ORDER BY idx').all(Number(round)).map(r => this.rowToGroup(r)); }
  groupOfPerson(personId, round) { return this.groupsOfRound(round).find(g => g.members.includes(Number(personId))) || null; }

  generate({ fromRound = 1 } = {}) {
    const c = this.state.conn;
    fromRound = Number(fromRound) || 1;
    if (fromRound < 1 || fromRound > TOTAL_ROUNDS) throw new Error('Não há rodadas restantes para recalcular.');
    if (fromRound <= (c.played || 0)) throw new Error(`A viagem ${fromRound} já aconteceu e não pode ser refeita. Para incluir alguém, recalcule só as rodadas restantes; para recomeçar do zero, resete o bloco de conexões.`);
    const people = this.participants();
    if (people.length < 2) throw new Error('É preciso ter pelo menos 2 viajantes com check-in.');
    const kept = this.allGroups().filter(g => g.round < fromRound);
    const used = new Set(), trios = new Set();
    for (const g of kept) {
      for (let i = 0; i < g.members.length; i++) for (let j = i + 1; j < g.members.length; j++) used.add(pairKey(g.members[i], g.members[j]));
      if (g.members.length === 3) g.members.forEach(id => trios.add(id));
    }
    const res = generateRounds({ people, totalRounds: TOTAL_ROUNDS, fromRound, usedPairs: used, trioHistory: trios });
    if (!res) throw new Error('Não foi possível montar as duplas com essas pessoas. Confira se há pelo menos 2 viajantes a bordo e tente de novo.');
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM groups WHERE round >= ?').run(fromRound);
      const ins = db.prepare('INSERT INTO groups (round, idx, members, queue, position) VALUES (?, ?, ?, ?, 0)');
      for (const r of res.rounds) r.groups.forEach((members, idx) => ins.run(r.round, idx, JSON.stringify(members), '[]'));
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    const levels = Object.assign({}, c.levels || {});
    for (const r of res.rounds) levels[r.round] = r.level;
    c.levels = levels;
    c.worstLevel = Object.values(levels).reduce((w, l) => (['strict', 'wl', 'area', 'all'].indexOf(l) > ['strict', 'wl', 'area', 'all'].indexOf(w) ? l : w), 'strict');
    c.generatedAt = iso();
    c.repeats = !!res.repeats;
    if (c.phase === 'idle') c.phase = 'ready';
    if (c.phase === 'matching' && c.round >= fromRound) this.assignQueues(c.round);
    this.commit();
    return { fromRound, rounds: res.rounds.length, worstLevel: res.worstLevel, worstLabel: res.worstLabel, repeats: !!res.repeats, ms: res.ms };
  }

  assignQueues(round) {
    const groups = this.groupsOfRound(round);
    const questions = this.listQuestions();
    const seenByPerson = {};
    for (const s of db.prepare('SELECT person_id, question_id FROM seen').all()) (seenByPerson[s.person_id] = seenByPerson[s.person_id] || []).push(s.question_id);
    const queues = buildQueues({ groups: groups.map(g => g.members), round, questions, seenByPerson, mode: this.settings.questionMode });
    const upd = db.prepare('UPDATE groups SET queue = ?, position = 0 WHERE id = ?');
    groups.forEach((g, i) => upd.run(JSON.stringify(queues[i]), g.id));
  }

  /* ---------------- fases do bloco de conexões ---------------- */
  // Timer genérico (uma etapa por vez): kind = matching | talk | break | ranking
  startTimer(kind, seconds) {
    const s = Math.max(1, Number(seconds) || 1);
    this.state.conn.timer = { kind, startedAt: now(), endsAt: now() + s * 1000, duration: s, paused: false, remaining: null };
    this.rearmTimer();
  }
  stopTimer() { this.clearTimer(); this.state.conn.timer = null; }
  rearmTimer() {
    this.clearTimer();
    const t = this.state.conn.timer;
    if (!t || t.paused) return;
    const ms = t.endsAt - now();
    if (ms <= 0) { this.expireTimer(); return; }
    this.timer = setTimeout(() => this.expireTimer(), ms + 30);
  }
  clearTimer() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }
  // O que acontece quando a etapa acaba (também usado por "Pular etapa" no painel)
  expireTimer() {
    const c = this.state.conn, t = c.timer;
    this.clearTimer();
    if (!t) return;
    c.timer = null;
    if (t.kind === 'matching' && c.phase === 'matching') return this.startTalk();
    if (t.kind === 'talk' && c.phase === 'talk') return this.endTalk();
    if (t.kind === 'break' && c.phase === 'roundEnd') return this.afterBreak();
    if (t.kind === 'ranking' && c.phase === 'ranking') return this.computeResults();
    this.commit();
  }
  auto() { return !!this.settings.autoFlow; }

  reveal(round) {
    const c = this.state.conn;
    round = Number(round) || (c.round + 1);
    if (round < 1 || round > TOTAL_ROUNDS) throw new Error('Rodada inválida.');
    if (!this.groupsOfRound(round).length) throw new Error(`As duplas da viagem ${round} ainda não foram geradas.`);
    if (c.phase === 'talk') this.finishTalk();
    this.stopTimer();
    c.phase = 'matching'; c.round = round;
    this.state.block = 'connections'; this.state.detour = null; this.syncCursor('connections');
    this.assignQueues(round);
    if (this.auto() && Number(this.settings.findSeconds) > 0) this.startTimer('matching', this.settings.findSeconds);
    this.commit({ title: `Viagem ${round} · ${eraOfRound(round).year}`, body: 'Sua dupla foi revelada. Encontre essa pessoa na sala!', es: { title: `Viaje ${round} · ${eraOfRound(round).year}`, body: '¡Tu pareja fue revelada! Encuéntrala en la sala.' } });
  }
  // Botão único do painel: sorteia (se preciso) e começa a viagem 1.
  startJourney() {
    const c = this.state.conn;
    if (c.played >= 1 || !['idle', 'ready'].includes(c.phase)) throw new Error('As viagens já começaram. Use os controles da viagem em andamento ou resete o bloco.');
    if (!c.generatedAt || c.phase === 'idle') this.generate({ fromRound: 1 });
    this.reveal(1);
  }
  startTalk() {
    const c = this.state.conn;
    if (c.phase !== 'matching') throw new Error('Revele as duplas antes de iniciar a conversa.');
    const dur = Math.max(10, Number(this.settings.roundSeconds) || 120);
    c.phase = 'talk';
    c.played = Math.max(c.played || 0, c.round);
    this.startTimer('talk', dur);
    this.commit({ title: 'Conversa liberada!', body: `Vocês têm ${human(dur)}. Boa viagem!`, es: { title: '¡A conversar!', body: `Tienen ${human(dur, 'y')}. ¡Buen viaje!` } });
  }
  pause() {
    const t = this.state.conn.timer;
    if (!t || t.paused) return;
    t.paused = true; t.remaining = Math.max(0, Math.round((t.endsAt - now()) / 1000));
    this.clearTimer(); this.commit();
  }
  resume() {
    const t = this.state.conn.timer;
    if (!t || !t.paused) return;
    t.paused = false; t.endsAt = now() + t.remaining * 1000; t.remaining = null;
    this.rearmTimer(); this.commit();
  }
  addTime(seconds) {
    const t = this.state.conn.timer;
    if (!t) return;
    const s = Number(seconds) || 30;
    if (t.paused) t.remaining = Math.max(0, t.remaining + s); else t.endsAt = Math.max(now(), t.endsAt + s * 1000);
    t.duration = Math.max(1, t.duration + s);
    this.rearmTimer(); this.commit();
  }
  skip() { // encerra a etapa atual agora (ou avança quando não há timer)
    const c = this.state.conn;
    if (c.timer) return this.expireTimer();
    if (c.phase === 'matching') return this.startTalk();
    if (c.phase === 'talk') return this.endTalk();
    if (c.phase === 'roundEnd') return this.afterBreak();
    if (c.phase === 'ranking') return this.computeResults();
    throw new Error('Nada para pular nesta fase.');
  }
  finishTalk() {
    // marca as perguntas vistas por cada pessoa (até a posição alcançada)
    const c = this.state.conn;
    const ins = db.prepare('INSERT OR IGNORE INTO seen (person_id, question_id, round) VALUES (?, ?, ?)');
    for (const g of this.groupsOfRound(c.round)) {
      const upto = Math.min(g.position, g.queue.length - 1);
      for (let i = 0; i <= upto; i++) for (const m of g.members) ins.run(m, g.queue[i], c.round);
    }
    this.stopTimer();
  }
  endTalk() {
    const c = this.state.conn;
    if (c.phase !== 'talk') return;
    this.finishTalk();
    c.phase = 'roundEnd';
    const last = c.round >= TOTAL_ROUNDS;
    if (this.auto()) {
      const brk = Number(this.settings.breakSeconds);
      if (brk > 0) this.startTimer('break', brk); else { this.commit(); return this.afterBreak(); }
    }
    this.commit({ title: '88 MPH!', body: last ? 'Fim das viagens. Avalie as conversas no celular.' : 'Tempo esgotado. Próxima viagem chegando!', es: { title: '88 MPH!', body: last ? 'Fin de los viajes. Evalúa las conversaciones en tu celular.' : '¡Se acabó el tiempo! Ya viene el próximo viaje.' } });
  }
  afterBreak() {
    const c = this.state.conn;
    if (c.phase !== 'roundEnd') return;
    this.stopTimer();
    if (c.round < TOTAL_ROUNDS) return this.reveal(c.round + 1);
    return this.openRanking();
  }

  openRanking() {
    const c = this.state.conn;
    if (c.phase === 'talk') { this.finishTalk(); }
    if (!(c.played >= 1)) throw new Error('Nenhuma viagem foi realizada ainda.');
    this.stopTimer();
    c.phase = 'ranking';
    this.state.block = 'connections';
    if (this.auto() && Number(this.settings.rankingSeconds) > 0) this.startTimer('ranking', this.settings.rankingSeconds);
    this.commit({ title: 'Hora de avaliar', body: 'Coloque suas conversas em ordem: 1º, 2º e 3º lugar.', es: { title: 'Hora de evaluar', body: 'Ordena tus conversaciones: 1.º, 2.º y 3.º lugar.' } });
  }
  everyoneRanked() {
    const c = this.state.conn;
    if (!c.played) return false;
    const exists = new Set(this.participants().map(p => p.id));
    const ids = new Set(this.allGroups().filter(g => g.round <= c.played).flatMap(g => g.members).filter(id => exists.has(id)));
    const ranked = new Set(db.prepare('SELECT DISTINCT person_id FROM rankings').all().map(r => r.person_id));
    return ids.size > 0 && [...ids].every(id => ranked.has(id));
  }
  roundsOfPerson(personId) {
    const c = this.state.conn;
    const out = [];
    for (let r = 1; r <= (c.played || 0); r++) { const g = this.groupOfPerson(personId, r); if (g) out.push({ round: r, group: g }); }
    return out;
  }
  submitRanking(personId, ranks) {
    const c = this.state.conn;
    if (c.phase !== 'ranking') throw new Error('A avaliação não está aberta.');
    const rounds = this.roundsOfPerson(personId).map(x => x.round);
    if (!rounds.length) throw new Error('Você não participou de nenhuma viagem.');
    const given = rounds.map(r => Number((ranks || {})[r]));
    const sorted = given.slice().sort((a, b) => a - b);
    if (sorted.some((v, i) => v !== i + 1)) throw new Error('Ordene todas as conversas (1º, 2º, 3º) sem repetir posições.');
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM rankings WHERE person_id = ?').run(Number(personId));
      const ins = db.prepare('INSERT INTO rankings (person_id, round, rank, submitted_at) VALUES (?, ?, ?, ?)');
      rounds.forEach((r, i) => ins.run(Number(personId), r, given[i], iso()));
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    if (this.auto() && this.everyoneRanked()) return this.computeResults();
    this.commit();
  }
  rankingsMap() {
    const map = {};
    for (const r of db.prepare('SELECT * FROM rankings').all()) (map[r.person_id] = map[r.person_id] || {})[r.round] = r.rank;
    return map;
  }
  computeResults() {
    const c = this.state.conn;
    if (!(c.played >= 1)) throw new Error('Nenhuma viagem foi realizada ainda.');
    const exists = new Set(this.listPeople().map(p => p.id));
    const groups = this.allGroups().filter(g => g.round <= c.played).map(g => ({ ...g, members: g.members.filter(id => exists.has(id)) })).filter(g => g.members.length >= 2);
    const ids = new Set(); groups.forEach(g => g.members.forEach(id => ids.add(id)));
    const res = computeResults({ groups, rankings: this.rankingsMap(), personIds: [...ids] });
    db.exec('BEGIN');
    try {
      db.exec('DELETE FROM results');
      const ins = db.prepare('INSERT INTO results (person_id, match_id, mutual, score, detail) VALUES (?, ?, ?, ?, ?)');
      for (const [pid, r] of Object.entries(res)) ins.run(Number(pid), r.match, r.mutual, r.score, JSON.stringify(r.detail));
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    this.stopTimer();
    c.phase = 'results'; c.resultsAt = iso();
    this.state.block = 'connections';
    this.commit({ title: 'Sua conexão do futuro chegou!', body: 'Abra o app para descobrir com quem você deve continuar o papo.', es: { title: '¡Llegó tu conexión del futuro!', body: 'Abre la app para descubrir con quién debes seguir la charla.' } });
  }
  resultOf(personId) {
    const r = db.prepare('SELECT * FROM results WHERE person_id = ?').get(Number(personId));
    if (!r) return null;
    const detail = parse(r.detail, []).map(d => ({ ...d, partner: this.publicPerson(this.personById(d.id)) })).filter(d => d.partner);
    return { match: this.publicPerson(this.personById(r.match_id), true), mutual: !!r.mutual, score: r.score, detail };
  }

  groupStep(personId, dir, from) {
    const c = this.state.conn;
    if (c.phase !== 'talk') throw new Error('A conversa não está em andamento.');
    const g = this.groupOfPerson(personId, c.round);
    if (!g) throw new Error('Você não está em nenhuma dupla nesta viagem.');
    // se o celular estava vendo outra posição (a dupla já avançou), não avança de novo
    if (from !== undefined && from !== null && Number(from) !== g.position) return { groupId: g.id, position: g.position, members: g.members, ignored: true };
    const pos = Math.max(0, Math.min(g.queue.length - 1, g.position + (dir < 0 ? -1 : 1)));
    db.prepare('UPDATE groups SET position = ? WHERE id = ?').run(pos, g.id);
    return { groupId: g.id, position: pos, members: g.members };
  }

  /* ---------------- blocos / mensagem / settings ---------------- */
  setBlock(block) {
    if (!BLOCKS.includes(block)) throw new Error('Bloco inválido.');
    const wasOff = this.state.block === 'standby';
    this.state.block = block;
    if (block === 'stage' && this.settings.stageMutes) this.state.audio.mode = 'off';
    // mensagem e "olhos no telão" são telas avulsas (fora do roteiro); as outras levam o cursor junto
    if (block === 'message' || block === 'standby') { this.state.detour = block; this.holdJourney(); }
    else { this.state.detour = null; this.syncCursor({ welcome: 'checkin', connections: 'connections', closing: 'closing', stage: 'stage', reflexao: 'reflexao', doc: 'doc' }[block]); if (block === 'connections') this.releaseJourney(); else this.holdJourney(); }
    const notices = {
      message: { title: this.state.message.title, body: this.state.message.body },
      welcome: wasOff ? NOTICES.back() : null,
      connections: wasOff ? { title: 'Circuitos ligados', body: 'O bloco Conexões está começando.', es: { title: 'Circuitos encendidos', body: 'El bloque Conexiones está por comenzar.' } } : null,
      closing: NOTICES.closing(),
    };
    this.commit(notices[block] || null);
  }
  setMessage(m, show = false) {
    this.state.message = { title: String(m.title || '').trim(), body: String(m.body || '').trim(), emoji: String(m.emoji || '📣').trim() };
    if (show) { this.state.block = 'message'; this.state.detour = 'message'; this.holdJourney(); }
    this.commit(show ? { title: this.state.message.title, body: this.state.message.body } : null);
  }
  updateSettings(partial) {
    const s = this.settings;
    if (partial.roundSeconds !== undefined) s.roundSeconds = Math.max(10, Math.min(3600, Number(partial.roundSeconds) || 120));
    if (partial.questionMode !== undefined) { s.questionMode = QUESTION_MODES.includes(partial.questionMode) ? partial.questionMode : 'rodada'; if (this.state.conn.phase === 'matching') this.assignQueues(this.state.conn.round); }
    if (partial.findSeconds !== undefined) s.findSeconds = Math.max(0, Math.min(600, Number(partial.findSeconds) || 0));
    if (partial.breakSeconds !== undefined) s.breakSeconds = Math.max(0, Math.min(120, Number(partial.breakSeconds) || 0));
    if (partial.rankingSeconds !== undefined) s.rankingSeconds = Math.max(0, Math.min(1800, Number(partial.rankingSeconds) || 0));
    if (partial.autoFlow !== undefined) s.autoFlow = !!partial.autoFlow;
    if (partial.showMutualOnScreen !== undefined) s.showMutualOnScreen = !!partial.showMutualOnScreen;
    if (partial.showFormHints !== undefined) s.showFormHints = !!partial.showFormHints;
    for (const k of ['eventName', 'welcomeText', 'closingText', 'standbyText', 'stageText']) if (partial[k] !== undefined) s[k] = String(partial[k]);
    if (partial.stageMutes !== undefined) s.stageMutes = !!partial.stageMutes;
    if (partial.confidencial !== undefined) s.confidencial = !!partial.confidencial; // modo confidencial (só a senha mestra muda)
    if (partial.appLang !== undefined) s.appLang = partial.appLang === 'en' ? 'en' : 'pessoa';
    if (partial.transitions !== undefined) s.transitions = !!partial.transitions;
    if (partial.transitionSeconds !== undefined) s.transitionSeconds = Math.max(3, Math.min(30, Math.round(Number(partial.transitionSeconds) || 8)));
    if (partial.skip !== undefined) s.skip = this.cleanSkip({ ...s.skip, ...(partial.skip && typeof partial.skip === 'object' ? partial.skip : {}) });
    // áudio próprio: só endereços http(s) ou caminhos do próprio site
    for (const k of ['musicUrl', 'ambientUrl', 'docVideoUrl']) if (partial[k] !== undefined) { const u = String(partial[k]).trim(); s[k] = /^(https?:\/\/|\/)[^\s"'<>]*$/i.test(u) ? u.slice(0, 500) : ''; }
    // Spotify: o "Client ID" do app criado no painel de desenvolvedor do Spotify (não é segredo) e se o intervalo toca o Spotify
    if (partial.spotifyClientId !== undefined) { const id = String(partial.spotifyClientId).trim(); s.spotifyClientId = /^[0-9a-zA-Z]{20,64}$/.test(id) ? id : ''; }
    if (partial.spotifyBreak !== undefined) s.spotifyBreak = !!partial.spotifyBreak;
    if (partial.docVoice !== undefined) s.docVoice = !!partial.docVoice;
    if (partial.docVideoFull !== undefined) s.docVideoFull = !!partial.docVideoFull;
    if (partial.docVoiceName !== undefined) s.docVoiceName = clip(partial.docVoiceName, 80);
    if (partial.docRate !== undefined) s.docRate = Math.max(.7, Math.min(1.4, Math.round((Number(partial.docRate) || 1) * 100) / 100));
    if (partial.steps !== undefined) {
      const list = cleanSteps(partial.steps);
      if (!list.length) throw new Error('O roteiro precisa de pelo menos um passo.');
      s.steps = list;
      if (!this.stepById(this.state.step)) this.state.step = list[0].id; // o passo que estava no ar foi removido
      const cur = this.currentStep();                                   // mudou o texto do passo que está no ar: reflete na hora
      if (!this.state.detour && cur.type === 'message' && this.state.block === 'message') this.state.message = { title: cur.title, body: cur.body, emoji: cur.emoji };
    }
    if (Array.isArray(partial.agenda)) s.agenda = partial.agenda.map(a => ({ time: String(a.time || ''), title: String(a.title || '') })).filter(a => a.title);
    this.commit();
  }
  resetConnections() {
    db.exec('DELETE FROM groups; DELETE FROM seen; DELETE FROM rankings; DELETE FROM results;');
    this.clearTimer();
    this.state.conn = defaultConn();
    this.commit();
  }
  setScene(scene) {
    const ok = ['auto', 'logo'];
    this.state.screen = { scene: ok.includes(scene) ? scene : 'auto' };
    this.commit();
  }
  // Reiniciar tudo: o roteiro volta para o primeiro passo e somem check-ins, duplas, avaliações e a mensagem do Doc.
  // keepCheckins: as pessoas continuam a bordo (útil para recomeçar com a sala já cheia). Pessoas, fotos, perguntas,
  // roteiro e textos não são tocados. (Reflexão, Sucesso e cenas são reiniciados pelo servidor, que conhece esses blocos.)
  resetEvent({ keepCheckins = false } = {}) {
    this.resetConnections();
    db.exec('DELETE FROM words; DELETE FROM feedback;'); // as respostas da nuvem de palavras e o feedback do encerramento
    if (!keepCheckins) db.exec("UPDATE people SET checked_in_at = NULL, token = NULL;");
    this.state.presentation = null; this.state.returnStep = null; this.state.drawn = {};
    this.state.doc = defaultDoc();
    this.state.screen = Object.assign({}, DEFAULT_SCREEN);
    this.applyStep(this.settings.steps[0].id); // o roteiro volta para o começo
  }
  // Reiniciar o check-in: todo mundo escolhe o nome de novo. As Conexões vão junto, porque as duplas dependem de quem está a bordo.
  resetCheckins() {
    db.exec('DELETE FROM groups; DELETE FROM seen; DELETE FROM rankings; DELETE FROM results;');
    this.clearTimer(); this.state.conn = defaultConn();
    db.exec("UPDATE people SET checked_in_at = NULL, token = NULL; DELETE FROM words; DELETE FROM feedback;");
    this.commit();
  }
  // utilidades de teste
  testCheckinAll() { db.prepare('UPDATE people SET checked_in_at = COALESCE(checked_in_at, ?) WHERE active = 1').run(iso()); this.commit(); }
  testRandomRankings() {
    const c = this.state.conn;
    if (c.phase !== 'ranking') throw new Error('Abra a avaliação antes.');
    for (const p of this.participants()) {
      const rounds = this.roundsOfPerson(p.id).map(x => x.round);
      if (!rounds.length) continue;
      const ranks = rounds.map((_, i) => i + 1).sort(() => Math.random() - 0.5);
      const obj = {}; rounds.forEach((r, i) => { obj[r] = ranks[i]; });
      try { this.submitRanking(p.id, obj); } catch { /* ignora */ }
    }
    this.commit();
  }

  /* ---------------- De Volta para o Sucesso ---------------- */
  // A viagem (cronômetro das Conexões) espera quando o evento sai do passo Conexões — para uma
  // dinâmica do Sucesso, outro passo do roteiro ou uma tela avulsa — e continua de onde parou quando
  // o evento volta. Se foi o Doc que pausou na mão, ela continua pausada.
  pausedTimerKey() {
    const { phase, round, timer } = this.state.conn;
    if (!timer || !timer.paused) return null;
    return JSON.stringify([phase, round, timer.kind, timer.endsAt, timer.remaining, timer.duration]);
  }
  holdJourney() {
    const c = this.state.conn, t = c.timer;
    if (!t || t.paused) return;
    t.paused = true; t.remaining = Math.max(0, Math.round((t.endsAt - now()) / 1000)); this.clearTimer();
    c.held = this.pausedTimerKey();
  }
  releaseJourney() {
    const c = this.state.conn, t = c.timer, held = c.held; c.held = null;
    if (!held || !t || !t.paused || held !== this.pausedTimerKey()) return;
    t.paused = false; t.endsAt = now() + t.remaining * 1000; t.remaining = null; this.rearmTimer();
  }
  setPresentation(selection, { silent = false } = {}) {
    const previous = this.state.presentation;
    if (!selection) {
      if (!previous) return null;
      this.state.presentation = null;
      if (!silent) this.commit({ title: 'Back to the townhall', body: 'Check your phone.' });
      return null;
    }
    this.holdJourney();
    const { roomId, activityId, title, question, ownerId } = selection;
    this.state.presentation = { roomId, activityId, title, question, ownerId };
    this.commit({ title: 'De Volta para o Sucesso', body: `📱 ${title}` });
    return this.presentation();
  }
  presentation() {
    const p = this.state.presentation;
    if (!p) return null;
    const d = p.draw; // o texto da resposta sorteada não vai no estado público (só telão logado e o próprio sorteado)
    return { roomId: p.roomId, activityId: p.activityId, title: p.title, question: p.question, revealed: !!p.revealed, draw: d ? { name: d.name, at: d.at, talk: d.talk } : null };
  }
  // Sorteio de viajante (dinâmicas com tempo de fala): o estado fica aqui para o Painel do Doc,
  // o telão e o celular do sorteado mostrarem a mesma coisa.
  drawKey(roundId) { const p = this.state.presentation; return `${p.roomId}:${p.activityId}:${roundId}`; }
  drawnIds(roundId) { return this.state.presentation ? (this.state.drawn[this.drawKey(roundId)] || []).slice() : []; }
  setDraw(winner, roundId, talkSeconds) {
    const p = this.state.presentation;
    if (!p) throw new Error('Nenhuma dinâmica em exibição.');
    const key = this.drawKey(roundId), keys = Object.keys(this.state.drawn);
    if (keys.length > 40) for (const k of keys.slice(0, keys.length - 40)) delete this.state.drawn[k];
    (this.state.drawn[key] = this.state.drawn[key] || []).push(winner.id);
    const s = Math.max(10, Number(talkSeconds) || 120);
    p.draw = { responseId: winner.id, name: winner.name, answer: winner.answer, personId: winner.personId || null, at: now(), talk: { duration: s, remaining: s, endsAt: null } };
    this.commit({ title: 'Viajante sorteado', body: winner.name, es: { title: 'Viajero sorteado', body: winner.name } });
    return p.draw;
  }
  drawTalk(action) {
    const d = this.state.presentation && this.state.presentation.draw;
    if (!d) throw new Error('Nenhum sorteio em andamento.');
    const t = d.talk, running = t.endsAt !== null && t.endsAt > now();
    if (action === 'start') { if (!running) { const left = t.endsAt === null && t.remaining > 0 ? t.remaining : t.duration; t.remaining = left; t.endsAt = now() + left * 1000; } }
    else if (action === 'pause') { if (t.endsAt !== null) { t.remaining = Math.max(0, Math.ceil((t.endsAt - now()) / 1000)); t.endsAt = null; } }
    else if (action === 'reset') { t.remaining = t.duration; t.endsAt = null; }
    else throw new Error('Comando inválido.');
    this.commit();
  }
  closeDraw() {
    const p = this.state.presentation;
    if (!p || !p.draw) return;
    p.draw = null; this.commit();
  }
  // As respostas ficam guardadas enquanto chegam: a nuvem de palavras só vai para o telão quando o Doc revela.
  setReveal(on) {
    const p = this.state.presentation;
    if (!p) throw new Error('Nenhuma dinâmica em exibição.');
    p.revealed = !!on;
    this.commit(on ? { title: 'Respostas reveladas', body: 'Olhe para o telão.', es: { title: 'Respuestas reveladas', body: 'Mira la pantalla.' } } : null);
  }

  /* ---------------- Visão 2027 (o Doc) ---------------- */
  // A mensagem é escrita no servidor (server/doc.js); aqui fica o estado que o painel, o telão e os celulares leem.
  setDocGenerating() {
    const d = this.state.doc;
    if (d.status === 'generating') throw Object.assign(new Error('O Doc já está escrevendo a mensagem. Aguarde.'), { status: 409 });
    d.status = 'generating'; d.error = ''; this.commit();
  }
  setDocMessage(message) {
    const d = this.state.doc;
    d.message = message; d.status = message ? 'ready' : 'idle'; d.error = ''; d.rev = (d.rev || 0) + 1;
    if (!message) { d.play = null; d.phones = false; }
    this.commit();
  }
  setDocError(msg) { const d = this.state.doc; d.status = d.message ? 'ready' : 'idle'; d.error = String(msg || 'Não foi possível gerar a mensagem.'); this.commit(); }
  // Cena no telão: começar, pausar/retomar, ir para outra parte. Cada comando aumenta o "seq" para o telão
  // saber que deve pular para a parte pedida (dentro de uma parte, o telão avança sozinho no fim da fala).
  docPlay(action, { part, total } = {}) {
    const d = this.state.doc;
    if (!d.message) throw Object.assign(new Error('Gere a mensagem do Doc antes.'), { status: 409 });
    if (this.state.block !== 'doc' || this.state.presentation) throw Object.assign(new Error('Coloque a Visão 2027 no ar (no roteiro) antes.'), { status: 409 });
    const last = Math.max(0, (Number(total) || 1) - 1), p = d.play, seq = ((p && p.seq) || 0) + 1, at = now();
    if (action === 'start') d.play = { seq, part: 0, paused: false, at };
    else if (action === 'stop') d.play = null;
    else if (!p) throw Object.assign(new Error('A cena ainda não começou.'), { status: 409 });
    else if (action === 'pause') d.play = { ...p, paused: true };
    else if (action === 'resume') d.play = { ...p, seq, paused: false, at };
    else if (action === 'next') d.play = { seq, part: Math.min(last, p.part + 1), paused: false, at };
    else if (action === 'prev') d.play = { seq, part: Math.max(0, p.part - 1), paused: false, at };
    else if (action === 'goto') d.play = { seq, part: Math.max(0, Math.min(last, Math.round(Number(part) || 0))), paused: false, at };
    else throw Object.assign(new Error('Comando inválido.'), { status: 400 });
    this.commit(action === 'start' ? { title: 'Visão 2027', body: 'O Doc chegou de 2027. Olhe para o telão!', es: { title: 'Visión 2027', body: '¡El Doc llegó de 2027! Mira la pantalla.' } } : null);
  }
  setDocPhones(on) {
    const d = this.state.doc;
    if (on && !d.message) throw Object.assign(new Error('Gere a mensagem do Doc antes.'), { status: 409 });
    d.phones = !!on; this.commit(on ? { title: 'Mensagem do Doc', body: 'A visão de 2027 chegou no seu celular.', es: { title: 'Mensaje del Doc', body: 'La visión de 2027 llegó a tu celular.' } } : null);
  }
  // O que vai para todos (telão e celulares): a mensagem só depois que a cena começa ou é enviada aos celulares
  docPublic() {
    const d = this.state.doc, open = !!(d.play || d.phones);
    return { status: d.status, rev: d.rev || 0, play: d.play, phones: !!d.phones, ready: !!d.message, message: open ? d.message : null };
  }

  /* ---------------- roteiro do evento ---------------- */
  stepById(id) { return (this.settings.steps || []).find(x => x.id === id) || null; }
  currentStep() { return this.stepById(this.state.step) || this.settings.steps[0]; }
  // Alguma ação antiga mudou a tela direto (ex.: revelar as duplas): o cursor do roteiro acompanha.
  syncCursor(type) {
    if (this.currentStep().type === type) return;
    const step = this.settings.steps.find(x => x.type === type);
    if (step) this.state.step = step.id;
  }
  // Coloca um passo do roteiro no ar (celulares e telão). As dinâmicas do Sucesso são ligadas pelo
  // servidor, que conhece a sala: aqui só o cursor anda e a viagem fica esperando.
  applyStep(id, { silent = false } = {}) {
    const step = this.stepById(id);
    if (!step) throw Object.assign(new Error('Esse passo não está mais no roteiro.'), { status: 404 });
    const before = this.currentStep();
    if (step.type === 'sucesso' && before.type !== 'sucesso') this.state.returnStep = before.id;
    this.state.step = step.id; this.state.detour = null;
    let notice = null;
    switch (step.type) {
      case 'checkin': this.state.block = 'welcome'; break;
      case 'stage': this.state.block = 'stage'; if (this.settings.stageMutes) this.state.audio.mode = 'off'; notice = { title: step.title, body: step.theme || this.settings.stageText, secret: true }; break;
      case 'connections': this.state.block = 'connections'; notice = { title: 'Conexões', body: '📱 Pegue o celular: esta dinâmica acontece no app.', es: { title: 'Conexiones', body: '📱 Toma tu celular: esta dinámica ocurre en la app.' } }; break;
      case 'message': this.state.message = { title: step.title, body: step.body, emoji: step.emoji }; this.state.block = 'message'; notice = { title: step.title, body: step.body }; break;
      case 'standby': this.state.block = 'standby'; break;
      case 'closing': this.state.block = 'closing'; notice = NOTICES.closing(); break;
      case 'reflexao': this.state.block = 'reflexao'; notice = { title: 'Reflexão', body: '📱 Pegue o celular: esta dinâmica acontece no app.', es: { title: 'Reflexión', body: '📱 Toma tu celular: esta dinámica ocurre en la app.' } }; break;
      case 'doc': this.state.block = 'doc'; notice = { title: 'Visão 2027', body: 'Olhe para o telão: o Doc está chegando de 2027.', es: { title: 'Visión 2027', body: 'Mira la pantalla: el Doc está llegando de 2027.' } }; break;
      case 'cena': // cena do deck: atenção no telão; o som segue a regra dos blocos de fala (no intervalo, a música entra)
        this.state.block = 'cena';
        if (this.settings.stageMutes) this.state.audio.mode = step.cena === 'intervalo' ? (this.settings.spotifyBreak ? 'spotify' : 'music') : 'off';
        notice = step.cena === 'nuvem' ? NOTICES.nuvem()
          : step.cena === 'capasucesso' ? { title: 'De Volta para o Sucesso', body: 'Olhe para o telão: o bloco Sucesso vai começar.', es: { title: 'De Vuelta al Éxito', body: 'Mira la pantalla: el bloque Éxito va a comenzar.' } }
          : lookNotice(CENA_META[step.cena].name, confidentialStep(step)); // secret: no modo confidencial, só quem tem a senha mestra recebe
        break;
      default: break; // sucesso: a apresentação entra em seguida
    }
    if (step.type === 'connections') this.releaseJourney(); else this.holdJourney();
    if (!silent) this.commit(notice);
    return step;
  }
  // Bloco de fala no ar: o que o celular e o telão mostram
  stageInfo() {
    const step = this.currentStep();
    return step && step.type === 'stage' ? { title: step.title, theme: step.theme, speaker: step.speaker } : { title: 'Bloco', theme: '', speaker: '' };
  }
  setAudio({ mode, volume, out, beeps } = {}) {
    if (beeps !== undefined) this.state.audio.beeps = !!beeps;
    if (mode !== undefined) { if (!AUDIO_MODES.includes(mode)) throw new Error('Modo de som inválido.'); this.state.audio.mode = mode; }
    if (out !== undefined) this.state.audio.out = out === 'painel' ? 'painel' : 'telao';
    if (volume !== undefined) this.state.audio.volume = Math.max(0, Math.min(100, Math.round(Number(volume) || 0)));
    this.commit();
  }
  requireJourney() {
    if (this.state.presentation) throw Object.assign(new Error('Há uma dinâmica do Sucesso no telão. Volte ao Townhall antes de mudar o evento.'), { status: 409 });
  }

  /* ---------------- snapshots ---------------- */
  publicState() {
    const c = this.state.conn;
    const people = this.listPeople();
    const active = people.filter(p => p.active);
    const checked = active.filter(p => p.checkedInAt);
    const exists = new Set(people.map(p => p.id));
    const rankingTotal = c.played ? new Set(this.allGroups().filter(g => g.round <= c.played).flatMap(g => g.members).filter(id => exists.has(id))).size : 0;
    const rankingDone = db.prepare('SELECT COUNT(DISTINCT person_id) AS n FROM rankings').get().n;
    return {
      event: { name: this.settings.eventName, agenda: this.settings.agenda, welcomeText: this.settings.welcomeText, closingText: this.settings.closingText, standbyText: this.settings.standbyText, stageText: this.settings.stageText },
      block: this.state.block,
      message: this.state.message,
      counts: { checkedIn: checked.length, total: active.length },
      conn: {
        phase: c.phase, round: c.round, totalRounds: TOTAL_ROUNDS, played: c.played || 0,
        era: eraOfRound(Math.max(1, c.round || 1)), eras: ERAS, cats: CATEGORIES, timer: c.timer, worstLevel: c.worstLevel,
        generatedAt: c.generatedAt, resultsAt: c.resultsAt, rankingDone, rankingTotal,
        mutualPairs: (c.phase === 'results' && this.settings.showMutualOnScreen) ? this.mutualPairs() : [],
        mutualCount: c.phase === 'results' ? this.mutualPairs().length : 0,
      },
      screen: this.state.screen,
      presentation: this.presentation(),
      doc: this.docPublic(),
      stage: this.stageInfo(),
      // nuvem de palavras: open = os celulares pedem as duas respostas a quem ainda não respondeu (do check-in até o passo da nuvem) ·
      // live = as nuvens estão no telão (só aí as palavras vão para todos); cada nuvem = [termo, quantas pessoas]
      words: this.wordsLive() ? { open: true, live: true, ...this.wordsCloud() } : { open: this.wordsOpen(), live: false, count: db.prepare('SELECT COUNT(*) AS n FROM words').get().n, clouds: [[], []] },
      // feedback do encerramento: aberto enquanto o encerramento está no ar; o telão mostra só quantas pessoas já responderam
      feedback: { open: this.feedbackOpen(), count: db.prepare('SELECT COUNT(*) AS n FROM feedback').get().n },
      epoch: this.epoch,
      step: { index: Math.max(0, this.settings.steps.findIndex(x => x.id === this.state.step)), count: this.settings.steps.length, type: this.currentStep().type, cena: this.currentStep().cena || null, transition: this.currentStep().transition !== false },
      audio: { mode: this.state.audio.mode, volume: this.state.audio.volume, out: this.state.audio.out || 'telao', beeps: this.state.audio.beeps !== false, musicUrl: this.settings.musicUrl || '', ambientUrl: this.settings.ambientUrl || '' },
      settings: { roundSeconds: this.settings.roundSeconds, findSeconds: this.settings.findSeconds, questionMode: this.settings.questionMode, breakSeconds: this.settings.breakSeconds, rankingSeconds: this.settings.rankingSeconds, autoFlow: !!this.settings.autoFlow, showFormHints: this.settings.showFormHints, transitions: this.settings.transitions !== false, transitionSeconds: this.settings.transitionSeconds || 8, appLang: this.settings.appLang === 'en' ? 'en' : 'pessoa',
        docVoice: this.settings.docVoice !== false, docVoiceName: this.settings.docVoiceName || '', docRate: this.settings.docRate || 1, docVideoUrl: this.settings.docVideoUrl || '', docVideoFull: !!this.settings.docVideoFull },
      now: now(),
    };
  }
  mutualPairs() {
    const rows = db.prepare('SELECT person_id, match_id FROM results WHERE mutual = 1').all();
    const seen = new Set(), out = [];
    for (const r of rows) {
      const k = [r.person_id, r.match_id].sort((a, b) => a - b).join('|');
      if (seen.has(k)) continue; seen.add(k);
      const a = this.personById(r.person_id), b = this.personById(r.match_id);
      if (a && b) out.push([a.name, b.name]);
    }
    return out;
  }
  meState(personId) {
    const p = this.personById(personId);
    if (!p) return null;
    const c = this.state.conn;
    const questions = Object.fromEntries(this.listQuestions().map(q => [q.id, q]));
    const people = Object.fromEntries(this.listPeople().map(x => [x.id, x]));
    let group = null;
    if (c.round >= 1 && ['matching', 'talk', 'roundEnd'].includes(c.phase)) {
      const g = this.groupOfPerson(p.id, c.round);
      if (g) {
        group = {
          id: g.id, round: c.round, code: String(g.idx + 1).padStart(2, '0'),
          partners: g.members.filter(id => id !== p.id).map(id => this.publicPerson(people[id], true)).filter(Boolean),
          queue: g.queue.map(id => questions[id]).filter(Boolean).map(q => ({ id: q.id, text: q.text, ...(q.es ? { es: q.es } : {}), cat: q.cat })),
          position: Math.min(g.position, Math.max(0, g.queue.length - 1)),
          flags: checkGroups([g.members], people).detail[0],
        };
      } else group = { missing: true, round: c.round };
    }
    const conversations = this.roundsOfPerson(p.id).map(({ round, group: g }) => ({
      round, era: eraOfRound(round), partners: g.members.filter(id => id !== p.id).map(id => this.publicPerson(people[id])).filter(Boolean),
    }));
    const rk = db.prepare('SELECT round, rank FROM rankings WHERE person_id = ?').all(p.id);
    const ranking = rk.length ? Object.fromEntries(rk.map(r => [r.round, r.rank])) : null;
    const result = c.phase === 'results' ? this.resultOf(p.id) : null;
    const skip = { connections: this.skips('connections', p.id), reflexao: this.skips('reflexao', p.id), sucesso: this.skips('sucesso', p.id) };
    return { person: { ...this.publicPerson(p), checkedInAt: p.checkedInAt }, group, conversations, ranking, result, skip, words: this.wordsOf(p.id), feedback: this.feedbackOf(p.id) };
  }
  // Extração de dados das Conexões: duplas de cada viagem com as perguntas que tiveram, a avaliação
  // (ranking) de cada pessoa e a conexão sugerida (match) de cada uma.
  exportConnections() {
    const c = this.state.conn, played = c.played || 0;
    const byId = Object.fromEntries(this.listPeople().map(p => [p.id, p]));
    const who = id => { const p = byId[id]; return p ? { id: p.id, name: p.name, area: p.area, wl: p.wl, team: p.team } : { id, name: '(removido)', area: '', wl: '', team: '' }; };
    const questions = Object.fromEntries(this.listQuestions().map(q => [q.id, { ...q, catName: CATEGORIES[q.cat].name }]));
    const groups = this.allGroups(), rankings = this.rankingsMap(), code = g => String(g.idx + 1).padStart(2, '0');
    const results = Object.fromEntries(db.prepare('SELECT * FROM results').all().map(r => [r.person_id, r]));
    const rounds = [];
    for (let r = 1; r <= TOTAL_ROUNDS; r++) {
      const era = eraOfRound(r), talked = r <= played; // a conversa da viagem aconteceu (ou está acontecendo)
      rounds.push({ round: r, era: { label: era.label, year: era.year }, cat: this.settings.questionMode === 'mix' ? 'As três categorias' : catOfRound(r).name, talked, groups: groups.filter(g => g.round === r).map(g => ({
        code: code(g), members: g.members.map(who),
        // fila de perguntas da dupla; "shown" = até onde a dupla chegou durante a conversa
        questions: g.queue.map((id, i) => ({ text: (questions[id] || {}).text || '(pergunta removida)', cat: (questions[id] || {}).catName || '', shown: talked && i <= g.position })),
      })) });
    }
    const ids = [...new Set(groups.filter(g => g.round <= played).flatMap(g => g.members))];
    const people = ids.map(who).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(p => {
      const conversations = [];
      for (let r = 1; r <= played; r++) {
        const g = groups.find(x => x.round === r && x.members.includes(p.id)); if (!g) continue;
        const mine = (rankings[p.id] || {})[r] || null;
        for (const id of g.members) if (id !== p.id) { const theirs = (rankings[id] || {})[r] || null; conversations.push({ round: r, year: eraOfRound(r).year, code: code(g), partner: who(id), gave: mine, got: theirs, points: (POINTS[mine] || 0) + (POINTS[theirs] || 0) }); }
      }
      const res = results[p.id];
      return { ...p, ranked: !!rankings[p.id], conversations, match: res && res.match_id ? who(res.match_id) : null, score: res ? res.score : null, mutual: !!(res && res.mutual), hasResult: !!res };
    });
    return { phase: c.phase, played, totalRounds: TOTAL_ROUNDS, rounds, people };
  }
  adminOverview() {
    const c = this.state.conn;
    const people = this.listPeople();
    const byId = Object.fromEntries(people.map(p => [p.id, p]));
    const rankings = this.rankingsMap();
    const generatedAt = c.generatedAt ? Date.parse(c.generatedAt) : null;
    const inRounds = new Set(this.allGroups().flatMap(g => g.members));
    const rounds = [];
    for (let r = 1; r <= TOTAL_ROUNDS; r++) {
      const groups = this.groupsOfRound(r);
      const chk = checkGroups(groups.map(g => g.members), byId);
      rounds.push({
        round: r, era: eraOfRound(r), cat: catOfRound(r), level: (c.levels || {})[r] || null, check: { ok: chk.ok, total: chk.total },
        groups: groups.map((g, i) => ({
          id: g.id, code: String(g.idx + 1).padStart(2, '0'), position: g.position, queueLen: g.queue.length,
          currentQuestion: g.queue.length ? (db.prepare('SELECT text FROM questions WHERE id = ?').get(g.queue[Math.min(g.position, g.queue.length - 1)]) || {}).text : null,
          flags: chk.detail[i], members: g.members.map(id => this.publicPerson(byId[id], false, true) || { id, name: '(removido)', area: '', wl: '' }),
        })),
      });
    }
    const results = db.prepare('SELECT * FROM results').all().map(r => ({
      person: this.publicPerson(byId[r.person_id], false, true), match: this.publicPerson(byId[r.match_id], false, true), mutual: !!r.mutual, score: r.score,
    })).filter(r => r.person);
    return {
      state: this.state, settings: this.settings, now: now(),
      people: people.map(p => ({ id: p.id, name: p.name, photo: p.photo, email: p.email, wl: p.wl, team: p.team, manager: p.manager, area: p.area, active: p.active, checkedInAt: p.checkedInAt, hasForm: !!(p.form && Object.keys(p.form).length), form: p.form, inRounds: inRounds.has(p.id), ranked: !!rankings[p.id], late: !!(generatedAt && p.active && p.checkedInAt && !inRounds.has(p.id) && !this.skips('connections', p.id)) })),
      rounds, rankings, results, questions: this.listQuestions(), eras: ERAS, cats: CATEGORIES, points: POINTS, fotosSeed: this.fotos.seedStatus(), words: this.wordsList(), wordsCloud: this.wordsCloud(), feedback: { stats: this.feedbackStats(), list: this.feedbackList() },
      counts: this.publicState().counts,
    };
  }
}

module.exports = { Engine, TOTAL_ROUNDS, BLOCKS, PHASES, STEP_TYPES, confidentialStep, normalizeWl, defaultSteps };
