# Dependency versions

Verified against npm registry metadata on 2026-09-13. Node 24.21.0 LTS is pinned in .nvmrc/.node-version. The npm lockfile is authoritative for transitive versions.

| Package | Version | Use |
| --- | --- | --- |
| @eslint/js | 10.0.1 | Development / validation |
| @fontsource/inter | 5.3.0 | Application / worker |
| @hookform/resolvers | 5.9.1 | Application / worker |
| @next/eslint-plugin-next | 16.3.5 | Development / validation |
| @playwright/test | 1.63.0 | Development / validation |
| @radix-ui/react-slot | 1.3.3 | Application / worker |
| @supabase/ssr | 0.12.7 | Application / worker |
| @supabase/supabase-js | 2.116.0 | Application / worker |
| @tailwindcss/postcss | 4.3.3 | Development / validation |
| @types/node | 24.13.4 | Development / validation |
| @types/pg | 8.23.1 | Development / validation |
| @types/qrcode | 1.5.6 | Development / validation |
| @types/react | 19.3.0 | Development / validation |
| @types/react-dom | 19.3.0 | Development / validation |
| @zxing/browser | 0.2.1 | Application / worker |
| clsx | 2.1.1 | Application / worker |
| embedded-postgres | 18.4.0-beta.17 | Development / validation |
| eslint | 10.10.0 | Development / validation |
| firebase | 12.19.0 | Application / worker |
| firebase-admin | 14.4.0 | Application / worker |
| libphonenumber-js | 1.13.13 | Application / worker |
| lucide-react | 1.45.0 | Application / worker |
| next | 16.3.5 | Application / worker |
| pg | 8.23.0 | Application / worker |
| pg-boss | 12.31.0 | Application / worker |
| qrcode | 1.5.4 | Application / worker |
| react | 19.3.0 | Application / worker |
| react-dom | 19.3.0 | Application / worker |
| react-hook-form | 7.88.0 | Application / worker |
| recharts | 3.10.1 | Application / worker |
| sharp | 0.35.4 | Application / worker |
| supabase | 2.117.0 | Development / validation |
| tailwind-merge | 3.7.0 | Application / worker |
| tailwindcss | 4.3.3 | Development / validation |
| tsx | 4.23.13 | Development / validation |
| typescript | 6.0.3 | Development / validation |
| typescript-eslint | 8.70.0 | Development / validation |
| vitest | 5.0.0 | Development / validation |
| zod | 4.6.4 | Application / worker |

TypeScript 7.0.2 was the registry latest, but typescript-eslint 8.70.0 requires TypeScript <6.1.0. Selected stable 6.0.3. The current eslint-config-next preset depends on older React/import/accessibility plugins whose peers exclude ESLint 10. Use supported ESLint 10.10.0, typescript-eslint 8.70.0 and the official Next.js plugin directly. No legacy-peer-deps setting is enabled. Dependency tree verification must pass without invalid peers. Accessibility browser checks remain separately required.

The development-only embedded-postgres launcher has no stable releases. Its pinned beta wrapper supplies real PostgreSQL 18.4 on Windows without Docker; production does not depend on it. Full Supabase/PostgreSQL 17 validation remains pending. See development-runbook.md for the narrow exception.

Inter is self-hosted from @fontsource/inter under SIL Open Font License 1.1 (license included in the installed package). All direct versions are exact and production dependency vulnerabilities were checked with npm audit. A clean scan is not a complete application security audit.

References: [Node release status](https://nodejs.org/en/about/previous-releases), [Next.js PWA guidance](https://nextjs.org/docs/app/guides/progressive-web-apps), [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [pg-boss](https://github.com/timgit/pg-boss), [embedded PostgreSQL](https://github.com/leinelissen/embedded-postgres). Package registry metadata is available at https://registry.npmjs.org/<package>/<version>.
