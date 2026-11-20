# Proposal: fix-banner-click-dialog

## Why

Every click on a LatveriaOS banner shows a macOS dialog: “The application ‘terminal-notifier’ is not open anymore.”
System log (20.11.2026, 11:11:21): a click on the banner body makes macOS bring `terminal-notifier` forward
(`usernoted`: “Bringing app … front for response”); in waiting mode (`-action … -timeout`) the program prints the
answer and exits at once, so the activation hits a dead process (`procNotFound`, -600) and CoreServicesUIAgent shows
the dialog. The race is inside `terminal-notifier` 3.1.0; we can only stop relying on its waiting mode.

Checked live (20.11, 11:18): a banner posted without waiting (`-activate dev.herdr.app -execute …`), clicked after
the program had exited, relaunches `terminal-notifier`, runs the command, and shows no dialog.

## What Changes

- Banners no longer wait. `terminal-notifier` posts the banner and exits; macOS keeps it. A click brings Herdr
  forward (`-activate dev.herdr.app`) and runs the note's action through `herdr-app do <action> '<args JSON>'`
  (`-execute`), with `herdr-app` found once through `command -v` and used by its absolute path.
- The click command carries only the note's action: a validated action name and its arguments as one single-quoted
  JSON argument. Title and text never reach a shell. No `herdr-app` found, or an action that fails validation: the
  click only brings Herdr forward.
- “The same note twice” is now “the same note for the same agent within a minute” (no process tells us anymore
  whether a banner is still up). The limit of five waiting banners goes: nothing waits.

## Capabilities

### Modified Capabilities

- `waiting-alerts`: click path of the macOS banner, de-duplication window, no waiting-banner limit.

## Impact

`mods/latveria-status/notifier.js`, `mods/latveria-status/main.js`, `test/notifier.test.mjs`,
`test/status.test.mjs`, rule 2 wording in `CLAUDE.md` (the banner's click runs `herdr-app do`). Deviates from
decision 1 of `add-waiting-alerts`, which rejected `-execute` — see design.md.
