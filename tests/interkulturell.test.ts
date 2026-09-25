import { describe, expect, it } from 'vitest'
import { erklaerSprache, interkulturellGilt, interkulturellRegeln } from '../src/renderer/src/modules/arbeitsblatt/didactics/interkulturell'
import { systemPrompt } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { buildLearnerProfile } from '../src/renderer/src/modules/arbeitsblatt/didactics/profile'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { WorksheetMeta } from '../src/renderer/src/modules/arbeitsblatt/model/types'

/*
 * Wunsch der Lehrkraft (24.09.2026): „Wenn bei Aufgaben konkrete Orte angegeben werden
 * (Länder, Städte etc.), versuch interkulturelle Aspekte mit in die Aufgabe zu integrieren.
 * Geh dabei nur von explizit genanntem Vorwissen der Schülerinnen und Schüler aus."
 *
 * Abgestimmt: Fremdsprachen und Gesellschaftswissenschaften; nur wenn der Ort den Inhalt
 * TRÄGT; fehlendes Wissen liefert das Blatt selbst, eingewoben in das ohnehin Vorhandene.
 */

const meta = (over: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'englisch',
  subjectLabel: 'Englisch',
  grade: 9,
  ...over
})

describe('In welchen Fächern die Regel greift', () => {
  it('greift in allen Fremdsprachen', () => {
    for (const fach of ['englisch', 'franzoesisch', 'spanisch', 'italienisch']) {
      expect(interkulturellGilt(fach), fach).toBe(true)
    }
  })

  it('greift in den gesellschaftswissenschaftlichen Fächern', () => {
    for (const fach of ['geschichte', 'erdkunde', 'politik', 'religion', 'werte-und-normen']) {
      expect(interkulturellGilt(fach), fach).toBe(true)
    }
  })

  it('schweigt in den Fächern, in denen ein Ort bloße Kulisse ist', () => {
    /*
     * Der wichtigste Test. „Ein Zug fährt von Hamburg nach München" ist eine Rechenaufgabe,
     * keine Begegnung. Ein interkultureller Einschub wäre dort aufgesetzt und kostete
     * Bearbeitungszeit – deshalb steht im Prompt dieser Fächer gar nichts davon.
     */
    for (const fach of ['mathematik', 'physik', 'chemie', 'informatik', 'sport', 'musik']) {
      expect(interkulturellGilt(fach), fach).toBe(false)
      expect(interkulturellRegeln({ subjectId: fach }), fach).toBe('')
    }
  })
})

describe('Was in den Regeln steht', () => {
  it('bindet den Aspekt an einen Ort, der den Inhalt trägt', () => {
    const r = interkulturellRegeln({ subjectId: 'englisch' })
    expect(r).toContain('TRÄGT')
    expect(r).toContain('Kulisse')
  })

  it('nennt das eingetragene Vorwissen wörtlich', () => {
    const r = interkulturellRegeln({ subjectId: 'erdkunde', priorKnowledge: 'Klimazonen, Monsun' })
    expect(r).toContain('Klimazonen, Monsun')
    expect(r).toContain('ausschließlich voraussetzen')
  })

  it('verbietet ohne eingetragenes Vorwissen jedes vorausgesetzte Landeskundewissen', () => {
    /*
     * Das Feld „Vorwissen" ist optional und oft leer. Genau dann ist die Gefahr am größten,
     * dass die KI stillschweigend Bekanntes annimmt – und die Aufgabe für einen Teil der
     * Lerngruppe unlösbar wird.
     */
    const r = interkulturellRegeln({ subjectId: 'englisch', priorKnowledge: '   ' })
    expect(r).toContain('KEIN Vorwissen angegeben')
    expect(r).toContain('Setze deshalb kein landeskundliches Wissen voraus')
  })

  it('verlangt das Einweben statt eines zusätzlichen Kastens', () => {
    // Ausdrücklicher Wunsch: „mit Integration in womöglich bereits vorhandenes"
    const r = interkulturellRegeln({ subjectId: 'franzoesisch' })
    expect(r).toContain('WEBST du in das ein')
    expect(r).toContain('KEINEN zusätzlichen Infokasten')
  })

  it('deckt alle vier gewünschten Arten ab', () => {
    const r = interkulturellRegeln({ subjectId: 'politik' })
    for (const art of ['Perspektivwechsel', 'Begegnungssituation', 'überprüfen', 'landeskundliches Wissen']) {
      expect(r, art).toContain(art)
    }
  })

  it('wehrt Klischees ab', () => {
    /*
     * Ohne diesen Teil kippt „interkulturell" schnell in Folklore: Essen, Kleidung, Feste
     * und Aussagen über „die" Menschen eines Landes. Das wäre das Gegenteil des Ziels.
     */
    const r = interkulturellRegeln({ subjectId: 'englisch' })
    expect(r).toContain('KEINE KLISCHEES')
    expect(r).toContain('Vielfalt INNERHALB')
  })
})

