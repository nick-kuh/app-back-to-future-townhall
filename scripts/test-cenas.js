// Cenas do deck do townhall (server/cenas.js): conteúdo em português, estado ao vivo e comandos do Doc.
// 1) o módulo direto, com banco em memória · 2) pelo servidor de verdade (roteiro, API do admin, estado público).
process.env.DB_PATH = ':memory:';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');
const { createCenas, KINDS, META, HOST_KEYS } = require('../server/cenas');
const { kvGet, kvSet } = require('../server/db');

// A estratégia 2027 entra no app exatamente como foi enviada: este é o SHA-256 do arquivo original.
const STRATEGY_SHA256 = '07d7a467caaec2b26381eab3be2d32ff5b8054262768b371868aafcaef45b30d';

/* ---------------- 1) o módulo ---------------- */
{
  const c = createCenas();
  assert.deepEqual(KINDS, ['agenda', 'boasvindas', 'almanaque', 'ia', 'reconhecimento', 'intervalo', 'visao', 'manifesto', 'mph']);
  for (const k of KINDS) { assert.ok(META[k].name); assert.equal(c.publicState(k).kind, k); }
  assert.equal(c.publicState('nao-existe'), null);
  assert.equal(c.evento().titulo, 'CDIO HC + BPC'); assert.equal(c.evento().destino, 'DEZ 11 2027');

  // plano de voo: 14:00 às 17:00, 180 minutos em 4 atos (40 · 50 · 40 · 50), como na agenda do deck
  // ("Como a IA nos ajudou em 2026" é o bloco Reflexão e o "Manifesto 2027" é o bloco Sucesso: um item e um passo para cada)
  const steps = [{ type: 'checkin' }, { type: 'cena', cena: 'agenda' }, { type: 'cena', cena: 'boasvindas' }, { type: 'connections' }, { type: 'cena', cena: 'almanaque' }, { type: 'reflexao' }, { type: 'cena', cena: 'reconhecimento' },
    { type: 'cena', cena: 'intervalo' }, { type: 'cena', cena: 'visao' }, { type: 'sucesso', activity: 'd1' }, { type: 'sucesso', activity: 'd2' }, { type: 'doc' }, { type: 'cena', cena: 'mph' }, { type: 'closing' }];
  let ag = c.publicState('agenda', { steps, index: 5 }); // o evento está na Reflexão
  assert.deepEqual(ag.itens.map(x => x.t), ['Chegada e vídeo de abertura', 'Boas-vindas e jornada', 'Conexão', 'Jornada 2026', 'Reflexão', 'Reconhecimento 2026', 'Intervalo', 'Transição e visão 2027', 'Sucesso', '88 MPH · Encerramento']);
  assert.match(ag.itens[4].d, /Como a IA nos ajudou em 2026/); assert.match(ag.itens[8].d, /Manifesto 2027/);
  assert.equal(ag.inicio, '14:00'); assert.equal(ag.fim, '17:00'); assert.equal(ag.total, 180);
  assert.deepEqual(ag.atos.map(a => [a.n, a.nome, a.de, a.ate, a.min]), [['ATO I', 'Reconectar', '14:00', '14:40', 40], ['ATO II', 'Rebobinar 2026', '14:40', '15:30', 50], ['ATO III', 'Reconhecer', '15:30', '16:10', 40], ['ATO IV', 'Avançar para 2027', '16:10', '17:00', 50]]);
  assert.deepEqual(ag.itens.map(x => x.hora), ['14:00', '14:10', '14:20', '14:40', '15:15', '15:30', '15:55', '16:10', '16:40', '16:55']);
  assert.deepEqual(ag.itens.map(x => x.min), [10, 10, 20, 35, 15, 25, 15, 30, 15, 5]);
  assert.deepEqual(ag.itens.map(x => x.estado), ['feito', 'feito', 'feito', 'feito', 'agora', '', '', '', '', ''], 'o item Reflexão acompanha o bloco Reflexão');
  for (const i of [9, 10, 11]) assert.deepEqual(c.publicState('agenda', { steps, index: i }).itens.map(x => x.estado).slice(7), ['feito', 'agora', ''], 'as dinâmicas do Sucesso e o Doc contam para o item Sucesso');
  assert.ok(c.publicState('agenda').itens.every(x => x.estado === ''), 'sem roteiro, nada marcado');

  // almanaque: os mesmos números do deck (41 entregas · €51,3M · HC 15 · BPC 10 · CROSS BU 16)
  const al = c.publicState('almanaque');
  assert.equal(al.itens.length, 51); assert.equal(al.stats.entregues, 41); assert.equal(al.stats.beneficios, 51291050); assert.equal(al.stats.beneficiosTxt, '€51,3M');
  assert.deepEqual(al.stats.bus.map(b => [b.bu, b.n, b.txt]), [['HC', 15, '€9,3M'], ['BPC', 10, '€41,0M'], ['X', 16, '€992K']]);
  assert.deepEqual(al.stats.porTipo, { E: 41, M: 7, R: 2, C: 1 }); assert.deepEqual(al.stats.porBu, { HC: 16, BPC: 18, X: 16 });
  assert.equal(al.itens.filter(x => x.m === 5).length, 10, 'junho tem 10 itens'); assert.equal(al.meses[5], 'JUN');
  assert.equal(al.live.mes, -1, 'começa em branco');
  c.command('almanaque', { action: 'mes', mes: 5 }); assert.equal(c.publicState('almanaque').live.mes, 5);
  c.command('almanaque', { action: 'prox' }); c.command('almanaque', { action: 'prox' }); assert.equal(c.publicState('almanaque').live.mes, 7);
  c.command('almanaque', { action: 'mes', mes: 11 }); c.command('almanaque', { action: 'prox' }); assert.equal(c.publicState('almanaque').live.mes, 11, 'não passa de dezembro');
  c.command('almanaque', { action: 'filtro', key: 'HC' }); c.command('almanaque', { action: 'filtro', key: 'M' }); assert.deepEqual(c.publicState('almanaque').live.off, ['HC', 'M']);
  c.command('almanaque', { action: 'filtro', key: 'HC' }); assert.deepEqual(c.publicState('almanaque').live.off, ['M']);
  assert.throws(() => c.command('almanaque', { action: 'filtro', key: 'ZZ' }), /inválido/);
  c.command('almanaque', { action: 'pagina', on: true }); assert.equal(c.publicState('almanaque').live.pagina, true);
  c.command('almanaque', { action: 'tocar' }); let l = c.publicState('almanaque').live; assert.equal(l.tocando, true); assert.equal(l.mes, 0); assert.equal(l.pagina, false, 'tocar o ano começa em janeiro');
  c.command('almanaque', { action: 'tocar' }); assert.equal(c.publicState('almanaque').live.tocando, false, 'tocar de novo pausa');
  c.command('almanaque', { action: 'tocar' }); c.sync('ia'); assert.equal(c.publicState('almanaque').live.tocando, false, 'sair da cena para o ano');
  c.enter('almanaque'); assert.equal(c.publicState('almanaque').live.mes, -1, 'entrar na cena recomeça em branco');

  // reconhecimento: o vencedor só vai para os aparelhos quando o sorteio do prêmio começa
  let rc = c.publicState('reconhecimento');
  assert.equal(rc.premios.length, 4); assert.deepEqual(rc.premios.map(p => p.n), ['Flux Capacitor', 'Marty & Doc', 'The Garage', 'Great Scott!']);
  assert.ok(rc.premios.every(p => p.vencedor === undefined && p.citacao === undefined && !p.feito), 'envelopes lacrados');
  assert.equal(rc.exemplo, true); assert.ok(!/confirmar/.test(rc.fala), 'o "(a confirmar)" fica só no painel');
  assert.throws(() => c.command('reconhecimento', { action: 'indicados' }), /Abra a cerimônia/);
  c.command('reconhecimento', { action: 'fase', fase: 'premios' }); c.command('reconhecimento', { action: 'abrir', premio: 1 });
  rc = c.publicState('reconhecimento'); assert.equal(rc.live.fase, 'cerimonia'); assert.equal(rc.live.premio, 1); assert.equal(rc.live.passo, 'categoria'); assert.equal(rc.premios[1].vencedor, undefined);
  assert.equal(c.tap(1, 47), false, 'toque fora da hora da carga não conta'); assert.equal(c.mic(.1, .5), false, 'aplauso fora da hora da carga não conta');
  c.command('reconhecimento', { action: 'indicados' }); assert.throws(() => c.command('reconhecimento', { action: 'indicados' }), /já passou/);
  c.command('reconhecimento', { action: 'carregar' }); assert.equal(c.publicState('reconhecimento').live.passo, 'carga');
  let pulses = 0, last = null; c.onPulse(p => { pulses++; last = p; });
  // padrão: os aplausos carregam (o microfone do Painel do Doc manda quanto a carga anda e o nível do som); os toques não contam
  assert.equal(c.publicState('reconhecimento').carga, 'mic'); assert.equal(c.tap(7, 47), false, 'no modo microfone, o toque no celular não soma');
  assert.equal(c.mic(.05, .7), true); assert.ok(Math.abs(c.publicState('reconhecimento').live.carga - .05) < 1e-9); assert.equal(c.publicState('reconhecimento').live.nivel, .7);
  assert.deepEqual(last, { kind: 'reconhecimento', carga: .05, nivel: .7 }, 'o telão recebe a carga e o nível do som');
  c.mic(9, 5); assert.ok(Math.abs(c.publicState('reconhecimento').live.carga - .25) < 1e-9, 'cada aviso do microfone soma no máximo 20%'); assert.equal(c.publicState('reconhecimento').live.nivel, 1);
  c.mic(-.03, 0); assert.ok(Math.abs(c.publicState('reconhecimento').live.carga - .22) < 1e-9, 'no silêncio a carga escorre devagar'); c.mic(-5, 0); c.mic(-5, 0); c.mic(-5, 0); assert.equal(c.publicState('reconhecimento').live.carga, 0, 'nunca abaixo de zero');
  c.setConfig({ reconhecimento: { carga: 'xyz' } }); assert.equal(c.adminState().config.reconhecimento.carga, 'mic', 'modo desconhecido é ignorado');
  c.setConfig({ reconhecimento: { carga: 'ambos' } }); assert.equal(c.tap(8, 47), true); assert.equal(c.mic(.01, .2), true, 'nos dois modos juntos, aplausos e toques somam');
  c.setConfig({ reconhecimento: { carga: 'toques' } }); assert.equal(c.mic(.1, .5), false, 'só toques: o microfone não conta'); assert.equal(c.publicState('reconhecimento').carga, 'toques');
  const base = c.publicState('reconhecimento').live.carga;
  for (let i = 0; i < 12; i++) assert.equal(c.tap(7, 47), true);
  assert.equal(c.tap(7, 47), false, 'no máximo 12 toques por segundo por pessoa');
  const carga = c.publicState('reconhecimento').live.carga; assert.ok(Math.abs(carga - base - 12 / (47 * 6)) < 1e-9, 'cada toque soma 1/(pessoas × 6)');
  c.command('reconhecimento', { action: 'carga', v: .5 }); assert.ok(c.publicState('reconhecimento').live.carga > .5);
  assert.equal(c.publicState('reconhecimento').premios[1].vencedor, undefined, 'ainda sem vencedor durante a carga');
  c.command('reconhecimento', { action: 'carga', v: 1 }); // encheu: o raio cai sozinho
  rc = c.publicState('reconhecimento'); assert.equal(rc.live.passo, 'sorteio'); assert.equal(rc.premios[1].vencedor, 1); assert.equal(rc.premios[1].indicados[1].nome, 'Giovana & Lucas'); assert.equal(rc.premios[1].feito, false);
  assert.equal(rc.premios[0].vencedor, undefined, 'os outros prêmios continuam lacrados');
  c.command('reconhecimento', { action: 'vencedor' });
  rc = c.publicState('reconhecimento'); assert.equal(rc.live.passo, 'vencedor'); assert.deepEqual(rc.live.feitos, [1]); assert.equal(rc.premios[1].feito, true); assert.ok(rc.premios[1].citacao);
  c.command('reconhecimento', { action: 'fase', fase: 'hall' }); rc = c.publicState('reconhecimento'); assert.equal(rc.live.fase, 'hall'); assert.equal(rc.premios[1].vencedor, 1, 'revelado continua revelado');
  c.enter('reconhecimento'); rc = c.publicState('reconhecimento'); assert.equal(rc.live.fase, 'intro'); assert.deepEqual(rc.live.feitos, [1], 'voltar à cena mantém os prêmios revelados');
  c.command('reconhecimento', { action: 'abrir', premio: 1 }); assert.deepEqual(c.publicState('reconhecimento').live.feitos, [], 'abrir de novo refaz a cerimônia');
  c.command('reconhecimento', { action: 'indicados' }); c.command('reconhecimento', { action: 'raio' }); assert.equal(c.publicState('reconhecimento').live.passo, 'sorteio');
  c.sync('intervalo'); assert.equal(c.publicState('reconhecimento').live.passo, 'indicados', 'sair da cena no meio do sorteio cancela o sorteio');
  // os aplausos enchem o capacitor: com 100% o raio cai sozinho
  c.setConfig({ reconhecimento: { carga: 'mic' } }); c.command('reconhecimento', { action: 'abrir', premio: 0 }); c.command('reconhecimento', { action: 'indicados' }); c.command('reconhecimento', { action: 'carregar' });
  for (let i = 0; i < 5; i++) c.mic(.2, 1); rc = c.publicState('reconhecimento'); assert.equal(rc.live.passo, 'sorteio'); assert.equal(rc.live.carga, 1); assert.equal(rc.live.nivel, 0);
  c.sync('intervalo'); c.command('reconhecimento', { action: 'reset' }); c.resetConfig('reconhecimento');

  // quem conduz cada bloco (aparece no telão com a foto de perfil)
  assert.deepEqual(HOST_KEYS, ['connections', 'almanaque', 'reflexao', 'reconhecimento', 'visao', 'sucesso']);
  assert.deepEqual(c.hosts('connections'), ['Nicolas Kuhnast', 'Douglas Hamasaki']); assert.deepEqual(c.hosts('reflexao'), ['Felipe Zompero', 'Mayara Gomes', 'Pedro Teixeira', 'Geovanna Moreira']);
  assert.deepEqual(c.hosts('sucesso'), ['Lucas Barbosa', 'Giovana Romão', 'Maria Eduarda']); assert.deepEqual(c.hosts('reconhecimento'), ['Felipe Resck']); assert.deepEqual(c.hosts('agenda'), []); assert.deepEqual(c.hosts('xyz'), []);
  assert.equal(c.publicState('almanaque').quem, 'Claudia Meira e Fermín Grandas'); assert.equal(c.publicState('visao').quem, 'Claudia Meira e Fermín Grandas'); assert.deepEqual(c.hosts('visao'), ['Claudia Meira', 'Fermín Grandas']); assert.equal(c.publicState('reconhecimento').quem, 'Felipe Resck');
  c.setConfig({ anfitrioes: { visao: ['Ana', '  ', 'Bia', 'Caio'], sucesso: [] } }); assert.deepEqual(c.hosts('visao'), ['Ana', 'Bia', 'Caio']); assert.equal(c.publicState('visao').quem, 'Ana, Bia e Caio'); assert.deepEqual(c.hosts('sucesso'), []);
  assert.deepEqual(c.hosts('connections'), ['Nicolas Kuhnast', 'Douglas Hamasaki'], 'os outros blocos não mudam'); c.resetConfig('anfitrioes'); assert.deepEqual(c.hosts('sucesso'), ['Lucas Barbosa', 'Giovana Romão', 'Maria Eduarda']);

  // participação especial nas Conexões (quem ajudou a organizar): nomes e a frase, editáveis
  assert.deepEqual(c.especial(), { nomes: ['Vinicius Santos'], nota: 'Ajudou em toda a organização. Obrigado!' });
  c.setConfig({ anfitrioes: { especial: ['Ana', ''], especialNota: 'Valeu!' } }); assert.deepEqual(c.especial(), { nomes: ['Ana'], nota: 'Valeu!' }); assert.deepEqual(c.hosts('connections'), ['Nicolas Kuhnast', 'Douglas Hamasaki']);
  c.resetConfig('anfitrioes'); assert.deepEqual(c.especial().nomes, ['Vinicius Santos']);

  // intervalo: 15 minutos, pausar, somar tempo
  let iv = c.publicState('intervalo'); assert.equal(iv.min, 15); assert.equal(iv.live.phase, 'idle'); assert.equal(iv.live.remaining, 900);
  c.command('intervalo', { action: 'start' }); iv = c.publicState('intervalo'); assert.equal(iv.live.phase, 'run'); assert.ok(Math.abs(iv.live.endsAt - Date.now() - 900000) < 2000);
  c.command('intervalo', { action: 'pause' }); iv = c.publicState('intervalo'); assert.equal(iv.live.phase, 'paused'); assert.ok(iv.live.remaining >= 899 && iv.live.remaining <= 900);
  c.command('intervalo', { action: 'add', seconds: 60 }); assert.ok(c.publicState('intervalo').live.remaining >= 959);
  c.command('intervalo', { action: 'resume' }); assert.equal(c.publicState('intervalo').live.phase, 'run');
  c.command('intervalo', { action: 'start', min: 10 }); assert.equal(c.publicState('intervalo').live.duration, 600);
  c.command('intervalo', { action: 'reset' }); assert.equal(c.publicState('intervalo').live.phase, 'idle');

  // 88 MPH e a estratégia
  assert.equal(c.publicState('mph').live.at, null); c.command('mph', { action: 'go' }); assert.ok(c.publicState('mph').live.at > 0);
  c.enter('mph'); assert.equal(c.publicState('mph').live.at, null, 'entrar na cena volta o velocímetro a zero');
  assert.equal(c.publicState('visao').src, '/estrategia-2027.html'); assert.equal(c.publicState('visao').live.intro, false);
  c.command('visao', { action: 'intro', on: true }); assert.equal(c.publicState('visao').live.intro, true);
  assert.throws(() => c.command('boasvindas', { action: 'x' }), /não tem comandos/);
  assert.equal(c.publicState('ia').nota, undefined, 'a nota para quem apresenta não vai para o telão'); assert.ok(c.adminState().config.ia.nota);

  // conteúdo editável: valida, guarda e restaura
  c.setConfig({ agenda: { inicio: '15:30', itens: [{ ato: 1, t: 'Chegada e vídeo de abertura', d: 'x', min: 20 }, { ato: 4, t: 'Novo item', d: '', min: 40 }] }, atos: ['Um', 'Dois', 'Três', 'Quatro'] });
  ag = c.publicState('agenda', { steps, index: 0 }); assert.equal(ag.inicio, '15:30'); assert.equal(ag.fim, '16:30'); assert.deepEqual(ag.itens.map(x => x.hora), ['15:30', '15:50']); assert.equal(ag.atos[0].nome, 'Um');
  assert.equal(ag.itens[0].estado, 'agora', 'o item de mesmo título continua ligado ao passo do roteiro');
  assert.throws(() => c.setConfig({ agenda: { itens: [] } }), /pelo menos um item/); assert.throws(() => c.setConfig({ xyz: {} }), /desconhecida/);
  const premios = JSON.parse(JSON.stringify(c.adminState().config.reconhecimento.premios));
  assert.throws(() => c.setConfig({ reconhecimento: { premios: [{ ...premios[0], indicados: [{ nome: 'Só um' }] }] } }), /pelo menos 2 indicados/);
  premios[0].indicados = [{ nome: 'Ana', projeto: 'P1' }, { nome: 'Bia', projeto: 'P2' }, { nome: 'Caio', projeto: 'P3' }]; premios[0].vencedor = 9;
  c.setConfig({ reconhecimento: { premios, video: 'javascript:alert(1)' } });
  let cfg = c.adminState().config.reconhecimento; assert.equal(cfg.premios[0].vencedor, 3, 'vencedor limitado ao tamanho da lista'); assert.equal(cfg.exemplo, false, 'indicados editados deixam de ser "de exemplo"'); assert.equal(cfg.video, '', 'só endereços http(s) ou do próprio site');
  c.setConfig({ reconhecimento: { video: 'https://exemplo.com/tributo.mp4' } }); assert.equal(c.adminState().config.reconhecimento.video, 'https://exemplo.com/tributo.mp4');
  c.setConfig({ almanaque: { itens: [{ m: 2, k: 'E', bu: 'HC', v: 1500000, t: 'Entrega A' }, { m: 0, k: 'M', bu: '', v: 0, t: 'Marco B' }, { m: 2, k: 'ZZ', bu: 'QQ', v: -5, t: 'Item C' }] } });
  const a2 = c.publicState('almanaque'); assert.deepEqual(a2.itens.map(x => [x.m, x.k, x.bu, x.v]), [[0, 'M', '', 0], [2, 'E', 'HC', 1500000], [2, 'M', '', 0]]); assert.equal(a2.stats.entregues, 1); assert.equal(a2.stats.beneficiosTxt, '€1,5M');
  const again = createCenas(); assert.equal(again.adminState().config.agenda.inicio, '15:30', 'o conteúdo fica guardado no banco');
  c.resetConfig('agenda'); assert.equal(c.adminState().config.agenda.inicio, '14:00'); assert.equal(c.adminState().config.almanaque.itens.length, 3, 'restaurar uma seção não mexe nas outras');
  c.resetConfig(); assert.equal(c.adminState().config.almanaque.itens.length, 51); assert.equal(c.adminState().config.reconhecimento.exemplo, true);
  c.resetState({ silent: true });
  // conteúdo guardado antes de juntar os blocos (versão 1): a agenda e a Visão 2027 voltam ao padrão novo uma vez; o resto editado fica
  const old = kvGet('cenas'); old.v = 1; old.config.agenda.itens = [{ ato: 2, t: 'Como a IA nos ajudou em 2026', d: 'antigo', min: 15 }]; old.config.visao.quem = 'Outra pessoa'; old.config.intervalo.min = 22; delete old.config.anfitrioes; kvSet('cenas', old);
  const up = createCenas(), ucfg = up.adminState().config;
  assert.equal(ucfg.agenda.itens.length, 10); assert.equal(ucfg.agenda.itens[4].t, 'Reflexão'); assert.equal(ucfg.visao.quem, 'Claudia Meira e Fermín Grandas'); assert.equal(ucfg.visao.kicker, 'Visão 2027'); assert.equal(ucfg.intervalo.min, 22, 'o que não mudou de formato continua como foi editado');
  assert.deepEqual(up.hosts('connections'), ['Nicolas Kuhnast', 'Douglas Hamasaki']);
  up.setConfig({ intervalo: { min: 15 } }); assert.equal(kvGet('cenas').v, 2, 'depois de atualizado, não volta a mexer');
  console.log('OK · cenas: agenda, almanaque, reconhecimento (aplausos e toques), anfitriões, intervalo, 88 MPH e conteúdo editável');
}

