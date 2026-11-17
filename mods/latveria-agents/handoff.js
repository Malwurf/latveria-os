// Hand a local agent's Claude conversation to another profile of this computer. A new tab runs HANDOFF_SH, which
// copies the transcript (and its folder of saved tool outputs) into that profile's projects/ without overwriting
// and resumes it there as a fork. Values reach the shell only as positional arguments.
import { LABEL as PROFILE, plainPath } from "./profile.js";

export const TRANSCRIPT = "latveria.transcript";
export const CWD = "latveria.cwd";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SLUG = /^[A-Za-z0-9._-]+$/;
const okPath = (p) => plainPath(p) && p.startsWith("/");
// Claude names a conversation's folder after its start folder, every character but a letter or digit as "-"
// (long folders get a shortened name, so only folders up to 200 characters are compared).
const slugOf = (cwd) => cwd.replace(/[^A-Za-z0-9]/g, "-");

// A profile's folder as the map writes it, with ~ expanded and no trailing slash (no symlink resolution: the
// resumed session's CLAUDE_CONFIG_DIR and its transcript label then match the map).
export function expand(dir, home) {
  if (typeof dir !== "string") return null;
  const full = dir === "~" ? home : dir.startsWith("~/") ? `${home}${dir.slice(1)}` : dir;
  return full.replace(/\/+$/, "");
}

export function isTranscript(path, dir) {
  if (!okPath(path) || !okPath(dir)) return null;
  const base = `${dir}/projects/`;
  if (!path.startsWith(base)) return null;
  const parts = path.slice(base.length).split("/");
  if (parts.length !== 2) return null;
  const [slug, file] = parts;
  if (!SLUG.test(slug) || slug === "." || slug === ".." || !file.endsWith(".jsonl")) return null;
  const id = file.slice(0, -".jsonl".length);
  return UUID.test(id) ? { slug, id } : null;
}

export const targets = (key, profiles) => profiles.filter((p) => p.key !== key && p.dir);

// What a hand-off starts from, or null when the row gets no button.
export function source(agent, labels, profiles, home) {
  // Labels outlive the program, so another agent later in the same terminal must not offer an old conversation.
  if (!agent || agent.app !== "claude-code" || agent.status === "working" || String(agent.address).includes("/")) return null;
  const key = labels?.[PROFILE];
  const from = profiles.find((p) => p.key === key);
  if (!from?.dir || !targets(key, profiles).length) return null;
  const at = isTranscript(labels?.[TRANSCRIPT], expand(from.dir, home));
  const cwd = labels?.[CWD];
  if (!at || !okPath(cwd) || (cwd.length <= 200 && slugOf(cwd) !== at.slug)) return null;
  return { key, transcript: labels[TRANSCRIPT], cwd, space: agent.space, ...at };
}

// $1 transcript, $2 target projects/<slug>, $3 uuid, $4 target Claude folder. Never overwrites and deletes nothing.
// The tool-output folder goes first and the transcript last, so a transcript in the target means a finished copy;
// a failed copy leaves only <name>.latveria-tmp, which the next try reuses. A target transcript that differs from
// the source (an older hand-off of the same conversation) stops it: resuming would silently drop the newer turns.
// On failure it says why and waits, so the tab doesn't vanish with the reason.
export const HANDOFF_SH = `set -u
src=$1 dst=$2 id=$3 dir=$4
fail() { printf 'Hand-off failed: %s\\nPress Enter to close.' "$1" >&2; read -r _ || true; exit 1; }
claude=$(command -v claude 2>/dev/null) || claude="$HOME/.local/bin/claude"
[ -x "$claude" ] || fail "claude not found"
mkdir -p -- "$dst" || fail "cannot create $dst"
side=\${src%.jsonl}
if [ -d "$side" ] && [ ! -e "$dst/$id" ]; then
  mkdir -p -- "$dst/$id.latveria-tmp" && cp -R -- "$side/." "$dst/$id.latveria-tmp" && mv -- "$dst/$id.latveria-tmp" "$dst/$id" \\
    || fail "cannot copy its saved tool outputs"
fi
if [ -e "$dst/$id.jsonl" ]; then
  cmp -s -- "$src" "$dst/$id.jsonl" || fail "an older copy of this conversation is already on that account; continue it there with claude --resume $id, or keep working here"
else
  cp -- "$src" "$dst/$id.jsonl.latveria-tmp" && mv -n -- "$dst/$id.jsonl.latveria-tmp" "$dst/$id.jsonl" || fail "cannot copy the conversation"
fi
if [ "$(cd -- "$dir" 2>/dev/null && pwd -P)" = "$(cd -- "$HOME/.claude" 2>/dev/null && pwd -P)" ]; then
  exec env -u CLAUDE_CONFIG_DIR "$claude" --resume "$id" --fork-session
fi
exec env CLAUDE_CONFIG_DIR="$dir" "$claude" --resume "$id" --fork-session
`;

export function handoffArgv(src, target, home) {
  const dir = expand(target?.dir, home);
  if (!src || !okPath(dir)) return null;
  return ["sh", "-c", HANDOFF_SH, "latveria-handoff", src.transcript, `${dir}/projects/${src.slug}`, src.id, dir];
}

// "5h 6% · 7d 27%" from a quota snapshot (hooks/latveria-quota.sh); "?" for a broken snapshot or a non-number,
// 0 for a window already reset or left out beside the other (as the status bar reads them), clamped to 0–100.
export function limits(text, now) {
  let data = null;
  try { data = JSON.parse(text); } catch { /* no snapshot */ }
  const rl = data?.rate_limits;
  const has = rl && typeof rl === "object" && (rl.five_hour || rl.seven_day);
  const pct = (w) => {
    if (!has) return "?";
    if (!w) return "0%";
    if (typeof w.resets_at === "number" && w.resets_at <= now) return "0%";
    const n = w.used_percentage;
    return Number.isFinite(n) ? `${Math.min(100, Math.max(0, Math.round(n)))}%` : "?";
  };
  return `5h ${pct(rl?.five_hour)} · 7d ${pct(rl?.seven_day)}`;
}
