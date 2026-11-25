/* ===== Spotify no Painel do Doc =====
 * Liga o painel à conta do Spotify de quem apresenta, para a música do evento ser a que a pessoa escolher no Spotify dela:
 * o painel mostra o que está tocando, dá play/pausa/próxima, troca de aparelho, abre playlists e busca músicas.
 * No botão "🎧 Spotify" da barra de som, a trilha do app se cala e o Spotify toca; ao sair dele, o Spotify pausa.
 *
 * Como funciona (tudo no navegador de quem está no painel; o servidor do townhall nunca vê a conta nem as chaves):
 *   - login oficial do Spotify ("Authorization Code com PKCE"): a pessoa autoriza na página do Spotify e volta para o painel;
 *   - as chaves de acesso ficam guardadas só neste navegador (localStorage) e se renovam sozinhas;
 *   - os comandos usam a Web API do Spotify (api.spotify.com) e valem para o aparelho em que o Spotify está tocando
 *     (celular, computador, caixa de som) ou para este navegador ("Tocar neste computador", com o Web Playback SDK).
 *
 * Exigências do Spotify: um "app" criado em developer.spotify.com (de onde sai o Client ID), o endereço deste painel
 * cadastrado como Redirect URI e conta Premium. O passo a passo está em Preparar → Ajustes → Spotify.
 *
 *   Spoti.configure(clientId) · Spoti.login() · Spoti.logout() · Spoti.handleRedirect()
 *   Spoti.state → { configured, connected, player, devices, local, error } · Spoti.onChange(fn) · Spoti.refresh()
 *   Spoti.play({ uri }) · pause() · toggle() · next() · prev() · volume(0..100) · transfer(deviceId) · startLocal()
 *   Spoti.playlists() · Spoti.search(texto)
 */
