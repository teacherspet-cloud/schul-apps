/**
 * Die Umgebung des Servers für main/kanaele.ts (02.10.2026) – Gegenstück zu main/umgebung.ts (PC)
 * und mobil/umgebung.ts (iPad).
 *
 * Auf dem Server gibt es keine Dialoge, keinen Explorer und keinen Drucker. Dateien lädt der
 * Browser selbst herunter (renderer/shared/netzZugang.ts); PDF entsteht mit Chromium (druck.ts).
 * IServ-Ordner (WebDAV) bleiben bewusst außen vor: Dafür bräuchte der Server das IServ-Passwort –
 * das darf ihn nie erreichen (Entscheidung der Lehrkraft). Das geht nur aus der Exe am PC.
 */
import type { Umgebung } from '../main/kanaele'
import { aktuellerNutzer } from './kontext'
import { anNutzer, ereignisZuAnfrage } from './ereignisse'
import { serverDruck } from './druck'

const NUR_IM_BROWSER = 'Auf dem Server gibt es keinen Dateidialog – die Datei wird im Browser heruntergeladen.'
export const KEIN_ISERV_AUF_DEM_SERVER =
  'IServ-Ordner gehen nur in der App am PC („Schul-Apps Online“ oder die bisherige Exe): Dafür bräuchte der Server das IServ-Passwort, und das bleibt auf dem eigenen Gerät.'

export function serverUmgebung(): Umgebung {
  const anMich = (kanal: string, wert: unknown): void => {
    const n = aktuellerNutzer()
    if (n) anNutzer(n.id, kanal, wert)
  }
  return {
    sende: (kanal, wert) => ereignisZuAnfrage(kanal, wert),
    // Modellhinweise betreffen die Einstellungen DIESES Nutzers
    rundruf: anMich,
    anOberflaeche: anMich,
    fenster: { gesichert: () => undefined, rueckfrage: () => undefined, bleiben: () => undefined },
    dateiAusgeben: async () => {
      throw new Error(NUR_IM_BROWSER)
    },
    dateiWaehlen: async () => null,
    ordnerWaehlen: async () => null,
    ordnerZeigen: async () => undefined,
    imOrdnerZeigen: async () => undefined,
    startDatei: () => null,
    startPaket: () => null,
    druck: serverDruck,
    zertifikatWaehlen: async () => null,
    // Gesichert wird der ganze Datenordner des Servers (Docker-Volume), nicht je Nutzer im Browser
    sicherungen: {
      liste: () => [],
      laden: () => {
        throw new Error('Sicherungen verwaltet der Server.')
      },
      jetzt: () => {
        throw new Error('Sicherungen verwaltet der Server.')
      },
      ordnerWaehlen: async () => null
    },
    lan: null,
    windowsFreigabe: null,
    pcKi: null,
    iserv: {
      abruf: async () => {
        throw new Error(KEIN_ISERV_AUF_DEM_SERVER)
      },
      passwort: {
        lies: async () => null,
        setze: async () => {
          throw new Error(KEIN_ISERV_AUF_DEM_SERVER)
        },
        loesche: async () => undefined
      }
    }
  }
}
