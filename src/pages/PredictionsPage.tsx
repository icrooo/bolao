import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useServerTime } from '@/hooks/useServerTime';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Loader2, Check, Lock, Minus, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getFlagUrl } from '@/lib/countryFlags';

type Match = {
  id: string;
  home_team: string;
  away_team: string;
  match_datetime: string;
  group_name: string;
  home_score: number | null;
  away_score: number | null;
  is_finished: boolean;
  is_started: boolean;
};

type Prediction = {
  id: string;
  match_id: string;
  home_score_pred: number;
  away_score_pred: number;
};

type Score = {
  match_id: string;
  points: number;
};

type AllPrediction = {
  user_id: string;
  match_id: string;
  home_score_pred: number;
  away_score_pred: number;
};

type Profile = { user_id: string; name: string };

const LOCK_MINUTES = 10;
const FILTERS = ['PRÓXIMOS JOGOS', 'TODOS', 'GRUPOS'] as const;

function CountryFlag({ name, side }: { name: string; side: 'home' | 'away' }) {
  const url = getFlagUrl(name, 24);
  if (!url) return null;
  return (
    <img
      src={url}
      alt={name}
      className={`w-5 h-4 object-cover rounded-sm ${side === 'home' ? 'ml-1' : 'mr-1'}`}
      loading="lazy"
    />
  );
}

function ScoreBadge({ points }: { points: number }) {
  const cls = points === 5 ? 'score-badge-5' : points === 2 ? 'score-badge-2' : points === -1 ? 'score-badge-negative' : 'score-badge-0';
  return (
    <span className={`${cls} text-xs font-bold px-2 py-0.5 rounded-full`}>
      {points > 0 ? '+' : ''}{points} pts
    </span>
  );
}

function MatchStatusBadge({ match, serverNow }: { match: Match; serverNow: () => number }) {
  if (match.is_finished) {
    return (
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-foreground/10 text-foreground">
        Encerrado
      </span>
    );
  }
  if (match.is_started) {
    return (
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-500/15 text-green-600">
        Em andamento
      </span>
    );
  }
  const lockTime = new Date(match.match_datetime).getTime() - LOCK_MINUTES * 60 * 1000;
  if (serverNow() >= lockTime) {
    return (
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-destructive/15 text-destructive flex items-center gap-1">
        <Lock className="h-3 w-3" /> Bloqueado
      </span>
    );
  }
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

  return (
    <span className="text-xs text-muted-foreground tabular-nums">
      Bloqueia em {d > 0 ? `${d}d ` : ''}{h.toString().padStart(2, '0')}h {m.toString().padStart(2, '0')}min {s.toString().padStart(2, '0')}s
    </span>
  );
}

function ScoreInput({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled: boolean }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(value + 1)}
        className="h-6 w-7 flex items-center justify-center rounded-md bg-secondary text-foreground disabled:opacity-30 active:scale-95 transition-transform"
      >
        <Plus className="h-3 w-3" />
      </button>
      <span className="w-6 text-center font-bold tabular-nums">{value}</span>
      <button
        type="button"
        disabled={disabled || value <= 0}
        onClick={() => onChange(Math.max(0, value - 1))}
        className="h-6 w-7 flex items-center justify-center rounded-md bg-secondary text-foreground disabled:opacity-30 active:scale-95 transition-transform"
      >
        <Minus className="h-3 w-3" />
      </button>
    </div>
  );
}

/** Calculate points for a prediction given actual scores */
function calcPoints(pred: { home_score_pred: number; away_score_pred: number }, homeScore: number, awayScore: number): number {
  if (pred.home_score_pred === homeScore && pred.away_score_pred === awayScore) return 5;
  if (pred.home_score_pred === awayScore && pred.away_score_pred === homeScore) return -1;
  if ((pred.home_score_pred > pred.away_score_pred && homeScore > awayScore) ||
      (pred.home_score_pred < pred.away_score_pred && homeScore < awayScore) ||
      (pred.home_score_pred === pred.away_score_pred && homeScore === awayScore)) return 2;
  return 0;
}

