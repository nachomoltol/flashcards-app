'use client';
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { ensureQuickGuideDeck } from '@/lib/onboarding/seedGuideDeck';

interface AuthFormProps {
  initialMode?: 'signin' | 'signup';
}

function getFriendlyErrorMessage(errorMsg: string): string {
  if (errorMsg.includes('Invalid login credentials')) {
    return 'El correo o la contraseña son incorrectos.';
  }
  if (errorMsg.includes('User already registered')) {
    return 'Ya existe una cuenta registrada con este correo.';
  }
  if (errorMsg.includes('Password should be at least 6 characters')) {
    return 'La contraseña debe tener al menos 6 caracteres.';
  }
  if (errorMsg.includes('Email not confirmed')) {
    return 'Debes confirmar tu correo electrónico antes de iniciar sesión.';
  }
  if (errorMsg.includes('rate limit')) {
    return 'Demasiados intentos. Espera unos momentos antes de volver a intentar.';
  }
  if (errorMsg.includes('invalid format') || errorMsg.includes('valid email')) {
    return 'Por favor, introduce un correo electrónico válido.';
  }
  return errorMsg;
}

export function AuthForm({ initialMode = 'signin' }: AuthFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Redirigir si ya existe una sesión activa
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        useAuthStore.getState().setSession(data.session);
        router.push('/');
      }
    });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError('Por favor, rellena todos los campos obligatorios.');
      return;
    }

    if (password.length < 6) {
      setError('La contraseña debe tener un mínimo de 6 caracteres.');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'signin') {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (signInError) {
          setError(getFriendlyErrorMessage(signInError.message));
          setLoading(false);
          return;
        }

        if (data?.session) {
          try {
            await ensureQuickGuideDeck(data.session.user.id);
          } catch (seedErr) {
            console.warn('Error inicializando mazo demo:', seedErr);
          }
          useAuthStore.getState().setSession(data.session);
          router.push('/');
        } else {
          setLoading(false);
        }
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
        });

        if (signUpError) {
          setError(getFriendlyErrorMessage(signUpError.message));
          setLoading(false);
          return;
        }

        if (data?.session) {
          try {
            await ensureQuickGuideDeck(data.session.user.id);
          } catch (seedErr) {
            console.warn('Error inicializando mazo demo:', seedErr);
          }
          useAuthStore.getState().setSession(data.session);
          router.push('/');
        } else {
          setSuccessMessage(
            '¡Cuenta creada con éxito! Si requiere verificación, revisa tu bandeja de entrada para confirmar el correo.'
          );
          setLoading(false);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error inesperado al conectar con el servicio.';
      setError(message);
      setLoading(false);
    }
  };

  const handleQuickDemoLogin = async () => {
    setError(null);
    setSuccessMessage(null);
    setEmail('demo@flashcards.app');
    setPassword('Password123!');
    setDemoLoading(true);

    try {
      const { data, error: demoError } = await supabase.auth.signInWithPassword({
        email: 'demo@flashcards.app',
        password: 'Password123!',
      });

      if (demoError) {
        setError('Error al acceder con cuenta demo: ' + demoError.message);
        setDemoLoading(false);
        return;
      }

      if (data?.session) {
        try {
          await ensureQuickGuideDeck(data.session.user.id);
        } catch (seedErr) {
          console.warn('Error inicializando mazo demo:', seedErr);
        }
        useAuthStore.getState().setSession(data.session);
        router.push('/');
      } else {
        setDemoLoading(false);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al conectar.';
      setError(message);
      setDemoLoading(false);
    }
  };

  const toggleMode = (newMode: 'signin' | 'signup') => {
    setMode(newMode);
    setError(null);
    setSuccessMessage(null);
  };

  return (
    <div className="w-full max-w-md p-6 sm:p-8 rounded-2xl border border-neutral-800/80 bg-neutral-900/60 backdrop-blur-xl shadow-2xl shadow-black/80 space-y-6">
      {/* Brand Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center">
          <Link href="/" className="inline-flex items-center gap-2.5 group">
            <img
              src="/icons/android-chrome-192x192.png"
              alt="Flashmente"
              className="w-10 h-10 rounded-lg object-contain shadow-md group-hover:scale-105 transition-transform duration-200"
            />
            <div className="text-left">
              <span className="font-bold text-white tracking-tight block text-base leading-tight">
                Flashmente
              </span>
              <span className="text-[10px] text-amber-400 font-mono tracking-wider uppercase block">
                FSRS Spaced Rep
              </span>
            </div>
          </Link>
        </div>

        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            {mode === 'signin' ? 'Iniciar Sesión' : 'Crear Cuenta Nueva'}
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            {mode === 'signin'
              ? 'Accede a tu cuenta para continuar con tus repasos.'
              : 'Empieza a memorizar contenido con repetición espaciada inteligente.'}
          </p>
        </div>
      </div>

      {/* Mode Switch Tabs */}
      <div className="grid grid-cols-2 p-1 rounded-xl bg-neutral-950/70 border border-neutral-800 text-xs font-medium">
        <button
          type="button"
          onClick={() => toggleMode('signin')}
          className={`py-2 rounded-lg transition-all cursor-pointer ${
            mode === 'signin'
              ? 'bg-neutral-800 text-white shadow-sm font-semibold'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Iniciar Sesión
        </button>
        <button
          type="button"
          onClick={() => toggleMode('signup')}
          className={`py-2 rounded-lg transition-all cursor-pointer ${
            mode === 'signup'
              ? 'bg-neutral-800 text-white shadow-sm font-semibold'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Crear Cuenta
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 flex items-start gap-2.5 text-red-300 text-xs animate-in fade-in duration-150">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
          <span className="leading-relaxed">{error}</span>
        </div>
      )}

      {/* Success Alert */}
      {successMessage && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-start gap-2.5 text-emerald-300 text-xs animate-in fade-in duration-150">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
          <span className="leading-relaxed">{successMessage}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email Field */}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-neutral-300">
            Correo Electrónico
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              required
              autoComplete="email"
              className="w-full bg-neutral-950/70 border border-neutral-800 hover:border-neutral-700 focus:border-indigo-500 text-neutral-100 placeholder-neutral-500 rounded-xl pl-10 pr-3.5 py-2.5 text-sm transition focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
            />
          </div>
        </div>

        {/* Password Field */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-medium text-neutral-300">
              Contraseña
            </label>
            {mode === 'signup' && (
              <span className="text-[10px] text-neutral-500">Mínimo 6 caracteres</span>
            )}
          </div>
          <div className="relative">
            <Lock className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              className="w-full bg-neutral-950/70 border border-neutral-800 hover:border-neutral-700 focus:border-indigo-500 text-neutral-100 placeholder-neutral-500 rounded-xl pl-10 pr-10 py-2.5 text-sm transition focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition cursor-pointer p-1"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading || demoLoading}
          className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-medium text-sm shadow-lg shadow-indigo-500/25 transition-all duration-150 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{mode === 'signin' ? 'Iniciando sesión...' : 'Creando cuenta...'}</span>
            </>
          ) : (
            <>
              <span>{mode === 'signin' ? 'Iniciar Sesión' : 'Crear Cuenta'}</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-neutral-800" />
        </div>
        <div className="relative flex justify-center text-[11px] uppercase">
          <span className="bg-neutral-900/90 px-2 text-neutral-500 font-mono">o</span>
        </div>
      </div>

      {/* Quick Demo Access Button */}
      <button
        type="button"
        onClick={handleQuickDemoLogin}
        disabled={loading || demoLoading}
        className="w-full py-2 px-3 rounded-xl bg-neutral-950/60 hover:bg-neutral-800/80 border border-neutral-800 hover:border-neutral-700/80 text-xs font-medium text-neutral-300 hover:text-white transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {demoLoading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
            <span>Accediendo como Demo...</span>
          </>
        ) : (
          <>
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Acceso rápido con Cuenta Demo</span>
          </>
        )}
      </button>

      {/* Alternative Toggle Link */}
      <div className="text-center pt-1">
        {mode === 'signin' ? (
          <p className="text-xs text-neutral-400">
            ¿No tienes una cuenta?{' '}
            <button
              type="button"
              onClick={() => toggleMode('signup')}
              className="text-indigo-400 hover:text-indigo-300 font-medium underline underline-offset-4 cursor-pointer transition-colors"
            >
              Crear cuenta nueva
            </button>
          </p>
        ) : (
          <p className="text-xs text-neutral-400">
            ¿Ya tienes cuenta?{' '}
            <button
              type="button"
              onClick={() => toggleMode('signin')}
              className="text-indigo-400 hover:text-indigo-300 font-medium underline underline-offset-4 cursor-pointer transition-colors"
            >
              Iniciar sesión
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
