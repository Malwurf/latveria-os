# Spec Delta

## Purpose

Makes files and folders in LatveriaOS's Files panel recognisable at a glance by their type icon, with text sizes
that meet the project's readability rule, for local and remote folders alike.

## ADDED Requirements

### Requirement: Each file shows its type's icon
Each file entry SHALL show the Material Icon Theme icon chosen in this order: the full file name (compared
case-insensitively), then the longest matching extension (`test.mjs` before `mjs`), then the shorter extensions,
then the default file icon.

#### Scenario: Known file name
- **WHEN** the folder contains `README.md`
- **THEN** its entry shows the readme icon, not the markdown icon

#### Scenario: Compound extension
- **WHEN** the folder contains `app.test.mjs`
- **THEN** its entry shows the JavaScript test icon

#### Scenario: Unknown type
- **WHEN** the folder contains `data.xyz`
- **THEN** its entry shows the default file icon

#### Scenario: Name that matches an object built-in
- **WHEN** the folder contains a file named `constructor`
- **THEN** its entry shows the default file icon

### Requirement: Folders show a closed and an open icon
Each folder entry SHALL show the icon for its name in the closed or open variant matching its state, and the
default folder icon in that variant when its name has none.

#### Scenario: Known folder opened
- **WHEN** the person opens `docs`
- **THEN** its icon changes from the closed to the open docs folder icon

#### Scenario: Unknown folder
- **WHEN** a folder named `misc` is closed
- **THEN** it shows the default closed folder icon

### Requirement: Icons keep their colors
Icons SHALL be drawn in their own colors at 16 px, not tinted with the text color.

#### Scenario: Gradient icon
- **WHEN** an entry's icon uses gradients or clip paths
- **THEN** it is drawn in full color

### Requirement: Text is readable
Entry names SHALL be 14 px and no text in the panel SHALL be smaller than 12 px.

#### Scenario: Too-small text
- **WHEN** the mod's code sets a text size below 12 px
- **THEN** the repository's checks fail and name the file and size

### Requirement: Remote folders behave the same
For a space on another machine, the panel SHALL list and read files on that machine.

#### Scenario: Remote space
- **WHEN** the active space is on machine `laptop`
- **THEN** every folder listing runs on `laptop`
