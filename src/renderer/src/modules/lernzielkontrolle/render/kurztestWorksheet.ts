/**
 * Die Lernzielkontrolle als Arbeitsblatt-Datenstruktur.
 *
 * Darstellung, Seitenumbruch, Druck und Word-Export sind im Arbeitsblatt gelöst; der Test
 * wird deshalb in dieselbe Struktur übersetzt – wie Klassenarbeit und Grammatiktest auch.
 *
 * WAS HIER ANDERS IST: Das Blatt bekommt KEINEN Kopfkasten mit Inhaltsangabe. Ein Kasten
 * „Schwerpunkt: Potenzgesetze" wäre bereits eine Hilfe, und die Lehrkraft hat entschieden,
 * dass auf dieses Blatt nur Aufgaben und Material gehören. Bearbeitungszeit und Punktzahl
 * stehen deshalb in der Kopfzeile, nicht in einem Kasten auf der Arbeitsfläche.
 *
 * Der NOTENSCHLÜSSEL steht ausschließlich im Lösungsteil (Entscheidung der Lehrkraft,
 * 23.09.2026). Das deckt sich mit der Rechtslage: Einen Notenspiegel verlangt Berlin
 * (Sek I-VO § 19 Abs. 7) ausdrücklich nur bei Klassenarbeiten.
 */
import { defaultMeta } from '../../arbeitsblatt/model/defaults'
import type { Sheet, Worksheet, WorksheetMeta, WsBlock } from '../../arbeitsblatt/model/types'
import { gesamtpunkte, notenspiegel, schluesselHinweis } from '../didactics/bewertung'
import type { Kurztest } from '../model/types'
import { anredeFuerStufe } from '../../../shared/anrede'

/** Kopfzeile: Bezeichnung des Landesformats, Zeit und Punkte. */
export function kopfzeile(test: Kurztest, varianteLabel: string): string {
  const m = test.meta
  const teile = [m.bezeichnung, m.minutes ? `${m.minutes} Minuten` : '']
  const punkte = gesamtpunkte(test.varianten[0]?.blocks ?? [])
  if (m.bewertung.punkteAufBlatt && punkte > 0) teile.push(`${punkte} Punkte`)
  if (varianteLabel) teile.push(`Gruppe ${varianteLabel}`)
  return teile.filter(Boolean).join(' · ')
}

/**
 * Der Notenschlüssel als Baustein – NUR für das Lösungsblatt.
 *
 * Er trägt seine Herkunft mit: Von den angebotenen Schlüsseln ist nur der aus
 * Mecklenburg-Vorpommern in einer Verordnung verankert, und auch dort gilt er für
 * Lernerfolgskontrollen laut § 4 Abs. 4 nur „als Orientierung".
 */
export function schluesselBlock(test: Kurztest, ausEinstellungen?: number[]): WsBlock | null {
  const punkte = gesamtpunkte(test.varianten[0]?.blocks ?? [])
  const zeilen = notenspiegel(punkte, test.meta.bewertung, ausEinstellungen)
  if (!zeilen.length) return null
  return {
    id: 'lzk-schluessel',
    type: 'table',
    title: `Notenschlüssel (${punkte} Punkte)`,
    headers: ['Note', 'ab Prozent', 'ab Punkten'],
    rows: [...zeilen.map((z) => [String(z.note), `${z.abProzent} %`, String(z.abPunkten)]), ['6', '0 %', '0']]
  }
}

/** Blatt-Angaben, die die Darstellung aus dem Test ableitet. */
export function worksheetMetaForKurztest(test: Kurztest): WorksheetMeta {
  const m = test.meta
  const base = defaultMeta(m.stateId, m.schoolTypeId, m.schoolTypeName)
  return {
    ...base,
    subjectId: m.subjectId,
    subjectLabel: m.subjectLabel,
    topic: m.thema,
    title: m.title || m.thema || m.bezeichnung,
    grade: m.grade,
    ...(m.courseLevel ? { courseLevel: m.courseLevel } : {}),
    // Die Lehrkraft wählt die Stufe selbst; die festen Texte des Blattes folgen ihr (Paket 8b)
    anrede: anredeFuerStufe(m.stufe),
    answerKey: m.answerKey,
    vorlagenfarbe: m.vorlagenfarbe,
    // Überthema (Paket 11) – den Themenbereich setzt der Editor beim Anzeigen ein
    ueberthema: m.ueberthema,
    ueberthemaAus: m.ueberthemaAus,
    // Die Lernhilfen des Arbeitsblatts gibt es hier nicht – siehe didactics/bausteine.ts
    helpCards: false,
    minutes: m.minutes,
    pages: 1
  }
}

