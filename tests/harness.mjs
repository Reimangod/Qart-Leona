import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source.replace(/^import .+;\n/gm, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

// Exercise the production simulation and event loop without a browser or GPU.
export function createGarden() {
  const events = { canvas: new Map(), window: new Map(), document: new Map() };
  const captures = new Set();
  const timers = new Map();
  let timerId = 0;
  let now = 0;
  let scheduledFrame;
  const canvas = {
    addEventListener: (name, listener) => events.canvas.set(name, listener),
    setPointerCapture: (id) => captures.add(id),
    hasPointerCapture: (id) => captures.has(id),
    releasePointerCapture: (id) => captures.delete(id),
  };
  const document = {
    hidden: false,
    querySelector(selector) {
      if (selector !== '#art') throw new Error(`Unexpected UI: ${selector}`);
      return canvas;
    },
    addEventListener: (name, listener) => events.document.set(name, listener),
    createElement() { throw new Error('The artwork must not create a control panel'); },
  };
  const node = () => ({
    connect() { return this; },
    gain: {
      setTargetAtTime() {}, setValueAtTime() {}, exponentialRampToValueAtTime() {},
      cancelScheduledValues() {}, linearRampToValueAtTime() {},
    },
    frequency: {}, pan: {}, start() {}, stop() {},
  });
  const context = createContext({
    console,
    document,
    window: {
      innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
      addEventListener: (name, listener) => events.window.set(name, listener),
      setTimeout: (callback) => { timers.set(++timerId, callback); return timerId; },
    },
    performance: { now: () => now },
    clearTimeout: (id) => timers.delete(id),
    requestAnimationFrame: (callback) => { scheduledFrame = callback; return 1; },
    AudioContext: class {
      state = 'running'; currentTime = 0; destination = {};
      createGain = node;
      createOscillator = node;
      createStereoPanner = node;
      resume() { return Promise.resolve(); }
      suspend() { return Promise.resolve(); }
    },
    QuantumRenderer: class {
      clears = 0; renders = 0; frame;
      resize() {}
      clearFeedback() { this.clears++; }
      render(frame) { this.renders++; this.frame = frame; }
    },
  });
  runInContext(compiled, context);
  return {
    document,
    events,
    evaluate: (code) => runInContext(code, context),
    frame(time) { now = time; scheduledFrame(time); },
    emit(target, event, values = {}) {
      return events[target].get(event)?.({
        button: 0, pointerId: 1, clientX: 640, clientY: 400,
        preventDefault() {}, ...values,
      });
    },
  };
}
