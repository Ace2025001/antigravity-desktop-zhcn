#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ "$(uname -s)" != Darwin ]; then
  echo "请在 macOS 上构建 Mac 便携包。"; exit 1
fi
ARCH=arm64
VERSION=22.22.2
NAME=antigravity-desktop-zhcn-portable-macos-arm64
OUT="$PWD/.runtime/release"
mkdir -p "$OUT"
TEMP="$(mktemp -d)"
trap 'rm -rf "$TEMP"' EXIT
ARCHIVE="node-v$VERSION-darwin-$ARCH.tar.gz"
curl --fail --location --output "$TEMP/$ARCHIVE" "https://nodejs.org/dist/v$VERSION/$ARCHIVE"
curl --fail --location --output "$TEMP/SHASUMS256.txt" "https://nodejs.org/dist/v$VERSION/SHASUMS256.txt"
(cd "$TEMP"; awk -v file="$ARCHIVE" '$2 == file { print }' SHASUMS256.txt > selected.sha256; test -s selected.sha256; shasum -a 256 -c selected.sha256)
tar -xzf "$TEMP/$ARCHIVE" -C "$TEMP"
STAGE="$TEMP/$NAME"
mkdir -p "$STAGE/runtime"
for item in macOS src config scripts tests docs package.json package-lock.json README.md README.en.md LICENSE; do
  cp -R "$item" "$STAGE/"
done
cp ./*.command 使用说明.txt "$STAGE/"
cp "$TEMP/node-v$VERSION-darwin-$ARCH/bin/node" "$STAGE/runtime/node"
cp "$TEMP/node-v$VERSION-darwin-$ARCH/LICENSE" "$STAGE/runtime/NODE_LICENSE.txt"
(cd "$STAGE"; npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
chmod +x "$STAGE"/*.command "$STAGE/runtime/node" "$STAGE"/macOS/*.command "$STAGE"/scripts/*.sh
/usr/bin/ditto -c -k --keepParent "$STAGE" "$OUT/$NAME.zip"
(cd "$OUT"; shasum -a 256 "$NAME.zip" > "$NAME.zip.sha256")
echo "已生成：$OUT/$NAME.zip"
