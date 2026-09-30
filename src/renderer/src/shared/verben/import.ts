/**
 * Verbliste aus Scan, Foto, PDF oder Word übernehmen (30.09.2026).
 *
 * Die KI überträgt die Tabelle des Schulbuchs ZEILENWEISE und WÖRTLICH in die Spalten der Sprache
 * (Englisch: infinitive | simple past | past participle | German), erkennt Band und Seite und
 * markiert Zellen, bei denen sie unsicher ist (unscharf, abgeschnitten, zweideutig). Danach sieht die
 * Lehrkraft alles in einer Tabelle durch – unsichere Zellen sind hervorgehoben.
 *
 * Tabellen aus Textdateien (CSV, Tabulator, „|") liest die App selbst, ohne KI.
 */
import { AbbruchFehler } from '@shared/abbruch'
import { VERB_SPALTEN, type VerbEintrag, type VerbSprache } from '@shared/verben'
import type { StructuredRequest } from '@shared/types'
import { arr, obj, str } from '../aiSchema'
import { pruefeHochladen } from '../datenschutz'
import { extractContent } from '../files/extractContent'
import { newId } from '../../modules/vokabeltest/model/random'

type AiCall = <T>(req: StructuredRequest) => Promise<T>

export interface VerbImport {
  eintraege: VerbEintrag[]
  /** Band, wie ihn die KI auf der Seite erkannt hat („Green Line 3") – leer, wenn nicht erkennbar */
  band: string
  seite: string
  /** Anzahl Zellen, die die KI als unsicher markiert hat */
  unsicher: number
}

export function importSchema(sprache: VerbSprache): Record<string, unknown> {
  const spalten = VERB_SPALTEN[sprache]
  return obj({
    band: str('Titel und Band des Schulbuchs, falls auf der Seite erkennbar (z. B. „Green Line 3"), sonst leer'),
    seite: str('Seitenzahl(en), falls erkennbar, sonst leer'),
    zeilen: arr(
      obj({
        ...Object.fromEntries(spalten.map((s) => [s.id, str(`Spalte „${s.label}" – wörtlich, Varianten mit „/" (burnt/burned); leer, wenn die Zelle fehlt`)])),
        hinweis: str('Zusatz zur Zeile (Fußnote, „AE:", Anmerkung), sonst leer'),
        unsicher: arr(str(), `Kennungen der Spalten, deren Inhalt nicht sicher lesbar war: ${spalten.map((s) => s.id).join(', ')}`)
      })
    )
  }) as Record<string, unknown>
}

export function importAuftrag(sprache: VerbSprache): string {
  const spalten = VERB_SPALTEN[sprache]
  return [
    'Du überträgst eine Liste unregelmäßiger Verben aus einem Schulbuch (Scan, Foto, PDF oder Word) in eine Tabelle.',
    `Spalten (Kennung = Kopf im Buch): ${spalten.map((s) => `${s.id} = ${s.label}`).join(' | ')}.`,
    '- Übertrage JEDE Zeile der Liste in der Reihenfolge des Buches, WÖRTLICH – nichts verbessern, nichts ergänzen, nichts weglassen.',
    '- Varianten stehen mit Schrägstrich in derselben Zelle („burnt/burned", „was/were"). Klammerzusätze bleiben stehen.',
    '- Mehrere deutsche Bedeutungen bleiben in einer Zelle, mit Komma getrennt.',
    '- Lautschrift, Seitenzahlen, Überschriften und Bilder nicht übernehmen; Zeilen, die über zwei Druckzeilen laufen, zu EINER Zeile zusammenfassen.',
    '- Ist eine Zelle unscharf, abgeschnitten oder zweideutig, trage deine beste Lesart ein und nenne die Spalte unter „unsicher".',
    '- Ist eine Spalte im Buch gar nicht vorhanden, bleibt sie leer.'
  ].join('\n')
}

interface Antwort {
  band?: string
  seite?: string
  zeilen?: Record<string, unknown>[]
}

