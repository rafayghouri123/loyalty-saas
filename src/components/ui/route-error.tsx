'use client';
import Link from 'next/link';
import { Button } from './button';
import { StatePanel } from './state-panel';
export function RouteError({ retry }: { retry: () => void }) {
  return <main id="main" className="container"><StatePanel title="This page could not be loaded"><p role="alert">Retry loading the page, or return to your workspace. An uncertain transaction must be checked before submitting a new request.</p><div className="actions"><Button onClick={retry}>Try again</Button><Link className="button button-secondary" href="/workspace">Choose workspace</Link></div></StatePanel></main>;
}
