import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Base path matters for GitHub Pages if this app is served from a subpath
// e.g. https://yourdomain.com/dashboard/ -> base: '/dashboard/'
// If using a custom domain at the root, leave base as '/'.
export default defineConfig({
  plugins: [react()],
  base: '/',
});
