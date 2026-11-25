/* ===== De Volta ao Futuro · app do participante ===== */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ini = n => String(n || '?').trim().split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const first = n => String(n || '').trim().split(/\s+/)[0] || '';
  const pad = n => String(n).padStart(2, '0');
  const fmt = s => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  const human = s => (s >= 60 ? `${Math.floor(s / 60)} min${s % 60 ? ` e ${s % 60} s` : ''}` : `${s} s`);
  const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  const PALETTE = ['#ff6a00', '#ff2d95', '#2ee6d6', '#39ff6a', '#ffd21f', '#b980ff', '#ff5c5c', '#5cffd6', '#ffa94d', '#7fb2ff', '#f58cff', '#a8ff5c'];
  const color = name => PALETTE[[...String(name || '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % PALETTE.length];
  // avatar: a foto de perfil por cima das iniciais (se a foto não carregar, ficam as iniciais)
  const av = (p, cls = '') => `<div class="av ${cls} ${p.photo ? 'ph' : ''}" style="--c:${color(p.name)}">${esc(ini(p.name))}${p.photo ? `<img src="${esc(p.photo)}" alt="" decoding="async">` : ''}</div>`;
  const ERA_KEYS = ['presente', 'passado', 'futuro'];
  // escapa o texto e depois transforma URLs em links (o href nasce do texto já escapado)
  const linkify = s => esc(s).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');

  const S = {
    token: localStorage.getItem('bttf.token') || null,
    screen: localStorage.getItem('bttf.token') ? 'app' : 'splash',
    state: null, me: null, people: [], pick: null, q: '', offset: 0, socket: null,
    draft: [], editing: false, lastKey: '', audio: null, offline: false, lock: null, jump: true,
    answerDraft: '', anon: false, another: false, sending: false, pendingAnswer: null, // resposta das dinâmicas do Sucesso
    rfProjects: null, rfRev: null, rfPick: null, rfQ: '', rfSending: false,             // Reflexão: lista de projetos e o voto em andamento
  };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)));
  // O nome do check-in vale para tudo: fica guardado para o formulário do Sucesso (/participar) também usar.
  function rememberMe(me) {
    try {
      if (me && me.person) { localStorage.setItem('bttf.name', me.person.name); localStorage.setItem('bttf.pid', String(me.person.id)); }
      else { localStorage.removeItem('bttf.name'); localStorage.removeItem('bttf.pid'); }
    } catch { /* sem armazenamento */ }
  }
  // Veio do QR do painel do Sucesso sem estar logado: depois do check-in, volta para lá.
  function nextPage() {
    const next = new URLSearchParams(location.search).get('next');
    return next && /^\/participar\/[0-9a-f-]{36}(\?d=d[1-4])?$/i.test(next) ? next : null;
  }

  /* ---------------- util ---------------- */
  const serverNow = () => Date.now() + S.offset;
  const ledNow = () => { const d = new Date(serverNow()); return `${MONTHS[d.getMonth()]} ${pad(d.getDate())} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const roundEra = r => (S.state && S.state.conn.eras[ERA_KEYS[(Math.max(1, r) - 1) % 3]]) || { label: '', year: '', led: '' };
  const osd = (mode = 'PLAY') => `<div class="osd"><span class="${mode === 'REC' ? 'rec' : ''}">${mode === 'REC' ? 'REC' : mode === 'PAUSE' ? '❚❚ PAUSE' : '▶ PLAY'}</span><span id="osdNow">${ledNow()}</span></div>`;
  function toast(msg, err) {
    const t = $('#toast'); t.textContent = msg; t.classList.toggle('err', !!err); t.classList.add('on');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 3200);
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
  async function wakeLock() {
    try {
      if (!('wakeLock' in navigator)) return;
      const want = S.screen === 'app' && S.state && S.me && S.state.block === 'connections' && ['matching', 'talk'].includes(S.state.conn.phase) && document.visibilityState === 'visible';
      if (want && !S.lock) { S.lock = await navigator.wakeLock.request('screen'); S.lock.addEventListener('release', () => { S.lock = null; }); }
      else if (!want && S.lock) { const l = S.lock; S.lock = null; await l.release(); }
    } catch { S.lock = null; }
  }
  function flashSky() { const f = $('#skyFlash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
  // Viagem no tempo: o velocímetro sobe até 88 MPH em "ms" (pelo relógio, para durar o mesmo em qualquer celular) e vem o clarão.
  function warp(msg, cb, ms = 950) {
    const w = $('#warp'); $('#warpMsg').textContent = msg || 'ACELERANDO...';
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

  /* ---------------- rede ---------------- */
  function connect() {
    S.socket = io({ transports: ['websocket', 'polling'], tryAllTransports: true });
    S.socket.on('connect', () => { setOffline(false); hello(); });
    S.socket.on('disconnect', () => { setOffline(true); });
    S.socket.io.on('reconnect_attempt', () => { setOffline(true); });
    S.socket.on('state', st => { S.state = st; S.offset = st.now - Date.now(); maybeRender(); });
    S.socket.on('me', me => {
      if (me === null && S.token) { // check-in desfeito, evento resetado ou outro aparelho assumiu este nome
        localStorage.removeItem('bttf.token'); rememberMe(null); S.token = null; S.me = null; S.screen = 'splash'; toast('Seu check-in foi encerrado pelo apresentador. Escolha seu nome de novo.', true); maybeRender(true); return;
      }
      S.me = me; if (me) rememberMe(me); maybeRender();
    });
    S.socket.on('group:update', ({ groupId, position }) => {
      if (S.me && S.me.group && S.me.group.id === groupId && S.me.group.position !== position) { S.me.group.position = position; patchQuestion(true); }
    });
    S.socket.on('notify', n => { toast(`${n.title || ''}${n.body ? ' · ' + n.body : ''}`); });
    // Reconhecimento: a carga do Flux Capacitor sobe com os toques de todo mundo
    S.socket.on('cena:pulse', p => { const c = currentCena(); if (c && p && p.kind === c.kind && c.live) { c.live.carga = p.carga; patchCharge(); } });
  }
  function hello() {
    S.socket.emit('hello', { token: S.token }, res => {
      S.offset = res.now - Date.now(); S.state = res.state;
      if (res.ok) { S.me = res.me; S.screen = 'app'; rememberMe(res.me); const next = nextPage(); if (next) { location.replace(next); return; } }
      else { S.me = null; rememberMe(null); if (S.token) { S.token = null; localStorage.removeItem('bttf.token'); } if (S.screen === 'app') S.screen = 'splash'; }
      maybeRender(true);
    });
  }
  async function api(path, body) {
    const r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || 'Erro de rede'), { status: r.status });
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
  // Cena do deck do townhall no ar (plano de voo, almanaque, reconhecimento, intervalo, estratégia 2027, 88 MPH…): a atenção é no telão
  function currentCena() {
    return (S.screen === 'app' && S.me && S.state && !currentPresentation() && S.state.block === 'cena' && S.state.cena) || null;
  }
  // Quem coordena um bloco faz o login (conta presença), mas não participa dele: nada de dupla, voto ou resposta.
  const sitsOut = block => !!(S.me && S.me.skip && S.me.skip[block]);
  const coordinating = what => `<div class="panel glow msgbox"><div class="e">🎬</div><h2>Você está na coordenação</h2><p>Você não participa ${what}. Acompanhe pelo telão.</p></div>`;
  function viewKey() {
    const pr = currentPresentation();
    if (pr) {
      const su = S.me.sucesso || {}, d = pr.draw;
      return ['presentation', pr.roomId, pr.activityId, sucPhase(pr), (pr.live && pr.live.roundId) || '', (su.answers || []).length, su.drawn ? 'eu' : '', d ? d.at : '', S.another ? 'outra' : '', S.pendingAnswer ? 'pend' : '', sitsOut('sucesso') ? 'fora' : ''].join('|');
    }
    const rf = currentReflexao();
    if (rf) {
      const c = rf.cur, mine = (S.me.reflexao && S.me.reflexao.votes) || [], d = c && c.top;
      return ['reflexao', rf.open === null ? 'menu' : rf.open, c ? rfPhase(c) : '', mine.filter(Boolean).length, d ? `${d.at}:${rfShown(d) ? 'ok' : 'suspense'}:${d.items.map(v => v.votes).join()}` : '', rf.rev, S.rfSending ? 'env' : '', S.rfProjects ? 'lista' : '', sitsOut('reflexao') ? 'fora' : ''].join('|');
    }
    const cn = currentCena();
    if (cn) { // o que muda a tela do celular em cada cena (o resto é atualizado por cima)
      const l = cn.live || {}, sub = cn.kind === 'reconhecimento' ? [l.fase, l.premio, l.passo, (l.feitos || []).join('.')].join(':') : cn.kind === 'intervalo' ? ivPhase(cn) : cn.kind === 'mph' ? (l.at ? (serverNow() - l.at >= MPH_MS ? 'chegou' : 'indo:' + l.at) : 'antes')
        : cn.kind === 'almanaque' ? `${l.mes}:${l.pagina ? 1 : 0}` : cn.kind === 'agenda' ? cn.itens.map(x => x.estado[0] || '-').join('') : '';
      let h = 0; const content = JSON.stringify([cn.titulo, cn.kicker, cn.itens && cn.kind === 'agenda' ? cn.itens : '', cn.texto, cn.frase, cn.pessoas, cn.quem, cn.pergunta, cn.chegada, cn.premios, S.me.person]); for (let i = 0; i < content.length; i++) h = (h * 31 + content.charCodeAt(i)) >>> 0;
      return ['cena', cn.kind, sub, h].join('|');
    }
    if (S.screen !== 'app' || !S.state) return `${S.screen}|${S.pick ? S.pick.id : ''}`;
    const c = S.state.conn, g = S.me && S.me.group, t = c.timer;
    const dc = S.state.doc || {}, docKey = S.state.block === 'doc' ? [dc.status, !!dc.play, dc.phones, dc.phones ? dc.rev : 0] : ''; // Visão 2027: espera, cena no telão, mensagem no celular
    const content = JSON.stringify([docKey, S.state.message, S.state.event, S.state.settings, S.state.block === 'stage' ? S.state.stage : '', S.me && S.me.person, S.me && S.me.skip, g && g.partners, g && g.code, g && g.queue && g.queue.length, S.me && S.me.conversations, S.me && S.me.ranking, S.me && S.me.result, t ? t.kind : '']);
    let h = 0; for (let i = 0; i < content.length; i++) h = (h * 31 + content.charCodeAt(i)) >>> 0;
    return ['app', S.state.block, c.phase, c.round, '', g ? g.id : '', g && g.missing ? 'miss' : '', S.me && S.me.ranking ? 'ranked' : '', S.editing ? 'edit' : '', S.me && S.me.result ? 'res' : '', h].join('|');
  }
  // O bloco que está no ar para este celular (depois do login). Quando ele muda, entra a transição
  // do filme: o velocímetro sobe até 88 MPH com o destino escrito embaixo. Avisos e "olhos no telão" entram direto.
  function blockNow() {
    if (S.screen !== 'app' || !S.me || !S.state) return null;
    const st = S.state, pr = currentPresentation(), i = st.step ? st.step.index : 0;
    if (pr) return { id: 'sucesso:' + pr.activityId, msg: `DESTINO: ${pr.title}` };
    if (st.reflexao) return { id: 'reflexao', msg: 'ABASTECENDO: 1,21 GIGAWATTS' };
    switch (st.block) {
      case 'stage': return { id: 'stage:' + i, msg: `PRÓXIMA PARADA: ${(st.stage && st.stage.title) || 'BLOCO'}` };
      case 'connections': return { id: 'connections', msg: 'RUMO ÀS CONEXÕES' };
      case 'closing': return { id: 'closing', msg: 'FIM DA VIAGEM · CONTINUA…' };
      case 'doc': return { id: 'doc', msg: 'DESTINO: 2027' };
      case 'cena': return st.cena ? { id: 'cena:' + st.cena.kind, msg: `DESTINO: ${st.cena.name}` } : { id: 'cena' };
      case 'message': return { id: 'message' };
      case 'standby': return { id: 'standby' };
      default: return { id: 'welcome', msg: 'CIRCUITOS DE TEMPO LIGADOS' };
    }
  }
  function maybeRender(force) {
    const k = viewKey();
    if (!force && k === S.lastKey) { patch(); return; }
    const prev = S.lastKey; S.lastKey = k;
    const p = prev.split('|'), n = k.split('|');
    const blk = blockNow(), moved = !!(prev && blk && blk.msg && S.blk && S.blk !== blk.id && S.state.settings.transitions !== false);
    S.blk = blk ? blk.id : null;
    // a transição de bloco não é interrompida por atualizações que chegam logo em seguida: a tela nova entra por baixo
    // dura o mesmo que a transição do telão (15 s por padrão), pedindo para a pessoa olhar para lá
    const secs = Number(S.state && S.state.settings.transitionSeconds) || 15, long = secs >= 7;
    const show = () => { if (!moved) return render(); warp._hold = true; warp(`${long ? '👀 OLHE PARA O TELÃO\n\n' : ''}${blk.msg.toUpperCase()}`, () => { warp._hold = false; render(); }, long ? secs * 1000 - 700 : 1500); };
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
          beep('ok'); buzz([80, 40, 80]); if (left > 900) return warp('ACELERANDO ATÉ 2027…', render, left);
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
    if (prev && quiet(p[1]) && n[1] && !quiet(n[1])) { beep('ok'); buzz([80, 40, 160]); flashSky(); }
    if (prev && enteringPhase('matching')) { beep('ok'); buzz([80, 40, 80]); return warp(`VIAGEM ${n[3]} · RUMO A ${roundEra(+n[3]).year}`, render); }
    if (prev && enteringPhase('ranking')) { beep('ok'); return warp('VOLTANDO PARA O PRESENTE...', render); }
    if (prev && enteringPhase('results')) { beep('result'); buzz([120, 60, 120, 60, 240]); return warp('CALCULANDO CONEXÕES...', render); }
    if (prev && enteringPhase('talk')) { beep('ok'); buzz(90); flashSky(); }
    if (prev && enteringPhase('roundEnd')) { beep('end'); buzz([200, 80, 200]); }
    show();
  }
  function render() {
    const app = $('#app');
    const presentation = currentPresentation(), reflexao = currentReflexao(), cena = currentCena();
    const typing = document.activeElement && document.activeElement.id === 'ans', searching = document.activeElement && document.activeElement.id === 'rfQ';
    if (presentation) app.innerHTML = vPresentation(presentation);
    else if (reflexao) app.innerHTML = vReflexao(reflexao);
    else if (cena) app.innerHTML = vCena(cena);
    else if (S.screen === 'splash') app.innerHTML = vSplash();
    else if (S.screen === 'identify') app.innerHTML = S.pick ? vConfirm() : vIdentify();
    else if (!S.state || !S.me) app.innerHTML = vLoading();
    else {
      const b = S.state.block;
      app.innerHTML = b === 'standby' ? vStandby() : b === 'stage' ? vStage() : b === 'welcome' ? vWelcome() : b === 'message' ? vMessage() : b === 'closing' ? vClosing() : b === 'doc' ? vDoc() : vConnections();
    }
    // "olhos no telão" e blocos de fala: tela calma, fundo parado
    const calm = !presentation && S.screen === 'app' && !!S.state && !!S.me && (['standby', 'stage'].includes(S.state.block) || (!!cena && CENA_CALM.includes(cena.kind)));
    document.body.classList.toggle('off', calm);
    if (window.Delorean3D) Delorean3D.pause(calm);
    const ans = $('#ans'); if (ans) { ans.value = S.answerDraft; countAnswer(); if (typing && !ans.disabled) { ans.focus(); ans.setSelectionRange(ans.value.length, ans.value.length); } }
    const rq = $('#rfQ'); if (rq) { rq.value = S.rfQ; if (searching) { rq.focus(); rq.setSelectionRange(rq.value.length, rq.value.length); } }
    if (reflexao) loadProjects(reflexao.rev);
    mountCar();
    wakeLock();
    if (S.jump !== false) window.scrollTo(0, 0);
    S.jump = true;
    if (S.screen === 'identify' && !S.pick) { const i = $('#q'); if (i) { i.value = S.q; i.focus(); } }
    tick();
  }
  function patch() {
    if (!S.state) return;
    const pr = currentPresentation();
    if (pr) { const n = $('#sucCount'); if (n && pr.live) n.textContent = pr.live.responseCount; return; }
    const rf = currentReflexao();
    if (rf) { const n = $('#rfCount'); if (n && rf.cur) n.textContent = rf.cur.votes; return; }
    if (currentCena()) { patchCharge(); return; }
    const c = $('#count'); if (c) { c.textContent = S.state.counts.checkedIn; setEnergy(S.state.counts.checkedIn / Math.max(1, S.state.counts.total), true); }
    const rp = $('#rankProgress'); if (rp) rp.textContent = `${S.state.conn.rankingDone} de ${S.state.conn.rankingTotal} viajantes já avaliaram`;
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
    const myAnswers = mine.length ? `<div class="panel"><div class="kicker">${mine.length > 1 ? 'Suas respostas' : 'Sua resposta'}</div>${mine.map(a => `<p class="myans">“${esc(a.answer)}”${a.anonymous ? ' <span class="small">· sem nome</span>' : ''}</p>`).join('')}</div>` : '';
    let body;
    if (su.drawn) {
      body = `<div class="panel glow drawn"><div class="kicker">Viajante sorteado</div><h2>É você, ${esc(first(me.name))}! ⚡</h2>
          <p class="myans">“${esc(su.drawnAnswer || '')}”</p>
          ${l.guide ? `<div class="guide">${l.guide.map(g => `<span>${esc(g)}</span>`).join('<i>→</i>')}</div>` : ''}
          <div class="countdown amber" id="talkTimer">--:--</div><div class="kicker" style="margin-top:8px">tempo de fala</div>
          <p class="muted" style="margin-top:10px">Conte para todo mundo. O telão está com você.</p></div>`;
    } else if (draw) {
      body = `<div class="panel center"><div class="kicker">Viajante sorteado</div><div class="pname" style="margin-top:8px">${esc(draw.name)}</div><p class="muted" style="margin-top:10px">Olhos no telão. 👀</p></div>${myAnswers}`;
    } else if (sitsOut('sucesso')) {
      body = coordinating('desta dinâmica');
    } else if (ph === 'run' && (!mine.length || S.another || S.pendingAnswer)) {
      body = `<div class="panel">
          <div class="who">Respondendo como <b>${esc(me.name)}</b></div>
          <textarea class="input" id="ans" maxlength="200" rows="4" placeholder="Compartilhe sua ideia…" ${S.sending ? 'disabled' : ''}></textarea>
          <div class="ansmeta">${timer}<span id="ansCount">0 / 200</span></div>
          ${l.nameRequired === false ? `<label class="sw"><input type="checkbox" id="anon" ${S.anon ? 'checked' : ''}> Enviar sem meu nome</label>` : ''}
          <button class="btn" data-action="sendAnswer" ${S.sending ? 'disabled' : ''}>${S.sending ? 'Enviando…' : S.pendingAnswer ? '↻ Tentar enviar de novo' : '⚡ Enviar resposta'}</button>
          <p class="small center" style="margin-top:8px">Sua resposta pode aparecer no telão.</p>
        </div>${myAnswers}`;
    } else if (ph === 'run') {
      body = `<div class="panel glow msgbox"><div class="e">📡</div><h2>Resposta enviada!</h2><div class="ansmeta" style="justify-content:center;margin-top:10px">${timer}</div></div>${myAnswers}
        <button class="btn ghost" data-action="anotherAnswer">Enviar outra resposta</button>`;
    } else if (ph === 'paused') {
      body = `<div class="panel center"><div class="ptag" style="display:inline-block">❚❚ RECEBIMENTO PAUSADO PELO DOC</div><div class="ansmeta" style="justify-content:center;margin-top:10px">${timer}</div></div>${myAnswers}`;
    } else if (ph === 'done') {
      body = `<div class="panel glow msgbox"><div class="e">🏁</div><h2>Recebimento encerrado</h2><p>Olhe para o telão.</p></div>${myAnswers}`;
    } else {
      body = `<div class="panel"><div class="wait"><div class="flux"><i></i><i></i><i></i><b></b></div><p class="muted">${ph === 'sync' ? 'Sincronizando com a linha do tempo…' : 'Aguarde: o Doc vai abrir o recebimento.'}</p></div></div>${myAnswers}`;
    }
    const card = `<section class="panel glow presentation-card" style="--c:${d.c}" aria-labelledby="liveTitle">
        <div class="kicker">DE VOLTA PARA O SUCESSO · DINÂMICA ${d.n}</div>
        <h1 id="liveTitle">${esc(p.title)}</h1>
        <p class="pq">${esc(p.question)}</p>
        ${l.responseCount !== undefined ? `<p class="small center" style="margin-top:10px"><b id="sucCount">${l.responseCount}</b> respostas recebidas</p>` : ''}
      </section>`;
    return su.drawn ? `${vHeader()}${body}${card}` : `${vHeader()}${card}${body}`; // sorteado(a): o aviso e o tempo de fala vêm primeiro
  }
  /* ---- Reflexão · Ato 1: O Combustível do Futuro ----
   * Menu das paradas e, com uma parada aberta, a votação: a pessoa escolhe 1 projeto da lista
   * (com busca) e envia. O nome é o do check-in; vale um voto por parada. */
  const rfPhase = c => (c.phase === 'run' && c.endsAt && c.endsAt <= serverNow() ? 'done' : c.phase);
  const rfShown = top => serverNow() - top.at > 6200; // o telão faz o suspense primeiro: o celular só mostra os nomes depois
  const rfNorm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  async function loadProjects(rev) {
    if (S.rfRev === rev) return; S.rfRev = rev;
    try { S.rfProjects = (await api('/api/reflexao/projects')).projects || []; } catch { S.rfRev = null; return; }
    const l = $('#rfList'); if (l) l.innerHTML = vProjects();
  }
  function vProjects() {
    if (!S.rfProjects) return '<p class="muted center" style="padding:14px">Carregando projetos…</p>';
    const q = rfNorm(S.rfQ), list = S.rfProjects.filter(x => !q || rfNorm(x.name + ' ' + x.owner).includes(q));
    return list.length ? list.map(x => `<button type="button" class="rf-proj ${S.rfPick === x.name ? 'on' : ''}" data-action="pickProject" data-name="${esc(x.name)}"><small>${esc(x.owner)}</small><span>${esc(x.name)}</span></button>`).join('')
      : '<p class="muted center" style="padding:14px">Nenhum projeto encontrado</p>';
  }
  function vReflexao(r) {
    const me = S.me.person, mine = (S.me.reflexao && S.me.reflexao.votes) || [];
    const head = (kicker, title, q, c, extra = '') => `<section class="panel glow presentation-card ${extra ? 'compact' : ''}" style="--c:${c}"><div class="kicker">${kicker}</div><h1>${esc(title)}</h1>${q ? `<p class="pq">${esc(q)}</p>` : ''}${extra}</section>`;
    if (r.open === null || !r.cur) {
      return `${vHeader()}${head('REFLEXÃO', r.title, r.subtitle, 'var(--yellow)')}
        <div class="panel"><div class="rf-list">${r.themes.map((t, i) => `<div class="rf-item ${mine[i] ? 'ok' : ''}" style="--c:${t.c}"><b>${t.n}</b><span>${esc(t.t)}<small>${mine[i] ? '✓ ' + esc(mine[i].project) : esc(t.q)}</small></span></div>`).join('')}</div>
        <p class="muted center" style="margin-top:12px">Aguarde: o Doc vai abrir a próxima parada.</p></div>`;
    }
    const c = r.cur, t = r.themes[r.open], ph = rfPhase(c), my = mine[r.open], d = c.top;
    const timer = '<span class="suc-timer">⏱ <b id="rfTimer">--:--</b></span>';
    const myVote = my ? `<div class="panel"><div class="kicker">Seu voto nesta parada</div><p class="myans">${esc(my.project)}</p><p class="small">${esc(my.owner)}</p></div>` : '';
    let body;
    if (d && !rfShown(d)) {
      body = `<div class="panel glow msgbox"><div class="e">🥁</div><h2>E os mais votados são…</h2><p>Olhos no telão. 👀</p></div>${myVote}`;
    } else if (d) {
      body = `<div class="panel glow"><div class="kicker">Projetos mais votados</div>${d.items.map((v, k) => `<div class="rf-drawn"><small>${k + 1}º MAIS VOTADO${v.votes === undefined ? '' : ` · ${v.votes} ${v.votes === 1 ? 'VOTO' : 'VOTOS'}`}</small><b>${esc(v.name)}</b><span>${esc(v.owner)}</span></div>`).join('')}</div>${myVote}`;
    } else if (sitsOut('reflexao')) {
      body = coordinating('da votação');
    } else if (ph === 'run' && !my) {
      body = `<div class="panel">
          <div class="who">Votando como <b>${esc(me.name)}</b></div>
          <div class="ansmeta" style="margin:8px 0">${timer}<span>Escolha 1 projeto</span></div>
          <input class="input" id="rfQ" placeholder="🔎 Buscar projeto ou responsável…" autocomplete="off" autocapitalize="off" spellcheck="false">
          <div class="rf-projects" id="rfList">${vProjects()}</div>
          <button class="btn" id="rfSend" data-action="sendVote" ${S.rfPick && !S.rfSending ? '' : 'disabled'}>${S.rfSending ? 'Enviando…' : '⚡ Enviar voto'}</button>
        </div>`;
    } else if (ph === 'run') {
      body = `<div class="panel glow msgbox"><div class="e">⚡</div><h2>Voto registrado!</h2><p>+energia para o Flux Capacitor</p><div class="ansmeta" style="justify-content:center;margin-top:10px">${timer}</div></div>${myVote}`;
    } else if (ph === 'paused') {
      body = `<div class="panel center"><div class="ptag" style="display:inline-block">❚❚ VOTAÇÃO PAUSADA PELO DOC</div><div class="ansmeta" style="justify-content:center;margin-top:10px">${timer}</div></div>${myVote}`;
    } else if (ph === 'done') {
      body = `<div class="panel glow msgbox"><div class="e">🏁</div><h2>Votação encerrada</h2><p>Olhe para o telão.</p></div>${myVote}`;
    } else {
      body = `<div class="panel"><div class="wait"><div class="flux"><i></i><i></i><i></i><b></b></div><p class="muted">Aguarde: o Doc vai abrir a votação.</p></div></div>${myVote}`;
    }
    return `${vHeader()}${head(`REFLEXÃO · PARADA ${t.n}`, t.t, t.q, t.c, `<p class="small center" style="margin-top:10px">Votos no Flux Capacitor: <b id="rfCount">${c.votes}</b></p>`)}${body}`;
  }
  /* ---- Cenas do deck do townhall ----
   * A atenção é no telão: o celular mostra onde o evento está (ato, tema, quem fala). Em algumas cenas ele participa:
   * a agenda completa, o cronômetro do intervalo, o botão que carrega o Flux Capacitor na cerimônia dos prêmios
   * (cada toque soma energia no telão), o vencedor de cada prêmio e a chegada a 2027. */
  const CENA_CALM = ['boasvindas', 'almanaque', 'ia', 'visao', 'manifesto'];
  const ACT_C = ['var(--cyan)', 'var(--orange)', 'var(--yellow)', 'var(--green)'];
  const MPH_MS = 6000;
  const plain = s => String(s ?? '').replace(/\*/g, '');
  const ivPhase = c => { const l = c.live; return l.phase === 'run' && l.endsAt && l.endsAt <= serverNow() ? 'done' : l.phase; };
  const ivLeft = c => { const l = c.live, ph = ivPhase(c); return ph === 'run' ? Math.max(0, Math.ceil((l.endsAt - serverNow()) / 1000)) : ph === 'done' ? 0 : l.remaining; };
  const actLine = c => (c.ato ? `${c.ato.n} · ${c.ato.nome}` : 'CDIO HC + BPC · TOWNHALL 2026');
  // tela calma, no estilo do logo: ato, título e quem fala
  const cenaLook = (c, title, who, note) => `<div class="spacer"></div>
      <div class="logo sm dim"><div class="l1">DE VOLTA AO</div><div class="l2">FUTURO</div><div class="bar"></div></div>
      <div class="stage">
        <div class="kicker">${esc(actLine(c))}</div><i class="st-arrow"></i>
        <div class="st-theme ${title.length > 22 ? 'long' : ''}"><span>${esc(title)}</span></div>
        ${who ? `<p class="st-speaker">com ${esc(who)}</p>` : ''}
        <p class="muted">${note || '👀 Olhe para o telão.'}</p>
      </div>
      <div class="spacer"></div>`;
  const cenaCard = (c, kicker, title, extra = '', color = 'var(--yellow)') => `<section class="panel glow presentation-card compact" style="--c:${color}"><div class="kicker">${esc(kicker)}</div><h1>${esc(title)}</h1>${extra}</section>`;
  function patchCharge() { // barra de carga do Flux Capacitor (cerimônia dos prêmios)
    const c = currentCena(), bar = $('#cgBar'); if (!c || !bar || !c.live) return;
    const v = Math.max(0, Math.min(1, c.live.carga || 0)); bar.style.width = (v * 100).toFixed(1) + '%';
    const n = $('#cgNum'); if (n) n.textContent = `${(v * 1.21).toFixed(2).replace('.', ',')} / 1,21 GW`;
  }
  function vCena(c) {
    const l = c.live || {};
    if (c.kind === 'agenda') {
      return `${vHeader()}${cenaCard(c, c.kicker, plain(c.titulo), `<p class="small center">${esc(c.data)} · ${esc(c.inicio)} – ${esc(c.fim)} · ${c.total} min</p>`, 'var(--cyan)')}
        ${c.atos.map((a, k) => `<div class="panel ag" style="--c:${ACT_C[k]}"><div class="ag-h"><b>${esc(a.n)} · ${esc(a.nome)}</b><span>${esc(a.de)} – ${esc(a.ate)}</span></div>
          ${c.itens.filter(x => x.ato === k + 1).map(x => `<div class="ag-it ${x.estado}"><b>${esc(x.hora)}</b><span>${esc(x.t)}<small>${esc(x.d)}</small></span><i>${x.estado === 'agora' ? 'NO AR' : x.estado === 'feito' ? '✓' : x.min + '′'}</i></div>`).join('')}</div>`).join('')}`;
    }
    if (c.kind === 'intervalo') {
      const ph = ivPhase(c), msg = { idle: 'O intervalo já vai começar.', run: 'Volte antes de o relógio zerar.', paused: '❚❚ Cronômetro pausado pelo Doc.', done: '⚡ A DeLorean está abastecida. Volte ao seu lugar!' }[ph];
      return `${vHeader()}${cenaCard(c, actLine(c), plain(c.titulo), '', 'var(--green)')}
        <div class="panel center"><div class="countdown green ${ph === 'done' ? 'hurry' : ''}" id="ivCd">${fmt(ivLeft(c))}</div><p class="muted" style="margin-top:12px">${esc(msg)}</p></div>
        <div class="panel"><p class="myans" style="margin-top:0">☕ ${esc(c.texto)}</p></div>`;
    }
    if (c.kind === 'mph') {
      const arrived = l.at && serverNow() - l.at >= MPH_MS;
      return arrived ? `${vHeader()}<div class="panel glow msgbox"><div class="e">🏁</div><h2>${esc(c.chegada)}</h2><p>${esc(c.depois)}</p><div class="docyear">2027</div></div>`
        : cenaLook(c, '88 MPH', '', l.at ? '⚡ Acelerando…' : `${esc(c.antes)}<br>👀 Olhe para o telão.`);
    }
    if (c.kind === 'reconhecimento') {
      const win = p => (p.vencedor === undefined ? null : p.indicados[p.vencedor]);
      if (l.fase === 'cerimonia' && c.premios[l.premio]) {
        const p = c.premios[l.premio], w = win(p), head = cenaCard(c, `O PRÊMIO 2026 DE ${p.k}`, p.n, l.passo === 'categoria' ? `<p class="small center">${esc(p.porque)}</p>` : '');
        if (l.passo === 'carga') return `${vHeader()}${head}
          <div class="panel glow center"><div class="kicker">FAÇAM BARULHO!</div><p class="muted">Cada toque carrega o Flux Capacitor do telão.</p>
            <button class="btn charge" data-action="tapCharge">⚡ CARREGAR</button>
            <div class="ebar" style="margin-top:14px"><i id="cgBar" style="width:${((l.carga || 0) * 100).toFixed(1)}%"></i></div><p class="small" id="cgNum" style="margin-top:6px"></p></div>`;
        if (l.passo === 'vencedor' && w) return `${vHeader()}${head}
          <div class="panel glow center"><div class="kicker">E O PRÊMIO VAI PARA…</div><div class="polaroids"><div class="polaroid"><div class="photo">${av({ name: w.nome, photo: (w.fotos || [])[0] })}</div><div class="cap">${esc(first(w.nome))} · 2026</div></div></div>
            <div class="pname">${esc(w.nome)}</div><p class="small" style="margin-top:6px;color:var(--cyan)">${esc(w.projeto)}</p><p class="myans">“${esc(p.citacao)}”</p></div>`;
        const list = l.passo === 'categoria' ? '' : `<div class="panel"><div class="kicker">Indicados</div>${p.indicados.map(x => `<div class="rf-drawn"><b>${esc(x.nome)}</b><span>${esc(x.projeto)}</span></div>`).join('')}</div>`;
        return `${vHeader()}${head}${list}<div class="panel center"><p class="muted">${l.passo === 'sorteio' ? '🥁 O raio vai cair… olhos no telão!' : '👀 Olhe para o telão.'}</p></div>`;
      }
      if (l.fase === 'premios' || l.fase === 'hall') {
        return `${vHeader()}${cenaCard(c, actLine(c), l.fase === 'hall' ? c.hallTitulo : plain(c.premiosTitulo))}
          <div class="panel"><div class="rf-list">${c.premios.map(p => { const w = p.feito && win(p); return `<div class="rf-item ${w ? 'ok' : ''}" style="--c:var(--yellow)"><b>${w ? '🏆' : '✉️'}</b><span>${esc(p.n)}<small>${w ? `${esc(w.nome)} · ${esc(w.projeto)}` : esc(p.k)}</small></span></div>`; }).join('')}</div></div>
          <div class="panel center"><p class="muted">👀 Olhe para o telão.</p></div>`;
      }
      return cenaLook(c, c.name, l.fase === 'tributo' ? c.fala : '', l.fase === 'tributo' ? '🎬 Tributo · olhe para o telão.' : '');
    }
    if (c.kind === 'boasvindas') return cenaLook(c, 'Boas-vindas', (c.pessoas || []).map(p => p.nome).join(', '));
    if (c.kind === 'almanaque') return cenaLook(c, 'Jornada 2026', c.quem, l.pagina ? `📄 ${c.stats.entregues} entregas · ${esc(c.stats.beneficiosTxt)} em benefícios<br>👀 Olhe para o telão.` : l.mes >= 0 ? `📅 ${esc(c.meses[l.mes])} de 2026<br>👀 Olhe para o telão.` : '');
    if (c.kind === 'visao') return cenaLook(c, plain(c.titulo), c.quem);
    if (c.kind === 'manifesto') return cenaLook(c, 'Manifesto 2027', c.quem, `${esc(c.titulo)} <b style="color:var(--yellow)">${esc(c.pergunta)}</b><br>👀 Olhe para o telão.`);
    return cenaLook(c, plain(c.titulo || c.name), c.quem);
  }
  // Bloco de fala: o celular mostra o nome e o tema do bloco e fica quieto.
  function vStage() {
    const st = S.state.stage || {}, theme = (st.theme || '').trim();
    return `<div class="spacer"></div>
      <div class="logo sm dim"><div class="l1">DE VOLTA AO</div><div class="l2">FUTURO</div><div class="bar"></div></div>
      <div class="stage">
        <div class="kicker">${esc(theme ? st.title : 'No palco agora')}</div><i class="st-arrow"></i>
        <div class="st-theme ${(theme || st.title || '').length > 22 ? 'long' : ''}"><span>${esc(theme || st.title || 'Bloco')}</span></div>
        ${st.speaker ? `<p class="st-speaker">com ${esc(st.speaker)}</p>` : ''}
        <p class="muted">${esc(S.state.event.stageText || 'Agora a atenção é no palco.')}</p>
      </div>
      <div class="spacer"></div>`;
  }

  const logo = (sm = false) => `<div class="logo ${sm ? 'sm' : ''}"><div class="l1">DE VOLTA AO</div><div class="l2">FUTURO</div><div class="bar"></div>${sm ? '' : '<div class="l3">TOWNHALL · 1985</div>'}</div>`;

  function vSplash() {
    return `<div class="spacer"></div>${logo()}
      <p class="muted center" style="margin-top:18px">CDIO HC + BPC · Townhall 2026</p>
      <div class="spacer"></div>
      <button class="btn" data-action="start">⚡ Embarcar na DeLorean</button>`;
  }
  function vPeopleList() {
    const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const q = norm(S.q.trim());
    if (!q) return `<p class="muted center plist-hint">Comece a digitar o seu nome para ele aparecer aqui.</p>`;
    // primeiro quem começa com o que foi digitado; quem já embarcou aparece marcado (para quem está voltando)
    const rank = p => { const n = norm(p.name); return n.startsWith(q) ? 0 : n.split(/\s+/).some(w => w.startsWith(q)) ? 1 : n.includes(q) ? 2 : 9; };
    const list = S.people.map(p => ({ p, r: rank(p) })).filter(x => x.r < 9).sort((a, b) => a.r - b.r || a.p.name.localeCompare(b.p.name)).map(x => x.p);
    if (!list.length) return `<p class="muted center plist-hint">Nenhum nome encontrado. Confira a grafia ou procure o apresentador.</p>`;
    const shown = list.slice(0, 8);
    return shown.map(p => `<button class="pitem" data-action="pick" data-id="${p.id}">${av(p)}<div><div class="n">${esc(p.name)}</div>${p.checkedIn ? '<div class="m">já embarcou · toque se for você</div>' : ''}</div>${p.checkedIn ? '<span class="in">A BORDO</span>' : ''}</button>`).join('')
      + (list.length > shown.length ? `<p class="small center" style="padding-top:6px">Continue digitando para achar o seu nome.</p>` : '');
  }
  function vIdentify() {
    return `${logo(true)}
      <h2>Quem é você?</h2>
      <input class="input" id="q" placeholder="Digite seu nome…" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="search">
      <div class="plist" id="plist">${vPeopleList()}</div>
      <div class="spacer"></div>
      <button class="linkbtn" data-action="back">← voltar</button>`;
  }
  function vConfirm() {
    const p = S.pick;
    return `${logo(true)}
      <div class="panel glow match">
        <div class="who" style="display:flex;justify-content:center;margin:14px 0 8px">${av(p, 'xl')}</div>
        <div class="pname">${esc(p.name)}</div>
        ${p.checkedIn ? '<p class="small" style="margin-top:12px;color:var(--amber)">Nome já escolhido em outro celular. Se é você, pode entrar.</p>' : ''}
      </div>
      <button class="btn" data-action="checkin">⚡ Sou eu, embarcar</button>
      <button class="btn ghost" data-action="unpick">Não sou eu</button>`;
  }
  function vLoading() { return `${logo()}<div class="wait"><div class="flux"><i></i><i></i><i></i><b></b></div><p class="muted">Sincronizando com a linha do tempo…</p></div>`; }

  function vHeader() {
    const me = S.me.person;
    return `<div class="trip">${logo(true)}<div class="small">${esc(first(me.name))}</div></div>`;
  }
  function vWelcome() {
    const st = S.state, me = S.me.person;
    return `${vHeader()}
      <div class="panel glow match">
        <div class="polaroids"><div class="polaroid"><div class="photo">${av(me)}</div><div class="cap">${esc(first(me.name))} · Hill Valley</div></div></div>
        <div class="pname">Bem-vindo(a), ${esc(first(me.name))}!</div>
        <p class="muted" style="margin-top:12px">${esc(st.event.welcomeText)}</p>
      </div>
      <div class="panel center">
        <div class="kicker">A bordo</div>
        <div class="big"><span id="count">${st.counts.checkedIn}</span><span style="font-size:18px;color:var(--muted)"> / ${st.counts.total}</span></div>
        ${carBox()}
      </div>
      <div class="spacer"></div>
      <button class="linkbtn" data-action="checkout">Não sou ${esc(first(me.name))} · trocar</button>`;
  }
  function vMessage() {
    const m = S.state.message;
    return `${vHeader()}<div class="panel glow msgbox"><div class="e">${esc(m.emoji || '📣')}</div><h2>${esc(m.title)}</h2><p>${linkify(m.body)}</p></div>`;
  }
  function vClosing() {
    const r = S.me.result;
    return `${vHeader()}
      <div class="panel glow msgbox"><div class="e">🕰️</div><h2>Fim da viagem</h2><p>${esc(S.state.event.closingText)}</p></div>
      ${r && r.match ? `<div class="panel center"><div class="kicker">Sua conexão</div><div class="polaroids"><div class="polaroid"><div class="photo">${av(r.match)}</div><div class="cap">${esc(first(r.match.name))}</div></div></div><div class="pname" style="font-size:18px">${esc(r.match.name)}</div></div>` : ''}`;
  }
  // Visão 2027: enquanto o Doc fala no telão, o celular pede para olhar para lá; depois, a mensagem fica no celular.
  const DOC_C = { d1: 'var(--cyan)', d2: 'var(--yellow)', d3: 'var(--magenta)', d4: 'var(--orange)' };
  function vDoc() {
    const d = S.state.doc || {}, m = d.message;
    if (d.phones && m) {
      return `${vHeader()}
        <section class="panel glow presentation-card" style="--c:var(--orange)"><div class="kicker">MENSAGEM DO DOC · DIRETO DE 2027</div><h1>${esc(m.titulo)}</h1></section>
        <div class="panel docm"><p>${esc(m.abertura)}</p></div>
        ${(m.blocos || []).map(b => `<div class="panel docm" style="--c:${DOC_C[b.id] || 'var(--cyan)'}"><div class="kicker">${b.id.slice(1).padStart(2, '0')} · ${esc(b.titulo)}</div><p>${esc(b.fala)}</p>${b.palavras && b.palavras.length ? `<div class="docw">${b.palavras.map(w => `<span>${esc(w)}</span>`).join('')}</div>` : ''}</div>`).join('')}
        <div class="panel docpaper"><b>GAZETA DO FUTURO · 1º DE JANEIRO DE 2027</b>${(m.manchetes || []).map(h => `<span>${esc(h)}</span>`).join('')}</div>
        <div class="panel glow docm end"><p>${esc(m.encerramento)}</p><div class="docyear">2027</div></div>`;
    }
    return `<div class="spacer"></div>
      <div class="logo sm dim"><div class="l1">DE VOLTA AO</div><div class="l2">FUTURO</div><div class="bar"></div></div>
      <div class="standby">
        <div class="power">${d.play ? '👀' : '⚡'}</div>
        <div class="st-title">${d.play ? 'OLHE PARA O TELÃO' : 'O DOC ESTÁ CHEGANDO'}</div>
        <p class="muted">${d.play ? 'O Doc acabou de chegar de 2027 com uma mensagem para vocês.' : 'Um sinal vindo de 2027 está chegando ao telão.'}</p>
        <div class="flux" style="margin:18px auto 0"><i></i><i></i><i></i><b></b></div>
      </div>
      <div class="spacer"></div>`;
  }
  function vStandby() {
    const me = S.me.person;
    return `<div class="spacer"></div>
      <div class="logo sm dim"><div class="l1">DE VOLTA AO</div><div class="l2">FUTURO</div><div class="bar"></div></div>
      <div class="standby">
        <div class="power">📺</div>
        <div class="st-title">OLHOS NO TELÃO</div>
        <p class="muted">${esc(S.state.event.standbyText || 'Agora você não precisa do celular.')}</p>
      </div>
      <div class="spacer"></div>`;
  }

  function circuits(round) {
    const era = roundEra(round), prev = round > 1 ? roundEra(round - 1) : null;
    return `<div class="circuits">
      <div class="tc r"><label>DESTINO</label><div class="led">${esc(era.led)}</div></div>
      <div class="tc g"><label>PRESENTE</label><div class="led" id="ledNow">${ledNow()}</div></div>
      <div class="tc a"><label>ÚLTIMA PARTIDA</label><div class="led">${prev ? esc(prev.led) : '--- -- ---- --:--'}</div></div>
    </div>`;
  }
  function tripBar(round) {
    const era = roundEra(round);
    return `<div class="trip"><div class="t">VIAGEM ${round}/3 · ${esc(era.label)} ${esc(era.year)}</div><div class="dots">${[1, 2, 3].map(i => `<i class="${i < round ? 'done' : i === round ? 'on' : ''}"></i>`).join('')}</div></div>`;
  }
  const countdown = (kind, label) => `<div class="cdbox" id="cdbox" data-kind="${kind}"><div class="countdown ${kind === 'matching' ? 'amber' : kind === 'ranking' ? 'green' : ''}" id="cd">--:--</div><div class="kicker" style="margin-top:8px">${esc(label)}</div><div class="ptag" id="pauseTag" style="display:none">❚❚ PAUSADO PELO DOC</div></div>`;
  function partnerCard(g, round) {
    const ps = g.partners, era = roundEra(round);
    const hints = ps.flatMap(p => (p.hints || []).slice(0, 3).map(h => ({ ...h, who: first(p.name) })));
    return `<div class="panel glow match">
      <div class="plate"><div class="st"><span>HILL VALLEY</span><span>${esc(era.year)}</span></div><div class="num">${esc(g.code)}</div><div class="sub">OUTATIME · ROTA ${esc(g.code)}</div></div>
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
  function questionCard(g, round) {
    const q = g.queue[g.position];
    if (!q) return `<div class="question"><div class="ic">🛸</div><div class="k">SEM PERGUNTAS</div><div class="q">O banco de perguntas está vazio. Conversem livremente!</div></div>`;
    // só a pergunta e a categoria dela: a tela não mostra quantas perguntas já foram nem quantas faltam
    const cat = ((S.state.conn.cats || {})[q.cat]) || { icon: '⚡', label: '', color: '' };
    return `<div class="question" id="qcard" ${cat.color ? `style="--qc:${esc(cat.color)}"` : ''}>
      <div class="ic">${esc(cat.icon || '⚡')}</div>
      ${cat.label ? `<div class="k">${esc(cat.label)}</div>` : ''}
      <div class="q">${esc(q.text)}</div>
    </div>`;
  }
  function patchQuestion(animate) {
    const g = S.me && S.me.group; const box = $('#qbox'); if (!g || !box) return;
    if (animate || !$('#qcard') || $('#qcard').dataset.pos !== String(g.position)) {
      box.innerHTML = questionCard(g, S.state.conn.round);
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
    const c = S.state.conn, g = S.me.group, r = c.round, t = c.timer;
    const head = vHeader();
    if (sitsOut('connections') && !(S.me.conversations || []).length && (!g || g.missing)) return `${head}${coordinating('das duplas deste bloco')}`; // coordena as Conexões: sem dupla
    if (c.phase === 'idle' || c.phase === 'ready') {
      return `${head}
        <div class="panel"><div class="wait"><div class="flux"><i></i><i></i><i></i><b></b></div>
          <h2>Preparando as viagens</h2>
        </div></div>`;
    }
    if (c.phase === 'matching' || c.phase === 'talk' || c.phase === 'roundEnd') {
      if (!g || g.missing) {
        return `${head}${tripBar(r)}
          <div class="panel glow msgbox"><div class="e">🧭</div><h2>Fora da rota</h2><p>Você entrou depois do sorteio. Fale com o apresentador.</p></div>`;
      }
      if (c.phase === 'matching') {
        return `${head}${tripBar(r)}${partnerCard(g, r)}
          <div class="panel cyan center">
            ${t && t.kind === 'matching' ? countdown('matching', 'a conversa começa em') : '<div class="sync"><i></i> aguardando</div>'}
            <p class="muted" style="margin-top:12px">Encontre ${esc(g.partners.map(p => first(p.name)).join(' e '))} pela placa <b style="color:var(--txt)">${esc(g.code)}</b>.</p>
          </div>`;
      }
      if (c.phase === 'talk') {
        const ps = g.partners.map(p => first(p.name)).join(' e ');
        return `${head}${tripBar(r)}
          <div class="panel center">
            ${gauge()}
            <div class="kicker" style="margin-top:10px">com ${esc(ps)}</div>
            <div class="ptag" id="pauseTag" style="display:none">❚❚ PAUSADO</div>
          </div>
          <div id="qbox">${questionCard(g, r)}</div>
          <div class="qnav">
            <button class="btn ghost prev" id="qprev" data-action="prev" ${g.position <= 0 ? 'disabled' : ''}>←</button>
            <button class="btn" id="qnext" data-action="next" ${g.position >= g.queue.length - 1 ? 'disabled' : ''}>Próxima →</button>
          </div>`;
      }
      const last = r >= c.totalRounds;
      return `${head}${tripBar(r)}
        <div class="panel glow msgbox"><div class="e">⚡</div><h2>88 MPH atingidos!</h2>
          ${t && t.kind === 'break' ? `<div style="margin-top:14px">${countdown('break', last ? 'avaliação em' : 'próxima viagem em')}</div>` : '<div class="sync" style="margin-top:12px"><i></i> aguardando</div>'}
        </div>`;
    }
    if (c.phase === 'ranking') return vRanking();
    if (c.phase === 'results') return vResults();
    return `${head}<div class="panel"><p class="muted">Estado desconhecido: ${esc(c.phase)}</p></div>`;
  }
  function vRanking() {
    const me = S.me, convs = me.conversations || [], t = S.state.conn.timer;
    const sent = me.ranking && !S.editing;
    if (!convs.length) return `${vHeader()}<div class="panel glow msgbox"><div class="e">🧭</div><h2>Sem viagens registradas</h2><p>Você não participou das rodadas, então não há conversas para avaliar.</p></div>`;
    if (sent) {
      const order = convs.slice().sort((a, b) => me.ranking[a.round] - me.ranking[b.round]);
      return `${vHeader()}
        <div class="panel glow msgbox"><div class="e">📡</div><h2>Avaliação enviada!</h2><p class="small" id="rankProgress">${S.state.conn.rankingDone} de ${S.state.conn.rankingTotal} já avaliaram</p>
          ${t && t.kind === 'ranking' ? `<div style="margin-top:14px">${countdown('ranking', 'resultado em')}</div>` : ''}</div>
        <div class="panel">${order.map(cv => `<div class="ritem">${av(cv.partners[0] || me.person)}<div class="grow"><div class="nm">${me.ranking[cv.round]}º · ${esc(cv.partners.map(p => p.name).join(' & '))}</div></div></div>`).join('')}</div>
        <button class="btn ghost" data-action="edit">Alterar ordem</button>`;
    }
    const pos = round => { const i = S.draft.indexOf(round); return i < 0 ? null : i + 1; };
    const done = S.draft.length === convs.length;
    return `${vHeader()}
      <div><h2>Avalie as conversas</h2><p class="muted">Toque na ordem: primeiro a melhor.</p></div>
      ${t && t.kind === 'ranking' ? countdown('ranking', 'a avaliação fecha em') : ''}
      ${convs.map(cv => { const p = pos(cv.round); return `<button class="rank ${p ? 'on' : ''}" data-action="rank" data-round="${cv.round}"><div class="pos">${p ? p + 'º' : '—'}</div>${av(cv.partners[0] || me.person)}<div><div class="nm">${esc(cv.partners.map(x => x.name).join(' & '))}</div><div class="th">Viagem ${cv.round} · ${esc(cv.era.label)} ${esc(cv.era.year)}</div></div></button>`; }).join('')}
      <div class="row"><button class="btn ghost" data-action="clear">Refazer</button><button class="btn" data-action="submit" ${done ? '' : 'disabled'}>Enviar ⚡</button></div>
      <p class="small center" id="rankProgress">${S.state.conn.rankingDone} de ${S.state.conn.rankingTotal} já avaliaram</p>`;
  }
  function vResults() {
    const r = S.me.result;
    if (!r || !r.match) return `${vHeader()}<div class="panel glow msgbox"><div class="e">🛸</div><h2>Sem conexão</h2><p>Fale com o apresentador.</p></div>`;
    const top = r.detail[0];
    const era = top ? roundEra(top.round) : null;
    return `${vHeader()}
      <div class="panel dest">
        <div class="kicker">Sua conexão do futuro</div>
        <div class="polaroids"><div class="polaroid"><div class="photo">${av(r.match)}</div><div class="cap">${esc(first(r.match.name))} · ${era ? esc(era.year) : 'Hill Valley'}</div></div></div>
        <div class="pname">${esc(r.match.name)}</div>
        ${r.mutual ? '<div class="mutual">⚡ CONEXÃO MÚTUA</div>' : ''}
        <p class="muted" style="margin-top:14px">Marque um café com ${esc(first(r.match.name))}. ☕</p>
      </div>`;
  }

  /* ---------------- timer ---------------- */
  function tick() {
    if (!S.state) return;
    const led = $('#ledNow'); if (led) led.textContent = ledNow();
    const osdNow = $('#osdNow'); if (osdNow) osdNow.textContent = ledNow();
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
    const c = S.state.conn, t = c.timer; if (!t) return;
    const left = t.paused ? t.remaining : Math.max(0, Math.round((t.endsAt - serverNow()) / 1000));
    const pt = $('#pauseTag'); if (pt) pt.style.display = t.paused ? 'inline-block' : 'none';
    if (t.kind === 'talk') {
      const clock = $('#clock'); if (clock) clock.textContent = fmt(left);
      const g = $('#gauge');
      if (g) {
        const frac = Math.min(1, Math.max(0, 1 - left / Math.max(1, t.duration)));
        const needle = $('#needle'); if (needle) needle.style.transform = `rotate(${-90 + frac * 180}deg)`;
        const arc = $('#gaugeArc'); if (arc) arc.setAttribute('stroke-dasharray', `${(frac * 100).toFixed(1)} 100`);
        g.classList.toggle('hurry', !t.paused && left <= Math.min(30, t.duration * .25));
        g.classList.toggle('paused', !!t.paused);
      }
      return;
    }
    const cd = $('#cd'), box = $('#cdbox');
    if (cd && box && box.dataset.kind === t.kind) {
      cd.textContent = fmt(left);
      box.classList.toggle('hurry', !t.paused && left <= 10);
      box.classList.toggle('paused', !!t.paused);
    }
  }
  setInterval(tick, 500);

  /* ---------------- ações ---------------- */
  async function act(action, el) {
    try {
      switch (action) {
        case 'start': unlockAudio(); S.screen = 'identify'; S.q = ''; await loadPeople(); maybeRender(true); break;
        case 'back': S.screen = 'splash'; maybeRender(true); break;
        case 'anotherAnswer': S.another = true; maybeRender(true); { const a = $('#ans'); if (a) a.focus(); } break;
        case 'sendAnswer': {
          const text = (S.answerDraft || '').trim();
          if (!text) { toast('Escreva sua resposta antes de enviar.', true); const a = $('#ans'); if (a) a.focus(); break; }
          // reenvio do mesmo texto usa o mesmo identificador: o servidor não duplica a resposta
          if (!S.pendingAnswer || S.pendingAnswer.answer !== text) S.pendingAnswer = { answer: text, anonymous: !!S.anon, clientRequestId: uuid() };
          S.sending = true; maybeRender(true);
          try {
            const r = await api('/api/sucesso/answer', { token: S.token, ...S.pendingAnswer });
            S.pendingAnswer = null; S.answerDraft = ''; S.another = false; if (r.me) S.me = r.me;
            toast(r.duplicate ? 'Envio confirmado! Sua resposta já está no telão.' : 'Resposta enviada! ⚡'); buzz(60); beep('ok');
          } catch (e) {
            if (e.status && e.status < 500) S.pendingAnswer = null; // recusa confirmada pelo servidor: pode ajustar e enviar de novo
            toast(e.status ? e.message : 'Sem conexão. Sua resposta está guardada: toque para tentar de novo.', true);
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
          if (!S.rfPick) { toast('Escolha um projeto antes de enviar.', true); break; }
          S.rfSending = true; maybeRender(true);
          try {
            const r = await api('/api/reflexao/vote', { token: S.token, project: S.rfPick });
            S.rfPick = null; S.rfQ = ''; if (r.me) S.me = r.me;
            toast('Voto registrado! ⚡'); buzz(60); beep('ok');
          } catch (e) { toast(e.status ? e.message : 'Sem conexão. Toque em enviar de novo.', true); }
          finally { S.rfSending = false; maybeRender(true); }
          break;
        }
        case 'tapCharge': { // cada toque soma energia no telão (o servidor limita a 12 por segundo por pessoa)
          const c = currentCena(); if (!c || !c.live) break;
          buzz(12); el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
          S.socket.emit('cena:tap', { token: S.token });
          break;
        }
        case 'pick': S.pick = S.people.find(p => p.id === +el.dataset.id) || null; maybeRender(true); break;
        case 'unpick': S.pick = null; maybeRender(true); break;
        case 'checkin': {
          unlockAudio(); el.disabled = true;
          const r = await api('/api/checkin', { personId: S.pick.id, token: S.token });
          S.token = r.token; localStorage.setItem('bttf.token', r.token); S.pick = null; S.q = ''; S.screen = 'app'; S.me = null;
          maybeRender(true); hello(); toast(`Bem-vindo(a) a bordo, ${first(r.person.name)}! ⚡`); buzz(60);
          break;
        }
        case 'checkout': {
          if (!confirm('Voltar para a lista e escolher outro nome?')) break;
          el.disabled = true;
          await api('/api/checkout', { token: S.token });
          localStorage.removeItem('bttf.token'); rememberMe(null); S.token = null; S.me = null; S.screen = 'identify'; S.q = ''; S.pick = null;
          await loadPeople(); maybeRender(true); hello(); toast('Check-in desfeito. Escolha o seu nome.');
          break;
        }
        case 'next': case 'prev': {
          el.disabled = true;
          const g = S.me && S.me.group;
          S.socket.emit('group:step', { dir: action === 'next' ? 1 : -1, from: g ? g.position : null, token: S.token }, res => {
            if (!res || !res.ok) { toast((res && res.error) || 'Sem resposta do servidor', true); el.disabled = false; return; }
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
            if (!res || !res.ok) { toast((res && res.error) || 'Sem resposta do servidor', true); el.disabled = false; return; }
            S.editing = false; S.draft = []; toast('Avaliação enviada! ⚡'); buzz(60); maybeRender(true);
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
  });
  document.addEventListener('change', e => { if (e.target.id === 'anon') S.anon = e.target.checked; });
  // foto de perfil que não carregou: sai, e as iniciais que estavam por baixo aparecem
  document.addEventListener('error', e => { const t = e.target; if (t && t.tagName === 'IMG' && t.parentNode && t.parentNode.classList.contains('av')) { t.parentNode.classList.remove('ph'); t.remove(); } }, true);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (S.socket && S.socket.connected) hello(); wakeLock(); unlockAudio(); } });
  document.addEventListener('pointerdown', unlockAudio, { passive: true });
  document.addEventListener('touchstart', unlockAudio, { passive: true });
  setInterval(() => { if (Math.random() < .08) flashSky(); }, 6000);

  // fundo 3D: o mesmo céu e a mesma estrada do painel do Sucesso (mais leve no celular)
  if (window.Delorean3D) { Delorean3D.setFps(24); Delorean3D.background($('#bg3d'), { dprMax: 1, speed: 6 }); }
  render();
  connect();
})();
