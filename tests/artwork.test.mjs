import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { createGarden } from './harness.mjs';

const norm = 'state.ar.reduce((sum, _, i) => sum + probabilityAt(i), 0)';

test('only the artwork and its opening title are shipped, with no alternative modes', () => {
  const files = readdirSync(new URL('../src/', import.meta.url)).sort();
  assert.deepEqual(files, ['main.ts', 'renderer.ts', 'style.css']);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal((html.match(/<canvas /g) ?? []).length, 1);
  assert.equal((html.match(/<button /g) ?? []).length, 1);
  assert.match(html, /Qart<\/strong><i>：<\/i>量子ウォークが描く波動模様/);
  assert.match(html, /Touch anywhere to start/);
  assert.doesNotMatch(html, /<aside|<nav|<h1|<p>/);
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /URLSearchParams|ZOOM_MODE|MANUAL_STEP|inspector|arrowOverlay/);
});

test('the opening title disappears without placing a seed', () => {
  const garden = createGarden();
  garden.emit('intro', 'click');
  assert.equal(garden.evaluate("intro.classList.contains('intro--leaving')"), true);
  assert.equal(garden.evaluate('seedCount'), 0);
});

test('starts empty and does not advance before a seed is placed', () => {
  const garden = createGarden();
  for (let time = 0; time <= 1000; time += 20) garden.frame(time);
  assert.equal(garden.evaluate('seedCount'), 0);
  assert.equal(garden.evaluate('stepCount'), 0);
  assert.equal(garden.evaluate(norm), 0);
});

test('a seed is normalized and all added seeds retain total probability one', () => {
  const garden = createGarden();
  for (const [x, y, phase] of [[80, 80, 0.7], [60, 75, 1.2], [100, 80, 0.1]]) {
    garden.evaluate(`seed(${x}, ${y}, ${phase}, false)`);
    assert.ok(Math.abs(garden.evaluate(norm) - 1) < 1e-6);
  }
  assert.equal(garden.evaluate('seedCount'), 3);
});

test('additional seeds keep the existing visual feedback', () => {
  const garden = createGarden();
  garden.evaluate('seed(55, 80, 0.7, false); quantumStep(); updateFieldPixels();');
  const clears = garden.evaluate('renderer.clears');
  garden.evaluate('seed(125, 80, 0.2, false); seed(125, 115, 1.2, false);');
  assert.equal(garden.evaluate('renderer.clears'), clears);
});

test('new concentrated seeds do not dim the older wave as exposure settles', () => {
  const garden = createGarden();
  garden.evaluate(`
    seed(55, 80, 0.7, false);
    for (let t = 0; t < 26; t++) { quantumStep(); updateFieldPixels(); }
    for (let frame = 0; frame < 30; frame++) updateFieldPixels();
    const oldPeak = probability.reduce((best, p, i) => p > probability[best] ? i : best, 0);
    const oldP = probabilityAt(oldPeak);
    const oldPixels = fieldPixels.slice();
    const oldWave = Array.from(probability, (p, i) => p > oldP * 0.02 ? i : -1).filter(i => i >= 0);
  `);
  for (const [x, y, phase] of [[125, 80, 0.2], [125, 115, 1.2]]) {
    garden.evaluate(`seed(${x}, ${y}, ${phase}, false);`);
    for (let frame = 0; frame < 40; frame++) {
      garden.evaluate('updateFieldPixels()');
      const maxChange = garden.evaluate(`oldWave.reduce((max, i) => Math.max(
        max, ...[0, 1, 2, 3].map(c => Math.abs(fieldPixels[i * 4 + c] - oldPixels[i * 4 + c]))
      ), 0)`);
      assert.ok(maxChange <= 1, `existing wave changed by ${maxChange} / 255`);
    }
    assert.ok(Math.abs(garden.evaluate(norm) - 1) < 1e-6);
  }
  // Display compensation must not undo normalization of the actual quantum state.
  assert.ok(Math.abs(garden.evaluate('probabilityAt(oldPeak) / oldP') - 1 / 3) < 1e-6);
});

test('C, shifts, and phase rotation each preserve probability', () => {
  const garden = createGarden();
  garden.evaluate('seed(80, 80, 0.7, false)');
  for (const operation of ['applyCoin(state)', 'shiftX()', 'applyPhase(state)', 'applyCoin(state)', 'shiftY()']) {
    garden.evaluate(operation);
    assert.ok(Math.abs(garden.evaluate(norm) - 1) < 1e-6, operation);
  }
});

