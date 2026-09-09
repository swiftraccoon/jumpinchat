import { defineConfig } from 'vitest/config';
import { transform } from 'esbuild';

export default defineConfig({
  plugins: [{
    name: 'client-jsx',
    enforce: 'pre',
    async transform(source, id) {
      if (!id.includes('/react-client/') || !id.endsWith('.js')) return null;
      return transform(source, {
        loader: 'jsx',
        jsx: 'automatic',
        format: 'esm',
        sourcemap: 'inline',
        sourcefile: id,
      });
    },
  }],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['react-client/**/*.spec.js'],
    setupFiles: ['./test/client/setup.js'],
    restoreMocks: true,
    clearMocks: true,
    environmentOptions: { jsdom: { url: 'https://chat.example.test/test-room' } },
  },
});
