/**
 * Wache für die Sprechprüfung (01.10.2026): Kompetenzlisten mit beiden Teilkompetenzen des
 * Sprechens, Ländervorgaben, Erzeugung von Karten, Prüferbogen, Raster und Kartensätzen mit
 * KI-Attrappe sowie das Vorbereitungsblatt im Arbeitsblatt.
 */
import { describe, expect, it } from 'vitest'
import { FAECHER } from '@shared/faecher'
import { presetDesigns } from '@shared/design'
import { skillFocusOptions } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts/fertigkeiten'
import { competenceAreas } from '../src/renderer/src/modules/arbeitsblatt/generation/competences'
import { SPRECHEN_DIALOGISCH, SPRECHEN_MONOLOGISCH, KMK_NAMEN, sprechKompetenzen } from '../src/renderer/src/shared/sprechen/kompetenzen'
import { KMK_SPRECHEN, SPRECH_LAENDER, sprechLand, sprechSetupFuer, pruefungsdauer } from '../src/renderer/src/shared/sprechen/laender'
import { noteAusPunkten, punkteJeNote, rasterZeilen } from '../src/renderer/src/shared/sprechen/raster'
import { generateExam } from '../src/renderer/src/modules/klassenarbeit/generation/generateExam'
import { normalisiereSprechDaten, sprechPrompt, sprechpruefungAlsArbeit } from '../src/renderer/src/modules/klassenarbeit/generation/sprechpruefung'
import { formatsFor } from '../src/renderer/src/modules/klassenarbeit/model/formats'
import { examToWorksheet } from '../src/renderer/src/modules/klassenarbeit/render/examWorksheet'
import type { Exam, ExamPart } from '../src/renderer/src/modules/klassenarbeit/model/types'
import { brauchtMusterdialog, sprechRegeln } from '../src/renderer/src/modules/arbeitsblatt/didactics/sprechen'
import { scriptPrompt, wantsListening } from '../src/renderer/src/modules/arbeitsblatt/generation/listening'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { WorksheetMeta } from '../src/renderer/src/modules/arbeitsblatt/model/types'

const LAENDER = ['BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH']
const MODERNE = FAECHER.filter((f) => f.sprache && f.art === 'fremdsprache')

describe('Kompetenzschwerpunkte: Sprechen in allen modernen Fremdsprachen', () => {
  it('bietet beide Teilkompetenzen in jeder modernen Fremdsprache an', () => {
    expect(MODERNE.length).toBeGreaterThan(10)
    for (const f of MODERNE) {
      const werte = skillFocusOptions(f.id).map((o) => o.value)
      expect(werte, f.id).toContain('speaking')
      expect(werte, f.id).toContain('interaction')
    }
  })

  it('benennt sie nach den KMK-Bildungsstandards', () => {
    const optionen = skillFocusOptions('englisch')
    expect(optionen.find((o) => o.value === 'speaking')?.label).toBe('Sprechen: zusammenhängendes Sprechen (monologisch)')
    expect(optionen.find((o) => o.value === 'interaction')?.label).toBe('Sprechen: an Gesprächen teilnehmen (dialogisch)')
    expect(KMK_NAMEN.monolog).toBe('Sprechen – zusammenhängendes Sprechen')
    expect(KMK_NAMEN.dialog).toBe('Sprechen – an Gesprächen teilnehmen')
  })

  it('lässt Latein und Griechisch (und Deutsch) ohne Sprechen', () => {
    for (const id of ['latein', 'griechisch', 'deutsch']) {
      const werte = skillFocusOptions(id).map((o) => o.value)
      expect(werte, id).not.toContain('speaking')
      expect(werte, id).not.toContain('interaction')
      expect(competenceAreas(id), id).not.toContain(SPRECHEN_MONOLOGISCH)
    }
  })

  it('führt beide Teilkompetenzen auch in den Kompetenzbereichen für den Kompetenzvorschlag', () => {
    for (const f of MODERNE) {
      expect(competenceAreas(f.id), f.id).toContain(SPRECHEN_MONOLOGISCH)
      expect(competenceAreas(f.id), f.id).toContain(SPRECHEN_DIALOGISCH)
    }
  })

  it('hat in jedem Land eine Bezeichnung für beide Teilkompetenzen', () => {
    for (const land of LAENDER) {
      const k = sprechKompetenzen(land, 'gymnasium', 8)
      expect(k.monolog, land).toMatch(/zusammenhängend|monolog|Produktion/i)
      expect(k.dialog, land).toMatch(/Gespräch|dialog|Interaktion/i)
    }
  })
})

