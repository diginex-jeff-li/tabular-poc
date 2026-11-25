import { defineConfig } from 'vite-plus';

export default defineConfig({
  // Pre-commit (`.vite-hooks/pre-commit` runs `vp staged`).
  staged: {
    '*.{ts,tsx}': ['vp lint', 'vp fmt --check'],
    '*.md': 'pnpm run agents:check',
  },
  fmt: {
    printWidth: 80,
    tabWidth: 2,
    useTabs: false,
    semi: true,
    singleQuote: true,
    trailingComma: 'all',
    sortImports: {
      groups: [
        'value-builtin',
        'value-external',
        'value-internal',
        'value-index',
        'value-sibling',
        'value-parent',
        'type',
      ],
      newlinesBetween: false,
    },
    ignorePatterns: [
      '**/node_modules/',
      '**/public/',
      '**/dist/',
      '**/build/',
      'pnpm-lock.yaml',
      '**/package.json',
      '**/auto-imports.d.ts',
    ],
  },
  lint: {
    plugins: ['typescript', 'unicorn', 'oxc', 'import'],
    categories: {
      correctness: 'error',
    },
    rules: {
      complexity: [
        'warn',
        {
          max: 15,
        },
      ],
      'import/no-cycle': 'error',
      'import/no-dynamic-require': 'error',
      'import/no-commonjs': 'error',
      'vite-plus/prefer-vite-plus-imports': 'error',
    },
    env: {
      builtin: true,
    },
    jsPlugins: [
      {
        name: 'vite-plus',
        specifier: 'vite-plus/oxlint-plugin',
      },
    ],
  },
});
