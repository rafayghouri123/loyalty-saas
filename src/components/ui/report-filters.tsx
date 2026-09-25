'use client';
import { useState } from 'react';
import { rangeError } from '@/features/screens/validation';
import { Button } from './button';

export function ReportFilters() {
  const [preset, setPreset] = useState('Last 30 days'), [start, setStart] = useState(''), [end, setEnd] = useState(''), [error, setError] = useState('');
  return <form className="report-filters" onSubmit={event => { event.preventDefault(); setError(preset === 'Custom' ? rangeError(start, end) ?? 'Preview filters validated. Reporting is not connected.' : 'Preview filters validated. Reporting is not connected.'); }}>
    <label>Date range<select value={preset} onChange={event => { setPreset(event.target.value); setError(''); }}>{['Today', 'Last 7 days', 'Last 30 days', 'Custom'].map(value => <option key={value}>{value}</option>)}</select></label>
    {preset === 'Custom' && <><label>From<input type="date" required value={start} onChange={event => setStart(event.target.value)} /></label><label>Through<input type="date" required value={end} onChange={event => setEnd(event.target.value)} /></label></>}
    <label>Permitted branch<select><option>All permitted branches</option><option>Sample branch</option></select></label><Button type="submit" variant="secondary">Apply filters</Button><Button type="button" variant="ghost" onClick={() => { setPreset('Last 30 days'); setStart(''); setEnd(''); setError(''); }}>Clear filters</Button>
    <p className="microcopy">Asia/Karachi · Inclusive calendar dates · Maximum 90 days · No automatic polling</p><p role="status">{error}</p>
  </form>;
}
