// OSRS-style side panel: tab buttons, inventory, equipment and the Ancient
// spellbook. No DOM here; the panel is drawn on the game canvas and can sit
// anywhere in the frame at any scale. Gear is shown as colour-coded boxes:
// white = melee, blue = magic, green = ranged.

const STYLES = ['melee', 'magic', 'ranged'];
const STYLE_COLORS = { melee: '#f2f2f2', magic: '#3d8bff', ranged: '#3fc25a' };
const STYLE_NAMES = { melee: 'Melee', magic: 'Magic', ranged: 'Ranged' };

// default inventory: wearing melee, with a 4-piece magic and 4-piece ranged switch
const DEFAULT_INV = ['magic', 'magic', 'magic', 'magic', 'ranged', 'ranged', 'ranged', 'ranged'].concat(Array(20).fill(null));

// equipment slots shown in the equipment tab, in the order gear pieces fill them
const OSRS_EQUIP_ORDER = ['weapon', 'body', 'legs', 'head', 'cape', 'neck', 'shield', 'gloves', 'boots', 'ring', 'ammo'];
const OSRS_EQUIP_POS = {
  head: [77, 4], cape: [36, 43], neck: [77, 43], ammo: [118, 43],
  weapon: [21, 82], body: [77, 82], shield: [133, 82],
  legs: [77, 122], gloves: [21, 162], boots: [77, 162], ring: [133, 162],
};

// tabs: two rows of 7 (only the live ones do anything)
const OSRS_TABS = [
  { id: 'combat', label: 'Cmb' }, { id: 'skills', label: 'Stat' }, { id: 'quests', label: 'Qst' },
  { id: 'inventory', label: 'Inv', live: true }, { id: 'equipment', label: 'Eqp', live: true },
  { id: 'prayer', label: 'Pray', live: true }, { id: 'magic', label: 'Mage', live: true },
  { id: 'clan', label: 'Clan' }, { id: 'account', label: 'Acc' }, { id: 'friends', label: 'Frnd' },
  { id: 'logout', label: 'Out' }, { id: 'settings', label: 'Set' }, { id: 'emotes', label: 'Emo' }, { id: 'music', label: 'Mus' },
];

// Ancient spellbook with teleports filtered out: 4 per row, Ice Barrage last.
const OSRS_ELEMENTS = { smoke: '#9a9a9a', shadow: '#8a5cc8', blood: '#d0283a', ice: '#5fd0ff' };
const OSRS_TIERS = ['Rush', 'Burst', 'Blitz', 'Barrage'];
const OSRS_SPELLS = OSRS_TIERS.flatMap((tier, t) => ['smoke', 'shadow', 'blood', 'ice'].map(el => ({
  id: `${el}_${tier.toLowerCase()}`, name: `${el[0].toUpperCase()}${el.slice(1)} ${tier}`, element: el, tier: t,
})));

// The six prayers used by the Nylocas trainer, and which pair each style needs.
const PRAYERS = {
  protect_magic:   { name: 'Protect from Magic',    short: 'PMag', color: '#6aa8ff', group: 'overhead' },
  protect_missiles:{ name: 'Protect from Missiles', short: 'PRng', color: '#5fd07a', group: 'overhead' },
  protect_melee:   { name: 'Protect from Melee',    short: 'PMel', color: '#e8e8e8', group: 'overhead' },
  piety:           { name: 'Piety',                 short: 'Pie',  color: '#e8e8e8', group: 'boost' },
  rigour:          { name: 'Rigour',                short: 'Rig',  color: '#5fd07a', group: 'boost' },
  augury:          { name: 'Augury',                short: 'Aug',  color: '#6aa8ff', group: 'boost' },
};
const STYLE_PRAYERS = { melee: ['protect_melee', 'piety'], ranged: ['protect_missiles', 'rigour'], magic: ['protect_magic', 'augury'] };
// prayer tab = 5 × 6 grid of cells; each cell holds a prayer id or null
const DEFAULT_PRAYER_SLOTS = (() => {
  const a = Array(30).fill(null);
  ['protect_magic', 'protect_missiles', 'protect_melee'].forEach((id, i) => { a[i] = id; });
  ['piety', 'rigour', 'augury'].forEach((id, i) => { a[5 + i] = id; });
  return a;
})();

const osrsRect = (x, y, w, h) => ({ x, y, w, h });
const osrsIn = (r, x, y) => r && x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

// Panel block = side panel (204×275) with the two tab rows (7×33 by 2×36) under it.
const PANEL_BASE_W = 231, PANEL_BASE_H = 275 + 72;
function defaultPanelPos(W, H) { return { x: W - PANEL_BASE_W, y: H - PANEL_BASE_H, scale: 1 }; }

