import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { trimManifest, vendor } from "../scripts/vendor-icons.mjs";

const MANIFEST = {
  iconDefinitions: {
    file: { iconPath: "./../icons/file.svg" }, folder: { iconPath: "./../icons/folder.svg" },
    "folder-open": { iconPath: "./../icons/folder-open.svg" }, markdown: { iconPath: "./../icons/markdown.svg" },
    nodejs_alt: { iconPath: "./../icons/nodejs.svg" }, "folder-docs": { iconPath: "./../icons/folder-docs.svg" },
    "folder-docs-open": { iconPath: "./../icons/folder-docs-open.svg" }, unused: { iconPath: "./../icons/unused.svg" },
  },
  file: "file", folder: "folder", folderExpanded: "folder-open",
  fileExtensions: { md: "markdown" }, fileNames: { "package.json": "nodejs_alt", "README.MD": "markdown" },
  folderNames: { docs: "folder-docs", Docs: "folder" }, folderNamesExpanded: { docs: "folder-docs-open" },
  languageIds: { markdown: "markdown" }, light: { fileExtensions: { md: "markdown_light" } },
};

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "latveria-icons-"));
  const pkg = join(root, "pkg");
  mkdirSync(join(pkg, "icons"), { recursive: true });
  mkdirSync(join(pkg, "dist"));
  writeFileSync(join(pkg, "package.json"), '{"version":"9.9.9"}');
  writeFileSync(join(pkg, "LICENSE"), "MIT License");
  writeFileSync(join(pkg, "dist", "material-icons.json"), JSON.stringify(MANIFEST));
  for (const n of ["file", "folder", "folder-open", "markdown", "nodejs", "folder-docs", "folder-docs-open", "unused"]) {
    writeFileSync(join(pkg, "icons", `${n}.svg`), `<svg id="${n}"/>`);
  }
  return { pkg, mod: join(root, "mod") };
}

test("trims the manifest to icon file names, lower-case keys, the first key wins", () => {
  const t = trimManifest(MANIFEST, "9.9.9");
  assert.deepEqual(t.fileNames, { "package.json": "nodejs", "readme.md": "markdown" });
  assert.deepEqual(t.folderNames, { docs: "folder-docs" });
  assert.equal(t.folderExpanded, "folder-open");
  assert.equal(t.version, "9.9.9");
  assert.equal("languageIds" in t || "light" in t, false);
});

test("an icon id the manifest never defines is an error", () => {
  assert.throws(() => trimManifest({ ...MANIFEST, fileExtensions: { x: "ghost" } }, "1"), /ghost/);
});

test("vendors only the named icons, the licence and an importable manifest", async () => {
  const f = fixture();
  assert.deepEqual(vendor(f), { version: "9.9.9", icons: 7 });
  assert.deepEqual(readdirSync(join(f.mod, "icons", "material")).sort(), ["LICENSE", "file.svg", "folder-docs-open.svg",
    "folder-docs.svg", "folder-open.svg", "folder.svg", "markdown.svg", "nodejs.svg"]);
  const { default: m } = await import(pathToFileURL(join(f.mod, "material-icons.js")).href);
  assert.equal(m.fileExtensions.md, "markdown");
  assert.equal(readFileSync(join(f.mod, "icons", "material", "LICENSE"), "utf8"), "MIT License");
});

test("refuses to overwrite an earlier vendoring", () => {
  const f = fixture();
  vendor(f);
  assert.throws(() => vendor(f), /already exists/);
});
