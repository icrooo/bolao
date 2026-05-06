import { ReactNode, useState, useEffect } from 'react';
import { BottomNav } from './BottomNav';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { LogOut, Moon, Sun } from 'lucide-react';

function useTheme() {
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    const stored = localStorage.getItem('theme');
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggle = () => setThemeState(t => t === 'dark' ? 'light' : 'dark');
  return { theme, toggle };
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { profile, user, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const [rank, setRank] = useState<{ position: number; points: number } | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchRank();

    const channel = supabase
      .channel('rank-header')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => fetchRank())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const fetchRank = async () => {
    if (!user) return;
    const { data: profiles } = await supabase.from('profiles').select('user_id').eq('is_approved', true);
    if (!profiles) return;

    const { data: allScores } = await supabase.from('scores').select('user_id, points');
    if (!allScores) return;

    const userMap = new Map<string, { total: number; exact: number; partial: number; negative: number }>();
    profiles.forEach(p => userMap.set(p.user_id, { total: 0, exact: 0, partial: 0, negative: 0 }));
    allScores.forEach(s => {
      const entry = userMap.get(s.user_id);
      if (!entry) return;
      entry.total += s.points;
      if (s.points === 5) entry.exact++;
      else if (s.points === 2) entry.partial++;
      else if (s.points === -1) entry.negative++;
    });

    const sorted = Array.from(userMap.entries())
      .map(([uid, e]) => ({ uid, ...e }))
      .sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total;
        if (b.exact !== a.exact) return b.exact - a.exact;
        if (b.partial !== a.partial) return b.partial - a.partial;
        return a.negative - b.negative;
      });

    const positions: number[] = [];
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i].total === sorted[i-1].total && sorted[i].exact === sorted[i-1].exact && sorted[i].partial === sorted[i-1].partial && sorted[i].negative === sorted[i-1].negative) {
        positions.push(positions[i - 1]);
      } else {
        positions.push(i + 1);
      }
    }

    const idx = sorted.findIndex(e => e.uid === user.id);
    if (idx !== -1) {
      setRank({ position: positions[idx], points: sorted[idx].total });
    }
  };

  return (
    <div className="min-h-screen pb-20">
      <header className="sticky top-0 z-40 glass-card rounded-none border-b border-border/50 px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div>
            <h1 className="text-lg leading-tight">Bolão Copa 2026</h1>
            <p className="text-xs text-muted-foreground">
              {profile?.name}
              {rank && (
                <span className="ml-2 text-primary font-medium">
                  · {rank.position}º lugar · {rank.points} pts
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-1">
              <button
                onClick={toggle}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors active:scale-95"
                aria-label="Alternar tema"
              >
                {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
              <button
                onClick={signOut}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors active:scale-95"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
            <span className="text-[9px] text-muted-foreground/60 -mt-0.5 mr-1">v. 1.0 beta</span>
          </div>
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 py-4">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
