#!/bin/sh
# D2Coding 웹폰트를 라틴·숫자·기호만 남겨 서브셋한다 (한글은 나눔스퀘어가 맡는다).
#   python3 -m venv .venv && .venv/bin/pip install fonttools brotli && sh scripts/subset-fonts.sh
set -e
SRC_URL="https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_three@1.0/D2Coding.woff"
OUT="$(dirname "$0")/../public/assets/fonts"
TMP="${TMPDIR:-/tmp}/d2coding.woff"
PYFT="${PYFTSUBSET:-pyftsubset}"
curl -sL -o "$TMP" "$SRC_URL"
UNI="U+0000-00FF,U+2000-206F,U+2190-21FF,U+2500-257F,U+25A0-25FF"
"$PYFT" "$TMP" --unicodes="$UNI" --flavor=woff2 --output-file="$OUT/D2Coding-latin.woff2" --layout-features='*' --no-hinting
"$PYFT" "$TMP" --unicodes="$UNI" --flavor=woff  --output-file="$OUT/D2Coding-latin.woff"  --layout-features='*' --no-hinting
ls -la "$OUT"
