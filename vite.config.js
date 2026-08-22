import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    open: true,
    proxy: {
      // Proxy WebSocket connections to the backend server during dev
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
      // Proxy REST API calls
      '/health': {
        target: 'http://localhost:3001',
      },
    },
  },
});
