'use client';

import { useEffect, useRef } from 'react';
import { initAdMobWithATT } from '@/lib/admob';
import { detectPlatform } from '@/lib/platform';

/**
 * Componente de inicialización temprana para aplicaciones nativas (iOS y Android).
 * En iOS, garantiza que el diálogo de App Tracking Transparency (ATT) de Apple se dispare
 * con un retardo controlado (~600ms) tras el montaje de la interfaz, satisfaciendo el Guideline 2.1.
 */
export function NativeAppInit() {
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const platform = detectPlatform();
    if (platform.isNativeIOS) {
      initAdMobWithATT(600).catch((err) => {
        console.warn('[NativeAppInit] Error al inicializar ATT en iOS:', err);
      });
    }
  }, []);

  return null;
}
