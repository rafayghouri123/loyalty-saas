import { createUserClient } from '@/lib/db/server';
import { StatePanel } from '@/components/ui/state-panel';
import { publicConfiguration } from './data';
import { policySchema } from './contracts';
import { z } from 'zod';
import { notFound } from 'next/navigation';
export async function PolicyPage({ kind, document }: { kind: 'privacy' | 'platform_terms'; document?: string }) {
  let policy;
  if (document) {
    if (!z.uuid().safeParse(document).success) notFound();
    const client = await createUserClient();
    const result = await client?.rpc('read_policy', { p_id: document });
    const parsed = policySchema.safeParse(result?.data);
    if (!parsed.success || parsed.data.kind !== kind) notFound();
    policy = parsed.data;
  } else policy = (await publicConfiguration()).policies.find(p => p.kind === kind);
  const title = kind === 'privacy' ? 'Privacy policy' : 'Terms';
  if (!policy) return <main id="main" className="container"><StatePanel title={`${title} awaiting publication`} href="/" action="Back to home"><p>The operator has not supplied published wording. Live enrollment and business publication remain unavailable.</p></StatePanel></main>;
  return <main id="main" className="container"><h1>{title}</h1><p>Version {policy.version} · Effective {new Date(policy.publishedAt).toLocaleDateString('en-PK')}</p><div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{policy.body}</div></main>;
}
