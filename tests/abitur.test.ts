import { describe, expect, it } from 'vitest'
import { abiturMoeglich, abiturProfil, abiturStandard, ABITUR_PROFILE } from '../src/renderer/src/modules/arbeitsblatt/didactics/abitur'
import { abiturAktiv, abiturRegeln, abiturZusammenfassung } from '../src/renderer/src/modules/arbeitsblatt/generation/abiturPrompt'
import { phraseSheetModus } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { mitHilfsblatt } from '../src/renderer/src/modules/arbeitsblatt/generation/generate'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { AbiturVorgaben, Outline, OutlineItem, WorksheetMeta } from '../src/renderer/src/modules/arbeitsblatt/model/types'

/*
 * Wunsch der Lehrkraft (24.09.2026): Für Jahrgang 12/13 sollen sich an Abituraufgaben
 * angelehnte Übungsaufgaben und Übungsklausuren entwerfen lassen, „analysiere das Material
 * der Abituraufgaben Niedersachsens".
 *
 * Die Recherche hat ergeben: ES GIBT KEIN EINHEITLICHES ABITURFORMAT. Deutsch legt vier
 * Aufgaben zur Auswahl vor, Biologie vier mit Auswahl von dreien, die
 * Gesellschaftswissenschaften zwei; Mathematik hat einen hilfsmittelfreien Teil, die
 * Fremdsprachen drei getrennt gewichtete Prüfungsteile. Eine gemeinsame Schablone wäre
 * für jedes einzelne Fach falsch.
 */
const vorgaben = (over: Partial<AbiturVorgaben> = {}): AbiturVorgaben => ({
  an: true,
  niveau: 'eA',
  aufgabenart: 'materialgebunden',
  klausur: false,
  ...over
})

const meta = (over: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'geschichte',
  subjectLabel: 'Geschichte',
  topic: 'Weimarer Republik',
  grade: 12,
  abitur: vorgaben(),
  ...over
})

describe('Fachprofile', () => {
  it('führt für jedes Fach eine eigene Aufgabenstruktur', () => {
    expect(abiturProfil('deutsch')?.vorgelegt, 'Deutsch: vier Vorschläge zur Auswahl').toBe(4)
    expect(abiturProfil('biologie')?.zuBearbeiten, 'Biologie: vier vorgelegt, drei bearbeiten').toBe(3)
    expect(abiturProfil('geschichte')?.vorgelegt, 'Gesellschaftswissenschaften: zwei zur Auswahl').toBe(2)
  })

  it('kennt die einzigen prozentgenau belegten Anforderungsbereiche', () => {
    /*
     * Mathematik ist das einzige Fach mit amtlichen Zahlen: gA 30/45/25, eA 25/45/30
     * (Hinweise zur schriftlichen Abiturprüfung, aus den Pool-Aufgaben abgeleitet).
     */
    expect(abiturProfil('mathematik')?.afb.gA).toEqual({ I: 30, II: 45, III: 25 })
    expect(abiturProfil('mathematik')?.afb.eA).toEqual({ I: 25, II: 45, III: 30 })
  })

  it('kennt die Gewichtung der Fremdsprachen-Prüfungsteile', () => {
    // Erlass Kombinierte Aufgaben (Nds., 04.05.2023): 20 / 25 / 55
    const teile = abiturProfil('englisch')?.pruefungsteile ?? []
    expect(teile.map((t) => t.anteil)).toEqual([20, 25, 55])
    expect(teile.reduce((n, t) => n + t.anteil, 0)).toBe(100)
  })

  it('kennt die Wortzahl der Textvorlage in den Fremdsprachen', () => {
    expect(abiturProfil('englisch')?.materialWoerter).toEqual({ gA: 800, eA: 1000 })
  })

  it('sagt bei jedem Fach dazu, was nicht amtlich vorgegeben ist', () => {
    /*
     * Eine erfundene Prozentangabe, die wie eine Vorgabe klingt, wäre schlimmer als gar
     * keine: Die Lehrkraft würde sich darauf berufen.
     */
    for (const p of ABITUR_PROFILE) {
      expect(p.quelle.length, `${p.label} ohne Quellenangabe`).toBeGreaterThan(10)
    }
    expect(abiturProfil('deutsch')?.offen).toContain('keine vorgegebenen Prozentanteile')
    expect(abiturProfil('biologie')?.offen).toContain('keine fachbezogenen Hinweise')
  })

  it('bietet den Modus erst ab Jahrgang 12 an', () => {
    // In der Einführungsphase werden die Aufgabenarten erst aufgebaut
    expect(abiturMoeglich({ grade: 11, subjectId: 'geschichte' })).toBe(false)
    expect(abiturMoeglich({ grade: 12, subjectId: 'geschichte' })).toBe(true)
    expect(abiturMoeglich({ grade: 13, subjectId: 'deutsch' })).toBe(true)
  })

  it('bietet ihn nicht für Fächer ohne belegte Vorgaben an', () => {
    expect(abiturMoeglich({ grade: 12, subjectId: 'sport' })).toBe(false)
    expect(abiturMoeglich({ grade: 12, subjectId: 'kunst' })).toBe(false)
  })
})

