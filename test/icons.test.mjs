import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveFileIcon, resolveFolderIcon } from "../mods/latveria-files/icons.js";

const M = {
  file: "file", folder: "folder", folderExpanded: "folder-open",
  fileNames: { "readme.md": "readme", "package.json": "nodejs", ".gitignore": "git" },
  fileExtensions: { md: "markdown", mjs: "javascript", "test.mjs": "test-js", "d.ts": "typescript-def", ts: "typescript", env: "tune" },
  folderNames: { docs: "folder-docs" },
  folderNamesExpanded: { docs: "folder-docs-open" },
};
const icon = (p) => p.split("/").pop().replace(/\.svg$/, "");

test("a full file name wins over its extension, in any case", () => {
  assert.equal(icon(resolveFileIcon("README.md", M)), "readme");
  assert.equal(icon(resolveFileIcon("Package.JSON", M)), "nodejs");
});

test("the longest extension wins", () => {
  assert.equal(icon(resolveFileIcon("app.test.mjs", M)), "test-js");
  assert.equal(icon(resolveFileIcon("index.d.ts", M)), "typescript-def");
  assert.equal(icon(resolveFileIcon("main.ts", M)), "typescript");
  assert.equal(icon(resolveFileIcon("notes.MD", M)), "markdown");
});

test("dot files match by name, then by what follows the dot", () => {
  assert.equal(icon(resolveFileIcon(".gitignore", M)), "git");
  assert.equal(icon(resolveFileIcon(".env", M)), "tune");
});

test("anything else gets the default icon, prototype keys included", () => {
  for (const n of ["data.xyz", "Makefile2", "trailing.", "constructor", "__proto__", "toString.md2"]) {
    assert.equal(icon(resolveFileIcon(n, M)), "file", n);
  }
});

test("folders have a closed and an open icon, with defaults", () => {
  assert.equal(icon(resolveFolderIcon("docs", false, M)), "folder-docs");
  assert.equal(icon(resolveFolderIcon("Docs", true, M)), "folder-docs-open");
  assert.equal(icon(resolveFolderIcon("misc", false, M)), "folder");
  assert.equal(icon(resolveFolderIcon("misc", true, M)), "folder-open");
  assert.equal(icon(resolveFolderIcon("constructor", true, M)), "folder-open");
});

test("paths point into the mod's icon folder", () => {
  assert.equal(resolveFileIcon("a.md", M), "mods/latveria-files/icons/material/markdown.svg");
});
