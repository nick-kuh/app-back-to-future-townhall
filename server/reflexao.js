// Bloco "Reflexão" · Ato 1: O Combustível do Futuro (a partir do protótipo enviado pela organização).
// São 6 paradas. Em cada uma o Doc abre uma votação de 1:30 e cada pessoa escolhe, pelo app, um
// projeto da lista (o nome vem do check-in, um voto por parada). Cada voto carrega o Flux Capacitor
// do telão. Encerrada a votação, o Doc revela os 2 projetos mais votados (nunca dois do mesmo
// responsável) e o telão mostra, com suspense, cada projeto e quem responde por ele.
// Tudo fica guardado no banco (sobrevive a reinícios).
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
  showCounts: false, // mostrar no telão e nos celulares quantos votos cada um dos mais votados teve
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
const norm = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
// "Fulano / Beltrano · Sicrano" são três responsáveis; o texto de "não identificado" não é ninguém
const ownersOf = o => (!o || o === NO_OWNER ? [] : String(o).split(/[\/·;|]/).map(norm).filter(Boolean));

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
    voteSeconds: clamp(Math.round(Number(c.voteSeconds) || d.voteSeconds), 10, 900), fullVotes: clamp(Math.round(Number(c.fullVotes) || d.fullVotes), 1, 500), showCounts: !!c.showCounts, themes, projects };
}

function createReflexao() {
  const saved = kvGet('reflexao', {}) || {};
  let config = cleanConfig(saved.config) || DEFAULT_CONFIG();
  let rev = Number(saved.rev) || 1;
  const listeners = [];
  let timer = null;
  const blank = () => ({ phase: 'idle', endsAt: null, remaining: config.voteSeconds, votes: [], top: [], topAt: null, show: false, last: null });
  const state = { open: null, paradas: [] };
  { // restaura o que estava guardado (votos, fases e sorteios)
    const old = saved.state && Array.isArray(saved.state.paradas) ? saved.state.paradas : [];
    state.paradas = config.themes.map((_, i) => Object.assign(blank(), old[i] && typeof old[i] === 'object' ? old[i] : {}));
    for (const p of state.paradas) { if (!['idle', 'run', 'paused', 'done'].includes(p.phase)) p.phase = 'idle'; for (const k of ['votes', 'top']) if (!Array.isArray(p[k])) p[k] = []; }
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
  // projetos votados na parada, do mais para o menos votado (empate: quem chegou antes a essa contagem)
  function ranked(p) {
    const m = new Map();
    for (const v of p.votes) { const t = m.get(v.p) || { p: v.p, o: v.o || NO_OWNER, n: 0, at: 0 }; t.n++; t.at = v.at; m.set(v.p, t); }
    return [...m.values()].sort((a, b) => b.n - a.n || a.at - b.at);
  }
  // os 2 mais votados sem repetir responsável: um projeto de quem já está entre os escolhidos é pulado
  function topTwo(p) {
    const list = ranked(p), picks = [], taken = new Set();
    for (const x of list) {
      if (picks.length === 2) break;
      const own = ownersOf(x.o);
      if (own.some(k => taken.has(k))) { x.skip = true; continue; }
      x.pick = picks.length + 1; picks.push(x); own.forEach(k => taken.add(k));
    }
    return { list, picks };
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
      if (p.phase === 'done' && p.top.length) p.show = true; // parada já revelada: volta mostrando os mais votados
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
      Object.assign(p, { phase: 'idle', endsAt: null, remaining: config.voteSeconds, top: [], topAt: null, show: false });
      arm(); commit();
    },
    // Revela os 2 projetos mais votados da parada (o telão faz o suspense). Chamar de novo repete a revelação.
    reveal() {
      const p = need();
      if (p.phase !== 'done') fail('Encerre a votação antes de revelar os mais votados.');
      const { picks } = topTwo(p);
      if (!picks.length) fail('Nenhum voto nesta parada.');
      p.top = picks.map(x => ({ p: x.p, o: x.o, n: x.n })); p.topAt = Date.now(); p.show = true;
      commit({ title: 'Projetos mais votados', body: 'Olhe para o telão.' });
    },
    showTop(on) { const p = need(); if (!p.top.length) return; p.show = !!on; commit(); },
    setCounts(on) { config.showCounts = !!on; commit(); },
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
    resetConfig() { hold(); config = { ...DEFAULT_CONFIG(), showCounts: config.showCounts }; rev++; state.paradas = config.themes.map((_, i) => state.paradas[i] || blank()); if (state.open !== null && !P(state.open)) state.open = null; arm(); commit(); },
    /* ---------- o que cada tela recebe ---------- */
    catalog: () => ({ rev, projects: config.projects.map(x => ({ name: x.name, owner: x.owner || NO_OWNER })) }),
    publicState() {
      const n = config.themes.length, total = state.paradas.reduce((a, p) => a + p.votes.length, 0);
      const energy = p => Math.min(1, p.votes.length / config.fullVotes);
      const i = state.open, p = cur();
      return {
        rev, title: config.title, subtitle: config.subtitle, voteSeconds: config.voteSeconds, fullVotes: config.fullVotes,
        open: i, votes: total, energy: Math.min(1, total / (config.fullVotes * n)),
        themes: config.themes.map((t, k) => ({ n: pad(k + 1), t: t.t, q: t.q, c: COLORS[k % COLORS.length], votes: P(k).votes.length, gw: energy(P(k)) * 1.21 / n, phase: P(k).phase, revealed: P(k).top.length > 0 })),
        cur: p ? { idx: i, phase: p.phase, endsAt: p.endsAt, remaining: p.remaining, votes: p.votes.length, energy: energy(p), last: p.last,
          // os mais votados: 1º e 2º, com o responsável; a quantidade de votos só vai se o Doc ligar essa opção
          top: p.show && p.top.length ? { at: p.topAt, items: p.top.map(v => ({ name: v.p, owner: v.o, ...(config.showCounts ? { votes: v.n } : {}) })) } : null } : null,
      };
    },
    // os votos da própria pessoa, parada por parada
    mine(pid) { return { votes: state.paradas.map(p => { const v = p.votes.find(x => x.pid === pid); return v ? { project: v.p, owner: v.o } : null; }) }; },
    adminState() {
      return { rev, config, open: state.open, paradas: state.paradas.map(p => {
        const { list } = topTwo(p);
        return { phase: p.phase, endsAt: p.endsAt, remaining: p.remaining, votes: p.votes.length, projects: list.length,
          tally: list.map(x => ({ p: x.p, o: x.o, n: x.n, pick: x.pick || 0, skip: !!x.skip })), top: p.top, show: p.show };
      }) };
    },
    // extração de dados: votos, contagem por projeto e os mais votados de cada parada
    exportData() {
      return { title: config.title, paradas: state.paradas.map((p, i) => {
        const { list, picks } = topTwo(p);
        return { n: pad(i + 1), title: config.themes[i].t, question: config.themes[i].q, phase: p.phase, revealed: p.top.length > 0,
          votes: p.votes.map(v => ({ name: v.n, project: v.p, owner: v.o, at: v.at, test: v.pid === null })),
          tally: list.map(x => ({ project: x.p, owner: x.o, votes: x.n, place: x.pick || 0, skipped: !!x.skip })),
          top: (p.top.length ? p.top : picks).map(x => ({ project: x.p, owner: x.o, votes: x.n })) };
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
