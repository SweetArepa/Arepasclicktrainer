// Maiden freeze trainer: countdown → crabs appear → freeze the top-priority crab.
// Round rules live in drill.js; this file handles flow, input, drawing and stats.

function makeMaidenTrainer(env) {
  const { S, ctx } = env;
  const st = {
    phase: 'idle',        // idle | countdown | wave | result
    phaseEnd: 0,
    wave: null,
    history: [],
    early: [],            // canvas clicks during the countdown (attached to the next wave)
    clicks: [],           // click markers
  };

  function boxAtPresent(x, y) {
    const b = env.boxes();
    for (const pos of st.wave.present) {
      const r = b[pos];
      if (x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h) return pos;
    }
    return null;
  }

  // ---------------------------------------------------------------- flow
  function beginCountdown(now) {
    st.phase = 'countdown';
    st.phaseEnd = now + S.countdownSec * 1000;
    st.wave = null;
    st.early = [];
  }
  function beginWave(now) {
    st.phase = 'wave';
    st.wave = new Wave(randomPresent(S.minCrabs, S.maxCrabs, S.spawnable), now, { pairMs: S.pairMs });
    st.wave.ignored = st.early.filter(c => now - c.t < 1000).map(c => ({ kind: 'early', dt: c.t - now }));
    st.early = [];
  }
  function endWave(now) {
    st.history.push(st.wave);
    env.markStats();
    st.phase = 'result';
    st.phaseEnd = now + S.resultMs;
  }

  const trainer = {
    id: 'maiden',
    usesBoxes: true,
    get running() { return st.phase !== 'idle'; },
    start(now) { beginCountdown(now); },
    stop() { st.phase = 'idle'; st.wave = null; },
    clearStats() { st.history = []; env.markStats(); },

    tick(now) {
      if (st.phase === 'countdown' && now >= st.phaseEnd) beginWave(now);
      else if (st.phase === 'wave') {
        st.wave.update(now);
        if (st.wave.status !== 'active') endWave(now);
      } else if (st.phase === 'result' && now >= st.phaseEnd) beginCountdown(now);
    },

    outsideClick(now) { if (st.phase === 'wave') st.wave.ignored.push({ kind: 'outside', dt: now - st.wave.t0 }); },
    otherButton(now) { if (st.phase === 'wave') st.wave.ignored.push({ kind: 'button', dt: now - st.wave.t0 }); },

    pointerDown(p, now) {
      if (st.phase === 'countdown') { st.early.push({ t: now }); return; }
      if (st.phase !== 'wave') return;
      const target = boxAtPresent(p.x, p.y);
      st.clicks.push({ x: p.x, y: p.y, t: now, color: target ? '#ff2020' : '#ffff00' });
      st.wave.click(target, now);
      if (st.wave.status !== 'active') endWave(now);
    },

    keyDown() { return false; },

    draw(now, W, H) {
      const b = env.boxes(), text = env.text, w = st.wave;
      if (w) {
        for (const p of w.present) {
          const r = b[p];
          const frozen = w.frozen.has(p);
          const pending = w.pending && w.pending.pos === p;
          ctx.fillStyle = frozen ? 'rgba(90,190,255,.5)' : 'rgba(230,20,20,.5)';
          ctx.fillRect(r.x, r.y, r.w, r.h);
          ctx.strokeStyle = frozen ? '#bfe8ff' : pending ? '#ffffff' : '#ff2a2a';
          ctx.lineWidth = pending ? 3 : 2;
          ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
          const hint = S.showHints && w.target.pos === p ? (p === 'S2' ? '★ rush' : '★ cancel+click') : '';
          const label = [S.showLabels ? p : '', hint].filter(Boolean).join(' ');
          if (label) text(label, r.x + r.w / 2, r.y + r.h / 2, '#fff', 13, 'center', 'middle');
        }
      }

      env.drawClickMarkers(st.clicks, now);

      // OSRS mouse-over text
      const mouse = env.mouse();
      if (S.showHoverText && w && w.status === 'active') {
        const over = mouse && boxAtPresent(mouse.x, mouse.y);
        let x = 4;
        const parts = w.rushQueued
          ? [['Cast ', '#fff'], ['Ice Rush', '#00ff00'], [' -> ', '#fff'], ...(over ? [['Nylocas Matomenos', '#ffff00']] : [])]
          : over ? [['Attack ', '#fff'], ['Nylocas Matomenos', '#ffff00']] : [['Walk here', '#fff']];
        for (const [str, col] of parts) x += text(str, x, 17, col, 14);
      }

      // center overlays
      const fmt = env.fmt;
      if (st.phase === 'countdown') {
        const left = Math.max(0, st.phaseEnd - now);
        text(String(Math.ceil(left / 1000) || ''), W / 2, H * 0.18, '#ffcf70', 44, 'center', 'middle');
      } else if (st.phase === 'result' && w) {
        if (w.status === 'pass') {
          const c = w.cast;
          text(`✓ ${SPELL_NAME[c.spell]} → ${c.pos}`, W / 2, H * 0.14, '#60ff60', 36, 'center', 'middle');
          text(`${c.pos} clicked ${fmt(c.clickMs)} after spawn`, W / 2, H * 0.14 + 34, '#fff', 16, 'center', 'middle');
        } else {
          text('✗ Failed', W / 2, H * 0.14, '#ff5050', 36, 'center', 'middle');
          text(w.reason, W / 2, H * 0.14 + 34, '#fff', 16, 'center', 'middle');
        }
        const note = ignoredNote(w);
        if (note) text('⚠ ' + note, W / 2, H * 0.14 + 60, '#ffcf70', 15, 'center', 'middle');
      } else if (st.phase === 'idle' && !env.placing()) {
        text('Press Start (Enter)', W / 2, H * 0.18, '#ffcf70', 28, 'center', 'middle');
        if (!env.hasShot()) text('Tip: load a screenshot of your client and place the boxes (see Help)', W / 2, H * 0.18 + 30, '#bbb', 14, 'center', 'middle');
      }
    },

    renderStats() {
      const { fmt, avg, esc } = env;
      const h = st.history;
      const passed = h.filter(w => w.status === 'pass');
      let streak = 0;
      for (let i = h.length - 1; i >= 0 && h[i].status === 'pass'; i--) streak++;
      const crabMs = h.map(w => w.clickMs).filter(m => m !== null);
      let html = `<div class="stat-grid">
        <div><b>${h.length}</b><span>rounds</span></div>
        <div><b>${h.length ? Math.round(passed.length / h.length * 100) + '%' : '—'}</b><span>pass rate</span></div>
        <div><b>${streak}</b><span>streak</span></div>
        <div><b>${fmt(avg(h.map(w => w.reaction).filter(r => r !== null)))}</b><span>avg first click</span></div>
        <div><b>${fmt(avg(crabMs))}</b><span>avg crab click</span></div>
        <div><b>${fmt(avg(passed.map(w => w.clickMs)))}</b><span>avg crab click (passes)</span></div>
        <div><b>${crabMs.length ? fmt(Math.min(...crabMs)) : '—'}</b><span>fastest crab click</span></div>
        <div><b>${crabMs.length ? fmt(Math.max(...crabMs)) : '—'}</b><span>slowest crab click</span></div>
      </div>`;
      if (h.length) {
        html += `<table class="waves"><tr><th>#</th><th>crabs</th><th>target</th><th>first</th><th>crab</th><th>clicks</th></tr>`;
        for (let i = h.length - 1; i >= Math.max(0, h.length - 40); i--) {
          const w = h[i];
          const ok = w.status === 'pass';
          html += `<tr><td>${i + 1}</td><td class="crabs ${ok ? 'good' : 'bad'}">${w.expected.map(e => e.pos).join(' ')}</td>
            <td>${w.target.pos}</td><td>${fmt(w.reaction)}</td>
            <td>${fmt(w.clickMs)}</td><td>${w.clicks.length}/${w.minClicks}</td></tr>`;
          if (!ok) html += `<tr><td></td><td colspan="5" class="reason">${esc(w.reason)}<br><span class="seq">${esc(clickSeq(w))}</span></td></tr>`;
          const note = ignoredNote(w);
          if (note) html += `<tr><td></td><td colspan="5" class="reason warnrow">⚠ ${esc(note)}</td></tr>`;
        }
        html += `</table>`;
      }
      return html;
    },
  };

  const IGNORED_TEXT = {
    outside: 'landed outside the game frame',
    early: 'came before the boxes appeared',
    button: 'was not a left click',
  };
  function ignoredNote(w) {
    if (!w.ignored || !w.ignored.length) return '';
    return w.ignored.map(c => `click ${c.dt < 0 ? Math.round(-c.dt) + 'ms before spawn' : '+' + Math.round(c.dt) + 'ms'} ${IGNORED_TEXT[c.kind]}`).join(' · ');
  }
  function clickSeq(w) {
    return 'clicks: ' + (w.clicks.map(c => `${c.target || 'floor'} +${Math.round(c.t - w.t0)}`).join(' → ') || 'none');
  }

  trainer.debug = st;
  return trainer;
}
