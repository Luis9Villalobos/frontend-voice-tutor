'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabaseClient';
import { sendChatToBackend, fetchCredits } from '@/lib/api';

interface Message {
  role: string;
  content: string;
}

interface SpeechRecognitionResultLike {
  transcript: string;
}

interface SpeechRecognitionEventLike {
  results?: Array<SpeechRecognitionResultLike>;
  error?: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

const MODES = {
  teacher: {
    id: 'teacher',
    label: 'Sarah',
    subtitle: 'Profesora de inglés',
    greeting: '¡Hola! Soy Sarah. Háblame en el idioma que quieras y practicaremos juntos.',
  },
  interviewer: {
    id: 'interviewer',
    label: 'Alex',
    subtitle: 'Tech Interviewer',
    greeting: "Hi there, I'm Alex. We can conduct the interview in English or ask me anything in Spanish if needed.",
  },
} as const;

type ModeId = keyof typeof MODES;

function formatCredits(seconds: number | null): string {
  if (seconds === null) return 'Cargando...';
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return secs > 0 ? `${minutes} min ${secs} seg` : `${minutes} min`;
  }
  return `${secs} seg`;
}

export default function ChatScreen({ session }: { session: Session | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [credits, setCredits] = useState<number | null>(null);
  const [mode, setMode] = useState<ModeId>('teacher');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: MODES.teacher.greeting },
  ]);
  const [inputText, setInputText] = useState('');
  const [status, setStatus] = useState('Presiona el micrófono o escribe...');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const load = async () => {
      const remaining = await fetchCredits(supabase, userId);
      if (!cancelled) {
        setCredits(remaining);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [userId, supabase]);

  const speakTextAuto = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const hasSpanishChars = /[áéíóúñ¿¡]/.test(text);
    utterance.lang = hasSpanishChars ? 'es-ES' : 'en-US';
    utterance.rate = 0.9;
    utterance.onend = () => setStatus('Presiona el microfono o escribe...');

    window.speechSynthesis.speak(utterance);
  }, []);

  const handleSend = useCallback(
    async (overrideText?: string) => {
      const textToSend = (overrideText ?? inputText).trim();
      const accessToken = session?.access_token ?? '';
      if (!textToSend || !accessToken) return;
      if (isProcessing) return;

      const currentCredits = credits;
      if (currentCredits === null || currentCredits <= 0) {
        setError('No tienes créditos suficientes. Por favor recarga tu saldo.');
        setStatus('Sin créditos disponibles.');
        return;
      }

      const newMessages = [...messages, { role: 'user', content: textToSend }];
      setMessages(newMessages);
      setInputText('');
      setIsProcessing(true);
      setStatus('Procesando respuesta...');
      setError(null);

      try {
        const data = await sendChatToBackend({
          mode,
          messages: newMessages,
          accessToken,
        });

        const aiResponse = data.response;
        setMessages([...newMessages, { role: 'assistant', content: aiResponse }]);
        setCredits(data.remaining_credits_seconds);
        speakTextAuto(aiResponse);
        setStatus('Presiona el microfono o escribe...');
      } catch (e) {
        const detail = e instanceof Error ? e.message : 'Error al comunicarse con la IA';
        setError(detail);
        setStatus('Error en la petición.');
      } finally {
        setIsProcessing(false);
      }
    },
    [messages, inputText, mode, isProcessing, credits, session, speakTextAuto]
  );

  const handleSendRef = useRef(handleSend);
  useEffect(() => {
    handleSendRef.current = handleSend;
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SpeechRecognitionCtor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'es-ES';

    recognition.onstart = () => {
      setIsRecording(true);
      setStatus('Escuchando... habla ahora.');
    };

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      const transcript = event?.results?.[0]?.transcript;
      if (transcript) {
        handleSendRef.current(transcript);
      }
    };

    recognition.onerror = (event: SpeechRecognitionEventLike) => {
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

    return () => {
      try {
        recognition.abort();
      } catch (cleanupError) {
        console.log('Error al limpiar el reconocimiento de voz:', cleanupError);
      }
    };
  }, []);

  const toggleRecording = () => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setError('Tu navegador no soporta reconocimiento de voz nativo.');
      return;
    }

    if (isRecording) {
      recognition.stop();
    } else {
      try {
        recognition.start();
      } catch (e) {
        console.log('Reinicio de escucha por estado:', e);
      }
    }
  };

  const handleModeChange = (newMode: ModeId) => {
    setMode(newMode);
    setMessages([{ role: 'assistant', content: MODES[newMode].greeting }]);
  };

  const handleLogout = async () => {
    const client = createClient();
    await client.auth.signOut();
  };

  const canSend = inputText.trim().length > 0 && !isProcessing && (credits ?? 0) > 0;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl h-[85vh] bg-slate-900 rounded-2xl shadow-2xl flex flex-col border border-slate-800 overflow-hidden">

        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center gap-2">
          <div>
            <h2 className="font-semibold text-lg text-blue-400">
              {MODES[mode].label} · {MODES[mode].subtitle}
            </h2>
            <p className="text-xs text-slate-400">
              Créditos:{' '}
              <span className="font-bold text-green-400">
                {credits !== null ? formatCredits(credits) : 'Cargando...'}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={mode}
              onChange={(e) => handleModeChange(e.target.value as ModeId)}
              className="bg-slate-800 border border-slate-700 text-sm rounded-lg px-3 py-1.5 focus:outline-none"
              aria-label="Modo de practica"
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

        {/* Error banner */}
        {error && (
          <div className="p-3 bg-red-950/60 border-b border-red-800 text-red-200 text-sm flex items-center justify-between gap-2">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-300 hover:text-red-100 text-lg leading-none"
              aria-label="Cerrar mensaje de error"
            >
              ×
            </button>
          </div>
        )}

        {/* Chat Box */}
        <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-3">
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
        <div className="text-center py-1 text-xs text-slate-400">{status}</div>

        {/* Controls */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center gap-3">
          <button
            onClick={toggleRecording}
            disabled={isProcessing}
            aria-label={isRecording ? 'Detener grabación' : 'Iniciar grabación'}
            className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition disabled:opacity-50 ${
              isRecording ? 'bg-red-500 animate-pulse' : 'bg-green-600 hover:bg-green-500'
            }`}
          >
            {isRecording ? '🔴' : '🎤'}
          </button>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSend) handleSend();
            }}
            placeholder="Habla o escribe aquí..."
            disabled={isProcessing}
            className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
          />
          <button
            onClick={() => handleSend()}
            disabled={!canSend}
            className="bg-blue-600 hover:bg-blue-500 px-5 py-3 rounded-lg text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Enviar
          </button>
        </div>
      </div>
    </main>
  );
}
