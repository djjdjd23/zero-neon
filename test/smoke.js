// 鍐掔儫娴嬭瘯锛氱敤 stub DOM/Canvas 璺戠湡瀹炴父鎴忚剼鏈紝鎶撹繍琛屾椂閿欒
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('NO SCRIPT FOUND'); process.exit(1); }
const code = m[1];

function makeEl(id) {
  const el = {
    id: id || '',
    _cls: new Set(),
    dataset: {},
    style: { setProperty() {}, display: '' },
    textContent: '',
    innerHTML: '',
    children: [],
    classList: {
      add(c) { el._cls.add(c); },
      remove(c) { el._cls.delete(c); },
      toggle(c, on) { if (on) el._cls.add(c); else el._cls.delete(c); },
      contains(c) { return el._cls.has(c); }
    },
    addEventListener(ev, fn) { (el._h || (el._h = {}))[ev] = fn; },
    appendChild(c) { el.children.push(c); return c; },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { width: 320, height: 180, left: 0, top: 0 }; },
    get parentNode() { return null; },
    _fire(ev, arg) { if (el._h && el._h[ev]) el._h[ev](arg || { preventDefault() {}, target: el }); }
  };
  return el;
}

const ids = new Set();
for (const mm of html.matchAll(/id="([^"]+)"/g)) ids.add(mm[1]);
const registry = new Map();
for (const id of ids) registry.set(id, makeEl(id));

const spBtns = ['1', '2', '4'].map(s => { const e = makeEl('sp' + s); e.dataset.sp = s; return e; });

const ctxStub = new Proxy({
  canvas: { width: 320, height: 180 },
  imageSmoothingEnabled: false,
  fillStyle: '#000', strokeStyle: '#000', globalAlpha: 1, lineWidth: 1,
  fillRect() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
  moveTo() {}, lineTo() {}, save() {}, restore() {}, translate() {}, scale() {},
  createRadialGradient() { return { addColorStop() {} }; },
  createLinearGradient() { return { addColorStop() {} }; },
  fillText() {}, measureText() { return { width: 10 }; }
}, {
  get(t, k) { if (k in t) return t[k]; return function () {}; },
  set(t, k, v) { t[k] = v; return true; }
});

const canvasEl = registry.get('c');
canvasEl.getContext = () => ctxStub;
canvasEl.width = 320; canvasEl.height = 180;

const documentStub = {
  getElementById(id) { if (!registry.has(id)) registry.set(id, makeEl(id)); return registry.get(id); },
  querySelectorAll(sel) { if (sel === '[data-sp]') return spBtns; return []; },
  addEventListener() {}, hidden: false,
  createElement() { return makeEl(); }
};

let rafCb = null;
const windowStub = {
  innerWidth: 844, innerHeight: 390,
  addEventListener() {},
  requestAnimationFrame(cb) { rafCb = cb; return 1; },
  document: documentStub, console, location: { search: '' }
};

const sandbox = {
  window: windowStub, document: documentStub,
  requestAnimationFrame(cb) { rafCb = cb; return 1; },
  location: { search: '' }, console, Math, Date, JSON, parseInt, parseFloat, isNaN,
  String, Number, Object, Array, Boolean, Set, Map, setTimeout, clearTimeout
};
sandbox.globalThis = sandbox;
sandbox.window.requestAnimationFrame = sandbox.requestAnimationFrame;

vm.createContext(sandbox);
try {
  vm.runInContext(code, sandbox, { filename: 'game.js', timeout: 20000 });
} catch (e) {
  console.log('LOAD ERROR:', e.message);
  console.log((e.stack || '').split('\n').slice(0, 6).join('\n'));
  process.exit(1);
}

const log = [];
let ts = 0;
function step(n, ms) {
  for (let i = 0; i < n; i++) {
    ts += (ms || 16.7);
    if (rafCb) { const cb = rafCb; rafCb = null; cb(ts); }
  }
}
const secs = s => step(Math.round(s * 60), 16.7);

function run(label, fn) {
  try { fn(); log.push('OK   ' + label); }
  catch (e) { log.push('FAIL ' + label + ' :: ' + e.message); }
}

const D = sandbox.window.__DBG__;
const G = sandbox.window.__GAME__;

// 鑿滃崟浼氭殏鍋滄父鎴忥紝娴嬭瘯閲屾瘡娆″姩浣滃悗寮哄埗鍏抽棴
function act(a) { D.handleAct(a); if (D.menuOpen) D.closePanel(); step(2); }
function unpause() { if (D.menuOpen) D.closePanel(); G.paused = false; }

log.push('loaded ok, G.day=' + G.day + ' slots=' + D.slots.length);

run('start game', () => { act('startGame'); unpause(); step(5); });

run('order convenience store', () => {
  G.purse = 9000;
  act('order:conv');
  if (!G.order) throw new Error('order not set');
  const slot = D.slots.find(s => !s.st);
  D.placeOrder(slot);
  if (!slot.st || slot.st.state !== 'building') throw new Error('not building');
});

