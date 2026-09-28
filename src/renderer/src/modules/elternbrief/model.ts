/**
 * Programm „Elternbrief" (Großprogramm 0.4, F7): Briefe an die Eltern – aus Anlass, Stichpunkten
 * und Ton formuliert, mit Rücklaufzettel, übersetzt in Familiensprachen.
 *
 * Grundsätze:
 * - Keine Namen von Kindern oder Eltern an die KI: Im Brief stehen Platzhalter („[Name des
 *   Kindes]"), die die Lehrkraft beim Verteilen ausfüllt – oder der Brief ist allgemein.
 * - Übersetzungen tragen den Vermerk „Maschinelle Übersetzung – verbindlich ist die deutsche
 *   Fassung" in beiden Sprachen; die deutsche Fassung steht immer mit dabei.
 */
import type { StructuredRequest } from '@shared/types'
import type { KiHerkunft, KiVermerk } from '@shared/kiKennzeichnung'
import { arr, obj, str } from '../../shared/aiSchema'
import type { Familiensprache } from '../../shared/familiensprachen'

export const ANLAESSE = [
  'Elternabend',
  'Ausflug oder Wandertag',
  'Klassenfahrt',
  'Klassenarbeit oder Leistungsstand',
  'Bitte um Material oder Geld',
  'Gesprächsangebot',
  'Verhalten oder Versäumnisse',
  'Allgemeine Information',
  'Sonstiges'
]

export const TOENE = [
  { value: 'freundlich', label: 'Freundlich' },
  { value: 'sachlich', label: 'Sachlich' },
  { value: 'foermlich', label: 'Förmlich' }
]

export interface BriefText {
  betreff: string
  anrede: string
  absaetze: string[]
  gruss: string
  /** Rücklaufzettel: Überschrift und Zeilen (Ankreuz- oder Schreibzeilen) */
  ruecklauf?: { titel: string; zeilen: string[] }
  /** Nur bei Übersetzungen: der Vermerk in der Zielsprache */
  vermerk?: string
}

export interface Uebersetzung {
  code: string
  text: BriefText
}

export interface Elternbrief {
  version: 1
  meta: {
    title: string
    anlass: string
    ton: string
    stichpunkte: string
    klasse: string
    /** Unterschrift (Name der Lehrkraft) */
    absender: string
    datum: string
    ruecklauf: boolean
    subjectLabel?: string
    ki?: KiHerkunft
    kiVermerk?: KiVermerk
  }
  text: BriefText | null
  uebersetzungen: Uebersetzung[]
  createdAt: string
  design?: unknown
}

export const hatText = (b: Elternbrief | null): boolean => Boolean(b?.text?.absaetze.length)
export const lohntSicherung = (b: Elternbrief | null): boolean => Boolean(b && (b.meta.stichpunkte.trim() || b.meta.title.trim() || b.text))
export const standardName = (b: Elternbrief): string => b.meta.title.trim() || b.text?.betreff || `Elternbrief: ${b.meta.anlass}`

const BRIEF_SCHEMA = obj({
  betreff: str('Betreffzeile, knapp'),
  anrede: str('Anrede („Liebe Eltern und Erziehungsberechtigte der Klasse 7b,")'),
  absaetze: arr(str('Ein Absatz des Briefes')),
  gruss: str('Grußformel ohne Namen („Mit freundlichen Grüßen")'),
  ruecklaufTitel: str('Überschrift des Rücklaufzettels – leer, wenn keiner gewünscht ist'),
  ruecklaufZeilen: arr(str('Eine Zeile des Rücklaufzettels, z. B. „☐ Mein Kind nimmt teil." oder „Unterschrift: ____"'))
})

