import { writeFileSync } from 'node:fs';

const scalar=(name)=>({uuid:'string',text:'string',varchar:'string',timestamptz:'string',timestamp:'string',date:'string',time:'string',bool:'boolean',int2:'number',int4:'number',int8:'number',numeric:'number',json:'Json',jsonb:'Json',void:'undefined'})[name]??'unknown';
export async function generateDbTypes(client){
  const {rows:tables}=await client.query("select tablename from pg_tables where schemaname='public' order by tablename");
  let source='// Generated from the migrated PostgreSQL catalog. Do not hand-edit.\n// Bigint table reads require decimal-string RPC projections for product money/units.\nexport type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];\nexport type Database = { public: { Tables: {\n';
  for(const table of tables){
    const {rows:columns}=await client.query(`select a.attname as name,t.typname as type,not a.attnotnull as nullable,
      (d.adbin is not null) as has_default from pg_attribute a join pg_type t on t.oid=a.atttypid
      left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where a.attrelid=$1::regclass and a.attnum>0 and not a.attisdropped order by a.attnum`,[`public.${table.tablename}`]);
    source+=`${JSON.stringify(table.tablename)}: {\n`;
    for(const kind of ['Row','Insert','Update']){
      source+=`${kind}: {\n`;
      for(const col of columns)source+=`${JSON.stringify(col.name)}${kind==='Update'||kind==='Insert'&&(col.nullable||col.has_default)?'?':''}: ${scalar(col.type)}${col.nullable?' | null':''};\n`;
      source+='};\n';
    }
    const {rows:relationships}=await client.query(`select c.conname,ft.relname as referenced_relation,
      array(select a.attname::text from unnest(c.conkey) with ordinality k(id,ord) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.id order by k.ord) as columns,
      array(select a.attname::text from unnest(c.confkey) with ordinality k(id,ord) join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.id order by k.ord) as referenced_columns
      from pg_constraint c join pg_class ft on ft.oid=c.confrelid where c.contype='f' and c.conrelid=$1::regclass`,[`public.${table.tablename}`]);
    source+='Relationships: [\n'+relationships.map(r=>`{ foreignKeyName: ${JSON.stringify(r.conname)}; columns: ${JSON.stringify(r.columns)}; referencedRelation: ${JSON.stringify(r.referenced_relation)}; referencedColumns: ${JSON.stringify(r.referenced_columns)}; isOneToOne: false }`).join(',\n')+'\n];\n};\n';
  }
  const {rows:functions}=await client.query(`select p.proname,p.proargnames,p.proargmodes,p.proretset,t.typname as return_type,
    array(select at.typname::text from unnest(p.proargtypes::oid[]) with ordinality a(id,ord) join pg_type at on at.oid=a.id order by a.ord) as types
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_type t on t.oid=p.prorettype
    where n.nspname='public' order by p.proname`);
  source+='}; Views: { [_ in never]: never }; Functions: {\n';
  for(const f of functions){
    const names=(f.proargnames??[]).slice(0,f.types.length);
    source+=`${JSON.stringify(f.proname)}: { Args: ${names.length?'{'+names.map((name,i)=>`${JSON.stringify(name)}: ${scalar(f.types[i])}`).join(';')+'}':'Record<string, never>'}; Returns: ${f.proretset?'Json[]':scalar(f.return_type)} };\n`;
  }
  source+='}; Enums: { [_ in never]: never }; CompositeTypes: { [_ in never]: never }; } };\n';
  writeFileSync('src/lib/db/database.types.ts',source);
}
