#!/usr/bin/env bash
# setup-playwright.sh — 修复沙盒内 Playwright 找不到浏览器的问题
#
# 症状（不设环境变量时）：
#   browserType.launch: Executable doesn't exist at
#   /root/.cache/ms-playwright/chromium_headless_shell-1228/...
#
# 实测根因（2026-09-17）：
#   Playwright 默认到 /root/.cache/ms-playwright 找浏览器，
#   但沙盒里浏览器实际装在 /data/workspace/.pw-browsers。
#   以前靠某些脚本里 export PLAYWRIGHT_BROWSERS_PATH 才跑得起来，
#   一旦新会话没设这个变量，浏览器测试就会失败
#   —— 而且容易被人误读成"浏览器没装"。
#
# 修复：建软链，让默认路径指向实际位置。
#   好处是不依赖任何环境变量，所有入口（npm test / node -e / CI）统一生效。
#
# 用法：bash tools/setup-playwright.sh   （幂等，可重复跑；带启动自检）
#
# 注意：/root/.cache 位于容器层，新会话可能被重置。
#       如果自检失败，重跑本脚本即可。

set -u
SRC=/data/workspace/.pw-browsers
DST=/root/.cache/ms-playwright

if [ ! -d "$SRC" ]; then
  echo "[setup-playwright] 错误: 源目录不存在 $SRC（浏览器未安装？）"
  exit 1
fi

mkdir -p /root/.cache

# 已有正确软链则跳过
if [ -L "$DST" ] && [ "$(readlink "$DST")" = "$SRC" ]; then
  echo "[setup-playwright] 软链已存在，跳过"
elif [ -e "$DST" ]; then
  echo "[setup-playwright] 警告: $DST 已存在且不是指向 $SRC 的软链，未改动"
else
  ln -s "$SRC" "$DST"
  echo "[setup-playwright] 已创建软链: $DST -> $SRC"
fi

# 自检：故意不设 PLAYWRIGHT_BROWSERS_PATH，验证默认路径可用
env -u PLAYWRIGHT_BROWSERS_PATH node -e "
const { chromium } = require('playwright');
(async () => {
  try {
    const b = await chromium.launch();
    console.log('[setup-playwright] 自检: 无环境变量启动成功, version=' + b.version());
    await b.close();
  } catch (e) {
    console.log('[setup-playwright] 自检失败: ' + String(e.message).split('\n')[0]);
    process.exit(1);
  }
})();
" 2>&1 | tail -2
