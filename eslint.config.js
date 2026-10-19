import js from '@eslint/js'
import globals from 'globals'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'public/**']),
  {
    files: ['**/*.js'],
    extends: [
      js.configs.recommended,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
])
