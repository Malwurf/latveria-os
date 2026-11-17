import "./fake/register.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const { fake, resetFake } = await import("herdr");
const { nodes, text } = await import("./fake/ui.mjs");
const { default: Toast } = await import("../mods/latveria-toast/main.js");

const cx = { timer: { every() {} }, spawn: (fn) => { fn(cx); }, notify() {}, stop_propagation() {}, write_to_clipboard() {} };
const NOTE = { title: "t7 needs you", body: "Claude Code", level: "warning", action: { name: "agent.focus", args: { terminal: "t7" } }, overlay: "ov1" };

beforeEach(() => {
  resetFake();
  fake.props = { ...NOTE };
});

function opened() { const v = new Toast(); v.init?.(fake.props, cx); return v; }
const clickRoot = (tree) => nodes(tree).find((n) => n.calls.some(([m, v]) => m === "id" && v === "toast")).calls.find(([m]) => m === "on_click")[1]({}, cx);

test("while Herdr is in front the note is drawn as Herdr draws it, and a click runs its action", () => {
  const tree = opened().render(cx);
  assert.match(text(tree), /t7 needs you.*Claude Code/);
  clickRoot(tree);
  assert.deepEqual(fake.runs, [["agent.focus", { terminal: "t7" }]]);
  assert.deepEqual(fake.closed, ["ov1"]);
});

test("its text is at least 12 px", () => {
  const sizes = nodes(opened().render(cx)).flatMap((n) => n.calls.filter(([m]) => m === "text_size").map(([, s]) => s));
  assert.ok(sizes.length && sizes.every((s) => s >= 12), `sizes: ${sizes}`);
});

const queue = () => fake.shared["latveria.notes"] ?? [];

test("Herdr in front: nothing is handed over and the overlay stays", () => {
  opened();
  assert.deepEqual([queue(), fake.closed], [[], []]);
});

test("Herdr not in front: the note goes to the bar's queue, the overlay closes and nothing is drawn", (t) => {
  t.mock.method(Date, "now", () => 5000);
  fake.active = false;
  const v = opened();
  assert.deepEqual(queue(), [{ title: NOTE.title, body: NOTE.body, level: "warning", action: NOTE.action, at: 5000 }]);
  assert.deepEqual(fake.closed, ["ov1"]);
  assert.equal(text(v.render(cx)), "");
});

test("every kind of note goes on: a finished agent too", () => {
  fake.active = false;
  fake.props = { title: "t7 finished", body: "Claude Code", level: "success", action: NOTE.action, overlay: "ov2" };
  opened();
  assert.equal(queue()[0].title, "t7 finished");
});

test("a note the bar sent back is drawn in the window, once", () => {
  fake.active = false;
  fake.shared["latveria.direct"] = ["other\nx", "t7 needs you\nClaude Code"];
  const v = opened();
  assert.match(text(v.render(cx)), /t7 needs you/);
  assert.deepEqual([queue(), fake.closed, fake.shared["latveria.direct"]], [[], [], ["other\nx"]]);
});

test("while the notifier is missing notes stay in the window; after 10 minutes the bar tries again", (t) => {
  t.mock.method(Date, "now", () => 1_000_000);
  fake.active = false;
  fake.shared["latveria.notifier"] = { missing: true, at: 1_000_000 - 60_000 };
  opened();
  assert.deepEqual([queue(), fake.closed], [[], []]);
  fake.shared["latveria.notifier"] = { missing: true, at: 1_000_000 - 11 * 60_000 };
  opened();
  assert.equal(queue().length, 1);
});

test("the queue keeps the newest 20", () => {
  fake.active = false;
  fake.shared["latveria.notes"] = Array.from({ length: 20 }, (_, i) => ({ title: `n${i}`, at: 1 }));
  opened();
  assert.equal(queue().length, 20);
  assert.equal(queue()[0].title, "n1");
  assert.equal(queue().at(-1).title, "t7 needs you");
});

test("during herdr-app check nothing is queued or closed", () => {
  fake.active = false;
  fake.checking = true;
  opened();
  assert.deepEqual([queue(), fake.closed], [[], []]);
});
