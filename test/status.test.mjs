import "./fake/register.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setImmediate as tick } from "node:timers/promises";

const { fake, resetFake } = await import("herdr");
const { nodes, text } = await import("./fake/ui.mjs");
const { default: Status } = await import("../mods/latveria-status/main.js");

const settle = async () => { for (let i = 0; i < 10; i++) await tick(); };
const cx = { timer: { every() {} }, spawn: (fn) => { fn(cx); }, notify() {}, stop_propagation() {} };
const sizes = (tree) => nodes(tree).flatMap((n) => n.calls.filter(([m]) => m === "text_size").map(([, s]) => s));

beforeEach(() => {
  resetFake();
  fake.spaces = [{ id: "s1", name: "GEM", active: true, branch: "main", machine: null }];
  fake.agents = [{ address: "t1", status: "working" }, { address: "t2", status: "blocked" }];
  fake.keys = [{ section: "global", action: "app.palette", keys: "cmd-shift-p" }];
});

async function opened() { const v = new Status(); v.init?.({}, cx); await settle(); return v; }

test("Herdr's own parts stay: machine, branch, agents, needs you, the palette hint", async () => {
  const s = text((await opened()).render(cx));
  for (const part of ["This computer", "main", "2 agents", "· 1 needs you", "⌘⇧P  commands"]) assert.ok(s.includes(part), `${part} in: ${s}`);
});

test("the bar's text is 12 px", async () => {
  const all = sizes((await opened()).render(cx));
  assert.ok(all.length && all.every((n) => n >= 12), `sizes: ${all}`);
  assert.equal(all[0], 12);
});

// Snapshots as hooks/latveria-quota.sh writes them; times in seconds, relative to now.
const nowS = () => Math.floor(Date.now() / 1000);
const snap = ({ key = "Personal", label = key, color = "#e3b341", ago = 150, five = 3, seven = 4, fiveIn = 287 * 60 + 30, sevenIn = (6 * 24 + 14) * 3600 + 30 } = {}) =>
  JSON.stringify({ updated: nowS() - ago, profile: key, label, color, rate_limits: {
    ...(five === null ? {} : { five_hour: { used_percentage: five, resets_at: nowS() + fiveIn } }),
    ...(seven === null ? {} : { seven_day: { used_percentage: seven, resets_at: nowS() + sevenIn } }),
  } });
const segment = (tree, id) => nodes(tree).find((n) => n.calls.some(([m, v]) => m === "id" && v === id));
const has = (n, method, value) => n.calls.some(([m, v]) => m === method && v === value);
const saying = (root, words) => nodes(root).find((n) => n.kids.includes(words));
const tooltipOf = (n) => n.calls.find(([m]) => m === "tooltip")?.[1];
// Each machine answers with its own snapshots: this computer without `on`, another with it.
const answer = (by) => { fake.exec = (_cmd, _args, o) => { const r = by[o.on ?? "local"]; if (r instanceof Error) throw r; return { stdout: r ?? "" }; }; };

test("this computer's and each ready machine's profiles, after the agents", async () => {
  fake.machines = [{ name: "laptop", layout: "ready" }, { name: "vps", layout: "unavailable" }];
  answer({ local: snap(), laptop: snap({ key: "Work", color: "#6ea8fe", five: 10, seven: 20 }) });
  const tree = (await opened()).render(cx);
  assert.deepEqual(fake.execs.map((e) => e.options.on ?? null), [null, "laptop"], "only ready machines are asked");
  assert.ok(fake.execs.every((e) => e.cmd === "sh" && e.options.timeout === 5000));
  const s = text(tree);
  assert.match(s, /2 agents .*Personal 5h 3% · 7d 4% Work laptop 5h 10% · 7d 20%/);
  assert.ok(segment(tree, "quota-local-Personal"));
  assert.ok(segment(tree, "quota-laptop-Work"));
});

const machineOf = (seg) => nodes(seg).find((n) => n.kind === "svg" && n.src === "mods/workspace-chrome/server.svg");

test("a profile only another machine reports names that machine after its label, dimmed", async () => {
  fake.machines = [{ name: "laptop", layout: "ready" }];
  answer({ local: snap(), laptop: snap({ key: "Work" }) });
  const tree = (await opened()).render(cx);
  const work = segment(tree, "quota-laptop-Work");
  assert.ok(machineOf(work), "server icon");
  const name = saying(work, "laptop");
  assert.ok(name && has(name, "text_color", "#dim"));
  assert.match(text(work), /^Work laptop 5h/);
  assert.ok(!machineOf(segment(tree, "quota-local-Personal")), "this computer's profile names no machine");
});

