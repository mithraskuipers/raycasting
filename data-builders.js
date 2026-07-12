/* ------------------------------------------------
   Maps - grids of '#' (wall) and '.' (open floor)
   ------------------------------------------------ */
const MAPS = {
  simple: [
    "##########",
    "#........#",
    "#..##....#",
    "#..#.....#",
    "#........#",
    "#.....##.#",
    "#.....#..#",
    "#........#",
    "#........#",
    "##########"
  ],
  maze: [
    "##########",
    "#..#.....#",
    "#..#.###.#",
    "#..#...#.#",
    "#.####.#.#",
    "#......#.#",
    "#.####.#.#",
    "#......#.#",
    "#.######.#",
    "##########"
  ]
};

/* ------------------------------------------------
   Ray vs. line-segment intersection (2D cross-
   product / Cramer's-rule method). O,D define the
   ray; A,B define the wall segment.
   ------------------------------------------------ */
function raySegmentIntersect(ox, oy, dx, dy, ax, ay, bx, by) {
  const sx = bx - ax, sy = by - ay;
  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((ax - ox) * sy - (ay - oy) * sx) / denom;
  const s = ((ax - ox) * dy - (ay - oy) * dx) / denom;
  return { t, s, denom, x: ox + dx * t, y: oy + dy * t, valid: t >= 0 && s >= 0 && s <= 1 };
}

/* ------------------------------------------------
   DDA grid-traversal ray cast (Lodev-style).
   Steps through grid cells axis-by-axis until a
   wall cell is hit. The final crossing distance
   `t` is *already* the corrected perpendicular
   distance - no separate fisheye fix is needed
   because we measured along grid axes, not the
   raw diagonal ray length.
   ------------------------------------------------ */
function castRayDDA(map, px, py, angle) {
  const rows = map.length, cols = map[0].length;
  const dirX = Math.cos(angle), dirY = Math.sin(angle);
  let mapX = Math.floor(px), mapY = Math.floor(py);
  const deltaDistX = dirX === 0 ? 1e30 : Math.abs(1 / dirX);
  const deltaDistY = dirY === 0 ? 1e30 : Math.abs(1 / dirY);
  let stepX, stepY, sideDistX, sideDistY;
  if (dirX < 0) { stepX = -1; sideDistX = (px - mapX) * deltaDistX; }
  else { stepX = 1; sideDistX = (mapX + 1 - px) * deltaDistX; }
  if (dirY < 0) { stepY = -1; sideDistY = (py - mapY) * deltaDistY; }
  else { stepY = 1; sideDistY = (mapY + 1 - py) * deltaDistY; }
  const sideDistX0 = sideDistX, sideDistY0 = sideDistY;

  const iterations = [];
  let hit = false, guard = 0;
  while (!hit && guard < 80) {
    guard++;
    let t, axis, side;
    if (sideDistX < sideDistY) { t = sideDistX; axis = 'X'; side = 0; sideDistX += deltaDistX; mapX += stepX; }
    else { t = sideDistY; axis = 'Y'; side = 1; sideDistY += deltaDistY; mapY += stepY; }
    const outOfBounds = mapX < 0 || mapX >= cols || mapY < 0 || mapY >= rows;
    const isWall = !outOfBounds && map[mapY][mapX] === '#';
    iterations.push({ t, mapX, mapY, axis, side, sideDistX, sideDistY, isWall, outOfBounds });
    if (isWall || outOfBounds) hit = true;
  }
  const last = iterations[iterations.length - 1];
  const perpDist = last.t;
  const hitX = px + dirX * perpDist, hitY = py + dirY * perpDist;
  return {
    px, py, angle, dirX, dirY, deltaDistX, deltaDistY, stepX, stepY,
    sideDistX0, sideDistY0, iterations,
    mapX: last.mapX, mapY: last.mapY, side: last.side,
    perpDist, hitX, hitY
  };
}

/* ------------------------------------------------
   MODE 1 - Vector basics: a single ray meeting a
   single wall segment, solved algebraically.
   ------------------------------------------------ */
