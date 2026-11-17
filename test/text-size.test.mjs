import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";

// Rule 3: no text in our mods is smaller than 12 px.
const MIN = 12;
const SIZE = /\btext_size\(\s*(\d+(?:\.\d+)?)\s*\)|\bfont_size:\s*(\d+(?:\.\d+)?)|\b(text_xs)\(/g;

// gpui's text_xs() is 0.75 rem and Herdr does not document its rem (status reports ui_font_size 13,
// i.e. ~9.75 px), so it is treated as too small: it counts as 0 and always fails.
export function tooSmall(source) {
  return [...source.matchAll(SIZE)].map((m) => (m[3] ? 0 : Number(m[1] ?? m[2]))).filter((n) => n < MIN);
}

test("finds sizes below the minimum", () => {
  assert.deepEqual(tooSmall("div().text_size(11).child(x); div().text_size(12.5); ({ font_size: 10 }); div().text_xs()"), [11, 10, 0]);
});

test("no mod in the repo draws text below 12 px", () => {
  const dir = new URL("../mods/", import.meta.url);
  const files = existsSync(dir) ? readdirSync(dir, { recursive: true }).map(String)
    .filter((f) => f.endsWith(".js") && !/^[^/]+\/material-icons\.js$/.test(f)) : [];
  const small = files.flatMap((f) => tooSmall(readFileSync(new URL(f, dir), "utf8")).map((n) => `${f}: ${n}`));
  assert.deepEqual(small, []);
});