test("a profile this computer also reports names no machine", async () => {
  fake.machines = [{ name: "laptop", layout: "ready" }];
  answer({ local: snap(), laptop: snap() });
  const tree = (await opened()).render(cx);
  const all = nodes(tree).filter((n) => n.calls.some(([m, v]) => m === "id" && String(v).startsWith("quota-") && v !== "quota-none"));
  assert.equal(all.length, 1);
  assert.ok(!machineOf(all[0]));
  assert.ok(!text(all[0]).includes("laptop"));
});

test("a long machine name is cut to 16 characters", async () => {
  const long = "a-very-long-machine-name";
  fake.machines = [{ name: long, layout: "ready" }];
  answer({ local: "", [long]: snap({ key: "Work" }) });
  const s = text((await opened()).render(cx));
  assert.ok(s.includes(`Work ${long.slice(0, 16)} 5h`), s);
  assert.ok(!s.includes(long));
});

test("a profile's dot is its color, a ring without one", async () => {
  answer({ local: [snap(), snap({ key: "Work", color: null })].join("\n") });
  const tree = (await opened()).render(cx);
  const dot = (id) => nodes(segment(tree, id)).find((n) => has(n, "size", 8));
  assert.ok(has(dot("quota-local-Personal"), "bg", "#e3b341"));
  assert.ok(has(dot("quota-local-Work"), "border_color", "#dim"));
  assert.ok(!dot("quota-local-Work").calls.some(([m]) => m === "bg"));
});

test("percentages are green below 50, yellow below 80, red from 80", async () => {
  const { WARN } = await import("../mods/latveria-status/quota.js");
  answer({ local: [snap({ five: 85, seven: 60 }), snap({ key: "Work", five: 10, seven: null })].join("\n") });
  const tree = (await opened()).render(cx);
  const p = segment(tree, "quota-local-Personal");
  assert.ok(has(saying(p, "85%"), "text_color", "#blocked"));
  assert.ok(has(saying(p, "60%"), "text_color", WARN));
  const w = segment(tree, "quota-local-Work");
  assert.ok(has(saying(w, "10%"), "text_color", "#working"));
  assert.ok(has(saying(w, "0%"), "text_color", "#working"), "a missing window is 0 %: no usage in it yet");
  assert.ok(nodes(w).some((n) => n.calls.some(([m, v]) => m === "tooltip" && String(v).includes("7d 0%, no usage in the current window"))),
    "its tooltip says why");
});

test("the tooltip says where, when each window resets and when the numbers last changed", async () => {
  answer({ local: snap(), laptop: snap({ key: "Work", five: 0, fiveIn: -60, ago: 30 }) });
  fake.machines = [{ name: "laptop", layout: "ready" }];
  const tree = (await opened()).render(cx);
  assert.equal(tooltipOf(segment(tree, "quota-local-Personal")), "Personal on Mac · 5h 3%, resets in 4h 47m · 7d 4%, resets in 6d 14h · changed 2m ago");
  assert.equal(tooltipOf(segment(tree, "quota-laptop-Work")), "Work on laptop · 5h 0%, reset · 7d 4%, resets in 6d 14h · changed <1m ago");
});

test("without any snapshot the bar says limits ?, with a tooltip, never an error", async () => {
  answer({ local: "{not json\n" });
  const tree = (await opened()).render(cx);
  const none = saying(tree, "limits ?");
  assert.ok(none, text(tree));
  assert.ok(has(none, "text_color", "#dim"));
  assert.match(tooltipOf(none), /No usage snapshot yet/);
});

test("a bad snapshot line is skipped, the good one stays", async () => {
  answer({ local: `{"profile":"a b"}\n${snap()}\n` });
  assert.match(text((await opened()).render(cx)), /Personal 5h 3%/);
});