/** Übersetzt eine Variante in ein Arbeitsblatt, das sich anzeigen und exportieren lässt. */
export function kurztestToWorksheet(test: Kurztest, varianteIndex: number, ausEinstellungen?: number[]): Worksheet {
  const variante = test.varianten[varianteIndex] ?? test.varianten[0]
  const blocks = [...(variante?.blocks ?? [])]
  const schluessel = schluesselBlock(test, ausEinstellungen)
  /*
   * Der Notenschlüssel wird ans ENDE gehängt. Auf dem Schülerblatt blendet ihn die
   * Darstellung aus, weil dort nur der Lösungsmodus ihn zeigt; hier steht er als letzter
   * Baustein, damit er die Aufgabenfolge nicht unterbricht.
   */
  const sheet: Sheet = {
    id: `lzk-${variante?.id ?? 'v1'}`,
    label: varianteLabel(test, varianteIndex),
    blocks: schluessel && test.meta.answerKey ? [...blocks, schluessel] : blocks
  }
  return {
    version: 1,
    meta: worksheetMetaForKurztest(test),
    design: {
      ...test.design,
      /*
       * Die Kopfzeile trägt das Landesformat, die Zeit und – bei mehreren Fassungen – den
       * Gruppenbuchstaben. Auf dem Blatt selbst steht dazu kein Kasten: Ein Kopfkasten
       * „Schwerpunkt: Potenzgesetze" wäre schon eine Hilfe.
       */
      header: {
        ...test.design.header,
        customText: kopfzeile(test, variante?.label ?? ''),
        fields: { name: test.meta.nameFeld, class: test.meta.nameFeld, date: test.meta.nameFeld }
      }
    },
    outline: null,
    sheets: [sheet],
    sources: [],
    createdAt: test.createdAt
  }
}

/**
 * Alle Fassungen in EINEM Dokument – je Fassung ein Blatt.
 *
 * Gedacht zum Ausdrucken in einem Zug: Wer A, B und C einzeln druckt, bekommt drei Dateien
 * und muss sie hinterher sortieren. Die Kopfzeile trägt weiterhin den Gruppenbuchstaben,
 * damit auf jedem Blatt steht, welche Fassung es ist.
 */
export function kurztestToWorksheetAlle(test: Kurztest, ausEinstellungen?: number[]): Worksheet {
  const schluessel = schluesselBlock(test, ausEinstellungen)
  const sheets: Sheet[] = test.varianten.map((v, i) => ({
    id: `lzk-${v.id}`,
    label: varianteLabel(test, i),
    // Jedes Blatt seinen eigenen Gruppenbuchstaben – die Kopfzeile des Dokuments nennt nur A
    kopfzeile: kopfzeile(test, v.label ?? ''),
    blocks: schluessel && test.meta.answerKey ? [...v.blocks, schluessel] : [...v.blocks]
  }))
  const erste = kurztestToWorksheet(test, 0, ausEinstellungen)
  return { ...erste, sheets }
}

const varianteLabel = (test: Kurztest, i: number): string => {
  const l = test.varianten[i]?.label
  return l ? `Gruppe ${l}` : 'Lernzielkontrolle'
}

/** Der Hinweis zum Notenschlüssel, der unter der Tabelle im Lösungsteil steht. */
export const schluesselHerkunft = (test: Kurztest, ausEinstellungen?: number[]): string => schluesselHinweis(test.meta.bewertung, ausEinstellungen)