describe('Vorgaben an die KI', () => {
  it('schweigt, wenn der Modus aus ist', () => {
    expect(abiturRegeln(meta({ abitur: vorgaben({ an: false }) }))).toBe('')
    expect(abiturAktiv(meta({ grade: 10 }))).toBe(false)
  })

  it('unterscheidet die beiden Anforderungsniveaus', () => {
    /*
     * Der zentrale Hebel: eA unterscheidet sich nicht durch MEHR Aufgaben, sondern durch
     * komplexeres Material, die Verschiebung zu AFB III und mehr Selbstständigkeit
     * (EPA Geographie, im Erdkunde-Hinweis wörtlich zitiert).
     */
    const g = abiturRegeln(meta({ abitur: vorgaben({ niveau: 'gA' }) }))
    const e = abiturRegeln(meta({ abitur: vorgaben({ niveau: 'eA' }) }))
    expect(g).toContain('Anforderungsbereiche I und II')
    expect(e).toContain('Anforderungsbereiche II und III')
    expect(e).toContain('Selbstständigkeit')
  })

  it('gibt die Anforderungsbereiche als Richtwert aus, nicht als Vorgabe', () => {
    const r = abiturRegeln(meta())
    expect(r).toContain('als RICHTWERT')
    expect(r).toContain('Schwerpunkt bleibt immer AFB II')
  })

  it('übernimmt die Materialregeln des Faches wörtlich', () => {
    // EPA Geschichte 3.3.3 und EPA Geographie 3.3
    const r = abiturRegeln(meta())
    expect(r).toContain('Vielzahl von Materialien')
    expect(r).toContain('Keine ausdrückliche Zuordnung')
    expect(r).toContain('Zeilenzählung')
  })

  it('verlangt wenige, aber komplexe Arbeitsanweisungen', () => {
    expect(abiturRegeln(meta())).toContain('unzusammenhängendes Reihen von Einzelfragen')
  })

  it('bildet bei der Übungsklausur die Prüfungssituation nach', () => {
    const r = abiturRegeln(meta({ abitur: vorgaben({ klausur: true }) }))
    expect(r).toContain('Bearbeitungszeit')
    expect(r).toContain('Hilfsmittel')
    /*
     * Seit dem 24.09.2026 bekommt die Übungsklausur in den Fremdsprachen ein sprachliches
     * Gerüst auf einer eigenen Seite. In der AUFGABE bleiben Hilfen aber ausgeschlossen.
     */
    expect(r, 'In der Prüfung wird bewertet, nicht angeleitet').toContain('Keine Selbsteinschätzung und keine Tipps in der Aufgabe')
  })

  it('nennt bei der Übungsklausur die Auswahl, ohne sie vorzutäuschen', () => {
    /*
     * Im Abitur werden mehrere Aufgaben vorgelegt. Die App erzeugt eine – das muss
     * dastehen, sonst hält die Lehrkraft das Blatt für eine vollständige Klausur.
     */
    const r = abiturRegeln(meta({ abitur: vorgaben({ klausur: true }) }))
    expect(r).toContain('2 Aufgaben vorgelegt')
  })

  it('besteht darauf, dass es eine Übung ist und keine Prüfungsaufgabe', () => {
    /*
     * Eine Übungsklausur, die aussieht wie eine Abituraufgabe, wird auch dafür gehalten –
     * von Lernenden wie von Kolleginnen. Sie ist aber nicht vom Land gestellt.
     */
    const r = abiturRegeln(meta())
    expect(r).toContain('KEINE amtliche Prüfungsaufgabe')
    expect(r).toContain('Erfinde keine Angaben zu Prüfungsjahrgängen')
  })

  it('nennt das Bewertungsmodell des Faches', () => {
    expect(abiturRegeln(meta({ subjectId: 'deutsch', subjectLabel: 'Deutsch', abitur: vorgaben({ aufgabenart: 'interpretation-lit' }) }))).toContain(
      'Verstehensleistung'
    )
    expect(abiturRegeln(meta({ subjectId: 'englisch', subjectLabel: 'Englisch', abitur: vorgaben({ aufgabenart: 'schreiben' }) }))).toContain(
      'Sprachliche Leistung 60 %'
    )
  })

  it('nimmt in den Fremdsprachen die Aufgabenart aus dem Kompetenzschwerpunkt', () => {
    /*
     * Gemeldet von der Lehrkraft (24.09.2026): „doppelt sich mit kompetenzschwerpunkt bei
     * anlehnung an abituraufgaben. entferne diese doppelte abfrage."
     *
     * Die drei Prüfungsteile des Fremdsprachen-Abiturs SIND die Kompetenzschwerpunkte.
     * Zweimal dasselbe zu fragen, lädt nur dazu ein, sich zu widersprechen – und dann gilt
     * eine Einstellung, von der die Lehrkraft nicht weiß, welche.
     */
    const r = abiturRegeln(meta({ subjectId: 'englisch', subjectLabel: 'Englisch', skillFocus: 'mediation' }))
    expect(r).toContain('Sprachmittlung')
    expect(r).toContain('25 % der Gesamtbewertung')
  })

  it('folgt dem Schwerpunkt auch beim Hörverstehen', () => {
    const r = abiturRegeln(meta({ subjectId: 'englisch', subjectLabel: 'Englisch', skillFocus: 'listening' }))
    expect(r).toContain('Hörverstehen – 20 %')
  })

  it('nimmt ohne passenden Schwerpunkt das Schreiben', () => {
    // Es trägt im Abitur 55 % und ist der Kern der Prüfung
    const r = abiturRegeln(meta({ subjectId: 'englisch', subjectLabel: 'Englisch', skillFocus: 'grammar' }))
    expect(r).toContain('Schreiben – 55 %')
  })

  it('lässt die eigene Auswahl, wo es keinen Schwerpunkt gibt', () => {
    // Deutsch und die Gesellschaftswissenschaften kennen keinen Kompetenzschwerpunkt
    const r = abiturRegeln(
      meta({ subjectId: 'deutsch', subjectLabel: 'Deutsch', skillFocus: 'mediation', abitur: vorgaben({ aufgabenart: 'eroerterung-lit' }) })
    )
    expect(r).toContain('Erörterung literarischer Texte')
  })
})

