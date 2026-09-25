'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

import { screenStates, type ScreenState } from './state-copy';

export function StatePreview({ state, onRetry }: { state: ScreenState; onRetry: () => void }) {
  const [message, setMessage] = useState('');
  if (state === 'ready') return null;
  const [title, body] = screenStates[state];
  return <section className={`screen-panel state-${state}`} aria-busy={state === 'loading'}><h2>{title}</h2><p role={['error', 'forbidden', 'revoked'].includes(state) ? 'alert' : 'status'}>{body}</p>{['error', 'provider'].includes(state) && <Button variant="secondary" onClick={onRetry}>Retry preview</Button>}{state === 'uncertain' && <Button variant="secondary" onClick={() => setMessage('Status lookup is not connected. Do not submit a new transaction.')}>Check original request</Button>}<p role="status">{message}</p></section>;
}
