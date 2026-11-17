# Proposal: add-file-icons

## Why

Herdr's Files panel draws two grey icons (folder, file) and ignores the extension, so `.md`, `.png`, `.log` and
`package.json` look the same at a glance; its text is 11–13 px. LatveriaOS wants files recognisable by their icon
and text that meets its readability rule.

## What Changes

- A clone of Herdr's `files` mod, `latveria-files`, used by the `latveria` layout.
- Each entry shows a full-color Material Icon Theme icon picked by file name, then by the longest extension, then
  a default; folders show a closed or an open icon.
- Entry names are 14 px, secondary text at least 12 px.
- Remote folders keep working exactly as local ones.

## Capabilities

### New Capabilities

- `file-icons` — file-type icons and readable text in the Files panel.

### Modified Capabilities

(none)

## Impact

New mod `mods/latveria-files` (cloned from Herdr 0.1.16), vendored Material Icon Theme 5.40.0 (MIT, ~0.85 MB of
SVG), layout change. No network, no credentials; the mod still only lists and reads files.