describe('Zusammenfassung für die Anzeige', () => {
  it('sagt in wenigen Zeilen, was eingestellt ist', () => {
    const z = abiturZusammenfassung(meta({ abitur: vorgaben({ klausur: true }) })).join(' | ')
    expect(z).toContain('erhöhtes Anforderungsniveau')
    expect(z).toContain('Anforderungsbereiche')
    expect(z).toContain('Übungsklausur')
  })

  it('nennt die Quelle der Vorgaben', () => {
    // Damit die Lehrkraft nachschlagen kann, worauf sich die App beruft
    expect(abiturZusammenfassung(meta()).join(' ')).toContain('EPA Geschichte')
  })

  it('schweigt, wenn der Modus aus ist', () => {
    expect(abiturZusammenfassung(meta({ abitur: vorgaben({ an: false }) }))).toEqual([])
  })
})

describe('Voreinstellung und Fachwechsel', () => {
  it('schlägt das grundlegende Niveau vor', () => {
    /*
     * In Niedersachsen belegen Lernende nur zwei Fächer auf erhöhtem Niveau, alle übrigen
     * auf grundlegendem – das ist der häufigere Fall.
     */
    expect(abiturStandard({ subjectId: 'geschichte' }, true).niveau).toBe('gA')
  })

  it('repariert die Aufgabenart nach einem Fachwechsel', () => {
    /*
     * „Interpretation literarischer Texte" gibt es in Erdkunde nicht. Ohne diese Prüfung
     * stünde im Auswahlfeld nichts, und die KI bekäme eine Kennung, die das Fachprofil gar
     * nicht kennt.
     */
    const alt = vorgaben({ aufgabenart: 'interpretation-lit' })
    const neu = abiturStandard({ subjectId: 'erdkunde', abitur: alt }, true)
    expect(neu.aufgabenart).toBe('materialgebunden')
  })

  it('behält eine Aufgabenart, die es im neuen Fach auch gibt', () => {
    const alt = vorgaben({ aufgabenart: 'quellenvergleich' })
    expect(abiturStandard({ subjectId: 'politik', abitur: alt }, true).aufgabenart).toBe('quellenvergleich')
  })

  it('setzt in den Fremdsprachen einen Prüfungsteil', () => {
    expect(abiturStandard({ subjectId: 'englisch' }, true).pruefungsteil).toBe('hoerverstehen')
  })

  it('setzt in den übrigen Fächern keinen', () => {
    // Deutsch und die Gesellschaftswissenschaften kennen keine getrennt gewichteten Teile
    expect(abiturStandard({ subjectId: 'deutsch' }, true).pruefungsteil).toBeUndefined()
  })

  it('behält die übrigen Einstellungen beim Aus- und Wiedereinschalten', () => {
    const an = vorgaben({ niveau: 'eA', klausur: true })
    const aus = abiturStandard({ subjectId: 'geschichte', abitur: an }, false)
    expect(aus.an).toBe(false)
    const wieder = abiturStandard({ subjectId: 'geschichte', abitur: aus }, true)
    expect(wieder.niveau).toBe('eA')
    expect(wieder.klausur).toBe(true)
  })
})

