'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      // En desarrollo (localhost), desactivar inmediatamente cualquier Service Worker activo
      // y vaciar CacheStorage para evitar servir bundles cacheados o bloquear cambios de la UI
      if (process.env.NODE_ENV === 'development') {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const reg of registrations) {
            reg.unregister();
            console.log('[PWA-Dev] Service worker desinstalado para evitar caché local:', reg.scope);
          }
        });
        if ('caches' in window) {
          caches.keys().then((keys) => {
            for (const key of keys) {
              caches.delete(key);
            }
          });
        }
        return;
      }

      // En producción, registrar y forzar activación ante cambios
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((registration) => {
            // Forzar actualización inmediata si hay un worker nuevo esperando
            registration.update();
            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    newWorker.postMessage({ type: 'SKIP_WAITING' });
                  }
                });
              }
            });
            console.log('[PWA] Service Worker registrado con éxito en scope:', registration.scope);
          })
          .catch((err) => {
            console.warn('[PWA] Fallo al registrar Service Worker:', err);
          });
      });
    }
  }, []);

  return null;
}
