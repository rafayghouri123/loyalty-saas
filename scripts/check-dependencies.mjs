import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const npmCli=process.env.npm_execpath;
if(!npmCli)throw new Error('Run through npm run dependencies:check.');
const result=spawnSync(process.execPath,[npmCli,'ls','--all','--json'],{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
if(result.error)throw new Error(`Dependency inspection could not run: ${result.error.code}`);
if(result.status!==0){console.error('Dependency tree has unresolved problems.');console.error(result.stderr);process.exit(1);}
const tree=JSON.parse(result.stdout);
if(tree.problems?.length)throw new Error(tree.problems.join('\n'));
const manifest=JSON.parse(readFileSync('package.json','utf8'));
const pinned=Object.entries({...manifest.dependencies,...manifest.devDependencies});
if(pinned.some(([,version])=>!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.]+)?$/.test(version)))throw new Error('Direct dependencies must be exact versions.');
let document='# Dependency versions\n\nVerified against npm registry metadata on 2026-09-13. Node 24.21.0 LTS is pinned in .nvmrc/.node-version. The npm lockfile is authoritative for transitive versions.\n\n| Package | Version | Use |\n| --- | --- | --- |\n';
for(const [name,version] of pinned.sort(([a],[b])=>a.localeCompare(b)))document+=`| ${name} | ${version} | ${manifest.dependencies[name]?'Application / worker':'Development / validation'} |\n`;
document+='\nTypeScript 7.0.2 was the registry latest, but typescript-eslint 8.70.0 requires TypeScript <6.1.0. Selected stable 6.0.3. The current eslint-config-next preset depends on older React/import/accessibility plugins whose peers exclude ESLint 10. Use supported ESLint 10.10.0, typescript-eslint 8.70.0 and the official Next.js plugin directly. No legacy-peer-deps setting is enabled. Dependency tree verification must pass without invalid peers. Accessibility browser checks remain separately required.\n\nThe development-only embedded-postgres launcher has no stable releases. Its pinned beta wrapper supplies real PostgreSQL 18.4 on Windows without Docker; production does not depend on it. Full Supabase/PostgreSQL 17 validation remains pending. See development-runbook.md for the narrow exception.\n\nInter is self-hosted from @fontsource/inter under SIL Open Font License 1.1 (license included in the installed package). All direct versions are exact and production dependency vulnerabilities were checked with npm audit. A clean scan is not a complete application security audit.\n\nReferences: [Node release status](https://nodejs.org/en/about/previous-releases), [Next.js PWA guidance](https://nextjs.org/docs/app/guides/progressive-web-apps), [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [pg-boss](https://github.com/timgit/pg-boss), [embedded PostgreSQL](https://github.com/leinelissen/embedded-postgres). Package registry metadata is available at https://registry.npmjs.org/<package>/<version>.\n';
writeFileSync('docs/dependency-versions.md',document);
console.log(`${pinned.length} exact direct dependencies; full dependency tree has no invalid peers.`);
