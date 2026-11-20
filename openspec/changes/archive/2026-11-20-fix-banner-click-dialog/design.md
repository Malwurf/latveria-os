# Design

## Context

- Root cause (system log, 20.11.2026): body click → `usernoted` activates `terminal-notifier` → the waiting process
  has already printed and exited → LaunchServices `procNotFound` (-600) → “is not open anymore” dialog. Every click
  on a waiting banner loses this race.
- A banner posted without `-action` is held by macOS; a click relaunches `terminal-notifier`, which runs the stored
  `-activate`/`-execute` and exits. Live check 20.11 11:18: command ran, no dialog.
- `herdr-app do agent.focus '{"terminal":"t2n"}'` works from `/bin/sh` with only `HOME` and the system `PATH` —
  the environment `-execute` gets after a relaunch.

## Decisions

1. **No waiting mode; the click runs `herdr-app do`.** Reverses decision 1 of `add-waiting-alerts`. Its two
   objections: “needs the program to stay alive” — false, macOS relaunches it; “a shell string built from untrusted
   text” — the command holds no note text: the action name must match `^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$`, its
   arguments are a plain object serialised to JSON (≤ 512 characters) and single-quoted (`'` → `'\''`), and the
   program path must be absolute and made of `[A-Za-z0-9._/-]`. Anything else: no `-execute`, the click only brings
   Herdr forward. *Alternative:* keep waiting mode and click only the “Show” button — the body click is what people
   do, and it always activates the app. *Alternative:* only `-activate` — Herdr comes forward but not on the agent.
2. **`herdr-app` by absolute path, found once.** `sh -c 'command -v herdr-app'` (Herdr's exec has the user's PATH);
   a hit is kept for the mod's life, a miss is retried with the next banner. The path is never in the repo (rule 4).
3. **De-duplication by time.** The same note for the same agent within 60 s shows no second banner (Herdr posts one
   wait twice, seen 17.11). A newer note for the agent still replaces the older banner through `-group`.
4. **Outcome:** exit 0 = shown; exec rejects or exit 3 = missing (back into the window, toast keeps notes there for
   10 min); anything else = failed (that note into the window). Exec timeout 10 s: the program no longer waits.

## Risks / Trade-offs

- [A click on an old banner for an agent that has gone] → `herdr-app do` fails quietly; Herdr is in front anyway.
- [Herdr renames `herdr-app do` or `agent.focus`] → the click only brings Herdr forward; `scripts/upstream-diff.mjs`
  and the live check before closing a Herdr update.
- [Banners stay in Notification Center until cleared] → same as any app's; grouped per agent.
