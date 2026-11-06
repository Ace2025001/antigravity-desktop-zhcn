#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 支持 -Action Check 或直接传入 Check
ACTION=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -Action|--action)
      ACTION="$2"
      shift 2
      ;;
    Check|check|Preview|preview|Install|install|AutoUpdate|autoupdate|Restore|restore|Cleanup|cleanup|Purge|purge)
      ACTION="$1"
      shift
      ;;
    *)
      ACTION="$1"
      shift
      ;;
  esac
done

if [[ -z "$ACTION" ]]; then
  echo -e "\033[31m错误: 必须指定操作类型 (Check, Preview, Install, AutoUpdate, Restore, Cleanup, Purge)\033[0m" >&2
  exit 1
fi

# 格式化 Action 首字母大写用于展示
ACTION_LOWER="$(echo "$ACTION" | tr '[:upper:]' '[:lower:]')"
case "$ACTION_LOWER" in
  check) ACTION="Check" ;;
  preview) ACTION="Preview" ;;
  install) ACTION="Install" ;;
  autoupdate) ACTION="AutoUpdate" ;;
  restore) ACTION="Restore" ;;
  cleanup) ACTION="Cleanup" ;;
  purge) ACTION="Purge" ;;
  *) ;;
esac

echo -e "\033[36m==========================================\033[0m"
echo -e "\033[36m Antigravity Desktop 中文汉化工具\033[0m"
echo -e "\033[36m 操作: $ACTION\033[0m"
echo -e "\033[36m==========================================\033[0m"
echo ""

# 查找 Node.js
BUNDLED_NODE="$PROJECT_ROOT/runtime/bin/node"
if [[ ! -x "$BUNDLED_NODE" ]]; then
  BUNDLED_NODE="$PROJECT_ROOT/runtime/node"
fi

if [[ -x "$BUNDLED_NODE" ]]; then
  NODE_PATH="$BUNDLED_NODE"
  echo -e "\033[90m运行环境: 便携版内置 Node.js\033[0m"
else
  if command -v node >/dev/null 2>&1; then
    NODE_PATH="$(command -v node)"
    echo -e "\033[90m运行环境: 系统 Node.js ($NODE_PATH)\033[0m"
  else
    echo -e "\033[31m未检测到 Node.js。请安装 Node.js 22.12 及更高版本 (推荐使用 brew install node 或从 nodejs.org 下载)。\033[0m" >&2
    exit 1
  fi
fi

# 检查 Node.js 版本 (>= 22.12.0)
NODE_VER_TEXT="$("$NODE_PATH" --version | sed 's/^v//')"
MAJOR="$(echo "$NODE_VER_TEXT" | cut -d. -f1)"
MINOR="$(echo "$NODE_VER_TEXT" | cut -d. -f2)"

if [[ "$MAJOR" -lt 22 || ( "$MAJOR" -eq 22 && "$MINOR" -lt 12 ) ]]; then
  echo -e "\033[31mNode.js 版本过低：v$NODE_VER_TEXT；需要 22.12.0 或更高版本。\033[0m" >&2
  exit 1
fi

# 检查/准备 ASAR 依赖
if [[ "$ACTION" == "Install" || "$ACTION" == "AutoUpdate" ]]; then
  ASAR_PKG="$PROJECT_ROOT/node_modules/@electron/asar/package.json"
  ASAR_READY=false
  if [[ -f "$ASAR_PKG" ]]; then
    PKG_VER="$("$NODE_PATH" -e "try { console.log(JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')).version); } catch(e) {}" "$ASAR_PKG" 2>/dev/null || true)"
    if [[ "$PKG_VER" == "4.2.1" ]]; then
      ASAR_READY=true
    fi
  fi

  if [[ "$ASAR_READY" != "true" ]]; then
    if ! command -v npm >/dev/null 2>&1; then
      echo -e "\033[31m安装补丁需要 npm，但当前环境没有检测到 npm。\033[0m" >&2
      exit 1
    fi

    echo -e "\033[33m首次安装：正在下载锁定版本的 ASAR 工具依赖...\033[0m"
    (
      cd "$PROJECT_ROOT"
      npm ci --ignore-scripts --no-audit --no-fund
    )
  fi
fi

# 执行相应操作
EXIT_CODE=0
if [[ "$ACTION" == "AutoUpdate" ]]; then
  "$NODE_PATH" "$PROJECT_ROOT/scripts/auto-follow-update.mjs" || EXIT_CODE=$?
else
  CLI_ACTION="$(echo "$ACTION" | tr '[:upper:]' '[:lower:]')"
  set +e
  "$NODE_PATH" "$PROJECT_ROOT/src/cli.mjs" "$CLI_ACTION"
  EXIT_CODE=$?
  set -e
  if [[ $EXIT_CODE -ne 0 && "$ACTION" == "Install" ]]; then
    echo ""
    echo -e "\033[33m提示：静态校验未通过，正在自动切换至自适应安全汉化模式...\033[0m"
    "$NODE_PATH" "$PROJECT_ROOT/scripts/auto-follow-update.mjs"
    EXIT_CODE=$?
  fi
fi

exit $EXIT_CODE
