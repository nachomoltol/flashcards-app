'use client';
/* eslint-disable @next/next/no-img-element */

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, ArrowRight, Mail, Home } from 'lucide-react';

function ErrorContent() {
  const searchParams = useSearchParams();
  const errorMsg = searchParams.get('message') || searchParams.get('error_description') || searchParams.get('error');

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
            Error de Autenticación
          </span>
        </div>
      </div>

      <div className="py-4 space-y-5 animate-in fade-in duration-200">
        <div className="w-16 h-16 mx-auto rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 shadow-lg shadow-red-500/20">
          <AlertCircle className="w-8 h-8" />
        </div>
        <div className="space-y-1.5 text-left bg-red-500/10 border border-red-500/20 rounded-xl p-3.5">
          <h2 className="text-sm font-semibold text-red-200 flex items-center gap-1.5">
            <Mail className="w-4 h-4 text-red-400" />
            No pudimos autenticar la solicitud
          </h2>
          <p className="text-xs text-red-300/90 leading-relaxed">
            {errorMsg
              ? decodeURIComponent(errorMsg.replace(/\+/g, ' '))
              : 'El enlace de confirmación ha caducado, no es válido o ya fue utilizado.'}
          </p>
        </div>

        <div className="space-y-2.5 pt-2">
          <Link
            href="/login"
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-medium text-xs shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2"
          >
            <span>Iniciar Sesión</span>
            <ArrowRight className="w-4 h-4" />
          </Link>

          <Link
            href="/signup"
            className="w-full py-2 px-3 rounded-xl bg-neutral-950/60 hover:bg-neutral-800 border border-neutral-800 text-xs text-neutral-300 hover:text-white transition-all block text-center"
          >
            Crear Nueva Cuenta
          </Link>

          <Link
            href="/"
            className="w-full py-2 px-3 rounded-xl hover:bg-neutral-800/40 text-xs text-neutral-400 hover:text-neutral-200 transition-all flex items-center justify-center gap-1.5 text-center"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Volver al Inicio</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-neutral-950 text-neutral-100 relative overflow-hidden">
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

      <Suspense fallback={<div className="text-neutral-400 text-xs">Cargando...</div>}>
        <ErrorContent />
      </Suspense>
    </main>
  );
}
