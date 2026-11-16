// Bloco "Reflexão" · Ato 1: O Combustível do Futuro (a partir do protótipo enviado pela organização).
// São 6 paradas. Em cada uma o Doc abre uma votação de 1:30 e cada pessoa escolhe, pelo app, um
// projeto da lista (o nome vem do check-in, um voto por parada). Cada voto carrega o Flux Capacitor
// do telão. Encerrada a votação, o Doc sorteia 2 projetos entre os que receberam voto e o telão
// mostra o projeto e o responsável. Tudo fica guardado no banco (sobrevive a reinícios).
const crypto = require('crypto');
const { kvGet, kvSet } = require('./db');

const COLORS = ['#22d3ee', '#ff2e88', '#ffd23f', '#ff6b1a'];
const NO_OWNER = 'Responsável não identificado na planilha';
const PROJECTS = [
  'HC NRM & UPOSE (Oráculo)', 'Walmart Scintilla & Market Performance / Nielsen — México', 'Locker Room Insights / FIFA', 'AI Anvisa Monitoring — B&W', 'Predictive Maintenance / Senseye', 'LLM Search',
  'Phoenix / Fenix — Sell-Out Brasil', 'iPlatform', 'OTM Brasil — Waves 1 e 2', 'MacGyver / MacGyver II — Vinhedo', 'MES — Aguaí e Indaiatuba', 'B&W Reimagine',
  'Data Squad — HC Brasil e Argentina', 'Amazon Sell-Out Automation', 'Pharmalink Sell-Out Automation', 'Copilot Researcher & Notebook', 'R&D Agents', 'Digital Dispatch / Factory Digital Dispatch',
  'MDL Sell-In — Uruguai e Paraguai', 'Minecraft — novos CDs e hubs no Brasil', 'DFOS — 4 fábricas', 'DMS — rollout em 5 sites', 'Visitas e diagnóstico das fábricas LATAM', 'Aguaí como fábrica de referência global de PC',
  'Copilot / AI at Scale — LATAM', 'AI Acceleration Workshops', 'Community of Practices / Champions', 'TPM Brasil', 'EDDGIE / Perfect Store', 'Capacitação em Digital Commerce / PDP Excellence',
  'Relacionamento com BGs e BUs', 'ONE Governance — Customer Operations', 'Make Squad com OAC e Accenture', 'Parceria com times globais de Make e engenharia de PC', 'Mirai — Global ↔ Local Bridge', 'Team Building / Future Thinking / Cross Objectives'];
const OWNERS = ['Deffendi, Vinicius', 'Sousa, Caio', 'Sousa, Caio', 'Papucci, Amanda', 'Papucci, Amanda', 'Abreu-M, Mauro', 'Sousa, Caio', 'Lalla, Maximiliano', 'Santos, Alexandre', 'Papucci, Amanda', 'Papucci, Amanda', 'Papucci, Amanda',
  'Sousa, Caio', 'Lalla, Maximiliano', 'Lalla, Maximiliano', 'Abreu-M, Mauro', 'Abreu-M, Mauro', 'Scapin, Rodrigo / Navarrete, Francisco / Mendez, Horacio', 'Sousa, Caio', 'Guiducci, Claudia',
  'Scapin, Rodrigo / Navarrete, Francisco / Mendez, Horacio', 'Scapin, Rodrigo / Navarrete, Francisco / Mendez, Horacio', 'Papucci, Amanda', 'Papucci, Amanda', 'Abreu-M, Mauro', 'Abreu-M, Mauro', 'Abreu-M, Mauro',
  'Deffendi, Vinicius · Aguilar, Ana', 'Deffendi, Vinicius', 'Lalla, Maximiliano', NO_OWNER, 'Santos, Alexandre', 'Papucci, Amanda', 'Papucci, Amanda', NO_OWNER, NO_OWNER];
