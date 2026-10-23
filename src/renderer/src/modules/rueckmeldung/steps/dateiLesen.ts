import { pruefeHochladen, type HochladeInhalt } from '../../../shared/datenschutz'
import { extractContent } from '../../../shared/files/extractContent'
import type { GeleseneDatei } from '../aufgabeAusMaterial'
import { excelAlsText } from '../tabelle'

/**
 * Dateien für einen KI-Auftrag lesen und den Datenschutz prüfen (23.10.2026, aus TabelleKarte/MaterialSchritt
 * zusammengezogen): Text und Seitenbilder, Excel als Text. `null`, wenn die Lehrkraft abbricht.
 */
export async function leseUndPruefe(files: File[], melde: (text: string | null) => void, maxSeiten = 6): Promise<GeleseneDatei[] | null> {
  const gelesen: HochladeInhalt[] = []
  try {
    for (const f of files) {
      melde(`${f.name} wird gelesen …`)
      if (/\.xlsx$/i.test(f.name)) gelesen.push({ fileName: f.name, text: await excelAlsText(f), kind: 'text' })
      else {
        const c = await extractContent(f, (m) => melde(`${f.name}: ${m}`), { renderPages: false, maxRenderedPages: maxSeiten })
        gelesen.push({ fileName: c.fileName, text: c.kind === 'image' ? '' : c.text, kind: c.kind, pageImages: c.pageImages })
      }
    }
  } finally {
    melde(null)
  }
  return pruefeHochladen(gelesen)
}
