// 触控 + 动态教程专项测试
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('NO SCRIPT'); process.exit(1); }
const code = m[1];

// 每个元素给真实不同的矩形，才能测命中
const RECTS = {
  game:     { left: 0,   top: 0,   width: 844, height: 390 },
  leftBtn:  { left: 60,  top: 300, width: 60,  height: 60 },
  rightBtn: { left: 140, top: 300, width: 60,  height: 60 },
  eBtn:     { left: 740, top: 290, width: 72,  height: 72 },
  panel:    { left: 200, top: 60,  width: 440, height: 260 },
  tip:      { left: 0,   top: 0,   width: 10,  height: 10 },
  obj:      { left: 0,   top: 0,   width: 10,  height: 10 }
};

function makeEl(id) {
  const el = {
    id: id || '', _cls: new Set(), dataset: {}, children: [],
    style: { setProperty() {}, display: '' },
    textContent: '', innerHTML: '',
    classList: {
      add(c) { el._cls.add(c); }, remove(c) { el._cls.delete(c); },
      toggle(c, on) { if (on) el._cls.add(c); else el._cls.delete(c); },
      contains(c) { return el._cls.has(c); }
    },
    addEventListener(ev, fn) { (el._h || (el._h = {}))[ev] = fn; },
    appendChild(c) { el.children.push(c); return c; },
    querySelectorAll() { return []; },
    getBoundingClientRect() { const r = RECTS[id]; return r ? Object.assign({right:r.left+r.width,bottom:r.top+r.height}, r) : { left:0,top:0,width:0,height:0,right:0,bottom:0 }; },
    get parentNode() { return null; },
    setPointerCapture() {}, releasePointerCapture() {},
    _fire(ev, arg) { if (el._h && el._h[ev]) el._h[ev](arg || { preventDefault() {}, target: el, cancelable: true }); }
  };
  return el;
}

const ids = new Set();
for (const mm of html.matchAll(/id="([^"]+)"/g)) ids.add(mm[1]);
const registry = new Map();
for (const id of ids) registry.set(id, makeEl(id));

const spBtns = ['1','2','4'].map(s => { const e = makeEl('sp'+s); e.dataset.sp = s; return e; });

const ctxStub = new Proxy({
  canvas: { width: 320, height: 180 }, imageSmoothingEnabled: false,
  fillStyle: '#000', strokeStyle: '#000', globalAlpha: 1, lineWidth: 1,
  fillRect() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
  moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {}, translate() {}, scale() {},
  createRadialGradient() { return { addColorStop() {} }; },
  createLinearGradient() { return { addColorStop() {} }; },
  fillText() {}, measureText() { return { width: 10 }; }
}, { get(t,k){ return k in t ? t[k] : function(){}; }, set(t,k,v){ t[k]=v; return true; } });

const canvasEl = registry.get('c');
canvasEl.getContext = () => ctxStub;
canvasEl.width = 320; canvasEl.height = 180;

const docHandlers = {};
const documentStub = {
  getElementById(id) { if (!registry.has(id)) registry.set(id, makeEl(id)); return registry.get(id); },
  querySelectorAll(sel) { return sel === '[data-sp]' ? spBtns : []; },
  addEventListener(ev, fn) { (docHandlers[ev] || (docHandlers[ev] = [])).push(fn); },
  hidden: false,
  createElement() { return makeEl(); }
};
function fireDoc(ev, arg) { (docHandlers[ev] || []).forEach(fn => fn(arg)); }

let rafCb = null;
const sandbox = {
  window: {
    innerWidth: 844, innerHeight: 390, PointerEvent: function(){},
    addEventListener() {}, requestAnimationFrame(cb){ rafCb = cb; return 1; },
    document: documentStub, console, location: { search: '' }
  },
  document: documentStub,
  requestAnimationFrame(cb) { rafCb = cb; return 1; },
  location: { search: '' },
  console, Math, Date, JSON, parseInt, parseFloat, isNaN,
  String, Number, Object, Array, Boolean, Set, Map, setTimeout, clearTimeout
};
sandbox.globalThis = sandbox;
sandbox.window.requestAnimationFrame = sandbox.requestAnimationFrame;
sandbox.window.PointerEvent = function(){};

vm.createContext(sandbox);
try {
  vm.runInContext(code, sandbox, { filename: 'game.js', timeout: 20000 });
} catch (e) {
  console.log('LOAD ERROR:', e.message);
  console.log((e.stack||'').split('\n').slice(0,5).join('\n'));
  process.exit(1);
}

const log = [];
let ts = 0;
const loopErrors = [];
function step(n, ms) {
  for (let i = 0; i < n; i++) {
    ts += (ms || 16.7);
    if (rafCb) {
      const cb = rafCb; rafCb = null;
      try { cb(ts); } catch (e) {
        if (loopErrors.length < 5) loopErrors.push(e.message + ' | ' + (e.stack || '').split('\n')[1]);
      }
    }
  }
}
const secs = s => step(Math.round(s*60), 16.7);
function run(label, fn) { try { fn(); log.push('OK   '+label); } catch(e){ log.push('FAIL '+label+' :: '+e.message); } }

const D = sandbox.window.__DBG__;
// reset() 会重建 G 对象，测试里必须始终访问「当前」的 G
const G = new Proxy({}, {
  get(t, k) { return sandbox.window.__GAME__[k]; },
  set(t, k, v) { sandbox.window.__GAME__[k] = v; return true; }
});

