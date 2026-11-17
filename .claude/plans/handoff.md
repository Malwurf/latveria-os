# Plan: hand off a conversation to another account

- **Design:** `../GEM/.claude/designs/latveria-os-handoff.md` (17.11.2026)
- **OpenSpec:** `openspec/changes/add-account-handoff/` (full: `agent-profile` modified, `account-handoff` new)
- **Branch:** `feat/account-handoff` (checkout in `~/Projects/latveria-os`, no worktree)
- **Gate:** `npm run lint` · `npm test` · `npm run privacy`
- **Baseline:** 274 tests, all green (`main` b8295e5)

## Skeleton

| Phase | Result a person can check | Shape |
|---|---|---|
| A. Labels | `hc get <t>` on a fresh Claude session shows `latveria.transcript` and `latveria.cwd` | `~ hooks/latveria-label.sh`, `~ test/hook.test.mjs` |
| B. Hand-off core | `sh -c "$HANDOFF_SH" …` on a temp HOME copies the conversation and starts `claude --resume <id> --fork-session` with the right `CLAUDE_CONFIG_DIR` | `+ mods/latveria-agents/handoff.js`, `~ mods/latveria-agents/profile.js` (keeps `claudeDir`), `+ test/handoff.test.mjs`, `~ test/profile.test.mjs` |
| C. Button and popup | Hover a done agent → button → popup `Work · 5h 6% · 7d 27%` → new tab `→ Work` running the same conversation | `~ mods/latveria-agents/main.js`, `~ test/agents.test.mjs` |
| D. Docs and live | README/RECIPE describe it; a real hand-off there and back | `~ README.md`, `~ RECIPE.md` |

Each phase is real code end to end for its slice: A ships labels the current UI ignores; B ships the functions and
the script with their own tests; C wires them to the row; D documents and proves it live.

**Open questions:** none blocking. Settled in the design and the brainstorm (scenario: account limit; trigger: row
button; fork on every hop; start folder from a label; local agents only; old tab stays). One unknown is a task, not
a question: what `hc label` accepts (task 1).

## Phase A — conversation labels

### Task 1: Probe `hc label`

**Files:** none (probe only; the result goes into the PR description).
**Changes:** first confirm the subcommands (`hc --help`: `run --bg`, `get`, `label <t> k=v...`, `kill`), then on a
throwaway terminal check that **three pairs in one call** all land (the hook relies on it) and that a value of
exactly 1024 characters with spaces, `=` and `'` round-trips.
**Code:**
```sh
hc --help | grep -E '^\s+(run|get|label|kill) '
t=$(hc run --bg sh -c 'sleep 120' | head -1)   # the new terminal's id
v="/tmp/a b=c'd/"; v="$v$(head -c $((1024 - ${#v})) /dev/zero | tr '\0' x)"; echo "${#v}"   # 1024
hc label "$t" "latveria.p1=x" "latveria.p2=y" "latveria.probe=$v"
hc get "$t" | grep -E 'latveria\.(p1|p2|probe)'
hc kill "$t"
```
**Verify:** the commands above.
**Done when:** all three labels show and the long value is intact. If several pairs per call fail, Task 3 labels in
three calls; if 1024 fails, lower the bound in the spec, hook and `handoff.js` to the largest value that works.

### Task 2: Hook tests for the conversation labels (red)

