'use client';
import { Button } from '@/components/ui/button';
export type Hours = { weekday: number; opensAt: string; closesAt: string }[];
export function HoursEditor({ value, onChange }: { value: Hours; onChange: (hours: Hours) => void }) {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return <section className="stack"><h2>Opening hours · Asia/Karachi</h2><p>Days without intervals are closed. Split overnight hours into separate days.</p>
    {value.map((h, i) => <div className="hours-interval" key={i}><label>Day<select value={h.weekday} onChange={e => onChange(value.map((v, n) => n === i ? { ...v, weekday: Number(e.target.value) } : v))}>{days.map((d, n) => <option key={d} value={n + 1}>{d}</option>)}</select></label>
      <label>Opens<input type="time" required value={h.opensAt.slice(0, 5)} onChange={e => onChange(value.map((v, n) => n === i ? { ...v, opensAt: e.target.value } : v))}/></label>
      <label>Closes<input type="time" required disabled={h.closesAt.startsWith('24:00')} value={h.closesAt.startsWith('24:00') ? '00:00' : h.closesAt.slice(0, 5)} onChange={e => onChange(value.map((v, n) => n === i ? { ...v, closesAt: e.target.value } : v))}/></label>
      <label className="check-label"><input type="checkbox" checked={h.closesAt.startsWith('24:00')} onChange={e => onChange(value.map((v, n) => n === i ? { ...v, closesAt: e.target.checked ? '24:00' : '18:00' } : v))}/>Closes at midnight (end of day)</label>
      <Button type="button" variant="secondary" onClick={() => onChange(value.filter((_, n) => n !== i))}>Remove interval</Button></div>)}
    <Button type="button" variant="secondary" onClick={() => onChange([...value, { weekday: 1, opensAt: '09:00', closesAt: '18:00' }])}>Add opening interval</Button>
  </section>;
}
