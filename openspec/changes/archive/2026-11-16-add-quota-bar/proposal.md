# Proposal: add-quota-bar

## Why

The 5h and 7d usage limits of each Claude profile show only inside that profile's own statusline. With Personal and
Work on this Mac and the laptop profile on the laptop, checking all three means opening a session on each, or a separate app
that reads the Keychain.

## What Changes

- `hooks/latveria-profile.sh` prints the key of the profile matching the session's config directory; the label
  hook and the new snapshot script share it.
- `hooks/latveria-quota.sh`, called from Claude Code's statusline with its JSON on stdin, keeps
  `~/.cache/latveria/quota-<KEY>.json`: the profile's key, label, color and 5h/7d limits. It writes only when the limits,
  label or color change, atomically, prints nothing and always exits 0.
- A clone of Herdr's `workspace-status` mod, `latveria-status`, used by the `latveria` layout: next to the
  original parts it shows `● KEY 5h N% · 7d N%` per profile from this computer and every ready machine, colored
  green/yellow/red at 50 % and 80 %, reset times and the last change in a tooltip; a machine that stops answering keeps its last readings,
  dimmed with their age.
- Text in the bar is at least 12 px.

## Capabilities

### New Capabilities

- `quota-bar` — 5h/7d usage limits per Claude profile from every machine in the status bar.

### Modified Capabilities

(none)

## Impact

New mod `mods/latveria-status` (cloned from Herdr 0.1.16), two new scripts in `hooks/` installed to
`~/.config/latveria/hooks/`, a refactor of the label hook without behavior change, layout change. No network, no
credentials: limits come only from the statusline JSON Claude Code already passes. Adding one line to the person's
`statusline.sh` is a manual step described in the README.
