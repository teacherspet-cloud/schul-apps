/**
 * „Eigene Aufgabe" aus einer Datei (29.09.2026, Wunsch der Lehrkraft): Arbeitsblatt, Klausur oder
 * Foto in die Aufgabenstellung ziehen – die KI übernimmt die Aufgabe wörtlich samt dem Material,
 * auf das sie sich bezieht, den Erwartungshorizont (steht er im Material) und erkennt Fach und
 * Jahrgang. Fehlt ein Erwartungshorizont, entwirft die KI einen (als Entwurf gekennzeichnet).
 * Eine eigene Ablage am Erwartungshorizont überträgt eine Lösungsdatei.
 */
import type { StructuredRequest } from '@shared/types'
import { arr, enumOf, int, obj, str } from '../../shared/aiSchema'
import { SUBJECTS } from '../arbeitsblatt/model/subjects'

export interface GeleseneDatei {
  fileName: string
  text: string
  pageImages?: string[]
}

/** Word liefert HTML – für die KI reicht der Text mit Absätzen */
const schlicht = (text: string): string =>
  text
    .replace(/<(br|\/p|\/li|\/tr|\/h\d)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()

/** Text und Bilder der Dateien für eine Anfrage (Bilder nur, wo kein Text da ist: Fotos, Scans) */
function inhalt(dateien: GeleseneDatei[]): { text: string; bilder: string[] } {
  const text = dateien
    .map((d) => (d.text.trim() ? `--- ${d.fileName} ---\n${schlicht(d.text).slice(0, 20000)}` : `--- ${d.fileName}: als Bild beigefügt ---`))
    .join('\n\n')
  const bilder = dateien.flatMap((d) => (d.text.trim() ? [] : (d.pageImages ?? []))).slice(0, 8)
  return { text, bilder }
}

export const ENTWURF_VERMERK = '[Entwurf der KI – bitte prüfen]'

const FAECHER = SUBJECTS.map((s) => s.id)

const AUFGABE_SCHEMA = obj({
  titel: str('Kurzer Titel der Aufgabe (z. B. „Leserbrief zum Handyverbot“)'),
  aufgaben: str(
    'Die Aufgabenstellung(en) WÖRTLICH, nummeriert wie im Material; darunter unter „Material:“ knapp und wörtlich, worauf sich die Aufgaben beziehen (Textauszug, Tabelle, Beschreibung eines Bildes). Ohne Deckblatt, Kopfzeilen, Punkte und Hinweise für die Lehrkraft.'
  ),
  erwartung: str('Erwartungshorizont bzw. Lösungen, WENN sie im Material stehen (wörtlich) – sonst leer'),
  fach: enumOf(['', ...FAECHER]),
  jahrgang: int('Jahrgangsstufe, wenn sie im Material steht oder sicher erkennbar ist – sonst 0'),
  erkennbar: arr(str('Woran Fach und Jahrgang erkannt wurden (z. B. „Kopfzeile: Deutsch 8b“)'))
})

export function aufgabeAnfrage(dateien: GeleseneDatei[]): StructuredRequest {
  const { text, bilder } = inhalt(dateien)
  return {
    system:
      'Du hilfst einer Lehrkraft, eine Aufgabe für eine lernförderliche Rückmeldung vorzubereiten. Du überträgst wortgetreu (auch aus Fotos und Scans) und erfindest nichts.',
    user: [
      'Aus dem folgenden Material (Arbeitsblatt, Klausur, Aufgabenblatt):',
      '1. Übernimm die Aufgabenstellung(en) wörtlich und darunter nur das Material, das zum Verstehen der Aufgaben nötig ist (bei langen Texten: Titel, Quelle und die ersten Sätze bzw. die Stellen, auf die sich Aufgaben beziehen).',
      '2. Steht ein Erwartungshorizont oder eine Lösung im Material, übernimm ihn wörtlich in „erwartung“. Steht keiner drin, bleibt „erwartung“ leer.',
      '3. Erkenne Fach und Jahrgang nur, wenn es im Material steht oder eindeutig ist; sonst fach leer und jahrgang 0.',
      'MATERIAL:',
      text
    ].join('\n'),
    ...(bilder.length ? { images: bilder } : {}),
    schemaName: 'rueckmeldung_aufgabe',
    schema: AUFGABE_SCHEMA
  }
}

export interface AufgabeErkannt {
  titel: string
  aufgaben: string
  erwartung: string
  fach: string
  jahrgang: number
  erkennbar: string[]
}

export function aufgabeAus(daten: unknown): AufgabeErkannt {
  const d = (daten ?? {}) as Record<string, unknown>
  const aufgaben = String(d.aufgaben ?? '').trim()
  if (!aufgaben) throw new Error('Im Material war keine Aufgabenstellung zu erkennen.')
  const fach = String(d.fach ?? '')
  const jahrgang = Math.round(Number(d.jahrgang) || 0)
  return {
    titel: String(d.titel ?? '').trim(),
    aufgaben,
    erwartung: String(d.erwartung ?? '').trim(),
    fach: FAECHER.includes(fach) ? fach : '',
    jahrgang: jahrgang >= 1 && jahrgang <= 13 ? jahrgang : 0,
    erkennbar: Array.isArray(d.erkennbar) ? d.erkennbar.map((x) => String(x ?? '').trim()).filter(Boolean) : []
  }
}

const ERWARTUNG_SCHEMA = obj({ erwartung: str('Erwartungshorizont: je Aufgabe die erwarteten Inhalte und Kriterien, knapp in Stichpunkten') })

/** Entwurf eines Erwartungshorizonts, wenn das Material keinen enthält */
export function erwartungsEntwurfAnfrage(aufgaben: string, fach: string, jahrgang: number): StructuredRequest {
  return {
    system: 'Du bist eine erfahrene Lehrkraft und entwirfst Erwartungshorizonte für Schülerarbeiten – fachlich richtig, der Jahrgangsstufe angemessen.',
    user: [
      `Entwirf einen Erwartungshorizont für diese Aufgabe${fach ? ` (${fach}` : ''}${jahrgang ? `${fach ? ', ' : ' ('}Klasse ${jahrgang})` : fach ? ')' : ''}.`,
      '- Je Aufgabe: erwartete Inhalte bzw. Lösungsschritte und woran eine gelungene Bearbeitung zu erkennen ist.',
      '- KEINE Punkte und KEINE Noten – er dient einer Rückmeldung ohne Note.',
      'AUFGABE:',
      aufgaben
    ].join('\n'),
    schemaName: 'rueckmeldung_erwartung',
    schema: ERWARTUNG_SCHEMA
  }
}

/** Erwartungshorizont aus einer eigenen Datei (Lösungsblatt) übertragen */
export function erwartungAusDateiAnfrage(dateien: GeleseneDatei[], aufgaben: string): StructuredRequest {
  const { text, bilder } = inhalt(dateien)
  return {
    system: 'Du überträgst Lösungsblätter und Erwartungshorizonte wortgetreu in Text – auch aus Fotos und Scans – und erfindest nichts.',
    user: [
      'Übertrage den Erwartungshorizont bzw. die Lösungen aus dem Material wörtlich (ohne Punkte- und Notentabellen).',
      aufgaben.trim() ? `ZUR AUFGABE:\n${aufgaben.slice(0, 3000)}` : '',
      'MATERIAL:',
      text
    ]
      .filter(Boolean)
      .join('\n'),
    ...(bilder.length ? { images: bilder } : {}),
    schemaName: 'rueckmeldung_erwartung',
    schema: ERWARTUNG_SCHEMA
  }
}

export function erwartungAus(daten: unknown): string {
  const e = String((daten as { erwartung?: unknown } | null)?.erwartung ?? '').trim()
  if (!e) throw new Error('Es war kein Erwartungshorizont zu erkennen.')
  return e
}
