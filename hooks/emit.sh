#!/bin/sh
# Claude Code hook → ai-office 서버로 전달. 서버가 꺼져 있어도 Claude를 막지 않는다.
PORT="${AI_OFFICE_PORT:-4777}"
payload=$(cat)
[ -z "$payload" ] && exit 0
( printf '%s' "$payload" | curl -s -m 1 -X POST \
    -H 'Content-Type: application/json' \
    --data-binary @- "http://127.0.0.1:${PORT}/hook" >/dev/null 2>&1 ) &
exit 0
