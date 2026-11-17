import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import MANIFEST from "../mods/latveria-files/material-icons.js";
import { resolveFileIcon, resolveFolderIcon } from "../mods/latveria-files/icons.js";

const repo = new URL("../", import.meta.url);
const exists = (p) => existsSync(new URL(p, repo));
const MAPS = ["fileNames", "fileExtensions", "folderNames", "folderNamesExpanded"];

test("the files the design names get distinct icons that exist", () => {
  const picks = { "notes.md": "markdown", "logo.png": "image", "app.log": "log", "main.ts": "typescript", "package.json": "nodejs" };
  for (const [name, want] of Object.entries(picks)) {
    const p = resolveFileIcon(name, MANIFEST);
    assert.ok(p.endsWith(`/${want}.svg`), `${name} → ${p}`);
    assert.ok(exists(p), p);
  }
  for (const name of ["docs", ".claude"]) {
    const [closed, open] = [resolveFolderIcon(name, false, MANIFEST), resolveFolderIcon(name, true, MANIFEST)];
    assert.ok(exists(closed) && exists(open), name);
    assert.notEqual(closed, open);
  }
});

test("every icon the manifest names is vendored, and nothing else", () => {
  const named = new Set([MANIFEST.file, MANIFEST.folder, MANIFEST.folderExpanded, ...MAPS.flatMap((k) => Object.values(MANIFEST[k]))]);
  const files = new Set(readdirSync(new URL("mods/latveria-files/icons/material/", repo)).filter((f) => f.endsWith(".svg")).map((f) => f.slice(0, -4)));
  assert.deepEqual([...named].filter((n) => !files.has(n)), []);
  assert.deepEqual([...files].filter((n) => !named.has(n)), []);
});

test("the manifest keeps seven maps of lower-case keys and its version", () => {
  assert.deepEqual(Object.keys(MANIFEST).sort(), ["file", "fileExtensions", "fileNames", "folder", "folderExpanded", "folderNames", "folderNamesExpanded", "version"]);
  assert.equal(MANIFEST.version, "5.40.0");
  for (const k of ["fileNames", "folderNames", "folderNamesExpanded"]) for (const key of Object.keys(MANIFEST[k])) assert.equal(key, key.toLowerCase());
});

test("the spec's scenarios hold on the shipped manifest", () => {
  const icon = (p) => p.split("/").pop().replace(/\.svg$/, "");
  assert.equal(icon(resolveFileIcon("README.md", MANIFEST)), "readme");
  assert.equal(icon(resolveFileIcon("app.test.mjs", MANIFEST)), "test-js");
  assert.equal(icon(resolveFileIcon("data.xyz", MANIFEST)), MANIFEST.file);
  assert.equal(icon(resolveFileIcon("constructor", MANIFEST)), MANIFEST.file);
  assert.equal(icon(resolveFolderIcon("zz-no-icon", false, MANIFEST)), MANIFEST.folder);
  assert.equal(icon(resolveFolderIcon("zz-no-icon", true, MANIFEST)), MANIFEST.folderExpanded);
});
