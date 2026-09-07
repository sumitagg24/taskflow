import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

/**
 * Isolated-E2E Vite config. Mirrors ../vite.config.js (same plugins, same
 * code-splitting) but serves on E2E_CLIENT_PORT (default :5174) and proxies
 * `/api` to the isolated API (default http://localhost:5058).
 *
 * A separate config file — rather than env branches inside vite.config.js —
 * keeps the dev/prod config byte-identical for everyone else. Used only by
 * `npm run dev:e2e` / e2e/run-isolated.cjs; never by dev, build, or preview.
 *
 * NOTE on `__dirname`: Vite bundles config files to CJS before evaluating
 * them, so `__dirname` here is `<repo>/client/e2e` and the `@` alias must
 * resolve one level up (`../src`), unlike vite.config.js (`./src`).
 */
const CLIENT_PORT = Number(process.env.E2E_CLIENT_PORT ?? '5174');
const API_TARGET = process.env.E2E_API_TARGET ?? 'http://localhost:5058';

export default {
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: CLIENT_PORT,
    strictPort: true,
    proxy: {
      '/api': API_TARGET,
    },
  },
  preview: {
    port: CLIENT_PORT,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-motion': ['framer-motion'],
          'vendor-icons': ['lucide-react'],
          'vendor-axios': ['axios'],
          'vendor-socket': ['socket.io-client'],
        },
      },
    },
  },
};
