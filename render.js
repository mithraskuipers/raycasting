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
  const baseFont = { family: 'Inter, system-ui, sans-serif', size: 11, color: '#6a90aa' };
  const gridColor = 'rgba(26,45,68,.7)';
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
      plugins: { legend: { display: !!cfg.legend, labels: { color: '#a8c4dc', font: baseFont, boxWidth: 8 } } },
      scales: {
        x: { ticks: { color: '#6a90aa', font: baseFont, maxTicksLimit: 12 }, grid: { color: gridColor } },
        y: { min: cfg.yMin, max: cfg.yMax, ticks: { color: '#6a90aa', font: baseFont }, grid: { color: gridColor } }
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
function drawGridCells(ctx, map, g) {
  for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
    const isWall = map[r][c] === '#';
    ctx.fillStyle = isWall ? '#16283d' : '#0d1520';
    ctx.fillRect(g.ox + c * g.cell, g.oy + r * g.cell, g.cell, g.cell);
    ctx.strokeStyle = 'rgba(26,45,68,.55)';
    ctx.strokeRect(g.ox + c * g.cell, g.oy + r * g.cell, g.cell, g.cell);
  }
}
function highlightCell(ctx, c, r, g, color) {
  if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return;
  ctx.fillStyle = color;
  ctx.fillRect(g.ox + c * g.cell, g.oy + r * g.cell, g.cell, g.cell);
}
function drawPlayer(ctx, x, y, angle, ox, oy, cell, color) {
  color = color || '#00d4ff';
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
  ctx.fillStyle = color || '#a8c4dc';
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
    area.innerHTML = `<div class="scene-box tall"><canvas id="v-scene"></canvas></div>`;
  } else if (mode === 'dda') {
    area.innerHTML = `
      <div class="scene-grid">
        <div class="scene-box tall"><canvas id="d-grid"></canvas></div>
        <div class="chart-box"><h4>sideDistX vs sideDistY</h4><div class="chart-inner"><canvas id="d-side"></canvas></div></div>
      </div>`;
  } else if (mode === 'multiray') {
    area.innerHTML = `
      <div class="scene-grid" style="margin-bottom:12px">
        <div class="scene-box tall"><canvas id="m-top"></canvas></div>
        <div class="scene-box tall"><canvas id="m-3d"></canvas></div>
      </div>
      <div class="chart-box wide"><h4>Depth Buffer - corrected distance per ray</h4><div class="chart-inner"><canvas id="m-depth"></canvas></div></div>`;
  } else {
    area.innerHTML = `
      <div class="scene-box" style="margin-bottom:12px"><canvas id="p-top"></canvas></div>
      <div class="chart-grid cols-2" style="margin-bottom:12px">
        <div class="chart-box"><h4>Naive (Fisheye)</h4><div class="chart-inner"><canvas id="p-naive-3d"></canvas></div></div>
        <div class="chart-box"><h4>Corrected (Perpendicular)</h4><div class="chart-inner"><canvas id="p-corrected-3d"></canvas></div></div>
      </div>
      <div class="chart-box wide"><h4>Distance vs. Ray Angle</h4><div class="chart-inner"><canvas id="p-chart"></canvas></div></div>`;
  }
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
function renderVectorScene(s) {
  const p = prepCanvas('v-scene'); if (!p) return;
  const { ctx, w, h } = p;
  clearScene(ctx, w, h);
  const worldMax = 9, pad = 24;
  const scale = Math.min((w - 2 * pad) / worldMax, (h - 2 * pad) / worldMax);
  const ox = (w - worldMax * scale) / 2, oy = (h - worldMax * scale) / 2;
  const toPx = (x, y) => [ox + x * scale, oy + y * scale];

  ctx.strokeStyle = 'rgba(26,45,68,.5)'; ctx.lineWidth = 1;
  for (let i = 0; i <= worldMax; i++) {
    const gx = toPx(i, 0)[0];
    ctx.beginPath(); ctx.moveTo(gx, oy); ctx.lineTo(gx, oy + worldMax * scale); ctx.stroke();
    const gy = toPx(0, i)[1];
    ctx.beginPath(); ctx.moveTo(ox, gy); ctx.lineTo(ox + worldMax * scale, gy); ctx.stroke();
  }

  const reveal = cur;
  const [Ox, Oy] = toPx(s.O.x, s.O.y);
  const hit = s.hit, good = !!(hit && hit.valid);

  if (reveal >= 1) {
    const [ex, ey] = toPx(s.O.x + s.D.x * 8, s.O.y + s.D.y * 8);
    ctx.save(); ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#ffb830'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(Ox, Oy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.restore();
    label(ctx, 'D', ox + (s.O.x + s.D.x * 2) * scale + 6, oy + (s.O.y + s.D.y * 2) * scale, '#ffb830');
  }
  if (reveal >= 2) {
    const [ax, ay] = toPx(s.wall.ax, s.wall.ay);
    const [bx, by] = toPx(s.wall.bx, s.wall.by);
    ctx.strokeStyle = reveal >= 5 ? (good ? '#00e599' : '#ff4d6a') : '#a855f7';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    drawPoint(ctx, s.wall.ax, s.wall.ay, ox, oy, scale, '#a855f7', 4);
    drawPoint(ctx, s.wall.bx, s.wall.by, ox, oy, scale, '#a855f7', 4);
    label(ctx, 'A', ax + 6, ay - 6, '#a855f7'); label(ctx, 'B', bx + 6, by - 6, '#a855f7');
  }
  if (reveal >= 6 && good) {
    const [hx, hy] = toPx(hit.x, hit.y);
    ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(Ox, Oy); ctx.lineTo(hx, hy); ctx.stroke();
    drawPoint(ctx, hit.x, hit.y, ox, oy, scale, '#ff4d6a', 6);
    label(ctx, 'P (hit)', hx + 8, hy - 8, '#ff4d6a', 12);
  }
  if (reveal >= 7 && good) {
    const mx = (Ox + toPx(hit.x, hit.y)[0]) / 2, my = (Oy + toPx(hit.x, hit.y)[1]) / 2;
    ctx.fillStyle = '#0d1520'; ctx.fillRect(mx - 26, my - 18, 52, 16);
    label(ctx, 't = ' + hit.t.toFixed(2), mx - 20, my - 6, '#00e599', 12);
  }
  drawPoint(ctx, s.O.x, s.O.y, ox, oy, scale, '#00d4ff', 5);
  label(ctx, 'O', Ox - 14, Oy - 8, '#00d4ff', 12);
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
        highlightCell(ctx, it.mapX, it.mapY, g, it.isWall ? 'rgba(255,77,106,.25)' : 'rgba(0,212,255,.15)');
        drawRayLine(ctx, x0, y0, x1, y1, g.ox, g.oy, g.cell, it.isWall ? '#ff4d6a' : '#00d4ff', 2.2);
        x0 = x1; y0 = y1;
      }
      if (s.revealIdx === s.res.iterations.length) drawPoint(ctx, s.res.hitX, s.res.hitY, g.ox, g.oy, g.cell, '#ff4d6a', 6);
    } else if (cur >= 1) {
      drawRayLine(ctx, s.px, s.py, s.px + s.res.dirX * 2.4, s.py + s.res.dirY * 2.4, g.ox, g.oy, g.cell, '#ffb830', 2, [4, 3]);
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
    datasets: [{ data: [sdx, sdy], color: ['#00d4ff', '#ffb830'] }] });
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
      const fog = Math.max(0.25, 1 - r.dist / 10);
      const color = isLast ? '#ffb830' : `rgba(0,229,153,${fog.toFixed(2)})`;
      drawRayLine(ctx, s.px, s.py, x1, y1, g.ox, g.oy, g.cell, color, isLast ? 2.4 : 1);
    });
    drawPlayer(ctx, s.px, s.py, s.baseAngle, g.ox, g.oy, g.cell);
  }
  const p3 = prepCanvas('m-3d');
  if (p3) {
    const { ctx, w, h } = p3;
    clearScene(ctx, w, h);
    ctx.fillStyle = '#0a1220'; ctx.fillRect(0, 0, w, h);
    const n = s.castCount, total = s.rays.length;
    const colW = w / total;
    for (let i = 0; i < n; i++) {
      const r = s.rays[i];
      const heightFrac = Math.min(1, 2.6 / Math.max(r.dist, 0.3));
      const colH = heightFrac * h;
      const fog = Math.max(0.18, 1 - r.dist / 11);
      const base = r.side === 0 ? [0, 212, 255] : [0, 160, 205];
      ctx.fillStyle = `rgba(${base[0]},${base[1]},${base[2]},${fog.toFixed(2)})`;
      ctx.fillRect(i * colW, (h - colH) / 2, colW + 1, colH);
    }
  }
  const allLabels = s.rays.map((_, i) => i);
  const dat = s.rays.map((r, i) => (i < s.castCount ? r.dist : null));
  canvasChart('m-depth', { type: 'bar', labels: allLabels, legend: false,
    datasets: [{ data: dat, color: 'rgba(0,229,153,.65)' }] });
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

    ctx.strokeStyle = '#a855f7'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(ox, wallY); ctx.lineTo(ox + worldW * scale, wallY); ctx.stroke();
    label(ctx, 'wall', ox + 4, wallY - 6, '#a855f7');

    const edgeX = playerX + Math.tan(s.edgeDelta) * s.D0;
    const ex = ox + edgeX * scale;

    if (s.stage < 1) {
      ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px2, py2); ctx.lineTo(ox + playerX * scale, wallY); ctx.stroke();
    }
    if (s.stage >= 1) {
      ctx.strokeStyle = '#ff4d6a'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(px2, py2); ctx.lineTo(ex, wallY); ctx.stroke();
      label(ctx, 'naive', ex - 30, wallY - 8, '#ff4d6a');
    }
    if (s.stage >= 2) {
      ctx.save(); ctx.setLineDash([4, 3]);
      ctx.strokeStyle = '#00e599'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ex, wallY); ctx.lineTo(ex, py2); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = '#00e599'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(px2, py2); ctx.lineTo(ox + playerX * scale, wallY); ctx.stroke();
      label(ctx, 'corrected', ox + playerX * scale + 6, wallY + 14, '#00e599');
    }
    drawPoint(ctx, playerX, playerY, ox, oy, scale, '#00d4ff', 5);
  }

  const showCompare = s.stage >= 5;
  ['p-naive-3d', 'p-corrected-3d'].forEach((id, which) => {
    const p = prepCanvas(id); if (!p) return;
    const { ctx, w, h } = p;
    clearScene(ctx, w, h);
    ctx.fillStyle = '#0a1220'; ctx.fillRect(0, 0, w, h);
    if (!showCompare) return;
    const arr = which === 0 ? s.naive : s.corrected;
    const colW = w / arr.length;
    arr.forEach((d, i) => {
      const hh = Math.min(1, (s.D0 * 2.5) / Math.max(d, 0.3)) * h;
      ctx.fillStyle = which === 0 ? 'rgba(255,77,106,.55)' : 'rgba(0,229,153,.6)';
      ctx.fillRect(i * colW, (h - hh) / 2, colW + 1, hh);
    });
  });

  if (s.stage >= 1) {
    canvasChart('p-chart', {
      type: 'line', legend: true,
      labels: s.deltas.map(d => (d * 180 / Math.PI).toFixed(0) + '°'),
      datasets: [
        { label: 'Naive distance', data: s.naive, color: '#ff4d6a', width: 2, dots: false },
        { label: 'Corrected distance', data: s.corrected, color: '#00e599', width: 2, dots: false }
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
  skyGrad.addColorStop(0, '#0a1220'); skyGrad.addColorStop(1, '#0d1c2c');
  ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, w, h / 2);
  const floorGrad = ctx.createLinearGradient(0, h / 2, 0, h);
  floorGrad.addColorStop(0, '#101c14'); floorGrad.addColorStop(1, '#070d0a');
  ctx.fillStyle = floorGrad; ctx.fillRect(0, h / 2, w, h / 2);

  const numCols = Math.max(90, Math.min(280, Math.floor(w / 3)));
  const colW = w / numCols;
  for (let i = 0; i < numCols; i++) {
    const rayAngle = ws.angle - ws.fov / 2 + (numCols > 1 ? (i / (numCols - 1)) * ws.fov : 0);
    const res = castRayDDA(ws.map, ws.x, ws.y, rayAngle);
    // Correct fisheye: project the raw ray length back onto the view axis
    const dist = Math.max(0.08, res.perpDist * Math.cos(rayAngle - ws.angle));
    const lineH = Math.min(h * 2.2, h / dist);
    const fog = Math.max(0.12, 1 - dist / 13);
    const base = res.side === 0 ? [0, 212, 255] : [0, 152, 196];
    ctx.fillStyle = `rgba(${base[0]},${base[1]},${base[2]},${fog.toFixed(2)})`;
    ctx.fillRect(i * colW, (h - lineH) / 2, colW + 1, lineH);
  }
}

function renderWalkMinimap(ws) {
  const p = prepCanvas('w-map'); if (!p) return;
  const { ctx, w, h } = p;
  clearScene(ctx, w, h);
  const g = fitGrid(ws.map, w, h, 6);
  drawGridCells(ctx, ws.map, g);

  const half = ws.fov / 2, reach = 6;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(g.ox + ws.x * g.cell, g.oy + ws.y * g.cell);
  ctx.lineTo(g.ox + (ws.x + Math.cos(ws.angle - half) * reach) * g.cell, g.oy + (ws.y + Math.sin(ws.angle - half) * reach) * g.cell);
  ctx.lineTo(g.ox + (ws.x + Math.cos(ws.angle + half) * reach) * g.cell, g.oy + (ws.y + Math.sin(ws.angle + half) * reach) * g.cell);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,212,255,.12)'; ctx.fill();
  ctx.restore();

  drawPlayer(ctx, ws.x, ws.y, ws.angle, g.ox, g.oy, g.cell, '#00d4ff');
}