const DEFAULT_CONFIG = () => ({
  title: 'Ato 1 · O Combustível do Futuro',
  subtitle: 'As 6 paradas da jornada',
  voteSeconds: 90,   // 1min30 de votação por parada
  fullVotes: 15,     // votos para carregar 100% do Flux Capacitor em uma parada
  themes: [
    { t: 'O Capacitor de Fluxo', q: 'Que ideias testamos e o que aprendemos?' },
    { t: 'Mudamos a Linha do Tempo', q: 'O que passou a funcionar de outro jeito?' },
    { t: 'Dobra no Tempo', q: 'Onde devolvemos tempo às pessoas?' },
    { t: 'Conexões', q: 'Que fronteiras aproximamos?' },
    { t: 'Reação em Cadeia', q: 'O que começou pequeno e ganhou escala?' },
    { t: 'Doc & Marty', q: 'Quem ajudou cada conquista a acontecer?' },
  ],
  projects: PROJECTS.map((name, i) => ({ name, owner: OWNERS[i] })),
});
// modo ensaio: votos fictícios para testar sem os celulares (os nomes vão marcados como teste)
const FAKE_NAMES = ['Ana Souza', 'Bruno Lima', 'Carla Mendes', 'Diego Rocha', 'Eduarda Alves', 'Felipe Costa', 'Gabriela Nunes', 'Hugo Martins', 'Isabela Ramos', 'João Pereira', 'Larissa Dias', 'Marcos Teixeira',
  'Nina Barros', 'Otávio Pinto', 'Paula Freitas', 'Rafael Gomes', 'Sofia Cardoso', 'Tiago Moreira', 'Vitória Lopes', 'William Araújo', 'Yasmin Rocha', 'Lucas Prado'];

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pad = n => String(n).padStart(2, '0');
const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };

function cleanConfig(c) {
  if (!c || typeof c !== 'object') return null;
  const themes = (Array.isArray(c.themes) ? c.themes : []).slice(0, 8).map(t => ({ t: clip(t && t.t, 60), q: clip(t && t.q, 200) })).filter(t => t.t);
  const seen = new Set(), projects = [];
  for (const x of (Array.isArray(c.projects) ? c.projects : []).slice(0, 300)) {
    const name = clip(x && x.name, 140), key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key); projects.push({ name, owner: clip(x && x.owner, 160) });
  }
  if (!themes.length || projects.length < 2) return null;
  const d = DEFAULT_CONFIG();
  return { title: clip(c.title, 80) || d.title, subtitle: clip(c.subtitle, 80) || d.subtitle,
    voteSeconds: clamp(Math.round(Number(c.voteSeconds) || d.voteSeconds), 10, 900), fullVotes: clamp(Math.round(Number(c.fullVotes) || d.fullVotes), 1, 500), themes, projects };
}

