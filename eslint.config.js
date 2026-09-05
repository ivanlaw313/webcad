import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Keep the quality gate on authored TypeScript only.  CAD kernels, captures,
  // generated artifacts and dependency trees can be very large and must never
  // turn `npm run lint` into an out-of-memory failure.
  globalIgnores([
    'dist/**', 'node_modules/**', '.git/**', '.claude/**', '.codex-snapshots/**',
    '.tmp-fea/**', '_fusion_captures/**', '_genassets/**', '_occt-build/**',
    '__pycache__/**', 'src-tauri/**', 'design/**', 'public/**',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
])
