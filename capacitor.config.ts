import type { CapacitorConfig } from '@capacitor/cli'

/**
 * iPad-/iPhone-App (Capacitor). Die Web-Oberfläche baut `npm run build:mobil` nach out/mobil;
 * die unsignierte .ipa entsteht per GitHub Actions (.github/workflows/ios.yml).
 */
const config: CapacitorConfig = {
  appId: 'de.kornahrens.schulapps',
  appName: 'Schul-Apps',
  webDir: 'out/mobil',
  ios: {
    contentInset: 'never',
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: false
  },
  plugins: {
    CapacitorHttp: { enabled: false },
    Keyboard: { resize: 'native' },
    // Eigener Startbildschirm (App-Symbol auf Blau) bis die App geladen ist – src/mobil/start.ts blendet ihn aus
    SplashScreen: { launchAutoHide: false, backgroundColor: '#12325e', showSpinner: false }
  }
}

export default config
