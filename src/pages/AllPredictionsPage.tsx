import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Profile = { user_id: string; name: string };
type Match = { id: string; home_team: string; away_team: string; match_datetime: string; is_finished: boolean };
type Prediction = { user_id: string; match_id: string; home_score_pred: number; away_score_pred: number };
type Score = { user_id: string; match_id: string; points: number };

export default function AllPredictionsPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const [profRes, matchRes, predRes, scoreRes] = await Promise.all([
        supabase.from('profiles').select('user_id, name').eq('is_approved', true),
        supabase.from('matches').select('id, home_team, away_team, match_datetime, is_finished').eq('is_finished', true).order('match_datetime'),
        supabase.from('predictions').select('user_id, match_id, home_score_pred, away_score_pred'),
        supabase.from('scores').select('user_id, match_id, points'),
      ]);
      if (profRes.data) setProfiles(profRes.data);
      if (matchRes.data) setMatches(matchRes.data);
      if (predRes.data) setPredictions(predRes.data);
      if (scoreRes.data) setScores(scoreRes.data);
      setLoading(false);
    };
    fetch();
  }, []);

  const getPrediction = (userId: string, matchId: string) =>
    predictions.find(p => p.user_id === userId && p.match_id === matchId);

  const getScore = (userId: string, matchId: string) =>
    scores.find(s => s.user_id === userId && s.match_id === matchId);

  const getScoreColor = (points: number) => {
    if (points === 5) return 'bg-score-exact text-primary-foreground';
    if (points === 2) return 'bg-score-partial text-accent-foreground';
    if (points === -1) return 'bg-score-negative text-destructive-foreground';
    return 'bg-score-miss text-primary-foreground';
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (matches.length === 0) {
    return (
      <AppLayout>
        <div className="glass-card p-8 text-center">
          <p className="text-muted-foreground text-sm">Nenhum jogo finalizado ainda</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">Palpites de todos os participantes para jogos finalizados</p>

        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 bg-background z-10 text-left py-2 pr-2 font-medium text-muted-foreground">Nome</th>
                {matches.map(m => (
                  <th key={m.id} className="text-center px-1 py-2 font-normal">
                    <div className="text-[9px] text-muted-foreground whitespace-nowrap">
                      {m.home_team.slice(0, 3).toUpperCase()}×{m.away_team.slice(0, 3).toUpperCase()}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile, i) => (
                <tr key={profile.user_id} className="animate-reveal-up" style={{ animationDelay: `${Math.min(i * 40, 200)}ms` }}>
                  <td className="sticky left-0 bg-background z-10 py-1.5 pr-2 font-medium whitespace-nowrap">{profile.name}</td>
                  {matches.map(match => {
                    const pred = getPrediction(profile.user_id, match.id);
                    const score = getScore(profile.user_id, match.id);
                    if (!pred) return <td key={match.id} className="text-center px-1 py-1.5"><span className="text-muted-foreground">—</span></td>;
                    return (
                      <td key={match.id} className="text-center px-1 py-1.5">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${score ? getScoreColor(score.points) : 'bg-secondary'}`}>
                          {pred.home_score_pred}×{pred.away_score_pred}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