window.Spoti = (() => {
  const AUTH = 'https://accounts.spotify.com', API = 'https://api.spotify.com/v1';
  const LS = 'bttf.spotify', LS_PKCE = 'bttf.spotify.pkce';
  const SCOPES = ['user-read-playback-state', 'user-modify-playback-state', 'user-read-currently-playing', 'playlist-read-private', 'playlist-read-collaborative', 'streaming', 'user-read-private'].join(' ');
  const read = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
  const write = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* navegador sem armazenamento: vale só nesta aba */ } };

  let clientId = '', tok = read(LS), listeners = [], pollT = null, refreshing = null, sdkPlayer = null, sdkLoading = null;
  const state = { configured: false, connected: !!(tok && tok.refresh), player: null, devices: [], local: null, error: '' };
  const emit = () => listeners.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } });
  const fail = (msg, extra = {}) => Object.assign(new Error(msg), extra);
  const redirectUri = () => `${location.origin}/admin.html`;

  /* ---------- login (PKCE) ---------- */
  const rand = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(b => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[b % 62]).join(''); };
  const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  async function login() {
    if (!clientId) throw fail('Falta o Client ID do Spotify (Preparar → Ajustes → Spotify).');
    if (!window.crypto || !crypto.subtle) throw fail('Para conectar ao Spotify, abra o painel pelo endereço https (ou http://127.0.0.1).');
    const verifier = rand(64), st = rand(16);
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    write(LS_PKCE, { verifier, state: st, clientId, at: Date.now() });
    const q = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirectUri(), state: st, scope: SCOPES, code_challenge_method: 'S256', code_challenge: challenge });
    location.assign(`${AUTH}/authorize?${q}`);
  }
  async function tokenRequest(params) {
    const r = await fetch(`${AUTH}/api/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw fail(j.error_description || j.error || `O Spotify recusou o acesso (${r.status}).`, { status: r.status, reason: j.error });
    return j;
  }
  const keep = (j, id) => { tok = { access: j.access_token, refresh: j.refresh_token || (tok && tok.refresh) || '', exp: Date.now() + (Number(j.expires_in) || 3600) * 1000, clientId: id }; write(LS, tok); state.connected = !!tok.refresh; };
  // A volta do Spotify para o painel: /admin.html?code=…&state=… (ou ?error=…). Troca o código pelas chaves e limpa o endereço.
  async function handleRedirect() {
    const q = new URLSearchParams(location.search), code = q.get('code'), err = q.get('error'), st = q.get('state'), p = read(LS_PKCE);
    if (!p || (!code && !err) || st !== p.state) return false;
    write(LS_PKCE, null);
    q.delete('code'); q.delete('state'); q.delete('error');
    history.replaceState(null, '', location.pathname + (q.toString() ? `?${q}` : '') + location.hash);
    if (err) { state.error = err === 'access_denied' ? 'A conexão com o Spotify foi cancelada.' : `O Spotify não liberou o acesso (${err}).`; emit(); return false; }
    try {
      keep(await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(), client_id: p.clientId, code_verifier: p.verifier }), p.clientId);
      if (!clientId) clientId = p.clientId;
      state.error = ''; state.configured = true; emit(); poll(); return true;
    } catch (e) { state.error = `Não deu para concluir a conexão com o Spotify: ${e.message}`; emit(); return false; }
  }
  function logout() {
    tok = null; write(LS, null); clearTimeout(pollT);
    if (sdkPlayer) { try { sdkPlayer.disconnect(); } catch { /* segue */ } sdkPlayer = null; }
    Object.assign(state, { connected: false, player: null, devices: [], local: null, error: '' }); emit();
  }
  async function accessToken() {
    if (!tok || !tok.refresh) throw fail('O Spotify não está conectado.', { reason: 'offline' });
    if (tok.access && tok.exp - Date.now() > 60000) return tok.access;
    if (!refreshing) refreshing = tokenRequest({ grant_type: 'refresh_token', refresh_token: tok.refresh, client_id: tok.clientId || clientId })
      .then(j => { keep(j, tok.clientId || clientId); })
      .catch(e => { if (e.status === 400 || e.status === 401) { logout(); state.error = 'A conexão com o Spotify expirou. Conecte de novo.'; emit(); } throw e; })
      .finally(() => { refreshing = null; });
    await refreshing;
    return tok.access;
  }

  /* ---------- Web API ---------- */
  const REASONS = { PREMIUM_REQUIRED: 'O Spotify só deixa controlar a música em contas Premium.', NO_ACTIVE_DEVICE: 'Nenhum aparelho com o Spotify aberto. Abra o Spotify (celular ou computador) ou use "Tocar neste computador".' };
  async function call(method, path, { query, body, retry = true } = {}) {
    const t = await accessToken(), url = `${API}${path}${query ? `?${new URLSearchParams(query)}` : ''}`;
    const r = await fetch(url, { method, headers: { Authorization: `Bearer ${t}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401 && retry) { tok.exp = 0; return call(method, path, { query, body, retry: false }); }
    if (r.status === 204 || r.status === 202) return null;
    const text = await r.text(); let j = null; try { j = text ? JSON.parse(text) : null; } catch { j = null; }
    if (r.ok) return j;
    const e = (j && j.error) || {}, reason = e.reason || '';
    const msg = REASONS[reason] || (r.status === 403 ? (/premium/i.test(e.message || '') ? REASONS.PREMIUM_REQUIRED : 'O Spotify não permitiu este comando (confira se a conta é Premium e se está na lista de usuários do app).')
      : r.status === 404 ? REASONS.NO_ACTIVE_DEVICE : r.status === 429 ? 'Muitos comandos seguidos. Espere alguns segundos.' : e.message || `O Spotify respondeu com erro (${r.status}).`);
    throw fail(msg, { status: r.status, reason });
  }
  const img = list => { const a = Array.isArray(list) ? list.filter(x => x && x.url) : []; return a.length ? a[a.length - 1].url : ''; }; // a menor imagem
  const artists = x => ((x && x.artists) || []).map(a => a.name).filter(Boolean).join(', ') || (x && x.show && x.show.name) || '';
  function shape(p) {
    if (!p || (!p.item && !p.device)) return null;
    const it = p.item || {}, d = p.device || {};
    return { playing: !!p.is_playing, name: it.name || '', artists: artists(it), image: img(it.album ? it.album.images : it.images), uri: it.uri || '', context: (p.context && p.context.uri) || '',
      progress: p.progress_ms || 0, duration: it.duration_ms || 0, at: Date.now(),
      device: d.id || d.name ? { id: d.id || '', name: d.name || 'Aparelho', type: d.type || '', volume: typeof d.volume_percent === 'number' ? d.volume_percent : null, canVolume: d.supports_volume !== false } : null };
  }
  async function refresh() {
    if (!state.connected) return state;
    try { state.player = shape(await call('GET', '/me/player', { query: { additional_types: 'track,episode' } })); if (state.error && !/expirou/.test(state.error)) state.error = ''; }
    catch (e) { if (e.reason !== 'offline') state.error = e.message; }
    emit(); return state;
  }
  async function devices() {
    const j = await call('GET', '/me/player/devices');
    state.devices = ((j && j.devices) || []).filter(d => d && d.id && !d.is_restricted).map(d => ({ id: d.id, name: d.name, type: d.type, active: !!d.is_active, volume: d.volume_percent }));
    emit(); return state.devices;
  }
  const soon = (ms = 700) => { clearTimeout(soon.t); soon.t = setTimeout(refresh, ms); };
  // O comando vai para o aparelho ativo. Se nenhum estiver ativo, escolhe um (este navegador, se estiver ligado; senão o primeiro da lista) e tenta de novo.
  async function withDevice(fn) {
    try { return await fn(undefined); }
    catch (e) {
      if (e.status !== 404 && e.reason !== 'NO_ACTIVE_DEVICE') throw e;
      const list = await devices(), d = list.find(x => x.id === state.local) || list.find(x => x.active) || list[0];
      if (!d) throw e;
      return fn(d.id);
    }
  }
  const dq = id => (id ? { query: { device_id: id } } : {});
  // play(): continua de onde parou · play({ uri }): toca uma playlist/álbum/artista (contexto) ou uma música
  async function play({ uri } = {}) {
    const body = !uri ? undefined : /^spotify:(track|episode):/.test(uri) ? { uris: [uri] } : { context_uri: uri };
    if (sdkPlayer && sdkPlayer.activateElement) { try { sdkPlayer.activateElement(); } catch { /* segue */ } }
    await withDevice(id => call('PUT', '/me/player/play', { ...dq(id), body }));
    if (state.player) state.player.playing = true; emit(); soon();
  }
  async function pause() {
    try { await call('PUT', '/me/player/pause'); } catch (e) { if (e.status !== 404 && e.status !== 403) throw e; } // já parado, ou sem aparelho: tudo bem
    if (state.player) state.player.playing = false; emit(); soon();
  }
  const toggle = () => (state.player && state.player.playing ? pause() : play());
  async function next() { await withDevice(id => call('POST', '/me/player/next', dq(id))); soon(500); }
  async function prev() { await withDevice(id => call('POST', '/me/player/previous', dq(id))); soon(500); }
  async function volume(n) {
    const v = Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
    await call('PUT', '/me/player/volume', { query: { volume_percent: v } });
    if (state.player && state.player.device) state.player.device.volume = v;
  }
  async function transfer(id, playNow = true) { await call('PUT', '/me/player', { body: { device_ids: [id], play: !!playNow } }); soon(900); setTimeout(() => devices().catch(() => {}), 1200); }
  async function playlists() {
    let j; try { j = await call('GET', '/me/playlists', { query: { limit: 20 } }); } catch (e) { if (e.status !== 400) throw e; j = await call('GET', '/me/playlists'); }
    return ((j && j.items) || []).filter(Boolean).map(p => ({ name: p.name, uri: p.uri, image: img(p.images), owner: (p.owner && p.owner.display_name) || '', total: ((p.items || p.tracks || {}).total) ?? null }));
  }
  async function search(text) {
    const q = String(text || '').trim(); if (!q) return { tracks: [], playlists: [] };
    const j = await call('GET', '/search', { query: { q, type: 'track,playlist', limit: 8 } });
    return { tracks: (((j && j.tracks) || {}).items || []).filter(Boolean).map(t => ({ name: t.name, artists: artists(t), uri: t.uri, image: img(t.album && t.album.images) })),
      playlists: (((j && j.playlists) || {}).items || []).filter(Boolean).map(p => ({ name: p.name, uri: p.uri, image: img(p.images), owner: (p.owner && p.owner.display_name) || '' })) };
  }

  /* ---------- tocar neste computador (Web Playback SDK) ---------- */
  function startLocal() {
    if (sdkPlayer && state.local) return transfer(state.local, true);
    if (!sdkLoading) sdkLoading = new Promise((resolve, reject) => {
      const boot = () => {
        try {
          const p = sdkPlayer = new window.Spotify.Player({ name: 'Townhall · Painel do Doc', getOAuthToken: cb => { accessToken().then(cb).catch(() => {}); }, volume: .8 });
          const bad = (kind, msg) => p.addListener(kind, e => { state.error = msg || (e && e.message) || 'O player do Spotify falhou neste navegador.'; emit(); reject(fail(state.error)); });
          p.addListener('ready', ({ device_id }) => { state.local = device_id; emit(); resolve(device_id); });
          p.addListener('not_ready', () => { state.local = null; emit(); });
          p.addListener('player_state_changed', () => soon(300));
          bad('initialization_error', 'Este navegador não consegue tocar o Spotify (tente o Chrome ou o Edge no computador).');
          bad('authentication_error', 'O Spotify não aceitou a conexão. Desconecte e conecte de novo.');
          bad('account_error', REASONS.PREMIUM_REQUIRED);
          p.addListener('playback_error', e => { state.error = (e && e.message) || 'O Spotify não conseguiu tocar esta música.'; emit(); });
          p.connect().then(ok => { if (!ok) reject(fail('O player do Spotify não conectou neste navegador.')); });
        } catch (e) { reject(e); }
      };
      if (window.Spotify && window.Spotify.Player) return boot();
      window.onSpotifyWebPlaybackSDKReady = boot;
      const s = document.createElement('script'); s.src = 'https://sdk.scdn.co/spotify-player.js'; s.async = true;
      s.onerror = () => reject(fail('Não deu para carregar o player do Spotify (sem internet ou bloqueado pela rede).'));
      document.head.appendChild(s);
      setTimeout(() => reject(fail('O player do Spotify demorou demais para iniciar neste navegador.')), 20000);
    }).catch(e => { sdkLoading = null; if (sdkPlayer) { try { sdkPlayer.disconnect(); } catch { /* segue */ } sdkPlayer = null; } throw e; });
    return sdkLoading.then(id => transfer(id, true));
  }

  /* ---------- acompanha o que está tocando (só com a aba visível) ---------- */
  function poll() {
    clearTimeout(pollT);
    if (!state.connected) return;
    pollT = setTimeout(async () => { if (!document.hidden) await refresh(); poll(); }, state.player && state.player.playing ? 4000 : 7000);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.connected) refresh(); });

  function configure(id) {
    const next = /^[0-9a-zA-Z]{20,64}$/.test(String(id || '')) ? String(id) : '';
    if (next === clientId && state.configured === !!next) return;
    clientId = next; state.configured = !!clientId;
    if (tok && tok.clientId && clientId && tok.clientId !== clientId) logout(); // trocaram o app do Spotify: a conexão antiga não vale mais
    emit(); if (state.connected) { refresh(); poll(); }
  }
  return { configure, login, logout, handleRedirect, refresh, devices, play, pause, toggle, next, prev, volume, transfer, startLocal, playlists, search,
    onChange: fn => listeners.push(fn), redirectUri, get state() { return state; } };
})();
