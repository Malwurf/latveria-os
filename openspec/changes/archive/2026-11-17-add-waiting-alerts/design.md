# Design

Full design and spike results: `../GEM/.claude/designs/latveria-os-waiting.md` (17.11.2026).

## Context

- Herdr picks the mod that shows its notes through the layout root's `"toast"` field. The mod gets
  `props()` = `{title, body, level, icon, action, timeout, overlay}`; Herdr already decides when to post (an agent
  needs you, or finished while you weren't looking) and puts the way to the agent in `action`.
- A toast is an overlay copy. Spike 17.11 (a second Herdr window with its own home): a promise started in
  `init` resolves while the overlay is open, and **never resolves once the copy closes its overlay**. Side effects
  belong in `init` and timers, not in `render`.
- `terminal-notifier` 3.1.0 (spike 17.11): only its waiting mode (`-action … -timeout N`) delivers a click; a click
  ends it at once with empty stdout, a dismissed or ignored banner ends at the timeout with `@TIMEOUT` and an exit code that is not 0 per the help (6); read the marker, not the code.
  `-activate dev.herdr.app` brings Herdr forward on click. Missing permission: exit 3.
- `latveria-status` is docked for the layout's whole life and already runs timers and `cx.spawn` reads.

## Goals / Non-Goals

**Goals:** a banner that waits up to 9 minutes for a click without keeping anything visible in Herdr's window;
the Dock badge and clickable counter from the same long-lived mod.

**Non-Goals:** filtering notes (every note Herdr posts is forwarded); other platforms (no `terminal-notifier`
there, so notes stay in the window); installing `terminal-notifier`.

## Decisions

1. **The toast hands off, the status bar waits.** While Herdr's window is not active, `latveria-toast` appends the
   note to the shared queue `latveria.notes` (`setShared`) and closes its overlay at once. `latveria-status` checks
   the queue every second (a `shared()` read, no exec), takes new notes and runs `terminal-notifier` in its own
   `cx.spawn`, so the wait survives the toast. *Alternative:* the toast keeps its overlay open while waiting —
   leaves a note on screen for 9 minutes and dies when Herdr closes the overlay. *Alternative:* `-execute` running
   `herdr-app do …` from the banner — needs the program to stay alive anyway and moves the action into a shell
   string built from untrusted text.
2. **Markers first:** `@TIMEOUT`/`@CLOSED` in stdout = ignored whatever the exit code; exit 0 without a marker = click; anything else = failed (falls back into the window).
3. **Back into the window without a loop.** A note that can't become a banner (program missing or not allowed —
   exec rejects, or exit ≠ 0 with no output — or five banners already waiting) is re-posted by `latveria-status`
   with `notify()` after it adds the note's `title + body` to the shared list `latveria.direct`; the toast that
   finds its own `title + body` there removes it and draws in the window. A missing or not allowed program also sets
   `latveria.notifier = {missing: true, at}`, so for the next 10 minutes the toast draws in the window without
   handing off (a later install is picked up after that).
4. **Bounds.** Queue at most 20 notes; notes older than 60 s are dropped (shared state persists across restarts);
   at most 5 banners waiting; one banner per agent (`-group latveria-<action.args.terminal>`, else a hash of the
   title), a newer one replacing the older.
5. **Untrusted text.** Arguments are passed as an array to `exec`, control characters removed, title ≤ 120 and
   text ≤ 240 characters. `terminal-notifier` joins the exec allowlist in `test/rules.test.mjs`.
6. **Badge and counter.** `setBadge` is called from the 1 s timer only when the blocked count changes. The counter
   gets an `id` and `on_click` → `run("agent.focus", {terminal})` for the blocked agent seen blocked earliest by the
   bar (first-seen times kept in memory; ties and unknowns fall back to the lowest `seq`).

## Risks / Trade-offs

- [Herdr changes how overlays end their tasks, or the `toast` props] → `scripts/upstream-diff.mjs` flags a
  changed `toast`; live check with `herdr-app check` + a real banner before closing the change.
- [Notes arrive while `latveria-status` is not on screen (another layout)] → another layout also doesn't use
  `latveria-toast`, so no handoff happens; within the layout the bar is always docked.
- [Banner icon is `terminal-notifier`'s] → accepted; macOS has no API to change it.
- [Herdr adds native macOS notifications] → drop `latveria-toast` from the layout; badge and counter stay.

## Migration Plan

`node install.mjs` copies the new mod and layout; the person installs `terminal-notifier` and allows its
notifications (README). Rollback: `layout.switch` to `main`, or remove `"toast"` from the layout root.
