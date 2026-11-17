#!/usr/bin/env node
// Copies the theme, layout and mods into Herdr's home and the hooks into LatveriaOS's state folder. Never overwrites silently: a file the person changed
// since our last install is kept as <name>.bak-<ms> first. Nothing is deleted.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

// themes and layouts: their JSON files; mods: everything, nested, except the files Herdr writes itself;
// hooks: shell scripts, into the state folder (Claude Code runs them, not Herdr).
const HERDR_WRITES = new Set(["gpui-kit.d.ts", "jsconfig.json"]);
const PARTS = [
  ["themes", (n) => n.endsWith(".json"), "herdr"],
  ["layouts", (n) => n.endsWith(".json"), "herdr"],
  ["mods", (n) => !HERDR_WRITES.has(n.split(sep).pop()), "herdr"],
  ["hooks", (n) => n.endsWith(".sh"), "state"],
];
const sha = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

function readLedger(path) {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, "utf8"); // a read error surfaces as itself
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${path} is not valid JSON; fix or remove it, then install again`);
  }
}

export function install({ repo, herdrHome, stateDir, dryRun = false, now = Date.now() }) {
  const ledgerPath = join(stateDir, "installed.json");
  const ledger = readLedger(ledgerPath);
  const steps = [];
  for (const [part, wanted, root] of PARTS) {
    const from = join(repo, part);
    if (!existsSync(from)) continue;
    const names = readdirSync(from, { recursive: true }).map(String)
      .filter((n) => wanted(n) && statSync(join(from, n)).isFile()).sort();
    for (const name of names) {
      const rel = `${part}/${name.split(sep).join("/")}`;
      const src = join(from, name);
      const dest = join(root === "state" ? stateDir : herdrHome, part, name);
      const hash = sha(src);
      let action = "create";
      if (existsSync(dest)) {
        const current = sha(dest);
        action = current === hash ? "same" : ledger[rel] === current ? "update" : "backup";
      }
      steps.push({ rel, action });
      if (dryRun) continue;
      if (action !== "same") {
        mkdirSync(dirname(dest), { recursive: true });
        if (action === "backup") copyFileSync(dest, `${dest}.bak-${now}`);
        copyFileSync(src, dest);
      }
      ledger[rel] = hash;
    }
  }
  if (!dryRun) {
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(`${ledgerPath}.tmp`, JSON.stringify(ledger, null, 2) + "\n");
    renameSync(`${ledgerPath}.tmp`, ledgerPath); // never a half-written ledger
  }
  return steps;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const steps = install({
    repo: dirname(fileURLToPath(import.meta.url)),
    herdrHome: process.env.HERDR_APP_HOME ?? join(homedir(), ".config", "herdr-app"),
    stateDir: process.env.LATVERIA_STATE ?? join(homedir(), ".config", "latveria"),
    dryRun: process.argv.includes("--dry-run"),
  });
  for (const s of steps) console.log(`${s.action.padEnd(6)} ${s.rel}`);
}
