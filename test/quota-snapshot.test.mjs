import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// The statusline side-car keeps ~/.cache/latveria/quota-<KEY>.json, this profile's 5h/7d limits, for the status bar.
const QUOTA = new URL("../hooks/latveria-quota.sh", import.meta.url).pathname;
const SHELLS = ["/bin/sh", "/bin/dash"].filter((s) => existsSync(s)); // macOS sh is bash in POSIX mode; dash is stricter
const JQ_DIR = dirname(execFileSync("/bin/sh", ["-c", "command -v jq"], { encoding: "utf8" }).trim());
const MAP = {
  profiles: [
    { key: "Personal", label: "Personal", claudeDir: "~/.claude", color: "#e3b341" },
    { key: "Work", label: "Work", claudeDir: "~/.claude-work", color: "#6ea8fe" },
  ],
};
const FIVE = { used_percentage: 3, resets_at: 1763300000 };
const SEVEN = { used_percentage: 4, resets_at: 1763800000 };
const STATUS = { model: { display_name: "Opus" }, rate_limits: { five_hour: FIVE, seven_day: SEVEN } };

const roots = [];
after(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

// A fresh HOME with .claude and .claude-work and a profiles map: an object, raw text, or null for none.
function setup({ map = MAP } = {}) {
  const root = mkdtempSync(join(tmpdir(), "latveria-quota-"));
  roots.push(root);
  const home = join(root, "home");
  const bin = join(root, "bin");
  for (const d of [join(home, ".claude"), join(home, ".claude-work"), join(home, ".config", "latveria"), bin]) mkdirSync(d, { recursive: true });
  const s = { root, home, bin, cache: join(home, ".cache", "latveria"), env: { HOME: home, PATH: `${bin}:${JQ_DIR}:/usr/bin:/bin` } };
  s.writeMap = (m) => writeFileSync(join(home, ".config", "latveria", "profiles.json"), typeof m === "string" ? m : JSON.stringify(m));
  if (map != null) s.writeMap(map);
  s.file = (key) => join(s.cache, `quota-${key}.json`);
  return s;
}

// Runs the side-car; every run, whatever its input, must print nothing, exit 0 and leave no temp file behind.
function run(shell, s, input) {
  const r = spawnSync(shell, [QUOTA], { env: s.env, input: typeof input === "string" ? input : JSON.stringify(input), encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
  assert.equal(r.stderr, "");
  if (existsSync(s.cache)) assert.deepEqual(readdirSync(s.cache).filter((f) => !/^quota-[A-Za-z0-9_-]+\.json$/.test(f)), []);
}

const read = (path) => readFileSync(path, "utf8");
const snapshot = (path) => {
  const text = read(path);
  assert.match(text, /^\{[^\n]*\}\n$/, "one compact JSON line ending in a newline");
  return JSON.parse(text);
};
const nowSec = () => Math.floor(Date.now() / 1000);

for (const shell of SHELLS) {
  test(`${shell}: 5h and 7d limits → quota-Personal.json with label and color`, () => {
    const s = setup();
    const before = nowSec();
    run(shell, s, STATUS);
    const snap = snapshot(s.file("Personal"));
    assert.equal(typeof snap.updated, "number");
    assert.ok(snap.updated >= before && snap.updated <= nowSec() + 1);
    assert.deepEqual({ ...snap, updated: 0 }, {
      updated: 0, profile: "Personal", label: "Personal", color: "#e3b341",
      rate_limits: { five_hour: FIVE, seven_day: SEVEN },
    });
    assert.deepEqual(readdirSync(s.cache), ["quota-Personal.json"]);
  });

  test(`${shell}: CLAUDE_CONFIG_DIR=$HOME/.claude-work → quota-Work.json`, () => {
    const s = setup();
    s.env.CLAUDE_CONFIG_DIR = join(s.home, ".claude-work");
    run(shell, s, STATUS);
    const snap = snapshot(s.file("Work"));
    assert.equal(snap.profile, "Work");
    assert.equal(snap.label, "Work");
    assert.equal(snap.color, "#6ea8fe");
    assert.equal(existsSync(s.file("Personal")), false);
  });

  test(`${shell}: the same limits again leave the file untouched, even an hour-old one`, () => {
    const s = setup();
    run(shell, s, STATUS);
    const old = { ...snapshot(s.file("Personal")), updated: nowSec() - 3600 };
    const text = `${JSON.stringify(old)}\n`;
    writeFileSync(s.file("Personal"), text);
    run(shell, s, STATUS);
    assert.equal(read(s.file("Personal")), text);
  });

  test(`${shell}: a changed profile color in the map → a new snapshot`, () => {
    const s = setup();
    run(shell, s, STATUS);
    writeFileSync(s.file("Personal"), `${JSON.stringify({ ...snapshot(s.file("Personal")), updated: 1 })}\n`);
    s.writeMap({ profiles: [{ ...MAP.profiles[0], color: "#123456" }, MAP.profiles[1]] });
    run(shell, s, STATUS);
    const snap = snapshot(s.file("Personal"));
    assert.equal(snap.color, "#123456");
    assert.ok(snap.updated > 1);
  });

  test(`${shell}: a changed label in the map → a new snapshot`, () => {
    const s = setup();
    run(shell, s, STATUS);
    writeFileSync(s.file("Personal"), `${JSON.stringify({ ...snapshot(s.file("Personal")), updated: 1 })}\n`);
    s.writeMap({ profiles: [{ ...MAP.profiles[0], label: "Home" }, MAP.profiles[1]] });
    run(shell, s, STATUS);
    const snap = snapshot(s.file("Personal"));
    assert.equal(snap.label, "Home");
    assert.ok(snap.updated > 1);
  });

  test(`${shell}: a changed used_percentage → a new snapshot`, () => {
    const s = setup();
    run(shell, s, STATUS);
    writeFileSync(s.file("Personal"), `${JSON.stringify({ ...snapshot(s.file("Personal")), updated: 1 })}\n`);
    run(shell, s, { rate_limits: { five_hour: { ...FIVE, used_percentage: 7.5 }, seven_day: SEVEN } });
    const snap = snapshot(s.file("Personal"));
    assert.equal(snap.rate_limits.five_hour.used_percentage, 7.5);
    assert.ok(snap.updated > 1);
  });

  test(`${shell}: a corrupt existing snapshot is replaced`, () => {
    const s = setup();
    mkdirSync(s.cache, { recursive: true });
    writeFileSync(s.file("Personal"), "{not json");
    run(shell, s, STATUS);
    assert.deepEqual(snapshot(s.file("Personal")).rate_limits, { five_hour: FIVE, seven_day: SEVEN });
  });

  test(`${shell}: only five_hour → a snapshot without seven_day; a non-number resets_at → null`, () => {
    const s = setup();
    run(shell, s, { rate_limits: { five_hour: { used_percentage: 12, resets_at: "soon" }, seven_day: { used_percentage: "4" } } });
    assert.deepEqual(snapshot(s.file("Personal")).rate_limits, { five_hour: { used_percentage: 12, resets_at: null } });
  });

  test(`${shell}: a profile without label or color → the key and null`, () => {
    const s = setup({ map: { profiles: [{ key: "Personal", claudeDir: "~/.claude" }] } });
    run(shell, s, STATUS);
    const snap = snapshot(s.file("Personal"));
    assert.equal(snap.label, "Personal");
    assert.equal(snap.color, null);
  });

  test(`${shell}: only the first JSON document on stdin counts`, () => {
    const s = setup();
    const other = { rate_limits: { five_hour: { used_percentage: 99, resets_at: 1 } } };
    run(shell, s, `${JSON.stringify(STATUS)}\n${JSON.stringify(other)}\n`);
    assert.deepEqual(snapshot(s.file("Personal")).rate_limits, { five_hour: FIVE, seven_day: SEVEN });
  });

  // Background runs can finish out of order; within one window usage only grows, so a lower reading is an older run.
  test(`${shell}: a late run with lower numbers in the same windows leaves the file untouched`, () => {
    const s = setup();
    run(shell, s, { rate_limits: { five_hour: { ...FIVE, used_percentage: 9 }, seven_day: { ...SEVEN, used_percentage: 6 } } });
    const text = read(s.file("Personal"));
    run(shell, s, STATUS);
    assert.equal(read(s.file("Personal")), text);
    run(shell, s, { rate_limits: { five_hour: { ...FIVE, used_percentage: 9 }, seven_day: SEVEN } });
    assert.equal(read(s.file("Personal")), text, "one lower, one equal");
  });

  for (const [why, older, newer] of [
    ["a new reset time", { five_hour: { ...FIVE, used_percentage: 9 }, seven_day: SEVEN }, { five_hour: { ...FIVE, resets_at: FIVE.resets_at + 18000 }, seven_day: SEVEN }],
    ["a different window set", { five_hour: { ...FIVE, used_percentage: 9 }, seven_day: SEVEN }, { five_hour: FIVE }],
    ["one window higher", { five_hour: { ...FIVE, used_percentage: 9 }, seven_day: SEVEN }, { five_hour: FIVE, seven_day: { ...SEVEN, used_percentage: 5 } }],
  ]) {
    test(`${shell}: lower numbers with ${why} → a new snapshot`, () => {
      const s = setup();
      run(shell, s, { rate_limits: older });
      writeFileSync(s.file("Personal"), `${JSON.stringify({ ...snapshot(s.file("Personal")), updated: 1 })}\n`);
      run(shell, s, { rate_limits: newer });
      const snap = snapshot(s.file("Personal"));
      assert.deepEqual(snap.rate_limits, newer);
      assert.ok(snap.updated > 1);
    });
  }

  test(`${shell}: an existing snapshot with a non-number percentage is replaced`, () => {
    const s = setup();
    run(shell, s, STATUS);
    const bad = snapshot(s.file("Personal"));
    bad.rate_limits.five_hour.used_percentage = "99";
    writeFileSync(s.file("Personal"), `${JSON.stringify({ ...bad, updated: 1 })}\n`);
    run(shell, s, STATUS);
    assert.deepEqual(snapshot(s.file("Personal")).rate_limits, { five_hour: FIVE, seven_day: SEVEN });
  });

  test(`${shell}: one jq run besides the profile lookup, also with a snapshot in place; updated is whole seconds`, () => {
    const s = setup();
    const log = join(s.root, "jq.log");
    writeFileSync(join(s.bin, "jq"), `#!/bin/sh\necho run >> "${log}"\nexec "${JQ_DIR}/jq" "$@"\n`, { mode: 0o755 });
    run(shell, s, STATUS);
    run(shell, s, { rate_limits: { five_hour: { ...FIVE, used_percentage: 8 }, seven_day: SEVEN } });
    assert.equal(read(log).split("\n").filter(Boolean).length, 4, "two runs, two jq calls each");
    assert.ok(Number.isInteger(snapshot(s.file("Personal")).updated));
  });

  test(`${shell}: a label is cut to 64 characters`, () => {
    const s = setup({ map: { profiles: [{ ...MAP.profiles[0], label: "L".repeat(100) }] } });
    run(shell, s, STATUS);
    assert.equal(snapshot(s.file("Personal")).label, "L".repeat(64));
  });

  test(`${shell}: stdin over 1 MiB → exits 0 silently, no snapshot`, () => {
    const s = setup();
    run(shell, s, JSON.stringify({ ...STATUS, pad: "x".repeat(2 * 1048576) }));
    assert.deepEqual(existsSync(s.cache) ? readdirSync(s.cache) : [], []);
  });

  const NOTHING = [
    ["no rate_limits", () => setup(), { model: { display_name: "Opus" } }],
    ["used_percentage not a number in both windows", () => setup(), { rate_limits: { five_hour: { used_percentage: "3" }, seven_day: { used_percentage: null } } }],
    ["rate_limits not an object", () => setup(), { rate_limits: "full" }],
    ["invalid JSON on stdin", () => setup(), "{not json"],
    ["empty stdin", () => setup(), ""],
    ["no map", () => setup({ map: null }), STATUS],
    ["invalid map", () => setup({ map: "{not json" }), STATUS],
    ["no matching profile", () => setup({ map: { profiles: [MAP.profiles[1]] } }), STATUS],
    ["no jq in PATH", () => {
      const s = setup();
      s.env.PATH = s.bin;
      return s;
    }, STATUS],
  ];
  for (const [name, make, input] of NOTHING) {
    test(`${shell}: ${name} → no snapshot`, () => {
      const s = make();
      run(shell, s, input);
      assert.deepEqual(existsSync(s.cache) ? readdirSync(s.cache) : [], []);
    });
  }
}
