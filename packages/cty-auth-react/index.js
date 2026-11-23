// @cty/auth-react — gói đăng nhập SSO dùng chung cho mọi web React (chạy ở trình duyệt).
//
// Dự án mới chỉ cần:
//   <AuthProvider clientId="ten-app"> <App/> </AuthProvider>
//   const { user, login, logout } = useAuth();
//   <RequireLogin> trang cần đăng nhập </RequireLogin>
//
// Gói này lo: chuyển sang trang SSO, PKCE + state, nhận kết quả ở /auth/callback,
// tự làm mới token, đăng xuất (riêng web này hoặc mọi nơi), trả về thông tin nhân viên.
// Không cần backend: web đăng ký với SSO dạng "public client" (không có client secret).

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { UserManager, WebStorageStateStore } from 'oidc-client-ts';

const DEFAULT_ISSUER = 'http://localhost:8080/realms/cty';
const CALLBACK_PATH = '/auth/callback';

const AuthContext = createContext(null);

// Chặn xử lý callback 2 lần (React StrictMode chạy useEffect 2 lần khi dev)
let callbackPromise = null;

export function AuthProvider({ clientId, issuer = DEFAULT_ISSUER, children }) {
  const manager = useMemo(() => new UserManager({
    authority: issuer,
    client_id: clientId,
    redirect_uri: window.location.origin + CALLBACK_PATH,
    post_logout_redirect_uri: window.location.origin + '/',
    response_type: 'code', // Authorization Code + PKCE (thư viện tự tạo PKCE)
    scope: 'openid profile email',
    // Token chỉ sống trong tab hiện tại (đóng tab là mất), an toàn hơn localStorage
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    automaticSilentRenew: true, // tự làm mới token bằng refresh token trước khi hết hạn
  }), [clientId, issuer]);

  const [oidcUser, setOidcUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        if (window.location.pathname === CALLBACK_PATH) {
          // Vừa từ trang SSO quay về: đổi "code" lấy token
          callbackPromise ??= manager.signinRedirectCallback();
          const u = await callbackPromise;
          callbackPromise = null;
          if (!cancelled) setOidcUser(u);
          const returnTo = safeReturnTo(u?.state?.returnTo);
          window.history.replaceState(null, '', returnTo);
          window.dispatchEvent(new PopStateEvent('popstate')); // báo cho react-router đổi trang
        } else {
          const u = await manager.getUser();
          if (!cancelled) setOidcUser(u && !u.expired ? u : null);
        }
      } catch (e) {
        if (!cancelled) setError(e);
        window.history.replaceState(null, '', '/');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    init();

    // Đồng bộ trạng thái khi token được làm mới / bị xóa / làm mới thất bại
    const onLoaded = (u) => setOidcUser(u);
    const onUnloaded = () => setOidcUser(null);
    const onRenewError = async () => {
      // Phiên SSO đã hết (vd: có nơi bấm "Đăng xuất mọi nơi") => web này cũng thoát
      await manager.removeUser();
      setOidcUser(null);
    };
    manager.events.addUserLoaded(onLoaded);
    manager.events.addUserUnloaded(onUnloaded);
    manager.events.addSilentRenewError(onRenewError);
    return () => {
      cancelled = true;
      manager.events.removeUserLoaded(onLoaded);
      manager.events.removeUserUnloaded(onUnloaded);
      manager.events.removeSilentRenewError(onRenewError);
    };
  }, [manager]);

  const login = useCallback((returnTo) => {
    const target = safeReturnTo(returnTo ?? window.location.pathname + window.location.search);
    return manager.signinRedirect({ state: { returnTo: target } });
  }, [manager]);

  // Chỉ thoát khỏi web này; phiên SSO còn nguyên => các web khác không bị ảnh hưởng
  const logout = useCallback(async () => {
    await manager.removeUser();
    setOidcUser(null);
  }, [manager]);

  // Thoát khỏi SSO: các web khác sẽ tự thoát ở lần làm mới token kế tiếp
  const logoutEverywhere = useCallback(() => manager.signoutRedirect(), [manager]);

  // Dùng khi gọi API của dự án: header Authorization: Bearer <token>
  const getAccessToken = useCallback(async () => (await manager.getUser())?.access_token ?? null, [manager]);

  const value = useMemo(() => ({
    user: oidcUser ? toUser(oidcUser.profile) : null,
    isLoading,
    error,
    login,
    logout,
    logoutEverywhere,
    getAccessToken,
  }), [oidcUser, isLoading, error, login, logout, logoutEverywhere, getAccessToken]);

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() phải nằm trong <AuthProvider>');
  return ctx;
}

/** Bọc trang cần đăng nhập: chưa đăng nhập thì tự chuyển sang SSO rồi quay lại đúng trang. */
export function RequireLogin({ children, fallback = null }) {
  const { user, isLoading, login } = useAuth();
  useEffect(() => {
    if (!isLoading && !user) login();
  }, [isLoading, user, login]);
  return user ? children : fallback;
}

// Cùng cấu trúc với req.user của gói @cty/auth (bản server)
function toUser(p) {
  return {
    manv: p.manv || String(p.preferred_username || '').toUpperCase(),
    name: [p.family_name, p.given_name].filter(Boolean).join(' ') || p.name,
    email: p.email ?? null,
    idBoPhan: p.id_bo_phan ?? null,
    roles: p.roles || [],
    sub: p.sub,
  };
}

// Chỉ cho quay về đường dẫn nội bộ (chặn open redirect)
function safeReturnTo(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith(CALLBACK_PATH)
    ? value
    : '/';
}
