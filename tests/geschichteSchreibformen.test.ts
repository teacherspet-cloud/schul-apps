import { describe, expect, it } from 'vitest'
import {
  ausgangstextAusMaterial,
  fehlerImBefund,
  findeIchForm,
  findeZeilenangaben,
  findeZitate,
  geschichteErzeugungsRegeln,
  geschichteFeedbackBaustein,
  geschichtsStufe,
  istGeschichte,
  konjunktivBefund,
  landesOperator,
  pruefeBeurteilung,
  pruefeZusammenfassung,
  schreibformenIn,
  trenneEinleitung,
  zaehleWoerter
} from '../src/shared/operatoren/geschichteSchreibformen'
import { anweisungenAusGrundlage, ausgangstextAusGrundlage } from '../src/renderer/src/modules/rueckmeldung/generation'
import { kiAnfrage } from '../src/renderer/src/modules/onlinetest/kiBewertung'

const ORIGINAL = Array.from({ length: 30 }, (_, i) => `Satz ${i + 1} des Originals berichtet über die Lage im Reich.`).join(' ') // 30 × 9 = 270 Wörter

const EINLEITUNG =
  'Die Rede „Über den Krieg" von Wilhelm II., gehalten am 6. August 1914 in Berlin, ist eine politische Rede, die sich an die Bevölkerung mit der Absicht richtet, sie zu mobilisieren. Sie behandelt das Thema Kriegsbeginn.'

describe('Geschichte: Erkennung und Stufen', () => {
  it('erkennt die beiden Operatoren, aber nicht „bewerten"', () => {
    expect(schreibformenIn('Fasse die Rede M1 zusammen.')).toEqual(['zusammenfassen'])
    expect(schreibformenIn('Fassen Sie den Text M2 zusammen.')).toEqual(['zusammenfassen'])
    expect(schreibformenIn('Beurteilen Sie, inwieweit es sich um eine Revolution handelt.')).toEqual(['beurteilen'])
    expect(schreibformenIn('Beurteile, ob der Vertrag gerecht war.')).toEqual(['beurteilen'])
    expect(schreibformenIn('Bewerten Sie die Entscheidung.')).toEqual([])
    expect(schreibformenIn('Beschreibe das Bild.')).toEqual([])
  })
  it('Fach und Stufe', () => {
    expect(istGeschichte('geschichte')).toBe(true)
    expect(istGeschichte('Geschichte')).toBe(true)
    expect(istGeschichte('Politik')).toBe(false)
    expect(geschichtsStufe(5)).toBe('kl56')
    expect(geschichtsStufe(8)).toBe('kl78')
    expect(geschichtsStufe(10)).toBe('kl910')
    expect(geschichtsStufe(10, true)).toBe('sek2')
    expect(geschichtsStufe(12)).toBe('sek2')
  })
})

