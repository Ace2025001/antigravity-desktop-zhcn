#!/usr/bin/env bash
DIR="$(cd "$(dirname "$0")" && pwd)"
"$DIR/../scripts/run.sh" AutoUpdate
echo ""
read -p "按回车键退出..." dummy
