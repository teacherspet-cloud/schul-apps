import { describe, expect, it } from 'vitest'
import { paketBereinigt, type GrammatikPaket } from '../src/shared/grammatiktrainer'
import { blindSicht, blindUrteil, blindWeitere, gemischt, type BlindAntwort } from '../src/shared/grammatikBlindprobe'
import { blindGeprueft, type PruefBericht } from '../src/renderer/src/modules/lernen/grammatikErzeugen'
import type { StructuredRequest } from '../src/shared/types'

// Blindprobe (28.10.2026, Wunsch der Lehrkraft): eine KI löst jede Aufgabe nur mit der Schüleransicht
const paket = (aufgaben: Record<string, unknown>[]): GrammatikPaket =>
  paketBereinigt(
    {
      thema: 'Past progressive',
      regeln: [{ id: 'r', titel: 'Past progressive', erklaerung: 'was/were + -ing', beispiele: [] }],
      aufgaben: aufgaben.map((a, i) => ({ id: `x${i}`, regelId: 'r', anweisung: 'A', erklaerung: 'GEHEIM-ERKLAERUNG', ...a }))
    },
    'Past progressive'
  )
const b = (x: Partial<BlindAntwort>): BlindAntwort => ({ nr: 1, text: '', liste: [], wort: '', richtig: false, auch: [], ...x })

describe('Blindprobe: Schüleransicht', () => {
  it('verrät weder Lösung noch Erklärung noch Reihenfolge', () => {
    const [l, s] = paket([
      { art: 'luecke', satz: 'At 8 pm I ___ TV.', vorgabe: '(watch)', loesungen: ['was watching'] },
      { art: 'satzbau', teile: ['She', 'was', 'reading', 'a book.'], loesungen: ['She was reading a book.'] }
    ]).aufgaben
    const sicht = blindSicht(l, 1)
    expect(sicht).toContain('(watch)')
    expect(sicht).not.toContain('was watching')
    expect(sicht).not.toContain('GEHEIM')
    expect(blindSicht(s, 2)).toContain(`Teile: ${gemischt(s.teile!, s.id).join(' | ')}`)
  })
})

describe('Blindprobe: Bewertung wie bei Lernenden', () => {
  const [luecke, mehrfach, markieren, sortieren, zuordnen, rf, fehler, verbinden] = paket([
    { art: 'luecke', satz: 'At 8 pm I ___ TV.', vorgabe: '(watch)', loesungen: ['was watching'] },
    { art: 'mehrfach', optionen: ['They were swimming.', 'They swam.', 'She was laughing.'], loesungen: ['They were swimming.', 'She was laughing.'] },
    { art: 'markieren', satz: 'I was reading while she was cooking.', zielWoerter: ['was', 'reading', 'cooking'] },
    {
      art: 'sortieren',
      gruppen: ['progressive', 'simple'],
      elemente: [
        { text: 'was playing', gruppe: 0 },
        { text: 'played', gruppe: 1 },
        { text: 'were running', gruppe: 0 },
        { text: 'ran', gruppe: 1 }
      ]
    },
    {
      art: 'zuordnen',
      paare: [
        { links: 'While I was cooking,', rechts: 'the phone rang.' },
        { links: 'At six o’clock', rechts: 'we were having dinner.' },
        { links: 'Yesterday', rechts: 'I met Tom.' }
      ]
    },
    { art: 'richtigfalsch', satz: 'She were sleeping.', korrekt: false, fehlerWort: 'were', loesungen: ['was'] },
    { art: 'fehler', satz: 'They was playing.', fehlerWort: 'was', loesungen: ['were'] },
    { art: 'verbinden', satz: 'I was walking. It was raining.', vorgabe: '(while)', anfang: 'I was walking', loesungen: ['I was walking while it was raining.'] }
  ]).aufgaben

  it('Tippen, Mehrfach, Markieren', () => {
    expect(blindUrteil(luecke, b({ text: 'was watching' }))).toBe('richtig')
    expect(blindUrteil(luecke, b({ text: 'watched' }))).toBe('falsch')
    expect(blindUrteil(mehrfach, b({ liste: ['She was laughing.', 'They were swimming.'] }))).toBe('richtig')
    expect(blindUrteil(markieren, b({ liste: ['was', 'reading', 'was', 'cooking'] }))).toBe('richtig')
  })

  it('Sortieren in gemischter Reihenfolge, Zuordnen über die rechten Hälften', () => {
    const folge = gemischt([0, 1, 2, 3], sortieren.id)
    const liste = folge.map((i) => (sortieren.elemente![i].gruppe === 0 ? 'progressive' : 'simple'))
    expect(blindUrteil(sortieren, b({ liste }))).toBe('richtig')
    expect(blindUrteil(zuordnen, b({ liste: ['the phone rang.', 'we were having dinner.', 'I met Tom.'] }))).toBe('richtig')
    expect(blindUrteil(zuordnen, b({ liste: ['we were having dinner.', 'the phone rang.', 'I met Tom.'] }))).not.toBe('richtig')
  })

  it('Richtig-falsch, Fehler finden, Sätze verbinden mit Satzanfang', () => {
    expect(blindUrteil(rf, b({ richtig: false, wort: 'were', text: 'was' }))).toBe('richtig')
    expect(blindUrteil(rf, b({ richtig: true }))).toBe('falsch')
    expect(blindUrteil(fehler, b({ wort: 'was', text: 'were' }))).toBe('richtig')
    expect(blindUrteil(verbinden, b({ text: 'I was walking while it was raining.' }))).toBe('richtig')
    // Weitere Antworten: nur, was die Bewertung noch nicht als richtig nimmt
    expect(blindWeitere(verbinden, b({ auch: ['I was walking while it was raining', 'It was raining while I was walking.', 'I was walking when it was raining.'] }))).toEqual([
      'I was walking when it was raining.'
    ])
  })
})