**Files:** `test/hook.test.mjs`
**Changes:** `run()` takes an optional `input` (the hook's stdin JSON); new cases.
**Code:**
```js
// replace run(shell, env) with:
function run(shell, env, input) {
  let code = 0;
  let stdout;
  try {
    stdout = execFileSync(shell, [HOOK], { env, encoding: "utf8", input: input ?? "" });
  } catch (err) {
    code = err.status;
    stdout = err.stdout;
  }
  return { code, stdout };
}

// new tests, after CASES:
const ID = "0f1e2d3c-4b5a-4968-8778-a1b2c3d4e5f6";
const conv = (home, over = {}) => JSON.stringify({ session_id: ID, source: "startup",
  transcript_path: join(home, ".claude", "projects", "-src-app", `${ID}.jsonl`), cwd: "/src/app", ...over });

for (const shell of SHELLS) {
  test(`${shell}: labels the transcript and start folder beside the profile`, () => {
    const s = setup();
    const r = run(shell, s.env, conv(s.home));
    assert.equal(r.code, 0);
    assert.equal(r.stdout, "");
    assert.equal(logOf(s.log), `label t7 latveria.profile=Personal latveria.transcript=${join(s.home, ".claude", "projects", "-src-app", `${ID}.jsonl`)} latveria.cwd=/src/app\n`);
  });

  test(`${shell}: a folder with spaces and quotes is one label`, () => {
    const s = setup();
    run(shell, s.env, conv(s.home, { cwd: "/src/my app's" }));
    assert.match(logOf(s.log), / latveria\.cwd=\/src\/my app's\n$/);
  });

  test(`${shell}: CLAUDE_CONFIG_DIR given with ~ and a trailing slash still matches`, () => {
    const s = setup();
    s.env.CLAUDE_CONFIG_DIR = "~/.claude-work/";
    run(shell, s.env, conv(s.home, { transcript_path: join(s.home, ".claude-work", "projects", "-src-app", `${ID}.jsonl`) }));
    assert.match(logOf(s.log), /^label t7 latveria\.profile=Work latveria\.transcript=/);
  });

  const BAD = [
    ["outside the session's projects", (h) => ({ transcript_path: join(h, ".claude-work", "projects", "-src-app", `${ID}.jsonl`) })],
    ["slug ..", (h) => ({ transcript_path: join(h, ".claude", "projects", "..", `${ID}.jsonl`) })],
    ["nested folder", (h) => ({ transcript_path: join(h, ".claude", "projects", "a", "b", `${ID}.jsonl`) })],
    ["not a uuid", (h) => ({ transcript_path: join(h, ".claude", "projects", "-src-app", "notes.jsonl") })],
    ["uppercase uuid", (h) => ({ transcript_path: join(h, ".claude", "projects", "-src-app", `${ID.toUpperCase()}.jsonl`) })],
    ["relative folder", () => ({ cwd: "src/app" })],
    ["newline in folder", () => ({ cwd: "/src/app\nlatveria.profile=Work" })],
    ["folder over 1024", () => ({ cwd: `/${"x".repeat(1024)}` })],
    ["transcript over 1024", (h) => ({ transcript_path: join(h, ".claude", "projects", "x".repeat(1024), `${ID}.jsonl`) })],
    ["missing transcript", () => ({ transcript_path: null })],
    ["not JSON", () => null],
  ];
  for (const [why, over] of BAD) {
    test(`${shell}: ${why} → only the profile`, () => {
      const s = setup();
      const o = over(s.home);
      run(shell, s.env, o === null ? "{oops" : conv(s.home, o));
      assert.equal(logOf(s.log), "label t7 latveria.profile=Personal\n");
    });
  }

  test(`${shell}: only the first JSON object on stdin counts`, () => {
    const s = setup();
    run(shell, s.env, conv(s.home) + conv(s.home, { cwd: "/other" }));
    assert.match(logOf(s.log), / latveria\.cwd=\/src\/app\n$/);
  });

  test(`${shell}: a second run labels the new conversation`, () => {
    const s = setup();
    run(shell, s.env, conv(s.home));
    const next = "11111111-2222-4333-8444-555555555555";
    run(shell, s.env, conv(s.home, { source: "clear", transcript_path: join(s.home, ".claude", "projects", "-src-app", `${next}.jsonl`) }));
    assert.match(logOf(s.log).split("\n")[1], new RegExp(`latveria\\.transcript=.*${next}\\.jsonl `));
  });
}
```
**Verify:** `node --test test/hook.test.mjs`
**Done when:** the new tests fail (the hook ignores stdin) and every existing test still passes.

### Task 3: Hook labels the conversation (green)

**Files:** `hooks/latveria-label.sh`
**Changes:** after the key is known, read up to 64 KiB of stdin, let one `jq` print the transcript and folder only
when both are valid, label all three in one `hc label`.
**Code:** replace the last two lines (`"$hc" label … ` and `exit 0`) with:
```sh
# The conversation, for a hand-off to another profile: its transcript and the folder it started in, both checked.
# jq prints them on two lines only when valid (no control characters, so no newline), else nothing.
dir=${CLAUDE_CONFIG_DIR:-$HOME/.claude}
case "$dir" in "~") dir=$HOME ;; "~/"*) dir="$HOME/${dir#"~/"}" ;; esac
dir=${dir%/}
conv=$(head -c 65536 2>/dev/null | jq -rn --arg d "$dir/projects/" '
  def ok: type == "string" and startswith("/") and length <= 1024 and (test("[\u0000-\u001f\u007f]") | not);
  input | select(type == "object") | .transcript_path as $t | .cwd as $c
  | select(($t | ok) and ($c | ok) and ($t | startswith($d)))
  | ($t | ltrimstr($d) | split("/")) as $p
  | select(($p | length) == 2 and ($p[0] | test("^[A-Za-z0-9._-]+$")) and $p[0] != "." and $p[0] != ".."
      and ($p[1] | test("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.jsonl$")))
  | $t, $c' 2>/dev/null)
tp=${conv%%"
"*}
cwd=${conv#*"
"}
if [ -n "$conv" ] && [ "$tp" != "$conv" ]; then
  "$hc" label "$HC_TERMINAL_ID" "latveria.profile=$key" "latveria.transcript=$tp" "latveria.cwd=$cwd" >/dev/null 2>&1
else
  "$hc" label "$HC_TERMINAL_ID" "latveria.profile=$key" >/dev/null 2>&1
fi
exit 0
```
Also update the header comment: the hook also labels the conversation's transcript and start folder.
**Verify:** `node --test test/hook.test.mjs` then `npm test`
**Done when:** all hook tests pass in sh and dash; full suite green.

**Checkpoint A** — labels done: run the gate, commit `feat(hook): label the conversation's transcript and start folder`.

## Phase B — hand-off core

### Task 4: Profiles keep `claudeDir` (red → green)

**Files:** `test/profile.test.mjs`, `mods/latveria-agents/profile.js`
**Changes:** `parseProfiles` keeps a valid `claudeDir` as `dir` (string starting with `~/` or `/`, ≤ 1024, no
control characters, no `..` segment); invalid → `dir: null`. Existing fields unchanged.
**Code (test):**
```js
test("a profile keeps a valid claudeDir as dir, else null", () => {
  const list = parseProfiles(JSON.stringify({ profiles: [
    { key: "A", claudeDir: "~/.claude" }, { key: "B", claudeDir: "/home/test/.claude-b" },
    { key: "C", claudeDir: "relative" }, { key: "D", claudeDir: "~/../etc" }, { key: "E", claudeDir: "/a\nb" }, { key: "F" },
  ] }));
  assert.deepEqual(list.map((p) => p.dir), ["~/.claude", "/home/test/.claude-b", null, null, null, null]);
});
```
**Code (profile.js):**
```js
const DIR = (d) => typeof d === "string" && (d.startsWith("~/") || d.startsWith("/")) && d.length <= 1024
  && !/[\u0000-\u001f\u007f]/.test(d) && !d.split("/").includes("..");
// in parseProfiles' map, add:
    dir: DIR(p.claudeDir) ? p.claudeDir : null,
```
Existing exact assertions change to the new shape: `test/profile.test.mjs` "parses a profile map" expects
`{ key: "Personal", label: "Personal", color: "#e3b341", dir: "~/.claude" }` and
`{ key: "Work", label: "Work", color: "#6ea8fe", dir: "~/.claude-work" }`; "bad colors and long labels are tamed"
expects `{ key: "W", label: "x".repeat(16), color: null, dir: null }`. Grep `test/` for other `parseProfiles`
`deepEqual`s and update them the same way.
**Verify:** `node --test test/profile.test.mjs test/agents.test.mjs`
**Done when:** new test passes, existing profile and agents tests pass.

### Task 5: Pure hand-off functions — tests (red)

**Files:** `test/handoff.test.mjs` (new)
**Code:**
```js
import { test } from "node:test";
import assert from "node:assert/strict";
const H = await import("../mods/latveria-agents/handoff.js");

const HOME = "/home/test";
const ID = "0f1e2d3c-4b5a-4968-8778-a1b2c3d4e5f6";
const P = [{ key: "Personal", label: "Personal", dir: "~/.claude" }, { key: "Work", label: "Work", dir: "~/.claude-work" }];
const T = `${HOME}/.claude/projects/-src-app/${ID}.jsonl`;
const labels = (o = {}) => ({ "latveria.profile": "Personal", "latveria.transcript": T, "latveria.cwd": "/src/app", ...o });
const agent = (o = {}) => ({ address: "t1", status: "done", space: "s1", ...o });

test("expand: ~ and a trailing slash", () => {
  assert.equal(H.expand("~/.claude/", HOME), `${HOME}/.claude`);
  assert.equal(H.expand("/abs", HOME), "/abs");
  assert.equal(H.expand(null, HOME), null);
});

test("isTranscript: projects/<slug>/<uuid>.jsonl under the folder, nothing else", () => {
  const dir = `${HOME}/.claude`;
  assert.deepEqual(H.isTranscript(T, dir), { slug: "-src-app", id: ID });
  for (const bad of [
    `${HOME}/.claude-work/projects/-src-app/${ID}.jsonl`, `${dir}/projects/../${ID}.jsonl`, `${dir}/projects/a/b/${ID}.jsonl`,
    `${dir}/projects/-src-app/notes.jsonl`, `${dir}/projects/-src-app/${ID}.json`, `${dir}/projectsX/-src-app/${ID}.jsonl`,
    `${dir}/projects/-src-app/${ID}.jsonl\n`, "relative/x.jsonl", null,
  ]) assert.equal(H.isTranscript(bad, dir), null, String(bad));
});

test("source: a local agent that isn't working, with labels and another profile", () => {
  assert.deepEqual(H.source(agent(), labels(), P, HOME), { key: "Personal", transcript: T, cwd: "/src/app", space: "s1", slug: "-src-app", id: ID });
  for (const status of ["blocked", "done", "idle"]) assert.ok(H.source(agent({ status }), labels(), P, HOME), status);
});

test("source: no button for working, remote, missing labels, one profile, unknown profile, bad folder", () => {
  assert.equal(H.source(agent({ status: "working" }), labels(), P, HOME), null);
  assert.equal(H.source(agent({ address: "laptop/t1" }), labels(), P, HOME), null);
  assert.equal(H.source(agent(), labels({ "latveria.transcript": undefined }), P, HOME), null);
  assert.equal(H.source(agent(), labels({ "latveria.cwd": "src" }), P, HOME), null);
  assert.equal(H.source(agent(), labels(), [P[0]], HOME), null);
  assert.equal(H.source(agent(), labels({ "latveria.profile": "Other" }), P, HOME), null);
  assert.equal(H.source(agent(), labels(), [P[0], { ...P[1], dir: null }], HOME), null);
});

test("targets: every other profile with a folder", () => {
  assert.deepEqual(H.targets("Personal", [...P, { key: "X", label: "X", dir: null }]).map((p) => p.key), ["Work"]);
});

test("handoffArgv: fixed script, values only as arguments", () => {
  const src = H.source(agent(), labels(), P, HOME);
  const argv = H.handoffArgv(src, P[1], HOME);
  assert.deepEqual(argv, ["sh", "-c", H.HANDOFF_SH, "latveria-handoff", T, `${HOME}/.claude-work/projects/-src-app`, ID, `${HOME}/.claude-work`]);
  assert.ok(!H.HANDOFF_SH.includes(T) && !H.HANDOFF_SH.includes(ID));
  assert.equal(H.handoffArgv(src, { ...P[1], dir: null }, HOME), null);
});

test("limits: a snapshot's 5h and 7d, ? without one, 0 after a reset", () => {
  const now = 1_800_000_000;
  const snap = JSON.stringify({ rate_limits: { five_hour: { used_percentage: 6.4, resets_at: now + 60 }, seven_day: { used_percentage: 27, resets_at: now - 1 } } });
  assert.equal(H.limits(snap, now), "5h 6% · 7d 0%");
  assert.equal(H.limits(null, now), "5h ? · 7d ?");
  assert.equal(H.limits("{oops", now), "5h ? · 7d ?");
  assert.equal(H.limits(JSON.stringify({ rate_limits: { seven_day: { used_percentage: 3, resets_at: now + 9 } } }), now), "5h 0% · 7d 3%");
  assert.equal(H.limits(JSON.stringify({ rate_limits: { five_hour: { used_percentage: 140 }, seven_day: { used_percentage: "x" } } }), now), "5h 100% · 7d ?");
});
```
**Verify:** `node --test test/handoff.test.mjs`
**Done when:** fails with "Cannot find module" (red).

### Task 6: Pure hand-off functions (green)

**Files:** `mods/latveria-agents/handoff.js` (new)
**Code:**
```js
// Hand a local agent's Claude conversation to another profile of this computer. A new tab runs HANDOFF_SH, which
// copies the transcript (and its folder of saved tool outputs) into that profile's projects/ without overwriting
// and resumes it there as a fork. Values reach the shell only as positional arguments.
export const TRANSCRIPT = "latveria.transcript";
export const CWD = "latveria.cwd";
const PROFILE = "latveria.profile";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SLUG = /^[A-Za-z0-9._-]+$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const MAX = 1024;
const okPath = (p) => typeof p === "string" && p.startsWith("/") && p.length <= MAX && !CONTROL.test(p);

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
  if (!agent || agent.status === "working" || String(agent.address).includes("/")) return null;
  const key = labels?.[PROFILE];
  const from = profiles.find((p) => p.key === key);
  if (!from?.dir || !targets(key, profiles).length) return null;
  const at = isTranscript(labels?.[TRANSCRIPT], expand(from.dir, home));
  const cwd = labels?.[CWD];
  if (!at || !okPath(cwd)) return null;
  return { key, transcript: labels[TRANSCRIPT], cwd, space: agent.space, ...at };
}

// $1 transcript, $2 target projects/<slug>, $3 uuid, $4 target Claude folder. Never overwrites; on failure it says
// why and waits, so the tab doesn't vanish with the reason.
export const HANDOFF_SH = `set -u
src=$1 dst=$2 id=$3 dir=$4
fail() { printf 'Hand-off failed: %s\\nPress Enter to close.' "$1" >&2; read -r _; exit 1; }
copy() {
  [ -e "$2" ] && return 0
  cp -R -- "$1" "$2.latveria-tmp.$$" && mv -- "$2.latveria-tmp.$$" "$2"
}
mkdir -p -- "$dst" || fail "cannot create $dst"
copy "$src" "$dst/$id.jsonl" || fail "cannot copy the conversation"
side=\${src%.jsonl}
if [ -d "$side" ]; then copy "$side" "$dst/$id" || fail "cannot copy its saved tool outputs"; fi
claude=$(command -v claude 2>/dev/null) || claude="$HOME/.local/bin/claude"
[ -x "$claude" ] || fail "claude not found"
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

// "5h 6% · 7d 27%" from a quota snapshot (hooks/latveria-quota.sh); "?" for a missing window of a broken
// snapshot, 0 for a window already reset or left out beside the other (as the status bar reads them).
export function limits(text, now) {
  let data = null;
  try { data = JSON.parse(text); } catch { /* none */ }
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
```
**Verify:** `node --test test/handoff.test.mjs`, `npm run lint`, `node --test test/rules.test.mjs` (the scanner of
Zasada 2 forbids `rm -`, so the script has none)
**Done when:** all handoff tests pass, lint 0, rules green.

### Task 7: The script on a temporary HOME (red → green)

**Files:** `test/handoff.test.mjs`
**Changes:** run `HANDOFF_SH` for real with a fake `claude` that records its arguments and `CLAUDE_CONFIG_DIR`.
**Code:**
```js
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after } from "node:test";

const roots = [];
after(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

function world({ slugName = "-src-app", withClaude = true, claudeIn = "bin" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "latveria-handoff-"));
  roots.push(root);
  const home = join(root, "home");
  const bin = join(root, "bin");
  const src = join(home, ".claude", "projects", slugName);
  mkdirSync(join(src, ID, "tool-results"), { recursive: true });
  mkdirSync(join(home, ".claude-work"), { recursive: true });
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(src, `${ID}.jsonl`), "{\"a\":1}\n");
  writeFileSync(join(src, ID, "tool-results", "x.txt"), "big");
  const log = join(root, "claude.log");
  const cdir = claudeIn === "local" ? join(home, ".local", "bin") : bin;
  mkdirSync(cdir, { recursive: true });
  if (withClaude) writeFileSync(join(cdir, "claude"), `#!/bin/sh\nprintf '%s\\n' "\${CLAUDE_CONFIG_DIR-UNSET}" "$@" > "${log}"\n`, { mode: 0o755 });
  return { root, home, bin, src, log, transcript: join(src, `${ID}.jsonl`) };
}
const runScript = (w, dir, slug = "-src-app") => spawnSync("/bin/sh", ["-c", H.HANDOFF_SH, "latveria-handoff", w.transcript, join(dir, "projects", slug), ID, dir],
  { env: { HOME: w.home, PATH: `${w.bin}:/usr/bin:/bin` }, encoding: "utf8", input: "\n" });

