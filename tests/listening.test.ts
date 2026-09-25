import { describe, expect, it } from 'vitest'
import {
  LISTENING_FORMATS,
  listeningFormatById,
  listeningFormatsFor,
  listeningCount,
  listeningRules,
  listeningSeconds,
  listeningWords,
  suggestListeningFormat
} from '../src/renderer/src/modules/arbeitsblatt/didactics/listeningFormats'
import {
  competenceNameFor,
  hasStateRules,
  KMK_BASELINE,
  LISTENING_STATES,
  listeningStateRules,
  listeningStateRulesText
} from '../src/renderer/src/modules/arbeitsblatt/didactics/listeningStates'
import { checkListening } from '../src/renderer/src/modules/arbeitsblatt/didactics/integrity'
import { audioTagRules, scriptForSheet, scriptPrompt, wantsListening } from '../src/renderer/src/modules/arbeitsblatt/generation/listening'
import { listeningTextRules, systemPrompt } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { profileFromMeta } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { WorksheetMeta } from '../src/renderer/src/modules/arbeitsblatt/model/types'

const meta = (patch: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'englisch',
  subjectLabel: 'Englisch',
  topic: 'A school trip to York',
  grade: 8,
  cefrLevel: 'A2',
  skillFocus: 'listening',
  ...patch
})

describe('Hörtextsorten', () => {
  it('beschreibt jede Textsorte vollständig', () => {
    for (const f of LISTENING_FORMATS) {
      expect(f.label.length).toBeGreaterThan(3)
      expect(f.english.length).toBeGreaterThan(3)
      expect(f.purposes.length).toBeGreaterThan(0)
      expect(f.construction.length).toBeGreaterThan(30)
      expect(f.seconds[0]).toBeLessThan(f.seconds[1])
      // Keine Hörvorlage länger als fünf Minuten (KMK Abitur 2012, NRW, MV, SH)
      expect(f.seconds[1]).toBeLessThanOrEqual(300)
      expect(f.speakers[0]).toBeLessThanOrEqual(f.speakers[1])
    }
  })

  it('gibt Textsorten erst ab dem belegten Niveau frei', () => {
    const a1 = listeningFormatsFor('A1').map((f) => f.id)
    // Mailbox und Durchsage sind A1-Deskriptoren des GER
    expect(a1).toContain('voicemail')
    expect(a1).toContain('announcement')
    // Der GER kennt für Vorträge erst ab B1 Deskriptoren
    expect(a1).not.toContain('talk')
    expect(listeningFormatsFor('A2').map((f) => f.id)).not.toContain('talk')
    expect(listeningFormatsFor('B1').map((f) => f.id)).toContain('talk')
    // Diskussion und Reportage erst ab B2
    expect(listeningFormatsFor('B1').map((f) => f.id)).not.toContain('discussion')
    expect(listeningFormatsFor('B2').map((f) => f.id)).toContain('discussion')
  })

  it('staffelt Länge, Tempo, Sprecher und Items nach Niveau', () => {
    const levels = ['A1', 'A2', 'B1', 'B2', 'C1'] as const
    for (let i = 1; i < levels.length; i++) {
      const vorher = listeningRules(levels[i - 1])
      const jetzt = listeningRules(levels[i])
      expect(jetzt.seconds[1]).toBeGreaterThanOrEqual(vorher.seconds[1])
      expect(jetzt.wpm[0]).toBeGreaterThanOrEqual(vorher.wpm[0])
      expect(jetzt.items[1]).toBeGreaterThanOrEqual(vorher.items[1])
    }
    // Zwei Durchgänge sind der Standard (KMK, NRW, Cambridge, DELF, Goethe)
    for (const l of levels) expect(listeningRules(l).plays).toBe(2)
    // Auf den unteren Stufen keine Verzögerungslaute und keine Störgeräusche
    expect(listeningRules('A1').hesitations).toBe('keine')
    expect(listeningRules('A1').noise).toBe('keine')
  })

  it('rechnet die Dauer in eine Zielwortzahl um – romanische Sprachen brauchen mehr Wörter', () => {
    const [enMin, enMax] = listeningWords('B1')
    expect(enMin).toBeLessThan(enMax)
    // 90–180 s bei rund 130 WpM
    expect(enMin).toBeGreaterThan(150)
    expect(enMax).toBeLessThan(450)
    expect(listeningWords('B1', 'fr')[1]).toBeGreaterThan(enMax)
  })

  it('schlägt ohne eigene Wahl eine Textsorte des Niveaus vor', () => {
    for (const seed of [0, 3, 7, 11]) {
      const f = suggestListeningFormat('A2', seed)
      expect(listeningFormatsFor('A2').map((x) => x.id)).toContain(f.id)
    }
  })
})

