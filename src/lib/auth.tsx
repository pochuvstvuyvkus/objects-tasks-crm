import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { fetchProfile } from './api';
import { errorMessage } from './errors';
import type { Profile } from './database.types';

type AuthContextValue = {
  session: Session | null;
  profile: Profile | null;
  /** Идёт проверка сессии или загрузка профиля. */
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session);
      if (active && !data.session) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) setSession(next);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    fetchProfile(userId)
      .then((p) => {
        if (!active) return;
        if (!p) setError('Профиль пользователя не найден. Обратитесь к администратору.');
        setProfile(p);
      })
      .catch((e) => active && setError(errorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [userId]);

  const signIn = async (email: string, password: string) => {
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ session, profile, loading, error, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth вне AuthProvider');
  return ctx;
}

/** Профиль внутри защищённых страниц: Layout гарантирует, что он загружен. */
export function useProfile(): Profile {
  const { profile } = useAuth();
  if (!profile) throw new Error('Профиль не загружен');
  return profile;
}
