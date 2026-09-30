/**
 * Die Umgebung der Aufrufe auf dem iPad – Gegenstück zu main/umgebung.ts (PC), siehe main/kanaele.ts.
 *
 * Was am PC ein Dialog ist, ist hier:
 *  - Datei speichern → Dokumente/Ausgaben (sichtbar in der Dateien-App) und das Teilen-Menü
 *    (AirDrop, Mail, „In Dateien sichern", Drucken …); Material mit Ablageziel seit 30.09.2026
 *    geordnet nach Dokumente/Schulmaterial/<Fach>/<Themenbereich>, ohne Teilen-Menü – die
 *    Oberfläche meldet den Ort und bietet „Teilen" an (shared/schulmaterial.ts)
 *  - Datei öffnen → die Dateiauswahl von iOS (<input type=file>)
 *  - Ordner wählen → ein neuer Ordner Dokumente/Ausgaben/<Datum Uhrzeit>; „Ordner öffnen" teilt
 *    danach alle Dateien darin
 *  - Im Ordner zeigen → teilen
 *  - Drucken → AirPrint (mobil/export/druckmaschine.ts)
 * Netzzugang und Abo-Zugang gibt es nicht (lan: null; stubs/cli.ts) – wohl aber „Abo über den PC":
 * KI-Aufrufe an die App am PC weiterreichen (mobil/pcKi.ts, hier nur der Verbindungstest).
 */
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { freierDateiname } from '@shared/dateiname'
import { schulmaterialOrdner } from '@shared/schulmaterial'
import type { AblageZiel, FileFilter } from '@shared/types'
import { getSettings } from '../main/services/storage/settings'
import type { Umgebung } from '../main/kanaele'
import { bus } from './bus'
import { druckmaschine } from './export/druckmaschine'
import type { PcKi } from './pcKi'
import { ladeSicherung, listeSicherungen, sichereJetzt } from './sicherung/autoSicherung'
import { DOKUMENTE, USERDATA } from './vfs/mounts'
import { normiere, vfs } from './vfs/speicher'

export const AUSGABEN = `${DOKUMENTE}/Ausgaben`

const zwei = (n: number): string => String(n).padStart(2, '0')
const stempel = (d = new Date()): string => `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())} ${zwei(d.getHours())}-${zwei(d.getMinutes())}`
const sauber = (name: string): string => name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Datei'

/** Wo eine Datei des Speicher-Dateisystems auf dem Gerät liegt (für das Teilen) */
function geraeteOrt(pfad: string): { directory: Directory; path: string } | null {
  const p = normiere(pfad)
  if (p.startsWith(DOKUMENTE + '/')) return { directory: Directory.Documents, path: p.slice(DOKUMENTE.length + 1) }
  if (p.startsWith(USERDATA + '/')) return { directory: Directory.Library, path: `SchulApps/${p.slice(USERDATA.length + 1)}` }
  return null
}

/** Gibt es die Datei schon auf dem Gerät (auch aus einer früheren Sitzung)? */
async function gibtEs(pfad: string): Promise<boolean> {
  if (vfs.existiert(pfad)) return true
  const ort = geraeteOrt(pfad)
  if (!ort) return false
  try {
    await Filesystem.stat(ort)
    return true
  } catch {
    return false
  }
}

/** Freier Name im Ordner – wie am PC ein „(2)" statt Überschreiben, geprüft auch gegen das Gerät */
async function freierPfad(ordner: string, name: string): Promise<string> {
  const basis = sauber(name)
  const belegt = new Set<string>()
  for (;;) {
    const kandidat = freierDateiname(basis, (x) => belegt.has(x) || vfs.existiert(`${ordner}/${x}`))
    if (!(await gibtEs(`${ordner}/${kandidat}`))) return `${ordner}/${kandidat}`
    belegt.add(kandidat)
  }
}

function herunterladen(name: string, daten: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([new Uint8Array(daten).slice().buffer]))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Dateien über das Teilen-Menü von iOS weitergeben; im Browser werden sie heruntergeladen */
export async function teilen(pfade: string[], titel = 'Schul-Apps'): Promise<void> {
  if (!pfade.length) return
  // Das Teilen-Menü liest vom Gerät – also erst alles Anstehende schreiben
  await vfs.sichereAlles()
  if (!Capacitor.isNativePlatform()) {
    for (const p of pfade) herunterladen(p.split('/').pop() ?? 'Datei', vfs.lies(p))
    return
  }
  const files: string[] = []
  for (const p of pfade) {
    const ort = geraeteOrt(p)
    if (ort) files.push((await Filesystem.getUri(ort)).uri)
  }
  try {
    await Share.share({ title: titel, files })
  } catch (e) {
    // Schließen des Menüs ist kein Fehler
    if (!/cancel/i.test(e instanceof Error ? e.message : String(e))) throw e
  }
}

