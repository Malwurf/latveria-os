import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseProfiles } from "../mods/latveria-agents/profile.js";
import { contrastRatio } from "../lib/contrast.mjs";

const example = readFileSync(new URL("../profiles.example.json", import.meta.url), "utf8");
const theme = JSON.parse(readFileSync(new URL("../themes/latveria.json", import.meta.url), "utf8"));

test("the example map is neutral and every profile in it is valid", () => {
  assert.deepEqual(parseProfiles(example).map((p) => p.key), ["Personal", "Work"]);
  for (const p of JSON.parse(example).profiles) assert.equal(typeof p.claudeDir, "string");
});

// The dot is not text: WCAG 1.4.11 asks 3:1 against what is behind it.
test("each example color stands out on every row background", () => {
  for (const { key, color } of parseProfiles(example)) {
    for (const bg of ["chrome", "hover", "selected"]) {
      const ratio = contrastRatio(color, theme.colors[bg]);
      assert.ok(ratio >= 3, `${key} on ${bg}: ${ratio.toFixed(2)}`);
    }
  }
});
