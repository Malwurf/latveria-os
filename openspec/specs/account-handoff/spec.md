# account-handoff Specification

## Purpose
Continuing a local agent's Claude conversation on another Claude profile of the same computer when the first one
hits its limit: a button on the agent's row, a popup with the other profiles' limits, and a new tab that copies the
conversation to the chosen profile and resumes it there as a fork, without overwriting anything.

## Requirements

### Requirement: Hand-off button on an agent row
The agents list SHALL show a hand-off button on an agent row while the pointer is over it when the agent is on this
computer, it reports itself as Claude Code (`app` `claude-code`), its status is not `working`, its terminal has valid `latveria.profile`, `latveria.transcript` and
`latveria.cwd` labels, the profile is in this computer's map with a `claudeDir` whose `projects/` holds the
transcript, the start folder names the transcript's folder (every character but a letter or digit as `-`;
folders over 200 characters are not compared), and the map has at least one other profile with a `claudeDir`. The narrow rail shows no button.

#### Scenario: Agent waiting on a limit
- **WHEN** a local agent labelled `Personal` with both conversation labels is `done` and the map has `Personal` and `Work`
- **THEN** its row shows the hand-off button on hover

#### Scenario: Working agent
- **WHEN** the agent's status is `working`
- **THEN** no button is shown

#### Scenario: Remote agent
- **WHEN** the agent runs on another machine
- **THEN** no button is shown

#### Scenario: Another agent in the same terminal
- **WHEN** the terminal still has the labels of an earlier Claude session but now runs another agent
- **THEN** no button is shown

#### Scenario: Missing labels or one profile
- **WHEN** the terminal lacks a conversation label, its profile is not in the map, or the map has a single profile
- **THEN** no button is shown

### Requirement: Popup with the target profiles and their limits
Clicking the button SHALL open a popup listing every other profile of the map that has a `claudeDir`, sized for them,
with its 5h and 7d percentages from
this computer's snapshot; a profile without a readable snapshot SHALL show `?`. Nothing SHALL happen until a
profile is chosen.

#### Scenario: Targets with limits
- **WHEN** the button is clicked on a `Personal` agent and `Work`'s snapshot says 5h 6 % and 7d 27 %
- **THEN** the popup lists `Work · 5h 6% · 7d 27%`

#### Scenario: No snapshot
- **WHEN** a target profile has no readable snapshot
- **THEN** its line shows `?` for the limits

### Requirement: Hand-off opens the conversation on the chosen profile
Choosing a profile SHALL open a new tab named `→ <label>` in the conversation's start folder (`latveria.cwd`) that
runs a fixed `sh` script with the values only as positional arguments. The script SHALL find `claude` before it
copies anything, create the target `projects/<slug>/` folder, copy the `<uuid>/` folder and then the transcript
there without overwriting or deleting anything, stop with a message when the target already holds a different
transcript with that uuid, and run `claude --resume <uuid> --fork-session`: with `CLAUDE_CONFIG_DIR` unset when the target's `claudeDir`
resolves to `$HOME/.claude`, set to the target's `claudeDir` as the map writes it (`~` expanded, no trailing `/`)
otherwise, so a resumed session labels its transcript in the same form the map uses. The source files and the old tab SHALL stay
as they were.

#### Scenario: Hand-off to a second account
- **WHEN** a `Personal` (`~/.claude`) agent's conversation is handed to `Work` (`~/.claude-work`)
- **THEN** the files appear under `~/.claude-work/projects/<slug>/` and the new tab runs `env CLAUDE_CONFIG_DIR=<home>/.claude-work claude --resume <uuid> --fork-session`

#### Scenario: Hand-back to the default account
- **WHEN** the conversation is handed to the profile whose `claudeDir` is `~/.claude`
- **THEN** the tab runs `claude` with `CLAUDE_CONFIG_DIR` unset and no `~/.claude/.claude.json` is created

#### Scenario: Same copy already there
- **WHEN** the target already has the same transcript with that uuid
- **THEN** the script copies nothing and resumes with `--fork-session`

#### Scenario: Older copy already there
- **WHEN** the target has a different transcript with that uuid, from an earlier hand-off of the same conversation
- **THEN** the script leaves it as it is, starts nothing and says so in the tab

#### Scenario: Copy fails halfway
- **WHEN** copying the `<uuid>/` folder fails
- **THEN** no transcript is written to the target, only `<uuid>.latveria-tmp`, which the next try reuses

#### Scenario: Hostile values
- **WHEN** a path contains spaces, quotes, `$(…)` or starts with `-`
- **THEN** it reaches `cp` and `claude` as one argument and no shell code runs

#### Scenario: Claude not on PATH
- **WHEN** the new terminal's `PATH` lacks `claude`
- **THEN** the script runs `$HOME/.local/bin/claude`; without it there either, it copies nothing, prints an error in the new tab and the old tab is untouched
