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
      // Edge Functions は Deno ランタイム(jsr: 指定・Deno グローバル)。
      // ローカルに Deno が無いためマイグレーションと同じく目視レビュー。
      'supabase/functions',
      // Capacitor ネイティブプロジェクト(spec-5-1)。ネイティブコード本体に加え、
      // `npx cap sync` が dist/ をそのままコピーする public/ 配下も対象外にする。
      'ios',
      'android',
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
    // 論理削除の除外は selectActive(src/data/soft-delete.ts)に一本化する
    // (epics.md 1.4 AC3。書き忘れ防止)。読み取りに .is('deleted_at', null) を
    // 直書きしない ── 唯一の例外がヘルパ本体。
    files: ['src/data/**/*.ts'],
    ignores: ['src/data/soft-delete.ts', 'src/data/**/*.{test,spec}.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name='is'][arguments.0.value='deleted_at']",
          message:
            "読み取りは selectActive('table', columns) を使う。.is('deleted_at', null) を直書きしない(src/data/soft-delete.ts)。",
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
  {
    // ビルド補助スクリプト(Node、ESM)。
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
);
