/* ================================================
   RENDER - canvas scene drawing + Chart.js wrapper.
   Depends on: Chart.js (global), globals from ui.js
   (charts, stepsData, cur, mode)
   ================================================ */

/* ------------------------------------------------
   Low-level Chart.js wrapper (numeric charts only:
   depth buffers, sideDist race, naive-vs-corrected)
   ------------------------------------------------ */
function canvasChart(id, cfg) {
  const el = document.getElementById(id);
  if (!el) return;
  const baseFont = { family: 'Inter, system-ui, sans-serif', size: 11, color: '#8791a3' };
  const gridColor = 'rgba(18,23,43,.08)';
  const datasets = cfg.datasets.map(ds => ({
    label: ds.label, data: ds.data, borderColor: ds.color,
    backgroundColor: Array.isArray(ds.color) ? ds.color : (ds.fill || ds.color),
    borderWidth: ds.width || 1.5, borderDash: ds.dash || [],
    pointRadius: ds.dots ? 3 : 0, pointBackgroundColor: ds.color,
    fill: !!ds.fill, tension: 0.35
  }));

  if (charts[id] && charts[id].config.type === (cfg.type || 'line')) {
    const c = charts[id];
    c.data.labels = cfg.labels;
    while (c.data.datasets.length > datasets.length) c.data.datasets.pop();
    datasets.forEach((ds, i) => { if (c.data.datasets[i]) Object.assign(c.data.datasets[i], ds); else c.data.datasets.push(ds); });
    if (cfg.yMin !== undefined) c.options.scales.y.min = cfg.yMin;
    if (cfg.yMax !== undefined) c.options.scales.y.max = cfg.yMax;
    c.update('none');
    return;
  }
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  charts[id] = new Chart(el, {
    type: cfg.type || 'line',
    data: { labels: cfg.labels, datasets },
    options: {
      animation: false, responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: !!cfg.legend, labels: { color: '#4c5468', font: baseFont, boxWidth: 8 } } },
      scales: {
        x: { ticks: { color: '#8791a3', font: baseFont, maxTicksLimit: 12 }, grid: { color: gridColor } },
        y: { min: cfg.yMin, max: cfg.yMax, ticks: { color: '#8791a3', font: baseFont }, grid: { color: gridColor } }
      }
    }
  });
}

/* ------------------------------------------------
   Raw canvas 2D scene helpers
   ------------------------------------------------ */
function prepCanvas(id) {
  const cnv = document.getElementById(id);
  if (!cnv) return null;
  const rect = cnv.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(rect.width, 10), h = Math.max(rect.height, 10);
  cnv.width = w * dpr; cnv.height = h * dpr;
  const ctx = cnv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}
function clearScene(ctx, w, h) { ctx.clearRect(0, 0, w, h); }

