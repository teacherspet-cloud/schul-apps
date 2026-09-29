/**
 * Ausgewählte Aufgaben aus Verlagsmaterial in die Klassenarbeit übernehmen (29.09.2026).
 *
 * Die Lehrkraft wählt in der Liste (VerlagsImportDialog) Aufgaben aus und ordnet jede einem
 * Teil der Arbeit zu. Mit den gewählten Aufgaben (Entscheidung der Lehrkraft):
 * - wörtlich übernehmen (Inhalt unverändert, Layout der App) – immer,
 * - Punkte und Erwartungshorizont ergänzen (Entwurf markiert) – wählbar,
 * - Schwierigkeit einstufen – wählbar,
 * - A/B-Fassung ableiten – wählbar; eine eigene KI-Anfrage, weil sie NEUE Items schreibt.
 *
 * Das Material (Text, Hörtext) steht in der B-Fassung mit DERSELBEN id wie in A – eine Änderung
 * daran gilt in beiden Fassungen, so wie es model/fassungen.ts für gemeinsames Material vorsieht.
 */
import type { StructuredRequest } from '@shared/types'
import { describeBlock } from '../../arbeitsblatt/generation/describe'
import type { WsBlock } from '../../arbeitsblatt/model/types'
import { stufenRaster } from '../../../shared/verstehen/regeln'
import { formatArt } from '../model/faecher'
import { bloeckeDerFassung, fassungsZahl, MAX_FASSUNGEN } from '../model/fassungen'
import type { Exam, ExamPart } from '../model/types'
import { aufgabeAlsBausteine, type UebernahmeOptionen } from './bausteine'
import { ZERLEGUNG_SCHEMA, zerlegungAus, type ImportAufgabe, type ImportKompetenz } from './zerlegen'

export interface Auswahl {
  aufgabe: ImportAufgabe
  /** id des Teils der Arbeit, in den die Aufgabe kommt */
  teilId: string
}

const ART_FUER: Record<ImportKompetenz, string[]> = {
  listening: ['listening'],
  viewing: ['listening'],
  reading: ['reading'],
  writing: ['writing'],
  mediation: ['mediation'],
  grammar: ['grammar', 'language'],
  vocabulary: ['language', 'grammar'],
  sonstiges: []
}

/** Vorschlag: der erste Teil, dessen Format zur Kompetenz passt – sonst der erste Teil. */
export function zielTeil(exam: Exam, kompetenz: ImportKompetenz): ExamPart | undefined {
  const arten = ART_FUER[kompetenz]
  return exam.parts.find((p) => arten.includes(formatArt(p.formatId) ?? '')) ?? exam.parts[0]
}

/**
 * Anfrage für die B-Fassung: gleichwertige neue Items zu DEMSELBEN Material, gleiche Formate,
 * gleiche Punkte, gleiche Stufen. Das Material wird nicht wiederholt.
 */
export function fassungBAnfrage(exam: Exam, aufgaben: ImportAufgabe[], optionen: UebernahmeOptionen): StructuredRequest {
  const beschreibung = aufgaben
    .map((a, i) => {
      const bloecke = aufgabeAlsBausteine(a, optionen)
      return [`=== Aufgabe ${i + 1} (${a.nummer || a.titel}) ===`, ...bloecke.map((b) => describeBlock(b))].join('\n')
    })
    .join('\n\n')
  return {
    system:
      'Du erstellst für eine Klassenarbeit eine gleichwertige B-Fassung (gegen Abschreiben). Gleiches Material, gleiche Formate, gleiche Schwierigkeit – andere Items.',
    user: [
      `Fach: ${exam.meta.subjectLabel}${exam.meta.grade ? `, Klasse ${exam.meta.grade}` : ''}.`,
      `Erstelle zu jeder der ${aufgaben.length} Aufgaben unten eine B-Fassung – in derselben Reihenfolge, genau ${aufgaben.length} Einträge.`,
      '- Das Material (Text, Hörtext, Tabelle) bleibt DASSELBE; es wird nicht wiederholt (material = leere Liste).',
      '- Gleiche Arbeitsanweisung, gleiches Antwortformat, gleiche Zahl an Items und Optionen, gleiche Punkte je Item.',
      '- Jedes B-Item fragt nach einer ANDEREN Textstelle als das A-Item oder formuliert die Lösung anders – gleichwertig in der Schwierigkeit (gleiche Stufe).',
      '- Lösungen vollständig angeben (loesungQuelle = entwurf, punkteQuelle = material).',
      '',
      stufenRaster(),
      '',
      'FASSUNG A:',
      beschreibung
    ].join('\n'),
    schemaName: 'verlagsmaterial_fassung_b',
    schema: ZERLEGUNG_SCHEMA
  }
}

