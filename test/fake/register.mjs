// Answers the app's bare imports with fakes, so tests load the real mods. Import it first.
import { registerHooks } from "node:module";

const FAKES = { herdr: "./herdr.mjs", "gpui-kit": "./gpui-kit.mjs", "gpui-base": "./gpui-base.mjs" };

registerHooks({
  resolve(specifier, context, next) {
    if (FAKES[specifier]) return { url: new URL(FAKES[specifier], import.meta.url).href, shortCircuit: true };
    return next(specifier, context);
  },
});

// Herdr gives every mod a localStorage; Node 24 has none without a flag. resetFake() clears it.
const store = new Map();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
    clear: () => { store.clear(); },
  },
});