for (const [why, gone] of [["stops being ready", () => { fake.machines[0].layout = "unavailable"; }],
  ["fails to answer", () => answer({ local: "", laptop: new Error("unreachable") })]]) {
  test(`a machine that ${why} keeps its last readings, dimmed with their age`, async () => {
    fake.machines = [{ name: "laptop", layout: "ready" }];
    answer({ local: "", laptop: snap({ key: "Work", five: 85, ago: 2 * 3600 + 60 }) });
    const v = await opened();
    const fresh = segment(v.render(cx), "quota-laptop-Work");
    assert.ok(has(saying(fresh, "85%"), "text_color", "#blocked"));
    assert.doesNotMatch(text(fresh), /ago/);
    gone();
    v.load(cx);
    await settle();
    const kept = segment(v.render(cx), "quota-laptop-Work");
    assert.ok(kept, "the reading stays");
    assert.match(text(kept), /Work laptop 5h 85% · 7d 4% · 2h ago/);
    assert.ok(has(saying(kept, "85%"), "text_color", "#dim"));
    assert.ok(has(saying(kept, "Work"), "text_color", "#dim"));
  });
}

test("a machine removed from Herdr takes its readings with it", async () => {
  fake.machines = [{ name: "laptop", layout: "ready" }];
  answer({ local: "", laptop: snap({ key: "Work" }) });
  const v = await opened();
  fake.machines = [];
  v.load(cx);
  await settle();
  assert.ok(saying(v.render(cx), "limits ?"));
});

test("redraws only when readings change, or a dimmed reading's age does", async (t) => {
  let notified = 0;
  const timers = new Map(); // by interval, whatever order the mod registers them in
  const counting = { timer: { every(ms, fn) { timers.set(ms, fn); } }, spawn: (fn) => { fn(counting); }, notify() { notified++; }, stop_propagation() {} };
  fake.machines = [{ name: "laptop", layout: "ready" }];
  answer({ local: snap(), laptop: snap({ key: "Work" }) });
  const v = new Status();
  v.init({}, counting);
  await settle();
  assert.ok(timers.has(30000), `timers: ${[...timers.keys()]}`);
  const poll = timers.get(30000);
  assert.equal(notified, 1, "the first read redraws");
  poll(counting);
  await settle();
  assert.equal(notified, 1, "the same readings again do not");
  fake.machines[0].layout = "unavailable";
  poll(counting);
  await settle();
  assert.equal(notified, 2, "the laptop going quiet does");
  const start = Date.now();
  t.mock.method(Date, "now", () => start + 20000);
  poll(counting);
  await settle();
  assert.equal(notified, 2, "the same minute of age does not");
  t.mock.method(Date, "now", () => start + 130000);
  poll(counting);
  await settle();
  assert.equal(notified, 3, "a new minute of age does");
});

test("this computer's own read failing keeps its readings, dimmed with their age", async () => {
  answer({ local: snap({ five: 85, ago: 3 * 3600 + 60 }) });
  const v = await opened();
  answer({ local: new Error("sh failed") });
  v.load(cx);
  await settle();
  const kept = segment(v.render(cx), "quota-local-Personal");
  assert.match(text(kept), /Personal 5h 85% · 7d 4% · 3h ago/);
  assert.ok(has(saying(kept, "85%"), "text_color", "#dim"));
});

test("a reading from an unreachable machine that passes its reset meanwhile shows 0 %, reset", async (t) => {
  fake.machines = [{ name: "laptop", layout: "ready" }];
  answer({ local: "", laptop: snap({ key: "Work", five: 85, fiveIn: 30 }) });
  const v = await opened();
  answer({ local: "", laptop: new Error("unreachable") });
  const start = Date.now();
  t.mock.method(Date, "now", () => start + 60000);
  v.load(cx);
  await settle();
  const kept = segment(v.render(cx), "quota-laptop-Work");
  assert.match(text(kept), /Work laptop 5h 0% · 7d 4%/);
  assert.match(tooltipOf(kept), /5h 0%, reset ·/);
});

test("a window at 0 % with no reset time is not called reset", async () => {
  answer({ local: JSON.stringify({ updated: nowS() - 60, profile: "Personal", label: "Personal", color: null,
    rate_limits: { five_hour: { used_percentage: 0, resets_at: null } } }) });
  const tip = tooltipOf(segment((await opened()).render(cx), "quota-local-Personal"));
  assert.match(tip, /5h 0% · 7d 0%, no usage in the current window/); // 7d is missing, so idle
  assert.doesNotMatch(tip, /5h 0%, reset/);
});

