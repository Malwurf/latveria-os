import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// The SessionStart hook labels the Herdr terminal with the profile whose claudeDir is this session's config dir.
const HOOK = new URL("../hooks/latveria-label.sh", import.meta.url).pathname;
const SHELLS = ["/bin/sh", "/bin/dash"].filter((s) => existsSync(s)); // macOS sh is bash in POSIX mode; dash is stricter
const JQ_DIR = dirname(execFileSync("/bin/sh", ["-c", "command -v jq"], { encoding: "utf8" }).trim());
const MAP = { profiles: [{ key: "Personal", claudeDir: "~/.claude" }, { key: "Work", claudeDir: "~/.claude-work" }] };

const roots = [];
after(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

// A fresh HOME with .claude and .claude-work, a fake hc that logs its arguments (and prints noise the hook must
// swallow), and a profiles map: an object, raw text, a function of HOME, or null for none.
function setup({ map = MAP, hcExit = 0, hcIn = "bin" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "latveria-hook-"));
  roots.push(root);
  const home = join(root, "home");
  const bin = join(root, "bin");
  for (const d of [join(home, ".claude"), join(home, ".claude-work"), join(home, ".config", "latveria"), bin]) mkdirSync(d, { recursive: true });
  const content = typeof map === "function" ? map(home) : map;
  if (content != null) writeFileSync(join(home, ".config", "latveria", "profiles.json"), typeof content === "string" ? content : JSON.stringify(content));
  const hcDir = { bin, local: join(home, ".local", "bin") }[hcIn]; // hcIn "none": no hc anywhere
  if (hcDir) {
    mkdirSync(hcDir, { recursive: true });
    writeFileSync(join(hcDir, "hc"), `#!/bin/sh\necho "$@" >> "$HC_LOG"\necho noise\nexit ${hcExit}\n`, { mode: 0o755 });
  }
  const log = join(root, "hc.log");
  const env = { HOME: home, HC_LOG: log, HC_TERMINAL_ID: "t7", PATH: `${bin}:${JQ_DIR}:/usr/bin:/bin` };
  return { root, home, bin, log, env };
}

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

const logOf = (log) => (existsSync(log) ? readFileSync(log, "utf8") : "");

const CASES = [
  ["default ~/.claude → Personal", () => setup(), "label t7 latveria.profile=Personal\n"],
  ["CLAUDE_CONFIG_DIR=$HOME/.claude-work → Work", () => {
    const s = setup();
    s.env.CLAUDE_CONFIG_DIR = join(s.home, ".claude-work");
    return s;
  }, "label t7 latveria.profile=Work\n"],
  ["claudeDir written as ~/.claude-work matches the expanded path", () => {
    const s = setup({ map: { profiles: [{ key: "Work", claudeDir: "~/.claude-work" }] } });
    s.env.CLAUDE_CONFIG_DIR = join(s.home, ".claude-work");
    return s;
  }, "label t7 latveria.profile=Work\n"],
  ["claudeDir absolute with a trailing slash", () => {
    const s = setup({ map: (home) => ({ profiles: [{ key: "Work", claudeDir: `${join(home, ".claude-work")}/` }] }) });
    s.env.CLAUDE_CONFIG_DIR = join(s.home, ".claude-work");
    return s;
  }, "label t7 latveria.profile=Work\n"],
  ["CLAUDE_CONFIG_DIR through a symlink to .claude-work → Work", () => {
    const s = setup();
    symlinkSync(join(s.home, ".claude-work"), join(s.root, "work-link"));
    s.env.CLAUDE_CONFIG_DIR = join(s.root, "work-link");
    return s;
  }, "label t7 latveria.profile=Work\n"],
  ["no HC_TERMINAL_ID → nothing", () => {
    const s = setup();
    delete s.env.HC_TERMINAL_ID;
    return s;
  }, ""],
  ["HC_TERMINAL_ID=-x → nothing", () => {
    const s = setup();
    s.env.HC_TERMINAL_ID = "-x";
    return s;
  }, ""],
  ["no map → nothing", () => setup({ map: null }), ""],
  ["invalid JSON → nothing", () => setup({ map: "{not json" }), ""],
  ['{"profiles":{}} → nothing', () => setup({ map: { profiles: {} } }), ""],
  ["key with a space is skipped", () => setup({ map: { profiles: [{ key: "a b", claudeDir: "~/.claude" }] } }), ""],
  ["no jq in PATH → nothing", () => {
    const s = setup();
    s.env.PATH = s.bin;
    return s;
  }, ""],
  // Herdr starts a terminal without a shell with PATH lacking ~/.local/bin, where it installs hc.
  ["hc only in ~/.local/bin (not on PATH) → label", () => setup({ hcIn: "local" }), "label t7 latveria.profile=Personal\n"],
  ["no hc on PATH nor in ~/.local/bin → nothing", () => setup({ hcIn: "none" }), ""],
  ["hc exits 3 → still exit 0", () => setup({ hcExit: 3 }), "label t7 latveria.profile=Personal\n"],
  ["the map is always $HOME's, as the Agents list reads it (LATVERIA_STATE moves only the installer's ledger)", () => {
    const s = setup();
    const other = join(s.root, "state");
    mkdirSync(other);
    writeFileSync(join(other, "profiles.json"), JSON.stringify({ profiles: [{ key: "Work", claudeDir: "~/.claude" }] }));
    s.env.LATVERIA_STATE = other;
    return s;
  }, "label t7 latveria.profile=Personal\n"],
];

