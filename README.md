# Demo SSO tập trung: Keycloak + Express

Một trang đăng nhập chung cho mọi dự án. Dự án mới **không phải làm lại phần đăng nhập**, chỉ cần cài gói `@cty/auth` và cấu hình 4 dòng.

```
                 ┌────────────────────────────────┐
                 │ Keycloak  :8080  (realm "cty") │
                 │ username = mã nhân viên        │
                 │ role thô theo từng app         │
                 └───────────────┬────────────────┘
                                 │ OIDC: Authorization Code + PKCE
                ┌────────────────┴────────────────┐
                ▼                                 ▼
      App Kho  :3001                     App Nhân sự  :3002
      quyền = role trong Keycloak        vào app = role Keycloak
      (admin / viewer)                   quyền chi tiết = bảng quyền riêng theo manv
```

## Chạy thử

Cần: Docker Desktop, Node 20+. Không cần cài Java: plugin đọc bảng nhân viên được build bên trong Docker.

```powershell
npm install
docker compose --profile test-db up -d --build   # Keycloak + plugin + bảng nhân viên GIẢ (lần đầu build mất vài phút)
npm run kho                                      # -> http://localhost:3001
npm run hr                                       # -> http://localhost:3002
```

Hai web React độc lập (mỗi web cài thư viện riêng một lần):

```powershell
cd web-a; npm install; npm run dev               # -> http://localhost:3011
```

```powershell
cd web-b; npm install; npm run dev               # -> http://localhost:3012
```

Trang quản trị Keycloak: http://localhost:8080/admin (admin / admin).

## Đăng nhập bằng bảng nhân viên `sync_nhan_vien`

Trang SSO kiểm tra mã NV và mật khẩu **trực tiếp** trong bảng `sync_data_hi_time_sheet.sync_nhan_vien`, đúng như tienich đang làm (cột `ma_nv` + `mat_khau` bcrypt). Việc này do một plugin nhỏ viết cho Keycloak đảm nhận (`keycloak/providers/nhanvien-storage/`):

- Nhân viên dùng **đúng mật khẩu hiện tại**. Đổi mật khẩu bên tienich thì SSO nhận **ngay**, vì mỗi lần đăng nhập đều đọc DB.
- **Không sao chép** mật khẩu sang Keycloak; plugin chỉ chạy lệnh `SELECT`.
- Dữ liệu trả về cho app: `manv` (đúng như trong DB), họ tên, email, `idBoPhan` và `roles` **của riêng app đó**.
  - **Không** gửi cả dòng nhân viên: token chỉ được ký chứ không mã hóa, ai cầm token cũng đọc được. Các cột nhạy cảm (CCCD, số tài khoản, số BHXH, điện thoại, lương...) web nào cần thì gọi API riêng có kiểm tra quyền.
  - Claim `name` theo thứ tự Việt Nam ("Nguyễn Văn An") nhờ mapper `VnFullNameMapper` trong plugin; mapper có sẵn của Keycloak ghép ngược ("An Nguyễn Văn").
  - Mỗi client để `fullScopeAllowed: false` nên token của App Kho không chứa quyền bên App Nhân sự.
- **Người đã nghỉ việc (`isActived = 0`) không đăng nhập được**: trang SSO báo tài khoản đã ngừng hoạt động. Nếu người đó đang mở sẵn web thì bị thoát ở lần làm mới token kế tiếp (tối đa 5 phút). `isActived` để trống (NULL) vẫn cho vào.
- Nhập sai mật khẩu 5 lần liên tiếp thì tài khoản bị tạm khóa vài phút (chống dò mật khẩu).
- Họ tên, email chỉ đọc (sửa ở hệ thống gốc). Role theo từng app vẫn gán được trong trang quản trị Keycloak.
- DB mất kết nối thì đăng nhập báo sai mật khẩu và Keycloak ghi log `sync-nhan-vien: không đọc được DB...`. Các tài khoản cục bộ (nv001...) vẫn đăng nhập được.

