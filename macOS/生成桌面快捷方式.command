#!/usr/bin/env bash
DIR="$(cd "$(dirname "$0")" && pwd)"
"$DIR/../scripts/create-shortcut.sh"
echo ""
read -p "按回车键退出..." dummy