describe('Geschichte: Vorprüfungen', () => {
  it('zählt Wörter ohne Satzzeichen', () => {
    expect(zaehleWoerter('Der Krieg sei – so der Autor – unvermeidlich.')).toBe(7)
  })
  it('findet Zeilenangaben in allen üblichen Formen', () => {
    expect(findeZeilenangaben('Er nennt Gründe (Z. 3–5), vgl. Z. 12 f. und Zeile 4 sowie Zl.7.')).toHaveLength(4)
    expect(findeZeilenangaben('Im Jahr 1914 begann der Krieg.')).toHaveLength(0)
  })
  it('findet Zitate in deutschen und geraden Anführungszeichen', () => {
    const z = findeZitate('Er spricht von „einem Platz an der Sonne" und "Blut und Eisen".')
    expect(z.map((x) => x.zitat)).toEqual(['einem Platz an der Sonne', 'Blut und Eisen'])
  })
  it('Ich-Form außerhalb von Zitaten, „er meine" ist kein Ich', () => {
    expect(findeIchForm('Ich finde, dass die Revolution scheiterte.')).toEqual(['Ich'])
    expect(findeIchForm('Der Kaiser erklärt: „Ich kenne keine Parteien mehr."')).toEqual([])
    expect(findeIchForm('Er meine, die Lage sei ernst.')).toEqual([])
  })
  it('Konjunktiv und Redeeinleitung mit Indikativ', () => {
    const k = konjunktivBefund('Der Krieg sei unvermeidlich gewesen. Der Autor betont, dass Deutschland bedroht ist. Russland habe zuerst mobilisiert.')
    expect(k.saetze).toBe(3)
    expect(k.konjunktiv).toBe(2)
    expect(k.redeeinleitungIndikativ).toBe(1)
    expect(k.beispiele[0]).toContain('betont, dass')
  })
  it('trennt die ATTIKA-Einleitung ab', () => {
    const t = trenneEinleitung(`${EINLEITUNG}\n\nDer Kaiser betont, das Reich sei angegriffen worden.`)
    expect(t.erkannt).toBe(true)
    expect(t.rest).toBe('Der Kaiser betont, das Reich sei angegriffen worden.')
  })
  it('Zusammenfassung: Länge in Prozent des Originals, Zitat und Zeilenangabe als Fehler ab Kl. 7/8', () => {
    const haupt = Array.from({ length: 10 }, () => 'Der Kaiser betont, das Reich sei bedroht.').join(' ') // 70 Wörter = 26 %
    const b = pruefeZusammenfassung(`${EINLEITUNG}\n\n${haupt} Er spricht von „Feinden ringsum im Land" (Z. 4).`, 'sek2', ORIGINAL)
    expect(b.originalWoerter).toBe(270)
    expect(b.laenge).toBe('passend')
    expect(b.zitate).toEqual(['Feinden ringsum im Land'])
    expect(b.zeilenangaben).toEqual(['(Z. 4)'])
    expect(b.attika.intention).toBe(true)
    expect(fehlerImBefund(b)).toEqual(['1 Zitat(e)', '1 Zeilenangabe(n)'])
    expect(fehlerImBefund({ ...b, stufe: 'kl56' })).toEqual([])
  })
  it('Zusammenfassung zu lang', () => {
    const b = pruefeZusammenfassung(ORIGINAL.replace(/Originals/g, 'Textes'), 'kl910', ORIGINAL)
    expect(b.laenge).toBe('zu lang')
  })
  it('Material mit Zeilenmarken: der in der Anweisung genannte Block', () => {
    const material = 'M1\nZ. 1: Erster Text eins\nZ. 2: zwei\n\nM2\nZ. 1: Zweiter Text'
    expect(ausgangstextAusMaterial(material, 'Fasse M2 zusammen.')).toBe('Zweiter Text')
    expect(ausgangstextAusMaterial(material, 'Fasse den Text zusammen.')).toBeNull()
    expect(ausgangstextAusMaterial('M1\nZ. 1: Nur einer', '')).toBe('Nur einer')
  })
  it('Beurteilung: Aufbau, Belege, Fazit, Ich-Form', () => {
    const text = [
      'Die Revolution von 1905 war nur teilweise eine Revolution.',
      'Unter einer Revolution versteht man nach Wende den Sturz alter Eliten; Kriterien sind Gewalt von unten und rascher Wandel.',
      'Für eine Revolution spricht der Generalstreik (vgl. Z. 3–5). Der Zar sprach von „einem […] Aufruhr" (Z. 8). Ich finde das wichtig.',
      'Insgesamt war 1905 zwar eine Revolution von unten, jedoch blieben die alten Eliten an der Macht.'
    ].join('\n\n')
    const b = pruefeBeurteilung(text, 'sek2')
    expect(b.absaetze).toBe(4)
    expect(b.vorwegSignal).toBe(true)
    expect(b.kriterienAbsatz).toBe(2)
    expect(b.vglAngaben).toBe(1)
    expect(b.zitateOhneBeleg).toEqual([])
    expect(b.fazitSignal).toBe(true)
    expect(b.differenziert).toBe(true)
    expect(b.gemeinsameKernwoerter.length).toBeGreaterThan(0)
    expect(fehlerImBefund(b)).toEqual(['Ich-Form'])
    expect(fehlerImBefund({ ...b, stufe: 'kl78' })).toEqual([])
  })
})

