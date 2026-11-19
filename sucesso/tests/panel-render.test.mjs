import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

// Execute the actual inline controllers with a controlled clock and canvas.
// No browser, network, real timers, or production room is involved.
const html = await readFile(new URL('../public/painel.html', import.meta.url), 'utf8');
function section(start, end) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Panel source section exists: ${start}`);
  return html.slice(from, to);
}
const cloudSource = section('const STOP=new Set(', '/* ================= DOWNLOAD');
const talkSource = section('function talk(k,a)', '/* ================= ENERGIZAÇÃO');
const formatSource = html.match(/function fmt\(s\)[^\r\n]*/)?.[0];
assert.ok(formatSource, 'Panel time formatter exists');
const sceneLoopSource = section(' let last=performance.now(),paintedRevision=-1;', '\n})();');

function cloudHarness() {
  let now = 0;
  const draws = {frames: 0, words: []};
  const paint = {
    clearRect() { draws.frames++; draws.words = []; },
    fillText(text) { draws.words.push(text); },
    fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
  };
  const canvas = {
    width: 0, height: 0,
    parentElement: {
      classList: {contains: () => true},
      getBoundingClientRect: () => ({width: 1000, height: 600}),
    },
    getContext: () => paint,
  };
  const context = vm.createContext({
    D: {d1: {}}, cur: 'd1', reducedMotion: false, devicePixelRatio: 3,
    document: {hidden: false, getElementById: () => canvas},
    window: {addEventListener() {}}, performance: {now: () => now},
    requestAnimationFrame() {},
  });
  const subject = vm.runInContext(`${cloudSource}\n({clouds, addWords, resetCloudData, resizeCloud, render})`, context);
  subject.resizeCloud('d1');
  return {
    ...subject, context, canvas, draws,
    frame(time) { now = time; subject.render(time); },
  };
}

test('cloud retains 10,000 distinct terms and their frequencies while drawing only the top 100', () => {
  const h = cloudHarness();
  for (let i = 0; i < 10_000; i++) h.addWords('d1', `Termo ${i}`);
  for (let i = 0; i < 500; i++) h.addWords('d1', 'Termo 9999');
  h.frame(40);

  const cloud = h.clouds.d1;
  assert.equal(cloud.words.length, 10_000);
  assert.equal(cloud.byKey.size, 10_000);
  assert.equal(cloud.words.reduce((sum, word) => sum + word.c, 0), 10_500);
  assert.equal(cloud.byKey.get('termo 9999').c, 501);
  assert.equal(cloud.ranked.length, 100);
  assert.equal(cloud.ranked[0].key, 'termo 9999');
  assert.equal(h.draws.words.length, 100);
  assert.ok(h.draws.words.includes('Termo 9999'));
  assert.equal(h.canvas.width, 1500, 'High-DPI rendering has a bounded pixel budget');
});

test('clearing the cloud removes its frequency map and rendered words before a new round', () => {
  const h = cloudHarness();
  h.addWords('d1', 'Aprender');
  h.addWords('d1', 'Aprender');
  h.frame(40);
  h.resetCloudData('d1');
  h.frame(80);

  assert.equal(h.clouds.d1.words.length, 0);
  assert.equal(h.clouds.d1.byKey.size, 0);
  assert.equal(h.clouds.d1.ranked.length, 0);
  assert.ok(!h.draws.words.includes('Aprender'));
  h.addWords('d1', 'Aprender');
  h.frame(120);
  assert.equal(h.clouds.d1.byKey.get('aprender').c, 1);
  assert.deepEqual(h.draws.words, ['Aprender']);
});

test('cloud pauses while hidden and reduced motion redraws only changed content without rotation', () => {
  const h = cloudHarness();
  h.addWords('d1', 'Primeira');
  h.frame(40);
  const rotation = h.clouds.d1.rot;
  h.context.reducedMotion = true;
  h.frame(80);
  assert.equal(h.draws.frames, 1);

  h.addWords('d1', 'Segunda');
  h.frame(120);
  assert.equal(h.draws.frames, 2);
  h.frame(160);
  assert.equal(h.draws.frames, 2);

  h.context.document.hidden = true;
  h.addWords('d1', 'Terceira');
  h.frame(200);
  assert.equal(h.draws.frames, 2, 'Even dirty content waits while the page is hidden');
  h.context.document.hidden = false;
  h.frame(240);
  assert.equal(h.draws.frames, 3);
  assert.equal(h.draws.words.length, 3);
  assert.equal(h.clouds.d1.rot, rotation);
});

test('scene loop skips hidden pages and reduced motion paints only invalidated scenes', () => {
  let now = 0;
  const draws = {background: 0, car: 0};
  const scene = {dirty: true, frame() { draws.car++; this.dirty = false; }};
  const context = vm.createContext({
    cur: 'd2', reducedMotion: true, visualRevision: 0, C3: {d2: scene},
    bg: {frame() { draws.background++; }},
    document: {hidden: false, getElementById: () => ({style: {display: ''}})},
    performance: {now: () => now}, requestAnimationFrame() {},
    console: {error(error) { throw error; }},
  });
  const loop = vm.runInContext(`${sceneLoopSource}\nloop`, context);
  const frame = time => { now = time; loop(time); };
  frame(40);
  assert.deepEqual(draws, {background: 1, car: 1});
  frame(80);
  assert.deepEqual(draws, {background: 1, car: 1});
  scene.dirty = true;
  frame(120);
  assert.deepEqual(draws, {background: 1, car: 2});

  context.document.hidden = true;
  scene.dirty = true;
  context.visualRevision++;
  frame(160);
  assert.deepEqual(draws, {background: 1, car: 2});
  context.document.hidden = false;
  frame(200);
  assert.deepEqual(draws, {background: 2, car: 3});
});

function timerHarness() {
  let now = 0, nextId = 1;
  const intervals = new Map(), timeouts = new Map(), beeps = [];
  const label = {textContent: ''}, alerts = new Set();
  const wrapper = {classList: {toggle(name, on) { on ? alerts.add(name) : alerts.delete(name); }}};
  const state = {tk: null, tt: 0};
  const context = vm.createContext({
    S: {d2: state}, D: {d2: {talk: 120}},
    document: {getElementById: id => id === 'tk_d2' ? label : wrapper},
    performance: {now: () => now}, beep: (...args) => beeps.push(args),
    setInterval(fn) { const id = nextId++; intervals.set(id, fn); return id; },
    clearInterval: id => intervals.delete(id),
    setTimeout(fn) { const id = nextId++; timeouts.set(id, fn); return id; },
    clearTimeout: id => timeouts.delete(id),
  });
  const talk = vm.runInContext(`${formatSource}\n${talkSource}\ntalk`, context);
  return {
    state, label, alerts, intervals, timeouts, beeps,
    talk: action => talk('d2', action),
    advance(ms) { now += ms; },
    tick() { for (const callback of [...intervals.values()]) callback(); },
  };
}

test('speech timer follows elapsed time after a delayed callback and preserves the exact pause remainder', () => {
  const h = timerHarness();
  h.talk('reset');
  h.talk('start');
  h.advance(73_400);
  h.tick();
  assert.equal(h.label.textContent, '00:47');
  h.talk('pause');
  assert.equal(h.intervals.size, 0);
  assert.equal(h.state.talkRemainingMs, 46_600);

  h.advance(20_000);
  h.talk('start');
  assert.equal(h.label.textContent, '00:47');
  h.advance(16_600);
  h.tick();
  assert.equal(h.label.textContent, '00:30');
  assert.ok(h.alerts.has('alert'));
  h.advance(30_000);
  h.tick();
  assert.equal(h.label.textContent, '00:00');
  assert.equal(h.intervals.size, 0);
  assert.equal(h.state.tk, null);
  assert.equal(h.beeps.length, 1);
  assert.equal(h.timeouts.size, 2);
  h.tick();
  assert.equal(h.beeps.length, 1, 'Expiration is handled once');
  h.talk('reset');
  assert.equal(h.timeouts.size, 0, 'Reset cancels the previous expiration sounds');
  assert.equal(h.label.textContent, '02:00');
});

const adapterSource = await readFile(new URL('../public/live-panel.js', import.meta.url), 'utf8');
const goSource = html.match(/function go\(id\)[^\r\n]*/)?.[0];
assert.ok(goSource, 'Panel navigation function exists');

// Run the whole live adapter through its public room selection and scheduled poll,
// including the real panel navigation. Missing DOM elements deliberately return null.
async function adapterHarness() {
  const elements = new Map(), timers = new Map();
  let nextId = 1;
  class Element {
    constructor() {
      this.children = []; this.dataset = {}; this.textContent = ''; this.hidden = false;
      this.style = {setProperty() {}}; this.handlers = {}; this.open = false;
      const classes = new Set();
      this.classList = {
        add: name => classes.add(name), remove: name => classes.delete(name),
        contains: name => classes.has(name),
        toggle: (name, on) => on ? classes.add(name) : classes.delete(name),
      };
      this.parentElement = {after() {}};
    }
    get lastChild() { return this.children.at(-1); }
    append(...items) { for (const item of items) { item.parentElement = this; this.children.push(item); } }
    prepend(item) { item.parentElement = this; this.children.unshift(item); }
    replaceChildren(...items) { this.children = []; this.append(...items); }
    remove() { if (this.parentElement.children) this.parentElement.children = this.parentElement.children.filter(item => item !== this); }
    insertAdjacentHTML(position, markup) { for (const [, id] of markup.matchAll(/id="([^"]+)"/g)) elements.set(id, new Element()); }
    addEventListener(name, handler) { this.handlers[name] = handler; }
    setAttribute() {}
    focus() {}
    getContext() { return {fillRect() {}}; }
    showModal() { this.open = true; }
    close() { this.open = false; }
  }
  const body = new Element();
  const context = vm.createContext({
    document: {
      body, hidden: false, getElementById: id => elements.get(id) ?? null,
      createElement: () => new Element(), createTextNode: text => ({textContent: text}),
      querySelectorAll: selector => selector === '.screen' ? ['menu', 'd1', 'd2', 'd3', 'd4'].map(id => elements.get(id)) : [],
      addEventListener() {},
    },
    window: {addEventListener() {}},
    location: {origin: 'https://test.local', href: 'https://test.local/painel', search: ''},
    history: {replaceState() {}}, navigator: {}, URL, AbortController, console,
    S: {}, clouds: {}, lastE: {}, cur: null, visualRevision: 0, reducedMotion: true, TARGET: 20,
    phone() {}, submitPhone() {}, addSample() {}, addBatch() {}, autoSim() {}, preloadAll() {},
    stopAuto() {}, startC() {}, pauseC() {}, endC() {}, resetC() {}, clearD() {}, clearAll() {}, draw() {},
    closeDraw() {}, resetCloudData() {}, addWords() {}, updCount() {}, resizeCloud() {}, toast() {},
    tim(k) { elements.get('tim_' + k).textContent = String(context.S[k].t); },
    requestAnimationFrame() {}, setInterval: () => nextId++, clearInterval() {},
    setTimeout(fn, delay) { const id = nextId++; timers.set(id, {fn, delay}); return id; },
    clearTimeout: id => timers.delete(id),
    qrcode: () => ({addData() {}, make() {}, getModuleCount: () => 21, isDark: () => false}),
  });
  const definitions = vm.runInContext(`${section('const D={', 'const COLLECT=')}\nD`, context);
  for (const id of ['menu', 'phoneWrap']) elements.set(id, new Element());
  for (const k of Object.keys(definitions)) {
    context.S[k] = {resp: [], drawn: [], phase: 'idle', t: 120, auto: null};
    context.clouds[k] = {dirty: true};
    elements.set(k, new Element());
    for (const prefix of ['qr', 'participantLink', 'liveState', 'cloud', 'feed', 'bar', 'gw', 'lvl', 'car', 'scene', 'drawBtn', 'tim']) {
      elements.set(`${prefix}_${k}`, new Element());
    }
  }
  const responses = [];
  context.fetch = async path => ({
    ok: true,
    async json() {
      if (path === '/api/rooms') return {rooms: []};
      assert.match(path, /^\/api\/rooms\/room-1\/snapshot\?after=/);
      return {
        serverNow: Date.now(), cursor: responses.length,
        activities: Object.keys(definitions).map(id => ({id, roundId: 'round-' + id, phase: 'idle', remainingSeconds: 120, endsAt: null})),
        responses: responses.map(response => ({...response})),
      };
    },
  });
  vm.runInContext(`${formatSource}\n${goSource}`, context);
  vm.runInContext(adapterSource, context, {filename: 'live-panel.js'});
  for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
  return {
    context, elements, responses,
    async poll() {
      const scheduled = [...timers].find(([, timer]) => timer.delay === 1000);
      assert.ok(scheduled, 'A healthy foreground poll is scheduled');
      timers.delete(scheduled[0]);
      await scheduled[1].fn();
    },
  };
}

test('room snapshots apply from the menu and tolerate an active screen without a response feed', async () => {
  const h = await adapterHarness();
  h.responses.push({id: 'answer-1', activityId: 'd1', roundId: 'round-d1', name: 'Ana', answer: 'Aprender', createdAt: Date.now()});
  await h.context.window.TownhallPanel.chooseRoom({id: 'room-1', name: 'Sala de teste'});

  assert.equal(h.context.cur, null, 'Actual menu navigation clears the active activity');
  assert.equal(h.elements.has('feed_menu'), false);
  assert.equal(h.elements.get('liveConnection').textContent, 'Ao vivo · respostas salvas');
  assert.equal(h.elements.get('roomOverlay').hidden, true);
  assert.equal(h.context.S.d1.resp.length, 1);

  // A non-activity screen must not make a successful server snapshot look offline.
  h.context.cur = 'menu';
  h.responses.push({id: 'answer-2', activityId: 'd1', roundId: 'round-d1', name: 'Bia', answer: 'Colaborar', createdAt: Date.now()});
  await h.poll();
  assert.equal(h.elements.get('liveConnection').textContent, 'Ao vivo · respostas salvas');
  assert.equal(h.context.S.d1.resp.length, 2, 'New answers are ingested and previous answers remain deduplicated');
  assert.equal(h.elements.get('feed_d1').children.length, 0, 'An inactive activity does not get an animated feed');
});
