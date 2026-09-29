import { describe, expect, it } from 'vitest'
import { presetDesigns } from '@shared/design'
import { defaultExamMeta } from '../src/renderer/src/modules/klassenarbeit/model/defaults'
import { fachDerArbeit, eigeneTeilnoteLabel, type ExamSubjectId } from '../src/renderer/src/modules/klassenarbeit/model/faecher'
import { formatsFor, suggestParts, UEBERSETZUNGSANTEIL, writingWeightFor } from '../src/renderer/src/modules/klassenarbeit/model/formats'
import { fehlerSchluessel, fehlerZeile, grenzeFuerLand, noteFuerFehler } from '../src/renderer/src/modules/klassenarbeit/model/fehlerquote'
import { fachRegeln } from '../src/renderer/src/modules/klassenarbeit/generation/fachRegeln'
import { hinweise, schreibGrammatikRegeln, strukturenFuer, vorschlag, type SchreibGrammatik } from '../src/renderer/src/modules/klassenarbeit/didactics/schreibGrammatik'
import { examGrades, type Exam, type ExamPart } from '../src/renderer/src/modules/klassenarbeit/model/types'
import { examWarnings } from '../src/renderer/src/modules/klassenarbeit/model/examRules'
import { nachweisFuer } from '../src/renderer/src/modules/klassenarbeit/model/nachweise'

/*
 * Klassenarbeiten in allen Fächern (29.09.2026, Wunsch der Lehrkraft): neue Fächer, Latein mit
 * Fehlerquote, Mathematik Teil A, Befunde der Prüfung, Grammatik in Schreibaufgaben.
 */
const arbeit = (subjectId: ExamSubjectId, over: Partial<Exam['meta']> = {}, parts: Partial<ExamPart>[] = []): Exam =>
  ({
    version: 1,
    meta: { ...defaultExamMeta('NW', 'gymnasium', 'Gymnasium'), subjectId, subjectLabel: fachDerArbeit(subjectId).label, topic: 'Thema', grade: 8, ...over },
    parts: parts.map((p, i) => ({ id: `p${i}`, formatId: '', label: '', competence: '', weight: 50, points: 20, minutes: 30, gradeGroup: 'other', afbMix: {}, blocks: [], ...p })),
    design: presetDesigns()[0],
    createdAt: ''
  }) as unknown as Exam

describe('Fehlerquote Latein/Griechisch', () => {
  it('Grenze nach Land, Schlüssel linear bis „ausreichend"', () => {
    expect(grenzeFuerLand('NI')).toBe(15)
    expect(grenzeFuerLand('NW')).toBe(10)
    const q = { woerter: 100, grenzeAusreichend: 10 }
    expect(fehlerSchluessel(q).map((s) => s.bis)).toEqual([2.5, 5, 7.5, 10, 15])
    expect(noteFuerFehler(4, q)).toBe(2)
    expect(noteFuerFehler(16, q)).toBe(6)
    expect(fehlerZeile(q)).toMatch(/4 bis 10 F\./)
  })

  it('Aufbau 2 : 1 mit der Übersetzung als eigener Teilnote', () => {
    const teile = suggestParts('latein', 7, 20, 45)
    expect(teile[0]).toMatchObject({ formatId: 'la-uebersetzung', weight: UEBERSETZUNGSANTEIL, gradeGroup: 'writing', points: 0 })
    expect(teile.slice(1).every((t) => t.gradeGroup === 'other')).toBe(true)
    expect(eigeneTeilnoteLabel('latein')).toBe('Übersetzung')
    const e = arbeit('latein', {}, teile)
    expect(examGrades(e).map((g) => g.label)).toEqual(['Begleitaufgaben', 'Übersetzung'])
  })
})

