import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/" replace />;
  if (!profile?.is_approved) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="glass-card p-8 text-center max-w-sm">
          <h2 className="text-2xl mb-2">Aguardando aprovação</h2>
          <p className="text-muted-foreground text-sm">
            Seu cadastro foi recebido e está pendente de aprovação pelo administrador.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export function AdminRoute({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) return <Navigate to="/predictions" replace />;
  return <>{children}</>;
}
