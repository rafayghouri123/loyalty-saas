import { writeFileSync } from 'node:fs';
export async function generateSchemaDiagram(client) {
  const tables = (await client.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows;
  const edges = (await client.query(`select a.relname child,b.relname parent,c.conname from pg_constraint c
    join pg_class a on a.oid=c.conrelid join pg_namespace n on n.oid=a.relnamespace join pg_class b on b.oid=c.confrelid
    where c.contype='f' and n.nspname='public' order by a.relname,b.relname,c.conname`)).rows;
  const lines = ['# Generated database relationships', '', 'Generated from the migrated PostgreSQL catalog. Only implemented tables are shown; pending domain tables remain in schema-checklist.md.', '', '```mermaid', 'erDiagram'];
  for (const { tablename } of tables) {
    const cols = (await client.query(`select a.attname,t.typname from pg_attribute a join pg_type t on t.oid=a.atttypid where a.attrelid=$1::regclass and a.attnum>0 and not a.attisdropped order by a.attnum`, [`public.${tablename}`])).rows;
    lines.push(`  ${tablename} {`, ...cols.map(c => `    ${c.typname.replace(/^_/, '')} ${c.attname}`), '  }');
  }
  for (const edge of edges) lines.push(`  ${edge.parent} ||--o{ ${edge.child} : "${edge.conname}"`);
  lines.push('```', ''); writeFileSync('docs/schema-diagram.md', lines.join('\n'));
}
