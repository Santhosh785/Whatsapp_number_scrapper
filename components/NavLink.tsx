'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  const pathname = usePathname();
  const active = href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <Link href={href} className="nav-link" data-active={active}>
      <span className="nav-icon" aria-hidden>{icon}</span>
      {label}
    </Link>
  );
}
