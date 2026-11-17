# quota-bar Specification

## Purpose
Shows in LatveriaOS's status bar how much of each Claude profile's 5-hour and 7-day limits is used, from every
machine, using only the snapshots the profile's own statusline writes: no Keychain, no network.

## Requirements

### Requirement: Snapshot of a profile's limits
The snapshot script SHALL write `~/.cache/latveria/quota-<KEY>.json` for the profile whose `claudeDir` matches the
session's config directory, holding `updated`, `profile`, `label`, `color` and the 5h/7d windows from the
statusline JSON. It SHALL print nothing and always exit 0.

#### Scenario: Limits arrive
- **WHEN** the statusline JSON has `rate_limits.five_hour` and `rate_limits.seven_day` for profile `Personal`
- **THEN** `quota-Personal.json` holds both windows with `used_percentage` and `resets_at`

#### Scenario: Nothing changed
- **WHEN** the limits, label and color equal the snapshot, however old it is
- **THEN** the file is not rewritten

#### Scenario: Older run finishes late
- **WHEN** label, color and the window set equal the snapshot, and every window has the same `resets_at` and a
  `used_percentage` no higher than the snapshot's
- **THEN** the file is not rewritten, since within a window usage only grows

#### Scenario: No limits or no profile
- **WHEN** the JSON has no usable window, is not JSON, or no profile matches
- **THEN** no file is written

### Requirement: Limits per profile in the status bar
The status bar SHALL show one segment per profile found in snapshots on this computer and every ready machine:
the profile's dot, its label and the 5h and 7d percentages. A profile on two machines SHALL show, per window,
the reading with the later reset time, and on a tie the higher percentage. A profile that only other machines
report SHALL name its machine after the label.

#### Scenario: Two machines
- **WHEN** this computer has a snapshot for `Personal` and machine `laptop` has one for `Work`
- **THEN** the bar shows `Personal 5h … · 7d …` and then `Work laptop 5h … · 7d …`

#### Scenario: Profile only on another machine
- **WHEN** a profile's snapshots come only from machine `laptop`
- **THEN** its segment shows a server icon and `laptop` in dim text between the label and `5h`

#### Scenario: Profile also on this computer
- **WHEN** a profile has a snapshot on this computer and on machine `laptop`
- **THEN** its segment names no machine

#### Scenario: Machine name cut to 16 characters
- **WHEN** the machine's name is longer than 16 characters
- **THEN** the segment shows its first 16 characters

#### Scenario: Tone
- **WHEN** a window is below 50 %, below 80 %, or 80 % and above
- **THEN** its percentage is green (`working`), yellow, or red (`blocked`)

#### Scenario: Window left out
- **WHEN** a snapshot has one window and not the other, as Claude Code leaves out a window with no usage
- **THEN** the missing window shows 0 % and the tooltip says there is no usage in the current window

#### Scenario: Window already reset
- **WHEN** a window's `resets_at` is in the past
- **THEN** it shows 0 % and the tooltip says it reset

#### Scenario: Machine stops answering
- **WHEN** a machine that had snapshots is no longer ready or its read fails
- **THEN** its last readings stay, dimmed, with their age such as `· 2h ago`

#### Scenario: One of a profile's machines stops answering
- **WHEN** a profile comes from two machines and only one of them stops answering, whatever their clocks say
- **THEN** the profile is not dimmed and the tooltip names the answering machine with the newest reading

#### Scenario: Machine becomes ready
- **WHEN** a machine joins the ready ones after the bar started
- **THEN** its snapshots are read within about 5 s, not at the next 30-second read

#### Scenario: Machine removed from Herdr takes its readings with it
- **WHEN** a machine whose readings are kept is no longer listed by Herdr
- **THEN** its readings leave the bar

#### Scenario: Label cut to 16 characters
- **WHEN** a snapshot's label is longer than 16 characters
- **THEN** the bar shows its first 16 characters

#### Scenario: Abandoned snapshot
- **WHEN** every window of a snapshot is past its reset and the snapshot is more than 8 days old
- **THEN** the bar leaves it out, so a deleted or renamed profile does not stay at `0% · 0%`

#### Scenario: No snapshot anywhere
- **WHEN** no machine has a readable snapshot
- **THEN** the bar shows `limits ?` instead of an error

### Requirement: Readable status bar
The status bar SHALL draw no text below 12 px, and the yellow tone SHALL have a contrast ratio of at least 4.5:1 on
`chrome`.

#### Scenario: Shipped bar
- **WHEN** the mod and theme are checked
- **THEN** no text size is below 12 and the yellow on `chrome` is at least 4.5:1
