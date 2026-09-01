import './style.css';
import { QuantumRenderer } from './renderer';

const SIZE = 161;
const CELLS = SIZE * SIZE;
const HALF = (SIZE - 1) / 2;
const TAU = Math.PI * 2;
const INV_SQRT_2 = Math.SQRT1_2;
const STEP_MS = 185;
const FRAME_MS = 1000 / 60;
const MAX_FILAMENTS = 360;
const MAX_BLOOMS = 24;
const BLOOM_PROBABILITY_FLOOR = 0.01;
const BLOOM_MEMORY_THRESHOLD = 0.15;
const BLOOM_PERSISTENCE_STEPS = 3;
const BLOOM_MEMORY_RETENTION = 0.88;
const BLOOM_MEMORY_INPUT = 0.12;
const BLOOM_SPATIAL_RADIUS = 14;
const BLOOM_MIN_DISTANCE = 8;
const BLOOMS_PER_STEP = 2;

type Field = {
  ar: Float32Array;
  ai: Float32Array;
  br: Float32Array;
  bi: Float32Array;
};

type Filament = {
  x: number;
  y: number;
  px: number;
  py: number;
  age: number;
  life: number;
  phase: number;
};

type Bloom = {
  x: number;
  y: number;
  born: number;
  life: number;
  radius: number;
  phase: number;
  petals: number;
};

type Cavity = { x: number; y: number; strength: number };

type PointerMemory = {
  x: number;
  y: number;
  px: number;
  py: number;
  moved: number;
  phase: number;
  downAt: number;
  longPress: number;
};

const canvas = document.querySelector<HTMLCanvasElement>('#art')!;
const renderer = new QuantumRenderer(canvas, SIZE);

const makeField = (): Field => ({
  ar: new Float32Array(CELLS),
  ai: new Float32Array(CELLS),
  br: new Float32Array(CELLS),
  bi: new Float32Array(CELLS),
});

let state = makeField();
let xShifted = makeField();
let next = makeField();
const phaseField = new Float32Array(CELLS);
const phaseMemory = new Float32Array(CELLS);
const probability = new Float32Array(CELLS);
const previousProbability = new Float32Array(CELLS);
const stepInterference = new Float32Array(CELLS);
const interferenceStrength = new Float32Array(CELLS);
const interferenceMemory = new Float32Array(CELLS);
const interferencePersistence = new Uint8Array(CELLS);
const fieldPixels = new Uint8Array(CELLS * 4);
const filaments: Filament[] = [];
const blooms: Bloom[] = [];
const cavities: Cavity[] = [];
const pointers = new Map<number, PointerMemory>();

let width = 1;
let height = 1;
let dpr = 1;
let exposure = 1;
let stepCount = 0;
let simulationTime = 0;
let renderRequested = true;
let interferencePulse = 0;
let norm = 1;
let muted = false;
let hasQuantumState = false;
let seedCount = 0;
let stepAccumulator = 0;
let renderAccumulator = 0;
let lastFrameTime: number | null = null;

const idx = (x: number, y: number) => y * SIZE + x;
const wrap = (value: number) => (value + SIZE) % SIZE;

function clearField(target: Field) {
  target.ar.fill(0);
  target.ai.fill(0);
  target.br.fill(0);
  target.bi.fill(0);
}

function probabilityAt(i: number) {
  return state.ar[i] ** 2 + state.ai[i] ** 2 + state.br[i] ** 2 + state.bi[i] ** 2;
}

function relativePhaseAt(i: number) {
  const re = state.ar[i] * state.br[i] + state.ai[i] * state.bi[i];
  const im = state.ai[i] * state.br[i] - state.ar[i] * state.bi[i];
  return Math.atan2(im, re);
}

