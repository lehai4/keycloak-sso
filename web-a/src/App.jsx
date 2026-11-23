// Web A: một dự án React ĐỘC LẬP, chạy hoàn toàn ở trình duyệt.
// Không có trang đăng nhập riêng, không đọc mật khẩu: giao hết cho trang SSO chung.
import { useEffect, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { RequireLogin, useAuth } from '@cty/auth-react';

const APP_NAME = 'Web A';
const OTHER = { name: 'Web B', url: 'http://localhost:3012' };

export default function App() {
  const { user, isLoading, error, login, logout, logoutEverywhere } = useAuth();

  return (
    <div className="page">
      <header>
        <b>{APP_NAME}</b>
        <Link to="/">Trang chủ</Link>
        <Link to="/trang-rieng">Trang riêng</Link>
        <span className="who">
          {user ? (
            <>
              {user.manv}
              <button className="link" onClick={logout}>Đăng xuất</button>
              <button className="link muted" onClick={logoutEverywhere}>Đăng xuất mọi nơi</button>
            </>
          ) : (
            !isLoading && <button className="link" onClick={() => login()}>Đăng nhập</button>
          )}
        </span>
      </header>

      {error && <p className="error">Đăng nhập lỗi: {error.message}</p>}

      {isLoading ? (
        <p>Đang kiểm tra đăng nhập...</p>
      ) : (
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/trang-rieng" element={<RequireLogin fallback={<p>Đang chuyển sang trang đăng nhập...</p>}><PrivatePage /></RequireLogin>} />
          <Route path="*" element={<Home />} />
        </Routes>
      )}

      <div className="note">
        Mở <a href={OTHER.url} target="_blank" rel="noreferrer">{OTHER.name}</a> để thử: bấm Đăng nhập ở đó sẽ vào thẳng (SSO).
        <ul>
          <li><b>Đăng xuất</b>: chỉ thoát {APP_NAME}, {OTHER.name} vẫn bình thường.</li>
          <li><b>Đăng xuất mọi nơi</b>: thoát hẳn khỏi SSO, {OTHER.name} sẽ tự thoát trong vòng tối đa 5 phút (lần làm mới token kế tiếp).</li>
        </ul>
      </div>
    </div>
  );
}

function Home() {
  const { user, login } = useAuth();
  const [loginAt] = useLoginTime(user);

  if (!user) {
    return (
      <>
        <p>Bạn chưa đăng nhập {APP_NAME}.</p>
        <button className="btn" onClick={() => login()}>Đăng nhập</button>
      </>
    );
  }
  return (
    <>
      <p>Xin chào <b>{user.name}</b>.</p>
      <table>
        <tbody>
          <tr><th>Mã NV</th><td>{user.manv}</td></tr>
          <tr><th>Họ tên</th><td>{user.name}</td></tr>
          <tr><th>Email</th><td>{user.email || '(chưa có)'}</td></tr>
          <tr><th>Bộ phận (id)</th><td>{user.idBoPhan ?? '(chưa có)'}</td></tr>
          <tr><th>{APP_NAME} nhận phiên lúc</th><td>{loginAt}</td></tr>
        </tbody>
      </table>
      <p><Link to="/trang-rieng">Vào trang cần đăng nhập</Link></p>
    </>
  );
}

function PrivatePage() {
  const { user } = useAuth();
  return (
    <>
      <p>✅ Trang này chỉ người đã đăng nhập mới xem được.</p>
      <p>Dữ liệu SSO trả về cho {APP_NAME} (<code>useAuth().user</code>):</p>
      <pre>{JSON.stringify(user, null, 2)}</pre>
    </>
  );
}

// Ghi lại thời điểm web này nhận phiên (để thấy mỗi web giữ phiên riêng)
function useLoginTime(user) {
  const [loginAt, setLoginAt] = useState(() => sessionStorage.getItem('loginAt'));
  useEffect(() => {
    if (user && !loginAt) {
      const t = new Date().toLocaleString('vi-VN');
      sessionStorage.setItem('loginAt', t);
      setLoginAt(t);
    }
    if (!user && loginAt) {
      sessionStorage.removeItem('loginAt');
      setLoginAt(null);
    }
  }, [user, loginAt]);
  return [loginAt];
}
