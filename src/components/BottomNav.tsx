import { NavLink, useLocation } from 'react-router-dom';
import { Trophy, Target, Users, Shield } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const navItems = [
  { to: '/predictions', label: 'Palpites', icon: Target },
  { to: '/ranking', label: 'Ranking', icon: Trophy },
  { to: '/all-predictions', label: 'Todos', icon: Users },
];

export function BottomNav() {
  const { isAdmin } = useAuth();
  const location = useLocation();

  const items = isAdmin
    ? [...navItems, { to: '/admin', label: 'Admin', icon: Shield }]
    : navItems;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass-card rounded-none border-t border-border/50 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {items.map(({ to, label, icon: Icon }) => {
          const isActive = location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors duration-200 ${
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[11px] font-medium">{label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