/** Die B-Aufgaben aus der Antwort – gleiche Reihenfolge wie A; fehlende bleiben leer. */
export function fassungBAus(daten: unknown, anzahl: number): (ImportAufgabe | null)[] {
  const z = zerlegungAus(daten)
  return Array.from({ length: anzahl }, (_, i) => z.aufgaben[i] ?? null)
}

/**
 * Übernahme in die Arbeit. Liefert die neue Arbeit (für ein Strg+Z als ein Schritt).
 *
 * `fassungB[i]` gehört zu `auswahl[i]`. Hat die Arbeit bisher nur eine Fassung und kommt eine
 * B-Fassung hinzu, bekommen die übrigen Teile vorerst dieselben Bausteine wie in A (gleiche ids,
 * also gemeinsam) – „Teil überarbeiten" in Fassung B legt dort eigene an.
 */
export function uebernehme(exam: Exam, auswahl: Auswahl[], optionen: UebernahmeOptionen, fassungB?: (ImportAufgabe | null)[] | null): { exam: Exam; hinweise: string[] } {
  const hinweise: string[] = []
  const next: Exam = structuredClone(exam)
  const mitB = Boolean(fassungB?.some(Boolean))
  const vorher = fassungsZahl(exam)
  if (mitB && vorher < 2) {
    next.meta.variants = Math.min(MAX_FASSUNGEN, Math.max(2, next.meta.variants || 1))
    for (const p of next.parts) p.weitereFassungen = [structuredClone(p.blocks)]
    hinweise.push('Die Arbeit hat jetzt zwei Fassungen. In den übrigen Teilen gleicht Fassung B vorerst Fassung A.')
  }
  auswahl.forEach(({ aufgabe, teilId }, i) => {
    const teil = next.parts.find((p) => p.id === teilId) ?? next.parts[0]
    if (!teil) return
    const a = aufgabeAlsBausteine(aufgabe, optionen)
    teil.blocks.push(...a)
    const b = fassungB?.[i]
    if (mitB) {
      const material = a.filter((x) => x.type !== 'task').map((x) => structuredClone(x))
      const audio = material.find((x) => x.type === 'audio')
      const bAufgaben: WsBlock[] = b
        ? aufgabeAlsBausteine({ ...b, material: [] }, optionen).map((x) => (x.type === 'task' && audio ? { ...x, audioId: audio.id } : x))
        : a.filter((x) => x.type === 'task').map((x) => structuredClone(x))
      if (!b) hinweise.push(`Zu „${aufgabe.titel || aufgabe.nummer}" kam keine B-Fassung zurück – dort steht vorerst die Aufgabe aus A.`)
      const liste = [...bloeckeDerFassung(teil, 1), ...material, ...bAufgaben]
      const weitere = [...(teil.weitereFassungen ?? [])]
      weitere[0] = liste
      // Eine Fassung C bekommt vorerst die Bausteine aus A
      for (let k = 1; k < weitere.length; k++) weitere[k] = [...weitere[k], ...a.map((x) => structuredClone(x))]
      teil.weitereFassungen = weitere
    } else if (vorher > 1) {
      // Weitere Fassungen vorhanden, aber keine B-Fassung gewünscht: dieselben Bausteine (gemeinsam)
      teil.weitereFassungen = (teil.weitereFassungen ?? []).map((liste) => [...liste, ...a.map((x) => structuredClone(x))])
    }
  })
  return { exam: next, hinweise }
}
