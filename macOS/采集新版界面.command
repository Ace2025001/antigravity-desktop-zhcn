#!/bin/bash
cd "$(dirname "$0")/.." || exit 1
/bin/bash scripts/run-macos.sh capture
RESULT=$?
printf "\n操作结束（状态 %s）。按回车关闭窗口。" "$RESULT"
read -r _
exit "$RESULT"
