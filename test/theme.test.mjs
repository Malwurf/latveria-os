import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { contrastRatio, mix } from "../lib/contrast.mjs";

const TOKENS = ["canvas", "chrome", "surface", "popover", "raised", "hover", "selected", "border", "input", "muted", "dim",
  "accent", "accent_foreground", "solid", "solid_foreground", "working", "blocked", "done", "idle", "unknown"];
const TEXT = ["foreground", "muted", "dim", "accent", "working", "blocked", "done", "idle", "unknown"];
const GROUNDS = ["background", "canvas", "chrome", "surface", "popover", "raised", "hover", "selected"];
const STATUS = ["working", "blocked", "done", "idle", "unknown"];
const TINT = 0x26 / 255; // mods draw status badges as `${color}26`
const MIN = 4.5;

const themes = readdirSync(new URL("../themes/", import.meta.url)).filter((f) => f.endsWith(".json"))
  .map((f) => [f, JSON.parse(readFileSync(new URL(`../themes/${f}`, import.meta.url), "utf8"))]);
const flat = (t) => ({ background: t.background, foreground: t.foreground, selection: t.selection, ...t.colors });

export function unreadablePairs(t) {
  const c = flat(t);
  const pairs = [];
  for (const fg of TEXT) for (const bg of GROUNDS) pairs.push([`${fg}/${bg}`, c[fg], c[bg]]);
  for (const s of STATUS) pairs.push([`${s}/tint@chrome`, c[s], mix(c[s], c.chrome, TINT)]);
  pairs.push(["accent_foreground/accent", c.accent_foreground, c.accent], ["solid_foreground/solid", c.solid_foreground, c.solid],
    ["foreground/selection", c.foreground, c.selection]);
  t.ansi.forEach((a, i) => { if (i > 0) pairs.push([`ansi${i}/background`, a, c.background]); });
  return pairs.filter(([, f, b]) => contrastRatio(f, b) < MIN).map(([name, f, b]) => `${name} ${contrastRatio(f, b).toFixed(2)}`);
}

export function assertTokens(t) {
  for (const key of ["background", "foreground", "selection", "cursor"]) assert.match(t[key] ?? "", /^#[0-9a-f]{6}$/i, key);
  assert.equal(t.ansi.length, 16);
  for (const a of t.ansi) assert.match(a, /^#[0-9a-f]{6}$/i);
  for (const k of TOKENS) assert.match(t.colors?.[k] ?? "", /^#[0-9a-f]{6}$/i, `colors.${k}`);
}

test("there is a latveria theme", () => assert.ok(themes.some(([f]) => f === "latveria.json")));

for (const [file, t] of themes) {
  test(`${file}: defines every color token as #rrggbb`, () => assertTokens(t));
  test(`${file}: every text/background pair is at least ${MIN}:1`, () => assert.deepEqual(unreadablePairs(t), []));
}

test("a dim too dark for its background is named in the failure", () => {
  const [, t] = themes.find(([f]) => f === "latveria.json");
  const bad = structuredClone(t);
  bad.colors.dim = "#5f6f64";
  assert.ok(unreadablePairs(bad).includes("dim/background 3.43"));
});

test("a missing token is named in the failure", () => {
  const [, t] = themes.find(([f]) => f === "latveria.json");
  const bad = structuredClone(t);
  delete bad.colors.surface;
  assert.throws(() => assertTokens(bad), /colors\.surface/);
});
