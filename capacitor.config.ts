import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.moneytour.android',
  appName: 'Money Tour',
  webDir: 'apps/web/dist',
  server: {
    hostname: 'localhost',
    androidScheme: 'https',
    cleartext: false,
    errorPath: 'android-update-required.html',
  },
  android: {
    backgroundColor: '#142d3d',
    allowMixedContent: false,
    minWebViewVersion: 111,
  },
  plugins: {
    SystemBars: {
      style: 'DARK',
      insetsHandling: 'native',
      initialViewportFitValueHint: 'contain',
    },
  },
};

export default config;