const WALL_PRESETS = {
  vertical:   { ax: 6, ay: 1,   bx: 6,   by: 7 },
  horizontal: { ax: 1, ay: 6.5, bx: 7,   by: 6.5 },
  diagonal:   { ax: 2, ay: 7.5, bx: 7.5, by: 2 }
};
const WALL_ORIGINS = {
  vertical:   { x: 1.5, y: 4 },
  horizontal: { x: 1.5, y: 1.5 },
  diagonal:   { x: 1.2, y: 1.2 }
};

function buildVectorBasics(wallKey, angleDeg) {
  const O = WALL_ORIGINS[wallKey] || WALL_ORIGINS.vertical;
  const wall = WALL_PRESETS[wallKey] || WALL_PRESETS.vertical;
  const angle = angleDeg * Math.PI / 180;
  const D = { x: Math.cos(angle), y: Math.sin(angle) };
  const hit = raySegmentIntersect(O.x, O.y, D.x, D.y, wall.ax, wall.ay, wall.bx, wall.by);
  const good = !!(hit && hit.valid);
  const steps = [];
  const push = (title, formula, explain, chips) => steps.push({ title, formula, explain, chips, O, D, wall, hit, angleDeg });

  push('The Ray Equation',
    `<span class="ac">P(t)</span> = <span class="ac">O</span> + t·<span class="gd">D</span>`,
    `Every ray starts at an origin point <b>O</b> and travels outward. As the parameter t grows from 0, the point P(t) slides further along the ray. This one line is the foundation of everything that follows.`,
    [['Origin O', `(${O.x}, ${O.y})`, 'c-s']]);

  push('Direction Vector',
    `<span class="gd">D</span> = (cos θ, sin θ) = (${D.x.toFixed(3)}, ${D.y.toFixed(3)})`,
    `The direction vector D is built straight from the ray's angle, θ = ${angleDeg}°. Because cos²θ + sin²θ = 1, D is automatically a <em>unit vector</em> - length exactly 1 - which is what lets t double as a real distance later on.`,
    [['θ', angleDeg + '°', 'c-a'], ['|D|', '1.000', 'c-a']]);

  push('The Wall Segment',
    `Wall: <span class="pu">A</span> + s·(<span class="pu">B</span> − <span class="pu">A</span>), &nbsp; s ∈ [0,1]`,
    `The wall is a segment between two fixed endpoints. Any point on it is written with its own parameter s: s=0 is A, s=1 is B, and everything between is a blend of the two.`,
    [['A', `(${wall.ax}, ${wall.ay})`, 'c-q'], ['B', `(${wall.bx}, ${wall.by})`, 'c-q']]);

  push('Setting Up the System',
    `O + t·D &nbsp;=&nbsp; A + s·(B − A)`,
    `A true hit point has to satisfy <em>both</em> equations at once - on the ray, and on the segment. Splitting into x and y gives two linear equations with two unknowns: t and s.`,
    [['Unknowns', 't, s', 'c-q']]);

  push('Solving with Cramer’s Rule',
    `t = [(A−O)×S] / [D×S] &nbsp;&nbsp; s = [(A−O)×D] / [D×S]`,
    `Using 2D cross products, the system solves cleanly. Denominator (D×S) = ${hit ? hit.denom.toFixed(3) : '—'}. Plugging in the numbers: t = ${hit ? hit.t.toFixed(3) : '—'}, s = ${hit ? hit.s.toFixed(3) : '—'}.`,
    [['t', hit ? hit.t.toFixed(3) : '—', 'c-r'], ['s', hit ? hit.s.toFixed(3) : '—', 'c-r']]);

  push('Checking Validity',
    `t ≥ 0 &nbsp;<b>and</b>&nbsp; 0 ≤ s ≤ 1`,
    good
      ? `Both conditions hold - the ray truly reaches the segment, not just the infinite line it sits on.`
      : `The check fails here - at this angle, the ray's infinite line crosses the wall's infinite line <em>outside</em> the actual segment (or behind the origin). No real collision.`,
    [['t ≥ 0', hit && hit.t >= 0 ? '✓ true' : '✗ false', hit && hit.t >= 0 ? 'c-r' : 'c-red'],
     ['0≤s≤1', hit && hit.s >= 0 && hit.s <= 1 ? '✓ true' : '✗ false', hit && hit.s >= 0 && hit.s <= 1 ? 'c-r' : 'c-red']]);

  push('The Hit Point',
    `P = O + t·D`,
    good
      ? `Substituting the solved t back into the ray equation gives the exact coordinate P = (${hit.x.toFixed(2)}, ${hit.y.toFixed(2)}) where the ray meets the wall.`
      : `The two infinite lines still cross mathematically at (${hit ? hit.x.toFixed(2) : '—'}, ${hit ? hit.y.toFixed(2) : '—'}), but since it failed the validity check, this is <b>not</b> a real hit. Try a different angle.`,
    [['Hit point', hit ? `(${hit.x.toFixed(2)}, ${hit.y.toFixed(2)})` : '—', good ? 'c-red' : 'c-q']]);

  push('Distance to the Wall',
    `distance = t · |D| = t`,
    good
      ? `Because D was a unit vector, t <em>is</em> the distance in world units - no square root required. This exact value is what a raycasting engine uses to size the wall on screen.`
      : `There's no real hit, so "distance" isn't meaningful here - nudge the angle slider until the validity check passes.`,
    [['Distance', good ? hit.t.toFixed(3) : '—', 'c-e']]);

  return steps;
}

