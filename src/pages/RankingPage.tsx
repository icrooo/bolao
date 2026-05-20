import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/AppLayout';
import { Loader2, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Minus, Trophy } from 'lucide-react';
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

const PODIUM_COLORS = [
  { light: 'hsl(45 80% 92%)', dark: 'hsl(45 40% 22%)' },
  { light: 'hsl(220 20% 91%)', dark: 'hsl(220 15% 24%)' },
  { light: 'hsl(25 55% 90%)', dark: 'hsl(25 30% 22%)' },
];
const TROPHY_COLORS = ['#b8860b', '#708090', '#8b4513'];

export default function RankingPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'geral' | 'dia'>('geral');
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [friendshipGroups, setFriendshipGroups] = useState<FriendshipGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const root = document.documentElement;
    const update = () => setIsDark(root.classList.contains('dark'));
    update();
    const obs = new MutationObserver(update);
    obs.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const debouncedFetchRanking = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        fetchRanking({ silent: true });
      }, 600);
    };

    const channel = supabase
      .channel('ranking-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, debouncedFetchRanking)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, debouncedFetchRanking)
      .subscribe();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [tab, selectedDate, selectedGroup]);

  const fetchRanking = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setLoading(true);

    const groupId = selectedGroup !== 'all' ? selectedGroup : undefined;

    if (tab === 'dia') {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const { data, error } = await supabase.rpc('get_ranking', {
        p_date: dateStr,
        p_group_id: groupId ?? null,
      });
      if (error) { toast.error(error.message); if (!silent) setLoading(false); return; }
      if (!data || data.length === 0) { setRanking([]); if (!silent) setLoading(false); await refreshLastUpdated(); return; }

      const entries: RankingEntry[] = data.map((r) => ({
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
      if (!silent) setLoading(false);
      await refreshLastUpdated();
      return;
    }

    // Tab geral - fetch current (live) and finished-only baseline in parallel
    const [currentRes, finishedRes] = await Promise.all([
      supabase.rpc('get_ranking', { p_date: null, p_group_id: groupId ?? null }),
      supabase.rpc('get_ranking', { p_date: null, p_group_id: groupId ?? null, p_only_finished: true }),
    ]);
    if (currentRes.error) { toast.error(currentRes.error.message); if (!silent) setLoading(false); return; }
    const currentData = currentRes.data;
    if (!currentData || currentData.length === 0) { setRanking([]); if (!silent) setLoading(false); await refreshLastUpdated(); return; }

    const finishedPositions = new Map<string, number>();
    (finishedRes.data ?? []).forEach((r) => {
      finishedPositions.set(r.out_user_id, r.out_position);
    });

    const entries: RankingEntry[] = currentData.map((r) => {
      const baseline = finishedPositions.get(r.out_user_id);
      // positive = subiu (foi de posição maior para menor); negative = caiu
      const change = baseline != null ? baseline - r.out_position : null;
      return {
        user_id: r.out_user_id,
        name: r.out_name,
        total_points: Number(r.out_total_points),
        exact_count: Number(r.out_exact_count),
        partial_count: Number(r.out_partial_count),
        negative_count: Number(r.out_negative_count),
        missed_count: Number(r.out_missed_count),
        position: r.out_position,
        positionChange: change,
      };
    });

    setRanking(entries);
    if (!silent) setLoading(false);
    await refreshLastUpdated();
  };

  const refreshLastUpdated = async () => {
    const { data } = await supabase
      .from('matches')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1);
    if (data && data[0]?.updated_at) setLastUpdated(new Date(data[0].updated_at));
  };

  const getMedalEmoji = (pos: number, isLast: boolean) => {
    if (pos === 1) return '🥇';
    if (pos === 2) return '🥈';
    if (pos === 3) return '🥉';
    if (isLast) return '💩';
    return null;
  };

  const showPodiumColors = selectedGroup === 'all' && tab === 'geral';

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

        {lastUpdated && (
          <div className="text-right">
            <span className="text-[12px] text-muted-foreground">
              Último placar atualizado às {format(lastUpdated, 'HH:mm:ss', { locale: ptBR })}
            </span>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : ranking.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <p className="text-muted-foreground text-sm">oxi oxi oxi. aguarde, ansioso.<br /><br />você vai poder ver os placares de todo mundo 10 minutos antes da partida começar.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Legend */}
            <div className="flex items-center justify-center gap-4 py-2 px-3 rounded-lg bg-secondary/50 text-[10px] text-muted-foreground">
              <span>+5 = <span className="font-bold text-green-600">EXATO</span></span>
              <span>+2 = <span className="font-bold text-yellow-600">QUASE</span></span>
              <span>-1 = <span className="font-bold text-destructive">INVERTIDO</span></span>
              <span>-2 = <span className="font-bold text-score-missed">ESQUECEU</span></span>
            </div>
            {ranking.map((entry, i) => {
              const isLastPosition = ranking.length > 1 && entry.position === ranking[ranking.length - 1].position;
              const medal = getMedalEmoji(entry.position, isLastPosition);
              const isMe = entry.user_id === user?.id;
              const podiumIndex = showPodiumColors && entry.position <= 3 ? entry.position - 1 : -1;
              const podiumBg = podiumIndex >= 0 ? (isDark ? PODIUM_COLORS[podiumIndex].dark : PODIUM_COLORS[podiumIndex].light) : undefined;
              const trophyColor = podiumIndex >= 0 ? TROPHY_COLORS[podiumIndex] : undefined;

              return (
                <div
                  key={entry.user_id}
                  className={`glass-card p-3 flex items-center gap-3 animate-reveal-up ${
                    isMe ? 'ring-2 ring-primary' : ''
                  }`}
                  style={{
                    animationDelay: `${Math.min(i * 50, 300)}ms`,
                    ...(podiumBg ? { backgroundColor: podiumBg } : {}),
                  }}
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
                      {trophyColor && <Trophy className="h-3.5 w-3.5 shrink-0" style={{ color: trophyColor }} />}
                      <p className="font-medium text-sm truncate">{entry.name}</p>
                      {isMe && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 shrink-0">
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
                        <span className="text-xs font-bold text-score-missed">{entry.missed_count}</span>
                        <span className="text-[8px] text-muted-foreground leading-tight">-2</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <div>
                      <p className="font-bold tabular-nums">{entry.total_points}</p>
                      <p className="text-[10px] text-muted-foreground">pts</p>
                    </div>
                    {entry.positionChange !== null && entry.positionChange !== 0 ? (
                      <span className={`flex items-center text-[10px] font-bold min-w-[28px] justify-center ${entry.positionChange > 0 ? 'text-green-600 bg-green-50 dark:bg-green-900/30 rounded px-1 py-0.5' : 'text-destructive bg-red-50 dark:bg-red-900/30 rounded px-1 py-0.5'}`}>
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
