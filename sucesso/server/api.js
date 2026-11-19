export const DEFINITIONS = {
 d1:{title:'Antes de Partir',question:'O que você considera um sucesso?',nameRequired:true},
 d2:{title:'Look Back',question:'Olhando para 2026, o que fez você pensar: “isso foi um sucesso”?',nameRequired:true},
 d3:{title:'Uso de IA',question:'O que você fez (projeto, agente ou aprendizado) em 2026 com a ajuda da IA?',nameRequired:true},
 d4:{title:'Look Ahead',question:'O que precisaria ter acontecido para você dizer: “2027 foi um sucesso”?',nameRequired:false}
};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Evaluate deadlines, rate limits and response timestamps when SQLite executes
// the statement, rather than using a request-start clock before network/body waits.
const SQL_NOW="CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)";
const PRESENTATION_SQL="(SELECT json_extract(snapshot, '$.settings.presentation') FROM townhall_state WHERE id = 1)";
class HttpError extends Error{constructor(status,message){super(message);this.status=status}}
const fail=(status,message)=>{throw new HttpError(status,message)};
const statement=(db,sql,...params)=>db.prepare(sql).bind(...params);
const first=(db,sql,...params)=>statement(db,sql,...params).first();
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
function identity(req){const id=req.headers.get('oai-authenticated-user-id');if(!id)fail(401,'Entre na sua conta para abrir o painel.');return id}
function activity(row,now){
 const expired=row.phase==='run'&&row.ends_at!==null&&row.ends_at<=now;
 return {id:row.id,...DEFINITIONS[row.id],phase:expired?'done':row.phase,roundId:row.round_id,revision:row.revision,endsAt:expired?null:row.ends_at,remainingSeconds:expired?0:row.ends_at!==null?Math.max(0,Math.ceil((row.ends_at-now)/1000)):row.remaining_seconds};
}
function response(row){return {id:row.id,sequence:row.sequence,activityId:row.activity_id,roundId:row.round_id,name:row.name,answer:row.answer,createdAt:row.created_at}}
function room(row){return {id:row.id,name:row.name,createdAt:row.created_at}}
async function body(req){
 if(!req.headers.get('Content-Type')?.startsWith('application/json'))fail(415,'Envie os dados no formato JSON.');
 if(Number(req.headers.get('Content-Length')||0)>8192)fail(413,'Mensagem muito longa.');
 const reader=req.body?.getReader();if(!reader)fail(400,'Dados ausentes.');
 const chunks=[];let len=0;
 while(true){const {value,done}=await reader.read();if(done)break;len+=value.length;if(len>8192){await reader.cancel();fail(413,'Mensagem muito longa.')}chunks.push(value)}
 const bytes=new Uint8Array(len);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
 try{const v=JSON.parse(new TextDecoder().decode(bytes));if(!v||typeof v!=='object'||Array.isArray(v))throw Error();return v}catch{fail(400,'Dados inválidos.')}
}
async function getRoom(db,id,owner,includePresentation=false){
 if(typeof id!=='string'||!UUID.test(id))fail(404,'Sala não encontrada. Confira o QR code.');
 const selection=includePresentation?`, ${PRESENTATION_SQL} AS presentation`:'';
 const r=await first(db,`SELECT rooms.*${selection} FROM rooms WHERE id = ?`,id);
 if(!r)fail(404,'Sala não encontrada. Confira o QR code.');
 if(owner!==undefined&&r.owner_id!==owner)fail(403,'Esta sala pertence a outro apresentador.');
 return r;
}

export function publicPresentation(setting) {
  const { roomId, activityId } = setting ?? {};
  if (typeof roomId !== 'string' || !UUID.test(roomId) || typeof activityId !== 'string' || !Object.hasOwn(DEFINITIONS, activityId)) return null;
  const { title, question } = DEFINITIONS[activityId];
  return { roomId, activityId, title, question };
}

function storedPresentation(raw, scope) {
  const setting = raw ? JSON.parse(raw) : null;
  if (scope.roomId !== undefined && setting?.roomId !== scope.roomId) return null;
  if (scope.ownerId !== undefined && setting?.ownerId !== scope.ownerId) return null;
  return publicPresentation(setting);
}

export async function preparePresentation(db, roomId, activityId, ownerId) {
  if (roomId === null) return null;
  if (!db) fail(503, 'A sala está sendo preparada. Tente novamente em instantes.');
  const selection = publicPresentation({ roomId, activityId });
  if (!selection) fail(400, 'Escolha uma sala e uma dinâmica válidas.');
  await getRoom(db, roomId, ownerId);
  const exists = await first(db, 'SELECT id FROM activities WHERE room_id = ? AND id = ?', roomId, activityId);
  if (!exists) fail(404, 'Dinâmica não encontrada nesta sala.');
  return { ...selection, ownerId };
}

