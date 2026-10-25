import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Generated or reference-only trees are out of scope for linting.
  {
    ignores: ['dist/**', 'functions/lib/**', 'legacy/**', 'node_modules/**', 'ml/**'],
  },
  // Browser application code (React SPA).
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'warn',
      // The demo/live repository sync pattern intentionally sets fixture
      // state inside effects on mode changes; keep the strict v7 rule
      // visible but non-blocking.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  // Trusted backend + emulator harness: Node globals, same TS rules.
  {
    files: ['functions/src/**/*.ts', 'emulator/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
  },
  // TypeScript build/tooling configs.
  {
    files: ['*.config.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
  },
  // Maintenance scripts (plain JS).
  {
    files: ['scripts/**/*.mjs', '*.config.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
  },
);
