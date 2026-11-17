// Fails when the repo carries personal data: names of accounts, clients or people (kept here only as
// sha256, so the scanner itself never brings them in), machine paths and e-mail addresses.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const FORBIDDEN = new Set([
  "ec4a2ae9d8ebb3c1f174f90de8989f22921df51819c9558fec8e74955808aff1",
  "57fd3e98b5fa1345f8474c6277f0b2dfeef52c1d398cdd7e7a661a90195e0020",
  "c8ed1dcd43058307f95a0246d2c63f23f46b1092329117caa8b3090bd27e5d56",
  "a4c5724011b930f43d3ab9cd2ba8d22da81cde2a69ed975ac1855573335e8aeb",
  "66f471705371b5ce331603e4ea14f3fa77a74b45400b9cde46522e7f08dee15d",
  "f6b11133f7e43b27f293ff1da3cc59141e51a276fbbeda0369f22bec74fe61a6",
  "559ac631b69795cda36bfccd088bb9bc7d19f33bb7fa3dadf6b52e3b437b8a9f",
  "5210528c23aedfaed8165119d047bdd43c4c875fb7d9f015fa3a3c07f9452be8", // inflected stem
]);
const MIN = 5;
const MAX = 10;
const PATH = /\/(?:Users\/[A-Za-z]|home\/(?!test\b)[a-z])/;
// Bounded parts keep this linear on long minified lines.
const EMAIL = /[A-Za-z0-9._%+-]{1,64}@([A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,24})\b/g;
const ALLOWED_DOMAINS = /(^|\.)(example\.(com|org)|users\.noreply\.github\.com)$/i;
const sha = (s) => createHash("sha256").update(s).digest("hex");

function hasTerm(line, terms) {
  const folded = line.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/ł/g, "l"); // ł has no NFD form
  for (const token of folded.split(/[^a-z0-9]+/)) {
    for (let len = MIN; len <= Math.min(MAX, token.length); len++) {
      for (let i = 0; i + len <= token.length; i++) if (terms.has(sha(token.slice(i, i + len)))) return true;
    }
  }
  return false;
}

export function scanText(path, text, terms = FORBIDDEN) {
  const findings = [];
  text.split("\n").forEach((line, i) => {
    const at = { path, line: i + 1 };
    if (hasTerm(line, terms)) findings.push({ ...at, kind: "term" });
    if (PATH.test(line)) findings.push({ ...at, kind: "path" });
    for (const m of line.matchAll(EMAIL)) if (!ALLOWED_DOMAINS.test(m[1])) { findings.push({ ...at, kind: "email" }); break; }
  });
  return findings;
}

// A file name carries words too: `profiles/<client>.json` breaks the rule as much as its contents.
export function scanPath(path, terms = FORBIDDEN) {
  return hasTerm(path, terms) ? [{ path, line: 0, kind: "term" }] : [];
}

function repoFiles() {
  const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" });
  return out.split("\0").filter(Boolean);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const findings = [];
  for (const path of repoFiles()) {
    findings.push(...scanPath(path));
    let buf;
    try { buf = readFileSync(path); } catch { continue; } // deleted but still listed
    if (buf.subarray(0, 8000).includes(0)) continue; // binary
    findings.push(...scanText(path, buf.toString("utf8")));
  }
  for (const f of findings) console.error(`${f.path}:${f.line}: ${f.kind}`);
  console.log(findings.length ? `privacy: ${findings.length} finding(s)` : "privacy: clean");
  process.exit(findings.length ? 1 : 0);
}
