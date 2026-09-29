import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';
export default defineConfig([
  { files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts', 'monitoring/vercel/**/*.ts', '*.config.ts'], extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: { '@next/next': nextPlugin }, rules: { ...nextPlugin.configs.recommended.rules, ...nextPlugin.configs['core-web-vitals'].rules } },
  globalIgnores(['src/app/.well-known/workflow/**', 'monitoring/vercel/app/.well-known/workflow/**', 'monitoring/vercel/.next/**', 'monitoring/vercel/shared/**', 'monitoring/vercel/next-env.d.ts', '.next/**', '.tools/**', '.local/**', 'dist/**', 'test-results/**', 'playwright-report/**', 'coverage/**', 'next-env.d.ts', 'public/sw.js']),
]);