describe('Zeit und Umfang richten sich nach dem Prüfungsteil', () => {
  /*
   * Gemeldet von der Lehrkraft (24.09.2026): „die uebungsklausur abitur fuer englisch geht
   * davon aus, dass die gesamte laenge ueber bspw. Mediation gemacht wird […] mediation sind
   * nur 60 Minuten. Ein Text bei meiner probe wurde viel zu lang fuer 60 minuten."
   *
   * Die Ursache: Das Fachprofil trug nur EINE Zeit und EINE Wortzahl – die der
   * Schreibaufgabe. Wer Sprachmittlung wählte, bekam trotzdem 225 Minuten und 1000 Wörter.
   */
  const englisch = (skillFocus: string, klausur = true): string =>
    abiturRegeln(meta({ subjectId: 'englisch', subjectLabel: 'Englisch', skillFocus: skillFocus as never, abitur: vorgaben({ klausur }) }))

  it('gibt der Sprachmittlung 60 Minuten, nicht die Zeit der Schreibaufgabe', () => {
    const r = englisch('mediation')
    expect(r).toContain('60 Minuten')
    expect(r, 'die Zeit der Schreibaufgabe darf hier nicht stehen').not.toContain('225 Minuten')
  })

  it('gibt dem Hörverstehen 30 Minuten', () => {
    expect(englisch('listening')).toContain('30 Minuten')
  })

  it('behält für die Schreibaufgabe die volle Zeit', () => {
    expect(englisch('writing')).toContain('225 Minuten')
  })

  it('kürzt den Ausgangstext der Sprachmittlung auf ein Maß, das in 60 Minuten zu schaffen ist', () => {
    const r = englisch('mediation', false)
    expect(r).toContain('etwa 500 Wörter')
    expect(r, '1000 Wörter gelten für die Schreibaufgabe, nicht hier').not.toContain('1000 Wörter')
  })

  it('nennt eine Obergrenze, nicht nur einen Richtwert', () => {
    // „etwa 500" allein liest sich wie eine Einladung, 900 zu schreiben
    const r = englisch('mediation', false)
    expect(r).toContain('HÖCHSTENS')
    expect(r).toContain('in der Zeit nicht zu bewältigen')
  })

  it('sagt dazu, dass die Wortzahl der Sprachmittlung nicht amtlich ist', () => {
    // Sie ist aus der Bearbeitungszeit abgeleitet – das muss die Lehrkraft wissen
    expect(abiturProfil('englisch')?.offen).toContain('keine amtliche Wortzahl')
  })
})