run('build finishes in 25s', () => {
  unpause();
  secs(30);
  const built = D.slots.find(s => s.st && s.st.kind === 'conv');
  if (!built) throw new Error('no conv');
  if (built.st.state !== 'ok') throw new Error('state=' + built.st.state + ' t=' + built.st.buildT.toFixed(1));
});

run('shop produces revenue', () => {
  const before = G.totalRevenue;
  unpause(); secs(30);
  if (G.totalRevenue <= before) throw new Error('no revenue (' + before + ' -> ' + G.totalRevenue + ')');
});

run('restock path', () => {
  const st = D.slots.find(s => s.st && s.st.kind === 'conv').st;
  st.stock = 0;
  act('restock:' + st.slot);
  if (st.restockT <= 0) throw new Error('restockT not set');
  unpause(); secs(12);
  if (st.stock <= 0) throw new Error('not restocked, t=' + st.restockT);
});

run('upgrade shop raises staff cap', () => {
  const st = D.slots.find(s => s.st && s.st.kind === 'conv').st;
  const lv = st.level;
  G.purse = 99999;
  act('upgrade:' + st.slot);
  if (st.level !== lv + 1) throw new Error('level=' + st.level);
});

run('hire fighters', () => {
  G.homeLevel = 6; G.powerCap = 40; G.purse = 99999;
  act('hireMelee'); act('hireRanged'); act('hireRobot');
  if (G.fighters.length < 3) throw new Error('fighters=' + G.fighters.length);
});

run('robot cap enforced', () => {
  G.purse = 99999;
  const before = G.fighters.filter(f => f.type === 'robot').length;
  for (let i = 0; i < 5; i++) act('hireRobot');
  const after = G.fighters.filter(f => f.type === 'robot').length;
  if (after > 1) throw new Error('robots=' + after);
  if (after < before) throw new Error('lost robot');
});

run('vault ops', () => {
  G.purse = 1000; G.vault = 0;
  act('vaultIn100');
  if (G.vault !== 100) throw new Error('vault=' + G.vault);
  act('vaultOutAll');
  if (G.vault !== 0) throw new Error('vault2=' + G.vault);
});

run('home upgrade', () => {
  G.homeLevel = 1; G.totalRevenue = 999999; G.prestige = 999; G.purse = 99999;
  act('homeUp');
  if (G.homeLevel !== 2) throw new Error('lvl=' + G.homeLevel);
  if (G.powerCap !== 16) throw new Error('power=' + G.powerCap);
});

run('power overload cuts structures', () => {
  G.homeLevel = 1; G.powerCap = 1; G.purse = 99999;
  D.recomputePower();
  const on = D.slots.filter(s => s.st && s.st.state === 'ok' && !s.st.off).length;
  if (on > 0) throw new Error('still powered=' + on);
  G.homeLevel = 6; G.powerCap = 40;
  D.recomputePower();
  if (D.slots.filter(s => s.st && s.st.off).length !== 0) throw new Error('not restored');
});

run('build 3 barricades for zhou', () => {
  G.purse = 99999;
  for (let i = 0; i < 3; i++) {
    act('order:barricade');
    const slot = D.slots.find(s => !s.st);
    if (slot) D.placeOrder(slot);
  }
  unpause(); secs(20);
  const n = D.slots.filter(s => s.st && s.st.kind === 'barricade' && s.st.state === 'ok').length;
  if (n < 3) throw new Error('barricades=' + n);
});

run('zhou task then join', () => {
  G.day = 5; G.zhou = { x: -36 };
  D.zhouDialog();
  if (!G.zhouTask) throw new Error('task not set');
  D.zhouDialog();
  if (!G.zhouJoined) throw new Error('not joined');
  D.closePanel();
  unpause();
});

run('night starts and locks speed', () => {
  D.startNight();
  if (G.phase !== 'night') throw new Error('phase=' + G.phase);
  if (G.speed !== 1) throw new Error('speed=' + G.speed);
  D.setSpeed(4);
  if (G.speed !== 1) throw new Error('night speed not locked');
});

run('night spawns waves', () => {
  unpause(); secs(30);
  if (G.enemies.length === 0) throw new Error('no enemies, wavesLeft=' + G.wavesLeft);
});

run('turret damages and kills a lone enemy', () => {
  G.over = false;
  G.phase = 'day'; G.paused = false; G.purse = 99999;
  act('order:turret');
  const free = D.slots.find(s => !s.st);
  if (free) D.placeOrder(free);
  unpause(); secs(15);
  const t = D.slots.find(s => s.st && s.st.kind === 'turret');
  if (!t) throw new Error('turret missing');
  G.phase = 'night';
  if (t.st.state !== 'ok') throw new Error('turret state=' + t.st.state);
  G.enemies.length = 0;
  G.enemies.push({ type:'thief', x: t.st.x + 40, hp: 20, maxHp: 20, dmg: 4, speed: 0, cd: 0, hitCd: 0, face: -1, stealT: 0 });
  const k0 = G.kills;
  secs(6);
  if (G.kills <= k0 && G.enemies.length > 0) throw new Error('turret did not kill (hp=' + (G.enemies[0] ? G.enemies[0].hp : 'dead') + ')');
});