describe('Die Regeln stehen wirklich im Systemprompt', () => {
  const prompt = (m: WorksheetMeta): string => systemPrompt(m, buildLearnerProfile(m))

  it('steht im Prompt einer Englischstunde', () => {
    expect(prompt(meta({ topic: 'A school trip to Singapore' }))).toContain('ORTE UND INTERKULTURELLE ASPEKTE')
  })

  it('steht NICHT im Prompt einer Mathematikstunde', () => {
    // Sonst wäre der Prompt länger, ohne dass es dem Blatt nützt
    expect(prompt(meta({ subjectId: 'mathematik', subjectLabel: 'Mathematik' }))).not.toContain('ORTE UND INTERKULTURELLE ASPEKTE')
  })
})

describe('Ortsnamen werden kurz erklärt', () => {
  /*
   * Wunsch der Lehrkraft (24.09.2026): „gib den Schülern eine kurze Erklärung […], worum es
   * sich handelt (z. B. „Marina Bay walking tour" sollte Marina Bay erklärt sein)".
   *
   * Ein Eigenname, den niemand einordnen kann, ist eine stille Hürde: Die Aufgabe ist lösbar,
   * aber man weiß nicht, wovon die Rede ist – und traut sich nicht zu fragen.
   */
  it('verlangt die Erklärung beim ersten Vorkommen', () => {
    const r = interkulturellRegeln({ subjectId: 'englisch', grade: 10, cefrLevel: 'B1' })
    expect(r).toContain('ORTSNAMEN KURZ ERKLÄREN')
    expect(r).toContain('ERSTEN Vorkommen')
    expect(r).toContain('Marina Bay')
  })

  it('hält die Erklärung kurz', () => {
    // Sonst wird aus der Aufgabe ein Lesetext – und die Erklärung frisst die Bearbeitungszeit
    expect(interkulturellRegeln({ subjectId: 'englisch', grade: 10 })).toContain('Höchstens ein knapper Satz')
  })

  it('erklärt nichts doppelt', () => {
    const r = interkulturellRegeln({ subjectId: 'erdkunde', priorKnowledge: 'Singapur, Stadtstaaten' })
    expect(r).toContain('die im ausgewiesenen Vorwissen stehen')
  })
})

describe('Sprache der Ortserklärung', () => {
  /*
   * „je nach Jahrgang, Niveaustufe und Fach in Deutsch oder der Fremdsprache". Bis A2 wäre
   * eine fremdsprachige Erklärung eine zweite Hürde statt einer Hilfe; ab B1 gehört sie in
   * die Zielsprache, sonst fällt man mitten im Text aus ihr heraus.
   */
  it('bleibt in den Gesellschaftswissenschaften deutsch', () => {
    expect(erklaerSprache({ subjectId: 'geschichte', grade: 10 })).toContain('Deutsch')
    expect(erklaerSprache({ subjectId: 'erdkunde', grade: 12, cefrLevel: 'C1' })).toContain('Deutsch')
  })

  it('ist auf niedrigem Niveau deutsch', () => {
    expect(erklaerSprache({ subjectId: 'englisch', grade: 6, cefrLevel: 'A1' })).toContain('DEUTSCH')
    expect(erklaerSprache({ subjectId: 'franzoesisch', grade: 8, cefrLevel: 'A2' })).toContain('DEUTSCH')
  })

  it('ist ab B1 die Zielsprache', () => {
    expect(erklaerSprache({ subjectId: 'englisch', grade: 9, cefrLevel: 'B1' })).toContain('ZIELSPRACHE')
    expect(erklaerSprache({ subjectId: 'englisch', grade: 11, cefrLevel: 'B2' })).toContain('ZIELSPRACHE')
  })

  it('bleibt in den unteren Jahrgängen deutsch, auch ohne Niveauangabe', () => {
    expect(erklaerSprache({ subjectId: 'englisch', grade: 6 })).toContain('DEUTSCH')
  })
})
