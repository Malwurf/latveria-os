// 5h/7d usage limits per Claude profile, from the snapshots hooks/latveria-quota.sh keeps in ~/.cache/latveria.
// A mod cannot import another mod's files, so the key and color checks here mirror latveria-agents/profile.js.
import { exec } from "herdr";

const KEY = /^[A-Za-z0-9_-]{1,24}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

// The statusline's yellow, outside the theme: at least 4.5:1 on `chrome` (test/quota.test.mjs).
export const WARN = "#e8c35a";

// Every snapshot on one machine in one call, through that machine's shell (its own ~), one per line, each capped.
// `; true`: a folder without snapshots is an empty answer, not a failure.
const MAX_LINES = 32;
const MAX_LINE = 4096;
// At most MAX_LINES files, counted in the shell, so a folder full of files cannot flood the answer.
export const QUOTA_SH = `n=0; for f in "$HOME"/.cache/latveria/quota-*.json; do [ "$n" -lt ${MAX_LINES} ] || break; [ -f "$f" ] && head -c ${MAX_LINE} "$f" && echo && n=$((n + 1)); done; true`;

const num = (v) => typeof v === "number" && Number.isFinite(v);

// A window at `now` (seconds): past its reset time it reads 0 %, with no reset time and `reset: true`, so it can be
// told from a window at 0 % without a reset time. Also for readings kept a while.
export const settled = (w, now) => (w && w.resetsAt !== null && w.resetsAt <= now ? { pct: 0, resetsAt: null, reset: true } : w);

// A snapshot whose every window is past its reset and whose numbers have not changed for this long belongs to a
// profile nobody uses any more (deleted or renamed), so it is dropped instead of showing 0 % · 0 % forever.
const ABANDONED = 8 * 86400;

function windowOf(raw, now) {
  if (!raw || typeof raw !== "object" || !num(raw.used_percentage)) return null;
  const resetsAt = num(raw.resets_at) ? raw.resets_at : null;
  return settled({ pct: Math.min(100, Math.max(0, Math.round(raw.used_percentage))), resetsAt }, now);
}

// A snapshot file's text → {key, label, color, updated, five, seven}, or null when it is unusable.
export function parseSnapshot(text, now) {
  let data;
  try { data = JSON.parse(text); } catch { return null; }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const key = data.profile;
  if (typeof key !== "string" || !KEY.test(key) || !num(data.updated)) return null;
  const limits = data.rate_limits && typeof data.rate_limits === "object" ? data.rate_limits : {};
  const read = [windowOf(limits.five_hour, now), windowOf(limits.seven_day, now)];
  if (read.every((w) => !w)) return null;
  // Claude Code leaves a window out while it has no usage, so next to one that is there a missing one reads 0 %.
  const [five, seven] = read.map((w) => w ?? { pct: 0, resetsAt: null, idle: true });
  if ([five, seven].every((w) => w.idle || w.reset) && now - data.updated > ABANDONED) return null;
  return {
    key,
    label: typeof data.label === "string" && data.label.trim() ? data.label.trim().slice(0, 16) : key,
    color: typeof data.color === "string" && COLOR.test(data.color) ? data.color : null,
    updated: data.updated,
    five,
    seven,
  };
}

// As the statusline colors it: green below 50 %, yellow below 80 %, red from 80 %.
export const quotaTone = (pct) => (pct < 50 ? "ok" : pct < 80 ? "warn" : "high");

// Seconds → "4h 47m", "6d 14h", "12m", "<1m".
export function span(sec) {
  const m = Math.floor(sec / 60);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
}

// One machine's readings (null: this one). null when the read failed, so a machine that stopped answering
// can keep its last readings; [] when it answered with none.
export async function readQuotas(on, now) {
  const r = await exec("sh", ["-c", QUOTA_SH], on ? { on, timeout: 5000 } : { timeout: 5000 }).catch(() => null);
  if (r?.code !== 0 || typeof r.stdout !== "string") return null;
  // Longer lines are dropped, not parsed: the shell cuts files at MAX_LINE bytes, so one can only come from elsewhere.
  return r.stdout.split("\n").filter((l) => l.trim() && l.length <= MAX_LINE).slice(0, MAX_LINES)
    .map((l) => parseSnapshot(l, now)).filter(Boolean);
}

// Per window, the later reset is the newer window; on a tie the higher percentage. A reset time beats none.
const newer = (a, b) => {
  if (!a || !b) return a ?? b;
  const ra = a.resetsAt ?? -Infinity;
  const rb = b.resetsAt ?? -Infinity;
  return ra !== rb ? (ra > rb ? a : b) : a.pct >= b.pct ? a : b;
};

// [[machine|null, readings]] → one entry per profile key, with the machine of its newest reading and `sources`,
// every machine it came from with that machine's `updated` (clocks differ, so the bar picks among them):
// this computer first, then machines by name, keys by name within each.
export function mergeQuotas(perMachine) {
  const byKey = new Map();
  for (const [machine, readings] of perMachine) {
    for (const r of readings ?? []) {
      const had = byKey.get(r.key);
      const source = { machine, updated: r.updated };
      if (!had) { byKey.set(r.key, { ...r, machine, sources: [source] }); continue; }
      const top = r.updated > had.updated ? { ...r, machine } : had;
      byKey.set(r.key, { ...top, five: newer(had.five, r.five), seven: newer(had.seven, r.seven), sources: [...had.sources, source] });
    }
  }
  return [...byKey.values()].sort((a, b) => (a.machine !== null) - (b.machine !== null)
    || (a.machine ?? "").localeCompare(b.machine ?? "") || a.key.localeCompare(b.key));
}