describe('Auftrag für den Hörtext', () => {
  it('schreibt Textsorte, Länge, Sprecher und Durchgänge in den Auftrag', () => {
    const rules = listeningTextRules(meta({ audioFormat: 'phone-call' }))
    expect(rules).toContain('Telefongespräch')
    expect(rules).toContain(listeningFormatById('phone-call')!.construction.slice(0, 30))
    expect(rules).toContain('45 bis 90 Sekunden')
    expect(rules).toContain('plays = 2')
    // Vorentlastung darf keine Lösung vorwegnehmen (QUA-LiS NRW)
    expect(rules).toContain('KEINE Information vorweg')
    // Zahlen müssen für die Vertonung ausgeschrieben werden
    expect(rules).toContain('half past seven')
  })

  it('lässt der KI die Wahl, wenn „automatisch“ eingestellt ist', () => {
    const rules = listeningTextRules(meta({ audioFormat: 'auto' }))
    expect(rules).toContain('Wähle eine')
    expect(rules).toContain('Nachricht auf der Mailbox')
    // Auf A2 wird kein Vortrag angeboten
    expect(rules).not.toContain('Vorlesung')
  })

  it('erzeugt den Hörtext nur bei Fremdsprachen und eingeschalteter Option', () => {
    expect(wantsListening(meta({ audioAi: true }))).toBe(true)
    expect(wantsListening(meta({ audioAi: false }))).toBe(false)
    expect(wantsListening(meta({ audioAi: true, subjectId: 'biologie', subjectLabel: 'Biologie' }))).toBe(false)
  })

  it('verlangt ein vorlesbares Skript ohne Regieanweisungen', () => {
    const prompt = scriptPrompt(meta({ audioAi: true, audioFormat: 'interview' }))
    expect(prompt).toContain('A school trip to York')
    expect(prompt).toContain('Keine Regieanweisungen')
    expect(prompt).toContain('Namen und einem Doppelpunkt')
    expect(prompt).toContain('NUR um den Hörtext')
  })

  it('gibt das fertige Skript als unveränderliche Grundlage weiter', () => {
    const block = scriptForSheet({
      title: 'A call from York',
      textType: 'Telefongespräch',
      transcript: 'Anna: Hi Tom.\nTom: Hello!',
      speakers: ['Anna', 'Tom'],
      beforeListening: 'Zwei Freunde telefonieren.',
      plays: 2
    })
    expect(block).toContain('WÖRTLICH')
    expect(block).toContain('Anna: Hi Tom.')
    expect(block).toContain('plays = 2')
    expect(block).toContain('Erfinde keine weiteren Hörtexte; es sind genau 1')
    // Ohne Skript bleibt der Abschnitt leer
    expect(scriptForSheet(null)).toBe('')
  })
})

