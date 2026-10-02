// Click trainer: targets pop up in the game frame; an OSRS-style panel sits in the
// bottom-right corner for gear swaps and manual Ice Barrage casts.
//
// Modes: classic (click boxes) · swap (click the highlighted inventory items) ·
//        cast (magic tab → Ice Barrage → click the box) · mixed (a random one each time).
// Scoring: every required click is 1 point, 2 if it lands within the tick window
// (600ms) of becoming due; a miss-click costs 1 point. A target stays up until hit.
// Scores: best + last 5 runs are kept for each mode + timer length; older runs are dropped.

const CLICK_SCORES_KEY = 'osrs-click-trainer.v2.clickscores';
const CLICK_MODES = { classic: 'Classic', swap: 'Swap', cast: 'Cast', mixed: 'Mixed' };

function makeClickTrainer(env) {
  const { S, ctx } = env;
  const st = {
    phase: 'idle',      // idle | countdown | running | done
    countdownEnd: 0,
    startAt: 0,
    endAt: null,        // null = free play
    task: null,
    nextAt: 0,
    run: null,
    summary: null,      // last finished run
    popups: [],
    misses: [],         // miss markers
    gear: new ColourGear(S.work.inv),
    tab: 'inventory',
    spell: null,        // selected spell id
  };

  const layout = () => env.panelLayout();
  const showsPanel = () => S.clickMode !== 'classic'; // Classic is boxes only
  const inR = (r, x, y) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
  const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const HUD = { x: 0, y: 0, w: 230, h: 130 };

  // ---------------------------------------------------------------- scores
  function loadScores() { try { return JSON.parse(lsGet(CLICK_SCORES_KEY) || '{}') || {}; } catch (e) { return {}; } }
  const scoreKey = () => `${S.clickMode}|${S.clickDuration}`;
  function recordScore(entry) {
    const all = loadScores();
    const rec = all[scoreKey()] || { best: null, recent: [] };
    const newBest = !rec.best || entry.score > rec.best.score;
    if (newBest) rec.best = entry;
    rec.recent = [entry, ...rec.recent].slice(0, 5); // keep the last 5, drop the rest
    all[scoreKey()] = rec;
    lsSet(CLICK_SCORES_KEY, JSON.stringify(all));
    return newBest;
  }

  // ---------------------------------------------------------------- tasks
  function spawnRect() {
    const size = S.clickTarget, L = layout(), W = S.clientW, H = S.clientH, m = 10;
    const avoid = [HUD];
    if (showsPanel()) avoid.push({ x: L.bounds.x - m, y: L.bounds.y - m, w: L.bounds.w + 2 * m, h: L.bounds.h + 2 * m });
    let r = null;
    for (let i = 0; i < 60; i++) {
      r = { x: m + Math.random() * Math.max(1, W - size - 2 * m), y: m + Math.random() * Math.max(1, H - size - 2 * m), w: size, h: size };
      if (!avoid.some(a => overlaps(a, r))) break;
    }
    r.x = Math.round(r.x); r.y = Math.round(r.y);
    return r;
  }
  function newTask(now) {
    const kinds = { classic: ['box'], swap: ['swap'], cast: ['cast'], mixed: ['box', 'swap', 'cast'] }[S.clickMode] || ['box'];
    let kind = kinds[Math.floor(Math.random() * kinds.length)];
    if (kind === 'swap') {
      const slots = st.gear.inv.map((_, i) => i).filter(i => st.gear.has(i)).sort(() => Math.random() - 0.5);
      const n = Math.min(S.clickSwapCount, slots.length);
      if (n) { st.task = { kind, slots: new Set(slots.slice(0, n)), due: now, total: n }; return; }
      kind = 'box';
    }
    st.task = { kind, rect: spawnRect(), due: now };
  }
  function delay() {
    if (S.clickDelayMode === 'fixed') return Math.max(0, S.clickDelayMs);
    if (S.clickDelayMode === 'random') {
      const lo = Math.max(0, Math.min(S.clickDelayMin, S.clickDelayMax)), hi = Math.max(S.clickDelayMin, S.clickDelayMax);
      return lo + Math.random() * (hi - lo);
    }
    return 0;
  }
  function complete(now) { st.task = null; st.nextAt = now + delay(); }

  // ---------------------------------------------------------------- scoring
  function hit(now, x, y) {
    const t = st.task, ms = now - t.due, tick = ms <= S.clickTickMs;
    st.run.score += tick ? 2 : 1;
    st.run.hits++;
    if (tick) st.run.tick++;
    st.run.times.push(ms);
    if (S.clickShowSpeed) st.popups.push({ x, y, text: `${Math.round(ms)}ms`, color: tick ? '#7dff7d' : '#ffffff', t: now });
    env.markStats();
  }
  function miss(now, x, y) {
    st.run.score -= 1;
    st.run.misses++;
    st.misses.push({ x, y, t: now });
    env.markStats();
  }

  // ---------------------------------------------------------------- flow
  function finish(now, save) {
    const r = st.run;
    const avgMs = r.times.length ? r.times.reduce((a, b) => a + b, 0) / r.times.length : null;
    const entry = {
      score: r.score, hits: r.hits, misses: r.misses, tick: r.tick,
      acc: r.hits + r.misses ? Math.round(r.hits / (r.hits + r.misses) * 100) : 0,
      avg: avgMs === null ? null : Math.round(avgMs), date: new Date().toISOString(),
    };
    st.summary = { ...entry, mode: S.clickMode, duration: S.clickDuration, saved: save, newBest: save ? recordScore(entry) : false };
    st.phase = 'done';
    st.task = null;
    st.spell = null;
    env.markStats();
  }

  const trainer = {
    id: 'click',
    get usesPanel() { return showsPanel(); },
    get running() { return st.phase === 'countdown' || st.phase === 'running'; },
    start(now) {
      st.phase = 'countdown';
      st.countdownEnd = now + S.countdownSec * 1000;
      st.gear = new ColourGear(S.work.inv);
      st.summary = null; st.task = null; st.popups = []; st.misses = []; st.spell = null;
      st.run = { score: 0, hits: 0, misses: 0, tick: 0, times: [] };
      env.markStats();
    },
    stop() {
      if (st.phase === 'running' && st.run && st.run.hits + st.run.misses) finish(performance.now(), false);
      else if (st.phase !== 'done') st.phase = 'idle';
      st.task = null;
    },
    clearStats() {
      const all = loadScores();
      delete all[scoreKey()];
      lsSet(CLICK_SCORES_KEY, JSON.stringify(all));
      env.markStats();
    },
    layoutChanged() { if (!trainer.running) st.gear = new ColourGear(S.work.inv); },
    settingChanged(key) {
      if (['clickMode', 'clickDuration'].includes(key)) { trainer.stop(); st.phase = 'idle'; st.summary = null; env.markStats(); }
    },

    tick(now) {
      if (st.phase === 'countdown' && now >= st.countdownEnd) {
        st.phase = 'running';
        st.startAt = now;
        st.endAt = S.clickDuration > 0 ? now + S.clickDuration * 1000 : null;
        newTask(now);
      } else if (st.phase === 'running') {
        if (st.endAt !== null && now >= st.endAt) finish(now, true);
        else if (!st.task && now >= st.nextAt) newTask(now);
      }
    },

    keyDown(e) {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      for (const [tab, bind] of Object.entries(S.clickKeys || {})) {
        if (bind && key === (bind.length === 1 ? bind.toLowerCase() : bind)) {
          e.preventDefault();
          st.tab = tab;
          return true;
        }
      }
      return false;
    },

    pointerDown(p, now) {
      const L = layout();
      const h = showsPanel() ? osrsPanelHit(L, st.tab, p.x, p.y) : null;
      if (h && h.kind === 'tab') { if (h.tab.live) st.tab = h.tab.id; return; } // tab clicks never count as misses

      const t = st.phase === 'running' ? st.task : null;
      if (!t) { // between runs (or between targets): the panel still works, nothing is scored
        if (h && h.kind === 'inv') st.gear.equip(h.i);
        if (h && h.kind === 'spell') st.spell = st.spell === h.spell.id ? null : h.spell.id;
        return;
      }

      if (t.kind === 'box') {
        if (!h && inR(t.rect, p.x, p.y)) { st.spell = null; hit(now, p.x, p.y); complete(now); }
        else miss(now, p.x, p.y);
      } else if (t.kind === 'swap') {
        if (h && h.kind === 'inv' && t.slots.has(h.i)) {
          st.gear.equip(h.i);
          t.slots.delete(h.i);
          hit(now, p.x, p.y);
          t.due = now; // the next item's clock starts now
          if (!t.slots.size) complete(now);
        } else miss(now, p.x, p.y);
      } else if (t.kind === 'cast') {
        if (h && h.kind === 'spell') {
          if (h.spell.id === 'ice_barrage' && st.spell !== 'ice_barrage') {
            st.spell = 'ice_barrage';
            hit(now, p.x, p.y);
            t.due = now; // now click the box
          } else {
            st.spell = st.spell === h.spell.id ? null : h.spell.id;
            miss(now, p.x, p.y);
          }
        } else if (!h && inR(t.rect, p.x, p.y) && st.spell === 'ice_barrage') {
          st.spell = null;
          hit(now, p.x, p.y);
          complete(now);
        } else {
          st.spell = null; // clicking anything else cancels the selected spell
          miss(now, p.x, p.y);
        }
      }
    },

    draw(now, W, H) {
      const text = env.text, L = layout(), t = st.task;

      // targets
      if (t && t.rect) {
        const r = t.rect, cast = t.kind === 'cast';
        ctx.fillStyle = cast ? 'rgba(95,208,255,.85)' : '#f2c230';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = cast ? '#e8fbff' : '#7a5a00'; ctx.lineWidth = 2;
        ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
        if (cast) text(st.spell === 'ice_barrage' ? '✓' : 'Cast', r.x + r.w / 2, r.y + r.h / 2, '#003a55', Math.max(10, r.w * 0.3), 'center', 'middle');
      }

      if (!env.placing() && showsPanel()) osrsDrawPanel(ctx, L, {
        tab: st.tab, gear: st.gear, spell: st.spell,
        highlight: t && t.kind === 'swap' ? t.slots : null,
      });
      // show which tab is needed when the current task can't be done from the open one
      if (t && !env.placing() && ((t.kind === 'swap' && st.tab !== 'inventory') || (t.kind === 'cast' && st.spell !== 'ice_barrage' && st.tab !== 'magic'))) {
        const need = t.kind === 'swap' ? 'inventory' : 'magic';
        const tr = L.tabs.find(x => x.tab.id === need);
        ctx.strokeStyle = '#ffd400'; ctx.lineWidth = 2; ctx.strokeRect(tr.x + 1, tr.y + 1, tr.w - 2, tr.h - 2);
      }

      // miss markers and speed labels
      st.misses = st.misses.filter(m => now - m.t < 400);
      for (const m of st.misses) {
        const k = (now - m.t) / 400, s = 6;
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#ff3030'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(m.x - s, m.y - s); ctx.lineTo(m.x + s, m.y + s); ctx.moveTo(m.x + s, m.y - s); ctx.lineTo(m.x - s, m.y + s); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      st.popups = st.popups.filter(p => now - p.t < 800);
      for (const p of st.popups) {
        const k = (now - p.t) / 800;
        ctx.globalAlpha = 1 - k * 0.8;
        text(p.text, p.x, p.y - 14 - k * 18, p.color, 14, 'center', 'middle');
        ctx.globalAlpha = 1;
      }

      // mouse-over text for a selected spell
      if (st.spell) {
        const sp = OSRS_SPELLS.find(x => x.id === st.spell);
        let x = 4;
        for (const [str, col] of [['Cast ', '#fff'], [sp.name, '#00ff00'], [' -> ', '#fff']]) x += text(str, x, 17, col, 14);
      }

      // HUD (RuneLite-infobox style)
      const r = st.run;
      if (r && st.phase !== 'idle') {
        const lines = [
          [`Score ${r.score}`, '#ffcf70'],
          [st.endAt !== null && st.phase === 'running' ? `Time ${Math.max(0, (st.endAt - now) / 1000).toFixed(1)}s` : st.phase === 'running' ? `Free play ${((now - st.startAt) / 1000).toFixed(0)}s` : ' ', '#fff'],
          [`Hits ${r.hits} · Misses ${r.misses}`, '#fff'],
          [`Tick hits ${r.tick} · Avg ${r.times.length ? Math.round(r.times.reduce((a, b) => a + b, 0) / r.times.length) + 'ms' : '—'}`, '#ddd'],
        ];
        ctx.fillStyle = 'rgba(20,16,12,.72)'; ctx.fillRect(6, 26, 220, lines.length * 18 + 10);
        lines.forEach(([str, col], i) => text(str, 14, 44 + i * 18, col, 13));
      }

      // center overlays
      const fmt = env.fmt, cx = W / 2;
      if (st.phase === 'countdown') {
        text(String(Math.ceil(Math.max(0, st.countdownEnd - now) / 1000) || ''), cx, H * 0.3, '#ffcf70', 44, 'center', 'middle');
      } else if (st.phase === 'done' && st.summary) {
        const s = st.summary;
        text(`Score ${s.score}${s.newBest ? '  ★ New best!' : ''}`, cx, H * 0.26, s.newBest ? '#7dff7d' : '#ffcf70', 34, 'center', 'middle');
        text(`${s.hits} hits · ${s.misses} misses · ${s.acc}% accuracy · avg ${fmt(s.avg)} · ${s.tick} tick hits`, cx, H * 0.26 + 34, '#fff', 15, 'center', 'middle');
        text(s.saved ? 'Press Start (Enter) to go again' : 'Free play isn\'t saved. Pick a timer to record scores.', cx, H * 0.26 + 58, '#bbb', 14, 'center', 'middle');
      } else if (st.phase === 'idle' && !env.placing()) {
        text(`${CLICK_MODES[S.clickMode]} · ${S.clickDuration ? S.clickDuration + 's' : 'free play'}`, cx, H * 0.26, '#ffcf70', 28, 'center', 'middle');
        const how = {
          classic: 'Click the gold boxes as fast as you can.',
          swap: 'Click the highlighted gear in your inventory (white melee · blue magic · green ranged).',
          cast: 'Magic tab → Ice Barrage → click the blue box.',
          mixed: 'A random mix of boxes, gear swaps and casts.',
        }[S.clickMode];
        text(how, cx, H * 0.26 + 32, '#fff', 15, 'center', 'middle');
        text('Press Start (Enter)', cx, H * 0.26 + 58, '#bbb', 14, 'center', 'middle');
      }
    },

    renderStats() {
      const { fmt, esc } = env;
      const rec = loadScores()[scoreKey()] || { best: null, recent: [] };
      const label = `${CLICK_MODES[S.clickMode]} · ${S.clickDuration ? S.clickDuration + 's' : 'free play'}`;
      const r = st.phase === 'running' || st.phase === 'countdown' ? st.run : null;
      const shown = r ? { score: r.score, hits: r.hits, misses: r.misses, tick: r.tick,
        acc: r.hits + r.misses ? Math.round(r.hits / (r.hits + r.misses) * 100) : 0,
        avg: r.times.length ? r.times.reduce((a, b) => a + b, 0) / r.times.length : null } : st.summary;
      let html = `<h4>${r ? 'This run' : st.summary ? 'Last run' : 'No run yet'} · ${esc(label)}</h4>`;
      if (shown) {
        html += `<div class="stat-grid">
          <div><b>${shown.score}</b><span>score</span></div>
          <div><b>${shown.hits}</b><span>hits</span></div>
          <div><b>${shown.misses}</b><span>misses</span></div>
          <div><b>${shown.acc}%</b><span>accuracy</span></div>
          <div><b>${fmt(shown.avg)}</b><span>avg speed</span></div>
          <div><b>${shown.tick}</b><span>tick hits</span></div>
          <div><b>${shown.hits ? Math.round(shown.tick / shown.hits * 100) + '%' : '—'}</b><span>tick rate</span></div>
          <div><b>${rec.best ? rec.best.score : '—'}</b><span>best</span></div>
        </div>`;
      }
      if (!S.clickDuration) {
        html += `<p class="note">Free play isn't scored. Pick a timer (15s–5min) to record your best and last 5 runs.</p>`;
      } else {
        const day = d => new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        html += `<h4>Best · ${esc(label)}</h4>`;
        html += rec.best
          ? `<p class="best"><b>${rec.best.score}</b> · ${rec.best.hits} hits · ${rec.best.acc}% · avg ${fmt(rec.best.avg)} <span>${day(rec.best.date)}</span></p>`
          : `<p class="note">No runs yet.</p>`;
        if (rec.recent.length) {
          html += `<h4>Last ${rec.recent.length} run${rec.recent.length > 1 ? 's' : ''}</h4><table class="waves"><tr><th>when</th><th>score</th><th>hits</th><th>miss</th><th>acc</th><th>avg</th></tr>`;
          for (const e of rec.recent) html += `<tr><td class="crabs">${day(e.date)}</td><td>${e.score}</td><td>${e.hits}</td><td>${e.misses}</td><td>${e.acc}%</td><td>${fmt(e.avg)}</td></tr>`;
          html += `</table><p class="note">Only your best and last 5 runs are kept for each mode and timer.</p>`;
        }
      }
      return html;
    },
  };
  trainer.debug = st;
  return trainer;
}