describe('Neue Fächer', () => {
  it('Mathematik mit Teil A ohne Hilfsmittel; NaWi mit Versuchsteil; Russisch wie die übrigen Fremdsprachen', () => {
    expect(suggestParts('mathematik', 8, 40, 45).map((p) => p.formatId)).toContain('ma-basis')
    expect(formatsFor('chemie', 8).map((f) => f.id)).toEqual(expect.arrayContaining(['ch-experiment', 'ch-gleichung']))
    expect(formatsFor('russisch', 8).map((f) => f.id)).toContain('ru-writing')
  })

  it('Niedersachsen: keine isolierten Sprachmittel-Teile; Kl. 5 mit Hörverstehen (Befunde F2, F6)', () => {
    expect(formatsFor('englisch', 7, 'NI').some((f) => /-(language|grammar)$/.test(f.id))).toBe(false)
    expect(formatsFor('englisch', 7, 'NW').some((f) => f.id === 'en-language')).toBe(true)
    expect(suggestParts('englisch', 5, 40, 45, undefined, 'NI')[0].formatId).toBe('en-listening')
  })

  it('Schreibanteil der Fachschaft statt fest 60/70', () => {
    expect(writingWeightFor(5)).toBe(60)
    expect(writingWeightFor(8, { k5: 50, ab6: 60 })).toBe(60)
  })

  it('Fachregeln: Teil A, Fehlerquote, Einheiten, Landesregel Sprachrichtigkeit', () => {
    const ma = arbeit('mathematik', {}, [{ formatId: 'ma-basis' }, { formatId: 'ma-sachaufgabe' }])
    expect(fachRegeln(ma, ma.parts[0])).toMatch(/TEIL A OHNE HILFSMITTEL/)
    expect(fachRegeln(ma, ma.parts[1])).toMatch(/TEIL B MIT HILFSMITTELN/)
    const la = arbeit('latein', { stateId: 'NI' }, [{ formatId: 'la-uebersetzung', minutes: 30 }])
    expect(fachRegeln(la, la.parts[0])).toMatch(/points = 0/)
    expect(fachRegeln(la, la.parts[0])).toMatch(/bis 15 Fehler je 100 Wörter/)
    const ph = arbeit('physik', {}, [{ formatId: 'ph-rechnen' }])
    expect(fachRegeln(ph, ph.parts[0])).toMatch(/Einheiten/)
    const de = arbeit('deutsch', { stateId: 'NW' }, [{ formatId: 'de-textanalyse' }])
    expect(fachRegeln(de, de.parts[0])).toMatch(/Notenstufe/)
  })
})

describe('Grammatik in Schreibaufgaben', () => {
  it('Auswahl nur mit eingeführten bzw. bald eingeführten, produktiven Strukturen', () => {
    const liste = strukturenFuer(arbeit('englisch', { grade: 6 }).meta)
    expect(liste.some((x) => x.topic.id === 'en.verb.past_simple')).toBe(true)
    expect(liste.every((x) => !x.topic.receptive)).toBe(true)
  })

  it('Voreinstellung: NI als Erinnerung ohne eigene Punkte, Oberstufe Bandbreite, sonst Anzahl mit Kriterium', () => {
    expect(vorschlag(arbeit('englisch', { stateId: 'NI' }).meta)).toMatchObject({ modus: 'erinnerung', bewertung: 'integriert' })
    expect(vorschlag(arbeit('englisch', { grade: 12 }).meta).modus).toBe('bandbreite')
    expect(vorschlag(arbeit('englisch', { grade: 6 }).meta)).toMatchObject({ modus: 'anzahl', bewertung: 'kriterium' })
  })

  it('NI warnt vor eigenem Kriterium; der Auftrag nennt Muster in der Zielsprache und das Kriterium', () => {
    const ni = arbeit('englisch', { stateId: 'NI' }).meta
    expect(hinweise(ni, { themen: [], modus: 'anzahl', bewertung: 'kriterium' }).some((h) => h.warnung)).toBe(true)
    const e = arbeit('englisch', { grade: 6 }, [{ formatId: 'en-writing', grammatik: { themen: ['en.verb.past_simple'], modus: 'anzahl', anzahl: 3, bewertung: 'kriterium' } }])
    const r = schreibGrammatikRegeln(e, e.parts[0])
    expect(r).toMatch(/Use the simple past at least 3 times/)
    expect(r).toMatch(/Verwendung der geforderten Strukturen/)
    const fr = arbeit('franzoesisch', { grade: 8 }, [{ formatId: 'fr-writing', grammatik: { themen: [], frei: 'passé composé', modus: 'anzahl', anzahl: 2, bewertung: 'integriert' } }])
    expect(schreibGrammatikRegeln(fr, fr.parts[0])).toMatch(/Utilise le passé composé au moins 2 fois/)
  })
})

