'use client';

import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabaseClient';

interface AuthScreenProps {
  onAuth: (session: Session | null) => void;
}

export default function AuthScreen({ onAuth }: AuthScreenProps) {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (type: 'LOGIN' | 'SIGNUP') => {
    if (!email.trim() || !password.trim()) {
      setError('Por favor ingresa un correo y una contraseña antes de continuar.');
      return;
    }

    setLoadingAuth(true);
    setError(null);
    try {
      const result =
        type === 'SIGNUP'
          ? await supabase.auth.signUp({ email, password })
          : await supabase.auth.signInWithPassword({ email, password });

      if (result.error) throw result.error;

      if (type === 'SIGNUP') {
        setError('¡Cuenta creada con éxito! Ahora inicia sesión.');
      } else {
        onAuth(result.data.session);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error de autenticación';
      setError(message);
    } finally {
      setLoadingAuth(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-700">
        <h1 className="text-2xl font-bold text-center mb-6 text-blue-400">AI Voice Tutor</h1>
        <p className="text-sm text-slate-400 text-center mb-6">
          Inicia sesión o regístrate para usar tus créditos de práctica en voz.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-900/40 border border-red-700 rounded-lg text-sm text-red-200 text-center">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Email</label>
            <input
              type="email"
              className="w-full p-3 rounded-lg bg-slate-900 border border-slate-700 focus:outline-none focus:border-blue-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Contraseña</label>
            <input
              type="password"
              className="w-full p-3 rounded-lg bg-slate-900 border border-slate-700 focus:outline-none focus:border-blue-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <div className="flex gap-4 pt-2">
            <button
              onClick={() => handleAuth('LOGIN')}
              disabled={loadingAuth}
              className="flex-1 bg-blue-600 hover:bg-blue-700 py-3 rounded-lg font-semibold transition disabled:opacity-50"
            >
              {loadingAuth ? 'Ingresando...' : 'Ingresar'}
            </button>
            <button
              onClick={() => handleAuth('SIGNUP')}
              disabled={loadingAuth}
              className="flex-1 bg-slate-700 hover:bg-slate-600 py-3 rounded-lg font-semibold transition disabled:opacity-50"
            >
              {loadingAuth ? 'Creando...' : 'Registrarse'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
