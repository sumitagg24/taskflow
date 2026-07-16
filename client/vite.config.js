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
        manualChunks: {
          // Separate React core from everything else
          'vendor-react': ['react', 'react-dom'],
          // Framer-motion is large — keep it separate
          'vendor-motion': ['framer-motion'],
          // Lucide icons — most pages use it
          'vendor-icons': ['lucide-react'],
          // Axios for API layer
          'vendor-axios': ['axios'],
        },
      },
    },
  },
});