describe('Grammatik in Schreibaufgaben: Nachrecherche MV, RP, SL, SN, ST, TH', () => {
  const g: SchreibGrammatik = { themen: [], modus: 'anzahl', anzahl: 2, bewertung: 'kriterium' }
  const texte = (over: Partial<Exam['meta']>, einst: SchreibGrammatik = g): string => hinweise(arbeit('englisch', { grade: 7, ...over }).meta, einst).map((h) => h.text).join('\n')

  it('kein Land mehr ohne ausgewertete Regel', () => {
    for (const stateId of ['MV', 'RP', 'SL', 'SN', 'ST', 'TH']) expect(texte({ stateId })).not.toMatch(/keine ausgewertete Regel/)
  })

  it('MV: zwei Teilkompetenzen, Kriterium „Repertoire grammatischer … Strukturen", Fachkonferenz', () => {
    expect(texte({ stateId: 'MV' })).toMatch(/mindestens zwei Teilkompetenzen[\s\S]*Repertoire grammatischer und syntaktischer Strukturen[\s\S]*Fachkonferenz/)
  })

  it('RP: nicht isoliert, verknüpft mit einer Kompetenz; Mut zur anspruchsvollen Sprachgestaltung', () => {
    expect(texte({ stateId: 'RP' })).toMatch(/nicht isoliert, sondern verknüpft mit einer Kompetenz[\s\S]*anspruchsvollen Sprachgestaltung/)
  })

  it('SL: anwendungsbezogen; Gymnasium Englisch mit Bandbreite und Gewichtung 25 : 75 bis 40 : 60, ab Kl. 9 Voreinstellung Bandbreite', () => {
    expect(texte({ stateId: 'SL' })).toMatch(/nicht isoliert, sondern anwendungsbezogen/)
    expect(texte({ stateId: 'SL', grade: 8 })).toMatch(/25 : 75 bei gelenkten bis 40 : 60/)
    expect(texte({ stateId: 'SL', grade: 10 })).toMatch(/Inhalt : Sprache 40 : 60/)
    expect(texte({ stateId: 'SL', grade: 10, schoolTypeId: 'gemeinschaftsschule' })).not.toMatch(/40 : 60/)
    expect(vorschlag(arbeit('englisch', { stateId: 'SL', grade: 9, languageOrder: 2 }).meta)).toMatchObject({ modus: 'bandbreite', bewertung: 'integriert' })
    expect(vorschlag(arbeit('englisch', { stateId: 'NW', grade: 9, languageOrder: 2 }).meta).modus).toBe('anzahl')
  })

  it('SN: Kommunikationsfähigkeit oberstes Kriterium; Matrix mit „Strukturen" und „Sprachliche Korrektheit"', () => {
    expect(texte({ stateId: 'SN' })).toMatch(/oberste Kriterium[\s\S]*„Strukturen"[\s\S]*„Sprachliche Korrektheit"/)
  })

  it('ST: zentrale Klassenarbeit Kl. 6 mit Inhalt : Sprache 5 : 5 und „Language in Use"; bei Anzahl Hinweis auf Erinnerung', () => {
    expect(texte({ stateId: 'ST' })).toMatch(/Content 5 BE, Language 5 BE[\s\S]*Language in Use/)
    expect(texte({ stateId: 'ST' })).toMatch(/Als Erinnerung/)
    expect(texte({ stateId: 'ST' }, { ...g, modus: 'erinnerung' })).not.toMatch(/statt eine Anzahl/)
  })

  it('TH: Grammatik im Kontext, Kriterien je grammatischem Phänomen (Lehrpläne 2026)', () => {
    expect(texte({ stateId: 'TH' })).toMatch(/nicht isoliert, sondern im Kontext[\s\S]*grammatischen Phänomens/)
  })

  it('Landeshinweise ohne Anrede und ohne Warnung', () => {
    for (const stateId of ['MV', 'RP', 'SL', 'SN', 'ST', 'TH']) {
      const hs = hinweise(arbeit('englisch', { grade: 7, stateId }).meta, g)
      expect(hs.some((h) => h.warnung)).toBe(false)
      expect(hs.map((h) => h.text).join(' ')).not.toMatch(/\b(du|dein|Sie|Ihre)\b/)
    }
  })
})

describe('Nachträge 29.09.: Sprachmittel nicht isoliert, bayerische Ausbildungsrichtung', () => {
  it('RP, SL und TH bieten wie NI keine isolierten Grammatik-/Sprachmittelteile an; ältere Arbeiten warnen', () => {
    for (const land of ['NI', 'RP', 'SL', 'TH']) {
      expect(formatsFor('englisch', 7, land).some((f) => /-(language|grammar)$/.test(f.id))).toBe(false)
    }
    expect(formatsFor('englisch', 7, 'BW').some((f) => /-(language|grammar)$/.test(f.id))).toBe(true)
    expect(examWarnings('SL', 'englisch', 7, ['en-language'], 'gymnasium').join(' ')).toMatch(/Im Saarland .*nicht isoliert/)
    expect(examWarnings('RP', 'franzoesisch', 7, ['fr-grammar'], 'gymnasium').join(' ')).toMatch(/In Rheinland-Pfalz/)
  })

  it('Bayern, Gymnasium: mit Ausbildungsrichtung eindeutig Schulaufgabe bzw. Kurzarbeit', () => {
    const anfrage = { stateId: 'BY', schoolTypeId: 'gymnasium', subjectId: 'chemie', grade: 9 }
    expect(nachweisFuer(anfrage).anzahl).toMatch(/am NTG/)
    expect(nachweisFuer({ ...anfrage, ausbildungsrichtung: 'NTG' }).bezeichnung).toBe('Schulaufgabe')
    const sg = nachweisFuer({ ...anfrage, ausbildungsrichtung: 'SG' })
    expect(sg).toMatchObject({ bezeichnung: 'Kurzarbeit', keineKlassenarbeit: true })
    expect(sg.hinweis).toMatch(/Ausbildungsrichtung SG/)
    expect(nachweisFuer({ ...anfrage, subjectId: 'musik', grade: 6, ausbildungsrichtung: 'MuG' }).bezeichnung).toBe('Schulaufgabe')
  })
})