/** Die Dateiauswahl von iOS; die Datei landet als Kopie unter /tmp */
function waehleDatei(filters: FileFilter[]): Promise<string | null> {
  return new Promise((ok, fehler) => {
    const feld = document.createElement('input')
    feld.type = 'file'
    const endungen = filters.flatMap((f) => f.extensions).filter((e) => e && e !== '*')
    if (endungen.length) feld.accept = endungen.map((e) => `.${e}`).join(',')
    feld.style.display = 'none'
    feld.onchange = async () => {
      try {
        const datei = feld.files?.[0]
        if (!datei) return ok(null)
        const ordner = `/tmp/auswahl-${Date.now().toString(36)}`
        vfs.ordnerAnlegen(ordner, true)
        const ziel = `${ordner}/${sauber(datei.name)}`
        vfs.schreibe(ziel, new Uint8Array(await datei.arrayBuffer()))
        ok(ziel)
      } catch (e) {
        fehler(e)
      } finally {
        feld.remove()
      }
    }
    // Bricht die Lehrkraft ab, meldet iOS das (seit iOS 17) – sonst bleibt es bei „nichts gewählt"
    feld.oncancel = () => {
      feld.remove()
      ok(null)
    }
    document.body.appendChild(feld)
    feld.click()
  })
}

/** Schulmaterial-Ablage: nur mit Ziel und eingeschalteter Einstellung (Standard: an) */
function schulmaterialAn(ziel: AblageZiel | undefined): AblageZiel | null {
  if (!ziel || typeof ziel !== 'object' || typeof ziel.programm !== 'string') return null
  try {
    return getSettings().schulmaterialAblage === false ? null : ziel
  } catch {
    return ziel
  }
}

export function mobilUmgebung(pcKi?: PcKi): Umgebung {
  const aus = (): void => undefined
  return {
    sende: (kanal, wert) => bus.emit(kanal, wert),
    rundruf: (kanal, wert) => bus.emit(kanal, wert),
    anOberflaeche: (kanal, wert) => bus.emit(kanal, wert),
    fenster: { gesichert: aus, rueckfrage: aus, bleiben: aus },
    dateiAusgeben: async (name, _filters, daten, ablage) => {
      const geordnet = schulmaterialAn(ablage)
      const ordner = geordnet ? schulmaterialOrdner(DOKUMENTE, geordnet) : AUSGABEN
      vfs.ordnerAnlegen(ordner, true)
      const inhalt = typeof daten === 'function' ? await daten() : daten
      // Nie überschreiben – auch nicht, was aus einer früheren Sitzung auf dem Gerät liegt
      const ziel = await freierPfad(ordner, name)
      vfs.schreibe(ziel, typeof inhalt === 'string' ? new TextEncoder().encode(inhalt) : new Uint8Array(inhalt))
      if (geordnet) {
        // Die Oberfläche meldet den Ort und bietet „Teilen" an; erst schreiben, damit die Dateien-App sie gleich zeigt
        await vfs.sichereAlles()
        return ziel
      }
      await teilen([ziel], name)
      return ziel
    },
    dateiWaehlen: (filters) => waehleDatei(filters),
    ordnerWaehlen: async () => {
      vfs.ordnerAnlegen(AUSGABEN, true)
      const ziel = await freierPfad(AUSGABEN, `Ausgabe ${stempel()}`)
      vfs.ordnerAnlegen(ziel, true)
      return ziel
    },
    ordnerZeigen: async (ordner) => {
      const dateien = vfs.liste(ordner).filter((e) => !e.ordner)
      await teilen(
        dateien.map((e) => `${normiere(ordner)}/${e.name}`),
        ordner.split('/').pop()
      )
    },
    imOrdnerZeigen: (pfad) => {
      const liste = Array.isArray(pfad) ? pfad : [pfad]
      return teilen(liste, liste.length === 1 ? liste[0].split('/').pop() : 'Schul-Apps')
    },
    startDatei: () => null,
    startPaket: () => null,
    druck: druckmaschine,
    zertifikatWaehlen: async () => {
      const gewaehlt = await waehleDatei([{ name: 'Zertifikat mit privatem Schlüssel', extensions: ['pfx', 'p12'] }])
      if (!gewaehlt) return null
      // Dauerhaft ablegen – die Kopie unter /tmp ist nach dem Neustart weg
      const ordner = `${USERDATA}/zertifikat`
      vfs.ordnerAnlegen(ordner, true)
      const ziel = `${ordner}/${gewaehlt.split('/').pop()}`
      vfs.schreibe(ziel, new Uint8Array(vfs.lies(gewaehlt)))
      return ziel
    },
    sicherungen: {
      liste: listeSicherungen,
      laden: ladeSicherung,
      jetzt: () => sichereJetzt(),
      // Eine Kopie in einen zweiten Ordner gibt es nicht – die Sicherungen liegen schon in der Dateien-App
      ordnerWaehlen: async () => null
    },
    lan: null,
    // Die Windows-Firewall gibt es nur am Windows-PC (Kanal meldet „nur am Windows-PC")
    windowsFreigabe: null,
    pcKi: {
      testen: async (adresse, pin) => {
        if (!pcKi) throw new Error('Die Verbindung zum PC ist noch nicht bereit.')
        return pcKi.testen(adresse, pin)
      }
    }
  }
}
