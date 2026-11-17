# Proposal: add-agent-profile

## Why

Herdr's Agents list cannot tell which Claude account an agent runs under: every Claude Code reports itself as
`claude-code`, whatever its `CLAUDE_CONFIG_DIR`. The machine shows only for remote agents, in 10 px grey text.
With several accounts on two machines, picking the right agent means opening it first.

## What Changes

- A Claude Code `SessionStart` hook labels the Herdr terminal `latveria.profile=<KEY>`, the profile whose
  `claudeDir` matches the session's config directory in `~/.config/latveria/profiles.json`.
- A clone of Herdr's `agents` mod, `latveria-agents`, used by the `latveria` layout: every row shows a dot in the
  profile's color, the profile's label and the machine (`Mac` for this computer); missing data shows `?`.
- Each machine's profile map is read on that machine.
- Text is at least 12 px, agent names 14 px; the selected row gets no status tint.

## Capabilities

### New Capabilities

- `agent-profile` — Claude profile and machine on every agent in the Agents list.

### Modified Capabilities

(none)

## Impact

New mod `mods/latveria-agents` (cloned from Herdr 0.1.16), new hook `hooks/latveria-label.sh` (POSIX sh + `jq`) installed to
`~/.config/latveria/hooks/`, layout change, `profiles.example.json`. The hook runs `hc label` only; no network,
no credentials. Registering the hook in Claude Code's `settings.json` is a manual step described in the README.
