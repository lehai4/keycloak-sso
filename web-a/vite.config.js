import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3011,
    strictPort: true, // cổng phải khớp redirect URI đã đăng ký với SSO
  },
  resolve: {
    // Gói @cty/auth-react được link từ thư mục khác: ép dùng chung 1 bản React / oidc-client-ts
    dedupe: ['react', 'react-dom', 'oidc-client-ts'],
  },
});