describe('Vorgaben der Bundesländer', () => {
  it('kennt für NRW und Bremen eigene Vorgaben, sonst den KMK-Rahmen', () => {
    expect(hasStateRules('NW')).toBe(true)
    expect(hasStateRules('HB')).toBe(true)
    expect(hasStateRules('XX')).toBe(false)
    expect(listeningStateRules('XX')).toBe(KMK_BASELINE)
    expect(listeningStateRules(undefined).competenceName).toBe('Hör- und Hörsehverstehen')
  })

  it('nennt den Kompetenzbereich so, wie das Land ihn nennt', () => {
    expect(listeningStateRules('NW').competenceName).toBe('Hör-/Hörsehverstehen')
    expect(listeningStateRules('NW').curriculum).toBe('Kernlehrplan')
    expect(listeningStateRules('HB').curriculum).toBe('Bildungsplan')
  })

  it('unterscheidet Richtig/Falsch nach Land UND Stufe', () => {
    // Bremen: im MSA ausdrücklich erlaubt, im Abitur ausdrücklich ausgeschlossen
    expect(listeningStateRules('HB').sek1.trueFalse).toBe(true)
    expect(listeningStateRules('HB').sek2.trueFalse).toBe(false)
    // NRW: in der ZP10-Formatliste nicht enthalten, im Abitur ausgeschlossen
    expect(listeningStateRules('NW').sek1.trueFalse).toBe(false)
    expect(listeningStateRules('NW').sek2.trueFalse).toBe(false)
  })

  it('schreibt die Landesvorgabe in den Auftrag', () => {
    const nrwSek2 = listeningStateRulesText('NW', 'sek2')
    expect(nrwSek2).toContain('Hör-/Hörsehverstehen')
    expect(nrwSek2).toContain('KEINE Richtig/Falsch-Aufgaben')
    expect(nrwSek2).toContain('5 Minuten')
    expect(nrwSek2).toContain('10 Minuten')
    const hbSek1 = listeningStateRulesText('HB', 'sek1')
    expect(hbSek1).toContain('Richtig/Falsch-Aufgaben sind hier zugelassen')
  })

  it('hält fest, dass Hörverstehen in NRW in die Klassenarbeit muss – in Bremen nicht', () => {
    expect(listeningStateRules('NW').sek1.requiredInTests).toBe(true)
    expect(listeningStateRules('HB').sek1.requiredInTests).toBe(false)
  })

  it('belegt jedes hinterlegte Land mit Quellen und nennt zwei Hördurchgänge', () => {
    for (const [id, rules] of Object.entries(LISTENING_STATES)) {
      expect(rules.sources.length, id).toBeGreaterThan(0)
      expect(rules.sek1.plays, id).toBe(2)
      expect(rules.sek2.plays, id).toBe(2)
      expect(rules.sek1.note.length, id).toBeGreaterThan(40)
      if (rules.sek2.maxSeconds) expect(rules.sek2.maxSeconds, id).toBeLessThanOrEqual(300)
    }
  })

  it('nimmt die Landesvorgabe in die Hörtext-Regeln des Blattes auf', () => {
    const rules = listeningTextRules(meta({ stateId: 'NW', grade: 12, schoolTypeId: 'gymnasium', cefrLevel: 'B2' }))
    expect(rules).toContain('Hör-/Hörsehverstehen')
    expect(rules).toContain('KEINE Richtig/Falsch-Aufgaben')
  })
})

describe('Besonderheiten einzelner Länder', () => {
  it('weiß, wo Hörverstehen NICHT zum schriftlichen Abitur gehört', () => {
    // Berlin und Brandenburg prüfen Leseverstehen, Schreiben und Sprachmittlung
    expect(listeningStateRules('BE').sek2.requiredInAbitur).toBe(false)
    expect(listeningStateRules('BB').sek2.requiredInAbitur).toBe(false)
    // Schleswig-Holstein setzt je Jahrgang zwei Zusatzkompetenzen – 2027–2029 ohne Hörverstehen
    expect(listeningStateRules('SH').sek2.requiredInAbitur).toBe(false)
    expect(listeningStateRules('SH').sek2.note).toContain('kein fester Prüfungsteil')
    // und sagt es im Auftrag, damit das Blatt sich nicht als Prüfungsvorbereitung ausgibt
    expect(listeningStateRulesText('BE', 'sek2')).toContain('kein Teil der schriftlichen Abiturprüfung')
    expect(listeningStateRulesText('NI', 'sek2')).not.toContain('kein Teil der schriftlichen Abiturprüfung')
  })

  it('nennt in Niedersachsen je Schulform die richtige Bezeichnung', () => {
    const ni = listeningStateRules('NI')
    expect(competenceNameFor(ni, 'gymnasium')).toBe('Hör- und Hör-/Sehverstehen')
    expect(competenceNameFor(ni, 'oberschule')).toBe('Hörverstehen und audiovisuelles Verstehen')
    expect(listeningStateRulesText('NI', 'sek1', 'oberschule')).toContain('audiovisuelles Verstehen')
    // Länder mit nur einer Bezeichnung liefern sie für jede Schulform
    expect(competenceNameFor(listeningStateRules('NW'), 'realschule')).toBe('Hör-/Hörsehverstehen')
  })

  it('kennt die Länder, in denen Hörverstehen in die Klassenarbeit gehört', () => {
    const pflicht = Object.entries(LISTENING_STATES)
      .filter(([, r]) => r.sek1.requiredInTests)
      .map(([id]) => id)
      .sort()
    expect(pflicht).toEqual(['BY', 'MV', 'NI', 'NW', 'SH'])
  })

  it('verbietet Richtig/Falsch überall dort, wo es amtlich ausgeschlossen ist', () => {
    for (const id of ['MV', 'NI', 'NW', 'ST']) {
      expect(listeningStateRules(id).sek2.trueFalse, id).toBe(false)
      expect(listeningStateRulesText(id, 'sek2'), id).toContain('KEINE Richtig/Falsch-Aufgaben')
    }
    // Hamburg regelt es nicht – dort bleibt es zugelassen
    expect(listeningStateRules('HH').sek2.trueFalse).toBe(true)
  })

  it('hält für jedes Land Quellen und eine erklärende Notiz bereit', () => {
    expect(Object.keys(LISTENING_STATES).length).toBe(15)
    for (const [id, rules] of Object.entries(LISTENING_STATES)) {
      expect(rules.sources.length, id).toBeGreaterThan(0)
      expect(rules.sek2.note.length, id).toBeGreaterThan(40)
      expect(rules.curriculum.length, id).toBeGreaterThan(3)
    }
  })
})

