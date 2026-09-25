import { describe, expect, it } from 'vitest'
import { phrasenAufbau, worterklaerung, zeigtUebersetzung } from '../src/renderer/src/modules/arbeitsblatt/didactics/phraseRules'
import { phraseSheetRules } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { CefrLevel } from '../src/shared/types'
import type { WorksheetMeta } from '../src/renderer/src/modules/arbeitsblatt/model/types'

/*
 * Wunsch der Lehrkraft (25.09.2026): „beachte beim baustein für useful phrases das Alter und
 * Niveau der Schüler. Zum Beispiel sollte ein Kurs auf erhöhtem Niveau keine deutschen
 * Übersetzungen erhalten, sondern nur die phrases und bei einzelnen Wörtern … eine
 * einsprachige Erklärung in der Zielsprache."
 */
const meta = (cefrLevel: CefrLevel, patch: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'englisch',
  subjectLabel: 'Englisch',
  cefrLevel,
  ...patch
})

describe('Deutsche Entsprechungen im Hilfsblatt', () => {
  it('gibt sie bis einschließlich B1', () => {
    for (const stufe of ['A1', 'A2', 'A2+', 'B1'] as CefrLevel[]) {
      expect(zeigtUebersetzung(meta(stufe)), stufe).toBe(true)
    }
  })

  it('lässt sie ab B1+ weg', () => {
    for (const stufe of ['B1+', 'B2', 'B2+', 'C1'] as CefrLevel[]) {
      expect(zeigtUebersetzung(meta(stufe)), stufe).toBe(false)
    }
  })

  it('schließt die Lücke, die gemeldet wurde', () => {
    /*
     * Vorher hing die Entscheidung allein an den ★-Stufen. Ein Blatt OHNE Differenzierung
     * bekam deshalb immer Übersetzungen – auch ein Leistungskurs in Jahrgang 13.
     */
    const leistungskurs = meta('C1', { grade: 13, abitur: { an: true, niveau: 'eA', aufgabenart: 'schreiben', klausur: true } })
    expect(zeigtUebersetzung(leistungskurs)).toBe(false)
  })

  it('behält sie auf der grundlegenden ★-Stufe, auch bei hohem Kursniveau', () => {
    // Wer die ★-Fassung bearbeitet, braucht die Brücke – unabhängig vom Schnitt des Kurses
    expect(zeigtUebersetzung(meta('B2'), 1)).toBe(true)
  })

  it('lässt sie auf den höheren ★-Stufen weg, auch bei niedrigem Kursniveau', () => {
    expect(zeigtUebersetzung(meta('A2'), 2)).toBe(false)
    expect(zeigtUebersetzung(meta('A2'), 3)).toBe(false)
  })

  it('bestimmt damit auch die Form der Worterklärung', () => {
    expect(worterklaerung(meta('A2'))).toBe('deutsch')
    expect(worterklaerung(meta('B2'))).toBe('zielsprachlich')
  })
})

describe('Aufbau der Liste nach Niveau', () => {
  it('führt Anfänger mit deutschen Überschriften und vollständigen Wendungen', () => {
    const a = phrasenAufbau(meta('A1'))
    expect(a.metasprache).toBe('deutsch')
    expect(a.form).toContain('vollständige')
    expect(a.eintraege).toBe('6–10')
  })

  it('wechselt ab B1+ auf zielsprachliche Überschriften', () => {
    expect(phrasenAufbau(meta('B1')).metasprache).toBe('deutsch')
    expect(phrasenAufbau(meta('B1+')).metasprache).toBe('zielsprachlich')
  })

  it('wird in der Oberstufe wieder kürzer statt länger', () => {
    /*
     * Der Abbau läuft nicht über die Menge, sondern über die Art: In der Oberstufe bleiben nur
     * die Wendungen, die den Gedankengang gliedern – die inhaltstragenden Sätze schreiben die
     * Lernenden selbst. Belegt am Berliner Oberstufenmaterial „Text production" (2021), das
     * keine Textbausteinsammlungen mehr enthält.
     */
    const mittel = phrasenAufbau(meta('B2'))
    const oben = phrasenAufbau(meta('C1'))
    expect(mittel.eintraege).toBe('12–18')
    expect(oben.eintraege).toBe('6–12')
    expect(oben.form).toContain('keine inhaltstragenden Sätze')
  })
})

describe('Was davon im Prompt landet', () => {
  const mitHilfsblatt = (stufe: CefrLevel, patch: Partial<WorksheetMeta> = {}): string => phraseSheetRules(meta(stufe, { phraseSheet: 'blatt', ...patch }))

  it('verlangt auf hohem Niveau ausdrücklich leere Übersetzungsfelder', () => {
    const text = mitHilfsblatt('C1')
    expect(text).toContain('KEINE deutschen Übersetzungen')
    expect(text).toContain('german bleibt bei ALLEN Einträgen leer')
  })

  it('verlangt dort einsprachige Worterklärungen mit der Bedeutung im Text', () => {
    const text = mitHilfsblatt('C1')
    expect(text).toContain('Umschreibung auf Englisch')
    expect(text).toContain('IM TEXT')
  })

  it('erlaubt die deutsche Entsprechung auf niedrigem Niveau', () => {
    const text = mitHilfsblatt('A2')
    expect(text).toContain('die deutsche Entsprechung')
    expect(text).not.toContain('KEINE deutschen Übersetzungen')
  })

  it('ordnet immer nach Sprachhandlung', () => {
    // Belegt (Nattinger 1980; Academic Formulas List): keine amtliche Sammlung ordnet alphabetisch
    for (const stufe of ['A1', 'B1', 'C1'] as CefrLevel[]) {
      expect(mitHilfsblatt(stufe)).toContain('nach SPRACHHANDLUNG')
    }
  })

  it('verlangt, dass die Aufgaben die Wendungen auch brauchen', () => {
    // Ohne Produktionsauftrag ist die Wirkung in den Studien kaum nachweisbar
    expect(mitHilfsblatt('B1')).toContain('eine Liste, die niemand benutzen muss')
  })
})

