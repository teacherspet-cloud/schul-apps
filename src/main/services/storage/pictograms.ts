/**
 * Selbst gestaltete Piktogramme.
 *
 * Die App liefert einen eigenen, gezeichneten Satz mit (siehe `render/pictograms.ts`). Wer ihn
 * nicht mag, lässt einzelne Symbole von der Bild-KI neu gestalten; das Ergebnis liegt hier und
 * gilt dann für alle Arbeitsblätter, Klassenarbeiten und Tests – nicht nur für das gerade
 * geöffnete Material.
 *
 * Je Symbol eine PNG-Datei, benannt nach seiner Kennung. Ein gelöschtes Bild fällt auf die
 * mitgelieferte Zeichnung zurück; es geht also nie etwas verloren.
 */
import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'fs'
import { writeAtomic } from './atomar'
import { join } from 'path'

function dir(): string {
  const d = join(app.getPath('userData'), 'piktogramme')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

/** Kennungen kommen aus dem Programm, werden aber trotzdem geprüft – sie werden zum Dateinamen. */
function checkId(id: string): string {
  if (!/^[a-z0-9_-]{2,40}$/.test(id)) throw new Error('Ungültige Piktogramm-Kennung.')
  return id
}

const filePath = (id: string): string => join(dir(), `${checkId(id)}.png`)

/** Alle selbst gestalteten Piktogramme als Kennung → data:-URL. */
export function getPictograms(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const file of readdirSync(dir()).filter((f) => f.endsWith('.png'))) {
    const id = file.replace(/\.png$/, '')
    try {
      out[id] = `data:image/png;base64,${readFileSync(join(dir(), file)).toString('base64')}`
    } catch {
      // Eine unlesbare Datei darf nicht die ganze Liste verhindern
    }
  }
  return out
}

export function setPictogram(id: string, dataUrl: string): void {
  const match = /^data:image\/png;base64,(.+)$/s.exec(dataUrl)
  if (!match) throw new Error('Das Piktogramm muss als PNG übergeben werden.')
  writeAtomic(filePath(id), Buffer.from(match[1], 'base64'))
}

/** Nimmt die eigene Gestaltung zurück – das mitgelieferte Symbol gilt wieder. */
export function removePictogram(id: string): void {
  rmSync(filePath(id), { force: true })
}

export function removeAllPictograms(): void {
  for (const file of readdirSync(dir()).filter((f) => f.endsWith('.png'))) {
    rmSync(join(dir(), file), { force: true })
  }
}
