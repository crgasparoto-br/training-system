import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const apiPort = process.env.API_PORT || '3002';
const apiTarget = process.env.VITE_API_URL || `http://localhost:${apiPort}`;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@corrida/types': path.resolve(__dirname, '../../packages/types'),
      '@corrida/utils': path.resolve(__dirname, '../../packages/utils'),
    },
  },
  server: {
    port: 5200,
    host: true,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/uploads': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