test("script: copies the conversation and its tool outputs, resumes as a fork with the target's folder", () => {
  const w = world();
  const dir = join(w.home, ".claude-work");
  const r = runScript(w, dir);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(join(dir, "projects", "-src-app", `${ID}.jsonl`), "utf8"), "{\"a\":1}\n");
  assert.equal(readFileSync(join(dir, "projects", "-src-app", ID, "tool-results", "x.txt"), "utf8"), "big");
  assert.deepEqual(readFileSync(w.log, "utf8").trim().split("\n"), [dir, "--resume", ID, "--fork-session"]);
  assert.equal(readFileSync(w.transcript, "utf8"), "{\"a\":1}\n", "source untouched");
});

test("script: back to ~/.claude runs with CLAUDE_CONFIG_DIR unset and makes no .claude.json", () => {
  const w = world();
  const r = runScript(w, join(w.home, ".claude"));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(w.log, "utf8").split("\n")[0], "UNSET");
  assert.ok(!existsSync(join(w.home, ".claude", ".claude.json")));
});

test("script: an existing target file is left as it is", () => {
  const w = world();
  const dir = join(w.home, ".claude-work");
  mkdirSync(join(dir, "projects", "-src-app"), { recursive: true });
  writeFileSync(join(dir, "projects", "-src-app", `${ID}.jsonl`), "older\n");
  assert.equal(runScript(w, dir).status, 0);
  assert.equal(readFileSync(join(dir, "projects", "-src-app", `${ID}.jsonl`), "utf8"), "older\n");
});

