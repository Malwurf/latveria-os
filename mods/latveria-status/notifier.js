// A macOS banner through terminal-notifier: its arguments and what its exit means. Pure, so tests need no app.
// Only the waiting mode (-action … -timeout) gets a click back; a click ends it at once with empty stdout.
export const WAIT_S = 540;
export const EXEC_TIMEOUT_MS = 600_000;
export const MAX_WAITING = 5;

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

export function notifierArgs(p) {
  const title = clean(p?.title, 120) || "Herdr";
  const message = clean(p?.body, 240) || title;
  return ["-title", plistSafe(title), "-message", plistSafe(message), "-group", groupKey(p),
    "-activate", "dev.herdr.app", "-action", "Show", "-timeout", String(WAIT_S)];
}

// Markers first: a banner nobody clicked ends with @TIMEOUT whatever the exit code (the help says 6). "missing":
// the program can't start (not installed) or exits 3 (notifications not allowed); "failed": anything else.
export function outcome(r) {
  if (r instanceof Error) return "missing";
  if (!r) return "failed";
  if (/@(TIMEOUT|CLOSED)/.test(r.stdout ?? "")) return "ignored";
  if (r.code === 0) return "clicked";
  return r.code === 3 ? "missing" : "failed";
}
