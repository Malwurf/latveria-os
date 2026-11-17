# Design

Full design, spikes and alternatives: `../GEM/.claude/designs/latveria-os-handoff.md` (17.11.2026).

## Context

- Claude Code keeps a conversation in `<claudeDir>/projects/<slug of its start folder>/<uuid>.jsonl`, large tool
  outputs beside it in `<uuid>/tool-results/` (referenced by absolute path). `claude --resume <id>` looks only in its
  own `claudeDir`. Spikes 17.11: a copied transcript resumes on the other account, also with `--fork-session` (new
  id, source untouched) and with a 497 KB saved tool output; the target `projects/<slug>/` folder may not exist.
- `CLAUDE_CONFIG_DIR=~/.claude` makes Claude look for `~/.claude/.claude.json` and create a stub; the default
  account runs without the variable.
- The hook's input has `session_id`, `transcript_path`, `cwd` and `source`; it runs again on `/clear`, `/resume`,
  `compact`.
- Herdr: `PaneInfo.cwd` is the live folder (not the start folder); `tab.new {folder, name, argv}` opens a tab
  running a program; popups via `openOverlay({kind: "popup"})` as the existing sort menu does.

## Goals / Non-Goals

**Goals:** one click from an agent stuck on a limit to the same conversation on the other account; nothing ever
overwritten; values never interpolated into shell text.

**Non-Goals:** remote agents (the hand-off would have to copy and open the tab on that machine; a client machine's
accounts are out of scope), carrying model or permission mode, `/rewind` across the hand-off.

## Decisions

- **Fork on every hop** (`--fork-session`): the copy uses the source id, the resumed session gets a new one, so a
  hand-back never meets an existing file. Copy skips files that already exist (temp file + `mv`).
- **Start folder from a label**, not `PaneInfo.cwd`: resume finds the conversation by the folder it started in.
- **Copy the `<uuid>/` folder too**, so the resumed conversation does not depend on the source account's files.
- **Paths as the map writes them** (`~` expanded, no symlink resolution; Przemek 17.11, option a): the resumed
  session's `CLAUDE_CONFIG_DIR` and its transcript label then match the map, so a hand-back finds it again; a
  mismatch only hides the button.
- **The default account by path, not by key**: a target whose `claudeDir` resolves to `$HOME/.claude` runs with
  `env -u CLAUDE_CONFIG_DIR`, every other with `env CLAUDE_CONFIG_DIR=<dir>`.
- **Button for `blocked`, `done` and `idle`**, hidden for `working` (two live sessions editing files) and for remote
  agents.
- **`claude` from `PATH`, then `$HOME/.local/bin/claude`**, as the hook does for `hc` (a terminal Herdr starts
  without a shell lacks `~/.local/bin`).

## Risks / Trade-offs

- `hc label` value limits are unknown → the plan checks a 1024-character value first and lowers the bound if needed.
- The target account reads the whole conversation without cache (cost) → shown in README, the popup shows its limits.
- Project memory may differ between accounts → README.