// Resolve the countdown, count and latest answers from the same SQLite read.
// Only the authorised room owner can retrieve the answer text, never names.
export async function readScreenActivity(db, selection, presenterId) {
  if (!selection) return null;
  const row = await first(db, `SELECT a.*, r.name AS room_name, ${SQL_NOW} AS read_at,
    (SELECT COUNT(*) FROM responses p
      WHERE p.room_id = a.room_id AND p.activity_id = a.id AND p.round_id = a.round_id) AS response_count,
    CASE WHEN r.owner_id = ? THEN (SELECT json_group_array(json_object('answer', answer)) FROM (
      SELECT p.answer FROM responses p
      WHERE p.room_id = a.room_id AND p.activity_id = a.id AND p.round_id = a.round_id
      ORDER BY p.sequence DESC LIMIT 4
    )) END AS latest_responses
    FROM activities a JOIN rooms r ON r.id = a.room_id
    WHERE a.room_id = ? AND a.id = ?`, presenterId ?? null, selection.roomId, selection.activityId);
  if (!row) return null;
  const { title, question, phase, endsAt, remainingSeconds, roundId, revision } = activity(row, row.read_at);
  const live = { roomId: row.room_id, activityId: row.id, roomName: row.room_name,
    title, question, phase, endsAt, remainingSeconds, responseCount: row.response_count,
    roundId, revision, serverNow: row.read_at };
  if (row.latest_responses !== null) live.latestResponses = JSON.parse(row.latest_responses);
  return live;
}
async function api(req,env,url){
 if(!env.DB)fail(503,'A sala está sendo preparada. Tente novamente em instantes.');
 const db=env.DB, path=url.pathname;
 if(req.method==='POST'){
  const origin=req.headers.get('Origin');if(origin&&origin!==url.origin)fail(403,'Origem não permitida.');
 }
 if(path==='/api/rooms'){
  const owner=identity(req);
  if(req.method==='GET'){
   const [list,selection]=await db.batch([
    statement(db,'SELECT id,name,created_at FROM rooms WHERE owner_id = ? ORDER BY created_at DESC',owner),
    statement(db,`SELECT ${PRESENTATION_SQL} AS presentation`)
   ]);
   return json({rooms:list.results.map(room),presentation:storedPresentation(selection.results[0].presentation,{ownerId:owner})});
  }
  if(req.method==='POST'){
   const data=await body(req),name=typeof data.name==='string'?data.name.trim():'';
   if(!name||name.length>80)fail(400,'Dê um nome à sala, com até 80 caracteres.');
   const count=await first(db,'SELECT COUNT(*) AS n FROM rooms WHERE owner_id = ?',owner);
   if(count.n>=30)fail(409,'Você já tem 30 salas. Reutilize uma sala existente.');
   const id=crypto.randomUUID();
   const results=await db.batch([
    statement(db,`INSERT INTO rooms(id,owner_id,name,created_at) VALUES(?,?,?,${SQL_NOW})`,id,owner,name),
    ...Object.keys(DEFINITIONS).map(k=>statement(db,'INSERT INTO activities(room_id,id,phase,ends_at,remaining_seconds,round_id) VALUES(?,?,?,NULL,?,?)',id,k,k==='d1'?'run':'idle',k==='d1'?0:120,crypto.randomUUID())),
    statement(db,'SELECT id,name,created_at FROM rooms WHERE id=?',id)
   ]);
   return json(room(results.at(-1).results[0]),201);
  }
  fail(405,'Método não permitido.');
 }
 const match=path.match(/^\/api\/rooms\/([^/]+)\/(status|snapshot|responses|activities\/([^/]+)\/command)$/);
 if(!match)fail(404,'Endereço não encontrado.');
 const [,id,operation,activityId]=match;
 const administrative=operation==='snapshot'||operation.startsWith('activities/');
 const owner=administrative?identity(req):undefined;
 const r=await getRoom(db,id,owner,req.method==='GET'&&(operation==='status'||operation==='snapshot'));
 if((operation==='status'||operation==='snapshot')&&req.method==='GET'){
  if(operation==='status'){
   const {results}=await statement(db,`SELECT *,${SQL_NOW} AS read_at FROM activities WHERE room_id = ? ORDER BY id`,id).all();
   const now=results[0]?.read_at??Date.now();
   return json({room:room(r),serverNow:now,activities:results.map(a=>activity(a,now)),presentation:storedPresentation(r.presentation,{roomId:id})});
  }
  const after=Number(url.searchParams.get('after')||0);
  if(!Number.isSafeInteger(after)||after<0)fail(400,'Cursor inválido.');
  const [states,items]=await db.batch([
   statement(db,`SELECT *,${SQL_NOW} AS read_at FROM activities WHERE room_id = ? ORDER BY id`,id),
   statement(db,'SELECT r.* FROM responses r JOIN activities a ON a.room_id=r.room_id AND a.id=r.activity_id AND a.round_id=r.round_id WHERE r.room_id = ? AND r.sequence > ? ORDER BY r.sequence',id,after)
  ]);
  const now=states.results[0]?.read_at??Date.now(),cursor=items.results.at(-1)?.sequence??after;
  return json({room:room(r),serverNow:now,activities:states.results.map(a=>activity(a,now)),responses:items.results.map(response),cursor,presentation:storedPresentation(r.presentation,{ownerId:owner})});
 }
 if(operation==='responses'&&req.method==='POST'){
  const d=await body(req);
  if(typeof d.activityId!=='string'||!Object.hasOwn(DEFINITIONS,d.activityId))fail(400,'Dinâmica inválida.');
  const def=DEFINITIONS[d.activityId];
  if(!['roundId','clientRequestId','participantId'].every(key=>typeof d[key]==='string'&&UUID.test(d[key])))fail(400,'Abra novamente o link da sala e tente enviar.');
  const name=typeof d.name==='string'?d.name.trim():'',answer=typeof d.answer==='string'?d.answer.trim():'';
  if(def.nameRequired&&!name)fail(400,'Informe seu nome.');
  if(name.length>80)fail(400,'O nome deve ter até 80 caracteres.');
  if(!answer||answer.length>200)fail(400,'Escreva uma resposta de até 200 caracteres.');
  const storedName=name||'Anônimo';
  const previous=await first(db,'SELECT * FROM responses WHERE room_id = ? AND client_request_id = ?',id,d.clientRequestId);
  if(previous){
   if(previous.participant_id!==d.participantId||previous.activity_id!==d.activityId||previous.round_id!==d.roundId||previous.name!==storedName||previous.answer!==answer)fail(409,'Este envio já foi usado com outro conteúdo. Envie novamente.');
   return json({response:response(previous),duplicate:true});
  }
  const responseId=crypto.randomUUID();
  // The conditional INSERT validates the phase and deadline atomically with the write.
  const result=await statement(db,`INSERT OR IGNORE INTO responses(id,room_id,activity_id,round_id,client_request_id,participant_id,name,answer,created_at)
   SELECT ?,a.room_id,a.id,a.round_id,?,?,?,?,${SQL_NOW} FROM activities a
   WHERE a.room_id=? AND a.id=? AND a.round_id=? AND a.phase='run' AND (a.ends_at IS NULL OR a.ends_at>${SQL_NOW})
   AND (SELECT COUNT(*) FROM responses WHERE room_id=?)<4000
   AND NOT EXISTS(SELECT 1 FROM responses WHERE room_id=? AND participant_id=? AND created_at>${SQL_NOW}-2000)`,
   responseId,d.clientRequestId,d.participantId,storedName,answer,id,d.activityId,d.roundId,id,id,d.participantId).run();
  const accepted=await first(db,'SELECT * FROM responses WHERE room_id = ? AND client_request_id = ?',id,d.clientRequestId);
  if(accepted){
   if(accepted.participant_id!==d.participantId||accepted.activity_id!==d.activityId||accepted.round_id!==d.roundId||accepted.name!==storedName||accepted.answer!==answer)fail(409,'Este envio já foi usado.');
   return json({response:response(accepted),duplicate:result.meta?.changes===0},result.meta?.changes?201:200);
  }
  const a=await first(db,`SELECT *,${SQL_NOW} AS read_at FROM activities WHERE room_id=? AND id=?`,id,d.activityId);
  if(a.round_id!==d.roundId)fail(409,'Uma nova rodada começou. Aguarde a atualização da tela e envie novamente.');
  const state=activity(a,a.read_at);
  if(state.phase!=='run')fail(409,state.phase==='paused'?'Recebimento pausado pelo apresentador.':state.phase==='done'?'O recebimento desta dinâmica foi encerrado.':'Aguarde o apresentador iniciar esta dinâmica.');
  const count=await first(db,'SELECT COUNT(*) AS n FROM responses WHERE room_id=?',id);
  if(count.n>=4000)fail(409,'Esta sala atingiu o limite de respostas. Avise o apresentador.');
  fail(429,'Aguarde dois segundos antes de enviar outra resposta.');
 }
 if(operation.startsWith('activities/')&&req.method==='POST'){
  if(!Object.hasOwn(DEFINITIONS,activityId))fail(404,'Dinâmica não encontrada.');
  const data=await body(req);
  if(!['start','pause','end','reset','clear'].includes(data.action))fail(400,'Comando inválido.');
  const a=await first(db,`SELECT *,${SQL_NOW} AS read_at FROM activities WHERE room_id=? AND id=?`,id,activityId);
  let changed;
  if(data.action==='clear'){
   const roundId=crypto.randomUUID();
   const results=await db.batch([
    statement(db,'UPDATE activities SET phase=?,ends_at=NULL,remaining_seconds=?,round_id=?,revision=revision+1 WHERE room_id=? AND id=? AND revision=?',activityId==='d1'?'run':'idle',activityId==='d1'?0:120,roundId,id,activityId,a.revision),
    statement(db,'DELETE FROM responses WHERE room_id=? AND activity_id=? AND EXISTS(SELECT 1 FROM activities WHERE room_id=? AND id=? AND round_id=?)',id,activityId,id,activityId,roundId)
   ]);
   changed=results[0].meta?.changes;
  }else{
   let changes,extraGuard='';
   if(data.action==='start'){
    if(activity(a,a.read_at).phase==='done')fail(409,'Reinicie a dinâmica antes de abrir novamente.');
    changes=`phase='run',ends_at=CASE WHEN phase='run' THEN ends_at WHEN id='d1' THEN NULL ELSE ${SQL_NOW}+MAX(1,remaining_seconds)*1000 END`;
    extraGuard=` AND phase<>'done' AND NOT(phase='run' AND ends_at IS NOT NULL AND ends_at<=${SQL_NOW})`;
   }
   if(data.action==='pause')changes=`phase=CASE WHEN phase='run' THEN CASE WHEN ends_at IS NOT NULL AND ends_at<=${SQL_NOW} THEN 'done' ELSE 'paused' END ELSE phase END,remaining_seconds=CASE WHEN phase='run' AND ends_at IS NOT NULL THEN MAX(0,CAST((ends_at-${SQL_NOW}+999)/1000 AS INTEGER)) ELSE remaining_seconds END,ends_at=CASE WHEN phase='run' THEN NULL ELSE ends_at END`;
   if(data.action==='end')changes="phase='done',ends_at=NULL,remaining_seconds=0";
   if(data.action==='reset')changes="phase=CASE WHEN id='d1' THEN 'run' ELSE 'idle' END,ends_at=NULL,remaining_seconds=CASE WHEN id='d1' THEN 0 ELSE 120 END";
   const result=await statement(db,`UPDATE activities SET ${changes},revision=revision+1 WHERE room_id=? AND id=? AND revision=?${extraGuard}`,id,activityId,a.revision).run();
   changed=result.meta?.changes;
  }
  if(changed!==1)fail(409,'A dinâmica mudou em outra tela. Confira o estado atualizado e tente novamente.');
  const row=await first(db,`SELECT *,${SQL_NOW} AS read_at FROM activities WHERE room_id=? AND id=?`,id,activityId);
  const now=row.read_at,updated=activity(row,now);
  return json({activity:updated,serverNow:now,...updated});
 }
 fail(405,'Método não permitido.');
}
export function createWorker(assets){return {async fetch(request,env){
 const url=new URL(request.url);let result;
 try{
  if(url.pathname.startsWith('/api/'))result=await api(request,env,url);
  else if(url.pathname==='/health')result=json({ok:true});
  else if(url.pathname==='/robots.txt')result=new Response('User-agent: *\nDisallow: /\n');
  else{
   if(!['GET','HEAD'].includes(request.method))fail(405,'Método não permitido.');
   let p=url.pathname;
   if(p==='/painel'||p==='/painel.html'){
    if(!request.headers.get('oai-authenticated-user-id'))return Response.redirect(url.origin+'/signin-with-chatgpt?return_to='+encodeURIComponent('/painel'+url.search),302);
    p='/painel.html';
   }else if(p==='/')p='/index.html';
   else if(/^\/participar\/[0-9a-f-]{36}$/i.test(p))p='/participar.html';
   if(!Object.hasOwn(assets,p))fail(404,'Página não encontrada.');
   const type=p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html';
   result=new Response(request.method==='HEAD'?null:assets[p],{headers:{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store'}});
  }
 }catch(error){
  if(!(error instanceof HttpError))console.error('Request failed:',error.message);
  result=json({error:error instanceof HttpError?error.message:'Não foi possível concluir agora. Tente novamente.'},error.status||500);
 }
 const headers=new Headers(result.headers);
 headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');headers.set('X-Robots-Tag','noindex, nofollow');
 headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'");
 return new Response(result.body,{status:result.status,headers});
}}}
