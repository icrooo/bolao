import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Loader2, Check, Lock, Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { format, isToday, isTomorrow, differenceInSeconds } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Match = {
  id: string;
  home_team: string;
  away_team: string;
  match_datetime: string;
  group_name: string;
  home_score: number | null;
  away_score: number | null;
  is_finished: boolean;
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

const FILTERS = ['TODOS', 'HOJE', 'EM ABERTO', 'GRUPOS'] as const;
const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

function ScoreBadge({ points }: { points: number }) {
  const cls = points === 5 ? 'score-badge-5' : points === 2 ? 'score-badge-2' : points === -1 ? 'score-badge-negative' : 'score-badge-0';
  return (
    <span className={`${cls} text-xs font-bold px-2 py-0.5 rounded-full`}>
      {points > 0 ? '+' : ''}{points} pts
    </span>
  );
}

function CountdownTimer({ datetime }: { datetime: string }) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const lockTime = new Date(new Date(datetime).getTime() - 30 * 60 * 1000);

  useEffect(() => {
    const update = () => setSecondsLeft(Math.max(0, differenceInSeconds(lockTime, new Date())));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [datetime]);

  if (secondsLeft <= 0) return <span className="text-xs text-destructive flex items-center gap-1"><Lock className="h-3 w-3" /> Bloqueado</span>;

  const d = Math.floor(secondsLeft / 86400);
  const h = Math.floor((secondsLeft % 86400) / 3600);
  const m = Math.floor((secondsLeft % 3600) / 60);
  const s = secondsLeft % 60;

  return (
    <span className="text-xs text-muted-foreground tabular-nums">
      {d > 0 ? `${d}d ` : ''}{h.toString().padStart(2, '0')}h {m.toString().padStart(2, '0')}min {s.toString().padStart(2, '0')}s
    </span>
  );
}

function ScoreInput({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={disabled || value <= 0}
        onClick={() => onChange(Math.max(0, value - 1))}
        className="h-7 w-7 flex items-center justify-center rounded-md bg-secondary text-foreground disabled:opacity-30 active:scale-95 transition-transform"
      >
        <Minus className="h-3 w-3" />
      </button>
      <span className="w-6 text-center font-bold tabular-nums">{value}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(value + 1)}
        className="h-7 w-7 flex items-center justify-center rounded-md bg-secondary text-foreground disabled:opacity-30 active:scale-95 transition-transform"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}

export default function PredictionsPage() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Map<string, Prediction>>(new Map());
  const [scores, setScores] = useState<Map<string, Score>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('TODOS');
  const [drafts, setDrafts] = useState<Map<string, { home: number; away: number }>>(new Map());

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    const [matchRes, predRes, scoreRes] = await Promise.all([
      supabase.from('matches').select('*').order('match_datetime', { ascending: true }),
      supabase.from('predictions').select('*').eq('user_id', user.id),
      supabase.from('scores').select('*').eq('user_id', user.id),
    ]);

    if (matchRes.data) setMatches(matchRes.data);
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
    setLoading(false);
  };

  const isLocked = (match: Match) => {
    return match.is_finished || new Date(match.match_datetime).getTime() - 30 * 60 * 1000 <= Date.now();
  };

  const filteredMatches = useMemo(() => {
    let filtered = matches.filter(m => {
      if (filter === 'GRUPOS') return true;
      if (filter === 'HOJE') {
        const dt = new Date(m.match_datetime);
        return isToday(dt) || isTomorrow(dt);
      }
      if (filter === 'EM ABERTO') return !predictions.has(m.id) && !isLocked(m);
      return true;
    });
    if (filter === 'GRUPOS') {
      filtered = [...filtered].sort((a, b) => a.group_name.localeCompare(b.group_name) || new Date(a.match_datetime).getTime() - new Date(b.match_datetime).getTime());
    }
    return filtered;
  }, [matches, filter, predictions]);

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
      toast.success('Palpite salvo!');
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
        {/* Group headers when GRUPOS filter is active */}
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

              return (
                <div
                  key={match.id}
                  className="glass-card p-4 animate-reveal-up"
                  style={{ animationDelay: `${Math.min(i * 60, 300)}ms` }}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Grupo {match.group_name} · {format(new Date(match.match_datetime), "dd MMM · HH:mm", { locale: ptBR })}
                    </span>
                    {match.is_finished && score && <ScoreBadge points={score.points} />}
                    {!match.is_finished && <CountdownTimer datetime={match.match_datetime} />}
                  </div>

                  {/* Teams + Scores */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 text-right">
                      <p className="font-medium text-sm">{match.home_team}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {match.is_finished ? (
                        <div className="flex items-center gap-1 bg-foreground/5 px-3 py-1.5 rounded-lg">
                          <span className="font-bold tabular-nums">{match.home_score}</span>
                          <span className="text-muted-foreground text-xs">×</span>
                          <span className="font-bold tabular-nums">{match.away_score}</span>
                        </div>
                      ) : (
                        <>
                          <ScoreInput value={draft.home} onChange={v => setDraft(match.id, v, draft.away)} disabled={locked} />
                          <span className="text-muted-foreground text-xs">×</span>
                          <ScoreInput value={draft.away} onChange={v => setDraft(match.id, draft.home, v)} disabled={locked} />
                        </>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{match.away_team}</p>
                    </div>
                  </div>

                  {/* Prediction indicator + Save */}
                  {!match.is_finished && (
                    <div className="flex items-center justify-between mt-3">
                      {pred && !changed ? (
                        <span className="text-xs text-primary flex items-center gap-1">
                          <Check className="h-3 w-3" /> Palpite salvo
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {pred ? 'Palpite alterado' : 'Sem palpite'}
                        </span>
                      )}
                      {!locked && (changed || !pred) && (
                        <Button
                          size="sm"
                          onClick={() => savePrediction(match)}
                          disabled={saving === match.id}
                          className="h-7 text-xs active:scale-95"
                        >
                          {saving === match.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Salvar'}
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Show user's prediction for finished match */}
                  {match.is_finished && pred && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Seu palpite: {pred.home_score_pred} × {pred.away_score_pred}
                    </p>
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
