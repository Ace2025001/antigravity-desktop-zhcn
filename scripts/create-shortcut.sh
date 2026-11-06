#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo -e "\033[36m==========================================\033[0m"
echo -e "\033[36m Antigravity Desktop 中文汉化\033[0m"
echo -e "\033[36m 操作: 生成桌面快捷方式\033[0m"
echo -e "\033[36m==========================================\033[0m"
echo ""

TARGET_COMMAND="$PROJECT_ROOT/macOS/启动 Antigravity（自动汉化）.command"
DESKTOP_DIR="$HOME/Desktop"

if [[ ! -d "$DESKTOP_DIR" ]]; then
  echo -e "\033[31m错误: 未找到桌面目录: $DESKTOP_DIR\033[0m" >&2
  exit 1
fi

SHORTCUT_PATH="$DESKTOP_DIR/启动 Antigravity（自动汉化）.command"

cat > "$SHORTCUT_PATH" << EOF
#!/usr/bin/env bash
cd "$PROJECT_ROOT"
exec "$PROJECT_ROOT/scripts/run.sh" AutoUpdate
EOF

chmod +x "$SHORTCUT_PATH"

# 尝试关联客户端图标
ICON_SRC="/Applications/Antigravity.app/Contents/Resources/icon.icns"
if [[ ! -f "$ICON_SRC" ]]; then
  ICON_SRC="$HOME/Applications/Antigravity.app/Contents/Resources/icon.icns"
fi

echo -e "\033[32m快捷方式创建成功！\033[0m"
echo -e "\033[90m位置: $SHORTCUT_PATH\033[0m"
if [[ -f "$ICON_SRC" ]]; then
  echo -e "\033[90m已检测到客户端图标: $ICON_SRC\033[0m"
fi
echo ""
echo -e "\033[36m以后您可以直接双击桌面的【启动 Antigravity（自动汉化）】使用中文版客户端！\033[0m"
