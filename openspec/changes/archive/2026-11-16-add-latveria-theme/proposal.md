# Proposal: add-latveria-theme

## Why

Herdr's default themes and most gallery layouts are hard to read (small, low-contrast text). LatveriaOS
needs a dark-green theme whose every text/background pair is readable, checked by a test rather than by eye,
so later mods (Files, Agents, quota) can rely on its tokens.

## What Changes

- A theme `latveria` defining every Herdr color token and 16 ANSI colors, all `#rrggbb`.
- Two candidate palettes (A "Sosna", B "Patyna") shown to the owner on screenshots; one becomes `latveria`.
- A layout `latveria` (Herdr's `main` arrangement) that wears the theme. Panel text sizes are not part of
  this change: they live in mod code and arrive with the M1/M2 mod clones.
- A test that fails, naming the pair, when any required pair drops below 4.5:1.

## Capabilities

### New Capabilities

- `theme` — readable color theme and the layout that applies it.

### Modified Capabilities

(none)

## Impact

New files `themes/latveria.json`, `layouts/latveria.json`; installed into `~/.config/herdr-app` by the repo
installer. No network, no credentials, no change to Herdr's shipped files.