function createReflexao() {
  const saved = kvGet('reflexao', {}) || {};
  let config = cleanConfig(saved.config) || DEFAULT_CONFIG();
  let rev = Number(saved.rev) || 1;
  const listeners = [];
  let timer = null;
  const blank = () => ({ phase: 'idle', endsAt: null, remaining: config.voteSeconds, votes: [], drawn: [], cur: [], drawAt: null, swap: null, show: false, last: null });
  const state = { open: null, paradas: [] };
  { // restaura o que estava guardado (votos, fases e sorteios)
    const old = saved.state && Array.isArray(saved.state.paradas) ? saved.state.paradas : [];
    state.paradas = config.themes.map((_, i) => Object.assign(blank(), old[i] && typeof old[i] === 'object' ? old[i] : {}));
    for (const p of state.paradas) { if (!['idle', 'run', 'paused', 'done'].includes(p.phase)) p.phase = 'idle'; for (const k of ['votes', 'drawn', 'cur']) if (!Array.isArray(p[k])) p[k] = []; }
    const o = saved.state ? saved.state.open : null;
    state.open = Number.isInteger(o) && o >= 0 && o < state.paradas.length ? o : null;
  }
  const save = () => kvSet('reflexao', { config, rev, state });
  const commit = notice => { save(); for (const fn of listeners) fn(notice || null); };
  const P = i => state.paradas[i];
  const cur = () => (state.open === null ? null : P(state.open));
  const need = () => cur() || fail('Abra uma parada antes.');
  const left = p => (p.endsAt ? Math.max(0, Math.ceil((p.endsAt - Date.now()) / 1000)) : p.remaining);
  const themeName = i => `Parada ${pad(i + 1)} · ${config.themes[i].t}`;

  function arm() { // o prazo acaba sem nenhum comando: o servidor encerra a votação sozinho
    clearTimeout(timer); timer = null;
    const p = cur();
    if (p && p.phase === 'run' && p.endsAt) { const i = state.open; timer = setTimeout(() => finish(i), Math.max(0, p.endsAt - Date.now()) + 30); }
  }
  function finish(i) {
    const p = P(i);
    if (!p || p.phase === 'done') return;
    p.remaining = left(p); p.endsAt = null; p.phase = 'done';
    arm();
    commit({ title: 'Votação encerrada', body: `${themeName(i)} · ${p.votes.length} ${p.votes.length === 1 ? 'voto' : 'votos'}` });
  }
  // pausa em silêncio a votação em andamento (o evento saiu da Reflexão ou o Doc trocou de parada)
  function hold() {
    const p = cur();
    if (!p || p.phase !== 'run') return false;
    p.remaining = left(p); p.endsAt = null; p.phase = 'paused';
    arm(); save();
    return true;
  }
  // projetos que receberam voto na parada, na ordem em que apareceram
  function pool(p) {
    const seen = new Set(), out = [];
    for (const v of p.votes) if (!seen.has(v.p)) { seen.add(v.p); out.push({ p: v.p, o: v.o || NO_OWNER }); }
    return out;
  }
  const pick = list => list.splice(crypto.randomInt(list.length), 1)[0];

  const api = {
    onChange(fn) { listeners.push(fn); },
    hold,
    /* ---------- Doc ---------- */
    open(i) {
      i = Number(i);
      if (!Number.isInteger(i) || !P(i)) fail('Parada não encontrada.', 404);
      if (state.open !== i) hold();
      state.open = i;
      const p = P(i);
      if (p.phase === 'done' && p.cur.length) p.show = true; // parada já sorteada: volta mostrando os cartões
      arm(); commit({ title: 'Reflexão', body: themeName(i) });
    },
    menu() { hold(); state.open = null; arm(); commit(); },
    start() {
      const p = need();
      if (p.phase === 'done') fail('A votação desta parada já foi encerrada. Use "Reiniciar votação" para abrir de novo.');
      if (p.phase !== 'run') { p.phase = 'run'; p.endsAt = Date.now() + Math.max(1, p.remaining) * 1000; }
      arm(); commit({ title: 'Votação aberta', body: 'Escolha um projeto no celular.' });
    },
    pause() { const p = need(); if (p.phase !== 'run') return; p.remaining = left(p); p.endsAt = null; p.phase = 'paused'; arm(); commit(); },
    end() { need(); finish(state.open); },
    reset() { // abre a votação de novo, mantendo os votos já dados (como no protótipo)
      const p = need();
      Object.assign(p, { phase: 'idle', endsAt: null, remaining: config.voteSeconds, cur: [], drawAt: null, swap: null, show: false });
      arm(); commit();
    },
    draw() {
      const p = need();
      if (p.phase !== 'done') fail('Encerre a votação antes do sorteio.');
      const all = pool(p), used = new Set(p.drawn), free = all.filter(v => !used.has(v.p));
      if (all.length < 2) fail('São necessários pelo menos 2 projetos diferentes votados para o sorteio.');
      if (free.length < 2) fail('Não há projetos suficientes que ainda não foram sorteados.');
      const a = pick(free), b = pick(free);
      p.cur = [a, b]; p.drawn.push(a.p, b.p); p.drawAt = Date.now(); p.swap = null; p.show = true;
      commit({ title: 'Projetos sorteados', body: 'Olhe para o telão.' });
    },
    swap(k) {
      const p = need(); k = Number(k);
      if (!p.cur[k]) fail('Sorteie os projetos antes de trocar.');
      const used = new Set(p.drawn), free = pool(p).filter(v => !used.has(v.p));
      if (!free.length) fail('Não há mais projetos para sortear.');
      const v = pick(free);
      p.cur[k] = v; p.drawn.push(v.p); p.swap = { k, at: Date.now() }; p.show = true;
      commit();
    },
    showDraw(on) { const p = need(); if (!p.cur.length) return; p.show = !!on; commit(); },
    clear() { const p = need(); Object.assign(p, blank()); arm(); commit(); },
    clearAll({ silent = false } = {}) {
      state.paradas = config.themes.map(blank); state.open = null;
      arm(); if (silent) save(); else commit();
    },
    fake(n) { // modo ensaio: votos fictícios, com tendência aos projetos da própria parada (6 por parada, como no protótipo)
      const p = need(), i = state.open;
      if (p.phase === 'done') fail('Votação encerrada.');
      if (p.phase !== 'run') { p.phase = 'run'; p.endsAt = Date.now() + Math.max(1, p.remaining) * 1000; }
      const used = new Set(p.votes.map(v => v.n)), free = FAKE_NAMES.map(x => `${x} (teste)`).filter(x => !used.has(x));
      const per = Math.max(1, Math.floor(config.projects.length / config.themes.length));
      let added = 0;
      for (let k = 0; k < clamp(Number(n) || 5, 1, 30) && free.length; k++) {
        const name = pick(free);
        const own = config.projects.slice(i * per, i * per + per);
        const proj = own.length && crypto.randomInt(100) < 75 ? own[crypto.randomInt(own.length)] : config.projects[crypto.randomInt(config.projects.length)];
        p.votes.push({ pid: null, n: name, p: proj.name, o: proj.owner || NO_OWNER, at: Date.now() });
        p.last = { name, at: Date.now() }; added++;
      }
      arm(); commit();
      return added;
    },
    /* ---------- participante ---------- */
    vote(person, projectName) {
      const p = cur();
      if (!p) fail('Nenhuma parada está aberta agora.');
      if (p.phase === 'idle') fail('A votação ainda não começou.');
      if (p.phase === 'paused') fail('A votação está pausada.');
      if (p.phase === 'done' || (p.endsAt && p.endsAt <= Date.now())) fail('Votação encerrada.');
      const proj = config.projects.find(x => x.name === projectName);
      if (!proj) fail('Projeto não encontrado. Atualize a página e escolha de novo.', 400);
      if (p.votes.some(v => v.pid === person.id)) fail('Você já votou nesta parada.');
      p.votes.push({ pid: person.id, n: person.name, p: proj.name, o: proj.owner || NO_OWNER, at: Date.now() });
      p.last = { name: person.name, at: Date.now() };
      commit();
    },
    /* ---------- configuração (Preparar → Reflexão) ---------- */
    setConfig(partial) {
      const next = cleanConfig({ ...config, ...(partial && typeof partial === 'object' ? partial : {}) });
      if (!next) fail('A Reflexão precisa de pelo menos 1 parada e 2 projetos.', 400);
      hold(); config = next; rev++;
      state.paradas = config.themes.map((_, i) => state.paradas[i] || blank());
      for (const p of state.paradas) if (p.phase === 'idle') p.remaining = config.voteSeconds;
      if (state.open !== null && !P(state.open)) state.open = null;
      arm(); commit();
    },
    resetConfig() { hold(); config = DEFAULT_CONFIG(); rev++; state.paradas = config.themes.map((_, i) => state.paradas[i] || blank()); if (state.open !== null && !P(state.open)) state.open = null; arm(); commit(); },
    /* ---------- o que cada tela recebe ---------- */
    catalog: () => ({ rev, projects: config.projects.map(x => ({ name: x.name, owner: x.owner || NO_OWNER })) }),
    publicState() {
      const n = config.themes.length, total = state.paradas.reduce((a, p) => a + p.votes.length, 0);
      const energy = p => Math.min(1, p.votes.length / config.fullVotes);
      const i = state.open, p = cur();
      return {
        rev, title: config.title, subtitle: config.subtitle, voteSeconds: config.voteSeconds, fullVotes: config.fullVotes,
        open: i, votes: total, energy: Math.min(1, total / (config.fullVotes * n)),
        themes: config.themes.map((t, k) => ({ n: pad(k + 1), t: t.t, q: t.q, c: COLORS[k % COLORS.length], votes: P(k).votes.length, gw: energy(P(k)) * 1.21 / n, phase: P(k).phase, drawn: P(k).drawn.length > 0 })),
        cur: p ? { idx: i, phase: p.phase, endsAt: p.endsAt, remaining: p.remaining, votes: p.votes.length, energy: energy(p), last: p.last,
          hasDraw: p.cur.length > 0, draw: p.show && p.cur.length ? { at: p.drawAt, swap: p.swap, items: p.cur.map(v => ({ name: v.p, owner: v.o })) } : null } : null,
      };
    },
    // os votos da própria pessoa, parada por parada
    mine(pid) { return { votes: state.paradas.map(p => { const v = p.votes.find(x => x.pid === pid); return v ? { project: v.p, owner: v.o } : null; }) }; },
    adminState() {
      return { rev, config, open: state.open, paradas: state.paradas.map(p => {
        const tally = new Map();
        for (const v of p.votes) { const t = tally.get(v.p) || { p: v.p, o: v.o, n: 0 }; t.n++; tally.set(v.p, t); }
        const used = new Set(p.drawn);
        return { phase: p.phase, endsAt: p.endsAt, remaining: p.remaining, votes: p.votes.length, projects: tally.size, free: [...tally.keys()].filter(x => !used.has(x)).length,
          tally: [...tally.values()].sort((a, b) => b.n - a.n), drawn: p.drawn, cur: p.cur, show: p.show };
      }) };
    },
    votes: () => state.paradas.flatMap((p, i) => p.votes.map(v => ({ parada: i, name: v.n, project: v.p, owner: v.o, at: v.at }))),
    votesCsv() { // mesmas colunas da exportação do protótipo
      const rows = [['Tema', 'Nome', 'Responsável pelo projeto', 'Projeto', 'Data/Hora']];
      state.paradas.forEach((p, i) => p.votes.forEach(v => rows.push([`${pad(i + 1)} · ${config.themes[i].t}`, v.n, v.o, v.p, new Date(v.at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })])));
      return '﻿' + rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\r\n');
    },
  };
  arm();
  { const p = cur(); if (p && p.phase === 'run' && p.endsAt && p.endsAt <= Date.now()) finish(state.open); }
  return api;
}

module.exports = { createReflexao, DEFAULT_CONFIG, NO_OWNER };
