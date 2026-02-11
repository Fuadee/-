import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

interface AppLayoutProps {
  children: ReactNode;
}

const navItems = [
  { label: 'Case List', href: '/cases' }
];

export default function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>Procurement MVP</h1>
        <nav>
          {navItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className={location.pathname === item.href ? 'active' : ''}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
