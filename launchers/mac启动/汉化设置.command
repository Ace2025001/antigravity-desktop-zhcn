#!/bin/bash
echo "正在启动汉化工具，请稍候…"
cd "$(dirname "$0")" || exit 1
export AGY_LANGUAGE_PACK="$PWD/../语言包"
CORE="$AGY_LANGUAGE_PACK/核心程序"
NODE="$PWD/配套程序/node"
if [ "$(uname -s)" != Darwin ]; then echo "此入口仅支持 Mac。"; exit 1; fi
chmod u+x "$NODE" || exit 1
"$NODE" "$CORE/scripts/start-local.mjs" settings
RESULT=$?
printf "按回车关闭。"; read -r _
exit "$RESULT"
