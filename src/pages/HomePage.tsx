import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Target, Trophy, Users, Lock, Trophy as TrophyIcon } from 'lucide-react';

export default function HomePage() {
  const { profile } = useAuth();

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Saudação */}
        <section className="glass-card p-5">
          <h2 className="font-serif text-2xl leading-tight">
            Bem vindo, {profile?.name?.split(' ')[0] || 'amiguinho'}!
          </h2>
          <p className="text-sm text-muted-foreground mt-1 font-normal">
            Que comece a zorra. Boa sorte nos palpites. 🍀
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
              Visualize os palpites de todos os participantes em cada jogo já bloqueado. Sem segredo, sem trapaça.
            </p>
          </div>
        </section>

        {/* Regras */}
        <section className="space-y-3">
          <h3 className="font-serif text-xl">Regras de pontuação</h3>

          <div className="glass-card p-4 border-l-4 border-l-primary">
            <div className="flex items-center gap-2 mb-1">
              <Lock className="h-4 w-4 text-primary" />
              <h4 className="font-medium text-sm">Prazo para palpitar</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              Os jogos ficam abertos para palpites <strong>até 10 minutos antes</strong> do horário previsto de início.
              Depois disso, são <strong>bloqueados</strong> e os palpites de todos os amiguinhos ficam visíveis para todos.
            </p>
          </div>

          <div className="glass-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="font-medium">EXATO</h4>
                <p className="text-sm text-muted-foreground">Você acertou o placar exato do jogo.</p>
                <p className="text-xs text-muted-foreground mt-1">Ex.: palpite 2x1 · resultado 2x1</p>
              </div>
              <span className="font-serif text-xl text-emerald-600 dark:text-emerald-400 whitespace-nowrap">+5</span>
            </div>
          </div>

          <div className="glass-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="font-medium">QUASE</h4>
                <p className="text-sm text-muted-foreground">Acertou o vencedor (ou empate), mas não o placar.</p>
                <p className="text-xs text-muted-foreground mt-1">Ex.: palpite 2x1 · resultado 2x0</p>
              </div>
              <span className="font-serif text-xl text-blue-600 dark:text-blue-400 whitespace-nowrap">+2</span>
            </div>
          </div>

          <div className="glass-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="font-medium">ERROU</h4>
                <p className="text-sm text-muted-foreground">Não acertou nem o placar nem a tendência.</p>
                <p className="text-xs text-muted-foreground mt-1">Ex.: palpite 2x1 · resultado 1x1</p>
              </div>
              <span className="font-serif text-xl text-muted-foreground whitespace-nowrap">0</span>
            </div>
          </div>

          <div className="glass-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="font-medium">INVERTIDO</h4>
                <p className="text-sm text-muted-foreground">Acertou o placar exatamente contrário</p>
                <p className="text-xs text-muted-foreground mt-1">Ex.: palpite 3x0 · resultado 0x3</p>
              </div>
              <span className="font-serif text-xl text-red-600 dark:text-red-400 whitespace-nowrap">−1</span>
            </div>
          </div>

          <div className="glass-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="font-medium">ESQUECEU</h4>
                <p className="text-sm text-muted-foreground">Penalidade por não enviar palpite antes do bloqueio.</p>
                <p className="text-xs text-muted-foreground mt-1">Ex.: nenhum palpite registrado</p>
              </div>
              <span className="font-serif text-xl text-red-600 dark:text-red-400 whitespace-nowrap">−2</span>
            </div>
          </div>
        </section>

        {/* Premiação */}
        <section className="space-y-3">
          <h3 className="font-serif text-xl">Premiação</h3>
          <div className="glass-card p-5 text-center">
            <TrophyIcon className="h-8 w-8 text-primary mx-auto mb-2" />
            <p className="font-serif text-2xl">95%</p>
            <p className="text-sm text-muted-foreground mt-1 font-normal">
              O vencedor do <strong>REBOLÃO</strong> leva <strong>95% de todo o valor arrecadado</strong>.
            </p>
            <p className="text-sm text-muted-foreground mt-1 font-normal">
              O resto é TAXA ADMINISTRATIVA!!! kkkkkk
            </p>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