// ---- 触控 ----
run('hitTest finds left button', () => {
  const h = D.hitTest(90, 330);
  if (h !== 'leftBtn') throw new Error('got ' + h);
});
run('hitTest finds right button', () => {
  const h = D.hitTest(170, 330);
  if (h !== 'rightBtn') throw new Error('got ' + h);
});
run('hitTest finds E button', () => {
  const h = D.hitTest(776, 326);
  if (h !== 'eBtn') throw new Error('got ' + h);
});
run('hitTest misses empty area', () => {
  const h = D.hitTest(450, 100);
  if (h !== null) throw new Error('got ' + h);
});
run('hitTest has finger padding', () => {
  const h = D.hitTest(52, 330); // 左侧按钮外 8px
  if (h !== 'leftBtn') throw new Error('got ' + h);
});

run('press left sets key + moves player', () => {
  D.handleAct('startGame'); if (D.menuOpen) D.closePanel();
  G.paused = false; G.started = true;
  const x0 = G.player.x;
  D.pressStart(90, 330);
  if (!D.keys.left) throw new Error('key not set');
  secs(1);
  if (G.player.x >= x0) throw new Error('did not move left: ' + x0 + ' -> ' + G.player.x);
});
run('pressEnd releases', () => {
  D.pressEnd();
  if (D.keys.left) throw new Error('key stuck');
});
run('press right moves player right', () => {
  const x0 = G.player.x;
  D.pressStart(170, 330);
  secs(1);
  D.pressEnd();
  if (G.player.x <= x0) throw new Error('did not move right: ' + x0 + ' -> ' + G.player.x);
});
run('E press opens home menu near home', () => {
  G.player.x = 0;
  G.paused = false;
  D.pressStart(776, 326);
  if (!D.menuOpen) throw new Error('menu not opened');
  if (!/家/.test(D.panel.innerHTML)) throw new Error('not home panel');
  D.closePanel();
});
run('E press ignored while menu open', () => {
  G.player.x = 0;
  D.homeMenu();
  const before = D.panel.innerHTML;
  D.pressStart(776, 326);
  if (D.panel.innerHTML !== before) throw new Error('panel changed');
  D.closePanel();
});

// ---- 教程 ----
run('tutorial starts at step 1', () => {
  D.handleAct('restart'); if (D.menuOpen) D.closePanel();
  G.paused = false; G.started = true;
  G.player.x = 0; G.moved = 0;
  D.setTut(0);
  step(2);
  if (D.tutIndex !== 0) throw new Error('idx=' + D.tutIndex);
  if (!D.tutActive) throw new Error('not active');
});
run('step1 completes after walking', () => {
  G.player.x = 0;
  D.setKey('right', true);
  secs(3);
  D.setKey('right', false);
  if (D.tutIndex < 1) throw new Error('idx=' + D.tutIndex + ' moved=' + G.moved);
});
run('step2 completes near hardware store', () => {
  G.player.x = -52;
  step(4);
  if (D.tutIndex < 2) throw new Error('idx=' + D.tutIndex + ' paused=' + G.paused + ' started=' + G.started + ' over=' + G.over + ' active=' + D.tutActive + ' phase=' + G.phase + ' x=' + G.player.x + ' moved=' + G.moved);
});
run('step3 completes on opening hardware menu', () => {
  D.hardwareMenu();
  D.closePanel();
  G.paused = false;
  step(4);
  if (D.tutIndex < 3) throw new Error('idx=' + D.tutIndex);
});
run('step4 completes on ordering', () => {
  G.purse = 5000;
  D.handleAct('order:conv');
  if (D.menuOpen) D.closePanel();
  G.paused = false;
  step(4);
  if (D.tutIndex < 4) throw new Error('idx=' + D.tutIndex);
});
run('step5 completes on placing', () => {
  const slot = D.slots.find(s => !s.st);
  G.player.x = slot.x;
  D.placeOrder(slot);
  step(4);
  if (D.tutIndex < 5) throw new Error('idx=' + D.tutIndex);
});
run('step6 completes when build finishes', () => {
  G.paused = false; secs(30);
  if (D.tutIndex < 6) throw new Error('idx=' + D.tutIndex);
});
run('step7 completes on collecting a coin', () => {
  const gy = 132;
  G.gcoins.push({ x: G.player.x, y: gy - 3, vx: 0, vy: 0, val: 12, life: 20, t: 0 });
  G.paused = false; secs(1);
  if (G.collected < 1) throw new Error('not collected phase=' + G.phase + ' paused=' + G.paused + ' coins=' + G.gcoins.length + ' px=' + G.player.x.toFixed(1));
  if (D.tutIndex < 7) throw new Error('idx=' + D.tutIndex);
});
run('tutorial ends by step 10 at latest', () => {
  D.setTut(9);
  G.day = 2;
  G.paused = false; step(4);
  if (D.tutActive && D.tutIndex >= 10) throw new Error('still active at end');
});
run('skipTut disables tutorial', () => {
  D.setTut(3);
  D.skipTut();
  step(4);
  if (D.tutActive) throw new Error('still active');
});
run('objective bar used after tutorial', () => {
  D.skipTut();
  G.paused = false;
  step(10);
  const box = sandbox.document.getElementById('objText');
  if (!box.innerHTML) throw new Error('objective empty');
});

function GY(){ return 132; }

console.log(log.join('\n'));
if (loopErrors.length) {
  console.log('\n--- LOOP ERRORS ---');
  loopErrors.forEach(e => console.log(e));
}
const fails = log.filter(l => l.startsWith('FAIL'));
console.log('\nFAILURES: ' + fails.length);
process.exit(fails.length ? 1 : 0);
