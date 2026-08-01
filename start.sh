#!/bin/sh
set -e

export PORT="${PORT:-8080}"
export WS_PATH="${WS_PATH:-/cdn}"
export INBOUND_PORT="${INBOUND_PORT:-10001}"

echo "Rendering nginx config -> PORT=$PORT WS_PATH=$WS_PATH INBOUND_PORT=$INBOUND_PORT"
envsubst '${PORT} ${WS_PATH} ${INBOUND_PORT}' < /app/nginx/nginx.conf.template > /etc/nginx/nginx.conf

nginx -g "daemon off;" &
NGINX_PID=$!

cd /app
PANEL_PORT=3000 node server.js &
NODE_PID=$!

trap "kill -TERM $NGINX_PID $NODE_PID 2>/dev/null" TERM INT
wait $NODE_PID
