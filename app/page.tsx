'use client';

import { useEffect, useState, useMemo } from 'react';
import type { Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabaseClient';
import AuthScreen from '@/components/AuthScreen';
import ChatScreen from '@/components/ChatScreen';

export default function Home() {
  const supabase = useMemo(() => createClient(), []);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  if (!session) {
    return <AuthScreen onAuth={setSession} />;
  }

  return <ChatScreen session={session} />;
}
