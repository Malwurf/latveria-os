import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { install } from "../install.mjs";

function world() {
  const root = mkdtempSync(join(tmpdir(), "latveria-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "themes"), { recursive: true });
  mkdirSync(join(repo, "layouts"), { recursive: true });
  writeFileSync(join(repo, "themes", "latveria.json"), '{"v":1}');
  writeFileSync(join(repo, "layouts", "latveria.json"), '{"l":1}');
  return { repo, herdrHome: join(root, "herdr"), stateDir: join(root, "state"), now: 1000 };
}
const actions = (steps) => steps.map((s) => `${s.rel}:${s.action}`).sort();

test("first install creates every file and records it", () => {
  const w = world();
  assert.deepEqual(actions(install(w)), ["layouts/latveria.json:create", "themes/latveria.json:create"]);
  assert.equal(readFileSync(join(w.herdrHome, "themes", "latveria.json"), "utf8"), '{"v":1}');
  assert.ok(JSON.parse(readFileSync(join(w.stateDir, "installed.json"), "utf8"))["themes/latveria.json"]);
});

test("a second install of the same files changes nothing", () => {
  const w = world();
  install(w);
  assert.deepEqual(actions(install(w)), ["layouts/latveria.json:same", "themes/latveria.json:same"]);
});

test("a new version replaces a file the person never touched, without a backup", () => {
  const w = world();
  install(w);
  writeFileSync(join(w.repo, "themes", "latveria.json"), '{"v":2}');
  assert.deepEqual(actions(install(w)), ["layouts/latveria.json:same", "themes/latveria.json:update"]);
  assert.deepEqual(readdirSync(join(w.herdrHome, "themes")), ["latveria.json"]);
});

test("a file the person edited is backed up before it is replaced", () => {
  const w = world();
  install(w);
  writeFileSync(join(w.herdrHome, "themes", "latveria.json"), '{"mine":true}');
  assert.deepEqual(actions(install(w)), ["layouts/latveria.json:same", "themes/latveria.json:backup"]);
  assert.equal(readFileSync(join(w.herdrHome, "themes", "latveria.json.bak-1000"), "utf8"), '{"mine":true}');
  assert.equal(readFileSync(join(w.herdrHome, "themes", "latveria.json"), "utf8"), '{"v":1}');
});

test("a dry run reports and writes nothing", () => {
  const w = world();
  assert.deepEqual(actions(install({ ...w, dryRun: true })), ["layouts/latveria.json:create", "themes/latveria.json:create"]);
  assert.equal(existsSync(w.herdrHome), false);
  assert.equal(existsSync(w.stateDir), false);
});

test("a corrupt ledger stops with a message that names it", () => {
  const w = world();
  mkdirSync(w.stateDir, { recursive: true });
  writeFileSync(join(w.stateDir, "installed.json"), "{not json");
  assert.throws(() => install(w), /installed\.json is not valid JSON/);
});

test("mods are installed with their nested files, Herdr's own files left out", () => {
  const w = world();
  mkdirSync(join(w.repo, "mods", "m", "icons"), { recursive: true });
  writeFileSync(join(w.repo, "mods", "m", "main.js"), "x");
  writeFileSync(join(w.repo, "mods", "m", "icons", "a.svg"), "<svg/>");
  writeFileSync(join(w.repo, "mods", "m", "jsconfig.json"), "{}"); // Herdr writes it; never ours
  writeFileSync(join(w.repo, "mods", "m", "gpui-kit.d.ts"), "");
  assert.deepEqual(actions(install(w)).filter((a) => a.startsWith("mods/")), ["mods/m/icons/a.svg:create", "mods/m/main.js:create"]);
  assert.equal(readFileSync(join(w.herdrHome, "mods", "m", "icons", "a.svg"), "utf8"), "<svg/>");
});

test("hooks go to the state folder, not Herdr's home, and are backed up like the rest", () => {
  const w = world();
  mkdirSync(join(w.repo, "hooks"), { recursive: true });
  writeFileSync(join(w.repo, "hooks", "latveria-label.sh"), "#!/bin/sh\nexit 0\n");
  writeFileSync(join(w.repo, "hooks", "notes.txt"), "not a hook");
  assert.ok(actions(install(w)).includes("hooks/latveria-label.sh:create"));
  assert.ok(existsSync(join(w.stateDir, "hooks", "latveria-label.sh")));
  assert.ok(!existsSync(join(w.herdrHome, "hooks")));
  assert.ok(!existsSync(join(w.stateDir, "hooks", "notes.txt")));
  assert.ok(JSON.parse(readFileSync(join(w.stateDir, "installed.json"), "utf8"))["hooks/latveria-label.sh"]);
  writeFileSync(join(w.stateDir, "hooks", "latveria-label.sh"), "#!/bin/sh\necho mine\n");
  assert.ok(actions(install(w)).includes("hooks/latveria-label.sh:backup"));
  assert.ok(existsSync(join(w.stateDir, "hooks", "latveria-label.sh.bak-1000")));
});