for (const shell of SHELLS) {
  for (const [name, make, expected] of CASES) {
    test(`${shell}: ${name}`, () => {
      const { env, log } = make();
      const { code, stdout } = run(shell, env);
      assert.equal(code, 0);
      assert.equal(stdout, "");
      assert.equal(logOf(log), expected);
    });
  }
}

// latveria-profile.sh: the shared profile match. Prints the matching key and a newline, or nothing; always exits 0.
// It needs neither Herdr nor hc, so the statusline side-car can call it too.
const PROFILE = new URL("../hooks/latveria-profile.sh", import.meta.url).pathname;

const PROFILE_CASES = [
  ["default ~/.claude → Personal", () => setup(), "Personal\n"],
  ["CLAUDE_CONFIG_DIR=$HOME/.claude-work → Work", () => {
    const s = setup();
    s.env.CLAUDE_CONFIG_DIR = join(s.home, ".claude-work");
    return s;
  }, "Work\n"],
  ["outside Herdr (no HC_TERMINAL_ID) still matches", () => {
    const s = setup();
    delete s.env.HC_TERMINAL_ID;
    return s;
  }, "Personal\n"],
  ["no hc anywhere still matches", () => setup({ hcIn: "none" }), "Personal\n"],
  ["no map → nothing", () => setup({ map: null }), ""],
  ["invalid JSON → nothing", () => setup({ map: "{not json" }), ""],
  ["no match → nothing", () => setup({ map: { profiles: [{ key: "Work", claudeDir: "~/.claude-work" }] } }), ""],
  ["no jq in PATH → nothing", () => {
    const s = setup();
    s.env.PATH = s.bin;
    return s;
  }, ""],
];

for (const shell of SHELLS) {
  for (const [name, make, expected] of PROFILE_CASES) {
    test(`${shell}: latveria-profile.sh ${name}`, () => {
      const { env, log } = make();
      let code = 0;
      let stdout;
      try {
        stdout = execFileSync(shell, [PROFILE], { env, encoding: "utf8" });
      } catch (err) {
        code = err.status;
        stdout = err.stdout;
      }
      assert.equal(code, 0);
      assert.equal(stdout, expected);
      assert.equal(logOf(log), ""); // it never labels anything itself
    });
  }
}

// A terminal Herdr starts without a shell can have a bare PATH: the label hook must stay silent on stderr too.
for (const shell of SHELLS) {
  test(`${shell}: label hook with hc but no jq, sh or dirname on PATH writes nothing to stderr`, () => {
    const s = setup();
    s.env.PATH = s.bin;
    const r = spawnSync(shell, [HOOK], { env: s.env, encoding: "utf8" });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr, "");
    assert.equal(logOf(s.log), "");
  });
}

// The conversation, for a hand-off: the transcript and the folder it started in, from the hook's stdin JSON.
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
    ["slug ..", (h) => ({ transcript_path: `${h}/.claude/projects/../${ID}.jsonl` })],
    ["nested folder", (h) => ({ transcript_path: join(h, ".claude", "projects", "a", "b", `${ID}.jsonl`) })],
    ["not a uuid", (h) => ({ transcript_path: join(h, ".claude", "projects", "-src-app", "notes.jsonl") })],
    ["uppercase uuid", (h) => ({ transcript_path: join(h, ".claude", "projects", "-src-app", `${ID.toUpperCase()}.jsonl`) })],
    ["transcript over 1024", (h) => ({ transcript_path: join(h, ".claude", "projects", "x".repeat(1024), `${ID}.jsonl`) })],
    ["relative folder", () => ({ cwd: "src/app" })],
    ["newline in folder", () => ({ cwd: "/src/app\nlatveria.profile=Work" })],
    ["folder over 1024", () => ({ cwd: `/${"x".repeat(1024)}` })],
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