describe('Blindprobe im Erzeugen: überarbeiten, ergänzen, streichen', () => {
  it('läuft durch und berichtet', async () => {
    const start = paket([
      { art: 'luecke', satz: 'At 8 pm I ___ TV.', vorgabe: '(watch)', loesungen: ['was watching'] },
      { art: 'luecke', satz: 'Look! It ___ .', vorgabe: '(rain)', loesungen: ['is raining'] },
      { art: 'auswahl', satz: 'I ___ when you called.', optionen: ['was sleeping', 'slept', 'sleep'], loesungen: ['was sleeping'] },
      { art: 'luecke', satz: 'Yesterday she ___ .', vorgabe: '(cook)', loesungen: ['was cooking'] }
    ])
    const aufrufe: string[] = []
    let probe = 0
    const ai = async <T,>(req: StructuredRequest): Promise<T> => {
      aufrufe.push(req.schemaName)
      if (req.schemaName === 'grammatik_blindprobe') {
        expect(req.user).not.toContain('GEHEIM')
        probe++
        if (probe === 1)
          return {
            antworten: [
              b({ nr: 1, text: 'was watching' }),
              b({ nr: 2, text: "'s raining" }),
              b({ nr: 3, text: 'was sleeping', auch: ['slept'] }),
              b({ nr: 4, text: 'cooked' })
            ]
          } as T
        // Zweite Probe: nur die überarbeitete Auswahl
        return { antworten: [b({ nr: 1, text: 'was sleeping' })] } as T
      }
      const leer = { anweisung: '', kontext: '', satz: '', vorgabe: '', anfang: '', loesungen: [], optionen: [], fehlerWort: '', teile: [], paare: [], korrekt: false, luecken: [], wortkasten: [], zielWoerter: [], gruppen: [], elemente: [], erklaerung: '' }
      return {
        urteile: [
          { ...leer, nr: 1, aktion: 'ergaenzen', grund: 'Kurzform', loesungen: ['is raining', "'s raining"] },
          { ...leer, nr: 2, aktion: 'ueberarbeiten', grund: 'slept passt auch', anweisung: 'Wähle.', kontext: 'You phoned me at midnight.', satz: 'I ___ when you called.', optionen: ['was sleeping', 'sleep', 'am sleeping'], loesungen: ['was sleeping'] },
          { ...leer, nr: 3, aktion: 'streichen', grund: 'ohne Zeitpunkt nicht eindeutig' }
        ]
      } as T
    }
    const bericht: PruefBericht = { geprueft: 0, gestrichen: 0, zuLeicht: 0, gruende: [] }
    const ende = await blindGeprueft(start, { fach: 'Englisch', jahrgang: 7, thema: 'Past progressive' }, ai, () => undefined, bericht)
    expect(aufrufe).toEqual(['grammatik_blindprobe', 'grammatik_ueberarbeitung', 'grammatik_blindprobe'])
    expect(ende.aufgaben.map((x) => x.id)).toEqual(['x0', 'x1', 'x2'])
    expect(ende.aufgaben[1].loesungen).toContain("'s raining")
    expect(ende.aufgaben[2].kontext).toBe('You phoned me at midnight.')
    expect(ende.aufgaben[2].optionen).not.toContain('slept')
    expect(bericht.gestrichen).toBe(1)
    expect(bericht.gruende[0]).toMatch(/Blindprobe/)
  })

  it('ohne Antwort der Probe bleibt alles', async () => {
    const start = paket([{ art: 'luecke', satz: 'At 8 pm I ___ TV.', vorgabe: '(watch)', loesungen: ['was watching'] }])
    const ende = await blindGeprueft(start, { fach: 'Englisch', jahrgang: 7, thema: 't' }, async <T,>() => ({ antworten: [] }) as T, () => undefined)
    expect(ende.aufgaben).toHaveLength(1)
  })
})
