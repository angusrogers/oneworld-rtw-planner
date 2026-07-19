import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Relative base so the build works under a sub-path (GitHub project Pages
  // serves at /<repo-name>/); routing is hash-based so this is safe.
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@rtw/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
      '@rtw/rules-engine': fileURLToPath(
        new URL('../../packages/rules-engine/src/index.ts', import.meta.url),
      ),
    },
  },
});