function fitGrid(map, w, h, pad) {
  pad = pad === undefined ? 14 : pad;
  const cols = map[0].length, rows = map.length;
  const cell = Math.min((w - pad * 2) / cols, (h - pad * 2) / rows);
  const ox = (w - cols * cell) / 2, oy = (h - rows * cell) / 2;
  return { cell, ox, oy, cols, rows };
}
function drawGridCells(ctx, map, g, dark) {
  for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
    const isWall = map[r][c] === '#';
    ctx.fillStyle = dark ? (isWall ? '#26314f' : '#131a30') : (isWall ? '#3a4356' : '#f7f8fb');
    ctx.fillRect(g.ox + c * g.cell, g.oy + r * g.cell, g.cell, g.cell);
    ctx.strokeStyle = dark ? 'rgba(255,255,255,.07)' : 'rgba(18,23,43,.09)';
    ctx.strokeRect(g.ox + c * g.cell, g.oy + r * g.cell, g.cell, g.cell);
  }
}
function highlightCell(ctx, c, r, g, color) {
  if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return;
  ctx.fillStyle = color;
  ctx.fillRect(g.ox + c * g.cell, g.oy + r * g.cell, g.cell, g.cell);
}
function drawPlayer(ctx, x, y, angle, ox, oy, cell, color) {
  color = color || '#2c4bdb';
  const px = ox + x * cell, py = oy + y * cell;
  ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  ctx.beginPath(); ctx.moveTo(px, py);
  ctx.lineTo(px + Math.cos(angle) * 16, py + Math.sin(angle) * 16);
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
}
function drawRayLine(ctx, x0, y0, x1, y1, ox, oy, cell, color, width, dash) {
  ctx.save();
  ctx.setLineDash(dash || []);
  ctx.strokeStyle = color; ctx.lineWidth = width || 1.5;
  ctx.beginPath(); ctx.moveTo(ox + x0 * cell, oy + y0 * cell); ctx.lineTo(ox + x1 * cell, oy + y1 * cell); ctx.stroke();
  ctx.restore();
}
function drawPoint(ctx, x, y, ox, oy, cell, color, r) {
  ctx.beginPath(); ctx.arc(ox + x * cell, oy + y * cell, r || 4, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.fill();
}
function label(ctx, text, x, y, color, size) {
  ctx.fillStyle = color || '#4c5468';
  ctx.font = (size || 11) + 'px Inter, sans-serif';
  ctx.fillText(text, x, y);
}

/* ------------------------------------------------
   DOM layout - injects canvases per mode
   ------------------------------------------------ */
function setupCharts() {
  Object.values(charts).forEach(c => c.destroy());
  Object.keys(charts).forEach(k => delete charts[k]);
  const area = document.getElementById('chartsArea');
  if (mode === 'vector') {
    area.innerHTML = `
      <div class="scene-box tall"><canvas id="v-scene"></canvas></div>
      <div class="fleg" style="margin-top:12px">
        <div class="fl"><div class="fldot" style="background:var(--accent)"></div><b>O</b> — ray origin (where it's fired from)</div>
        <div class="fl"><div class="fldot" style="background:var(--gold)"></div><b>D</b> — direction the ray looks, angle θ</div>
        <div class="fl"><div class="fldot" style="background:var(--purple)"></div><b>A, B</b> — the wall's two endpoints</div>
        <div class="fl"><div class="fldot" style="background:var(--red)"></div><b>P</b> — where the ray hits the wall (once solved)</div>
        <div class="fl"><div class="fldot" style="background:var(--green)"></div><b>t</b> — distance from O to P</div>
      </div>`;
    bindVectorDrag();
  } else if (mode === 'dda') {
    area.innerHTML = `
      <div class="scene-grid">
        <div class="scene-box tall"><canvas id="d-grid"></canvas></div>
        <div class="chart-box"><h4>sideDistX vs sideDistY</h4><div class="chart-inner"><canvas id="d-side"></canvas></div></div>
      </div>`;
    bindDDADrag();
  } else if (mode === 'multiray') {
    area.innerHTML = `
      <div class="scene-grid" style="margin-bottom:12px">
        <div class="scene-box tall"><canvas id="m-top"></canvas></div>
        <div class="scene-box tall screen"><canvas id="m-3d"></canvas></div>
      </div>
      <div class="chart-box wide"><h4>Depth Buffer - corrected distance per ray</h4><div class="chart-inner"><canvas id="m-depth"></canvas></div></div>`;
    bindMultiRayDrag();
  } else {
    area.innerHTML = `
      <div class="scene-box" style="margin-bottom:12px"><canvas id="p-top"></canvas></div>
      <div class="chart-grid cols-2" style="margin-bottom:12px">
        <div class="chart-box screen"><h4 id="p-naive-h4">Naive (Fisheye)</h4><div class="chart-inner"><canvas id="p-naive-3d"></canvas></div></div>
        <div class="chart-box screen"><h4 id="p-corrected-h4">Corrected (Perpendicular)</h4><div class="chart-inner"><canvas id="p-corrected-3d"></canvas></div></div>
      </div>
      <div class="chart-box wide"><h4>Distance vs. Ray Angle</h4><div class="chart-inner"><canvas id="p-chart"></canvas></div></div>`;
    bindProjectionDrag();
  }
}

/* ------------------------------------------------
   Draggable top-view interaction (shared)
   Click sets origin/player position; dragging away
   from that point sets facing direction; release
   commits both and recomputes the underlying data.
   Bound once at document level so re-creating
   canvases on mode switch/reset never leaks listeners.
   ------------------------------------------------ */
let activeDrag = null;
function dragPoint(e, el, toWorld) {
  const rect = el.getBoundingClientRect();
  const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
  return toWorld(cx, cy, rect);
}
function bindDraggableScene(canvasId, handlers) {
  const el = document.getElementById(canvasId);
  if (!el) return;
  function begin(e) {
    e.preventDefault();
    const pt = dragPoint(e, el, handlers.toWorld);
    const { x, y } = handlers.clamp ? handlers.clamp(pt.x, pt.y) : pt;
    const angle = handlers.initialAngle ? handlers.initialAngle() : 0;
    activeDrag = { el, handlers, sx: x, sy: y, angle };
    handlers.preview(x, y, angle);
  }
  el.addEventListener('mousedown', begin);
  el.addEventListener('touchstart', begin, { passive: false });
}
function onDragMove(e) {
  if (!activeDrag) return;
  e.preventDefault();
  const pt = dragPoint(e, activeDrag.el, activeDrag.handlers.toWorld);
  const dx = pt.x - activeDrag.sx, dy = pt.y - activeDrag.sy;
  if (Math.hypot(dx, dy) > 0.15) activeDrag.angle = Math.atan2(dy, dx);
  activeDrag.handlers.preview(activeDrag.sx, activeDrag.sy, activeDrag.angle);
}
function onDragEnd() {
  if (!activeDrag) return;
  const { handlers, sx, sy, angle } = activeDrag;
  activeDrag = null;
  handlers.commit(sx, sy, angle);
}
document.addEventListener('mousemove', onDragMove);
document.addEventListener('touchmove', onDragMove, { passive: false });
document.addEventListener('mouseup', onDragEnd);
document.addEventListener('touchend', onDragEnd);

function bindVectorDrag() {
  bindDraggableScene('v-scene', {
    toWorld(cx, cy, rect) {
      const { scale, ox, oy } = vectorLayout(rect.width, rect.height);
      return { x: (cx - ox) / scale, y: (cy - oy) / scale };
    },
    clamp(x, y) { return { x: Math.min(VEC_WORLD_MAX, Math.max(0, x)), y: Math.min(VEC_WORLD_MAX, Math.max(0, y)) }; },
    initialAngle() { const s = stepsData[cur]; return s ? s.angleDeg * Math.PI / 180 : 0; },
    preview(x, y, angle) {
      const s = stepsData[cur]; if (!s) return;
      const D = { x: Math.cos(angle), y: Math.sin(angle) };
      const hit = raySegmentIntersect(x, y, D.x, D.y, s.wall.ax, s.wall.ay, s.wall.bx, s.wall.by);
      renderVectorScene(Object.assign({}, s, { O: { x, y }, D, hit, angleDeg: ((angle * 180 / Math.PI) + 360) % 360 }));
    },
    commit(x, y, angle) {
      vecOriginOverride = { x, y };
      const deg = Math.round(((angle * 180 / Math.PI) + 360) % 360);
      document.getElementById('vec-angle').value = deg;
      sv('vec-av', deg + '°');
      document.getElementById('vec-ox').value = Math.round(x * 10) / 10;
      document.getElementById('vec-oy').value = Math.round(y * 10) / 10;
      rebuildKeepStep();
    }
  });
}

function bindDDADrag() {
  bindDraggableScene('d-grid', {
    toWorld(cx, cy, rect) {
      const s = stepsData[cur]; const map = s ? s.map : MAPS.simple;
      const g = fitGrid(map, rect.width, rect.height);
      return { x: (cx - g.ox) / g.cell, y: (cy - g.oy) / g.cell };
    },
    clamp(x, y) {
      const s = stepsData[cur]; const map = s ? s.map : MAPS.simple;
      return { x: Math.min(map[0].length - 0.05, Math.max(0.05, x)), y: Math.min(map.length - 0.05, Math.max(0.05, y)) };
    },
    initialAngle() { const s = stepsData[cur]; return s ? s.angle : 0; },
    preview(x, y, angle) {
      const s = stepsData[cur]; if (!s) return;
      const res = castRayDDA(s.map, x, y, angle);
      renderDDAScene(Object.assign({}, s, { px: x, py: y, angle, res }));
    },
    commit(x, y, angle) {
      ddaPlayerOverride = { x, y };
      const deg = Math.round(((angle * 180 / Math.PI) + 360) % 360);
      document.getElementById('dda-angle').value = deg;
      sv('dda-av', deg + '°');
      rebuildKeepStep();
    }
  });
}

function bindMultiRayDrag() {
  bindDraggableScene('m-top', {
    toWorld(cx, cy, rect) {
      const s = stepsData[cur]; const map = s ? s.map : MAPS.simple;
      const g = fitGrid(map, rect.width, rect.height);
      return { x: (cx - g.ox) / g.cell, y: (cy - g.oy) / g.cell };
    },
    clamp(x, y) {
      const s = stepsData[cur]; const map = s ? s.map : MAPS.simple;
      return { x: Math.min(map[0].length - 0.05, Math.max(0.05, x)), y: Math.min(map.length - 0.05, Math.max(0.05, y)) };
    },
    initialAngle() { const s = stepsData[cur]; return s ? s.baseAngle : 0; },
    preview(x, y, angle) {
      const s = stepsData[cur]; if (!s) return;
      const n = s.rays.length;
      const rays = [];
      for (let i = 0; i < n; i++) {
        const a = n > 1 ? angle - s.fov / 2 + i * (s.fov / (n - 1)) : angle;
        const res = castRayDDA(s.map, x, y, a);
        rays.push({ angle: a, dist: res.perpDist, side: res.side, hitX: res.hitX, hitY: res.hitY });
      }
      renderMultiRayScene(Object.assign({}, s, { px: x, py: y, baseAngle: angle, rays }));
    },
    commit(x, y, angle) {
      mrPlayerOverride = { x, y };
      const deg = Math.round(((angle * 180 / Math.PI) + 360) % 360);
      document.getElementById('mr-angle').value = deg;
      sv('mr-av', deg + '°');
      rebuildKeepStep();
    }
  });
}

/* Projection tab: the wall is flat and infinite, so only distance-to-wall
   is geometrically meaningful. Dragging up/down sets D0 directly (mirrors
   the Wall Distance slider); left/right has no effect on a flat wall. */
function projLayout(w, h) {
  const worldW = 10, worldH = 6, pad = 22;
  const scale = Math.min((w - 2 * pad) / worldW, (h - 2 * pad) / worldH);
  const oy = (h - worldH * scale) / 2;
  return { scale, oy, worldH };
}
function bindProjectionDrag() {
  bindDraggableScene('p-top', {
    toWorld(cx, cy, rect) {
      const { scale, oy } = projLayout(rect.width, rect.height);
      return { x: 0, y: (cy - oy) / scale };
    },
    clamp(x, y) { return { x: 0, y }; },
    initialAngle() { return 0; },
    preview(x, y) {
      const s = stepsData[cur]; if (!s) return;
      const playerY = 6 - 0.7;
      const d0 = Math.min(8, Math.max(2, playerY - y));
      const naive = s.deltas.map(d => d0 / Math.cos(d));
      const corrected = naive.map((n, i) => n * Math.cos(s.deltas[i]));
      renderProjectionScene(Object.assign({}, s, { D0: d0, naive, corrected }));
    },
    commit(x, y) {
      const playerY = 6 - 0.7;
      const d0 = Math.round(Math.min(8, Math.max(2, playerY - y)));
      document.getElementById('proj-dist').value = d0;
      sv('proj-dv', d0);
      rebuildKeepStep();
    }
  });
}

/* ------------------------------------------------
   Dispatch
   ------------------------------------------------ */
function renderCharts() {
  const s = stepsData[cur];
  if (!s) return;
  if (mode === 'vector') renderVectorScene(s);
  else if (mode === 'dda') renderDDAScene(s);
  else if (mode === 'multiray') renderMultiRayScene(s);
  else renderProjectionScene(s);
}

/* ------------------------------------------------
   MODE 1 - vector / ray-segment scene
   ------------------------------------------------ */
const VEC_WORLD_MAX = 9, VEC_PAD = 24;
function vectorLayout(w, h) {
  const scale = Math.min((w - 2 * VEC_PAD) / VEC_WORLD_MAX, (h - 2 * VEC_PAD) / VEC_WORLD_MAX);
  const ox = (w - VEC_WORLD_MAX * scale) / 2, oy = (h - VEC_WORLD_MAX * scale) / 2;
  return { scale, ox, oy };
}
function renderVectorScene(s) {
  const p = prepCanvas('v-scene'); if (!p) return;
  const { ctx, w, h } = p;
  clearScene(ctx, w, h);
  const worldMax = VEC_WORLD_MAX;
  const { scale, ox, oy } = vectorLayout(w, h);
  const toPx = (x, y) => [ox + x * scale, oy + y * scale];

  ctx.strokeStyle = 'rgba(18,23,43,.08)'; ctx.lineWidth = 1;
  for (let i = 0; i <= worldMax; i++) {
    const gx = toPx(i, 0)[0];
    ctx.beginPath(); ctx.moveTo(gx, oy); ctx.lineTo(gx, oy + worldMax * scale); ctx.stroke();
    const gy = toPx(0, i)[1];
    ctx.beginPath(); ctx.moveTo(ox, gy); ctx.lineTo(ox + worldMax * scale, gy); ctx.stroke();
    label(ctx, String(i), gx - 3, oy + worldMax * scale + 13, '#aab0bd', 9);
    label(ctx, String(i), ox - 13, gy + 3, '#aab0bd', 9);
  }

  const reveal = cur;
  const [Ox, Oy] = toPx(s.O.x, s.O.y);
  const hit = s.hit, good = !!(hit && hit.valid);

  // Wall segment: sketched faintly from the very first step so it's always
  // clear where the wall sits, then gets promoted to full color/labels once
  // its own step (2) arrives, and to green/red once validity is known.
  {
    const [ax, ay] = toPx(s.wall.ax, s.wall.ay);
    const [bx, by] = toPx(s.wall.bx, s.wall.by);
    const wallShown = reveal >= 2;
    ctx.strokeStyle = wallShown ? (reveal >= 5 ? (good ? '#157a5e' : '#c1382c') : '#6338bf') : 'rgba(99,56,191,.32)';
    ctx.lineWidth = wallShown ? 4 : 2.5;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    if (wallShown) {
      drawPoint(ctx, s.wall.ax, s.wall.ay, ox, oy, scale, '#6338bf', 4);
      drawPoint(ctx, s.wall.bx, s.wall.by, ox, oy, scale, '#6338bf', 4);
      label(ctx, 'A', ax + 6, ay - 6, '#6338bf'); label(ctx, 'B', bx + 6, by - 6, '#6338bf');
    }
  }

  // Direction ray: also sketched faintly right away so it's clear which way
  // the ray is looking, then promoted to solid gold once step 1 arrives.
  {
    const dShown = reveal >= 1;
    const [ex, ey] = toPx(s.O.x + s.D.x * 8, s.O.y + s.D.y * 8);
    ctx.save(); ctx.setLineDash([5, 4]);
    ctx.strokeStyle = dShown ? '#a8710f' : 'rgba(168,113,15,.35)';
    ctx.lineWidth = dShown ? 1.8 : 1.3;
    ctx.beginPath(); ctx.moveTo(Ox, Oy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.restore();
    if (dShown) label(ctx, 'D', ox + (s.O.x + s.D.x * 2) * scale + 6, oy + (s.O.y + s.D.y * 2) * scale, '#a8710f');
  }

  if (reveal >= 6 && good) {
    const [hx, hy] = toPx(hit.x, hit.y);
    ctx.strokeStyle = '#2c4bdb'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(Ox, Oy); ctx.lineTo(hx, hy); ctx.stroke();
    drawPoint(ctx, hit.x, hit.y, ox, oy, scale, '#c1382c', 6);
    label(ctx, 'P (hit)', hx + 8, hy - 8, '#c1382c', 12);
  }
  if (reveal >= 7 && good) {
    const mx = (Ox + toPx(hit.x, hit.y)[0]) / 2, my = (Oy + toPx(hit.x, hit.y)[1]) / 2;
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = 'rgba(18,23,43,.12)'; ctx.lineWidth = 1;
    ctx.fillRect(mx - 26, my - 18, 54, 17); ctx.strokeRect(mx - 26, my - 18, 54, 17);
    label(ctx, 't = ' + hit.t.toFixed(2), mx - 20, my - 6, '#157a5e', 12);
  }
  drawPoint(ctx, s.O.x, s.O.y, ox, oy, scale, '#2c4bdb', 5);
  label(ctx, 'O', Ox - 14, Oy - 8, '#2c4bdb', 12);
}

/* ------------------------------------------------
   MODE 2 - DDA grid scene + sideDist race chart
   ------------------------------------------------ */
function renderDDAScene(s) {
  const p = prepCanvas('d-grid');
  if (p) {
    const { ctx, w, h } = p;
    clearScene(ctx, w, h);
    const g = fitGrid(s.map, w, h);
    drawGridCells(ctx, s.map, g);

    if (s.revealIdx >= 0) {
      let x0 = s.px, y0 = s.py;
      for (let k = 0; k <= Math.min(s.revealIdx, s.res.iterations.length - 1); k++) {
        const it = s.res.iterations[k];
        const x1 = s.px + s.res.dirX * it.t, y1 = s.py + s.res.dirY * it.t;
        highlightCell(ctx, it.mapX, it.mapY, g, it.isWall ? 'rgba(193,56,44,.16)' : 'rgba(44,75,219,.12)');
        drawRayLine(ctx, x0, y0, x1, y1, g.ox, g.oy, g.cell, it.isWall ? '#c1382c' : '#2c4bdb', 2.2);
        x0 = x1; y0 = y1;
      }
      if (s.revealIdx === s.res.iterations.length) drawPoint(ctx, s.res.hitX, s.res.hitY, g.ox, g.oy, g.cell, '#c1382c', 6);
    } else if (cur >= 1) {
      drawRayLine(ctx, s.px, s.py, s.px + s.res.dirX * 2.4, s.py + s.res.dirY * 2.4, g.ox, g.oy, g.cell, '#a8710f', 2, [4, 3]);
    }
    drawPlayer(ctx, s.px, s.py, s.angle, g.ox, g.oy, g.cell);
  }
  let sdx = 0, sdy = 0;
  if (s.revealIdx >= 0) {
    const idx = Math.min(s.revealIdx, s.res.iterations.length - 1);
    const it = s.res.iterations[idx];
    sdx = it.sideDistX; sdy = it.sideDistY;
  } else if (cur >= 2) {
    sdx = s.res.sideDistX0; sdy = s.res.sideDistY0;
  }
  canvasChart('d-side', { type: 'bar', labels: ['sideDistX', 'sideDistY'], legend: false,
    datasets: [{ data: [sdx, sdy], color: ['#2c4bdb', '#a8710f'] }] });
}

/* ------------------------------------------------
   MODE 3 - multi-ray top view + 3D + depth chart
   ------------------------------------------------ */
function renderMultiRayScene(s) {
  const pt = prepCanvas('m-top');
  if (pt) {
    const { ctx, w, h } = pt;
    clearScene(ctx, w, h);
    const g = fitGrid(s.map, w, h);
    drawGridCells(ctx, s.map, g);
    const n = s.castCount;
    s.rays.slice(0, n).forEach((r, i) => {
      const isLast = i === n - 1;
      const t = Math.min(r.dist, 14);
      const x1 = s.px + Math.cos(r.angle) * t, y1 = s.py + Math.sin(r.angle) * t;
      const fog = Math.max(0.3, 1 - r.dist / 10);
      const color = isLast ? '#a8710f' : `rgba(21,122,94,${fog.toFixed(2)})`;
      drawRayLine(ctx, s.px, s.py, x1, y1, g.ox, g.oy, g.cell, color, isLast ? 2.4 : 1);
    });
    drawPlayer(ctx, s.px, s.py, s.baseAngle, g.ox, g.oy, g.cell);
  }
  const p3 = prepCanvas('m-3d');
  if (p3) {
    const { ctx, w, h } = p3;
    clearScene(ctx, w, h);
    ctx.fillStyle = '#0f1526'; ctx.fillRect(0, 0, w, h);
    const n = s.castCount, total = s.rays.length;
    const colW = w / total;
    for (let i = 0; i < n; i++) {
      const r = s.rays[i];
      const heightFrac = Math.min(1, 2.6 / Math.max(r.dist, 0.3));
      const colH = heightFrac * h;
      const fog = Math.max(0.2, 1 - r.dist / 11);
      const base = r.side === 0 ? [92, 130, 255] : [64, 96, 220];
      ctx.fillStyle = `rgba(${base[0]},${base[1]},${base[2]},${fog.toFixed(2)})`;
      ctx.fillRect(i * colW, (h - colH) / 2, colW + 1, colH);
    }
  }
  const allLabels = s.rays.map((_, i) => i);
  const dat = s.rays.map((r, i) => (i < s.castCount ? r.dist : null));
  canvasChart('m-depth', { type: 'bar', labels: allLabels, legend: false,
    datasets: [{ data: dat, color: 'rgba(21,122,94,.75)' }] });
}

/* ------------------------------------------------
   MODE 4 - projection / fisheye scenes + chart
   ------------------------------------------------ */
function renderProjectionScene(s) {
  const pt = prepCanvas('p-top');
  if (pt) {
    const { ctx, w, h } = pt;
    clearScene(ctx, w, h);
    const worldW = 10, worldH = 6, pad = 22;
    const scale = Math.min((w - 2 * pad) / worldW, (h - 2 * pad) / worldH);
    const ox = (w - worldW * scale) / 2, oy = (h - worldH * scale) / 2;
    const playerX = worldW / 2, playerY = worldH - 0.7;
    const px2 = ox + playerX * scale, py2 = oy + playerY * scale;
    const wallY = oy + (playerY - s.D0) * scale;

    ctx.strokeStyle = '#6338bf'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(ox, wallY); ctx.lineTo(ox + worldW * scale, wallY); ctx.stroke();
    label(ctx, 'wall', ox + 4, wallY - 6, '#6338bf');

    // Fan out EVERY ray in the sweep (not just the center + one edge ray) so
    // it's visually obvious this is a multi-ray cast, one ray per screen
    // column, all aimed at the same flat wall from slightly different angles.
    if (s.deltas && s.deltas.length > 1) {
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = s.revealNaive > 0 ? 'rgba(193,56,44,.2)' : 'rgba(44,75,219,.2)';
      s.deltas.forEach(d => {
        const rx = ox + (playerX + Math.tan(d) * s.D0) * scale;
        ctx.beginPath(); ctx.moveTo(px2, py2); ctx.lineTo(rx, wallY); ctx.stroke();
      });
      ctx.restore();
    }

    // Highlight the one ray this step is actively casting or correcting.
    if (s.rayIndex !== undefined && s.rayIndex !== null && s.deltas) {
      const d = s.deltas[s.rayIndex];
      const rx = ox + (playerX + Math.tan(d) * s.D0) * scale;
      const isCorrecting = s.stage === 'corrected-build';
      ctx.strokeStyle = isCorrecting ? '#157a5e' : '#c1382c';
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(px2, py2); ctx.lineTo(rx, wallY); ctx.stroke();
      label(ctx, (isCorrecting ? 'correcting ray ' : 'naive ray ') + (s.rayIndex + 1), rx - 40, wallY - 8, isCorrecting ? '#157a5e' : '#c1382c', 11);
    } else if (s.stage === 'intro') {
      // Before anything's been cast, show just the plain straight-ahead line.
      ctx.strokeStyle = '#2c4bdb'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px2, py2); ctx.lineTo(ox + playerX * scale, wallY); ctx.stroke();
    }
    drawPoint(ctx, playerX, playerY, ox, oy, scale, '#2c4bdb', 5);
  }

  // The naive (fisheye) render is built up ray by ray from the first naive
  // step onward, so the distortion is visible taking shape column by column,
  // not just described in prose. The corrected render stays locked until its
  // own build sequence starts, then fills in the same way, ray by ray.
  const naiveDone = s.revealNaive >= s.cols;
  const correctedStarted = s.revealCorrected > 0;
  const correctedDone = s.revealCorrected >= s.cols;
  const naiveH4 = document.getElementById('p-naive-h4');
  const correctedH4 = document.getElementById('p-corrected-h4');
  if (naiveH4) {
    naiveH4.textContent = s.stage === 'intro' ? 'Naive (Fisheye) — about to build it, ray by ray'
      : naiveDone ? 'Naive (Fisheye) — complete, watch it bow'
      : `Naive (Fisheye) — casting… (${s.revealNaive}/${s.cols})`;
  }
  if (correctedH4) {
    correctedH4.textContent = !correctedStarted ? 'Corrected — 🔒 not built yet'
      : correctedDone ? 'Corrected (Perpendicular) — complete'
      : `Corrected — fixing… (${s.revealCorrected}/${s.cols})`;
  }

  function drawWallProfile(id, arr, revealCount, color, glow, tag, activeIndex) {
    const p = prepCanvas(id); if (!p) return;
    const { ctx, w, h } = p;
    clearScene(ctx, w, h);
    ctx.fillStyle = '#0f1526'; ctx.fillRect(0, 0, w, h);
    const colW = w / arr.length;
    // Scale every bar relative to the shortest distance in THIS array (the
    // center ray), not a fixed constant - a fixed constant saturates every
    // bar at max height for realistic distances/FOVs and hides the curve
    // entirely (the bug the user hit). Relative scaling always shows the
    // true bow: naive bars shrink toward the edges (1/cos falloff),
    // corrected bars stay dead flat, no matter the wall distance or FOV.
    const minD = Math.min(...arr);
    const maxBarFrac = 0.86;
    const tops = [];
    arr.forEach((d, i) => {
      const revealed = i < revealCount;
      const hh = Math.max(8, (minD / Math.max(d, 0.01)) * maxBarFrac * h);
      const top = (h - hh) / 2;
      tops.push(revealed ? top : null);
      if (revealed) {
        ctx.fillStyle = color;
        ctx.fillRect(i * colW, top, colW + 1, hh);
        if (activeIndex === i) {
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
          ctx.strokeRect(i * colW + 0.75, top + 0.75, colW - 0.5, hh - 1.5);
        }
      } else {
        // Not cast yet this walkthrough - a faint placeholder so the
        // "ray by ray" build reads as filling in left-to-right.
        ctx.fillStyle = 'rgba(255,255,255,.045)';
        ctx.fillRect(i * colW, h * 0.42, colW + 1, h * 0.16);
      }
    });
    // Outline the roofline so the bulge (or lack of one) reads at a glance,
    // not just as a bar-height difference. Only spans the revealed portion.
    if (revealCount > 0) {
      ctx.strokeStyle = glow; ctx.lineWidth = 2;
      ctx.beginPath();
      let started = false;
      tops.forEach((t, i) => {
        if (t === null) return;
        const x = i * colW + colW / 2;
        if (!started) { ctx.moveTo(x, t); started = true; } else ctx.lineTo(x, t);
      });
      ctx.stroke();
    }
    label(ctx, tag, 10, 18, glow, 11);
    if (revealCount < arr.length) label(ctx, `${revealCount} / ${arr.length} rays cast`, 10, h - 10, '#5b6684', 10.5);
  }

  drawWallProfile('p-naive-3d', s.naive, s.revealNaive, 'rgba(224,101,90,.7)', '#ff9c8a', '⚠ curves — but the wall is flat',
    s.stage === 'naive-build' ? s.rayIndex : null);

  if (!correctedStarted) {
    const pc = prepCanvas('p-corrected-3d');
    if (pc) {
      const { ctx, w, h } = pc;
      clearScene(ctx, w, h);
      ctx.fillStyle = '#0f1526'; ctx.fillRect(0, 0, w, h);
      label(ctx, '🔒 fix applied ray by ray in the next steps', 14, h / 2, '#5b6684', 12);
    }
  } else {
    drawWallProfile('p-corrected-3d', s.corrected, s.revealCorrected, 'rgba(60,178,148,.7)', '#7cf0cd', '✓ flat — matches the real wall',
      s.stage === 'corrected-build' ? s.rayIndex : null);
  }

  if (s.stage !== 'intro') {
    const naiveData = s.naive.map((v, i) => i < s.revealNaive ? v : null);
    const correctedData = s.corrected.map((v, i) => i < s.revealCorrected ? v : null);
    canvasChart('p-chart', {
      type: 'line', legend: true,
      labels: s.deltas.map(d => (d * 180 / Math.PI).toFixed(0) + '°'),
      datasets: [
        { label: 'Naive distance', data: naiveData, color: '#c1382c', width: 2, dots: false },
        { label: 'Corrected distance', data: correctedData, color: '#157a5e', width: 2, dots: false }
      ]
    });
  }
}

/* ------------------------------------------------
   WALK MODE - live first-person raycasting.
   Casts one DDA ray per screen column every frame,
   corrects each for fisheye against the view axis
   (same cos(δ) fix taught in the Projection tab),
   and draws it as a shaded vertical strip.
   ------------------------------------------------ */
function renderWalkScene(ws) {
  renderWalk3D(ws);
  renderWalkMinimap(ws);
}

function renderWalk3D(ws) {
  const p = prepCanvas('w-3d'); if (!p) return;
  const { ctx, w, h } = p;

  // Ceiling / floor gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h / 2);
  skyGrad.addColorStop(0, '#0f1526'); skyGrad.addColorStop(1, '#161f38');
  ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, w, h / 2);
  const floorGrad = ctx.createLinearGradient(0, h / 2, 0, h);
  floorGrad.addColorStop(0, '#171f2f'); floorGrad.addColorStop(1, '#0a0e18');
  ctx.fillStyle = floorGrad; ctx.fillRect(0, h / 2, w, h / 2);

  const numCols = Math.max(90, Math.min(280, Math.floor(w / 3)));
  const colW = w / numCols;
  for (let i = 0; i < numCols; i++) {
    const rayAngle = ws.angle - ws.fov / 2 + (numCols > 1 ? (i / (numCols - 1)) * ws.fov : 0);
    const res = castRayDDA(ws.map, ws.x, ws.y, rayAngle);
    // Correct fisheye: project the raw ray length back onto the view axis
    const dist = Math.max(0.08, res.perpDist * Math.cos(rayAngle - ws.angle));
    const lineH = Math.min(h * 2.2, h / dist);
    const fog = Math.max(0.16, 1 - dist / 13);
    const base = res.side === 0 ? [92, 130, 255] : [64, 96, 220];
    ctx.fillStyle = `rgba(${base[0]},${base[1]},${base[2]},${fog.toFixed(2)})`;
    ctx.fillRect(i * colW, (h - lineH) / 2, colW + 1, lineH);
  }
}

