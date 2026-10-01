/**
 * STRESS-BLÄTTER für die Seitenrand-Wache (tests/e2e/seitenrand.mjs) – ohne KI.
 *
 * Befund der Lehrkraft (30.09.2026): „Auf einem Arbeitsblatt war z. B. die letzte Zeile einer
 * Tabelle nur halb sichtbar." Die Blätter hier sind absichtlich unbequem: lange Tabellen mit
 * mehrzeiligen Zellen, Bausteine knapp am Seitenende, Bilder, Formeln, Protokolle, Lückentexte,
 * Notiz- und Korrekturrand, Deckblatt. Mit `seed` entstehen gemischte Blätter, deren
 * Seitenenden jedes Mal an einer anderen Stelle liegen.
 */
import { presetDesigns } from '@shared/design'
import { leeresProtokoll } from './modules/arbeitsblatt/didactics/protokoll'
import { defaultMeta } from './modules/arbeitsblatt/model/defaults'
import { emptyAnswer } from './modules/arbeitsblatt/model/factory'
import { subjectById } from './modules/arbeitsblatt/model/subjects'
import type { Answer, AnswerKind, Worksheet, WorksheetMeta, WsBlock } from './modules/arbeitsblatt/model/types'
import { createRng } from './modules/vokabeltest/model/random'
import { useVokabeltest } from './modules/vokabeltest/store'

export type SeitenrandArt = 'tabellen' | 'knapp' | 'raender' | 'protokoll' | 'gemischt' | 'teilbar'

const SATZ =
  'Der Wasserkreislauf beschreibt, wie Wasser verdunstet, als Wolke weiterzieht und als Niederschlag zurück auf die Erde fällt, wo es versickert oder in Flüsse abfließt. '

/** Ein kleines Testbild (Canvas → PNG), damit Bilder echte Pixelmaße haben */
function testbild(breite: number, hoehe: number, farbe: string): string {
  const c = document.createElement('canvas')
  c.width = breite
  c.height = hoehe
  const g = c.getContext('2d')
  if (!g) return ''
  g.fillStyle = farbe
  g.fillRect(0, 0, breite, hoehe)
  g.fillStyle = '#fff'
  g.fillRect(breite * 0.1, hoehe * 0.1, breite * 0.3, hoehe * 0.3)
  return c.toDataURL('image/png')
}

let zaehler = 0
let praefix = ''
const id = (p: string): string => `${praefix}${p}-${++zaehler}`

const antwort = (kind: AnswerKind, patch: Partial<Answer> = {}): Answer => ({ ...emptyAnswer(kind), ...patch })

function aufgabe(instruction: string, answer: Answer, extra: Partial<Extract<WsBlock, { type: 'task' }>> = {}): WsBlock {
  return {
    id: id('a'),
    type: 'task',
    instruction,
    operator: instruction.replace(/\*/g, '').split(' ')[0].toLowerCase(),
    afb: 'I',
    afbReason: '',
    socialForm: 'EA',
    answer,
    parts: [],
    solution: 'Erwartet: eine vollständige, begründete Antwort.',
    points: 4,
    minutes: 5,
    ...extra
  }
}

function text(absaetze: number, laenge: number, extra: Partial<Extract<WsBlock, { type: 'text' }>> = {}): WsBlock {
  return {
    id: id('t'),
    type: 'text',
    title: 'Material: Wasser in Bewegung',
    body: Array.from({ length: absaetze }, (_, i) => `${i + 1}. ${SATZ.repeat(laenge)}`).join('\n\n'),
    lineNumbers: false,
    source: 'Eigene Darstellung',
    glossary: [],
    ...extra
  }
}

function tabelle(zeilen: number, mehrzeilig: boolean, extra: Partial<Extract<WsBlock, { type: 'table' }>> = {}): WsBlock {
  return {
    id: id('tab'),
    type: 'table',
    title: 'Messwerte der Wetterstation',
    headers: ['Tag', 'Beobachtung', 'Niederschlag in mm'],
    rows: Array.from({ length: zeilen }, (_, r) => [
      `${r + 1}`,
      mehrzeilig && r % 4 === 1 ? SATZ.repeat(1 + (r % 3)) : `Bewölkt, leichter Wind aus West (${r + 1})`,
      r % 5 === 0 ? `$${r}{,}5$` : `${(r * 0.7).toFixed(1)}`
    ]),
    ...extra
  }
}

