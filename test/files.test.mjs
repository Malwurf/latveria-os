import "./fake/register.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setImmediate as tick } from "node:timers/promises";

const { fake, resetFake } = await import("herdr");
const { nodes, text } = await import("./fake/ui.mjs");
const { default: Files } = await import("../mods/latveria-files/main.js");

// Lets the mod's spawned tasks (listing, git) finish; its folder watch never resolves, by design.
const settle = async () => { for (let i = 0; i < 10; i++) await tick(); };
const cx = { timer: { every() {} }, spawn: (fn) => { fn(cx); }, notify() {} };
const listing = (entries) => entries.map(([kind, name]) => `${kind}\0${name}\0`).join("");
const TREE = {
  "/repo": [["d", "docs"], ["f", "README.md"], ["f", "logo.png"]],
  "/repo/docs": [["f", "guide.md"]],
};
const rowIds = (tree) => nodes(tree).flatMap((n) => n.calls.filter(([m, v]) => m === "id" && String(v).startsWith("file-")).map(([, v]) => v));

beforeEach(() => {
  resetFake();
  fake.spaces = [{ id: "s1", active: true, folder: "/repo", machine: null }];
  fake.panes = [{ pane: "p1", cwd: "/repo" }];
  fake.focused = { pane: "p1" };
  fake.exec = (cmd, args) => (cmd === "sh" ? { stdout: listing(TREE[args[3]] ?? []) } : { code: 1 }); // not a git repo
});

async function opened() {
  const files = new Files();
  files.init({}, cx);
  await settle();
  return files;
}

test("lists the focused pane's folder, folders first", async () => {
  const files = await opened();
  assert.deepEqual(rowIds(files.render(cx)), ["file-docs", "file-logo.png", "file-README.md"]);
});

test("opening a folder lists what is inside", async () => {
  const files = await opened();
  files.toggle("docs", cx);
  await settle();
  assert.match(text(files.render(cx)), /guide\.md/);
});

test("a remote space is listed and read on its machine", async () => {
  fake.spaces[0].machine = "laptop";
  const files = await opened();
  files.toggle("docs", cx);
  await settle();
  files.show("README.md", cx);
  await settle();
  const listings = fake.execs.filter((e) => e.cmd === "sh");
  assert.deepEqual(listings.map((e) => e.args[3]), ["/repo", "/repo/docs"]);
  assert.ok(fake.execs.some((e) => e.cmd === "git"));
  assert.ok(fake.execs.every((e) => e.options.on === "laptop"), "every listing and git call runs on the laptop");
  assert.deepEqual(fake.reads.map((r) => [r.path, r.options.on]), [["/repo/README.md", "laptop"]]);
});

test("every row shows its type's Material icon in full color", async () => {
  const files = await opened();
  files.toggle("docs", cx);
  await settle();
  const icons = nodes(files.render(cx)).filter((n) => n.kind === "image").map((n) => n.src.split("/").pop());
  assert.deepEqual(icons, ["folder-docs-open.svg", "markdown.svg", "image.svg", "readme.svg"]);
  for (const n of nodes(files.render(cx)).filter((n) => n.kind === "image")) {
    assert.ok(n.calls.some(([m, v]) => m === "size" && v === 16), "16 px");
    assert.ok(!n.calls.some(([m]) => m === "text_color"), "full color, not tinted");
  }
});

test("entry names are 14 px", async () => {
  const files = await opened();
  assert.ok(files.render(cx).calls.some(([m, v]) => m === "text_size" && v === 14));
});
