/**
 * Automatische Sicherung auf dem iPad (vgl. main/services/storage/autoSicherung.ts am PC).
 *
 * Gleicher Inhalt (wartung.sicherung(): ohne API-Schlüssel, mit Lehrwerken, Vokabel-Bibliothek
 * und Maskottchen), gleiche Namen, gleicher Takt (60 s nach dem Start, dann stündlich geprüft,
 * einmal am Tag). Abgelegt wird aber in Dokumente/Sicherungen: Dort sieht die Lehrkraft die
 * Dateien in der Dateien-App und kann sie in die iCloud oder auf den PC kopieren. Der Ordner wird
 * beim Start NICHT in den Speicher geladen (die Sicherungen können groß sein) – deshalb arbeitet
 * diese Fassung asynchron direkt mit @capacitor/filesystem.
 */
import { Directory, Filesystem } from '@capacitor/filesystem'
import { dateiname, faellig, STANDARD_BEHALTEN, type SicherungsEintrag } from '../../main/services/storage/autoSicherung'
import { sicherung } from '../../main/services/storage/wartung'
import { getSettings, setSettings } from '../../main/services/storage/settings'
import { protokolliere } from '../../main/services/protokoll'
import { ausBase64, nachBase64 } from '../base64'

export const ORDNER = 'Sicherungen'
const NAME = /^Schul-Apps Sicherung \d{4}-\d{2}-\d{2} \d{2}-\d{2}\.json$/
const ort = { directory: Directory.Documents }

export async function listeSicherungen(): Promise<SicherungsEintrag[]> {
  let dateien: { name: string; size: number; mtime: number; type: string }[] = []
  try {
    dateien = (await Filesystem.readdir({ path: ORDNER, ...ort })).files
  } catch {
    return []
  }
  return dateien
    .filter((f) => f.type !== 'directory' && NAME.test(f.name))
    .map((f) => ({ name: f.name, groesse: f.size, erstellt: new Date(Number(f.mtime) || Date.now()).toISOString() }))
    .sort((a, b) => b.name.localeCompare(a.name))
}

export async function ladeSicherung(name: string): Promise<Uint8Array> {
  if (!NAME.test(name)) throw new Error('Unbekannte Sicherung.')
  const { data } = await Filesystem.readFile({ path: `${ORDNER}/${name}`, ...ort })
  return typeof data === 'string' ? ausBase64(data) : new Uint8Array(await data.arrayBuffer())
}

async function raeumeAuf(behalten: number): Promise<void> {
  for (const e of (await listeSicherungen()).slice(Math.max(1, behalten))) {
    await Filesystem.deleteFile({ path: `${ORDNER}/${e.name}`, ...ort }).catch(() => undefined)
  }
}

export async function sichereJetzt(jetzt = new Date()): Promise<SicherungsEintrag> {
  const s = getSettings()
  const name = dateiname(jetzt)
  const { daten } = sicherung()
  await Filesystem.writeFile({ path: `${ORDNER}/${name}`, data: nachBase64(daten), recursive: true, ...ort })
  await raeumeAuf(s.sicherung?.behalten ?? STANDARD_BEHALTEN)
  setSettings({ letzteSicherung: jetzt.toISOString() })
  protokolliere('info', 'sicherung', `Automatische Sicherung ${name} (${Math.round(daten.byteLength / 1024)} KB)`)
  return { name, groesse: daten.byteLength, erstellt: jetzt.toISOString() }
}

/** Beim Start einrichten: nach 60 s prüfen, dann stündlich (läuft nur, solange die App offen ist) */
export function starteAutoSicherung(): void {
  const pruefe = async (): Promise<void> => {
    try {
      const s = getSettings()
      if (faellig(s.letzteSicherung, s.sicherung?.automatisch, new Date())) await sichereJetzt()
    } catch (e) {
      protokolliere('fehler', 'sicherung', `Automatische Sicherung fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  setTimeout(() => void pruefe(), 60_000)
  setInterval(() => void pruefe(), 60 * 60 * 1000)
}
