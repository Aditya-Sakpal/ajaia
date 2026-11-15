import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts so tests don't boot the Cloudflare plugin.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['worker/**/*.test.ts', 'src/**/*.test.ts', 'shared/**/*.test.ts'],
  },
});
