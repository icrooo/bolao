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
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    fetchRank();

    const channel = supabase
      .channel('rank-header')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => fetchRank(), 600);
      })
      .subscribe();
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [user]);

  const fetchRank = async () => {
    if (!user) return;
    const { data, error } = await supabase.rpc('get_user_rank', { p_user_id: user.id });
    if (error || !data || data.length === 0) return;
    const row = data[0];
    setRank({ position: row.user_position, points: Number(row.total_points) });
  };

  return (
    <div className="min-h-screen pb-20">
      <header className="sticky top-0 z-40 glass-card rounded-none border-b border-border/50 px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div>
            <h1 className="font-serif text-lg leading-tight">REBOLÃO DA COPA 2026</h1>
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
