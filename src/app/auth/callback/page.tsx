'use client';
/* eslint-disable @next/next/no-img-element */

import { Suspense, useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores';
import { ensureQuickGuideDeck } from '@/lib/onboarding/seedGuideDeck';
import { Loader2, CheckCircle2, AlertCircle, ArrowRight, Sparkles, Mail } from 'lucide-react';
import type { EmailOtpType, Session } from '@supabase/supabase-js';

function getAuthRedirectParams(searchParams: ReturnType<typeof useSearchParams>) {
  let hashType = '';
  let hashNext = '';
  let queryNext = searchParams.get('next') || searchParams.get('redirect_to') || '';
  let queryType = searchParams.get('type') || '';

  if (typeof window !== 'undefined') {
    if (window.location.search) {
      try {
        const sp = new URLSearchParams(window.location.search);
        if (!queryNext) queryNext = sp.get('next') || sp.get('redirect_to') || '';
        if (!queryType) queryType = sp.get('type') || '';
      } catch {}
    }
    if (window.location.hash) {
      try {
        const hp = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        hashType = hp.get('type') || '';
        hashNext = hp.get('next') || hp.get('redirect_to') || '';
      } catch {}
    }
  }

  const next = queryNext || hashNext || '';
  const type = queryType || hashType || '';
  const isRecovery =
    type === 'recovery' ||
    next === '/update-password' ||
    next === 'update-password' ||
    (typeof window !== 'undefined' &&
      (window.location.search.includes('type=recovery') ||
        window.location.hash.includes('type=recovery')));

  return { next, type, isRecovery };
}

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    // 0. Listener reactivo para eventos de Supabase (ej. PASSWORD_RECOVERY o SIGNED_IN)
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN')) {
        await handleSessionSuccess(session, event === 'PASSWORD_RECOVERY');
      }
    });

    async function processAuth() {
      try {
        // 1. Comprobar si vienen parámetros de error en la URL (query o hash)
        const errorParam = searchParams.get('error');
        const errorDesc = searchParams.get('error_description');

        if (errorParam || errorDesc) {
          throw new Error(
            errorDesc
              ? decodeURIComponent(errorDesc.replace(/\+/g, ' '))
              : 'El enlace de confirmación no es válido o ha expirado.'
          );
        }

        // Revisar también si hay fragmento hash con error en el navegador
        if (typeof window !== 'undefined' && window.location.hash) {
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const hashError = hashParams.get('error');
          const hashErrorDesc = hashParams.get('error_description');
          if (hashError || hashErrorDesc) {
            throw new Error(
              hashErrorDesc
                ? decodeURIComponent(hashErrorDesc.replace(/\+/g, ' '))
                : 'El enlace de confirmación no es válido o ha expirado.'
            );
          }
        }

        // 2. Comprobar flujo con código PKCE (?code=...)
        const rawSearch = typeof window !== 'undefined' ? window.location.search : '';
        const windowParams = new URLSearchParams(rawSearch);
        const code = searchParams.get('code') || windowParams.get('code');

        if (code) {
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (!exchangeError && data.session) {
            await handleSessionSuccess(data.session);
            return;
          }

          // Fallback: si exchangeCodeForSession falla, comprobar si el 'code' era en realidad un token_hash
          const { type: fallbackType } = getAuthRedirectParams(searchParams);
          const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
            token_hash: code,
            type: (fallbackType as EmailOtpType) || 'email',
          });
          if (!otpError && otpData.session) {
            await handleSessionSuccess(otpData.session);
            return;
          }

          // Si exchangeCodeForSession falló porque ya fue canjeado en segundo plano, verificar si hay sesión activa
          const { data: currentSessionData } = await supabase.auth.getSession();
          if (currentSessionData.session) {
            await handleSessionSuccess(currentSessionData.session);
            return;
          }

          if (exchangeError) {
            throw exchangeError;
          }
        }

        // 3. Comprobar flujo con OTP / Token Hash (?token_hash=...&type=...)
        const tokenHash = searchParams.get('token_hash') || windowParams.get('token_hash');
        const { type: currentType } = getAuthRedirectParams(searchParams);
        const otpType = (currentType as EmailOtpType) || 'email';

        if (tokenHash) {
          const { data, error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: otpType,
          });

          if (verifyError) {
            throw verifyError;
          }

          if (data.session) {
            await handleSessionSuccess(data.session);
            return;
          }
        }

        // 4. Comprobar flujo Implícito (fragmento hash: #access_token=...&refresh_token=...)
        if (typeof window !== 'undefined' && window.location.hash) {
          const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');

          if (accessToken && refreshToken) {
            const { data, error: setSessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (setSessionError) {
              throw setSessionError;
            }

            if (data.session) {
              await handleSessionSuccess(data.session);
              return;
            }
          }
        }

        // 5. Comprobar si ya existe una sesión activa almacenada
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          await handleSessionSuccess(sessionData.session);
          return;
        }

        // Si no se encontró ningún token ni sesión válida
        throw new Error('No se encontraron credenciales de verificación en el enlace proporcionado.');
      } catch (err: unknown) {
        if (hasRedirectedRef.current) return;
        console.error('Error durante el intercambio de autenticación:', err);
        const rawMessage = err instanceof Error ? err.message : 'Error desconocido al validar la cuenta.';
        setErrorMessage(getFriendlyAuthMessage(rawMessage));
        setStatus('error');
      }
    }

    async function handleSessionSuccess(session: Session, isPasswordRecoveryEvent = false) {
      if (hasRedirectedRef.current) return;

      try {
        const { next, isRecovery: isParamRecovery } = getAuthRedirectParams(searchParams);
        const isRecovery = isPasswordRecoveryEvent || isParamRecovery;

        // Actualizar store global
        useAuthStore.getState().setSession(session);
        setStatus('success');

        // Determinar ruta de destino
        let targetRoute = '/';
        if (isRecovery || next === '/update-password' || next === 'update-password') {
          targetRoute = '/update-password';
        } else if (next) {
          targetRoute = next.startsWith('/') ? next : `/${next}`;
        }

        // Inicializar mazo demo en segundo plano SOLO si es alta normal, no en recovery
        if (!isRecovery && session?.user?.id) {
          try {
            localStorage.removeItem('flashcards_welcome_tutorial_seen');
          } catch {}
          ensureQuickGuideDeck(session.user.id).catch((seedErr) => {
            console.warn('Error inicializando mazo demo en callback:', seedErr);
          });
        }

        hasRedirectedRef.current = true;

        // Si es flujo de recuperación o hay un parámetro 'next' específico, redirigir obligatoria e inmediatamente
        if (isRecovery || next) {
          router.replace(targetRoute);
          router.push(targetRoute);

          // Seguro de navegación fallback por si el enrutador del cliente se retrasa
          setTimeout(() => {
            if (typeof window !== 'undefined' && window.location.pathname !== targetRoute) {
              window.location.href = targetRoute;
            }
          }, 350);
          return;
        }

        // Redirigir al dashboard tras breve confirmación visual en login/signup
        setTimeout(() => {
          router.replace('/');
          router.push('/');
        }, 1100);
      } catch (e) {
        console.warn('Advertencia durante la finalización del inicio de sesión:', e);
        router.replace('/');
      }
    }

    processAuth();

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [searchParams, router]);

  return (
    <div className="w-full max-w-md p-6 sm:p-8 rounded-2xl border border-neutral-800/80 bg-neutral-900/70 backdrop-blur-xl shadow-2xl shadow-black/80 text-center space-y-6">
      {/* Brand Header */}
      <div className="inline-flex items-center justify-center gap-2.5">
        <img
          src="/icons/android-chrome-192x192.png"
          alt="Flashmente"
          className="w-10 h-10 rounded-lg object-contain shadow-md"
        />
        <div className="text-left">
          <span className="font-bold text-white tracking-tight block text-base leading-tight">
            Flashmente
          </span>
          <span className="text-[10px] text-amber-400 font-mono tracking-wider uppercase block">
            Verificación de Cuenta
          </span>
        </div>
      </div>

      {/* Estados Visuales */}
      {status === 'loading' && (
        <div className="py-6 space-y-4">
          <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
            <Loader2 className="w-6 h-6 text-indigo-400 animate-pulse" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white">Verificando tu cuenta...</h2>
            <p className="text-xs text-neutral-400">
              Estamos validando tu correo electrónico y preparando tu espacio de estudio.
            </p>
          </div>
        </div>
      )}

      {status === 'success' && (
        <div className="py-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/20">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white">
              {getAuthRedirectParams(searchParams).isRecovery
                ? '¡Sesión de recuperación validada!'
                : '¡Cuenta confirmada con éxito!'}
            </h2>
            <p className="text-xs text-emerald-300">
              {getAuthRedirectParams(searchParams).isRecovery
                ? 'Redirigiendo a restablecer tu contraseña...'
                : 'Tu correo ha sido verificado correctamente. Entrando a Flashmente...'}
            </p>
          </div>
          <div className="pt-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-neutral-400">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              {getAuthRedirectParams(searchParams).isRecovery
                ? 'Abriendo actualización de credenciales...'
                : 'Redirigiendo a tus mazos...'}
            </span>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="py-4 space-y-5 animate-in fade-in duration-200">
          <div className="w-16 h-16 mx-auto rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 shadow-lg shadow-red-500/20">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div className="space-y-1.5 text-left bg-red-500/10 border border-red-500/20 rounded-xl p-3.5">
            <h2 className="text-sm font-semibold text-red-200 flex items-center gap-1.5">
              <Mail className="w-4 h-4 text-red-400" />
              No pudimos completar la verificación
            </h2>
            <p className="text-xs text-red-300/90 leading-relaxed">
              {errorMessage}
            </p>
          </div>

          <div className="space-y-2.5 pt-2">
            <Link
              href="/login"
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-medium text-xs shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2"
            >
              <span>Ir a Iniciar Sesión</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              href="/signup"
              className="w-full py-2 px-3 rounded-xl bg-neutral-950/60 hover:bg-neutral-800 border border-neutral-800 text-xs text-neutral-300 hover:text-white transition-all block text-center"
            >
              Solicitar un nuevo registro
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function getFriendlyAuthMessage(msg: string): string {
  if (msg.includes('expired') || msg.includes('token has expired')) {
    return 'El enlace de confirmación ha caducado. Por favor, solicita uno nuevo o intenta iniciar sesión.';
  }
  if (msg.includes('invalid') || msg.includes('Token is invalid')) {
    return 'El enlace de confirmación no es válido o ya ha sido utilizado anteriormente.';
  }
  if (msg.includes('already confirmed') || msg.includes('Email already confirmed')) {
    return 'Tu correo ya estaba confirmado. Puedes iniciar sesión directamente con tu contraseña.';
  }
  if (msg.includes('rate limit')) {
    return 'Demasiadas solicitudes en poco tiempo. Espera unos minutos antes de volver a intentarlo.';
  }
  return msg || 'Ha ocurrido un problema al validar tu enlace de confirmación.';
}

export default function AuthCallbackPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-neutral-950 text-neutral-100 relative overflow-hidden">
      {/* Background ambient glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

      <Suspense
        fallback={
          <div className="w-full max-w-md p-8 rounded-2xl border border-neutral-800/80 bg-neutral-900/70 text-center space-y-4">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
            <p className="text-xs text-neutral-400">Cargando verificación...</p>
          </div>
        }
      >
        <CallbackHandler />
      </Suspense>
    </main>
  );
}
