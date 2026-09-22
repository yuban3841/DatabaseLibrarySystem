import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ClubCue 管理端 — Vite 配置
// 开发端口 5173（项目计划端口分配），/api 反向代理到后端 3001
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/api-docs': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
});
