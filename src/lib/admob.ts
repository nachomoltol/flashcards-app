'use client';

import { detectPlatform } from './platform';
import { useProModalStore } from '@/stores/useProModalStore';

/**
 * Identificadores de Google AdMob para Flashmente (Android Producción & Pruebas).
 * @see https://developers.google.com/admob/android/test-ads
 */
export const ADMOB_CONFIG = {
  // App ID oficial de Flashmente en Google AdMob (Producción)
  APP_ID: 'ca-app-pub-8525131609099761~8283952108',
  // ID de bloque de anuncio bonificado (Rewarded Ad Unit ID) oficial de producción
  REWARDED_AD_UNIT_ID: 'ca-app-pub-8525131609099761/8767167832',

  // Identificadores oficiales de Google AdMob para pruebas (Test Ad Unit IDs)
  TEST_REWARDED_AD_UNIT_ID: 'ca-app-pub-3940256099942544/5224354917',
  TEST_REWARDED_INTERSTITIAL_AD_UNIT_ID: 'ca-app-pub-3940256099942544/5354046379',
  TEST_APP_ID: 'ca-app-pub-3940256099942544~3347511713',
};

export interface AdReward {
  amount: number;
  type: string;
}

export interface ShowRewardedAdResult {
  completed: boolean;
  reward?: AdReward;
  error?: string;
}

// Interfaz para puente nativo en Android WebView / TWA si se implementa @JavascriptInterface
declare global {
  interface Window {
    AndroidAdMob?: {
      showRewardedAd: (adUnitId: string) => void;
      isAdReady?: () => boolean;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Capacitor?: any;
  }
}

let isAdMobInitialized = false;

/**
 * Inicializa el SDK de AdMob si se ejecuta dentro del entorno Capacitor nativo.
 * Utiliza importación dinámica para evitar fallos de empaquetado en entornos web/SSR.
 */
export async function initializeAdMob(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (isAdMobInitialized) return true;

  const platform = detectPlatform();

  // Si estamos en Capacitor Android, intentar cargar @capacitor-community/admob dinámicamente
  if (platform.isCapacitorAndroid) {
    try {
      // Dynamic import para no requerir la dependencia nativa en entornos web puros
      const admobModule = await import(
        /* webpackIgnore: true */ '@capacitor-community/admob'
      ).catch(() => null);

      if (admobModule?.AdMob) {
        const isDev = process.env.NODE_ENV === 'development';
        await admobModule.AdMob.initialize({
          testingDevices: isDev ? ['EMULATOR'] : [],
          initializeForTesting: isDev,
        });
        isAdMobInitialized = true;
        return true;
      }
    } catch (e) {
      console.warn('No se pudo inicializar @capacitor-community/admob:', e);
    }
  }

  isAdMobInitialized = true;
  return true;
}

/**
 * Presenta un anuncio bonificado de AdMob y resuelve la promesa cuando el usuario
 * completa la visualización requerida para recibir la bonificación (+1 crédito).
 */
export async function showAdMobRewardedAd(
  adUnitId: string = ADMOB_CONFIG.REWARDED_AD_UNIT_ID
): Promise<ShowRewardedAdResult> {
  const platform = detectPlatform();

  // Si la plataforma NO es Android nativo, los anuncios bonificados no aplican:
  // Se bloquea cualquier crédito simulado y se abre directamente el modal PRO.
  if (!platform.isNativeAndroid) {
    if (typeof window !== 'undefined') {
      useProModalStore.getState().openProModal(false);
    }
    return {
      completed: false,
      error: 'Los anuncios bonificados están disponibles exclusivamente en la aplicación Android. Pasa a PRO para continuar en Web.',
    };
  }

  // 1. Canal 1: Capacitor Nativo con @capacitor-community/admob
  if (platform.isCapacitorAndroid) {
    try {
      const admobModule = await import(
        /* webpackIgnore: true */ '@capacitor-community/admob'
      ).catch(() => null);

      if (admobModule?.AdMob) {
        const { AdMob, RewardAdPluginEvents } = admobModule;

        // Registrar listener de recompensa
        return new Promise<ShowRewardedAdResult>((resolve) => {
          let rewarded = false;

          const rewardListener = AdMob.addListener(
            RewardAdPluginEvents.Rewarded,
            (rewardItem: { amount: number; type: string }) => {
              rewarded = true;
              rewardListener.then((l: { remove: () => void }) => l.remove());
              resolve({
                completed: true,
                reward: {
                  amount: rewardItem?.amount || 1,
                  type: rewardItem?.type || 'generation_credit',
                },
              });
            }
          );

          const dismissListener = AdMob.addListener(
            RewardAdPluginEvents.Dismissed,
            () => {
              dismissListener.then((l: { remove: () => void }) => l.remove());
              if (!rewarded) {
                resolve({
                  completed: false,
                  error: 'El anuncio se cerró antes de completar la visualización obligatoria.',
                });
              }
            }
          );

          const failedListener = AdMob.addListener(
            RewardAdPluginEvents.FailedToShow,
            (err: { message?: string }) => {
              failedListener.then((l: { remove: () => void }) => l.remove());
              resolve({
                completed: false,
                error: err?.message || 'Error al desplegar el anuncio bonificado.',
              });
            }
          );

          // Preparar y desplegar el anuncio bonificado
          const isTestAd = adUnitId === ADMOB_CONFIG.TEST_REWARDED_AD_UNIT_ID;
          AdMob.prepareRewardVideoAd({
            adId: adUnitId,
            isTesting: isTestAd,
          })
            .then(() => AdMob.showRewardVideoAd())
            .catch((err: Error) => {
              resolve({
                completed: false,
                error: err.message || 'Error al cargar el anuncio bonificado.',
              });
            });
        });
      }
    } catch (err) {
      console.warn('Fallo en canal @capacitor-community/admob:', err);
    }
  }

  // 2. Canal 2: Android WebView / TWA vía @JavascriptInterface (window.AndroidAdMob)
  if (typeof window !== 'undefined' && window.AndroidAdMob?.showRewardedAd) {
    return new Promise<ShowRewardedAdResult>((resolve) => {
      const handleAdComplete = (e: Event) => {
        window.removeEventListener('admob:rewarded', handleAdComplete);
        window.removeEventListener('admob:cancelled', handleAdCancelled);
        const detail = (e as CustomEvent).detail;
        resolve({
          completed: true,
          reward: {
            amount: detail?.amount || 1,
            type: detail?.type || 'generation_credit',
          },
        });
      };

      const handleAdCancelled = () => {
        window.removeEventListener('admob:rewarded', handleAdComplete);
        window.removeEventListener('admob:cancelled', handleAdCancelled);
        resolve({
          completed: false,
          error: 'Anuncio omitido antes de recibir la recompensa.',
        });
      };

      window.addEventListener('admob:rewarded', handleAdComplete);
      window.addEventListener('admob:cancelled', handleAdCancelled);

      window.AndroidAdMob?.showRewardedAd(adUnitId);
    });
  }

  // Si se ejecuta en Android pero ningún canal nativo pudo desplegar el anuncio
  return {
    completed: false,
    error: 'No se pudo cargar el anuncio bonificado en este momento. Inténtalo de nuevo más tarde.',
  };
}