function normalize() {
  let total = 0;
  for (let i = 0; i < CELLS; i++) total += probabilityAt(i);
  if (total < 1e-10 || !Number.isFinite(total)) return false;
  const scale = 1 / Math.sqrt(total);
  for (let i = 0; i < CELLS; i++) {
    state.ar[i] *= scale;
    state.ai[i] *= scale;
    state.br[i] *= scale;
    state.bi[i] *= scale;
  }
  norm = 1;
  return true;
}

function seed(gx: number, gy: number, phase: number, sonic = true) {
  const radius = 2.1;
  const spread = 5;
  const seedFalloff = (ox: number, oy: number) => (
    Math.exp(-(ox * ox + oy * oy) / (radius * radius))
  );
  const coinRe = Math.cos(phase) * INV_SQRT_2;
  const coinIm = Math.sin(phase) * INV_SQRT_2;
  let seedNormSquared = 0;
  for (let oy = -spread; oy <= spread; oy++) {
    for (let ox = -spread; ox <= spread; ox++) {
      const falloff = seedFalloff(ox, oy);
      seedNormSquared += falloff * falloff;
    }
  }
  const nextSeedCount = seedCount + 1;
  const existingWeight = seedCount === 0 ? 0 : Math.sqrt(seedCount / nextSeedCount);
  const newSeedWeight = 1 / Math.sqrt(nextSeedCount * seedNormSquared);
  for (let i = 0; i < CELLS; i++) {
    state.ar[i] *= existingWeight;
    state.ai[i] *= existingWeight;
    state.br[i] *= existingWeight;
    state.bi[i] *= existingWeight;
  }
  for (let oy = -spread; oy <= spread; oy++) {
    for (let ox = -spread; ox <= spread; ox++) {
      const x = wrap(Math.round(gx + ox));
      const y = wrap(Math.round(gy + oy));
      const falloff = seedFalloff(ox, oy);
      const i = idx(x, y);
      state.ar[i] += falloff * newSeedWeight * INV_SQRT_2;
      state.br[i] += falloff * newSeedWeight * coinRe;
      state.bi[i] += falloff * newSeedWeight * coinIm;
    }
  }
  if (!normalize()) return;
  seedCount = nextSeedCount;
  hasQuantumState = true;
  renderer.clearFeedback();
  renderRequested = true;
  if (sonic) audio?.strike(phase);
}

function resetGarden() {
  clearField(state);
  clearField(xShifted);
  clearField(next);
  phaseField.fill(0);
  phaseMemory.fill(0);
  probability.fill(0);
  previousProbability.fill(0);
  stepInterference.fill(0);
  interferenceStrength.fill(0);
  interferenceMemory.fill(0);
  interferencePersistence.fill(0);
  filaments.length = 0;
  blooms.length = 0;
  cavities.length = 0;
  stepCount = 0;
  simulationTime = 0;
  norm = 0;
  exposure = 1;
  interferencePulse = 0;
  hasQuantumState = false;
  seedCount = 0;
  stepAccumulator = 0;
  renderAccumulator = 0;
  lastFrameTime = null;
  cancelPointers();
  renderer.clearFeedback();
  renderRequested = true;
}

function paintPhase(gx: number, gy: number, amount: number, radius = 9) {
  const r = Math.ceil(radius * 2);
  for (let oy = -r; oy <= r; oy++) {
    for (let ox = -r; ox <= r; ox++) {
      const influence = Math.exp(-(ox * ox + oy * oy) / (radius * radius));
      const i = idx(wrap(Math.round(gx + ox)), wrap(Math.round(gy + oy)));
      phaseMemory[i] = Math.max(-Math.PI, Math.min(Math.PI, phaseMemory[i] + amount * influence));
    }
  }
}

