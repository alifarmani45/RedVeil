const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { db, getSetting } = require('./db');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'xray-config.json');
const XRAY_BIN = process.env.XRAY_BIN || '/usr/local/bin/xray';

let xrayProcess = null;
let logBuffer = [];
let status = 'stopped'; // stopped | running | error

function pushLog(line) {
  logBuffer.push(`[${new Date().toISOString()}] ${line}`);
  if (logBuffer.length > 200) logBuffer.shift();
}

function getActiveClients() {
  const now = Date.now();
  return db
    .prepare('SELECT * FROM clients WHERE enabled = 1')
    .all()
    .filter((c) => c.expireAt === 0 || c.expireAt > now)
    .filter((c) => c.totalGB === 0 || c.downloadBytes + c.uploadBytes < c.totalGB * 1024 ** 3);
}

function buildConfig() {
  const wsPath = getSetting('ws_path', '/cdn');
  const inboundPort = parseInt(getSetting('inbound_port', '10001'), 10);
  const clients = getActiveClients().map((c) => ({
    id: c.uuid,
    email: c.remark,
  }));

  return {
    log: { loglevel: 'warning' },
    stats: {},
    api: {
      tag: 'api',
      services: ['StatsService'],
    },
    policy: {
      levels: { '0': { statsUserUplink: true, statsUserDownlink: true } },
      system: { statsInboundUplink: true, statsInboundDownlink: true },
    },
    inbounds: [
      {
        listen: '127.0.0.1',
        port: inboundPort,
        protocol: 'vless',
        settings: { clients, decryption: 'none' },
        streamSettings: {
          network: 'ws',
          wsSettings: { path: wsPath },
        },
        sniffing: { enabled: true, destOverride: ['http', 'tls'] },
      },
    ],
    outbounds: [{ protocol: 'freedom', tag: 'direct' }],
  };
}

function writeConfig() {
  const cfg = buildConfig();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  return cfg;
}

function stop() {
  if (xrayProcess) {
    xrayProcess.kill('SIGTERM');
    xrayProcess = null;
  }
}

function start() {
  stop();
  writeConfig();

  if (!fs.existsSync(XRAY_BIN)) {
    status = 'error';
    pushLog(`xray binary not found at ${XRAY_BIN} — running in PANEL-ONLY mode (no live proxy).`);
    return;
  }

  xrayProcess = spawn(XRAY_BIN, ['run', '-c', CONFIG_PATH]);
  status = 'running';
  pushLog('xray-core started');

  xrayProcess.stdout.on('data', (d) => pushLog(d.toString().trim()));
  xrayProcess.stderr.on('data', (d) => pushLog(d.toString().trim()));
  xrayProcess.on('exit', (code) => {
    status = code === 0 ? 'stopped' : 'error';
    pushLog(`xray-core exited with code ${code}`);
  });
}

function restart() {
  pushLog('restarting xray-core...');
  start();
}

function getStatus() {
  return { status, logs: logBuffer.slice(-40) };
}

module.exports = { start, stop, restart, getStatus, buildConfig, writeConfig };
