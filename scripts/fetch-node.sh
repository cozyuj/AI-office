#!/bin/sh
# 호환용: Node 스크립트로 위임 (맥·리눅스·Windows 공통 구현은 fetch-node.js)
exec node "$(dirname "$0")/fetch-node.js" "$@"