function applyPhase(target: Field) {
  for (let i = 0; i < CELLS; i++) {
    phaseField[i] += (phaseMemory[i] - phaseField[i]) * 0.035;
    phaseMemory[i] *= 0.99925;
    const x = i % SIZE;
    const y = Math.floor(i / SIZE);
    const dx = x - HALF;
    const dy = y - HALF;
    const baselinePhase = (
      0.42 * Math.sin(dx * 0.38)
      + 0.32 * Math.cos(dy * 0.31 + stepCount * 0.12)
    );
    const phase = phaseField[i] + baselinePhase;
    if (Math.abs(phase) < 0.00001) continue;
    const c = Math.cos(phase);
    const s = Math.sin(phase);
    const ar = target.ar[i];
    const ai = target.ai[i];
    const br = target.br[i];
    const bi = target.bi[i];
    target.ar[i] = ar * c - ai * s;
    target.ai[i] = ar * s + ai * c;
    target.br[i] = br * c + bi * s;
    target.bi[i] = -br * s + bi * c;
  }
}

function applyCoin(target: Field) {
  for (let i = 0; i < CELLS; i++) {
    const ar = target.ar[i];
    const ai = target.ai[i];
    const br = target.br[i];
    const bi = target.bi[i];
    stepInterference[i] += Math.abs(2 * (ar * br + ai * bi));
    target.ar[i] = (ar + br) * INV_SQRT_2;
    target.ai[i] = (ai + bi) * INV_SQRT_2;
    target.br[i] = (ar - br) * INV_SQRT_2;
    target.bi[i] = (ai - bi) * INV_SQRT_2;
  }
}

function shiftX() {
  clearField(xShifted);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = idx(x, y);
      const left = idx(wrap(x - 1), y);
      const right = idx(wrap(x + 1), y);
      xShifted.ar[left] += state.ar[i];
      xShifted.ai[left] += state.ai[i];
      xShifted.br[right] += state.br[i];
      xShifted.bi[right] += state.bi[i];
    }
  }
  const old = state;
  state = xShifted;
  xShifted = old;
}

function shiftY() {
  clearField(next);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = idx(x, y);
      const up = idx(x, wrap(y - 1));
      const down = idx(x, wrap(y + 1));
      next.ar[up] += state.ar[i];
      next.ai[up] += state.ai[i];
      next.br[down] += state.br[i];
      next.bi[down] += state.bi[i];
    }
  }
  const old = state;
  state = next;
  next = old;
}

function finishQuantumStep() {
  stepCount++;
  simulationTime += STEP_MS;
  if (stepCount % 20 === 0) normalize();
  updateInterferencePersistence();
  growBlooms(simulationTime);
}

function quantumStep() {
  if (!hasQuantumState) return;
  stepInterference.fill(0);
  applyCoin(state);
  shiftX();
  applyPhase(state);
  applyCoin(state);
  shiftY();
  finishQuantumStep();
}

function collapse() {
  let total = 0;
  for (let i = 0; i < CELLS; i++) {
    probability[i] = probabilityAt(i);
    total += probability[i];
  }
  if (total < 1e-8) {
    resetGarden();
    return;
  }
  let pick = Math.random() * total;
  let chosen = idx(HALF, HALF);
  for (let i = 0; i < CELLS; i++) {
    pick -= probability[i];
    if (pick <= 0) {
      chosen = i;
      break;
    }
  }
  const phase = relativePhaseAt(chosen);
  clearField(state);
  seedCount = 0;
  stepInterference.fill(0);
  interferenceStrength.fill(0);
  interferenceMemory.fill(0);
  interferencePersistence.fill(0);
  seed(chosen % SIZE, Math.floor(chosen / SIZE), phase, false);
  audio?.collapse();
}

const palette = [
  [0.03, 0.12, 0.15],
  [0.03, 0.34, 0.38],
  [0.06, 0.68, 0.64],
  [0.78, 0.67, 0.38],
  [0.92, 0.97, 0.88],
  [0.12, 0.47, 0.5],
] as const;

