'use client';
import { Button } from '@/components/ui/button';

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export type Interval = { id: number; day: string; start: string; end: string };
export function invalidHours(intervals: Interval[]) { return intervals.filter(interval => !interval.start || !interval.end || interval.start >= interval.end || intervals.some(other => other.id !== interval.id && other.day === interval.day && interval.start < other.end && interval.end > other.start)); }
export function OpeningHours({ intervals, onChange }: { intervals: Interval[]; onChange: (intervals: Interval[]) => void }) {
  const next = Math.max(0, ...intervals.map(interval => interval.id)) + 1;
  const errors = invalidHours(intervals);
  function setIntervals(change: (items: Interval[]) => Interval[]) { onChange(change(intervals)); }
  function update(id: number, key: 'start' | 'end', value: string) { setIntervals(items => items.map(item => item.id === id ? { ...item, [key]: value } : item)); }
  return <section className="screen-panel"><h2>Weekly opening hours</h2><p className="muted">Asia/Karachi · 24-hour clock. Split overnight hours into separate days.</p>{days.map(day => <fieldset className="hours-day" key={day}><legend>{day}</legend><label className="check-label"><input type="checkbox" checked={!intervals.some(item => item.day === day)} onChange={event => { if (event.target.checked) setIntervals(items => items.filter(item => item.day !== day)); else { setIntervals(items => [...items, { id: next, day, start: '09:00', end: '18:00' }]); } }} />Closed</label>{intervals.filter(item => item.day === day).map(item => <div className="hours-interval" key={item.id}><label>Opening time<input type="time" value={item.start} onChange={event => update(item.id, 'start', event.target.value)} /></label><label>Closing time<input type="time" value={item.end} onChange={event => update(item.id, 'end', event.target.value)} /></label><Button variant="ghost" onClick={() => setIntervals(items => items.filter(interval => interval.id !== item.id))}>Remove interval</Button>{errors.includes(item) && <p className="error-text" role="alert">Intervals must end later on the same day and cannot overlap.</p>}</div>)}<Button variant="secondary" onClick={() => { setIntervals(items => [...items, { id: next, day, start: '09:00', end: '18:00' }]); }}>Add {day} interval</Button></fieldset>)}<p className="microcopy">Local preview only; opening hours are not saved.</p></section>;
}
