'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { SplashIntro } from '@/components/SplashIntro';

const SPLASH_STORAGE_KEY = 'hasSeenSplash';

export default function RootEntryPage() {
  const router = useRouter();
  const [showSplash, setShowSplash] = useState<boolean | null>(null);
  const targetDestinationRef = useRef<string | null>(null);

  // Evaluar sesión de Supabase de manera rápida y en segundo plano
  const checkAuthDestination = useCallback(async (): Promise<string> => {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) {
        return '/decks';
      }
      return '/login';
    } catch (err) {
      console.warn('[RootEntryPage] Error comprobando sesión:', err);
      return '/login';
    }
  }, []);

  useEffect(() => {
    // 1. Comprobar si el usuario ya vio el splash en esta sesión de navegación
    const hasSeen = typeof window !== 'undefined' ? sessionStorage.getItem(SPLASH_STORAGE_KEY) === 'true' : false;

    // 2. Iniciar comprobación de autenticación de inmediato
    checkAuthDestination().then((destination) => {
      targetDestinationRef.current = destination;
      // Si ya vio el splash, redirigir sin demora
      if (hasSeen) {
        router.replace(destination);
      }
    });

    if (hasSeen) {
      setShowSplash(false);
    } else {
      setShowSplash(true);
    }
  }, [checkAuthDestination, router]);

  const handleFinishSplash = async () => {
    try {
      sessionStorage.setItem(SPLASH_STORAGE_KEY, 'true');
    } catch {
      // Ignorar si el almacenamiento está restringido por el navegador
    }

    // Si la comprobación de sesión aún no ha terminado, resolverla
    const destination = targetDestinationRef.current ?? (await checkAuthDestination());
    router.replace(destination);
  };

  // Durante la hidratación inicial o si no se muestra el splash, renderizar contenedor oscuro neutro
  if (showSplash === null) {
    return <div className="min-h-screen bg-neutral-950" />;
  }

  if (showSplash) {
    return <SplashIntro onFinish={handleFinishSplash} duration={3000} />;
  }

  // Si ya vio el splash y está redirigiendo, mantener pantalla oscura suave sin parpadeo blanco
  return <div className="min-h-screen bg-neutral-950" />;
}

