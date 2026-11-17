import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { scanText, scanPath } from "../scripts/privacy.mjs";

const h = (w) => createHash("sha256").update(w).digest("hex");
const terms = new Set([h("zebra"), h("zebral")]); // test terms, never real ones
const kinds = (text) => scanText("f.txt", text, terms).map((f) => f.kind);

test("flags a forbidden word as a whole token, any case, with diacritics folded", () => {
  assert.deepEqual(kinds("hello Zebra world"), ["term"]);
  assert.deepEqual(kinds("ZĘBRA"), ["term"]); // Ę folds to E
  assert.deepEqual(kinds("zébra"), ["term"]);
  assert.deepEqual(kinds("zebr"), []);
  assert.deepEqual(kinds("Zębrał"), ["term"]); // ł folds to l
});

test("flags a forbidden word inside a longer identifier", () => {
  assert.deepEqual(kinds("const zebraProfile = 1"), ["term"]);
  assert.deepEqual(kinds("~/.claude-zebra"), ["term"]);
});

test("flags machine paths and e-mail addresses", () => {
  assert.deepEqual(kinds("cd " + "/Us" + "ers/alice/x"), ["path"]);
  assert.deepEqual(kinds("cd " + "/ho" + "me/alice/x"), ["path"]);
  assert.deepEqual(kinds("mail " + "alice@" + "corp.io"), ["email"]);
});

test("allows placeholders: ~, example domains, noreply, the test home", () => {
  assert.deepEqual(kinds("~/.config/herdr-app"), []);
  assert.deepEqual(kinds("x@" + "example.com and 1+bot@" + "users.noreply.github.com"), []);
  assert.deepEqual(kinds("/ho" + "me/test/.config"), []);
});

test("reports the line number, never the matched word", () => {
  const [f] = scanText("a.md", "ok\nzebra", terms);
  assert.equal(f.line, 2);
  assert.ok(!JSON.stringify(f).includes("zebra"));
});

test("a forbidden word in a file name is a finding too", () => {
  assert.deepEqual(scanPath("profiles/zebra.json", terms).map((f) => [f.line, f.kind]), [[0, "term"]]);
  assert.deepEqual(scanPath("profiles/work.json", terms), []);
});

test("a long minified line is scanned in linear time", () => {
  const line = "a".repeat(50000) + "@" + "b.".repeat(50000);
  // CPU time, not wall time: other test files run in parallel and slow the clock, not the scan.
  const start = process.cpuUsage();
  scanText("big.json", line, terms);
  const { user, system } = process.cpuUsage(start);
  assert.ok((user + system) / 1000 < 2000, `${(user + system) / 1000} ms`);
});
