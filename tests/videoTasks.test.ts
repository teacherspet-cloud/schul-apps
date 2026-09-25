import { describe, expect, it } from 'vitest'
import {
  DURING_ANSWER_KINDS,
  duringPolicy,
  FILM_LANGUAGE,
  filmLanguageRules,
  filmLanguageStage,
  observationFoci,
  sectionMinutes,
  VIDEO_KINDS,
  videoKindById
} from '../src/renderer/src/modules/arbeitsblatt/didactics/videoTasks'
import { checkVideo } from '../src/renderer/src/modules/arbeitsblatt/didactics/integrity'
import { linkVideoTasks, sortViewingTasks } from '../src/renderer/src/modules/arbeitsblatt/generation/video'
import { expandObserverGroups, observerGroupsOf } from '../src/renderer/src/modules/arbeitsblatt/render/observerGroups'
import { systemPrompt, videoRules } from '../src/renderer/src/modules/arbeitsblatt/generation/prompts'
import { profileFromMeta } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'
import { shortLink } from '../src/renderer/src/modules/arbeitsblatt/render/BlockView'
import { emptyAnswer } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import type { AnswerKind, Sheet, TaskBlock, VideoBlock, WorksheetMeta, WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import type { VideoKind, ViewingDuring, ViewingPhase } from '../src/renderer/src/modules/arbeitsblatt/didactics/videoTasks'

const meta = (patch: Partial<WorksheetMeta> = {}): WorksheetMeta => ({
  ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
  subjectId: 'deutsch',
  subjectLabel: 'Deutsch',
  grade: 9,
  ...patch
})

const withVideo = (kind: VideoKind, patch: Partial<NonNullable<WorksheetMeta['video']>> = {}, m: Partial<WorksheetMeta> = {}): WorksheetMeta =>
  meta({
    ...m,
    video: { title: 'Die Welle', url: '', kind, platform: '', minutes: 20, section: '', summary: '', during: 'auto', groups: 0, ...patch }
  })

const video = (id = 'v1'): VideoBlock => ({
  id,
  type: 'video',
  title: 'Film',
  kind: 'dokumentation',
  sourceTitle: 'Ein Dokumentarfilm',
  url: '',
  platform: '',
  minutes: 12,
  section: '',
  summary: '',
  beforeViewing: '',
  plays: 1,
  teacherNote: ''
})

const task = (id: string, phase?: ViewingPhase, answerKind: AnswerKind = 'lines', group?: string): TaskBlock => ({
  id,
  type: 'task',
  instruction: 'Beobachte …',
  operator: 'Beobachte',
  afbReason: '',
  socialForm: 'EA',
  answer: emptyAnswer(answerKind),
  parts: [],
  solution: 'Lösung',
  points: 0,
  minutes: 5,
  ...(phase ? { viewingPhase: phase } : {}),
  ...(group ? { observerGroup: group } : {})
})

const sheet = (blocks: WsBlock[]): Sheet => ({ id: 's1', label: 'Arbeitsblatt', blocks })

describe('Videoarten und was während des Sehens verlangt wird', () => {
  it('beschreibt jede Videoart vollständig und begründet die Regel für „während“', () => {
    for (const k of VIDEO_KINDS) {
      expect(k.label.length).toBeGreaterThan(3)
      expect(k.description.length).toBeGreaterThan(10)
      expect(k.reason.length).toBeGreaterThan(20)
    }
  })

  it('verlangt beim Spielfilm nichts während des Sehens, beim Lernvideo Leitfragen', () => {
    // Der Kern des Befundes: Ein Film wird erlebt, ein Lernvideo benutzt.
    expect(duringPolicy('spielfilm', 'auto')).toBe('keine')
    expect(duringPolicy('lernvideo', 'auto')).toBe('leitfragen')
    expect(videoKindById('spielfilm')?.replayable).toBe(false)
  })

  it('lässt die Wahl der Lehrkraft die Videoart überstimmen', () => {
    expect(duringPolicy('spielfilm', 'leitfragen')).toBe('leitfragen')
    expect(duringPolicy('lernvideo', 'keine')).toBe('keine')
  })

  it('erlaubt während des Sehens nur ankreuzbare Formate', () => {
    expect(DURING_ANSWER_KINDS).toContain('trueFalse')
    expect(DURING_ANSWER_KINDS).toContain('tableFill')
    expect(DURING_ANSWER_KINDS as readonly string[]).not.toContain('lines')
  })
})

describe('Progression der Filmsprache (LKM-Konzept)', () => {
  it('staffelt nach Klasse 4, 10 und 12', () => {
    expect(filmLanguageStage(4)).toBe('grundschule')
    expect(filmLanguageStage(10)).toBe('sek1')
    expect(filmLanguageStage(12)).toBe('sek2')
  })

  it('kennt Einstellungsgröße und Kameraperspektive schon in der Grundschule', () => {
    // Häufig unterschätzt und ausdrücklich belegt: Das gehört zum Stand nach Klasse 4.
    const rules = filmLanguageRules(3).join(' ')
    expect(rules).toMatch(/Einstellungsgrößen/)
    expect(rules).toMatch(/Kameraperspektiven/)
  })

  it('hebt sich für die Oberstufe Beleuchtungsstil und Farbgestaltung auf', () => {
    expect(filmLanguageRules(12).join(' ')).toMatch(/Beleuchtungsstil/)
    expect(filmLanguageRules(4).join(' ')).not.toMatch(/Beleuchtungsstil/)
  })

  it('beschreibt jeden Aspekt auf allen drei Stufen', () => {
    for (const a of FILM_LANGUAGE) {
      for (const stage of ['grundschule', 'sek1', 'sek2'] as const) expect(a.can[stage].length).toBeGreaterThan(20)
    }
  })
})

describe('Beobachtungsschwerpunkte der Fächer', () => {
  it('kennzeichnet belegte und abgeleitete Fächer unterschiedlich', () => {
    // Nur für diese vier Fächer gab die Recherche Fachquellen her – das wird nicht verwischt.
    expect(observationFoci('deutsch').sourced).toBe(true)
    expect(observationFoci('geschichte').sourced).toBe(true)
    expect(observationFoci('englisch').sourced).toBe(true)
    expect(observationFoci('politik').sourced).toBe(true)
    expect(observationFoci('mathematik').sourced).toBe(false)
    expect(observationFoci('sport').sourced).toBe(false)
  })

  it('liefert auch für ein unbekanntes Fach brauchbare Schwerpunkte', () => {
    const { foci } = observationFoci('anderes')
    expect(foci.length).toBeGreaterThanOrEqual(3)
  })

  it('markiert die Abschnittslänge als Faustregel', () => {
    expect(sectionMinutes(3).heuristic).toBe(true)
    expect(sectionMinutes(3).range[1]).toBeLessThan(sectionMinutes(12).range[1])
  })
})

describe('Regeln im KI-Auftrag', () => {
  it('bleibt stumm, wenn kein Video gewünscht ist', () => {
    expect(videoRules(meta())).toBe('')
  })

  it('erreicht wirklich den Systemauftrag', () => {
    // Die Regel nützt nichts, wenn sie unterwegs verloren geht – deshalb diese Wache.
    const m = withVideo('lernvideo', { title: 'Fotosynthese erklärt' })
    const prompt = systemPrompt(m, profileFromMeta(m))
    expect(prompt).toMatch(/FILM- UND VIDEOBEOBACHTUNG/)
    expect(prompt).toMatch(/Fotosynthese erklärt/)
  })

  it('verbietet beim Spielfilm Aufgaben während des Sehens', () => {
    const rules = videoRules(withVideo('spielfilm'))
    expect(rules).toMatch(/KEINE Aufgabe während des Sehens/)
  })

  it('verlangt ohne Inhaltsangabe tragfähige Raster und einen Prüfhinweis', () => {
    const rules = videoRules(withVideo('lernvideo'))
    expect(rules).toMatch(/KEINE Inhaltsangabe/)
    expect(rules).toMatch(/zu prüfen sind/)
  })

  it('macht die Inhaltsangabe der Lehrkraft verbindlich', () => {
    const rules = videoRules(withVideo('lernvideo', { summary: 'Erklärt den Calvin-Zyklus.' }))
    expect(rules).toMatch(/Calvin-Zyklus/)
    expect(rules).toMatch(/verbindlich/)
  })

  it('hält Zeitmarken vom Schülerblatt fern, solange sie nicht freigeschaltet sind', () => {
    expect(videoRules(withVideo('lernvideo'))).toMatch(/Zeitmarken NICHT in die Arbeitsanweisung/)
    expect(videoRules(withVideo('lernvideo', { timecodesOnSheet: true }))).toMatch(/Zeitmarken dürfen bei den Aufgaben stehen/)
  })

  it('bestellt die Beobachtergruppen und das Zusammentragen', () => {
    const rules = videoRules(withVideo('dokumentation', { groups: 3 }))
    expect(rules).toMatch(/3 Beobachtungsaufträge/)
    expect(rules).toMatch(/A, B, C/)
    expect(rules).toMatch(/zusammen/)
  })
})

describe('Aufgaben und Video verbinden', () => {
  it('ordnet nur Aufgaben mit Beobachtungsphase zu', () => {
    const blocks: WsBlock[] = [video(), task('t1', 'vor'), task('t2'), task('t3', 'nach')]
    expect(linkVideoTasks(blocks)).toBe(2)
    expect((blocks[1] as TaskBlock).videoId).toBe('v1')
    expect((blocks[2] as TaskBlock).videoId).toBeUndefined()
    expect((blocks[3] as TaskBlock).videoId).toBe('v1')
  })

  it('bringt vertauschte Phasen in die richtige Reihenfolge', () => {
    // Auf Papier fatal: Wer den Beobachtungsauftrag erst nach dem Film liest, hat nicht beobachtet.
    const blocks: WsBlock[] = [video(), task('nach', 'nach'), task('vor', 'vor'), task('waehrend', 'waehrend')]
    expect(sortViewingTasks(blocks).map((b) => b.id)).toEqual(['v1', 'vor', 'waehrend', 'nach'])
  })

  it('lässt ein Blatt ohne Beobachtungsaufgaben unverändert', () => {
    const blocks: WsBlock[] = [video(), task('t1'), task('t2')]
    expect(sortViewingTasks(blocks)).toBe(blocks)
  })
})

describe('Arbeitsteilige Beobachtung', () => {
  const base = sheet([video(), task('vor', 'vor'), task('a', 'waehrend', 'trueFalse', 'A'), task('b', 'waehrend', 'trueFalse', 'B'), task('nach', 'nach')])

  it('erkennt die vorkommenden Gruppen', () => {
    expect(observerGroupsOf(base)).toEqual(['A', 'B'])
  })

  it('macht aus einem Blatt je Gruppe eine Fassung mit demselben Aufbau', () => {
    const sheets = expandObserverGroups([base])
    expect(sheets).toHaveLength(2)
    expect(sheets[0].blocks.map((b) => b.id)).toEqual(['v1', 'vor', 'a', 'nach'])
    expect(sheets[1].blocks.map((b) => b.id)).toEqual(['v1', 'vor', 'b', 'nach'])
    expect(sheets[0].label).toMatch(/Gruppe A/)
  })

  it('behält die Bausteinkennungen, damit eine Korrektur am Material überall greift', () => {
    const sheets = expandObserverGroups([base])
    expect(sheets[0].blocks[1].id).toBe(sheets[1].blocks[1].id)
    expect(sheets[0].id).not.toBe(sheets[1].id)
  })

  it('lässt ein Blatt ohne Gruppen in Ruhe', () => {
    const plain = sheet([video(), task('t1', 'nach')])
    expect(expandObserverGroups([plain])).toEqual([plain])
  })
})

describe('Prüfung der Videoblätter', () => {
  it('meldet eine Beobachtungsaufgabe ohne Video', () => {
    const findings = checkVideo(sheet([task('t1', 'nach')]), withVideo('lernvideo'))
    expect(findings[0].severity).toBe('hoch')
    expect(findings[0].message).toMatch(/kein/)
  })

  it('meldet ein Video ohne Aufgabe', () => {
    const findings = checkVideo(sheet([video()]), withVideo('lernvideo'))
    expect(findings.some((f) => f.message.includes('keine Aufgabe'))).toBe(true)
  })

  it('meldet Schreibaufgaben während des Sehens', () => {
    // Wer schreibt, sieht nicht – der Fehler, den man dem Blatt nicht ansieht.
    const blocks: WsBlock[] = [video(), task('t1', 'waehrend', 'lines')]
    linkVideoTasks(blocks)
    const findings = checkVideo(sheet(blocks), withVideo('dokumentation'))
    expect(findings.some((f) => f.message.includes('geschrieben statt angekreuzt'))).toBe(true)
  })

  it('lässt Ankreuzaufgaben während des Sehens durchgehen', () => {
    const blocks: WsBlock[] = [video(), task('t1', 'waehrend', 'trueFalse')]
    linkVideoTasks(blocks)
    expect(checkVideo(sheet(blocks), withVideo('dokumentation')).some((f) => f.message.includes('angekreuzt'))).toBe(false)
  })

  it('meldet Arbeit während des Sehens, wo sie nicht hingehört', () => {
    const blocks: WsBlock[] = [video(), task('t1', 'waehrend', 'trueFalse')]
    linkVideoTasks(blocks)
    const findings = checkVideo(sheet(blocks), withVideo('spielfilm'))
    expect(findings.some((f) => f.message.includes('nicht gearbeitet werden'))).toBe(true)
  })

  it('meldet fehlende Beobachtergruppen', () => {
    const blocks: WsBlock[] = [video(), task('a', 'waehrend', 'trueFalse', 'A'), task('nach', 'nach')]
    linkVideoTasks(blocks)
    const findings = checkVideo(sheet(blocks), withVideo('dokumentation', { groups: 3 }))
    expect(findings.some((f) => f.severity === 'hoch' && f.message.includes('3 Beobachtergruppen'))).toBe(true)
  })

  it('meldet eine unbrauchbare Adresse', () => {
    const blocks: WsBlock[] = [{ ...video(), url: 'youtube irgendwas' }, task('t1', 'nach')]
    linkVideoTasks(blocks)
    expect(checkVideo(sheet(blocks), withVideo('lernvideo')).some((f) => f.message.includes('Internetadresse'))).toBe(true)
  })
})

describe('Klartextlink unter dem QR-Code', () => {
  it('lässt kurze Adressen unangetastet', () => {
    expect(shortLink('https://youtu.be/abc123')).toBe('youtu.be/abc123')
  })

  it('kürzt nur die Mitte und behält die Kennung am Ende', () => {
    // Ohne Gerät wird der Link abgetippt – Anfang und Kennung müssen stehen bleiben.
    const long = 'https://www.ardmediathek.de/video/dokumentation-und-reportage/sehr-langer-titel/das-erste/Y3JpZDovL3N3cg'
    const short = shortLink(long)
    expect(short.startsWith('www.ardmediathek.de')).toBe(true)
    expect(short.endsWith('Y3JpZDovL3N3cg')).toBe(true)
    expect(short.length).toBeLessThan(long.length)
  })
})

describe('Wahl der Lehrkraft', () => {
  const kinds: ViewingDuring[] = ['keine', 'ankreuzen', 'leitfragen']
  it('setzt jede Wahl in eine eigene Regel um', () => {
    const texts = kinds.map((during) => videoRules(withVideo('dokumentation', { during })))
    expect(new Set(texts).size).toBe(kinds.length)
  })
})