describe('Lücken und Sonderfälle der Länderrecherche', () => {
  it('behauptet nichts, wo die Vorgabe nicht zu ermitteln war', () => {
    // Hessen, Sachsen und Thüringen: Abiturvorgaben nicht öffentlich zugänglich
    for (const id of ['HE', 'SN', 'TH']) {
      expect(listeningStateRules(id).sek2.requiredInAbitur, id).toBeUndefined()
      // Kein Hinweis „kein Teil der Abiturprüfung“ – das wäre eine Behauptung
      expect(listeningStateRulesText(id, 'sek2'), id).not.toContain('kein Teil der schriftlichen Abiturprüfung')
      expect(listeningStateRules(id).sek2.note, id).toMatch(/nicht (belegen|ermitteln|klären)|nicht einsehen/)
    }
    // Rheinland-Pfalz ist gar nicht hinterlegt und fällt auf den KMK-Rahmen zurück
    expect(hasStateRules('RP')).toBe(false)
    expect(listeningStateRules('RP')).toBe(KMK_BASELINE)
  })

  it('kennt das Saarland als Land ohne Hörverstehen im schriftlichen Abitur', () => {
    expect(listeningStateRules('SL').sek2.requiredInAbitur).toBe(false)
    expect(listeningStateRulesText('SL', 'sek2')).toContain('kein Teil der schriftlichen Abiturprüfung')
    // und als einziges Land, das Richtig/Falsch wörtlich zulässt
    expect(listeningStateRules('SL').sek2.trueFalse).toBe(true)
  })

  it('übernimmt Sachsens abweichende Terminologie', () => {
    // Sachsen kennt keinen Bereich „Hörverstehen“, sondern „mündlich – Rezeption“
    expect(listeningStateRules('SN').competenceName).toBe('mündliche Rezeption')
    expect(listeningStateRulesText('SN', 'sek1')).toContain('mündliche Rezeption')
  })

  it('nennt in Saarland und Hessen je Stufe die richtige Bezeichnung', () => {
    const sl = listeningStateRules('SL')
    expect(competenceNameFor(sl, 'gymnasium', 'sek1')).toBe('Hörverstehen und audiovisuelles Verstehen')
    expect(competenceNameFor(sl, 'gymnasium', 'sek2')).toBe('Hör-/Hörsehverstehen')
    expect(competenceNameFor(listeningStateRules('HE'), 'gymnasium', 'sek2')).toBe('Hör-/Hörsehverstehen')
  })

  it('hält die belegten Abitur-Eckwerte der Länder fest', () => {
    // Bayern: seit Abitur 2026, alle Hörtexte zusammen acht bis zehn Minuten
    expect(listeningStateRules('BY').sek2.since).toBe(2026)
    expect(listeningStateRules('BY').sek2.maxSecondsTotal).toBe(600)
    expect(listeningStateRules('BY').sek2.texts).toEqual([2, 4])
    // 20 Prozent sind der gemeinsame Wert der Länder mit Hörverstehensteil
    for (const id of ['BW', 'BY', 'HB', 'HH', 'MV', 'NI', 'NW']) {
      expect(listeningStateRules(id).sek2.share, id).toBe(20)
    }
  })
})

