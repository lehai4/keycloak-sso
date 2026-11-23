// @cty/auth — gói đăng nhập SSO dùng chung cho mọi app Express trong công ty.
//
// Dự án mới chỉ cần:
//   app.use(createAuth({ clientId, clientSecret, baseUrl, sessionSecret }));
//   app.get('/trang-rieng', requireLogin, ...);
//
// Gói này lo: redirect sang Keycloak, PKCE + state, đổi code lấy token,
// lưu phiên phía server (cookie httpOnly), đăng xuất SSO, gắn req.user.
// Phân quyền chi tiết vẫn để mỗi app tự quyết dựa trên req.user.manv / req.user.roles.

import express from 'express';
import session from 'express-session';
import * as oidc from 'openid-client';

const DEFAULT_ISSUER = process.env.SSO_ISSUER || 'http://localhost:8080/realms/cty';

export function createAuth(options) {
  const {
    issuer = DEFAULT_ISSUER,
    clientId,
    clientSecret,
    baseUrl, // vd: http://localhost:3001 (URL công khai của app)
    sessionSecret,
    // Chỉ bật khi dev với Keycloak chạy http. Production phải dùng https.
    allowHttp = issuer.startsWith('http://'),
  } = options;

  if (!clientId || !clientSecret || !baseUrl || !sessionSecret) {
    throw new Error('@cty/auth: thiếu clientId, clientSecret, baseUrl hoặc sessionSecret');
  }

  const redirectUri = new URL('/auth/callback', baseUrl).href;

  // Tải cấu hình OIDC từ Keycloak (lazy + tự thử lại nếu Keycloak chưa sẵn sàng)
  let configPromise;
  const getConfig = () => {
    configPromise ??= oidc
      .discovery(new URL(issuer), clientId, clientSecret, undefined,
        allowHttp ? { execute: [oidc.allowInsecureRequests] } : undefined)
      .catch((err) => { configPromise = undefined; throw err; });
    return configPromise;
  };

  const router = express.Router();

  router.use(session({
    // Mỗi app một tên cookie riêng: các app cùng domain (khác port) không đè phiên nhau
    name: `${clientId}.sid`,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: baseUrl.startsWith('https://') },
  }));

  // Gắn req.user cho mọi request (undefined nếu chưa đăng nhập)
  router.use((req, res, next) => {
    req.user = req.session.user;
    res.locals.user = req.user;
    next();
  });

  router.get('/auth/login', async (req, res, next) => {
    try {
      const config = await getConfig();
      const codeVerifier = oidc.randomPKCECodeVerifier();
      const state = oidc.randomState();
      req.session.oidc = { codeVerifier, state, returnTo: safeReturnTo(req.query.returnTo) };

      const url = oidc.buildAuthorizationUrl(config, {
        redirect_uri: redirectUri,
        scope: 'openid profile email',
        code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
        code_challenge_method: 'S256',
        state,
      });
      res.redirect(url.href);
    } catch (err) { next(err); }
  });

  router.get('/auth/callback', async (req, res, next) => {
    try {
      const pending = req.session.oidc;
      if (!pending) return res.redirect('/auth/login');

      const config = await getConfig();
      const tokens = await oidc.authorizationCodeGrant(
        config,
        new URL(req.originalUrl, baseUrl),
        { pkceCodeVerifier: pending.codeVerifier, expectedState: pending.state },
      );
      const claims = tokens.claims();

      // Đây là "data trả về cho bên gọi": app chỉ cần đọc req.user
      const user = {
        // Mã NV đúng như trong bảng nhân viên (claim "manv"); thiếu thì lấy username
        manv: claims.manv || String(claims.preferred_username).toUpperCase(),
        // Họ tên kiểu Việt: Họ đệm (lastName) + Tên (firstName)
        name: [claims.family_name, claims.given_name].filter(Boolean).join(' ') || claims.name,
        email: claims.email ?? null,
        idBoPhan: claims.id_bo_phan ?? null,
        roles: claims.roles || [], // role của RIÊNG app này (cấu hình trong Keycloak)
        sub: claims.sub,
      };

      // Đổi session id sau khi đăng nhập để chống session fixation
      req.session.regenerate((err) => {
        if (err) return next(err);
        req.session.user = user;
        req.session.idToken = tokens.id_token;
        res.redirect(pending.returnTo);
      });
    } catch (err) { next(err); }
  });

  router.get('/auth/logout', async (req, res, next) => {
    try {
      const idToken = req.session.idToken;
      const config = await getConfig();
      req.session.destroy(() => {
        // Xóa luôn phiên ở Keycloak: lần đăng nhập tới ở BẤT KỲ app nào cũng phải nhập lại mật khẩu.
        // Lưu ý: app khác đang mở vẫn giữ phiên riêng của nó cho tới khi hết hạn,
        // muốn đăng xuất đồng loạt ngay lập tức thì cần thêm back-channel logout.
        const url = oidc.buildEndSessionUrl(config, {
          post_logout_redirect_uri: new URL('/', baseUrl).href,
          ...(idToken ? { id_token_hint: idToken } : { client_id: clientId }),
        });
        res.clearCookie(`${clientId}.sid`);
        res.redirect(url.href);
      });
    } catch (err) { next(err); }
  });

  return router;
}

/** Bắt buộc đăng nhập; chưa đăng nhập thì chuyển sang SSO rồi quay lại đúng trang. */
export function requireLogin(req, res, next) {
  if (req.user) return next();
  res.redirect(`/auth/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
}

/** Bắt buộc có ít nhất một trong các role (role thô cấu hình trong Keycloak). */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return requireLogin(req, res, next);
    if (roles.some((r) => req.user.roles.includes(r))) return next();
    res.status(403).send('403 - Bạn không có quyền truy cập chức năng này');
  };
}

// Chỉ cho quay về đường dẫn nội bộ, chặn open redirect (vd: returnTo=https://trang-xau.com)
function safeReturnTo(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}