**Bảng giả để test** (`--profile test-db`, mật khẩu đều là `Test@123`): `TEST001` (có email), `TEST002` (không email, `isActived` NULL), `90001` (mã toàn số), `TEST009` (đã nghỉ việc, bị chặn).

**Chuyển sang DB thật:**

1. Nhờ người quản trị MySQL tạo tài khoản **chỉ đọc**:
   ```sql
   CREATE USER 'sso_readonly'@'%' IDENTIFIED BY '<mat-khau-manh>';
   GRANT SELECT ON sync_data_hi_time_sheet.sync_nhan_vien TO 'sso_readonly'@'%';
   ```
2. Copy `.env.example` thành `.env` rồi điền `NV_DB_HOST`, `NV_DB_USER`, `NV_DB_PASSWORD`. Nếu MySQL chạy ngay trên máy này thì ghi `host.docker.internal`, không ghi `localhost`.
3. Chạy lại Keycloak, lần này không cần bảng giả:
   ```powershell
   docker compose up -d --force-recreate keycloak
   ```

Keycloak dev lưu dữ liệu ngay trong container, nên mỗi lần tạo lại container thì cấu hình realm được nạp lại từ `keycloak/import/` và các thay đổi làm trên trang quản trị sẽ mất.

## Web A và Web B: hai web React (chạy ở trình duyệt) dùng chung trang đăng nhập

`web-a/` và `web-b/` mô phỏng hai dự án frontend của hai team khác nhau, cùng stack với tienich (React 18 + Vite + react-router). Mỗi dự án có `package.json` riêng, **không có trang đăng nhập và không cần backend**: chỉ bọc app trong `<AuthProvider clientId="...">` của gói `@cty/auth-react`.

```jsx
// main.jsx
<AuthProvider clientId="web-a">
  <BrowserRouter><App /></BrowserRouter>
</AuthProvider>

// Trong component
const { user, login, logout, logoutEverywhere, getAccessToken } = useAuth();
// user = { manv, name, email, idBoPhan, roles, sub }

// Trang cần đăng nhập
<RequireLogin><TrangRieng /></RequireLogin>
```

Trong Keycloak, hai web này đăng ký dạng **public client** (không có secret, vì code chạy ở trình duyệt ai cũng xem được) và bắt buộc PKCE. Token được lưu trong `sessionStorage` (đóng tab là mất) và tự làm mới bằng refresh token.

| Bước | Web A | Web B |
|---|---|---|
| 1. Đăng nhập ở A | Nhập mã NV + mật khẩu | Chưa đăng nhập |
| 2. Bấm Đăng nhập ở B | — | **Vào thẳng, không hỏi mật khẩu** (SSO) |
| 3. Bấm **Đăng xuất** ở A | Thoát | **Vẫn bình thường** |
| 3'. Hoặc bấm **Đăng xuất mọi nơi** ở A | Thoát, phiên SSO bị xóa | Tự thoát ở lần làm mới token kế tiếp (tối đa ~5 phút) |

Hai kiểu đăng xuất khác nhau ở chỗ:
- **Đăng xuất**: chỉ xóa token của web hiện tại, phiên trên SSO vẫn còn. Bấm Đăng nhập lại ở web đó sẽ vào thẳng, không hỏi mật khẩu. Phiên SSO tự hết sau 8 giờ không dùng.
- **Đăng xuất mọi nơi**: xóa phiên SSO, dùng khi người dùng muốn thoát hẳn (ví dụ trên máy dùng chung).

**Gọi API của dự án từ web React:** lấy token bằng `await getAccessToken()` rồi gửi header `Authorization: Bearer <token>`. Phía API (Node) kiểm tra token bằng thư viện `jose` (JWKS của Keycloak); mã NV nằm ở claim `manv`.