describe('Ländervorgaben der Sprechprüfung', () => {
  it('hat für alle 16 Länder einen Eintrag mit Fundstelle', () => {
    for (const land of LAENDER) {
      const l = SPRECH_LAENDER[land]
      expect(l, land).toBeDefined()
      expect(l.quellen.length, land).toBeGreaterThan(0)
      expect([2, 3], land).toContain(l.gruppe)
      expect(
        l.kriterien.reduce((n, k) => n + k.gewicht, 0),
        land
      ).toBe(100)
      expect(l.monolog + l.dialog, land).toBeGreaterThan(0)
    }
  })

  it('setzt die Gruppengröße nach dem Land voraus', () => {
    for (const land of LAENDER) expect(sprechSetupFuer(land, 10).gruppe, land).toBe(SPRECH_LAENDER[land].gruppe)
    // Ein unbekanntes Land fällt auf den KMK-Rahmen zurück
    expect(sprechLand('XX')).toBe(KMK_SPRECHEN)
  })

  it('kennt Niedersachsen: Sprechprüfung ersetzt eine schriftliche Arbeit', () => {
    const ni = sprechLand('NI')
    expect(ni.ersatzSek1).toBe('pflicht')
    expect(sprechSetupFuer('NI', 10).ersetztArbeit).toBe(true)
  })

  it('rechnet Raster und Noten auf die Punkte des Teils', () => {
    const zeilen = rasterZeilen(sprechLand('NI').kriterien, 30)
    expect(zeilen.reduce((n, z) => n + z.punkte, 0)).toBe(30)
    expect(noteAusPunkten(30, 30)).toBe(1)
    expect(noteAusPunkten(0, 30)).toBe(6)
    const schluessel = punkteJeNote(30)
    expect(schluessel[0].ab).toBeGreaterThan(schluessel[3].ab)
    expect(schluessel[5].ab).toBe(0)
  })
})

// ---------- Erzeugung mit Attrappe
const satz = (n: number, gruppe: number) => ({
  thema: `Thema ${n}`,
  situation: `Your class is planning project day ${n}.`,
  karten: Array.from({ length: gruppe }, (_, i) => ({
    monologAufgabe: `Describe the picture ${n}-${i} and say what you think.`,
    monologPunkte: ['what you can see', 'why it matters', 'your opinion'],
    material:
      i === 1
        ? {
            art: 'diagramm',
            titel: 'Screen time',
            beschreibung: '',
            text: '',
            quelle: 'fiktive Daten',
            kopf: ['Age', 'Hours'],
            zeilen: [
              ['12', '3'],
              ['16', '5']
            ]
          }
        : {
            art: 'bild',
            titel: `Photo ${n}`,
            beschreibung: 'Jugendliche mit Smartphones im Park',
            text: '',
            quelle: '',
            kopf: [],
            zeilen: []
          },
    rolle: `Student ${i}`,
    rollenAufgabe: 'Convince your partner.',
    rollenPunkte: ['idea one', 'idea two']
  })),
  nachfragen: ['Why do you think so?', 'Can you give an example?'],
  erwartungMonolog: ['Bildbeschreibung'],
  erwartungDialog: ['Einigung']
})

const antwort = (saetze: number, gruppe: number) => ({
  einstieg: ['Tell us about your hobbies.', 'What do you do after school?'],
  saetze: Array.from({ length: saetze }, (_, i) => satz(i + 1, gruppe)),
  hinweise: ['Paare möglichst nicht nach Leistung zusammensetzen.']
})

