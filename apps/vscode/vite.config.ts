import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Builds the webview (React + Tailwind + react-aria) into media/webview with fixed file names,
// so the extension host can point a CSP-locked webview at them.
export default defineConfig({
  root: 'webview',
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../media/webview',
    emptyOutDir: true,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: {
      input: 'webview/main.tsx',
      output: {
        format: 'es',
        entryFileNames: 'inbox.js',
        assetFileNames: (a) =>
          a.names?.[0]?.endsWith('.css') ? 'inbox.css' : 'assets/[name][extname]',
        codeSplitting: false
      }
    }
  }
});
