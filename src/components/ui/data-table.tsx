'use client';
import { useState } from 'react';
import { Button } from './button';

export function DataTable({ title, columns, empty }: { title: string; columns: string[]; empty: string }) {
  const [pageSize, setPageSize] = useState('25');
  return <><div className="table-scroll" role="region" aria-label={`${title} table`} tabIndex={0}><table><caption>{title}</caption><thead><tr>{columns.map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead><tbody><tr><td colSpan={columns.length}><p className="empty-table">{empty}</p></td></tr></tbody></table></div>
    <div className="table-pagination"><label>Rows per page <select value={pageSize} onChange={event => setPageSize(event.target.value)}>{['25', '50', '100'].map(size => <option key={size}>{size}</option>)}</select></label><span className="microcopy">Total not loaded</span><Button variant="secondary" disabled>Previous</Button><Button variant="secondary" disabled>Next</Button></div></>;
}
