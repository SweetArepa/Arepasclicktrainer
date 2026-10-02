// Persistent settings (localStorage).
//
// The "working" layout (client size, frame position, boxes, screenshot) is what
// you see and edit. Named setups are saved copies of it; they only change when
// you press Save. Screenshots live in their own storage keys because they're big.

const SETTINGS_KEY = 'osrs-click-trainer.v2.settings';
const SHOT_KEY = size => `osrs-click-trainer.v2.shot.${size}`;          // legacy, per client size
const SETUP_SHOT_KEY = id => `osrs-click-trainer.v2.setupshot.${id}`;
const WORK_SHOT_KEY = 'osrs-click-trainer.v2.workshot';                 // a new, not-yet-saved screenshot
const TOOLBAR_H = 44, TITLEBAR_H = 22;

const DEFAULT_SETTINGS = {
  // working layout; clientX/Y = the game area's top-left, from the browser window's top-left
  clientW: 1280,
  clientH: 720,
  clientX: 16,
  clientY: TOOLBAR_H + TITLEBAR_H + 16,
  frameV: 2,
  // boxes: Maiden boxes · panel: inventory {x, y, scale} (null = bottom-right) ·
  // inv: 28 inventory slots of 'melee' | 'magic' | 'ranged' | null · nylo: boss box (null = default)
  // prayers: 30 prayer-tab cells (prayer id or null)
  work: { boxes: null, shotW: null, shotH: null, panel: null, inv: null, nylo: null, prayers: null },
  workShot: null,      // null (none) | 'new' (unsaved, in WORK_SHOT_KEY) | a setup id (that setup's screenshot)

  setups: null,        // [{ id, name, clientW, clientH, clientX, clientY, boxes, panel, inv, nylo, shotKey, shotW, shotH }]
  currentSetup: null,

  trainer: 'maiden',   // maiden | click | nylo

  countdownSec: 3,     // countdown before each round/run
  resultMs: 1200,      // how long the pass/fail result shows before the next countdown
  spawnable: ['S1', 'S2', 'N1', 'N2'], // positions allowed to spawn
  minCrabs: 1,
  maxCrabs: 4,
  pairMs: 600,         // one game tick
  showHints: false,    // mark the crab to freeze
  showHoverText: true, // OSRS-style "Cast Ice Rush ->" text top-left
  showLabels: true,    // S1/S2/N1/N2 labels on the red boxes

  // click trainer
  clickMode: 'classic',      // classic | swap | cast | mixed
  clickDuration: 30,         // seconds; 0 = free play
  clickTarget: 36,           // box size in px (an inventory slot is ~36)
  clickDelayMode: 'instant', // instant | fixed | random
  clickDelayMs: 300,
  clickDelayMin: 200,
  clickDelayMax: 800,
  clickSwapCount: 4,
  clickTickMs: 600,          // bonus window
  clickShowSpeed: true,
  clickKeys: { inventory: 'F1', equipment: 'F2', prayer: 'F3', magic: 'F4' }, // tab hotkeys (click + nylo trainers)

  // nylocas demi-boss trainer
  nyloPhaseSec: 10,          // the boss changes colour after this long
  nyloSpeedMelee: 3,         // seconds between attacks, by weapon style
  nyloSpeedRanged: 3,
  nyloSpeedMagic: 1.8,
};

function lsGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
function lsSet(key, value) { try { localStorage.setItem(key, value); return true; } catch (e) { return false; } }
function lsRemove(key) { try { localStorage.removeItem(key); } catch (e) {} }

function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(lsGet(SETTINGS_KEY) || '{}') || {}; } catch (e) { saved = {}; }
  const s = { ...structuredClone(DEFAULT_SETTINGS), ...saved };
  s.work = { ...DEFAULT_SETTINGS.work, ...(saved.work || {}) };
  s.clickKeys = { ...DEFAULT_SETTINGS.clickKeys, ...(saved.clickKeys || {}) };
  migrate(s, saved);
  removeEmptyAutoSetups(s);
  normalizeLayout(s.work);
  s.setups.forEach(normalizeLayout);
  return s;
}

// fill in layout fields added after a setup was saved, so older setups load cleanly
function normalizeLayout(o) {
  if (!Array.isArray(o.inv) || o.inv.length !== 28) o.inv = typeof DEFAULT_INV !== 'undefined' ? DEFAULT_INV.slice() : null;
  if (o.panel === undefined) o.panel = null;
  if (o.nylo === undefined) o.nylo = null;
  if (!Array.isArray(o.prayers) || o.prayers.length !== 30) o.prayers = typeof DEFAULT_PRAYER_SLOTS !== 'undefined' ? DEFAULT_PRAYER_SLOTS.slice() : null;
}

const sameBoxes = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// An older version stored a set of default boxes for every client size it drew
// (e.g. every step of dragging the frame edge), and the setups upgrade turned each
// of those into a "Saved W × H" setup. Remove the ones that hold nothing: default
// boxes, no screenshot, not currently open. Runs once.
function removeEmptyAutoSetups(s) {
  if (s.cleanV >= 1) return;
  s.cleanV = 1;
  s.setups = s.setups.filter(x =>
    x.id === s.currentSetup || x.shotKey || !/^Saved \d+ × \d+$/.test(x.name) ||
    !sameBoxes(x.boxes, defaultBoxes(x.clientW, x.clientH)));
}

// Older versions kept one set of boxes (and one screenshot) per client size, and
// positioned the frame below the toolbar and its title bar. Turn those into setups.
function migrate(s, saved) {
  if (!saved.frameV) {
    if (saved.clientY !== undefined) s.clientY = saved.clientY + TOOLBAR_H + TITLEBAR_H;
    s.frameV = 2;
  }
  if (Array.isArray(s.setups)) return;
  s.setups = [];
  const current = `${s.clientW}x${s.clientH}`;
  const perSize = saved.boxes || {};
  // skip sizes that only ever had auto-created default boxes and no screenshot
  const sizes = Object.keys(perSize).filter(size => {
    const [w, h] = size.split('x').map(Number);
    return size === current || lsGet(SHOT_KEY(size)) || !sameBoxes(perSize[size], defaultBoxes(w, h));
  });
  if (!sizes.includes(current)) sizes.unshift(current);
  sizes.sort((a, b) => (a === current ? -1 : b === current ? 1 : 0));
  for (const size of sizes) {
    const [w, h] = size.split('x').map(Number);
    const hasShot = !!lsGet(SHOT_KEY(size));
    s.setups.push({
      id: newId(), name: size === current ? 'Default' : `Saved ${w} × ${h}`,
      clientW: w, clientH: h, clientX: s.clientX, clientY: s.clientY,
      boxes: perSize[size] || defaultBoxes(w, h),
      shotKey: hasShot ? SHOT_KEY(size) : null, shotW: hasShot ? w : null, shotH: hasShot ? h : null,
    });
  }
  const def = s.setups[0];
  s.currentSetup = def.id;
  s.work = { boxes: structuredClone(def.boxes), shotW: def.shotW, shotH: def.shotH };
  s.workShot = def.shotKey ? def.id : null;
  delete s.boxes;
}

function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

let _saveTimer = null;
function saveSettings(s) {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => lsSet(SETTINGS_KEY, JSON.stringify(s)), 150);
}

function defaultBoxes(W, H) {
  const s = 56;
  const at = (fx, fy) => ({ x: Math.round(W * fx - s / 2), y: Math.round(H * fy - s / 2), w: s, h: s });
  return { S1: at(0.36, 0.36), S2: at(0.36, 0.58), N1: at(0.58, 0.36), N2: at(0.58, 0.58) };
}
