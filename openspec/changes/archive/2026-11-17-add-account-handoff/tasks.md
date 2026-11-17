## 1. Conversation labels (agent-profile)

- [x] 1.1 Check `hc label` with a 1024-character value on this computer; lower the bound in the spec if it fails
- [x] 1.2 Tests first in `test/hook.test.mjs`: conversation labels, invalid values (outside `projects/`, `..` slug, non-uuid name, relative or newline folder, > 1024), refresh on a second run, still silent and exit 0 (sh and dash)
- [x] 1.3 `hooks/latveria-label.sh`: read `transcript_path` and `cwd` from stdin with `jq`, validate, label both

## 2. Hand-off core (account-handoff)

- [x] 2.1 Tests first in `test/handoff.test.mjs`: `isTranscript`, `canHandOff`, `targets`, `handoffArgv` (positional values, `env -u` for `$HOME/.claude`)
- [x] 2.2 `mods/latveria-agents/handoff.js`: pure functions and the fixed `HANDOFF_SH`
- [x] 2.3 `HANDOFF_SH` on a temporary HOME with a fake `claude` that records its arguments and environment: copy, no overwrite, `<uuid>/` folder, fork flag, no `.claude/.claude.json`, hostile paths, missing `claude`

## 3. Button and popup (account-handoff)

- [x] 3.1 Tests first in `test/agents.test.mjs`: button shown or hidden per status, machine, labels, profiles; popup lines with limits and `?`; `tab.new` arguments on choice
- [x] 3.2 `mods/latveria-agents/main.js`: hover button, `handoff` popup, `run("tab.new", …)`, `closeOverlay`

## 4. Docs and checks

- [x] 4.1 README and RECIPE: hand-off, its limits (`/rewind`, memory, model and permission mode, cost)
- [x] 4.2 Gate: `npm run lint`, `npm test`, `npm run privacy`; `herdr-app check mods/latveria-agents`
- [x] 4.3 Live: hand a small conversation to the second account and back; new ids, untouched sources, no stray `.claude.json`
