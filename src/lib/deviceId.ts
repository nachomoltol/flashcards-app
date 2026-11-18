'use client';

import { Capacitor } from '@capacitor/core';

const DEVICE_STORAGE_KEY = 'flashmente_device_id';
const COOKIE_MAX_AGE_SECONDS = 315360000; // 10 años

let inMemoryDeviceId: string | null = null;

/**
 * Genera un UUID estándar v4 compatible con navegadores antiguos y modernos.
 */
function generateFallbackUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Lee la cookie de identificador de dispositivo si existe.
 */
function getCookieDeviceId(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${DEVICE_STORAGE_KEY}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Guarda la cookie de identificador de dispositivo de larga duración.
 */
function setCookieDeviceId(deviceId: string): void {
  if (typeof document === 'undefined') return;
  try {
    document.cookie = `${DEVICE_STORAGE_KEY}=${encodeURIComponent(
      deviceId
    )}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
  } catch {
    // Silencioso ante bloqueos de cookies
  }
}

/**
 * Obtiene o inicializa de forma síncrona el identificador Web persistido en localStorage/cookie.
 */
export function getClientDeviceIdSync(): string {
  if (inMemoryDeviceId) return inMemoryDeviceId;

  if (typeof window === 'undefined') {
    return 'web_server_render';
  }

  // 1. Intentar leer de localStorage
  try {
    const stored = localStorage.getItem(DEVICE_STORAGE_KEY);
    if (stored && stored.trim()) {
      const cleanStored = stored.trim().startsWith('web_') || stored.trim().startsWith('native_')
        ? stored.trim()
        : `web_${stored.trim()}`;
      inMemoryDeviceId = cleanStored;
      setCookieDeviceId(cleanStored);
      return cleanStored;
    }
  } catch {
    // LocalStorage bloqueado
  }

  // 2. Intentar leer de Cookie
  const cookieId = getCookieDeviceId();
  if (cookieId && cookieId.trim()) {
    const cleanCookie = cookieId.trim().startsWith('web_') || cookieId.trim().startsWith('native_')
      ? cookieId.trim()
      : `web_${cookieId.trim()}`;
    inMemoryDeviceId = cleanCookie;
    try {
      localStorage.setItem(DEVICE_STORAGE_KEY, cleanCookie);
    } catch {
      // Ignorar
    }
    return cleanCookie;
  }

  // 3. Generar nuevo UUID web
  const newId = `web_${generateFallbackUUID()}`;
  inMemoryDeviceId = newId;

  try {
    localStorage.setItem(DEVICE_STORAGE_KEY, newId);
  } catch {
    // Ignorar
  }
  setCookieDeviceId(newId);

  return newId;
}

/**
 * Obtiene el identificador físico persistente del dispositivo.
 * - En app móvil nativa (Capacitor Android/iOS): devuelve 'native_<id>' mediante @capacitor/device.
 * - En Web / PWA / Safari iOS: devuelve 'web_<uuid>' persistido en localStorage y cookie.
 */
export async function getClientDeviceId(): Promise<string> {
  if (inMemoryDeviceId && inMemoryDeviceId.startsWith('native_')) {
    return inMemoryDeviceId;
  }

  // Entorno nativo de Capacitor (Android o iOS)
  if (Capacitor.isNativePlatform()) {
    try {
      const { Device } = await import('@capacitor/device');
      const deviceIdInfo = await Device.getId();
      if (deviceIdInfo?.identifier && deviceIdInfo.identifier.trim()) {
        const cleanId = `native_${deviceIdInfo.identifier.trim()}`;
        inMemoryDeviceId = cleanId;
        try {
          localStorage.setItem(DEVICE_STORAGE_KEY, cleanId);
        } catch {
          // Ignorar
        }
        setCookieDeviceId(cleanId);
        return cleanId;
      }
    } catch (err) {
      console.warn('[getClientDeviceId] Error al obtener Device.getId() nativo, recurriendo a fallback web:', err);
    }
  }

  // Fallback web estable
  return getClientDeviceIdSync();
}
