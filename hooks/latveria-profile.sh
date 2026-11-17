#!/bin/sh
# Prints the key of the profile in ~/.config/latveria/profiles.json whose claudeDir is this session's
# ${CLAUDE_CONFIG_DIR:-~/.claude}, and a newline. Shared by the label hook and the statusline side-car.
# No network, no credentials. Without jq, a map or a match it prints nothing. It prints nothing else and
# always exits 0.
command -v jq >/dev/null 2>&1 || exit 0
map="$HOME/.config/latveria/profiles.json" # where the Agents list reads it too
[ -r "$map" ] || exit 0

unset CDPATH # cd must not search elsewhere or print

# A folder's real path: ~ expanded, symlinks and a trailing slash resolved; a missing folder keeps its spelling.
real() {
  case "$1" in "~") set -- "$HOME" ;; "~/"*) set -- "$HOME/${1#"~/"}" ;; esac
  (cd "$1" 2>/dev/null && pwd -P) || printf '%s\n' "${1%/}"
}
want=$(real "${CLAUDE_CONFIG_DIR:-$HOME/.claude}")
tab=$(printf '\t')

jq -r '(.profiles? // []) | if type == "array" then .[] else empty end
  | select(type == "object" and (.key | type) == "string" and (.claudeDir | type) == "string")
  | [.key, .claudeDir] | @tsv' "$map" 2>/dev/null |
while IFS="$tab" read -r key dir; do
  case "$key" in ""|*[!A-Za-z0-9_-]*) continue ;; esac
  [ "${#key}" -le 24 ] || continue
  [ "$(real "$dir")" = "$want" ] || continue
  printf '%s\n' "$key"
  break
done
exit 0
