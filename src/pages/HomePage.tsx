import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Target, Trophy, Users, Lock, Trophy as TrophyIcon } from 'lucide-react';

function formatBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export default function HomePage() {
  const { profile } = useAuth();
  const [approvedCount, setApprovedCount] = useState<number | null>(null);

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('is_approved', true)
      .then(({ count }) => setApprovedCount(count ?? 0));
  }, []);

  const second = 200;
  const third = 150;
  const fourth = 100;
  const fifth = 50;
  const first = approvedCount !== null ? Math.max(0, approvedCount * 50 * 0.9 - second - third - fourth - fifth) : null;



  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Saudação */}
        <section className="glass-card p-5">
          <h2 className="font-serif text-2xl leading-tight">
            Bem vindo, {profile?.name?.split(' ')[0] || 'amiguinho'}!
          </h2>
          <p className="text-sm text-muted-foreground mt-1 font-normal">
            Que comece a zorra. Boa sorte nos palpites 🍀
          </p>
        </section>

        {/* Abas */}
        <section className="space-y-3">
          <h3 className="font-serif text-xl">Como funcionam as abas</h3>

          <div className="glass-card p-4">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-4 w-4 text-primary" />
              <h4 className="font-medium">Palpites</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              Onde você dá seu chute no placar de cada jogo. Salve antes do bloqueio para valer pontos.
            </p>
          </div>

          <div className="glass-card p-4">
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="h-4 w-4 text-primary" />
              <h4 className="font-medium">Ranking</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              Classificação geral dos participantes, com sua pontuação total e posição atualizada em tempo real.
            </p>
          </div>

          <div className="glass-card p-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-primary" />
              <h4 className="font-medium">Todos</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              Visualize os palpites de todos os participantes em cada jogo depois de bloqueado. Hora de curiar!
            </p>
          </div>
        </section>

        {/* Regras */}
        <section className="space-y-3">
          <h3 className="font-serif text-xl">Regras de pontuação</h3>

          <div className="glass-card p-4 border-l-4 border-l-primary">
            <div className="flex items-center gap-2 mb-1">
              <Lock className="h-4 w-4 text-primary" />
              <h4 className="font-medium text-base">Prazo para palpitar</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              Os jogos ficam abertos para palpites <strong>até 10 minutos antes</strong> do horário previsto de início.
              Depois disso, são <strong>bloqueados</strong> e os palpites de todos os amiguinhos ficam visíveis na aba Todos.
            </p>
          </div>

          <div className="glass-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="font-medium">EXATO</h4>
                <p className="text-sm text-muted-foreground">Você acertou o placar exato do jogo.</p>
                <p className="text-xs text-muted-foreground mt-1">Ex.: palpite 2x1 · resultado 2x1</p>
              </div>
              <span className="text-xl font-bold text-green-600 whitespace-nowrap">+5</span>
            </div>
          </div>

          <div className="glass-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="font-medium">QUASE</h4>
                <p className="text-sm text-muted-foreground">Acertou o vencedor (ou empate), mas não o placar.</p>
                <p className="text-xs text-muted-foreground mt-1">Ex.: palpite 2x1 · resultado 2x0</p>
              </div>
              <span className="text-xl font-bold text-yellow-600 whitespace-nowrap">+2</span>
            </div>
          </div>

          <div className="glass-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="font-medium">ERROU</h4>
                <p className="text-sm text-muted-foreground">Não acertou nada.</p>
                <p className="text-xs text-muted-foreground mt-1">Ex.: palpite 2x1 · resultado 1x1</p>
              </div>
              <span className="text-xl font-bold text-muted-foreground whitespace-nowrap">0</span>
            </div>
          </div>

          <div className="glass-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="font-medium">INVERTIDO</h4>
                <p className="text-sm text-muted-foreground">Acertou o placar exatamente contrário.</p>
                <p className="text-xs text-muted-foreground mt-1">Ex.: palpite 3x0 · resultado 0x3</p>
              </div>
              <span className="text-xl font-bold text-destructive whitespace-nowrap">-1</span>
            </div>
          </div>

          <div className="glass-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="font-medium">ESQUECEU</h4>
                <p className="text-sm text-muted-foreground">Penalidade por não enviar palpite antes do bloqueio.</p>
              </div>
              <span className="text-xl font-bold text-score-missed whitespace-nowrap">-2</span>
            </div>
          </div>
        </section>

        {/* Premiação */}
        <section className="space-y-3">
          <h3 className="font-serif text-xl">Premiação</h3>
          <div className="glass-card p-5">
            <TrophyIcon className="h-8 w-8 text-primary mx-auto mb-3" />
            <ul className="space-y-2">
              <li className="flex items-center justify-between border-b border-border/40 pb-2">
                <span className="font-medium">🥇 1º lugar</span>
                <span className="font-bold text-primary">
                  {first !== null ? formatBRL(first) : '—'}
                </span>
              </li>
              <li className="flex items-center justify-between">
                <span className="font-medium">🥈 2º lugar</span>
                <span className="font-bold">{formatBRL(second)}</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="font-medium">🥉 3º lugar</span>
                <span className="font-bold">{formatBRL(third)}</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="font-medium">4º lugar</span>
                <span className="font-bold">{formatBRL(fourth)}</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="font-medium">5º lugar</span>
                <span className="font-bold">{formatBRL(fifth)}</span>
              </li>
            </ul>
            <p className="text-[10px] text-muted-foreground mt-3 text-center">
              *Valores calculados com base em {approvedCount ?? '—'} participantes aprovados (R$ 50 cada). Há 10% de taxa administrativa kkkkkk
            </p>
          </div>
        </section>

              O resto é <strong>TAXA ADMINISTRATIVA!!!! kkkkkk</strong>
            </p>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
