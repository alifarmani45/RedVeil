const $ = (sel) => document.querySelector(sel);
const $all = (sel) => document.querySelectorAll(sel);
let editingClientId = null;

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2200);
}

function fmtBytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(2)} ${units[i]}`;
}

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (res.status === 401) { window.location.href = '/login.html'; throw new Error('unauthorized'); }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'request failed');
  return res.json();
}

// ---------- navigation (unifies sidebar + bottom nav, both share .nav-item) ----------
const views = ['overview', 'clients', 'settings', 'logs'];
const titles = {
  overview: ['نمای کلی', 'وضعیت کلی سرویس'],
  clients: ['کلاینت‌ها', 'مدیریت کاربران و لینک‌های اتصال'],
  settings: ['تنظیمات', 'پیکربندی پنل و دامنه'],
  logs: ['لاگ Xray', 'خروجی زنده هسته پروکسی'],
};

function setActiveView(v) {
  $all('.nav-item').forEach((i) => i.classList.toggle('active', i.dataset.view === v));
  views.forEach((vv) => ($('#view-' + vv).style.display = vv === v ? 'block' : 'none'));
  $('#pageTitle').textContent = titles[v][0];
  $('#pageSub').textContent = titles[v][1];
  $('#pageTitleMobile').textContent = titles[v][0];
  $('#pageSubMobile').textContent = titles[v][1];
  $('#fabAdd').style.display = v === 'clients' ? 'flex' : 'none';

  if (v === 'clients') loadClients();
  if (v === 'settings') loadSettings();
  if (v === 'logs') loadLogs();

  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

$all('.nav-item').forEach((item) => {
  item.addEventListener('click', () => setActiveView(item.dataset.view));
});

$('#fabAdd').addEventListener('click', () => openClientModal(null));
$('#fabAdd').style.display = 'none';

// ---------- overview ----------
function statusPillMarkup(isOn, textOn, textOff) {
  return isOn
    ? `<span class="dot"></span><span>${textOn}</span>`
    : `<span class="dot"></span><span>${textOff}</span>`;
}

async function loadDashboard() {
  try {
    const d = await api('/dashboard');
    $('#statClients').textContent = d.clientCount;
    $('#statActive').textContent = d.activeCount;
    $('#statTraffic').textContent = fmtBytes(d.totalUsedBytes);
    $('#statPort').textContent = d.subDomain;
    $('#panelTitleLbl').textContent = d.panelTitle;
    $('#panelTitleLblMobile').textContent = d.panelTitle;

    const isOn = d.xrayStatus === 'running';
    [$('#xrayStatusPill'), $('#xrayStatusPillMobile')].forEach((pill) => {
      pill.className = 'status-pill ' + (isOn ? 'on' : 'off');
      pill.innerHTML = statusPillMarkup(isOn, 'Xray فعال', 'Xray غیرفعال');
    });
  } catch (e) { /* ignore */ }
}

$('#restartXrayBtn').addEventListener('click', async () => {
  await api('/xray/restart', { method: 'POST' });
  toast('درخواست ری‌استارت ارسال شد');
  setTimeout(loadDashboard, 1200);
});

// ---------- clients (card list) ----------
function clientCard(c) {
  const used = c.downloadBytes + c.uploadBytes;
  const totalBytes = c.totalGB > 0 ? c.totalGB * 1024 ** 3 : 0;
  const pct = totalBytes > 0 ? Math.min((used / totalBytes) * 100, 100) : 6;
  const expireLabel = c.expireAt === 0 ? 'نامحدود' : new Date(c.expireAt).toLocaleDateString('fa-IR');
  const subLink = `${window.location.origin}/sub/${c.subId}`;

  const div = document.createElement('div');
  div.className = 'client-card';
  div.innerHTML = `
    <div class="client-top">
      <div class="client-id">
        <div class="client-name">
          ${c.remark}
          <span class="tag ${c.enabled ? 'live' : 'off'}">${c.enabled ? 'فعال' : 'غیرفعال'}</span>
        </div>
        <a href="/sub/${c.subId}" target="_blank" class="client-link mono">${subLink}</a>
      </div>
      <div class="client-actions">
        <div class="icon-btn" title="کپی لینک ساب" data-copy="${subLink}">
          <svg viewBox="0 0 24 24" fill="none"><path d="M8 8V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-3" stroke="currentColor" stroke-width="2"/><rect x="3" y="8" width="12" height="13" rx="2" stroke="currentColor" stroke-width="2"/></svg>
        </div>
        <div class="icon-btn" title="ویرایش" data-edit="${c.id}" data-remark="${c.remark}" data-totalgb="${c.totalGB}">
          <svg viewBox="0 0 24 24" fill="none"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" stroke-width="2"/></svg>
        </div>
        <div class="icon-btn" title="حذف" data-del="${c.id}">
          <svg viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="2"/></svg>
        </div>
      </div>
    </div>
    <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
    <div class="client-meta">
      <span class="mono">${fmtBytes(used)}${c.totalGB > 0 ? ' / ' + c.totalGB + ' GB' : ' / نامحدود'}</span>
      <span>·</span>
      <span>انقضا: ${expireLabel}</span>
    </div>`;
  return div;
}

async function loadClients() {
  const list = $('#clientsList');
  list.innerHTML = `<div class="skel" style="height:86px;"></div><div class="skel" style="height:86px;"></div>`;

  const clients = await api('/clients');
  list.innerHTML = '';
  $('#clientsEmpty').style.display = clients.length ? 'none' : 'block';

  clients.forEach((c) => list.appendChild(clientCard(c)));

  list.querySelectorAll('[data-copy]').forEach((el) =>
    el.addEventListener('click', () => {
      navigator.clipboard.writeText(el.dataset.copy);
      toast('لینک کپی شد');
    })
  );
  list.querySelectorAll('[data-del]').forEach((el) =>
    el.addEventListener('click', async () => {
      if (!confirm('این کلاینت حذف شود؟')) return;
      await api('/clients/' + el.dataset.del, { method: 'DELETE' });
      toast('کلاینت حذف شد');
      loadClients();
      loadDashboard();
    })
  );
  list.querySelectorAll('[data-edit]').forEach((el) =>
    el.addEventListener('click', () => openClientModal(el.dataset))
  );
}

function openClientModal(data) {
  editingClientId = data ? data.edit : null;
  $('#clientModalTitle').textContent = editingClientId ? 'ویرایش کلاینت' : 'کلاینت جدید';
  $('#cRemark').value = data ? data.remark : '';
  $('#cTotalGB').value = data ? data.totalgb : 0;
  $('#cExpireDays').value = 0;
  $('#clientModal').classList.add('open');
  setTimeout(() => $('#cRemark').focus(), 150);
}
function closeClientModal() { $('#clientModal').classList.remove('open'); }

$('#addClientBtn').addEventListener('click', () => openClientModal(null));
$('#cancelClientBtn').addEventListener('click', closeClientModal);
$('#clientModal').addEventListener('click', (e) => { if (e.target.id === 'clientModal') closeClientModal(); });

$('#saveClientBtn').addEventListener('click', async () => {
  const remark = $('#cRemark').value.trim();
  if (!remark) return toast('نام کلاینت را وارد کنید');
  const totalGB = parseFloat($('#cTotalGB').value) || 0;
  const expireDays = parseInt($('#cExpireDays').value) || 0;

  if (editingClientId) {
    await api('/clients/' + editingClientId, {
      method: 'PUT',
      body: JSON.stringify({ remark, totalGB, expireDays: expireDays || undefined }),
    });
  } else {
    await api('/clients', { method: 'POST', body: JSON.stringify({ remark, totalGB, expireDays }) });
  }
  closeClientModal();
  toast('ذخیره شد');
  loadClients();
  loadDashboard();
});

// ---------- settings ----------
async function loadSettings() {
  const s = await api('/settings');
  $('#setTitle').value = s.panel_title;
  $('#setDomain').value = s.sub_domain;
  $('#setWsPath').value = s.ws_path;
}
$('#saveSettingsBtn').addEventListener('click', async () => {
  await api('/settings', {
    method: 'PUT',
    body: JSON.stringify({
      panel_title: $('#setTitle').value,
      sub_domain: $('#setDomain').value,
      ws_path: $('#setWsPath').value,
    }),
  });
  toast('تنظیمات ذخیره شد');
  loadDashboard();
});
$('#changePassBtn').addEventListener('click', async () => {
  const p = $('#newPassword').value;
  if (!p || p.length < 4) return toast('رمز باید حداقل ۴ کاراکتر باشد');
  await api('/change-password', { method: 'POST', body: JSON.stringify({ newPassword: p }) });
  $('#newPassword').value = '';
  toast('رمز عبور تغییر کرد');
});

// ---------- logs ----------
async function loadLogs() {
  $('#logsBox').textContent = 'در حال بارگذاری...';
  const d = await api('/xray/logs');
  $('#logsBox').textContent = d.logs.join('\n') || 'لاگی موجود نیست.';
}
$('#refreshLogsBtn').addEventListener('click', loadLogs);

// ---------- logout ----------
$('#logoutBtn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

// ---------- init ----------
loadDashboard();
setInterval(loadDashboard, 10000);
