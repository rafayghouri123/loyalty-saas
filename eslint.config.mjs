import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';
export default defineConfig([
  { files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts', '*.config.ts'], extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: { '@next/next': nextPlugin }, rules: { ...nextPlugin.configs.recommended.rules, ...nextPlugin.configs['core-web-vitals'].rules } },
  globalIgnores(['.next/**', '.tools/**', '.local/**', 'dist/**', 'next-env.d.ts', 'public/sw.js']),
]);
