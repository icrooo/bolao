import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function AuthPage() {
  const { user, profile, loading } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
          <h2 className="text-2xl mb-2">Aguardando aprovação</h2>
          <p className="text-muted-foreground text-sm mb-4">
            Seu cadastro foi recebido. Um administrador precisa aprovar seu acesso.
          </p>
          <Button variant="outline" onClick={() => supabase.auth.signOut()}>
            Sair
          </Button>
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
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      toast.success('E-mail de recuperação enviado! Verifique sua caixa de entrada.');
      setForgotPassword(false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm animate-reveal-up">
        <div className="text-center mb-8">
          <h1 className="text-4xl mb-1" style={{ lineHeight: '1.1' }}>Bolão Copa</h1>
          <p className="text-5xl font-serif text-primary" style={{ lineHeight: '1.1' }}>2026</p>
          <p className="text-muted-foreground text-sm mt-3">
            {forgotPassword ? 'Informe seu e-mail para recuperar a senha' : isLogin ? 'Entre para acessar seus palpites' : 'Solicite seu acesso ao bolão'}
          </p>
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
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••"
                required
                minLength={6}
              />
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
  );
}