describe('Kompetenzschwerpunkt erreicht die KI', () => {
  it('schreibt den Schwerpunkt Hörverstehen in den Auftrag', () => {
    const profile = profileFromMeta(meta({ skillFocus: 'listening' }))
    const prompt = systemPrompt(meta({ skillFocus: 'listening' }), profile)
    // Ohne diese Zeile entstanden Blätter ganz ohne Hörtext
    expect(prompt).toContain('SCHWERPUNKT HÖRVERSTEHEN')
    expect(prompt).toContain('audio')
  })

  it('schreibt den Schwerpunkt Vokabeln in den Auftrag', () => {
    const m = meta({ skillFocus: 'vocabulary' })
    const prompt = systemPrompt(m, profileFromMeta(m))
    expect(prompt).toContain('SCHWERPUNKT VOKABELN')
    expect(prompt).toContain('Zielwörter')
  })

  it('lässt den Auftrag bei gemischtem Schwerpunkt unberührt', () => {
    const m = meta({ skillFocus: 'mixed' })
    const prompt = systemPrompt(m, profileFromMeta(m))
    expect(prompt).not.toContain('SCHWERPUNKT HÖRVERSTEHEN')
    expect(prompt).not.toContain('SCHWERPUNKT VOKABELN')
  })
})

describe('Mehrere Hörtexte und eigene Länge', () => {
  it('begrenzt die Zahl der Hörtexte auf eins bis drei', () => {
    expect(listeningCount({})).toBe(1)
    expect(listeningCount({ audioCount: 2 })).toBe(2)
    expect(listeningCount({ audioCount: 9 })).toBe(3)
    expect(listeningCount({ audioCount: 0 })).toBe(1)
  })

  it('nimmt die eigene Länge statt der Niveauvorgabe', () => {
    expect(listeningSeconds('A2')).toEqual(listeningRules('A2').seconds)
    const [von, bis] = listeningSeconds('A2', 120)
    expect(von).toBeLessThan(120)
    expect(bis).toBeGreaterThan(120)
    // Nie über fünf Minuten, auch wenn mehr eingetragen wird
    expect(listeningSeconds('B2', 900)[1]).toBeLessThanOrEqual(345)
    // Die Wortzahl folgt der eigenen Länge
    expect(listeningWords('A2', 'en', 200)[1]).toBeGreaterThan(listeningWords('A2', 'en')[1])
  })

  it('schreibt Anzahl, Länge und Reihenfolge in den Auftrag', () => {
    const rules = listeningTextRules(meta({ audioCount: 2, audioSeconds: 120, audioFormat: 'auto' }))
    expect(rules).toContain('2 Hörtexte')
    expect(rules).toContain('UNTERSCHIEDLICHE Textsorten')
    expect(rules).toContain('Diese Länge hat die Lehrkraft vorgegeben')
    expect(rules).toContain('erst Hörtext 1 mit ALLEN seinen Aufgaben')
    // Bei einem Hörtext steht davon nichts
    const einer = listeningTextRules(meta({ audioCount: 1 }))
    expect(einer).not.toContain('ANZAHL')
    expect(einer).not.toContain('erst Hörtext 1')
  })

  it('gibt mehrere fertige Skripte als unveränderliche Grundlage weiter', () => {
    const script = (n: number) => ({
      title: `Text ${n}`,
      textType: n === 1 ? 'Interview' : 'Durchsage',
      transcript: `Anna: Satz ${n}.`,
      speakers: ['Anna'],
      beforeListening: 'Hinweis',
      plays: 2
    })
    const text = scriptForSheet([script(1), script(2)])
    expect(text).toContain('FERTIGE HÖRTEXTE (2)')
    expect(text).toContain('=== Hörtext 1 ===')
    expect(text).toContain('=== Hörtext 2 ===')
    expect(text).toContain('Für JEDEN dieser Hörtexte genau einen Baustein'.replace('Für', 'für'))
    expect(text).toContain('Reihenfolge auf dem Blatt')
    expect(text).toContain('es sind genau 2')
    // Ein einzelner Text kommt weiterhin ohne Nummerierung aus
    expect(scriptForSheet(script(1))).toContain('FERTIGER HÖRTEXT')
    expect(scriptForSheet(script(1))).not.toContain('=== Hörtext')
  })
})