/* ------------------------------------------------
   MODE 2 - DDA grid traversal, one ray, step by
   step through the algorithm.
   ------------------------------------------------ */
function buildDDA(mapKey, angleDeg) {
  const map = MAPS[mapKey] || MAPS.simple;
  const px = 1.5, py = 1.5;
  const angle = angleDeg * Math.PI / 180;
  const res = castRayDDA(map, px, py, angle);
  const steps = [];
  const push = (title, formula, explain, chips, revealIdx) =>
    steps.push({ title, formula, explain, chips, map, px, py, angle, res, revealIdx });

  push('The Grid',
    `map[y][x] ∈ { open, wall }`,
    `Raycasting engines represent the world as a grid of cells rather than raw geometry. Instead of testing every wall's shape, we walk cell-by-cell along the ray until we land on a wall cell. This walk is the <b>DDA</b> algorithm (Digital Differential Analyzer).`,
    [['Grid size', `${map[0].length}×${map.length}`, 'c-s'], ['Player', `(${px}, ${py})`, 'c-s']], -1);

  push('Step Size per Axis',
    `Δx = |1/dirX| = ${res.deltaDistX.toFixed(3)} &nbsp;&nbsp; Δy = |1/dirY| = ${res.deltaDistY.toFixed(3)}`,
    `Δx is how far along the ray (in ray-length units) it takes to cross one full grid cell horizontally; Δy is the same, vertically. A steep ray has a small Δx and a large Δy, and vice versa.`,
    [['dirX', res.dirX.toFixed(3), 'c-a'], ['dirY', res.dirY.toFixed(3), 'c-a']], -1);

  push('Initial Side Distances',
    `sideDistX₀ = ${res.sideDistX0.toFixed(3)} &nbsp;&nbsp; sideDistY₀ = ${res.sideDistY0.toFixed(3)}`,
    `Before stepping, we measure the distance to the <em>nearest</em> vertical grid line and the nearest horizontal grid line from the player's exact position. Whichever is smaller gets crossed first.`,
    [['stepX', res.stepX > 0 ? '+1' : '-1', 'c-q'], ['stepY', res.stepY > 0 ? '+1' : '-1', 'c-q']], -1);

  res.iterations.forEach((it, i) => {
    push(`DDA Step ${i + 1}: cross a ${it.axis === 'X' ? 'vertical' : 'horizontal'} line`,
      `${it.axis === 'X' ? 'sideDistX' : 'sideDistY'} = ${it.t.toFixed(3)} &nbsp;→&nbsp; step into cell (${it.mapX}, ${it.mapY})`,
      it.isWall
        ? `Cell (${it.mapX}, ${it.mapY}) is a <b>wall</b> - the ray stops. We crossed on the ${it.axis} axis, so side = ${it.side} (used to shade the wall differently on screen).`
        : `Cell (${it.mapX}, ${it.mapY}) is open - the ray keeps travelling. We compare sideDistX and sideDistY again to see which grid line is crossed next.`,
      [['Axis', it.axis, it.axis === 'X' ? 'c-a' : 'c-e'], ['Cell', `(${it.mapX}, ${it.mapY})`, 'c-q'],
       ['t so far', it.t.toFixed(3), 'c-r'], ['Hit?', it.isWall ? 'Yes' : 'No', it.isWall ? 'c-red' : 'c-s']],
      i);
  });

  push('Perpendicular Distance',
    `perpDist = t = ${res.perpDist.toFixed(3)}`,
    `The last crossing distance <b>is already</b> the corrected, non-fisheye distance - because we measured it along the grid axes instead of the raw diagonal ray length. This single number decides how tall the wall is drawn.`,
    [['perpDist', res.perpDist.toFixed(3), 'c-e'], ['side', res.side === 0 ? 'X' : 'Y', 'c-q']],
    res.iterations.length);

  return steps;
}

