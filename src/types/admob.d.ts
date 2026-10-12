/**
 * Declaraciones de tipos para @capacitor-community/admob.
 * Permite que el código web y de desarrollo compile limpiamente sin requerir
 * la dependencia nativa de Android instalada en el bundle del servidor Next.js.
 */
declare module '@capacitor-community/admob' {
  export interface AdOptions {
    adId: string;
    isTesting?: boolean;
    npa?: boolean;
  }

  export interface AdMobInitializationOptions {
    testingDevices?: string[];
    initializeForTesting?: boolean;
  }

  export interface AdMobRewardItem {
    type: string;
    amount: number;
  }

  export const RewardAdPluginEvents: {
    Loaded: string;
    FailedToLoad: string;
    Showed: string;
    FailedToShow: string;
    Dismissed: string;
    Rewarded: string;
  };

  export const AdMob: {
    initialize(options: AdMobInitializationOptions): Promise<void>;
    prepareRewardVideoAd(options: AdOptions): Promise<void>;
    showRewardVideoAd(): Promise<void>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addListener(eventName: string, listenerFunc: (info?: any) => void): Promise<{ remove: () => void }>;
  };
}
