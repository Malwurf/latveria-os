# Tasks

## 1. Banner without waiting

- [x] 1.1 `notifier.js`: no `-action`/`-timeout`; `-execute` with `herdr-app do` for a valid action and program path; outcome shown/missing/failed; verify `node --test test/notifier.test.mjs`
- [x] 1.2 `main.js`: finds `herdr-app` once, de-duplicates the same note within 60 s, no waiting counter; verify `node --test test/status.test.mjs`
- [x] 1.3 Rule 2 wording in `CLAUDE.md`; verify `npm run lint && npm test && npm run privacy`
- [x] 1.4 Live (20.11, 11:24, clicked by the owner; system log: command ran, no -600 — macOS behaviour, no unit test can show it): install, `herdr-app check mods/latveria-status`, a real banner clicked with no dialog and the agent shown
