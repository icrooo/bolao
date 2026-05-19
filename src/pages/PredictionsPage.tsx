import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useServerTime } from '@/hooks/useServerTime';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Loader2, Check, Lock, Minus, Plus, ChevronDown, ChevronUp, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getFlagUrl } from '@/lib/countryFlags';

type Match = {
  id: string; home_team: string; away_team: string; match_datetime: string;
  group_name: string; home_score: number | null; away_score: number | null;
  is_finished: boolean; is_started: boolean;
};
type Prediction = { id: string; match_id: string; home_score_pred: number; away_score_pred: number };
type Score = { match_id: string; points: number; is_provisional?: boolean };

export type MatchPredictionEntry = {
  user_id: string;
  name: string;
  home_score_pred: number;
  away_score_pred: number;
  points: number | null;
};

const LOCK_MINUTES = 10;
const KNOCKOUT_PHASES = ['16-AVOS', 'OITAVAS', 'QUARTAS', 'SEMI', '3º e 4º', 'FINAL'];
const FILTERS = ['PRÓXIMOS JOGOS', 'TODOS', 'GRUPOS', 'MATA-MATA'] as const;

function CountryFlag({ name, side }: { name: string; side: 'home' | 'away' }) {
  const url = getFlagUrl(name, 24);
  if (!url) return null;
  return (
    <img src={url} alt={name} className={`w-5 h-4 object-cover rounded-sm ${side === 'home' ? 'ml-1' : 'mr-1'}`} loading="lazy" />
  );
}

function ScoreBadge({ points, isProvisional }: { points: number; isProvisional?: boolean }) {
  const cls = points === 5 ? 'score-badge-5' : points === 2 ? 'score-badge-2' : points === -1 ? 'score-badge-negative' : 'score-badge-0';
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`${cls} text-xs font-bold px-2 py-0.5 rounded-full`}>{points > 0 ? '+' : ''}{points} pts</span>
      {isProvisional && <Clock className="h-3 w-3 text-muted-foreground" />}
    </span>
  );
}

function MatchStatusBadge({ match, serverNow }: { match: Match; serverNow: () => number }) {
  if (match.is_finished) return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-foreground/10 text-foreground">Encerrado</span>;
  if (match.is_started) return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-500/15 text-green-600">Em andamento</span>;
  const lockTime = new Date(match.match_datetime).getTime() - LOCK_MINUTES * 60 * 1000;
  if (serverNow() >= lockTime) return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-destructive/15 text-destructive flex items-center gap-1"><Lock className="h-3 w-3" /> Bloqueado</span>;
  return null;
}

