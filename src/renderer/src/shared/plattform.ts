/**
 * Wo läuft die Oberfläche?
 *
 *  - 'pc'   – in der App am PC (Electron): Dialoge, Explorer, Druckerwahl, Netzzugang, Abo-Zugang
 *  - 'netz' – im Browser eines Tablets, verbunden mit dem PC (shared/netzZugang.ts)
 *  - 'ios'  – in der eigenständigen iPad-/iPhone-App (src/mobil): alles auf dem Gerät, KI nur
 *             über API-Schlüssel, Dateien über das Teilen-Menü, Drucken über AirPrint
 *
 * `imNetz()` bleibt die Weiche für den Browser im Netz; diese Datei ergänzt die iPad-App.
 */
import { imNetz } from './netzZugang'

export type Plattform = 'pc' | 'netz' | 'ios'

export function plattform(): Plattform {
  if (typeof window !== 'undefined' && window.__plattform === 'ios') return 'ios'
  return imNetz() ? 'netz' : 'pc'
}

/** In der iPad-/iPhone-App? */
export const aufIos = (): boolean => plattform() === 'ios'

/** Nur in der App am PC – Netzzugang, Abo-Zugang, Druckerwahl, Ordner im Explorer */
export const amPc = (): boolean => plattform() === 'pc'

declare global {
  interface Window {
    /** Setzt der Start der iPad-App (src/mobil/start.ts) */
    __plattform?: 'ios'
  }
}