/* ------------------------------------------------
   MODE 3 - Multi-ray top-down casting: sweep a
   full field of view, one ray per screen column.
   ------------------------------------------------ */
function buildMultiRay(mapKey, fovDeg, rayCount, angleDeg) {
  const map = MAPS[mapKey] || MAPS.simple;
  const px = 2.5, py = 2.5;
  const baseAngle = angleDeg * Math.PI / 180;
  const fov = fovDeg * Math.PI / 180;
  const rays = [];
  for (let i = 0; i < rayCount; i++) {
    const a = rayCount > 1 ? baseAngle - fov / 2 + i * (fov / (rayCount - 1)) : baseAngle;
    const res = castRayDDA(map, px, py, a);
    rays.push({ angle: a, dist: res.perpDist, side: res.side, hitX: res.hitX, hitY: res.hitY });
  }
  const steps = [];
  steps.push({
    title: 'Setting Up the Camera',
    formula: `FOV = ${fovDeg}°, &nbsp; rays = ${rayCount}`,
    explain: `We'll sweep ${rayCount} rays evenly across a ${fovDeg}° field of view, one per screen column. Each ray runs the same DDA algorithm from the previous tab, completely independently.`,
    chips: [['Player', `(${px}, ${py})`, 'c-s'], ['Facing', angleDeg + '°', 'c-a'], ['FOV', fovDeg + '°', 'c-q']],
    map, px, py, baseAngle, fov, rays, castCount: 0
  });
  for (let i = 0; i < rayCount; i++) {
    const r = rays[i];
    steps.push({
      title: `Casting Ray ${i + 1} / ${rayCount}`,
      formula: `θ<sub>${i}</sub> = facing − FOV/2 + ${i}·(FOV/${rayCount - 1}) = ${(r.angle * 180 / Math.PI).toFixed(1)}°`,
      explain: `This ray lands on the ${r.side === 0 ? 'X-side (vertical face)' : 'Y-side (horizontal face)'} of a wall, corrected distance ${r.dist.toFixed(2)}. Closer walls get drawn taller - that mapping is the subject of the Projection tab.`,
      chips: [['Ray #', i + 1, 'c-s'], ['Angle', (r.angle * 180 / Math.PI).toFixed(1) + '°', 'c-a'],
               ['Distance', r.dist.toFixed(2), 'c-r'], ['Side', r.side === 0 ? 'X' : 'Y', 'c-q']],
      map, px, py, baseAngle, fov, rays, castCount: i + 1
    });
  }
  return steps;
}

/* ------------------------------------------------
   MODE 4 - 3D projection & the fisheye fix, using
   a synthetic flat wall straight ahead so the
   distortion is crystal clear.
   ------------------------------------------------ */
