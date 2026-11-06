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
  const PALETTE = ['#ff7a1a', '#ff2d95', '#35d6ff', '#3dff7a', '#ffd000', '#b980ff', '#ff5c5c', '#5cffd6', '#ffa94d', '#7fb2ff', '#f58cff', '#a8ff5c'];
  const FIXED = { Consumer: '#ffd000', 'Customer Development': '#3dff7a', 'Focus Market': '#ff2d95', Strategy: '#35d6ff', 'Make (Business Ops)': '#ff7a1a', 'Tax Reform': '#b980ff', Cybersecurity: '#5cffd6', Architecture: '#ffa94d', Diretora: '#ff5c5c' };
  const color = area => FIXED[area] || PALETTE[[...String(area || '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % PALETTE.length];
  const av = (p, cls = '') => `<div class="av ${cls}" style="--c:${color(p.area)}">${esc(ini(p.name))}</div>`;
  const tags = p => `<span class="tag area" style="--c:${color(p.area)}">${esc(p.area || '—')}</span> <span class="tag">${esc(p.wl || '—')}</span>`;
  const ERA_KEYS = ['presente', 'passado', 'futuro'];

  const S = {
    token: localStorage.getItem('bttf.token') || null,
    screen: localStorage.getItem('bttf.token') ? 'app' : 'splash',
    state: null, me: null, people: [], pick: null, q: '', offset: 0, socket: null,
    draft: [], editing: false, lastKey: '', audio: null, offline: false,
  };

  /* ---------------- util ---------------- */
  const serverNow = () => Date.now() + S.offset;
  const ledNow = () => { const d = new Date(serverNow()); return `${MONTHS[d.getMonth()]} ${pad(d.getDate())} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const roundEra = r => (S.state && S.state.conn.eras[ERA_KEYS[(Math.max(1, r) - 1) % 3]]) || { label: '', year: '', led: '' };
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
  function flashSky() { const f = $('#skyFlash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
  function warp(msg, cb) {
    const w = $('#warp'); $('#warpMsg').textContent = msg || 'ACELERANDO...';
    w.classList.remove('go'); w.classList.add('on'); w.setAttribute('aria-hidden', 'false');
    let v = 0; clearInterval(warp._t);
    warp._t = setInterval(() => {
      v = Math.min(88, v + 4); $('#warpSpeed').textContent = v;
      if (v >= 88) {
        clearInterval(warp._t); void w.offsetWidth; w.classList.add('go'); buzz([60, 40, 120]);
        setTimeout(() => { cb && cb(); }, 320);
        setTimeout(() => { w.classList.remove('on', 'go'); w.setAttribute('aria-hidden', 'true'); $('#warpSpeed').textContent = '0'; }, 700);
      }
    }, 42);
  }
  function webNotify(n) {
    try {
      if (document.visibilityState === 'visible') return;
      if ('Notification' in window && Notification.permission === 'granted') new Notification(n.title || 'De Volta ao Futuro', { body: n.body || '', tag: 'bttf' });
    } catch { /* ignora */ }
  }

  /* ---------------- rede ---------------- */
  function connect() {
    S.socket = io({ transports: ['websocket', 'polling'] });
    S.socket.on('connect', () => { S.offline = false; hello(); });
    S.socket.on('disconnect', () => { S.offline = true; });
    S.socket.on('state', st => { S.state = st; S.offset = st.now - Date.now(); maybeRender(); });
    S.socket.on('me', me => { S.me = me; maybeRender(); });
    S.socket.on('group:update', ({ groupId, position }) => {
      if (S.me && S.me.group && S.me.group.id === groupId && S.me.group.position !== position) { S.me.group.position = position; patchQuestion(true); }
    });
    S.socket.on('notify', n => { toast(`${n.title || ''}${n.body ? ' · ' + n.body : ''}`); webNotify(n); });
  }
  function hello() {
    S.socket.emit('hello', { token: S.token }, res => {
      S.offset = res.now - Date.now(); S.state = res.state;
      if (res.ok) { S.me = res.me; S.screen = 'app'; }
      else { S.me = null; if (S.token) { S.token = null; localStorage.removeItem('bttf.token'); } if (S.screen === 'app') S.screen = 'splash'; }
      maybeRender(true);
    });
  }
  async function api(path, body) {
    const r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Erro de rede');
    return j;
  }
  async function loadPeople() { try { S.people = await api('/api/people'); S.peopleAt = Date.now(); } catch (e) { toast(e.message, true); } }
  function refreshPeopleSoon() {
    if (S.screen !== 'identify' || S.pick || Date.now() - (S.peopleAt || 0) < 4000) return;
    S.peopleAt = Date.now();
    loadPeople().then(() => { const l = $('#plist'); if (l) l.innerHTML = vPeopleList(); });
  }

  /* ---------------- render ---------------- */
  function viewKey() {
    if (S.screen !== 'app' || !S.state) return `${S.screen}|${S.pick ? S.pick.id : ''}`;
    const c = S.state.conn, g = S.me && S.me.group;
    const paused = c.talk ? c.talk.paused : '';
    return ['app', S.state.block, c.phase, c.round, paused, g ? g.id : '', g && g.missing ? 'miss' : '', S.me && S.me.ranking ? 'ranked' : '', S.editing ? 'edit' : '', S.me && S.me.result ? 'res' : ''].join('|');
  }
  function maybeRender(force) {
    const k = viewKey();
    if (!force && k === S.lastKey) { patch(); return; }
    const prev = S.lastKey; S.lastKey = k;
    const p = prev.split('|'), n = k.split('|');
    const enteringPhase = ph => n[0] === 'app' && n[1] === 'connections' && n[2] === ph && !(p[1] === 'connections' && p[2] === ph && p[3] === n[3]);
    if (prev && enteringPhase('matching')) { beep('ok'); buzz([80, 40, 80]); return warp(`VIAGEM ${n[3]} · RUMO A ${roundEra(+n[3]).year}`, render); }
    if (prev && enteringPhase('ranking')) { beep('ok'); return warp('VOLTANDO PARA O PRESENTE...', render); }
    if (prev && enteringPhase('results')) { beep('result'); buzz([120, 60, 120, 60, 240]); return warp('CALCULANDO CONEXÕES...', render); }
    if (prev && enteringPhase('talk')) { beep('ok'); buzz(90); flashSky(); }
    if (prev && enteringPhase('roundEnd')) { beep('end'); buzz([200, 80, 200]); }
    render();
  }
  function render() {
    const app = $('#app');
    if (S.screen === 'splash') app.innerHTML = vSplash();
    else if (S.screen === 'identify') app.innerHTML = S.pick ? vConfirm() : vIdentify();
    else if (!S.state || !S.me) app.innerHTML = vLoading();
    else {
      const b = S.state.block;
      app.innerHTML = b === 'welcome' ? vWelcome() : b === 'message' ? vMessage() : b === 'closing' ? vClosing() : vConnections();
    }
    window.scrollTo(0, 0);
    if (S.screen === 'identify' && !S.pick) { const i = $('#q'); if (i) { i.value = S.q; i.focus(); } }
    tick();
  }
  function patch() {
    if (!S.state) return;
    const c = $('#count'); if (c) { c.textContent = S.state.counts.checkedIn; const b = $('#countBar'); if (b) b.style.width = Math.round(100 * S.state.counts.checkedIn / Math.max(1, S.state.counts.total)) + '%'; }
    const rp = $('#rankProgress'); if (rp) rp.textContent = `${S.state.conn.rankingDone} de ${S.state.conn.rankingTotal} viajantes já avaliaram`;
    if (S.screen === 'identify' && !S.pick) refreshPeopleSoon();
    if (S.me && S.me.group && S.state.conn.phase === 'talk') patchQuestion(false);
  }

  const logo = (sm = false) => `<div class="logo ${sm ? 'sm' : ''}"><div class="l1">DE VOLTA AO</div><div class="l2">FUTURO</div><div class="bar"></div>${sm ? '' : '<div class="l3">EDIÇÃO TOWNHALL</div>'}</div>`;

  function vSplash() {
    return `${'<div class="spacer"></div>'}${logo()}
      <div class="wait"><div class="flux"><i></i><i></i><i></i><b></b></div></div>
      <p class="muted center">Três viagens no tempo, três conversas com gente de outras áreas.<br>Pegue o seu celular: ele é o seu capacitor de fluxo.</p>
      <div class="spacer"></div>
      <button class="btn" data-action="start">⚡ Embarcar na DeLorean</button>`;
  }
  function vPeopleList() {
    const q = S.q.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const list = S.people.filter(p => !q || norm(p.name).includes(q) || norm(p.area).includes(q));
    if (!list.length) return `<p class="muted center" style="padding:20px">Nenhum nome encontrado. Procure o apresentador para ser incluído.</p>`;
    return list.map(p => `<button class="pitem" data-action="pick" data-id="${p.id}">${av(p)}<div><div class="n">${esc(p.name)}</div><div class="m">${esc(p.area)} · ${esc(p.wl)}</div></div>${p.checkedIn ? '<span class="in">A BORDO</span>' : ''}</button>`).join('');
  }
  function vIdentify() {
    return `${logo(true)}
      <div><h2>Quem é você, viajante?</h2><p class="muted">Encontre o seu nome na lista para embarcar.</p></div>
      <input class="input" id="q" placeholder="Digite seu nome…" autocomplete="off" autocapitalize="off">
      <div class="plist" id="plist">${vPeopleList()}</div>
      <div class="spacer"></div>
      <button class="linkbtn" data-action="back">← voltar</button>`;
  }
  function vConfirm() {
    const p = S.pick;
    return `${logo(true)}
      <div class="panel glow match">
        <div class="kicker">Registro do viajante</div>
        <div class="who">${av(p, 'xl')}</div>
        <div class="pname">${esc(p.name)}</div>
        <div style="margin-top:8px">${tags(p)}</div>
        ${p.checkedIn ? '<p class="small" style="margin-top:12px;color:var(--amber)">Esse nome já embarcou em outro celular. Se é você mesmo, pode entrar: este aparelho passa a ser o seu.</p>' : ''}
      </div>
      <button class="btn" data-action="checkin">⚡ Sou eu, embarcar</button>
      <button class="btn ghost" data-action="unpick">Não sou eu</button>`;
  }
  function vLoading() { return `${logo()}<div class="wait"><div class="flux"><i></i><i></i><i></i><b></b></div><p class="muted">Sincronizando com a linha do tempo…</p></div>`; }

  function vHeader() {
    const me = S.me.person;
    return `<div class="trip">${logo(true)}<div style="text-align:right"><div class="small">a bordo como</div><div style="font-weight:800;font-size:13px">${esc(first(me.name))}</div></div></div>`;
  }
  function vWelcome() {
    const st = S.state, me = S.me.person, pct = Math.round(100 * st.counts.checkedIn / Math.max(1, st.counts.total));
    const canAsk = 'Notification' in window && Notification.permission === 'default';
    return `${vHeader()}
      <div class="panel glow match">
        <div class="kicker">Check-in confirmado</div>
        <div class="who">${av(me, 'xl')}</div>
        <div class="pname">Bem-vindo(a) a bordo, ${esc(first(me.name))}!</div>
        <div style="margin-top:8px">${tags(me)}</div>
        <p class="muted" style="margin-top:12px">${esc(st.event.welcomeText)}</p>
      </div>
      <div class="panel center">
        <div class="kicker">Viajantes a bordo</div>
        <div class="big"><span id="count">${st.counts.checkedIn}</span><span style="font-size:18px;color:var(--muted)"> / ${st.counts.total}</span></div>
        <div class="bar"><i id="countBar" style="width:${pct}%"></i></div>
        <p class="small" style="margin-top:10px">Fique com o app aberto: as próximas etapas aparecem aqui automaticamente.</p>
      </div>
      ${st.event.agenda && st.event.agenda.length ? `<div class="panel"><div class="kicker">Roteiro da viagem</div><ul class="agenda">${st.event.agenda.map(a => `<li><span class="t">${esc(a.time || '•')}</span><span class="x">${esc(a.title)}</span></li>`).join('')}</ul></div>` : ''}
      ${canAsk ? '<button class="btn ghost" data-action="alerts">🔔 Ativar alertas neste celular</button>' : ''}
      <div class="spacer"></div>
      <button class="linkbtn" data-action="logout">Não sou ${esc(first(me.name))} · trocar de viajante</button>`;
  }
  function vMessage() {
    const m = S.state.message;
    return `${vHeader()}<div class="panel glow msgbox"><div class="e">${esc(m.emoji || '📣')}</div><h2>${esc(m.title)}</h2><p>${esc(m.body)}</p></div>`;
  }
  function vClosing() {
    const r = S.me.result;
    return `${vHeader()}
      <div class="panel glow msgbox"><div class="e">🕰️</div><h2>Fim da viagem</h2><p>${esc(S.state.event.closingText)}</p></div>
      ${r && r.match ? `<div class="panel center"><div class="kicker">Sua conexão do futuro</div><div class="who">${av(r.match, 'md')}</div><div class="pname" style="font-size:18px">${esc(r.match.name)}</div><div style="margin-top:6px">${tags(r.match)}</div></div>` : ''}`;
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
  function partnerCard(g, round) {
    const ps = g.partners, era = roundEra(round);
    const hints = ps.flatMap(p => (p.hints || []).slice(0, 3).map(h => ({ ...h, who: first(p.name) })));
    return `<div class="panel glow match">
      <div class="kicker">${ps.length > 1 ? 'Seu trio nesta viagem' : 'Sua dupla nesta viagem'}</div>
      <div class="plate"><div class="st"><span>HILL VALLEY</span><span>${esc(era.year)}</span></div><div class="num">${esc(g.code)}</div><div class="sub">OUTATIME · ROTA ${esc(g.code)}</div></div>
      <div class="who">${ps.map(p => av(p, 'xl')).join('')}</div>
      ${ps.map(p => `<div class="pname">${esc(p.name)}</div><div style="margin:6px 0 10px">${tags(p)}</div>`).join('')}
      <div class="rules">
        <span class="ok ${g.flags && g.flags.area ? '' : 'warn'}">${g.flags && g.flags.area ? '✔' : '!'} Área diferente</span>
        <span class="ok ${g.flags && g.flags.wl ? '' : 'warn'}">${g.flags && g.flags.wl ? '✔' : '!'} WL diferente</span>
      </div>
      ${hints.length ? `<div class="hints"><div class="kicker">Para puxar assunto</div>${hints.map(h => `<div class="h"><b>${esc(h.who)} · ${esc(h.q)}</b>${esc(h.a)}</div>`).join('')}</div>` : ''}
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
      ticks += `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="${v === 88 ? '#ffd000' : '#9aa0bd'}" stroke-width="${v === 88 ? 3 : 2}" stroke-linecap="round"/>`;
      if (v % 32 === 0 || v === 88) { const pl = pt(v, R - 26); ticks += `<text x="${pl.x}" y="${pl.y + 4}" text-anchor="middle" font-family="Orbitron" font-size="${v === 88 ? 13 : 10}" font-weight="900" fill="${v === 88 ? '#ffd000' : '#9aa0bd'}">${v}</text>`; }
    }
    const arc = `M ${a0.x} ${a0.y} A ${R} ${R} 0 0 1 ${a1.x} ${a1.y}`;
    return `<div class="gauge" id="gauge"><svg viewBox="0 0 250 162">
      <defs><linearGradient id="gg" x1="0" x2="1"><stop offset="0" stop-color="#35d6ff"/><stop offset=".55" stop-color="#ffd000"/><stop offset="1" stop-color="#ff3c00"/></linearGradient></defs>
      <path d="${arc}" fill="none" stroke="#262a44" stroke-width="10" stroke-linecap="round"/>
      <path id="gaugeArc" d="${arc}" fill="none" stroke="url(#gg)" stroke-width="10" stroke-linecap="round" pathLength="100" stroke-dasharray="0 100"/>
      ${ticks}
      <text x="125" y="96" text-anchor="middle" font-family="Orbitron" font-size="8" font-weight="700" fill="#9aa0bd" letter-spacing="3">MPH</text>
      <g id="needle" class="needle"><line x1="125" y1="112" x2="125" y2="32" stroke="#ff3b30" stroke-width="4" stroke-linecap="round"/><circle cx="125" cy="112" r="8" fill="#1b1f36" stroke="#9aa0bd" stroke-width="2"/></g>
      <text id="clock" class="clocktext" x="125" y="154" text-anchor="middle">--:--</text>
    </svg></div>`;
  }
  function questionCard(g, round) {
    const q = g.queue[g.position], era = roundEra(round), n = g.queue.length;
    if (!q) return `<div class="question"><div class="ic">🛸</div><div class="k">SEM PERGUNTAS</div><div class="q">O banco de perguntas está vazio. Conversem livremente!</div></div>`;
    const eraQ = S.state.conn.eras[q.era] || era;
    return `<div class="question" id="qcard">
      <div class="ic">${esc(eraQ.icon || '⚡')}</div>
      <div class="k">PERGUNTA ${g.position + 1}${n ? ' DE ' + n : ''} · ${esc(eraQ.label)}</div>
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
      if (next) { next.disabled = g.position >= g.queue.length - 1; next.textContent = g.position >= g.queue.length - 1 ? 'Última pergunta' : 'Próxima →'; }
      if (animate) buzz(25);
    }
  }
  function vConnections() {
    const c = S.state.conn, g = S.me.group, r = c.round;
    const head = vHeader();
    if (c.phase === 'idle' || c.phase === 'ready') {
      return `${head}${circuits(1)}
        <div class="panel"><div class="wait"><div class="flux"><i></i><i></i><i></i><b></b></div>
          <h2>Calculando rotas temporais</h2>
          <p class="muted">O Doc está preparando as duplas. Regras da viagem: <b style="color:var(--txt)">área diferente</b>, <b style="color:var(--txt)">WL diferente</b> e nunca repetir a mesma dupla.</p>
          <div class="small">Viajantes a bordo: <b id="count" style="color:var(--yellow)">${c ? S.state.counts.checkedIn : 0}</b></div>
        </div></div>`;
    }
    if (c.phase === 'matching' || c.phase === 'talk' || c.phase === 'roundEnd') {
      if (!g || g.missing) {
        return `${head}${circuits(r)}${tripBar(r)}
          <div class="panel glow msgbox"><div class="e">🧭</div><h2>Fora da rota</h2><p>Você não está nas duplas desta viagem (provavelmente entrou depois do cálculo). Procure o Doc, o apresentador, para entrar na próxima rota.</p></div>`;
      }
      if (c.phase === 'matching') {
        return `${head}${circuits(r)}${tripBar(r)}${partnerCard(g, r)}
          <div class="panel cyan center"><div class="kicker">Como funciona</div>
            <p class="muted">1. Encontre ${esc(g.partners.map(p => first(p.name)).join(' e '))} na sala: mostrem a placa <b style="color:var(--txt)">${esc(g.code)}</b>.<br>2. Quando o Doc liberar, as perguntas aparecem aqui, iguais nos dois celulares.<br>3. Vocês têm ${human(S.state.settings.roundSeconds)}. Responderam? Toque em <b style="color:var(--txt)">Próxima</b>.</p>
            <div class="sync" style="margin-top:8px"><i></i> aguardando o Doc iniciar a conversa</div>
          </div>`;
      }
      if (c.phase === 'talk') {
        const ps = g.partners.map(p => first(p.name)).join(' e ');
        return `${head}${circuits(r)}${tripBar(r)}
          <div class="panel center">
            ${gauge()}
            <div class="kicker" style="margin-top:14px">Tempo da viagem · com ${esc(ps)}</div>
            ${c.talk && c.talk.paused ? '<div class="ptag">⏸ PAUSADO PELO DOC</div>' : ''}
          </div>
          <div id="qbox">${questionCard(g, r)}</div>
          <div class="qnav">
            <button class="btn ghost prev" id="qprev" data-action="prev" ${g.position <= 0 ? 'disabled' : ''}>←</button>
            <button class="btn" id="qnext" data-action="next" ${g.position >= g.queue.length - 1 ? 'disabled' : ''}>${g.position >= g.queue.length - 1 ? 'Última pergunta' : 'Próxima →'}</button>
          </div>
          <div class="sync"><i></i> sincronizado com o celular de ${esc(ps)}</div>`;
      }
      const last = r >= c.totalRounds;
      return `${head}${circuits(r)}${tripBar(r)}
        <div class="panel glow msgbox"><div class="e">⚡</div><h2>88 MPH atingidos!</h2><p>Tempo esgotado na viagem ${r}. ${last ? 'Foi a última viagem: em instantes você avalia as conversas.' : 'Agradeça à sua dupla e prepare-se: a próxima rota já vai aparecer.'}</p></div>
        <div class="sync"><i></i> aguardando o Doc</div>`;
    }
    if (c.phase === 'ranking') return vRanking();
    if (c.phase === 'results') return vResults();
    return `${head}<div class="panel"><p class="muted">Estado desconhecido: ${esc(c.phase)}</p></div>`;
  }
  function vRanking() {
    const me = S.me, convs = me.conversations || [];
    const sent = me.ranking && !S.editing;
    if (!convs.length) return `${vHeader()}<div class="panel glow msgbox"><div class="e">🧭</div><h2>Sem viagens registradas</h2><p>Você não participou das rodadas, então não há conversas para avaliar.</p></div>`;
    if (sent) {
      const order = convs.slice().sort((a, b) => me.ranking[a.round] - me.ranking[b.round]);
      return `${vHeader()}
        <div class="panel glow msgbox"><div class="e">📡</div><h2>Avaliação enviada!</h2><p>Aguardando o Doc calcular as conexões. <span id="rankProgress">${S.state.conn.rankingDone} de ${S.state.conn.rankingTotal} viajantes já avaliaram</span>.</p></div>
        <div class="panel"><div class="kicker">Sua ordem</div>${order.map(cv => `<div class="ritem">${av(cv.partners[0] || me.person)}<div class="grow"><div class="nm">${me.ranking[cv.round]}º · ${esc(cv.partners.map(p => p.name).join(' & '))}</div><div class="small">Viagem ${cv.round} · ${esc(cv.era.label)} ${esc(cv.era.year)}</div></div></div>`).join('')}</div>
        <button class="btn ghost" data-action="edit">Alterar ordem</button>`;
    }
    const pos = round => { const i = S.draft.indexOf(round); return i < 0 ? null : i + 1; };
    const done = S.draft.length === convs.length;
    return `${vHeader()}
      <div><h2>Avalie suas viagens</h2><p class="muted">Toque nas conversas <b style="color:var(--txt)">na ordem da sua preferência</b>: primeiro a melhor, depois a segunda e por último a terceira. Vale pensar em quem você gostaria de continuar conhecendo.</p></div>
      ${convs.map(cv => { const p = pos(cv.round); return `<button class="rank ${p ? 'on' : ''}" data-action="rank" data-round="${cv.round}"><div class="pos">${p ? p + 'º' : '—'}</div>${av(cv.partners[0] || me.person)}<div><div class="nm">${esc(cv.partners.map(x => x.name).join(' & '))}</div><div class="th">Viagem ${cv.round} · ${esc(cv.era.label)} ${esc(cv.era.year)} · ${esc(cv.partners.map(x => x.area).join(' / '))}</div></div></button>`; }).join('')}
      <div class="row"><button class="btn ghost" data-action="clear">Refazer</button><button class="btn" data-action="submit" ${done ? '' : 'disabled'}>Enviar avaliação ⚡</button></div>
      <p class="small center" id="rankProgress">${S.state.conn.rankingDone} de ${S.state.conn.rankingTotal} viajantes já avaliaram</p>`;
  }
  function patchRanking() {
    document.querySelectorAll('.rank').forEach(card => {
      const i = S.draft.indexOf(+card.dataset.round);
      card.classList.toggle('on', i >= 0);
      const pos = card.querySelector('.pos'); if (pos) pos.textContent = i >= 0 ? `${i + 1}º` : '—';
    });
    const btn = $('[data-action=submit]'); if (btn && S.me) btn.disabled = S.draft.length !== (S.me.conversations || []).length;
  }
  function vResults() {
    const r = S.me.result;
    if (!r || !r.match) return `${vHeader()}<div class="panel glow msgbox"><div class="e">🛸</div><h2>Sem conexão calculada</h2><p>Não encontramos conversas suas nas rodadas. Fale com o Doc.</p></div>`;
    const bolts = n => '⚡'.repeat(Math.max(0, n)) || '·';
    const top = r.detail[0];
    const era = top ? roundEra(top.round) : null;
    return `${vHeader()}
      <div class="panel dest">
        <div class="kicker">Sua conexão do futuro</div>
        <div class="who">${av(r.match, 'xl')}</div>
        <div class="pname">${esc(r.match.name)}</div>
        <div style="margin-top:8px">${tags(r.match)}</div>
        ${r.mutual ? '<div class="mutual">⚡ CONEXÃO MÚTUA</div>' : ''}
        <div class="score">${r.score} pts</div>
        <div class="small">você ${bolts(top ? top.mine : 0)} · ${esc(first(r.match.name))} ${bolts(top ? top.theirs : 0)}</div>
        <p class="muted" style="margin-top:12px">Próximo passo: marque um café de 15 minutos com ${esc(first(r.match.name))} na próxima semana para continuar o papo${era ? ` que começou em ${esc(era.year)}` : ''}. ☕</p>
      </div>
      <div class="panel"><div class="kicker">Todas as suas viagens</div><div class="rlist">${r.detail.map((d, i) => `<div class="ritem">${av(d.partner)}<div class="grow"><div class="nm">${i + 1}. ${esc(d.partner.name)}</div><div class="small">Viagem ${d.round} · ${esc(roundEra(d.round).label)} · você ${bolts(d.mine)} · ${esc(first(d.partner.name))} ${bolts(d.theirs)}</div></div><div class="pts">${d.score}</div></div>`).join('')}</div></div>
      <p class="small center">1º lugar vale 3 pontos, 2º vale 2 e 3º vale 1. A pontuação soma os dois lados da conversa.</p>`;
  }

  /* ---------------- timer ---------------- */
  function tick() {
    if (!S.state) return;
    const led = $('#ledNow'); if (led) led.textContent = ledNow();
    const c = S.state.conn; if (c.phase !== 'talk' || !c.talk) return;
    const t = c.talk;
    const left = t.paused ? t.remaining : Math.max(0, Math.round((t.endsAt - serverNow()) / 1000));
    const clock = $('#clock'); if (clock) clock.textContent = fmt(left);
    const g = $('#gauge');
    if (g) {
      const frac = Math.min(1, Math.max(0, 1 - left / Math.max(1, t.duration)));
      const needle = $('#needle'); if (needle) needle.style.transform = `rotate(${-90 + frac * 180}deg)`;
      const arc = $('#gaugeArc'); if (arc) arc.setAttribute('stroke-dasharray', `${(frac * 100).toFixed(1)} 100`);
      g.classList.toggle('hurry', !t.paused && left <= Math.min(30, t.duration * .25));
      g.classList.toggle('paused', !!t.paused);
    }
  }
  setInterval(tick, 500);

  /* ---------------- ações ---------------- */
  async function act(action, el) {
    try {
      switch (action) {
        case 'start': unlockAudio(); S.screen = 'identify'; await loadPeople(); maybeRender(true); break;
        case 'back': S.screen = 'splash'; maybeRender(true); break;
        case 'pick': S.pick = S.people.find(p => p.id === +el.dataset.id) || null; maybeRender(true); break;
        case 'unpick': S.pick = null; maybeRender(true); break;
        case 'checkin': {
          unlockAudio(); el.disabled = true;
          const r = await api('/api/checkin', { personId: S.pick.id, token: S.token });
          S.token = r.token; localStorage.setItem('bttf.token', r.token); S.pick = null; S.screen = 'app';
          hello(); toast(`Bem-vindo(a) a bordo, ${first(r.person.name)}! ⚡`); buzz(60);
          break;
        }
        case 'logout': if (confirm('Sair deste viajante neste celular?')) { localStorage.removeItem('bttf.token'); S.token = null; S.me = null; S.screen = 'splash'; hello(); } break;
        case 'alerts': try { await Notification.requestPermission(); } catch { /* ignora */ } maybeRender(true); break;
        case 'next': case 'prev': {
          el.disabled = true;
          S.socket.emit('group:step', { dir: action === 'next' ? 1 : -1 }, res => { if (!res.ok) { toast(res.error, true); el.disabled = false; } });
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
          S.socket.emit('ranking:submit', { ranks }, res => {
            if (!res.ok) { toast(res.error, true); el.disabled = false; return; }
            S.editing = false; S.draft = []; toast('Avaliação enviada! ⚡'); buzz(60);
          });
          break;
        }
      }
    } catch (e) { toast(e.message || String(e), true); if (el) el.disabled = false; }
  }
  document.addEventListener('click', e => { const el = e.target.closest('[data-action]'); if (el) act(el.dataset.action, el); });
  document.addEventListener('input', e => { if (e.target.id === 'q') { S.q = e.target.value; const l = $('#plist'); if (l) l.innerHTML = vPeopleList(); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.socket && S.socket.connected) hello(); });
  setInterval(() => { if (Math.random() < .08) flashSky(); }, 6000);

  render();
  connect();
})();