function phaseColor(phase: number, coherence: number, brightness = 1) {
  const t = ((phase / TAU + 1) % 1) * palette.length;
  const lo = Math.floor(t) % palette.length;
  const hi = (lo + 1) % palette.length;
  const f = t - Math.floor(t);
  const quiet = 0.3 + coherence * 0.7;
  return [0, 1, 2].map((channel) => {
    const value = palette[lo][channel] + (palette[hi][channel] - palette[lo][channel]) * f;
    return (value * quiet + [0.035, 0.1, 0.12][channel] * (1 - quiet)) * brightness;
  }) as [number, number, number];
}

function updateFieldPixels() {
  let maxP = 0;
  let change = 0;
  const brightest: number[] = [];
  norm = 0;
  for (let i = 0; i < CELLS; i++) {
    const p = probabilityAt(i);
    probability[i] = p;
    norm += p;
    maxP = Math.max(maxP, p);
    if (p > 1e-12) {
      if (brightest.length < 32) brightest.push(p);
      else {
        let minIndex = 0;
        for (let n = 1; n < brightest.length; n++) {
          if (brightest[n] < brightest[minIndex]) minIndex = n;
        }
        if (p > brightest[minIndex]) brightest[minIndex] = p;
      }
    }
    change += Math.abs(p - previousProbability[i]);
    previousProbability[i] = p;
  }
  if (maxP < 1e-12) {
    exposure = 1;
    interferencePulse = 0;
    fieldPixels.fill(0);
    return;
  }
  const brightReference = brightest.reduce((sum, p) => sum + p, 0) / Math.max(1, brightest.length);
  exposure += (0.52 / Math.max(brightReference, 0.00001) - exposure) * 0.24;
  interferencePulse += (Math.min(1, change * 2.8) - interferencePulse) * 0.09;
  for (let i = 0; i < CELLS; i++) {
    const p = probability[i];
    const ampA = Math.hypot(state.ar[i], state.ai[i]);
    const ampB = Math.hypot(state.br[i], state.bi[i]);
    const coherence = p > 1e-10 ? Math.min(1, (2 * ampA * ampB) / p) : 0;
    const phase = relativePhaseAt(i);
    const light = Math.pow(1 - Math.exp(-p * exposure * 3.8), 0.66);
    const color = phaseColor(phase, coherence, 0.42 + light * 1.38);
    const o = i * 4;
    fieldPixels[o] = Math.min(255, color[0] * 255);
    fieldPixels[o + 1] = Math.min(255, color[1] * 255);
    fieldPixels[o + 2] = Math.min(255, color[2] * 255);
    fieldPixels[o + 3] = Math.min(255, light * 255);
  }
}

function activeCell(tries = 30) {
  let best = idx(HALF, HALF);
  let bestP = -1;
  for (let n = 0; n < tries; n++) {
    const i = Math.floor(Math.random() * CELLS);
    if (probability[i] > bestP) {
      bestP = probability[i];
      best = i;
    }
  }
  return best;
}

function updateInterferencePersistence() {
  let maxP = 0;
  for (let i = 0; i < CELLS; i++) maxP = Math.max(maxP, probabilityAt(i));
  if (maxP < 1e-12) {
    interferenceStrength.fill(0);
    interferenceMemory.fill(0);
    interferencePersistence.fill(0);
    return;
  }

  let maxMemory = 0;
  for (let i = 0; i < CELLS; i++) {
    const eventDensity = stepInterference[i];
    interferenceMemory[i] = interferenceMemory[i] * BLOOM_MEMORY_RETENTION
      + eventDensity * BLOOM_MEMORY_INPUT;
    maxMemory = Math.max(maxMemory, interferenceMemory[i]);
  }

  for (let i = 0; i < CELLS; i++) {
    const p = probabilityAt(i);
    const relativeProbability = p / maxP;
    const normalizedMemory = maxMemory > 1e-12 ? interferenceMemory[i] / maxMemory : 0;
    interferenceStrength[i] = normalizedMemory;
    const isStrong = relativeProbability >= BLOOM_PROBABILITY_FLOOR
      && normalizedMemory >= BLOOM_MEMORY_THRESHOLD;
    interferencePersistence[i] = isStrong
      ? Math.min(255, interferencePersistence[i] + 1)
      : 0;
  }
}

