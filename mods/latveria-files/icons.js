// Picks a Material Icon Theme icon the way VS Code does: the full file name first, then the
// longest extension ("test.mjs" before "mjs"), then the default. Names compare lower-cased.
const DIR = "mods/latveria-files/icons/material";
const path = (icon) => `${DIR}/${icon}.svg`;
const own = (map, key) => (Object.hasOwn(map, key) ? map[key] : undefined);

export function resolveFileIcon(name, manifest) {
  const lower = name.toLowerCase();
  const byName = own(manifest.fileNames, lower);
  if (byName) return path(byName);
  for (let i = lower.indexOf("."); i !== -1; i = lower.indexOf(".", i + 1)) {
    const byExtension = own(manifest.fileExtensions, lower.slice(i + 1));
    if (byExtension) return path(byExtension);
  }
  return path(manifest.file);
}

export function resolveFolderIcon(name, open, manifest) {
  const icon = own(open ? manifest.folderNamesExpanded : manifest.folderNames, name.toLowerCase());
  return path(icon ?? (open ? manifest.folderExpanded : manifest.folder));
}
