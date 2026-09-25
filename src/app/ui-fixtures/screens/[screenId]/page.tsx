import { notFound } from 'next/navigation';
import { screenById, screens } from '@/features/screens/catalog';
import { fixturesEnabled } from '@/features/screens/fixture-gate';
import { ScreenPreview } from '@/features/screens/screen-preview';
import { RoleShell } from '@/features/screens/role-shell';
import { screenStates, type ScreenState } from '@/features/screens/state-copy';
import type { Access, Capability, Role } from '@/features/screens/contracts';
export const dynamic = 'force-dynamic';
export default async function Fixture({ params, searchParams }: { params: Promise<{ screenId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!fixturesEnabled()) notFound();
  const { screenId } = await params;
  const screen = screenById(screenId);
  if (!screen) notFound();
  const query = await searchParams;
  const roles: Role[] = ['visitor', 'customer', 'cashier', 'manager', 'owner', 'admin'];
  const role = typeof query.role === 'string' && roles.includes(query.role as Role) ? query.role as Role : screen.role === 'manager' ? 'owner' : screen.role;
  const capabilities: Capability[] = ['campaigns', 'contacts', 'reversals', 'exports', 'billing', 'support'];
  const grants = typeof query.grants === 'string' ? query.grants.split(',').filter((value): value is Capability => capabilities.includes(value as Capability)) : role === 'admin' ? ['billing', 'support'] as Capability[] : [];
  const access: Access = { role, grants };
  const state = typeof query.state === 'string' && Object.hasOwn(screenStates, query.state) ? query.state as ScreenState : 'ready';
  return <RoleShell access={access} screenId={screenId} items={screens.map(({ id, title, role, capability }) => ({ id, title, role, capability }))}><ScreenPreview key={`${screenId}-${role}-${query.variant ?? ''}`} screen={screen} access={access} initialState={state} variant={typeof query.variant === 'string' ? query.variant : ''} /></RoleShell>;
}