describe('Prüfung: Hörtext vorhanden und Aufgaben passend', () => {
  const audioBlock = (id: string, transcript: string) => ({
    id,
    type: 'audio' as const,
    title: 'A call from York',
    textType: 'Telefongespräch',
    transcript,
    speakers: [],
    plays: 2,
    beforeListening: 'Zwei Freunde telefonieren.',
    seconds: 60
  })
  const listeningTask = (id: string, solution: string) => ({
    id,
    type: 'task' as const,
    instruction: 'Beantworte die Fragen.',
    skill: 'listening' as const,
    parts: [{ id: `${id}-a`, instruction: 'Wann treffen sie sich?', answer: { kind: 'lines' as const, count: 2 }, solution }],
    afb: 'I' as const,
    operator: 'nennen',
    points: 1,
    minutes: 3
  })
  const sheet = (blocks: unknown[]) => ({ id: 's', label: 'Blatt', blocks }) as never

  it('meldet Hörverstehensaufgaben ohne Hörtext', () => {
    const findings = checkListening(sheet([listeningTask('t1', 'Um halb acht.')]))
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('hoch')
    expect(findings[0].message).toContain('keinen Hörtext')
  })

  it('meldet einen Hörtext ohne Skript und einen ohne Aufgabe', () => {
    expect(checkListening(sheet([audioBlock('a1', '   ')]))[0].message).toContain('kein Skript')
    expect(checkListening(sheet([audioBlock('a1', 'Anna: Wir treffen uns um halb acht am Bahnhof.')]))[0].message).toContain('keine Aufgabe')
  })

  it('erkennt Lösungen, die im Hörtext gar nicht vorkommen', () => {
    const skript = 'Anna: Wir treffen uns um halb acht am Bahnhof. Tom: Gut, dann bringe ich die Fahrkarten mit.'
    // Passende Lösung: keine Beanstandung
    expect(checkListening(sheet([audioBlock('a1', skript), listeningTask('t1', 'Sie treffen sich um halb acht am Bahnhof.')]))).toHaveLength(0)
    // Lösung aus einem ganz anderen Text
    const falsch = checkListening(sheet([audioBlock('a1', skript), listeningTask('t1', 'Die Klassenfahrt kostet zweihundert Euro pro Person.')]))
    expect(falsch).toHaveLength(1)
    expect(falsch[0].message).toContain('kommt im Hörtext so nicht vor')
  })

  it('lässt Blätter ohne Hörverstehen in Ruhe', () => {
    expect(checkListening(sheet([{ id: 'x', type: 'text', title: 'M1', body: 'Ein Text.', glossary: [], lineNumbers: false, source: '' }]))).toHaveLength(0)
  })
})

describe('Aufgaben ihrem Hörtext zuordnen', () => {
  const audio = (id: string, transcript: string) => ({ id, type: 'audio' as const, title: id, transcript, plays: 2, seconds: 60, speakers: [] })
  const task = (id: string, solution: string, skill?: string) =>
    ({
      id,
      type: 'task' as const,
      instruction: 'Beantworte.',
      operator: '',
      afbReason: '',
      socialForm: 'EA',
      answer: { kind: 'lines', count: 2 },
      parts: [{ id: `${id}p`, instruction: 'Frage', answer: { kind: 'lines', count: 1 }, solution }],
      solution,
      points: 2,
      minutes: 2,
      ...(skill ? { skill } : {})
    }) as never

  it('ordnet jede Aufgabe dem zuletzt genannten Hörtext zu', async () => {
    const { linkListeningTasks } = await import('../src/renderer/src/modules/arbeitsblatt/generation/listening')
    const blocks = [audio('a1', 'erster text'), task('t1', 'x'), task('t2', 'y'), audio('a2', 'zweiter text'), task('t3', 'z')] as never[]
    expect(linkListeningTasks(blocks)).toBe(3)
    expect(blocks.map((b: { audioId?: string }) => b.audioId)).toEqual([undefined, 'a1', 'a1', undefined, 'a2'])
  })

  it('lässt Aufgaben vor dem ersten Hörtext unberührt', async () => {
    const { linkListeningTasks } = await import('../src/renderer/src/modules/arbeitsblatt/generation/listening')
    const blocks = [task('t0', 'vorher'), audio('a1', 'text'), task('t1', 'x')] as never[]
    linkListeningTasks(blocks)
    expect((blocks[0] as { audioId?: string }).audioId).toBeUndefined()
  })

  it('übergeht Aufgaben, die eine andere Kompetenz prüfen', async () => {
    const { linkListeningTasks } = await import('../src/renderer/src/modules/arbeitsblatt/generation/listening')
    const blocks = [audio('a1', 'text'), task('t1', 'x', 'writing')] as never[]
    expect(linkListeningTasks(blocks)).toBe(0)
  })

  it('prüft die Lösung gegen den eigenen Hörtext, nicht gegen alle', () => {
    // Die Lösung steht in Hörtext 1, die Aufgabe gehört aber zu Hörtext 2
    const blocks = [
      audio('a1', 'The museum opens at nine in the morning and closes at five.'),
      audio('a2', 'Please meet at the bus station near the cathedral.'),
      { ...(task('t1', 'The museum opens at nine in the morning', 'listening') as object), audioId: 'a2' }
    ] as never[]
    const findings = checkListening({ id: 's', label: 'Blatt', blocks } as never)
    expect(findings.some((f) => f.message.includes('nicht vor'))).toBe(true)
  })

  it('lässt sie durchgehen, wenn sie im richtigen Hörtext steht', () => {
    const blocks = [
      audio('a1', 'The museum opens at nine in the morning and closes at five.'),
      audio('a2', 'Please meet at the bus station near the cathedral.'),
      { ...(task('t1', 'The museum opens at nine in the morning', 'listening') as object), audioId: 'a1' }
    ] as never[]
    expect(checkListening({ id: 's', label: 'Blatt', blocks } as never)).toHaveLength(0)
  })
})

