import { CircleAlert } from 'lucide-react';
import Link from 'next/link';
import { Button } from './button';

export function StatePanel({ title, children, href, action }: { title: string; children: React.ReactNode; href?: string; action?: string }) {
  return <section className="state-panel" aria-labelledby="state-title">
    <span className="state-icon"><CircleAlert aria-hidden="true" size={28} /></span>
    <h1 id="state-title">{title}</h1><div className="muted">{children}</div>
    {href && action && <Button asChild><Link href={href}>{action}</Link></Button>}
  </section>;
}
