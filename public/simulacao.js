/* ===== De Volta ao Futuro · simulação da avaliação (ranking) das Conexões =====
 * Abre o app do viajante de verdade (o mesmo app.js, sem nenhuma alteração) já no momento da
 * avaliação: Nicolas acabou de fazer as três viagens, com Luciano, Monserrat e William, e agora
 * coloca as conversas em ordem. Serve para ensaiar ou gravar a tela do celular.
 *
 * Nada aqui fala com o servidor: um "servidor de mentira" responde dentro da própria página.
 * Nenhum dado é gravado, o evento de verdade não é tocado e o login real deste celular continua
 * como estava (o app recebe um armazenamento separado, só em memória).
 *
 * Opções na URL:
 *   ?intro=1     começa no fim da 3ª viagem ("88 MPH atingidos!") e viaja até a avaliação
 *   ?espera=6    segundos entre enviar a avaliação e o resultado aparecer
 *   ?tempo=120   segundos do cronômetro da avaliação
 * Para repetir, recarregue a página.
 */
(() => {
  const qs = new URLSearchParams(location.search);
  const num = (key, def, min, max) => { const v = Number(qs.get(key)); return qs.get(key) && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def; };
  const INTRO = qs.get('intro') === '1';
  const WAIT = num('espera', 6, 1, 60), RANK_SECONDS = num('tempo', 120, 10, 900), BREAK_SECONDS = 6;

  /* ---------------- elenco e viagens ---------------- */
  const ERAS = {
    presente: { key: 'presente', label: 'PRESENTE', year: '1985', led: 'OUT 26 1985 01:21', icon: '⚡', tagline: 'Hill Valley, 1985 · quem você é hoje' },
    passado: { key: 'passado', label: 'PASSADO', year: '1955', led: 'NOV 05 1955 06:00', icon: '🕰️', tagline: 'Hill Valley, 1955 · de onde você veio' },
    futuro: { key: 'futuro', label: 'FUTURO', year: '2015', led: 'OUT 21 2015 16:29', icon: '🛹', tagline: 'Hill Valley, 2015 · para onde você vai' },
  };
  const ERA_OF_ROUND = { 1: 'presente', 2: 'passado', 3: 'futuro' };
  const NICOLAS = { id: 20, name: 'Nicolas Kuhnast' }, LUCIANO = { id: 11, name: 'Luciano Barbosa' };
  const MONSERRAT = { id: 18, name: 'Monserrat Diaz' }, WILLIAM = { id: 17, name: 'William Manganeli' };
  const PEOPLE = [NICOLAS, LUCIANO, MONSERRAT, WILLIAM], byId = Object.fromEntries(PEOPLE.map(p => [p.id, p]));
  // Quatro pessoas, três viagens: todo mundo conversa com todo mundo.
  const GROUPS = [
    { round: 1, members: [NICOLAS.id, LUCIANO.id] }, { round: 1, members: [MONSERRAT.id, WILLIAM.id] },
    { round: 2, members: [NICOLAS.id, MONSERRAT.id] }, { round: 2, members: [LUCIANO.id, WILLIAM.id] },
    { round: 3, members: [NICOLAS.id, WILLIAM.id] }, { round: 3, members: [LUCIANO.id, MONSERRAT.id] },
  ];
  // Avaliação dos outros três (viagem → posição). Cada um põe a conversa com o Nicolas em 1º,
  // então a conexão dele sai com quem ele colocar em 1º, e sai mútua.
  const BOT_RANKS = { [LUCIANO.id]: { 1: 1, 2: 2, 3: 3 }, [MONSERRAT.id]: { 2: 1, 1: 2, 3: 3 }, [WILLIAM.id]: { 3: 1, 1: 2, 2: 3 } };

  /* ---------------- servidor de mentira ---------------- */
  const sim = { phase: 'idle', timer: null, rankings: {}, results: null, resultsAt: null, startedAt: new Date().toISOString() };
  const waiting = new Set(Object.keys(BOT_RANKS).map(Number)); // quem ainda não avaliou
  let timerHandle = null, botHandles = [], listeners = () => {};
  const clone = v => JSON.parse(JSON.stringify(v));
  const partnerOf = round => byId[GROUPS.find(g => g.round === round && g.members.includes(NICOLAS.id)).members.find(id => id !== NICOLAS.id)];

  function publicState() {
    return clone({
      event: { name: 'Townhall · De Volta ao Futuro', agenda: [], welcomeText: 'Aguarde: a viagem começa em breve.', closingText: 'Obrigado por viajar com a gente. Marque aquele café com a sua conexão!', standbyText: 'Agora você não precisa do celular.', stageText: 'Agora a atenção é no palco.' },
      block: 'connections',
      message: { title: 'Intervalo', body: 'Voltamos em 15 minutos.', emoji: '☕' },
      counts: { checkedIn: PEOPLE.length, total: PEOPLE.length },
      conn: {
        phase: sim.phase, round: 3, totalRounds: 3, played: 3, era: ERAS.futuro, eras: ERAS, timer: sim.timer, worstLevel: null,
        generatedAt: sim.startedAt, resultsAt: sim.resultsAt, rankingDone: Object.keys(sim.rankings).length, rankingTotal: PEOPLE.length,
        mutualPairs: [], mutualCount: sim.results ? Object.values(sim.results).filter(r => r.mutual).length / 2 : 0,
      },
      screen: { scene: 'auto' }, presentation: null, reflexao: null,
      stage: { title: 'Bloco', theme: '', speaker: '' }, step: { index: 1, count: 11 },
      audio: { mode: 'off', volume: 60, out: 'telao', beeps: true, musicUrl: '', ambientUrl: '' },
      settings: { roundSeconds: 240, findSeconds: 60, breakSeconds: BREAK_SECONDS, rankingSeconds: RANK_SECONDS, autoFlow: true, showFormHints: true, transitions: true, transitionSeconds: 15 },
      now: Date.now(),
    });
  }
  function meState() {
    const res = sim.results && sim.results[NICOLAS.id];
    return clone({
      person: { ...NICOLAS, checkedInAt: sim.startedAt },
      group: sim.phase === 'roundEnd' ? { id: 5, round: 3, code: '01', partners: [partnerOf(3)], queue: [], position: 0 } : null,
      conversations: [1, 2, 3].map(round => ({ round, era: ERAS[ERA_OF_ROUND[round]], partners: [partnerOf(round)] })),
      ranking: sim.rankings[NICOLAS.id] || null,
      result: sim.phase === 'results' && res ? { match: byId[res.match], mutual: !!res.mutual, score: res.score, detail: res.detail.map(d => ({ ...d, partner: byId[d.id] })) } : null,
      skip: { connections: false, reflexao: false, sucesso: false },
    });
  }
  const push = () => { listeners('state', publicState()); listeners('me', meState()); };

  function startTimer(kind, seconds, onEnd) {
    clearTimeout(timerHandle);
    sim.timer = { kind, startedAt: Date.now(), endsAt: Date.now() + seconds * 1000, duration: seconds, paused: false, remaining: null };
    timerHandle = setTimeout(onEnd, seconds * 1000);
  }
  // Os outros viajantes avaliam aos poucos: o contador "N de 4 já avaliaram" anda sozinho.
  function botRanks(id) {
    if (sim.phase !== 'ranking' || !waiting.delete(id)) return;
    sim.rankings[id] = BOT_RANKS[id];
    if (Object.keys(sim.rankings).length === PEOPLE.length) computeResults(); else push();
  }
  const holdBots = () => { botHandles.forEach(clearTimeout); botHandles = []; };
  const scheduleBot = (id, seconds) => botHandles.push(setTimeout(() => botRanks(id), seconds * 1000));
  function openRanking() {
    sim.phase = 'ranking';
    startTimer('ranking', RANK_SECONDS, computeResults); // acabou o tempo: fecha com as avaliações que chegaram
    scheduleBot(LUCIANO.id, Math.min(5, RANK_SECONDS * .2)); scheduleBot(MONSERRAT.id, Math.min(12, RANK_SECONDS * .45));
    push();
  }
  function submitRanking(ranks) {
    if (sim.phase !== 'ranking') throw new Error('A avaliação não está aberta.');
    const mine = {};
    for (const round of [1, 2, 3]) mine[round] = Number(ranks && ranks[round]);
    if (Object.values(mine).slice().sort().join() !== '1,2,3') throw new Error('Coloque as conversas em ordem, sem repetir posições.');
    sim.rankings[NICOLAS.id] = mine;
    // quem falta avalia dentro da espera: o último fecha a avaliação e o resultado aparece
    holdBots();
    [...waiting].forEach((id, i, all) => scheduleBot(id, WAIT * (i + 1) / all.length));
    push();
  }
  // Mesma conta do servidor (server/results.js): 1º = 3 pts, 2º = 2 pts, 3º = 1 pt; vale a soma do par.
  function computeResults() {
    if (sim.phase !== 'ranking') return;
    clearTimeout(timerHandle); holdBots();
    const POINTS = { 1: 3, 2: 2, 3: 1 }, pts = (from, round) => POINTS[(sim.rankings[from] || {})[round]] || 0, out = {};
    for (const p of PEOPLE) {
      const list = GROUPS.filter(g => g.members.includes(p.id)).map(g => {
        const id = g.members.find(m => m !== p.id), mine = pts(p.id, g.round), theirs = pts(id, g.round);
        return { id, round: g.round, mine, theirs, score: mine + theirs };
      }).sort((a, b) => b.score - a.score || b.theirs - a.theirs || b.mine - a.mine || Math.random() - .5);
      out[p.id] = { match: list[0].id, score: list[0].score, detail: list, mutual: 0 };
    }
    for (const p of PEOPLE) if (out[out[p.id].match].match === p.id) out[p.id].mutual = 1;
    sim.results = out; sim.phase = 'results'; sim.timer = null; sim.resultsAt = new Date().toISOString();
    push();
  }
  // "Alterar ordem": a avaliação não fecha enquanto a pessoa está mexendo de novo.
  document.addEventListener('click', e => { if (e.target.closest('[data-action=edit]')) holdBots(); }, true);

  /* ---------------- o que o app enxerga: socket, fetch e armazenamento ---------------- */
  function io() {
    const handlers = {};
    listeners = (event, ...args) => (handlers[event] || []).forEach(fn => fn(...args));
    const socket = {
      connected: false,
      io: { on() {} },
      on(event, fn) { (handlers[event] = handlers[event] || []).push(fn); return socket; },
      emit(event, payload, ack) {
        setTimeout(() => {
          const reply = v => { if (typeof ack === 'function') ack(v); };
          try {
            if (event === 'hello') reply({ ok: true, state: publicState(), me: meState(), now: Date.now() });
            else if (event === 'ranking:submit') { submitRanking(payload && payload.ranks); reply({ ok: true }); }
            else if (event === 'time') reply({ now: Date.now() });
            else reply({ ok: false, error: 'Indisponível na simulação.' });
          } catch (err) { reply({ ok: false, error: err.message }); }
        }, 40);
        return socket;
      },
    };
    setTimeout(() => {
      if (INTRO) { sim.phase = 'roundEnd'; startTimer('break', BREAK_SECONDS, openRanking); } else openRanking();
      socket.connected = true; listeners('connect');
    }, 60);
    return socket;
  }
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const fakeFetch = (url, opts) => (/^\/api\//.test(new URL(url, location.href).pathname) ? Promise.resolve(json(404, { error: 'Indisponível na simulação.' })) : fetch(url, opts));
  const mem = { 'bttf.token': 'simulacao' }; // já entra logado como Nicolas
  const storage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };

  /* ---------------- liga o app de verdade ---------------- */
  // O app.js roda como está; só os três nomes acima (io, fetch, localStorage) chegam trocados.
  const load = window.__SIM_APP__ // versão em arquivo único: o app.js já vem embutido como função
    ? Promise.resolve(window.__SIM_APP__)
    : fetch('app.js', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('app.js não encontrado'); return r.text(); })
      .then(code => new Function('io', 'fetch', 'localStorage', `${code}\n//# sourceURL=app.js`));
  load.then(app => app(io, fakeFetch, storage)).catch(err => {
    console.error(err);
    document.getElementById('app').innerHTML = '<div class="panel"><p class="muted">Não foi possível abrir a simulação. Recarregue a página.</p></div>';
  });
})();