describe('Alle Fremdsprachen, nicht nur Englisch', () => {
  /*
   * Rückfrage der Lehrkraft (25.09.2026): „mach das ebenso für die anderen fächer, insb. die
   * fremdsprachen." Das Regelwerk arbeitet mit der Zielsprache des Faches, nicht mit einem
   * fest eingebauten „Englisch" – diese Tests halten das fest.
   */
  const fach = (subjectId: string, subjectLabel: string, stufe: CefrLevel): WorksheetMeta => ({
    ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
    subjectId,
    subjectLabel,
    cefrLevel: stufe,
    phraseSheet: 'blatt'
  })

  const fremdsprachen: [string, string][] = [
    ['englisch', 'Englisch'],
    ['franzoesisch', 'Französisch'],
    ['spanisch', 'Spanisch'],
    ['italienisch', 'Italienisch']
  ]

  it('nennt in den Regeln die jeweilige Zielsprache', () => {
    for (const [id, label] of fremdsprachen) {
      const text = phraseSheetRules(fach(id, label, 'B2'))
      expect(text, label).toContain(label)
      // Kein anderes Fach darf durchschlagen
      for (const [, andere] of fremdsprachen.filter(([, l]) => l !== label)) {
        expect(text, `${label} erwähnt ${andere}`).not.toContain(andere)
      }
    }
  })

  it('setzt die Schwelle überall gleich', () => {
    for (const [id, label] of fremdsprachen) {
      expect(zeigtUebersetzung(fach(id, label, 'B1')), label).toBe(true)
      expect(zeigtUebersetzung(fach(id, label, 'B1+')), label).toBe(false)
    }
  })

  it('verlangt die einsprachige Umschreibung in der jeweiligen Sprache', () => {
    expect(phraseSheetRules(fach('franzoesisch', 'Französisch', 'C1'))).toContain('Umschreibung auf Französisch')
    expect(phraseSheetRules(fach('spanisch', 'Spanisch', 'C1'))).toContain('Umschreibung auf Spanisch')
  })
})

describe('Latein: übersetzen ist das Lernziel', () => {
  /*
   * Entscheidung der Lehrkraft (25.09.2026): Latein bekommt ein „Hilfsblatt mit
   * Übersetzungshilfen" – wiederkehrende Konstruktionen samt deutscher Wiedergabe.
   *
   * Latein hängt bewusst NICHT an `foreignLanguage`: Daran hängen Hörverstehen,
   * Sprachmittlung und Arbeitsanweisungen in der Zielsprache, und das gibt es hier alles
   * nicht. Es trägt stattdessen `uebersetzungssprache`.
   */
  const latein = (patch: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
    ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
    subjectId: 'latein',
    subjectLabel: 'Latein',
    grade: 11,
    phraseSheet: 'blatt',
    ...patch
  })

  it('gibt die deutsche Wiedergabe immer – auch in der Oberstufe', () => {
    // Die Einsprachigkeits-Schwelle steht hier auf dem Kopf: Deutsch ist nicht die Hilfe, sondern das Ziel
    expect(zeigtUebersetzung(latein())).toBe(true)
    expect(zeigtUebersetzung(latein({ grade: 13, cefrLevel: 'C1' }))).toBe(true)
    expect(worterklaerung(latein({ cefrLevel: 'C1' }))).toBe('deutsch')
  })

  it('ordnet nach Konstruktion statt nach Sprachhandlung', () => {
    const text = phraseSheetRules(latein())
    expect(text).toContain('nach KONSTRUKTION')
    expect(text).toContain('Ablativus absolutus')
    expect(text).not.toContain('nach SPRACHHANDLUNG')
  })

  it('nennt das Blatt anders und verlangt die deutsche Wiedergabe', () => {
    const text = phraseSheetRules(latein())
    expect(text).toContain('ÜBERSETZUNGSHILFEN')
    expect(text).toContain('german ist hier PFLICHT')
  })

  it('verbietet die fertige Übersetzung des Textes', () => {
    // Sonst steht die Lösung auf dem Hilfsblatt
    expect(phraseSheetRules(latein())).toContain('nicht die Lösung')
  })

  it('verlangt keine Wendungen auf Latein', () => {
    // „Useful phrases auf Latein" wären in einem Lektürekurs sinnlos
    expect(phraseSheetRules(latein())).not.toContain('Wendungen und Wortschatz auf Latein')
  })
})
