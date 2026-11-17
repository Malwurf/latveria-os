## MODIFIED Requirements

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