describe('Sprachliche Hilfsmittel in der Übungsklausur', () => {
  /*
   * Wunsch der Lehrkraft (24.09.2026): „Die Übungsklausuren stellen bisher keine sprachlichen
   * Hilfsmittel zur Verfügung wie bei anderen Arbeitsblättern. Füge diese als eigene Seite
   * hinzu."
   *
   * Eine bewusste Abweichung von der Prüfungswirklichkeit – im Abitur gibt es keine
   * Formulierungshilfen. Eine Übung ist aber zum Üben da.
   */
  const englischKlausur = (over: Partial<WorksheetMeta> = {}): WorksheetMeta =>
    meta({ subjectId: 'englisch', subjectLabel: 'Englisch', abitur: vorgaben({ klausur: true }), ...over })

  it('schaltet das Gerüst in der Fremdsprachen-Übungsklausur von selbst ein', () => {
    expect(phraseSheetModus(englischKlausur())).toBe('blatt')
  })

  it('setzt es auf eine eigene Seite, nicht in die Aufgabe', () => {
    // So lässt es sich beim zweiten Durchgang weglassen
    expect(abiturRegeln(englischKlausur())).toContain('EIGENEN Seite')
  })

  it('lässt eine ausdrückliche Wahl der Lehrkraft unangetastet', () => {
    expect(phraseSheetModus(englischKlausur({ phraseSheet: 'inline' }))).toBe('inline')
  })

  it('schaltet es bei einer Übungsaufgabe nicht ein', () => {
    // Dort entscheidet die Lehrkraft wie bisher selbst
    expect(phraseSheetModus(meta({ subjectId: 'englisch', subjectLabel: 'Englisch', abitur: vorgaben({ klausur: false }) }))).toBe('aus')
  })

  it('schaltet es außerhalb der Fremdsprachen nicht ein', () => {
    // Ein sprachliches Gerüst ergibt in Geschichte oder Mathematik keinen Sinn
    expect(phraseSheetModus(meta({ subjectId: 'geschichte', abitur: vorgaben({ klausur: true }) }))).toBe('aus')
  })

  it('verbietet weiterhin Tipps in der Aufgabe selbst', () => {
    expect(abiturRegeln(englischKlausur())).toContain('In der Prüfung wird bewertet, nicht angeleitet')
  })
})

describe('Das Hilfsblatt steht auch wirklich in der Gliederung', () => {
  /*
   * Gemeldet am 25.09.2026: In einer Übungsklausur (Englisch, Jg. 13, Sprachmittlung) fehlten
   * die sprachlichen Hilfsmittel, obwohl sie in Schritt 1 ausgewählt waren.
   *
   * Die Ursache war eine Regel gegen eine andere: Beim Ausformulieren gilt „Erzeuge KEINEN
   * Baustein, der nicht in der Gliederung steht" – das schlägt die Pflichtregel aus dem
   * System-Prompt. Fehlte der Punkt in der Gliederung, konnte das Hilfsblatt nicht mehr
   * entstehen.
   *
   * Die alten Tests prüften nur `phraseSheetModus` und den Regeltext. Beide waren richtig,
   * und das Blatt blieb trotzdem ohne Hilfsblatt.
   */
  const punkt = (type: OutlineItem['type']): OutlineItem => ({
    id: type,
    type,
    purpose: 'x',
    operator: '',
    socialForm: 'EA',
    answerKind: 'none'
  })
  const gliederung = (...typen: OutlineItem['type'][]): Outline => ({
    title: 'Mediation',
    learningGoals: [],
    minutes: 90,
    teacherNote: '',
    items: typen.map(punkt)
  })
  const englischKlausur = (over: Partial<WorksheetMeta> = {}): WorksheetMeta =>
    meta({ subjectId: 'englisch', subjectLabel: 'Englisch', abitur: vorgaben({ klausur: true }), ...over })

  it('ergänzt den fehlenden Punkt', () => {
    const aus = mitHilfsblatt(gliederung('text', 'task'), englischKlausur())
    expect(aus.items.map((i) => i.type)).toEqual(['text', 'task', 'phrases'])
  })

  it('ergänzt ihn nicht doppelt', () => {
    const aus = mitHilfsblatt(gliederung('text', 'task', 'phrases'), englischKlausur())
    expect(aus.items.filter((i) => i.type === 'phrases')).toHaveLength(1)
  })

  it('lässt die Selbsteinschätzung der Abschluss des Blattes bleiben', () => {
    // Auf einem gewöhnlichen Arbeitsblatt steht sie ganz am Ende – davor das Hilfsblatt
    const aus = mitHilfsblatt(gliederung('task', 'selfCheck'), meta({ subjectId: 'englisch', subjectLabel: 'Englisch', phraseSheet: 'blatt' }))
    expect(aus.items.map((i) => i.type)).toEqual(['task', 'phrases', 'selfCheck'])
  })

  it('ergänzt nichts, wenn die Lehrkraft kein Hilfsblatt will', () => {
    const ohne = meta({ subjectId: 'englisch', subjectLabel: 'Englisch', phraseSheet: 'aus' })
    expect(mitHilfsblatt(gliederung('text', 'task'), ohne).items.map((i) => i.type)).toEqual(['text', 'task'])
  })

  it('nennt im Zweck die Zielsprache', () => {
    // Der Zweck steuert das Ausformulieren: „Wendungen auf Englisch", nicht auf Deutsch
    const aus = mitHilfsblatt(gliederung('task'), englischKlausur())
    expect(aus.items.find((i) => i.type === 'phrases')?.purpose).toContain('Englisch')
  })
})