const sprechExam = (gruppe: 2 | 3, kartensaetze: number, patch: Partial<Exam['meta']> = {}): Exam => {
  const e: Exam = {
    version: 1,
    design: presetDesigns()[0],
    parts: [],
    createdAt: '2026-10-01',
    meta: {
      title: '',
      subjectId: 'englisch',
      subjectLabel: 'Englisch',
      topic: 'Teenagers and social media',
      content: '',
      stateId: 'NI',
      schoolTypeId: 'gymnasium',
      schoolTypeName: 'Gymnasium',
      grade: 10,
      courseLevel: 'mixed',
      cefrLevel: 'B1',
      grammarTopic: '',
      vocab: [],
      infoBox: true,
      minutes: 90,
      points: 30,
      aids: 'keine',
      variants: 1,
      gradeScale: false,
      separateWritingGrade: true,
      answerKey: true,
      answerKeyDetail: 'ausfuehrlich',
      teacherNote: '',
      ...patch
    }
  }
  sprechpruefungAlsArbeit(e)
  e.parts[0] = {
    ...e.parts[0],
    sprechen: { ...e.parts[0].sprechen!, gruppe, kartensaetze }
  } as ExamPart
  return e
}

describe('Sprechprüfung in der Klassenarbeit (KI-Attrappe)', () => {
  it('legt die Sprechprüfung als einzigen Teil an, der die Arbeit ersetzt', () => {
    const e = sprechExam(2, 2)
    expect(e.parts).toHaveLength(1)
    expect(e.parts[0].formatId).toBe('en-speaking')
    expect(e.parts[0].sprechen?.ersetztArbeit).toBe(true)
    expect(e.meta.minutes).toBe(pruefungsdauer(e.parts[0].sprechen!))
  })

  it('bietet das Format in allen modernen Fremdsprachen an, nicht in Latein', () => {
    for (const id of ['englisch', 'franzoesisch', 'spanisch', 'italienisch', 'russisch']) {
      expect(
        formatsFor(id as never, 10, 'NI').some((f) => f.id.endsWith('-speaking')),
        id
      ).toBe(true)
    }
    expect(formatsFor('latein' as never, 10, 'NI').some((f) => f.id.endsWith('-speaking'))).toBe(false)
  })

  it('erzeugt Kartensätze mit Karten A/B, Prüferbogen und Raster je Prüfling', async () => {
    const anfragen: { schemaName: string; user: string }[] = []
    const ai = async <T>(req: { schemaName: string; user: string }): Promise<T> => {
      anfragen.push(req)
      return antwort(2, 2) as T
    }
    const fertig = await generateExam(sprechExam(2, 2), ai as never)
    expect(anfragen.map((a) => a.schemaName)).toEqual(['speaking_exam'])
    expect(anfragen[0].user).toMatch(/GENAU 2 gleichwertige Kartensätze mit je GENAU 2 Karten/)
    const teil = fertig.parts[0]
    expect(teil.sprechDaten?.saetze).toHaveLength(2)
    const titel = teil.blocks.map((b) => ('title' in b ? b.title : ''))
    expect(titel.filter((t) => /^Set \d/.test(t))).toHaveLength(2)
    expect(titel.filter((t) => /^Candidate A · Part 2/.test(t))).toHaveLength(2)
    expect(titel.filter((t) => /^Candidate B · Part 3/.test(t))).toHaveLength(2)
    expect(titel).toContain('Prüferbogen')
    expect(titel).toContain('Zeitplan')
    // Material: Bild als Platzhalter mit Suchbegriff, Statistik als Tabelle
    expect(teil.blocks.some((b) => b.type === 'image' && b.search === 'Jugendliche mit Smartphones im Park')).toBe(true)
    expect(teil.blocks.some((b) => b.type === 'table' && b.title.startsWith('Screen time'))).toBe(true)
    // Prüferbogen und Raster nur für die Lehrkraft
    const raster = teil.blocks.find((b) => b.type === 'table' && b.title.startsWith('Bewertungsraster'))
    expect(raster?.nurLoesung).toBe(true)
    if (raster?.type !== 'table') throw new Error('Raster fehlt')
    expect(raster.headers).toEqual(['Kriterium', 'volle Punktzahl, wenn …', 'max.', 'Prüfling A', 'Prüfling B'])
    const summe = raster.rows.slice(0, -2).reduce((n, r) => n + Number(r[2]), 0)
    expect(summe).toBe(teil.points)
    expect(teil.blocks.find((b) => 'title' in b && b.title === 'Teil 1 · Einstiegsfragen')?.nurLoesung).toBe(true)
    // Auf dem Blatt erscheinen die Karten; Prüferbogen ist Lösungsteil
    const blatt = examToWorksheet(fertig)
    expect(blatt.sheets[0].blocks.some((b) => 'title' in b && b.title === 'Prüferbogen')).toBe(true)
  })

  it('richtet Dreiergruppen mit drei Karten und drei Rasterspalten ein', async () => {
    const ai = async <T>(): Promise<T> => antwort(3, 3) as T
    const fertig = await generateExam(sprechExam(3, 3), ai as never)
    const teil = fertig.parts[0]
    expect(teil.sprechDaten?.saetze).toHaveLength(3)
    expect(teil.sprechDaten?.saetze[0].karten).toHaveLength(3)
    const raster = teil.blocks.find((b) => b.type === 'table' && b.title.startsWith('Bewertungsraster'))
    if (raster?.type !== 'table') throw new Error('Raster fehlt')
    expect(raster.headers.slice(-3)).toEqual(['Prüfling A', 'Prüfling B', 'Prüfling C'])
  })

  it('kürzt überzählige Sätze und Karten der KI auf die Vorgabe', () => {
    const d = normalisiereSprechDaten(antwort(4, 3), {
      ...sprechSetupFuer('NI', 10),
      gruppe: 2,
      kartensaetze: 2
    })
    expect(d.saetze).toHaveLength(2)
    expect(d.saetze.every((s) => s.karten.length === 2)).toBe(true)
  })

  it('nennt Kompetenzen, Zeiten und Material im Auftrag', () => {
    const e = sprechExam(2, 2)
    const text = sprechPrompt(e, e.parts[0])
    expect(text).toMatch(/zusammenhängendes monologisches Sprechen/)
    expect(text).toMatch(/an Gesprächen teilnehmen/)
    expect(text).toMatch(/Vorbereitung \d+ min/)
  })
})

