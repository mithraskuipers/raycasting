/* ================================================
   UI CONTROLLER
   Globals, DOM rendering, navigation, playback,
   and app initialisation.
   Load order: data-builders.js → render.js → ui.js
   ================================================ */

let mode = 'vector', cur = 0, total = 0, stepsData = [], playing = false, playTimer = null;
const charts = {};
const MODES = ['vector', 'dda', 'multiray', 'projection'];

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
    return `<td>${i}</td><td style="color:#00d4ff">${s.title || ''}</td><td style="color:#a8c4dc;font-size:12px">${details}</td>`;
  } else if (mode === 'dda') {
    if (s.revealIdx === undefined || s.revealIdx < 0)
      return `<td>${i}</td><td colspan="4" style="color:#6a90aa">${s.title || 'setup'}</td>`;
    if (s.revealIdx === s.res.iterations.length)
      return `<td>${i}</td><td colspan="3" style="color:#00e599">Final perpDist = ${s.res.perpDist.toFixed(3)}</td><td>—</td>`;
    const it = s.res.iterations[s.revealIdx];
    return `<td>${i}</td><td style="color:#a855f7">(${it.mapX}, ${it.mapY})</td><td style="color:${it.axis === 'X' ? '#00d4ff' : '#ffb830'}">${it.axis}</td><td style="color:#00e599">${it.t.toFixed(3)}</td><td style="color:${it.isWall ? '#ff4d6a' : '#a8c4dc'}">${it.isWall ? 'Yes' : 'No'}</td>`;
  } else if (mode === 'multiray') {
    if (i === 0) return `<td>—</td><td colspan="3" style="color:#6a90aa">Setup: ${s.title}</td>`;
    const r = s.rays[i - 1];
    return `<td>${i}</td><td style="color:#ffb830">${(r.angle * 180 / Math.PI).toFixed(1)}°</td><td style="color:#00e599">${r.dist.toFixed(2)}</td><td style="color:#00d4ff">${r.side === 0 ? 'X' : 'Y'}</td>`;
  } else {
    return `<td>${i}</td><td style="color:#ffb830">${(s.edgeDelta * 180 / Math.PI).toFixed(1)}°</td><td style="color:#ff4d6a">${s.edgeNaive.toFixed(2)}</td><td style="color:#00e599">${s.edgeCorrected.toFixed(2)}</td>`;
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
    badge.style.background = 'rgba(255,77,106,.15)'; badge.style.color = 'var(--red)'; badge.style.borderColor = 'var(--red)';
  } else {
    badge.style.background = 'rgba(0,212,255,.12)'; badge.style.color = 'var(--accent)'; badge.style.borderColor = 'var(--accent)';
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
  mode = m;
  document.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', MODES[i] === m));
  document.querySelectorAll('.sc').forEach(el => el.classList.remove('active'));
  document.getElementById('sc-' + m).classList.add('active');
  resetAll();
}

function resetAll() {
  stopPlay(); cur = 0;
  document.getElementById('tBody').innerHTML = '';
  if (mode === 'vector') {
    stepsData = buildVectorBasics(gv('vec-wall'), gc('vec-angle'));
  } else if (mode === 'dda') {
    stepsData = buildDDA(gv('dda-map'), gc('dda-angle'));
  } else if (mode === 'multiray') {
    stepsData = buildMultiRay(gv('mr-map'), gc('mr-fov'), gc('mr-rays'), gc('mr-angle'));
  } else {
    stepsData = buildProjection(gc('proj-fov'), gc('proj-dist'), gc('proj-cols'));
  }
  total = stepsData.length - 1;
  setupCharts(); buildTableHead(); updateUI();
}

/* ------------------------------------------------
   Keyboard shortcuts
   ------------------------------------------------ */
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === '.') nextStep();
  if (e.key === ',') prevStep();
  if (e.key === ' ') { e.preventDefault(); togglePlay(); }
});

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
