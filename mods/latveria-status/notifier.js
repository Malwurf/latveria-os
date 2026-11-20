// A macOS banner through terminal-notifier: its arguments and what its exit means. Pure, so tests need no app.
// No waiting mode (-action … -timeout): it exits the moment the banner is clicked while macOS is still bringing it
// forward, and macOS then shows "terminal-notifier is not open anymore" (system log, 20.11.2026). Without it macOS
// keeps the banner, and a click relaunches terminal-notifier, which brings Herdr forward and runs `herdr-app do`.
export const EXEC_TIMEOUT_MS = 10_000;
// Herdr can post the same note twice for one wait (seen live 17.11): the same note again within this is held back.
export const REPEAT_MS = 60_000;

// The text comes from a program in a terminal: no control characters, bounded length, passed as one argument.
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
export const clean = (s, max) => String(s ?? "").replace(CONTROL, "").slice(0, max);

const hash = (s) => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0;
  return h.toString(16).padStart(8, "0");
};
const SAFE_ID = /^[A-Za-z0-9_][A-Za-z0-9_./-]{0,63}$/;

// What a note says: tells one note from another, and is the key latveria-toast looks for when a note comes back.
export const noteKey = (n) => `${n?.title ?? ""}\n${n?.body ?? ""}`;

// One banner per agent: a newer one with the same group replaces the older.
export function groupKey(p) {
  const t = p?.action?.args?.terminal;
  return `latveria-${typeof t === "string" && SAFE_ID.test(t) ? t : hash(clean(p?.title, 120))}`;
}

// terminal-notifier reads values as property lists: one starting with [ ( { " ' < is misread and the banner is
// not sent, unless that first character is escaped (its README, "Escaping").
const plistSafe = (s) => (/^[[({"'<]/.test(s) ? `\\${s}` : s);

// herdr-app as `command -v` finds it: an absolute path of plain characters, or nothing (an alias, a function).
const SAFE_PATH = /^\/[A-Za-z0-9._\/-]{1,255}$/;
export const appPath = (stdout) => {
  const line = String(stdout ?? "").split("\n")[0].trim();
  return SAFE_PATH.test(line) ? line : null;
};

// The shell command a click runs: `herdr-app do <action> '<args JSON>'`. It holds no note text: the action name is
// lowercase words joined by dots, the arguments a plain object as one single-quoted argument. Anything else: null.
const ACTION = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;
const MAX_ARGS = 512;
const quoted = (s) => `'${s.replace(/'/g, "'\\''")}'`;
export function clickCommand(action, app) {
  if (!SAFE_PATH.test(app ?? "") || typeof action?.name !== "string" || !ACTION.test(action.name)) return null;
  const args = action.args ?? {};
  if (typeof args !== "object" || Array.isArray(args)) return null;
  const json = JSON.stringify(args);
  return json.length > MAX_ARGS ? null : `${app} do ${action.name} ${quoted(json)}`;
}

export function notifierArgs(p, app = null) {
  const title = clean(p?.title, 120) || "Herdr";
  const message = clean(p?.body, 240) || title;
  const click = clickCommand(p?.action, app);
  return ["-title", plistSafe(title), "-message", plistSafe(message), "-group", groupKey(p),
    "-activate", "dev.herdr.app", ...(click ? ["-execute", click] : [])];
}

// "missing": the program can't start (not installed) or exits 3 (notifications not allowed); "failed": anything else.
export function outcome(r) {
  if (r instanceof Error) return "missing";
  if (!r) return "failed";
  if (r.code === 0) return "shown";
  return r.code === 3 ? "missing" : "failed";
}