describe('Arbeitsblatt zur Vorbereitung auf die Sprechprüfung', () => {
  const meta = (patch: Partial<WorksheetMeta>): WorksheetMeta => ({
    ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
    subjectId: 'englisch',
    subjectLabel: 'Englisch',
    topic: 'Teenagers and social media',
    grade: 10,
    cefrLevel: 'B1',
    ...patch
  })

  it('verlangt Übungskarten, Redemittel, Beobachtungsbogen und Musterdialog', () => {
    const text = sprechRegeln(meta({ skillFocus: 'interaction' }))
    expect(text).toMatch(/ÜBUNGSKARTEN \(Gespräch\)/)
    expect(text).toMatch(/"phrases"/)
    expect(text).toMatch(/Beobachtungsbogen/)
    expect(text).toMatch(/"selfCheck"/)
    expect(text).toMatch(/"audio"/)
  })

  it('lässt abgewählte Teile weg', () => {
    const text = sprechRegeln(meta({ skillFocus: 'speaking', sprechTeile: ['karten', 'redemittel'] }))
    expect(text).toMatch(/ÜBUNGSKARTEN \(Monolog\)/)
    expect(text).not.toMatch(/"audio"/)
    expect(brauchtMusterdialog(meta({ skillFocus: 'speaking', sprechTeile: ['karten'] }))).toBe(false)
  })

  it('schreibt den Musterdialog vorab als Hörtext mit zwei Stimmen', () => {
    const m = meta({ skillFocus: 'interaction', audioAi: false })
    expect(wantsListening(m)).toBe(true)
    expect(scriptPrompt(m)).toMatch(/GENAU ZWEI Sprechende/)
    expect(wantsListening(meta({ skillFocus: 'mixed', audioAi: false }))).toBe(false)
  })
})
