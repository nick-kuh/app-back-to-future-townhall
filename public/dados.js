/* ===== Dados do evento: página de extração (Conexões · Reflexão · Sucesso) =====
 * Usa a mesma senha do Painel do Doc. Busca tudo em /api/admin/export e monta as tabelas;
 * cada tabela tem o seu botão de download em .csv (abre direto no Excel). */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TABS = [['conexoes', '⚡ Conexões'], ['reflexao', '💭 Reflexão'], ['sucesso', '🚀 Sucesso']];
  const D = { key: localStorage.getItem('bttf.admin') || '', data: null, tab: TABS.some(t => '#' + t[0] === location.hash) ? location.hash.slice(1) : 'conexoes' };
  const when = v => (v ? new Date(v).toLocaleString('pt-BR') : '');
  const ord = n => (n ? `${n}º` : '—');
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const person = p => `${esc(p.name)}${p.area || p.wl ? ` <span class="meta">(${esc([p.area, p.wl].filter(Boolean).join(' · '))})</span>` : ''}`;
  const table = (head, rows, empty = 'Ainda não há dados.') => (rows.length ? `<div class="tblwrap"><table><tr>${head.map(h => `<th${/^(Votos|Pontos|#)$/.test(h) ? ' class="n"' : ''}>${h}</th>`).join('')}</tr>${rows.join('')}</table></div>` : `<p class="empty">${empty}</p>`);
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2600); }

  /* ---------- download em CSV (ponto e vírgula + BOM: o Excel abre com acentos e colunas certas) ---------- */
  function download(name, rows) {
    if (rows.length < 2) return toast('Ainda não há dados para baixar.');
    const text = '﻿' + rows.map(r => r.map(c => '"' + String(c ?? '').replace(/"/g, '""') + '"').join(';')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000); toast('Download iniciado: ' + name);
  }
  const CSV = {
    // Conexões: uma linha por pergunta que cada dupla teve (as que apareceram durante a conversa)
    duplas() {
      const rows = [['Viagem', 'Era', 'Dupla', 'Pessoa 1', 'Área 1', 'WL 1', 'Pessoa 2', 'Área 2', 'WL 2', 'Pessoa 3 (trio)', 'Ordem', 'Pergunta', 'Era da pergunta']];
      for (const r of D.data.conexoes.rounds) for (const g of r.groups) {
        const m = g.members, base = [r.round, `${r.era.label} ${r.era.year}`, g.code, m[0] ? m[0].name : '', m[0] ? m[0].area : '', m[0] ? m[0].wl : '', m[1] ? m[1].name : '', m[1] ? m[1].area : '', m[1] ? m[1].wl : '', m[2] ? m[2].name : ''];
        const shown = g.questions.filter(q => q.shown);
        if (!shown.length) rows.push([...base, '', r.talked ? '' : '(a conversa ainda não aconteceu)', '']);
        shown.forEach((q, i) => rows.push([...base, i + 1, q.text, q.era]));
      }
      return ['Conexoes_Duplas_e_Perguntas.csv', rows];
    },
    // Conexões: a avaliação de cada pessoa, conversa por conversa
    ranking() {
      const rows = [['Pessoa', 'Área', 'WL', 'Avaliou', 'Viagem', 'Dupla', 'Conversou com', 'Posição que deu', 'Posição que recebeu', 'Pontos somados']];
      for (const p of D.data.conexoes.people) for (const c of p.conversations) rows.push([p.name, p.area, p.wl, p.ranked ? 'Sim' : 'Não', c.round, c.code, c.partner.name, c.gave || '', c.got || '', c.points]);
      return ['Conexoes_Ranking.csv', rows];
    },
    matches() {
      const rows = [['Pessoa', 'Área', 'WL', 'Conexão sugerida', 'Área da conexão', 'WL da conexão', 'Pontos', 'Mútua']];
      for (const p of D.data.conexoes.people) if (p.hasResult) rows.push([p.name, p.area, p.wl, p.match ? p.match.name : '', p.match ? p.match.area : '', p.match ? p.match.wl : '', p.score ?? '', p.mutual ? 'Sim' : 'Não']);
      return ['Conexoes_Matches.csv', rows];
    },
    rfVotos() {
      const rows = [['Parada', 'Pergunta', 'Nome', 'Projeto', 'Responsável pelo projeto', 'Data/Hora', 'Voto de teste']];
      for (const p of D.data.reflexao.paradas) for (const v of p.votes) rows.push([`${p.n} · ${p.title}`, p.question, v.name, v.project, v.owner, when(v.at), v.test ? 'Sim' : 'Não']);
      return ['Reflexao_Votos.csv', rows];
    },
    rfResultado() {
      const rows = [['Parada', 'Pergunta', 'Projeto', 'Responsável pelo projeto', 'Votos', 'Colocação', 'Observação']];
      for (const p of D.data.reflexao.paradas) for (const t of p.tally) rows.push([`${p.n} · ${p.title}`, p.question, t.project, t.owner, t.votes, t.place ? `${t.place}º mais votado` : '', t.skipped ? 'Fora dos 2 mais votados: mesmo responsável de um dos escolhidos' : '']);
      return ['Reflexao_Resultado.csv', rows];
    },
    sucesso(id) {
      const rows = [['Dinâmica', 'Pergunta', 'Nº', 'Nome', 'Resposta', 'Data/Hora']];
      for (const a of D.data.sucesso.acts) if (!id || a.id === id) a.responses.forEach((r, i) => rows.push([`${a.id.slice(1).padStart(2, '0')} · ${a.title}`, a.question, i + 1, r.name, r.answer, when(r.at)]));
      return [id ? `Sucesso_${id.slice(1).padStart(2, '0')}_Respostas.csv` : 'Sucesso_Respostas.csv', rows];
    },
  };
  const dl = (label, key, arg = '', n = 1) => `<button class="btn sm" data-csv="${key}" data-arg="${arg}" ${n ? '' : 'disabled'}>⬇ ${label}</button>`;

  /* ---------- Conexões: duplas e perguntas, ranking de cada pessoa, match de cada pessoa ---------- */
  // as perguntas que a dupla teve: as que apareceram na tela dela, na ordem
  function questions(g, r) {
    const shown = g.questions.filter(q => q.shown), rest = g.questions.length - shown.length;
    if (!r.talked) return '<span class="muted">a conversa ainda não aconteceu</span>';
    if (!shown.length) return '<span class="muted">nenhuma pergunta apareceu</span>';
    return `<ol class="qs">${shown.map(q => `<li>${esc(q.text)}</li>`).join('')}</ol>${rest > 0 ? `<div class="meta" style="margin-top:4px">+ ${rest} na fila que a dupla não chegou a ver</div>` : ''}`;
  }
  function vConexoes() {
    const c = D.data.conexoes, people = c.people, groups = c.rounds.flatMap(r => r.groups);
    const ranked = people.filter(p => p.ranked).length, withMatch = people.filter(p => p.hasResult), mutual = withMatch.filter(p => p.mutual).length / 2;
    const rounds = c.rounds.map(r => `<h3>Viagem ${r.round} · ${esc(r.era.label)} · ${esc(r.era.year)} ${r.groups.length ? (r.talked ? '' : '<span class="tag warn">a conversa ainda não aconteceu</span>') : ''}</h3>
      ${table(['Dupla', 'Quem conversou', 'Perguntas da dupla (na ordem)'], r.groups.map(g => `<tr><td class="code">${esc(g.code)}</td><td>${g.members.map(person).join('<br>')}</td>
        <td>${questions(g, r)}</td></tr>`), 'As duplas desta viagem ainda não foram sorteadas.')}`).join('');
    const rankRows = people.flatMap(p => p.conversations.map((v, i) => `<tr class="${i ? 'rep' : 'first'}"><td>${i ? '' : person(p) + (p.ranked ? '' : ' <span class="tag warn">não avaliou</span>')}</td><td>Viagem ${v.round} · ${esc(v.year)}</td><td>${person(v.partner)}</td><td>${ord(v.gave)}</td><td>${ord(v.got)}</td><td class="n">${v.points}</td></tr>`));
    const matchRows = withMatch.map(p => `<tr><td>${person(p)}</td><td>${p.match ? person(p.match) : '<span class="muted">—</span>'}</td><td class="n">${p.score ?? ''}</td><td>${p.mutual ? '<span class="tag ok">⚡ mútua</span>' : '<span class="muted">não</span>'}</td></tr>`);
    return `<div class="card"><h1>⚡ Conexões</h1>
        <div class="stats"><div class="stat"><b>${people.length}</b><span>pessoas nas viagens</span></div><div class="stat"><b>${c.played}/${c.totalRounds}</b><span>viagens realizadas</span></div><div class="stat"><b>${groups.length}</b><span>duplas formadas</span></div><div class="stat"><b>${ranked}</b><span>avaliaram</span></div><div class="stat"><b>${withMatch.length}</b><span>receberam conexão</span></div><div class="stat"><b>${mutual}</b><span>conexões mútuas</span></div></div>
        <div class="actions">${dl('Duplas e perguntas (.csv)', 'duplas', '', groups.length)}${dl('Ranking de cada pessoa (.csv)', 'ranking', '', people.length)}${dl('Match de cada pessoa (.csv)', 'matches', '', withMatch.length)}</div></div>
      <div class="card"><h2>1 · Duplas e perguntas de cada viagem</h2><p class="small">Para cada dupla, as perguntas que apareceram no celular dela durante a conversa, na ordem em que apareceram.</p>${rounds}</div>
      <div class="card"><h2>2 · Ranking de cada pessoa</h2><p class="small">Depois das viagens, cada pessoa ordena as conversas que teve (1º = a que mais gostou). 1º vale 3 pontos, 2º vale 2 e 3º vale 1; "pontos" soma o que os dois deram um ao outro.</p>
        ${table(['Pessoa', 'Viagem', 'Conversou com', 'Posição que deu', 'Posição que recebeu', 'Pontos'], rankRows, 'Nenhuma viagem aconteceu ainda.')}</div>
      <div class="card"><h2>3 · Match de cada pessoa</h2><p class="small">A conexão sugerida é a conversa com mais pontos somados. É mútua quando os dois são a conexão sugerida um do outro.</p>
        ${table(['Pessoa', 'Conexão sugerida', 'Pontos', 'Mútua'], matchRows, 'As conexões ainda não foram calculadas.')}</div>`;
  }

  /* ---------- Reflexão: resultado e votos de cada parada ---------- */
  function vReflexao() {
    const R = D.data.reflexao, votes = R.paradas.reduce((a, p) => a + p.votes.length, 0);
    const paradas = R.paradas.map(p => `<div class="card"><h2>Parada ${p.n} · ${esc(p.title)}</h2><div class="q">${esc(p.question)}</div>
        <p class="small">${plural(p.votes.length, 'voto', 'votos')} em ${plural(p.tally.length, 'projeto', 'projetos')} · ${{ idle: 'votação não iniciada', run: 'votação aberta', paused: 'votação pausada', done: 'votação encerrada' }[p.phase] || ''}${p.revealed ? ' · mais votados revelados no telão' : ''}</p>
        ${table(['Colocação', 'Projeto', 'Responsável pelo projeto', 'Votos'], p.tally.map(t => `<tr><td>${t.place ? `<span class="tag gold">${t.place === 1 ? '🏆 ' : ''}${t.place}º mais votado</span>` : t.skipped ? '<span class="tag warn">mesmo responsável</span>' : '<span class="muted">—</span>'}</td><td>${esc(t.project)}</td><td>${esc(t.owner)}</td><td class="n">${t.votes}</td></tr>`), 'Nenhum voto nesta parada.')}
        ${p.votes.length ? `<details><summary>Ver quem votou em quê (${p.votes.length})</summary>${table(['Nome', 'Projeto', 'Responsável pelo projeto', 'Hora'], p.votes.map(v => `<tr><td>${esc(v.name)}</td><td>${esc(v.project)}</td><td>${esc(v.owner)}</td><td>${esc(when(v.at))}</td></tr>`))}</details>` : ''}</div>`).join('');
    return `<div class="card"><h1>💭 Reflexão · ${esc(R.title)}</h1>
        <div class="stats"><div class="stat"><b>${votes}</b><span>votos no total</span></div><div class="stat"><b>${R.paradas.filter(p => p.votes.length).length}/${R.paradas.length}</b><span>paradas com votos</span></div><div class="stat"><b>${R.paradas.filter(p => p.revealed).length}</b><span>paradas reveladas</span></div></div>
        <p class="small">Os 2 mais votados de cada parada nunca são do mesmo responsável: um projeto de quem já está entre os escolhidos fica marcado como "mesmo responsável" e dá lugar ao seguinte.</p>
        <div class="actions">${dl('Resultado por parada (.csv)', 'rfResultado', '', votes)}${dl('Todos os votos (.csv)', 'rfVotos', '', votes)}</div></div>${paradas}`;
  }

  /* ---------- Sucesso: as respostas de cada pergunta ---------- */
  function vSucesso() {
    const acts = D.data.sucesso.acts, total = acts.reduce((a, x) => a + x.responses.length, 0);
    if (!acts.length) return '<div class="card"><h1>🚀 De Volta para o Sucesso</h1><p class="empty">As dinâmicas do Sucesso ainda estão carregando. Clique em "Atualizar" em instantes.</p></div>';
    return `<div class="card"><h1>🚀 De Volta para o Sucesso</h1>
        <div class="stats">${acts.map(a => `<div class="stat"><b>${a.responses.length}</b><span>${a.id.slice(1).padStart(2, '0')} · ${esc(a.title)}</span></div>`).join('')}</div>
        <div class="actions">${dl('Todas as respostas (.csv)', 'sucesso', '', total)}</div></div>
      ${acts.map(a => `<div class="card"><h2>Dinâmica ${a.id.slice(1).padStart(2, '0')} · ${esc(a.title)}</h2><div class="q">${esc(a.question)}</div>
        <div class="actions" style="margin:0 0 4px"><span class="small">${plural(a.responses.length, 'resposta', 'respostas')}</span>${dl('Baixar esta pergunta (.csv)', 'sucesso', a.id, a.responses.length)}</div>
        ${table(['#', 'Nome', 'Resposta', 'Hora'], a.responses.map((r, i) => `<tr><td class="n">${i + 1}</td><td>${esc(r.name)}</td><td>${esc(r.answer)}</td><td>${esc(when(r.at))}</td></tr>`), 'Nenhuma resposta nesta pergunta.')}</div>`).join('')}`;
  }

  function render() {
    $('#tabs').innerHTML = TABS.map(([k, l]) => `<button type="button" class="${D.tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('');
    if (!D.data) return;
    $('#stamp').textContent = `${D.data.event} · atualizado às ${new Date(D.data.now).toLocaleTimeString('pt-BR')}`;
    $('#main').innerHTML = ({ conexoes: vConexoes, reflexao: vReflexao, sucesso: vSucesso })[D.tab]();
  }
  async function load(quiet) {
    try {
      const r = await fetch('/api/admin/export', { headers: { 'x-admin-key': D.key }, cache: 'no-store' });
      if (r.status === 401) { $('#login').hidden = false; $('#main').innerHTML = ''; return; }
      if (!r.ok) throw new Error('Erro ' + r.status);
      D.data = await r.json(); $('#login').hidden = true; render(); if (!quiet) toast('Dados atualizados');
    } catch (e) { toast('Não foi possível carregar os dados: ' + e.message); }
  }
  $('#login').addEventListener('submit', async e => {
    e.preventDefault();
    const pwd = $('#pwd').value;
    try {
      const r = await (await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pwd }) })).json();
      if (!r.ok) { $('#loginMsg').textContent = 'Senha inválida.'; return; }
      D.key = pwd; localStorage.setItem('bttf.admin', pwd); $('#loginMsg').textContent = ''; load(true);
    } catch (err) { $('#loginMsg').textContent = 'Sem conexão com o servidor.'; }
  });
  document.addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]'); if (tab) { D.tab = tab.dataset.tab; history.replaceState(null, '', '#' + D.tab); render(); window.scrollTo(0, 0); return; }
    const c = e.target.closest('[data-csv]'); if (c && D.data) { const [name, rows] = CSV[c.dataset.csv](c.dataset.arg || undefined); download(name, rows); }
  });
  $('#refresh').addEventListener('click', () => load());
  render(); load(true);
})();
