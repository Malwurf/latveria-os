import "./fake/register.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

// Bare app imports resolve only after register.mjs ran, so they are dynamic.
const { fake, resetFake, exec, theme } = await import("herdr");
const { div, image } = await import("gpui-kit");
const { h_flex } = await import("gpui-base");
const { nodes, text } = await import("./fake/ui.mjs");

test("bare app imports resolve to the fakes", async () => {
  resetFake();
  fake.exec = () => ({ stdout: "hi" });
  assert.equal((await exec("git", ["status"])).stdout, "hi");
  assert.equal(fake.execs[0].cmd, "git");
  assert.equal(theme().accent, "#accent");
});

test("elements record calls, children and conditional branches", () => {
  const tree = h_flex().gap(4).flex().child(div().text_size(14).child("README.md"))
    .when(true, (el) => el.child(image("a.svg"))).when(false, (el) => el.child("never"))
    .children([div().child("b")]);
  assert.deepEqual(nodes(tree).map((n) => n.kind), ["div", "div", "image", "div"]);
  assert.equal(nodes(tree)[2].src, "a.svg");
  assert.deepEqual(nodes(tree)[1].calls, [["text_size", 14]]);
  assert.equal(text(tree), "README.md b");
});

test("app actions record their calls", async () => {
  resetFake();
  const { run, setShared, openOverlay, closeOverlay, setAgentOrder } = await import("herdr");
  assert.equal(run("pane.focus", { pane: "p1" }), null);
  assert.equal(setShared("agents.sort", "name"), null);
  assert.equal(openOverlay({ mod: "latveria-agents", kind: "popup" }), "o1");
  assert.equal(closeOverlay("o1"), null);
  assert.equal(setAgentOrder(["t1", "laptop/t2"]), null);
  assert.deepEqual(fake.runs, [["pane.focus", { pane: "p1" }]]);
  assert.deepEqual(fake.shared, { "agents.sort": "name" });
  assert.deepEqual(fake.overlays, [{ mod: "latveria-agents", kind: "popup" }]);
  assert.deepEqual(fake.closed, ["o1"]);
  assert.deepEqual(fake.order, ["t1", "laptop/t2"]);
});

test("state readers return what a test set", async () => {
  resetFake();
  const { agents, layout, shared, props, home } = await import("herdr");
  assert.deepEqual(agents(), []);
  assert.deepEqual(layout(), { id: "root", children: [{ id: "sidebar", size: { px: 268 } }] });
  assert.equal(shared("agents.sort"), undefined);
  assert.equal(props(), null);
  assert.equal(home(), "/home/test");
  fake.agents = [{ address: "t1", name: "claude" }];
  fake.shared["sidebar.width"] = 300;
  fake.props = { sortMenu: true };
  assert.deepEqual(agents(), [{ address: "t1", name: "claude" }]);
  assert.equal(shared("sidebar.width"), 300);
  assert.deepEqual(props(), { sortMenu: true });
});

test("resetFake restores every new field", async () => {
  resetFake();
  const { run, setShared, openOverlay, closeOverlay, setAgentOrder } = await import("herdr");
  run("x"); setShared("k", 1); openOverlay({}); closeOverlay("o1"); setAgentOrder(["t1"]);
  fake.agents.push({ address: "t1" }); fake.layout.children[0].size.px = 50;
  fake.props = {}; fake.home = "/elsewhere";
  resetFake();
  assert.deepEqual(
    [fake.agents, fake.runs, fake.shared, fake.overlays, fake.closed, fake.order, fake.props, fake.home],
    [[], [], {}, [], [], null, null, "/home/test"],
  );
  assert.equal(fake.layout.children[0].size.px, 268);
});

test("localStorage remembers strings and resetFake clears it", () => {
  resetFake();
  const storage = globalThis.localStorage;
  assert.equal(storage.getItem("pins"), null);
  storage.setItem("pins", ["t1"]);
  storage.setItem("changed", JSON.stringify({ t1: 5 }));
  assert.equal(storage.getItem("pins"), "t1");
  assert.deepEqual(JSON.parse(storage.getItem("changed")), { t1: 5 });
  storage.removeItem("pins");
  assert.equal(storage.getItem("pins"), null);
  resetFake();
  assert.equal(storage.getItem("changed"), null);
});

test("the Dock badge, notes, window focus and check mode are recorded or settable", async () => {
  resetFake();
  const { setBadge, notify, window, checking } = await import("herdr");
  assert.equal(window().active, true, "the window is active unless a test says otherwise");
  assert.equal(checking(), false);
  setBadge("2");
  assert.deepEqual(fake.badges, ["2"]);
  assert.equal(notify({ title: "x" }), "n1");
  assert.deepEqual(fake.notes, [{ title: "x" }]);
  fake.active = false;
  fake.checking = true;
  assert.equal(window().active, false);
  assert.equal(checking(), true);
  resetFake();
  assert.deepEqual([fake.badges, fake.notes, window().active, checking()], [[], [], true, false]);
});
