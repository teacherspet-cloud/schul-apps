/**
 * Die dauerhafte Ablage hinter dem Speicher-Dateisystem: @capacitor/filesystem.
 *
 * Auf dem iPad liegt /userData unter Library/SchulApps (für die Lehrkraft unsichtbar, von iOS
 * mitgesichert), /documents im Dokumente-Ordner der App (sichtbar in der Dateien-App). Im
 * Browser (dev:mobil, Rauchtest) nimmt Capacitor dafür IndexedDB.
 */
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem, type FileInfo } from '@capacitor/filesystem'
import { ausBase64, nachBase64 } from '../base64'
import type { Traeger, Vfs } from './speicher'

const verbinde = (...teile: string[]): string => teile.filter(Boolean).join('/')

/** „Datei fehlt" ist beim Löschen kein Fehler */
const fehltNur = (e: unknown): boolean => /not exist|does not exist|no such|not found|ENOENT/i.test(e instanceof Error ? e.message : String(e))

export class CapacitorTraeger implements Traeger {
  constructor(readonly verzeichnis: Directory, readonly basis: string) {}

  pfad(rel: string): string {
    return verbinde(this.basis, rel)
  }

  async schreiben(rel: string, daten: Uint8Array): Promise<void> {
    await Filesystem.writeFile({ path: this.pfad(rel), data: nachBase64(daten), directory: this.verzeichnis, recursive: true })
  }

  async loeschen(rel: string): Promise<void> {
    try {
      await Filesystem.deleteFile({ path: this.pfad(rel), directory: this.verzeichnis })
    } catch (e) {
      if (!fehltNur(e)) throw e
    }
  }

  async ordnerLoeschen(rel: string): Promise<void> {
    try {
      await Filesystem.rmdir({ path: this.pfad(rel), directory: this.verzeichnis, recursive: true })
    } catch (e) {
      if (!fehltNur(e)) throw e
    }
  }

  /** Eine Datei lesen – auf dem Gerät schnell über die Dateiadresse des WebViews, sonst über das Plugin */
  async lesen(rel: string, info?: FileInfo): Promise<Uint8Array> {
    if (Capacitor.isNativePlatform()) {
      try {
        const uri = info?.uri ?? (await Filesystem.getUri({ path: this.pfad(rel), directory: this.verzeichnis })).uri
        const res = await fetch(Capacitor.convertFileSrc(uri))
        if (res.ok) return new Uint8Array(await res.arrayBuffer())
      } catch {
        // weiter über das Plugin
      }
    }
    const { data } = await Filesystem.readFile({ path: this.pfad(rel), directory: this.verzeichnis })
    return typeof data === 'string' ? ausBase64(data) : new Uint8Array(await data.arrayBuffer())
  }

  /** Den ganzen Baum in das Speicher-Dateisystem übernehmen (beim Start) */
  async allesLaden(vfs: Vfs, wurzel: string, auslassen: (rel: string) => boolean = () => false): Promise<number> {
    const dateien: { rel: string; info: FileInfo }[] = []
    const offen = ['']
    while (offen.length) {
      const rel = offen.pop()!
      let liste: FileInfo[]
      try {
        liste = (await Filesystem.readdir({ path: this.pfad(rel), directory: this.verzeichnis })).files
      } catch {
        continue // Ordner fehlt (erster Start)
      }
      for (const f of liste) {
        const relF = verbinde(rel, f.name)
        if (auslassen(relF)) continue
        if (f.type === 'directory') {
          vfs.ordnerUebernehmen(`${wurzel}/${relF}`)
          offen.push(relF)
        } else dateien.push({ rel: relF, info: f })
      }
    }
    // Höchstens zwölf zugleich – genug für Tempo, zu wenig, um den Speicher zu überfluten
    let naechste = 0
    const arbeiter = async (): Promise<void> => {
      while (naechste < dateien.length) {
        const { rel, info } = dateien[naechste++]
        try {
          vfs.uebernehmen(`${wurzel}/${rel}`, await this.lesen(rel, info), Number(info.mtime) || Date.now())
        } catch (e) {
          console.warn(`Datei ${rel} ließ sich nicht laden`, e)
        }
      }
    }
    await Promise.all(Array.from({ length: 12 }, arbeiter))
    return dateien.length
  }
}

export { Directory }
