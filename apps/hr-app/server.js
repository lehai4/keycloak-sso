// App Nhân sự — ví dụ KẾT HỢP:
//  - Keycloak chỉ quyết định "được vào app hay không" (role "user" của client hr-app).
//  - Quyền chi tiết (xem phòng ban nào, có được duyệt phép không) nằm trong
//    bảng quyền RIÊNG của app, tra theo mã nhân viên (manv).
import express from 'express';
import { createAuth, requireRole } from '@cty/auth';
import permissions from './permissions.json' with { type: 'json' };

const PORT = 3002;
const app = express();

app.use(createAuth({
  clientId: 'hr-app',
  clientSecret: process.env.CLIENT_SECRET || 'hr-app-secret-demo',
  baseUrl: `http://localhost:${PORT}`,
  sessionSecret: process.env.SESSION_SECRET || 'doi-chuoi-nay-khi-chay-that',
}));

// Quyền thô từ SSO: không có role "user" của hr-app thì không vào được app này
const canEnter = requireRole('user');

// Quyền chi tiết từ bảng quyền nội bộ của app (thực tế là bảng trong DB của app)
const localPerm = (req) => permissions[req.user.manv] || { phongBan: [], duyetPhep: false };

const nhanVien = [
  { manv: 'NV001', ten: 'Nguyễn Văn An', phongBan: 'KHO' },
  { manv: 'NV002', ten: 'Trần Thị Bình', phongBan: 'NHAN_SU' },
  { manv: 'NV003', ten: 'Lê Văn Cường', phongBan: 'KHO' },
  { manv: 'NV004', ten: 'Phạm Thị Dung', phongBan: 'KE_TOAN' },
];

app.get('/', (req, res) => {
  res.send(layout(req, 'Trang chủ', req.user
    ? `<p>Xin chào <b>${esc(req.user.name)}</b> (${esc(req.user.manv)}).</p>
       <p>Quyền chi tiết của bạn trong app này (bảng quyền riêng của App Nhân sự):</p>
       <pre>${esc(JSON.stringify(localPerm(req), null, 2))}</pre>`
    : `<p>Bạn chưa đăng nhập.</p><p><a class="btn" href="/auth/login">Đăng nhập bằng SSO</a></p>`));
});

app.get('/nhan-vien', canEnter, (req, res) => {
  const { phongBan } = localPerm(req);
  const list = nhanVien.filter((nv) => phongBan.includes('*') || phongBan.includes(nv.phongBan));
  const rows = list.map((nv) => `<tr><td>${nv.manv}</td><td>${esc(nv.ten)}</td><td>${nv.phongBan}</td></tr>`).join('');
  res.send(layout(req, 'Danh sách nhân viên',
    `<p>Bạn được xem phòng ban: <b>${esc(phongBan.join(', ') || 'không có')}</b></p>
     <table><tr><th>Mã NV</th><th>Họ tên</th><th>Phòng ban</th></tr>${rows || '<tr><td colspan=3>Không có dữ liệu</td></tr>'}</table>`));
});

app.get('/duyet-phep', canEnter, (req, res) => {
  if (!localPerm(req).duyetPhep) {
    return res.status(403).send(layout(req, 'Duyệt phép', '<p>⛔ Bạn không có quyền duyệt phép (theo bảng quyền của App Nhân sự).</p>'));
  }
  res.send(layout(req, 'Duyệt phép', '<p>✅ Bạn có quyền duyệt phép. Danh sách đơn chờ duyệt ở đây...</p>'));
});

function layout(req, title, body) {
  const u = req.user;
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${title} · App Nhân sự</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#1f2937}
  header{display:flex;gap:14px;align-items:center;border-bottom:3px solid #7c3aed;padding-bottom:10px;flex-wrap:wrap}
  header b{color:#7c3aed;font-size:20px} a{color:#7c3aed}
  .who{margin-left:auto;font-size:14px} pre{background:#f5f3ff;padding:12px;border-radius:6px;overflow:auto}
  table{border-collapse:collapse;width:100%} td,th{border:1px solid #cbd5e1;padding:6px 10px;text-align:left}
  .btn{background:#7c3aed;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none}
  .note{background:#f5f3ff;border-left:4px solid #7c3aed;padding:8px 12px;font-size:14px}
</style></head><body>
<header><b>👥 App Nhân sự</b><a href="/">Trang chủ</a><a href="/nhan-vien">Nhân viên</a><a href="/duyet-phep">Duyệt phép</a>
<span class="who">${u ? `${esc(u.manv)} · <a href="/auth/logout">Đăng xuất</a>` : '<a href="/auth/login">Đăng nhập</a>'}</span></header>
<h2>${title}</h2>${body}
<p class="note">Quay lại <a href="http://localhost:3001">App Kho</a> để thấy phiên đăng nhập dùng chung.</p>
</body></html>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

app.listen(PORT, () => console.log(`App Nhân sự: http://localhost:${PORT}`));
