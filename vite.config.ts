import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Vercel veya yerel ortamdaki değişkenleri yükle
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    build: {
      outDir: 'dist',
    },
    define: {
      // process.env nesnesini güvenli bir şekilde oluştur
      'process.env': {
        API_KEY: env.API_KEY || '',
        SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY || ''
      }
    }
  };
});