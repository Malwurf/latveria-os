import { test } from "node:test";
import assert from "node:assert/strict";
import { clean, groupKey, noteKey, notifierArgs, outcome, clickCommand, appPath, EXEC_TIMEOUT_MS, REPEAT_MS } from "../mods/latveria-status/notifier.js";

const note = { title: "t7 needs you", body: "Claude Code wants to run a command", action: { name: "agent.focus", args: { terminal: "t7" } } };
const APP = "/opt/herdr/bin/herdr-app";

test("the banner does not wait: a short exec, the same note held back for a minute", () => {
  assert.deepEqual([EXEC_TIMEOUT_MS, REPEAT_MS], [10000, 60000]);
});

// Waiting mode (-action/-timeout) exits the moment the banner is clicked, while macOS is still bringing the program
// forward: the activation hits a dead process and macOS shows "terminal-notifier is not open anymore" (log, 20.11).
test("arguments: title, text, one group per agent, Herdr comes forward, the click runs the action; nothing waits", () => {
  assert.deepEqual(notifierArgs(note, APP), ["-title", "t7 needs you", "-message", "Claude Code wants to run a command",
    "-group", "latveria-t7", "-activate", "dev.herdr.app",
    "-execute", `${APP} do agent.focus '{"terminal":"t7"}'`]);
  for (const flag of ["-action", "-timeout", "-reply"]) assert.ok(!notifierArgs(note, APP).includes(flag), flag);
});

test("no herdr-app or no action: the click only brings Herdr forward", () => {
  assert.deepEqual(notifierArgs(note, null).slice(-2), ["-activate", "dev.herdr.app"]);
  assert.deepEqual(notifierArgs({ title: "x" }, APP).slice(-2), ["-activate", "dev.herdr.app"]);
});

test("click command: a quote in the arguments stays inside one single-quoted JSON argument", () => {
  const cmd = clickCommand({ name: "agent.focus", args: { terminal: "'; rm -rf ~; '" } }, APP);
  assert.equal(cmd, `${APP} do agent.focus '{"terminal":"'\\''; rm -rf ~; '\\''"}'`);
  assert.equal(clickCommand({ name: "agent.focus" }, APP), `${APP} do agent.focus '{}'`);
});

test("click command: only a dotted lowercase action, plain-object arguments of bounded size, an absolute safe path", () => {
  for (const name of ["agent", "Agent.focus", "agent.focus; rm", "agent..focus", "-x.y", "", undefined, 7])
    assert.equal(clickCommand({ name, args: {} }, APP), null, String(name));
  for (const args of [[1], "x", { t: "x".repeat(600) }]) assert.equal(clickCommand({ name: "agent.focus", args }, APP), null);
  for (const app of [null, "", "herdr-app", "/a b/herdr-app", "/a/herdr-app;rm", "/a/'x'"])
    assert.equal(clickCommand({ name: "agent.focus", args: {} }, app), null, String(app));
  assert.equal(clickCommand(null, APP), null);
});

test("appPath: command -v's answer when it is an absolute safe path", () => {
  assert.equal(appPath(`${APP}\n`), APP);
  assert.equal(appPath(""), null);
  assert.equal(appPath("herdr-app\n"), null, "an alias or function, not a path");
  assert.equal(appPath(undefined), null);
});

test("no text: the title is the message; no title either: Herdr", () => {
  assert.equal(notifierArgs({ title: "Done" })[3], "Done");
  assert.deepEqual(notifierArgs({}).slice(0, 4), ["-title", "Herdr", "-message", "Herdr"]);
});

test("untrusted text: control characters go, lengths are capped, a shell string stays one argument", () => {
  const evil = `x"; rm -rf ~ \u001b[2J\u0007\u009b`;
  const args = notifierArgs({ title: evil, body: "b".repeat(500) }, APP);
  assert.equal(args[1], `x"; rm -rf ~ [2J`);
  assert.equal(args.length, 8, "no action: no click command, so the text is in no shell string");
  assert.equal(args[3].length, 240);
  assert.equal(notifierArgs({ title: "t".repeat(300) })[1].length, 120);
  assert.equal(clean(null, 5), "");
});

test("the click command never carries the note's text", () => {
  const args = notifierArgs({ ...note, title: "SECRET-T", body: "SECRET-B" }, APP);
  assert.ok(!args.at(-1).includes("SECRET"));
});

test("group: the agent's terminal, else a stable hash of the title; a strange terminal id is not trusted", () => {
  assert.equal(groupKey(note), "latveria-t7");
  assert.equal(groupKey({ title: "x", action: { args: { terminal: "laptop/t3" } } }), "latveria-laptop/t3");
  const a = groupKey({ title: "Machine needs a login" });
  assert.match(a, /^latveria-[0-9a-f]{8}$/);
  assert.equal(a, groupKey({ title: "Machine needs a login" }));
  assert.notEqual(a, groupKey({ title: "Other" }));
  assert.match(groupKey({ title: "x", action: { args: { terminal: "-rf; x" } } }), /^latveria-[0-9a-f]{8}$/);
});

test("a value starting with a property-list character is escaped, or terminal-notifier drops the banner", () => {
  const args = notifierArgs({ title: "[ZOMG] fire", body: "(x)" });
  assert.equal(args[1], "\\[ZOMG] fire");
  assert.equal(args[3], "\\(x)");
  for (const c of ["{", "\"", "'", "<"]) assert.equal(notifierArgs({ title: `${c}a` })[1], `\\${c}a`);
  assert.equal(notifierArgs({ title: "a[b" })[1], "a[b");
});

test("outcome: exit 0 is a banner shown; no program or no permission is missing; anything else failed", () => {
  assert.equal(outcome({ code: 0, stdout: "" }), "shown");
  assert.equal(outcome({ code: 3, stdout: "" }), "missing", "notifications not allowed");
  assert.equal(outcome(new Error("not found")), "missing", "not installed");
  assert.equal(outcome({ code: 1, stdout: "x" }), "failed");
  assert.equal(outcome(undefined), "failed");
});

test("a note's key is its title and text, as latveria-toast builds it", () => {
  assert.equal(noteKey(note), "t7 needs you\nClaude Code wants to run a command");
  assert.equal(noteKey({ title: "Done" }), "Done\n");
  assert.equal(noteKey(undefined), "\n");
});

test("click command through a real shell: the program gets exactly do, the action and the JSON", async () => {
  const { mkdtempSync, writeFileSync, chmodSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");
  const { tmpdir } = await import("node:os");
  const app = `${mkdtempSync(`${tmpdir()}/latveria-`)}/herdr-app`;
  writeFileSync(app, "#!/bin/sh\nfor a in \"$@\"; do printf '%s\\0' \"$a\"; done\n");
  chmodSync(app, 0o755);
  const args = { terminal: "'; touch /tmp/pwned; echo '$(id)`x`" };
  const out = execFileSync("/bin/sh", ["-c", clickCommand({ name: "agent.focus", args }, app)], { encoding: "utf8" });
  assert.deepEqual(out.split("\0").slice(0, -1), ["do", "agent.focus", JSON.stringify(args)]);
});
