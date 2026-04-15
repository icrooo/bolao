import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/AppLayout';
import { Loader2, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { format, addDays, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

type RankingEntry = {
  user_id: string;
  name: string;
  total_points: number;
  exact_count: number;
  partial_count: number;
  negative_count: number;
  missed_count: number;
  position: number;
  positionChange: number | null;
};

type FriendshipGroup = { id: string; name: string };

export default function RankingPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'geral' | 'dia'>('geral');
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [friendshipGroups, setFriendshipGroups] = useState<FriendshipGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('all');

  useEffect(() => {
    const fetchGroups = async () => {
      const { data, error } = await supabase.from('friendship_groups').select('id, name').order('name');
      if (error) { toast.error(error.message); return; }
      if (data) setFriendshipGroups(data);
    };
    fetchGroups();
  }, []);

  useEffect(() => { fetchRanking(); }, [tab, selectedDate, selectedGroup]);

  useEffect(() => {
    const channel = supabase
      .channel('scores-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => fetchRanking())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tab, selectedDate, selectedGroup]);

  const fetchRanking = async () => {
    setLoading(true);

    const groupId = selectedGroup !== 'all' ? selectedGroup : undefined;

    if (tab === 'dia') {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const { data, error } = await supabase.rpc('get_ranking', {
        p_date: dateStr,
        p_group_id: groupId ?? null,
      });
      if (error) { toast.error(error.message); setLoading(false); return; }
      if (!data || data.length === 0) { setRanking([]); setLoading(false); return; }

      const entries: RankingEntry[] = data.map((r: any) => ({
        user_id: r.out_user_id,
        name: r.out_name,
        total_points: Number(r.out_total_points),
        exact_count: Number(r.out_exact_count),
        partial_count: Number(r.out_partial_count),
        negative_count: Number(r.out_negative_count),
        missed_count: Number(r.out_missed_count),
        position: r.out_position,
        positionChange: null,
      }));
      setRanking(entries);
      setLoading(false);
      return;
    }

    // Tab geral: current ranking + previous ranking for position change
    const { data: currentData, error: currentError } = await supabase.rpc('get_ranking', {
      p_date: null,
      p_group_id: groupId ?? null,
    });
    if (currentError) { toast.error(currentError.message); setLoading(false); return; }
    if (!currentData || currentData.length === 0) { setRanking([]); setLoading(false); return; }

    const entries: RankingEntry[] = currentData.map((r: any) => ({
      user_id: r.out_user_id,
      name: r.out_name,
      total_points: Number(r.out_total_points),
      exact_count: Number(r.out_exact_count),
      partial_count: Number(r.out_partial_count),
      negative_count: Number(r.out_negative_count),
      missed_count: Number(r.out_missed_count),
      position: r.out_position,
      positionChange: null,
    }));

    // Calculate position change: get last finished match, exclude it, rebuild ranking
    const { data: finishedMatches, error: fmError } = await supabase
      .from('matches').select('id').eq('is_finished', true);
    if (!fmError && finishedMatches && finishedMatches.length >= 2) {
      // We need to compute previous ranking by excluding latest match scores
      // For simplicity, use the current scores minus the last finished match
      const { data: allScores, error: asError } = await supabase
        .from('scores').select('user_id, match_id, points');
      const { data: fmOrdered } = await supabase
        .from('matches').select('id').eq('is_finished', true).order('match_datetime', { ascending: false }).limit(1);
      
      if (!asError && allScores && fmOrdered && fmOrdered.length > 0) {
        const latestMatchId = fmOrdered[0].id;
        // Build previous ranking manually
        const prevScores = allScores.filter(s => s.match_id !== latestMatchId);
        const prevMap = new Map<string, { total: number; exact: number; partial: number; negative: number }>();
        entries.forEach(e => prevMap.set(e.user_id, { total: 0, exact: 0, partial: 0, negative: 0 }));
        prevScores.forEach(s => {
          const entry = prevMap.get(s.user_id);
          if (!entry) return;
          entry.total += s.points;
          if (s.points === 5) entry.exact++;
          else if (s.points === 2) entry.partial++;
          else if (s.points === -1) entry.negative++;
        });
        const sorted = Array.from(prevMap.entries())
          .map(([uid, e]) => ({ uid, ...e }))
          .sort((a, b) => {
            if (b.total !== a.total) return b.total - a.total;
            if (b.exact !== a.exact) return b.exact - a.exact;
            if (b.partial !== a.partial) return b.partial - a.partial;
            return a.negative - b.negative;
          });
        const prevPositions = new Map<string, number>();
        let pos = 1;
        for (let i = 0; i < sorted.length; i++) {
          if (i > 0) {
            const prev = sorted[i - 1];
            const curr = sorted[i];
            if (curr.total !== prev.total || curr.exact !== prev.exact || curr.partial !== prev.partial || curr.negative !== prev.negative) {
              pos = i + 1;
            }
          }
          prevPositions.set(sorted[i].uid, pos);
        }
        entries.forEach(e => {
          const prevPos = prevPositions.get(e.user_id);
          if (prevPos !== undefined) {
            e.positionChange = prevPos - e.position;
          }
        });
      }
    }

    setRanking(entries);
    setLoading(false);
  };

  const getMedalEmoji = (pos: number, isLast: boolean) => {
    if (pos === 1) return '🥇';
    if (pos === 2) return '🥈';
    if (pos === 3) return '🥉';
    if (isLast) return '💩';
    return null;
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex gap-1 bg-secondary rounded-lg p-1">
          {(['geral', 'dia'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-all active:scale-[0.98] ${
                tab === t ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
              }`}
            >
              {t === 'geral' ? 'Geral' : 'Do dia'}
            </button>
          ))}
        </div>

        <Select value={selectedGroup} onValueChange={setSelectedGroup}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Filtrar por grupo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os participantes</SelectItem>
            {friendshipGroups.map(g => (
              <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {tab === 'dia' && (
          <div className="flex items-center justify-center gap-4">
            <button onClick={() => setSelectedDate(d => subDays(d, 1))} className="p-1.5 rounded-lg hover:bg-secondary active:scale-95 transition-all">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="text-sm font-medium min-w-[120px] text-center">
              {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
            </span>
            <button onClick={() => setSelectedDate(d => addDays(d, 1))} className="p-1.5 rounded-lg hover:bg-secondary active:scale-95 transition-all">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : ranking.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <p className="text-muted-foreground text-sm">Nenhum resultado ainda</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Legend */}
            <div className="flex items-center justify-center gap-4 py-2 px-3 rounded-lg bg-secondary/50 text-[10px] text-muted-foreground">
              <span>+5 = <span className="font-bold text-green-600">EXATO</span></span>
              <span>+2 = <span className="font-bold text-yellow-600">QUASE</span></span>
              <span>-1 = <span className="font-bold text-destructive">INVERSO</span></span>
              <span>😩 = <span className="font-bold">ESQUECEU</span></span>
            </div>
            {ranking.map((entry, i) => {
              const isLastPosition = ranking.length > 1 && entry.position === ranking[ranking.length - 1].position;
              const medal = getMedalEmoji(entry.position, isLastPosition);
              const isMe = entry.user_id === user?.id;
              return (
                <div
                  key={entry.user_id}
                  className={`glass-card p-3 flex items-center gap-3 animate-reveal-up ${
                    isMe ? 'ring-2 ring-primary bg-primary/5' : ''
                  }`}
                  style={{ animationDelay: `${Math.min(i * 50, 300)}ms` }}
                >
                  <div className={`${medal ? 'w-10 h-10' : 'w-9 h-9'} rounded-full bg-secondary flex items-center justify-center shrink-0`}>
                    {medal ? (
                      <span className={`${entry.position <= 3 ? 'text-xl' : 'text-lg'}`}>{medal}</span>
                    ) : (
                      <span className="text-sm font-bold text-muted-foreground">{entry.position}º</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <div className="flex items-center gap-1.5 shrink min-w-0">
                      <p className="font-medium text-sm truncate">{entry.name}</p>
                      {isMe && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 shrink-0">
                          Você
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0 ml-auto mr-2">
                      <div className="flex flex-col items-center">
                        <span className="text-xs font-bold text-green-600">{entry.exact_count}</span>
                        <span className="text-[8px] text-muted-foreground leading-tight">+5</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-xs font-bold text-yellow-600">{entry.partial_count}</span>
                        <span className="text-[8px] text-muted-foreground leading-tight">+2</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-xs font-bold text-destructive">{entry.negative_count}</span>
                        <span className="text-[8px] text-muted-foreground leading-tight">-1</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-xs font-bold text-muted-foreground">{entry.missed_count}</span>
                        <span className="text-[8px] text-muted-foreground leading-tight">😩</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <div>
                      <p className="font-bold tabular-nums">{entry.total_points}</p>
                      <p className="text-[10px] text-muted-foreground">pts</p>
                    </div>
                    {entry.positionChange !== null && entry.positionChange !== 0 ? (
                      <span className={`flex items-center text-[10px] font-bold min-w-[28px] justify-center ${entry.positionChange > 0 ? 'text-green-600 bg-green-50 rounded px-1 py-0.5' : 'text-destructive bg-red-50 rounded px-1 py-0.5'}`}>
                        {entry.positionChange > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                        {Math.abs(entry.positionChange)}
                      </span>
                    ) : (
                      <span className="flex items-center justify-center text-[10px] font-bold text-muted-foreground bg-secondary rounded px-1 py-0.5 min-w-[28px]">
                        <Minus className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