function isInterferenceLocalMaximum(i: number) {
  const x = i % SIZE;
  const y = Math.floor(i / SIZE);
  const center = interferenceStrength[i];
  for (let oy = -2; oy <= 2; oy++) {
    for (let ox = -2; ox <= 2; ox++) {
      if (ox === 0 && oy === 0) continue;
      const neighbor = idx(wrap(x + ox), wrap(y + oy));
      if (interferenceStrength[neighbor] > center
        || (interferenceStrength[neighbor] === center && neighbor < i)) return false;
    }
  }
  return true;
}

function growBlooms(now: number) {
  if (stepCount < BLOOM_PERSISTENCE_STEPS) return;
  const candidates: { i: number; score: number; persistence: number }[] = [];
  for (let y = 2; y < SIZE - 2; y++) {
    for (let x = 2; x < SIZE - 2; x++) {
      const i = idx(x, y);
      const persistence = interferencePersistence[i];
      if (persistence < BLOOM_PERSISTENCE_STEPS || !isInterferenceLocalMaximum(i)) continue;
      candidates.push({ i, score: interferenceStrength[i], persistence });
    }
  }
  const selected: typeof candidates = [];
  while (selected.length < BLOOMS_PER_STEP) {
    let best: (typeof candidates)[number] | null = null;
    let bestSelectionScore = -1;
    for (const candidate of candidates) {
      if (selected.some((item) => item.i === candidate.i)) continue;
      const x = candidate.i % SIZE;
      const y = Math.floor(candidate.i / SIZE);
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const bloom of blooms) {
        if (now - bloom.born >= bloom.life) continue;
        nearestDistance = Math.min(nearestDistance, Math.hypot(bloom.x - x, bloom.y - y));
      }
      for (const chosen of selected) {
        nearestDistance = Math.min(
          nearestDistance,
          Math.hypot(chosen.i % SIZE - x, Math.floor(chosen.i / SIZE) - y),
        );
      }
      if (nearestDistance < BLOOM_MIN_DISTANCE) continue;
      const spatialNovelty = Number.isFinite(nearestDistance)
        ? 1 - Math.exp(-(nearestDistance * nearestDistance) / (2 * BLOOM_SPATIAL_RADIUS * BLOOM_SPATIAL_RADIUS))
        : 1;
      const selectionScore = Math.pow(candidate.score, 0.75) * spatialNovelty;
      if (selectionScore > bestSelectionScore
        || (selectionScore === bestSelectionScore && candidate.i < (best?.i ?? Number.POSITIVE_INFINITY))) {
        best = candidate;
        bestSelectionScore = selectionScore;
      }
    }
    if (!best) break;
    selected.push(best);
  }

  for (const candidate of selected) {
    const x = candidate.i % SIZE;
    const y = Math.floor(candidate.i / SIZE);
    const phase = relativePhaseAt(candidate.i);
    const petals = 8;
    blooms.push({
      x,
      y,
      born: now,
      life: STEP_MS * (48 + petals * 3 + Math.min(18, candidate.persistence * 2)),
      radius: 3.2 + Math.min(3.8, Math.sqrt(candidate.score) * 3.4),
      phase,
      petals,
    });
    if (blooms.length >= MAX_BLOOMS) blooms.shift();
  }
}

