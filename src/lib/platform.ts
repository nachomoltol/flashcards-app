'use client';

import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

export interface PlatformInfo {
  /** Indica si la aplicación se está ejecutando dentro de un contenedor nativo Android (Capacitor, TWA o WebView) */
  isNativeAndroid: boolean;
  /** Indica si se ejecuta bajo el runtime nativo de Capacitor en Android */
  isCapacitorAndroid: boolean;
  /** Indica si se ejecuta en una Trusted Web Activity (TWA) de Android */
  isTWA: boolean;
  /** Indica si se ejecuta dentro de un WebView de Android con puente nativo */
  isAndroidWebView: boolean;
  /** Indica si es un navegador de escritorio tradicional o PWA web en PC */
  isWebDesktop: boolean;
  /** Indica si el dispositivo es un navegador móvil estándar (fuera de wrapper nativo) */
  isMobileBrowser: boolean;
  /** Indica si el dispositivo es iOS (iPhone, iPad o iPod) */
  isIOS: boolean;
}

/**
 * Detecta de forma síncrona las capacidades del entorno actual del cliente.
 */
export function detectPlatform(): PlatformInfo {
  if (typeof window === 'undefined') {
    return {
      isNativeAndroid: false,
      isCapacitorAndroid: false,
      isTWA: false,
      isAndroidWebView: false,
      isWebDesktop: true,
      isMobileBrowser: false,
      isIOS: false,
    };
  }

  const userAgent = navigator.userAgent || '';
  const isAndroidOS = /Android/i.test(userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent);

  // 1. Detección de Capacitor Nativo en Android (mediante SDK oficial de Capacitor)
  const isCapacitorAndroid = Boolean(
    typeof window !== 'undefined' &&
      Capacitor.isNativePlatform() &&
      Capacitor.getPlatform() === 'android'
  );

  // 2. Detección de Trusted Web Activity (TWA)
  // En TWAs de Android, document.referrer incluye 'android-app://<package-name>'
  // o se inyecta un parámetro de inicio 'utm_source=twa' o 'source=twa'
  const isTWA = Boolean(
    typeof document !== 'undefined' &&
      (document.referrer.startsWith('android-app://') ||
        window.location.search.includes('source=twa') ||
        window.sessionStorage?.getItem('flashmente_platform') === 'twa')
  );

  // 3. Detección de Android WebView o puente JavaScript inyectado (window.Android / window.AndroidAdMob)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasAndroidBridge = Boolean((window as any).Android || (window as any).AndroidAdMob);
  const isAndroidWebView =
    isAndroidOS &&
    (/wv/i.test(userAgent) ||
      /Version\/[\d.]+/i.test(userAgent) ||
      hasAndroidBridge);

  const isNativeAndroid = isAndroidOS || isCapacitorAndroid || isTWA || isAndroidWebView || hasAndroidBridge;
  const isMobileDevice = isAndroidOS || isIOS;
  const isWebDesktop = !isNativeAndroid && !isMobileDevice;
  const isMobileBrowser = isMobileDevice && !isNativeAndroid;

  // Persistir en sessionStorage si se detectó TWA para mantener contexto durante la sesión
  if (isTWA && typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.setItem('flashmente_platform', 'twa');
    } catch {
      // Ignorar si sessionStorage está bloqueado
    }
  }

  return {
    isNativeAndroid,
    isCapacitorAndroid,
    isTWA,
    isAndroidWebView,
    isWebDesktop,
    isMobileBrowser,
    isIOS,
  };
}

/**
 * Hook de React para acceder a la información de la plataforma detectada.
 * Se inicializa tras el montaje en el cliente para garantizar compatibilidad con SSR.
 */
export function usePlatform(): PlatformInfo {
  const [platform, setPlatform] = useState<PlatformInfo>({
    isNativeAndroid: false,
    isCapacitorAndroid: false,
    isTWA: false,
    isAndroidWebView: false,
    isWebDesktop: true,
    isMobileBrowser: false,
    isIOS: false,
  });

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  return platform;
}
