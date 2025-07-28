import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    clearMocks: true,
    coverage: {
      enabled: true,
      reporter: ['text', 'json', 'html', 'lcov'],
    },
    include: ['**/*.test.ts'],
    typecheck: {
      include: ['**/*.test.ts'],
    },
  },
});
