## 1. Remote machine in the segment

- [x] 1.1 Tests first (`test/status.test.mjs`): a profile only on `laptop` shows `laptop` after its label with the
      server icon; a profile on this computer and `laptop` shows no machine; a long machine name is cut to 16
      characters; the "two machines" text becomes `Personal 5h 3% · 7d 4% Work laptop 5h 10% · 7d 20%`
- [x] 1.2 `mods/latveria-status/main.js`: in `quota()`, when no source of the profile is this computer, add the
      server icon (13 px) and `q.from` cut to 16 characters in `t.dim` between the label and `5h`
- [x] 1.3 Gate: `npm run lint`, `npm test`, `npm run privacy`
- [x] 1.4 Live check of the bar: a profile only the second machine reports names that machine (needs that machine
      awake)
