#!/bin/sh
# Dreamina 桥容器入口
#
# 三种运行模式：
#   DREAMINA_VNC=1          → 启动 Xvfb + x11vnc + noVNC，Chromium 有头运行在虚拟屏 :99，
#                             并开启 CDP 调试端口供桥连接。用于首次扫码/输密码人工登录。
#   DREAMINA_XVFB=1（默认） → 启动 Xvfb 虚拟屏，Chromium 以有头模式跑在 :99（不暴露 VNC），
#                             保留完整页面渲染与 hover 能力，规避部分 headless 指纹差异。
#   DREAMINA_HEADLESS=1     → 纯 --headless=new 模式（仅在显式关闭 XVFB 时使用）。

set -e

PROFILE_DIR="${DREAMINA_PROFILE_DIR:-/data/profile}"
DOWNLOAD_DIR="${DREAMINA_DOWNLOAD_DIR:-/data/downloads}"
CDP_URL="${DREAMINA_CDP_URL:-http://127.0.0.1:9222}"
CDP_PORT="${DREAMINA_CDP_PORT:-9222}"

mkdir -p "$PROFILE_DIR" "$DOWNLOAD_DIR"

# 清理异常退出/重启遗留的 Chromium 锁文件，避免重启后报 profile 被占用而死循环
rm -f "$PROFILE_DIR/SingletonLock" "$PROFILE_DIR/SingletonSocket" "$PROFILE_DIR/SingletonCookie"

start_xvfb() {
  export DISPLAY=:99
  rm -f /tmp/.X99-lock /tmp/.X11-unix/X99
  Xvfb :99 -screen 0 1440x1080x24 -nolisten tcp &
  sleep 1
}

wait_cdp_ready() {
  for _ in $(seq 1 60); do
    if node -e "fetch('${CDP_URL}/json/version').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  echo "[entrypoint] 警告：等待 Chromium 调试端口 ${CDP_URL} 超时" >&2
  return 1
}

if [ "${DREAMINA_VNC:-0}" = "1" ]; then
  export DISPLAY=:99
  rm -f /tmp/.X99-lock /tmp/.X11-unix/X99
  Xvnc :99 -geometry 1440x1080 -depth 24 -rfbport 5900 -SecurityTypes None -AlwaysShared -localhost -nolisten tcp &
  sleep 1

  websockify --web=/usr/share/novnc 6080 127.0.0.1:5900 &

  echo "[entrypoint] VNC 已启动：浏览器打开 http://<服务器>:6080/vnc.html"
  echo "[entrypoint] 在这个窗口里登录 Dreamina，登录后 profile 会留在 $PROFILE_DIR"

  unset DREAMINA_LAUNCH_CHROME
  chromium \
    --remote-debugging-port="${CDP_PORT}" \
    --no-first-run --no-default-browser-check --no-sandbox \
    --disable-gpu \
    --disable-backgrounding-occluded-windows \
    --disable-renderer-backgrounding \
    --disable-background-timer-throttling \
    --disable-features=CalculateNativeWinOcclusion \
    --user-data-dir="$PROFILE_DIR" \
    --window-size=1440,1080 \
    --disable-dev-shm-usage \
    https://dreamina.capcut.com/ai-tool/ai-image &

  wait_cdp_ready || true
  exec node /app/bridge.mjs
fi

if [ "${DREAMINA_XVFB:-1}" = "1" ] && [ "${DREAMINA_HEADLESS:-0}" != "1" ]; then
  start_xvfb
  export DREAMINA_LAUNCH_CHROME="${DREAMINA_LAUNCH_CHROME:-1}"
  export DREAMINA_HEADLESS="0"
  exec node /app/bridge.mjs
fi

export DREAMINA_LAUNCH_CHROME="${DREAMINA_LAUNCH_CHROME:-1}"
export DREAMINA_HEADLESS="${DREAMINA_HEADLESS:-1}"
exec node /app/bridge.mjs
