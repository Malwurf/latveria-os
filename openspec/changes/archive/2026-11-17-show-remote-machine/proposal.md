# Proposal: show-remote-machine

## Why

The status bar merges limits from this computer and every ready machine, so a profile that lives only on another
machine (an account used just on a laptop) sits next to the local ones with nothing saying where it comes from.
Next to the bar's own "This computer" label it reads as an account this computer has. The machine is only in the
tooltip.

## What Changes

- A profile whose snapshots come only from other machines shows that machine after its label: a server icon and
  the machine's name in dim text, cut to 16 characters (`● Work ▣ laptop 5h 10% · 7d 20%`).
- A profile with a snapshot on this computer shows no machine, even when another machine reports it too.
- The tooltip does not change.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `quota-bar`: the segment names the machine of a profile that only another machine reports.

## Impact

`mods/latveria-status/main.js` (segment), `test/status.test.mjs`. No new reads: the machine is already known from
the snapshots.