const mathe = (): WsBlock =>
  aufgabe(
    '**Berechne** $\\dfrac{3}{4} + \\dfrac{5}{6}$ und $\\sqrt{\\dfrac{x^2 + 1}{2}}$. Vereinfache $\\displaystyle\\sum_{k=1}^{n} \\frac{k^2}{n^3}$ und $\\displaystyle\\int_0^1 \\frac{x^3}{\\sqrt{1+x^2}}\\,dx$.',
    antwort('grid', { count: 5 })
  )

const lueckentext = (): WsBlock =>
  aufgabe(
    '**Ergänze** die Lücken.',
    antwort('gapText', {
      gapText: Array.from(
        { length: 6 },
        (_, i) => `Wasser [[verdunstet]] über dem Meer, steigt als [[Wasserdampf]] auf und kühlt in der Höhe ab (${i + 1}). Dabei [[kondensiert]] es zu Wolken.`
      ).join(' ')
    })
  )

const bild = (seite?: 'left' | 'right'): WsBlock => ({
  id: id('b'),
  type: 'image',
  role: seite ? 'illustration' : 'material',
  description: 'Schema des Wasserkreislaufs',
  caption: 'Abb.: Schema des Wasserkreislaufs',
  widthPercent: seite ? 35 : 80,
  side: seite ?? 'none',
  image: { dataUrl: testbild(800, seite ? 900 : 560, seite ? '#6a994e' : '#2b6cb0'), source: 'own', credit: 'Eigene Grafik' }
})

const merke = (laenge: number): WsBlock => ({ id: id('m'), type: 'infoBox', variant: 'merke', title: 'Merke', body: SATZ.repeat(laenge) })

const schreibraum = (hoehe: number): WsBlock => ({ id: id('w'), type: 'workspace', kind: 'lines', heightMm: hoehe, label: 'Platz für Notizen' })

const protokoll = (subjectId: string, grade: number): WsBlock => ({ id: id('p'), type: 'protocol', ...leeresProtokoll({ subjectId, grade }) }) as WsBlock

/*
 * TEILBARE BAUSTEINE (01.10.2026, Wunsch der Lehrkraft: „Bausteine an geeigneten Stellen
 * aufteilen … erster Teil auf S. 1 unten, Fortsetzung auf S. 2"). Jede Antwortform, die sich an
 * natürlichen Stellen teilen lässt, einmal in groß – nach einem Vorlauf, der sie irgendwo auf die
 * Seite setzt. Die Wache `seiten-sparen.mjs` misst daran Seitenzahl und Untergrenze.
 */
const zuordnung = (n: number): WsBlock =>
  aufgabe(
    '**Ordne** die Begriffe den Erklärungen zu.',
    antwort('matching', {
      left: Array.from({ length: n }, (_, i) => `Begriff ${i + 1}: Verdunstung über ${i % 2 ? 'dem Meer' : 'Seen und Flüssen'}`),
      right: Array.from({ length: n }, (_, i) => `Erklärung ${i + 1}: ${SATZ.slice(0, 60 + (i % 3) * 30)}`),
      pairs: Array.from({ length: n }, (_, i) => (i * 3) % n)
    })
  )

const ordnen = (n: number): WsBlock =>
  aufgabe(
    '**Bringe** die Schritte in die richtige Reihenfolge.',
    antwort('ordering', {
      items: Array.from({ length: n }, (_, i) => `Schritt ${i + 1}: ${SATZ.slice(0, 50 + (i % 4) * 25)}`),
      displayOrder: Array.from({ length: n }, (_, i) => (i * 5) % n)
    })
  )

const beschriften = (n: number): WsBlock =>
  aufgabe('**Beschrifte** die Nummern im Schema.', antwort('labels', { count: n, labels: Array.from({ length: n }, (_, i) => `Teil ${i + 1}`) }))

const ausfuellen = (n: number): WsBlock =>
  aufgabe(
    '**Vervollständige** die Tabelle.',
    antwort('tableFill', {
      headers: ['Vorgang', 'Ort', 'Ergebnis'],
      rows: Array.from({ length: n }, (_, i) => [`Vorgang ${i + 1}`, '', i % 2 ? '' : 'Wolke']),
      solutionRows: Array.from({ length: n }, (_, i) => ['', `Ort ${i + 1}`, i % 2 ? 'Regen' : ''])
    })
  )

