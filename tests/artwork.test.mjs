import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { createGarden } from './harness.mjs';

const norm = 'state.ar.reduce((sum, _, i) => sum + probabilityAt(i), 0)';

test('only the artwork is shipped, with no alternative mode entry points', () => {
  const files = readdirSync(new URL('../src/', import.meta.url)).sort();
  assert.deepEqual(files, ['main.ts', 'renderer.ts', 'style.css']);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal((html.match(/<canvas /g) ?? []).length, 1);
  assert.doesNotMatch(html, /<button|<aside|<nav|<h1|<p>/);
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /URLSearchParams|ZOOM_MODE|MANUAL_STEP|inspector|arrowOverlay/);
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

test('C, shifts, and phase rotation each preserve probability', () => {
  const garden = createGarden();
  garden.evaluate('seed(80, 80, 0.7, false)');
  for (const operation of ['applyCoin(state)', 'shiftX()', 'applyPhase(state)', 'applyCoin(state)', 'shiftY()']) {
    garden.evaluate(operation);
    assert.ok(Math.abs(garden.evaluate(norm) - 1) < 1e-6, operation);
  }
});

test('playback advances automatically at the fixed step interval', () => {
  const garden = createGarden();
  garden.evaluate('seed(80, 80, 0.7, false)');
  for (let time = 0; time <= 1000; time += 20) garden.frame(time);
  assert.equal(garden.evaluate('stepCount'), 5);
  assert.ok(garden.evaluate('renderer.renders') > 20);
  assert.ok(Math.abs(garden.evaluate(norm) - 1) < 1e-6);
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
  const clears = garden.evaluate('renderer.clears');
  garden.evaluate('resetGarden()');
  assert.equal(garden.evaluate('hasQuantumState'), false);
  assert.equal(garden.evaluate(norm), 0);
  assert.equal(garden.evaluate('blooms.length + filaments.length'), 0);
  assert.equal(garden.evaluate('stepCount'), 0);
  assert.equal(garden.evaluate('renderer.clears'), clears + 1);
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
