// App Kho — ví dụ PHÂN QUYỀN BẰNG ROLE TRONG KEYCLOAK.
// Role "admin" / "viewer" được gán cho từng nhân viên trong Keycloak (client kho-app),
// app chỉ việc kiểm tra req.user.roles.
import express from 'express';
import { createAuth, requireLogin, requireRole } from '@cty/auth';

const PORT = 3001;
const app = express();

// ===== Toàn bộ phần đăng nhập của dự án chỉ có đoạn này =====
app.use(createAuth({
  clientId: 'kho-app',
  clientSecret: process.env.CLIENT_SECRET || 'kho-app-secret-demo',
  baseUrl: `http://localhost:${PORT}`,
  sessionSecret: process.env.SESSION_SECRET || 'doi-chuoi-nay-khi-chay-that',
}));
// ============================================================

const tonKho = [
  { ma: 'VT001', ten: 'Thép cuộn 2mm', sl: 120 },
  { ma: 'VT002', ten: 'Ốc vít M8', sl: 5400 },
  { ma: 'VT003', ten: 'Sơn chống gỉ', sl: 38 },
];

app.get('/', (req, res) => {
  res.send(layout(req, 'Trang chủ', req.user
    ? `<p>Xin chào <b>${esc(req.user.name)}</b> (${esc(req.user.manv)}).</p>
       <p>Dữ liệu SSO trả về cho app này (<code>req.user</code>):</p>
       <pre>${esc(JSON.stringify(req.user, null, 2))}</pre>`
    : `<p>Bạn chưa đăng nhập.</p><p><a class="btn" href="/auth/login">Đăng nhập bằng SSO</a></p>`));
});

app.get('/ton-kho', requireRole('viewer', 'admin'), (req, res) => {
  const rows = tonKho.map((v) => `<tr><td>${v.ma}</td><td>${esc(v.ten)}</td><td>${v.sl}</td></tr>`).join('');
  res.send(layout(req, 'Tồn kho', `<table><tr><th>Mã</th><th>Tên vật tư</th><th>Số lượng</th></tr>${rows}</table>`));
});

app.get('/nhap-kho', requireRole('admin'), (req, res) => {
  res.send(layout(req, 'Nhập kho', `<p>✅ Chỉ role <b>admin</b> mới thấy trang này. Form nhập kho ở đây...</p>`));
});

app.get('/ho-so', requireLogin, (req, res) => {
  res.send(layout(req, 'Hồ sơ', `<pre>${esc(JSON.stringify(req.user, null, 2))}</pre>`));
});

function layout(req, title, body) {
  const u = req.user;
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${title} · App Kho</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#1f2937}
  header{display:flex;gap:14px;align-items:center;border-bottom:3px solid #0e7490;padding-bottom:10px;flex-wrap:wrap}
  header b{color:#0e7490;font-size:20px} a{color:#0e7490}
  .who{margin-left:auto;font-size:14px} pre{background:#f1f5f9;padding:12px;border-radius:6px;overflow:auto}
  table{border-collapse:collapse;width:100%} td,th{border:1px solid #cbd5e1;padding:6px 10px;text-align:left}
  .btn{background:#0e7490;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none}
  .note{background:#ecfeff;border-left:4px solid #0e7490;padding:8px 12px;font-size:14px}
</style></head><body>
<header><b>📦 App Kho</b><a href="/">Trang chủ</a><a href="/ton-kho">Tồn kho</a><a href="/nhap-kho">Nhập kho (admin)</a>
<span class="who">${u ? `${esc(u.manv)} · role: ${esc(u.roles.join(', ') || '—')} · <a href="/auth/logout">Đăng xuất</a>` : '<a href="/auth/login">Đăng nhập</a>'}</span></header>
<h2>${title}</h2>${body}
<p class="note">Thử SSO: sau khi đăng nhập ở đây, mở <a href="http://localhost:3002">App Nhân sự</a> sẽ vào thẳng, không cần nhập lại mật khẩu.</p>
</body></html>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

app.listen(PORT, () => console.log(`App Kho: http://localhost:${PORT}`));
