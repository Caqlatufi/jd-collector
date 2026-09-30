import vue from '@vitejs/plugin-vue';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig({
  base: '/jd-collector/',
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 3002,
    proxy: {
      '/jd-collector/api': {
        target: 'http://127.0.0.1:7890',
        changeOrigin: true,
      },
      '/jd-collector/resume/': {
        target: 'http://127.0.0.1:7890',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-vue': ['vue', 'vue-router', 'pinia'],
          'vendor-element': ['element-plus', '@element-plus/icons-vue'],
          'vendor-http': ['axios', 'dayjs'],
        },
      },
    },
  },
});
