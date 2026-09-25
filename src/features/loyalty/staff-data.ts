import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { verifiedUser } from '@/lib/db/server';

export async function staffWorkspace(businessId: string) {
  if (!z.uuid().safeParse(businessId).success) notFound();
  const { client, user } = await verifiedUser(); if (!client || !user) redirect('/auth/login?next=/workspace');
  const { data, error } = await client.rpc('my_workspaces');
  if (error) notFound();
  const spaces = z.array(z.object({ id: z.uuid(), name: z.string(), role: z.enum(['owner','manager','cashier']),
    branches: z.array(z.object({ id: z.uuid(), name: z.string() })) })).parse(data);
  const space = spaces.find(item => item.id===businessId);
  if (!space || space.branches.length===0) notFound();
  return space;
}
