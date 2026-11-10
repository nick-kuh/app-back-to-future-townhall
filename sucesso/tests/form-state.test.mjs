import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';

// Unit harness for the form controller: no browser, network, or production state.
const html=await readFile(new URL('../public/participar.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const roomId=randomUUID(),round1=randomUUID(),round2=randomUUID();
class Element {
  constructor(){this.handlers={};this.dataset={};this.value='';this.textContent='';this.hidden=false;this.disabled=false;this.attrs={};}
  addEventListener(name,fn){this.handlers[name]=fn;}
  setAttribute(name,value){this.attrs[name]=value;}
  removeAttribute(name){delete this.attrs[name];}
  focus(){}
  async trigger(name){await this.handlers[name]?.({preventDefault(){}});}
}
const flush=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));};
const reply=(value,status=200)=>({ok:status>=200&&status<300,status,async json(){return value;}});
function status(phase='run',roundId=round1){return {room:{id:roomId,name:'Teste'},serverNow:Date.now(),activities:['d1','d2','d3','d4'].map(id=>({id,title:id,question:'Pergunta',nameRequired:id!=='d4',phase,roundId,endsAt:phase==='run'&&id!=='d1'?Date.now()+60000:null,remainingSeconds:60}))};}
async function form(fetcher,{selected='d2',storedId=randomUUID()}={}){
 const elements=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
 const buttons=['d1','d2','d3','d4'].map(id=>{const e=new Element();e.dataset.activity=id;return e;});
 const doc={hidden:false,handlers:{},getElementById:id=>elements.get(id),querySelectorAll:()=>buttons,documentElement:{style:{setProperty(){}}},body:{classList:{add(){}}},addEventListener(n,fn){this.handlers[n]=fn;}};
 const win={handlers:{},addEventListener(n,fn){this.handlers[n]=fn;}};
 const local=new Map([['townhall.participantId',storedId]]),timers=new Map();let next=1;
 const context={document:doc,window:win,navigator:{onLine:true},location:{pathname:'/participar/'+roomId,search:'?d='+selected,href:'https://test.local/participar/'+roomId+'?d='+selected},history:{replaceState(){}},localStorage:{getItem:k=>local.get(k)??null,setItem:(k,v)=>local.set(k,v)},crypto:{randomUUID},URL,URLSearchParams,AbortController,Date,console,fetch:fetcher,
  setTimeout:(fn,ms)=>{const id=next++;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),setInterval:()=>0};
 vm.runInNewContext(script,context,{filename:'participar-inline.js'});await flush();
 return {e:id=>elements.get(id),tab:id=>buttons.find(button=>button.dataset.activity===id),doc,win,local,timers,async submit(){elements.get('participantName').value='Pessoa Teste';elements.get('answer').value='Uma resposta';await elements.get('responseForm').trigger('submit');await flush();},async visibility(hidden){doc.hidden=hidden;doc.handlers.visibilitychange();await flush();}};
}

test('lost acknowledgement can be confirmed with the identical payload after collection ends',async()=>{
 let phase='run';const sends=[];
 const h=await form(async(path,options)=>{
  if(path.endsWith('/status'))return reply(status(phase));
  const p=JSON.parse(options.body);sends.push(p);
  if(sends.length===1){phase='done';throw new TypeError('connection lost after acceptance');}
  return reply({duplicate:true,response:{id:randomUUID(),activityId:p.activityId,roundId:p.roundId,name:p.name,answer:p.answer}});
 });
 await h.submit();assert.equal(h.e('answer').value,'Uma resposta');assert.equal(h.e('submitButton').disabled,true);
 assert.equal(h.e('retrySend').hidden,false);assert.equal(h.e('retrySend').disabled,false);
 await h.e('retrySend').trigger('click');await flush();
 assert.deepEqual(sends[1],sends[0]);assert.equal(h.e('answer').value,'');assert.equal(h.e('retrySend').hidden,true);
 assert.match(h.e('message').textContent,/Envio anterior confirmado/);
});

test('invalid 2xx receipt keeps the pending send; new round does not change its retry payload',async()=>{
 let round=round1;const sends=[];
 const h=await form(async(path,options)=>{
  if(path.endsWith('/status'))return reply(status('run',round));
  const p=JSON.parse(options.body);sends.push(p);
  if(sends.length===1){round=round2;return reply({response:{id:'invalid-receipt'}});}
  return reply({error:'Uma nova rodada começou.'},409);
 });
 await h.submit();assert.equal(h.e('answer').value,'Uma resposta');assert.equal(h.e('retrySend').hidden,false);
 h.e('answer').value='Texto revisado';
 await h.e('retrySend').trigger('click');await flush();
 assert.deepEqual(sends[1],sends[0]);assert.equal(sends[1].roundId,round1);
 assert.equal(h.e('answer').value,'Texto revisado');assert.equal(h.e('retrySend').hidden,true);
 assert.equal(h.e('submitButton').disabled,false);assert.match(h.e('message').textContent,/nova rodada/);
});

test('404 stops automatic polling, manual retry recovers, and returning visible requires a fresh status',async()=>{
 let count=0,missing=true,deferred;
 const h=await form(async()=>{
  count++;if(missing)return reply({error:'Sala não encontrada'},404);
  if(deferred)return await deferred.promise;
  return reply(status());
 },{storedId:'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'});
 assert.equal(count,1);assert.equal(h.timers.size,0);
 assert.match(h.local.get('townhall.participantId'),/^[0-9a-f-]{36}$/i);
 missing=false;await h.e('retryConnection').trigger('click');await flush();assert.equal(count,2);
 await h.visibility(true);assert.equal(h.timers.size,0);
 let release;deferred={promise:new Promise(resolve=>{release=resolve;})};
 await h.visibility(false);assert.equal(count,3);assert.equal(h.e('submitButton').disabled,true);
 release(reply(status()));await flush();assert.equal(h.e('submitButton').disabled,false);
});

test('untimed first activity never displays a paused countdown',async()=>{
 const h=await form(async()=>reply(status('paused')),{selected:'d1'});
 assert.equal(h.e('timer').hidden,true);
});

test('the presenter prompt keeps a QR pinned and preserves a pending response when the traveler changes activity',async()=>{
 let sends=0;
 const h=await form(async(path)=>{
  if(path.endsWith('/status'))return reply({...status(),presentation:{roomId,activityId:'d3'}});
  sends++;
  throw new TypeError('connection lost after acceptance');
 });
 assert.match(h.e('activityTitle').textContent,/Dinâmica 02/);
 assert.equal(h.e('livePrompt').hidden,false);
 assert.match(h.e('livePromptText').textContent,/d3/);
 await h.submit();
 assert.equal(h.e('retrySend').hidden,false);
 await h.e('showPresented').trigger('click');
 assert.match(h.e('activityTitle').textContent,/Dinâmica 03/);
 assert.equal(h.e('livePrompt').hidden,true);
 assert.equal(h.e('answer').value,'');
 assert.equal(h.e('retrySend').hidden,true);
 await h.tab('d2').trigger('click');
 assert.equal(h.e('answer').value,'Uma resposta');
 assert.equal(h.e('retrySend').hidden,false);
 assert.equal(sends,1);
});
