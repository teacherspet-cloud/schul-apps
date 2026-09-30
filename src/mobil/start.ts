/**
 * Einstieg der iPad-/iPhone-App (Capacitor, WKWebView).
 *
 * Am PC laufen Oberfläche und „Hauptprozess" getrennt (Electron). Hier läuft beides in EINEM
 * Fenster: Die Aufrufe der Oberfläche (window.api) gehen direkt an dieselben Dienste wie am PC
 * (main/kanaele.ts), nur mit der Umgebung des iPads (mobil/umgebung.ts) und einem Dateisystem im
 * Speicher (mobil/vfs).
 *
 * Reihenfolge (jede Stufe braucht die vorige):
 *  1. Node-Ersatz (Buffer, process) – die Dienste greifen schon beim Laden darauf zu
 *  2. Dateisystem laden (Einstellungen, Materialien, Schlüssel aus dem Schlüsselbund)
 *  3. Abrufe fremder Seiten über die native HTTP-Schicht, keine Namensauflösung
 *  4. window.api aufbauen, Plattform „ios" melden; KI-Aufrufe auf Wunsch an die App am PC
 *     weiterreichen („Abo über den PC", mobil/pcKi.ts)
 *  5. Sicherung, Modelllisten und Sichern beim Wechsel in den Hintergrund
 *  6. Die Oberfläche selbst – dieselbe wie am PC
 */
import './shims/global'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { SplashScreen } from '@capacitor/splash-screen'
import { SCHULMATERIAL } from '@shared/schulmaterial'
import { buildApi } from '@shared/apiShape'
import type { AiProviderId } from '@shared/types'
import { aktualisiereModelle, registriereKanaele } from '../main/kanaele'
import { setzeAbrufer } from '../main/services/images/politeFetch'
import { setzeAufloeser } from '../main/services/netz/zieladresse'
import { getSettings, setSettings } from '../main/services/storage/settings'
import { protokolliere } from '../main/services/protokoll'
import { writeFileSync } from 'fs'
import { pruefeAudioName } from '../main/services/audio/elevenlabs'
import { ausBase64 } from './base64'
import { bus } from './bus'
import { erstellePcKi } from './pcKi'
// Statusleiste, Kamera-Aussparung und App-Wechsel-Balken freihalten – nur in der App (30.09.2026)
import './sicherBereich.css'
import { capHttpFetch } from './netz/capHttpFetch'
import { starteAutoSicherung } from './sicherung/autoSicherung'
import { mobilUmgebung } from './umgebung'
import { vfsLaden, vorbereiten } from './vfs/mounts'
import { vfs } from './vfs/speicher'

/** Nur im Prüf-Build (SCHULAPPS_MOBIL_TEST=1, vite.mobil.config.ts) – im Build für die Lehrkraft immer false */
declare const __KI_ATTRAPPE_ERLAUBT__: boolean

/** Wie über IPC: Aufrufer und Dienst teilen keine Objekte */
function kopie<T>(wert: T): T {
  try {
    return structuredClone(wert)
  } catch {
    return wert
  }
}

/**
 * Den Abo-Zugang gibt es auf dem iPad nicht (kein Programm des Anbieters, keine Prozesse).
 * Wer die Einstellungen aus einer Sicherung des PCs mitbringt, bekommt „API-Schlüssel".
 */
function aboAufSchluessel(): void {
  const { ai } = getSettings()
  const umstellen = (zugang: Record<string, string>): Record<string, 'api'> =>
    Object.fromEntries(
      Object.entries(zugang)
        .filter(([, v]) => v === 'subscription')
        .map(([k]) => [k, 'api' as const])
    )
  const access = umstellen(ai.access as Record<AiProviderId, string>)
  const imageAccess = umstellen(ai.imageAccess as Record<AiProviderId, string>)
  if (Object.keys(access).length || Object.keys(imageAccess).length) setSettings({ ai: { access, imageAccess } })
}

/**
 * Den Ordner Schulmaterial gleich anlegen (30.09.2026): „Auf meinem iPad › Schul-Apps" zeigt die
 * Dateien-App erst, wenn die App dort etwas abgelegt hat. So findet die Lehrkraft den Ort schon
 * vor dem ersten Speichern. Nur mit eingeschalteter Ablage (Einstellung schulmaterialAblage).
 */
async function schulmaterialAnlegen(): Promise<void> {
  if (getSettings().schulmaterialAblage === false) return
  try {
    await Filesystem.stat({ path: SCHULMATERIAL, directory: Directory.Documents })
  } catch {
    await Filesystem.mkdir({ path: SCHULMATERIAL, directory: Directory.Documents, recursive: true }).catch(() => undefined)
  }
}

/** Prüf-Build: KI-Attrappe aus dem Browserspeicher (services/ai/attrappe.ts), nie im Betrieb */
function kiAttrappe(): void {
  if (!__KI_ATTRAPPE_ERLAUBT__) return
  let inhalt: string | null = null
  try {
    inhalt = localStorage.getItem('schulapps-ki-attrappe')
  } catch {
    inhalt = null
  }
  if (!inhalt) return
  vfs.schreibe('/tmp/ki-attrappe.json', new TextEncoder().encode(inhalt))
  // vite.mobil.config.ts leitet process.env.SCHULAPPS_KI_ATTRAPPE hierhin
  ;(globalThis as { __SCHULAPPS_KI_ATTRAPPE__?: string }).__SCHULAPPS_KI_ATTRAPPE__ = '/tmp/ki-attrappe.json'
}

