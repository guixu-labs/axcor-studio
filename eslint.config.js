import eslint from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/.vite/**', 'out/**', 'dist/e2e/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/renderer/**/*.{ts,tsx}', 'src/renderer.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    plugins: { '@stylistic': stylistic },
    rules: {
      '@stylistic/max-len': ['error', { code: 120, ignoreUrls: true }],
    },
  },
);
