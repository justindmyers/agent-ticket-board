import { fixupPluginRules } from '@eslint/compat';
import js from '@eslint/js';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      // Written by Claude Code when it loads the plugin: its API declarations for the installed version.
      'apps/claude-plugin/.claude-plugin/types/**',
      '**/dist/**',
      '**/media/webview/**',
      '**/node_modules/**',
      'apps/vscode/test-harness/**',
      '.scratch/**',
      'apps/claude-plugin/hooks/*.gen.ts'
    ]
  },
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    plugins: { 'react-hooks': reactHooks, '@eslint-community/eslint-comments': eslintComments },
    rules: {
      curly: ['error', 'all'],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      ...reactHooks.configs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@eslint-community/eslint-comments/no-restricted-disable': [
        'error',
        'react-hooks/exhaustive-deps'
      ],
      '@eslint-community/eslint-comments/no-unlimited-disable': 'error'
    }
  },
  {
    files: ['**/*.tsx'],
    plugins: { react: fixupPluginRules(react), 'jsx-a11y': fixupPluginRules(jsxA11y) },
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    settings: { react: { version: '19.3' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      'react/prop-types': 'off',
      'react/no-multi-comp': ['error', { ignoreStateless: false }],
      'react/self-closing-comp': 'error',
      'react/jsx-curly-brace-presence': ['error', { props: 'never', children: 'never' }]
    }
  },
  prettierRecommended
);
