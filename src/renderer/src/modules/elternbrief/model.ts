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
import { bereinigeFett, fristKurz, ohneFett } from './hervorhebung'

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
    /** Datum des Briefes (steht rechts über dem Betreff) */
    datum: string
    ruecklauf: boolean
    /** Termin des Anlasses (29.09.2026): Datum JJJJ-MM-TT und Uhrzeit HH:MM – die KI übernimmt beides wörtlich */
    termin?: { datum?: string; uhrzeit?: string }
    /** Rückgabe des Rücklaufzettels bis (JJJJ-MM-TT) */
    rueckgabeBis?: string
    /** Anlass für die Bibliothek (09.10.2026, bibliothekInfo.ts) – im Menü gewählt; fehlt er, wird er erkannt */
    anlassArt?: string
    subjectLabel?: string
    ki?: KiHerkunft
    kiVermerk?: KiVermerk
  }
  text: BriefText | null
  uebersetzungen: Uebersetzung[]
  /** Frühere Fassungen des deutschen Textes (neueste zuerst, höchstens 10) – „Vorige Fassung zurück" */
  fassungen?: { am: string; anlass: string; text: BriefText }[]
  /** Befunde der Prüfung nach dem Schreiben (offene Platzhalter, verlorene Angaben) */
  pruefung?: string[]
  createdAt: string
  design?: unknown
}

export const hatText = (b: Elternbrief | null): boolean => Boolean(b?.text?.absaetze.length)
export const lohntSicherung = (b: Elternbrief | null): boolean => Boolean(b && (b.meta.stichpunkte.trim() || b.meta.title.trim() || b.text))
export const standardName = (b: Elternbrief): string => b.meta.title.trim() || b.text?.betreff || `Elternbrief: ${b.meta.anlass}`

export const BRIEF_SCHEMA = obj({
  betreff: str('Betreffzeile, knapp'),
  anrede: str('Anrede („Liebe Eltern und Erziehungsberechtigte der Klasse 7b,")'),
  absaetze: arr(str('Ein Absatz des Briefes – das Wichtigste (Datum, Uhrzeit, Ort, Kosten, Mitzubringendes, Frist) in **…** fett')),
  gruss: str('Grußformel ohne Namen („Mit freundlichen Grüßen")'),
  ruecklaufTitel: str('Überschrift des Rücklaufzettels – leer, wenn keiner gewünscht ist'),
  ruecklaufZeilen: arr(str('Eine Zeile des Rücklaufzettels, z. B. „☐ Mein Kind nimmt teil." oder „Unterschrift: ____"'))
})

/**
 * Fettdruck (09.10.2026, hervorhebung.ts): Die KI markiert das Wichtigste mit **…** – nur fett, sparsam. Dieselbe
 * Regel gilt beim Neu-Formulieren (bearbeiten.ts).
 */
export const FETT_REGEL =
  '- FETTDRUCK: Markiere das Wichtigste mit **…** (nur so, keine andere Formatierung, kein HTML): Datum, Uhrzeit, Treff- und Zeitpunkte mit Ort, Eintritt/Kosten, was mitzubringen ist, die Rückgabefrist und andere Schlüsselangaben. Höchstens 6–8 fette Stellen im ganzen Brief, jeweils nur die Angabe selbst (z. B. „am **Freitag, 17.10.2026**, um **8:00 Uhr** am **Haupteingang**"), nie ganze Sätze. Betreff, Anrede und Gruß ohne **.'

const WOCHENTAG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']

/** „Freitag, 12.12.2026" aus JJJJ-MM-TT; leer, wenn kein gültiges Datum */
export function datumLang(iso?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '')
  if (!m) return ''
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return `${WOCHENTAG[d.getDay()]}, ${m[3]}.${m[2]}.${m[1]}`
}

/** Termin und Rückgabefrist als Zeilen für die KI – leer, was nicht eingetragen ist */
export function festeAngaben(m: Elternbrief['meta']): string[] {
  const zeilen: string[] = []
  const tag = datumLang(m.termin?.datum)
  if (tag) zeilen.push(`TERMIN: ${tag}${m.termin?.uhrzeit ? `, ${m.termin.uhrzeit} Uhr` : ''}`)
  const frist = datumLang(m.rueckgabeBis)
  if (m.ruecklauf && frist) zeilen.push(`RÜCKGABE DES RÜCKLAUFZETTELS BIS: ${frist}`)
  return zeilen
}

export function briefAnfrage(b: Elternbrief, schule: string): StructuredRequest {
  const m = b.meta
  const fest = festeAngaben(m)
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
      FETT_REGEL,
      fest.length
        ? '- FESTE ANGABEN (unten): Datum, Uhrzeit und Frist stehen im Brief GENAU in dieser Schreibweise (z. B. „Freitag, 12.12.2026"); kein Platzhalter dafür. Die Rückgabefrist steht im Brief und auf dem Rücklaufzettel.'
        : '',
      m.ruecklauf && datumLang(m.rueckgabeBis)
        ? `- Die Rückgabefrist ist fett und steht auf dem Rücklaufzettel als eigene Zeile: „Bitte bis **${fristKurz(m.rueckgabeBis)}** zurückgeben."`
        : '',
      ...(fest.length ? ['FESTE ANGABEN:', ...fest] : []),
      'STICHPUNKTE DER LEHRKRAFT:',
      m.stichpunkte
    ]
      .filter(Boolean)
      .join('\n'),
    schemaName: 'elternbrief_text',
    schema: BRIEF_SCHEMA
  }
}

export function briefAus(daten: unknown, mitRuecklauf: boolean): BriefText {
  const d = (daten ?? {}) as Record<string, unknown>
  const text = (x: unknown): string => String(x ?? '').trim()
  // Nur Fettdruck (**…**) ist erlaubt; Betreff, Anrede, Gruß und Überschrift ganz ohne (hervorhebung.ts)
  const absaetze = (Array.isArray(d.absaetze) ? d.absaetze : []).map((x) => bereinigeFett(text(x)).trim()).filter(Boolean)
  if (!absaetze.length) throw new Error('Die KI hat keinen Brief geliefert.')
  const zeilen = (Array.isArray(d.ruecklaufZeilen) ? d.ruecklaufZeilen : []).map((x) => bereinigeFett(text(x)).trim()).filter(Boolean)
  return {
    betreff: ohneFett(text(d.betreff)),
    anrede: ohneFett(text(d.anrede)),
    absaetze,
    gruss: ohneFett(text(d.gruss)) || 'Mit freundlichen Grüßen',
    ...(mitRuecklauf && zeilen.length ? { ruecklauf: { titel: ohneFett(text(d.ruecklaufTitel)) || 'Rückmeldung', zeilen } } : {})
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
      `Übersetze diesen Elternbrief ins ${sprache.name}. Platzhalter in eckigen Klammern [ ] bleiben unverändert auf Deutsch stehen. Zahlen von Datum, Uhrzeit und Betrag unverändert; Wörter wie „Uhr" oder „bis" werden mitübersetzt. Fettmarkierungen **…** bleiben um dieselben Angaben stehen.`,
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