const lueckenZeilen = (n: number): WsBlock =>
  aufgabe(
    '**Ergänze** die Lücken in den Sätzen.',
    antwort('gapText', {
      gapText: Array.from({ length: n }, (_, i) => `${i + 1}. Wasser [[verdunstet]] über dem Meer und steigt als [[Wasserdampf]] auf; in der Höhe [[kondensiert]] es (${i + 1}).`).join('\n')
    })
  )

const richtigFalsch = (n: number): WsBlock =>
  aufgabe(
    '**Kreuze** an: richtig oder falsch?',
    antwort('trueFalse', { statements: Array.from({ length: n }, (_, i) => ({ text: `Aussage ${i + 1}: ${SATZ.slice(0, 80 + (i % 3) * 40)}`, isTrue: i % 2 === 0 })) })
  )

const mcReihe = (n: number, lang: boolean): WsBlock =>
  aufgabe('**Kreuze** die richtige Antwort an.', antwort('lines', { count: 1 }), {
    parts: Array.from({ length: n }, (_, i) => ({
      id: id('mc'),
      instruction: lang ? `Frage ${i + 1}: ${SATZ.slice(0, 70)}?` : `Frage ${i + 1}?`,
      answer: antwort('multipleChoice', {
        options: lang ? ['Durch Verdunstung über dem Meer', 'Durch Versickerung im Boden', 'Durch Abfluss in die Flüsse'] : ['Regen', 'Schnee', 'Hagel'],
        correct: [i % 3]
      }),
      solution: ''
    }))
  })

const teilaufgabenGemischt = (): WsBlock =>
  aufgabe('**Bearbeite** die Teilaufgaben.', antwort('lines', { count: 1 }), {
    parts: [
      {
        id: id('tp'),
        instruction: 'Ordne zu.',
        answer: antwort('matching', { left: ['Wolke', 'Regen', 'Fluss', 'Meer', 'See', 'Grundwasser'], right: ['fällt', 'fließt', 'verdunstet', 'zieht', 'versickert', 'steht'], pairs: [3, 0, 1, 2, 5, 4] }),
        solution: ''
      },
      { id: id('tp'), instruction: 'Ergänze.', answer: antwort('gapText', { gapText: Array.from({ length: 8 }, (_, i) => `Satz ${i + 1}: Das Wasser [[fließt]] ins Meer.`).join('\n') }), solution: '' },
      { id: id('tp'), instruction: `Begründe. ${SATZ}`, answer: antwort('lines', { count: 6 }), solution: 'Lösung' },
      {
        id: id('tp'),
        instruction: 'Richtig oder falsch?',
        answer: antwort('trueFalse', { statements: Array.from({ length: 7 }, (_, i) => ({ text: `Aussage ${i + 1}: ${SATZ.slice(0, 90)}`, isTrue: i % 2 === 1 })) }),
        solution: ''
      }
    ]
  })

const schreibauftrag = (): WsBlock =>
  aufgabe('**Schreibe** einen Bericht für die Schülerzeitung.', antwort('lines', { count: 22 }), {
    brief: {
      situation: 'Eure Klasse hat eine Wetterstation gebaut.',
      audience: 'Mitschülerinnen und Mitschüler',
      textType: 'Bericht',
      purpose: 'informieren',
      words: 200,
      points: ['Aufbau der Station', 'Messergebnisse der ersten Woche', 'Was euch überrascht hat', 'Ausblick'],
      form: ['Überschrift verwenden'],
      criteria: ['Sachlichkeit', 'Vollständigkeit'],
      notes: [
        { title: 'Aufbau', items: ['Thermometer', 'Regenmesser'], prompts: ['Standort: …'] },
        { title: 'Ergebnisse', items: ['Niederschlag', 'Temperatur'], prompts: ['Höchstwert: …'] }
      ]
    }
  })

const lernziele = (n: number): WsBlock => ({
  id: id('lz'),
  type: 'learningGoals',
  title: 'Das kann ich jetzt',
  goals: Array.from({ length: n }, (_, i) => `Ich kann den Schritt ${i + 1} des Wasserkreislaufs erklären und ${SATZ.slice(0, 40 + (i % 3) * 30)}`)
})

const selbstcheck = (n: number): WsBlock => ({
  id: id('sc'),
  type: 'selfCheck',
  title: 'Selbsteinschätzung',
  format: 'smileys',
  statements: Array.from({ length: n }, (_, i) => `Ich kann Aussage ${i + 1} sicher begründen: ${SATZ.slice(0, 50 + (i % 4) * 20)}`)
})

