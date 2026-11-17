# waiting-alerts Specification

## Purpose
Make sure an agent that needs the person is noticed when Herdr's window is not in front: a count on the Dock
icon, a counter that leads to the waiting agent, and Herdr's own notes as macOS banners that lead back to it.

## Requirements

### Requirement: Waiting count on the Dock icon
While the `latveria` layout is shown, Herdr's Dock icon SHALL carry the number of agents whose status is `blocked`,
on this computer and every machine, and no badge when there are none.

#### Scenario: Two agents wait
- **WHEN** two agents are `blocked`
- **THEN** the Dock icon shows `2`

#### Scenario: Nobody waits
- **WHEN** the last `blocked` agent becomes `working`
- **THEN** the Dock icon has no badge

### Requirement: Counter leads to the waiting agent
The status bar's `N needs you` counter SHALL, when clicked, show the `blocked` agent the bar saw waiting first
(checked once a second); agents already waiting when the bar started SHALL go by Herdr's change order (`seq`).

#### Scenario: Click the counter
- **WHEN** agents A (blocked first) and B (blocked later) wait and the person clicks `2 needs you`
- **THEN** Herdr shows agent A

### Requirement: Notes inside the window while Herdr is in front
While Herdr's window is active, the layout's notification mod SHALL draw every note Herdr posts in the window, as
Herdr's own `toast` does, and SHALL NOT post a macOS notification. A note handed over while Herdr was not in front
SHALL be drawn in the window instead of a banner when Herdr is back in front before the banner is shown.

#### Scenario: Agent needs you while you look at Herdr
- **WHEN** an agent becomes `blocked` and Herdr's window is active
- **THEN** a note shows in the window's corner and no banner appears under the clock

### Requirement: macOS banner while Herdr is not in front
While Herdr's window is not active, the notification mod SHALL hand each note Herdr posts to macOS as a banner with
the note's title and text, and SHALL draw nothing in the window. A handed-over note older than one minute SHALL be
dropped. Clicking the banner SHALL bring Herdr forward and
run the note's action; closing, swiping away or ignoring it SHALL run nothing.

#### Scenario: Agent needs you while you are in another app
- **WHEN** an agent becomes `blocked` and the person is in another app
- **THEN** a banner appears under the clock, and clicking it brings Herdr forward showing that agent

#### Scenario: Banner dismissed
- **WHEN** the person closes or swipes away the banner without clicking it
- **THEN** Herdr's view does not change

#### Scenario: Finished agent
- **WHEN** an agent finishes while the person isn't looking and Herdr's window is not active
- **THEN** a banner appears for it, however long it worked

### Requirement: One banner per agent, bounded
A newer banner for the same agent SHALL replace the older one, the same note again while its banner still waits SHALL
show no second banner, and at most five banners SHALL wait for a click at once (a replaced banner may hold its place
until it times out); a note beyond that, also for an agent whose banner waits, SHALL be drawn in the window instead.

#### Scenario: Same agent asks again
- **WHEN** an agent's note arrives while its earlier banner is still shown
- **THEN** only the newer banner remains

#### Scenario: Herdr posts the same note twice
- **WHEN** the same note for the same agent arrives while its banner still waits for a click
- **THEN** no second banner appears and nothing is drawn in the window

#### Scenario: Many agents at once
- **WHEN** a sixth note arrives while five banners wait for a click
- **THEN** the sixth note shows in Herdr's window

### Requirement: Works without the notifier
When the banner program is missing, or macOS does not allow it to notify, the mod SHALL draw the note in Herdr's
window, as when Herdr is in front (with its level and icon), SHALL keep drawing notes there for the next ten minutes,
and SHALL NOT show an error. Any other failure of the program SHALL draw that one note in the window.

#### Scenario: Notifier not installed
- **WHEN** an agent becomes `blocked`, Herdr's window is not active and `terminal-notifier` is not installed
- **THEN** the note shows in Herdr's window

### Requirement: Note text is untrusted
Text in a banner SHALL be passed to the banner program as separate arguments, never through a shell, with control
characters removed, the title cut to 120 and the text to 240 characters, and a first character that the program would
read as a property list (`[`, `(`, `{`, `"`, `'`, `<`) escaped. An empty title SHALL read `Herdr`, and an empty text
SHALL repeat the title.

#### Scenario: Title with shell characters and an escape sequence
- **WHEN** a note's title is `x"; rm -rf ~ \u001b[2J`
- **THEN** the banner program receives it as one argument without the escape character, and no shell runs it