function updateFilaments(dt: number) {
  const spawnCount = filaments.length < 140 ? 8 : 3;
  for (let n = 0; n < spawnCount && filaments.length < MAX_FILAMENTS; n++) {
    const i = activeCell();
    if (probability[i] < 1e-8) continue;
    const x = i % SIZE;
    const y = Math.floor(i / SIZE);
    filaments.push({
      x: x + (Math.random() - 0.5),
      y: y + (Math.random() - 0.5),
      px: x,
      py: y,
      age: 0,
      life: 1800 + Math.random() * 5200,
      phase: relativePhaseAt(i),
    });
  }
  for (let n = filaments.length - 1; n >= 0; n--) {
    const f = filaments[n];
    f.age += dt;
    if (f.age >= f.life) {
      filaments.splice(n, 1);
      continue;
    }
    const x = wrap(Math.round(f.x));
    const y = wrap(Math.round(f.y));
    const i = idx(x, y);
    const ur = state.ar[i] + state.br[i];
    const ui = state.ai[i] + state.bi[i];
    const current = (j: number) => ur * (state.ai[j] + state.bi[j]) - ui * (state.ar[j] + state.br[j]);
    let vx = current(idx(wrap(x + 1), y)) - current(idx(wrap(x - 1), y));
    let vy = current(idx(x, wrap(y + 1))) - current(idx(x, wrap(y - 1)));
    const length = Math.hypot(vx, vy);
    const localPhase = relativePhaseAt(i);
    if (length > 1e-9) {
      vx /= length;
      vy /= length;
    } else {
      vx = Math.cos(localPhase);
      vy = Math.sin(localPhase);
    }
    const curl = Math.sin(localPhase - f.phase) * 0.5;
    f.px = f.x;
    f.py = f.y;
    f.x += (vx - vy * curl) * (0.15 + dt * 0.011);
    f.y += (vy + vx * curl) * (0.15 + dt * 0.011);
    if (f.x < 0 || f.x >= SIZE || f.y < 0 || f.y >= SIZE) {
      f.x = wrap(f.x);
      f.y = wrap(f.y);
      f.px = f.x;
      f.py = f.y;
    }
    f.phase += (localPhase - f.phase) * 0.08;
  }
}

function updateCavities() {
  const found: Cavity[] = [];
  for (let y = 5; y < SIZE - 5; y += 5) {
    for (let x = 5; x < SIZE - 5; x += 5) {
      const center = probability[idx(x, y)];
      const ring = probability[idx(x - 4, y)] + probability[idx(x + 4, y)] + probability[idx(x, y - 4)] + probability[idx(x, y + 4)];
      const strength = Math.max(0, ring * 0.25 - center * 2.8) * exposure;
      if (strength > 0.03) found.push({ x, y, strength: Math.min(1, strength) });
    }
  }
  found.sort((a, b) => b.strength - a.strength);
  cavities.length = 0;
  cavities.push(...found.slice(0, 8));
}

function gridToScreenUv(x: number, y: number) {
  const aspect = width / height;
  const fx = x / (SIZE - 1);
  const fy = y / (SIZE - 1);
  return aspect >= 1
    ? { x: fx, y: (fy - 0.5) * aspect + 0.5 }
    : { x: (fx - 0.5) / aspect + 0.5, y: fy };
}

function screenToGrid(x: number, y: number) {
  const aspect = width / height;
  const ux = x / width;
  const uy = y / height;
  return aspect >= 1
    ? { x: ux * (SIZE - 1), y: ((uy - 0.5) / aspect + 0.5) * (SIZE - 1) }
    : { x: ((ux - 0.5) * aspect + 0.5) * (SIZE - 1), y: uy * (SIZE - 1) };
}

