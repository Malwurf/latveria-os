import "./fake/register.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setImmediate as tick } from "node:timers/promises";

const { fake, resetFake } = await import("herdr");
const { nodes, text } = await import("./fake/ui.mjs");
const { default: Agents } = await import("../mods/latveria-agents/main.js");
const { parseProfiles, LABEL } = await import("../mods/latveria-agents/profile.js");

const settle = async () => { for (let i = 0; i < 10; i++) await tick(); };
const cx = { timer: { every() {} }, spawn: (fn) => { fn(cx); }, notify() {}, stop_propagation() {} };
const agent = (address, status, extra = {}) => ({ address, pane: `p-${address}`, space: "s1", space_name: "GEM", tab: `tab-${address}`,
  tab_index: 0, tab_name: "1", status, app: "claude-code", program: { name: "Claude Code", agent: true }, title: "", seq: 1,
  pinned: false, focused: false, ...extra });

// Agent rows are "ag-<address>"; the list and the sort button share the prefix but are not rows.
const NOT_ROWS = new Set(["ag-list", "ag-sort"]);
const rowIds = (tree) => nodes(tree)
  .flatMap((n) => n.calls.filter(([m]) => m === "id").map(([, id]) => String(id)))
  .filter((id) => id.startsWith("ag-") && !NOT_ROWS.has(id));

const MAP = JSON.stringify({ profiles: [
  { key: "Personal", label: "Personal", claudeDir: "~/.claude", color: "#e3b341" },
  { key: "Work", label: "Work", claudeDir: "~/.claude-work", color: "#6ea8fe" },
] });
const rowOf = (tree, address) => nodes(tree).find((n) => n.calls.some(([m, id]) => m === "id" && id === `ag-${address}`));
const has = (n, method, value) => n.calls.some(([m, v]) => m === method && v === value);
// The profile dot: an 8 px circle, filled with the profile's color or, without one, a ring.
const dotOf = (row) => nodes(row).find((n) => has(n, "size", 8));
const labelAs = (address, key) => { fake.terminals.find((x) => x.address === address).labels[LABEL] = key; };

beforeEach(() => {
  resetFake();
  fake.spaces = [{ id: "s1", name: "GEM", tabs: [] }];
  fake.agents = [agent("t1", "working"), agent("laptop/t2", "blocked")];
  fake.terminals = fake.agents.map((a) => ({ address: a.address, state: "live", labels: {} }));
});

async function opened() { const v = new Agents(); v.init({}, cx); await settle(); return v; }

test("lists agents, the one that needs you first", async () => {
  const v = await opened();
  assert.deepEqual(rowIds(v.render(cx)), ["ag-laptop/t2", "ag-t1"]);
});

test("text is at least 12 px and agent names 14 px", async () => {
  const v = await opened();
  const sizes = nodes(v.render(cx)).flatMap((n) => n.calls.filter(([m]) => m === "text_size").map(([, s]) => s));
  assert.ok(sizes.length && sizes.every((s) => s >= 12), `sizes: ${sizes}`);
  assert.equal(v.render(cx).calls.find(([m]) => m === "text_size")[1], 14);
});

test("the sort menu opens this mod, not Herdr's", async () => {
  const v = await opened();
  const sort = nodes(v.render(cx)).find((n) => n.calls.some(([m, id]) => m === "id" && id === "ag-sort"));
  sort.calls.find(([m]) => m === "on_click")[1]();
  assert.equal(fake.overlays[0].mod, "latveria-agents");
});

test("a local agent's row shows its profile with a colored dot, the machine and the detail", async () => {
  labelAs("t1", "Personal");
  const v = await opened();
  v.profiles = new Map([[null, parseProfiles(MAP)]]);
  const row = rowOf(v.render(cx), "t1");
  assert.match(text(row), /Personal · Mac · Claude Code/);
  assert.ok(has(dotOf(row), "bg", "#e3b341"));
  assert.ok(nodes(row).some((n) => has(n, "h", 46)), "two-line row");
});

test("a remote agent shows its machine; without a label its profile is ?", async () => {
  const v = await opened();
  const row = rowOf(v.render(cx), "laptop/t2");
  assert.match(text(row), /\? · laptop/);
  assert.equal(text(row).match(/laptop/g).length, 1, "the machine is said once");
  const dot = dotOf(row);
  assert.ok(!dot.calls.some(([m]) => m === "bg"));
  assert.ok(has(dot, "border_color", "#dim"));
});

test("a key missing from the map shows the key and an uncolored dot", async () => {
  labelAs("t1", "Other");
  const v = await opened();
  v.profiles = new Map([[null, parseProfiles(MAP)]]);
  const row = rowOf(v.render(cx), "t1");
  assert.match(text(row), /Other · Mac/);
  assert.ok(!dotOf(row).calls.some(([m]) => m === "bg"));
});

