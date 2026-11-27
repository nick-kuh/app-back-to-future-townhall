/* ===== Dados do evento: página de extração (Conexões · Reflexão · Sucesso · nuvem de palavras · feedback) =====
 * Usa a mesma senha do Painel do Doc (com a senha das dinâmicas, só Conexões, Reflexão e Sucesso). Busca tudo em /api/admin/export e monta as tabelas;
 * cada bloco baixa em um arquivo Excel (.xlsx, uma aba por tabela) e cada tabela também em .csv. */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TABS = [['conexoes', '⚡ Conexões'], ['reflexao', '💭 Reflexão'], ['sucesso', '🚀 Sucesso']];
  const MASTER_TABS = [['nuvem', '☁️ Nuvem de palavras'], ['feedback', '📝 Feedback']]; // só com a senha mestra (o servidor só manda esses dados para ela)
  const tabs = () => (D.data && D.data.feedback ? [...TABS, ...MASTER_TABS] : TABS);
  const D = { key: localStorage.getItem('bttf.admin') || '', data: null, tab: [...TABS, ...MASTER_TABS].some(t => '#' + t[0] === location.hash) ? location.hash.slice(1) : 'conexoes' };
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
  /* ---------- download em Excel (.xlsx de verdade, sem biblioteca: planilhas em XML dentro de um ZIP sem compressão) ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {
    const enc = new TextEncoder(), parts = [], central = []; let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data), h = new DataView(new ArrayBuffer(30)), c = new DataView(new ArrayBuffer(46));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      parts.push(new Uint8Array(h.buffer), name, data); central.push(new Uint8Array(c.buffer), name); offset += 30 + name.length + data.length;
    }
    const size = central.reduce((a, x) => a + x.length, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  const xml = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const col = n => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
  // sheets: [[nome da aba, linhas]] (a primeira linha é o cabeçalho, em negrito e congelado)
  function xlsx(file, sheets) {
    sheets = sheets.filter(([, rows]) => rows.length > 1);
    if (!sheets.length) return toast('Ainda não há dados para baixar.');
    const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    const sheet = rows => {
      const widths = rows[0].map((_, i) => Math.min(70, Math.max(8, ...rows.slice(0, 200).map(r => String(r[i] ?? '').length + 2))));
      return `${head}<worksheet xmlns="${NS}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${rows.map((r, y) => `<row r="${y + 1}">${r.map((v, x) => (v === '' || v === null || v === undefined ? '' : typeof v === 'number' && Number.isFinite(v) ? `<c r="${col(x)}${y + 1}"><v>${v}</v></c>` : `<c r="${col(x)}${y + 1}" t="inlineStr"${y ? '' : ' s="1"'}><is><t xml:space="preserve">${xml(v)}</t></is></c>`)).join('')}</row>`).join('')}</sheetData></worksheet>`;
    };
    const names = sheets.map(([n]) => xml(n.replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31)));
    const files = [
      { name: '[Content_Types].xml', text: `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
      { name: '_rels/.rels', text: `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: 'xl/workbook.xml', text: `${head}<workbook xmlns="${NS}" xmlns:r="${REL}"><sheets>${names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', text: `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', text: `${head}<styleSheet xmlns="${NS}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
      ...sheets.map(([, rows], i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheet(rows) })),
    ];
    const a = document.createElement('a'); a.href = URL.createObjectURL(zip(files)); a.download = file; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000); toast('Download iniciado: ' + file);
  }
  // um arquivo Excel por bloco (uma aba por tabela) e um com o evento inteiro
  const BOOKS = {
    conexoes: () => [['Duplas', CSV.pares()[1]], ['Perguntas por dupla', CSV.duplas()[1]], ['Ranking de cada pessoa', CSV.ranking()[1]], ['Matches', CSV.matches()[1]]],
    reflexao: () => [['Escolhas por pessoa', CSV.rfEscolhas()[1]], ['Votos', CSV.rfVotos()[1]], ['Mais votados por parada', CSV.rfResultado()[1]]],
    sucesso: () => [['Respostas', CSV.sucesso()[1]]],
    nuvem: () => [['Respostas', CSV.nuvem()[1]], ['Termos das nuvens', CSV.nuvemTermos()[1]]],
    feedback: () => [['Feedback', CSV.feedback()[1]]],
  };
  const BOOK_FILE = { conexoes: 'Conexoes.xlsx', reflexao: 'Reflexao.xlsx', sucesso: 'Sucesso.xlsx', nuvem: 'Nuvem_de_palavras.xlsx', feedback: 'Feedback.xlsx', tudo: 'Townhall_Dados.xlsx' };
  const book = k => xlsx(BOOK_FILE[k], k === 'tudo' ? [...BOOKS.conexoes().map(([n, r]) => ['Conexões · ' + n.replace(' de cada pessoa', ''), r]), ...BOOKS.reflexao().map(([n, r]) => ['Reflexão · ' + n.replace(' por parada', ''), r]), ['Sucesso · Respostas', CSV.sucesso()[1]],
    ...(D.data.feedback ? [['Nuvem · Respostas', CSV.nuvem()[1]], ['Nuvem · Termos', CSV.nuvemTermos()[1]], ['Feedback', CSV.feedback()[1]]] : [])] : BOOKS[k]());
  // Reflexão: uma linha por pessoa, uma coluna por parada, com o projeto que ela escolheu
  function choices() {
    const R = D.data.reflexao, by = new Map();
    R.paradas.forEach((p, i) => p.votes.forEach(v => { if (!by.has(v.name)) by.set(v.name, { name: v.name, test: v.test, picks: R.paradas.map(() => null) }); by.get(v.name).picks[i] = v; }));
    return [...by.values()].sort((a, b) => a.test - b.test || a.name.localeCompare(b.name, 'pt-BR'));
  }
  const CSV = {
    // Conexões: quem formou dupla com quem em cada viagem
    pares() {
      const rows = [['Viagem', 'Era', 'Dupla', 'Pessoa 1', 'Área 1', 'WL 1', 'Pessoa 2', 'Área 2', 'WL 2', 'Pessoa 3 (trio)', 'Perguntas que apareceram']];
      for (const r of D.data.conexoes.rounds) for (const g of r.groups) { const m = g.members; rows.push([r.round, `${r.era.label} ${r.era.year}`, g.code, m[0] ? m[0].name : '', m[0] ? m[0].area : '', m[0] ? m[0].wl : '', m[1] ? m[1].name : '', m[1] ? m[1].area : '', m[1] ? m[1].wl : '', m[2] ? m[2].name : '', g.questions.filter(q => q.shown).length]); }
      return ['Conexoes_Duplas.csv', rows];
    },
    rfEscolhas() {
      const R = D.data.reflexao, rows = [['Nome', ...R.paradas.map(p => `${p.n} · ${p.title}`), 'Paradas em que votou', 'Voto de teste']];
      for (const c of choices()) rows.push([c.name, ...c.picks.map(v => (v ? v.project : '')), c.picks.filter(Boolean).length, c.test ? 'Sim' : 'Não']);
      return ['Reflexao_Escolhas_por_pessoa.csv', rows];
    },
    // Conexões: uma linha por pergunta que cada dupla teve (as que apareceram durante a conversa)
    duplas() {
      const rows = [['Viagem', 'Era', 'Dupla', 'Pessoa 1', 'Área 1', 'WL 1', 'Pessoa 2', 'Área 2', 'WL 2', 'Pessoa 3 (trio)', 'Ordem', 'Pergunta', 'Categoria da pergunta']];
      for (const r of D.data.conexoes.rounds) for (const g of r.groups) {
        const m = g.members, base = [r.round, `${r.era.label} ${r.era.year}`, g.code, m[0] ? m[0].name : '', m[0] ? m[0].area : '', m[0] ? m[0].wl : '', m[1] ? m[1].name : '', m[1] ? m[1].area : '', m[1] ? m[1].wl : '', m[2] ? m[2].name : ''];
        const shown = g.questions.filter(q => q.shown);
        if (!shown.length) rows.push([...base, '', r.talked ? '' : '(a conversa ainda não aconteceu)', '']);
        shown.forEach((q, i) => rows.push([...base, i + 1, q.text, q.cat]));
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
    // Sucesso: todas as respostas de todas as perguntas, em uma tabela só
    sucesso() {
      const rows = [['Dinâmica', 'Pergunta', 'Nome', 'Resposta', 'Data/Hora']];
      for (const a of D.data.sucesso.acts) for (const r of a.responses) rows.push([`${a.id.slice(1).padStart(2, '0')} · ${a.title}`, a.question, r.name, r.answer, when(r.at)]);
      return ['Sucesso_Respostas.csv', rows];
    },
    // Nuvem de palavras: o que cada pessoa respondeu nas duas perguntas, e os termos de cada nuvem
    nuvem() {
      const N = D.data.nuvem, rows = [['Nome', `1 · ${N.perguntas[0]}`, `2 · ${N.perguntas[1]}`, 'Data/Hora']];
      for (const r of N.respostas) rows.push([r.name, r.words[0] || '', r.words[1] || '', when(r.at)]);
      return ['Nuvem_Respostas.csv', rows];
    },
    nuvemTermos() {
      const N = D.data.nuvem, rows = [['Pergunta', 'Termo', 'Pessoas']];
      N.clouds.forEach((c, i) => c.forEach(([w, n]) => rows.push([`${i + 1} · ${N.perguntas[i]}`, w, n])));
      return ['Nuvem_Termos.csv', rows];
    },
    // Feedback do encerramento (com o nome de quem respondeu)
    feedback() {
      const rows = [['Nome', 'Área', 'Nota (1 a 5)', 'O que mais gostou', 'O que melhorar', 'Data/Hora']];
      for (const f of D.data.feedback.list) rows.push([f.name, f.area, f.rating, f.liked, f.improve, when(f.at)]);
      return ['Feedback.csv', rows];
    },
  };
  const dl = (label, key, arg = '', n = 1) => `<button class="btn sm ghost" data-csv="${key}" data-arg="${arg}" ${n ? '' : 'disabled'}>⬇ ${label}</button>`;
  const dx = (label, key, n = 1) => `<button class="btn" data-book="${key}" ${n ? '' : 'disabled'}>⬇ ${label}</button>`;

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
        <div class="actions">${dx('Baixar tudo das Conexões (Excel)', 'conexoes', groups.length)}<span class="small">ou em .csv:</span>${dl('Duplas', 'pares', '', groups.length)}${dl('Perguntas por dupla', 'duplas', '', groups.length)}${dl('Ranking', 'ranking', '', people.length)}${dl('Matches', 'matches', '', withMatch.length)}</div></div>
      <div class="card"><h2>1 · Duplas e perguntas de cada viagem</h2><p class="small">Para cada dupla, as perguntas que apareceram no celular dela durante a conversa, na ordem em que apareceram.</p>${rounds}</div>
      <div class="card"><h2>2 · Ranking de cada pessoa</h2><p class="small">Depois das viagens, cada pessoa ordena as conversas que teve (1º = a que mais gostou). 1º vale 3 pontos, 2º vale 2 e 3º vale 1; "pontos" soma o que os dois deram um ao outro.</p>
        ${table(['Pessoa', 'Viagem', 'Conversou com', 'Posição que deu', 'Posição que recebeu', 'Pontos'], rankRows, 'Nenhuma viagem aconteceu ainda.')}</div>
      <div class="card"><h2>3 · Match de cada pessoa</h2><p class="small">A conexão sugerida é a conversa com mais pontos somados. É mútua quando os dois são a conexão sugerida um do outro.</p>
        ${table(['Pessoa', 'Conexão sugerida', 'Pontos', 'Mútua'], matchRows, 'As conexões ainda não foram calculadas.')}</div>`;
  }

  /* ---------- Reflexão: resultado e votos de cada parada ---------- */
  function vReflexao() {
    const R = D.data.reflexao, votes = R.paradas.reduce((a, p) => a + p.votes.length, 0), list = choices();
    const matrix = table(['Pessoa', ...R.paradas.map(p => `${p.n} · ${esc(p.title)}`)], list.map(c => `<tr><td>${esc(c.name)}</td>${c.picks.map(v => `<td>${v ? esc(v.project) : '<span class="muted">—</span>'}</td>`).join('')}</tr>`), 'Ninguém votou ainda.');
    const paradas = R.paradas.map(p => `<h3>Parada ${p.n} · ${esc(p.title)}</h3><p class="small">${esc(p.question)} · ${plural(p.votes.length, 'voto', 'votos')} em ${plural(p.tally.length, 'projeto', 'projetos')}${p.revealed ? ' · revelada no telão' : ''}</p>
        ${table(['Colocação', 'Projeto', 'Responsável pelo projeto', 'Votos'], p.tally.map(t => `<tr><td>${t.place ? `<span class="tag gold">${t.place === 1 ? '🏆 ' : ''}${t.place}º mais votado</span>` : t.skipped ? '<span class="tag warn">mesmo responsável</span>' : '<span class="muted">—</span>'}</td><td>${esc(t.project)}</td><td>${esc(t.owner)}</td><td class="n">${t.votes}</td></tr>`), 'Nenhum voto nesta parada.')}`).join('');
    return `<div class="card"><h1>💭 Reflexão · ${esc(R.title)}</h1>
        <div class="stats"><div class="stat"><b>${list.length}</b><span>pessoas votaram</span></div><div class="stat"><b>${votes}</b><span>votos no total</span></div><div class="stat"><b>${R.paradas.filter(p => p.votes.length).length}/${R.paradas.length}</b><span>paradas com votos</span></div></div>
        <div class="actions">${dx('Baixar tudo da Reflexão (Excel)', 'reflexao', votes)}<span class="small">ou em .csv:</span>${dl('Escolhas por pessoa', 'rfEscolhas', '', votes)}${dl('Todos os votos', 'rfVotos', '', votes)}${dl('Mais votados por parada', 'rfResultado', '', votes)}</div></div>
      <div class="card"><h2>1 · O que cada pessoa escolheu</h2><p class="small">Uma linha por pessoa; em cada parada, o projeto em que ela votou.</p>${matrix}</div>
      <div class="card"><h2>2 · Contagem e mais votados de cada parada</h2><p class="small">Os 2 mais votados nunca são do mesmo responsável: o projeto de quem já está entre os escolhidos fica marcado como "mesmo responsável" e dá lugar ao seguinte.</p>${paradas}</div>`;
  }

  /* ---------- Sucesso: as respostas de cada pergunta ---------- */
  function vSucesso() {
    const acts = D.data.sucesso.acts, total = acts.reduce((a, x) => a + x.responses.length, 0);
    if (!acts.length) return '<div class="card"><h1>🚀 De Volta para o Sucesso</h1><p class="empty">As dinâmicas do Sucesso ainda estão carregando. Clique em "Atualizar" em instantes.</p></div>';
    const rows = acts.flatMap(a => a.responses.map((r, i) => `<tr class="${i ? '' : 'first'}"><td>${i ? '' : `<b>${a.id.slice(1).padStart(2, '0')} · ${esc(a.title)}</b><div class="meta">${esc(a.question)}</div>`}</td><td>${esc(r.name)}</td><td>${esc(r.answer)}</td><td>${esc(when(r.at))}</td></tr>`));
    return `<div class="card"><h1>🚀 De Volta para o Sucesso</h1>
        <div class="stats">${acts.map(a => `<div class="stat"><b>${a.responses.length}</b><span>${a.id.slice(1).padStart(2, '0')} · ${esc(a.title)}</span></div>`).join('')}</div>
        <div class="actions">${dx('Baixar todas as respostas (Excel)', 'sucesso', total)}<span class="small">ou em .csv:</span>${dl('Todas as respostas', 'sucesso', '', total)}</div></div>
      <div class="card"><h2>Todas as respostas de todas as perguntas</h2><p class="small">As quatro perguntas em uma tabela só, na ordem das dinâmicas.</p>
        ${table(['Pergunta', 'Nome', 'Resposta', 'Hora'], rows, 'Nenhuma resposta ainda.')}</div>`;
  }

  /* ---------- Nuvem de palavras: as respostas das duas perguntas ---------- */
  function vNuvem() {
    const N = D.data.nuvem, n = N.respostas.length;
    const terms = i => table(['Termo', 'Pessoas'], (N.clouds[i] || []).map(([w, c]) => `<tr><td>${esc(w)}</td><td class="n">${c}</td></tr>`), 'Ainda sem respostas.');
    return `<div class="card"><h1>☁️ Nuvem de palavras</h1>
        <div class="stats"><div class="stat"><b>${n}</b><span>pessoas responderam</span></div><div class="stat"><b>${(N.clouds[0] || []).length}</b><span>termos na nuvem 1</span></div><div class="stat"><b>${(N.clouds[1] || []).length}</b><span>termos na nuvem 2</span></div></div>
        <div class="actions">${dx('Baixar a nuvem de palavras (Excel)', 'nuvem', n)}<span class="small">ou em .csv:</span>${dl('Respostas', 'nuvem', '', n)}${dl('Termos das nuvens', 'nuvemTermos', '', n)}</div></div>
      <div class="card"><h2>1 · O que cada pessoa respondeu</h2>${table(['Pessoa', `1 · ${esc(N.perguntas[0])}`, `2 · ${esc(N.perguntas[1])}`, 'Hora'], N.respostas.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.words[0] || '')}</td><td>${esc(r.words[1] || '')}</td><td>${esc(when(r.at))}</td></tr>`), 'Ninguém respondeu ainda.')}</div>
      <div class="card"><h2>2 · Os termos de cada nuvem</h2><p class="small">Respostas curtas entram inteiras; frases são quebradas em palavras (sem os conectivos). O número é quantas pessoas escreveram o termo.</p>
        <h3>1 · ${esc(N.perguntas[0])}</h3>${terms(0)}<h3>2 · ${esc(N.perguntas[1])}</h3>${terms(1)}</div>`;
  }
  /* ---------- Feedback do encerramento ---------- */
  function vFeedback() {
    const F = D.data.feedback, S = F.stats, mx = Math.max(1, ...S.dist);
    return `<div class="card"><h1>📝 Feedback do Townhall</h1>
        <div class="stats"><div class="stat"><b>${S.count}</b><span>respostas</span></div><div class="stat"><b>${S.count ? String(S.avg).replace('.', ',') : '—'}</b><span>nota média (de 1 a 5)</span></div>${[5, 4, 3, 2, 1].map(k => `<div class="stat"><b>${S.dist[k - 1]}</b><span>nota ${k}</span></div>`).join('')}</div>
        <div class="actions">${dx('Baixar o feedback (Excel)', 'feedback', S.count)}<span class="small">ou em .csv:</span>${dl('Feedback', 'feedback', '', S.count)}</div></div>
      <div class="card"><h2>Todas as respostas</h2><p class="small">Cada resposta com o nome de quem respondeu. Os dois textos são opcionais.</p>
        ${table(['Pessoa', 'Nota', 'O que mais gostou', 'O que melhorar', 'Hora'], F.list.map(f => `<tr><td>${esc(f.name)}</td><td class="n">${f.rating}</td><td>${esc(f.liked)}</td><td>${esc(f.improve)}</td><td>${esc(when(f.at))}</td></tr>`), 'Ninguém respondeu ainda. O formulário aparece nos celulares no encerramento.')}</div>`;
  }

  function render() {
    if (!tabs().some(t => t[0] === D.tab) && D.data) D.tab = 'conexoes';
    $('#tabs').innerHTML = tabs().map(([k, l]) => `<button type="button" class="${D.tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('');
    if (!D.data) return;
    $('#stamp').textContent = `${D.data.event} · atualizado às ${new Date(D.data.now).toLocaleTimeString('pt-BR')}`;
    $('#main').innerHTML = ({ conexoes: vConexoes, reflexao: vReflexao, sucesso: vSucesso, nuvem: vNuvem, feedback: vFeedback })[D.tab]();
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
    const c = e.target.closest('[data-csv]'); if (c && D.data) { const [name, rows] = CSV[c.dataset.csv](c.dataset.arg || undefined); download(name, rows); return; }
    const x = e.target.closest('[data-book]'); if (x && D.data) book(x.dataset.book);
  });
  $('#refresh').addEventListener('click', () => load());
  render(); load(true);
})();
