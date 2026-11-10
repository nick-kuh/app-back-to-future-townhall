/* Hosted room adapter. Rendering stays local; accepted answers and collection state belong to the server. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const keys = Object.keys(D);
  const savedReset = resetC;
  const savedGo = go;
  const live = {roomId:null, roomName:'', cursor:0, states:{}, seen:new Set(), ready:false,
    generation:0, pollTimer:null, abort:null, offset:0, online:false, busy:new Set(), transitions:{}, draws:{},failures:0,authExpired:false,qrActivity:null,qrFocus:null,
    presentation:null, presentationBusy:false};
  const presentationButtons = new Map();
  const phaseLabels = {idle:'Aguardando abertura',run:'Recebendo respostas',paused:'Recebimento pausado',done:'Recebimento encerrado'};

  document.body.insertAdjacentHTML('afterbegin', `
    <header class="live-bar"><div><span class="live-dot" id="liveDot"></span><span id="liveConnection" role="status">Escolha uma sala</span><a id="liveSignIn" class="live-sign-in" target="_top" hidden>Entrar novamente</a></div><strong id="liveRoomName">De Volta para o Sucesso</strong><div class="live-actions"><a class="live-room-button" href="/telao.html" target="_blank" rel="noopener">Abrir telão ↗</a><button type="button" class="live-room-button" id="stopPresentation" hidden>Voltar ao Townhall</button><a class="live-room-button" href="/admin.html">Painel do Doc</a><button type="button" class="live-room-button" id="switchRoom">Trocar sala</button></div></header>
    <div class="live-room-overlay" id="roomOverlay"><section class="live-room-dialog" role="dialog" aria-modal="true" aria-labelledby="roomTitle">
      <p class="live-eyebrow">PAINEL DO APRESENTADOR · 2026 → 2027</p><h2 id="roomTitle">Prepare sua viagem</h2><p class="live-room-intro">Crie uma sala para este evento. As quatro dinâmicas terão QR codes próprios e as respostas ficarão salvas.</p>
      <form id="createRoomForm"><label for="newRoomName">Nome do evento</label><div class="live-create-row"><input id="newRoomName" name="name" required maxlength="80" placeholder="Townhall · Novembro 2026" autocomplete="off"><button class="btn" id="createRoomButton">Criar sala</button></div></form>
      <div class="live-room-list-title">Suas salas</div><div id="roomList" class="live-room-list">Carregando salas…</div>
      <p id="roomError" class="live-error" role="alert"></p><button class="live-room-button" id="cancelRoom" hidden>Voltar à sala atual</button>
      <button type="button" class="live-room-button" id="stopPresentationOverlay" hidden>Voltar ao Townhall</button>
      <p class="live-room-note">Participantes entram pelo QR, sem login. Este painel e os controles ficam disponíveis apenas para você.</p>
      <a class="live-open-link" href="/admin.html">Voltar ao Painel do Doc</a>
    </section></div>
    <dialog class="live-qr-dialog" id="qrDialog" aria-labelledby="qrTitle"><div class="live-qr-heading"><div><p class="live-eyebrow" id="qrRoomName"></p><h2 id="qrTitle">Escaneie e responda</h2></div><button type="button" id="closeQr" class="live-room-button" aria-label="Fechar QR ampliado">✕ Fechar</button></div><canvas id="largeQr" role="img" aria-label="QR code ampliado para responder à dinâmica"></canvas><p id="qrActivityTitle"></p><p class="live-qr-note">Abra a câmera do celular e aponte para o código. Não precisa fazer login.</p><button type="button" id="copyLargeQr" class="btn cy">Copiar link para responder</button></dialog>`);

  // No simulated entries may leak into a live room.
  $('phoneWrap').remove();
  phone = () => {};
  submitPhone = addSample = addBatch = autoSim = preloadAll = () => false;
  stopAuto = k => {clearTimeout(S[k].auto);S[k].auto=null;};
  startC = k => command(k,'start');
  pauseC = k => command(k,'pause');
  endC = k => command(k,'end');
  resetC = k => command(k,'reset');
  clearD = k => {
    if(confirm('Apagar as respostas desta dinâmica da sala? Esta ação não pode ser desfeita.')) command(k,'clear');
  };
  clearAll = () => toast('Limpe as respostas na dinâmica desejada.');
  go = id => {savedGo(id);visualRevision++;if(id!=='menu') requestAnimationFrame(()=>resizeCloud(id));};
  for (const k of keys) {
    const enlarge = document.createElement('button');
    enlarge.type = 'button';
    enlarge.className = 'btn ghost live-enlarge-qr';
    enlarge.textContent = 'Ampliar QR';
    enlarge.addEventListener('click', () => openQr(k, enlarge));
    const project = document.createElement('button');
    project.type = 'button';
    project.id = `project_${k}`;
    project.className = 'btn cy live-projection-button';
    project.addEventListener('click', () => setPresentation(k));
    presentationButtons.set(k, project);
    $('qr_'+k).parentElement.after(enlarge, project);
  }
  $('stopPresentation').addEventListener('click', () => setPresentation(null));
  $('stopPresentationOverlay').addEventListener('click', () => setPresentation(null));

  for (const card of document.querySelectorAll('.card')) {
    card.tabIndex=0;card.setAttribute('role','button');
    card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();card.click();}});
  }

  async function api(path, options={}) {
    const controller=new AbortController(),external=options.signal;let timedOut=false;
    const abort=()=>controller.abort();
    if(external?.aborted)abort();else external?.addEventListener('abort',abort,{once:true});
    const timeout=setTimeout(()=>{timedOut=true;controller.abort();},12000);
    try{
      const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options,signal:controller.signal,
        headers:{'Content-Type':'application/json',...(options.headers||{})}});
      let data;try{data=await response.json();}catch(error){if(error.name==='AbortError')throw error;throw new Error('Não foi possível ler a resposta do servidor.');}
      if(!response.ok){
        const error=new Error(data.error||'Não foi possível concluir a solicitação.');error.status=response.status;throw error;
      }
      return data;
    }catch(error){
      if(timedOut)throw new Error('O servidor demorou para responder. Verifique a conexão e tente novamente.');
      throw error;
    }finally{
      clearTimeout(timeout);external?.removeEventListener('abort',abort);
    }
  }
  function connection(ok,message) {
    live.online=ok;$('liveDot').classList.toggle('connected',ok);$('liveConnection').textContent=message;
    if(ok){live.authExpired=false;$('liveSignIn').hidden=true;}
    refreshButtons();
  }
  function participantUrl(k){return `${location.origin}/participar/${encodeURIComponent(live.roomId)}?d=${k}`;}
  function paintQR(k,cv,scale=6) {
    const qr=qrcode(0,'M');qr.addData(participantUrl(k));qr.make();
    const count=qr.getModuleCount(), quiet=4,c=cv.getContext('2d');
    cv.width=cv.height=(count+quiet*2)*scale;
    c.fillStyle='#fff';c.fillRect(0,0,cv.width,cv.height);c.fillStyle='#050409';
    for(let y=0;y<count;y++)for(let x=0;x<count;x++)if(qr.isDark(y,x))c.fillRect((x+quiet)*scale,(y+quiet)*scale,scale,scale);
  }
  function renderQR(k){paintQR(k,$('qr_'+k));$('participantLink_'+k).href=participantUrl(k);}
  function openQr(k,trigger){if(!live.roomId)return;live.qrActivity=k;live.qrFocus=trigger;$('qrRoomName').textContent=live.roomName;$('qrActivityTitle').textContent='Dinâmica '+D[k].n+' · '+D[k].t;paintQR(k,$('largeQr'),12);$('qrDialog').showModal();$('closeQr').focus();}
  function closeQr(){if($('qrDialog').open)$('qrDialog').close();live.qrActivity=null;live.qrFocus?.focus();live.qrFocus=null;}
  $('closeQr').addEventListener('click',closeQr);
  $('qrDialog').addEventListener('cancel',event=>{event.preventDefault();closeQr();});
  $('copyLargeQr').addEventListener('click',()=>{if(live.qrActivity)copyLink(live.qrActivity);});
  async function copyLink(k){
    if(!live.roomId)return;
    try{await navigator.clipboard.writeText(participantUrl(k));toast('Link para responder copiado');}
    catch{prompt('Copie o link para responder:',participantUrl(k));}
  }
  function cancelTransition(k){(live.transitions[k]||[]).forEach(clearTimeout);live.transitions[k]=[];}
  function cancelDraw(k){const d=live.draws[k];if(d){clearInterval(d.interval);clearTimeout(d.timeout);delete live.draws[k];}if(D[k].talk)closeDraw(k);}
  function after(k,fn,delay){const roomId=live.roomId,roundId=live.states[k]?.roundId;live.transitions[k]??=[];live.transitions[k].push(setTimeout(()=>{if(roomId===live.roomId&&roundId===live.states[k]?.roundId&&live.states[k]?.phase==='done')fn();},delay));}
  function setEnergy(k,animate){
    if(!D[k].car)return;
    const e=Math.min(S[k].resp.length/TARGET,1);lastE[k]=e;
    $('bar_'+k).style.width=e*100+'%';$('gw_'+k).textContent=(e*1.21).toFixed(2)+' / 1.21 GIGAWATTS';
    $('lvl_'+k).textContent=e>=1?'⚡ ENERGIA MÁXIMA — PRONTO PARA A VIAGEM':'NÍVEL DE ENERGIA: '+Math.round(e*100)+'%';
    $('car_'+k).style.setProperty('--e',e);
    if(window.C3?.[k]){if(animate&&live.states[k]?.phase!=='done'){C3[k].charge(e);if(cur===k)beep(180+e*900,.08);}else{C3[k].e=e;C3[k].dirty=true;}}
  }
  function resetVisual(k){
    cancelTransition(k);cancelDraw(k);
    if(D[k].car)savedReset(k);
    else{$('cloud_'+k).classList.add('on');S[k].phase='idle';}
    setEnergy(k,false);
  }
  function clearLocal(k){
    resetVisual(k);S[k].resp=[];S[k].drawn=[];S[k].tt=D[k].talk||0;resetCloudData(k);
    $('feed_'+k).replaceChildren();updCount(k);setEnergy(k,false);
  }
  function showEnded(k){
    if(!D[k].car)return;
    $('scene_'+k).style.display='none';$('cloud_'+k).classList.add('on');
    if(D[k].final){$('final_'+k).classList.add('on');clouds[k].dim=true;clouds[k].dirty=true;}
    if(D[k].talk)$('drawBtn_'+k).disabled=S[k].resp.length===0;
    if(cur===k)resizeCloud(k);
  }
  function animateEnd(k){
    cancelTransition(k);
    if(!D[k].car)return;
    if(reducedMotion){showEnded(k);return;}
    window.C3?.[k]?.doWarp();
    after(k,()=>{if(cur===k){$('flash_'+k).classList.add('on');beep(880,.3);}},2300);
    after(k,()=>showEnded(k),2600);
  }
  function ingest(response){
    const k=response.activityId;
    if(!D[k]||live.seen.has(response.id)||response.roundId!==live.states[k]?.roundId)return;
    live.seen.add(response.id);
    S[k].resp.push({id:response.id,n:response.name||'Anônimo',a:response.answer,t:new Date(response.createdAt)});
    addWords(k,response.answer);return true;
  }
  function displayState(k,state,previous,initial){
    const changed=previous?.phase!==state.phase;
    if(changed&&previous?.phase==='done'&&state.phase!=='done')resetVisual(k);
    S[k].phase=state.phase;S[k].t=state.remainingSeconds;
    $('liveState_'+k).textContent=phaseLabels[state.phase]||'Sincronizando…';
    $('liveState_'+k).dataset.phase=state.phase;
    if(state.phase==='done'&&(changed||initial)){
      if(initial||cur!==k)showEnded(k);else animateEnd(k);
    }
  }
  function applySnapshot(data,initial){
    if (Object.hasOwn(data, 'presentation')) live.presentation = data.presentation;
    live.offset=Number(data.serverNow)-Date.now();
    const old={...live.states};let cleared=false;
    for(const state of data.activities){
      if(!D[state.id])continue;
      if(old[state.id]&&old[state.id].roundId!==state.roundId){clearLocal(state.id);cleared=true;}
      live.states[state.id]=state;
    }
    if(cleared){live.cursor=0;live.seen=new Set(keys.flatMap(k=>S[k].resp.map(r=>r.id)));}
    const touched=new Set(),visible=[];const quiet=initial||cleared;
    for(const response of data.responses||[])if(ingest(response)){touched.add(response.activityId);if(!quiet&&response.activityId===cur)visible.push(response);}
    for(const k of touched){updCount(k);setEnergy(k,!quiet&&cur===k);if(D[k].talk&&live.states[k]?.phase==='done'&&$('scene_'+k).style.display==='none')$('drawBtn_'+k).disabled=false;}
    for(const response of visible.slice(-4)){const k=response.activityId,item=document.createElement('div'),name=document.createElement('b');name.textContent=response.name||'Anônimo';item.append(name,document.createTextNode(' · '+response.answer));$('feed_'+k).prepend(item);setTimeout(()=>item.remove(),3600);}
    const feed=cur?$('feed_'+cur):null;
    if(feed)while(feed.children.length>4)feed.lastChild.remove();
    for(const state of data.activities)if(D[state.id])displayState(state.id,state,old[state.id],initial);
    if(!cleared)live.cursor=Number(data.cursor)||live.cursor;
    live.ready=true;live.failures=0;connection(true,'Ao vivo · respostas salvas');tick();refreshButtons();
  }
  function tick(){
    for(const k of keys){const state=live.states[k];if(!state||!D[k].car)continue;
      const seconds=state.phase==='run'&&state.endsAt!==null?Math.max(0,Math.ceil((state.endsAt-Date.now()-live.offset)/1000)):state.remainingSeconds;
      if(S[k].t!==seconds||$('tim_'+k).textContent!==fmt(seconds)){S[k].t=seconds;tim(k);}
    }
  }
  function refreshButtons(){
    for (const [key, button] of presentationButtons) {
      const active = live.presentation?.roomId === live.roomId && live.presentation?.activityId === key;
      button.textContent = active ? 'Em exibição' : 'Exibir no telão e nos celulares';
      button.disabled = active || !live.ready || !live.online || live.presentationBusy || live.busy.size > 0;
    }
    for (const id of ['stopPresentation', 'stopPresentationOverlay']) {
      const button = $(id);
      button.hidden = !live.presentation;
      button.disabled = live.presentationBusy || live.busy.size > 0;
    }
    for(const button of document.querySelectorAll('[data-command]')){
      const k=button.dataset.activity,state=live.states[k],action=button.dataset.command;
      button.disabled=!live.ready||!live.online||live.busy.has(k)||live.presentationBusy||!state;
      if(!state)continue;
      if(action==='start'){button.disabled||=state.phase==='run'||state.phase==='done';button.textContent=state.phase==='paused'?'▶ Retomar recebimento':D[k].car?'▶ Iniciar recebimento (2 min)':'▶ Abrir recebimento';}
      if(action==='pause')button.disabled||=state.phase!=='run';
      if(action==='end')button.disabled||=state.phase==='done';
    }
    for(const button of document.querySelectorAll('[onclick^="clearD"]'))button.disabled=!live.ready||!live.online||live.busy.size>0||live.presentationBusy;
  }
  async function poll(gen){
    if(gen!==live.generation||!live.roomId||document.hidden)return;
    clearTimeout(live.pollTimer);live.abort=new AbortController();
    try{
      const data=await api(`/api/rooms/${live.roomId}/snapshot?after=${live.cursor}`,{signal:live.abort.signal});
      if(gen!==live.generation)return;
      applySnapshot(data,!live.ready);
    }catch(error){
      if(gen!==live.generation||error.name==='AbortError')return;
      live.failures++;live.authExpired=error.status===401;
      if(live.authExpired){$('liveSignIn').href='/signin-with-chatgpt?return_to='+encodeURIComponent('/painel'+location.search);$('liveSignIn').hidden=false;}
      connection(false,live.authExpired?'Sessão expirada':'Reconectando… respostas preservadas');
      if(!live.ready){$('roomError').textContent=error.message;}
    }finally{
      if(gen===live.generation&&!document.hidden&&!live.authExpired){const delay=live.online?1000:Math.min(30000,1000*2**Math.min(live.failures,5)+Math.random()*500);live.pollTimer=setTimeout(()=>poll(gen),delay);}
    }
  }
  async function command(k,action){
    if(!live.roomId||!live.ready||!live.online||live.busy.has(k)||live.presentationBusy)return;
    const roomId=live.roomId,gen=live.generation;live.busy.add(k);refreshButtons();
    try{
      await api(`/api/rooms/${roomId}/activities/${k}/command`,{method:'POST',body:JSON.stringify({action})});
      if(gen!==live.generation)return;
      // Fetch the authoritative snapshot; never advance the local collection optimistically.
      live.abort?.abort();clearTimeout(live.pollTimer);live.generation++;await poll(live.generation);
    }catch(error){if(gen===live.generation){toast(error.message);if(error.status===409){live.abort?.abort();clearTimeout(live.pollTimer);live.generation++;await poll(live.generation);}}}
    finally{live.busy.delete(k);refreshButtons();}
  }
  async function setPresentation(activityId) {
    if (live.presentationBusy || live.busy.size || (activityId && (!live.roomId || !live.ready || !live.online))) return;
    live.presentationBusy = true;
    refreshButtons();
    const selection = activityId ? {roomId: live.roomId, activityId} : {roomId: null};
    try {
      const result = await api('/api/admin/presentation', {method: 'POST', body: JSON.stringify(selection)});
      live.presentation = result.presentation;
      if (live.roomId) reconcile();
      else await loadRooms();
      toast(activityId ? 'Dinâmica exibida no telão e nos celulares' : 'Townhall restaurado no telão e nos celulares');
    } catch (error) {
      if (!$('roomOverlay').hidden) $('roomError').textContent = error.message;
      else toast(error.message);
    } finally {
      live.presentationBusy = false;
      refreshButtons();
    }
  }
  async function chooseRoom(room){
    closeQr();live.generation++;live.abort?.abort();clearTimeout(live.pollTimer);live.busy.clear();live.failures=0;live.authExpired=false;$('liveSignIn').hidden=true;
    live.roomId=room.id;live.roomName=room.name;live.cursor=0;live.states={};live.seen.clear();live.ready=false;
    for(const k of keys){clearLocal(k);renderQR(k);$('liveState_'+k).textContent='Conectando à sala…';}
    $('liveRoomName').textContent=room.name;$('roomOverlay').hidden=true;
    const url=new URL(location.href);url.searchParams.set('sala',room.id);history.replaceState(null,'',url);
    connection(false,'Conectando…');go('menu');
    const generation=live.generation;await poll(generation);
    if(generation===live.generation&&!live.ready&&!document.hidden){$('roomOverlay').hidden=false;$('cancelRoom').hidden=false;}
  }
  async function loadRooms(restore=false){
    $('roomError').textContent='';$('roomList').textContent='Carregando salas…';
    try{
      const data=await api('/api/rooms');$('roomList').replaceChildren();
      if (Object.hasOwn(data, 'presentation')) live.presentation = data.presentation;
      refreshButtons();
      if(!data.rooms?.length)$('roomList').textContent='Você ainda não criou uma sala.';
      for(const room of data.rooms||[]){
        const button=document.createElement('button');button.type='button';button.className='live-room-item';
        const name=document.createElement('strong');name.textContent=room.name;
        const detail=document.createElement('span');detail.textContent='Abrir sala →';button.append(name,detail);
        button.addEventListener('click',()=>chooseRoom(room));$('roomList').append(button);
      }
      if (restore) {
        const params = new URL(location.href).searchParams;
        const id = params.get('sala') || live.presentation?.roomId;
        const room = (data.rooms || []).find(item => item.id === id);
        const activity = params.get('d') || (id === live.presentation?.roomId ? live.presentation.activityId : null);
        if (room) {
          await chooseRoom(room);
          if (Object.hasOwn(D, activity)) go(activity);
        }
      }
    }catch(error){
      $('roomList').textContent='Não foi possível carregar suas salas.';$('roomError').textContent=error.message;
      if(error.status===401){const a=document.createElement('a');a.href='/signin-with-chatgpt?return_to='+encodeURIComponent('/painel'+location.search);a.target='_top';a.textContent='Entrar novamente';a.className='live-open-link';$('roomList').append(a);}
      const retry=document.createElement('button');retry.textContent='Tentar novamente';retry.className='live-room-button';retry.addEventListener('click',()=>loadRooms());$('roomList').append(retry);
    }
  }
  $('createRoomForm').addEventListener('submit',async event=>{
    event.preventDefault();const name=$('newRoomName').value.trim();if(!name)return;
    const button=$('createRoomButton');button.disabled=true;button.textContent='Criando…';$('roomError').textContent='';
    try{const room=await api('/api/rooms',{method:'POST',body:JSON.stringify({name})});await chooseRoom(room);}
    catch(error){$('roomError').textContent=error.message;}
    finally{button.disabled=false;button.textContent='Criar sala';}
  });
  $('switchRoom').addEventListener('click',()=>{$('roomOverlay').hidden=false;$('cancelRoom').hidden=!live.roomId;loadRooms();$('newRoomName').focus();});
  $('cancelRoom').addEventListener('click',()=>{$('roomOverlay').hidden=true;});

  // A draw is local to this presentation. Guard overlapping animations and cleanup on room/round changes.
  draw = k => {
    if(live.draws[k]||live.states[k]?.phase!=='done')return;
    const st=S[k],pool=st.resp.filter(r=>!st.drawn.includes(r));
    if(!pool.length){toast(st.resp.length?'Todos já foram sorteados':'Nenhuma resposta recebida');return;}
    const ov=$('draw_'+k),reel=$('reel_'+k),ans=$('ans_'+k);ov.classList.add('on');ans.style.display='none';reel.classList.add('spin');talk(k,'reset');
    const roomId=live.roomId,round=live.states[k].roundId;
    const interval=setInterval(()=>{if(st.resp.length)reel.textContent=st.resp[Math.floor(Math.random()*st.resp.length)].n;},90);
    const timeout=setTimeout(()=>{clearInterval(interval);delete live.draws[k];if(roomId!==live.roomId||round!==live.states[k]?.roundId)return;
      const winner=pool[Math.floor(Math.random()*pool.length)];st.drawn.push(winner);reel.classList.remove('spin');reel.textContent=winner.n;ans.textContent='“'+winner.a+'”';ans.style.display='block';beep(660,.25);
    },2400);live.draws[k]={interval,timeout};
  };
  window.TownhallPanel={copyLink,chooseRoom};
  function reconcile(){if(!live.roomId||document.hidden)return;live.abort?.abort();clearTimeout(live.pollTimer);live.generation++;live.authExpired=false;connection(false,'Atualizando sala…');poll(live.generation);}
  window.addEventListener('online',()=>{if(!live.online)reconcile();});
  window.addEventListener('offline',()=>connection(false,'Sem conexão · aguardando rede'));
  document.addEventListener('visibilitychange',()=>{if(document.hidden){live.abort?.abort();clearTimeout(live.pollTimer);live.generation++;connection(false,'Atualização pausada em segundo plano');}else reconcile();});
  setInterval(()=>{if(!document.hidden)tick();},250);refreshButtons();loadRooms(true);
})();
