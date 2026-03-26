import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Plus, Trophy, Trash2, Pencil, X, Play, Minus } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Profile = { id: string; user_id: string; name: string; email: string | null; is_approved: boolean; created_at: string };
type Match = {
  id: string; home_team: string; away_team: string; match_datetime: string;
  group_name: string; home_score: number | null; away_score: number | null;
  is_finished: boolean; is_started: boolean;
};

export default function AdminPage() {
  const [tab, setTab] = useState<'matches' | 'users'>('matches');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddMatch, setShowAddMatch] = useState(false);
  const [newMatch, setNewMatch] = useState({ home_team: '', away_team: '', match_datetime: '', group_name: '' });
  const [finishingMatch, setFinishingMatch] = useState<string | null>(null);
  const [confirmFinish, setConfirmFinish] = useState<string | null>(null);
  const [startingMatch, setStartingMatch] = useState<string | null>(null);
  const [editingMatch, setEditingMatch] = useState<string | null>(null);
  const [editData, setEditData] = useState({ home_team: '', away_team: '', match_datetime: '', group_name: '' });
  const [updatingScore, setUpdatingScore] = useState<string | null>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const [profRes, matchRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('matches').select('*').order('match_datetime', { ascending: true }),
    ]);
    if (profRes.data) setProfiles(profRes.data as Profile[]);
    if (matchRes.data) setMatches(matchRes.data as Match[]);
    setLoading(false);
  };

  const approveUser = async (userId: string, approve: boolean) => {
    const { error } = await supabase.from('profiles').update({ is_approved: approve }).eq('user_id', userId);
    if (error) { toast.error(error.message); return; }
    toast.success(approve ? 'Usuário aprovado!' : 'Usuário bloqueado.');
    setProfiles(prev => prev.map(p => p.user_id === userId ? { ...p, is_approved: approve } : p));
  };

  const deleteUser = async (profile: Profile) => {
    if (!window.confirm(`Tem certeza que deseja excluir o usuário "${profile.name}"? Todos os seus palpites e pontuações serão removidos.`)) return;
    await supabase.from('scores').delete().eq('user_id', profile.user_id);
    await supabase.from('predictions').delete().eq('user_id', profile.user_id);
    await supabase.from('user_roles').delete().eq('user_id', profile.user_id);
    const { error } = await supabase.from('profiles').delete().eq('user_id', profile.user_id);
    if (error) { toast.error(error.message); return; }
    toast.success('Usuário excluído!');
    setProfiles(prev => prev.filter(p => p.user_id !== profile.user_id));
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

  const startEdit = (m: Match) => {
    setEditingMatch(m.id);
    setEditData({
      home_team: m.home_team,
      away_team: m.away_team,
      match_datetime: format(new Date(m.match_datetime), "yyyy-MM-dd'T'HH:mm"),
      group_name: m.group_name,
    });
  };

  const saveEdit = async (matchId: string) => {
    if (!editData.home_team || !editData.away_team || !editData.match_datetime || !editData.group_name) {
      toast.error('Preencha todos os campos'); return;
    }
    const { error } = await supabase.from('matches').update({
      home_team: editData.home_team,
      away_team: editData.away_team,
      match_datetime: new Date(editData.match_datetime).toISOString(),
      group_name: editData.group_name,
    }).eq('id', matchId);
    if (error) { toast.error(error.message); return; }
    toast.success('Jogo atualizado!');
    setEditingMatch(null);
    fetchData();
  };

  const adjustScore = async (matchId: string, field: 'home_score' | 'away_score', delta: number) => {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;
    const current = match[field] ?? 0;
    const newVal = Math.max(0, current + delta);
    const otherField = field === 'home_score' ? 'away_score' : 'home_score';

    setUpdatingScore(matchId);
    const updatePayload: any = { [field]: newVal };
    if (match[otherField] === null) updatePayload[otherField] = 0;

    const { error } = await supabase.from('matches').update(updatePayload).eq('id', matchId);
    if (error) { toast.error(error.message); setUpdatingScore(null); return; }

    await supabase.rpc('calculate_match_scores', { p_match_id: matchId });
    setUpdatingScore(null);
    fetchData();
  };

  const startMatch = async (matchId: string) => {
    setStartingMatch(matchId);
    const { error } = await supabase.from('matches').update({
      is_started: true,
      home_score: 0,
      away_score: 0,
    }).eq('id', matchId);
    if (error) { toast.error(error.message); setStartingMatch(null); return; }

    await supabase.rpc('calculate_match_scores', { p_match_id: matchId });
    toast.success('Jogo iniciado!');
    setStartingMatch(null);
    fetchData();
  };

  const deleteMatch = async (matchId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este jogo? Todos os palpites e pontos serão removidos.')) return;
    const { error } = await supabase.from('matches').delete().eq('id', matchId);
    if (error) { toast.error(error.message); return; }
    toast.success('Jogo excluído!');
    setMatches(prev => prev.filter(m => m.id !== matchId));
  };

  const finishMatch = async (matchId: string) => {
    const match = matches.find(m => m.id === matchId);
    if (!match || match.home_score === null || match.away_score === null) {
      toast.error('Atualize o placar antes de encerrar'); return;
    }
    setFinishingMatch(matchId);
    const { error } = await supabase.from('matches').update({ is_finished: true }).eq('id', matchId);
    if (error) { toast.error(error.message); setFinishingMatch(null); return; }

    await supabase.rpc('calculate_match_scores', { p_match_id: matchId });
    toast.success('Jogo encerrado!');
    setFinishingMatch(null);
    setConfirmFinish(null);
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
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {p.email ?? 'Sem e-mail'} · {format(new Date(p.created_at), "dd/MM/yyyy", { locale: ptBR })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={p.is_approved}
                    onCheckedChange={(checked) => approveUser(p.user_id, checked)}
                  />
                  <button
                    onClick={() => deleteUser(p)}
                    className="text-destructive hover:text-destructive/80 active:scale-90 transition-all"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
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
                  <Select value={newMatch.group_name} onValueChange={v => setNewMatch({ ...newMatch, group_name: v })}>
                    <SelectTrigger><SelectValue placeholder="Grupo/Fase" /></SelectTrigger>
                    <SelectContent>
                      {['A','B','C','D','E','F','G','H','I','J','K','L','16-AVOS','OITAVAS','QUARTAS','SEMI','3º e 4º','FINAL'].map(g => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  <div className="flex items-center gap-2">
                    {m.is_finished && (
                      <span className="text-[10px] bg-foreground/10 text-foreground px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                        <Trophy className="h-3 w-3" /> Encerrado
                      </span>
                    )}
                    {m.is_started && !m.is_finished && (
                      <span className="text-[10px] bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full font-medium">
                        Em andamento
                      </span>
                    )}
                    {!m.is_finished && (
                      <button
                        onClick={() => editingMatch === m.id ? setEditingMatch(null) : startEdit(m)}
                        className="text-muted-foreground hover:text-foreground active:scale-90 transition-all"
                      >
                        {editingMatch === m.id ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                      </button>
                    )}
                    <button
                      onClick={() => deleteMatch(m.id)}
                      className="text-destructive hover:text-destructive/80 active:scale-90 transition-all"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Edit mode */}
                {editingMatch === m.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Time casa" value={editData.home_team} onChange={e => setEditData({ ...editData, home_team: e.target.value })} />
                      <Input placeholder="Time fora" value={editData.away_team} onChange={e => setEditData({ ...editData, away_team: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input type="datetime-local" value={editData.match_datetime} onChange={e => setEditData({ ...editData, match_datetime: e.target.value })} />
                      <Select value={editData.group_name} onValueChange={v => setEditData({ ...editData, group_name: v })}>
                        <SelectTrigger><SelectValue placeholder="Grupo/Fase" /></SelectTrigger>
                        <SelectContent>
                          {['A','B','C','D','E','F','G','H','I','J','K','L','16-AVOS','OITAVAS','QUARTAS','SEMI','3º e 4º','FINAL'].map(g => (
                            <SelectItem key={g} value={g}>{g}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button size="sm" onClick={() => saveEdit(m.id)} className="w-full active:scale-95">Salvar alterações</Button>
                  </div>
                ) : m.is_finished ? (
                  <p className="font-medium text-sm text-center">
                    {m.home_team} {m.home_score} × {m.away_score} {m.away_team}
                  </p>
                ) : (
                  <>
                    {/* Score +/- controls */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 text-right">
                        <p className="text-sm font-medium truncate">{m.home_team}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {m.is_started ? (
                          <>
                            <button
                              disabled={updatingScore === m.id || (m.home_score ?? 0) <= 0}
                              onClick={() => adjustScore(m.id, 'home_score', -1)}
                              className="h-7 w-7 flex items-center justify-center rounded-md bg-secondary text-foreground disabled:opacity-30 active:scale-95 transition-transform"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-6 text-center font-bold tabular-nums">{m.home_score ?? 0}</span>
                            <button
                              disabled={updatingScore === m.id}
                              onClick={() => adjustScore(m.id, 'home_score', 1)}
                              className="h-7 w-7 flex items-center justify-center rounded-md bg-secondary text-foreground disabled:opacity-30 active:scale-95 transition-transform"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </div>
                      <span className="text-muted-foreground text-xs mx-1">×</span>
                      <div className="flex items-center gap-1">
                        {m.is_started ? (
                          <>
                            <button
                              disabled={updatingScore === m.id || (m.away_score ?? 0) <= 0}
                              onClick={() => adjustScore(m.id, 'away_score', -1)}
                              className="h-7 w-7 flex items-center justify-center rounded-md bg-secondary text-foreground disabled:opacity-30 active:scale-95 transition-transform"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-6 text-center font-bold tabular-nums">{m.away_score ?? 0}</span>
                            <button
                              disabled={updatingScore === m.id}
                              onClick={() => adjustScore(m.id, 'away_score', 1)}
                              className="h-7 w-7 flex items-center justify-center rounded-md bg-secondary text-foreground disabled:opacity-30 active:scale-95 transition-transform"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium truncate">{m.away_team}</p>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-3">
                      {!m.is_started ? (
                        <Button
                          size="sm"
                          onClick={() => startMatch(m.id)}
                          disabled={startingMatch === m.id}
                          className="flex-1 text-xs active:scale-95 bg-green-600 hover:bg-green-700"
                        >
                          {startingMatch === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Play className="h-3 w-3 mr-1" /> Iniciar jogo</>}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirmFinish(m.id)}
                          disabled={finishingMatch === m.id}
                          className="flex-1 text-xs active:scale-95"
                        >
                          {finishingMatch === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : '🏁 Encerrar'}
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Finish confirmation dialog */}
      <AlertDialog open={!!confirmFinish} onOpenChange={(open) => { if (!open) setConfirmFinish(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar jogo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja encerrar este jogo? A pontuação final será computada e não poderá ser alterada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmFinish && finishMatch(confirmFinish)}>
              Encerrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