function buildProjection(fovDeg, D0, cols) {
  const fov = fovDeg * Math.PI / 180;
  const deltas = [];
  for (let i = 0; i < cols; i++) deltas.push(cols > 1 ? -fov / 2 + i * (fov / (cols - 1)) : 0);
  const naive = deltas.map(d => D0 / Math.cos(d));
  const corrected = naive.map((n, i) => n * Math.cos(deltas[i]));
  const screenW = 320;
  const projPlaneDist = (screenW / 2) / Math.tan(fov / 2);
  const edgeDelta = fov / 2;
  const edgeNaive = D0 / Math.cos(edgeDelta);
  const edgeCorrected = edgeNaive * Math.cos(edgeDelta);

  const common = { fov, fovDeg, D0, cols, deltas, naive, corrected, screenW, projPlaneDist, edgeDelta, edgeNaive, edgeCorrected };
  const steps = [];

  steps.push({ title: 'The Fisheye Problem',
    formula: `raw ray length ≠ true distance to a flat wall`,
    explain: `Picture a perfectly flat wall straight ahead. A ray fired at an angle δ off-center has to travel <em>farther</em> in a straight line to reach that same flat wall than the ray fired dead-center - pure geometry, not because the wall is actually farther away. Left uncorrected, the rendered wall bulges like it's seen through a fisheye lens.`,
    chips: [['Wall dist (center)', D0, 'c-s'], ['FOV', fovDeg + '°', 'c-q']], ...common, stage: 0 });

  steps.push({ title: 'Naive (Euclidean) Distance',
    formula: `naive(δ) = D₀ / cos(δ)`,
    explain: `At the edge of the FOV, δ = ${(edgeDelta * 180 / Math.PI).toFixed(1)}°, so the raw ray length is D₀/cos(δ) = ${edgeNaive.toFixed(2)} - longer than the ${D0} straight ahead, even though the wall is equally far away in any meaningful sense.`,
    chips: [['δ (edge)', (edgeDelta * 180 / Math.PI).toFixed(1) + '°', 'c-a'], ['naive dist', edgeNaive.toFixed(2), 'c-red']],
    ...common, stage: 1 });

  steps.push({ title: 'Corrected (Perpendicular) Distance',
    formula: `corrected(δ) = naive(δ) · cos(δ) = D₀`,
    explain: `Multiplying back by cos(δ) projects the ray length onto the player's forward axis, exactly cancelling the distortion. The result is constant - D₀ - for every column, which is correct: the wall really is flat.`,
    chips: [['corrected dist', edgeCorrected.toFixed(2), 'c-e'], ['constant?', 'Yes - always D₀', 'c-s']],
    ...common, stage: 2 });

  steps.push({ title: 'Wall Height on Screen',
    formula: `lineHeight = (wallHeight · projPlaneDist) / distance`,
    explain: `Screen-space wall height is inversely proportional to distance - twice as far means half as tall. wallHeight is a tile's real-world height (usually 1); distance must always be the <em>corrected</em> value, never the naive one.`,
    chips: [['wallHeight', 1, 'c-q'], ['uses', 'corrected dist', 'c-e']], ...common, stage: 3 });

  steps.push({ title: 'Projection Plane Distance',
    formula: `projPlaneDist = (screenWidth / 2) / tan(FOV/2)`,
    explain: `This constant turns the abstract "1 unit away = 1 unit tall" scale into real screen pixels, based on screen width and field of view. For a ${screenW}px view at ${fovDeg}° FOV, projPlaneDist ≈ ${projPlaneDist.toFixed(1)}px.`,
    chips: [['screenWidth', screenW + 'px', 'c-s'], ['projPlaneDist', projPlaneDist.toFixed(1) + 'px', 'c-e']],
    ...common, stage: 4 });

  steps.push({ title: 'Side-by-Side Comparison',
    formula: `height(δ) ∝ 1 / distance(δ)`,
    explain: `Rendering the flat wall with naive distances produces a bowed, fisheye-warped silhouette. Rendering it with corrected distances produces a perfectly flat wall - exactly what we'd actually expect to see.`,
    chips: [['Naive', 'bowed / curved', 'c-red'], ['Corrected', 'flat / straight', 'c-e']], ...common, stage: 5 });

  steps.push({ title: 'Putting It Together',
    formula: `for each column: cast ray → DDA perpDist → lineHeight = k / perpDist`,
    explain: `This is the full pipeline used by classic raycasting engines: one DDA ray per screen column, a corrected distance, then a simple inverse-distance height formula - fast enough to run in real time on decades-old hardware.`,
    chips: [['Columns', cols, 'c-s'], ['Pipeline', 'ray → DDA → height', 'c-e']], ...common, stage: 6 });

  return steps;
}
