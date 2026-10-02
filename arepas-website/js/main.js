// Shell shared by every trainer: movable/resizable client frame, box placement,
// screenshot background, saved setups, toolbar, side panel and the frame loop.
// Trainer-specific flow, input, drawing and stats live in maiden.js / clicktrainer.js.

(() => {
  const S = loadSettings();
  if (!Array.isArray(S.spawnable) || !S.spawnable.length) S.spawnable = [...POSITIONS];
  const $ = sel => document.querySelector(sel);
  const $$ = sel => [...document.querySelectorAll(sel)];
  const canvas = $('#game');
  const ctx = canvas.getContext('2d');
  const client = $('#client');

  const MIN_W = 400, MIN_H = 300;
  const HANDLE = 12; // resize corner size in place mode

  const state = {
    placing: false,
    drag: null,           // box being dragged
    frameDrag: null,      // whole frame being dragged (place mode)
    panelDrag: null,      // inventory panel being moved/resized, a slot clicked, or a prayer dragged (edit mode)
    editTab: 'inventory', // which panel tab edit mode shows (inventory or prayer)
    mouse: null,
    shot: null,           // background Image
  };
  window.TRAINER = { S, state }; // console debugging

  // ---------------------------------------------------------------- boxes
  function boxes() {
    if (!S.work.boxes) S.work.boxes = defaultBoxes(S.clientW, S.clientH);
    return S.work.boxes;
  }
  function clampBoxes() {
    for (const r of Object.values(boxes())) {
      r.w = Math.min(r.w, S.clientW); r.h = Math.min(r.h, S.clientH);
      r.x = Math.min(Math.max(r.x, 0), S.clientW - r.w);
      r.y = Math.min(Math.max(r.y, 0), S.clientH - r.h);
    }
  }
  function boxAt(x, y) {
    const b = boxes();
    for (const pos of POSITIONS) {
      const r = b[pos];
      if (x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h) return pos;
    }
    return null;
  }

  // ---------------------------------------------------------------- inventory panel + boss box
  // Defaults are computed, never stored, until you move something (so nothing is saved just by drawing).
  const within = (r, p) => p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h;
  function panelPos() { return S.work.panel || defaultPanelPos(S.clientW, S.clientH); }
  function panelLayout() { return osrsLayout(panelPos()); }
  function setPanel(x, y, scale) {
    const sc = Math.min(3, Math.max(0.5, scale));
    const w = PANEL_BASE_W * sc, h = PANEL_BASE_H * sc;
    S.work.panel = {
      x: Math.round(Math.min(Math.max(x, 0), Math.max(0, S.clientW - w))),
      y: Math.round(Math.min(Math.max(y, 0), Math.max(0, S.clientH - h))),
      scale: Math.round(sc * 1000) / 1000,
    };
    showPanelSize();
  }
  function showPanelSize() { $('#invScale').value = Math.round(panelPos().scale * 100); }
  function defaultNylo() { const s = 90; return { x: Math.round(S.clientW * 0.4 - s / 2), y: Math.round(S.clientH * 0.4 - s / 2), w: s, h: s }; }
  function nyloBox() { return S.work.nylo || defaultNylo(); }
  const INV_CYCLE = [null, 'melee', 'magic', 'ranged'];
  function layoutChanged() { if (trainer.layoutChanged) trainer.layoutChanged(); saveSettings(S); }

  // ---------------------------------------------------------------- client frame
  // clientX/clientY = the game area's top-left corner, measured from the browser window's top-left.
  let badgeTimer = null;
  function placeFrame() {
    client.style.left = S.clientX + 'px';
    client.style.top = S.clientY + 'px';
    $('#titletext').textContent = `Game client — ${S.clientW} × ${S.clientH} at ${S.clientX}, ${S.clientY}`;
    $('#fx').value = S.clientX;
    $('#fy').value = S.clientY;
  }
  function applyClientSize(showBadge = false) {
    const W = S.clientW, H = S.clientH, dpr = window.devicePixelRatio || 1;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    client.style.width = W + 'px';
    client.style.height = H + 'px';
    $('#cw').value = W;
    $('#ch').value = H;
    placeFrame();
    if (showBadge) badge(`${W} × ${H}`);
  }
  function badge(msg) {
    const el = $('#sizeBadge');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => el.classList.remove('show'), 900);
  }
  function setSize(w, h) {
    S.clientW = Math.max(MIN_W, Math.round(w));
    S.clientH = Math.max(MIN_H, Math.round(h));
    clampBoxes();
    saveSettings(S);
    applyClientSize(true);
  }
  function moveFrame(x, y) {
    S.clientX = Math.max(0, Math.round(x));
    S.clientY = Math.max(0, Math.round(y));
    placeFrame();
  }

  $$('.rh').forEach(h => h.addEventListener('pointerdown', e => {
    e.preventDefault();
    h.setPointerCapture(e.pointerId);
    const dir = h.dataset.dir, sx = e.clientX, sy = e.clientY, sw = S.clientW, sh = S.clientH;
    const move = ev => setSize(dir.includes('e') ? sw + ev.clientX - sx : sw, dir.includes('s') ? sh + ev.clientY - sy : sh);
    const up = () => { h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); };
    h.addEventListener('pointermove', move);
    h.addEventListener('pointerup', up);
  }));

  $('#titlebar').addEventListener('pointerdown', e => {
    const bar = e.currentTarget;
    bar.setPointerCapture(e.pointerId);
    const sx = e.clientX, sy = e.clientY, ox = S.clientX, oy = S.clientY;
    const move = ev => moveFrame(ox + ev.clientX - sx, oy + ev.clientY - sy);
    const up = () => { saveSettings(S); bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
  });
  $('#fx').addEventListener('change', e => { moveFrame(+e.target.value, S.clientY); saveSettings(S); });
  $('#fy').addEventListener('change', e => { moveFrame(S.clientX, +e.target.value); saveSettings(S); });

  // ---------------------------------------------------------------- notices
  let toastTimer = null;
  function toast(msg, ms = 6000) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms);
  }

  // In-page prompt bar, because the artifact viewer blocks the browser's own confirm and prompt dialogs.
  // buttons: [{ label, primary?, run() }]; input: { value } shows a text field.
  function showBar(message, buttons, input) {
    const bar = $('#bar');
    bar.innerHTML = '';
    const msg = document.createElement('span');
    msg.textContent = message;
    bar.appendChild(msg);
    let field = null;
    if (input) {
      field = document.createElement('input');
      field.type = 'text'; field.id = 'barInput'; field.maxLength = 40; field.value = input.value || '';
      bar.appendChild(field);
    }
    const close = () => { bar.hidden = true; bar.innerHTML = ''; };
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.textContent = b.label;
      if (b.primary) btn.className = 'primary';
      btn.addEventListener('click', () => { if (b.run(field ? field.value.trim() : undefined) !== false) close(); });
      bar.appendChild(btn);
    }
    bar.hidden = false;
    if (field) {
      field.focus(); field.select();
      field.addEventListener('keydown', e => {
        if (e.key === 'Enter') bar.querySelector('button.primary').click();
        if (e.key === 'Escape') close();
      });
    }
  }

  // ---------------------------------------------------------------- screenshot
  function shotDataFor(src) {
    if (src === 'new') return lsGet(WORK_SHOT_KEY);
    const setup = S.setups.find(x => x.id === src);
    return setup && setup.shotKey ? lsGet(setup.shotKey) : null;
  }
  function loadWorkShot() {
    const data = S.workShot ? shotDataFor(S.workShot) : null;
    if (!data) { state.shot = null; return; }
    const img = new Image();
    img.onload = () => { state.shot = img; };
    img.src = data;
  }
  $('#shotBtn').addEventListener('click', () => $('#shotFile').click());
  $('#shotFile').addEventListener('change', e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Same shape as the current client → fit it to that size (the Help says to set
        // the client size first). Otherwise guess: Retina screenshots are 2× the size in points.
        const iw = img.naturalWidth, ih = img.naturalHeight;
        let W, H;
        if (Math.abs(iw / ih - S.clientW / S.clientH) < 0.015) {
          W = S.clientW; H = S.clientH;
        } else {
          const dpr = window.devicePixelRatio || 1;
          const k = dpr > 1 && iw / dpr >= 765 && ih / dpr >= 503 ? dpr : 1;
          W = Math.round(iw / k); H = Math.round(ih / k);
          toast(`Client set to ${W} × ${H} to match the screenshot. If your game size is different, set Client first, then load the screenshot again.`);
        }
        // store at the displayed size as JPEG so several setups fit in browser storage
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        c.getContext('2d').drawImage(img, 0, 0, W, H);
        if (!lsSet(WORK_SHOT_KEY, c.toDataURL('image/jpeg', 0.88))) {
          toast('Browser storage is full, so this screenshot will only show until you close the page. Delete a setup with a screenshot to make room.');
        }
        S.workShot = 'new';
        S.work.shotW = W; S.work.shotH = H;
        S.clientW = W; S.clientH = H;
        clampBoxes();
        saveSettings(S);
        applyClientSize(true);
        state.shot = img;
        setPlacing(true);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
  $('#shotClear').addEventListener('click', () => {
    if (S.workShot === 'new') lsRemove(WORK_SHOT_KEY);
    S.workShot = null;
    S.work.shotW = S.work.shotH = null;
    state.shot = null;
    saveSettings(S);
  });

  // ---------------------------------------------------------------- setups
  const current = () => S.setups.find(x => x.id === S.currentSetup) || null;
  const layoutOf = src => JSON.stringify([src.clientW, src.clientH, src.clientX, src.clientY, src.boxes, src.panel, src.inv, src.nylo, src.prayers]);
  function isDirty() {
    const c = current();
    if (!c) return true;
    const shotSame = c.shotKey ? S.workShot === c.id : S.workShot === null;
    return !shotSame || layoutOf(c) !== layoutOf({ ...S, boxes: boxes(), panel: S.work.panel, inv: S.work.inv, nylo: S.work.nylo, prayers: S.work.prayers });
  }

  // write the working layout into setup `c` (new or existing); false if storage is full
  function writeSetup(c) {
    const layout = { clientW: S.clientW, clientH: S.clientH, clientX: S.clientX, clientY: S.clientY, boxes: structuredClone(boxes()),
      panel: structuredClone(S.work.panel), inv: S.work.inv.slice(), nylo: structuredClone(S.work.nylo), prayers: S.work.prayers.slice() };
    let shotKey = c.shotKey, shotW = c.shotW, shotH = c.shotH;
    if (S.workShot === 'new') {
      shotKey = SETUP_SHOT_KEY(c.id);
      if (!lsSet(shotKey, lsGet(WORK_SHOT_KEY))) { toast('Browser storage is full, so the setup was not saved. Delete a setup with a screenshot to make room.'); return false; }
      lsRemove(WORK_SHOT_KEY);
      shotW = S.work.shotW; shotH = S.work.shotH;
    } else if (S.workShot === null) {
      if (c.shotKey) lsRemove(c.shotKey);
      shotKey = null; shotW = shotH = null;
    } else if (S.workShot !== c.id) { // showing another setup's screenshot: copy it
      shotKey = SETUP_SHOT_KEY(c.id);
      if (!lsSet(shotKey, shotDataFor(S.workShot))) { toast('Browser storage is full, so the setup was not saved.'); return false; }
      shotW = S.work.shotW; shotH = S.work.shotH;
    }
    Object.assign(c, layout, { shotKey, shotW, shotH });
    if (!S.setups.includes(c)) S.setups.push(c);
    S.currentSetup = c.id;
    if (shotKey) S.workShot = c.id;
    saveSettings(S);
    renderSetups(true);
    return true;
  }

  function saveCurrent() {
    const c = current();
    if (!c) return saveAs();
    if (writeSetup(c)) toast(`Saved “${c.name}”.`, 2500);
  }
  function saveAs() {
    const base = current() ? current().name : 'My setup';
    showBar('Name this setup', [
      { label: 'Save', primary: true, run: name => {
        if (!name) { toast('Give the setup a name first.', 2500); return false; }
        const c = { id: newId(), name };
        if (writeSetup(c)) toast(`Saved “${name}”.`, 2500);
      } },
      { label: 'Cancel', run: () => {} },
    ], { value: `${base} (copy)` });
  }

  function loadSetup(id) {
    const c = S.setups.find(x => x.id === id);
    if (!c) return;
    if (S.workShot === 'new') lsRemove(WORK_SHOT_KEY);
    Object.assign(S, { clientW: c.clientW, clientH: c.clientH, clientX: c.clientX, clientY: c.clientY, currentSetup: c.id });
    S.work = { boxes: structuredClone(c.boxes), shotW: c.shotW, shotH: c.shotH,
      panel: structuredClone(c.panel), inv: c.inv.slice(), nylo: structuredClone(c.nylo), prayers: c.prayers.slice() };
    if (trainer.layoutChanged) trainer.layoutChanged();
    showPanelSize();
    S.workShot = c.shotKey ? c.id : null;
    saveSettings(S);
    stop();
    applyClientSize(true);
    loadWorkShot();
    renderSetups(true);
    toast(`Loaded “${c.name}”.`, 2500);
  }
  function requestLoad(id) {
    if (id === S.currentSetup && !isDirty()) {
      toast(`“${current().name}” is already open.`, 2500);
      return;
    }
    const c = current();
    if (!isDirty()) return loadSetup(id);
    showBar(c ? `Unsaved changes to “${c.name}”.` : 'Your current layout is not saved as a setup.', [
      { label: c ? 'Save' : 'Save as…', primary: true, run: () => {
        if (c) { if (writeSetup(c)) loadSetup(id); return; }
        setTimeout(saveAs); // after this bar closes
      } },
      { label: 'Discard', run: () => loadSetup(id) },
      { label: 'Cancel', run: () => {} },
    ]);
  }
  function renameSetup(id) {
    const c = S.setups.find(x => x.id === id);
    showBar('Rename setup', [
      { label: 'Rename', primary: true, run: name => { if (!name) return false; c.name = name; saveSettings(S); renderSetups(true); } },
      { label: 'Cancel', run: () => {} },
    ], { value: c.name });
  }
  let deleteArmed = null;
  function deleteSetup(id, btn) {
    if (deleteArmed !== id) { // first click arms it
      deleteArmed = id;
      btn.textContent = 'Click again';
      setTimeout(() => { if (deleteArmed === id) { deleteArmed = null; renderSetups(true); } }, 3000);
      return;
    }
    deleteArmed = null;
    const c = S.setups.find(x => x.id === id);
    if (S.workShot === id) { // keep the screenshot on screen as an unsaved one
      if (lsSet(WORK_SHOT_KEY, lsGet(c.shotKey))) S.workShot = 'new'; else { S.workShot = null; state.shot = null; }
    }
    if (c.shotKey) lsRemove(c.shotKey);
    S.setups = S.setups.filter(x => x.id !== id);
    if (S.currentSetup === id) S.currentSetup = null;
    saveSettings(S);
    renderSetups(true);
  }

  let setupsSig = '';
  function renderSetups(force) {
    const dirty = isDirty();
    const sig = JSON.stringify([S.setups.map(x => [x.id, x.name, x.clientW, x.clientH, !!x.shotKey]), S.currentSetup, dirty]);
    if (!force && sig === setupsSig) return;
    setupsSig = sig;
    const sel = $('#setupSel');
    sel.innerHTML = (S.currentSetup ? '' : '<option value="">(not saved)</option>') +
      S.setups.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
    sel.value = S.currentSetup || '';
    $('#dirtyMark').hidden = !dirty;
    $('#setupList').innerHTML = S.setups.length ? S.setups.map(x => `
      <li class="${x.id === S.currentSetup ? 'cur' : ''}">
        <div><b>${esc(x.name)}</b><span>${x.clientW} × ${x.clientH} at ${x.clientX}, ${x.clientY}${x.shotKey ? ' · screenshot' : ''}${x.id === S.currentSetup ? (dirty ? ' · loaded, unsaved changes' : ' · loaded') : ''}</span></div>
        <div class="acts">
          <button data-act="load" data-id="${x.id}">Load</button>
          <button data-act="rename" data-id="${x.id}">Rename</button>
          <button data-act="delete" data-id="${x.id}" class="danger">Delete</button>
        </div>
      </li>`).join('') : '<li class="empty">No saved setups yet. Use “Save as…” in the toolbar.</li>';
  }
  $('#setupSel').addEventListener('change', e => {
    const id = e.target.value;
    e.target.blur();
    e.target.value = S.currentSetup || ''; // stays until the load actually happens
    if (id) requestLoad(id);
  });
  $('#setupList').addEventListener('click', e => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const { act, id } = btn.dataset;
    if (act === 'load') requestLoad(id);
    else if (act === 'rename') renameSetup(id);
    else if (act === 'delete') deleteSetup(id, btn);
  });
  $('#saveBtn').addEventListener('click', e => { e.target.blur(); saveCurrent(); });
  $('#saveAsBtn').addEventListener('click', e => { e.target.blur(); saveAs(); });

  // ---------------------------------------------------------------- toolbar
  $('#cw').addEventListener('change', e => setSize(+e.target.value, S.clientH));
  $('#ch').addEventListener('change', e => setSize(S.clientW, +e.target.value));
  $('#preset').addEventListener('change', e => {
    const v = e.target.value;
    e.target.value = '';
    if (v === 'fill') { moveFrame(0, 0); setSize(window.innerWidth, window.innerHeight); }
    else if (v) { const [w, h] = v.split('x').map(Number); setSize(w, h); }
  });
  $('#start').addEventListener('click', e => { start(); e.target.blur(); });
  $('#stop').addEventListener('click', e => { stop(); e.target.blur(); });
  $('#placeBtn').addEventListener('click', e => { setPlacing(!state.placing); e.target.blur(); });
  $('#fullscreen').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => toast('Fullscreen is not available here. Try your browser\'s own fullscreen (⌃⌘F on a Mac).'));
  });
  function toggleControls() {
    const hidden = document.body.classList.toggle('controls-hidden');
    if (hidden) toast('Controls hidden. Press H to show them again.', 3000);
  }
  $('#hideBtn').addEventListener('click', e => { e.target.blur(); toggleControls(); });

  const placeLabel = () => (trainer.usesBoxes ? 'Place boxes' : trainer.usesPanel ? 'Edit layout' : 'Move frame');
  function setPlacing(on) {
    state.placing = on;
    if (on) stop();
    $('#placeBtn').classList.toggle('on', on);
    $('#placeBtn').textContent = on ? 'Done' : placeLabel();
    canvas.classList.toggle('placing', on);
    if (!on) saveSettings(S);
  }

  // drawer
  const toggleDrawer = () => {
    document.body.classList.toggle('drawer-open');
    lsSet('osrs-click-trainer.v2.drawer', document.body.classList.contains('drawer-open') ? '1' : '0');
  };
  if (lsGet('osrs-click-trainer.v2.drawer') !== '0') document.body.classList.add('drawer-open');
  $('#drawerBtn').addEventListener('click', toggleDrawer);
  $$('.dtabs button').forEach(b => b.addEventListener('click', () => {
    $$('.dtabs button').forEach(x => x.classList.toggle('on', x === b));
    $$('.pane').forEach(p => p.classList.toggle('on', p.id === 'pane-' + b.dataset.pane));
  }));

  $$('[data-set]').forEach(el => {
    const key = el.dataset.set;
    if (el.type === 'checkbox') el.checked = !!S[key]; else el.value = String(S[key]);
    el.addEventListener('change', () => {
      S[key] = el.type === 'checkbox' ? el.checked : el.hasAttribute('data-num') ? Number(el.value) : el.value;
      if (key === 'minCrabs' || key === 'maxCrabs') {
        S.minCrabs = Math.max(1, Math.min(4, S.minCrabs));
        S.maxCrabs = Math.max(S.minCrabs, Math.min(4, S.maxCrabs));
      }
      saveSettings(S);
      if (trainer && trainer.settingChanged) trainer.settingChanged(key);
      if (!state.placing) $('#placeBtn').textContent = placeLabel(); // e.g. Classic has no inventory to edit
      statsDirty = true;
    });
  });
  // which positions can spawn
  $$('[data-spawn]').forEach(el => {
    const pos = el.dataset.spawn;
    el.checked = S.spawnable.includes(pos);
    el.addEventListener('change', () => {
      const next = POSITIONS.filter(p => p === pos ? el.checked : S.spawnable.includes(p));
      if (!next.length) { el.checked = true; return; } // keep at least one
      S.spawnable = next;
      saveSettings(S);
    });
  });

  $('#resetBoxes').addEventListener('click', () => { S.work.boxes = defaultBoxes(S.clientW, S.clientH); saveSettings(S); });
  $('#invScale').addEventListener('change', e => { const p = panelPos(); setPanel(p.x, p.y, (+e.target.value || 100) / 100); saveSettings(S); });
  $('#invCorner').addEventListener('click', () => { S.work.panel = null; showPanelSize(); saveSettings(S); });
  $('#invDefault').addEventListener('click', () => { S.work.inv = DEFAULT_INV.slice(); layoutChanged(); });
  $('#invClear').addEventListener('click', () => { S.work.inv = Array(28).fill(null); layoutChanged(); });
  $('#nyloReset').addEventListener('click', () => { S.work.nylo = null; saveSettings(S); });
  $('#clearStats').addEventListener('click', () => trainer.clearStats());
  let resetArmed = null;
  $('#resetSettings').addEventListener('click', e => {
    const btn = e.currentTarget;
    if (!resetArmed) { // first click arms it; a second click within 4s resets
      btn.textContent = 'Click again to delete all settings, setups and screenshots';
      resetArmed = setTimeout(() => { resetArmed = null; btn.textContent = 'Reset everything'; }, 4000);
      return;
    }
    clearTimeout(resetArmed);
    try {
      Object.keys(localStorage).filter(k => k.startsWith('osrs-click-trainer.v2')).forEach(k => localStorage.removeItem(k));
    } catch (e) {}
    location.reload();
  });

  window.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, select, textarea')) return;
    if (!state.placing && trainer.keyDown(e)) return;
    if (e.key === 'Enter' && !(e.target.closest && e.target.closest('button'))) { e.preventDefault(); start(); }
    else if (e.key === 'Escape') { if (!$('#bar').hidden) { $('#bar').hidden = true; return; } stop(); }
    else if (e.key === 'p' || e.key === 'P') setPlacing(!state.placing);
    else if (e.key === 'h' || e.key === 'H') toggleControls();
    else if (e.key === '`') { e.preventDefault(); toggleDrawer(); }
    else if (state.placing && e.key.startsWith('Arrow')) { // nudge the whole frame
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      moveFrame(S.clientX + dx, S.clientY + dy);
      badge(`at ${S.clientX}, ${S.clientY}`);
      saveSettings(S);
    }
  });

  // ---------------------------------------------------------------- start / stop
  function start() {
    if (state.placing) setPlacing(false);
    trainer.start(performance.now());
    $('#start').textContent = 'Restart';
  }
  function stop() {
    trainer.stop();
    $('#start').textContent = 'Start';
  }

  // ---------------------------------------------------------------- input
  const pos = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('pointerdown', e => {
    if (e.target !== canvas && trainer.outsideClick) trainer.outsideClick(performance.now());
  }, true);

  canvas.addEventListener('pointerdown', e => {
    const now = performance.now();
    if (!state.placing) trainer.tick(now); // a click right as the countdown ends must count
    if (e.button !== 0) {
      if (trainer.otherButton) trainer.otherButton(now);
      return;
    }
    const p = pos(e);
    if (state.placing) {
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not a live pointer */ }
      const startDrag = r => {
        const resize = p.x > r.x + r.w - HANDLE && p.y > r.y + r.h - HANDLE;
        state.drag = { rect: r, resize, sx: p.x, sy: p.y, orig: { ...r } };
      };
      const hit = trainer.usesBoxes ? boxAt(p.x, p.y) : null;
      if (hit) return startDrag(boxes()[hit]);
      if (trainer.usesNylo && within(nyloBox(), p)) {
        if (!S.work.nylo) S.work.nylo = defaultNylo();
        return startDrag(S.work.nylo);
      }
      if (trainer.usesPanel) {
        const L = panelLayout(), orig = { ...panelPos() };
        if (within(osrsResizeHandle(L), p)) { state.panelDrag = { mode: 'resize', sx: p.x, sy: p.y, orig }; return; }
        if (within(L.bounds, p)) {
          const h = osrsPanelHit(L, state.editTab, p.x, p.y, S.work.prayers);
          if (h && h.kind === 'tab') { // switch which tab you're editing
            if (h.tab.id === 'inventory' || (h.tab.id === 'prayer' && trainer.usesPrayers)) state.editTab = h.tab.id;
            return;
          }
          state.panelDrag = { mode: 'press', sx: p.x, sy: p.y, orig,
            slot: h && h.kind === 'inv' ? h.i : null, prayerCell: h && h.kind === 'prayer' && h.id ? h.cell : null };
          return;
        }
      }
      // empty space: move the whole frame
      state.frameDrag = { sx: e.clientX, sy: e.clientY, ox: S.clientX, oy: S.clientY };
      return;
    }
    trainer.pointerDown(p, now);
  });

  canvas.addEventListener('pointermove', e => {
    const f = state.frameDrag;
    if (f) { moveFrame(f.ox + e.clientX - f.sx, f.oy + e.clientY - f.sy); return; }
    const p = pos(e);
    state.mouse = p;
    const pd = state.panelDrag;
    if (pd) {
      const dx = p.x - pd.sx, dy = p.y - pd.sy;
      if (pd.mode === 'resize') setPanel(pd.orig.x, pd.orig.y, (PANEL_BASE_W * pd.orig.scale + dx) / PANEL_BASE_W);
      else {
        if (pd.mode === 'press' && Math.hypot(dx, dy) > 4) pd.mode = pd.prayerCell !== null ? 'prayer' : 'move';
        if (pd.mode === 'move') setPanel(pd.orig.x + dx, pd.orig.y + dy, pd.orig.scale);
      }
      return;
    }
    const d = state.drag;
    if (!d) return;
    const r = d.rect, dx = p.x - d.sx, dy = p.y - d.sy;
    if (d.resize) {
      r.w = Math.max(12, Math.round(d.orig.w + dx));
      r.h = Math.max(12, Math.round(d.orig.h + dy));
    } else {
      r.x = Math.round(Math.min(Math.max(d.orig.x + dx, 0), S.clientW - r.w));
      r.y = Math.round(Math.min(Math.max(d.orig.y + dy, 0), S.clientH - r.h));
    }
  });
  canvas.addEventListener('pointerup', e => {
    const pd = state.panelDrag;
    if (pd && pd.mode === 'prayer') { // drop the prayer on another cell (swaps with whatever is there)
      const p = pos(e), h = osrsPanelHit(panelLayout(), 'prayer', p.x, p.y, S.work.prayers);
      if (h && h.kind === 'prayer' && h.cell !== pd.prayerCell) {
        const a = S.work.prayers;
        [a[pd.prayerCell], a[h.cell]] = [a[h.cell], a[pd.prayerCell]];
      }
    }
    if (pd && pd.mode === 'press' && pd.slot !== null) { // a click (not a drag) on a slot: next colour
      const cur = S.work.inv[pd.slot];
      S.work.inv[pd.slot] = INV_CYCLE[(INV_CYCLE.indexOf(cur) + 1) % INV_CYCLE.length];
      layoutChanged();
    }
    if (state.drag || state.frameDrag || pd) { state.drag = null; state.frameDrag = null; state.panelDrag = null; saveSettings(S); }
  });
  canvas.addEventListener('pointerleave', () => { state.mouse = null; });

  // ---------------------------------------------------------------- drawing
  const FONT = (px, w = 'bold') => `${w} ${px}px "Trebuchet MS", Verdana, sans-serif`;
  function text(str, x, y, color, px, align = 'left', base = 'alphabetic') {
    ctx.font = FONT(px); ctx.textAlign = align; ctx.textBaseline = base;
    ctx.fillStyle = '#000'; ctx.fillText(str, x + 1, y + 1);
    ctx.fillStyle = color; ctx.fillText(str, x, y);
    return ctx.measureText(str).width;
  }
  function drawClickMarkers(list, now) {
    for (let i = list.length - 1; i >= 0; i--) if (now - list[i].t >= 400) list.splice(i, 1);
    for (const c of list) {
      const k = (now - c.t) / 400, s = 7 * (1 - k * 0.4);
      ctx.globalAlpha = 1 - k * 0.5; ctx.strokeStyle = c.color; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(c.x - s, c.y - s); ctx.lineTo(c.x + s, c.y + s); ctx.moveTo(c.x + s, c.y - s); ctx.lineTo(c.x - s, c.y + s); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function draw(now) {
    const W = S.clientW, H = S.clientH, dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#1d0c0a'; ctx.fillRect(0, 0, W, H);
    if (state.shot) {
      // drawn 1:1 at the size it was loaded at, anchored top-left
      ctx.drawImage(state.shot, 0, 0, S.work.shotW || W, S.work.shotH || H);
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,.04)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = 0; x < W; x += 40) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
      for (let y = 0; y < H; y += 40) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
      ctx.stroke();
    }

    trainer.draw(now, W, H);

    if (state.placing) {
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, W, H);
      if (trainer.usesBoxes) {
        const b = boxes();
        for (const p of POSITIONS) {
          const r = b[p];
          ctx.fillStyle = 'rgba(220,30,30,.35)'; ctx.fillRect(r.x, r.y, r.w, r.h);
          ctx.strokeStyle = '#ff4040'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
          ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2); ctx.setLineDash([]);
          ctx.fillStyle = '#ff981f'; ctx.fillRect(r.x + r.w - HANDLE, r.y + r.h - HANDLE, HANDLE, HANDLE);
          text(p, r.x + r.w / 2, r.y + r.h / 2, '#fff', 14, 'center', 'middle');
        }
        text('Drag boxes onto the crabs · orange corner resizes · P when finished', W / 2, 24, '#ffcf70', 14, 'center');
      } else if (trainer.usesPanel) {
        if (trainer.drawEdit) trainer.drawEdit();
        if (!trainer.usesPrayers) state.editTab = 'inventory';
        const pd = state.panelDrag, dragging = pd && pd.mode === 'prayer' ? pd.prayerCell : null;
        const L = panelLayout();
        osrsDrawPanel(ctx, L, { tab: state.editTab, gear: new ColourGear(S.work.inv), editing: true, prayerSlots: S.work.prayers, dragCell: dragging });
        if (dragging !== null && state.mouse) {
          const size = osrsPrayerRect(L, 0).w;
          osrsPrayerIcon(ctx, S.work.prayers[dragging], { x: state.mouse.x - size / 2, y: state.mouse.y - size / 2, w: size, h: size }, L.s, true, 0.85);
        }
        const tip = state.editTab === 'prayer' ? 'drag a prayer onto another spot to swap them' : 'click a slot to change its colour';
        text(`Inventory ${Math.round(panelPos().scale * 100)}%: drag it to move · orange corner resizes · ${tip}${trainer.usesPrayers ? ' · click the Inv / Pray tabs to edit either' : ''}${trainer.usesNylo ? ' · drag the boss box too' : ''}`, W / 2, 24, '#ffcf70', 14, 'center');
      } else {
        text('Move the frame, then press P when finished', W / 2, 24, '#ffcf70', 14, 'center');
      }
      text('Move the whole frame: drag empty space, or arrow keys (Shift = 10px) · H hides the controls', W / 2, 44, '#ffcf70', 13, 'center');
    }
  }

  // ---------------------------------------------------------------- trainers
  let statsDirty = true;
  const fmt = ms => (ms === null || ms === undefined ? '—' : ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`);
  const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const env = {
    S, ctx, boxes, text, fmt, avg, esc, drawClickMarkers, panelLayout, nyloBox,
    mouse: () => state.mouse,
    placing: () => state.placing,
    hasShot: () => !!state.shot,
    markStats: () => { statsDirty = true; },
  };
  const trainers = { maiden: makeMaidenTrainer(env), click: makeClickTrainer(env), nylo: makeNyloTrainer(env) };
  let trainer = trainers[S.trainer] || trainers.maiden;
  window.TRAINER.trainers = trainers;

  function activateTrainer(id) {
    if (trainer) trainer.stop();
    trainer = trainers[id] || trainers.maiden;
    S.trainer = trainer.id;
    document.body.dataset.trainer = trainer.id;
    $('#trainerSel').value = trainer.id;
    $('#placeBtn').title = trainer.usesBoxes ? 'Drag the four boxes onto the crab spawns (P)'
      : trainer.usesPanel ? 'Move and resize the inventory, set its gear, move the game frame (P)' : 'Move the game frame (P)';
    if (!state.placing) $('#placeBtn').textContent = placeLabel();
    $('#start').textContent = 'Start';
    statsDirty = true;
    saveSettings(S);
  }
  $('#trainerSel').addEventListener('change', e => { e.target.blur(); if (state.placing) setPlacing(false); activateTrainer(e.target.value); });

  // tab hotkeys (click trainer)
  $$('[data-key]').forEach(el => {
    const tab = el.dataset.key;
    el.value = S.clickKeys[tab] || '';
    el.addEventListener('click', () => { el.classList.add('listening'); el.value = 'press a key…'; });
    el.addEventListener('blur', () => { el.classList.remove('listening'); el.value = S.clickKeys[tab] || ''; });
    el.addEventListener('keydown', e => {
      if (!el.classList.contains('listening')) return;
      e.preventDefault();
      e.stopPropagation();
      S.clickKeys[tab] = e.key === 'Backspace' ? '' : e.key;
      saveSettings(S);
      el.blur();
    });
  });

  // ---------------------------------------------------------------- loop
  window.TRAINER.tick = now => trainer.tick(now);
  window.TRAINER.isDirty = isDirty;
  saveSettings(S); // persist any migration
  applyClientSize();
  showPanelSize();
  loadWorkShot();
  renderSetups(true);
  activateTrainer(trainer.id);
  let lastDpr = window.devicePixelRatio;
  let lastUi = 0;
  function frame(now) {
    if (window.devicePixelRatio !== lastDpr) { lastDpr = window.devicePixelRatio; applyClientSize(); }
    trainer.tick(now);
    draw(now);
    if (statsDirty) { statsDirty = false; $('#sessionStats').innerHTML = trainer.renderStats(); }
    if (now - lastUi > 250) { lastUi = now; renderSetups(false); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