test("on the narrow rail a row has no badge, but its tooltip names profile and machine", async () => {
  labelAs("t1", "Personal");
  fake.layout = { id: "root", children: [{ id: "sidebar", size: { px: 76 } }] };
  const v = await opened();
  v.profiles = new Map([[null, parseProfiles(MAP)]]);
  const tree = v.render(cx);
  const row = rowOf(tree, "t1");
  assert.equal(dotOf(row), undefined);
  assert.doesNotMatch(text(row), /Personal/);
  assert.ok(has(row, "tooltip", "Personal · Mac"));
  assert.ok(has(rowOf(tree, "laptop/t2"), "tooltip", "? · laptop"));
});

const PROFILES = "/home/test/.config/latveria/profiles.json";
const REMOTE = JSON.stringify({ profiles: [{ key: "Work", label: "Work", color: "#6ea8fe" }] });

test("this machine's profiles come from its own map", async () => {
  labelAs("t1", "Personal");
  fake.files[PROFILES] = MAP;
  const v = await opened();
  assert.match(text(rowOf(v.render(cx), "t1")), /Personal · Mac/);
  assert.equal(fake.reads[0].path, PROFILES);
  assert.equal(fake.reads[0].options?.on ?? null, null);
});

test("a ready remote machine's map is read through its shell; others are left alone", async () => {
  labelAs("laptop/t2", "Work");
  fake.machines = [{ name: "laptop", layout: "ready" }, { name: "vps", layout: "unavailable" }, { name: null, layout: "ready" }];
  fake.exec = () => ({ stdout: REMOTE });
  const v = await opened();
  assert.ok(has(dotOf(rowOf(v.render(cx), "laptop/t2")), "bg", "#6ea8fe"));
  assert.equal(fake.execs.length, 1);
  assert.equal(fake.execs[0].cmd, "sh");
  assert.equal(fake.execs[0].options.on, "laptop");
  // The machine sends at most one byte past the limit, not the whole file.
  assert.match(fake.execs[0].args[1], /^head -c 65537 /);
});

test("a remote map that fails, errs or is too big gives the bare key, never an error", async () => {
  const fails = [() => { throw new Error("unreachable"); }, () => ({ code: 1, stdout: REMOTE }), () => ({ stdout: REMOTE + " ".repeat(65536) })];
  for (const exec of fails) {
    resetFake();
    fake.spaces = [{ id: "s1", name: "GEM", tabs: [] }];
    fake.agents = [agent("laptop/t2", "blocked")];
    fake.terminals = [{ address: "laptop/t2", state: "live", labels: { [LABEL]: "Work" } }];
    fake.machines = [{ name: "laptop", layout: "ready" }];
    fake.exec = exec;
    const v = await opened();
    const row = rowOf(v.render(cx), "laptop/t2");
    assert.match(text(row), /Work · laptop/);
    assert.ok(!dotOf(row).calls.some(([m]) => m === "bg"));
  }
});

test("reading the same maps again does not redraw", async () => {
  fake.files[PROFILES] = MAP;
  let notified = 0;
  let tick30;
  const counting = { timer: { every(_ms, fn) { tick30 = fn; } }, spawn: (fn) => { fn(counting); }, notify() { notified++; }, stop_propagation() {} };
  const v = new Agents();
  v.init({}, counting);
  await settle();
  assert.equal(notified, 1, "the first read redraws");
  v.loadProfiles(counting);
  await settle();
  assert.equal(notified, 1, "the same map again does not");
  fake.files[PROFILES] = REMOTE;
  tick30(counting);
  await settle();
  assert.ok(fake.reads.length >= 3, "the 30 s timer reads the maps again");
  assert.equal(notified, 3, "the timer's own redraw and the changed map's");
});

// Rule 3's exception: the status tint drops below 4.5:1 on the selected row's background.
const badgeSaying = (row, words) => nodes(row).find((n) => n.kids.includes(words));
for (const sort of ["priority", "grouped"]) {
  test(`the selected row's status is not tinted (${sort} view)`, async () => {
    fake.shared["agents.sort"] = sort;
    const v = await opened();
    // In priority, the "Needs you" section header already says it: the row shows a short "!".
    const words = sort === "priority" ? "!" : "Needs you";
    assert.ok(has(badgeSaying(rowOf(v.render(cx), "laptop/t2"), words), "bg", "#blocked26"), "tinted when not selected");
    fake.agents[1].focused = true;
    const badge = badgeSaying(rowOf(v.render(cx), "laptop/t2"), words);
    assert.ok(badge, "still says it");
    assert.ok(!badge.calls.some(([m]) => m === "bg"), "not tinted when selected");
  });
}
