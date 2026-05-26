import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2, Eye, EyeOff, Moon, Sun, Lock, Trophy as TrophyIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function useTheme() {
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    const stored = localStorage.getItem('theme');
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggle = () => setThemeState(t => t === 'dark' ? 'light' : 'dark');
  return { theme, toggle };
}

export default function AuthPage() {
  const { user, profile, loading } = useAuth();
  const { theme, toggle } = useTheme();
  const [isLogin, setIsLogin] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('hasVisitedAuth') === '1';
  });
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem('hasVisitedAuth', '1'); } catch {}
  }, []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user && profile?.is_approved) return <Navigate to="/predictions" replace />;
  if (user && !profile?.is_approved) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="glass-card p-8 text-center max-w-sm animate-reveal-up">
          <h2 className="text-2xl mb-2 whitespace-pre-line">Sim... e o PIX?</h2>
          <p className="text-muted-foreground text-sm mb-4">
            Seu cadastro foi recebido. <br /><br />Agora é só fazer a zorra do pix (R$ 50) e me encher o saco para te aprovar.
          </p>
          <div className="flex flex-col gap-2">
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText('icarodias@gmail.com');
                  toast.success('Chave PIX copiada!');
                } catch {
                  toast.error('Não foi possível copiar.');
                }
              }}
            >
              Copiar Chave PIX
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Atualizar
            </Button>
            <Button variant="ghost" onClick={() => supabase.auth.signOut()}>
              Sair
            </Button>
          </div>
        </div>
      </div>
    );
  }



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success('Login realizado!');
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name } },
        });
        if (error) throw error;
        toast.success('Cadastro realizado! Aguarde aprovação do administrador.');
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success('E-mail de recuperação enviado! Verifique sua caixa de entrada.');
      setForgotPassword(false);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen relative">
      <div className="max-w-lg mx-auto px-4 pt-3 flex justify-end">
        <button
          onClick={toggle}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors active:scale-95"
          aria-label="Alternar tema"
        >
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
      </div>

      <div className="flex items-center justify-center px-4 min-h-[calc(100vh-3.5rem)]">
        <div className="w-full max-w-sm animate-reveal-up">
          <div className="text-center mb-8">
            <h1 className="font-serif text-4xl mb-1 uppercase" style={{ lineHeight: '1.1' }}>Rebolão da Copa</h1>
            <p className="font-serif text-5xl text-primary" style={{ lineHeight: '1.1' }}>2026</p>
            {forgotPassword ? (
              <p className="text-muted-foreground text-sm mt-3">
                Informe seu e-mail para recuperar a senha
              </p>
            ) : isLogin ? (
              <p className="text-muted-foreground text-sm mt-3">
                Entre para acessar seus palpites, mas antes{' '}
                <button
                  type="button"
                  onClick={() => setHowItWorksOpen(true)}
                  className="text-primary font-medium hover:underline inline"
                >
                  clique aqui e saiba COMO FUNCIONA
                </button>
              </p>
            ) : (
              <p className="text-muted-foreground text-sm mt-3">
                Solicite seu acesso ao bolão, mas antes{' '}
                <button
                  type="button"
                  onClick={() => setHowItWorksOpen(true)}
                  className="text-primary font-medium hover:underline inline"
                >
                  clique aqui e saiba COMO FUNCIONA
                </button>
              </p>
            )}
          </div>

          {forgotPassword ? (
            <form onSubmit={handleResetPassword} className="glass-card p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
                <Input
                  type="email"
                  value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Enviar e-mail de recuperação
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="glass-card p-6 space-y-4">
              {!isLogin && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome</label>
                  <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Seu nome"
                    required={!isLogin}
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Senha</label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••"
                    required
                    minLength={6}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {isLogin ? 'Entrar' : 'Solicitar acesso'}
              </Button>
              {isLogin && (
                <button
                  type="button"
                  onClick={() => setForgotPassword(true)}
                  className="text-xs text-muted-foreground hover:underline w-full text-center"
                >
                  Esqueceu sua senha?
                </button>
              )}
            </form>
          )}


          <p className="text-center text-sm text-muted-foreground mt-4">
            {forgotPassword ? (
              <button onClick={() => setForgotPassword(false)} className="text-primary font-medium hover:underline">
                Voltar ao login
              </button>
            ) : isLogin ? (
              <>
                Primeira vez por aqui?{' '}
                <button onClick={() => setIsLogin(false)} className="text-primary font-medium hover:underline">
                  Solicite acesso :)
                </button>
              </>
            ) : (
              <>
                Já tem conta?{' '}
                <button onClick={() => setIsLogin(true)} className="text-primary font-medium hover:underline">
                  Fazer login
                </button>
              </>
            )}
          </p>
        </div>
      </div>

      <Dialog open={howItWorksOpen} onOpenChange={setHowItWorksOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Como funciona?</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 mt-2">
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

            <section className="space-y-3">
              <h3 className="font-serif text-xl">Premiação</h3>
              <div className="glass-card p-5 text-center">
                <TrophyIcon className="h-8 w-8 text-primary mx-auto mb-2" />
                <p className="text-sm text-muted-foreground mt-1 font-normal">
                  Para participar, o valor é <strong>R$ 50</strong>.
                </p>
                <p className="text-sm text-muted-foreground mt-1 font-normal">
                  O vencedor do <strong>REBOLÃO</strong> leva <strong>90% de todo o valor arrecadado</strong>.
                </p>
                <p className="text-sm text-muted-foreground mt-1 font-normal">
                  O resto é <strong>TAXA ADMINISTRATIVA!!!! kkkkkk</strong>
                </p>
              </div>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