function CountdownTimer({ datetime, serverNow, onExpired }: { datetime: string; serverNow: () => number; onExpired?: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const lockTime = new Date(new Date(datetime).getTime() - LOCK_MINUTES * 60 * 1000);
  useEffect(() => {
    const update = () => {
      const left = Math.max(0, Math.floor((lockTime.getTime() - serverNow()) / 1000));
      setSecondsLeft(left);
      if (left <= 0 && onExpired) onExpired();
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [datetime, serverNow]);
  if (secondsLeft <= 0) return null;
  const d = Math.floor(secondsLeft / 86400);
  const h = Math.floor((secondsLeft % 86400) / 3600);
  const m = Math.floor((secondsLeft % 3600) / 60);
  const s = secondsLeft % 60;
  const timeStr = `Bloqueia em ${d > 0 ? `${d}d ` : ''}${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}min ${s.toString().padStart(2, '0')}s`;

  if (secondsLeft <= 3600) {
    return (
      <span className="flex items-center gap-1 text-[11px] font-bold text-destructive tabular-nums animate-pulse">
        <Clock className="h-3 w-3" />{timeStr}
      </span>
    );
  }
  if (secondsLeft <= 86400) {
    return (
      <span className="flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 tabular-nums">
        <AlertCircle className="h-3 w-3" />{timeStr}
      </span>
    );
  }
  return (
    <span className="text-[11px] text-muted-foreground tabular-nums">{timeStr}</span>
  );
}

function ScoreInput({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled: boolean }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <button type="button" disabled={disabled} onClick={() => onChange(value + 1)} className="h-6 w-7 flex items-center justify-center rounded-md bg-secondary text-foreground disabled:opacity-30 active:scale-95 transition-transform"><Plus className="h-3 w-3" /></button>
      <span className="w-6 text-center font-bold tabular-nums">{value}</span>
      <button type="button" disabled={disabled || value <= 0} onClick={() => onChange(Math.max(0, value - 1))} className="h-6 w-7 flex items-center justify-center rounded-md bg-secondary text-foreground disabled:opacity-30 active:scale-95 transition-transform"><Minus className="h-3 w-3" /></button>
    </div>
  );
}

function calcPoints(pred: { home_score_pred: number; away_score_pred: number }, homeScore: number, awayScore: number): number {
  if (pred.home_score_pred === homeScore && pred.away_score_pred === awayScore) return 5;
  if (pred.home_score_pred === awayScore && pred.away_score_pred === homeScore) return -1;
  if ((pred.home_score_pred > pred.away_score_pred && homeScore > awayScore) ||
      (pred.home_score_pred < pred.away_score_pred && homeScore < awayScore) ||
      (pred.home_score_pred === pred.away_score_pred && homeScore === awayScore)) return 2;
  return 0;
}

function ExpandablePredictions({ match, currentUserId, fetchMatchPredictions, cachedEntries, isLoading, positionByUser, sharedGroupsByUser }: {
  match: Match;
  currentUserId: string;
  fetchMatchPredictions: (matchId: string) => void;
  cachedEntries: MatchPredictionEntry[] | undefined;
  isLoading: boolean;
  positionByUser: Map<string, number>;
  sharedGroupsByUser: Map<string, string[]>;
}) {
  const [open, setOpen] = useState(false);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !cachedEntries && !isLoading) {
      fetchMatchPredictions(match.id);
    }
  };

  const entries = useMemo(() => {
    if (!cachedEntries) return [];
    const list = cachedEntries.map(e => {
      const partialPts = (match.home_score !== null && match.away_score !== null)
        ? calcPoints({ home_score_pred: e.home_score_pred, away_score_pred: e.away_score_pred }, match.home_score, match.away_score)
        : null;
      return { ...e, points: e.points ?? partialPts };
    });
    list.sort((a, b) => { if (a.user_id === currentUserId) return -1; if (b.user_id === currentUserId) return 1; return a.name.localeCompare(b.name); });
    return list;
  }, [cachedEntries, match.home_score, match.away_score, currentUserId]);

  return (
    <div className="mt-2">
      <button onClick={handleToggle} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full justify-center py-1">
        <span>{open ? 'Ocultar palpites' : 'Ver palpites'}</span>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <div className="mt-2 space-y-1 animate-reveal-up">
          {isLoading && !cachedEntries ? (
            <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : entries.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">Nenhum palpite registrado</p>
          ) : entries.map(e => {
            const getColor = (pts: number | null) => {
              if (pts === null) return 'bg-secondary';
              if (pts === 5) return 'bg-score-exact text-primary-foreground';
              if (pts === 2) return 'bg-score-partial text-accent-foreground';
              if (pts === -1) return 'bg-score-negative text-destructive-foreground';
              return 'bg-score-miss text-primary-foreground';
            };
            const getScoreEmoji = (pts: number | null) => {
              if (pts === null) return '';
              if (pts === 5) return '🔥';
              if (pts === 2) return '👀';
              if (pts === 0) return '🤞';
              if (pts === -1) return '🤣';
              return '';
            };
            const emoji = getScoreEmoji(e.points);
            const pos = positionByUser.get(e.user_id);
            const shared = sharedGroupsByUser.get(e.user_id) ?? [];
            return (
              <div key={e.user_id} className={`flex items-center justify-between px-3 py-1.5 rounded-md text-xs ${e.user_id === currentUserId ? 'bg-primary/5 font-semibold' : 'bg-secondary/50'}`}>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="flex items-center gap-1.5 min-w-0 flex-wrap">
                    {pos !== undefined && (
                      <span className="text-muted-foreground tabular-nums shrink-0">[{pos}º]</span>
                    )}
                    <span className="truncate">{e.name}</span>
                    {shared.map(g => (
                      <span key={g} className="inline-block px-1.5 py-0.5 rounded-full bg-accent/40 text-accent-foreground text-[9px] font-medium uppercase tracking-wide shrink-0">{g}</span>
                    ))}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${getColor(e.points)}`}>{e.home_score_pred}×{e.away_score_pred}</span>
                  {emoji && <span className="text-sm">{emoji}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PredictionsPage() {
  const { user } = useAuth();
  const { now: serverNow } = useServerTime();
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Map<string, Prediction>>(new Map());
  const [scores, setScores] = useState<Map<string, Score>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('PRÓXIMOS JOGOS');
  const [drafts, setDrafts] = useState<Map<string, { home: number; away: number }>>(new Map());
  const [, forceUpdate] = useState(0);

  // Lazy cache for "Ver palpites"
  const [matchPredictionsCache, setMatchPredictionsCache] = useState<Record<string, MatchPredictionEntry[]>>({});
  const [loadingMatchPredictions, setLoadingMatchPredictions] = useState<Record<string, boolean>>({});
  const cacheRef = useRef(matchPredictionsCache);
  cacheRef.current = matchPredictionsCache;

  useEffect(() => { fetchData(); }, [user]);

  const fetchMatches = async () => {
    const { data, error } = await supabase.from('matches').select('*').order('match_datetime', { ascending: true });
    if (error) { toast.error(error.message); return; }
    if (data) setMatches(data as Match[]);
  };

  const [positionByUser, setPositionByUser] = useState<Map<string, number>>(new Map());
  const [sharedGroupsByUser, setSharedGroupsByUser] = useState<Map<string, string[]>>(new Map());

  const fetchScores = async () => {
    if (!user) return;
    const { data, error } = await supabase.from('scores').select('*').eq('user_id', user.id);
    if (error) { toast.error(error.message); return; }
    if (data) { const map = new Map<string, Score>(); data.forEach(s => map.set(s.match_id, s)); setScores(map); }
  };

  const fetchRanking = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_ranking', {});
    if (error) return;
    const map = new Map<string, number>();
    (data ?? []).forEach((r) => map.set(r.out_user_id, r.out_position));
    setPositionByUser(map);
  }, []);

  const fetchSharedGroups = useCallback(async () => {
    if (!user) { setSharedGroupsByUser(new Map()); return; }
    const { data: myGroups } = await supabase
      .from('user_friendship_groups')
      .select('group_id')
      .eq('user_id', user.id);
    const groupIds = (myGroups ?? []).map(g => g.group_id);
    if (groupIds.length === 0) { setSharedGroupsByUser(new Map()); return; }
    const [{ data: members }, { data: groups }] = await Promise.all([
      supabase.from('user_friendship_groups').select('user_id, group_id').in('group_id', groupIds),
      supabase.from('friendship_groups').select('id, name').in('id', groupIds),
    ]);
    const groupNameById = new Map((groups ?? []).map(g => [g.id, g.name]));
    const map = new Map<string, string[]>();
    (members ?? []).forEach(m => {
      if (m.user_id === user.id) return;
      const name = groupNameById.get(m.group_id);
      if (!name) return;
      const arr = map.get(m.user_id) ?? [];
      if (!arr.includes(name)) arr.push(name);
      map.set(m.user_id, arr);
    });
    setSharedGroupsByUser(map);
  }, [user]);

  useEffect(() => { fetchRanking(); fetchSharedGroups(); }, [fetchRanking, fetchSharedGroups]);

  const fetchMatchPredictions = useCallback(async (matchId: string) => {
    setLoadingMatchPredictions(prev => ({ ...prev, [matchId]: true }));
    try {
      const [predRes, scoreRes, profilesRes] = await Promise.all([
        supabase.from('predictions').select('user_id, home_score_pred, away_score_pred').eq('match_id', matchId),
        supabase.from('scores').select('user_id, points').eq('match_id', matchId),
        supabase.from('profiles').select('user_id, name').eq('is_approved', true),
      ]);
      if (predRes.error) throw predRes.error;
      if (scoreRes.error) throw scoreRes.error;
      if (profilesRes.error) throw profilesRes.error;

      const profileMap = new Map((profilesRes.data ?? []).map(p => [p.user_id, p.name]));
      const scoreMap = new Map((scoreRes.data ?? []).map(s => [s.user_id, s.points]));
      const entries: MatchPredictionEntry[] = (predRes.data ?? [])
        .filter(p => profileMap.has(p.user_id))
        .map(p => ({
          user_id: p.user_id,
          name: profileMap.get(p.user_id) ?? 'Desconhecido',
          home_score_pred: p.home_score_pred,
          away_score_pred: p.away_score_pred,
          points: scoreMap.has(p.user_id) ? (scoreMap.get(p.user_id) as number) : null,
        }));
      setMatchPredictionsCache(prev => ({ ...prev, [matchId]: entries }));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingMatchPredictions(prev => ({ ...prev, [matchId]: false }));
    }
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('matches-realtime-pred')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, (payload: any) => {
        fetchMatches();
        const mid = payload?.new?.id;
        if (mid && cacheRef.current[mid]) {
          // refresh cached match predictions if this match's data is open
          fetchMatchPredictions(mid);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, (payload: any) => {
        fetchScores();
        const mid = payload?.new?.match_id ?? payload?.old?.match_id;
        if (mid && cacheRef.current[mid]) {
          fetchMatchPredictions(mid);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'predictions' }, (payload: any) => {
        const mid = payload?.new?.match_id ?? payload?.old?.match_id;
        if (mid && cacheRef.current[mid]) {
          fetchMatchPredictions(mid);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchMatchPredictions]);

  const fetchData = async () => {
    if (!user) return;
    const [matchRes, predRes, scoreRes] = await Promise.all([
      supabase.from('matches').select('*').order('match_datetime', { ascending: true }),
      supabase.from('predictions').select('*').eq('user_id', user.id),
      supabase.from('scores').select('*').eq('user_id', user.id),
    ]);

    if (matchRes.error) { toast.error(matchRes.error.message); }
    if (predRes.error) { toast.error(predRes.error.message); }
    if (scoreRes.error) { toast.error(scoreRes.error.message); }

    if (matchRes.data) setMatches(matchRes.data as Match[]);
    if (predRes.data) { const map = new Map<string, Prediction>(); predRes.data.forEach(p => map.set(p.match_id, p)); setPredictions(map); }
    if (scoreRes.data) { const map = new Map<string, Score>(); scoreRes.data.forEach(s => map.set(s.match_id, s)); setScores(map); }
    setLoading(false);
  };

  const isLocked = useCallback((match: Match) => {
    return match.is_finished || match.is_started || new Date(match.match_datetime).getTime() - LOCK_MINUTES * 60 * 1000 <= serverNow();
  }, [serverNow]);

  const handleTimerExpired = useCallback(() => { forceUpdate(n => n + 1); }, []);

  const filteredMatches = useMemo(() => {
    if (filter === 'PRÓXIMOS JOGOS') {
      const now = serverNow();
      const salvadorOffset = -3 * 60;
      const salvadorMs = now + salvadorOffset * 60 * 1000;
      const salvadorDate = new Date(salvadorMs);
      const year = salvadorDate.getUTCFullYear();
      const month = salvadorDate.getUTCMonth();
      const day = salvadorDate.getUTCDate();
      let cutoffUtc = new Date(Date.UTC(year, month, day, 7, 0, 0, 0));
      if (now < cutoffUtc.getTime()) cutoffUtc = new Date(cutoffUtc.getTime() - 24 * 60 * 60 * 1000);
      const nextCutoffUtc = new Date(cutoffUtc.getTime() + 24 * 60 * 60 * 1000);
      const upcoming = matches
        .filter(m => { const mt = new Date(m.match_datetime).getTime(); return mt >= cutoffUtc.getTime() && mt < nextCutoffUtc.getTime(); })
        .sort((a, b) => new Date(a.match_datetime).getTime() - new Date(b.match_datetime).getTime());
      if (upcoming.length === 0) {
        return matches.filter(m => new Date(m.match_datetime).getTime() >= cutoffUtc.getTime())
          .sort((a, b) => new Date(a.match_datetime).getTime() - new Date(b.match_datetime).getTime()).slice(0, 4);
      }
      return upcoming;
    }
    if (filter === 'GRUPOS') {
      const getGroupOrder = (name: string) => { const ki = KNOCKOUT_PHASES.indexOf(name); if (ki !== -1) return `ZZ_${ki.toString().padStart(2, '0')}`; return name; };
      return [...matches].sort((a, b) => getGroupOrder(a.group_name).localeCompare(getGroupOrder(b.group_name)) || new Date(a.match_datetime).getTime() - new Date(b.match_datetime).getTime());
    }
    if (filter === 'MATA-MATA') {
      return matches
        .filter(m => KNOCKOUT_PHASES.includes(m.group_name))
        .sort((a, b) => KNOCKOUT_PHASES.indexOf(a.group_name) - KNOCKOUT_PHASES.indexOf(b.group_name) || new Date(a.match_datetime).getTime() - new Date(b.match_datetime).getTime());
    }
    return matches;
  }, [matches, filter, serverNow]);

  const getDraft = (matchId: string) => { const draft = drafts.get(matchId); const pred = predictions.get(matchId); return draft ?? (pred ? { home: pred.home_score_pred, away: pred.away_score_pred } : { home: 0, away: 0 }); };
  const setDraft = (matchId: string, home: number, away: number) => { setDrafts(prev => new Map(prev).set(matchId, { home, away })); };

  const savePrediction = async (match: Match) => {
    if (!user) return;
    const draft = getDraft(match.id);
    setSaving(match.id);
    const existing = predictions.get(match.id);
    try {
      if (existing) {
        const { error } = await supabase.from('predictions').update({ home_score_pred: draft.home, away_score_pred: draft.away }).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('predictions').insert({ user_id: user.id, match_id: match.id, home_score_pred: draft.home, away_score_pred: draft.away });
        if (error) throw error;
      }
      await fetchData();
      setDrafts(prev => { const n = new Map(prev); n.delete(match.id); return n; });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(null);
    }
  };

  const getButtonState = (matchId: string) => {
    const pred = predictions.get(matchId);
    const draft = drafts.get(matchId);
    if (!pred) return { label: 'Salvar palpite', disabled: false, saved: false };
    if (!draft || (draft.home === pred.home_score_pred && draft.away === pred.away_score_pred)) return { label: 'Salvo ✓', disabled: true, saved: true };
    return { label: 'Alterar e salvar', disabled: false, saved: false };
  };

  if (loading) {
    return <AppLayout><div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all active:scale-[0.98] ${filter === f ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
              {f}
            </button>
          ))}
        </div>

        {filteredMatches.length === 0 ? (
          <div className="glass-card p-8 text-center"><p className="text-muted-foreground text-sm">Nenhum jogo neste filtro</p></div>
        ) : (
          <div className="space-y-3">
            {filteredMatches.map((match, i) => {
              const locked = isLocked(match);
              const pred = predictions.get(match.id);
              const score = scores.get(match.id);
              const draft = getDraft(match.id);
              const isProvisional = score?.is_provisional === true;
              const displayPoints = score?.points ?? null;
              const btnState = getButtonState(match.id);

              return (
                <div key={match.id} className="glass-card p-4 animate-reveal-up relative" style={{ animationDelay: `${Math.min(i * 60, 300)}ms` }}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      {match.group_name.length === 1 ? `Grupo ${match.group_name}` : match.group_name} · {format(new Date(match.match_datetime), "dd MMM · HH:mm", { locale: ptBR })}
                    </span>
                    <div className="flex items-center gap-2">
                      {!locked && (
                        <CountdownTimer datetime={match.match_datetime} serverNow={serverNow} onExpired={handleTimerExpired} />
                      )}
                      <MatchStatusBadge match={match} serverNow={serverNow} />
                    </div>
                  </div>

                  <div className="grid gap-2" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
                    <div className="flex items-center justify-end gap-1 min-w-0">
                      <p className="text-sm font-medium text-right" style={{ wordBreak: 'break-word' }}>{match.home_team}</p>
                      <CountryFlag name={match.home_team} side="home" />
                    </div>
                    {locked ? (
                      <div className="flex items-center gap-2">
                        {pred ? (
                          <span className="font-bold tabular-nums text-sm">{pred.home_score_pred} × {pred.away_score_pred}</span>
                        ) : (
                          <span className="text-muted-foreground text-sm">— × —</span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <ScoreInput value={draft.home} onChange={v => setDraft(match.id, v, draft.away)} disabled={false} />
                        <span className="text-muted-foreground text-xs mx-0.5">×</span>
                        <ScoreInput value={draft.away} onChange={v => setDraft(match.id, draft.home, v)} disabled={false} />
                      </div>
                    )}
                    <div className="flex items-center gap-1 min-w-0">
                      <CountryFlag name={match.away_team} side="away" />
                      <p className="text-sm font-medium text-left" style={{ wordBreak: 'break-word' }}>{match.away_team}</p>
                    </div>
                  </div>

                  {(match.is_started || match.is_finished) && match.home_score !== null && match.away_score !== null && (
                    <div className="text-center mt-2">
                      <span className="text-xs text-muted-foreground">Placar: </span>
                      <span className="text-xs font-bold">{match.home_score} × {match.away_score}</span>
                    </div>
                  )}

                  {displayPoints !== null && (
                    <div className="text-center mt-2">
                      <ScoreBadge points={displayPoints} isProvisional={isProvisional} />
                    </div>
                  )}

                  {!locked && (
                    <div className="mt-3">
                      <Button size="sm" onClick={() => savePrediction(match)} disabled={saving === match.id || btnState.disabled}
                        className={`w-full text-xs active:scale-[0.97] ${btnState.saved ? 'opacity-60' : ''}`}>
                        {saving === match.id ? <Loader2 className="h-3 w-3 animate-spin" /> :
                          btnState.saved ? <><Check className="h-3 w-3 mr-1" /> {btnState.label}</> : btnState.label}
                      </Button>
                    </div>
                  )}

                  {locked && (
                    <ExpandablePredictions
                      match={match}
                      currentUserId={user?.id ?? ''}
                      fetchMatchPredictions={fetchMatchPredictions}
                      cachedEntries={matchPredictionsCache[match.id]}
                      isLoading={!!loadingMatchPredictions[match.id]}
                      positionByUser={positionByUser}
                      sharedGroupsByUser={sharedGroupsByUser}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
