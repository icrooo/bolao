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
    // Get all approved profiles
    const { data: profiles } = await supabase.from('profiles').select('user_id').eq('is_approved', true);
    if (!profiles) return;

    // Get all scores
    const { data: allScores } = await supabase.from('scores').select('user_id, points');
    if (!allScores) return;

    // Aggregate
    const totals = new Map<string, number>();
    profiles.forEach(p => totals.set(p.user_id, 0));
    allScores.forEach(s => totals.set(s.user_id, (totals.get(s.user_id) ?? 0) + s.points));

    const sorted = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
    const idx = sorted.findIndex(([uid]) => uid === user.id);
    if (idx !== -1) {
      setRank({ position: idx + 1, points: sorted[idx][1] });
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
