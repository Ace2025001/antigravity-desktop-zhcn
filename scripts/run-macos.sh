#!/bin/bash
set -euo pipefail
if [ "$#" -eq 0 ]; then set -- check; fi
cd "$(dirname "$0")/.."
if [ "$(uname -s)" != "Darwin" ]; then
  echo "此入口仅支持 macOS。"; exit 1
fi
NODE="$PWD/runtime/node"
if [ -f "$NODE" ]; then
  chmod u+x "$NODE"
else
  NODE="$(command -v node || true)"
fi
if [ -z "$NODE" ]; then
  echo "未找到 Node.js，请下载 Mac 便携包或安装 Node.js >= 22.12.0。"; exit 1
fi
"$NODE" -e 'const [a,b]=process.versions.node.split(".").map(Number); if(a<22||(a===22&&b<12))process.exit(1)' || { echo "需要 Node.js >= 22.12.0。"; exit 1; }
"$NODE" scripts/macos.mjs "$1"
if [ "$1" = "install" ]; then
  "$NODE" scripts/macos.mjs launch
fi
