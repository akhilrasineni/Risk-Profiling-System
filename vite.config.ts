import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(
        ([
          process.env.GEMINI_API_KEY,
          process.env.GOOGLE_API_KEY,
          process.env.GEMINI_KEY,
          env.GEMINI_API_KEY,
          env.GOOGLE_API_KEY,
          env.GEMINI_KEY
        ].find(k => k && typeof k === 'string' && !k.includes('MY_') && !k.includes('YOUR_') && k !== 'placeholder') || '').trim()
      ),
      'process.env.GROQ_API_KEY': JSON.stringify(
        ([
          process.env.GROQ_API_KEY,
          env.GROQ_API_KEY
        ].find(k => k && typeof k === 'string' && !k.includes('MY_') && !k.includes('YOUR_') && k !== 'placeholder') || '').trim()
      ),
      'process.env.SUPABASE_URL': JSON.stringify(
        ([
          process.env.SUPABASE_URL,
          env.SUPABASE_URL
        ].find(k => k && typeof k === 'string' && !k.includes('MY_') && !k.includes('YOUR_') && k !== 'placeholder') || '').trim()
      ),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(
        ([
          process.env.SUPABASE_ANON_KEY,
          env.SUPABASE_ANON_KEY
        ].find(k => k && typeof k === 'string' && !k.includes('MY_') && !k.includes('YOUR_') && k !== 'placeholder') || '').trim()
      ),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
