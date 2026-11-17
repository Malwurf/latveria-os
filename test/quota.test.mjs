import "./fake/register.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contrastRatio } from "../lib/contrast.mjs";

const { fake, resetFake } = await import("herdr");
const { WARN, QUOTA_SH, parseSnapshot, settled, quotaTone, span, readQuotas, mergeQuotas } = await import("../mods/latveria-status/quota.js");

const NOW = 1_800_000_000; // seconds, as `date +%s` writes them
const snap = (over = {}) => JSON.stringify({
  updated: NOW - 120, profile: "Personal", label: "Personal", color: "#e3b341",
  rate_limits: { five_hour: { used_percentage: 3, resets_at: NOW + 287 * 60 }, seven_day: { used_percentage: 4, resets_at: NOW + 3600 * 158 } },
  ...over,
});

beforeEach(() => resetFake());

test("a snapshot gives the profile and both windows", () => {
  assert.deepEqual(parseSnapshot(snap(), NOW), {
    key: "Personal", label: "Personal", color: "#e3b341", updated: NOW - 120,
    five: { pct: 3, resetsAt: NOW + 287 * 60 }, seven: { pct: 4, resetsAt: NOW + 3600 * 158 },
  });
});

const withWindows = (five, seven) => snap({ rate_limits: { five_hour: five, seven_day: seven } });

test("percentages are rounded and kept within 0-100", () => {
  const r = parseSnapshot(withWindows({ used_percentage: 42.6, resets_at: NOW + 60 }, { used_percentage: 130, resets_at: NOW + 60 }), NOW);
  assert.equal(r.five.pct, 43);
  assert.equal(r.seven.pct, 100);
  assert.equal(parseSnapshot(withWindows({ used_percentage: -5, resets_at: NOW + 60 }), NOW).five.pct, 0);
});

test("a window whose reset time has passed reads 0 % and no reset time, marked as reset", () => {
  const r = parseSnapshot(withWindows({ used_percentage: 90, resets_at: NOW - 1 }, { used_percentage: 50, resets_at: NOW }), NOW);
  assert.deepEqual(r.five, { pct: 0, resetsAt: null, reset: true });
  assert.deepEqual(r.seven, { pct: 0, resetsAt: null, reset: true });
});

test("a window at 0 % with no reset time is not marked as reset", () => {
  assert.deepEqual(parseSnapshot(withWindows({ used_percentage: 0, resets_at: null }), NOW).five, { pct: 0, resetsAt: null });
});

const DAY = 86400;
test("an abandoned snapshot (every window past its reset, unchanged for over 8 days) is null", () => {
  const past = { used_percentage: 40, resets_at: NOW - 10 * DAY };
  assert.equal(parseSnapshot(snap({ updated: NOW - 8 * DAY - 1, rate_limits: { five_hour: past, seven_day: past } }), NOW), null);
  assert.equal(parseSnapshot(snap({ updated: NOW - 9 * DAY, rate_limits: { five_hour: past } }), NOW), null, "one window, past its reset");
  assert.ok(parseSnapshot(snap({ updated: NOW - 8 * DAY, rate_limits: { five_hour: past, seven_day: past } }), NOW), "exactly 8 days stays");
  assert.ok(parseSnapshot(snap({ updated: NOW - 7 * DAY, rate_limits: { five_hour: past, seven_day: past } }), NOW), "a week-old one stays");
  const live = { used_percentage: 40, resets_at: NOW + DAY };
  assert.ok(parseSnapshot(snap({ updated: NOW - 9 * DAY, rate_limits: { five_hour: past, seven_day: live } }), NOW), "one live window keeps it");
  const unknown = { used_percentage: 40, resets_at: null };
  assert.ok(parseSnapshot(snap({ updated: NOW - 9 * DAY, rate_limits: { five_hour: past, seven_day: unknown } }), NOW), "no reset time is not past it");
});

test("a kept window that has since reset reads 0 % too", () => {
  assert.deepEqual(settled({ pct: 90, resetsAt: NOW }, NOW), { pct: 0, resetsAt: null, reset: true });
  assert.deepEqual(settled({ pct: 90, resetsAt: NOW + 1 }, NOW), { pct: 90, resetsAt: NOW + 1 });
  assert.deepEqual(settled({ pct: 90, resetsAt: null }, NOW), { pct: 90, resetsAt: null });
  assert.equal(settled(null, NOW), null);
});

