// The app's API over state a test sets. Call resetFake() before each test.
const never = () => new Promise(() => {});
const blank = () => ({
  spaces: [], panes: [], focused: null, terminals: [], machines: [], files: {},
  exec: () => ({ code: 0, stdout: "", stderr: "" }), execs: [], reads: [],
  agents: [], layout: { id: "root", children: [{ id: "sidebar", size: { px: 268 } }] },
  shared: {}, keys: [], runs: [], order: null, overlays: [], closed: [], props: null, home: "/home/test",
  badges: [], notes: [], active: true, checking: false,
});

export const fake = blank();
// localStorage is the global register.mjs installs, as Herdr gives mods one.
export const resetFake = () => {
  globalThis.localStorage?.clear();
  return Object.assign(fake, blank());
};

// theme().accent === "#accent": a test can tell which token a view used.
const palette = new Proxy({}, { get: (_t, name) => (typeof name === "string" ? `#${name}` : undefined) });

export const spaces = () => fake.spaces;
export const panes = () => fake.panes;
export const focused = () => fake.focused;
export const terminals = () => fake.terminals;
export const machines = () => fake.machines;
export const agents = () => fake.agents;
export const layout = () => fake.layout;
export const props = () => fake.props;
export const home = () => fake.home;
export const shared = (key) => fake.shared[key];
export const setShared = (key, value) => { fake.shared[key] = value; return null; };
export const run = (name, args) => { fake.runs.push([name, args]); return null; };
export const setAgentOrder = (addresses) => { fake.order = addresses; return null; };
export const openOverlay = (spec) => { fake.overlays.push(spec); return "o1"; };
export const closeOverlay = (id) => { fake.closed.push(id); return null; };
export const theme = () => palette;
export const keys = () => fake.keys;
export const settings = () => ({ zoom: 1, font_family: "JetBrains Mono" });
export const window = () => ({ platform: "macos", active: fake.active });
export const setBadge = (text) => { fake.badges.push(text); return null; };
export const notify = (n) => { fake.notes.push(n); return `n${fake.notes.length}`; };
export const checking = () => fake.checking;
export const appHome = () => "/home/test/.config/herdr-app";
export const exec = async (cmd, args = [], options = {}) => {
  fake.execs.push({ cmd, args, options });
  return { code: 0, stdout: "", stderr: "", ...(await fake.exec(cmd, args, options)) };
};
export const readTextFile = async (path, options = {}) => {
  fake.reads.push({ path, options });
  return fake.files[path] ?? null;
};
export const watchFolder = never;
