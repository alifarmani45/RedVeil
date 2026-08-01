const $ = (sel) => document.querySelector(sel);
let editingClientId = null;

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
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

// ---------- navigation ----------
const views = ['overview', 'clients', 'settings', 'logs'];
const titles = {
  overview: ['نمای کلی', 'وضعیت کلی سرویس'],
  clients: ['کلاینت‌ها', 'مدیریت کاربران و لینک‌های اتصال'],
  settings: ['تنظیمات', 'پیکربندی پنل و دامنه'],
  logs: ['لاگ Xray', 'خروجی زنده هسته پروکسی'],
};
document.querySelectorAll('.nav-item').forEach((item) => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((i) => i.classList.remove('active'));
    item.classList.add('active');
    const v = item.dataset.view;
    views.forEach((vv) => ($('#view-' + vv).style.display = vv === v ? 'block' : 'none'));
    $('#pageTitle').textContent = titles[v][0];
    $('#pageSub').textContent = titles[v][1];
    if (v === 'clients') loadClients();
    if (v === 'settings') loadSettings();
    if (v === 'logs') loadLogs();
  });
});

// ---------- overview ----------
async function loadDashboard() {
  try {
    const d = await api('/dashboard');
    $('#statClients').textContent = d.clientCount;
    $('#statActive').textContent = d.activeCount;
    $('#statTraffic').textContent = fmtBytes(d.totalUsedBytes);
    $('#statPort').textContent = d.subDomain;
    $('#panelTitleLbl').textContent = d.panelTitle;

    const pill = $('#xrayStatusPill');
    if (d.xrayStatus === 'running') {
      pill.className = 'status-pill on';
      pill.innerHTML = '<span class="dot"></span><span>Xray فعال</span>';
    } else {
      pill.className = 'status-pill off';
      pill.innerHTML = '<span class="dot"></span><span>Xray غیرفعال</span>';
    }
  } catch (e) { /* ignore */ }
}

$('#restartXrayBtn').addEventListener('click', async () => {
  await api('/xray/restart', { method: 'POST' });
  toast('درخواست ری‌استارت ارسال شد');
  setTimeout(loadDashboard, 1200);
});

// ---------- clients ----------
async function loadClients() {
  const clients = await api('/clients');
  const tbody = $('#clientsTbody');
  tbody.innerHTML = '';
  $('#clientsEmpty').style.display = clients.length ? 'none' : 'block';

  clients.forEach((c) => {
    const used = c.downloadBytes + c.uploadBytes;
    const expireLabel = c.expireAt === 0 ? 'نامحدود' : new Date(c.expireAt).toLocaleDateString('fa-IR');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div style="font-weight:600;">${c.remark}</div>
        <a href="/sub/${c.subId}" target="_blank" class="mono" style="font-size:11px;color:var(--mute);">/sub/${c.subId.slice(0,10)}…</a>
      </td>
      <td class="mono">${fmtBytes(used)} ${c.totalGB > 0 ? '/ ' + c.totalGB + ' GB' : ''}</td>
      <td>${expireLabel}</td>
      <td><span class="tag ${c.enabled ? '' : 'off'}">${c.enabled ? 'فعال' : 'غیرفعال'}</span></td>
      <td>
        <div class="row-actions">
          <div class="icon-btn" title="کپی لینک ساب" data-copy="${window.location.origin}/sub/${c.subId}">
            <svg viewBox="0 0 24 24" fill="none"><path d="M8 8V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-3" stroke="currentColor" stroke-width="2"/><rect x="3" y="8" width="12" height="13" rx="2" stroke="currentColor" stroke-width="2"/></svg>
          </div>
          <div class="icon-btn" title="ویرایش" data-edit="${c.id}" data-remark="${c.remark}" data-totalgb="${c.totalGB}" data-enabled="${c.enabled}">
            <svg viewBox="0 0 24 24" fill="none"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" stroke-width="2"/></svg>
          </div>
          <div class="icon-btn" title="حذف" data-del="${c.id}">
            <svg viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="2"/></svg>
          </div>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-copy]').forEach((el) =>
    el.addEventListener('click', () => {
      navigator.clipboard.writeText(el.dataset.copy);
      toast('لینک کپی شد');
    })
  );
  tbody.querySelectorAll('[data-del]').forEach((el) =>
    el.addEventListener('click', async () => {
      if (!confirm('این کلاینت حذف شود؟')) return;
      await api('/clients/' + el.dataset.del, { method: 'DELETE' });
      toast('کلاینت حذف شد');
      loadClients();
      loadDashboard();
    })
  );
  tbody.querySelectorAll('[data-edit]').forEach((el) =>
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
}
function closeClientModal() { $('#clientModal').classList.remove('open'); }

$('#addClientBtn').addEventListener('click', () => openClientModal(null));
$('#cancelClientBtn').addEventListener('click', closeClientModal);

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