// Claude Code leaves a window out of the statusline JSON while it has no usage (seen live: only seven_day after a
// 5-hour reset), so next to a window that is there, a missing one reads 0 %, marked idle.
test("a missing window next to one that is there is 0 %, idle; without a reset time a window keeps its percentage", () => {
  const r = parseSnapshot(snap({ rate_limits: { five_hour: { used_percentage: 7, resets_at: null } } }), NOW);
  assert.deepEqual(r.five, { pct: 7, resetsAt: null });
  assert.deepEqual(r.seven, { pct: 0, resetsAt: null, idle: true });
  const s = parseSnapshot(snap({ rate_limits: { seven_day: { used_percentage: 6, resets_at: NOW + 3600 } } }), NOW);
  assert.deepEqual(s.five, { pct: 0, resetsAt: null, idle: true });
});

test("an abandoned snapshot with one window, past its reset, is dropped too", () => {
  const old = snap({ updated: NOW - 9 * 86400, rate_limits: { seven_day: { used_percentage: 6, resets_at: NOW - 3600 } } });
  assert.equal(parseSnapshot(old, NOW), null);
});

test("a label is trimmed and at most 16 characters; a bad one falls back to the key", () => {
  assert.equal(parseSnapshot(snap({ label: "  Work  " }), NOW).label, "Work");
  assert.equal(parseSnapshot(snap({ label: "A".repeat(20) }), NOW).label, "A".repeat(16));
  assert.equal(parseSnapshot(snap({ label: "   " }), NOW).label, "Personal");
  assert.equal(parseSnapshot(snap({ label: 5 }), NOW).label, "Personal");
});

test("only a #rrggbb color is kept", () => {
  assert.equal(parseSnapshot(snap({ color: "red" }), NOW).color, null);
  assert.equal(parseSnapshot(snap({ color: "#12345" }), NOW).color, null);
  assert.equal(parseSnapshot(snap({ color: null }), NOW).color, null);
});

test("anything unusable is null, never an error", () => {
  const bad = [
    "", "   ", "{not json", "null", "[]", "42",
    snap({ profile: "a b" }), snap({ profile: "-".repeat(25) }), snap({ profile: 7 }),
    snap({ updated: undefined }), snap({ updated: "now" }),
    snap({ rate_limits: {} }), snap({ rate_limits: null }),
    withWindows({ used_percentage: "3" }, { used_percentage: null }),
  ];
  for (const text of bad) assert.equal(parseSnapshot(text, NOW), null, text);
});

test("the tone follows the statusline: below 50 ok, below 80 warn, then high", () => {
  assert.deepEqual([0, 49, 50, 79, 80, 100].map(quotaTone), ["ok", "ok", "warn", "warn", "high", "high"]);
});

test("span reads a duration in its two largest units", () => {
  assert.equal(span(287 * 60), "4h 47m");
  assert.equal(span(6 * 86400 + 14 * 3600 + 59), "6d 14h");
  assert.equal(span(12 * 60 + 30), "12m");
  assert.equal(span(59), "<1m");
  assert.equal(span(-10), "<1m");
  assert.equal(span(3 * 3600), "3h 0m");
});

