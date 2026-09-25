'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Menu, Coffee } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { allowed, type Access, type Capability, type Role } from './contracts';

export type NavItem = { id: string; title: string; role: Role; capability?: Capability };
export function canView(id: string, role: Role) {
  if (id.startsWith('A')) return role === 'admin';
  if (id === 'O01') return role === 'owner' || role === 'customer';
  if (id.startsWith('O')) return role === 'owner' || role === 'manager';
  if (id.startsWith('S')) return ['owner', 'manager', 'cashier'].includes(role);
  return true;
}
export function RoleShell({ access, screenId, items, children }: { access: Access; screenId: string; items: NavItem[]; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const group = screenId[0];
  const filtered = items.filter(item => item.id.startsWith(group!) && canView(item.id, access.role) && (item.role !== 'owner' || access.role === 'owner') && allowed(access, undefined, item.capability));
  return <div className={`role-shell role-${group}`}><header className="role-header"><Link href="/ui-fixtures/screens" className="wordmark"><Coffee size={23} aria-hidden="true" />Cafe loyalty</Link><span className="badge">{access.role} preview</span><Button variant="secondary" aria-expanded={open} aria-controls="role-navigation" onClick={() => setOpen(!open)}><Menu size={18} aria-hidden="true" />Navigation</Button></header>
    <div className="role-body"><nav id="role-navigation" className={`role-navigation ${open ? 'is-open' : ''}`} aria-label={`${group === 'S' ? 'Staff' : group === 'A' ? 'Admin' : group === 'O' ? 'Owner' : 'Screen'} navigation`}><Link href="/ui-fixtures/screens" onClick={() => setOpen(false)}>All screen contracts</Link>{filtered.map(item => <Link key={item.id} href={`/ui-fixtures/screens/${item.id}?role=${access.role}&grants=${access.grants.join(',')}`} aria-current={item.id === screenId ? 'page' : undefined} onClick={() => setOpen(false)}>{item.title}</Link>)}{group === 'S' && <Link href="/ui-fixtures/screens/C06">Account</Link>}</nav><div className="role-content">{children}</div></div>
    {group === 'C' && <nav className="customer-navigation" aria-label="Customer navigation">{[['C01', 'Cards'], ['C04', 'Offers'], ['C05', 'Referrals'], ['C06', 'Account']].map(([id, label]) => <Link key={id} href={`/ui-fixtures/screens/${id}`} aria-current={id === screenId ? 'page' : undefined}>{label}</Link>)}</nav>}
  </div>;
}
