import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProfiles, profileOf, machineOf, UNKNOWN, LABEL } from "../mods/latveria-agents/profile.js";

const MAP = JSON.stringify({ profiles: [
  { key: "Personal", label: "Personal", claudeDir: "~/.claude", color: "#e3b341" },
  { key: "Work", label: "Work", claudeDir: "~/.claude-work", color: "#6ea8fe" },
] });

test("parses a profile map", () => {
  assert.deepEqual(parseProfiles(MAP), [
    { key: "Personal", label: "Personal", color: "#e3b341" },
    { key: "Work", label: "Work", color: "#6ea8fe" },
  ]);
});
test("a broken or hostile map gives no profiles, never an error", () => {
  for (const bad of ["", "{", "null", "[]", '{"profiles":{}}', '{"profiles":[null, 5]}']) assert.deepEqual(parseProfiles(bad), []);
  assert.deepEqual(parseProfiles(JSON.stringify({ profiles: [{ key: "a b" }, { key: 7 }, { key: "__proto__x".repeat(5) }] })), []);
});
test("bad colors and long labels are tamed", () => {
  const [p] = parseProfiles(JSON.stringify({ profiles: [{ key: "W", label: "x".repeat(40), color: "red" }] }));
  assert.deepEqual(p, { key: "W", label: "x".repeat(16), color: null });
});
test("caps the number of profiles", () => {
  const many = { profiles: Array.from({ length: 100 }, (_, i) => ({ key: `p${i}` })) };
  assert.equal(parseProfiles(JSON.stringify(many)).length, 32);
});
test("a terminal's profile comes from its label", () => {
  const profiles = parseProfiles(MAP);
  assert.equal(profileOf({ labels: { [LABEL]: "Work" } }, profiles).color, "#6ea8fe");
  assert.deepEqual(profileOf({ labels: { [LABEL]: "Other" } }, profiles), { key: "Other", label: "Other", color: null });
  assert.equal(profileOf({ labels: {} }, profiles), UNKNOWN);
  assert.equal(profileOf(undefined, profiles), UNKNOWN);
  assert.equal(profileOf({ labels: { [LABEL]: "x y" } }, profiles), UNKNOWN);
});
test("the machine is the part of the address before a slash", () => {
  assert.equal(machineOf("laptop/t2"), "laptop");
  assert.equal(machineOf("t3"), null);
  assert.equal(machineOf(undefined), null);
});
