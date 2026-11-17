# theme Specification

## Purpose
Gives LatveriaOS one readable dark-green color theme, with every text/background pair at WCAG AA contrast, and
a layout that applies it in Herdr.

## Requirements

### Requirement: Theme defines every Herdr color token
The `latveria` theme SHALL define `background`, `foreground`, `selection`, `cursor`, 16 ANSI colors and every
panel token Herdr names (`canvas`, `chrome`, `surface`, `popover`, `raised`, `hover`, `selected`, `border`,
`input`, `muted`, `dim`, `accent`, `accent_foreground`, `solid`, `solid_foreground`, `working`, `blocked`,
`done`, `idle`, `unknown`), each as `#rrggbb`, so no token falls back to a color Herdr derives.

#### Scenario: Complete theme
- **WHEN** the theme file is checked
- **THEN** every listed token is present and is a `#rrggbb` color

#### Scenario: Missing token
- **WHEN** the theme lacks `colors.surface`
- **THEN** the check fails and names `colors.surface`

### Requirement: Every text/background pair is readable
Every text/background pair the theme produces SHALL have a contrast ratio of at least 4.5:1.

#### Scenario: Text tokens on panel backgrounds
- **WHEN** each text token (`foreground`, `muted`, `dim`, `accent`, `working`, `blocked`, `done`, `idle`, `unknown`)
  is drawn on each background token (`background`, `canvas`, `chrome`, `surface`, `popover`, `raised`, `hover`, `selected`)
- **THEN** every pair is at least 4.5:1

#### Scenario: Badges, fills and selection
- **WHEN** each status color is drawn on its own badge tint (the color at 0x26 alpha over `chrome`), `accent_foreground`
  on `accent`, `solid_foreground` on `solid` and `foreground` on `selection`
- **THEN** every pair is at least 4.5:1

#### Scenario: ANSI colors
- **WHEN** ANSI colors 1–15 are drawn on `background`
- **THEN** every pair is at least 4.5:1

#### Scenario: Readable palette
- **WHEN** the shipped theme is checked
- **THEN** no pair is below 4.5:1

#### Scenario: Too-dark secondary text
- **WHEN** `dim` is set to `#5f6f64`
- **THEN** the check fails and names the pair `dim/background` with its ratio

### Requirement: Layout applies the theme
The `latveria` layout SHALL set `theme` to `latveria`, SHALL NOT set a terminal font size (the terminal keeps
the size from the person's settings, else Herdr's 14 px), and SHALL reference only mods that Herdr ships or that this repository provides.

#### Scenario: Layout names an unknown mod
- **WHEN** the layout references a mod that neither Herdr nor this repository provides
- **THEN** the check fails and names the mod
