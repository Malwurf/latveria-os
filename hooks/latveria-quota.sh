#!/bin/sh
# Statusline side-car: reads Claude Code's statusline JSON on stdin (only the first document counts) and keeps
# ~/.cache/latveria/quota-<KEY>.json, this profile's 5h/7d limits with its label and color, for Herdr's status bar.
# No network, no credentials. Writes only when the limits, label or color change, through a temp file and mv,
# so the snapshot's age means "since when the numbers stand". Prints nothing, always exits 0.
command -v jq >/dev/null 2>&1 || exit 0
key=$({ sh "$(dirname "$0")/latveria-profile.sh"; } 2>/dev/null) # silent even on a bare PATH
[ -n "$key" ] || exit 0
map="$HOME/.config/latveria/profiles.json"
dir="$HOME/.cache/latveria"
out="$dir/quota-$key.json"
old=/dev/null
[ -r "$out" ] && old=$out

# One jq: the new snapshot, or nothing when the one in place still stands. It stands when label, color and the
# window set are the same and every window has the same reset time and at least the new percentage: within a
# window usage only grows, so lower numbers come from an older run that finished late. Its updated time stays.
# A key listed twice in the map: the first entry counts, as in the Agents list.
snap=$(head -c 1048576 | jq -n -c --arg k "$key" --slurpfile m "$map" --rawfile o "$old" '
  def win: if type == "object" and (.used_percentage | type) == "number"
    then {used_percentage, resets_at: (if (.resets_at | type) == "number" then .resets_at else null end)}
    else null end;
  input
  | ((.rate_limits | if type == "object" then . else {} end)
    | {five_hour: (.five_hour | win), seven_day: (.seven_day | win)}
    | with_entries(select(.value != null))) as $r
  | ([$m[0].profiles[]? | select(type == "object" and .key == $k)][0] // {}) as $p
  | if ($r | length) == 0 then empty else
      {updated: (now | floor), profile: $k,
       label: (if ($p.label | type) == "string" then $p.label[:64] else $k end),
       color: ($p.color // null), rate_limits: $r} as $n
      | ($o | try fromjson catch null) as $e
      | if ($e | type) == "object" and $e.label == $n.label and $e.color == $n.color
          and ($e.rate_limits | type) == "object" and ($e.rate_limits | keys) == ($r | keys)
          and all($r | to_entries[]; .key as $w | .value as $v | $e.rate_limits[$w]
            | type == "object" and .resets_at == $v.resets_at
              and (.used_percentage | type) == "number" and .used_percentage >= $v.used_percentage)
        then empty else $n end
    end
' 2>/dev/null)
[ -n "$snap" ] || exit 0

mkdir -p "$dir" 2>/dev/null || exit 0
tmp=$(mktemp "$dir/.quota-$key.XXXXXX" 2>/dev/null) || exit 0
# No cleanup on failure: the rules test bans deleting files, so a failed mv leaves only the temp file.
printf '%s\n' "$snap" > "$tmp" 2>/dev/null && mv -f "$tmp" "$out" 2>/dev/null
exit 0
