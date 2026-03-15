// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import noRawTailwindColors from './eslint-plugins/no-raw-tailwind-colors.js'

// ---------------------------------------------------------------------------
// Design System Enforcement
// ---------------------------------------------------------------------------
// This project uses a design token system built on CSS custom properties
// (see src/index.css). Components should use semantic token classes, NOT raw
// Tailwind palette colors.
//
// ALLOWED (design tokens):
//   text-text-primary, text-text-secondary, text-text-tertiary
//   bg-surface, bg-card, bg-interactive-fill, bg-interactive-hover
//   border-border, border-interactive-focus
//   text-h1, text-h2, text-body, text-label (typography utilities)
//   noise-texture, frosted-glass, scrollbar-hide (custom utilities)
//
// FORBIDDEN (raw Tailwind palette colors):
//   text-red-500, bg-gray-200, border-white, ring-blue-300, etc.
//
// If you need a raw color for a legitimate reason (e.g., bg-black for a
// video player background), add an eslint-disable comment on that line.
// ---------------------------------------------------------------------------

const designSystemPlugin = {
  rules: {
    'no-raw-tailwind-colors': noRawTailwindColors,
  },
}

export default defineConfig([globalIgnores(['dist', 'coverage']), {
  files: ['**/*.{ts,tsx}'],
  extends: [
    js.configs.recommended,
    tseslint.configs.recommended,
    reactHooks.configs['recommended-latest'],
  ],
  plugins: {
    'react-refresh': reactRefresh,
    'design-system': designSystemPlugin,
  },
  languageOptions: {
    ecmaVersion: 2020,
    globals: globals.browser,
  },
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true, allowExportNames: ['badgeVariants', 'buttonVariants', 'useUploadContext'] }],
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    'design-system/no-raw-tailwind-colors': 'warn',
  },
}, ...storybook.configs["flat/recommended"]])
