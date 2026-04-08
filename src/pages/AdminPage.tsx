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
import { Loader2, Plus, Trophy, Trash2, Pencil, X, Play, Minus, Check, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getFlagUrl } from '@/lib/countryFlags';

type Profile = { id: string; user_id: string; name: string; email: string | null; is_approved: boolean; created_at: string };
type Match = {
  id: string; home_team: string; away_team: string; match_datetime: string;
  group_name: string; home_score: number | null; away_score: number | null;
  is_finished: boolean; is_started: boolean;
};
type FriendshipGroup = { id: string; name: string };
type UserFriendshipGroup = { id: string; user_id: string; group_id: string };

const KNOCKOUT_PHASES = ['16-AVOS', 'OITAVAS', 'QUARTAS', 'SEMI', '3º e 4º', 'FINAL'];
const GROUP_OPTIONS = ['A','B','C','D','E','F','G','H','I','J','K','L', ...KNOCKOUT_PHASES];

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

  // Friendship groups
  const [friendshipGroups, setFriendshipGroups] = useState<FriendshipGroup[]>([]);
  const [userFriendshipGroups, setUserFriendshipGroups] = useState<UserFriendshipGroup[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [showAddGroup, setShowAddGroup] = useState(false);

  // User name editing
  const [editingUserName, setEditingUserName] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const [profRes, matchRes, fgRes, ufgRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('matches').select('*').order('match_datetime', { ascending: true }),
      supabase.from('friendship_groups').select('*').order('name'),
      supabase.from('user_friendship_groups').select('*'),
    ]);
    if (profRes.data) setProfiles(profRes.data as Profile[]);
    if (matchRes.data) setMatches(matchRes.data as Match[]);
    if (fgRes.data) setFriendshipGroups(fgRes.data as FriendshipGroup[]);
    if (ufgRes.data) setUserFriendshipGroups(ufgRes.data as UserFriendshipGroup[]);
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
    await supabase.from('user_friendship_groups').delete().eq('user_id', profile.user_id);
    const { error } = await supabase.from('profiles').delete().eq('user_id', profile.user_id);
    if (error) { toast.error(error.message); return; }
    toast.success('Usuário excluído!');
    setProfiles(prev => prev.filter(p => p.user_id !== profile.user_id));
  };

  const saveUserName = async (userId: string) => {
    if (!editNameValue.trim()) { toast.error('Nome não pode ser vazio'); return; }
    const { error } = await supabase.from('profiles').update({ name: editNameValue.trim() }).eq('user_id', userId);
    if (error) { toast.error(error.message); return; }
    toast.success('Nome atualizado!');
    setProfiles(prev => prev.map(p => p.user_id === userId ? { ...p, name: editNameValue.trim() } : p));
    setEditingUserName(null);
  };

  // Friendship group management
  const addFriendshipGroup = async () => {
    if (!newGroupName.trim()) { toast.error('Nome do grupo é obrigatório'); return; }
    const { error } = await supabase.from('friendship_groups').insert({ name: newGroupName.trim() });
    if (error) { toast.error(error.message); return; }
    toast.success('Grupo criado!');
    setNewGroupName('');
    setShowAddGroup(false);
    fetchData();
  };

  const deleteFriendshipGroup = async (groupId: string) => {
    if (!window.confirm('Excluir este grupo de amizade?')) return;
    const { error } = await supabase.from('friendship_groups').delete().eq('id', groupId);
    if (error) { toast.error(error.message); return; }
    toast.success('Grupo excluído!');
    fetchData();
  };

  const toggleUserGroup = async (userId: string, groupId: string) => {
    const existing = userFriendshipGroups.find(ufg => ufg.user_id === userId && ufg.group_id === groupId);
    if (existing) {
      await supabase.from('user_friendship_groups').delete().eq('id', existing.id);
    } else {
      const userGroups = userFriendshipGroups.filter(ufg => ufg.user_id === userId);
      if (userGroups.length >= 3) { toast.error('Máximo de 3 grupos por usuário'); return; }
      await supabase.from('user_friendship_groups').insert({ user_id: userId, group_id: groupId });
    }
    fetchData();
  };

  const addMatch = async () => {
    if (!newMatch.home_team || !newMatch.away_team || !newMatch.match_datetime || !newMatch.group_name) {
      toast.error('Preencha todos os campos'); return;
    }
    const { error } = await supabase.from('matches').insert({
      home_team: newMatch.home_team, away_team: newMatch.away_team,
      match_datetime: new Date(newMatch.match_datetime).toISOString(), group_name: newMatch.group_name,
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
      home_team: m.home_team, away_team: m.away_team,
      match_datetime: format(new Date(m.match_datetime), "yyyy-MM-dd'T'HH:mm"),
      group_name: m.group_name,
    });
  };

  const saveEdit = async (matchId: string) => {
    if (!editData.home_team || !editData.away_team || !editData.match_datetime || !editData.group_name) {
      toast.error('Preencha todos os campos'); return;
    }
    const { error } = await supabase.from('matches').update({
      home_team: editData.home_team, away_team: editData.away_team,
      match_datetime: new Date(editData.match_datetime).toISOString(), group_name: editData.group_name,
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
    const { error } = await supabase.from('matches').update({ is_started: true, home_score: 0, away_score: 0 }).eq('id', matchId);
    if (error) { toast.error(error.message); setStartingMatch(null); return; }
    await supabase.rpc('calculate_match_scores', { p_match_id: matchId });
    toast.success('Jogo iniciado!');
    setStartingMatch(null);
    fetchData();
  };

  const restartMatch = async (matchId: string) => {
    if (!window.confirm('Reiniciar este jogo? O placar será zerado e o jogo voltará ao estado "não iniciado". As pontuações serão removidas.')) return;
    await supabase.from('scores').delete().eq('match_id', matchId);
    const { error } = await supabase.from('matches').update({ is_started: false, is_finished: false, home_score: null, away_score: null }).eq('id', matchId);
    if (error) { toast.error(error.message); return; }
    toast.success('Jogo reiniciado!');
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

  const getGroupLabel = (name: string) => KNOCKOUT_PHASES.includes(name) ? name : `Grupo ${name}`;

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
          <div className="space-y-4">
            {/* Friendship Groups Management */}
            <div className="glass-card p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Grupos de Amizade</p>
                <button onClick={() => setShowAddGroup(!showAddGroup)} className="text-primary hover:text-primary/80 active:scale-95 transition-all">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {showAddGroup && (
                <div className="flex gap-2">
                  <Input placeholder="Nome do grupo" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} className="h-8 text-xs" />
                  <Button size="sm" onClick={addFriendshipGroup} className="h-8 text-xs active:scale-95">Criar</Button>
                </div>
              )}
              <div className="flex flex-wrap gap-1">
                {friendshipGroups.map(g => (
                  <span key={g.id} className="inline-flex items-center gap-1 text-[10px] bg-secondary px-2 py-1 rounded-full">
                    {g.name}
                    <button onClick={() => deleteFriendshipGroup(g.id)} className="text-destructive hover:text-destructive/80">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {friendshipGroups.length === 0 && <p className="text-[10px] text-muted-foreground">Nenhum grupo criado</p>}
              </div>
            </div>

            {/* Users list */}
            {profiles.map((p, i) => {
              const userGroups = userFriendshipGroups.filter(ufg => ufg.user_id === p.user_id);
              return (
                <div key={p.id} className="glass-card p-3 animate-reveal-up space-y-2" style={{ animationDelay: `${i * 50}ms` }}>
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      {editingUserName === p.user_id ? (
                        <div className="flex items-center gap-1">
                          <Input value={editNameValue} onChange={e => setEditNameValue(e.target.value)} className="h-7 text-sm" />
                          <button onClick={() => saveUserName(p.user_id)} className="text-primary hover:text-primary/80 active:scale-90 transition-all">
                            <Check className="h-4 w-4" />
                          </button>
                          <button onClick={() => setEditingUserName(null)} className="text-muted-foreground hover:text-foreground active:scale-90 transition-all">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <p className="font-medium text-sm truncate">{p.name}</p>
                          <button onClick={() => { setEditingUserName(p.user_id); setEditNameValue(p.name); }} className="text-muted-foreground hover:text-foreground active:scale-90 transition-all">
                            <Pencil className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                      <p className="text-[10px] text-muted-foreground truncate">
                        {p.email ?? 'Sem e-mail'} · {format(new Date(p.created_at), "dd/MM/yyyy", { locale: ptBR })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={p.is_approved} onCheckedChange={(checked) => approveUser(p.user_id, checked)} />
                      <button onClick={() => deleteUser(p)} className="text-destructive hover:text-destructive/80 active:scale-90 transition-all">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {/* Friendship group selectors */}
                  {friendshipGroups.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {friendshipGroups.map(g => {
                        const isIn = userGroups.some(ufg => ufg.group_id === g.id);
                        return (
                          <button
                            key={g.id}
                            onClick={() => toggleUserGroup(p.user_id, g.id)}
                            className={`text-[10px] px-2 py-0.5 rounded-full transition-colors active:scale-95 ${
                              isIn ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                            }`}
                          >
                            {g.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
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
                      {GROUP_OPTIONS.map(g => (<SelectItem key={g} value={g}>{g}</SelectItem>))}
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
                    {getGroupLabel(m.group_name)} · {format(new Date(m.match_datetime), "dd MMM HH:mm", { locale: ptBR })}
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
                      <button onClick={() => editingMatch === m.id ? setEditingMatch(null) : startEdit(m)} className="text-muted-foreground hover:text-foreground active:scale-90 transition-all">
                        {editingMatch === m.id ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                      </button>
                    )}
                    <button onClick={() => deleteMatch(m.id)} className="text-destructive hover:text-destructive/80 active:scale-90 transition-all">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

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
                          {GROUP_OPTIONS.map(g => (<SelectItem key={g} value={g}>{g}</SelectItem>))}
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
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 text-right">
                        <p className="text-sm font-medium truncate">{m.home_team}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {m.is_started ? (
                          <>
                            <button disabled={updatingScore === m.id || (m.home_score ?? 0) <= 0} onClick={() => adjustScore(m.id, 'home_score', -1)}
                              className="h-7 w-7 flex items-center justify-center rounded-md bg-secondary text-foreground disabled:opacity-30 active:scale-95 transition-transform">
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-6 text-center font-bold tabular-nums">{m.home_score ?? 0}</span>
                            <button disabled={updatingScore === m.id} onClick={() => adjustScore(m.id, 'home_score', 1)}
                              className="h-7 w-7 flex items-center justify-center rounded-md bg-secondary text-foreground disabled:opacity-30 active:scale-95 transition-transform">
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
                            <button disabled={updatingScore === m.id || (m.away_score ?? 0) <= 0} onClick={() => adjustScore(m.id, 'away_score', -1)}
                              className="h-7 w-7 flex items-center justify-center rounded-md bg-secondary text-foreground disabled:opacity-30 active:scale-95 transition-transform">
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-6 text-center font-bold tabular-nums">{m.away_score ?? 0}</span>
                            <button disabled={updatingScore === m.id} onClick={() => adjustScore(m.id, 'away_score', 1)}
                              className="h-7 w-7 flex items-center justify-center rounded-md bg-secondary text-foreground disabled:opacity-30 active:scale-95 transition-transform">
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
                        <Button size="sm" onClick={() => startMatch(m.id)} disabled={startingMatch === m.id}
                          className="flex-1 text-xs active:scale-95 bg-green-600 hover:bg-green-700">
                          {startingMatch === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Play className="h-3 w-3 mr-1" /> Iniciar jogo</>}
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setConfirmFinish(m.id)} disabled={finishingMatch === m.id}
                          className="flex-1 text-xs active:scale-95">
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
            <AlertDialogAction onClick={() => confirmFinish && finishMatch(confirmFinish)}>Encerrar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
