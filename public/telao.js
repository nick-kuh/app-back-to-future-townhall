/* ===== Telão · segue o estado do evento (sem identidade) ===== */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const fmt = s => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  const ERA_KEYS = ['presente', 'passado', 'futuro'];
  const linkify = s => esc(s).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  const QUOTES = [
    ['Para onde vamos, não precisamos de estradas.', 'Doc Brown · 1985'],
    ['Great Scott!', 'Doc Brown'],
    ['Isso é pesado, Doc.', 'Marty McFly · 1985'],
    ['1,21 gigawatts!', 'Doc Brown · 1985'],
    ['Se você vai construir uma máquina do tempo num carro, por que não fazer isso com estilo?', 'Doc Brown · 1985'],
    ['O futuro ainda não está escrito. Ele é o que você fizer dele.', 'Doc Brown · 1990'],
    ['Ninguém me chama de covarde.', 'Marty McFly · 1989'],
    ['Hill Valley: um bom lugar para viver.', 'placa da cidade · 1955'],
    ['Salve a torre do relógio!', 'panfleto · 1985'],
    ['Hoverboards não funcionam na água!', 'Hill Valley · 2015'],
    ['Tubarão 19: desta vez é realmente pessoal.', 'cinema de Hill Valley · 2015'],
    ['Nós precisamos voltar... de volta para o futuro!', 'Doc Brown · 1985'],
    ['Você não está pensando em quatro dimensões!', 'Doc Brown · 1990'],
    ['Tênis que amarram sozinhos. Casacos que se secam. 2015.', 'Hill Valley · 2015'],
    ['Baile do Encantamento Submarino, 12 de novembro de 1955.', 'Hill Valley High · 1955'],
    ['Quando essa belezinha chega a 88 milhas por hora, você vai ver algo sério.', 'Doc Brown · 1985'],
    ['Só um raio pode gerar 1,21 gigawatts.', 'Doc Brown · 1955'],
    ['Clara, você é a mulher mais incrível que já conheci.', 'Doc Brown · 1885'],
    ['O Almanaque Esportivo Grays: 1950 a 2000.', 'Biff Tannen · 2015'],
    ['Oitenta e oito milhas por hora!', 'Marty McFly · 1985'],
  ];
  const ERAS_FILM = [
    { y: '1885', f: 'FILME III · VELHO OESTE', d: 'Doc vira ferreiro em Hill Valley, conhece Clara e uma locomotiva empurra a DeLorean a 88 mph.' },
    { y: '1955', f: 'FILME I · O RAIO', d: 'Baile do Encantamento Submarino. O raio na torre do relógio gera os 1,21 gigawatts da volta.' },
    { y: '1985', f: 'FILME I · HILL VALLEY', d: 'Twin Pines Mall, 1h21 da manhã: a DeLorean atinge 88 mph pela primeira vez.' },
    { y: '2015', f: 'FILME II · O FUTURO', d: 'Hoverboards, carros voadores, tênis que amarram sozinhos e Tubarão 19 em 3D.' },
    { y: '1985-A', f: 'FILME II · LINHA ALTERNATIVA', d: 'Biff rouba o almanaque e Hill Valley vira uma cidade sombria. A missão: consertar o tempo.' },
  ];

  const S = { state: null, offset: 0, socket: null, key: '', people: null, eraIdx: 0, quoteIdx: 0 };
  const serverNow = () => Date.now() + S.offset;
  const ledNow = (sec = false) => { const d = new Date(serverNow()); return `${MONTHS[d.getMonth()]} ${pad(d.getDate())} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}${sec ? ':' + pad(d.getSeconds()) : ''}`; };
  const roundEra = r => (S.state && S.state.conn.eras[ERA_KEYS[(Math.max(1, r) - 1) % 3]]) || { label: '', year: '', led: '' };
  const flash = () => { const f = $('#skyFlash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); };
  const drive = () => { const d = $('#delorean'); d.classList.remove('go'); void d.offsetWidth; d.classList.add('go'); };

  /* ---------- rede ---------- */
  function connect() {
    S.socket = io({ transports: ['websocket', 'polling'], tryAllTransports: true });
    S.socket.on('connect', () => S.socket.emit('hello', {}, res => { if (res && res.state) { S.state = res.state; S.offset = res.now - Date.now(); render(); } }));
    S.socket.on('state', st => { S.state = st; S.offset = st.now - Date.now(); render(); });
  }
  async function loadPeople() { try { S.people = await (await fetch('/api/people')).json(); } catch { S.people = []; } }

  /* ---------- peças ---------- */
  const logo = () => `<div class="logo"><div class="l1">DE VOLTA AO</div><div class="l2">FUTURO</div><div class="bar"></div><div class="l3">TOWNHALL · HILL VALLEY</div></div>`;
  const flux = () => `<div class="flux"><i></i><i></i><i></i><b></b></div>`;
  const quoteBlock = i => { const q = QUOTES[i % QUOTES.length]; return `<div class="quote" id="quote">“${esc(q[0])}”<small>${esc(q[1])}</small></div>`; };
  const eras = () => `<div class="eras" id="eras">${ERAS_FILM.map((e, i) => `<div class="era ${i === S.eraIdx ? 'on' : ''}"><div class="y">${esc(e.y)}</div><div class="f">${esc(e.f)}</div><div class="d">${esc(e.d)}</div></div>`).join('')}</div>`;
  const circuits = (dest, last) => `<div class="circuits">
      <div class="tc r"><label>DESTINATION TIME</label><div class="led">${esc(dest)}</div></div>
      <div class="tc g"><label>PRESENT TIME</label><div class="led" id="ledNow">${ledNow(true)}</div></div>
      <div class="tc a"><label>LAST TIME DEPARTED</label><div class="led">${esc(last)}</div></div>
    </div>`;
  const huge = (kind, cls = '') => `<div class="cdwrap" id="cdwrap" data-kind="${kind}"><div class="huge ${cls}" id="cd">--:--</div><div class="ptag">❚❚ PAUSADO</div></div>`;
  function gauge() {
    const cx = 125, cy = 112, R = 96;
    const ang = v => (-90 + (v / 88) * 180) * Math.PI / 180;
    const pt = (v, r) => ({ x: +(cx + r * Math.sin(ang(v))).toFixed(1), y: +(cy - r * Math.cos(ang(v))).toFixed(1) });
    const a0 = pt(0, R), a1 = pt(88, R);
    let ticks = '';
    for (let v = 0; v <= 88; v += 8) {
      const major = v % 16 === 0 || v === 88, p1 = pt(v, R), p2 = pt(v, R - (major ? 12 : 7));
      ticks += `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="${v === 88 ? '#ffd21f' : '#bcaee0'}" stroke-width="${v === 88 ? 3 : 2}" stroke-linecap="round"/>`;
      if (v % 32 === 0 || v === 88) { const pl = pt(v, R - 26); ticks += `<text x="${pl.x}" y="${pl.y + 4}" text-anchor="middle" font-family="Orbitron" font-size="${v === 88 ? 13 : 10}" font-weight="900" fill="${v === 88 ? '#ffd21f' : '#bcaee0'}">${v}</text>`; }
    }
    const arc = `M ${a0.x} ${a0.y} A ${R} ${R} 0 0 1 ${a1.x} ${a1.y}`;
    return `<div class="gauge"><svg viewBox="0 0 250 130"><defs><linearGradient id="gg" x1="0" x2="1"><stop offset="0" stop-color="#2ee6d6"/><stop offset=".55" stop-color="#ffd21f"/><stop offset="1" stop-color="#ff2a00"/></linearGradient></defs>
      <path d="${arc}" fill="none" stroke="#2a1d55" stroke-width="10" stroke-linecap="round"/><path id="gaugeArc" d="${arc}" fill="none" stroke="url(#gg)" stroke-width="10" stroke-linecap="round" pathLength="100" stroke-dasharray="0 100"/>${ticks}
      <text x="125" y="96" text-anchor="middle" font-family="Orbitron" font-size="8" font-weight="700" fill="#bcaee0" letter-spacing="3">MPH</text>
      <g id="needle" class="needle"><line x1="125" y1="112" x2="125" y2="32" stroke="#ff3b30" stroke-width="4" stroke-linecap="round"/><circle cx="125" cy="112" r="8" fill="#1d1142" stroke="#bcaee0" stroke-width="2"/></g></svg></div>`;
  }
  function qrBox() {
    const url = location.origin + '/';
    let svg = '';
    try { const q = qrcode(0, 'M'); q.addData(url); q.make(); svg = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); } catch { svg = ''; }
    return `<div class="qrbox">${svg ? `<div class="qr">${svg}</div>` : ''}<div class="url">${esc(url.replace(/^https?:\/\//, ''))}</div></div>`;
  }

  /* ---------- cenas ---------- */
  function sceneFor() {
    const st = S.state, c = st.conn, sc = (st.screen && st.screen.scene) || 'auto';
    if (sc === 'clock') return ['clock', sceneClock()];
    if (sc === 'logo') return ['logo', `${logo()}${flux()}`];
    if (sc === 'quote') return ['quote', `${quoteBlock(S.quoteIdx)}${eras()}`];
    const b = st.block;
    if (b === 'welcome') return ['welcome', `<div class="kicker">CHECK-IN ABERTO · ESCANEIE E ESCOLHA O SEU NOME</div>${logo()}${qrBox()}<div class="count"><span id="count">${st.counts.checkedIn}</span><small> / ${st.counts.total} a bordo</small></div><div class="bar"><i id="countBar" style="width:${Math.round(100 * st.counts.checkedIn / Math.max(1, st.counts.total))}%"></i></div>`];
    if (b === 'standby') return ['clock', sceneClock()];
    if (b === 'message') { const m = st.message; return ['message', `<div class="msg"><div class="e">${esc(m.emoji || '📣')}</div></div><div class="title">${esc(m.title)}</div><div class="msg"><p>${linkify(m.body)}</p></div>`]; }
    if (b === 'closing') return ['closing', `<div class="title">FIM DA VIAGEM</div><div class="sub">${esc(st.event.closingText)}</div>${credits()}`];
    // conexões
    const r = c.round, era = roundEra(r), t = c.timer;
    if (c.phase === 'idle' || c.phase === 'ready') return ['prep', `<div class="kicker">BLOCO CONEXÕES</div><div class="title">ROTAS TEMPORAIS</div>${flux()}<div class="sub">Calculando as duplas das três viagens no tempo. <b>${st.counts.checkedIn}</b> viajantes a bordo.</div>`];
    if (c.phase === 'matching') return ['matching', `<div class="kicker">VIAGEM ${r}/3 · ${esc(era.label)} · ${esc(era.year)}</div><div class="title">ENCONTRE SUA DUPLA</div>${t && t.kind === 'matching' ? huge('matching', 'amber') : ''}<div class="sub">Olhe o celular: a placa com o número da sua rota. Mostre a placa e encontre quem tem o mesmo número. A conversa começa sozinha.</div>`];
    if (c.phase === 'talk') return ['talk', `<div class="kicker">VIAGEM ${r}/3 · ${esc(era.label)} · ${esc(era.year)} · CONVERSA EM ANDAMENTO</div><div class="rowx">${gauge()}${huge('talk')}</div><div class="sub">Quando o ponteiro chegar a <b>88 mph</b>, a viagem termina e a próxima dupla aparece no celular.</div>`];
    if (c.phase === 'roundEnd') return ['roundEnd', `<div class="title">88 MPH!</div><div class="sub">${r >= c.totalRounds ? 'Fim das viagens. A avaliação já vai aparecer no celular.' : 'Tempo esgotado. Agradeça à sua dupla: a próxima rota está chegando.'}</div>${t && t.kind === 'break' ? huge('break', 'amber') : ''}`];
    if (c.phase === 'ranking') return ['ranking', `<div class="kicker">AVALIAÇÃO</div><div class="title cy">AVALIE NO CELULAR</div><div class="sub">Coloque suas três conversas em ordem: <b>1º, 2º e 3º</b>. Pense em quem você gostaria de continuar conhecendo.</div><div class="count"><span id="rankDone">${c.rankingDone}</span><small> / ${c.rankingTotal} avaliaram</small></div><div class="bar"><i id="rankBar" style="width:${Math.round(100 * c.rankingDone / Math.max(1, c.rankingTotal))}%"></i></div>${t && t.kind === 'ranking' ? huge('ranking', 'green') : ''}`];
    if (c.phase === 'results') return ['results', `<div class="kicker">CONEXÕES CALCULADAS</div><div class="title">OLHE O CELULAR</div><div class="sub">Cada viajante recebeu a pessoa com quem deve continuar o papo. <b>${c.mutualCount}</b> conexões mútuas na sala.</div>${c.mutualPairs && c.mutualPairs.length ? `<div class="mutual">${c.mutualPairs.map(p => `<span>${esc(p[0].split(' ')[0])} ⚡ ${esc(p[1].split(' ')[0])}</span>`).join('')}</div>` : ''}`];
    return ['clock', sceneClock()];
  }
  function sceneClock() {
    const c = S.state.conn, r = c.round || 0;
    const dest = r ? roundEra(Math.min(3, r + (c.phase === 'results' ? 0 : 0))).led : 'OUT 26 1985 01:21';
    const last = r > 1 ? roundEra(r - 1).led : '--- -- ---- --:--';
    return `${circuits(dest, last)}${eras()}`;
  }
  function credits() {
    if (!S.people) { loadPeople().then(render); return ''; }
    const names = S.people.map(p => p.name);
    const dur = Math.max(40, names.length * 2.2);
    return `<div class="credits"><div class="roll" style="--dur:${dur}s"><div class="h">ELENCO · VIAJANTES DO TEMPO</div>${names.map(n => `<div>${esc(n)}</div>`).join('')}<div class="h">DIREÇÃO · DOC BROWN</div><div>Hill Valley, 1985</div></div></div>`;
  }

  /* ---------- render / tick ---------- */
  function render() {
    if (!S.state) return;
    const [key, html] = sceneFor();
    const k = `${key}|${S.state.conn.round}|${S.state.conn.timer ? S.state.conn.timer.kind : ''}|${JSON.stringify(S.state.message)}|${S.state.conn.mutualCount}|${(S.state.conn.mutualPairs || []).length}|${S.people ? S.people.length : -1}`;
    if (k !== S.key) {
      S.key = k; $('#scene').innerHTML = html;
      if (key === 'roundEnd' || key === 'results') { flash(); drive(); }
      if (key === 'matching') drive();
    } else {
      const c = $('#count'); if (c) { c.textContent = S.state.counts.checkedIn; const b = $('#countBar'); if (b) b.style.width = Math.round(100 * S.state.counts.checkedIn / Math.max(1, S.state.counts.total)) + '%'; }
      const rd = $('#rankDone'); if (rd) { rd.textContent = S.state.conn.rankingDone; const b = $('#rankBar'); if (b) b.style.width = Math.round(100 * S.state.conn.rankingDone / Math.max(1, S.state.conn.rankingTotal)) + '%'; }
    }
    tick();
  }
  function tick() {
    $('#osdNow').textContent = ledNow();
    const led = $('#ledNow'); if (led) led.textContent = ledNow(true);
    if (!S.state) return;
    const t = S.state.conn.timer, wrap = $('#cdwrap');
    if (!t || !wrap || wrap.dataset.kind !== t.kind) return;
    const left = t.paused ? t.remaining : Math.max(0, Math.round((t.endsAt - serverNow()) / 1000));
    $('#cd').textContent = fmt(left);
    wrap.classList.toggle('hurry', !t.paused && left <= 10);
    wrap.classList.toggle('paused', !!t.paused);
    if (t.kind === 'talk') {
      const frac = Math.min(1, Math.max(0, 1 - left / Math.max(1, t.duration)));
      const n = $('#needle'); if (n) n.style.transform = `rotate(${-90 + frac * 180}deg)`;
      const a = $('#gaugeArc'); if (a) a.setAttribute('stroke-dasharray', `${(frac * 100).toFixed(1)} 100`);
    }
  }
  setInterval(tick, 500);
  // letreiro de frases
  $('#ticker').innerHTML = QUOTES.concat(QUOTES).map(q => `<span>“${esc(q[0])}”<em>${esc(q[1])}</em></span>`).join('');
  $('#ticker').style.setProperty('--speed', `${QUOTES.length * 11}s`);
  setInterval(() => {
    S.eraIdx = (S.eraIdx + 1) % ERAS_FILM.length; S.quoteIdx++;
    const er = $('#eras'); if (er) [...er.children].forEach((el, i) => el.classList.toggle('on', i === S.eraIdx));
    const qb = $('#quote'); if (qb) { const q = QUOTES[S.quoteIdx % QUOTES.length]; qb.innerHTML = `“${esc(q[0])}”<small>${esc(q[1])}</small>`; }
  }, 11000);
  setInterval(() => { if (Math.random() < .35) drive(); }, 40000);
  setInterval(() => { if (Math.random() < .2) flash(); }, 9000);
  connect();
})();
