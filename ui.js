/* ================================================
   UI CONTROLLER
   Globals, DOM rendering, navigation, playback,
   and app initialisation.
   Load order: data-builders.js → render.js → ui.js
   ================================================ */

let mode = 'vector', cur = 0, total = 0, stepsData = [], playing = false, playTimer = null;
const charts = {};
const MODES = ['vector', 'projection', 'dda', 'multiray', 'walk'];

/* Origin/player positions set by dragging on the top-down scenes.
   null means "use the mode's default / slider-driven position". */
let vecOriginOverride = null, ddaPlayerOverride = null, mrPlayerOverride = null;

/* ------------------------------------------------
   DOM utilities
   ------------------------------------------------ */
function gc(id) { return +document.getElementById(id).value; }
function gv(id) { return document.getElementById(id).value; }
function sv(id, v) { document.getElementById(id).textContent = v; }

/* ------------------------------------------------
   Formula / Explain card / Chips
   ------------------------------------------------ */
function renderFormula() {
  const s = stepsData[cur] || {};
  document.getElementById('formulaLine').innerHTML = s.formula || '';
}
function renderExplain() {
  const s = stepsData[cur] || {};
  document.getElementById('explainCard').innerHTML = s.explain || '';
}
function renderChips() {
  const s = stepsData[cur] || {};
  const chips = s.chips || [];
  document.getElementById('chipsRow').innerHTML = chips.map(([l, v, c]) =>
    `<div class="chip ${c || ''}"><div class="chip-label">${l}</div><div class="chip-val">${v}</div></div>`
  ).join('');
}

/* ------------------------------------------------
   Step history table
   ------------------------------------------------ */
function buildTableHead() {
  const th = document.getElementById('tHead');
  if (mode === 'vector') th.innerHTML = '<tr><th>Step</th><th>Concept</th><th>Details</th></tr>';
  else if (mode === 'dda') th.innerHTML = '<tr><th>Step</th><th>Cell (x,y)</th><th>Axis</th><th>t (distance)</th><th>Hit?</th></tr>';
  else if (mode === 'multiray') th.innerHTML = '<tr><th>Ray</th><th>Angle</th><th>Distance</th><th>Side</th></tr>';
  else th.innerHTML = '<tr><th>Stage</th><th>δ (edge)</th><th>Naive dist</th><th>Corrected dist</th></tr>';
}

function makeRow(i) {
  const s = stepsData[i] || {};
  if (mode === 'vector') {
    const details = (s.chips || []).map(c => `${c[0]}: ${c[1]}`).join(' &nbsp;·&nbsp; ');
    return `<td>${i}</td><td style="color:#2c4bdb;font-weight:600">${s.title || ''}</td><td style="color:#4c5468;font-size:12px">${details}</td>`;
  } else if (mode === 'dda') {
    if (s.revealIdx === undefined || s.revealIdx < 0)
      return `<td>${i}</td><td colspan="4" style="color:#8791a3">${s.title || 'setup'}</td>`;
    if (s.revealIdx === s.res.iterations.length)
      return `<td>${i}</td><td colspan="3" style="color:#157a5e;font-weight:600">Final perpDist = ${s.res.perpDist.toFixed(3)}</td><td>—</td>`;
    const it = s.res.iterations[s.revealIdx];
    return `<td>${i}</td><td style="color:#6338bf">(${it.mapX}, ${it.mapY})</td><td style="color:${it.axis === 'X' ? '#2c4bdb' : '#a8710f'}">${it.axis}</td><td style="color:#157a5e">${it.t.toFixed(3)}</td><td style="color:${it.isWall ? '#c1382c' : '#4c5468'}">${it.isWall ? 'Yes' : 'No'}</td>`;
  } else if (mode === 'multiray') {
    if (i === 0) return `<td>—</td><td colspan="3" style="color:#8791a3">Setup: ${s.title}</td>`;
    const r = s.rays[i - 1];
    return `<td>${i}</td><td style="color:#a8710f">${(r.angle * 180 / Math.PI).toFixed(1)}°</td><td style="color:#157a5e">${r.dist.toFixed(2)}</td><td style="color:#2c4bdb">${r.side === 0 ? 'X' : 'Y'}</td>`;
  } else {
    return `<td>${i}</td><td style="color:#a8710f">${(s.edgeDelta * 180 / Math.PI).toFixed(1)}°</td><td style="color:#c1382c">${s.edgeNaive.toFixed(2)}</td><td style="color:#157a5e">${s.edgeCorrected.toFixed(2)}</td>`;
  }
}

