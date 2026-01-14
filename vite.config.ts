import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
  // process.env kullanımı için tanımlama (mevcut kod yapısını bozmamak için)
  define: {
    'process.env': {}
  }
});