import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    alias: {
      homey: path.resolve(__dirname, 'test/mocks/homey.ts'),
    },
    coverage: {
      provider: 'v8',
      include: ['app.ts', 'lib/**/*.ts', 'drivers/**/*.ts'],
      reporter: ['text', 'html'],
      // Keep a little headroom below the current level (100% lines, ~97% branches)
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 100,
        lines: 95,
      },
    },
  },
});