function refreshTable() {
  const tbody = document.getElementById('tBody'), sc = document.querySelector('.table-scroll-wrap');
  while (tbody.rows.length > cur + 1) tbody.deleteRow(tbody.rows.length - 1);
  for (let i = tbody.rows.length; i <= cur; i++) {
    const tr = document.createElement('tr');
    tr.innerHTML = makeRow(i);
    tr.style.cursor = 'pointer';
    tr.onclick = () => jumpTo(i);
    tbody.appendChild(tr);
  }
  Array.from(tbody.rows).forEach((r, i) => r.classList.toggle('cur', i === cur));
  const row = tbody.rows[cur];
  if (row && sc) {
    const rb = row.offsetTop + row.offsetHeight;
    if (rb > sc.scrollTop + sc.clientHeight) sc.scrollTop = rb - sc.clientHeight + 4;
    else if (row.offsetTop < sc.scrollTop) sc.scrollTop = row.offsetTop - 4;
  }
}

/* ------------------------------------------------
   Progress dots
   ------------------------------------------------ */
function refreshDots() {
  const wrap = document.getElementById('dotsWrap'), max = Math.min(total + 1, 30);
  if (wrap.children.length !== max) {
    wrap.innerHTML = '';
    for (let i = 0; i < max; i++) {
      const d = document.createElement('div');
      d.className = 'dot';
      d.onclick = () => jumpTo(Math.round(i * total / (max - 1)));
      wrap.appendChild(d);
    }
  }
  wrap.querySelectorAll('.dot').forEach((d, i) => {
    const st = Math.round(i * total / (max - 1));
    d.className = 'dot' + (st === cur ? ' active' : st < cur ? ' done' : '');
  });
}

/* ------------------------------------------------
   Master UI refresh
   ------------------------------------------------ */
function updateUI() {
  const s = stepsData[cur] || {};
  const badge = document.getElementById('stepBadge');
  const titleEl = document.getElementById('stepTitle');
  badge.textContent = 'Step ' + cur;
  titleEl.textContent = s.title || ('Step ' + cur);

  let hot = false;
  if (mode === 'dda' && s.revealIdx >= 0 && s.revealIdx < (s.res ? s.res.iterations.length : -1)) {
    hot = s.res.iterations[s.revealIdx].isWall;
  }
  if (hot) {
    badge.style.background = 'var(--red-soft)'; badge.style.color = 'var(--red)'; badge.style.borderColor = 'var(--red)';
  } else {
    badge.style.background = 'var(--accent-soft)'; badge.style.color = 'var(--accent)'; badge.style.borderColor = 'var(--accent)';
  }

  document.getElementById('btnPrev').disabled = cur <= 0;
  document.getElementById('btnNext').disabled = cur >= total;
  refreshDots(); renderFormula(); renderExplain(); renderChips(); renderCharts(); refreshTable();
}

/* ------------------------------------------------
   Navigation
   ------------------------------------------------ */
function nextStep() { if (cur < total) { cur++; updateUI(); } }
function prevStep() { if (cur > 0) { cur--; updateUI(); } }
function jumpTo(n) { cur = n; updateUI(); }

/* ------------------------------------------------
   Playback
   ------------------------------------------------ */
function togglePlay() {
  if (playing) { stopPlay(); return; }
  playing = true;
  document.getElementById('btnPlay').textContent = '⏸ Pause';
  playTimer = setInterval(() => { if (cur >= total) { stopPlay(); return; } nextStep(); }, 900);
}
function stopPlay() {
  playing = false;
  clearInterval(playTimer);
  document.getElementById('btnPlay').textContent = '▶ Play';
}

/* ------------------------------------------------
   Mode switching & full reset
   ------------------------------------------------ */
function switchMode(m) {
  if (mode === 'walk' && m !== 'walk') stopWalkMode();
  mode = m;
  document.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', MODES[i] === m));
  document.querySelectorAll('.sc').forEach(el => el.classList.remove('active'));
  document.getElementById('sc-' + m).classList.add('active');
  toggleModeUI(m === 'walk');
  if (m === 'walk') startWalkMode();
  else resetAll();
}

/* Show the step-by-step theory + scene UI, or the live Walk Mode
   theory + canvas, never both. Left (theory) and right (viz) columns
   are toggled together so each mode gets a matching pair. */
function toggleModeUI(isWalk) {
  document.getElementById('stepTheory').style.display = isWalk ? 'none' : '';
  document.getElementById('walkTheory').style.display = isWalk ? '' : 'none';
  document.getElementById('stepVizWrap').style.display = isWalk ? 'none' : '';
  document.getElementById('walkWrap').style.display = isWalk ? '' : 'none';
}

/* preserveCur: keep the current step index (clamped) instead of jumping
   back to step 0. Used after a drag-to-reposition so the person doesn't
   lose their place in the walkthrough just for moving the origin. */
