#!/usr/bin/env node
// After a Herdr update: has a mod we cloned changed upstream since we cloned it? Compares
// upstream/<name>-<version>/main.js (the pristine copy, from mod.json's cloned_from) with the
// installed Herdr mod. Exit 0 when nothing changed, 1 when something changed, is missing or invalid.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// cloned_from comes from a file; a name like "../x" must not walk out of the repo or Herdr's home.
const SAFE = /^[A-Za-z0-9][\w.-]*$/;
const safe = (from) => [from?.name, from?.version].every((v) => typeof v === "string" && SAFE.test(v));

function gitDiff(a, b) {
  try {
    execFileSync("git", ["diff", "--no-index", "--no-color", "--", a, b], { encoding: "utf8" });
    return "";
  } catch (e) {
    return e.stdout ?? String(e); // git diff exits 1 when the files differ
  }
}

export function upstreamChanges({ repo, herdrHome }) {
  const mods = join(repo, "mods");
  if (!existsSync(mods)) return [];
  const out = [];
  for (const mod of readdirSync(mods).sort()) {
    const metaPath = join(mods, mod, "mod.json");
    if (!existsSync(metaPath)) continue;
    const from = JSON.parse(readFileSync(metaPath, "utf8")).cloned_from;
    if (!from) continue;
    if (!safe(from)) {
      out.push({ mod, from, status: "invalid", diff: "" });
      continue;
    }
    const pristine = join(repo, "upstream", `${from.name}-${from.version}`, "main.js");
    const current = join(herdrHome, "mods", from.name, "main.js");
    if (!existsSync(pristine) || !existsSync(current)) {
      out.push({ mod, from, status: "missing", diff: "" });
      continue;
    }
    const same = readFileSync(pristine, "utf8") === readFileSync(current, "utf8");
    out.push({ mod, from, status: same ? "same" : "changed", diff: same ? "" : gitDiff(pristine, current) });
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const results = upstreamChanges({
    repo: fileURLToPath(new URL("..", import.meta.url)),
    herdrHome: process.env.HERDR_APP_HOME ?? join(homedir(), ".config", "herdr-app"),
  });
  for (const r of results) {
    console.log(`${r.status.padEnd(7)} ${r.mod} (cloned from ${r.from.name} ${r.from.version})`);
    if (r.diff) console.log(r.diff);
  }
  process.exit(results.some((r) => r.status !== "same") ? 1 : 0);
}
