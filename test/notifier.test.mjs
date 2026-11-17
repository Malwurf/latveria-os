import { test } from "node:test";
import assert from "node:assert/strict";
import { clean, groupKey, noteKey, notifierArgs, outcome, WAIT_S, EXEC_TIMEOUT_MS, MAX_WAITING } from "../mods/latveria-status/notifier.js";

const note = { title: "t7 needs you", body: "Claude Code wants to run a command", action: { name: "agent.focus", args: { terminal: "t7" } } };

test("the banner waits 9 minutes inside a 10-minute exec, five at most", () => {
  assert.deepEqual([WAIT_S, EXEC_TIMEOUT_MS, MAX_WAITING], [540, 600000, 5]);
  assert.ok(WAIT_S * 1000 < EXEC_TIMEOUT_MS);
});

test("arguments: title, text, one group per agent, Herdr comes forward, waits for a click", () => {
  assert.deepEqual(notifierArgs(note), ["-title", "t7 needs you", "-message", "Claude Code wants to run a command",
    "-group", "latveria-t7", "-activate", "dev.herdr.app", "-action", "Show", "-timeout", "540"]);
});

test("no text: the title is the message; no title either: Herdr", () => {
  assert.equal(notifierArgs({ title: "Done" })[3], "Done");
  assert.deepEqual(notifierArgs({}).slice(0, 4), ["-title", "Herdr", "-message", "Herdr"]);
});

test("untrusted text: control characters go, lengths are capped, a shell string stays one argument", () => {
  const evil = `x"; rm -rf ~ \u001b[2J\u0007\u009b`;
  const args = notifierArgs({ title: evil, body: "b".repeat(500) });
  assert.equal(args[1], `x"; rm -rf ~ [2J`);
  assert.equal(args.length, 12);
  assert.equal(args[3].length, 240);
  assert.equal(notifierArgs({ title: "t".repeat(300) })[1].length, 120);
  assert.equal(clean(null, 5), "");
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

test("outcome: the markers first, then the exit code", () => {
  assert.equal(outcome({ code: 0, stdout: "" }), "clicked");
  assert.equal(outcome({ code: 0, stdout: "Show" }), "clicked");
  assert.equal(outcome({ code: 6, stdout: "@TIMEOUT\n" }), "ignored");
  assert.equal(outcome({ code: 0, stdout: "@TIMEOUT" }), "ignored");
  assert.equal(outcome({ code: 0, stdout: "@CLOSED" }), "ignored");
  assert.equal(outcome({ code: 0, stdout: "@ACTIONCLICKED" }), "clicked");
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