**So với App Kho / App Nhân sự** (`apps/`, render từ server, dùng gói `@cty/auth`): kiểu server giữ token phía server, an toàn hơn trước lỗi XSS. Kiểu React giữ token ở trình duyệt nhưng không cần backend riêng cho việc đăng nhập. Cả hai cùng dùng chung trang SSO và trả về cùng cấu trúc `user`.

## Tài khoản mẫu (mật khẩu đều là `Demo@123`)

| Mã NV | Họ tên        | App Kho (role Keycloak) | App Nhân sự: được vào? | App Nhân sự: quyền chi tiết (bảng riêng) |
|-------|---------------|-------------------------|------------------------|------------------------------------------|
| nv001 | Nguyễn Văn An | admin                   | Có                     | Chỉ xem phòng KHO, không duyệt phép      |
| nv002 | Trần Thị Bình | viewer                  | Có                     | Xem tất cả phòng, được duyệt phép        |
| nv003 | Lê Văn Cường  | viewer                  | **Không** (403)        | –                                        |

## Kịch bản demo cho sếp

1. **Đăng nhập một lần:** vào App Kho, bấm Đăng nhập, sang trang Keycloak và đăng nhập `nv001`. Quay về App Kho thấy `req.user` (manv, tên, email, role).
2. **SSO:** mở App Nhân sự, bấm Đăng nhập. App **vào thẳng, không hỏi mật khẩu** vì phiên ở Keycloak đã có.
3. **Quyền khác nhau theo app:** cùng là `nv001`, ở App Kho là `admin` (vào được Nhập kho), ở App Nhân sự chỉ xem phòng KHO và không được duyệt phép.
4. **Đổi người:** đăng xuất rồi đăng nhập `nv002`. App Kho chặn Nhập kho (403), App Nhân sự cho xem tất cả và duyệt phép.
5. **Chặn vào app:** `nv003` vào App Nhân sự bị 403 vì Keycloak không cấp role `user` của hr-app.
6. **Quản trị tập trung:** vào trang admin Keycloak (realm `cty`, mục Users) để khóa tài khoản hoặc đổi role. Mọi app chịu ảnh hưởng ngay ở lần đăng nhập sau.

## Dự án mới tích hợp thế nào?

1. Admin tạo một **client** mới trong Keycloak (vd. `mua-hang-app`), khai báo redirect URI và các role cần thiết.
2. Trong code Node:

```js
import { createAuth, requireLogin, requireRole } from '@cty/auth';

app.use(createAuth({
  clientId: 'mua-hang-app',
  clientSecret: process.env.CLIENT_SECRET,
  baseUrl: 'https://muahang.cty.vn',
  sessionSecret: process.env.SESSION_SECRET,
}));

app.get('/don-hang', requireLogin, handler);          // chỉ cần đăng nhập
app.get('/duyet', requireRole('approver'), handler);  // cần role trong Keycloak
// req.user = { manv, name, email, idBoPhan, roles, sub }
```

Phần quyền phức tạp riêng của dự án thì tự làm trong app, tra theo `req.user.manv`.

## Cấu trúc thư mục

| Đường dẫn | Nội dung |
|---|---|
| `docker-compose.yml` | Chạy Keycloak 26 ở chế độ dev (+ MySQL giả khi dùng `--profile test-db`) |
| `.env.example` | Mẫu cấu hình kết nối bảng nhân viên thật (copy thành `.env`) |
| `keycloak/Dockerfile` | Build plugin rồi đóng gói vào image Keycloak |
| `keycloak/providers/nhanvien-storage/` | **Plugin đọc bảng `sync_nhan_vien`** (Java) |
| `keycloak/test-db/init.sql` | Bảng nhân viên giả để test |
| `keycloak/import/realm-cty.json` | Realm, 4 client (kho, hr: confidential; web-a, web-b: public), role, 3 user mẫu cục bộ |
| `web-a/`, `web-b/` | **Hai web React độc lập** trỏ đăng nhập vào SSO |
| `packages/cty-auth-react/` | **Gói dùng chung cho web React**: `AuthProvider`, `useAuth`, `RequireLogin` |
| `keycloak/themes/cty/` | **Giao diện trang đăng nhập công ty** (xem mục bên dưới) |
| `packages/cty-auth/` | **Gói dùng chung**: login, callback, logout, session, `requireLogin`, `requireRole` |
| `apps/kho-app/` | Ví dụ phân quyền bằng role Keycloak |
| `apps/hr-app/` | Ví dụ kết hợp: Keycloak quyết định được vào app, bảng quyền riêng quyết định chi tiết |

