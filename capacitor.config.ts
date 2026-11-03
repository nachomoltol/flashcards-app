import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.flashmente.app',
  appName: 'Flashmente',
  webDir: 'public',
  server: {
    url: 'https://www.flashmente.com',
    cleartext: false,
    allowNavigation: [
      'www.flashmente.com',
      'flashmente.com',
      '*.flashmente.com',
      'fapjackhdqtnrpteujum.supabase.co'
    ]
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false
  }
};

export default config;
