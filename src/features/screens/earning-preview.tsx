'use client';
import { rupeesToPaisa } from '@/lib/validation/primitives';
import type { Values } from './validation';

export function EarningPreview({ values }: { values: Values }) {
  let body = 'Enter valid earning settings and an example spend to preview the formula.';
  try {
    const spend = BigInt(rupeesToPaisa(values.exampleSpend ?? ''));
    const minimum = BigInt(rupeesToPaisa(values.minimumSpend ?? '0'));
    const cap = BigInt(values.baseCap ?? '1000');
    if (cap < 1n || cap > 100000n) throw new Error('cap');
    let raw: bigint;
    if (values.mode === 'Points') {
      const step = BigInt(rupeesToPaisa(values.step ?? ''));
      const units = BigInt(values.units ?? '');
      if (step < 100n || units < 1n || units > 1000n) throw new Error('rate');
      raw = spend / step * units;
    } else { raw = BigInt(values.stamps ?? ''); if (raw < 1n || raw > 10n || cap < raw) throw new Error('stamps'); }
    const award = spend === 0n || spend < minimum ? 0n : raw > cap ? cap : raw;
    body = `${award} ${values.mode === 'Points' ? 'points' : 'stamps'} in this example. ${spend === 0n || spend < minimum ? 'This spend does not qualify.' : raw > cap ? `The base cap reduces ${raw} units to ${cap}.` : 'The base cap does not reduce this award.'} ${values.mode === 'Points' ? 'Round spend steps down before multiplying.' : 'Staff must also attest to the qualifying purchase terms.'}`;
  } catch { /* Incomplete input is a normal form state. */ }
  return <aside className="message-preview"><h3>Example earning calculation</h3><p role="status">{body}</p><small>Illustrative only. The server recomputes the final award under current rules and permissions.</small></aside>;
}
