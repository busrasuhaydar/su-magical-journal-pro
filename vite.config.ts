import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ base: process.env.GH_PAGES ? `/${process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'su-magical-journal-pro'}/` : '/', plugins: [react()], server: { port: 5175, strictPort: true } });