run('end night + settle + new day', () => {
  D.endNight(false);
  if (G.phase !== 'settle') throw new Error('phase=' + G.phase);
  if (!D.menuOpen) throw new Error('settle panel not shown');
  const d0 = G.day;
  act('settleGo');
  if (G.phase !== 'day') throw new Error('phase2=' + G.phase);
  if (G.day !== d0 + 1) throw new Error('day=' + G.day);
});

run('player loses cash when hit, prestige drops', () => {
  D.startNight();
  unpause();
  G.purse = 1000;
  const pre0 = G.prestige;
  G.enemies.push({ type: 'thief', x: G.player.x, hp: 20, maxHp: 20, dmg: 4, speed: 22, cd: 0, hitCd: 0, face: 1, stealT: 0 });
  step(6);
  if (G.purse >= 1000) throw new Error('no cash lost');
  if (G.prestige >= pre0) throw new Error('no prestige lost');
});

run('home destroyed flow', () => {
  G.over = false;
  D.startNight();
  unpause();
  const lv0 = G.homeLevel;
  G.homeHP = 1; G.vault = 1000; G.prestige = 500;
  D.destroyHome();
  if (G.homeLevel !== lv0 - 1) throw new Error('lvl=' + G.homeLevel);
  if (!G.longDay) throw new Error('longDay not set');
  if (G.vault >= 1000) throw new Error('vault not reduced: ' + G.vault);
  if (G.phase !== 'settle') throw new Error('night not ended, phase=' + G.phase);
  act('settleGo');
  if (Math.abs(G.t-260)>2) throw new Error('next day length=' + G.t);
});

run('demolish returns money and clears slot', () => {
  G.over = false; G.purse = 99999;
  act('order:barricade');
  const slot = D.slots.find(s => !s.st);
  D.placeOrder(slot);
  unpause(); secs(12);
  const idx = D.slots.indexOf(slot);
  const p0 = G.purse;
  act('demolish:' + idx);
  if (D.slots[idx].st) throw new Error('still there');
  if (G.purse <= p0) throw new Error('no refund');
});

run('pawnshop buys drops', () => {
  G.over = false; G.purse = 99999;
  act('order:pawn');
  const slot = D.slots.find(s => !s.st);
  if (slot) D.placeOrder(slot);
  unpause(); secs(30);
  const p = D.slots.find(s => s.st && s.st.kind === 'pawn' && s.st.state === 'ok');
  if (!p) throw new Error('pawn not built');
  G.drops = 10;
  const p0 = G.purse;
  act('sellDrops');
  if (G.drops !== 0) throw new Error('drops=' + G.drops);
  if (G.purse !== p0 + 250) throw new Error('paid=' + (G.purse - p0));
});

run('ruin rebuild path', () => {
  G.over = false;
  const st = D.slots.find(s => s.st && s.st.state === 'ok');
  if (!st) throw new Error('nothing to ruin');
  st.st.state = 'ruin';
  D.shopMenu(st.st);
  if (!D.menuOpen) throw new Error('ruin menu not shown');
  D.closePanel(); unpause();
});

run('prestige zero ends game', () => {
  G.over = false; G.prestige = 3; G.phase = 'day';
  unpause();
  // 閫氳繃鐪熷疄璺緞鎵ｅ▉鏈涳細璁╂晫浜烘墦鐜╁
  D.startNight(); unpause();
  G.purse = 100;
  G.prestige = 3;
  G.enemies.push({ type: 'thief', x: G.player.x, hp: 999, maxHp: 999, dmg: 4, speed: 0, cd: 0, hitCd: 0, face: 1, stealT: 0 });
  step(200);
  if (!G.over) throw new Error('game not over at prestige=' + G.prestige);
});

run('8 day endurance run', () => {
  D.handleAct('restart'); if (D.menuOpen) D.closePanel();
  unpause();
  G.purse = 99999; G.prestige = 999;
  for (let d = 0; d < 8; d++) {
    if (G.over) break;
    G.paused = false;
    D.setSpeed(4);
    secs(60);
    if (G.phase === 'night') secs(160);
    if (D.menuOpen) { act('settleGo'); }
    unpause();
  }
});

console.log(log.join('\n'));
console.log('\n--- final ---');
console.log('day=' + G.day, 'phase=' + G.phase, 'purse=' + Math.floor(G.purse),
  'vault=' + Math.floor(G.vault), 'prestige=' + Math.floor(G.prestige),
  'homeLv=' + G.homeLevel, 'kills=' + G.kills,
  'structures=' + D.slots.filter(s => s.st).length, 'over=' + G.over);
const fails = log.filter(l => l.startsWith('FAIL'));
console.log('\nFAILURES: ' + fails.length);
process.exit(fails.length ? 1 : 0);