/* Minimap in Walk Mode drives the live player state directly - no
   preview/commit split needed since the animation loop redraws every
   frame anyway. Click to teleport, drag to set facing direction. */
let walkMapDragging = false, walkMapStartX = 0, walkMapStartY = 0;
function bindWalkMapDrag() {
  const el = document.getElementById('w-map');
  if (!el) return;
  function toWorld(e) {
    const rect = el.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    const g = fitGrid(walkState.map, rect.width, rect.height, 6);
    return { x: (cx - g.ox) / g.cell, y: (cy - g.oy) / g.cell };
  }
  function begin(e) {
    if (!walkState) return;
    e.preventDefault();
    walkMapDragging = true;
    const { x, y } = toWorld(e);
    walkMapStartX = Math.min(walkState.map[0].length - 0.1, Math.max(0.1, x));
    walkMapStartY = Math.min(walkState.map.length - 0.1, Math.max(0.1, y));
    walkState.x = walkMapStartX; walkState.y = walkMapStartY;
  }
  function move(e) {
    if (!walkMapDragging || !walkState) return;
    e.preventDefault();
    const { x, y } = toWorld(e);
    const dx = x - walkMapStartX, dy = y - walkMapStartY;
    if (Math.hypot(dx, dy) > 0.15) walkState.angle = Math.atan2(dy, dx);
  }
  function end() { walkMapDragging = false; }
  el.addEventListener('mousedown', begin);
  el.addEventListener('touchstart', begin, { passive: false });
  document.addEventListener('mousemove', move);
  document.addEventListener('touchmove', move, { passive: false });
  document.addEventListener('mouseup', end);
  document.addEventListener('touchend', end);
}

function renderWalkMinimap(ws) {
  const p = prepCanvas('w-map'); if (!p) return;
  const { ctx, w, h } = p;
  clearScene(ctx, w, h);
  const g = fitGrid(ws.map, w, h, 6);
  drawGridCells(ctx, ws.map, g, true);

  const half = ws.fov / 2, reach = 6;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(g.ox + ws.x * g.cell, g.oy + ws.y * g.cell);
  ctx.lineTo(g.ox + (ws.x + Math.cos(ws.angle - half) * reach) * g.cell, g.oy + (ws.y + Math.sin(ws.angle - half) * reach) * g.cell);
  ctx.lineTo(g.ox + (ws.x + Math.cos(ws.angle + half) * reach) * g.cell, g.oy + (ws.y + Math.sin(ws.angle + half) * reach) * g.cell);
  ctx.closePath();
  ctx.fillStyle = 'rgba(92,130,255,.18)'; ctx.fill();
  ctx.restore();

  drawPlayer(ctx, ws.x, ws.y, ws.angle, g.ox, g.oy, g.cell, '#5c82ff');
}
