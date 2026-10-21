#!/bin/sh
# Tauri 사이드카용 Node 바이너리를 내려받는다 (산출물은 커밋하지 않음).
#   sh scripts/fetch-node.sh            # 현재 머신 아키텍처
#   NODE_VERSION=22.12.0 sh scripts/fetch-node.sh
set -e
VER="${NODE_VERSION:-22.12.0}"
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64)  PLAT=darwin-arm64;  TRIPLE=aarch64-apple-darwin ;;
  Darwin-x86_64) PLAT=darwin-x64;    TRIPLE=x86_64-apple-darwin ;;
  Linux-x86_64)  PLAT=linux-x64;     TRIPLE=x86_64-unknown-linux-gnu ;;
  Linux-aarch64) PLAT=linux-arm64;   TRIPLE=aarch64-unknown-linux-gnu ;;
  *) echo "지원하지 않는 플랫폼: $(uname -s)-$(uname -m)"; exit 1 ;;
esac
OUT="$(cd "$(dirname "$0")/.." && pwd)/app/src-tauri/binaries"
mkdir -p "$OUT"
TMP="${TMPDIR:-/tmp}/node-$VER-$PLAT"
if [ ! -x "$OUT/node-$TRIPLE" ]; then
  echo "downloading node v$VER ($PLAT)…"
  curl -sSL -o "$TMP.tar.gz" "https://nodejs.org/dist/v$VER/node-v$VER-$PLAT.tar.gz"
  mkdir -p "$TMP" && tar -xzf "$TMP.tar.gz" -C "$TMP" --strip-components=1
  cp "$TMP/bin/node" "$OUT/node-$TRIPLE" && chmod +x "$OUT/node-$TRIPLE"
  rm -rf "$TMP" "$TMP.tar.gz"
fi
"$OUT/node-$TRIPLE" --version && ls -la "$OUT/node-$TRIPLE" | awk '{print $5" bytes"}'