function createRenderData(now: number, dt: number) {
  updateFilaments(dt);
  if (stepCount % 4 === 0) updateCavities();

  const lineValues: number[] = [];
  for (const f of filaments) {
    if (Math.abs(f.x - f.px) > SIZE / 2 || Math.abs(f.y - f.py) > SIZE / 2) continue;
    const from = gridToScreenUv(f.px, f.py);
    const to = gridToScreenUv(f.x, f.y);
    const envelope = Math.sin((f.age / f.life) * Math.PI);
    const color = phaseColor(f.phase, 1, 1.15);
    const alpha = (0.05 + Math.min(0.22, probability[idx(wrap(Math.round(f.x)), wrap(Math.round(f.y)))] * exposure)) * envelope;
    lineValues.push(from.x * 2 - 1, 1 - from.y * 2, color[0], color[1], color[2], alpha);
    lineValues.push(to.x * 2 - 1, 1 - to.y * 2, color[0], color[1], color[2], alpha);
  }

  const bloomValues: number[] = [];
  for (let i = blooms.length - 1; i >= 0; i--) {
    const bloom = blooms[i];
    const age = now - bloom.born;
    if (age >= bloom.life) {
      blooms.splice(i, 1);
      continue;
    }
    const uv = gridToScreenUv(bloom.x, bloom.y);
    const grow = 1 - Math.pow(1 - Math.min(1, age / 1500), 3);
    const fade = Math.min(1, (bloom.life - age) / 2400);
    const color = phaseColor(bloom.phase, 1, 0.78 * fade);
    const size = Math.min(92, bloom.radius * Math.max(width, height) / SIZE * 1.15 * grow * dpr);
    bloomValues.push(uv.x * 2 - 1, 1 - uv.y * 2, size, bloom.phase + age * 0.000025, bloom.petals, ...color);
  }

  const cavityValues = new Float32Array(24);
  cavities.forEach((cavity, index) => {
    const uv = gridToScreenUv(cavity.x, cavity.y);
    cavityValues[index * 3] = uv.x;
    cavityValues[index * 3 + 1] = 1 - uv.y;
    cavityValues[index * 3 + 2] = cavity.strength;
  });

  return {
    field: fieldPixels,
    lines: new Float32Array(lineValues),
    lineVertices: lineValues.length / 6,
    blooms: new Float32Array(bloomValues),
    bloomCount: bloomValues.length / 8,
    cavities: cavityValues,
    cavityCount: cavities.length,
    pulse: interferencePulse,
    time: now / 1000,
  };
}

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 1.35);
  renderer.resize(width, height, dpr);
  renderRequested = true;
}

class AmbientAudio {
  context = new AudioContext();
  master = this.context.createGain();
  voices: OscillatorNode[] = [];

  constructor() {
    this.master.gain.value = 0;
    this.master.connect(this.context.destination);
    [55, 82.41, 123.47].forEach((frequency, index) => {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      const pan = this.context.createStereoPanner();
      oscillator.type = index === 0 ? 'sine' : 'triangle';
      oscillator.frequency.value = frequency;
      gain.gain.value = index === 0 ? 0.035 : 0.009;
      pan.pan.value = index - 1;
      oscillator.connect(gain).connect(pan).connect(this.master);
      oscillator.start();
      this.voices.push(oscillator);
    });
  }

  wake() {
    this.context.resume();
    this.master.gain.setTargetAtTime(muted ? 0 : 0.3, this.context.currentTime, 0.8);
  }

  strike(phase: number) {
    if (this.context.state !== 'running') return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.frequency.value = 190 * Math.pow(2, (((phase / TAU + 1) % 1) * 7) / 12);
    gain.gain.setValueAtTime(0.025, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + 2.8);
    oscillator.connect(gain).connect(this.master);
    oscillator.start();
    oscillator.stop(this.context.currentTime + 3);
  }

  collapse() {
    const time = this.context.currentTime;
    this.master.gain.cancelScheduledValues(time);
    this.master.gain.linearRampToValueAtTime(0.005, time + 0.12);
    this.master.gain.linearRampToValueAtTime(muted ? 0 : 0.3, time + 2.2);
  }

  toggle() {
    muted = !muted;
    this.master.gain.setTargetAtTime(muted ? 0 : 0.3, this.context.currentTime, 0.3);
  }
}

