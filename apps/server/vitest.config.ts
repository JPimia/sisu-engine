import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      exclude: ['**/types.ts', '**/index.ts', 'vitest.config.ts'],
    },
  },
});