// pos = { x, y, scale }: top-left of the block in the game frame
function osrsLayout(pos) {
  const s = pos.scale, TW = 33 * s, TH = 36 * s, PW = 204 * s, PH = 275 * s;
  const ox = pos.x, oy = pos.y;
  const tabs = OSRS_TABS.map((tab, i) => ({ ...osrsRect(ox + (i % 7) * TW, oy + PH + (i < 7 ? 0 : TH), TW, TH), tab }));
  const panel = osrsRect(ox + (7 * TW - PW) / 2, oy, PW, PH);
  const content = osrsRect(panel.x + 7 * s, panel.y + 7 * s, 190 * s, 261 * s);
  const bounds = osrsRect(ox, oy, 7 * TW, PH + 2 * TH);
  return { s, tabs, panel, content, bounds };
}
function osrsInvRect(L, i) {
  const s = L.s, c = L.content, col = i % 4, row = Math.floor(i / 4);
  return osrsRect(c.x + (14 + col * 42) * s, c.y + (6 + row * 36) * s, 36 * s, 32 * s);
}
function osrsEquipRect(L, slot) {
  const [x, y] = OSRS_EQUIP_POS[slot];
  return osrsRect(L.content.x + x * L.s, L.content.y + y * L.s, 36 * L.s, 36 * L.s);
}
function osrsSpellRect(L, i) {
  const s = L.s, col = i % 4, row = Math.floor(i / 4);
  return osrsRect(L.content.x + (1 + col * 47 + 8.5) * s, L.content.y + (4 + row * 36 + 3) * s, 30 * s, 30 * s);
}
function osrsPrayerRect(L, i) {
  const s = L.s, col = i % 5, row = Math.floor(i / 5);
  return osrsRect(L.content.x + (2 + col * 37 + 2) * s, L.content.y + (4 + row * 37 + 2) * s, 33 * s, 33 * s);
}
// the resize handle in the block's bottom-right corner (edit mode)
function osrsResizeHandle(L) { const h = 14; return osrsRect(L.bounds.x + L.bounds.w - h, L.bounds.y + L.bounds.h - h, h, h); }

// what's under (x, y) in the panel; null if not over the panel at all
function osrsPanelHit(L, tab, x, y, prayerSlots) {
  for (const t of L.tabs) if (osrsIn(t, x, y)) return { kind: 'tab', tab: t.tab };
  if (!osrsIn(L.panel, x, y)) return null;
  if (tab === 'inventory') { for (let i = 0; i < 28; i++) if (osrsIn(osrsInvRect(L, i), x, y)) return { kind: 'inv', i }; }
  else if (tab === 'prayer') {
    for (let i = 0; i < 30; i++) if (osrsIn(osrsPrayerRect(L, i), x, y)) return { kind: 'prayer', cell: i, id: prayerSlots ? prayerSlots[i] : null };
  }
  else if (tab === 'magic') { for (let i = 0; i < OSRS_SPELLS.length; i++) if (osrsIn(osrsSpellRect(L, i), x, y)) return { kind: 'spell', spell: OSRS_SPELLS[i] }; }
  return { kind: 'panel' };
}

// ---------------------------------------------------------------- gear
// Each coloured box is one gear piece. Pieces are paired into equipment slots:
// the 1st magic box, 1st ranged box and 1st melee box share equipment slot 1, and
// so on. For each equipment slot you wear the style that isn't in your inventory
// (preferring melee, then magic, then ranged). Equipping a box puts the piece you
// were wearing into that inventory slot, like the game does.
class ColourGear {
  constructor(layout = DEFAULT_INV) {
    this.inv = Array.from({ length: 28 }, (_, i) => layout[i] || null);
    this.piece = Array(28).fill(null); // equipment slot index for each inventory box
    const count = { melee: 0, magic: 0, ranged: 0 };
    const present = [];                // present[j] = styles of slot j found in the inventory
    this.inv.forEach((style, i) => {
      if (!style) return;
      const j = count[style]++;
      this.piece[i] = j;
      (present[j] = present[j] || new Set()).add(style);
    });
    this.worn = present.map(set => STYLES.find(s => !set.has(s)) || null);
  }
  // equip inventory box i; returns the style equipped, or null
  equip(i) {
    const style = this.inv[i];
    if (!style) return null;
    const j = this.piece[i];
    this.inv[i] = this.worn[j];
    this.worn[j] = style;
    if (!this.inv[i]) this.piece[i] = null;
    return style;
  }
  has(i) { return !!this.inv[i]; }
  // true when no piece of this style is left in the inventory
  wearing(style) { return !this.inv.includes(style); }
  // styles you own gear for (in the inventory or worn)
  styles() { return STYLES.filter(s => this.inv.includes(s) || this.worn.includes(s)); }
  countIn(style) { return this.inv.filter(s => s === style).length; }
}