describe('Geschichte: Bausteine', () => {
  it('Feedback-Baustein nur für Geschichte mit passendem Operator, mit Befund als Fakten', () => {
    expect(geschichteFeedbackBaustein({ fach: 'politik', anweisung: 'Fasse M1 zusammen.', antwort: 'x' })).toBeNull()
    expect(geschichteFeedbackBaustein({ fach: 'geschichte', anweisung: 'Beschreibe M1.', antwort: 'x' })).toBeNull()
    const b = geschichteFeedbackBaustein({
      fach: 'Geschichte',
      anweisung: 'Fassen Sie die Rede M1 zusammen.',
      antwort: `${EINLEITUNG}\n\nDer Autor betont, dass Deutschland bedroht ist.`,
      jahrgang: 12,
      stateId: 'NI',
      original: ORIGINAL
    })!
    expect(b.stufe).toBe('sek2')
    expect(b.text).toContain('ATTIKA')
    expect(b.text).toContain('Der Krieg sei unvermeidlich gewesen.')
    expect(b.text).toContain('BEFUND DER APP')
    expect(b.text).toContain('270 Wörter')
    expect(b.text).toContain('Sie-Form')
  })
  it('Sek I: Kriterien der Stufe, keine Sek-II-Strenge', () => {
    const b = geschichteFeedbackBaustein({
      fach: 'geschichte',
      anweisung: 'Beurteile, ob …',
      antwort: 'Ich finde, dass es gut war, weil alle froh waren.',
      jahrgang: 6
    })!
    expect(b.text).toContain('Kl. 5/6')
    expect(b.text).toContain('in Ordnung')
    expect(b.fehler).toEqual([])
  })
  it('Erzeugungsregeln: Hilfen nehmen ab, in Prüfungen keine', () => {
    const k56 = geschichteErzeugungsRegeln({ stufe: 'kl56' })
    const s2 = geschichteErzeugungsRegeln({ stufe: 'sek2', stateId: 'BW' })
    const pruef = geschichteErzeugungsRegeln({ stufe: 'kl78', pruefung: true })
    expect(k56).toContain('Wer?')
    expect(s2).toContain('Wende')
    expect(s2).toContain('keine Satzanfänge')
    expect(pruef).not.toContain('Hilfen zu')
  })
  it('Rückmeldung: Anweisungen und Ausgangstext aus der Grundlage (Format describeSheet)', () => {
    const g =
      '(1) Lernziele: x\n\n(2) Text „Rede des Kaisers“: Der Kaiser spricht zum Volk. | Worterklärungen: Volk\n\n(3) Aufgabe ★★ [AFB I, zusammenfassen, EA, 10 Min.]: Fasse die Rede M1 zusammen.'
    expect(anweisungenAusGrundlage(g)).toEqual(['Fasse die Rede M1 zusammen.'])
    expect(ausgangstextAusGrundlage(g)).toBe('Der Kaiser spricht zum Volk.')
  })
  it('Onlinetest: Vorgaben einmal, Befund je Fall', () => {
    const req = kiAnfrage('', 'Klasse 8', [{ id: 'A1', frage: 'Fasse M1 zusammen.', erwartung: '', antwort: 'Er nennt Gründe (Z. 3).' }], {
      art: 'Test',
      fach: 'Geschichte'
    })
    expect(req.system).toContain('Kl. 7/8')
    expect(req.user).toContain('Zeilenangaben: „(Z. 3)"')
    const ohne = kiAnfrage('', '', [{ id: 'A1', frage: 'Fasse M1 zusammen.', erwartung: '', antwort: 'x' }], { art: 'Test', fach: 'Politik' })
    expect(ohne.system).not.toContain('GESCHICHTE')
  })
  it('Landesdefinition mit abweichendem AFB (Hessen: zusammenfassen I–II)', () => {
    const l = landesOperator('zusammenfassen', 'HE', 'sek2')
    expect(l?.afb).toBe('I–II')
    expect(l?.abweichend).toBe(true)
    expect(landesOperator('beurteilen', 'NI', 'sek2')?.abweichend).toBe(false)
  })
})
