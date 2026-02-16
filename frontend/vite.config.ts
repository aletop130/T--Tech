// Vite configuration for development and testing
// Provides path alias resolution for Vitest.

const path = require('path');

/** @type {import('vite').UserConfig} */
module.exports = {
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    // Use globals for Vitest (e.g., describe, it) without imports.
    globals: true,
    // Default environment (node) is sufficient for server‑side rendering tests.
  },
};
