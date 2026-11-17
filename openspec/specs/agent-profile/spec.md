# agent-profile Specification

## Purpose
Shows, for every agent in LatveriaOS's Agents list, which Claude profile it runs under and on which machine, so the
right agent can be picked without opening it, for local and remote agents alike.

## Requirements

### Requirement: Each agent row shows its profile and machine
Each agent row in the full-width list SHALL show a dot in the profile's color, the profile's label (up to 16 characters) and the machine
the agent runs on. On the narrow rail the row shows the same profile and machine as a tooltip. The machine of an agent on this computer SHALL read `Mac` on macOS and `local` elsewhere; a remote
agent's machine is the part of its address before the slash.

#### Scenario: Labelled local agent
- **WHEN** a local agent's terminal has the label `latveria.profile=Personal` and this computer's map defines `Personal`
- **THEN** its row shows a dot in that profile's color, `Personal` and `Mac`

#### Scenario: Remote agent
- **WHEN** an agent's address is `laptop/t2`
- **THEN** its row shows the machine `laptop`

#### Scenario: Agent without a profile label
- **WHEN** an agent's terminal has no `latveria.profile` label
- **THEN** its row shows `?` and a dot without color, and the list renders without an error

#### Scenario: Key missing from the map
- **WHEN** an agent's label names a valid key (letters, digits, `_` and `-`, up to 24) its machine's map does not define
- **THEN** its row shows the key itself and a dot without color

#### Scenario: Invalid key
- **WHEN** an agent's label is not a valid key
- **THEN** its row shows `?`, as without a label

### Requirement: Profiles come from each machine's own map
The list SHALL read `~/.config/latveria/profiles.json` on this computer and on every machine whose layout is ready,
each on that machine. A missing, unreadable or invalid map SHALL give no profiles for that machine, never an error.

#### Scenario: Remote map
- **WHEN** a ready machine `laptop` defines the key `Work` with a color
- **THEN** a `laptop` agent labelled `Work` shows that color

#### Scenario: Unavailable machine
- **WHEN** a machine's layout is unavailable
- **THEN** its map is not read

#### Scenario: Broken map
- **WHEN** a map is not valid JSON
- **THEN** that machine's agents show their label keys without color

### Requirement: A SessionStart hook labels the terminal
The hook SHALL label the Herdr terminal `HC_TERMINAL_ID` with `latveria.profile=<KEY>`, where `KEY` is the profile
whose `claudeDir` resolves to the same folder as `${CLAUDE_CONFIG_DIR:-~/.claude}` in `$HOME/.config/latveria/profiles.json`;
the first such profile with a valid key wins. It SHALL also label `latveria.transcript=<path>` and
`latveria.cwd=<folder>` from the hook's input `transcript_path` and `cwd` when both are valid: the transcript is
`<dir>/projects/<slug>/<uuid>.jsonl` where `<dir>` is the session's `${CLAUDE_CONFIG_DIR:-~/.claude}` with `~`
expanded and no trailing `/` (slug of letters, digits, `.`, `_`,
`-`, not `.` or `..`; uuid in lowercase hex 8-4-4-4-12), the folder is absolute, and neither has control characters
or is longer than 1024 characters. It SHALL print nothing and exit 0 in every case.

#### Scenario: Session inside Herdr
- **WHEN** Claude Code starts in Herdr terminal `t7` with `CLAUDE_CONFIG_DIR=~/.claude-work` and the map defines `Work` with that folder
- **THEN** the hook runs `hc label t7 latveria.profile=Work`

#### Scenario: Conversation labels
- **WHEN** the hook's input has `transcript_path` `~/.claude-work/projects/-src-app/0f1e2d3c-4b5a-4968-8778-a1b2c3d4e5f6.jsonl` and `cwd` `/src/app`, and the profile `Work` matched `~/.claude-work`
- **THEN** the hook also labels `latveria.transcript` with that path and `latveria.cwd=/src/app`

#### Scenario: Invalid conversation values
- **WHEN** the transcript path is outside the matched profile's `projects/`, its slug is `..`, its name is not a uuid, or the folder is relative, has a newline or is longer than 1024 characters
- **THEN** the hook labels only `latveria.profile`; labels from an earlier run stay as they were

#### Scenario: Labels refresh
- **WHEN** the hook runs again after `/clear`, `/resume` or compaction with a new transcript
- **THEN** `latveria.transcript` and `latveria.cwd` carry the new values

#### Scenario: Session outside Herdr
- **WHEN** `HC_TERMINAL_ID` is not set
- **THEN** the hook runs nothing

#### Scenario: No matching profile
- **WHEN** no profile's `claudeDir` matches the session's folder, or the map is missing
- **THEN** the hook runs nothing

#### Scenario: hc not on PATH
- **WHEN** Herdr starts the terminal without a shell, so `PATH` lacks `~/.local/bin`, where Herdr installs `hc`
- **THEN** the hook runs `~/.local/bin/hc`; without it there either, the hook runs nothing

#### Scenario: hc fails
- **WHEN** `hc` exits with an error
- **THEN** the hook still exits 0 and prints nothing

### Requirement: Readable text and contrast in the Agents list
The list SHALL draw no text below 12 px and agent names at 14 px. The selected row SHALL NOT get a status tint
behind its status badge.

#### Scenario: Agent that needs you, selected
- **WHEN** the selected agent is blocked
- **THEN** its "Needs you" badge has no tinted background
