#!/bin/sh
# Claude Code SessionStart hook: labels this Herdr terminal latveria.profile=<KEY>, the profile in
# ~/.config/latveria/profiles.json whose claudeDir is this session's ${CLAUDE_CONFIG_DIR:-~/.claude}
# (matched by latveria-profile.sh next to it). No network, no credentials. Outside Herdr, without jq, a map or
# a match it does nothing. It prints nothing (SessionStart output reaches Claude's context) and always exits 0,
# so it never stops Claude from starting. It also labels latveria.transcript and latveria.cwd (the conversation's
# transcript and start folder, from the hook's stdin JSON) when both are valid, for a hand-off to another profile.
[ -n "$HC_TERMINAL_ID" ] || exit 0
case "$HC_TERMINAL_ID" in -*|*[!A-Za-z0-9_./-]*) exit 0 ;; esac # never a flag for hc
# A terminal Herdr starts without a shell lacks ~/.local/bin, where Herdr installs hc.
hc=$(command -v hc 2>/dev/null) || hc="$HOME/.local/bin/hc"
[ -x "$hc" ] || exit 0
key=$({ sh "$(dirname "$0")/latveria-profile.sh"; } 2>/dev/null) # silent even on a bare PATH
[ -n "$key" ] || exit 0
# The conversation, for a hand-off to another profile: its transcript and the folder it started in, both checked.
# jq prints them on two lines only when valid (no control characters, so no newline), else nothing.
dir=${CLAUDE_CONFIG_DIR:-$HOME/.claude}
case "$dir" in "~") dir=$HOME ;; "~/"*) dir="$HOME/${dir#"~/"}" ;; esac
dir=${dir%/}
conv=$(head -c 65536 2>/dev/null | jq -rn --arg d "$dir/projects/" '
  def ok: type == "string" and startswith("/") and length <= 1024 and (test("[\u0000-\u001f\u007f]") | not);
  input | select(type == "object") | .transcript_path as $t | .cwd as $c
  | select(($t | ok) and ($c | ok) and ($t | startswith($d)))
  | ($t | ltrimstr($d) | split("/")) as $p
  | select(($p | length) == 2 and ($p[0] | test("^[A-Za-z0-9._-]+$")) and $p[0] != "." and $p[0] != ".."
      and ($p[1] | test("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.jsonl$")))
  | $t, $c' 2>/dev/null)
tp=${conv%%"
"*}
cwd=${conv#*"
"}
if [ -n "$conv" ] && [ "$tp" != "$conv" ]; then
  "$hc" label "$HC_TERMINAL_ID" "latveria.profile=$key" "latveria.transcript=$tp" "latveria.cwd=$cwd" >/dev/null 2>&1
else
  "$hc" label "$HC_TERMINAL_ID" "latveria.profile=$key" >/dev/null 2>&1
fi
exit 0
