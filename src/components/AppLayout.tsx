import { ReactNode, useState, useEffect } from 'react';
import { BottomNav } from './BottomNav';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { LogOut } from 'lucide-react';

export function AppLayout({ children }: { children: ReactNode }) {
  const { profile, user, signOut } = useAuth();
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

    // Aggregate totals + tiebreakers
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

    // Assign positions with ties
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
          <button
            onClick={signOut}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors active:scale-95"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 py-4">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
