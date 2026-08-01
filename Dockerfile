FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx curl unzip ca-certificates gettext-base build-essential python3 \
  && rm -rf /var/lib/apt/lists/*

# --- install xray-core ---
ARG XRAY_VERSION=v25.6.8
RUN curl -L -o /tmp/xray.zip \
    https://github.com/XTLS/Xray-core/releases/download/${XRAY_VERSION}/Xray-linux-64.zip \
    && unzip /tmp/xray.zip -d /usr/local/bin xray \
    && chmod +x /usr/local/bin/xray \
    && rm /tmp/xray.zip

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

COPY . .
RUN chmod +x start.sh

ENV DATA_DIR=/data
VOLUME ["/data"]

EXPOSE 8080
CMD ["./start.sh"]