/** Die Antwort der KI in Einträge überführen – Varianten und Hinweise bleiben wörtlich */
export function uebernehmeKiAntwort(antwort: Antwort | null | undefined, sprache: VerbSprache): VerbImport {
  const spalten = VERB_SPALTEN[sprache].map((s) => s.id)
  let unsicher = 0
  const eintraege: VerbEintrag[] = []
  for (const z of antwort?.zeilen ?? []) {
    const formen: Record<string, string> = {}
    for (const id of spalten) {
      const v = typeof z[id] === 'string' ? (z[id] as string).replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim() : ''
      if (v) formen[id] = v
    }
    // Zeilen nur mit Deutsch oder ganz leer sind Überschriften oder Lesefehler
    if (!Object.keys(formen).some((k) => k !== 'de')) continue
    const u = (Array.isArray(z.unsicher) ? (z.unsicher as unknown[]) : []).map(String).filter((s) => spalten.includes(s))
    unsicher += u.length
    const hinweis = typeof z.hinweis === 'string' ? z.hinweis.trim() : ''
    eintraege.push({ id: newId(), formen, ...(hinweis ? { hinweis } : {}), ...(u.length ? { unsicher: [...new Set(u)] } : {}) })
  }
  return { eintraege, band: String(antwort?.band ?? '').trim(), seite: String(antwort?.seite ?? '').trim(), unsicher }
}

/** Textdatei (CSV, Tabulator, „|" oder „–") ohne KI: je Zeile ein Verb, Zellen in Spaltenreihenfolge */
export function leseTextTabelle(text: string, sprache: VerbSprache): VerbEintrag[] {
  const spalten = VERB_SPALTEN[sprache].map((s) => s.id)
  return text
    .split(/\r?\n/)
    .map((zeile) => zeile.trim())
    .filter(Boolean)
    .map((zeile) => zeile.split(zeile.includes('\t') ? '\t' : zeile.includes('|') ? '|' : zeile.includes(';') ? ';' : /\s[–-]\s/).map((z) => z.trim()))
    .filter((zellen) => zellen.length >= 2)
    .map((zellen) => {
      const formen: Record<string, string> = {}
      spalten.forEach((id, i) => {
        if (zellen[i]) formen[id] = zellen[i]
      })
      return { id: newId(), formen }
    })
    // Kopfzeile („infinitive | simple past …") überspringen
    .filter((e) => !VERB_SPALTEN[sprache].some((s) => s.grundform && e.formen[s.id]?.toLowerCase() === s.label.toLowerCase()))
}

/** Eine Datei einlesen: Text selbst, alles andere über die KI (nach der Datenschutzprüfung) */
export async function importiereVerbliste(file: File, sprache: VerbSprache, ai: AiCall, melde: (m: string) => void = () => undefined): Promise<VerbImport> {
  const name = file.name.toLowerCase()
  if (/\.(csv|tsv|txt)$/.test(name)) return { eintraege: leseTextTabelle(await file.text(), sprache), band: '', seite: '', unsicher: 0 }
  const gelesen = await extractContent(file, melde, { maxPages: 8, renderPages: true, maxRenderedPages: 6 })
  // Datenschutz: Hinweis beim ersten Hochladen, Namen ersetzen (wie beim Vokabelimport)
  const geprueft = await pruefeHochladen([gelesen])
  if (!geprueft) throw new AbbruchFehler()
  const inhalt = geprueft[0]
  melde('Die Tabelle wird übertragen …')
  const antwort = await ai<Antwort>({
    system: importAuftrag(sprache),
    user: `Übertrage die Verbliste ${inhalt.kind === 'docx' ? 'aus diesem Word-Dokument (als HTML)' : inhalt.text ? 'aus diesem PDF-Text; die Seitenbilder zeigen die Tabelle' : 'aus diesen Seiten'}.${inhalt.text ? `\n\n${inhalt.text}` : ''}`,
    images: inhalt.pageImages.length ? inhalt.pageImages : undefined,
    schemaName: 'verbliste',
    schema: importSchema(sprache)
  })
  return uebernehmeKiAntwort(antwort, sprache)
}
