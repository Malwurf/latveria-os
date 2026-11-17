import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

// Mods Herdr 0.1.16 ships; a layout may also use this repo's mods/<name>.
const SHIPPED = new Set(["agents", "changes", "confirm", "files", "help", "machine-add", "menu", "new-menu", "pane", "peek",
  "picker", "prompt", "spaces", "tabs", "terminals-bar", "terminals-pane", "toast", "workspace-chrome", "workspace-status", "worktree"]);
const layout = JSON.parse(readFileSync(new URL("../layouts/latveria.json", import.meta.url), "utf8"));
const mods = (node) => [node.content?.mod, node.content?.pane?.header?.content?.mod, ...(node.children ?? []).flatMap(mods)].filter(Boolean);

test("the layout wears the latveria theme", () => assert.equal(layout.theme, "latveria"));
test("the layout leaves terminal font sizes to Herdr", () => assert.equal(layout.font_size, undefined));
test("every mod the layout names exists", () => {
  const missing = mods(layout).filter((m) => !SHIPPED.has(m) && !existsSync(new URL(`../mods/${m}/main.js`, import.meta.url)));
  assert.deepEqual(missing, []);
});
test("the Files panel is ours", () => {
  assert.ok(mods(layout).includes("latveria-files"));
  assert.ok(!mods(layout).includes("files"));
});
test("the Agents list is ours", () => {
  assert.ok(mods(layout).includes("latveria-agents"));
  assert.ok(!mods(layout).includes("agents"));
});
test("the status bar is ours", () => {
  assert.ok(mods(layout).includes("latveria-status"));
  assert.ok(!mods(layout).includes("workspace-status"));
});
test("notes are ours: the root names latveria-toast, which exists", () => {
  assert.equal(layout.toast, "latveria-toast");
  assert.ok(existsSync(new URL("../mods/latveria-toast/main.js", import.meta.url)));
});
