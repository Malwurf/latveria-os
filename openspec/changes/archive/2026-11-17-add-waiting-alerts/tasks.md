# Tasks

Detailed steps with code: `.claude/plans/waiting.md`.

## 1. Dock badge and counter

- [x] 1.1 Fake herdr gains `setBadge`, `notify` and a settable `window().active`; verify `node --test test/fake.test.mjs` passes
- [x] 1.2 `latveria-status` sets the Dock badge to the blocked count only when it changes; verify the new cases in `test/status.test.mjs` pass
- [x] 1.3 The `N needs you` counter shows the agent blocked earliest on click; verify the click case in `test/status.test.mjs` passes

## 2. Banners

- [x] 2.1 `mods/latveria-status/notifier.js` builds the arguments, reads the outcome and the group key; verify `node --test test/notifier.test.mjs` passes
- [x] 2.2 `terminal-notifier` joins the exec allowlist; verify `node --test test/rules.test.mjs` passes
- [x] 2.3 `latveria-toast` clone without behavior change (upstream copy, `cloned_from`); verify `node --test test/toast.test.mjs` and `node scripts/upstream-diff.mjs` (exit 0)
- [x] 2.4 The toast hands a note off and closes while the window is inactive, draws it when told to or when the notifier is missing; verify `node --test test/toast.test.mjs`
- [x] 2.5 `latveria-status` drains the queue every second and shows the banner; verify the queue cases in `test/status.test.mjs` pass
- [x] 2.6 Click runs the note's action, an ignored banner runs nothing, a failure or a full queue falls back into the window; verify the outcome cases in `test/status.test.mjs` pass
- [x] 2.7 Layout root `"toast": "latveria-toast"`; verify `node --test test/layout.test.mjs` passes

## 3. Close

- [x] 3.1 README, RECIPE, NOTICE, CLAUDE.md (rules 2 and 7 name the new tests); verify `npm run lint && npm test && npm run privacy` exit 0
- [x] 3.2 Live on the Mac: `node install.mjs`, `herdr-app check` for both mods, `herdr-app status` without errors, a real banner from another app leads to the agent (verified 17.11 16:36) and a dismissed one changes nothing (verified in the terminal-notifier spike; the live re-run was inconclusive). Missing permission: unit tests only
- [x] 3.3 Archive this change into `openspec/specs/waiting-alerts/spec.md`; verify `openspec validate --specs --strict`
