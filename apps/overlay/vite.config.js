import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In production this app is served at https://sidekik.dpdns.org/live/
// (the dashboard owns the root). In local dev it stays at '/' so
// `npm run dev` keeps working the same as before.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? '/live/' : '/',
  server: { port: 5174 },
}));