/* ---------------- 2) pelo servidor ---------------- */
const PORT = 4100 + Math.floor(Math.random() * 90), B = `http://localhost:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'th-cenas-'));
const env = { ...process.env, PORT: String(PORT), DATA_DIR, ADMIN_PASSWORD: 'teste' }; delete env.DB_PATH;
const srv = spawn(process.execPath, ['--no-warnings', path.join(__dirname, '..', 'server', 'index.js')], { env, stdio: ['ignore', 'pipe', 'inherit'] });
const call = async (method, url, body, auth = true) => {
  const r = await fetch(B + url, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { 'x-admin-key': 'teste' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, json, text };
};
const waitUp = async () => { for (let i = 0; i < 50; i++) { try { await fetch(B + '/health'); return; } catch { await new Promise(r => setTimeout(r, 100)); } } throw new Error('servidor não subiu'); };

(async () => {
  try {
    await waitUp();
    const state = async () => (await call('GET', '/api/state', undefined, false)).json;
    const cena = (kind, a) => call('POST', '/api/admin/cena', { kind, ...a });
    const steps = (await call('GET', '/api/admin/overview')).json.settings.steps, id = k => steps.find(s => (s.type === 'cena' ? s.cena : s.type) === k).id, go = k => call('POST', '/api/admin/step', { id: id(k) });

    // a estratégia 2027 é servida exatamente como foi enviada
    const strat = await fetch(B + '/estrategia-2027.html'), bytes = Buffer.from(await strat.arrayBuffer());
    assert.equal(strat.status, 200); assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), STRATEGY_SHA256, 'o arquivo da estratégia não pode ser alterado');
    assert.match(bytes.toString('utf8', 0, 600), /CDIO LATAM 2027 Strategy/);

    // check-in: o nome do evento e os circuitos de tempo; nenhuma cena no ar
    let st = await state(); assert.equal(st.block, 'welcome'); assert.equal(st.cena, null); assert.equal(st.evento.titulo, 'CDIO HC + BPC'); assert.equal(st.event.name, 'CDIO HC + BPC · Townhall 2026'); assert.equal(st.creditos, null);
    let r = await call('POST', '/api/admin/cena', { kind: 'mph', action: 'go' }, false); assert.equal(r.status, 401);
    r = await cena('mph', { action: 'go' }); assert.equal(r.status, 409, 'a cena precisa estar no ar');

    // plano de voo: o passo no ar marca a agenda
    r = await go('agenda'); assert.equal(r.status, 200); st = await state();
    assert.equal(st.block, 'cena'); assert.equal(st.cena.kind, 'agenda'); assert.equal(st.step.cena, 'agenda'); assert.equal(st.cena.itens[0].estado, 'agora'); assert.equal(st.audio.mode, 'off');
    assert.equal(st.step.transition, true, 'o plano de voo entra com a transição do filme'); assert.deepEqual(st.hosts, [], 'a agenda não tem anfitrião'); assert.deepEqual(st.cena.hosts, []);
    // roteiro padrão: Reflexão e Sucesso são um bloco só cada; boas-vindas, reconhecimento, intervalo, Visão 2027, Sucesso, o Doc, 88 MPH e créditos entram direto (sem transição)
    assert.deepEqual(steps.map(x => (x.cena || x.activity || x.type) + (x.transition === false ? '' : '*')), ['checkin*', 'agenda*', 'boasvindas', 'connections*', 'almanaque*', 'reflexao*', 'reconhecimento', 'intervalo', 'visao', 'd1', 'd2', 'd3', 'd4', 'doc', 'mph', 'closing']);
    r = await go('boasvindas'); st = await state(); assert.equal(st.step.transition, false);
    // quem conduz: nomes e fotos no estado público (Conexões, e a cena leva os seus)
    r = await go('connections'); st = await state(); assert.deepEqual(st.hosts.map(h => h.nome), ['Nicolas Kuhnast', 'Douglas Hamasaki']); assert.ok(st.hosts.every(h => 'foto' in h)); assert.equal(st.step.transition, true);
    assert.deepEqual(st.especial.pessoas.map(p => p.nome), ['Vinicius Santos']); assert.match(st.especial.nota, /organização/); // participação especial, só nas Conexões
    r = await go('reflexao'); st = await state(); assert.deepEqual(st.hosts.map(h => h.nome), ['Felipe Zompero', 'Mayara Gomes', 'Pedro Teixeira', 'Geovanna Moreira']); assert.equal(st.especial, undefined);
    r = await go('almanaque'); st = await state(); assert.equal(st.cena.kind, 'almanaque'); assert.equal(st.cena.ato.n, 'ATO II'); assert.equal(st.cena.live.mes, -1);
    assert.deepEqual(st.cena.hosts.map(h => h.nome), ['Claudia Meira', 'Fermín Grandas']); assert.equal(st.cena.quem, 'Claudia Meira e Fermín Grandas');
    r = await cena('almanaque', { action: 'mes', mes: 8 }); assert.equal(r.status, 200); assert.equal((await state()).cena.live.mes, 8);
    r = await cena('reconhecimento', { action: 'fase', fase: 'premios' }); assert.equal(r.status, 409, 'comando de outra cena é recusado');

    // intervalo: a música entra; o cronômetro vai no estado público
    r = await go('intervalo'); st = await state(); assert.equal(st.audio.mode, 'music'); assert.equal(st.cena.live.phase, 'idle');
    await cena('intervalo', { action: 'start', min: 5 }); st = await state(); assert.equal(st.cena.live.phase, 'run'); assert.equal(st.cena.live.duration, 300);
    // Spotify: o modo de som existe (a música vem do Spotify de quem está no painel) e pode ser a música do intervalo
    r = await call('POST', '/api/admin/action', { type: 'setAudio', mode: 'spotify' }); assert.equal(r.status, 200); assert.equal((await state()).audio.mode, 'spotify');
    r = await call('POST', '/api/admin/action', { type: 'settings', settings: { spotifyClientId: 'não é um id', spotifyBreak: true } }); assert.equal((await call('GET', '/api/admin/overview')).json.settings.spotifyClientId, '');
    r = await call('POST', '/api/admin/action', { type: 'settings', settings: { spotifyClientId: '0123456789abcdef0123456789abcdef' } }); assert.equal((await call('GET', '/api/admin/overview')).json.settings.spotifyClientId, '0123456789abcdef0123456789abcdef');
    assert.ok(!JSON.stringify(await state()).includes('0123456789abcdef0123456789abcdef'), 'o Client ID só vai para o Painel do Doc');
    r = await go('visao'); r = await go('intervalo'); assert.equal((await state()).audio.mode, 'spotify', 'com "no intervalo, tocar o meu Spotify", o intervalo liga o modo Spotify');
    r = await call('POST', '/api/admin/action', { type: 'settings', settings: { spotifyBreak: false } });

    // estratégia e 88 MPH; um aviso rápido no meio não recomeça a cena
    r = await go('visao'); st = await state(); assert.equal(st.cena.src, '/estrategia-2027.html'); assert.equal(st.audio.mode, 'off'); assert.deepEqual(st.cena.hosts.map(h => h.nome), ['Claudia Meira', 'Fermín Grandas']);
    r = await go('mph'); await cena('mph', { action: 'go' }); st = await state(); assert.ok(st.cena.live.at > 0);
    r = await call('POST', '/api/admin/action', { type: 'setMessage', message: { title: 'Aviso', body: 'x', emoji: '📣' }, show: true }); st = await state(); assert.equal(st.block, 'message'); assert.equal(st.cena, null);
    r = await cena('mph', { action: 'reset' }); assert.equal(r.status, 409, 'com um aviso no ar, a cena não aceita comandos');
    r = await go('mph'); st = await state(); assert.ok(st.cena.live.at > 0, 'voltar do aviso não zera o velocímetro');
    r = await go('agenda'); r = await go('mph'); st = await state(); assert.equal(st.cena.live.at, null, 'vir de outro passo recomeça a cena');

    // reconhecimento pelo servidor: o estado público não entrega o vencedor antes da hora
    r = await go('reconhecimento'); await cena('reconhecimento', { action: 'fase', fase: 'premios' }); await cena('reconhecimento', { action: 'abrir', premio: 0 });
    st = await state(); assert.equal(st.cena.premios[0].vencedor, undefined); assert.ok(!JSON.stringify(st.cena).includes('Por fazer o Phoenix'), 'a citação do vencedor não vaza');
    const ov = (await call('GET', '/api/admin/overview')).json; assert.equal(ov.cenas.config.reconhecimento.premios[0].vencedor, 1, 'o Painel do Doc sabe o vencedor'); assert.equal(ov.cenas.kinds.length, 9);
    await cena('reconhecimento', { action: 'indicados' }); await cena('reconhecimento', { action: 'raio' }); await cena('reconhecimento', { action: 'vencedor' });
    st = await state(); assert.equal(st.cena.premios[0].feito, true); assert.equal(st.cena.premios[0].indicados[st.cena.premios[0].vencedor].nome, 'Caio Souza');

    // conteúdo pelo painel
    r = await call('POST', '/api/admin/cena', { action: 'config', config: { evento: { titulo: 'Meu Evento' }, intervalo: { min: 20 } } }); assert.equal(r.status, 200);
    st = await state(); assert.equal(st.evento.titulo, 'Meu Evento');
    r = await call('POST', '/api/admin/cena', { action: 'config', config: { agenda: { itens: [] } } }); assert.equal(r.status, 400);
    r = await call('POST', '/api/admin/cena', { action: 'resetConfig', key: 'evento' }); assert.equal((await state()).evento.titulo, 'CDIO HC + BPC');
    r = await call('POST', '/api/admin/cena', { action: 'config', config: { anfitrioes: { reconhecimento: ['Felipe Resck', 'Claudia Meira'] } } }); assert.equal(r.status, 200);
    st = await state(); assert.deepEqual(st.cena.hosts.map(h => h.nome), ['Felipe Resck', 'Claudia Meira']); assert.equal(st.cena.quem, 'Felipe Resck e Claudia Meira');
    // as dinâmicas do Sucesso levam os anfitriões do Sucesso
    r = await call('POST', '/api/admin/step', { id: steps.find(x => x.activity === 'd1').id }); st = await state(); assert.ok(st.presentation); assert.deepEqual(st.hosts.map(h => h.nome), ['Lucas Barbosa', 'Giovana Romão', 'Maria Eduarda']); assert.equal(st.step.transition, false);

    // créditos e reset do evento
    r = await go('closing'); st = await state(); assert.equal(st.block, 'closing'); assert.equal(st.creditos.blocos[0].h, 'PRODUTORES EXECUTIVOS'); assert.equal(st.creditos.final.length, 5); assert.equal(st.cena, null);
    r = await call('POST', '/api/admin/action', { type: 'resetEvent' }); assert.equal(r.status, 200);
    const after = (await call('GET', '/api/admin/overview')).json.cenas.state; assert.deepEqual(after.reconhecimento.feitos, []); assert.equal(after.intervalo.phase, 'idle'); assert.equal(after.mph.at, null);
    // um roteiro editado aceita cada cena uma vez só e ignora cenas desconhecidas
    r = await call('POST', '/api/admin/action', { type: 'settings', settings: { steps: [{ type: 'checkin' }, { type: 'cena', cena: 'mph' }, { type: 'cena', cena: 'mph' }, { type: 'cena', cena: 'xyz' }, { type: 'cena', cena: 'agenda', transition: false }, { type: 'cena', cena: 'ia', transition: 'x' }] } });
    const saved = (await call('GET', '/api/admin/overview')).json.settings.steps;
    assert.deepEqual(saved.map(x => x.cena || x.type), ['checkin', 'mph', 'agenda', 'ia'], '"IA em 2026" continua disponível como cena avulsa');
    assert.deepEqual(saved.map(x => x.transition), [undefined, undefined, false, undefined], 'cada passo guarda se entra direto (sem transição)');
    console.log('OK · cenas no servidor: roteiro em 4 atos, comandos do Doc, estratégia original, créditos e reset');
  } catch (e) {
    console.error('FALHOU:', e); process.exitCode = 1;
  } finally {
    srv.kill(); fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }
})();
