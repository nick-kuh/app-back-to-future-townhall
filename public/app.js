/* ===== Back to the Future · app do participante =====
 * O app é em INGLÊS. As dinâmicas (Conexões, Reflexão e Sucesso) são em português e, para quem escolhe "Español"
 * no login, em espanhol. O login fica guardado no aparelho: apagar a tela, fechar a aba ou perder a rede não tira
 * ninguém do evento, e a tela se atualiza sozinha quando o celular volta. */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ini = n => String(n || '?').trim().split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const first = n => String(n || '').trim().split(/\s+/)[0] || '';
  const pad = n => String(n).padStart(2, '0');
  const fmt = s => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const PALETTE = ['#ff6a00', '#ff2d95', '#2ee6d6', '#39ff6a', '#ffd21f', '#b980ff', '#ff5c5c', '#5cffd6', '#ffa94d', '#7fb2ff', '#f58cff', '#a8ff5c'];
  const hash = s => [...String(s || '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const color = name => PALETTE[hash(name) % PALETTE.length];
  // avatar: a foto de perfil por cima das iniciais (se a foto não carregar, ficam as iniciais)
  const av = (p, cls = '') => `<div class="av ${cls} ${p.photo ? 'ph' : ''}" style="--c:${color(p.name)}">${esc(ini(p.name))}${p.photo ? `<img src="${esc(p.photo)}" alt="" decoding="async">` : ''}</div>`;
  const ERA_KEYS = ['presente', 'passado', 'futuro'];
  // escapa o texto e depois transforma URLs em links (o href nasce do texto já escapado)
  const linkify = s => esc(s).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');

  /* ---------------- o que fica guardado no aparelho ----------------
   * O login (token) fica no armazenamento do navegador e, de reserva, em um cookie de 30 dias: se um dos dois se
   * perder, o outro traz a pessoa de volta. Também ficam o nome, o idioma das dinâmicas e as duas palavras. */
  const store = {
    get: k => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } },
    del: k => { try { localStorage.removeItem(k); } catch { /* sem armazenamento */ } },
  };
  const cookie = {
    get: n => { try { const m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : null; } catch { return null; } },
    set: (n, v) => { try { document.cookie = `${n}=${encodeURIComponent(v)}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`; } catch { /* segue */ } },
    del: n => { try { document.cookie = `${n}=; Path=/; Max-Age=0; SameSite=Lax`; } catch { /* segue */ } },
  };
  const savedToken = () => { const t = store.get('bttf.token') || cookie.get('bttf_token'); return t && /^[0-9a-f]{16,128}$/i.test(t) ? t : null; };
  const saveToken = t => { S.token = t; store.set('bttf.token', t); cookie.set('bttf_token', t); };
  const clearToken = () => { S.token = null; store.del('bttf.token'); cookie.del('bttf_token'); };

  /* ---------------- idioma das dinâmicas ---------------- */
  const LANGS = { pt: 'Português', es: 'Español' };
  const startLang = () => { const l = store.get('bttf.lang'); return LANGS[l] ? l : (navigator.language || '').toLowerCase().startsWith('es') ? 'es' : 'pt'; };

  const S = {
    token: savedToken(),
    screen: savedToken() ? 'app' : 'splash',
    state: null, me: null, people: [], pick: null, q: '', offset: 0, socket: null,
    draft: [], editing: false, lastKey: '', audio: null, offline: false, lock: null, jump: true,
    lang: startLang(),                                                                  // idioma das dinâmicas: pt | es
    answerDraft: '', anon: false, another: false, sending: false, pendingAnswer: null, // resposta das dinâmicas do Sucesso
    rfProjects: null, rfRev: null, rfPick: null, rfQ: '', rfSending: false,             // Reflexão: lista de projetos e o voto em andamento
    wordsDraft: ['', ''], wordsSending: false, wordsSkip: false, wordsEdit: false,      // "duas palavras": como a pessoa está chegando
    build: null, lastSync: 0, restoring: false, restored: false,
  };
  if (S.token && !store.get('bttf.token')) store.set('bttf.token', S.token); // voltou pelo cookie: guarda de novo no navegador
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)));
  // O nome do check-in vale para tudo: fica guardado para o formulário do Sucesso (/participar) também usar.
  function rememberMe(me) {
    if (me && me.person) { store.set('bttf.name', me.person.name); store.set('bttf.pid', String(me.person.id)); }
    else { store.del('bttf.name'); store.del('bttf.pid'); store.del('bttf.epoch'); store.del('bttf.words'); }
  }
  // Veio do QR do painel do Sucesso sem estar logado: depois do check-in, volta para lá.
  function nextPage() {
    const next = new URLSearchParams(location.search).get('next');
    return next && /^\/participar\/[0-9a-f-]{36}(\?d=d[1-4])?$/i.test(next) ? next : null;
  }

  /* ---------------- textos das dinâmicas: português e espanhol ----------------
   * (o resto do app é em inglês e está escrito direto nas telas) */
  const D = {
    pt: {
      here: '📱 Esta dinâmica acontece aqui, no seu celular', langSet: 'Dinâmicas em português',
      coordTitle: 'Você está na coordenação', coord: w => `Você não participa ${{ sucesso: 'desta dinâmica', reflexao: 'da votação', connections: 'das duplas deste bloco' }[w]}. Acompanhe pelo telão.`,
      look: 'Olhe para o telão.', eyes: 'Olhos no telão. 👀', and: 'e', with: 'com',
      // Sucesso
      sKick: n => `DE VOLTA PARA O SUCESSO · DINÂMICA ${n}`, myAnswers: n => (n > 1 ? 'Suas respostas' : 'Sua resposta'), noName: 'sem nome',
      drawn: 'Viajante sorteado', itsYou: n => `É você, ${n}! ⚡`, talkTime: 'tempo de fala', tellAll: 'Conte para todo mundo. O telão está com você.',
      answeringAs: 'Respondendo como', ansPh: 'Compartilhe sua ideia…', anon: 'Enviar sem meu nome', sending: 'Enviando…', retry: '↻ Tentar enviar de novo', send: '⚡ Enviar resposta',
      mayShow: 'Sua resposta pode aparecer no telão.', sent: 'Resposta enviada!', another: 'Enviar outra resposta', sPaused: '❚❚ RECEBIMENTO PAUSADO PELO DOC', sDone: 'Recebimento encerrado',
      syncing: 'Sincronizando com a linha do tempo…', sWait: 'Aguarde: o Doc vai abrir o recebimento.', received: 'respostas recebidas',
      tWrite: 'Escreva sua resposta antes de enviar.', tDup: 'Envio confirmado! Sua resposta já está no telão.', tSent: 'Resposta enviada! ⚡', tOffAns: 'Sem conexão. Sua resposta está guardada: toque para tentar de novo.',
      // Reflexão
      rf: 'REFLEXÃO', rfStop: n => `REFLEXÃO · PARADA ${n}`, rfNext: 'Aguarde: o Doc vai abrir a próxima parada.', myVote: 'Seu voto nesta parada', andTop: 'E os mais votados são…', top: 'Projetos mais votados',
      nth: k => `${k}º MAIS VOTADO`, vote1: 'VOTO', voteN: 'VOTOS', votingAs: 'Votando como', pick1: 'Escolha 1 projeto', rfSearch: '🔎 Buscar projeto ou responsável…', sendVote: '⚡ Enviar voto',
      voted: 'Voto registrado!', plusEnergy: '+energia para o Flux Capacitor', rfPaused: '❚❚ VOTAÇÃO PAUSADA PELO DOC', rfDone: 'Votação encerrada', rfWait: 'Aguarde: o Doc vai abrir a votação.', rfVotes: 'Votos no Flux Capacitor:',
      loadingProj: 'Carregando projetos…', noProj: 'Nenhum projeto encontrado', tPick: 'Escolha um projeto antes de enviar.', tVoted: 'Voto registrado! ⚡', tOffVote: 'Sem conexão. Toque em enviar de novo.',
      // Conexões
      prep: 'Preparando as viagens', trip: 'VIAGEM', eras: { presente: 'PRESENTE', passado: 'PASSADO', futuro: 'FUTURO' }, offRoute: 'Fora da rota', offRouteBody: 'Você entrou depois do sorteio. Fale com o apresentador.',
      talkIn: 'a conversa começa em', waiting: 'aguardando', find: (names, code) => `Encontre ${names} pela placa <b style="color:var(--txt)">${code}</b>.`, paused: '❚❚ PAUSADO', pausedDoc: '❚❚ PAUSADO PELO DOC', next: 'Próxima →',
      mph: '88 MPH atingidos!', rankIn: 'avaliação em', nextTripIn: 'próxima viagem em', route: 'OUTATIME · ROTA', noQ: 'SEM PERGUNTAS', noQBody: 'O banco de perguntas está vazio. Conversem livremente!',
      noTrips: 'Sem viagens registradas', noTripsBody: 'Você não participou das rodadas, então não há conversas para avaliar.', rankSent: 'Avaliação enviada!', ranked: (a, b) => `${a} de ${b} já avaliaram`, rankedT: (a, b) => `${a} de ${b} viajantes já avaliaram`,
      resultIn: 'resultado em', change: 'Alterar ordem', rankTitle: 'Avalie as conversas', rankHow: 'Toque na ordem: primeiro a melhor.', rankCloses: 'a avaliação fecha em', tripN: n => `Viagem ${n}`, redo: 'Refazer', sendRank: 'Enviar ⚡',
      tRanked: 'Avaliação enviada! ⚡', noServer: 'Sem resposta do servidor', noConn: 'Sem conexão', talkHost: 'Fale com o apresentador.', yourConn: 'Sua conexão do futuro', mutual: '⚡ CONEXÃO MÚTUA', coffee: n => `Marque um café com ${n}. ☕`,
      wTrip: (n, y) => `VIAGEM ${n} · RUMO A ${y}`, wBack: 'VOLTANDO PARA O PRESENTE...', wCalc: 'CALCULANDO CONEXÕES...', wConn: 'RUMO ÀS CONEXÕES', wFuel: 'ABASTECENDO: 1,21 GIGAWATTS', wDest: x => `DESTINO: ${x}`, lookWarp: '👀 OLHE PARA O TELÃO',
      // Visão 2027 · o Doc (fecha o Sucesso)
      docMsg: 'MENSAGEM DO DOC · DIRETO DE 2027', gazette: 'GAZETA DO FUTURO · 1º DE JANEIRO DE 2027', lookBig: 'OLHE PARA O TELÃO', docComing: 'O DOC ESTÁ CHEGANDO', docArrived: 'O Doc acabou de chegar de 2027 com uma mensagem para vocês.', docSignal: 'Um sinal vindo de 2027 está chegando ao telão.',
    },
    es: {
      here: '📱 Esta dinámica ocurre aquí, en tu celular', langSet: 'Dinámicas en español',
      coordTitle: 'Estás en la coordinación', coord: w => `No participas ${{ sucesso: 'en esta dinámica', reflexao: 'en la votación', connections: 'en las parejas de este bloque' }[w]}. Síguelo en la pantalla.`,
      look: 'Mira la pantalla.', eyes: 'Ojos en la pantalla. 👀', and: 'y', with: 'con',
      sKick: n => `DE VUELTA AL ÉXITO · DINÁMICA ${n}`, myAnswers: n => (n > 1 ? 'Tus respuestas' : 'Tu respuesta'), noName: 'sin nombre',
      drawn: 'Viajero sorteado', itsYou: n => `¡Eres tú, ${n}! ⚡`, talkTime: 'tiempo para hablar', tellAll: 'Cuéntaselo a todos. La pantalla está contigo.',
      answeringAs: 'Respondiendo como', ansPh: 'Comparte tu idea…', anon: 'Enviar sin mi nombre', sending: 'Enviando…', retry: '↻ Intentar enviar de nuevo', send: '⚡ Enviar respuesta',
      mayShow: 'Tu respuesta puede aparecer en la pantalla.', sent: '¡Respuesta enviada!', another: 'Enviar otra respuesta', sPaused: '❚❚ RECEPCIÓN PAUSADA POR EL DOC', sDone: 'Recepción cerrada',
      syncing: 'Sincronizando con la línea del tiempo…', sWait: 'Espera: el Doc va a abrir la recepción.', received: 'respuestas recibidas',
      tWrite: 'Escribe tu respuesta antes de enviar.', tDup: '¡Envío confirmado! Tu respuesta ya está en la pantalla.', tSent: '¡Respuesta enviada! ⚡', tOffAns: 'Sin conexión. Tu respuesta está guardada: toca para intentar de nuevo.',
      rf: 'REFLEXIÓN', rfStop: n => `REFLEXIÓN · PARADA ${n}`, rfNext: 'Espera: el Doc va a abrir la próxima parada.', myVote: 'Tu voto en esta parada', andTop: 'Y los más votados son…', top: 'Proyectos más votados',
      nth: k => `${k}.º MÁS VOTADO`, vote1: 'VOTO', voteN: 'VOTOS', votingAs: 'Votando como', pick1: 'Elige 1 proyecto', rfSearch: '🔎 Buscar proyecto o responsable…', sendVote: '⚡ Enviar voto',
      voted: '¡Voto registrado!', plusEnergy: '+energía para el Flux Capacitor', rfPaused: '❚❚ VOTACIÓN PAUSADA POR EL DOC', rfDone: 'Votación cerrada', rfWait: 'Espera: el Doc va a abrir la votación.', rfVotes: 'Votos en el Flux Capacitor:',
      loadingProj: 'Cargando proyectos…', noProj: 'Ningún proyecto encontrado', tPick: 'Elige un proyecto antes de enviar.', tVoted: '¡Voto registrado! ⚡', tOffVote: 'Sin conexión. Toca enviar de nuevo.',
      prep: 'Preparando los viajes', trip: 'VIAJE', eras: { presente: 'PRESENTE', passado: 'PASADO', futuro: 'FUTURO' }, offRoute: 'Fuera de ruta', offRouteBody: 'Entraste después del sorteo. Habla con el presentador.',
      talkIn: 'la conversación empieza en', waiting: 'esperando', find: (names, code) => `Encuentra a ${names} por la placa <b style="color:var(--txt)">${code}</b>.`, paused: '❚❚ PAUSADO', pausedDoc: '❚❚ PAUSADO POR EL DOC', next: 'Siguiente →',
      mph: '¡88 MPH alcanzadas!', rankIn: 'evaluación en', nextTripIn: 'próximo viaje en', route: 'OUTATIME · RUTA', noQ: 'SIN PREGUNTAS', noQBody: 'El banco de preguntas está vacío. ¡Conversen libremente!',
      noTrips: 'Sin viajes registrados', noTripsBody: 'No participaste en las rondas, así que no hay conversaciones para evaluar.', rankSent: '¡Evaluación enviada!', ranked: (a, b) => `${a} de ${b} ya evaluaron`, rankedT: (a, b) => `${a} de ${b} viajeros ya evaluaron`,
      resultIn: 'resultado en', change: 'Cambiar el orden', rankTitle: 'Evalúa las conversaciones', rankHow: 'Toca en orden: primero la mejor.', rankCloses: 'la evaluación cierra en', tripN: n => `Viaje ${n}`, redo: 'Rehacer', sendRank: 'Enviar ⚡',
      tRanked: '¡Evaluación enviada! ⚡', noServer: 'Sin respuesta del servidor', noConn: 'Sin conexión', talkHost: 'Habla con el presentador.', yourConn: 'Tu conexión del futuro', mutual: '⚡ CONEXIÓN MUTUA', coffee: n => `Agenda un café con ${n}. ☕`,
      wTrip: (n, y) => `VIAJE ${n} · RUMBO A ${y}`, wBack: 'VOLVIENDO AL PRESENTE...', wCalc: 'CALCULANDO CONEXIONES...', wConn: 'RUMBO A LAS CONEXIONES', wFuel: 'CARGANDO: 1,21 GIGAWATTS', wDest: x => `DESTINO: ${x}`, lookWarp: '👀 MIRA LA PANTALLA',
      docMsg: 'MENSAJE DEL DOC · DIRECTO DESDE 2027', gazette: 'GACETA DEL FUTURO · 1.º DE ENERO DE 2027', lookBig: 'MIRA LA PANTALLA', docComing: 'EL DOC ESTÁ LLEGANDO', docArrived: 'El Doc acaba de llegar de 2027 con un mensaje para ustedes.', docSignal: 'Una señal de 2027 está llegando a la pantalla.',
    },
  };
  const t = (key, ...a) => { const v = (D[S.lang] || D.pt)[key] ?? D.pt[key]; return typeof v === 'function' ? v(...a) : v; };
  const tx = (pt, es) => (S.lang === 'es' && es ? es : pt); // texto que vem do servidor com a versão em espanhol
  // Sucesso: as perguntas das quatro dinâmicas em espanhol (valem enquanto a pergunta for a original)
  const SUC_ES = {
    d1: ['O que você considera um sucesso?', '¿Qué consideras un éxito?'],
    d2: ['Olhando para 2026, o que fez você pensar: “isso foi um sucesso”?', 'Mirando hacia 2026, ¿qué te hizo pensar: “esto fue un éxito”?'],
    d3: ['O que você fez (projeto, agente ou aprendizado) em 2026 com a ajuda da IA?', '¿Qué hiciste (proyecto, agente o aprendizaje) en 2026 con la ayuda de la IA?'],
    d4: ['O que precisaria ter acontecido para você dizer: “2027 foi um sucesso”?', '¿Qué tendría que haber pasado para que digas: “2027 fue un éxito”?'],
  };
  const sucQ = p => { const e = SUC_ES[p.activityId]; return S.lang === 'es' && e && e[0] === p.question ? e[1] : p.question; };
  const GUIDE_ES = { DESAFIO: 'DESAFÍO', 'COMO USOU IA': 'CÓMO USÓ IA', IMPACTO: 'IMPACTO' };
  const CAT_ES = { quebragelo: 'ROMPEHIELO', conexao: 'CONEXIÓN', alem: 'MÁS ALLÁ DE LO OBVIO' };
  const LOOK = '👀 Look at the big screen.';
  const here = () => `<div class="phonechip">${esc(t('here'))}</div>`; // nas dinâmicas: o aviso de que é no celular

  /* ---------------- util ---------------- */
  const serverNow = () => Date.now() + S.offset;
  const ledNow = () => { const d = new Date(serverNow()); return `${MONTHS[d.getMonth()]} ${pad(d.getDate())} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const roundEra = r => { const e = (S.state && S.state.conn.eras[ERA_KEYS[(Math.max(1, r) - 1) % 3]]) || { key: '', label: '', year: '', led: '' }; return { ...e, label: t('eras')[e.key] || e.label }; };
  function toast(msg, err) {
    const el = $('#toast'); el.textContent = msg; el.classList.toggle('err', !!err); el.classList.add('on');
    clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('on'), 3200);
  }
  function unlockAudio() {
    try { if (!S.audio) S.audio = new (window.AudioContext || window.webkitAudioContext)(); if (S.audio.state === 'suspended') S.audio.resume(); } catch { /* sem áudio */ }
  }
  function beep(kind = 'ok') {
    try {
      if (!S.audio) return;
      const c = S.audio, seq = kind === 'end' ? [880, 660, 440] : kind === 'result' ? [523, 659, 784, 1046] : [660, 880];
      seq.forEach((f, i) => {
        const o = c.createOscillator(), g = c.createGain(); o.type = 'square'; o.frequency.value = f;
        g.gain.setValueAtTime(.06, c.currentTime + i * .16); g.gain.exponentialRampToValueAtTime(.001, c.currentTime + i * .16 + .15);
        o.connect(g).connect(c.destination); o.start(c.currentTime + i * .16); o.stop(c.currentTime + i * .16 + .16);
      });
    } catch { /* ignora */ }
  }
  const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch { /* ignora */ } };
  // A tela do celular fica acesa nos momentos em que a dinâmica é no celular: encontro e conversa das Conexões,
  // votação aberta da Reflexão e recebimento aberto do Sucesso.
  function phoneBusy() {
    if (S.screen !== 'app' || !S.state || !S.me) return false;
    const pr = currentPresentation(); if (pr) return sucPhase(pr) === 'run';
    const rf = currentReflexao(); if (rf) return !!rf.cur && rfPhase(rf.cur) === 'run';
    return S.state.block === 'connections' && ['matching', 'talk'].includes(S.state.conn.phase);
  }
  async function wakeLock() {
    try {
      if (!('wakeLock' in navigator)) return;
      const want = phoneBusy() && document.visibilityState === 'visible';
      if (want && !S.lock) { S.lock = await navigator.wakeLock.request('screen'); S.lock.addEventListener('release', () => { S.lock = null; }); }
      else if (!want && S.lock) { const l = S.lock; S.lock = null; await l.release(); }
    } catch { S.lock = null; }
  }
  function flashSky() { const f = $('#skyFlash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
  // Viagem no tempo: o velocímetro sobe até 88 MPH em "ms" (pelo relógio, para durar o mesmo em qualquer celular) e vem o clarão.
  function warp(msg, cb, ms = 950) {
    const w = $('#warp'); $('#warpMsg').textContent = msg || 'ACCELERATING...';
    w.classList.remove('go'); w.classList.add('on'); w.setAttribute('aria-hidden', 'false');
    const t0 = performance.now(); clearInterval(warp._t);
    warp._t = setInterval(() => {
      const v = Math.min(88, Math.round(88 * (performance.now() - t0) / ms)); $('#warpSpeed').textContent = v;
      if (v >= 88) {
        clearInterval(warp._t); void w.offsetWidth; w.classList.add('go'); buzz([60, 40, 120]);
        setTimeout(() => { cb && cb(); }, 320);
        setTimeout(() => { w.classList.remove('on', 'go'); w.setAttribute('aria-hidden', 'true'); $('#warpSpeed').textContent = '0'; }, 700);
      }
    }, 42);
  }
  function setOffline(off) { S.offline = off; const b = $('#offline'); if (b) b.classList.toggle('on', !!off); }

  /* ---------------- rede ----------------
   * O tempo real vem por WebSocket. Para ninguém ficar com a tela parada: quando o celular volta (tela acesa, aba de
   * volta, rede de volta) a conexão é refeita na hora; se o WebSocket não responder, o estado vem por HTTP; e, de
   * tempos em tempos, o app confere por HTTP se está em dia. Se o servidor publicar uma versão nova, a página recarrega. */
  function connect() {
    S.socket = io({ transports: ['websocket', 'polling'], tryAllTransports: true, reconnectionDelay: 500, reconnectionDelayMax: 3000, timeout: 8000 });
    S.socket.on('connect', () => { setOffline(false); hello(); });
    S.socket.on('disconnect', () => { setOffline(true); });
    S.socket.io.on('reconnect_attempt', () => { setOffline(true); });
    S.socket.on('state', st => { S.state = st; S.offset = st.now - Date.now(); checkBuild(st); maybeRender(); });
    S.socket.on('me', me => {
      if (me === null && S.token) { // check-in desfeito, evento reiniciado ou outro aparelho assumiu este nome
        dropLogin(); toast('Your check-in was ended by the host. Pick your name again.', true); maybeRender(true); return;
      }
      S.me = me; if (me) rememberMe(me); maybeRender();
    });
    S.socket.on('group:update', ({ groupId, position }) => {
      if (S.me && S.me.group && S.me.group.id === groupId && S.me.group.position !== position) { S.me.group.position = position; patchQuestion(true); }
    });
    S.socket.on('notify', n => { const x = S.lang === 'es' && n.es ? n.es : n; toast(`${x.title || ''}${x.body ? ' · ' + x.body : ''}`); });
    // Reconhecimento: a carga do Flux Capacitor sobe com os toques de todo mundo
    S.socket.on('cena:pulse', p => { const c = currentCena(); if (c && p && p.kind === c.kind && c.live) { c.live.carga = p.carga; patchCharge(); } });
  }
  function dropLogin() { clearToken(); rememberMe(null); S.me = null; S.wordsSkip = false; S.wordsEdit = false; if (S.screen === 'app') S.screen = 'splash'; }
  // O que o servidor respondeu (pelo WebSocket ou por HTTP): o estado do evento e quem sou eu
  function applySync(res) {
    if (!res || !res.state) return false;
    S.offset = (res.now || res.state.now) - Date.now(); S.state = res.state; S.lastSync = Date.now(); checkBuild(res.state);
    if (res.ok) {
      S.me = res.me; S.screen = 'app'; rememberMe(res.me); if (res.epoch) store.set('bttf.epoch', res.epoch);
      if (S.restored) { S.restored = false; resendWords(); }
      const next = nextPage(); if (next) { location.replace(next); return true; }
    } else if (S.token) {
      // O servidor não conhece este login. Se o banco dele nasceu de novo (reiniciou e esqueceu todo mundo), o celular
      // refaz o check-in sozinho, com o mesmo nome. Se o banco é o mesmo, foi o apresentador que encerrou o check-in.
      const pid = Number(store.get('bttf.pid')), name = store.get('bttf.name'), was = store.get('bttf.epoch');
      if (res.epoch && was && res.epoch !== was && pid && name) { restore(pid, name); return true; }
      dropLogin();
    } else { S.me = null; if (S.screen === 'app') S.screen = 'splash'; }
    return true;
  }
  async function restore(pid, name) {
    if (S.restoring) return; S.restoring = true;
    try {
      const r = await api('/api/checkin', { personId: pid, name, token: S.token });
      saveToken(r.token); if (r.epoch) store.set('bttf.epoch', r.epoch); S.restored = true;
    } catch (e) { if (e.status) { dropLogin(); maybeRender(true); } } // recusado pelo servidor: volta para o login · sem rede: tenta de novo no próximo ciclo
    finally { S.restoring = false; }
    if (S.restored) hello();
  }
  // depois de refazer o check-in sozinho, as duas palavras que a pessoa já tinha escrito voltam para o servidor
  function resendWords() {
    let w = null; try { w = JSON.parse(store.get('bttf.words') || 'null'); } catch { w = null; }
    if (S.me && !S.me.words && Array.isArray(w) && w.length) api('/api/words', { token: S.token, words: w }).then(r => { if (r.me) { S.me = r.me; maybeRender(); } }).catch(() => { /* a pessoa responde de novo */ });
  }
  function hello() {
    if (!S.socket) return;
    S.socket.timeout(7000).emit('hello', { token: S.token }, (err, res) => {
      if (err) { sync(); if (S.socket.connected) { S.socket.disconnect(); S.socket.connect(); } return; } // conexão "zumbi" (celular que dormiu): refaz
      applySync(res); maybeRender(true);
    });
  }
  // plano B por HTTP: o mesmo estado, sem depender do WebSocket
  async function sync() {
    try {
      const r = await fetch('/api/me?token=' + encodeURIComponent(S.token || ''), { cache: 'no-store' });
      if (!r.ok) return;
      if (applySync(await r.json())) maybeRender();
    } catch { /* sem rede agora: o próximo ciclo tenta de novo */ }
  }
  // o celular voltou (tela acesa, aba de volta, rede de volta): atualiza na hora
  function wake() {
    if (!S.socket) return;
    if (S.socket.connected) hello(); else { S.socket.connect(); sync(); }
    wakeLock(); unlockAudio();
  }
  setInterval(() => {
    if (document.hidden || !S.socket) return;
    if (!S.socket.connected) { S.socket.connect(); sync(); }
    else if (Date.now() - S.lastSync > 70000) sync(); // de tempos em tempos confere por HTTP (e mantém o servidor acordado)
  }, 15000 + Math.floor(Math.random() * 5000));
  // versão nova do app publicada: recarrega sozinho (sem atrapalhar quem está digitando e sem entrar em laço)
  function checkBuild(st) {
    if (!st || !st.build) return;
    if (!S.build) { S.build = st.build; return; }
    if (st.build === S.build || S.reloading) return;
    let done = null; try { done = sessionStorage.getItem('bttf.reload'); } catch { done = null; }
    if (done === st.build) return;
    S.reloading = true;
    const t0 = Date.now(), go = () => {
      const a = document.activeElement, typing = (a && /INPUT|TEXTAREA/.test(a.tagName) && a.value) || S.answerDraft || S.sending || S.rfSending || S.wordsSending;
      if (typing && Date.now() - t0 < 60000) return setTimeout(go, 3000);
      try { sessionStorage.setItem('bttf.reload', st.build); } catch { /* segue */ }
      location.reload();
    };
    setTimeout(go, 500 + Math.random() * 2500); // os celulares não recarregam todos no mesmo instante
  }
  async function api(path, body) {
    const r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || 'Network error'), { status: r.status });
    return j;
  }
  async function loadPeople() { try { S.people = await api('/api/people'); S.peopleAt = Date.now(); } catch (e) { toast(e.message, true); } }
  function refreshPeopleSoon() {
    if (S.screen !== 'identify' || S.pick || Date.now() - (S.peopleAt || 0) < 4000) return;
    S.peopleAt = Date.now();
    loadPeople().then(() => { const l = $('#plist'); if (l) l.innerHTML = vPeopleList(); });
  }

  /* ---------------- render ---------------- */
  // Dinâmica do "De Volta para o Sucesso" liberada pelo Doc. A resposta usa o nome do check-in,
  // então quem ainda não entrou passa primeiro pelo login e cai direto na dinâmica.
  function currentPresentation() {
    const p = S.screen === 'app' && S.me && S.state && S.state.presentation;
    if (!p || typeof p.roomId !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(p.roomId) || !['d1', 'd2', 'd3', 'd4'].includes(p.activityId)) return null;
    return p;
  }
  // Bloco Reflexão no ar (votação em projetos, parada por parada): também usa o nome do check-in.
  function currentReflexao() {
    return (S.screen === 'app' && S.me && S.state && !currentPresentation() && S.state.reflexao) || null;
  }
  // Cena do deck do townhall no ar (vídeo de abertura, boas-vindas, plano de voo, almanaque, reconhecimento…): a atenção é no telão
  function currentCena() {
    return (S.screen === 'app' && S.me && S.state && !currentPresentation() && S.state.block === 'cena' && S.state.cena) || null;
  }
  // "Duas palavras": a primeira tela depois do login, enquanto o evento está na abertura (check-in, vídeo, boas-vindas,
  // plano de voo). Quem já respondeu não vê de novo, mesmo entrando por outro aparelho: a resposta fica no servidor.
  function needWords() {
    if (S.screen !== 'app' || !S.me || !S.state || !S.state.words || !S.state.words.open || currentPresentation() || currentReflexao()) return false;
    return S.wordsEdit || (!S.me.words && !S.wordsSkip);
  }
  const wordsSig = () => { const w = S.state && S.state.words; return w ? `${w.count}:${w.top.map(x => x[0] + x[1]).join('|')}` : ''; };
  // Quem coordena um bloco faz o login (conta presença), mas não participa dele: nada de dupla, voto ou resposta.
  const sitsOut = block => !!(S.me && S.me.skip && S.me.skip[block]);
  const coordinating = block => `<div class="panel glow msgbox"><div class="e">🎬</div><h2>${esc(t('coordTitle'))}</h2><p>${esc(t('coord', block))}</p></div>`;
  function viewKey() {
    if (needWords()) return ['words', S.me.person.id, S.wordsSending ? 'env' : '', S.wordsEdit ? 'edit' : ''].join('|');
    const pr = currentPresentation();
    if (pr) {
      const su = S.me.sucesso || {}, d = pr.draw;
      return ['presentation', pr.roomId, pr.activityId, sucPhase(pr), (pr.live && pr.live.roundId) || '', (su.answers || []).length, su.drawn ? 'eu' : '', d ? d.at : '', S.another ? 'outra' : '', S.pendingAnswer ? 'pend' : '', sitsOut('sucesso') ? 'fora' : '', S.lang].join('|');
    }
    const rf = currentReflexao();
    if (rf) {
      const c = rf.cur, mine = (S.me.reflexao && S.me.reflexao.votes) || [], d = c && c.top;
      return ['reflexao', rf.open === null ? 'menu' : rf.open, c ? rfPhase(c) : '', mine.filter(Boolean).length, d ? `${d.at}:${rfShown(d) ? 'ok' : 'suspense'}:${d.items.map(v => v.votes).join()}` : '', rf.rev, S.rfSending ? 'env' : '', S.rfProjects ? 'lista' : '', sitsOut('reflexao') ? 'fora' : '', S.lang].join('|');
    }
    const cn = currentCena();
    if (cn) { // o que muda a tela do celular em cada cena (o resto é atualizado por cima)
      const l = cn.live || {}, sub = cn.kind === 'reconhecimento' ? [l.fase, l.premio, l.passo, (l.feitos || []).join('.')].join(':') : cn.kind === 'intervalo' ? ivPhase(cn) : cn.kind === 'mph' ? (l.at ? (serverNow() - l.at >= MPH_MS ? 'chegou' : 'indo:' + l.at) : 'antes')
        : cn.kind === 'almanaque' ? `${l.mes}:${l.pagina ? 1 : 0}` : cn.kind === 'agenda' ? cn.itens.map(x => x.estado[0] || '-').join('') : cn.kind === 'abertura' ? `${l.play ? 1 : 0}${l.fim ? 'f' : ''}` : cn.kind === 'boasvindas' ? (l.nuvem ? 'nuvem' : '') : '';
      const content = JSON.stringify([cn.titulo, cn.kicker, cn.itens && cn.kind === 'agenda' ? cn.itens : '', cn.texto, cn.frase, cn.pessoas, cn.quem, cn.pergunta, cn.chegada, cn.premios, cn.carga, cn.hosts, cn.nuvemTitulo, S.me.person, S.me.words]);
      return ['cena', cn.kind, sub, hash(content)].join('|');
    }
    if (S.screen !== 'app' || !S.state) return `${S.screen}|${S.pick ? S.pick.id : ''}|${S.lang}`;
    const c = S.state.conn, g = S.me && S.me.group, tm = c.timer;
    const dc = S.state.doc || {}, docKey = S.state.block === 'doc' ? [dc.status, !!dc.play, dc.phones, dc.phones ? dc.rev : 0] : ''; // Visão 2027: espera, cena no telão, mensagem no celular
    const w = S.state.words || {};
    const content = JSON.stringify([docKey, S.state.message, S.state.event, S.state.settings, S.state.block === 'stage' ? S.state.stage : '', S.me && S.me.person, S.me && S.me.skip, S.me && S.me.words, S.state.block === 'welcome' ? [w.open, w.live] : '', g && g.partners, g && g.code, g && g.queue && g.queue.length, S.me && S.me.conversations, S.me && S.me.ranking, S.me && S.me.result, tm ? tm.kind : '', S.lang]);
    return ['app', S.state.block, c.phase, c.round, '', g ? g.id : '', g && g.missing ? 'miss' : '', S.me && S.me.ranking ? 'ranked' : '', S.editing ? 'edit' : '', S.me && S.me.result ? 'res' : '', hash(content)].join('|');
  }
  // O bloco que está no ar para este celular (depois do login). Quando ele muda, entra a transição
  // do filme: o velocímetro sobe até 88 MPH com o destino escrito embaixo. Avisos e "olhos no telão" entram direto.
  function blockNow() {
    if (S.screen !== 'app' || !S.me || !S.state) return null;
    if (needWords()) return { id: 'words' };
    const st = S.state, pr = currentPresentation(), i = st.step ? st.step.index : 0;
    if (pr) return { id: 'sucesso:' + pr.activityId, msg: t('wDest', pr.title), dyn: true };
    if (st.reflexao) return { id: 'reflexao', msg: t('wFuel'), dyn: true };
    switch (st.block) {
      case 'stage': return { id: 'stage:' + i, msg: `NEXT STOP: ${(st.stage && st.stage.title) || 'ON STAGE'}` };
      case 'connections': return { id: 'connections', msg: t('wConn'), dyn: true };
      case 'closing': return { id: 'closing', msg: 'END OF THE JOURNEY · TO BE CONTINUED…' };
      case 'doc': return { id: 'doc', msg: t('wDest', '2027'), dyn: true };
      case 'cena': return st.cena ? { id: 'cena:' + st.cena.kind, msg: `DESTINATION: ${st.cena.name}` } : { id: 'cena' };
      case 'message': return { id: 'message' };
      case 'standby': return { id: 'standby' };
      default: return { id: 'welcome', msg: 'TIME CIRCUITS ON' };
    }
  }
  function maybeRender(force) {
    const k = viewKey();
    if (!force && k === S.lastKey) { patch(); return; }
    const prev = S.lastKey; S.lastKey = k;
    const p = prev.split('|'), n = k.split('|');
    // (sair da tela das duas palavras não é troca de bloco: a entrada no app tem a sua própria animação)
    const blk = blockNow(), moved = !!(prev && blk && blk.msg && S.blk && S.blk !== 'words' && S.blk !== blk.id && S.state.settings.transitions !== false && (!S.state.step || S.state.step.transition !== false));
    // chegou um bloco que entra direto (sem transição) enquanto a transição do bloco anterior ainda passava: ela sai da frente
    if (prev && blk && S.blk && S.blk !== blk.id && !moved && warp._hold) { warp._hold = false; clearInterval(warp._t); const w = $('#warp'); w.classList.remove('on', 'go'); w.setAttribute('aria-hidden', 'true'); }
    S.blk = blk ? blk.id : null;
    // a transição de bloco não é interrompida por atualizações que chegam logo em seguida: a tela nova entra por baixo
    // dura o mesmo que a transição do telão (15 s por padrão), pedindo para a pessoa olhar para lá
    const secs = Number(S.state && S.state.settings.transitionSeconds) || 15, long = secs >= 7;
    const show = () => { if (!moved) return render(); warp._hold = true; warp(`${long ? (blk.dyn ? t('lookWarp') : '👀 LOOK AT THE BIG SCREEN') + '\n\n' : ''}${blk.msg.toUpperCase()}`, () => { warp._hold = false; render(); }, long ? secs * 1000 - 700 : 1500); };
    const stopWarp = () => { if (warp._hold) return; clearInterval(warp._t); $('#warp').classList.remove('on', 'go'); };
    S.jump = !prev || p.slice(0, 4).join('|') !== n.slice(0, 4).join('|');
    if (n[0] === 'presentation' || p[0] === 'presentation') {
      stopWarp();
      if (n[0] === 'presentation' && (p[0] !== 'presentation' || p[2] !== n[2] || p[4] !== n[4])) { S.another = false; S.anon = false; if (p[0] === 'presentation') { S.answerDraft = ''; S.pendingAnswer = null; } }
      if (prev && n[0] === 'presentation') {
        if (n[6] === 'eu' && p[6] !== 'eu') { beep('result'); buzz([120, 60, 120, 60, 240]); flashSky(); }            // fui sorteado(a)
        else if (p[0] !== 'presentation' || (n[3] === 'run' && p[3] !== 'run')) { beep('ok'); buzz([80, 40, 160]); flashSky(); } // dinâmica liberada / recebimento aberto
        else if (n[3] === 'done' && p[3] === 'run') { beep('end'); buzz(120); }
      }
      return show();
    }
    if (n[0] === 'reflexao' || p[0] === 'reflexao') {
      stopWarp();
      if (n[0] === 'reflexao') {
        if (p[0] !== 'reflexao' || p[1] !== n[1]) { S.rfPick = null; S.rfQ = ''; }                                                    // outra parada: escolha nova
        if (prev && n[4].includes(':ok:') && !p[4].includes(':ok:')) { beep('result'); buzz([120, 60, 120]); flashSky(); }           // mais votados revelados
        else if (prev && (p[0] !== 'reflexao' || p[1] !== n[1] || (n[2] === 'run' && p[2] !== 'run'))) { beep('ok'); buzz([80, 40, 160]); flashSky(); } // parada aberta / votação aberta
        else if (prev && n[2] === 'done' && p[2] === 'run') { beep('end'); buzz(120); }
      }
      return show();
    }
    if (n[0] === 'cena' || p[0] === 'cena') {
      stopWarp();
      if (prev && n[0] === 'cena' && !moved) {
        const [, kind, sub] = n, was = p[0] === 'cena' && p[1] === kind ? p[2] : '';
        if (kind === 'mph' && sub.startsWith('indo') && sub !== was) { // o Doc acelerou: o celular também vai a 88 MPH
          const c = currentCena(), left = MPH_MS - (serverNow() - c.live.at);
          beep('ok'); buzz([80, 40, 80]); if (left > 900) return warp('ACCELERATING TO 2027…', render, left);
        }
        if (kind === 'mph' && sub === 'chegou' && was !== 'chegou') { beep('result'); buzz([120, 60, 120, 60, 240]); flashSky(); }
        if (kind === 'reconhecimento' && sub !== was) {
          const passo = sub.split(':')[2], fase = sub.split(':')[0];
          if (fase === 'cerimonia' && passo === 'carga') { beep('ok'); buzz([80, 40, 160]); flashSky(); }                 // hora de carregar o Flux Capacitor
          else if (fase === 'cerimonia' && passo === 'vencedor') { beep('result'); buzz([120, 60, 120, 60, 240]); flashSky(); } // vencedor revelado
        }
        if (kind === 'intervalo' && sub === 'done' && was === 'run') { beep('end'); buzz([200, 80, 200]); flashSky(); }
      }
      return show();
    }
    const enteringPhase = ph => n[0] === 'app' && n[1] === 'connections' && n[2] === ph && !(p[1] === 'connections' && p[2] === ph && p[3] === n[3]);
    const quiet = b => b === 'standby' || b === 'stage'; // telas calmas: ao sair delas, o celular chama a atenção
    if (prev && p[0] === 'app' && quiet(p[1]) && n[0] === 'app' && n[1] && !quiet(n[1])) { beep('ok'); buzz([80, 40, 160]); flashSky(); }
    if (prev && enteringPhase('matching')) { beep('ok'); buzz([80, 40, 80]); return warp(t('wTrip', n[3], roundEra(+n[3]).year), render); }
    if (prev && enteringPhase('ranking')) { beep('ok'); return warp(t('wBack'), render); }
    if (prev && enteringPhase('results')) { beep('result'); buzz([120, 60, 120, 60, 240]); return warp(t('wCalc'), render); }
    if (prev && enteringPhase('talk')) { beep('ok'); buzz(90); flashSky(); }
    if (prev && enteringPhase('roundEnd')) { beep('end'); buzz([200, 80, 200]); }
    show();
  }
  function render() {
    const app = $('#app');
    const words = needWords(), presentation = currentPresentation(), reflexao = currentReflexao(), cena = currentCena();
    const ae = document.activeElement, typing = ae && ae.id === 'ans', searching = ae && ae.id === 'rfQ', wording = ae && (ae.id === 'w1' || ae.id === 'w2') ? ae.id : null;
    if (words) app.innerHTML = vWords();
    else if (presentation) app.innerHTML = vPresentation(presentation);
    else if (reflexao) app.innerHTML = vReflexao(reflexao);
    else if (cena) app.innerHTML = vCena(cena);
    else if (S.screen === 'splash') app.innerHTML = vSplash();
    else if (S.screen === 'identify') app.innerHTML = S.pick ? vConfirm() : vIdentify();
    else if (!S.state || !S.me) app.innerHTML = vLoading();
    else {
      const b = S.state.block;
      app.innerHTML = b === 'standby' ? vStandby() : b === 'stage' ? vStage() : b === 'welcome' ? vWelcome() : b === 'message' ? vMessage() : b === 'closing' ? vClosing() : b === 'doc' ? vDoc() : vConnections();
    }
    // "olhos no telão" e blocos de fala: tela calma, com o fundo mais apagado (mas sempre rodando: parado, parecia travado)
    const calm = !words && !presentation && S.screen === 'app' && !!S.state && !!S.me && (['standby', 'stage'].includes(S.state.block) || (!!cena && CENA_CALM.includes(cena.kind)));
    document.body.classList.toggle('off', calm);
    if (window.Delorean3D) Delorean3D.pause(false);
    const ans = $('#ans'); if (ans) { ans.value = S.answerDraft; countAnswer(); if (typing && !ans.disabled) { ans.focus(); ans.setSelectionRange(ans.value.length, ans.value.length); } }
    const rq = $('#rfQ'); if (rq) { rq.value = S.rfQ; if (searching) { rq.focus(); rq.setSelectionRange(rq.value.length, rq.value.length); } }
    if (words) { ['w1', 'w2'].forEach((id, i) => { const el = $('#' + id); if (el) el.value = S.wordsDraft[i] || ''; }); if (wording) { const el = $('#' + wording); if (el && !el.disabled) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } } }
    const wc = $('#wcloud'); if (wc) wc.dataset.sig = wordsSig();
    if (reflexao && !words) loadProjects(reflexao.rev);
    mountCar();
    wakeLock();
    if (S.jump !== false) window.scrollTo(0, 0);
    S.jump = true;
    if (S.screen === 'identify' && !S.pick) { const i = $('#q'); if (i) { i.value = S.q; i.focus(); } }
    tick();
  }
  function patch() {
    if (!S.state) return;
    const wc = $('#wcloud'); // nuvem das duas palavras: entra palavra nova sem redesenhar a tela
    if (wc && wc.dataset.sig !== wordsSig()) { wc.innerHTML = cloudHtml(); wc.dataset.sig = wordsSig(); const n = $('#wcN'); if (n) n.textContent = S.state.words.count; }
    if (needWords()) return;
    const pr = currentPresentation();
    if (pr) { const n = $('#sucCount'); if (n && pr.live) n.textContent = pr.live.responseCount; return; }
    const rf = currentReflexao();
    if (rf) { const n = $('#rfCount'); if (n && rf.cur) n.textContent = rf.cur.votes; return; }
    if (currentCena()) { patchCharge(); return; }
    const c = $('#count'); if (c) { c.textContent = S.state.counts.checkedIn; setEnergy(S.state.counts.checkedIn / Math.max(1, S.state.counts.total), true); }
    const rp = $('#rankProgress'); if (rp) rp.textContent = t('rankedT', S.state.conn.rankingDone, S.state.conn.rankingTotal);
    if (S.screen === 'identify' && !S.pick) refreshPeopleSoon();
    if (S.me && S.me.group && S.state.conn.phase === 'talk') patchQuestion(false);
  }

  /* ---- DeLorean 3D + flux capacitor (do painel "De Volta para o Sucesso") ---- */
  const carBox = () => `<div class="carbox"><canvas class="car3d" data-car></canvas>
      <div class="energy"><div class="lbl"><span><svg class="fluxi" viewBox="0 0 24 24"><line x1="4" y1="4" x2="12" y2="12"/><line x1="20" y1="4" x2="12" y2="12"/><line x1="12" y1="12" x2="12" y2="21"/></svg>FLUX CAPACITOR</span><span id="gw"></span></div><div class="ebar" id="ebarW"><i id="ebar"></i></div></div></div>`;
  function setEnergy(e, animate) {
    e = Math.max(0, Math.min(1, e || 0));
    const gain = e - (S.energy || 0); S.energy = e;
    const bar = $('#ebar'), gw = $('#gw');
    if (bar) bar.style.width = (e * 100).toFixed(1) + '%';
    if (gw) gw.textContent = `${(e * 1.21).toFixed(2)} / 1.21 GW`;
    if (!S.car) return;
    if (animate && gain > 0) {
      S.car.charge(e);
      const box = $('.carbox'); if (box) { const g = document.createElement('div'); g.className = 'gwplus'; g.textContent = `+${(gain * 1.21).toFixed(2)} GW ⚡`; box.appendChild(g); setTimeout(() => g.remove(), 1300); }
    } else S.car.setEnergy(e);
  }
  function mountCar() {
    const cv = $('[data-car]');
    if (S.car && S.car.cv === cv) return;
    S.car = cv && window.Delorean3D ? Delorean3D.car(cv, { dprMax: 1.5 }) : null;
    S.energy = 0;
    if (S.car && S.state) setEnergy(S.state.counts.checkedIn / Math.max(1, S.state.counts.total), false);
  }
  setInterval(() => { if (S.car && S.car.cv.isConnected && !document.hidden && S.energy > 0 && Math.random() < S.energy * .5) S.car.spark(); }, 900);

  // Tela liberada pelo Doc: mesma identidade do painel do Sucesso (mostradores 2026 → 2027).
  const DYN = { d1: { n: '01', c: 'var(--cyan)' }, d2: { n: '02', c: 'var(--yellow)' }, d3: { n: '03', c: 'var(--magenta)' }, d4: { n: '04', c: 'var(--orange)' } };
  // fase da dinâmica como o celular enxerga (o prazo pode acabar entre um aviso e outro do servidor)
  function sucPhase(p) {
    const l = p.live; if (!l) return 'sync';
    return l.phase === 'run' && l.endsAt && l.endsAt <= serverNow() ? 'done' : l.phase;
  }
  function countAnswer() { const a = $('#ans'), c = $('#ansCount'); if (a && c) c.textContent = `${a.value.length} / 200`; }
  function vPresentation(p) {
    const d = DYN[p.activityId] || DYN.d1, l = p.live || {}, ph = sucPhase(p), me = S.me.person;
    const su = S.me.sucesso || {}, mine = su.answers || [], draw = p.draw;
    const timer = l.endsAt || (ph === 'paused' && p.activityId !== 'd1') ? `<span class="suc-timer">⏱ <b id="sucTimer">--:--</b></span>` : '<span></span>';
    const myAnswers = mine.length ? `<div class="panel"><div class="kicker">${esc(t('myAnswers', mine.length))}</div>${mine.map(a => `<p class="myans">“${esc(a.answer)}”${a.anonymous ? ` <span class="small">· ${esc(t('noName'))}</span>` : ''}</p>`).join('')}</div>` : '';
    let body;
    if (su.drawn) {
      body = `<div class="panel glow drawn"><div class="kicker">${esc(t('drawn'))}</div><h2>${esc(t('itsYou', first(me.name)))}</h2>
          <p class="myans">“${esc(su.drawnAnswer || '')}”</p>
          ${l.guide ? `<div class="guide">${l.guide.map(g => `<span>${esc(S.lang === 'es' ? GUIDE_ES[g] || g : g)}</span>`).join('<i>→</i>')}</div>` : ''}
          <div class="countdown amber" id="talkTimer">--:--</div><div class="kicker" style="margin-top:8px">${esc(t('talkTime'))}</div>
          <p class="muted" style="margin-top:10px">${esc(t('tellAll'))}</p></div>`;
    } else if (draw) {
      body = `<div class="panel center"><div class="kicker">${esc(t('drawn'))}</div><div class="pname" style="margin-top:8px">${esc(draw.name)}</div><p class="muted" style="margin-top:10px">${esc(t('eyes'))}</p></div>${myAnswers}`;
    } else if (sitsOut('sucesso')) {
      body = coordinating('sucesso');
    } else if (ph === 'run' && (!mine.length || S.another || S.pendingAnswer)) {
      body = `<div class="panel">
          <div class="who">${esc(t('answeringAs'))} <b>${esc(me.name)}</b></div>
          <textarea class="input" id="ans" maxlength="200" rows="4" placeholder="${esc(t('ansPh'))}" ${S.sending ? 'disabled' : ''}></textarea>
          <div class="ansmeta">${timer}<span id="ansCount">0 / 200</span></div>
          ${l.nameRequired === false ? `<label class="sw"><input type="checkbox" id="anon" ${S.anon ? 'checked' : ''}> ${esc(t('anon'))}</label>` : ''}
          <button class="btn" data-action="sendAnswer" ${S.sending ? 'disabled' : ''}>${esc(S.sending ? t('sending') : S.pendingAnswer ? t('retry') : t('send'))}</button>
          <p class="small center" style="margin-top:8px">${esc(t('mayShow'))}</p>
        </div>${myAnswers}`;
    } else if (ph === 'run') {
      body = `<div class="panel glow msgbox"><div class="e">📡</div><h2>${esc(t('sent'))}</h2><div class="ansmeta" style="justify-content:center;margin-top:10px">${timer}</div></div>${myAnswers}
        <button class="btn ghost" data-action="anotherAnswer">${esc(t('another'))}</button>`;
    } else if (ph === 'paused') {
      body = `<div class="panel center"><div class="ptag" style="display:inline-block">${esc(t('sPaused'))}</div><div class="ansmeta" style="justify-content:center;margin-top:10px">${timer}</div></div>${myAnswers}`;
    } else if (ph === 'done') {
      body = `<div class="panel glow msgbox"><div class="e">🏁</div><h2>${esc(t('sDone'))}</h2><p>${esc(t('look'))}</p></div>${myAnswers}`;
    } else {
      body = `<div class="panel"><div class="wait"><div class="flux"><i></i><i></i><i></i><b></b></div><p class="muted">${esc(ph === 'sync' ? t('syncing') : t('sWait'))}</p></div></div>${myAnswers}`;
    }
    const card = `<section class="panel glow presentation-card" style="--c:${d.c}" aria-labelledby="liveTitle">
        <div class="kicker">${esc(t('sKick', d.n))}</div>
        <h1 id="liveTitle">${esc(p.title)}</h1>
        <p class="pq">${esc(sucQ(p))}</p>
        ${l.responseCount !== undefined ? `<p class="small center" style="margin-top:10px"><b id="sucCount">${l.responseCount}</b> ${esc(t('received'))}</p>` : ''}
      </section>`;
    return su.drawn ? `${vHeader()}${body}${card}` : `${vHeader()}${here()}${card}${body}`; // sorteado(a): o aviso e o tempo de fala vêm primeiro
  }
  /* ---- Reflexão · Ato 1: O Combustível do Futuro ----
   * Menu das paradas e, com uma parada aberta, a votação: a pessoa escolhe 1 projeto da lista
   * (com busca) e envia. O nome é o do check-in; vale um voto por parada. */
  const rfPhase = c => (c.phase === 'run' && c.endsAt && c.endsAt <= serverNow() ? 'done' : c.phase);
  const rfShown = top => serverNow() - top.at > 6200; // o telão faz o suspense primeiro: o celular só mostra os nomes depois
  const rfNorm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  async function loadProjects(rev) {
    if (S.rfRev === rev) return; S.rfRev = rev;
    try { S.rfProjects = (await api('/api/reflexao/projects')).projects || []; } catch { S.rfRev = null; return; }
    const l = $('#rfList'); if (l) l.innerHTML = vProjects();
  }
  function vProjects() {
    if (!S.rfProjects) return `<p class="muted center" style="padding:14px">${esc(t('loadingProj'))}</p>`;
    const q = rfNorm(S.rfQ), list = S.rfProjects.filter(x => !q || rfNorm(x.name + ' ' + x.owner).includes(q));
    return list.length ? list.map(x => `<button type="button" class="rf-proj ${S.rfPick === x.name ? 'on' : ''}" data-action="pickProject" data-name="${esc(x.name)}"><small>${esc(tx(x.owner, x.ownerEs))}</small><span>${esc(x.name)}</span></button>`).join('')
      : `<p class="muted center" style="padding:14px">${esc(t('noProj'))}</p>`;
  }
  function vReflexao(r) {
    const me = S.me.person, mine = (S.me.reflexao && S.me.reflexao.votes) || [];
    const head = (kicker, title, q, c, extra = '') => `<section class="panel glow presentation-card ${extra ? 'compact' : ''}" style="--c:${c}"><div class="kicker">${esc(kicker)}</div><h1>${esc(title)}</h1>${q ? `<p class="pq">${esc(q)}</p>` : ''}${extra}</section>`;
    if (r.open === null || !r.cur) {
      return `${vHeader()}${here()}${head(t('rf'), tx(r.title, r.titleEs), tx(r.subtitle, r.subtitleEs), 'var(--yellow)')}
        <div class="panel"><div class="rf-list">${r.themes.map((th, i) => `<div class="rf-item ${mine[i] ? 'ok' : ''}" style="--c:${th.c}"><b>${th.n}</b><span>${esc(tx(th.t, th.tEs))}<small>${mine[i] ? '✓ ' + esc(mine[i].project) : esc(tx(th.q, th.qEs))}</small></span></div>`).join('')}</div>
        <p class="muted center" style="margin-top:12px">${esc(t('rfNext'))}</p></div>`;
    }
    const c = r.cur, th = r.themes[r.open], ph = rfPhase(c), my = mine[r.open], d = c.top;
    const timer = '<span class="suc-timer">⏱ <b id="rfTimer">--:--</b></span>';
    const myVote = my ? `<div class="panel"><div class="kicker">${esc(t('myVote'))}</div><p class="myans">${esc(my.project)}</p><p class="small">${esc(tx(my.owner, my.ownerEs))}</p></div>` : '';
    let body;
    if (d && !rfShown(d)) {
      body = `<div class="panel glow msgbox"><div class="e">🥁</div><h2>${esc(t('andTop'))}</h2><p>${esc(t('eyes'))}</p></div>${myVote}`;
    } else if (d) {
      body = `<div class="panel glow"><div class="kicker">${esc(t('top'))}</div>${d.items.map((v, k) => `<div class="rf-drawn"><small>${esc(t('nth', k + 1))}${v.votes === undefined ? '' : ` · ${v.votes} ${v.votes === 1 ? t('vote1') : t('voteN')}`}</small><b>${esc(v.name)}</b><span>${esc(tx(v.owner, v.ownerEs))}</span></div>`).join('')}</div>${myVote}`;
    } else if (sitsOut('reflexao')) {
      body = coordinating('reflexao');
    } else if (ph === 'run' && !my) {
      body = `<div class="panel">
          <div class="who">${esc(t('votingAs'))} <b>${esc(me.name)}</b></div>
          <div class="ansmeta" style="margin:8px 0">${timer}<span>${esc(t('pick1'))}</span></div>
          <input class="input" id="rfQ" placeholder="${esc(t('rfSearch'))}" autocomplete="off" autocapitalize="off" spellcheck="false">
          <div class="rf-projects" id="rfList">${vProjects()}</div>
          <button class="btn" id="rfSend" data-action="sendVote" ${S.rfPick && !S.rfSending ? '' : 'disabled'}>${esc(S.rfSending ? t('sending') : t('sendVote'))}</button>
        </div>`;
    } else if (ph === 'run') {
      body = `<div class="panel glow msgbox"><div class="e">⚡</div><h2>${esc(t('voted'))}</h2><p>${esc(t('plusEnergy'))}</p><div class="ansmeta" style="justify-content:center;margin-top:10px">${timer}</div></div>${myVote}`;
    } else if (ph === 'paused') {
      body = `<div class="panel center"><div class="ptag" style="display:inline-block">${esc(t('rfPaused'))}</div><div class="ansmeta" style="justify-content:center;margin-top:10px">${timer}</div></div>${myVote}`;
    } else if (ph === 'done') {
      body = `<div class="panel glow msgbox"><div class="e">🏁</div><h2>${esc(t('rfDone'))}</h2><p>${esc(t('look'))}</p></div>${myVote}`;
    } else {
      body = `<div class="panel"><div class="wait"><div class="flux"><i></i><i></i><i></i><b></b></div><p class="muted">${esc(t('rfWait'))}</p></div></div>${myVote}`;
    }
    return `${vHeader()}${here()}${head(t('rfStop', th.n), tx(th.t, th.tEs), tx(th.q, th.qEs), th.c, `<p class="small center" style="margin-top:10px">${esc(t('rfVotes'))} <b id="rfCount">${c.votes}</b></p>`)}${body}`;
  }
  /* ---- Cenas do deck do townhall ----
   * A atenção é no telão: o celular mostra onde o evento está (ato, tema, quem fala). Em algumas cenas ele participa:
   * a agenda completa, a nuvem das duas palavras, o cronômetro do intervalo, o botão que carrega o Flux Capacitor na
   * cerimônia dos prêmios (cada toque soma energia no telão), o vencedor de cada prêmio e a chegada a 2027. */
  const CENA_CALM = ['abertura', 'boasvindas', 'almanaque', 'ia', 'visao', 'manifesto'];
  const ACT_C = ['var(--cyan)', 'var(--orange)', 'var(--yellow)', 'var(--green)'];
  const MPH_MS = 6000;
  const plain = s => String(s ?? '').replace(/\*/g, '');
  const ivPhase = c => { const l = c.live; return l.phase === 'run' && l.endsAt && l.endsAt <= serverNow() ? 'done' : l.phase; };
  const ivLeft = c => { const l = c.live, ph = ivPhase(c); return ph === 'run' ? Math.max(0, Math.ceil((l.endsAt - serverNow()) / 1000)) : ph === 'done' ? 0 : l.remaining; };
  const actLine = c => (c.ato ? `${c.ato.n} · ${c.ato.nome}` : 'CDIO HC + BPC · 2026 TOWNHALL');
  // quem conduz o bloco (Preparar → Agenda e cenas → Quem conduz): as fotos de perfil, lado a lado
  const hostFaces = c => (c.hosts && c.hosts.length ? `<div class="hostrow">${c.hosts.map(h => av({ name: h.nome, photo: h.foto })).join('')}</div>` : '');
  // tela calma, no estilo do logo: ato, título e quem fala
  const cenaLook = (c, title, who, note) => `<div class="spacer"></div>
      ${logo(true, 'dim')}
      <div class="stage">
        <div class="kicker">${esc(actLine(c))}</div><i class="st-arrow"></i>
        <div class="st-theme ${title.length > 22 || /\S{12,}/.test(title) ? 'long' : ''}"><span>${esc(title)}</span></div>
        ${hostFaces(c)}${who ? `<p class="st-speaker">with ${esc(who)}</p>` : ''}
        <p class="muted">${note || LOOK}</p>
      </div>
      <div class="spacer"></div>`;
  const cenaCard = (c, kicker, title, extra = '', col = 'var(--yellow)') => `<section class="panel glow presentation-card compact" style="--c:${col}"><div class="kicker">${esc(kicker)}</div><h1>${esc(title)}</h1>${extra}</section>`;
  function patchCharge() { // barra de carga do Flux Capacitor (cerimônia dos prêmios)
    const c = currentCena(), bar = $('#cgBar'); if (!c || !bar || !c.live) return;
    const v = Math.max(0, Math.min(1, c.live.carga || 0)); bar.style.width = (v * 100).toFixed(1) + '%';
    const n = $('#cgNum'); if (n) n.textContent = `${(v * 1.21).toFixed(2)} / 1.21 GW`;
  }
  function vCena(c) {
    const l = c.live || {};
    if (c.kind === 'agenda') { // o plano de voo: os horários de cada item (sem a duração) e, com 📱, o que acontece no celular
      return `${vHeader()}${cenaCard(c, c.kicker, plain(c.titulo), `<p class="small center">${esc(c.data)} · ${esc(c.inicio)} – ${esc(c.fim)}</p>`, 'var(--cyan)')}
        ${c.atos.map((a, k) => `<div class="panel ag" style="--c:${ACT_C[k]}"><div class="ag-h"><b>${esc(a.n)} · ${esc(a.nome)}</b><span>${esc(a.de)} – ${esc(a.ate)}</span></div>
          ${c.itens.filter(x => x.ato === k + 1).map(x => `<div class="ag-it"><b>${esc(x.hora)}</b><span>${esc(x.t)}<small>${esc(x.d)}</small></span>${x.fone ? '<i title="On your phone">📱</i>' : ''}</div>`).join('')}</div>`).join('')}
        <p class="small center">📱 = this one happens on your phone, in this app</p>`;
    }
    if (c.kind === 'abertura') return cenaLook(c, c.name, '', l.play ? '🎬 Now playing · look at the big screen.' : l.fim ? '🍿 That was the opening.' : '🎬 The opening video is about to start.<br>' + LOOK);
    if (c.kind === 'intervalo') {
      const ph = ivPhase(c), msg = { idle: 'The break is about to start.', run: 'Be back before the clock hits zero.', paused: '❚❚ Timer paused by the host.', done: '⚡ The DeLorean is refueled. Back to your seat!' }[ph];
      return `${vHeader()}${cenaCard(c, actLine(c), plain(c.titulo), '', 'var(--green)')}
        <div class="panel center"><div class="countdown green ${ph === 'done' ? 'hurry' : ''}" id="ivCd">${fmt(ivLeft(c))}</div><p class="muted" style="margin-top:12px">${esc(msg)}</p></div>
        <div class="panel"><p class="myans" style="margin-top:0">☕ ${esc(c.texto)}</p></div>`;
    }
    if (c.kind === 'mph') {
      const arrived = l.at && serverNow() - l.at >= MPH_MS;
      return arrived ? `${vHeader()}<div class="panel glow msgbox"><div class="e">🏁</div><h2>${esc(c.chegada)}</h2><p>${esc(c.depois)}</p><div class="docyear">2027</div></div>`
        : cenaLook(c, '88 MPH', '', l.at ? '⚡ Accelerating…' : `${esc(c.antes)}<br>${LOOK}`);
    }
    if (c.kind === 'reconhecimento') {
      const win = p => (p.vencedor === undefined ? null : p.indicados[p.vencedor]);
      if (l.fase === 'cerimonia' && c.premios[l.premio]) {
        const p = c.premios[l.premio], w = win(p), head = cenaCard(c, `THE 2026 AWARD FOR ${p.k}`, p.n, l.passo === 'categoria' ? `<p class="small center">${esc(p.porque)}</p>` : '');
        if (l.passo === 'carga') { // o Flux Capacitor carrega com os aplausos da sala (microfone), com os toques no celular, ou com os dois
          const mic = c.carga !== 'toques', tap = c.carga !== 'mic';
          return `${vHeader()}${head}
          <div class="panel glow center"><div class="kicker">MAKE SOME NOISE!</div>
            ${mic ? `<div class="clap">👏</div><p class="muted">${tap ? 'Clap and tap the button: both charge the flux capacitor on the big screen.' : 'Put your phone down and clap! The louder the room, the faster the flux capacitor charges.'}</p>` : '<p class="muted">Every tap charges the flux capacitor on the big screen.</p>'}
            ${tap ? '<button class="btn charge" data-action="tapCharge">⚡ CHARGE</button>' : ''}
            <div class="ebar" style="margin-top:14px"><i id="cgBar" style="width:${((l.carga || 0) * 100).toFixed(1)}%"></i></div><p class="small" id="cgNum" style="margin-top:6px"></p></div>`;
        }
        if (l.passo === 'vencedor' && w) return `${vHeader()}${head}
          <div class="panel glow center"><div class="kicker">AND THE AWARD GOES TO…</div><div class="polaroids"><div class="polaroid"><div class="photo">${av({ name: w.nome, photo: (w.fotos || [])[0] })}</div><div class="cap">${esc(first(w.nome))} · 2026</div></div></div>
            <div class="pname">${esc(w.nome)}</div><p class="small" style="margin-top:6px;color:var(--cyan)">${esc(w.projeto)}</p><p class="myans">“${esc(p.citacao)}”</p></div>`;
        const list = l.passo === 'categoria' ? '' : `<div class="panel"><div class="kicker">Nominees</div>${p.indicados.map(x => `<div class="rf-drawn"><b>${esc(x.nome)}</b><span>${esc(x.projeto)}</span></div>`).join('')}</div>`;
        return `${vHeader()}${head}${list}<div class="panel center"><p class="muted">${l.passo === 'sorteio' ? '🥁 The lightning is about to strike… eyes on the big screen!' : LOOK}</p></div>`;
      }
      if (l.fase === 'premios' || l.fase === 'hall') {
        return `${vHeader()}${cenaCard(c, actLine(c), l.fase === 'hall' ? c.hallTitulo : plain(c.premiosTitulo))}
          <div class="panel"><div class="rf-list">${c.premios.map(p => { const w = p.feito && win(p); return `<div class="rf-item ${w ? 'ok' : ''}" style="--c:var(--yellow)"><b>${w ? '🏆' : '✉️'}</b><span>${esc(p.n)}<small>${w ? `${esc(w.nome)} · ${esc(w.projeto)}` : esc(p.k)}</small></span></div>`; }).join('')}</div></div>
          <div class="panel center"><p class="muted">${LOOK}</p></div>`;
      }
      return cenaLook(c, c.name, l.fase === 'tributo' ? c.fala : c.quem, l.fase === 'tributo' ? '🎬 Tribute · look at the big screen.' : '');
    }
    if (c.kind === 'boasvindas') {
      const faces = { ...c, hosts: (c.pessoas || []).map(p => ({ nome: p.nome, foto: (p.fotos || [])[0] })) };
      if (l.nuvem) return `${vHeader()}${cenaCard(c, actLine(c), plain(c.nuvemTitulo || 'How the crew arrived today'), '', 'var(--cyan)')}${cloudPanel('')}<div class="panel center"><p class="muted">${LOOK}</p></div>`; // a nuvem das duas palavras, também no celular
      return cenaLook(faces, c.name, (c.pessoas || []).map(p => p.nome).join(', '));
    }
    if (c.kind === 'almanaque') return cenaLook(c, c.name, c.quem, l.pagina ? `📄 ${c.stats.entregues} deliveries · ${esc(c.stats.beneficiosTxt)} in benefits<br>${LOOK}` : l.mes >= 0 ? `📅 ${esc(c.meses[l.mes])} 2026<br>${LOOK}` : '');
    if (c.kind === 'visao') return cenaLook(c, plain(c.titulo), c.quem);
    if (c.kind === 'manifesto') return cenaLook(c, c.name, c.quem, `${esc(c.titulo)} <b style="color:var(--yellow)">${esc(c.pergunta)}</b><br>${LOOK}`);
    return cenaLook(c, plain(c.titulo || c.name), c.quem);
  }
  // Bloco de fala: o celular mostra o nome e o tema do bloco e fica quieto.
  function vStage() {
    const st = S.state.stage || {}, theme = (st.theme || '').trim();
    return `<div class="spacer"></div>
      ${logo(true, 'dim')}
      <div class="stage">
        <div class="kicker">${esc(theme ? st.title : 'On stage now')}</div><i class="st-arrow"></i>
        <div class="st-theme ${(theme || st.title || '').length > 22 ? 'long' : ''}"><span>${esc(theme || st.title || 'On stage')}</span></div>
        ${st.speaker ? `<p class="st-speaker">with ${esc(st.speaker)}</p>` : ''}
        <p class="muted">${esc(S.state.event.stageText || 'All eyes on the stage.')}</p>
      </div>
      <div class="spacer"></div>`;
  }

  // o logo do evento, no estilo do logo do filme
  const logo = (sm = false, cls = '') => `<div class="logo ${sm ? 'sm' : ''} ${cls}"><div class="l1">BACK TO THE</div><div class="l2">FUTURE</div><div class="bar"></div>${sm ? '' : '<div class="l3">TOWNHALL · 2026</div>'}</div>`;

  function vSplash() {
    return `<div class="spacer"></div>${logo()}
      <p class="muted center" style="margin-top:18px">CDIO HC + BPC · 2026 Townhall</p>
      <div class="spacer"></div>
      <button class="btn" data-action="start">⚡ Board the DeLorean</button>`;
  }
  function vPeopleList() {
    const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const q = norm(S.q.trim());
    if (!q) return `<p class="muted center plist-hint">Start typing your name and it will show up here.</p>`;
    // Só aparece quem tem o nome ou um sobrenome COMEÇANDO com o que foi digitado ("ni" acha Nicolas, não Vinicius).
    // Dá para digitar mais de uma palavra ("nico ku"): cada uma tem de ser o começo de uma palavra do nome.
    // Primeiro vêm os que batem pelo primeiro nome; quem já embarcou aparece marcado (para quem está voltando).
    const PART = ['de', 'da', 'do', 'das', 'dos', 'e'], toks = q.split(/\s+/).filter(Boolean);
    const rank = p => {
      const n = norm(p.name), words = n.split(/[\s-]+/).filter(Boolean), real = words.filter(w => !PART.includes(w));
      if (n.startsWith(q)) return 0;
      if (toks.length > 1) { const used = new Set(); return toks.every(tk => { const i = words.findIndex((w, k) => !used.has(k) && w.startsWith(tk)); if (i < 0) return false; used.add(i); return true; }) ? (words[0].startsWith(toks[0]) ? 0 : 1) : 9; }
      return real.some(w => w.startsWith(q)) ? 1 : 9;
    };
    const list = S.people.map(p => ({ p, r: rank(p) })).filter(x => x.r < 9).sort((a, b) => a.r - b.r || a.p.name.localeCompare(b.p.name)).map(x => x.p);
    if (!list.length) return `<p class="muted center plist-hint">No name found. Check the spelling or ask the host.</p>`;
    const shown = list.slice(0, 8);
    return shown.map(p => `<button class="pitem" data-action="pick" data-id="${p.id}">${av(p)}<div><div class="n">${esc(p.name)}</div>${p.checkedIn ? '<div class="m">already aboard · tap if this is you</div>' : ''}</div>${p.checkedIn ? '<span class="in">ABOARD</span>' : ''}</button>`).join('')
      + (list.length > shown.length ? `<p class="small center" style="padding-top:6px">Keep typing to find your name.</p>` : '');
  }
  function vIdentify() {
    return `${logo(true)}
      <h2>Who are you?</h2>
      <input class="input" id="q" placeholder="Type your name…" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="search">
      <div class="plist" id="plist">${vPeopleList()}</div>
      <div class="spacer"></div>
      <button class="linkbtn" data-action="back">← back</button>`;
  }
  // escolha do idioma das dinâmicas (o app é em inglês; Conexões, Reflexão e Sucesso são em português ou em espanhol)
  const langPick = () => `<div class="langpick"><div class="kicker">Language for the activities</div>
      <div class="seg">${Object.entries(LANGS).map(([k, l]) => `<button type="button" class="${S.lang === k ? 'on' : ''}" data-action="lang" data-lang="${k}">${l}</button>`).join('')}</div>
      <p class="small">The app is in English. The three activities on your phone (Connection, Reflection and Success) will be in ${LANGS[S.lang]}.</p></div>`;
  function vConfirm() {
    const p = S.pick;
    return `${logo(true)}
      <div class="panel glow match">
        <div class="who" style="display:flex;justify-content:center;margin:14px 0 8px">${av(p, 'xl')}</div>
        <div class="pname">${esc(p.name)}</div>
        ${p.checkedIn ? '<p class="small" style="margin-top:12px;color:var(--amber)">This name is already checked in on another phone. If it\'s you, go ahead.</p>' : ''}
      </div>
      <div class="panel">${langPick()}</div>
      <button class="btn" data-action="checkin">⚡ That's me, let's go</button>
      <button class="btn ghost" data-action="unpick">Not me</button>`;
  }
  function vLoading() { return `${logo()}<div class="wait"><div class="flux"><i></i><i></i><i></i><b></b></div><p class="muted">Syncing with the timeline…</p></div>`; }

  function vHeader() {
    const me = S.me.person;
    return `<div class="trip">${logo(true)}<div class="hdr"><button type="button" class="langchip" data-action="langToggle" title="Language for the activities: ${LANGS[S.lang]}" aria-label="Language for the activities: ${LANGS[S.lang]}. Tap to change."><b class="${S.lang === 'pt' ? 'on' : ''}">PT</b><b class="${S.lang === 'es' ? 'on' : ''}">ES</b></button><div class="small">${esc(first(me.name))}</div></div></div>`;
  }
  /* ---- "Duas palavras": a primeira tela depois do login ----
   * Os dois campos são os mostradores dos circuitos de tempo. As palavras de todo mundo formam a nuvem das boas-vindas. */
  function vWords() {
    const me = S.me.person, edit = S.wordsEdit;
    return `${logo(true)}
      <section class="tw">
        <div class="kicker">${edit ? 'TIME CIRCUITS · CHANGE YOUR WORDS' : 'FIRST STOP · BEFORE WE TAKE OFF'}</div>
        <h1 class="tw-title"><span>TWO</span><span>WORDS</span></h1>
        <p class="tw-q"><b>${esc(first(me.name))}</b>, how are you arriving at the Townhall today?</p>
        <div class="tw-circ">
          <label class="tc r"><span>WORD ONE</span><input class="led-in" id="w1" maxlength="20" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" enterkeyhint="next" placeholder="CURIOUS" ${S.wordsSending ? 'disabled' : ''}></label>
          <label class="tc g"><span>WORD TWO</span><input class="led-in" id="w2" maxlength="20" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" enterkeyhint="send" placeholder="GRATEFUL" ${S.wordsSending ? 'disabled' : ''}></label>
        </div>
        <p class="small center">Any language works. Your words join everyone else's in the word cloud on the big screen.</p>
        <button class="btn" data-action="sendWords" ${S.wordsSending ? 'disabled' : ''}>${S.wordsSending ? 'Sending…' : '⚡ Send to the future'}</button>
        <button class="linkbtn" data-action="${edit ? 'cancelWords' : 'skipWords'}">${edit ? '← keep my words' : 'skip for now'}</button>
      </section>`;
  }
  // a nuvem no celular: cada palavra no tamanho de quantas pessoas a escreveram; as minhas ficam marcadas
  function cloudHtml() {
    const w = (S.state && S.state.words) || { top: [] }, mine = new Set(((S.me && S.me.words) || []).map(x => x.toLocaleLowerCase()));
    if (!w.top.length) return '<p class="muted center wc-empty">Waiting for the first words…</p>';
    const max = Math.max(...w.top.map(x => x[1]));
    return w.top.slice(0, 70).sort((a, b) => hash(a[0]) % 97 - hash(b[0]) % 97)
      .map(([word, n]) => `<span class="${mine.has(word.toLocaleLowerCase()) ? 'me' : ''}" style="--s:${(max > 1 ? .85 + 1.15 * Math.sqrt(n / max) : 1.15).toFixed(2)};--c:${color(word)};--d:${(hash(word) % 40) / 10}s">${esc(word)}</span>`).join('');
  }
  const cloudPanel = (kicker = 'How the crew is arriving') => { const w = (S.state && S.state.words) || { count: 0 }; return `<div class="panel wc">${kicker ? `<div class="kicker">${kicker}</div>` : ''}<div class="wcloud" id="wcloud">${cloudHtml()}</div><p class="small center"><b id="wcN">${w.count}</b> travelers shared their two words</p></div>`; };
  function vWelcome() {
    const st = S.state, me = S.me.person, mine = S.me.words, w = st.words || {};
    return `${vHeader()}
      <div class="panel glow match">
        <div class="polaroids"><div class="polaroid"><div class="photo">${av(me)}</div><div class="cap">${esc(first(me.name))} · Hill Valley</div></div></div>
        <div class="pname">Welcome aboard, ${esc(first(me.name))}!</div>
        <p class="muted" style="margin-top:12px">${esc(st.event.welcomeText)}</p>
        ${mine ? `<div class="mywords"><small>YOUR TWO WORDS</small><b>${esc(mine.join(' · '))}</b>${w.open ? '<button type="button" class="linkbtn" data-action="editWords">change</button>' : ''}</div>` : w.open ? '<button type="button" class="btn ghost" data-action="editWords" style="margin-top:14px">⚡ Tell us your two words</button>' : ''}
      </div>
      ${w.live && (w.count || mine) ? cloudPanel() : ''}
      <div class="panel center">
        <div class="kicker">Aboard</div>
        <div class="big"><span id="count">${st.counts.checkedIn}</span><span style="font-size:18px;color:var(--muted)"> / ${st.counts.total}</span></div>
        ${carBox()}
      </div>
      <div class="spacer"></div>
      <button class="linkbtn" data-action="checkout">Not ${esc(first(me.name))}? Switch</button>`;
  }
  function vMessage() {
    const m = S.state.message;
    return `${vHeader()}<div class="panel glow msgbox"><div class="e">${esc(m.emoji || '📣')}</div><h2>${esc(m.title)}</h2><p>${linkify(m.body)}</p></div>`;
  }
  function vClosing() {
    const r = S.me.result;
    return `${vHeader()}
      <div class="panel glow msgbox"><div class="e">🕰️</div><h2>End of the journey</h2><p>${esc(S.state.event.closingText)}</p></div>
      ${r && r.match ? `<div class="panel center"><div class="kicker">Your connection</div><div class="polaroids"><div class="polaroid"><div class="photo">${av(r.match)}</div><div class="cap">${esc(first(r.match.name))}</div></div></div><div class="pname" style="font-size:18px">${esc(r.match.name)}</div></div>` : ''}`;
  }
  // Visão 2027: enquanto o Doc fala no telão, o celular pede para olhar para lá; depois, a mensagem fica no celular.
  const DOC_C = { d1: 'var(--cyan)', d2: 'var(--yellow)', d3: 'var(--magenta)', d4: 'var(--orange)' };
  function vDoc() {
    const d = S.state.doc || {}, m = d.message;
    if (d.phones && m) {
      return `${vHeader()}
        <section class="panel glow presentation-card" style="--c:var(--orange)"><div class="kicker">${esc(t('docMsg'))}</div><h1>${esc(m.titulo)}</h1></section>
        <div class="panel docm"><p>${esc(m.abertura)}</p></div>
        ${(m.blocos || []).map(b => `<div class="panel docm" style="--c:${DOC_C[b.id] || 'var(--cyan)'}"><div class="kicker">${b.id.slice(1).padStart(2, '0')} · ${esc(b.titulo)}</div><p>${esc(b.fala)}</p>${b.palavras && b.palavras.length ? `<div class="docw">${b.palavras.map(w => `<span>${esc(w)}</span>`).join('')}</div>` : ''}</div>`).join('')}
        <div class="panel docpaper"><b>${esc(t('gazette'))}</b>${(m.manchetes || []).map(h => `<span>${esc(h)}</span>`).join('')}</div>
        <div class="panel glow docm end"><p>${esc(m.encerramento)}</p><div class="docyear">2027</div></div>`;
    }
    return `<div class="spacer"></div>
      ${logo(true, 'dim')}
      <div class="standby">
        <div class="power">${d.play ? '👀' : '⚡'}</div>
        <div class="st-title">${esc(d.play ? t('lookBig') : t('docComing'))}</div>
        <p class="muted">${esc(d.play ? t('docArrived') : t('docSignal'))}</p>
        <div class="flux" style="margin:18px auto 0"><i></i><i></i><i></i><b></b></div>
      </div>
      <div class="spacer"></div>`;
  }
  function vStandby() {
    return `<div class="spacer"></div>
      ${logo(true, 'dim')}
      <div class="standby">
        <div class="power">📺</div>
        <div class="st-title">EYES ON THE BIG SCREEN</div>
        <p class="muted">${esc(S.state.event.standbyText || 'You don\'t need your phone right now.')}</p>
      </div>
      <div class="spacer"></div>`;
  }

  /* ---- Conexões (em português ou espanhol) ---- */
  function tripBar(round) {
    const era = roundEra(round);
    return `<div class="trip"><div class="t">${esc(t('trip'))} ${round}/3 · ${esc(era.label)} ${esc(era.year)}</div><div class="dots">${[1, 2, 3].map(i => `<i class="${i < round ? 'done' : i === round ? 'on' : ''}"></i>`).join('')}</div></div>`;
  }
  const countdown = (kind, label) => `<div class="cdbox" id="cdbox" data-kind="${kind}"><div class="countdown ${kind === 'matching' ? 'amber' : kind === 'ranking' ? 'green' : ''}" id="cd">--:--</div><div class="kicker" style="margin-top:8px">${esc(label)}</div><div class="ptag" id="pauseTag" style="display:none">${esc(t('pausedDoc'))}</div></div>`;
  function partnerCard(g, round) {
    const ps = g.partners, era = roundEra(round);
    const hints = ps.flatMap(p => (p.hints || []).slice(0, 3).map(h => ({ ...h, who: first(p.name) })));
    return `<div class="panel glow match">
      <div class="plate"><div class="st"><span>HILL VALLEY</span><span>${esc(era.year)}</span></div><div class="num">${esc(g.code)}</div><div class="sub">${esc(t('route'))} ${esc(g.code)}</div></div>
      <div class="polaroids">${ps.map(p => `<div class="polaroid"><div class="photo">${av(p)}</div><div class="cap">${esc(first(p.name))} · ${esc(era.year)}</div></div>`).join('')}</div>
      ${ps.map(p => `<div class="pname">${esc(p.name)}</div>`).join('<div style="height:6px"></div>')}
      ${hints.length ? `<div class="hints">${hints.map(h => `<div class="h"><b>${esc(h.who)} · ${esc(h.q)}</b>${esc(h.a)}</div>`).join('')}</div>` : ''}
    </div>`;
  }
  function gauge() {
    const cx = 125, cy = 112, R = 96;
    const ang = v => (-90 + (v / 88) * 180) * Math.PI / 180;
    const pt = (v, r) => ({ x: +(cx + r * Math.sin(ang(v))).toFixed(1), y: +(cy - r * Math.cos(ang(v))).toFixed(1) });
    const a0 = pt(0, R), a1 = pt(88, R);
    let ticks = '';
    for (let v = 0; v <= 88; v += 8) {
      const major = v % 16 === 0 || v === 88;
      const p1 = pt(v, R), p2 = pt(v, R - (major ? 12 : 7));
      ticks += `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="${v === 88 ? '#ffd21f' : '#bcaee0'}" stroke-width="${v === 88 ? 3 : 2}" stroke-linecap="round"/>`;
      if (v % 32 === 0 || v === 88) { const pl = pt(v, R - 26); ticks += `<text x="${pl.x}" y="${pl.y + 4}" text-anchor="middle" font-family="Orbitron" font-size="${v === 88 ? 13 : 10}" font-weight="900" fill="${v === 88 ? '#ffd21f' : '#bcaee0'}">${v}</text>`; }
    }
    const arc = `M ${a0.x} ${a0.y} A ${R} ${R} 0 0 1 ${a1.x} ${a1.y}`;
    return `<div class="gauge" id="gauge"><svg viewBox="0 0 250 162">
      <defs><linearGradient id="gg" x1="0" x2="1"><stop offset="0" stop-color="#2ee6d6"/><stop offset=".55" stop-color="#ffd21f"/><stop offset="1" stop-color="#ff2a00"/></linearGradient></defs>
      <path d="${arc}" fill="none" stroke="#2a1d55" stroke-width="10" stroke-linecap="round"/>
      <path id="gaugeArc" d="${arc}" fill="none" stroke="url(#gg)" stroke-width="10" stroke-linecap="round" pathLength="100" stroke-dasharray="0 100"/>
      ${ticks}
      <text x="125" y="96" text-anchor="middle" font-family="Orbitron" font-size="8" font-weight="700" fill="#bcaee0" letter-spacing="3">MPH</text>
      <g id="needle" class="needle"><line x1="125" y1="112" x2="125" y2="32" stroke="#ff3b30" stroke-width="4" stroke-linecap="round"/><circle cx="125" cy="112" r="8" fill="#1d1142" stroke="#bcaee0" stroke-width="2"/></g>
      <text id="clock" class="clocktext" x="125" y="154" text-anchor="middle">--:--</text>
    </svg></div>`;
  }
  function questionCard(g) {
    const q = g.queue[g.position];
    if (!q) return `<div class="question"><div class="ic">🛸</div><div class="k">${esc(t('noQ'))}</div><div class="q">${esc(t('noQBody'))}</div></div>`;
    // só a pergunta e a categoria dela: a tela não mostra quantas perguntas já foram nem quantas faltam
    // (a dupla vê a mesma pergunta, cada pessoa no idioma que escolheu)
    const cat = ((S.state.conn.cats || {})[q.cat]) || { icon: '⚡', label: '', color: '' }, label = S.lang === 'es' ? CAT_ES[q.cat] || cat.label : cat.label;
    return `<div class="question" id="qcard" ${cat.color ? `style="--qc:${esc(cat.color)}"` : ''}>
      <div class="ic">${esc(cat.icon || '⚡')}</div>
      ${label ? `<div class="k">${esc(label)}</div>` : ''}
      <div class="q">${esc(tx(q.text, q.es))}</div>
    </div>`;
  }
  function patchQuestion(animate) {
    const g = S.me && S.me.group; const box = $('#qbox'); if (!g || !box) return;
    if (animate || !$('#qcard') || $('#qcard').dataset.pos !== String(g.position)) {
      box.innerHTML = questionCard(g);
      const card = $('#qcard'); if (card) card.dataset.pos = String(g.position);
      const prev = $('#qprev'), next = $('#qnext');
      if (prev) prev.disabled = g.position <= 0;
      if (next) next.disabled = g.position >= g.queue.length - 1;
      if (animate) buzz(25);
    }
  }
  function patchRanking() {
    document.querySelectorAll('.rank').forEach(card => {
      const i = S.draft.indexOf(+card.dataset.round);
      card.classList.toggle('on', i >= 0);
      const pos = card.querySelector('.pos'); if (pos) pos.textContent = i >= 0 ? `${i + 1}º` : '—';
    });
    const btn = $('[data-action=submit]'); if (btn && S.me) btn.disabled = S.draft.length !== (S.me.conversations || []).length;
  }
  function vConnections() {
    const c = S.state.conn, g = S.me.group, r = c.round, tm = c.timer;
    const head = vHeader() + here();
    if (sitsOut('connections') && !(S.me.conversations || []).length && (!g || g.missing)) return `${vHeader()}${coordinating('connections')}`; // coordena as Conexões: sem dupla
    if (c.phase === 'idle' || c.phase === 'ready') {
      return `${head}
        <div class="panel"><div class="wait"><div class="flux"><i></i><i></i><i></i><b></b></div>
          <h2>${esc(t('prep'))}</h2>
        </div></div>`;
    }
    if (c.phase === 'matching' || c.phase === 'talk' || c.phase === 'roundEnd') {
      if (!g || g.missing) {
        return `${vHeader()}${tripBar(r)}
          <div class="panel glow msgbox"><div class="e">🧭</div><h2>${esc(t('offRoute'))}</h2><p>${esc(t('offRouteBody'))}</p></div>`;
      }
      if (c.phase === 'matching') {
        return `${vHeader()}${tripBar(r)}${partnerCard(g, r)}
          <div class="panel cyan center">
            ${tm && tm.kind === 'matching' ? countdown('matching', t('talkIn')) : `<div class="sync"><i></i> ${esc(t('waiting'))}</div>`}
            <p class="muted" style="margin-top:12px">${t('find', esc(g.partners.map(p => first(p.name)).join(` ${t('and')} `)), esc(g.code))}</p>
          </div>`;
      }
      if (c.phase === 'talk') {
        const ps = g.partners.map(p => first(p.name)).join(` ${t('and')} `);
        return `${vHeader()}${tripBar(r)}
          <div class="panel center">
            ${gauge()}
            <div class="kicker" style="margin-top:10px">${esc(t('with'))} ${esc(ps)}</div>
            <div class="ptag" id="pauseTag" style="display:none">${esc(t('paused'))}</div>
          </div>
          <div id="qbox">${questionCard(g)}</div>
          <div class="qnav">
            <button class="btn ghost prev" id="qprev" data-action="prev" ${g.position <= 0 ? 'disabled' : ''}>←</button>
            <button class="btn" id="qnext" data-action="next" ${g.position >= g.queue.length - 1 ? 'disabled' : ''}>${esc(t('next'))}</button>
          </div>`;
      }
      const last = r >= c.totalRounds;
      return `${vHeader()}${tripBar(r)}
        <div class="panel glow msgbox"><div class="e">⚡</div><h2>${esc(t('mph'))}</h2>
          ${tm && tm.kind === 'break' ? `<div style="margin-top:14px">${countdown('break', last ? t('rankIn') : t('nextTripIn'))}</div>` : `<div class="sync" style="margin-top:12px"><i></i> ${esc(t('waiting'))}</div>`}
        </div>`;
    }
    if (c.phase === 'ranking') return vRanking();
    if (c.phase === 'results') return vResults();
    return `${vHeader()}<div class="panel"><p class="muted">${esc(c.phase)}</p></div>`;
  }
  function vRanking() {
    const me = S.me, convs = me.conversations || [], tm = S.state.conn.timer;
    const sent = me.ranking && !S.editing;
    if (!convs.length) return `${vHeader()}<div class="panel glow msgbox"><div class="e">🧭</div><h2>${esc(t('noTrips'))}</h2><p>${esc(t('noTripsBody'))}</p></div>`;
    if (sent) {
      const order = convs.slice().sort((a, b) => me.ranking[a.round] - me.ranking[b.round]);
      return `${vHeader()}
        <div class="panel glow msgbox"><div class="e">📡</div><h2>${esc(t('rankSent'))}</h2><p class="small" id="rankProgress">${esc(t('ranked', S.state.conn.rankingDone, S.state.conn.rankingTotal))}</p>
          ${tm && tm.kind === 'ranking' ? `<div style="margin-top:14px">${countdown('ranking', t('resultIn'))}</div>` : ''}</div>
        <div class="panel">${order.map(cv => `<div class="ritem">${av(cv.partners[0] || me.person)}<div class="grow"><div class="nm">${me.ranking[cv.round]}º · ${esc(cv.partners.map(p => p.name).join(' & '))}</div></div></div>`).join('')}</div>
        <button class="btn ghost" data-action="edit">${esc(t('change'))}</button>`;
    }
    const pos = round => { const i = S.draft.indexOf(round); return i < 0 ? null : i + 1; };
    const done = S.draft.length === convs.length;
    return `${vHeader()}${here()}
      <div><h2>${esc(t('rankTitle'))}</h2><p class="muted">${esc(t('rankHow'))}</p></div>
      ${tm && tm.kind === 'ranking' ? countdown('ranking', t('rankCloses')) : ''}
      ${convs.map(cv => { const p = pos(cv.round), era = roundEra(cv.round); return `<button class="rank ${p ? 'on' : ''}" data-action="rank" data-round="${cv.round}"><div class="pos">${p ? p + 'º' : '—'}</div>${av(cv.partners[0] || me.person)}<div><div class="nm">${esc(cv.partners.map(x => x.name).join(' & '))}</div><div class="th">${esc(t('tripN', cv.round))} · ${esc(era.label)} ${esc(era.year)}</div></div></button>`; }).join('')}
      <div class="row"><button class="btn ghost" data-action="clear">${esc(t('redo'))}</button><button class="btn" data-action="submit" ${done ? '' : 'disabled'}>${esc(t('sendRank'))}</button></div>
      <p class="small center" id="rankProgress">${esc(t('ranked', S.state.conn.rankingDone, S.state.conn.rankingTotal))}</p>`;
  }
  function vResults() {
    const r = S.me.result;
    if (!r || !r.match) return `${vHeader()}<div class="panel glow msgbox"><div class="e">🛸</div><h2>${esc(t('noConn'))}</h2><p>${esc(t('talkHost'))}</p></div>`;
    const top = r.detail[0];
    const era = top ? roundEra(top.round) : null;
    return `${vHeader()}
      <div class="panel dest">
        <div class="kicker">${esc(t('yourConn'))}</div>
        <div class="polaroids"><div class="polaroid"><div class="photo">${av(r.match)}</div><div class="cap">${esc(first(r.match.name))} · ${era ? esc(era.year) : 'Hill Valley'}</div></div></div>
        <div class="pname">${esc(r.match.name)}</div>
        ${r.mutual ? `<div class="mutual">${esc(t('mutual'))}</div>` : ''}
        <p class="muted" style="margin-top:14px">${esc(t('coffee', first(r.match.name)))}</p>
      </div>`;
  }

  /* ---------------- timer ---------------- */
  function tick() {
    if (!S.state) return;
    const led = $('#ledNow'); if (led) led.textContent = ledNow();
    const osdNow = $('#osdNow'); if (osdNow) osdNow.textContent = ledNow();
    if (needWords()) return;
    const pr = currentPresentation();
    if (pr) { // dinâmica do Sucesso: prazo de recebimento e tempo de fala do sorteado
      const l = pr.live, st = $('#sucTimer');
      if (st && l) st.textContent = fmt(l.phase === 'run' && l.endsAt ? Math.max(0, Math.ceil((l.endsAt - serverNow()) / 1000)) : l.remainingSeconds || 0);
      const tt = $('#talkTimer'), talk = pr.draw && pr.draw.talk;
      if (tt && talk) { const left = talk.endsAt ? Math.max(0, Math.ceil((talk.endsAt - serverNow()) / 1000)) : talk.remaining; tt.textContent = fmt(left); tt.classList.toggle('hurry', !!talk.endsAt && left > 0 && left <= 30); }
      if (viewKey() !== S.lastKey) maybeRender();
      return;
    }
    const rf = currentReflexao();
    if (rf) { // Reflexão: prazo da votação
      const c = rf.cur, el = $('#rfTimer');
      if (el && c) el.textContent = fmt(c.phase === 'run' && c.endsAt ? Math.max(0, Math.ceil((c.endsAt - serverNow()) / 1000)) : c.remaining || 0);
      if (viewKey() !== S.lastKey) maybeRender();
      return;
    }
    const cn = currentCena();
    if (cn) { // cenas do deck: cronômetro do intervalo; o fim do prazo e a chegada aos 88 viram a tela sozinhos
      const cd = $('#ivCd'); if (cd && cn.kind === 'intervalo') cd.textContent = fmt(ivLeft(cn));
      if (!warp._hold && viewKey() !== S.lastKey) maybeRender();
      return;
    }
    const c = S.state.conn, tm = c.timer; if (!tm) return;
    const left = tm.paused ? tm.remaining : Math.max(0, Math.round((tm.endsAt - serverNow()) / 1000));
    const pt = $('#pauseTag'); if (pt) pt.style.display = tm.paused ? 'inline-block' : 'none';
    if (tm.kind === 'talk') {
      const clock = $('#clock'); if (clock) clock.textContent = fmt(left);
      const g = $('#gauge');
      if (g) {
        const frac = Math.min(1, Math.max(0, 1 - left / Math.max(1, tm.duration)));
        const needle = $('#needle'); if (needle) needle.style.transform = `rotate(${-90 + frac * 180}deg)`;
        const arc = $('#gaugeArc'); if (arc) arc.setAttribute('stroke-dasharray', `${(frac * 100).toFixed(1)} 100`);
        g.classList.toggle('hurry', !tm.paused && left <= Math.min(30, tm.duration * .25));
        g.classList.toggle('paused', !!tm.paused);
      }
      return;
    }
    const cd = $('#cd'), box = $('#cdbox');
    if (cd && box && box.dataset.kind === tm.kind) {
      cd.textContent = fmt(left);
      box.classList.toggle('hurry', !tm.paused && left <= 10);
      box.classList.toggle('paused', !!tm.paused);
    }
  }
  setInterval(tick, 500);

  /* ---------------- ações ---------------- */
  function setLang(l) { if (!LANGS[l]) return; S.lang = l; store.set('bttf.lang', l); }
  async function act(action, el) {
    try {
      switch (action) {
        case 'start': unlockAudio(); S.screen = 'identify'; S.q = ''; await loadPeople(); maybeRender(true); break;
        case 'back': S.screen = 'splash'; maybeRender(true); break;
        case 'lang': setLang(el.dataset.lang); maybeRender(true); break;
        case 'langToggle': setLang(S.lang === 'pt' ? 'es' : 'pt'); toast(t('langSet')); buzz(20); S.jump = false; maybeRender(true); break;
        case 'anotherAnswer': S.another = true; maybeRender(true); { const a = $('#ans'); if (a) a.focus(); } break;
        case 'sendAnswer': {
          const text = (S.answerDraft || '').trim();
          if (!text) { toast(t('tWrite'), true); const a = $('#ans'); if (a) a.focus(); break; }
          // reenvio do mesmo texto usa o mesmo identificador: o servidor não duplica a resposta
          if (!S.pendingAnswer || S.pendingAnswer.answer !== text) S.pendingAnswer = { answer: text, anonymous: !!S.anon, clientRequestId: uuid() };
          S.sending = true; maybeRender(true);
          try {
            const r = await api('/api/sucesso/answer', { token: S.token, ...S.pendingAnswer });
            S.pendingAnswer = null; S.answerDraft = ''; S.another = false; if (r.me) S.me = r.me;
            toast(r.duplicate ? t('tDup') : t('tSent')); buzz(60); beep('ok');
          } catch (e) {
            if (e.status && e.status < 500) S.pendingAnswer = null; // recusa confirmada pelo servidor: pode ajustar e enviar de novo
            toast(e.status ? e.message : t('tOffAns'), true);
          } finally { S.sending = false; maybeRender(true); }
          break;
        }
        case 'pickProject': { // marca o projeto sem redesenhar a lista (a rolagem fica onde está)
          S.rfPick = el.dataset.name; buzz(20);
          document.querySelectorAll('.rf-proj.on').forEach(x => x.classList.remove('on')); el.classList.add('on');
          const b = $('#rfSend'); if (b) b.disabled = false;
          break;
        }
        case 'sendVote': {
          if (!S.rfPick) { toast(t('tPick'), true); break; }
          S.rfSending = true; maybeRender(true);
          try {
            const r = await api('/api/reflexao/vote', { token: S.token, project: S.rfPick });
            S.rfPick = null; S.rfQ = ''; if (r.me) S.me = r.me;
            toast(t('tVoted')); buzz(60); beep('ok');
          } catch (e) { toast(e.status ? e.message : t('tOffVote'), true); }
          finally { S.rfSending = false; maybeRender(true); }
          break;
        }
        case 'tapCharge': { // cada toque soma energia no telão (o servidor limita a 12 por segundo por pessoa)
          const c = currentCena(); if (!c || !c.live) break;
          buzz(12); el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
          S.socket.emit('cena:tap', { token: S.token });
          break;
        }
        // --- duas palavras ---
        case 'sendWords': {
          const list = S.wordsDraft.map(w => String(w || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
          if (!list.length) { toast('Type at least one word.', true); const f = $('#w1'); if (f) f.focus(); break; }
          S.wordsSending = true; maybeRender(true);
          try {
            const r = await api('/api/words', { token: S.token, words: list });
            S.wordsSending = false; S.wordsEdit = false; S.wordsSkip = false; if (r.me) S.me = r.me;
            store.set('bttf.words', JSON.stringify((r.me && r.me.words) || list));
            buzz([40, 30, 90]); beep('result'); flashSky();
            // entra no app com uma viagem curta (não é troca de bloco: a tela nova já fica registrada)
            S.lastKey = viewKey(); const b = blockNow(); S.blk = b ? b.id : null;
            warp('WORDS RECEIVED ⚡\n\nWELCOME ABOARD', render, 1100);
          } catch (e) { S.wordsSending = false; toast(e.status ? e.message : 'No connection. Tap send again.', true); maybeRender(true); }
          break;
        }
        case 'skipWords': S.wordsSkip = true; maybeRender(true); break;
        case 'cancelWords': S.wordsEdit = false; maybeRender(true); break;
        case 'editWords': S.wordsEdit = true; S.wordsSkip = false; S.wordsDraft = [...((S.me && S.me.words) || []), '', ''].slice(0, 2); maybeRender(true); { const f = $('#w1'); if (f) f.focus(); } break;
        case 'pick': S.pick = S.people.find(p => p.id === +el.dataset.id) || null; maybeRender(true); break;
        case 'unpick': S.pick = null; maybeRender(true); break;
        case 'checkin': {
          unlockAudio(); el.disabled = true;
          const r = await api('/api/checkin', { personId: S.pick.id, token: S.token });
          saveToken(r.token); if (r.epoch) store.set('bttf.epoch', r.epoch); store.set('bttf.lang', S.lang);
          S.pick = null; S.q = ''; S.screen = 'app'; S.me = null; S.wordsSkip = false; S.wordsEdit = false; S.wordsDraft = ['', ''];
          maybeRender(true); hello(); toast(`Welcome aboard, ${first(r.person.name)}! ⚡`); buzz(60);
          break;
        }
        case 'checkout': {
          if (!confirm('Go back to the list and pick another name?')) break;
          el.disabled = true;
          await api('/api/checkout', { token: S.token });
          clearToken(); rememberMe(null); S.me = null; S.screen = 'identify'; S.q = ''; S.pick = null;
          await loadPeople(); maybeRender(true); hello(); toast('Check-in undone. Pick your name.');
          break;
        }
        case 'next': case 'prev': {
          el.disabled = true;
          const g = S.me && S.me.group;
          S.socket.emit('group:step', { dir: action === 'next' ? 1 : -1, from: g ? g.position : null, token: S.token }, res => {
            if (!res || !res.ok) { toast((res && res.error) || t('noServer'), true); el.disabled = false; return; }
            if (S.me && S.me.group && S.me.group.id === res.groupId && S.me.group.position !== res.position) { S.me.group.position = res.position; patchQuestion(true); }
            else if (S.me && S.me.group) patchQuestion(false), (el.disabled = false);
          });
          break;
        }
        case 'rank': {
          const r = +el.dataset.round, i = S.draft.indexOf(r);
          if (i >= 0) S.draft.splice(i, 1); else S.draft.push(r);
          buzz(20); patchRanking(); break;
        }
        case 'clear': S.draft = []; patchRanking(); break;
        case 'edit': S.editing = true; S.draft = S.me.conversations.slice().sort((a, b) => S.me.ranking[a.round] - S.me.ranking[b.round]).map(c => c.round); maybeRender(true); break;
        case 'submit': {
          const ranks = {}; S.draft.forEach((round, i) => { ranks[round] = i + 1; });
          el.disabled = true;
          S.socket.emit('ranking:submit', { ranks, token: S.token }, res => {
            if (!res || !res.ok) { toast((res && res.error) || t('noServer'), true); el.disabled = false; return; }
            S.editing = false; S.draft = []; toast(t('tRanked')); buzz(60); maybeRender(true);
          });
          break;
        }
      }
    } catch (e) { toast(e.message || String(e), true); if (el) el.disabled = false; }
  }
  document.addEventListener('click', e => { const el = e.target.closest('[data-action]'); if (el) act(el.dataset.action, el); });
  document.addEventListener('input', e => {
    if (e.target.id === 'q') { S.q = e.target.value; const l = $('#plist'); if (l) l.innerHTML = vPeopleList(); }
    if (e.target.id === 'ans') { S.answerDraft = e.target.value; countAnswer(); }
    if (e.target.id === 'rfQ') { S.rfQ = e.target.value; const l = $('#rfList'); if (l) l.innerHTML = vProjects(); }
    if (e.target.id === 'w1') S.wordsDraft[0] = e.target.value;
    if (e.target.id === 'w2') S.wordsDraft[1] = e.target.value;
  });
  // duas palavras: Enter no primeiro campo vai para o segundo; no segundo, envia
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'w1') { e.preventDefault(); const f = $('#w2'); if (f) f.focus(); }
    if (e.target.id === 'w2') { e.preventDefault(); e.target.blur(); act('sendWords', e.target); }
  });
  document.addEventListener('change', e => { if (e.target.id === 'anon') S.anon = e.target.checked; });
  // foto de perfil que não carregou: sai, e as iniciais que estavam por baixo aparecem
  document.addEventListener('error', e => { const el = e.target; if (el && el.tagName === 'IMG' && el.parentNode && el.parentNode.classList.contains('av')) { el.parentNode.classList.remove('ph'); el.remove(); } }, true);
  // o celular voltou: tela acesa de novo, aba de volta (inclusive pelo "voltar" do navegador), rede de volta
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
  window.addEventListener('pageshow', e => { if (e.persisted) wake(); });
  window.addEventListener('online', wake);
  window.addEventListener('focus', () => { if (S.socket && !S.socket.connected) wake(); });
  document.addEventListener('pointerdown', unlockAudio, { passive: true });
  document.addEventListener('touchstart', unlockAudio, { passive: true });
  setInterval(() => { if (Math.random() < .08) flashSky(); }, 6000);

  // fundo 3D: o mesmo céu e a mesma estrada do painel do Sucesso (mais leve no celular)
  if (window.Delorean3D) { Delorean3D.setFps(24); Delorean3D.background($('#bg3d'), { dprMax: 1, speed: 6 }); }
  render();
  connect();
})();
