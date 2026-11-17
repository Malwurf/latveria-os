#!/bin/sh
# Claude Code SessionStart hook: labels this Herdr terminal latveria.profile=<KEY>, the profile in
# ~/.config/latveria/profiles.json whose claudeDir is this session's ${CLAUDE_CONFIG_DIR:-~/.claude}
# (matched by latveria-profile.sh next to it). No network, no credentials. Outside Herdr, without jq, a map or
# a match it does nothing. It prints nothing (SessionStart output reaches Claude's context) and always exits 0,
# so it never stops Claude from starting.
[ -n "$HC_TERMINAL_ID" ] || exit 0
case "$HC_TERMINAL_ID" in -*|*[!A-Za-z0-9_./-]*) exit 0 ;; esac # never a flag for hc
# A terminal Herdr starts without a shell lacks ~/.local/bin, where Herdr installs hc.
hc=$(command -v hc 2>/dev/null) || hc="$HOME/.local/bin/hc"
[ -x "$hc" ] || exit 0
key=$({ sh "$(dirname "$0")/latveria-profile.sh"; } 2>/dev/null) # silent even on a bare PATH
[ -n "$key" ] || exit 0
"$hc" label "$HC_TERMINAL_ID" "latveria.profile=$key" >/dev/null 2>&1
exit 0