const merkeLang = (absaetze: number): WsBlock => ({
  id: id('m'),
  type: 'infoBox',
  variant: 'merke',
  title: 'Merke',
  body: Array.from({ length: absaetze }, () => SATZ.repeat(2)).join('\n\n')
})

const tippListe = (n: number): WsBlock => ({
  id: id('st'),
  type: 'scaffold',
  variant: 'satzanfaenge',
  title: 'Satzanfänge',
  items: Array.from({ length: n }, (_, i) => `Satzanfang ${i + 1}: Zuerst ${SATZ.slice(0, 40 + (i % 3) * 25)} …`)
})

/** Vorlauf, der den folgenden Baustein irgendwo auf die Seite schiebt */
const vorlauf = (r: () => number): WsBlock =>
  r() < 0.5 ? text(1 + Math.floor(r() * 3), 1 + Math.floor(r() * 2)) : aufgabe('**Notiere** deine Vermutung.', antwort('lines', { count: 2 + Math.floor(r() * 10) }))

function teilbareBausteine(seed: number): WsBlock[] {
  const r = createRng(seed)
  const kern: (() => WsBlock)[] = [
    () => zuordnung(14),
    () => richtigFalsch(12),
    () => lueckenZeilen(14),
    () => mcReihe(10, true),
    () => mcReihe(12, false),
    () => teilaufgabenGemischt(),
    () => ordnen(12),
    () => beschriften(16),
    () => ausfuellen(14),
    () => schreibauftrag(),
    () => lernziele(9),
    () => selbstcheck(12),
    () => merkeLang(4),
    () => tippListe(10),
    () => tabelle(16, true),
    () => text(6, 2)
  ]
  const aus: WsBlock[] = []
  for (const k of kern) {
    aus.push(vorlauf(r))
    aus.push(k())
  }
  return aus
}

/** Bausteine in wechselnder Größe – je nach Zufallszahl ein anderes Seitenende */
function zufallsBaustein(r: () => number): WsBlock {
  const n = Math.floor(r() * 11)
  switch (n) {
    case 0:
      return text(1 + Math.floor(r() * 5), 1 + Math.floor(r() * 3))
    case 1:
      return tabelle(3 + Math.floor(r() * 30), r() < 0.5)
    case 2:
      return aufgabe('**Beschreibe** den Verlauf.', antwort('lines', { count: 1 + Math.floor(r() * 14) }))
    case 3:
      return mathe()
    case 4:
      return lueckentext()
    case 5:
      return bild()
    case 6:
      return merke(1 + Math.floor(r() * 4))
    case 7:
      return schreibraum(15 + Math.floor(r() * 80))
    case 8:
      return aufgabe('**Kreuze** die richtigen Aussagen an.', antwort('trueFalse', { statements: Array.from({ length: 3 + Math.floor(r() * 8) }, (_, i) => ({ text: `Aussage ${i + 1}: ${SATZ}`, isTrue: i % 2 === 0 })) }))
    case 9:
      return aufgabe('**Erkläre** den Zusammenhang.', antwort('lines', { count: 4 }), {
        parts: Array.from({ length: 2 + Math.floor(r() * 5) }, (_, i) => ({
          id: id('tp'),
          instruction: `Teilaufgabe ${i + 1}: ${SATZ}`,
          answer: antwort('lines', { count: 2 + Math.floor(r() * 4) }),
          solution: 'Lösung'
        }))
      })
    default:
      return protokoll(['chemie', 'physik', 'biologie'][Math.floor(r() * 3)], 7 + Math.floor(r() * 4))
  }
}

