import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Check, X, Plus, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Profile = { id: string; user_id: string; name: string; is_approved: boolean; created_at: string };
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
  const [resultInputs, setResultInputs] = useState<Map<string, { home: string; away: string }>>(new Map());

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const [profRes, matchRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('matches').select('*').order('match_datetime', { ascending: true }),
    ]);
    if (profRes.data) setProfiles(profRes.data);
    if (matchRes.data) setMatches(matchRes.data);
    setLoading(false);
  };

  const approveUser = async (userId: string, approve: boolean) => {
    const { error } = await supabase.from('profiles').update({ is_approved: approve }).eq('user_id', userId);
    if (error) { toast.error(error.message); return; }
    toast.success(approve ? 'Usuário aprovado!' : 'Usuário reprovado.');
    fetchData();
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

  const finishMatch = async (matchId: string) => {
    const result = resultInputs.get(matchId);
    if (!result || result.home === '' || result.away === '') {
      toast.error('Insira o placar final'); return;
    }
    setFinishingMatch(matchId);
    const { error } = await supabase.from('matches').update({
      home_score: parseInt(result.home),
      away_score: parseInt(result.away),
      is_finished: true,
    }).eq('id', matchId);
    if (error) { toast.error(error.message); setFinishingMatch(null); return; }

    // Calculate scores
    const { error: calcError } = await supabase.rpc('calculate_match_scores', { p_match_id: matchId });
    if (calcError) { toast.error('Erro ao calcular pontuação: ' + calcError.message); }
    else { toast.success('Jogo encerrado e pontuação calculada!'); }

    setFinishingMatch(null);
    fetchData();
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
                <div>
                  <p className="font-medium text-sm">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {format(new Date(p.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    {p.is_approved ? ' · Aprovado' : ' · Pendente'}
                  </p>
                </div>
                <div className="flex gap-1">
                  {!p.is_approved && (
                    <button onClick={() => approveUser(p.user_id, true)} className="h-8 w-8 flex items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 transition-all">
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                  {p.is_approved && (
                    <button onClick={() => approveUser(p.user_id, false)} className="h-8 w-8 flex items-center justify-center rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 active:scale-95 transition-all">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
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

            {matches.map((m, i) => {
              const result = resultInputs.get(m.id) ?? { home: '', away: '' };
              return (
                <div key={m.id} className="glass-card p-4 animate-reveal-up" style={{ animationDelay: `${i * 50}ms` }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      Grupo {m.group_name} · {format(new Date(m.match_datetime), "dd MMM HH:mm", { locale: ptBR })}
                    </span>
                    {m.is_finished && (
                      <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                        <Trophy className="h-3 w-3" /> Encerrado
                      </span>
                    )}
                  </div>
                  <p className="font-medium text-sm">
                    {m.home_team} {m.is_finished ? `${m.home_score} × ${m.away_score}` : '×'} {m.away_team}
                  </p>

                  {!m.is_finished && (
                    <div className="flex items-center gap-2 mt-3">
                      <Input
                        type="number"
                        min={0}
                        placeholder="Casa"
                        className="w-16 h-8 text-center text-sm"
                        value={result.home}
                        onChange={e => setResultInputs(prev => new Map(prev).set(m.id, { ...result, home: e.target.value }))}
                      />
                      <span className="text-muted-foreground text-xs">×</span>
                      <Input
                        type="number"
                        min={0}
                        placeholder="Fora"
                        className="w-16 h-8 text-center text-sm"
                        value={result.away}
                        onChange={e => setResultInputs(prev => new Map(prev).set(m.id, { ...result, away: e.target.value }))}
                      />
                      <Button
                        size="sm"
                        onClick={() => finishMatch(m.id)}
                        disabled={finishingMatch === m.id}
                        className="h-8 text-xs active:scale-95"
                      >
                        {finishingMatch === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Encerrar'}
                      </Button>
                    </div>
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
