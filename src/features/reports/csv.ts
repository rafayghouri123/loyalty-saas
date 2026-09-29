export const MAX_EXPORT_BYTES=3*1024*1024;
export function csvCell(value:unknown):string{
 let text=value===null||value===undefined?'N/A':String(value);
 // Whitespace/control prefixes cannot conceal a spreadsheet formula.
 if(/^[\s\p{Cc}]*[=+@-]/u.test(text)||/^[\t\r\n]/u.test(text))text="'"+text;
 return '"'+text.replaceAll('"','""')+'"';
}
export function reportCsv(columns:string[],rows:Record<string,unknown>[],metadata:{filters:unknown;dataAsOf:string;metrics:unknown}):Buffer{
 if(rows.length>10000)throw new Error('narrow_filters');
 const chunks:Buffer[]=[];let bytes=0;
 const add=(line:string)=>{const b=Buffer.from(line+'\r\n','utf8');bytes+=b.byteLength;if(bytes>MAX_EXPORT_BYTES)throw new Error('narrow_filters');chunks.push(b);};
 add([csvCell('Report source: recorded loyalty activity; cohort refunds can change historical totals.'),csvCell(JSON.stringify(metadata))].join(','));
 add(columns.map(csvCell).join(','));for(const row of rows)add(columns.map(k=>csvCell(row[k])).join(','));
 return Buffer.concat(chunks,bytes);
}
