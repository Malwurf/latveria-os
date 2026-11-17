# Proposal: add-account-handoff

## Why

People who run Claude Code on two accounts on one computer (two `CLAUDE_CONFIG_DIR` folders) hit one account's
5h/7d limit in the middle of a task. To finish the same conversation on the other account today they have to find
the session id (the window doesn't show it), copy `<claudeDir>/projects/<folder>/<id>.jsonl` into the other
account's folder and run `CLAUDE_CONFIG_DIR=… claude --resume <id>` in a new tab of the same folder. Two traps make
that silently wrong: for the default account (`~/.claude`) the variable must be unset, not set (setting it makes
Claude create a stray `~/.claude/.claude.json`), and resuming without `--fork-session` lets a hand-back overwrite a
file the old session can still write to.

## What Changes

- The `SessionStart` hook labels the terminal with two more values beside `latveria.profile`: the conversation's
  transcript path (`latveria.transcript`) and the folder it started in (`latveria.cwd`), each checked before it is
  written. They refresh on `/clear`, `/resume` and compaction, when the hook runs again.
- An agent row in `latveria-agents` gets a hand-off button on hover for a local agent that isn't working, has both
  labels and a known profile, when the profile map has another profile. It opens a popup listing the other
  profiles with their 5h/7d limits; choosing one opens a new tab in the conversation's start folder that copies the
  conversation (and its `<id>/` folder of saved tool outputs) to that account without overwriting anything and runs
  `claude --resume <id> --fork-session` there. The old tab stays.
- Values reach the shell only as positional arguments of a fixed script, never inside its text.

## Capabilities

### New Capabilities

- `account-handoff`: continuing a local agent's conversation on another Claude profile of the same computer.

### Modified Capabilities

- `agent-profile`: the `SessionStart` hook also labels the transcript path and the start folder.

## Impact

`hooks/latveria-label.sh`, `mods/latveria-agents/main.js`, new `mods/latveria-agents/handoff.js`, tests
(`test/hook.test.mjs`, `test/agents.test.mjs`, new `test/handoff.test.mjs`), README/RECIPE. No network, no
credentials: the copy is plain files of the person's own Claude folders, done in a visible terminal. Not in scope:
agents on remote machines, choosing the model or permission mode of the resumed session.
