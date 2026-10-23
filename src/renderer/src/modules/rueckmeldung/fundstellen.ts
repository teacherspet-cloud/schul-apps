/**
 * Fundstellen im Material (23.10.2026, Befund der Lehrkraft): „Für die Musterlösung /
 * Erwartungshorizont und die Bewertungstabelle werden allgemeine Lösungen erstellt, die nicht auf das
 * für die Schüler gegebene Material inhaltlich eingehen … nach Möglichkeit mit Zeilenangaben. Für die
 * Zeilenangaben muss ‚Rückmeldung‘ auf die Materialien zugreifen, wie die Schüler sie erhalten."
 *
 * Abgestimmt (Multiple Choice): Erwartungshorizont, Musterlösung, Bewertungstabelle UND die Bögen an
 * die Lernenden beziehen sich konkret auf das Material; Zeilen aus dem gesetzten Blatt (wie gedruckt),
 * ohne Zeilennummern ein Kurzzitat als Anker; bei hochgeladenen Dateien die gedruckte Zählung; das
 * Material wird für jeden Entwurf frisch gelesen.
 *
 * Hier nur die reinen Teile (Text für die KI, Regeln); Laden und Messen in materialFundstellen.ts.
 */
import { describeBlock } from '../arbeitsblatt/generation/describe'
import { loeseMaterialverweise, materialNummern } from '../arbeitsblatt/didactics/integrity'
import type { Worksheet } from '../arbeitsblatt/model/types'
import { plainText } from '../../shared/richtext/parse'
import type { Grundlage } from './model/types'

/** Zeile mit Nummer, wie die KI sie sieht – dieselbe Form wie bei übertragenen Dateien („Z. 12: …") */
const ZEILE = /^Z\.\s*\d+\s*:/m

/** Aufgabe und Material für die KI: frisch gelesen mit Zeilen, sonst der hinterlegte Text */
export const kiAufgaben = (g: Pick<Grundlage, 'aufgaben' | 'fundstellen'>): string => g.fundstellen || g.aufgaben

/** Steht im Text der KI mindestens ein Material mit Zeilennummern? */
export const mitZeilen = (g: Pick<Grundlage, 'aufgaben' | 'fundstellen'>): boolean => ZEILE.test(kiAufgaben(g))

/**
 * Das Material, wie die Lernenden es bekommen: Bausteine in Reihenfolge mit ihren Materialnummern
 * (M1, M2 … über das ganze Dokument), Texte mit Zeilennummern Zeile für Zeile („Z. 1: …").
 */
export function fundstellenText(ws: Worksheet, zeilen: ReadonlyMap<string, readonly string[]>): string {
  const alle = ws.sheets.flatMap((s) => s.blocks)
  const nummern = materialNummern(alle)
  return ws.sheets
    .map((s) => {
      const bloecke = loeseMaterialverweise(s.blocks, alle)
      const teile = bloecke.map((b, i) => {
        const nr = nummern.get(b.id)
        const kopf = `(${i + 1})${nr ? ` ${nr}` : ''}`
        if (b.type !== 'text') return `${kopf} ${describeBlock(b)}`
        const z = zeilen.get(b.id)
        if (!z?.length) return `${kopf} ${describeBlock(b)}${b.free ? '' : ' [auf dem Blatt OHNE Zeilennummern – Fundstellen als Kurzzitat]'}`
        return [
          `${kopf} Text „${b.title}“ – MIT ZEILENNUMMERN, Zeile für Zeile wie auf dem Blatt der Lernenden:`,
          b.intro ? `[Einleitung: ${plainText(b.intro)}]` : '',
          ...z.map((t, k) => `Z. ${k + 1}: ${t}`),
          b.glossary.length ? `[Worterklärungen: ${b.glossary.map((g) => g.term).join(', ')}]` : ''
        ]
          .filter(Boolean)
          .join('\n')
      })
      return (ws.sheets.length > 1 ? `[${s.label}]\n` : '') + teile.join('\n\n')
    })
    .join('\n\n')
}

/** Regel für die KI: Bezug aufs Material mit Fundstelle – je nachdem, was entsteht */
export function fundstellenRegel(g: Pick<Grundlage, 'aufgaben' | 'fundstellen'>, fuer: 'erwartung' | 'tabelle' | 'bogen'): string {
  const stelle = mitZeilen(g)
    ? 'Fundstelle bei Texten mit Zeilennummern „(M1, Z. 12–15)“ – NUR Nummern aus den „Z. n:“-Angaben oben, nie schätzen oder selbst zählen; bei Material ohne Zeilennummern ein kurzes wörtliches Zitat als Anker („M2: „… the new rule …““)'
    : 'Fundstelle als kurzes wörtliches Zitat aus dem Material („M1: „… the new rule …““) – KEINE Zeilenangaben, das Material hat keine Zeilennummern'
  if (fuer === 'erwartung')
    return [
      '- MATERIALBEZUG: Jeder Erwartungspunkt nennt konkret, WAS aus dem Material erwartet wird – die einzelne Information, das Argument, das Beispiel, den Beleg –, nicht allgemein „wichtige Aspekte des Textes“ oder „Argumente nennen“.',
      `- ${stelle}.`,
      '- Wo die Lernenden frei schreiben, folgt eine kurze Musterlösung, die genau diese Inhalte aus dem Material verarbeitet.'
    ].join('\n')
  if (fuer === 'tabelle')
    return [
      '- MATERIALBEZUG: Die inhaltlichen Kriterien nennen die konkret erwarteten Inhalte aus dem Material; die Stufenbeschreibungen sagen, welche dieser Inhalte für die Stufe nötig sind. Keine Kriterien, die zu jeder beliebigen Aufgabe passen würden.',
      `- ${stelle}.`
    ].join('\n')
  return `- FUNDSTELLEN: Wo es den Lernenden hilft (übersehene Information, ungenau wiedergegebene Stelle, fehlender Beleg), auf die Stelle im Material verweisen, damit sie nachlesen können. ${stelle}. In fremdsprachigen Teilen des Bogens die dort übliche Abkürzung (Englisch „l. 12“, „ll. 12–15“).`
}