test('the default phase landscape keeps opposite wave directions balanced', () => {
  const garden = createGarden();
  garden.evaluate('seed(80, 80, 0.7, false); for (let step = 0; step < 60; step++) quantumStep();');
  const imbalance = garden.evaluate(`(() => {
    const moments = Array(16).fill(0).map(() => ({ mass: 0, radius: 0 }));
    for (let i = 0; i < CELLS; i++) {
      const p = probabilityAt(i);
      if (p < 1e-12) continue;
      const x = i % SIZE - HALF;
      const y = Math.floor(i / SIZE) - HALF;
      const bin = Math.floor(((Math.atan2(y, x) + TAU) % TAU) / TAU * moments.length) % moments.length;
      moments[bin].mass += p;
      moments[bin].radius += p * Math.hypot(x, y);
    }
    const radii = moments.map(value => value.radius / value.mass);
    return Math.max(...radii.map((radius, i) => Math.abs(radius - radii[(i + 8) % 16])))
      / (radii.reduce((sum, radius) => sum + radius, 0) / radii.length);
  })()`);
  assert.ok(imbalance < 0.08, `opposite-direction imbalance ${imbalance}`);
});

test('playback advances automatically at the fixed step interval', () => {
  const garden = createGarden();
  garden.evaluate('seed(80, 80, 0.7, false)');
  for (let time = 0; time <= 1000; time += 20) garden.frame(time);
  assert.equal(garden.evaluate('stepCount'), 5);
  assert.ok(garden.evaluate('renderer.renders') > 20);
  assert.ok(Math.abs(garden.evaluate(norm) - 1) < 1e-6);
});

test('each wave keeps its own 100-to-180-step fade clock', () => {
  const garden = createGarden();
  garden.evaluate('seed(55, 80, 0.7, false); stepCount = 50; seed(105, 80, 0.2, false);');
  const samples = garden.evaluate('[100, 101, 140, 150, 151, 179, 180, 230].map(step => waveLayers.map(layer => waveOpacity(layer, step)))');
  assert.equal(JSON.stringify(samples[0]), '[1,1]');
  assert.ok(samples[1][0] < 1 && samples[1][1] === 1);
  assert.ok(Math.abs(samples[2][0] - 0.5) < 1e-12 && samples[2][1] === 1);
  assert.ok(samples[3][0] < 0.5 && samples[3][1] === 1);
  assert.ok(samples[4][0] < samples[3][0] && samples[4][1] < 1);
  assert.ok(samples[5][0] > 0 && samples[5][1] > 0.5);
  assert.equal(samples[6][0], 0);
  assert.ok(samples[6][1] > 0);
  assert.equal(JSON.stringify(samples[7]), '[0,0]');
});

test('an expired wave is removed while a younger wave keeps evolving', () => {
  const garden = createGarden();
  garden.evaluate('seed(55, 80, 0.7, false); stepCount = 50; seed(105, 80, 0.2, false); stepCount = 179; finishQuantumStep();');
  assert.equal(garden.evaluate('stepCount'), 180);
  assert.equal(garden.evaluate('seedCount'), 1);
  assert.equal(garden.evaluate('waveLayers.length'), 1);
  assert.equal(garden.evaluate('waveLayers[0].bornStep'), 50);
  assert.ok(garden.evaluate('waveOpacity(waveLayers[0])') > 0);
  assert.equal(garden.evaluate('hasQuantumState'), true);
  assert.ok(Math.abs(garden.evaluate(norm) - 1) < 1e-6);
  garden.evaluate('stepCount = 229; finishQuantumStep();');
  assert.equal(garden.evaluate('stepCount'), 0);
  assert.equal(garden.evaluate('waveLayers.length'), 0);
  assert.equal(garden.evaluate('hasQuantumState'), false);
});

test('the sum of independently evolved wave layers equals the quantum state', () => {
  const garden = createGarden();
  garden.evaluate(`
    seed(55, 80, 0.7, false);
    for (let step = 0; step < 15; step++) quantumStep();
    seed(105, 80, 0.2, false);
    for (let step = 0; step < 35; step++) quantumStep();
  `);
  const error = garden.evaluate(`['ar', 'ai', 'br', 'bi'].reduce((maximum, component) => {
    for (let i = 0; i < CELLS; i++) {
      const sum = waveLayers.reduce((value, layer) => value + layer.field[component][i], 0);
      maximum = Math.max(maximum, Math.abs(state[component][i] - sum));
    }
    return maximum;
  }, 0)`);
  assert.ok(error < 2e-6, `layer sum error ${error}`);
});

