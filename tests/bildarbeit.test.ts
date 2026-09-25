import { describe, expect, it } from 'vitest'
import { bildmasse, bildRegeln, bildzugriff, DRUCK_DPI, mindestbreite } from '../src/renderer/src/modules/arbeitsblatt/didactics/bildarbeit'
import { checkImages } from '../src/renderer/src/modules/arbeitsblatt/didactics/imageDesign'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { emptyAnswer } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { ImageBlock, Sheet, WorksheetMeta, WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'

/*
 * Wunsch der Lehrkraft (25.09.2026): „Recherchiere intensiv zur Arbeit mit Bildmaterial in den
 * verschiedenen Fächern." Gewählt wurden Geschichte, Politik, Naturwissenschaften, Kunst und
 * Geographie.
 */
const meta = (subjectId: string, subjectLabel = 'Fach'): WorksheetMeta => ({
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId,
  subjectLabel
})

describe('Jedes Fach geht anders mit Bildern um', () => {
  it('ordnet die Fächer der passenden Arbeitsweise zu', () => {
    expect(bildzugriff(meta('geschichte'))).toBe('quelle')
    expect(bildzugriff(meta('politik'))).toBe('karikatur')
    expect(bildzugriff(meta('kunst'))).toBe('werk')
    expect(bildzugriff(meta('erdkunde'))).toBe('raum')
    expect(bildzugriff(meta('biologie'))).toBe('darstellung')
    expect(bildzugriff(meta('englisch'))).toBe('redeanlass')
  })

  it('schweigt, wo es nichts Fachliches zu sagen gibt', () => {
    expect(bildzugriff(meta('sport'))).toBe('keiner')
    expect(bildRegeln(meta('sport'))).toBe('')
  })

  it('trennt Geschichte von Politik', () => {
    /*
     * Hinweis der Lehrkraft (25.09.2026): „beachte, dass geschichte durchaus speziell ist
     * durch die historische verortung." In Politik geht es um Tendenz und Wertung, nicht um
     * Epochenwissen.
     */
    const geschichte = bildRegeln(meta('geschichte'))
    const politik = bildRegeln(meta('politik'))
    expect(geschichte).toContain('historischen Zusammenhang')
    expect(geschichte).toContain('Bildautor')
    expect(politik).toContain('parteiisch')
    expect(politik).not.toContain('historischen Zusammenhang')
  })
})

describe('Der Befund, der alles trägt: keine bildspezifischen Operatoren', () => {
  it('verlangt den Bildbezug in der Aufgabenstellung', () => {
    /*
     * Belegt: Die Operatorenliste Niedersachsen (2024) sagt, Operatoren würden „erst
     * konkretisiert … durch den Bezug zu Textmaterialien, Abbildungen". Eine App, die
     * Operatoren aus Listen zieht, erzeugt sonst bildblinde Aufgaben.
     */
    for (const fach of ['geschichte', 'politik', 'kunst', 'erdkunde', 'biologie']) {
      expect(bildRegeln(meta(fach)), fach).toContain('gehört in die AUFGABENSTELLUNG, nicht in den Operator')
    }
  })
})

describe('Die fachlichen Schrittfolgen', () => {
  it('stellt in Geschichte die Beschreibung vor die Deutung', () => {
    const text = bildRegeln(meta('geschichte'))
    expect(text).toContain('Vor der Deutung steht die BESCHREIBUNG')
    expect(text).toContain('Bildzentrum')
  })

  it('führt die Karikatur in drei Ebenen', () => {
    // Landeszentrale für politische Bildung Baden-Württemberg, Politik & Unterricht 1/2-2015
    const text = bildRegeln(meta('politik'))
    expect(text).toContain('BESCHREIBEN')
    expect(text).toContain('DEUTEN')
    expect(text).toContain('BEURTEILEN')
    expect(text).toContain('offengelegtem Maßstab')
  })

  it('kennt in Kunst werkimmanent und werktranszendent', () => {
    // Amtliche Operatoren (Niedersachsen 2024) – die Entsprechung zu Panofskys Stufen
    const text = bildRegeln(meta('kunst'))
    expect(text).toContain('WERKIMMANENT')
    expect(text).toContain('WERKTRANSZENDENT')
    // Die Liste der Bildelemente ist Konvention und wird auch so benannt
    expect(text).toContain('Schulbuchkonvention')
  })

  it('unterscheidet in den Naturwissenschaften zeichnen und skizzieren', () => {
    // „zeichnen – grafisch exakt" vs. „skizzieren – übersichtlich" (Niedersachsen 2024)
    const text = bildRegeln(meta('biologie'))
    expect(text).toContain('EXAKT')
    expect(text).toContain('ÜBERSICHTLICH')
    expect(text).toContain('Schemazeichnung')
  })

  it('weist die Geographie-Schritte ausdrücklich als Konvention aus', () => {
    /*
     * Ehrlichkeit gegenüber der Beleglage: Die Recherche hat für die Kartenauswertung KEINE
     * amtliche Schrittfolge gefunden. Die App darf sie deshalb nicht als Vorgabe ausgeben.
     */
    const text = bildRegeln(meta('erdkunde'))
    expect(text).toContain('Unterrichtskonvention, keine amtliche Vorgabe')
    expect(text).toContain('Klimadiagramm')
    expect(text).toContain('RAUM')
  })

  it('behandelt das Bild in der Fremdsprache als Sprechanlass', () => {
    const text = bildRegeln(meta('englisch', 'Englisch'))
    expect(text).toContain('SPRECHANLASS')
    expect(text).toContain('message')
    expect(text).toContain('nicht nach Urheber')
  })
})

describe('Alternativtext', () => {
  it('verlangt Beschreibung statt Deutung', () => {
    /*
     * Ein Alt-Text, der das Bild schon deutet, nimmt blinden Lernenden genau die Leistung ab,
     * die die Aufgabe prüft.
     */
    const text = bildRegeln(meta('geschichte'))
    expect(text).toContain('nicht, was es bedeutet')
    expect(text).toContain('blinden Lernenden')
  })

  it('verlangt bei Diagrammen die Angaben selbst', () => {
    expect(bildRegeln(meta('erdkunde'))).toContain('Achsen, Werte, Verlauf')
  })
})

describe('Ist das Bild scharf genug zum Arbeiten?', () => {
  /*
   * KMK-EPA Geschichte 3.3.3: bildliche Quellen nur „in einer Qualität …, die es den
   * Prüflingen erlaubt, detailgetreu zu analysieren". Nachgerechnet über die Breite auf dem
   * Blatt bei 150 Punkten je Zoll.
   */
  it('rechnet die nötige Breite aus der Blattbreite aus', () => {
    // 170 mm Satzspiegel, 100 % Breite = 6,69 Zoll × 150 = rund 1004 Punkte
    expect(mindestbreite(170, 100)).toBe(Math.round((170 / 25.4) * DRUCK_DPI))
    // Ein halb so breites Bild braucht halb so viele Punkte
    expect(mindestbreite(170, 50)).toBeCloseTo(mindestbreite(170, 100) / 2, -1)
  })

  it('liest die Maße aus einem PNG', () => {
    // 1×1-Punkt-PNG: die Maße stehen fest im IHDR-Kopf
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    expect(bildmasse(png)).toEqual({ breite: 1, hoehe: 1 })
  })

  it('gibt bei unbekannten Formaten auf, statt zu raten', () => {
    expect(bildmasse('data:image/svg+xml;base64,PHN2Zy8+')).toBeNull()
    expect(bildmasse('kein Bild')).toBeNull()
    expect(bildmasse('data:image/png;base64,###')).toBeNull()
  })
})

describe('Warnungen am Bild', () => {
  /*
   * Entscheidung der Lehrkraft (25.09.2026): Bei einer Bildquelle ohne Herkunftsangaben
   * „warnen, aber zulassen". Das Blatt entsteht; der Hinweis steht im Symbol.
   */
  const blatt = (bild: Partial<ImageBlock>, fach = 'geschichte'): { sheet: Sheet; meta: WorksheetMeta } => ({
    sheet: {
      id: 's',
      label: 'Blatt',
      blocks: [
        {
          id: 'bild1',
          type: 'image',
          description: 'Wahlplakat mit zwei Figuren',
          caption: 'M1: Wahlplakat',
          widthPercent: 60,
          fn: 'repraesentation',
          ...bild
        } as ImageBlock,
        {
          id: 'a1',
          type: 'task',
          instruction: 'Analysiere das Plakat M1.',
          operator: 'Analysiere',
          afbReason: '',
          socialForm: 'EA',
          answer: emptyAnswer('lines'),
          parts: [],
          solution: '',
          points: 8,
          minutes: 20
        } as WsBlock
      ]
    },
    meta: { ...meta(fach), grade: 10 }
  })

  it('meldet eine Bildquelle ohne Urheber und Datum', () => {
    const { sheet, meta: m } = blatt({ image: { dataUrl: 'data:image/png;base64,AA==', source: 'wikimedia' } })
    const funde = checkImages(sheet, m)
    expect(funde.some((f) => f.message.includes('Urheber und Entstehungszeit'))).toBe(true)
  })

  it('schweigt, wenn die Angaben da sind', () => {
    const { sheet, meta: m } = blatt({
      image: { dataUrl: 'data:image/png;base64,AA==', source: 'wikimedia', citation: { creator: 'Volksblock', date: '1925' } }
    })
    expect(checkImages(sheet, m).some((f) => f.message.includes('Entstehungszeit'))).toBe(false)
  })

  it('verlangt die Herkunft nicht in der Fremdsprache', () => {
    // Dort ist das Bild Sprechanlass; nach dem Urheber zu fragen ginge am Fach vorbei
    const { sheet, meta: m } = blatt({ image: { dataUrl: 'data:image/png;base64,AA==', source: 'wikimedia' } }, 'englisch')
    expect(checkImages(sheet, m).some((f) => f.message.includes('Urheber'))).toBe(false)
  })
})
