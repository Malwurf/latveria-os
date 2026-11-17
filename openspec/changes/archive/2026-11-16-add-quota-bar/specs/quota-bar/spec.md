## ADDED Requirements

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

#### Scenario: No limits or no profile
- **WHEN** the JSON has no usable window, is not JSON, or no profile matches
- **THEN** no file is written

### Requirement: Limits per profile in the status bar
The status bar SHALL show one segment per profile found in snapshots on this computer and every ready machine:
the profile's dot, its label and the 5h and 7d percentages. A profile on two machines SHALL show, per window,
the reading with the later reset time, and on a tie the higher percentage.

#### Scenario: Two machines
- **WHEN** this computer has a snapshot for `Personal` and machine `laptop` has one for `Work`
- **THEN** the bar shows `Personal 5h … · 7d …` and then `Work 5h … · 7d …`

#### Scenario: Tone
- **WHEN** a window is below 50 %, below 80 %, or 80 % and above
- **THEN** its percentage is green (`working`), yellow, or red (`blocked`)

#### Scenario: Window already reset
- **WHEN** a window's `resets_at` is in the past
- **THEN** it shows 0 % and the tooltip says it reset

#### Scenario: Machine stops answering
- **WHEN** a machine that had snapshots is no longer ready or its read fails
- **THEN** its last readings stay, dimmed, with their age such as `· 2h ago`

#### Scenario: No snapshot anywhere
- **WHEN** no machine has a readable snapshot
- **THEN** the bar shows `limits ?` instead of an error

### Requirement: Readable status bar
The status bar SHALL draw no text below 12 px, and the yellow tone SHALL have a contrast ratio of at least 4.5:1 on
`chrome`.

#### Scenario: Shipped bar
- **WHEN** the mod and theme are checked
- **THEN** no text size is below 12 and the yellow on `chrome` is at least 4.5:1
