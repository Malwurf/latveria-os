import { test } from "node:test";
import assert from "node:assert/strict";
import { contrastRatio, mix } from "../lib/contrast.mjs";

test("contrast follows WCAG 2.x", () => {
  assert.equal(contrastRatio("#000000", "#ffffff"), 21);
  assert.equal(contrastRatio("#ffffff", "#ffffff"), 1);
  assert.equal(contrastRatio("#777777", "#ffffff").toFixed(2), "4.48");
  assert.equal(contrastRatio("#e8f0ea", "#0e1712").toFixed(1), "15.7"); // design §9, palette A
});

test("mix blends a color over a background like an #rrggbbaa fill", () => {
  assert.equal(mix("#ffffff", "#000000", 0x26 / 255), "#262626");
  assert.equal(mix("#ff9070", "#111d17", 0), "#111d17");
});

test("rejects anything that is not #rrggbb", () => {
  assert.throws(() => contrastRatio("#fff", "#000000"), /#rrggbb/);
  assert.throws(() => mix("red", "#000000", 0.5), /#rrggbb/);
});
