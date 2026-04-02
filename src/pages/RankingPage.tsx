import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/AppLayout';
import { Loader2, ChevronLeft, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { format, addDays, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type RankingEntry = {
  user_id: string;
  name: string;
  total_points: number;
  exact_count: number;
  partial_count: number;
  negative_count: number;
  position: number;
  positionChange: number | null;
};

type FriendshipGroup = { id: string; name: string };
type UserFriendshipGroup = { user_id: string; group_id: string };

export default function RankingPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'geral' | 'dia'>('geral');
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [friendshipGroups, setFriendshipGroups] = useState<FriendshipGroup[]>([]);
  const [userFriendshipGroups, setUserFriendshipGroups] = useState<UserFriendshipGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('all');

  useEffect(() => {
    const fetchGroups = async () => {
      const [fgRes, ufgRes] = await Promise.all([
        supabase.from('friendship_groups').select('id, name').order('name'),
        supabase.from('user_friendship_groups').select('user_id, group_id'),
      ]);
      if (fgRes.data) setFriendshipGroups(fgRes.data);
      if (ufgRes.data) setUserFriendshipGroups(ufgRes.data);
    };
    fetchGroups();
  }, []);

  useEffect(() => { fetchRanking(); }, [tab, selectedDate, selectedGroup, userFriendshipGroups]);

  useEffect(() => {
    const channel = supabase
      .channel('scores-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => fetchRanking())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tab, selectedDate, selectedGroup, userFriendshipGroups]);

  const fetchRanking = async () => {
    setLoading(true);
    const { data: profiles } = await supabase.from('profiles').select('user_id, name').eq('is_approved', true);
    if (!profiles) { setLoading(false); return; }

    // Filter by friendship group
    let filteredProfiles = profiles;
    if (selectedGroup !== 'all') {
      const groupUserIds = new Set(userFriendshipGroups.filter(ufg => ufg.group_id === selectedGroup).map(ufg => ufg.user_id));
      filteredProfiles = profiles.filter(p => groupUserIds.has(p.user_id));
    }

    const { data: finishedMatches } = await supabase.from('matches').select('id, match_datetime').eq('is_finished', true).order('match_datetime', { ascending: false });

    let scoresQuery = supabase.from('scores').select('user_id, match_id, points');

    if (tab === 'dia') {
      const dayStart = new Date(selectedDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(selectedDate);
      dayEnd.setHours(23, 59, 59, 999);
      const { data: dayMatches } = await supabase.from('matches').select('id')
        .gte('match_datetime', dayStart.toISOString()).lte('match_datetime', dayEnd.toISOString());
      if (!dayMatches || dayMatches.length === 0) { setRanking([]); setLoading(false); return; }
      scoresQuery = scoresQuery.in('match_id', dayMatches.map(m => m.id));
    }

    const { data: scoresData } = await scoresQuery;
    if (!scoresData) { setLoading(false); return; }

    const buildRanking = (scores: typeof scoresData, profs: typeof filteredProfiles) => {
      const userMap = new Map<string, RankingEntry>();
      profs.forEach(p => {
        userMap.set(p.user_id, {
          user_id: p.user_id, name: p.name,
          total_points: 0, exact_count: 0, partial_count: 0, negative_count: 0,
          position: 0, positionChange: null,
        });
      });
      scores.forEach(s => {
        const entry = userMap.get(s.user_id);
        if (!entry) return;
        entry.total_points += s.points;
        if (s.points === 5) entry.exact_count++;
        else if (s.points === 2) entry.partial_count++;
        else if (s.points === -1) entry.negative_count++;
      });
      const sorted = Array.from(userMap.values()).sort((a, b) => {
        if (b.total_points !== a.total_points) return b.total_points - a.total_points;
        if (b.exact_count !== a.exact_count) return b.exact_count - a.exact_count;
        if (b.partial_count !== a.partial_count) return b.partial_count - a.partial_count;
        if (a.negative_count !== b.negative_count) return a.negative_count - b.negative_count;
        return a.name.localeCompare(b.name);
      });
      for (let i = 0; i < sorted.length; i++) {
        if (i > 0) {
          const prev = sorted[i - 1];
          const curr = sorted[i];
          if (curr.total_points === prev.total_points && curr.exact_count === prev.exact_count &&
              curr.partial_count === prev.partial_count && curr.negative_count === prev.negative_count) {
            curr.position = prev.position;
          } else {
            curr.position = i + 1;
          }
        } else {
          sorted[i].position = 1;
        }
      }
      return sorted;
    };

    const currentRanking = buildRanking(scoresData, filteredProfiles);

    if (tab === 'geral' && finishedMatches && finishedMatches.length >= 2) {
      const latestMatchId = finishedMatches[0].id;
      const prevScores = scoresData.filter(s => s.match_id !== latestMatchId);
      const prevRanking = buildRanking(prevScores, filteredProfiles);
      const prevPosMap = new Map<string, number>();
      prevRanking.forEach(e => prevPosMap.set(e.user_id, e.position));
      currentRanking.forEach(e => {
        const prevPos = prevPosMap.get(e.user_id);
        if (prevPos !== undefined) {
          e.positionChange = prevPos - e.position;
        }
      });
    }

    setRanking(currentRanking);
    setLoading(false);
  };

  const getMedalEmoji = (pos: number) => {
    if (pos === 1) return '🥇';
    if (pos === 2) return '🥈';
    if (pos === 3) return '🥉';
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

        {/* Friendship group filter */}
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
            {ranking.map((entry, i) => {
              const medal = getMedalEmoji(entry.position);
              return (
                <div
                  key={entry.user_id}
                  className={`glass-card p-3 flex items-center gap-3 animate-reveal-up ${
                    entry.user_id === user?.id ? 'ring-2 ring-primary bg-primary/5' : ''
                  }`}
                  style={{ animationDelay: `${Math.min(i * 50, 300)}ms` }}
                >
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    {medal ? (
                      <span className="text-sm">{medal}</span>
                    ) : (
                      <span className="text-xs font-bold text-muted-foreground">{entry.position}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{entry.name}</p>
                    <div className="flex gap-2 mt-0.5">
                      <span className="text-[10px] text-score-exact font-medium">{entry.exact_count}×5</span>
                      <span className="text-[10px] text-score-partial font-medium">{entry.partial_count}×2</span>
                      {entry.negative_count > 0 && (
                        <span className="text-[10px] text-score-negative font-medium">{entry.negative_count}×(-1)</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    {entry.positionChange !== null && entry.positionChange !== 0 && (
                      <span className={`flex items-center text-[10px] font-bold ${entry.positionChange > 0 ? 'text-green-600' : 'text-destructive'}`}>
                        {entry.positionChange > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                        {Math.abs(entry.positionChange)}
                      </span>
                    )}
                    <div>
                      <p className="font-bold tabular-nums">{entry.total_points}</p>
                      <p className="text-[10px] text-muted-foreground">pts</p>
                    </div>
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
