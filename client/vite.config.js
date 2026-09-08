import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
  preview: {
    port: 3000,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        // Function form: pin vendor packages into their own buckets and split
        // the eagerly-loaded app shell so no single chunk crosses the 500 kB
        // warning threshold. Packages not matched here (e.g. auth0-spa-js)
        // keep Rollup's default placement.
        manualChunks(id) {
          if (!id.includes('/node_modules/')) {
            // Shared, eagerly-imported app code: the UI kit is used by every
            // page, so pulling it out of `index` shrinks the shell chunk and
            // lets it be cached/fetched in parallel.
            if (/[\\/]src[\\/]components[\\/]ui[\\/]/.test(id)) return 'app-ui';
            return undefined;
          }
          const buckets = {
            // React core (scheduler is react-dom's engine)
            'vendor-react': ['react', 'react-dom', 'scheduler'],
            // Router is eager (App shell) and ~100 kB+ — own bucket
            'vendor-router': ['react-router-dom'],
            // Framer-motion is large — keep it separate
            'vendor-motion': ['framer-motion'],
            // Lucide icons — most pages use it
            'vendor-icons': ['lucide-react'],
            // Axios for API layer
            'vendor-axios': ['axios'],
            // Realtime client loads with the notification shell, not first paint
            'vendor-socket': ['socket.io-client'],
          };
          for (const [chunk, pkgs] of Object.entries(buckets)) {
            if (pkgs.some((pkg) => id.includes(`/node_modules/${pkg}/`))) return chunk;
          }
          return undefined;
        },
      },
    },
  },
});
