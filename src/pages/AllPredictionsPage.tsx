import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useServerTime } from '@/hooks/useServerTime';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/AppLayout';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { FixedSizeList } from 'react-window';

type Profile = { user_id: string; name: string };
type Match = { id: string; home_team: string; away_team: string; match_datetime: string; is_finished: boolean; is_started: boolean; home_score: number | null; away_score: number | null; group_name: string };
type Prediction = { user_id: string; match_id: string; home_score_pred: number; away_score_pred: number };
type Score = { user_id: string; match_id: string; points: number };

const KNOCKOUT_PHASES = ['16-AVOS', 'OITAVAS', 'QUARTAS', 'SEMI', '3º e 4º', 'FINAL'];

export default function AllPredictionsPage() {
  const { now: serverNow } = useServerTime();
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);
  const [phaseFilter, setPhaseFilter] = useState<'grupos' | 'mata-mata'>('grupos');

  const namesRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<List>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const fetchAll = async () => {
    const [profRes, matchRes, predRes, scoreRes] = await Promise.all([
      supabase.from('profiles').select('user_id, name').eq('is_approved', true),
      supabase.from('matches').select('id, home_team, away_team, match_datetime, is_finished, is_started, home_score, away_score, group_name').order('match_datetime'),
      supabase.from('predictions').select('user_id, match_id, home_score_pred, away_score_pred'),
      supabase.from('scores').select('user_id, match_id, points'),
    ]);
    if (profRes.error) { toast.error(profRes.error.message); }
    if (matchRes.error) { toast.error(matchRes.error.message); }
    if (predRes.error) { toast.error(predRes.error.message); }
    if (scoreRes.error) { toast.error(scoreRes.error.message); }
    if (profRes.data) setProfiles(profRes.data);
    if (matchRes.data) setMatches(matchRes.data as Match[]);
    if (predRes.data) setPredictions(predRes.data);
    if (scoreRes.data) setScores(scoreRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  useEffect(() => {
    const channel = supabase
      .channel('all-predictions-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'predictions' }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const isLocked = (m: Match) => {
    return m.is_finished || m.is_started || new Date(m.match_datetime).getTime() - 10 * 60 * 1000 <= serverNow();
  };

  const visibleMatches = useMemo(() => {
    const locked = matches.filter(isLocked);
    return locked.filter(m => {
      const isGroup = m.group_name.length === 1 && m.group_name >= 'A' && m.group_name <= 'L';
      return phaseFilter === 'grupos' ? isGroup : KNOCKOUT_PHASES.includes(m.group_name);
    });
  }, [matches, phaseFilter, serverNow]);

  const getPrediction = (userId: string, matchId: string) =>
    predictions.find(p => p.user_id === userId && p.match_id === matchId);

  const getScore = (userId: string, matchId: string) =>
    scores.find(s => s.user_id === userId && s.match_id === matchId);

  const calcPoints = (pred: Prediction, homeScore: number, awayScore: number): number => {
    if (pred.home_score_pred === homeScore && pred.away_score_pred === awayScore) return 5;
    if (pred.home_score_pred === awayScore && pred.away_score_pred === homeScore) return -1;
    if ((pred.home_score_pred > pred.away_score_pred && homeScore > awayScore) ||
        (pred.home_score_pred < pred.away_score_pred && homeScore < awayScore) ||
        (pred.home_score_pred === pred.away_score_pred && homeScore === awayScore)) return 2;
    return 0;
  };

  const getScoreColor = (points: number) => {
    if (points === 5) return 'bg-score-exact text-primary-foreground';
    if (points === 2) return 'bg-score-partial text-accent-foreground';
    if (points === -1) return 'bg-score-negative text-destructive-foreground';
    return 'bg-score-miss text-primary-foreground';
  };

  const getPointsForCell = (userId: string, match: Match) => {
    const storedScore = getScore(userId, match.id);
    if (storedScore) return storedScore.points;
    const pred = getPrediction(userId, match.id);
    if (pred && match.home_score !== null && match.away_score !== null) {
      return calcPoints(pred, match.home_score, match.away_score);
    }
    return null;
  };

  const rankingMap = useMemo(() => {
    const map = new Map<string, number>();
    const userScores = new Map<string, { total: number; exact: number; tendency: number; inverse: number; name: string }>();
    profiles.forEach(p => {
      userScores.set(p.user_id, { total: 0, exact: 0, tendency: 0, inverse: 0, name: p.name });
    });
    scores.forEach(s => {
      const entry = userScores.get(s.user_id);
      if (entry) {
        entry.total += s.points;
        if (s.points === 5) entry.exact++;
        if (s.points === 2) entry.tendency++;
        if (s.points === -1) entry.inverse++;
      }
    });
    const sorted = Array.from(userScores.entries())
      .sort(([, a], [, b]) => {
        if (b.total !== a.total) return b.total - a.total;
        if (b.exact !== a.exact) return b.exact - a.exact;
        if (b.tendency !== a.tendency) return b.tendency - a.tendency;
        if (a.inverse !== b.inverse) return a.inverse - b.inverse;
        return a.name.localeCompare(b.name);
      });
    let pos = 1;
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0) {
        const prev = sorted[i - 1][1];
        const curr = sorted[i][1];
        if (curr.total !== prev.total || curr.exact !== prev.exact || curr.tendency !== prev.tendency || curr.inverse !== prev.inverse) {
          pos = i + 1;
        }
      }
      map.set(sorted[i][0], pos);
    }
    return map;
  }, [profiles, scores]);

  const sortedProfiles = useMemo(() =>
    [...profiles].sort((a, b) => {
      if (user) {
        if (a.user_id === user.id) return -1;
        if (b.user_id === user.id) return 1;
      }
      return a.name.localeCompare(b.name);
    }),
    [profiles, user]
  );

  const ROW_HEIGHT = 32;
  const COLUMN_WIDTH = 72;

  const handleListScroll = useCallback(({ scrollOffset }: { scrollOffset: number }) => {
    // No vertical sync needed for horizontal list
  }, []);

  const handleNamesScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  }, []);

  const handleBodyScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (namesRef.current) {
      namesRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  }, []);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  const allLockedMatches = matches.filter(isLocked);
  const hasGroupMatches = allLockedMatches.some(m => m.group_name.length === 1 && m.group_name >= 'A' && m.group_name <= 'L');
  const hasKnockoutMatches = allLockedMatches.some(m => KNOCKOUT_PHASES.includes(m.group_name));

  if (allLockedMatches.length === 0) {
    return (
      <AppLayout>
        <div className="glass-card p-8 text-center">
          <p className="text-muted-foreground text-sm">Oxen. Aguarde, ansioso.</p>
        </div>
      </AppLayout>
    );
  }

  const containerWidth = typeof window !== 'undefined' ? Math.min(window.innerWidth - 132, 800) : 400;

  return (
    <AppLayout>
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">Palpites de todos os participantes para jogos bloqueados, em andamento e finalizados</p>

        {/* Phase filter */}
        <div className="flex gap-2">
          <button
            onClick={() => setPhaseFilter('grupos')}
            disabled={!hasGroupMatches}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-[0.98] disabled:opacity-40 ${
              phaseFilter === 'grupos' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
            }`}
          >
            Fase de Grupos
          </button>
          <button
            onClick={() => setPhaseFilter('mata-mata')}
            disabled={!hasKnockoutMatches}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-[0.98] disabled:opacity-40 ${
              phaseFilter === 'mata-mata' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
            }`}
          >
            Mata-Mata
          </button>
        </div>

        {visibleMatches.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <p className="text-muted-foreground text-sm">Nenhum jogo nesta fase ainda</p>
          </div>
        ) : (
          <div className="flex -mx-4 px-4">
            {/* Fixed names column */}
            <div className="shrink-0">
              {/* Header spacer */}
              <div className="h-[32px] flex items-end pb-1">
                <span className="text-[10px] font-medium text-muted-foreground">Nome</span>
              </div>
              {/* Names */}
              <div
                ref={namesRef}
                className="overflow-hidden"
                style={{ maxHeight: sortedProfiles.length * ROW_HEIGHT }}
                onScroll={handleNamesScroll}
              >
                {sortedProfiles.map((profile) => {
                  const rank = rankingMap.get(profile.user_id);
                  return (
                    <div
                      key={profile.user_id}
                      className="flex items-center pr-1 whitespace-nowrap"
                      style={{ height: ROW_HEIGHT }}
                    >
                      <span className={`text-xs ${user && profile.user_id === user.id ? 'font-bold' : 'font-medium'} truncate max-w-[80px]`}>
                        {profile.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground ml-0.5">[{rank ? `${rank}º` : '-'}]</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Virtualized match columns */}
            <div className="flex-1 overflow-hidden">
              {/* Header */}
              <div className="overflow-hidden" style={{ height: 32 }}>
                <List
                  height={32}
                  width={containerWidth}
                  itemCount={visibleMatches.length}
                  itemSize={COLUMN_WIDTH}
                  layout="horizontal"
                  style={{ overflow: 'hidden' }}
                  ref={listRef}
                >
                  {({ index, style }) => {
                    const m = visibleMatches[index];
                    return (
                      <div style={style} className="flex items-end justify-center pb-1">
                        <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                          {m.home_team.slice(0, 3).toUpperCase()}×{m.away_team.slice(0, 3).toUpperCase()}
                        </span>
                      </div>
                    );
                  }}
                </List>
              </div>

              {/* Body - scrollable area with all rows */}
              <div
                ref={bodyRef}
                className="overflow-x-auto overflow-y-hidden"
                onScroll={(e) => {
                  // Sync header horizontal scroll
                  if (listRef.current) {
                    listRef.current.scrollTo(e.currentTarget.scrollLeft);
                  }
                  handleBodyScroll(e);
                }}
              >
                <div style={{ width: visibleMatches.length * COLUMN_WIDTH, minWidth: '100%' }}>
                  {sortedProfiles.map((profile) => (
                    <div key={profile.user_id} className="flex" style={{ height: ROW_HEIGHT }}>
                      {visibleMatches.map((match) => {
                        const pred = getPrediction(profile.user_id, match.id);
                        const points = getPointsForCell(profile.user_id, match);
                        return (
                          <div
                            key={match.id}
                            className="flex items-center justify-center shrink-0"
                            style={{ width: COLUMN_WIDTH }}
                          >
                            {pred ? (
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${points !== null ? getScoreColor(points) : 'bg-secondary'}`}>
                                {pred.home_score_pred}×{pred.away_score_pred}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