function buildAndRender(preserveCur) {
  stopPlay();
  const prevCur = cur;
  document.getElementById('tBody').innerHTML = '';
  if (mode === 'vector') {
    stepsData = buildVectorBasics(gv('vec-wall'), gc('vec-angle'), vecOriginOverride || { x: gc('vec-ox'), y: gc('vec-oy') });
  } else if (mode === 'dda') {
    stepsData = buildDDA(gv('dda-map'), gc('dda-angle'), ddaPlayerOverride);
  } else if (mode === 'multiray') {
    stepsData = buildMultiRay(gv('mr-map'), gc('mr-fov'), gc('mr-rays'), gc('mr-angle'), mrPlayerOverride);
  } else {
    stepsData = buildProjection(gc('proj-fov'), gc('proj-dist'), gc('proj-cols'));
  }
  total = stepsData.length - 1;
  cur = preserveCur ? Math.min(prevCur, total) : 0;
  setupCharts(); buildTableHead(); updateUI();
}
function resetAll() {
  vecOriginOverride = null; ddaPlayerOverride = null; mrPlayerOverride = null;
  buildAndRender(false);
}
function rebuildKeepStep() { buildAndRender(true); }

/* Switching wall orientation snaps the Origin X/Y fields to that wall's
   sensible default position, so the ray reliably hits the new wall instead
   of staying wherever the previous wall's default left it. */
function vecWallChanged() {
  const preset = WALL_ORIGINS[gv('vec-wall')] || WALL_ORIGINS.vertical;
  document.getElementById('vec-ox').value = preset.x;
  document.getElementById('vec-oy').value = preset.y;
  resetAll();
}

/* ------------------------------------------------
   Keyboard shortcuts
   ------------------------------------------------ */
document.addEventListener('keydown', e => {
  if (mode === 'walk') return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === '.') nextStep();
  if (e.key === ',') prevStep();
  if (e.key === ' ') { e.preventDefault(); togglePlay(); }
});

/* ================================================
   WALK MODE - live first-person raycasting.
   Reuses castRayDDA() from data-builders.js every
   animation frame instead of pre-baking steps.
   ================================================ */
const walkKeys = {};
let walkState = null, walkRAF = null, walkLastT = 0;

function startWalkMode() {
  stopWalkMode();
  const mapKey = gv('walk-map');
  const map = MAPS[mapKey] || MAPS.simple;
  walkState = { map, mapKey, x: 1.5, y: 1.5, angle: Math.PI / 4, fov: gc('walk-fov') * Math.PI / 180 };
  // Drop the player on the first open floor tile so every map is walkable from the start
  findSpawn:
  for (let ry = 1; ry < map.length - 1; ry++) {
    for (let rx = 1; rx < map[0].length - 1; rx++) {
      if (map[ry][rx] === '.') { walkState.x = rx + 0.5; walkState.y = ry + 0.5; break findSpawn; }
    }
  }
  walkLastT = performance.now();
  walkLoop(walkLastT);
  const focus = document.getElementById('w-focus');
  if (focus) focus.focus();
}

function stopWalkMode() {
  if (walkRAF) cancelAnimationFrame(walkRAF);
  walkRAF = null;
  for (const k in walkKeys) walkKeys[k] = false;
}

function walkFovChanged() { if (walkState) walkState.fov = gc('walk-fov') * Math.PI / 180; }
function walkMapChanged() { startWalkMode(); }

/* Small square collision box around the player so we can't clip through wall corners */
function walkBlocked(map, x, y) {
  const r = 0.2;
  const pts = [[x - r, y - r], [x + r, y - r], [x - r, y + r], [x + r, y + r]];
  for (const [cx, cy] of pts) {
    const mx = Math.floor(cx), my = Math.floor(cy);
    if (my < 0 || my >= map.length || mx < 0 || mx >= map[0].length) return true;
    if (map[my][mx] === '#') return true;
  }
  return false;
}

function walkLoop(t) {
  walkRAF = requestAnimationFrame(walkLoop);
  if (!walkState) return;
  const now = t || performance.now();
  const dt = Math.min(0.05, (now - walkLastT) / 1000);
  walkLastT = now;

  const moveSpeed = 2.6, turnSpeed = 2.6;
  let { x, y, angle, map } = walkState;
  if (walkKeys.ArrowLeft) angle -= turnSpeed * dt;
  if (walkKeys.ArrowRight) angle += turnSpeed * dt;
  let dx = 0, dy = 0;
  if (walkKeys.ArrowUp) { dx += Math.cos(angle) * moveSpeed * dt; dy += Math.sin(angle) * moveSpeed * dt; }
  if (walkKeys.ArrowDown) { dx -= Math.cos(angle) * moveSpeed * dt; dy -= Math.sin(angle) * moveSpeed * dt; }
  if (dx || dy) {
    if (!walkBlocked(map, x + dx, y)) x += dx;      // slide along walls on each axis
    if (!walkBlocked(map, x, y + dy)) y += dy;      // independently rather than stopping dead
  }
  walkState.x = x; walkState.y = y; walkState.angle = angle;
  renderWalkScene(walkState);
}

window.addEventListener('keydown', e => {
  if (mode !== 'walk') return;
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    walkKeys[e.key] = true;
  }
});
window.addEventListener('keyup', e => { walkKeys[e.key] = false; });

/* ------------------------------------------------
   Keep canvases crisp on resize
   ------------------------------------------------ */
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => renderCharts(), 120);
});

/* ------------------------------------------------
   Boot
   ------------------------------------------------ */
resetAll();
bindWalkMapDrag();
