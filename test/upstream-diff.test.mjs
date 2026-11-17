import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { upstreamChanges } from "../scripts/upstream-diff.mjs";

function world(installed) {
  const root = mkdtempSync(join(tmpdir(), "latveria-up-"));
  const repo = join(root, "repo");
  const herdrHome = join(root, "herdr");
  mkdirSync(join(repo, "mods", "my-files"), { recursive: true });
  writeFileSync(join(repo, "mods", "my-files", "mod.json"), JSON.stringify({ cloned_from: { name: "files", version: "0.1.16" } }));
  mkdirSync(join(repo, "mods", "own"), { recursive: true });
  writeFileSync(join(repo, "mods", "own", "mod.json"), "{}");
  mkdirSync(join(repo, "upstream", "files-0.1.16"), { recursive: true });
  writeFileSync(join(repo, "upstream", "files-0.1.16", "main.js"), "export const v = 1;\n");
  if (installed !== undefined) {
    mkdirSync(join(herdrHome, "mods", "files"), { recursive: true });
    writeFileSync(join(herdrHome, "mods", "files", "main.js"), installed);
  }
  return { repo, herdrHome };
}

test("an untouched upstream mod is the same; mods we wrote ourselves are skipped", () => {
  assert.deepEqual(upstreamChanges(world("export const v = 1;\n")).map((r) => [r.mod, r.status]), [["my-files", "same"]]);
});

test("a changed upstream mod comes with its diff", () => {
  const [r] = upstreamChanges(world("export const v = 2;\n"));
  assert.equal(r.status, "changed");
  assert.match(r.diff, /-export const v = 1;\n\+export const v = 2;/);
});

test("a mod Herdr no longer ships is missing", () => {
  assert.equal(upstreamChanges(world(undefined))[0].status, "missing");
});

test("a cloned_from that could leave the repo is refused, not followed", () => {
  const w = world("export const v = 1;\n");
  writeFileSync(join(w.repo, "mods", "my-files", "mod.json"), JSON.stringify({ cloned_from: { name: "../../etc", version: "0.1.16" } }));
  assert.deepEqual(upstreamChanges(w).map((r) => [r.mod, r.status]), [["my-files", "invalid"]]);
  writeFileSync(join(w.repo, "mods", "my-files", "mod.json"), JSON.stringify({ cloned_from: { name: "files" } }));
  assert.equal(upstreamChanges(w)[0].status, "invalid");
});
