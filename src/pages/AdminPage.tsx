import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Loader2, Plus, Minus, Trophy, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Profile = { id: string; user_id: string; name: string; email: string | null; is_approved: boolean; created_at: string };
type Match = {
  id: string; home_team: string; away_team: string; match_datetime: string;
  group_name: string; home_score: number | null; away_score: number | null; is_finished: boolean;
};

export default function AdminPage() {
  const [tab, setTab] = useState<'matches' | 'users'>('matches');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddMatch, setShowAddMatch] = useState(false);
  const [newMatch, setNewMatch] = useState({ home_team: '', away_team: '', match_datetime: '', group_name: '' });
  const [finishingMatch, setFinishingMatch] = useState<string | null>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const [profRes, matchRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('matches').select('*').order('match_datetime', { ascending: true }),
    ]);
    if (profRes.data) setProfiles(profRes.data as Profile[]);
    if (matchRes.data) setMatches(matchRes.data);
    setLoading(false);
  };

  const approveUser = async (userId: string, approve: boolean) => {
    const { error } = await supabase.from('profiles').update({ is_approved: approve }).eq('user_id', userId);
    if (error) { toast.error(error.message); return; }
    toast.success(approve ? 'Usuário aprovado!' : 'Usuário bloqueado.');
    setProfiles(prev => prev.map(p => p.user_id === userId ? { ...p, is_approved: approve } : p));
  };

  const addMatch = async () => {
    if (!newMatch.home_team || !newMatch.away_team || !newMatch.match_datetime || !newMatch.group_name) {
      toast.error('Preencha todos os campos'); return;
    }
    const { error } = await supabase.from('matches').insert({
      home_team: newMatch.home_team,
      away_team: newMatch.away_team,
      match_datetime: new Date(newMatch.match_datetime).toISOString(),
      group_name: newMatch.group_name,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Jogo adicionado!');
    setNewMatch({ home_team: '', away_team: '', match_datetime: '', group_name: '' });
    setShowAddMatch(false);
    fetchData();
  };

  const updateScore = async (matchId: string, field: 'home_score' | 'away_score', delta: number) => {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    const currentVal = match[field] ?? 0;
    const newVal = Math.max(0, currentVal + delta);

    // Optimistic update
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, [field]: newVal } : m));

    const { error } = await supabase.from('matches').update({ [field]: newVal }).eq('id', matchId);
    if (error) {
      toast.error(error.message);
      setMatches(prev => prev.map(m => m.id === matchId ? { ...m, [field]: currentVal } : m));
      return;
    }

    // Recalculate scores in real time
    const otherField = field === 'home_score' ? 'away_score' : 'home_score';
    const otherVal = match[otherField];
    if (otherVal !== null) {
      await supabase.rpc('calculate_match_scores', { p_match_id: matchId });
    }
  };

  const finishMatch = async (matchId: string) => {
    const match = matches.find(m => m.id === matchId);
    if (!match || match.home_score === null || match.away_score === null) {
      toast.error('Defina o placar antes de encerrar'); return;
    }
    setFinishingMatch(matchId);
    const { error } = await supabase.from('matches').update({ is_finished: true }).eq('id', matchId);
    if (error) { toast.error(error.message); setFinishingMatch(null); return; }

    await supabase.rpc('calculate_match_scores', { p_match_id: matchId });
    toast.success('Jogo encerrado!');
    setFinishingMatch(null);
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, is_finished: true } : m));
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Tabs */}
        <div className="flex gap-1 bg-secondary rounded-lg p-1">
          {(['matches', 'users'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-all active:scale-[0.98] ${
                tab === t ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
              }`}
            >
              {t === 'matches' ? 'Jogos' : 'Usuários'}
            </button>
          ))}
        </div>

        {tab === 'users' && (
          <div className="space-y-2">
            {profiles.map((p, i) => (
              <div key={p.id} className="glass-card p-3 flex items-center justify-between animate-reveal-up" style={{ animationDelay: `${i * 50}ms` }}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {p.email ?? 'Sem e-mail'} · {format(new Date(p.created_at), "dd/MM/yyyy", { locale: ptBR })}
                  </p>
                </div>
                <Switch
                  checked={p.is_approved}
                  onCheckedChange={(checked) => approveUser(p.user_id, checked)}
                />
              </div>
            ))}
          </div>
        )}

        {tab === 'matches' && (
          <div className="space-y-3">
            <Button size="sm" onClick={() => setShowAddMatch(!showAddMatch)} className="active:scale-95">
              <Plus className="h-4 w-4 mr-1" /> Adicionar jogo
            </Button>

            {showAddMatch && (
              <div className="glass-card p-4 space-y-3 animate-reveal-up">
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Time casa" value={newMatch.home_team} onChange={e => setNewMatch({ ...newMatch, home_team: e.target.value })} />
                  <Input placeholder="Time fora" value={newMatch.away_team} onChange={e => setNewMatch({ ...newMatch, away_team: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="datetime-local" value={newMatch.match_datetime} onChange={e => setNewMatch({ ...newMatch, match_datetime: e.target.value })} />
                  <Input placeholder="Grupo (A-L)" maxLength={1} value={newMatch.group_name} onChange={e => setNewMatch({ ...newMatch, group_name: e.target.value.toUpperCase() })} />
                </div>
                <Button size="sm" onClick={addMatch} className="w-full active:scale-95">Salvar</Button>
              </div>
            )}

            {matches.map((m, i) => (
              <div key={m.id} className="glass-card p-4 animate-reveal-up" style={{ animationDelay: `${i * 50}ms` }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Grupo {m.group_name} · {format(new Date(m.match_datetime), "dd MMM HH:mm", { locale: ptBR })}
                  </span>
                  {m.is_finished && (
                    <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                      <Trophy className="h-3 w-3" /> Encerrado
                    </span>
                  )}
                </div>

                {m.is_finished ? (
                  <p className="font-medium text-sm text-center">
                    {m.home_team} {m.home_score} × {m.away_score} {m.away_team}
                  </p>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      {/* Home team */}
                      <div className="flex-1 text-right">
                        <p className="text-sm font-medium truncate">{m.home_team}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateScore(m.id, 'home_score', -1)}
                          className="h-7 w-7 flex items-center justify-center rounded-md bg-secondary hover:bg-secondary/80 active:scale-90 transition-all"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-8 text-center font-bold tabular-nums text-lg">
                          {m.home_score ?? 0}
                        </span>
                        <button
                          onClick={() => updateScore(m.id, 'home_score', 1)}
                          className="h-7 w-7 flex items-center justify-center rounded-md bg-secondary hover:bg-secondary/80 active:scale-90 transition-all"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>

                      <span className="text-muted-foreground text-xs">×</span>

                      {/* Away team */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateScore(m.id, 'away_score', -1)}
                          className="h-7 w-7 flex items-center justify-center rounded-md bg-secondary hover:bg-secondary/80 active:scale-90 transition-all"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-8 text-center font-bold tabular-nums text-lg">
                          {m.away_score ?? 0}
                        </span>
                        <button
                          onClick={() => updateScore(m.id, 'away_score', 1)}
                          className="h-7 w-7 flex items-center justify-center rounded-md bg-secondary hover:bg-secondary/80 active:scale-90 transition-all"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium truncate">{m.away_team}</p>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => finishMatch(m.id)}
                      disabled={finishingMatch === m.id}
                      className="w-full mt-3 text-xs active:scale-95"
                    >
                      {finishingMatch === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : '🏁 Encerrar Jogo'}
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
