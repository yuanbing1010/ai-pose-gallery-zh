# Dreamina 浏览器桥 —— 独立服务镜像
#
# 两种用法：
#
# 1) 首次登录（需要人工扫码，暴露 noVNC 端口）：
#    docker build -t dreamina-bridge ./scripts/dreamina-bridge
#    docker run -d --name dreamina-login -p 6080:6080 \
#      -e DREAMINA_VNC=1 -e DREAMINA_BRIDGE_TOKEN=临时token \
#      -v dreamina-data:/data dreamina-bridge
#    浏览器打开 http://<服务器IP>:6080/vnc.html 登录 Dreamina，登录完 Ctrl+C / 停容器。
#
# 2) 正常运行（无头，复用 /data/profile 里已登录的会话）：
#    docker compose up -d
#
# 注意：Cookie 不能替代登录。实测把 Cookie（甚至加上 localStorage）注入全新 profile
# 无法恢复登录态，必须让 profile 本身保持登录。

FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium \
      ca-certificates \
      fonts-noto-cjk \
      fonts-noto-color-emoji \
      xvfb \
      tigervnc-standalone-server \
      novnc \
      websockify \
      procps \
 && rm -rf /var/lib/apt/lists/*

ENV DREAMINA_CHROME_BIN=/usr/bin/chromium \
    DREAMINA_BRIDGE_HOST=0.0.0.0 \
    DREAMINA_BRIDGE_PORT=8790 \
    DREAMINA_PROFILE_DIR=/data/profile \
    DREAMINA_DOWNLOAD_DIR=/data/downloads \
    DREAMINA_WINDOW_TITLE=Dreamina

WORKDIR /app
COPY bridge.mjs /app/bridge.mjs
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

VOLUME ["/data"]
EXPOSE 8790 6080

ENTRYPOINT ["/app/entrypoint.sh"]