// Clocks differ between machines: a quiet machine whose clock runs ahead must not dim a profile another answers for.
test("a profile is dimmed only when every machine it came from is quiet; the tooltip names an answering one", async () => {
  fake.machines = [{ name: "laptop", layout: "ready" }, { name: "vps", layout: "ready" }];
  answer({ local: snap({ ago: 300 }), laptop: snap({ ago: -600 }), vps: snap({ ago: 120 }) });
  const v = await opened();
  answer({ local: snap({ ago: 300 }), laptop: new Error("unreachable"), vps: snap({ ago: 120 }) });
  v.load(cx);
  await settle();
  const tree = v.render(cx);
  const seg = nodes(tree).find((n) => n.calls.some(([m, val]) => m === "id" && /-Personal$/.test(val)));
  assert.ok(has(saying(seg, "Personal"), "text_color", "#muted"), "not dimmed");
  assert.ok(has(saying(seg, "3%"), "text_color", "#working"));
  assert.doesNotMatch(text(seg), /ago/);
  assert.match(tooltipOf(seg), /^Personal on vps · .* · changed 2m ago$/, "the newest answering machine");
  answer({ local: new Error("x"), laptop: new Error("x"), vps: new Error("x") });
  v.load(cx);
  await settle();
  const quiet = nodes(v.render(cx)).find((n) => n.calls.some(([m, val]) => m === "id" && /-Personal$/.test(val)));
  assert.ok(has(saying(quiet, "Personal"), "text_color", "#dim"), "all quiet: dimmed");
  assert.match(tooltipOf(quiet), /^Personal on laptop · /, "all quiet: the newest overall");
});

test("a machine that becomes ready is read on the next 5 s check, only when the ready set grew", async () => {
  const timers = {};
  const c = { timer: { every(ms, fn) { timers[ms] = fn; } }, spawn: (fn) => { fn(c); }, notify() {}, stop_propagation() {} };
  const asked = () => fake.execs.map((e) => e.options.on ?? null);
  fake.machines = [{ name: "laptop", layout: "loading" }];
  answer({ local: "", laptop: snap({ key: "Work" }) });
  const v = new Status();
  v.init({}, c);
  await settle();
  assert.deepEqual(asked(), [null]);
  assert.equal(typeof timers[5000], "function");
  timers[5000](c);
  await settle();
  assert.deepEqual(asked(), [null], "nothing new is ready: no read");
  fake.machines[0].layout = "ready";
  timers[5000](c);
  await settle();
  assert.deepEqual(asked(), [null, null, "laptop"]);
  assert.match(text(v.render(c)), /Work laptop 5h 3%/);
  timers[5000](c);
  await settle();
  assert.equal(fake.execs.length, 3, "the same ready set: no read");
  fake.machines[0].layout = "unavailable";
  timers[5000](c);
  await settle();
  assert.equal(fake.execs.length, 3, "a shrinking set: no read");
  fake.machines[0].layout = "ready";
  timers[5000](c);
  await settle();
  assert.deepEqual(asked().slice(3), [null, "laptop"], "a machine back again is read at once");
});

test("a dimmed reading redraws when its shown age changes, not every minute", async (t) => {
  let notified = 0;
  const c = { timer: { every() {} }, spawn: (fn) => { fn(c); }, notify() { notified++; }, stop_propagation() {} };
  fake.machines = [{ name: "laptop", layout: "ready" }];
  answer({ local: "", laptop: snap({ key: "Work", ago: 2 * 3600 + 60 }) });
  const v = new Status();
  v.init({}, c);
  await settle();
  fake.machines[0].layout = "unavailable";
  v.load(c);
  await settle();
  assert.equal(notified, 2);
  const start = Date.now();
  t.mock.method(Date, "now", () => start + 5 * 60000);
  v.load(c);
  await settle();
  assert.equal(notified, 2, "2h 1m → 2h 6m: the bar still says 2h");
  t.mock.method(Date, "now", () => start + 60 * 60000);
  v.load(c);
  await settle();
  assert.equal(notified, 3, "3h");
});

// A cx that keeps the mod's timers by interval, so a test can fire the 1 s tick itself.
function ticking() {
  const timers = new Map();
  const c = { timer: { every(ms, fn) { timers.set(ms, fn); } }, spawn: (fn) => { fn(c); }, notify() {}, stop_propagation() {} };
  return { c, timers, tick: () => timers.get(1000)(c) };
}

