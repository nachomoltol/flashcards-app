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
        const nativeAdPromise = new Promise<ShowRewardedAdResult>((resolve) => {
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
              // En lugar de rechazar y bloquear al usuario si AdMob no tiene fill o falla el despliegue nativo,
              // activamos la simulación con cuenta atrás garantizada en Android
              console.warn('AdMob FailedToShow, activando emulación de respaldo:', err);
              emulateRewardedAdDialog().then(resolve);
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
              // Si falla al preparar (ej. No Fill o plugin nativo en APK no enlazado),
              // recurrimos a la emulación controlada en lugar de bloquear
              console.warn('Fallo en AdMob.prepareRewardVideoAd, activando emulación de respaldo:', err);
              emulateRewardedAdDialog().then(resolve);
            });
        });

        return await nativeAdPromise;
      }
    } catch (err) {
      console.warn('Fallo en canal @capacitor-community/admob, recurriendo a emulación:', err);
      return emulateRewardedAdDialog();
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

  // 3. Canal 3: Si se ejecuta en Android pero el APK actual aún no tiene el binario nativo enlazado,
  // emula el anuncio bonificado con cuenta atrás de 5 segundos para que la experiencia nunca quede bloqueada
  return emulateRewardedAdDialog();
}

/**
 * Emula la visualización de un anuncio bonificado de AdMob mostrando una cuenta atrás de 5 segundos,
 * certificando que el frontend y Supabase sigan otorgando el crédito bonificado de forma ininterrumpida.
 */
function emulateRewardedAdDialog(): Promise<ShowRewardedAdResult> {
  return new Promise<ShowRewardedAdResult>((resolve) => {
    // Si no estamos en el navegador, resolver inmediatamente
    if (typeof document === 'undefined') {
      resolve({
        completed: true,
        reward: { amount: 1, type: 'generation_credit' },
      });
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'admob-test-overlay';
    overlay.className =
      'fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/95 backdrop-blur-md p-6 text-white font-sans animate-in fade-in duration-200 select-none';

    let countdown = 5;

    overlay.innerHTML = `
      <div class="max-w-md w-full bg-neutral-900 border border-amber-500/40 rounded-3xl p-6 sm:p-8 text-center space-y-6 shadow-2xl shadow-amber-950/40">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-semibold tracking-wide">
          <span class="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
          GOOGLE ADMOB • ANUNCIO BONIFICADO
        </div>

        <div class="space-y-2">
          <h3 class="text-xl font-bold text-white">Visualizando Anuncio Bonificado</h3>
          <p class="text-xs text-neutral-300 leading-relaxed">
            Completa la cuenta atrás para desbloquear tu próxima generación de tarjetas con IA.
          </p>
        </div>

        <div class="relative w-28 h-28 mx-auto flex items-center justify-center">
          <div class="absolute inset-0 rounded-full border-4 border-amber-500/20 border-t-amber-400 animate-spin"></div>
          <span id="admob-timer-num" class="text-4xl font-extrabold text-amber-400 font-mono">${countdown}s</span>
        </div>

        <p class="text-xs text-neutral-400">
          Recompensa al finalizar: <strong class="text-emerald-400">+1 crédito de generación con IA</strong>
        </p>

        <div class="pt-2 flex gap-3 justify-center">
          <button id="admob-cancel-btn" type="button" class="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white text-xs font-medium transition cursor-pointer">
            Cancelar (Sin recompensa)
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const timerNumEl = overlay.querySelector('#admob-timer-num');
    const cancelBtn = overlay.querySelector('#admob-cancel-btn');

    const interval = setInterval(() => {
      countdown -= 1;
      if (timerNumEl) {
        timerNumEl.textContent = `${countdown}s`;
      }

      if (countdown <= 0) {
        clearInterval(interval);
        cleanup();
        resolve({
          completed: true,
          reward: {
            amount: 1,
            type: 'generation_credit',
          },
        });
      }
    }, 1000);

    const cleanup = () => {
      clearInterval(interval);
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
    };

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        cleanup();
        resolve({
          completed: false,
          error: 'Visualización cancelada por el usuario.',
        });
      });
    }
  });
}
