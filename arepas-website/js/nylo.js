// Nylocas demi-boss trainer (ToB Nylocas room).
// The boss shows a style: white = melee, blue = magic, green = ranged. It starts
// on melee and changes to a random different style every 10s. To hit it
// correctly you must wear every gear box of that colour AND have its two prayers on:
//   melee  → Protect from Melee + Piety
//   ranged → Protect from Missiles + Rigour
//   magic  → Protect from Magic + Augury
// Clicking the boss starts auto-attacking with your weapon (the first box of each
// colour): melee and ranged every 3.0s, magic every 1.8s. Switching gear or
// prayers keeps you attacking; clicking the floor stops. Switch time = colour
// change → your first correct hit.

function makeNyloTrainer(env) {
  const { S, ctx } = env;
  const st = {
    phase: 'idle',          // idle | countdown | running
    countdownEnd: 0,
    colour: null,
    phaseStart: 0,
    cur: null,              // current phase: { colour, start, firstHit, hits, wrong, extra, misclicks }
    history: [],            // finished phases
    gear: new ColourGear(S.work.inv),
    prayers: new Set(),
    tab: 'inventory',
    attacking: false,
    nextHitAt: 0,           // weapon cooldown (not reset by switching weapons, like the game)
    clicks: [],
    popups: [],
  };
  const inR = (r, x, y) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
  const weapon = () => st.gear.worn[0] || 'melee'; // equipment slot 1 = weapon
  const speedMs = style => 1000 * ({ melee: S.nyloSpeedMelee, ranged: S.nyloSpeedRanged, magic: S.nyloSpeedMagic }[style] || 3);
  const prayed = style => STYLE_PRAYERS[style].every(id => st.prayers.has(id));

  function newPhase(now) {
    const owned = st.gear.styles();
    if (st.colour === null) st.colour = owned.includes('melee') ? 'melee' : owned[0]; // always starts on melee
    else {
      const options = owned.filter(s => s !== st.colour);
      if (options.length) st.colour = options[Math.floor(Math.random() * options.length)];
    }
    st.phaseStart = now;
    st.cur = { colour: st.colour, start: now, firstHit: null, hits: 0, wrong: 0, extra: 0, misclicks: 0 };
  }
  function endPhase() { st.history.push(st.cur); env.markStats(); }

  function togglePrayer(id) {
    if (st.prayers.has(id)) { st.prayers.delete(id); return; }
    for (const other of [...st.prayers]) if (PRAYERS[other].group === PRAYERS[id].group) st.prayers.delete(other);
    st.prayers.add(id);
  }

  function attack(now) {
    const boss = env.nyloBox(), cx = boss.x + boss.w / 2, cy = boss.y + boss.h / 2;
    const gearOk = st.gear.wearing(st.colour), prayOk = prayed(st.colour);
    if (gearOk && prayOk) {
      st.cur.hits++;
      if (st.cur.firstHit === null) {
        st.cur.firstHit = now - st.cur.start;
        st.popups.push({ x: cx, y: cy - boss.h / 2, text: `switch ${env.fmt(st.cur.firstHit)}`, t: now, color: '#7dff7d' });
      } else st.popups.push({ x: cx, y: cy - boss.h / 2, text: 'hit', t: now, color: '#ffffff' });
    } else {
      st.cur.wrong++;
      const why = !gearOk && !prayOk ? 'wrong gear + prayers' : !gearOk ? 'wrong gear' : 'wrong prayers';
      st.popups.push({ x: cx, y: cy - boss.h / 2, text: why, t: now, color: '#ff9a4a' });
    }
    st.nextHitAt = now + speedMs(weapon());
    env.markStats();
  }

  const trainer = {
    id: 'nylo',
    usesPanel: true,
    usesNylo: true,
    usesPrayers: true,
    get running() { return st.phase !== 'idle'; },
    start(now) {
      st.gear = new ColourGear(S.work.inv);
      st.prayers = new Set();
      st.phase = 'countdown';
      st.countdownEnd = now + S.countdownSec * 1000;
      st.colour = null;
      st.cur = null;
      st.attacking = false;
      st.nextHitAt = 0;
    },
    stop() {
      if (st.phase === 'running' && st.cur) endPhase();
      st.phase = 'idle'; st.cur = null; st.attacking = false;
    },
    clearStats() { st.history = []; env.markStats(); },
    layoutChanged() { if (st.phase === 'idle') st.gear = new ColourGear(S.work.inv); },

    tick(now) {
      if (st.phase === 'countdown' && now >= st.countdownEnd) {
        st.phase = 'running';
        newPhase(now);
      } else if (st.phase === 'running') {
        if (now - st.phaseStart >= S.nyloPhaseSec * 1000) { endPhase(); newPhase(now); }
        if (st.attacking && now >= st.nextHitAt) attack(now);
      }
    },

    keyDown(e) {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      for (const [tab, bind] of Object.entries(S.clickKeys || {})) {
        if (bind && key === (bind.length === 1 ? bind.toLowerCase() : bind)) { e.preventDefault(); st.tab = tab; return true; }
      }
      return false;
    },

    pointerDown(p, now) {
      const running = st.phase === 'running';
      const h = osrsPanelHit(env.panelLayout(), st.tab, p.x, p.y, S.work.prayers);
      if (h) {
        if (h.kind === 'tab') { if (h.tab.live) st.tab = h.tab.id; return; }
        if (h.kind === 'inv' && st.gear.has(h.i)) {
          if (running && st.gear.inv[h.i] !== st.colour) st.cur.extra++; // not part of this switch
          st.gear.equip(h.i);
        } else if (h.kind === 'prayer' && h.id) {
          togglePrayer(h.id);
        } else if (running) st.cur.misclicks++;
        return;
      }
      if (!running) return;
      if (inR(env.nyloBox(), p.x, p.y)) {
        st.clicks.push({ x: p.x, y: p.y, t: now, color: '#ff2020' });
        st.attacking = true;
        if (now >= st.nextHitAt) attack(now);
      } else { // walking away stops the attack
        st.attacking = false;
        st.cur.misclicks++;
        st.clicks.push({ x: p.x, y: p.y, t: now, color: '#ffff00' });
      }
    },

    draw(now, W, H) {
      const text = env.text, placing = env.placing();
      const boss = env.nyloBox();
      if (!placing) {
        drawBoss(now, boss);
        osrsDrawPanel(ctx, env.panelLayout(), { tab: st.tab, gear: st.gear, prayers: st.prayers, prayerSlots: S.work.prayers });
      }
      env.drawClickMarkers(st.clicks, now);

      st.popups = st.popups.filter(p => now - p.t < 900);
      for (const p of st.popups) {
        const k = (now - p.t) / 900;
        ctx.globalAlpha = 1 - k * 0.8;
        text(p.text, p.x, p.y - 12 - k * 20, p.color, 15, 'center', 'middle');
        ctx.globalAlpha = 1;
      }

      const mouse = env.mouse();
      if (st.phase === 'running' && mouse && inR(boss, mouse.x, mouse.y)) {
        let x = 4;
        for (const [str, col] of [['Attack ', '#fff'], ['Nylocas Vasilias', '#ffff00']]) x += text(str, x, 17, col, 14);
      }

      if (st.phase === 'running') {
        const c = st.colour, done = st.history.filter(x => x.firstHit !== null);
        const last = st.history[st.history.length - 1];
        const ok = (b, label) => [`${b ? '✓' : '✗'} ${label}`, b ? '#7dff7d' : '#ff8a6a'];
        const lines = [
          [`Boss: ${STYLE_NAMES[c]} · changes in ${Math.max(0, (S.nyloPhaseSec * 1000 - (now - st.phaseStart)) / 1000).toFixed(1)}s`, STYLE_COLORS[c]],
          ok(st.gear.wearing(c), `${STYLE_NAMES[c]} gear`),
          ok(prayed(c), STYLE_PRAYERS[c].map(id => PRAYERS[id].name).join(' + ')),
          [`Weapon ${STYLE_NAMES[weapon()]} (${(speedMs(weapon()) / 1000).toFixed(1)}s) · ${st.attacking ? 'attacking' : 'not attacking'}`, '#ddd'],
          [`Last switch ${last ? (last.firstHit === null ? 'missed' : env.fmt(last.firstHit)) : '—'} · avg ${env.fmt(env.avg(done.map(x => x.firstHit)))}`, '#fff'],
        ];
        ctx.fillStyle = 'rgba(20,16,12,.72)'; ctx.fillRect(6, 26, 330, lines.length * 18 + 10);
        lines.forEach(([str, col], i) => text(str, 14, 44 + i * 18, col, 13));
      }

      if (st.phase === 'countdown') {
        text(String(Math.ceil(Math.max(0, st.countdownEnd - now) / 1000) || ''), W / 2, H * 0.18, '#ffcf70', 44, 'center', 'middle');
      } else if (st.phase === 'idle' && !placing) {
        text('Nylocas demi-boss', W / 2, H * 0.14, '#ffcf70', 28, 'center', 'middle');
        text('Match the boss: its gear colour + its two prayers, then click it to attack', W / 2, H * 0.14 + 30, '#fff', 14, 'center', 'middle');
        text('Press Start (Enter) · P to move the boss, inventory and prayers', W / 2, H * 0.14 + 52, '#bbb', 14, 'center', 'middle');
      }
    },

    // edit mode (P): outline the boss box
    drawEdit() {
      const r = env.nyloBox();
      ctx.fillStyle = 'rgba(160,160,160,.35)'; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = '#ff981f'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2); ctx.setLineDash([]);
      ctx.fillStyle = '#ff981f'; ctx.fillRect(r.x + r.w - 12, r.y + r.h - 12, 12, 12);
      env.text('Boss', r.x + r.w / 2, r.y + r.h / 2, '#fff', 14, 'center', 'middle');
    },

    renderStats() {
      const { fmt, avg } = env;
      const h = st.history;
      const done = h.filter(x => x.firstHit !== null), times = done.map(x => x.firstHit);
      const sum = k => h.reduce((n, x) => n + x[k], 0);
      let html = `<div class="stat-grid">
        <div><b>${done.length}</b><span>switches</span></div>
        <div><b>${fmt(avg(times))}</b><span>avg switch</span></div>
        <div><b>${times.length ? fmt(Math.min(...times)) : '—'}</b><span>fastest</span></div>
        <div><b>${times.length ? fmt(Math.max(...times)) : '—'}</b><span>slowest</span></div>
        <div><b>${sum('hits')}</b><span>correct hits</span></div>
        <div><b class="${sum('wrong') ? 'bad' : ''}">${sum('wrong')}</b><span>wrong-setup hits</span></div>
        <div><b class="${h.length - done.length ? 'bad' : ''}">${h.length - done.length}</b><span>missed phases</span></div>
        <div><b>${sum('extra')}</b><span>extra gear clicks</span></div>
      </div>`;
      if (h.length) {
        html += `<table class="waves"><tr><th>#</th><th>boss</th><th>switch</th><th>hits</th><th>wrong</th><th>extra</th></tr>`;
        for (let i = h.length - 1; i >= Math.max(0, h.length - 40); i--) {
          const x = h[i];
          html += `<tr><td>${i + 1}</td><td class="crabs"><i class="chip" style="background:${STYLE_COLORS[x.colour]}"></i>${STYLE_NAMES[x.colour]}</td>
            <td class="${x.firstHit === null ? 'bad' : ''}">${x.firstHit === null ? 'missed' : fmt(x.firstHit)}</td><td>${x.hits}</td><td>${x.wrong}</td><td>${x.extra}</td></tr>`;
        }
        html += `</table>`;
      } else {
        html += `<p class="note">Press Start. Each boss colour is one row here.</p>`;
      }
      return html;
    },
  };

  function drawBoss(now, r) {
    const colour = st.phase === 'running' ? STYLE_COLORS[st.colour] : '#6d655a';
    ctx.fillStyle = colour; ctx.globalAlpha = 0.85; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.globalAlpha = 1;
    ctx.strokeStyle = st.attacking ? '#ff3030' : 'rgba(0,0,0,.7)'; ctx.lineWidth = st.attacking ? 3 : 2;
    ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    if (st.phase === 'running') {
      // time left before the colour changes
      const left = Math.max(0, 1 - (now - st.phaseStart) / (S.nyloPhaseSec * 1000));
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(r.x, r.y + r.h + 4, r.w, 5);
      ctx.fillStyle = '#ffcf70'; ctx.fillRect(r.x, r.y + r.h + 4, r.w * left, 5);
      // weapon cooldown until the next hit
      if (st.attacking) {
        const cd = Math.max(0, Math.min(1, (st.nextHitAt - now) / speedMs(weapon())));
        ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(r.x, r.y + r.h + 11, r.w, 4);
        ctx.fillStyle = '#ff5050'; ctx.fillRect(r.x, r.y + r.h + 11, r.w * (1 - cd), 4);
      }
    }
  }

  trainer.debug = st;
  return trainer;
}
