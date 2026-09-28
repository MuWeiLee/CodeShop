import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 本地开发时把 /api 转发给服务端
    proxy: { '/api': 'http://localhost:3000' },
  },
});
