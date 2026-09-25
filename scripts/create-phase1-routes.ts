import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { screens } from '../src/features/screens/catalog.ts';
for (const screen of screens) for (const route of screen.routes) {
  const file = `src/app${route === '/' ? '' : route}/page.tsx`;
  if (existsSync(file)) continue;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `import { RouteShell } from '@/features/screens/route-shell';\nexport const dynamic = 'force-dynamic';\nexport default function Page() { return <RouteShell screenId="${screen.id}" />; }\n`);
}
