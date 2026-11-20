## MODIFIED Requirements

### Requirement: macOS banner while Herdr is not in front
While Herdr's window is not active, the notification mod SHALL hand each note Herdr posts to macOS as a banner with
the note's title and text, and SHALL draw nothing in the window. A handed-over note older than one minute SHALL be
dropped. The banner program SHALL NOT wait for the person: macOS keeps the banner. Clicking the banner, also after
the banner program has exited, SHALL bring Herdr forward and run the note's action, and SHALL NOT show a macOS error;
closing, swiping away or ignoring it SHALL run nothing.

#### Scenario: Agent needs you while you are in another app
- **WHEN** an agent becomes `blocked` and the person is in another app
- **THEN** a banner appears under the clock, and clicking it brings Herdr forward showing that agent

#### Scenario: Click after the banner program has exited
- **WHEN** the person clicks a banner whose `terminal-notifier` process has already ended
- **THEN** Herdr comes forward showing that agent and no “is not open anymore” dialog appears

#### Scenario: Banner dismissed
- **WHEN** the person closes or swipes away the banner without clicking it
- **THEN** Herdr's view does not change

#### Scenario: Finished agent
- **WHEN** an agent finishes while the person isn't looking and Herdr's window is not active
- **THEN** a banner appears for it, however long it worked

### Requirement: Note text is untrusted
Text in a banner SHALL be passed to the banner program as separate arguments, never through a shell, with control
characters removed, the title cut to 120 and the text to 240 characters, and a first character that the program would
read as a property list (`[`, `(`, `{`, `"`, `'`, `<`) escaped. An empty title SHALL read `Herdr`, and an empty text
SHALL repeat the title. The command a click runs SHALL hold only the absolute path of `herdr-app`, the note's action
name (lowercase words joined by dots) and its arguments as one single-quoted JSON argument of at most 512
characters; a note whose action fails these checks, or no `herdr-app` found, SHALL give a banner whose click only
brings Herdr forward.

#### Scenario: Title with shell characters and an escape sequence
- **WHEN** a note's title is `x"; rm -rf ~ \u001b[2J`
- **THEN** the banner program receives it as one argument without the escape character, and no shell runs it

#### Scenario: Action arguments with a quote
- **WHEN** a note's action argument contains `'; rm -rf ~; '`
- **THEN** the click command passes it inside one single-quoted JSON argument and the shell runs nothing else

## REMOVED Requirements

### Requirement: One banner per agent, bounded
**Reason**: banners no longer wait for a click, so “while its banner still waits” and “five banners waiting” no longer exist.
**Migration**: replaced by “One banner per agent” (same note within a minute).

## ADDED Requirements

### Requirement: One banner per agent
A newer banner for the same agent SHALL replace the older one, and the same note for the same agent again within one
minute SHALL show no second banner.

#### Scenario: Same agent asks again
- **WHEN** an agent's note arrives while its earlier banner is still shown
- **THEN** only the newer banner remains

#### Scenario: Herdr posts the same note twice
- **WHEN** the same note for the same agent arrives within a minute of its banner
- **THEN** no second banner appears and nothing is drawn in the window