function bausteine(art: SeitenrandArt, seed: number): WsBlock[] {
  switch (art) {
    case 'tabellen':
      return [
        text(3, 2),
        // Lange Tabelle mit mehrzeiligen Zellen, die mitten auf der Seite beginnt
        tabelle(48, true),
        aufgabe('**Werte** die Tabelle aus.', antwort('lines', { count: 3 })),
        // Tabelle mit hohen Zeilen und hoher Kopfzeile (von Hand gezogen)
        tabelle(22, false, { colWidths: [15, 55, 30], rowHeightsMm: Array.from({ length: 22 }, (_, i) => (i % 3 === 0 ? 18 : 0)), headerHeightMm: 16 }),
        // Kurze Tabelle direkt danach
        tabelle(6, true, { title: '' }),
        tabelle(35, false)
      ]
    case 'knapp': {
      // Bausteine, deren Höhe schrittweise wächst: So trifft irgendeiner das Seitenende knapp
      const aus: WsBlock[] = [text(2, 1)]
      for (let k = 1; k <= 14; k++) {
        aus.push(aufgabe(`**Notiere** Beobachtung ${k}.`, antwort('lines', { count: k % 7 + 1 })))
        if (k % 3 === 0) aus.push(merke(k % 4 + 1))
        if (k % 4 === 0) aus.push(mathe())
        if (k % 5 === 0) aus.push(lueckentext())
        if (k === 6) aus.push(bild())
        if (k === 9) aus.push(bild('right'), aufgabe('**Beschrifte** das Bild.', antwort('lines', { count: 6 })))
      }
      return aus
    }
    case 'raender':
      return [
        text(6, 2, { lineNumbers: true, glossary: [{ term: 'Kondensation', explanation: 'Übergang von gasförmig zu flüssig' }] }),
        aufgabe('**Fasse** den Text zusammen.', antwort('lines', { count: 12 })),
        tabelle(30, true),
        text(4, 3, { lineNumbers: true }),
        aufgabe('**Begründe** deine Meinung.', antwort('lines', { count: 18 })),
        lueckentext(),
        mathe()
      ]
    case 'protokoll':
      return [
        protokoll('chemie', 8),
        tabelle(12, true),
        protokoll('physik', 9),
        aufgabe('**Deute** die Beobachtung.', antwort('lines', { count: 9 })),
        protokoll('biologie', 7),
        protokoll('chemie', 10)
      ]
    case 'gemischt': {
      const r = createRng(seed)
      return Array.from({ length: 16 + Math.floor(r() * 10) }, () => zufallsBaustein(r))
    }
    case 'teilbar':
      return teilbareBausteine(seed)
  }
}

/**
 * Den offenen Vokabeltest aufblähen: jede Aufgabe `faktor`-mal, teilbare Aufgaben mit dreimal so
 * vielen Einträgen – so reichen die Aufgaben über mehrere Seiten und werden geteilt.
 */
export function vtSeitenrand(faktor = 4): { aufgaben: number } {
  const s = useVokabeltest.getState()
  if (!s.doc) throw new Error('Kein Vokabeltest geladen.')
  s.updateDoc((d) => {
    for (const v of d.variants) {
      const basis = JSON.parse(JSON.stringify(v.blocks)) as Record<string, unknown>[]
      const neu: Record<string, unknown>[] = []
      for (let k = 0; k < faktor; k++)
        for (const b of basis) {
          const c = JSON.parse(JSON.stringify(b)) as Record<string, unknown>
          c.id = `${String(b.id)}-x${k}`
          if (Array.isArray(c.items))
            c.items = [0, 1, 2].flatMap((r) =>
              (c.items as unknown[]).map((it) => (it && typeof it === 'object' ? { ...(it as object), id: `${String((it as { id?: string }).id)}-${k}-${r}` } : it))
            )
          neu.push(c)
        }
      v.blocks = neu as unknown as typeof v.blocks
    }
  })
  return { aufgaben: useVokabeltest.getState().doc?.variants[0]?.blocks.length ?? 0 }
}

/**
 * Ein Stress-Blatt. `design` ist der Index in `presetDesigns()` (0 = Klassisch, 1 = Farbband …);
 * `idPraefix` hält die Kennungen eindeutig, wenn mehrere Blätter in einem Dokument landen.
 */
export function seitenrandBlatt(art: SeitenrandArt, seed = 1, design = 0, idPraefix = ''): Worksheet {
  zaehler = 0
  praefix = idPraefix
  const meta: WorksheetMeta = {
    ...defaultMeta('NI', 'gymnasium', 'Gymnasium'),
    subjectId: 'erdkunde',
    subjectLabel: subjectById('erdkunde').label,
    topic: 'Der Wasserkreislauf',
    title: `Seitenrand: ${art}${art === 'gemischt' ? ` ${seed}` : ''}`,
    grade: 8,
    pages: 0,
    answerKey: true,
    ...(art === 'raender' ? { notesMargin: true, correctionMargin: true, coverPage: true } : {})
  }
  const designs = presetDesigns()
  return {
    version: 1,
    meta,
    design: designs[design % designs.length],
    outline: null,
    sheets: [{ id: 's1', label: 'Arbeitsblatt', blocks: bausteine(art, seed) }],
    sources: [],
    createdAt: new Date().toISOString()
  }
}
