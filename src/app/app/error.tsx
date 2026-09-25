'use client';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { StatePanel } from '@/components/ui/state-panel';
import { copy } from '@/lib/copy';

export default function CustomerError({ retry }: { retry: () => void }) {
  return <main id="main" className="container"><StatePanel title={copy.pageState.errorTitle}>
    <p role="alert">{copy.pageState.errorBody}</p>
    <div className="actions"><Button onClick={() => retry()}>{copy.pageState.retry}</Button>
      <Link className="button button-secondary" href="/app">{copy.pageState.back}</Link></div>
  </StatePanel></main>;
}
