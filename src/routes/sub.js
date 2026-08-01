const express = require('express');
const { db, getSetting } = require('../db');

const router = express.Router();

function buildLink(client, domain, wsPath) {
  const params = new URLSearchParams({
    encryption: 'none',
    security: 'tls',
    sni: domain,
    fp: 'chrome',
    type: 'ws',
    host: domain,
    path: wsPath,
  });
  return `vless://${client.uuid}@${domain}:443?${params.toString()}#${encodeURIComponent(client.remark)}`;
}

function fmtBytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(2)} ${units[i]}`;
}

// raw subscription (base64) — for v2rayNG / Hiddify / NekoBox etc.
router.get('/sub/:subId/raw', (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE subId = ?').get(req.params.subId);
  if (!client) return res.status(404).send('not found');

  const domain = getSetting('sub_domain');
  const wsPath = getSetting('ws_path');
  const link = buildLink(client, domain, wsPath);
  res.type('text/plain').send(Buffer.from(link).toString('base64'));
});

// human-readable red-glass subscription page
router.get('/sub/:subId', (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE subId = ?').get(req.params.subId);
  if (!client) return res.status(404).send('Subscription not found');

  const domain = getSetting('sub_domain');
  const wsPath = getSetting('ws_path');
  const panelTitle = getSetting('panel_title');
  const link = buildLink(client, domain, wsPath);

  const usedBytes = client.downloadBytes + client.uploadBytes;
  const totalBytes = client.totalGB * 1024 ** 3;
  const pct = totalBytes > 0 ? Math.min(usedBytes / totalBytes, 1) : 0.12;
  const expireLabel =
    client.expireAt === 0
      ? 'بدون تاریخ انقضا'
      : client.expireAt < Date.now()
      ? 'منقضی شده'
      : `${Math.ceil((client.expireAt - Date.now()) / 86400000)} روز باقی‌مانده`;

  res.send(`<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>${panelTitle} — اشتراک</title>
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<style>
  :root{
    --ink:#09090C; --glass:rgba(24,17,20,.55); --glass-brd:rgba(255,60,75,.22);
    --crimson:#FF3B4A; --crimson-2:#B4132A; --fog:#F2EEEF; --mute:#9A939C; --live:#3BE0A0;
  }
  *{box-sizing:border-box;margin:0;padding:0;}
  body{
    font-family:'Vazirmatn',sans-serif; min-height:100vh; color:var(--fog);
    padding:30px 16px 60px;
    background:
      radial-gradient(600px 380px at 80% -10%, rgba(255,45,60,.18), transparent 60%),
      radial-gradient(500px 320px at 0% 110%, rgba(180,19,42,.14), transparent 60%),
      var(--ink);
  }
  .mono{font-family:'JetBrains Mono',monospace;}
  .wrap{max-width:460px;margin:0 auto;}
  .glass{
    background:var(--glass); border:1px solid var(--glass-brd); border-radius:20px;
    backdrop-filter:blur(18px); -webkit-backdrop-filter:blur(18px);
  }
  .brand{display:flex;align-items:center;gap:10px;margin-bottom:18px;}
  .brand-mark{
    width:36px;height:36px;border-radius:11px;
    background:linear-gradient(135deg,var(--crimson),var(--crimson-2));
    box-shadow:0 8px 22px -8px rgba(255,45,60,.7);
    display:flex;align-items:center;justify-content:center;
  }
  .brand-title{font-weight:800;font-size:16px;}
  .brand-sub{font-size:11px;color:var(--mute);}
  .ring-card{padding:28px 20px 22px;display:flex;flex-direction:column;align-items:center;gap:6px;margin-bottom:14px;}
  .ring-wrap{position:relative;width:190px;height:190px;margin:6px 0 10px;}
  .ring-wrap svg{width:100%;height:100%;transform:rotate(-90deg);}
  .ring-bg{fill:none;stroke:rgba(255,255,255,.06);stroke-width:10;}
  .ring-fg{fill:none;stroke:url(#g);stroke-width:10;stroke-linecap:round;stroke-dasharray:566;stroke-dashoffset:${566 - 566 * pct};transition:stroke-dashoffset 1s ease;}
  .ring-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;}
  .ring-used{font-size:24px;font-weight:700;}
  .ring-total{font-size:12px;color:var(--mute);margin-top:2px;}
  .remark{font-weight:700;font-size:16px;margin-top:4px;}
  .expire{font-size:12px;color:var(--mute);margin-top:2px;}
  .btn{
    margin-top:16px;width:100%;padding:13px;border-radius:13px;border:1px solid var(--glass-brd);
    background:linear-gradient(135deg,var(--crimson),var(--crimson-2)); color:#fff; font-weight:700;
    font-size:13px;cursor:pointer;
  }
  .stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;}
  .stat{padding:14px;}
  .stat-label{font-size:11px;color:var(--mute);margin-bottom:6px;}
  .stat-value{font-size:14px;font-weight:700;}
  .qr{display:flex;justify-content:center;padding:18px;}
  .qr canvas{border-radius:12px;background:#fff;padding:8px;}
  .footer{text-align:center;color:var(--mute);font-size:11px;margin-top:22px;}
</style>
</head>
<body>
<div class="wrap">
  <div class="brand">
    <div class="brand-mark">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2 4 6v6c0 5 3.5 8.7 8 10 4.5-1.3 8-5 8-10V6l-8-4z" stroke="#fff" stroke-width="2"/></svg>
    </div>
    <div><div class="brand-title">${panelTitle}</div><div class="brand-sub">وضعیت اشتراک شما</div></div>
  </div>

  <div class="glass ring-card">
    <div class="ring-wrap">
      <svg viewBox="0 0 200 200">
        <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FF3B4A"/><stop offset="100%" stop-color="#B4132A"/>
        </linearGradient></defs>
        <circle class="ring-bg" cx="100" cy="100" r="90"/>
        <circle class="ring-fg" cx="100" cy="100" r="90"/>
      </svg>
      <div class="ring-center">
        <div class="ring-used mono">${fmtBytes(usedBytes)}</div>
        <div class="ring-total">از ${client.totalGB > 0 ? client.totalGB + ' GB' : 'نامحدود'}</div>
      </div>
    </div>
    <div class="remark">${client.remark}</div>
    <div class="expire mono">${expireLabel}</div>
    <button class="btn" onclick="copyLink()">کپی لینک اتصال</button>
  </div>

  <div class="stats">
    <div class="glass stat"><div class="stat-label">وضعیت</div><div class="stat-value" style="color:${client.enabled ? 'var(--live)' : '#F0635F'}">${client.enabled ? 'فعال' : 'غیرفعال'}</div></div>
    <div class="glass stat"><div class="stat-label">پروتکل</div><div class="stat-value">VLESS / WS</div></div>
  </div>

  <div class="glass qr" id="qrbox"></div>

  <div class="footer">${panelTitle} · شناسه: <span class="mono">${client.subId.slice(0,8)}</span></div>
</div>
<script>
  const link = ${JSON.stringify(link)};
  new QRCode(document.getElementById('qrbox'), { text: link, width: 190, height: 190, correctLevel: QRCode.CorrectLevel.M });
  function copyLink(){
    navigator.clipboard.writeText(link).then(()=>{
      const b = document.querySelector('.btn');
      const t = b.textContent; b.textContent = 'کپی شد ✓';
      setTimeout(()=> b.textContent = t, 1400);
    });
  }
</script>
</body>
</html>`);
});

module.exports = router;
