const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'panel.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subId TEXT UNIQUE NOT NULL,
    uuid TEXT UNIQUE NOT NULL,
    remark TEXT NOT NULL,
    totalGB REAL DEFAULT 0,
    expireAt INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1,
    downloadBytes INTEGER DEFAULT 0,
    uploadBytes INTEGER DEFAULT 0,
    createdAt INTEGER NOT NULL
  );
`);

function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

// --- first-boot defaults ---
function ensureDefaults() {
  if (!getSetting('admin_user')) setSetting('admin_user', process.env.ADMIN_USER || 'admin');
  if (!getSetting('admin_pass_hash')) {
    const plain = process.env.ADMIN_PASS || 'admin';
    setSetting('admin_pass_hash', bcrypt.hashSync(plain, 10));
  }
  if (!getSetting('ws_path')) setSetting('ws_path', '/cdn');
  if (!getSetting('inbound_port')) setSetting('inbound_port', '10001');
  if (!getSetting('panel_title')) setSetting('panel_title', 'RedVeil');
  if (!getSetting('sub_domain')) setSetting('sub_domain', process.env.RAILWAY_PUBLIC_DOMAIN || 'localhost');
}
ensureDefaults();

module.exports = { db, getSetting, setSetting };
