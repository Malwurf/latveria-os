import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A hand-off: a local agent's conversation continued on another Claude profile of this computer.
const H = await import("../mods/latveria-agents/handoff.js");

const HOME = "/home/test";
const ID = "0f1e2d3c-4b5a-4968-8778-a1b2c3d4e5f6";
const P = [{ key: "Personal", label: "Personal", dir: "~/.claude" }, { key: "Work", label: "Work", dir: "~/.claude-work" }];
const T = `${HOME}/.claude/projects/-src-app/${ID}.jsonl`;
const labels = (o = {}) => ({ "latveria.profile": "Personal", "latveria.transcript": T, "latveria.cwd": "/src/app", ...o });
const agent = (o = {}) => ({ address: "t1", status: "done", space: "s1", app: "claude-code", ...o });

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

test("source: no button once another agent runs in the terminal (labels outlive Claude)", () => {
  assert.equal(H.source(agent({ app: "codex" }), labels(), P, HOME), null);
  assert.equal(H.source(agent({ app: null }), labels(), P, HOME), null);
});

test("source: the start folder must name the transcript's folder", () => {
  assert.equal(H.source(agent(), labels({ "latveria.cwd": "/elsewhere" }), P, HOME), null);
  const long = `/${"a".repeat(250)}`; // Claude shortens long folder names, so they aren't compared
  assert.ok(H.source(agent(), labels({ "latveria.cwd": long }), P, HOME));
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

test("limits: a snapshot's 5h and 7d, ? without one, 0 after a reset, clamped", () => {
  const now = 1_800_000_000;
  const snap = JSON.stringify({ rate_limits: { five_hour: { used_percentage: 6.4, resets_at: now + 60 }, seven_day: { used_percentage: 27, resets_at: now - 1 } } });
  assert.equal(H.limits(snap, now), "5h 6% · 7d 0%");
  assert.equal(H.limits(null, now), "5h ? · 7d ?");
  assert.equal(H.limits("{oops", now), "5h ? · 7d ?");
  assert.equal(H.limits(JSON.stringify({ rate_limits: { seven_day: { used_percentage: 3, resets_at: now + 9 } } }), now), "5h 0% · 7d 3%");
  assert.equal(H.limits(JSON.stringify({ rate_limits: { five_hour: { used_percentage: 140 }, seven_day: { used_percentage: "x" } } }), now), "5h 100% · 7d ?");
});

// The script for real, on a temporary HOME, with a fake claude that records its CLAUDE_CONFIG_DIR and arguments.
const roots = [];
after(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

function world({ withClaude = true, claudeIn = "bin", home: homeName = "home" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "latveria-handoff-"));
  roots.push(root);
  const home = join(root, homeName);
  const bin = join(root, "bin");
  const src = join(home, ".claude", "projects", "-src-app");
  mkdirSync(join(src, ID, "tool-results"), { recursive: true });
  mkdirSync(join(home, ".claude-work"), { recursive: true });
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(src, `${ID}.jsonl`), "{\"a\":1}\n");
  writeFileSync(join(src, ID, "tool-results", "x.txt"), "big");
  const log = join(root, "claude.log");
  const cdir = claudeIn === "local" ? join(home, ".local", "bin") : bin;
  mkdirSync(cdir, { recursive: true });
  if (withClaude) writeFileSync(join(cdir, "claude"), `#!/bin/sh\nprintf '%s\\n' "\${CLAUDE_CONFIG_DIR-UNSET}" "$@" > '${log}'\n`, { mode: 0o755 });
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
  // The stray ~/.claude/.claude.json comes from a real claude given CLAUDE_CONFIG_DIR=~/.claude; the live check
  // covers it, this fake can only show the variable is unset.
});

test("script: the same copy already there resumes without copying again", () => {
  const w = world();
  const dir = join(w.home, ".claude-work");
  assert.equal(runScript(w, dir).status, 0);
  rmSync(w.log);
  assert.equal(runScript(w, dir).status, 0);
  assert.equal(readFileSync(w.log, "utf8").split("\n")[1], "--resume");
});

test("script: an older copy there stops the hand-off and stays as it is", () => {
  const w = world();
  const dir = join(w.home, ".claude-work");
  mkdirSync(join(dir, "projects", "-src-app"), { recursive: true });
  writeFileSync(join(dir, "projects", "-src-app", `${ID}.jsonl`), "older\n");
  const r = runScript(w, dir);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /older copy of this conversation/);
  assert.equal(readFileSync(join(dir, "projects", "-src-app", `${ID}.jsonl`), "utf8"), "older\n");
  assert.ok(!existsSync(w.log), "claude not started");
});

test("script: a copy that fails halfway leaves no transcript, and the next try finishes it", { skip: process.getuid?.() === 0 }, () => {
  const w = world();
  const dir = join(w.home, ".claude-work");
  const locked = join(w.src, ID, "tool-results", "locked.txt");
  writeFileSync(locked, "secret", { mode: 0o000 });
  const r = runScript(w, dir);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /saved tool outputs/);
  assert.ok(!existsSync(join(dir, "projects", "-src-app", `${ID}.jsonl`)), "no transcript, so no half-done target");
  chmodSync(locked, 0o600);
  assert.equal(runScript(w, dir).status, 0);
  assert.equal(readFileSync(join(dir, "projects", "-src-app", ID, "tool-results", "locked.txt"), "utf8"), "secret");
  assert.deepEqual(readdirSync(join(dir, "projects", "-src-app")).sort(), [ID, `${ID}.jsonl`], "no temp left");
});

test("script: a home with spaces, quotes and $() stays one argument", () => {
  const w = world({ home: "home $(touch pwned2) 'q'" });
  const dir = join(w.home, ".claude-work");
  assert.equal(runScript(w, dir).status, 0);
  assert.ok(!existsSync(join(w.root, "pwned2")) && !existsSync("pwned2"));
  assert.equal(readFileSync(join(dir, "projects", "-src-app", `${ID}.jsonl`), "utf8"), "{\"a\":1}\n");
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

test("script: without claude it says so and copies nothing", () => {
  const w = world({ withClaude: false });
  const dir = join(w.home, ".claude-work");
  const r = runScript(w, dir);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /claude not found/);
  assert.ok(!existsSync(join(dir, "projects")));
});
