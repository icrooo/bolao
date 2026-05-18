import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: { name: string; is_approved: boolean; user_id: string } | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  isAdmin: false,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthContextType['profile']>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const applySession = (newSession: Session | null) => {
      const newUser = newSession?.user ?? null;
      setSession(prev => {
        // Avoid re-render churn from token-refresh / realtime auth events
        // that emit a fresh session object with the same identity.
        if (prev?.access_token === newSession?.access_token && prev?.user?.id === newUser?.id) {
          return prev;
        }
        return newSession;
      });
      setUser(prev => {
        if (prev?.id === newUser?.id) return prev;
        return newUser;
      });
    };

    let isMounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      applySession(session);
      if (!session) setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      if (event === 'SIGNED_OUT') {
        applySession(null);
        setLoading(false);
        return;
      }
      if (session) {
        applySession(session);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setIsAdmin(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const fetchProfile = async () => {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (cancelled) return;

      if (profileData) {
        setProfile({ name: profileData.name, is_approved: profileData.is_approved, user_id: profileData.user_id });
      }

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (cancelled) return;

      setIsAdmin(roleData?.some(r => r.role === 'admin') ?? false);
      setLoading(false);
    };

    fetchProfile();
    return () => { cancelled = true; };
  }, [user]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, isAdmin, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