// ---------------------------------------------------------------- drawing
function osrsText(ctx, str, x, y, color, px, align = 'center') {
  ctx.font = `bold ${Math.round(px)}px "Trebuchet MS", Verdana, sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000'; ctx.fillText(str, x + 1, y + 1);
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}
function osrsStone(ctx, r, s) {
  ctx.fillStyle = '#3e3529'; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = '#15120d'; ctx.lineWidth = 2 * s; ctx.strokeRect(r.x + s, r.y + s, r.w - 2 * s, r.h - 2 * s);
  ctx.strokeStyle = '#5b4d3a'; ctx.lineWidth = 1; ctx.strokeRect(r.x + 3 * s, r.y + 3 * s, r.w - 6 * s, r.h - 6 * s);
}
function osrsGearBox(ctx, style, r, s) {
  const b = osrsRect(r.x + r.w / 2 - 15 * s, r.y + r.h / 2 - 14 * s, 30 * s, 28 * s);
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(b.x, b.y, b.w, b.h, 4 * s) : ctx.rect(b.x, b.y, b.w, b.h);
  ctx.fillStyle = STYLE_COLORS[style]; ctx.fill();
  ctx.lineWidth = 1.5 * s; ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.stroke();
}

function osrsPrayerIcon(ctx, id, r, s, on, alpha = 1) {
  const p = PRAYERS[id], cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  ctx.save(); ctx.globalAlpha = alpha;
  if (on) { ctx.fillStyle = 'rgba(255,230,140,.45)'; ctx.beginPath(); ctx.arc(cx, cy, r.w / 2, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = on ? p.color : '#6d6456';
  ctx.beginPath(); ctx.arc(cx, cy, r.w * 0.36, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1.5; ctx.stroke();
  osrsText(ctx, p.short, cx, cy + 1, on ? '#111' : '#e8dcc4', 9 * s);
  ctx.restore();
}

// view: { tab, gear, spell (selected spell id), highlight: Set of inventory slots, editing,
//         prayerSlots (30 cells), prayers: Set of active prayer ids, dragCell (prayer being dragged) }
function osrsDrawPanel(ctx, L, view) {
  const s = L.s;
  for (const t of L.tabs) {
    const active = t.tab.id === view.tab;
    ctx.fillStyle = active ? '#7a2a1c' : '#3e3529'; ctx.fillRect(t.x, t.y, t.w, t.h);
    ctx.strokeStyle = '#15120d'; ctx.lineWidth = 1; ctx.strokeRect(t.x + 0.5, t.y + 0.5, t.w - 1, t.h - 1);
    osrsText(ctx, t.tab.label, t.x + t.w / 2, t.y + t.h / 2 + 1, t.tab.live ? '#ffcf70' : '#8a7a60', 10 * s);
  }
  osrsStone(ctx, L.panel, s);
  const g = view.gear;
  if (view.tab === 'inventory') {
    for (let i = 0; i < 28; i++) {
      const r = osrsInvRect(L, i);
      if (view.editing) { ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1); }
      if (g.inv[i]) osrsGearBox(ctx, g.inv[i], r, s);
      if (view.highlight && view.highlight.has(i)) {
        ctx.strokeStyle = '#ffd400'; ctx.lineWidth = 2.5 * s; ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      }
    }
  } else if (view.tab === 'equipment') {
    OSRS_EQUIP_ORDER.forEach((slot, j) => {
      const r = osrsEquipRect(L, slot);
      ctx.fillStyle = '#28221a'; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = '#5b4d3a'; ctx.lineWidth = 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      if (g.worn[j]) osrsGearBox(ctx, g.worn[j], r, s);
    });
  } else if (view.tab === 'prayer') {
    const slots = view.prayerSlots || DEFAULT_PRAYER_SLOTS;
    for (let i = 0; i < 30; i++) {
      const r = osrsPrayerRect(L, i);
      if (view.editing) { ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1); }
      if (slots[i]) osrsPrayerIcon(ctx, slots[i], r, s, !!(view.prayers && view.prayers.has(slots[i])), view.dragCell === i ? 0.3 : 1);
    }
  } else if (view.tab === 'magic') {
    OSRS_SPELLS.forEach((sp, i) => {
      const r = osrsSpellRect(L, i), cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      ctx.fillStyle = OSRS_ELEMENTS[sp.element];
      ctx.beginPath(); ctx.arc(cx, cy, (9 + sp.tier * 1.8) * s, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1.5; ctx.stroke();
      osrsText(ctx, OSRS_TIERS[sp.tier].slice(0, 2), cx, cy + 1, '#fff', 9 * s);
      if (view.spell === sp.id) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(r.x, r.y, r.w, r.h); }
    });
  } else {
    osrsText(ctx, '(not used here)', L.content.x + L.content.w / 2, L.content.y + L.content.h / 2, '#8a7a60', 12 * s);
  }
  if (view.editing) {
    const b = L.bounds, h = osrsResizeHandle(L);
    ctx.setLineDash([5, 4]); ctx.strokeStyle = '#ff981f'; ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2); ctx.setLineDash([]);
    ctx.fillStyle = '#ff981f'; ctx.fillRect(h.x, h.y, h.w, h.h);
  }
}
