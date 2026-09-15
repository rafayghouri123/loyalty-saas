'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CreditCard, Gift, UserRound, Users } from 'lucide-react';
import { copy } from '../lib/copy';

const icons = [CreditCard, Gift, Users, UserRound];
export function CustomerNavigation() {
  const path = usePathname();
  return <nav className="customer-navigation" aria-label="Customer navigation">
    {copy.nav.map((item, index) => {
      const Icon = icons[index]!;
      const active = item.href === '/app' ? path === '/app' || path.startsWith('/app/cards/') :
        path === item.href || path.startsWith(`${item.href}/`) || (item.href === '/app/settings' && path === '/app/notifications');
      return <Link href={item.href} key={item.href} aria-current={active ? 'page' : undefined}>
        <Icon size={21} aria-hidden="true" /><span>{item.label}</span>
      </Link>;
    })}
  </nav>;
}