test('manual playback and diagnostic shortcuts are absent', async () => {
  const garden = createGarden();
  garden.evaluate('seed(80, 80, 0.7, false)');
  await garden.emit('window', 'keydown', { key: ' ', code: 'Space' });
  await garden.emit('window', 'keydown', { key: 'd', code: 'KeyD' });
  assert.equal(garden.evaluate('stepCount'), 0);
});

test('background tabs pause without replaying missed steps on return', () => {
  const garden = createGarden();
  garden.evaluate('seed(80, 80, 0.7, false)');
  for (let time = 0; time <= 200; time += 20) garden.frame(time);
  const before = garden.evaluate('stepCount');
  garden.document.hidden = true;
  garden.emit('document', 'visibilitychange');
  garden.frame(30000);
  assert.equal(garden.evaluate('stepCount'), before);
  garden.document.hidden = false;
  garden.emit('document', 'visibilitychange');
  garden.frame(30020);
  assert.equal(garden.evaluate('stepCount'), before);
});

test('reset clears the simulation, blooms, and the visual feedback', () => {
  const garden = createGarden();
  garden.evaluate('seed(80, 80, 0.7, false)');
  for (let time = 0; time <= 800; time += 20) garden.frame(time);
  garden.evaluate('seed(120, 80, 0.2, false)');
  assert.ok(garden.evaluate('exposureFloor') > 0);
  const clears = garden.evaluate('renderer.clears');
  garden.evaluate('resetGarden()');
  assert.equal(garden.evaluate('hasQuantumState'), false);
  assert.equal(garden.evaluate(norm), 0);
  assert.equal(garden.evaluate('blooms.length + filaments.length'), 0);
  assert.equal(garden.evaluate('stepCount'), 0);
  assert.equal(garden.evaluate('renderer.clears'), clears + 1);
  assert.equal(garden.evaluate('exposure'), 1);
  assert.equal(garden.evaluate('exposureFloor'), 0);
});

test('display compensation stays bounded for repeatedly overlapping seeds', () => {
  const garden = createGarden();
  garden.evaluate(`
    for (let n = 0; n < 32; n++) {
      seed(80, 80, 0.7, false);
      updateFieldPixels();
    }
  `);
  assert.ok(garden.evaluate('Number.isFinite(exposure) && exposure <= MAX_EXPOSURE'));
  assert.ok(Math.abs(garden.evaluate(norm) - 1) < 1e-6);
});

test('collapse starts a fresh display without inheriting the exposure floor', () => {
  const garden = createGarden();
  garden.evaluate('seed(55, 80, 0.7, false); updateFieldPixels(); seed(125, 80, 0.2, false);');
  assert.ok(garden.evaluate('exposureFloor') > 0);
  const clears = garden.evaluate('renderer.clears');
  garden.evaluate('collapse()');
  assert.equal(garden.evaluate('exposureFloor'), 0);
  assert.equal(garden.evaluate('exposure'), 1);
  assert.equal(garden.evaluate('renderer.clears'), clears + 1);
  assert.equal(garden.evaluate('seedCount'), 1);
  assert.ok(Math.abs(garden.evaluate(norm) - 1) < 1e-6);
});

test('cancelled touches do not add a seed', () => {
  const garden = createGarden();
  garden.emit('canvas', 'pointerdown');
  garden.emit('canvas', 'pointercancel');
  garden.emit('canvas', 'pointerup');
  assert.equal(garden.evaluate('seedCount'), 0);
  garden.emit('canvas', 'pointerdown');
  garden.emit('canvas', 'pointerup');
  assert.equal(garden.evaluate('seedCount'), 1);
});

test('continued evolution stays normalized and bloom placement is deterministic', () => {
  const first = createGarden();
  const second = createGarden();
  for (const garden of [first, second]) {
    garden.evaluate('seed(80, 80, 0.7, false); for (let t = 0; t < 40; t++) quantumStep();');
    assert.ok(Math.abs(garden.evaluate(norm) - 1) < 1e-6);
    assert.ok(garden.evaluate('blooms.length') > 0);
  }
  assert.equal(first.evaluate('JSON.stringify(blooms)'), second.evaluate('JSON.stringify(blooms)'));
});