test("the Dock badge counts the agents that need you, and changes only when the count does", async () => {
  fake.agents = [{ address: "t1", status: "blocked" }, { address: "t2", status: "blocked" }, { address: "t3", status: "working" }];
  const { c, timers, tick } = ticking();
  new Status().init({}, c);
  await settle();
  assert.ok(timers.has(1000), `timers: ${[...timers.keys()]}`);
  assert.deepEqual(fake.badges, ["2"]);
  tick();
  assert.deepEqual(fake.badges, ["2"], "the same count is not set again");
  fake.agents = [{ address: "t1", status: "working" }];
  tick();
  assert.deepEqual(fake.badges, ["2", null], "nobody waiting: no badge");
});

test("the badge goes when the bar does", async () => {
  fake.agents = [{ address: "t1", status: "blocked" }];
  const v = new Status();
  v.init({}, ticking().c);
  await v.close?.();
  assert.equal(fake.badges.at(-1), null);
});

test("during herdr-app check the bar sets no badge, starts no timer and reads nothing", async () => {
  fake.checking = true;
  fake.agents = [{ address: "t1", status: "blocked" }];
  const { c, timers } = ticking();
  new Status().init({}, c);
  await settle();
  assert.deepEqual([fake.badges, timers.size, fake.execs.length], [[], 0, 0]);
});

const clickOn = (tree, id) => segment(tree, id).calls.find(([m]) => m === "on_click")[1]({}, cx);

test("clicking the counter shows the agent that has waited longest, not the first in the list", async (t) => {
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  fake.agents = [{ address: "t2", status: "blocked", seq: 9 }];
  const { c, tick } = ticking();
  const v = new Status();
  v.init({}, c);
  now = 2000;
  fake.agents = [{ address: "t3", status: "blocked", seq: 1 }, { address: "t2", status: "blocked", seq: 9 }];
  tick();
  clickOn(v.render(c), "needs-you");
  assert.deepEqual(fake.runs.at(-1), ["agent.focus", { terminal: "t2" }]);
  fake.agents = [{ address: "t3", status: "blocked", seq: 1 }, { address: "t2", status: "working", seq: 10 }];
  tick();
  clickOn(v.render(c), "needs-you");
  assert.deepEqual(fake.runs.at(-1), ["agent.focus", { terminal: "t3" }]);
});

test("agents the bar has not timed yet go by the lowest seq", async () => {
  fake.agents = [{ address: "t5", status: "blocked", seq: 7 }, { address: "t4", status: "blocked", seq: 3 }];
  const v = new Status();
  v.init({}, ticking().c);
  v.since.clear();
  clickOn(v.render(cx), "needs-you");
  assert.deepEqual(fake.runs.at(-1), ["agent.focus", { terminal: "t4" }]);
});

// Banners: notes the toast queued while Herdr was not in front.
const BANNER = { title: "t7 needs you", body: "Claude Code", level: "warning", action: { name: "agent.focus", args: { terminal: "t7" } } };
const queued = (...notes) => { fake.shared["latveria.notes"] = notes.map((n) => ({ ...BANNER, at: Date.now(), ...n })); };
const banners = () => fake.execs.filter((e) => e.cmd === "terminal-notifier");
const { notifierArgs } = await import("../mods/latveria-status/notifier.js");

// Banners are for a Herdr that is not in front.
async function bar() {
  fake.active = false;
  const t = ticking();
  const v = new Status();
  v.init({}, t.c);
  await settle();
  return { v, ...t };
}

test("a queued note becomes a banner that waits for a click; the queue empties", async () => {
  const { tick } = await bar();
  queued({});
  tick();
  await settle();
  assert.equal(banners().length, 1);
  assert.deepEqual(banners()[0].args, notifierArgs(BANNER));
  assert.equal(banners()[0].options.timeout, 600000);
  assert.equal(banners()[0].options.on, undefined, "on this computer: the banner shows where the window is");
  assert.deepEqual(fake.shared["latveria.notes"], []);
});

test("a note older than a minute is dropped (shared state outlives a restart)", async () => {
  const { tick } = await bar();
  queued({ at: Date.now() - 61_000 });
  tick();
  await settle();
  assert.equal(banners().length, 0);
});

test("no queued note: no exec at all", async () => {
  const { tick } = await bar();
  const before = fake.execs.length;
  tick();
  await settle();
  assert.equal(fake.execs.length, before);
});

