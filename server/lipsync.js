// O Doc com a boca sincronizada: clipes de vídeo do Doc dizendo a fala do dia, gerados pela API do Gemini.
// A mensagem do Doc é escrita durante o evento (server/doc.js); depois que o Doc do painel aprova, este módulo
// divide a fala em frases de até ~13 s e pede ao modelo de vídeo do Gemini um clipe para cada uma, sempre a
// partir do mesmo quadro do Doc (public/videos/doc-quadro.jpg), para manter o personagem, o lugar e a luz.
// Os clipes ficam em DATA_DIR/doc-clips/<rev>/ e o telão toca um atrás do outro, com o som e as legendas.
// Se a chave não existir, um clipe falhar ou não der tempo, o telão usa a voz do navegador e os clipes gerais.
//
// A API: o Veo 3.1 saiu da API do Gemini em 22/10/2026; o substituto é o Gemini Omni 1.2 Flash, via
// POST /v1beta/interactions (imagem + texto → vídeo com áudio, de 3 a 15 s). Tudo o que depende do formato
// da API está em requestClip(), para ajustar num lugar só.
const fs = require('fs');
const path = require('path');

const MODEL = process.env.GEMINI_VIDEO_MODEL || 'gemini-omni-1.2-flash';
const PRICE_PER_SECOND = 0.07;      // US$ por segundo em 720p (estimativa da página de preços; conferir antes)
const WORDS_PER_SECOND = 2.4;       // ritmo de fala em português
const MAX_SECONDS = 13, MIN_SECONDS = 3;
const CONCURRENCY = 3;
const { ART, DOC_SHORT } = require('./doc'); // o mesmo visual do kit do vídeo e dos clipes gerais

const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const words = s => clean(s).split(' ').filter(Boolean).length;
const hasKey = () => !!process.env.GEMINI_API_KEY;

// A abertura não repete o que o vídeo da chegada já diz ("Pelo grande raio, acabei de voltar de 2027")
function skipArrival(text) {
  let t = clean(text);
  for (let i = 0; i < 2; i++) { const m = t.match(/^[^.!?…]*[.!?…]+\s*/); if (!m || !/grande raio|(voltar|voltei|cheguei|chegar|chegando) de 2027/i.test(m[0])) break; t = t.slice(m[0].length); }
  return t || clean(text);
}
// Junta frases inteiras até caber num clipe (~13 s); frase longa demais vai sozinha
function chunks(text) {
  const sents = (clean(text).match(/[^.!?…]+[.!?…]*/g) || []).map(clean).filter(Boolean), out = [];
  let cur = '';
  for (const s of sents) {
    if (cur && words(cur + ' ' + s) / WORDS_PER_SECOND > MAX_SECONDS - 1) { out.push(cur); cur = s; } else cur = cur ? cur + ' ' + s : s;
  }
  if (cur) out.push(cur);
  return out;
}
const secondsFor = text => Math.max(MIN_SECONDS, Math.min(15, Math.ceil(words(text) / WORDS_PER_SECOND) + 1));

// Os clipes da fala, parte por parte (as mesmas partes da cena no telão)
function plan(message, { arrival = true } = {}) {
  if (!message) return [];
  const parts = [['abertura', arrival ? skipArrival(message.abertura) : message.abertura],
    ...(message.blocos || []).map(b => [b.id, b.fala]),
    ['jornal', `Vejam só o jornal de 2027! ${(message.manchetes || []).map(h => clean(h).replace(/[.!?]*$/, '.')).join(' ')}`],
    ['final', message.encerramento]];
  const out = [];
  for (const [part, text] of parts) chunks(text).forEach((t, i) => out.push({ part, i, text: t, seconds: secondsFor(t) }));
  return out;
}
const estimate = clips => { const s = clips.reduce((n, c) => n + c.seconds, 0); return { clips: clips.length, seconds: s, usd: Math.round(s * PRICE_PER_SECOND * 100) / 100 }; };

function promptFor(text) {
  return `${ART}. Continue from this exact frame: the same character, the same place, the same lighting and the same framing. `
    + `${DOC_SHORT} looks into the camera and speaks in Brazilian Portuguese, with a warm, excited elderly male voice (always the same voice), saying exactly: "${text}" `
    + 'Natural lip sync, expressive face, subtle hand gestures, locked-off camera. No music, no subtitles, no on-screen text.';
}

// Uma chamada à API: devolve o mp4 (Buffer). Aceita o vídeo em base64 na resposta ou um arquivo para baixar.
async function requestClip({ image, text, seconds }, { key, base, signal }) {
  const res = await fetch(`${base}/v1beta/interactions`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      model: MODEL,
      input: [{ type: 'image', data: image.toString('base64'), mime_type: 'image/jpeg' }, { type: 'text', text: promptFor(text) }],
      response_format: { type: 'video', aspect_ratio: '16:9', resolution: '720p', duration: `${seconds}s` },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((body.error && body.error.message) || `a API respondeu ${res.status}`), { status: res.status });
  const items = (body.steps || []).flatMap(s => s.content || []).concat(body.content || [], body.outputs || []);
  const video = items.find(c => c && (c.type === 'video' || /^video\//.test(c.mime_type || '')));
  if (!video) throw new Error('a resposta da API não trouxe vídeo');
  if (video.data) return Buffer.from(video.data, 'base64');
  const uri = video.uri || video.file_uri;
  if (!uri) throw new Error('a resposta da API não trouxe o vídeo nem o endereço dele');
  const dl = await fetch(uri, { headers: { 'x-goog-api-key': key }, signal, redirect: 'follow' });
  if (!dl.ok) throw new Error(`não foi possível baixar o vídeo (${dl.status})`);
  return Buffer.from(await dl.arrayBuffer());
}

// Gera todos os clipes (3 de cada vez). onProgress recebe o estado a cada clipe pronto ou com falha.
async function generate(message, { rev, dataDir, image, arrival = true, onProgress = () => {}, signal }) {
  const key = process.env.GEMINI_API_KEY, base = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
  if (!key) throw Object.assign(new Error('Falta a chave da API do Gemini (GEMINI_API_KEY) no servidor.'), { status: 409 });
  const list = plan(message, { arrival }), dir = path.join(dataDir, 'doc-clips', String(rev));
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const clips = {}, errors = [];
  let done = 0, next = 0;
  const worker = async () => {
    while (next < list.length && !(signal && signal.aborted)) {
      const c = list[next++];
      try {
        const timeout = AbortSignal.timeout(6 * 60 * 1000);
        const mp4 = await requestClip({ image, text: c.text, seconds: c.seconds }, { key, base, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
        if (signal && signal.aborted) break;
        const file = `${c.part}-${c.i}.mp4`; fs.writeFileSync(path.join(dir, file), mp4);
        (clips[c.part] = clips[c.part] || [])[c.i] = { url: `/doc-clips/${rev}/${file}`, text: c.text, seconds: c.seconds };
      } catch (e) { if (signal && signal.aborted) break; errors.push(`${c.part} ${c.i + 1}: ${e.message}`); console.error('[lipsync]', c.part, c.i, e.message); }
      done++; onProgress({ total: list.length, done, failed: errors.length, clips, errors });
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));
  // parte com algum clipe faltando não entra: o telão usa a voz do navegador nela
  for (const k of Object.keys(clips)) { const want = list.filter(c => c.part === k).length; if (clips[k].filter(Boolean).length !== want) delete clips[k]; }
  return { total: list.length, failed: errors.length, clips, errors };
}

module.exports = { plan, estimate, generate, hasKey, skipArrival, chunks, promptFor, MODEL, PRICE_PER_SECOND };