test("the yellow is readable on the bar's background (at least 4.5:1 on chrome)", () => {
  const theme = JSON.parse(readFileSync(new URL("../themes/latveria.json", import.meta.url), "utf8"));
  assert.ok(contrastRatio(WARN, theme.colors.chrome) >= 4.5, `${contrastRatio(WARN, theme.colors.chrome)}`);
  assert.match(WARN, /^#[0-9a-f]{6}$/i);
});

// Run for real: a folder with 40 snapshots and a folder with none, under /bin/sh with a temporary HOME.
test("the read stops after 32 snapshots in the shell itself and answers 0 on an empty folder", () => {
  const home = mkdtempSync(join(tmpdir(), "latveria-quota-sh-"));
  try {
    const run = () => execFileSync("/bin/sh", ["-c", QUOTA_SH], { env: { HOME: home, PATH: "/usr/bin:/bin" }, encoding: "utf8" });
    assert.equal(run(), "");
    const dir = join(home, ".cache", "latveria");
    mkdirSync(dir, { recursive: true });
    for (let i = 0; i < 40; i++) writeFileSync(join(dir, `quota-P${i}.json`), `${snap({ profile: `P${i}` })}\n`);
    assert.equal(run().split("\n").filter((l) => l.trim()).length, 32);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("this computer is read without `on`, another machine with it", async () => {
  fake.exec = () => ({ stdout: `${snap()}\n\n${snap({ profile: "Work", label: "Work" })}\n` });
  const here = await readQuotas(null, NOW);
  assert.deepEqual(here.map((r) => r.key), ["Personal", "Work"]);
  assert.deepEqual(fake.execs[0], { cmd: "sh", args: ["-c", QUOTA_SH], options: { timeout: 5000 } });
  await readQuotas("laptop", NOW);
  assert.deepEqual(fake.execs[1].options, { on: "laptop", timeout: 5000 });
});

test("bad lines are skipped; an empty folder is an empty list", async () => {
  fake.exec = () => ({ stdout: `{not json\n${snap()}\n` });
  assert.deepEqual((await readQuotas(null, NOW)).map((r) => r.key), ["Personal"]);
  fake.exec = () => ({ stdout: "" });
  assert.deepEqual(await readQuotas(null, NOW), []);
});

test("a failed read is null, so the caller can tell it from no snapshots", async () => {
  for (const exec of [() => ({ code: 1, stdout: snap() }), () => { throw new Error("unreachable"); }, () => ({ stdout: null })]) {
    fake.exec = exec;
    assert.equal(await readQuotas("laptop", NOW), null);
  }
});

test("a snapshot line over 4096 bytes is skipped", async () => {
  const long = snap({ profile: "Long", label: "Long", pad: "x".repeat(4100) });
  fake.exec = () => ({ stdout: `${long}\n${snap()}\n` });
  assert.deepEqual((await readQuotas(null, NOW)).map((r) => r.key), ["Personal"]);
});

test("at most 32 lines are read", async () => {
  const lines = Array.from({ length: 40 }, (_, i) => snap({ profile: `P${i}`, label: `P${i}` }));
  fake.exec = () => ({ stdout: lines.join("\n") });
  assert.equal((await readQuotas(null, NOW)).length, 32);
});

const reading = (key, updated, five, seven, extra = {}) => ({ key, label: key, color: null, updated, five, seven, ...extra });
const win = (pct, resetsAt) => ({ pct, resetsAt });

test("one entry per profile: per window the later reset wins, on a tie the higher percentage", () => {
  const [p] = mergeQuotas([
    [null, [reading("Personal", 100, win(10, 5000), win(30, 9000), { label: "Mine", color: "#e3b341" })]],
    ["laptop", [reading("Personal", 50, win(70, 6000), win(20, 9000), { label: "Old" })]],
  ]);
  assert.deepEqual(p.five, win(70, 6000), "the later reset is the newer window");
  assert.deepEqual(p.seven, win(30, 9000), "a tie takes the higher percentage");
  assert.equal(p.updated, 100);
  assert.equal(p.machine, null, "the newest reading names the machine");
  assert.equal(p.label, "Mine");
  assert.equal(p.color, "#e3b341");
  assert.deepEqual(p.sources, [{ machine: null, updated: 100 }, { machine: "laptop", updated: 50 }], "every machine it came from");
});

test("a window one machine lacks comes from the other; a reset time beats none", () => {
  const [p] = mergeQuotas([
    [null, [reading("Work", 10, win(5, null), null)]],
    ["laptop", [reading("Work", 20, win(4, 700), win(9, 800))]],
  ]);
  assert.deepEqual(p.five, win(4, 700));
  assert.deepEqual(p.seven, win(9, 800));
  assert.equal(p.machine, "laptop");
});

test("this computer first, then machines by name, keys by name within each", () => {
  const out = mergeQuotas([
    ["vps", [reading("Zed", 1, win(1, 1), null)]],
    ["laptop", [reading("Work", 1, win(1, 1), null), reading("Alpha", 1, win(1, 1), null)]],
    [null, [reading("Personal", 1, win(1, 1), null)]],
  ]);
  assert.deepEqual(out.map((r) => [r.machine, r.key]), [[null, "Personal"], ["laptop", "Alpha"], ["laptop", "Work"], ["vps", "Zed"]]);
});