// The notifier's answer for banners only; the quota reads keep answering empty.
const notifier = (answer) => { fake.exec = (cmd) => (cmd === "terminal-notifier" ? answer() : { stdout: "" }); };

test("a click on the banner runs the note's action", async () => {
  notifier(() => ({ code: 0, stdout: "" }));
  const { tick } = await bar();
  queued({});
  tick();
  await settle();
  assert.deepEqual(fake.runs, [["agent.focus", { terminal: "t7" }]]);
  assert.deepEqual(fake.notes, []);
});

test("a banner nobody clicked runs nothing", async () => {
  notifier(() => ({ code: 6, stdout: "@TIMEOUT\n" }));
  const { tick } = await bar();
  queued({});
  tick();
  await settle();
  assert.deepEqual([fake.runs, fake.notes], [[], []]);
});

test("a note without an action runs nothing on click", async () => {
  notifier(() => ({ code: 0, stdout: "" }));
  const { tick } = await bar();
  queued({ action: undefined });
  tick();
  await settle();
  assert.deepEqual(fake.runs, []);
});

for (const [why, answer] of [["not installed", () => { throw new Error("no such program"); }], ["not allowed", () => ({ code: 3, stdout: "" })]]) {
  test(`notifier ${why}: the note goes back into the window, and the toast is told to keep notes there`, async (t) => {
    t.mock.method(Date, "now", () => 7000);
    notifier(answer);
    const { tick } = await bar();
    queued({});
    tick();
    await settle();
    assert.deepEqual(fake.shared["latveria.direct"], ["t7 needs you\nClaude Code"]);
    assert.deepEqual(fake.notes, [{ title: "t7 needs you", body: "Claude Code", level: "warning", action: BANNER.action }]);
    assert.deepEqual(fake.shared["latveria.notifier"], { missing: true, at: 7000 });
    assert.deepEqual(fake.runs, []);
  });
}

test("five banners waiting: a sixth note goes into the window, without a sixth exec", async () => {
  notifier(() => new Promise(() => {})); // nobody clicks yet
  const { tick } = await bar();
  queued(...Array.from({ length: 6 }, (_, i) => ({ title: `t${i} needs you`, action: { name: "agent.focus", args: { terminal: `t${i}` } } })));
  tick();
  await settle();
  assert.equal(banners().length, 5);
  assert.deepEqual(fake.shared["latveria.direct"], ["t5 needs you\nClaude Code"]);
  assert.equal(fake.notes.length, 1);
  assert.equal(fake.shared["latveria.notifier"], undefined, "a full queue is not a missing program");
});

test("the same note for the same agent while its banner still waits: no second banner", async () => {
  notifier(() => new Promise(() => {}));
  const { tick } = await bar();
  queued({});
  tick();
  queued({});
  tick();
  await settle();
  assert.equal(banners().length, 1);
  assert.deepEqual(fake.notes, [], "not drawn in the window either: the banner is still there");
});

test("a different note for the same agent gets its own banner", async () => {
  notifier(() => new Promise(() => {}));
  const { tick } = await bar();
  queued({});
  tick();
  queued({ title: "t7 finished" });
  tick();
  await settle();
  assert.equal(banners().length, 2);
});

test("once a banner is answered, the same note can show again", async () => {
  notifier(() => ({ code: 6, stdout: "@TIMEOUT" }));
  const { tick } = await bar();
  queued({});
  tick();
  await settle();
  queued({});
  tick();
  await settle();
  assert.equal(banners().length, 2);
});

test("another failure draws the note in the window but keeps trying banners", async () => {
  notifier(() => ({ code: 1, stdout: "something odd" }));
  const { tick } = await bar();
  queued({});
  tick();
  await settle();
  assert.equal(fake.notes.length, 1);
  assert.equal(fake.shared["latveria.notifier"], undefined);
});

test("Herdr back in front before the bar's tick: the queued note is drawn in the window, no banner", async () => {
  const { tick } = await bar();
  queued({});
  fake.active = true;
  tick();
  await settle();
  assert.equal(banners().length, 0);
  assert.deepEqual(fake.shared["latveria.direct"], ["t7 needs you\nClaude Code"]);
  assert.equal(fake.notes.length, 1);
});

test("the badge counts agents on every machine", async () => {
  fake.agents = [{ address: "t1", status: "blocked" }, { address: "laptop/t3", status: "blocked" }];
  await bar();
  assert.deepEqual(fake.badges, ["2"]);
});
