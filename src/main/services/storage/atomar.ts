/**
 * Absturzsicheres Schreiben (27.09.2026, Befund der Bestandsaufnahme).
 *
 * Erst in eine Hilfsdatei mit Zufallsendung, dann umbenennen: Bricht das Programm mitten im
 * Schreiben ab (Absturz, Stromausfall, Dropbox hält die Datei), bleibt die alte Fassung ganz.
 * Bis dahin schrieben nur die Materialordner so; Einstellungen, Schlüssel, Vokabel-Bibliothek,
 * Logo, Piktogramme, Maskottchen und Hörtexte wurden direkt überschrieben – eine halb
 * geschriebene settings.json hätte beim nächsten Start alle Einstellungen verloren.
 */
import { randomBytes } from 'crypto'
import { renameSync, rmSync, writeFileSync } from 'fs'

export function writeAtomic(file: string, content: string | Uint8Array): void {
  const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`
  try {
    if (typeof content === 'string') writeFileSync(tmp, content, 'utf8')
    else writeFileSync(tmp, content)
    renameSync(tmp, file)
  } catch (e) {
    rmSync(tmp, { force: true })
    throw e
  }
}
