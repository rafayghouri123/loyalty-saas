import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {filters,defaultColumns,columns} from '../../src/features/reports/contracts';
import {csvCell,reportCsv,MAX_EXPORT_BYTES} from '../../src/features/reports/csv';
describe('Reporting contracts',()=>{
 it('limits custom ranges to 90 real calendar days and rejects inappropriate or arbitrary filters',()=>{
  expect(filters.safeParse({preset:'custom',startDate:'2026-01-01',endDate:'2026-03-31'}).success).toBe(true);
  for(const value of [{preset:'custom',startDate:'2026-01-01',endDate:'2026-04-01'},{preset:'custom',startDate:'2026-02-30',endDate:'2026-03-01'},{pageSize:101},{cursor:'1e3'},{sort:'recorded_bill_paisa desc'},{reportKind:'staff',rewardVersionId:randomUUID()},{arbitrarySql:'select 1'}])expect(filters.safeParse(value).success).toBe(false);
 });
 it('excludes contact, birthday and consent columns from ordinary exports',()=>{
  for(const kind of Object.keys(columns).filter(k=>k!=='contacts') as (keyof typeof columns)[]){expect(defaultColumns(kind)).not.toContain('name');expect(columns[kind]).not.toContain('phone');expect(columns[kind]).not.toContain('sharedEmail');expect(columns[kind]).not.toContain('birthday');expect(columns[kind]).not.toContain('consent');}
 });
 it('escapes spreadsheet formulas including hidden whitespace, quotation, newlines and Unicode',()=>{
  for(const value of ['=SUM(A1)',' +123','\t@IMPORT','\r-1','\u0001=evil'])expect(csvCell(value)).toMatch(/^"'/u);
  expect(csvCell('Hello "Ayesha" 😀\nTea, coffee')).toBe('"Hello ""Ayesha"" 😀\nTea, coffee"');expect(csvCell(null)).toBe('"N/A"');
 });
 it('fails oversized exports rather than truncating rows or multibyte bytes',()=>{
  const metadata={filters:{},dataAsOf:'2026-09-26',metrics:{}};
  expect(()=>reportCsv(['text'],Array.from({length:10001},()=>({text:'test'})),metadata)).toThrow('narrow_filters');
  expect(()=>reportCsv(['text'],[{text:'😀'.repeat(MAX_EXPORT_BYTES/4)}],metadata)).toThrow('narrow_filters');
  const csv=reportCsv(['text'],[{text:'=not a formula'},{text:null}],metadata).toString();expect(csv).toContain("'=not a formula");expect(csv).toContain('N/A');expect(csv).toContain('2026-09-26');
 });
});
