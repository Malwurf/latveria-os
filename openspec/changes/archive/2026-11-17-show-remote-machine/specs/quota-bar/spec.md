## MODIFIED Requirements

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