test("script: hostile folder names stay one argument", () => {
  const w = world();
  const dir = join(w.home, "-n $(touch pwned) 'x'");
  mkdirSync(dir, { recursive: true });
  assert.equal(runScript(w, dir).status, 0);
  assert.ok(!existsSync(join(w.root, "pwned")) && !existsSync("pwned"));
  assert.equal(readFileSync(w.log, "utf8").split("\n")[0], dir);
});

test("script: claude only in ~/.local/bin is found", () => {
  const w = world({ claudeIn: "local" });
  assert.equal(runScript(w, join(w.home, ".claude-work")).status, 0);
  assert.equal(readFileSync(w.log, "utf8").split("\n")[1], "--resume");
});

test("script: without claude it says so and fails", () => {
  const w = world({ withClaude: false });
  const r = runScript(w, join(w.home, ".claude-work"));
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /claude not found/);
});
```
**Verify:** `node --test test/handoff.test.mjs`
**Done when:** all script tests pass on macOS `/bin/sh` (fix the script, never the assertion, if one fails);
`npm test` and `npm run lint` green (Checkpoint B needs the whole gate).

**Checkpoint B** — gate, commit `feat(agents): hand-off core — sources, targets and the copy-and-resume script`.

## Phase C — button and popup

### Task 8: Row button and popup — tests (red)

**Files:** `test/agents.test.mjs`
**Code:**
```js
const H = await import("../mods/latveria-agents/handoff.js");
const ID = "0f1e2d3c-4b5a-4968-8778-a1b2c3d4e5f6";
const TR = `/home/test/.claude/projects/-src-app/${ID}.jsonl`;
const handReady = (address = "t1", status = "done") => {
  fake.agents = [agent(address, status)];
  fake.terminals = [{ address, state: "live", labels: { [LABEL]: "Personal", "latveria.transcript": TR, "latveria.cwd": "/src/app" } }];
  fake.files[PROFILES] = MAP;
};
const hover = (v, address) => { v.hovered = address; return v.render(cx); };
const buttonOf = (tree, address) => nodes(tree).find((n) => has(n, "id", `handoff-${address}`));
const click = (n) => n.calls.find(([m]) => m === "on_click")[1]({}, cx);