describe('Zuordnung greift auf jedem Weg', () => {
  it('setzt die Zuordnung schon beim Bauen des Blattes', async () => {
    // Der Sparmodus überspringt die Prüfrunde. Läge die Zuordnung erst dort, bliebe sie
    // bei Abo-Zugängen dauerhaft aus – genau das war der Fehler.
    const { buildSheetForTest } = await import('../src/renderer/src/modules/arbeitsblatt/generation/generate')
    const sheet = buildSheetForTest({
      blocks: [
        { type: 'audio', title: 'Announcement', transcript: 'The train to Edinburgh leaves from platform four.', plays: 2 },
        { type: 'task', instruction: 'Where does the train leave from?', skill: 'listening', parts: [], answer: { kind: 'multipleChoice' } },
        { type: 'task', instruction: 'Write a short reply.', skill: 'writing', parts: [], answer: { kind: 'lines' } }
      ]
    })
    const audio = sheet.blocks.find((b) => b.type === 'audio')!
    const listening = sheet.blocks.filter((b) => b.type === 'task' && b.skill === 'listening')
    const writing = sheet.blocks.filter((b) => b.type === 'task' && b.skill === 'writing')
    expect(listening.every((t) => t.type === 'task' && t.audioId === audio.id)).toBe(true)
    expect(writing.every((t) => t.type === 'task' && !t.audioId)).toBe(true)
  })
})

/*
 * Betonungshinweise im Skript (Entscheidung des Nutzers: erlaubt, und im Transkript sichtbar).
 *
 * Sie wirken nur über die Dialog-Schnittstelle (eleven_v3), die erst ab zwei Sprechenden
 * benutzt wird. Bei einer einzelnen Stimme entfernt `ohneTags` sie vor dem Vertonen – sonst
 * läse das ältere Modell „laughs" vor. Deshalb darf die KI sie auch nur im Dialog setzen.
 */
describe('Betonungshinweise im Hörtext', () => {
  it('bindet sie an mehrere Sprechende', () => {
    expect(audioTagRules).toMatch(/MEHRERE Personen/)
    expect(audioTagRules).toMatch(/nur EINE Person.*keine Betonungshinweise/s)
  })

  it('verbietet Geräusche und Musik', () => {
    // [applause] oder [door slams] machen aus dem Hörtext ein Hörspiel
    expect(audioTagRules).toMatch(/KEINE Geräusche/)
    expect(audioTagRules).toMatch(/applause/)
  })

  it('verlangt eckige Klammern – runde bleiben die verbotene Regieanweisung', () => {
    expect(audioTagRules).toMatch(/eckigen Klammern/)
    expect(scriptPrompt(meta({ audioAi: true }))).toMatch(/Keine Regieanweisungen in Klammern/)
  })

  it('steht im Auftrag an die KI', () => {
    expect(scriptPrompt(meta({ audioAi: true }))).toContain(audioTagRules)
  })
})