function ExpandablePredictions({
  match, currentUserId, allPredictions, allProfiles, allScores,
}: {
  match: Match;
  currentUserId: string;
  allPredictions: AllPrediction[];
  allProfiles: Profile[];
  allScores: { user_id: string; match_id: string; points: number }[];
}) {
  const [open, setOpen] = useState(false);

  const matchPreds = allPredictions.filter(p => p.match_id === match.id);
  const matchScores = allScores.filter(s => s.match_id === match.id);

  const entries = matchPreds.map(p => {
    const profile = allProfiles.find(pr => pr.user_id === p.user_id);
    const score = matchScores.find(s => s.user_id === p.user_id);
    const partialPts = (match.home_score !== null && match.away_score !== null)
      ? calcPoints(p, match.home_score, match.away_score)
      : null;
    return {
      user_id: p.user_id,
      name: profile?.name ?? 'Desconhecido',
      home_score_pred: p.home_score_pred,
      away_score_pred: p.away_score_pred,
      points: score?.points ?? partialPts,
    };
  });

  entries.sort((a, b) => {
    if (a.user_id === currentUserId) return -1;
    if (b.user_id === currentUserId) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full justify-center py-1"
      >
        <span>{open ? 'Ocultar palpites' : 'Ver palpites'}</span>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <div className="mt-2 space-y-1 animate-reveal-up">
          {entries.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">Nenhum palpite registrado</p>
          ) : entries.map(e => {
            const getColor = (pts: number | null) => {
              if (pts === null) return 'bg-secondary';
              if (pts === 5) return 'bg-score-exact text-primary-foreground';
              if (pts === 2) return 'bg-score-partial text-accent-foreground';
              if (pts === -1) return 'bg-score-negative text-destructive-foreground';
              return 'bg-score-miss text-primary-foreground';
            };
            return (
              <div key={e.user_id} className={`flex items-center justify-between px-3 py-1.5 rounded-md text-xs ${e.user_id === currentUserId ? 'bg-primary/5 font-semibold' : 'bg-secondary/50'}`}>
                <span className="truncate flex-1">{e.name}</span>
                <div className="flex items-center gap-2">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${getColor(e.points)}`}>
                    {e.home_score_pred}×{e.away_score_pred}
                  </span>
                  {e.points !== null && (
                    <span className="text-[10px] font-bold tabular-nums w-8 text-right">
                      {e.points > 0 ? '+' : ''}{e.points}
                    </span>
                  )}
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
  const [savedMatches, setSavedMatches] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<string>('PRÓXIMOS JOGOS');
  const [drafts, setDrafts] = useState<Map<string, { home: number; away: number }>>(new Map());
  const [, forceUpdate] = useState(0);

  const [allPredictions, setAllPredictions] = useState<AllPrediction[]>([]);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [allScores, setAllScores] = useState<{ user_id: string; match_id: string; points: number }[]>([]);

  useEffect(() => { fetchData(); }, [user]);

  useEffect(() => {
    const channel = supabase
      .channel('matches-realtime-pred')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, () => fetchMatches())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => { fetchScores(); fetchAllScores(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'predictions' }, () => fetchAllPredictions())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const fetchMatches = async () => {
    const { data } = await supabase.from('matches').select('*').order('match_datetime', { ascending: true });
    if (data) setMatches(data as Match[]);
  };

  const fetchScores = async () => {
    if (!user) return;
    const { data } = await supabase.from('scores').select('*').eq('user_id', user.id);
    if (data) {
      const map = new Map<string, Score>();
      data.forEach(s => map.set(s.match_id, s));
      setScores(map);
    }
  };

  const fetchAllPredictions = async () => {
    const { data } = await supabase.from('predictions').select('user_id, match_id, home_score_pred, away_score_pred');
    if (data) setAllPredictions(data);
  };

  const fetchAllScores = async () => {
    const { data } = await supabase.from('scores').select('user_id, match_id, points');
    if (data) setAllScores(data);
  };

  const fetchData = async () => {
    if (!user) return;
    const [matchRes, predRes, scoreRes, allPredRes, profilesRes, allScoresRes] = await Promise.all([
      supabase.from('matches').select('*').order('match_datetime', { ascending: true }),
      supabase.from('predictions').select('*').eq('user_id', user.id),
      supabase.from('scores').select('*').eq('user_id', user.id),
      supabase.from('predictions').select('user_id, match_id, home_score_pred, away_score_pred'),
      supabase.from('profiles').select('user_id, name').eq('is_approved', true),
      supabase.from('scores').select('user_id, match_id, points'),
    ]);

    if (matchRes.data) setMatches(matchRes.data as Match[]);
    if (predRes.data) {
      const map = new Map<string, Prediction>();
      predRes.data.forEach(p => map.set(p.match_id, p));
      setPredictions(map);
    }
    if (scoreRes.data) {
      const map = new Map<string, Score>();
      scoreRes.data.forEach(s => map.set(s.match_id, s));
      setScores(map);
    }
    if (allPredRes.data) setAllPredictions(allPredRes.data);
    if (profilesRes.data) setAllProfiles(profilesRes.data);
    if (allScoresRes.data) setAllScores(allScoresRes.data);
    setLoading(false);
  };

  const isLocked = useCallback((match: Match) => {
    return match.is_finished || match.is_started || new Date(match.match_datetime).getTime() - LOCK_MINUTES * 60 * 1000 <= serverNow();
  }, [serverNow]);

  const handleTimerExpired = useCallback(() => {
    forceUpdate(n => n + 1);
  }, []);

  const filteredMatches = useMemo(() => {
    if (filter === 'PRÓXIMOS JOGOS') {
      const now = serverNow();
      // Salvador timezone is UTC-3. Calculate 4AM today in Salvador.
      const salvadorOffset = -3 * 60; // minutes
      const utcNow = new Date(now);
      // Current time in Salvador
      const salvadorMs = now + salvadorOffset * 60 * 1000;
      const salvadorDate = new Date(salvadorMs);
      
      // Build today's 4AM in Salvador, then convert to UTC
      const year = salvadorDate.getUTCFullYear();
      const month = salvadorDate.getUTCMonth();
      const day = salvadorDate.getUTCDate();
      // 4AM Salvador = 7AM UTC (4 - (-3) = 7)
      let cutoffUtc = new Date(Date.UTC(year, month, day, 7, 0, 0, 0));
      // If we haven't passed this cutoff yet, go back one day
      if (now < cutoffUtc.getTime()) {
        cutoffUtc = new Date(cutoffUtc.getTime() - 24 * 60 * 60 * 1000);
      }
      const nextCutoffUtc = new Date(cutoffUtc.getTime() + 24 * 60 * 60 * 1000);

      // Show matches from current cutoff window (today 4AM to tomorrow 4AM Salvador)
      const upcoming = matches
        .filter(m => {
          const mt = new Date(m.match_datetime).getTime();
          return !m.is_finished && mt >= cutoffUtc.getTime() && mt < nextCutoffUtc.getTime();
        })
        .sort((a, b) => new Date(a.match_datetime).getTime() - new Date(b.match_datetime).getTime());
      
      // If no matches in current window, show next upcoming matches regardless of window
      if (upcoming.length === 0) {
        return matches
          .filter(m => !m.is_finished && new Date(m.match_datetime).getTime() >= now)
          .sort((a, b) => new Date(a.match_datetime).getTime() - new Date(b.match_datetime).getTime())
          .slice(0, 4);
      }
      return upcoming;
    }
    if (filter === 'GRUPOS') {
      return [...matches].sort((a, b) => a.group_name.localeCompare(b.group_name) || new Date(a.match_datetime).getTime() - new Date(b.match_datetime).getTime());
    }
    return matches;
  }, [matches, filter, serverNow]);

  const getDraft = (matchId: string) => {
    const draft = drafts.get(matchId);
    const pred = predictions.get(matchId);
    return draft ?? (pred ? { home: pred.home_score_pred, away: pred.away_score_pred } : { home: 0, away: 0 });
  };

  const setDraft = (matchId: string, home: number, away: number) => {
    setDrafts(prev => new Map(prev).set(matchId, { home, away }));
  };

  const savePrediction = async (match: Match) => {
    if (!user) return;
    const draft = getDraft(match.id);
    setSaving(match.id);

    const existing = predictions.get(match.id);
    try {
      if (existing) {
        const { error } = await supabase
          .from('predictions')
          .update({ home_score_pred: draft.home, away_score_pred: draft.away })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('predictions')
          .insert({ user_id: user.id, match_id: match.id, home_score_pred: draft.home, away_score_pred: draft.away });
        if (error) throw error;
      }
      setSavedMatches(prev => new Set(prev).add(match.id));
      await fetchData();
      setDrafts(prev => { const n = new Map(prev); n.delete(match.id); return n; });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(null);
    }
  };

  const hasDraftChanged = (matchId: string) => {
    const draft = drafts.get(matchId);
    if (!draft) return false;
    const pred = predictions.get(matchId);
    if (!pred) return true;
    return draft.home !== pred.home_score_pred || draft.away !== pred.away_score_pred;
  };

  const getPartialPoints = (match: Match, pred: Prediction | undefined) => {
    if (!pred) return null;
    if (match.home_score === null || match.away_score === null) return null;
    return calcPoints(pred, match.home_score, match.away_score);
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors active:scale-95 ${
                filter === f
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Match Cards */}
        {filteredMatches.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <p className="text-muted-foreground text-sm">Nenhum jogo encontrado</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredMatches.map((match, i) => {
              const locked = isLocked(match);
              const pred = predictions.get(match.id);
              const score = scores.get(match.id);
              const draft = getDraft(match.id);
              const changed = hasDraftChanged(match.id);
              const partialPoints = !match.is_finished ? getPartialPoints(match, pred) : null;
              const showExpandable = locked && !match.is_finished;

              return (
                <div
                  key={match.id}
                  className={`glass-card p-4 animate-reveal-up ${
                    match.is_finished
                      ? 'border-l-4 border-l-foreground/30 bg-muted/40 opacity-80'
                      : match.is_started
                        ? 'border-l-4 border-l-green-500/50'
                        : ''
                  }`}
                  style={{ animationDelay: `${Math.min(i * 60, 300)}ms` }}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Grupo {match.group_name} · {format(new Date(match.match_datetime), "dd MMM · HH:mm", { locale: ptBR })}
                    </span>
                    <div className="flex items-center gap-2">
                      {match.is_finished && score && <ScoreBadge points={score.points} />}
                      {!match.is_finished && partialPoints !== null && <ScoreBadge points={partialPoints} />}
                      <MatchStatusBadge match={match} serverNow={serverNow} />
                      {!match.is_finished && !match.is_started && !locked && (
                        <CountdownTimer datetime={match.match_datetime} serverNow={serverNow} onExpired={handleTimerExpired} />
                      )}
                    </div>
                  </div>

                  {/* Teams + Scores */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center justify-end gap-1">
                      <p className="font-medium text-sm text-right truncate">{match.home_team}</p>
                      <CountryFlag name={match.home_team} side="home" />
                    </div>
                    <div className="flex items-center gap-2">
                      {match.is_finished || match.is_started ? (
                        <div className="flex items-center gap-1 bg-foreground/5 px-3 py-1.5 rounded-lg">
                          <span className="font-bold tabular-nums">{match.home_score ?? '-'}</span>
                          <span className="text-muted-foreground text-xs">×</span>
                          <span className="font-bold tabular-nums">{match.away_score ?? '-'}</span>
                        </div>
                      ) : locked ? (
                        <div className="flex items-center gap-1 bg-foreground/5 px-3 py-1.5 rounded-lg">
                          <span className="text-muted-foreground text-xs">—</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <ScoreInput value={draft.home} onChange={v => setDraft(match.id, v, draft.away)} disabled={locked} />
                          <span className="text-muted-foreground text-xs">×</span>
                          <ScoreInput value={draft.away} onChange={v => setDraft(match.id, draft.home, v)} disabled={locked} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 flex items-center gap-1">
                      <CountryFlag name={match.away_team} side="away" />
                      <p className="font-medium text-sm truncate">{match.away_team}</p>
                    </div>
                  </div>

                  {/* Save button (only for unlocked, not started/finished) */}
                  {!match.is_finished && !match.is_started && !locked && (
                    <div className="flex items-center justify-end mt-3">
                      {(() => {
                        const justSaved = savedMatches.has(match.id) && !changed;
                        const hasPred = !!pred;
                        const isDisabled = saving === match.id || (hasPred && !changed && justSaved);
                        const label = saving === match.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : justSaved && !changed
                            ? <><Check className="h-3 w-3 mr-1" /> Salvo!</>
                            : hasPred && changed
                              ? 'Alterar'
                              : hasPred && !changed
                                ? <><Check className="h-3 w-3 mr-1" /> Salvo!</>
                                : 'Salvar';
                        return (
                          <Button
                            size="sm"
                            onClick={() => savePrediction(match)}
                            disabled={isDisabled}
                            className={`h-7 text-xs active:scale-95 ${
                              (justSaved || (hasPred && !changed))
                                ? 'bg-foreground/30 text-foreground/50 cursor-not-allowed'
                                : 'bg-foreground text-background hover:bg-foreground/90'
                            }`}
                          >
                            {label}
                          </Button>
                        );
                      })()}
                    </div>
                  )}

                  {/* Expandable predictions for locked/in-progress/finished matches */}
                  {(showExpandable || match.is_finished) && user && (
                    <ExpandablePredictions
                      match={match}
                      currentUserId={user.id}
                      allPredictions={allPredictions}
                      allProfiles={allProfiles}
                      allScores={allScores}
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
