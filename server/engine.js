// Motor do evento: estado do townhall (blocos), bloco de conexões (fases, timer,
// duplas, filas de perguntas, ranking e resultados), pessoas e perguntas.
const crypto = require('crypto');
const { db, kvGet, kvSet, seedIfEmpty, resetQuestions } = require('./db');
const { generateRounds, checkGroups, pairKey } = require('./matching');
const { buildQueues, ERAS, eraOfRound } = require('./queues');
const { computeResults, POINTS } = require('./results');

const TOTAL_ROUNDS = 3;
const BLOCKS = ['standby', 'welcome', 'message', 'connections', 'closing', 'stage'];
const AUDIO_MODES = ['off', 'music', 'ambient'];

// Roteiro do evento: a ordem dos passos que o Doc percorre no painel ("Próximo ▶").
//  checkin · stage (bloco de fala: título, tema, quem fala) · connections · sucesso (dinâmica d1..d4)
//  message (aviso/intervalo) · standby (olhos no telão) · closing
const STEP_TYPES = ['checkin', 'stage', 'connections', 'sucesso', 'message', 'standby', 'closing'];
const SUCESSO_ACTS = ['d1', 'd2', 'd3', 'd4'];
const STEP_BLOCK = { checkin: 'welcome', stage: 'stage', connections: 'connections', message: 'message', standby: 'standby', closing: 'closing' };
const clip = (v, n) => String(v ?? '').trim().slice(0, n);
function defaultSteps(stages) {
  const st = i => Object.assign({ title: `Bloco ${i + 1}`, theme: '', speaker: '' }, (stages || [])[i] || {});
  return [
    { type: 'checkin' },
    { type: 'stage', ...st(0) },
    { type: 'connections' },
    { type: 'stage', ...st(1) },
    { type: 'sucesso', activity: 'd1' }, { type: 'sucesso', activity: 'd2' }, { type: 'sucesso', activity: 'd3' }, { type: 'sucesso', activity: 'd4' },
    { type: 'stage', ...st(2) },
    { type: 'closing' },
  ].map((x, i) => ({ id: 'p' + (i + 1), ...x }));
}
// Valida o roteiro vindo do painel: tipos conhecidos, textos com limite, ids únicos; Conexões e cada
// dinâmica do Sucesso só entram uma vez (o estado delas é um só).
function cleanSteps(list) {
  const out = [], ids = new Set(), once = new Set();
  for (const raw of (Array.isArray(list) ? list : []).slice(0, 40)) {
    if (!raw || !STEP_TYPES.includes(raw.type)) continue;
    if (raw.type === 'sucesso' && !SUCESSO_ACTS.includes(raw.activity)) continue;
    const unique = raw.type === 'connections' ? 'connections' : raw.type === 'sucesso' ? raw.activity : null;
    if (unique) { if (once.has(unique)) continue; once.add(unique); }
    let id = typeof raw.id === 'string' && /^[a-z0-9]{1,16}$/i.test(raw.id) && !ids.has(raw.id) ? raw.id : null;
    while (!id || ids.has(id)) id = 'p' + crypto.randomBytes(4).toString('hex');
    ids.add(id);
    const step = { id, type: raw.type };
    if (raw.type === 'stage') { step.title = clip(raw.title, 60) || 'Bloco'; step.theme = clip(raw.theme, 200); step.speaker = clip(raw.speaker, 80); }
    if (raw.type === 'message') { step.emoji = clip(raw.emoji, 8) || '📣'; step.title = clip(raw.title, 80) || 'Aviso'; step.body = clip(raw.body, 600); }
    if (raw.type === 'sucesso') step.activity = raw.activity;
    out.push(step);
  }
  return out;
}
const PHASES = ['idle', 'ready', 'matching', 'talk', 'roundEnd', 'ranking', 'results'];

const DEFAULT_SETTINGS = {
  eventName: 'Townhall · De Volta ao Futuro',
  roundSeconds: 240,      // conversa
  findSeconds: 60,        // tempo para a dupla se encontrar antes da conversa
  breakSeconds: 6,        // "88 MPH!" entre uma viagem e a próxima
  rankingSeconds: 120,    // avaliação fecha sozinha depois disso (ou quando todos avaliarem)
  autoFlow: true,         // viagens e avaliação avançam sozinhas
  showMutualOnScreen: false,
  showFormHints: true,
  welcomeText: 'Aguarde: a viagem começa em breve.',
  closingText: 'Obrigado por viajar com a gente. Marque aquele café com a sua conexão!',
  standbyText: 'Agora você não precisa do celular.',
  steps: null,            // roteiro do evento (montado no construtor; editável em Preparar → Roteiro)
  stageText: 'Agora a atenção é no palco.',
  stageMutes: true,       // exibir um bloco de fala desliga o som do telão
  musicUrl: '',           // opcional: arquivo de áudio próprio para "Música" (senão, toca a trilha gerada no navegador)
  ambientUrl: '',         // opcional: arquivo de áudio próprio para "Trilha sonora"
  agenda: [
    { time: '', title: 'Boas-vindas e check-in' },
    { time: '', title: 'Conexões · 3 viagens no tempo' },
    { time: '', title: 'Encerramento' },
  ],
};
const DEFAULT_MESSAGE = { title: 'Intervalo', body: 'Voltamos em 15 minutos.', emoji: '☕' };
const defaultConn = () => ({ phase: 'idle', round: 0, played: 0, timer: null, generatedAt: null, worstLevel: null, levels: {}, resultsAt: null, repeats: false });
const DEFAULT_SCREEN = { scene: 'auto' }; // telão: auto (segue o bloco) | clock | logo | quote

