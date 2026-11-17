# Proposal: add-waiting-alerts

## Why

Herdr signals an agent that needs you, or one that finished while you weren't looking, with a sound and a note
drawn inside its own window. When you work in another app you hear the sound and see nothing, so an agent can wait
unnoticed. Herdr 0.1.16 sends no macOS notifications and puts nothing on its Dock icon.

## What Changes

- The `latveria-status` bar puts the number of agents that need you on Herdr's Dock icon (none: no badge), and its
  `N needs you` counter becomes clickable: it shows the agent that has been waiting longest.
- A clone of Herdr's `toast` mod, `latveria-toast`, becomes the `latveria` layout's notification mod. While Herdr's
  window is active it draws Herdr's notes as before. While it isn't, it hands each note to macOS through the optional
  `terminal-notifier` program: a banner under the clock whose click brings Herdr forward and runs the note's action
  (for an agent: shows that agent). Dismissing the banner changes nothing. Every note Herdr posts is forwarded,
  with no filter on how long an agent worked.
- Without `terminal-notifier`, or without permission to notify, notes stay in Herdr's window as today.
- `terminal-notifier` becomes an allowed program for mods (it shows a notification and nothing else).

## Capabilities

### New Capabilities

- `waiting-alerts`: telling the person that an agent needs them when Herdr is not in front — Dock badge, clickable
  counter and macOS banners for Herdr's own notes.

### Modified Capabilities

(none)

## Impact

New mod `mods/latveria-toast` (cloned from Herdr 0.1.16, original in `upstream/toast-0.1.16/`), changes to
`mods/latveria-status/main.js` and the root of `layouts/latveria.json` (`"toast": "latveria-toast"`). New optional
dependency `terminal-notifier` (Homebrew, MIT), not installed by `install.mjs`; README and RECIPE describe installing
it and allowing its notifications once. The exec allowlist in `test/rules.test.mjs` gains `terminal-notifier`. No
network, no credentials; banner text comes from Herdr's note and is passed as arguments, never through a shell.
