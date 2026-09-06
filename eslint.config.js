import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import importPlugin from 'eslint-plugin-import';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'packages/*/dist',
      'node_modules',
      '_bmad',
      '_bmad-output',
      'supabase/.temp',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      import: importPlugin,
    },
    settings: {
      'import/resolver': {
        typescript: { project: './tsconfig.json' },
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // レイヤの逆流を禁止する(ARCHITECTURE-SPINE AD-10)
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './packages/core',
              from: './src',
              message: 'packages/core は葉。src からは import しない。',
            },
            {
              target: './src/data',
              from: './src/features',
              message: 'features から data の内部を直接触らない。公開リポジトリ関数のみ経由。',
              except: ['../data/index.ts'],
            },
            {
              target: './src/ui',
              from: ['./src/data', './src/features'],
              message: 'src/ui は汎用。data / features に依存しない。',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.{test,spec}.{ts,tsx}', 'src/test/**'],
    rules: {
      'import/no-restricted-paths': 'off',
    },
  },
);
