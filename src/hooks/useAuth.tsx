// src/hooks/useAuth.tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createServerActionClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { User } from '@supabase/supabase-js';

const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();

  // Create the Supabase client once, outside of useEffect
  const supabase = createServerActionClient({ cookies });

  useEffect(() => {
    const getUser = async () => {
      try {
        console.log('Attempting to get session...');
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error('Error fetching session:', error.message);
        } else {
          console.log('Session data:', data);
          if (data.session) {
            console.log('User is logged in:', data.session.user);
            setUser(data.session.user);
          } else {
            console.log('No session found, redirecting to login...');
            setUser(null);
            router.push('/login');
          }
        }
      } catch (err) {
        console.error('Unexpected error fetching session:', err);
      }
    };

    getUser();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state change event:', event);
      if (session) {
        console.log('User is logged in:', session.user);
        setUser(session.user);
      } else {
        console.log('User is logged out, redirecting to login...');
        setUser(null);
        router.push('/login');
      }
    });

    return () => {
      if (listener?.subscription) {
        console.log('Unsubscribing from auth state change listener...');
        listener.subscription.unsubscribe();
      } else {
        console.log('No subscription found to unsubscribe from.');
      }
    };
  }, [router, supabase]);

  return { user };
};

export default useAuth;
