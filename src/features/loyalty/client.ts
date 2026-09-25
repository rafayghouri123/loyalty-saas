import { useEffect, useState } from 'react';

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update(); window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  return online;
}

export class LoyaltyRequestError extends Error {
  constructor(message: string, readonly code?: string, readonly freshPreview?: unknown) { super(message); }
}

export async function loyaltyRequest<T>(operation: string, input: unknown): Promise<T> {
  const response = await fetch(`/api/loyalty/${operation}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input), cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) throw new LoyaltyRequestError(payload.error?.message ?? 'The operation could not be completed.',
    payload.error?.code, payload.error?.freshPreview);
  return payload.data as T;
}
export const idempotencyKey = () => crypto.randomUUID();
