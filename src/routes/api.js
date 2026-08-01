const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db, getSetting, setSetting } = require('../db');
const { verifyLogin, changePassword, requireAuth } = require('../auth');
const xray = require('../xray');

const router = express.Router();

// ---------- auth ----------
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'missing fields' });
  if (!verifyLogin(username, password)) return res.status(401).json({ error: 'invalid credentials' });
  req.session.isAdmin = true;
  req.session.username = username;
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ username: req.session.username });
});

// everything below requires auth
router.use(requireAuth);

router.post('/change-password', (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: 'password too short' });
  changePassword(newPassword);
  res.json({ ok: true });
});

// ---------- dashboard ----------
router.get('/dashboard', (req, res) => {
  const clients = db.prepare('SELECT * FROM clients').all();
  const totalUsed = clients.reduce((s, c) => s + c.downloadBytes + c.uploadBytes, 0);
  const xrayState = xray.getStatus();
  res.json({
    clientCount: clients.length,
    activeCount: clients.filter((c) => c.enabled).length,
    totalUsedBytes: totalUsed,
    xrayStatus: xrayState.status,
    panelTitle: getSetting('panel_title'),
    subDomain: getSetting('sub_domain'),
  });
});

router.get('/xray/logs', (req, res) => {
  res.json(xray.getStatus());
});

router.post('/xray/restart', (req, res) => {
  xray.restart();
  res.json({ ok: true });
});

// ---------- settings ----------
router.get('/settings', (req, res) => {
  res.json({
    panel_title: getSetting('panel_title'),
    ws_path: getSetting('ws_path'),
    inbound_port: getSetting('inbound_port'),
    sub_domain: getSetting('sub_domain'),
  });
});

router.put('/settings', (req, res) => {
  const { panel_title, ws_path, sub_domain } = req.body || {};
  if (panel_title) setSetting('panel_title', panel_title);
  if (ws_path) setSetting('ws_path', ws_path);
  if (sub_domain) setSetting('sub_domain', sub_domain);
  xray.restart();
  res.json({ ok: true });
});

// ---------- clients ----------
router.get('/clients', (req, res) => {
  res.json(db.prepare('SELECT * FROM clients ORDER BY createdAt DESC').all());
});

router.post('/clients', (req, res) => {
  const { remark, totalGB = 0, expireDays = 0 } = req.body || {};
  if (!remark) return res.status(400).json({ error: 'remark required' });

  const subId = uuidv4().replace(/-/g, '');
  const clientUuid = uuidv4();
  const expireAt = expireDays > 0 ? Date.now() + expireDays * 86400000 : 0;

  const info = db
    .prepare(
      `INSERT INTO clients (subId, uuid, remark, totalGB, expireAt, enabled, createdAt)
       VALUES (?, ?, ?, ?, ?, 1, ?)`
    )
    .run(subId, clientUuid, remark, totalGB, expireAt, Date.now());

  xray.restart();
  res.json({ id: info.lastInsertRowid, subId, uuid: clientUuid });
});

router.put('/clients/:id', (req, res) => {
  const { remark, totalGB, expireDays, enabled } = req.body || {};
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client) return res.status(404).json({ error: 'not found' });

  const newExpire =
    expireDays === undefined ? client.expireAt : expireDays > 0 ? Date.now() + expireDays * 86400000 : 0;

  db.prepare(
    `UPDATE clients SET remark = ?, totalGB = ?, expireAt = ?, enabled = ? WHERE id = ?`
  ).run(
    remark ?? client.remark,
    totalGB ?? client.totalGB,
    newExpire,
    enabled === undefined ? client.enabled : enabled ? 1 : 0,
    req.params.id
  );

  xray.restart();
  res.json({ ok: true });
});

router.delete('/clients/:id', (req, res) => {
  db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
  xray.restart();
  res.json({ ok: true });
});

module.exports = router;