let audio: AmbientAudio | null = null;
function ensureAudio() {
  audio ??= new AmbientAudio();
  audio.wake();
}


// Input changes the field; playback always advances automatically.
canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  ensureAudio();
  const phase = Math.atan2(event.clientY - height / 2, event.clientX - width / 2) + Math.PI / 2;
  const pointer: PointerMemory = {
    x: event.clientX, y: event.clientY, px: event.clientX, py: event.clientY,
    moved: 0, phase, downAt: performance.now(), longPress: 0,
  };
  pointer.longPress = window.setTimeout(() => {
    if (pointer.moved < 18) collapse();
  }, 780);
  pointers.set(event.pointerId, pointer);
});

canvas.addEventListener('pointermove', (event) => {
  const pointer = pointers.get(event.pointerId);
  if (!pointer) return;
  const dx = event.clientX - pointer.px;
  const dy = event.clientY - pointer.py;
  const distance = Math.hypot(dx, dy);
  pointer.moved += distance;
  pointer.x = pointer.px = event.clientX;
  pointer.y = pointer.py = event.clientY;
  if (pointer.moved > 18) clearTimeout(pointer.longPress);
  const grid = screenToGrid(event.clientX, event.clientY);
  const direction = Math.atan2(dy, dx);
  paintPhase(
    grid.x, grid.y,
    Math.sin(direction - pointer.phase) * Math.min(0.28, distance * 0.012),
    7 + Math.min(8, distance),
  );
  pointer.phase = direction;
});

function releasePointer(pointerId: number) {
  const pointer = pointers.get(pointerId);
  if (pointer) clearTimeout(pointer.longPress);
  pointers.delete(pointerId);
  if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
}

function cancelPointers() {
  for (const pointerId of pointers.keys()) releasePointer(pointerId);
}

canvas.addEventListener('pointerup', (event) => {
  const pointer = pointers.get(event.pointerId);
  if (!pointer) return;
  if (pointer.moved < 18 && performance.now() - pointer.downAt < 720) {
    const grid = screenToGrid(event.clientX, event.clientY);
    seed(grid.x, grid.y, pointer.phase);
  }
  releasePointer(event.pointerId);
});

canvas.addEventListener('pointercancel', (event) => releasePointer(event.pointerId));
canvas.addEventListener('lostpointercapture', (event) => releasePointer(event.pointerId));
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('resize', resize);
window.addEventListener('blur', cancelPointers);

window.addEventListener('keydown', async (event) => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === 'f') {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  }
  if (key === 'm') {
    ensureAudio();
    audio?.toggle();
  }
  if (key === 'r') resetGarden();
  if (key === 's') {
    const link = document.createElement('a');
    link.download = `qart-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }
});

document.addEventListener('visibilitychange', () => {
  // Do not accumulate a backlog while the artwork is in a background tab.
  lastFrameTime = null;
  renderRequested = true;
  if (document.hidden) {
    cancelPointers();
    void audio?.context.suspend();
  } else if (audio) {
    audio.wake();
  }
});

function animate(now: number) {
  requestAnimationFrame(animate);
  if (document.hidden) return;
  const elapsed = lastFrameTime === null ? 0 : Math.min(100, Math.max(0, now - lastFrameTime));
  lastFrameTime = now;
  if (hasQuantumState) {
    stepAccumulator += elapsed;
    while (stepAccumulator >= STEP_MS) {
      quantumStep();
      stepAccumulator -= STEP_MS;
    }
  }
  renderAccumulator += elapsed;
  if (!renderRequested && (!hasQuantumState || renderAccumulator < FRAME_MS)) return;
  const dt = Math.min(100, renderAccumulator);
  renderAccumulator = 0;
  renderRequested = false;
  updateFieldPixels();
  renderer.render(createRenderData(simulationTime + stepAccumulator, dt));
}

resize();
resetGarden();
requestAnimationFrame(animate);