const now = () => Date.now();
const iso = () => new Date().toISOString();
const bool = v => (v ? 1 : 0);
const human = s => (s >= 60 ? `${Math.floor(s / 60)} min${s % 60 ? ` e ${s % 60} s` : ''}` : `${s} s`);
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
    const saved = kvGet('state', {});
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
      audio: Object.assign({ mode: 'off', volume: 60, out: 'telao' }, saved.audio || {}), // som: off | music | ambient · sai do telão ou do painel
      drawn: saved.drawn && typeof saved.drawn === 'object' ? saved.drawn : {}, // respostas já sorteadas por dinâmica/rodada
    };
    delete this.state.conn.talk; // modelo antigo
    this.settings = Object.assign({}, DEFAULT_SETTINGS, kvGet('settings', {}));
    const steps = cleanSteps(this.settings.steps);
    this.settings.steps = steps.length ? steps : defaultSteps(this.settings.stages); // versões antigas guardavam só os blocos de fala
    delete this.settings.stages;
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
      form: parse(r.form_json, null), sortOrder: r.sort_order || 0,
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
  participants() { return this.listPeople().filter(p => p.active && p.checkedInAt); }
  // full=true só para o painel do admin: os viajantes não veem área, WL nem time uns dos outros.
  publicPerson(p, withHints = false, full = false) {
    if (!p) return null;
    const out = full ? { id: p.id, name: p.name, area: p.area, wl: p.wl, team: p.team } : { id: p.id, name: p.name };
    if (withHints && this.settings.showFormHints && p.form) {
      out.hints = Object.entries(p.form).filter(([, v]) => String(v || '').trim()).map(([q, a]) => ({ q, a: String(a) }));
    }
    return out;
  }

  checkin(personId, existingToken) {
    const p = this.personById(personId);
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

  addPerson(f) {
    const name = String(f.name || '').trim();
    if (!name) throw new Error('Nome obrigatório.');
    const max = db.prepare('SELECT COALESCE(MAX(sort_order),0) AS m FROM people').get().m;
    const r = db.prepare('INSERT INTO people (name, email, wl, team, manager, area, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(name, String(f.email || '').trim().toLowerCase(), normalizeWl(f.wl), String(f.team || '').trim(), String(f.manager || '').trim(), String(f.area || '').trim(), max + 1);
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
    this.commit();
    return this.personById(p.id);
  }
  deletePerson(id) {
    if (this.allGroups().some(g => g.members.includes(Number(id)))) throw new Error('Essa pessoa está em duplas já geradas. Marque como ausente em vez de excluir, ou resete o bloco de conexões.');
    db.prepare('DELETE FROM people WHERE id = ?').run(Number(id));
    db.prepare('DELETE FROM rankings WHERE person_id = ?').run(Number(id));
    db.prepare('DELETE FROM results WHERE person_id = ?').run(Number(id));
    db.prepare('DELETE FROM seen WHERE person_id = ?').run(Number(id));
    this.commit();
  }
  importPeople(rows, mode = 'merge') {
    const clean = rows.map(r => ({
      name: String(r.name || '').trim(), email: String(r.email || '').trim().toLowerCase(), wl: normalizeWl(r.wl),
      team: String(r.team || '').trim(), manager: String(r.manager || '').trim(), area: String(r.area || '').trim(),
    })).filter(r => r.name);
    db.exec('BEGIN');
    try {
      let inserted = 0, updated = 0;
      if (mode === 'replace') {
        db.exec('DELETE FROM people; DELETE FROM groups; DELETE FROM seen; DELETE FROM rankings; DELETE FROM results;');
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
    return db.prepare('SELECT * FROM questions ORDER BY sort_order, id').all().map(q => ({ id: q.id, text: q.text, era: q.era, active: !!q.active, sortOrder: q.sort_order }));
  }
  guardQuestions() {
    if (this.state.conn.phase === 'talk') throw new Error('Há uma conversa em andamento. Encerre-a antes de mexer no banco de perguntas.');
  }
  afterQuestionsChange() {
    if (this.state.conn.phase === 'matching') this.assignQueues(this.state.conn.round);
    this.commit();
  }
  addQuestion({ text, era }) {
    this.guardQuestions();
    const t = String(text || '').trim();
    if (!t) throw new Error('Texto da pergunta obrigatório.');
    const max = db.prepare('SELECT COALESCE(MAX(sort_order),0) AS m FROM questions').get().m;
    db.prepare('INSERT INTO questions (text, era, sort_order) VALUES (?, ?, ?)').run(t, ERAS[era] ? era : 'presente', max + 1);
    this.afterQuestionsChange();
  }
  updateQuestion(id, f) {
    this.guardQuestions();
    const fields = [], vals = [];
    if (f.text !== undefined) { const t = String(f.text).trim(); if (!t) throw new Error('Texto da pergunta obrigatório.'); fields.push('text = ?'); vals.push(t); }
    if (f.era !== undefined) { fields.push('era = ?'); vals.push(ERAS[f.era] ? f.era : 'presente'); }
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
      const upd = db.prepare('UPDATE questions SET text = ?, era = ?, active = ?, sort_order = ? WHERE id = ?');
      const ins = db.prepare('INSERT INTO questions (text, era, active, sort_order) VALUES (?, ?, ?, ?)');
      let i = 0;
      for (const q of list) {
        const t = String(q.text || '').trim();
        if (!t) continue;
        const era = ERAS[q.era] ? q.era : 'presente';
        const active = (q.active === false || q.active === 0) ? 0 : 1;
        const found = byText.get(normText(t));
        if (found && !keep.has(found.id)) { upd.run(t, era, active, ++i, found.id); keep.add(found.id); }
        else { const r = ins.run(t, era, active, ++i); keep.add(Number(r.lastInsertRowid)); }
      }
      const del = db.prepare('DELETE FROM questions WHERE id = ?');
      for (const q of existing) if (!keep.has(q.id)) del.run(q.id);
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
    const queues = buildQueues({ groups: groups.map(g => g.members), round, questions, seenByPerson });
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
    this.commit({ title: `Viagem ${round} · ${eraOfRound(round).year}`, body: 'Sua dupla foi revelada. Encontre essa pessoa na sala!' });
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
    const dur = Math.max(10, Number(this.settings.roundSeconds) || 240);
    c.phase = 'talk';
    c.played = Math.max(c.played || 0, c.round);
    this.startTimer('talk', dur);
    this.commit({ title: 'Conversa liberada!', body: `Vocês têm ${human(dur)}. Boa viagem!` });
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
    this.commit({ title: '88 MPH!', body: last ? 'Fim das viagens. Avalie as conversas no celular.' : 'Tempo esgotado. Próxima viagem chegando!' });
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
    this.commit({ title: 'Hora de avaliar', body: 'Coloque suas conversas em ordem: 1º, 2º e 3º lugar.' });
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
    this.commit({ title: 'Sua conexão do futuro chegou!', body: 'Abra o app para descobrir com quem você deve continuar o papo.' });
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
    else { this.state.detour = null; this.syncCursor({ welcome: 'checkin', connections: 'connections', closing: 'closing', stage: 'stage' }[block]); if (block === 'connections') this.releaseJourney(); else this.holdJourney(); }
    const notices = {
      message: { title: this.state.message.title, body: this.state.message.body },
      welcome: wasOff ? { title: 'Circuitos ligados', body: 'Estamos de volta. Olhe para o seu celular.' } : null,
      connections: wasOff ? { title: 'Circuitos ligados', body: 'O bloco Conexões está começando.' } : null,
      closing: { title: 'Fim da viagem', body: this.settings.closingText },
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
    if (partial.roundSeconds !== undefined) s.roundSeconds = Math.max(10, Math.min(3600, Number(partial.roundSeconds) || 240));
    if (partial.findSeconds !== undefined) s.findSeconds = Math.max(0, Math.min(600, Number(partial.findSeconds) || 0));
    if (partial.breakSeconds !== undefined) s.breakSeconds = Math.max(0, Math.min(120, Number(partial.breakSeconds) || 0));
    if (partial.rankingSeconds !== undefined) s.rankingSeconds = Math.max(0, Math.min(1800, Number(partial.rankingSeconds) || 0));
    if (partial.autoFlow !== undefined) s.autoFlow = !!partial.autoFlow;
    if (partial.showMutualOnScreen !== undefined) s.showMutualOnScreen = !!partial.showMutualOnScreen;
    if (partial.showFormHints !== undefined) s.showFormHints = !!partial.showFormHints;
    for (const k of ['eventName', 'welcomeText', 'closingText', 'standbyText', 'stageText']) if (partial[k] !== undefined) s[k] = String(partial[k]);
    if (partial.stageMutes !== undefined) s.stageMutes = !!partial.stageMutes;
    // áudio próprio: só endereços http(s) ou caminhos do próprio site
    for (const k of ['musicUrl', 'ambientUrl']) if (partial[k] !== undefined) { const u = String(partial[k]).trim(); s[k] = /^(https?:\/\/|\/)[^\s"'<>]*$/i.test(u) ? u.slice(0, 500) : ''; }
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
    const ok = ['auto', 'clock', 'logo', 'quote', 'countdown'];
    this.state.screen = { scene: ok.includes(scene) ? scene : 'auto' };
    this.commit();
  }
  resetEvent() {
    this.resetConnections();
    db.exec("UPDATE people SET checked_in_at = NULL, token = NULL");
    this.state.presentation = null; this.state.returnStep = null;
    this.applyStep(this.settings.steps[0].id); // o roteiro volta para o começo
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
      if (!silent) this.commit({ title: 'De volta ao townhall', body: 'Olhe para o seu celular.' });
      return null;
    }
    this.holdJourney();
    const { roomId, activityId, title, question, ownerId } = selection;
    this.state.presentation = { roomId, activityId, title, question, ownerId };
    this.commit({ title: 'De Volta para o Sucesso', body: title });
    return this.presentation();
  }
  presentation() {
    const p = this.state.presentation;
    if (!p) return null;
    const d = p.draw; // o texto da resposta sorteada não vai no estado público (só telão logado e o próprio sorteado)
    return { roomId: p.roomId, activityId: p.activityId, title: p.title, question: p.question, draw: d ? { name: d.name, at: d.at, talk: d.talk } : null };
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
    this.commit({ title: 'Viajante sorteado', body: winner.name });
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
      case 'stage': this.state.block = 'stage'; if (this.settings.stageMutes) this.state.audio.mode = 'off'; notice = { title: step.title, body: step.theme || this.settings.stageText }; break;
      case 'connections': this.state.block = 'connections'; notice = { title: 'Conexões', body: 'Olhe para o seu celular.' }; break;
      case 'message': this.state.message = { title: step.title, body: step.body, emoji: step.emoji }; this.state.block = 'message'; notice = { title: step.title, body: step.body }; break;
      case 'standby': this.state.block = 'standby'; break;
      case 'closing': this.state.block = 'closing'; notice = { title: 'Fim da viagem', body: this.settings.closingText }; break;
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
  setAudio({ mode, volume, out } = {}) {
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
        era: eraOfRound(Math.max(1, c.round || 1)), eras: ERAS, timer: c.timer, worstLevel: c.worstLevel,
        generatedAt: c.generatedAt, resultsAt: c.resultsAt, rankingDone, rankingTotal,
        mutualPairs: (c.phase === 'results' && this.settings.showMutualOnScreen) ? this.mutualPairs() : [],
        mutualCount: c.phase === 'results' ? this.mutualPairs().length : 0,
      },
      screen: this.state.screen,
      presentation: this.presentation(),
      stage: this.stageInfo(),
      step: { index: Math.max(0, this.settings.steps.findIndex(x => x.id === this.state.step)), count: this.settings.steps.length },
      audio: { mode: this.state.audio.mode, volume: this.state.audio.volume, out: this.state.audio.out || 'telao', musicUrl: this.settings.musicUrl || '', ambientUrl: this.settings.ambientUrl || '' },
      settings: { roundSeconds: this.settings.roundSeconds, findSeconds: this.settings.findSeconds, breakSeconds: this.settings.breakSeconds, rankingSeconds: this.settings.rankingSeconds, autoFlow: !!this.settings.autoFlow, showFormHints: this.settings.showFormHints },
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
          queue: g.queue.map(id => questions[id]).filter(Boolean).map(q => ({ id: q.id, text: q.text, era: q.era })),
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
    return { person: { ...this.publicPerson(p), checkedInAt: p.checkedInAt }, group, conversations, ranking, result };
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
        round: r, era: eraOfRound(r), level: (c.levels || {})[r] || null, check: { ok: chk.ok, total: chk.total },
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
      people: people.map(p => ({ id: p.id, name: p.name, email: p.email, wl: p.wl, team: p.team, manager: p.manager, area: p.area, active: p.active, checkedInAt: p.checkedInAt, hasForm: !!(p.form && Object.keys(p.form).length), form: p.form, inRounds: inRounds.has(p.id), ranked: !!rankings[p.id], late: !!(generatedAt && p.active && p.checkedInAt && !inRounds.has(p.id)) })),
      rounds, rankings, results, questions: this.listQuestions(), eras: ERAS, points: POINTS,
      counts: this.publicState().counts,
    };
  }
}

module.exports = { Engine, TOTAL_ROUNDS, BLOCKS, PHASES, STEP_TYPES, normalizeWl, defaultSteps };