test("hand-off button on a hovered local agent that isn't working", async () => {
  handReady();
  const v = await opened();
  assert.ok(!buttonOf(v.render(cx), "t1"), "not without hover");
  assert.ok(buttonOf(hover(v, "t1"), "t1"));
});

test("no hand-off button for working, remote, or unlabelled agents", async () => {
  handReady("t1", "working");
  assert.ok(!buttonOf(hover(await opened(), "t1"), "t1"));
  handReady("laptop/t2", "done");
  assert.ok(!buttonOf(hover(await opened(), "laptop/t2"), "laptop/t2"));
  handReady();
  delete fake.terminals[0].labels["latveria.cwd"];
  assert.ok(!buttonOf(hover(await opened(), "t1"), "t1"));
});

test("the narrow rail shows no hand-off button", async () => {
  handReady();
  fake.layout = { id: "root", children: [{ id: "sidebar", size: { px: 76 } }] };
  assert.ok(!buttonOf(hover(await opened(), "t1"), "t1"));
});

test("the button opens a popup with the hand-off's source", async () => {
  handReady();
  const v = await opened();
  click(buttonOf(hover(v, "t1"), "t1"));
  const o = fake.overlays.at(-1);
  assert.equal(o.mod, "latveria-agents");
  assert.equal(o.kind, "popup");
  assert.deepEqual(o.props.handoff, { key: "Personal", transcript: TR, cwd: "/src/app", space: "s1", slug: "-src-app", id: ID });
});

