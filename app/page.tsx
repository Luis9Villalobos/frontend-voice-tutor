'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabaseClient';

export default function Home() {
  const supabase = createClient();
  
  // Estados de autenticación
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loadingAuth, setLoadingAuth] = useState(false);

  // Estados de la app
  const [credits, setCredits] = useState<number | null>(null);
  const [mode, setMode] = useState<'teacher' | 'interviewer'>('teacher');
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([
    { role: 'assistant', content: "¡Hola! Soy Sarah. Háblame en español o en inglés, detectaré automáticamente tu idioma." }
  ]);
  const [inputText, setInputText] = useState('');
  const [status, setStatus] = useState('Presiona el micrófono o escribe...');
  const [isRecording, setIsRecording] = useState(false);

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchCredits(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchCredits(session.user.id);
    });

    // Configuración robusta de la Web Speech API
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        
        // Asignamos una variante estándar compatible globalmente (es-US o es-ES)
        recognition.lang = 'es-US'; 

        recognition.onstart = () => {
          setIsRecording(true);
          setStatus('Escuchando... habla ahora.');
        };

        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setInputText(transcript);
          handleSend(transcript);
        };

        recognition.onerror = (event: any) => {
          console.error('Detalle del error de voz:', event.error);
          setIsRecording(false);

          if (event.error === 'network') {
            setStatus('Error de red de Chrome Speech API. Comprueba tu conexión o adblockers.');
          } else if (event.error === 'no-speech') {
            setStatus('No se escuchó voz. Habla más cerca del micrófono.');
          } else if (event.error === 'not-allowed') {
            setStatus('Permiso de micrófono bloqueado en la barra del navegador.');
          } else {
            setStatus(`Error (${event.error}). Intenta nuevamente.`);
          }
        };

        recognition.onend = () => {
          setIsRecording(false);
        };

        recognitionRef.current = recognition;
      }
    }

    return () => subscription.unsubscribe();
  }, []);

  const fetchCredits = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('credits_seconds')
      .eq('id', userId)
      .single();

    if (data && !error) {
      setCredits(data.credits_seconds);
    }
  };

  const handleAuth = async (type: 'LOGIN' | 'SIGNUP') => {
    if (!email.trim() || !password.trim()) {
      alert('Por favor ingresa un correo y una contraseña antes de continuar.');
      return;
    }

    setLoadingAuth(true);
    setStatus('');
    try {
      let result;
      if (type === 'SIGNUP') {
        result = await supabase.auth.signUp({ email, password });
      } else {
        result = await supabase.auth.signInWithPassword({ email, password });
      }

      if (result.error) throw result.error;
      if (type === 'SIGNUP') alert('¡Cuenta creada con éxito!');
    } catch (err: any) {
      alert(err.message || 'Error de autenticación');
    } finally {
      setLoadingAuth(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setCredits(null);
  };

  const handleModeChange = (newMode: 'teacher' | 'interviewer') => {
    setMode(newMode);
    const initialMsg = newMode === 'teacher' 
      ? "¡Hola! Soy Sarah. Háblame en el idioma que quieras y practicaremos juntos." 
      : "Hi there, I'm Alex. We can conduct the interview in English or ask me anything in Spanish if needed.";
    setMessages([{ role: 'assistant', content: initialMsg }]);
  };

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      alert('Tu navegador no soporta reconocimiento de voz nativo.');
      return;
    }
    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.log("Reinicio de escucha por estado:", e);
      }
    }
  };

  const handleSend = async (overrideText?: string) => {
    const textToSend = overrideText || inputText;
    if (!textToSend.trim() || !session) return;

    setInputText('');
    const newMessages = [...messages, { role: 'user', content: textToSend }];
    setMessages(newMessages);
    setStatus('Procesando respuesta...');

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          mode: mode,
          messages: newMessages.map(m => ({ role: m.role, content: m.content }))
        })
      });

      const data = await response.json();

      if (response.ok) {
        const aiText = data.response;
        setMessages([...newMessages, { role: 'assistant', content: aiText }]);
        if (data.remaining_credits_seconds !== undefined) {
          setCredits(data.remaining_credits_seconds);
        }
        
        speakTextAuto(aiText);
        setStatus('Presiona el micrófono o escribe...');
      } else {
        alert(data.detail || 'Error al comunicarse con la IA');
        setStatus('Error en la petición.');
      }
    } catch (error) {
      console.error(error);
      setStatus('Error de conexión con el backend.');
    }
  };

  const speakTextAuto = (text: string) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      
      const hasSpanishChars = /[áéíóúñ¿¡]/i.test(text);
      utterance.lang = hasSpanishChars ? 'es-ES' : 'en-US';
      utterance.rate = 0.9;
      
      window.speechSynthesis.speak(utterance);
    }
  };

  if (!session) {
    return (
      <main className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-700">
          <h1 className="text-2xl font-bold text-center mb-6 text-blue-400">AI Voice Tutor</h1>
          <p className="text-sm text-slate-400 text-center mb-6">Inicia sesión o regístrate para usar tus créditos de práctica en voz.</p>
          
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
                className="flex-1 bg-blue-600 hover:bg-blue-700 py-3 rounded-lg font-semibold transition"
              >
                Ingresar
              </button>
              <button 
                onClick={() => handleAuth('SIGNUP')}
                disabled={loadingAuth}
                className="flex-1 bg-slate-700 hover:bg-slate-600 py-3 rounded-lg font-semibold transition"
              >
                Registrarse
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl h-[85vh] bg-slate-900 rounded-2xl shadow-2xl flex flex-col border border-slate-800 overflow-hidden">
        
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
          <div>
            <h2 className="font-semibold text-lg text-blue-400">
              {mode === 'teacher' ? 'Sarah (English Teacher)' : 'Alex (Tech Interviewer)'}
            </h2>
            <p className="text-xs text-slate-400">
              Créditos: <span className="font-bold text-green-400">{credits !== null ? `${credits}s` : 'Cargando...'}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select 
              value={mode} 
              onChange={(e) => handleModeChange(e.target.value as any)}
              className="bg-slate-800 border border-slate-700 text-sm rounded-lg px-3 py-1.5 focus:outline-none"
            >
              <option value="teacher">Sarah (Teacher)</option>
              <option value="interviewer">Alex (Interviewer)</option>
            </select>
            <button 
              onClick={handleLogout}
              className="text-xs text-slate-400 hover:text-red-400 underline"
            >
              Salir
            </button>
          </div>
        </div>

        {/* Chat Box */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3">
          {messages.map((msg, idx) => (
            <div 
              key={idx} 
              className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                msg.role === 'user' 
                  ? 'ml-auto bg-blue-600 text-white rounded-br-none' 
                  : 'mr-auto bg-slate-800 text-slate-200 rounded-bl-none border border-slate-700'
              }`}
            >
              {msg.content}
            </div>
          ))}
        </div>

        {/* Status */}
        <div className="text-center py-1 text-xs text-slate-400">
          {status}
        </div>

        {/* Controls */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center gap-3">
          <button 
            onClick={toggleRecording}
            className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition ${
              isRecording ? 'bg-red-500 animate-pulse' : 'bg-green-600 hover:bg-green-500'
            }`}
          >
            🎤
          </button>
          <input 
            type="text" 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Habla o escribe aquí..."
            className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
          />
          <button 
            onClick={() => handleSend()}
            className="bg-blue-600 hover:bg-blue-500 px-5 py-3 rounded-lg text-sm font-semibold transition"
          >
            Enviar
          </button>
        </div>

      </div>
    </main>
  );
}