## Đổi giao diện trang đăng nhập

Trang đăng nhập dùng theme riêng `cty`: bên trái là khối thương hiệu, bên phải là form; toàn bộ bằng tiếng Việt và tự co lại trên điện thoại. Mọi trang của hệ thống đăng nhập (đăng nhập, sai mật khẩu, lỗi, đăng xuất, đổi mật khẩu…) đều dùng chung khung này.

| Muốn đổi | Sửa file |
|---|---|
| Tên công ty, slogan, 3 dòng giới thiệu, dòng liên hệ IT, chân trang | `keycloak/themes/cty/login/theme.properties` (các dòng `cty...`) |
| Logo, favicon | Thay `resources/img/logo.png` (vuông, 192px) và `favicon.png` (64px), giữ nguyên tên file |
| Màu sắc, font chữ | Các biến `--cty-...` ở đầu `resources/css/cty.css` |
| Câu chữ (vd. "Mã nhân viên", thông báo lỗi) | `messages/messages_vi.properties` |
| Bố cục trang | `template.ftl` (khung chung) và `footer.ftl` |

Khi chạy bằng `start-dev`, Keycloak không cache theme: sửa xong chỉ cần F5 trình duyệt. Riêng khi sửa `theme.properties` hoặc `messages_vi.properties` thì chạy lại lệnh dưới để Keycloak đọc lại:

```powershell
docker compose restart keycloak
```

## Những gì gói `@cty/auth` đã lo

- Chuẩn OIDC **Authorization Code + PKCE + state**: không có token nào nằm trên URL.
- Token chỉ giữ phía server; trình duyệt chỉ có cookie `httpOnly`, mỗi app một tên cookie riêng.
- Đổi session id sau khi đăng nhập (chống session fixation).
- Chặn open redirect ở tham số `returnTo`.
- Đăng xuất SSO: xóa luôn phiên ở Keycloak. **Chưa có** đăng xuất đồng loạt: app khác đang mở vẫn giữ phiên riêng tới khi hết hạn (xem checklist bên dưới).

## Trước khi đưa lên production

- [ ] Keycloak chạy `start` (không phải `start-dev`), dùng **HTTPS**, DB Postgres, có backup.
- [ ] Đổi mật khẩu admin, client secret, `SESSION_SECRET` (đọc từ biến môi trường).
- [ ] Back-channel logout (nếu cần): Keycloak gọi về từng app để hủy phiên ngay khi user đăng xuất hoặc bị khóa.
- [ ] Session store dùng Redis thay cho MemoryStore mặc định (MemoryStore mất phiên khi restart và không chạy được nhiều instance).
- [ ] Plugin nhân viên: dùng connection pool thay vì mở kết nối mỗi lần, bật cache user.
- [ ] Bật 2FA (OTP) cho các app nhạy cảm, đặt chính sách mật khẩu.
- [ ] Nếu có API riêng cho mobile hoặc SPA: verify access token bằng thư viện `jose` (JWKS).
- [ ] Đưa `@cty/auth` lên npm registry nội bộ (Verdaccio, GitLab/GitHub Packages).
- [ ] Thay logo, tên công ty, màu thương hiệu thật trong theme `cty`.
- [ ] Production: đóng gói theme vào image Keycloak (thêm `COPY themes/cty /opt/keycloak/themes/cty` vào `keycloak/Dockerfile`) thay vì mount thư mục.