test("the popup lists the other profiles with their limits, then opens the tab and closes", async () => {
  fake.files[PROFILES] = MAP;
  fake.files["/home/test/.cache/latveria/quota-Work.json"] = JSON.stringify({ rate_limits: {
    five_hour: { used_percentage: 6, resets_at: Math.floor(Date.now() / 1000) + 600 },
    seven_day: { used_percentage: 27, resets_at: Math.floor(Date.now() / 1000) + 6000 } } });
  const src = { key: "Personal", transcript: TR, cwd: "/src/app", space: "s1", slug: "-src-app", id: ID };
  fake.props = { handoff: src, overlay: "o9" };
  const v = await opened();
  const tree = v.render(cx);
  assert.match(text(tree), /Work · 5h 6% · 7d 27%/);
  assert.ok(!text(tree).includes("Personal ·"), "not the source profile");
  click(nodes(tree).find((n) => has(n, "id", "handoff-to-Work")));
  const [name, args] = fake.runs.at(-1);
  assert.equal(name, "tab.new");
  assert.deepEqual(args, { space: "s1", folder: "/src/app", name: "→ Work", argv: H.handoffArgv(src, { dir: "~/.claude-work" }, "/home/test") });
  assert.deepEqual(fake.closed, ["o9"]);
});

test("a target without a snapshot shows ?", async () => {
  fake.files[PROFILES] = MAP;
  fake.props = { handoff: { key: "Personal", transcript: TR, cwd: "/src/app", space: "s1", slug: "-src-app", id: ID }, overlay: "o9" };
  assert.match(text((await opened()).render(cx)), /Work · 5h \? · 7d \?/);
});
```
**Verify:** `node --test test/agents.test.mjs`
**Done when:** the new tests fail, the old ones pass.

### Task 9: Popup (green for the popup tests)

**Files:** `mods/latveria-agents/main.js`
**Changes:** steps 1–4 below.
**Verify:** `node --test test/agents.test.mjs` (the three popup tests pass; button tests still red)
**Done when:** popup tests green, other existing tests green.

### Task 10: Row button (green)

**Files:** `mods/latveria-agents/main.js`
**Changes:** step 5 below.
**Verify:** `node --test test/agents.test.mjs`, `npm test`, `npm run lint`, `herdr-app check mods/latveria-agents`
**Done when:** all green; `herdr-app check` reports no errors.

Steps for Tasks 9–10:

1. Import: `import { source, targets, handoffArgv, limits } from "./handoff.js";`
2. `init`: before `if (props()?.sortMenu) return;` add
   ```js
   if (props()?.handoff) { this.loadTargets(cx); return; }
   ```
3. New methods:
   ```js
   // The popup: this computer's other profiles and their limits from local snapshots.
   loadTargets(cx) {
     this.targets = [];
     cx.spawn(async (cx) => {
       const all = await profilesOn(null);
       const now = Math.floor(Date.now() / 1000);
       this.targets = await Promise.all(targets(props().handoff.key, all).map(async (p) => ({ ...p,
         limits: limits(await readTextFile(`${home()}/.cache/latveria/quota-${p.key}.json`).catch(() => null), now) })));
       cx.notify();
     });
   }

   handoffMenu(t) {
     const src = props().handoff;
     return v_flex().w_full().p(5).bg(t.popover).text_size(13)
       .child(div().px(8).pt(4).pb(6).text_size(12).text_color(t.dim).child("Continue this conversation on"))
       .children((this.targets ?? []).map((p) => h_flex()
         .id(`handoff-to-${p.key}`)
         .h(31).px(8).gap(9).rounded(7).items_center().text_color(t.foreground)
         .hover((el) => el.bg(t.hover))
         .on_click(() => {
           const argv = handoffArgv(src, p, home());
           if (argv) run("tab.new", { space: src.space, folder: src.cwd, name: `→ ${p.label}`, argv });
           closeOverlay(props().overlay);
         })
         .child(div().size(8).flex_none().rounded(4).when(Boolean(p.color), (el) => el.bg(p.color)).when(!p.color, (el) => el.border(1.5).border_color(t.dim)))
         .child(div().flex_1().child(`${p.label} · ${p.limits}`))));
   }
   ```
4. `render`: next to `if (props()?.sortMenu) return this.sortMenu(t);` add `if (props()?.handoff) return this.handoffMenu(t);`
5. In `row`, after `const pin = …;` add the button, and show it beside the pin while hovered:
   ```js
   const hand = this.hovered === a.address ? source(a, terminalByAddress.get(a.address)?.labels, this.profiles.get(null) ?? [], home()) : null;
   const handBtn = hand && div()
     .id(`handoff-${a.address}`)
     .flex_none().p(2).rounded(4).text_color(t.dim).cursor_pointer()
     .hover((s) => s.bg(t.hover).text_color(t.foreground))
     .tooltip("Continue on another account")
     .on_click((_e, cx) => {
       cx.stop_propagation();
       const n = targets(hand.key, this.profiles.get(null) ?? []).length;
       openOverlay({ mod: "latveria-agents", kind: "popup", width: 260, height: 40 + 31 * n, props: { handoff: hand } });
     })
     .child(svg("mods/workspace-chrome/git-compare.svg").size(13));
   ```
   and change `.when(this.hovered === a.address, el => el.child(pin))` to
   `.when(this.hovered === a.address, el => el.when(Boolean(handBtn), (e) => e.child(handBtn)).child(pin))`.
   The collapsed rail returns earlier, so it never shows the button.

**Checkpoint C** — gate, commit `feat(agents): hand-off button and popup on agent rows`; install with
`node install.mjs` and look at a hovered done agent.

## Phase D — docs and live check

### Task 11: README and RECIPE

**Files:** `README.md`, `RECIPE.md`
**Changes:** README: a "Hand off to another account" section — what the button does, when it shows, the new labels,
the limits (`/rewind` stays behind, project memory may differ, model and permission mode start from the target's
defaults, the target reads the whole conversation without cache, local agents only). RECIPE: under "How it behaves"
the button and popup; under "Built from" `tab.new`, `openOverlay`, the two labels and `HANDOFF_SH`; under "Watch out"
the `~/.claude` trap and `--fork-session`.
**Verify:** `npm run privacy`; `grep -c -E 'fork-session|/rewind|latveria.transcript|latveria.cwd' README.md RECIPE.md`
**Done when:** privacy clean; README names the button, both labels, `--fork-session` and each of the five limits;
RECIPE names `tab.new`, `openOverlay`, `HANDOFF_SH` and the `~/.claude` trap.

### Task 12: Live hand-off there and back

**Files:** none.
**Changes:** with mods and hook installed (`node install.mjs`), start a small Claude session on the default account
in a Herdr tab, say a secret word, end the turn; hover → button → second account → new tab; ask for the word; then
hand that new session back. Check: two new session ids, source files unchanged (`shasum` before/after), no
`~/.claude/.claude.json`.
**Verify:** the checks above, recorded in the PR description.
**Done when:** both hops resume with the secret word and every check holds.

### Task 13: Close the change and land

**Files:** `openspec/changes/add-account-handoff/tasks.md`, `openspec/specs/**`
**Changes:** tick `tasks.md`, `openspec archive add-account-handoff -y`, gate, PR, `/review` (≤ 2 waves), `pr_land.py`,
GEM decision log and VVD #421.
**Verify:** `openspec validate --specs --strict`; gate; `pr_land.py` exit 0
**Done when:** merged on `main`, hub and card updated.

## Dependency graph

```
1 → 2 → 3 ─┐
4 → 5 → 6 → 7 ─┤→ 8 → 9 → 10 → 11 → 12 → 13
```
Phase A (1–3) and tasks 4–7 are independent and can run in parallel; 8 needs 3 (labels), 4 (`dir`) and 6 (functions).

**Total:** 13 tasks · checkpoints after 3, 7, 10.

## Scope review (fresh subagent, 17.11) — folded in

`rm` in the script broke Zasada 2's scanner → unique temp name; unused import; privacy paths in fixtures; exact
profile assertions spelled out; probe covers three pairs per `hc label` call and exactly 1024 characters; jq reads
only the first JSON object; tests added for the rail, `~/.local/bin/claude`, a transcript over 1024 and clamped
limits; weak hover assertion fixed; Task 9 split, landing split from the live check. Symlinked paths: see the open
question in the approval message.