export function briefAnfrage(b: Elternbrief, schule: string): StructuredRequest {
  const m = b.meta
  return {
    system:
      'Du schreibst Elternbriefe für Lehrkräfte an deutschen Schulen: klar, freundlich, in verständlichem Deutsch (kurze Sätze, keine Fachbegriffe ohne Erklärung), rechtlich unverfänglich. Termine, Orte, Beträge und Fristen stehen gut auffindbar.',
    user: [
      `Schreibe einen Elternbrief. Anlass: ${m.anlass}. Ton: ${TOENE.find((t) => t.value === m.ton)?.label ?? m.ton}.${m.klasse ? ` Klasse: ${m.klasse}.` : ''}${schule ? ` Schule: ${schule}.` : ''}`,
      'REGELN:',
      '- Nur Angaben aus den Stichpunkten; nichts erfinden (keine Daten, Beträge, Uhrzeiten, die dort nicht stehen). Fehlt etwas Wichtiges, setze einen Platzhalter in eckigen Klammern, z. B. [Datum], [Betrag].',
      '- KEINE Namen von Kindern oder Eltern; wo ein Kind gemeint ist, „[Name des Kindes]".',
      '- 2–5 kurze Absätze; das Wichtigste (Was? Wann? Was ist zu tun?) im ersten Absatz.',
      m.ruecklauf
        ? '- Mit Rücklaufzettel: Überschrift und Zeilen zum Ankreuzen bzw. Ausfüllen (Name des Kindes, Unterschrift eines Erziehungsberechtigten, Datum).'
        : '- Ohne Rücklaufzettel: ruecklaufTitel leer, ruecklaufZeilen leer.',
      'STICHPUNKTE DER LEHRKRAFT:',
      m.stichpunkte
    ].join('\n'),
    schemaName: 'elternbrief_text',
    schema: BRIEF_SCHEMA
  }
}

export function briefAus(daten: unknown, mitRuecklauf: boolean): BriefText {
  const d = (daten ?? {}) as Record<string, unknown>
  const text = (x: unknown): string => String(x ?? '').trim()
  const absaetze = (Array.isArray(d.absaetze) ? d.absaetze : []).map(text).filter(Boolean)
  if (!absaetze.length) throw new Error('Die KI hat keinen Brief geliefert.')
  const zeilen = (Array.isArray(d.ruecklaufZeilen) ? d.ruecklaufZeilen : []).map(text).filter(Boolean)
  return {
    betreff: text(d.betreff),
    anrede: text(d.anrede),
    absaetze,
    gruss: text(d.gruss) || 'Mit freundlichen Grüßen',
    ...(mitRuecklauf && zeilen.length ? { ruecklauf: { titel: text(d.ruecklaufTitel) || 'Rückmeldung', zeilen } } : {})
  }
}

const UEBERSETZUNG_SCHEMA = obj({
  betreff: str('Betreff in der Zielsprache'),
  anrede: str('Anrede in der Zielsprache'),
  absaetze: arr(str('Absatz in der Zielsprache – gleiche Zahl und Reihenfolge wie im Original')),
  gruss: str('Grußformel in der Zielsprache'),
  ruecklaufTitel: str('Überschrift des Rücklaufzettels in der Zielsprache (leer, wenn es keinen gibt)'),
  ruecklaufZeilen: arr(str('Zeile des Rücklaufzettels in der Zielsprache – gleiche Zahl wie im Original')),
  vermerk: str('Der Satz „Maschinelle Übersetzung – verbindlich ist die deutsche Fassung." in der Zielsprache')
})

export function uebersetzungsAnfrage(t: BriefText, sprache: Familiensprache): StructuredRequest {
  return {
    system: `Du übersetzt Elternbriefe deutscher Schulen in die Familiensprache der Eltern: ${sprache.name} (${sprache.eigen}). Genau, vollständig, in einfacher, höflicher Alltagssprache; Begriffe des deutschen Schulsystems (Klassenarbeit, Elternabend, Zeugnis) übersetzt und beim ersten Vorkommen kurz erklärt, das deutsche Wort in Klammern dahinter.`,
    user: [
      `Übersetze diesen Elternbrief ins ${sprache.name}. Platzhalter in eckigen Klammern [ ] bleiben unverändert auf Deutsch stehen. Zahlen von Datum, Uhrzeit und Betrag unverändert; Wörter wie „Uhr" oder „bis" werden mitübersetzt.`,
      JSON.stringify({
        betreff: t.betreff,
        anrede: t.anrede,
        absaetze: t.absaetze,
        gruss: t.gruss,
        ruecklaufTitel: t.ruecklauf?.titel ?? '',
        ruecklaufZeilen: t.ruecklauf?.zeilen ?? []
      })
    ].join('\n\n'),
    schemaName: 'elternbrief_uebersetzung',
    schema: UEBERSETZUNG_SCHEMA
  }
}

export function uebersetzungAus(daten: unknown, original: BriefText): BriefText {
  const u = briefAus(daten, Boolean(original.ruecklauf))
  const vermerk = String((daten as { vermerk?: unknown })?.vermerk ?? '').trim()
  if (u.absaetze.length !== original.absaetze.length) throw new Error('Die Übersetzung hat nicht dieselben Absätze wie das Original.')
  return { ...u, ...(vermerk ? { vermerk } : {}) }
}

export const DEUTSCHER_VERMERK = 'Maschinelle Übersetzung – verbindlich ist die deutsche Fassung.'