/** Zuletzt gelesener KI-Stand des PCs („Abo über den PC", mobil/pcKi.ts) */
const PC_STAND = 'schulapps.pcKi.stand'

/** Kanäle, deren Ressourcen erst bei Bedarf geladen werden (vfs/mounts.ts) */
const MIT_RESSOURCEN = /^(lehrplan:themen|schulen:|images:openmoji-)/

async function starten(): Promise<void> {
  vfs.onSchreibfehler = (pfad, e) => console.error(`Speichern von ${pfad} fehlgeschlagen`, e)
  await vfsLaden()

  setzeAbrufer(capHttpFetch)
  // Ohne Namensauflösung: pruefeZiel prüft weiter Schema, Zugangsdaten und Rechnernamen
  setzeAufloeser(async (host) => [host])
  try {
    aboAufSchluessel()
  } catch (e) {
    console.error(e)
  }
  kiAttrappe()
  void schulmaterialAnlegen()

  const aufrufe = new Map<string, (...args: unknown[]) => unknown>()
  const lokal = async (kanal: string, args: unknown[]): Promise<unknown> => {
    const fn = aufrufe.get(kanal)
    if (!fn) throw new Error(`Unbekannter Aufruf „${kanal}".`)
    return fn(...args)
  }
  // „Abo über den PC": KI-Aufrufe an Schul-Apps am PC, wenn in den Einstellungen gewählt
  const pcKi = erstellePcKi({
    einstellungen: () => getSettings().pcKi,
    lokal,
    emit: (kanal, wert) => bus.emit(kanal, wert),
    // Die am PC vertonte Datei hier ablegen – audio:read findet sie dann wie eine eigene Vertonung
    hoerdateiAblegen: ({ fileName, dataUrl }) => {
      const b64 = String(dataUrl ?? '').split(',')[1]
      if (b64) writeFileSync(pruefeAudioName(fileName), ausBase64(b64))
    },
    // Den KI-Stand des PCs über Neustarts merken: Sparmodus und Modell stimmen dann sofort
    standSpeicher: {
      lies: () => {
        try {
          return JSON.parse(localStorage.getItem(PC_STAND) ?? 'null')
        } catch {
          return null
        }
      },
      schreibe: (stand) => {
        try {
          localStorage.setItem(PC_STAND, JSON.stringify(stand))
        } catch {
          // ohne Speicher fragt die App den PC eben erneut
        }
      }
    }
  })
  // Verbindung zum PC schon beim Start herstellen – der erste Auftrag wartet dann nicht darauf
  setTimeout(() => pcKi.vorwaermen(), 1500)
  registriereKanaele((kanal, fn) => aufrufe.set(kanal, fn as (...args: unknown[]) => unknown), mobilUmgebung(pcKi))

  const call = async <T>(kanal: string, ...args: unknown[]): Promise<T> => {
    const fn = aufrufe.get(kanal)
    if (!fn) throw new Error(`Unbekannter Aufruf „${kanal}".`)
    // Nur wo nötig warten: Ein Aufruf ohne Umweg bleibt Folge des Klicks (Dateiauswahl, Teilen)
    if (MIT_RESSOURCEN.test(kanal)) await vorbereiten(kanal, args)
    try {
      const weiter = pcKi.weiterleiten(kanal, kopie(args))
      return kopie((await (weiter ?? fn(...kopie(args)))) as T)
    } catch (err) {
      const meldung = err instanceof Error ? err.message : String(err)
      if (!/abgebrochen|aborted/i.test(meldung)) {
        try {
          protokolliere('fehler', `aufruf ${kanal}`, meldung)
        } catch {
          // Das Protokoll darf den Fehler nicht verdecken
        }
      }
      throw new Error(meldung)
    }
  }

  window.api = buildApi(call, { pathOf: () => '', subscribe: bus.subscribe })
  window.__plattform = 'ios'

  starteAutoSicherung()
  // Modelllisten im Hintergrund abgleichen – beim Start und alle 12 Stunden
  setTimeout(() => void aktualisiereModelle(), 5000)
  setInterval(() => void aktualisiereModelle(), 12 * 60 * 60 * 1000)

  // Beim Wechsel in den Hintergrund sofort alles schreiben – iOS kann die App danach jederzeit beenden
  const sichern = (): void => void vfs.sichereAlles()
  if (Capacitor.isNativePlatform()) {
    void App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) sichern()
      // Zurück im Vordergrund: Die Verbindung zum PC ist nach dem Ruhezustand meist weg
      else pcKi.vorwaermen()
    })
    void App.addListener('pause', sichern)
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sichern()
  })
  window.addEventListener('pagehide', sichern)

  await import('../renderer/src/main')
  if (Capacitor.isNativePlatform()) void SplashScreen.hide().catch(() => undefined)
}

void starten().catch((e: unknown) => {
  console.error(e)
  const root = document.getElementById('root')
  if (root) {
    root.innerHTML = ''
    const p = document.createElement('p')
    p.style.cssText = 'font-family:-apple-system,sans-serif;padding:2em;color:#b00'
    p.textContent = `Die App konnte nicht starten: ${e instanceof Error ? e.message : String(e)}`
    root.appendChild(p)
  }
})
