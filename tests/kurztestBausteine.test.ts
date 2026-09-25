import { describe, expect, it } from 'vitest'
import {
  bausteinRegeln,
  ERLAUBTE_BAUSTEINE,
  istErlaubt,
  pruefeBausteine,
  pruefeMaterialtexte,
  VERBOTENE_BAUSTEINE,
  OHNE_AUSGLEICH,
  type Nachteilsausgleich
} from '../src/renderer/src/modules/lernzielkontrolle/didactics/bausteine'
import { emptyAnswer } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'

const aufgabe: WsBlock = {
  id: 'a1',
  type: 'task',
  instruction: '**Berechne** den Wert von $(-3)^4$.',
  operator: 'berechnen',
  afb: 'I',
  afbReason: '',
  socialForm: 'EA',
  minutes: 4,
  points: 2,
  solution: '81',
  answer: emptyAnswer('lines'),
  parts: []
}

const material = (title: string, body: string): WsBlock => ({
  id: 'm1',
  type: 'text',
  title,
  body,
  lineNumbers: false,
  source: '',
  glossary: []
})

/*
 * Entscheidung der Lehrkraft (23.09.2026): „keine Erklärungen für Schüler, sondern nur
 * Aufgaben und je nach Aufgabe/Fach Material als Grundlage." Das ist der schärfste
 * Unterschied zum Arbeitsblatt und deshalb eigens bewacht.
 */
describe('Nur Aufgaben und Material', () => {
  it('lässt Aufgabe, Material, Bild, Tabelle und Raster zu', () => {
    for (const typ of ['task', 'text', 'image', 'table', 'grid', 'audio']) expect(istErlaubt(typ), typ).toBe(true)
  })

  it('verbietet jede Form von Lernhilfe', () => {
    for (const typ of ['learningGoals', 'infoBox', 'scaffold', 'selfCheck']) expect(istErlaubt(typ), typ).toBe(false)
  })

  it('führt keinen Bausteintyp in beiden Listen', () => {
    for (const typ of Object.keys(VERBOTENE_BAUSTEINE)) expect(ERLAUBTE_BAUSTEINE, typ).not.toContain(typ)
  })

  it('begründet jedes Verbot', () => {
    for (const [typ, grund] of Object.entries(VERBOTENE_BAUSTEINE)) {
      expect(grund.length, typ).toBeGreaterThan(40)
      expect(grund, typ).toMatch(/\.$/)
    }
  })
})

describe('Prüfung am fertigen Blatt', () => {
  it('schweigt bei einem sauberen Blatt', () => {
    expect(pruefeBausteine([aufgabe, material('M1 Potenzgesetze im Überblick', 'Gesetz | Beispiel')])).toEqual([])
  })

  it('meldet den Merkkasten mit Begründung', () => {
    const merke: WsBlock = {
      id: 'i1',
      type: 'infoBox',
      variant: 'merke',
      title: 'Merke',
      body: 'Beim Potenzieren einer Potenz werden die Exponenten multipliziert.'
    }
    const w = pruefeBausteine([aufgabe, merke])
    expect(w).toHaveLength(1)
    expect(w[0].blockId).toBe('i1')
    expect(w[0].message).toMatch(/prüft, ob ohne Erklärung gewusst wird/)
  })

  it('meldet die Lernzielliste', () => {
    const ziele: WsBlock = { id: 'z1', type: 'learningGoals', title: 'Das lernst du', goals: ['Ich kann Potenzen berechnen.'] }
    expect(pruefeBausteine([ziele])[0].message).toMatch(/verrät die Liste/)
  })
})

describe('Erklärtext, der als Material getarnt ist', () => {
  it('erkennt den Merksatz im Materialtext', () => {
    /*
     * Der häufigere Fall als ein verbotener Bausteintyp: formal ein Textbaustein, inhaltlich
     * die Wiederholung genau des Stoffes, der gleich abgefragt wird.
     */
    const w = pruefeMaterialtexte([material('Das musst du wissen', 'Beim Multiplizieren gleicher Basen werden die Exponenten addiert.')])
    expect(w).toHaveLength(1)
    expect(w[0].message).toMatch(/GRUNDLAGE einer Aufgabe/)
  })

  it('erkennt ihn auch im Fließtext', () => {
    expect(pruefeMaterialtexte([material('M1', 'Zur Erinnerung: $a^0 = 1$ für jedes $a \\neq 0$.')])).toHaveLength(1)
  })

  it('lässt echtes Material durch', () => {
    const quelle = material(
      'M1 Aus einer Rede vor dem Reichstag, 1919',
      'Wir haben die Verantwortung übernommen, weil niemand sonst bereit war, sie zu tragen. Die Lage des Landes duldete keinen Aufschub.'
    )
    expect(pruefeMaterialtexte([quelle])).toEqual([])
  })

  it('sieht Aufgaben gar nicht erst an', () => {
    // „Berechne" enthält kein Erklärmuster, aber eine Aufgabe dürfte ohnehin alles heißen
    expect(pruefeMaterialtexte([aufgabe])).toEqual([])
  })
})

describe('Regelteil für die KI', () => {
  it('verbietet ausdrücklich statt nur positiv aufzuzählen', () => {
    const r = bausteinRegeln()
    expect(r).toMatch(/KEIN Merkkasten/)
    expect(r).toMatch(/KEINE Tippkarten/)
    expect(r).toMatch(/KEIN Wortspeicher/)
    expect(r).toMatch(/KEINE Selbsteinschätzung/)
  })

  it('erklärt, was Material ist und was nicht', () => {
    expect(bausteinRegeln()).toMatch(/Material ist NICHT die Wiederholung des Stoffes/)
  })

  it('schickt Erwartungshorizont und Notenschlüssel auf das Lösungsblatt', () => {
    // Entscheidung der Lehrkraft: „notenschlüssel auf dem lösungsblatt"
    expect(bausteinRegeln()).toMatch(/Lösungsblatt für die Lehrkraft/)
  })
})

/*
 * Entscheidung der Lehrkraft (23.09.2026): Ausnahme für den Nachteilsausgleich.
 *
 * Die Grenze verläuft an der Definition des Nachteilsausgleichs: Er passt die BEDINGUNGEN
 * an (Sprache, Zeit) und senkt die fachlichen ANFORDERUNGEN nicht. Ein Wortspeicher gibt
 * Zugang zur Aufgabe, eine Tippkarte nimmt die geprüfte Leistung vorweg.
 */
describe('Nachteilsausgleich', () => {
  const hilfe = (variant: string, title: string): WsBlock => ({ id: 'h1', type: 'scaffold', variant, title, items: ['der Exponent, -en'] }) as WsBlock

  const mitAusgleich: Nachteilsausgleich = { aktiv: true, hilfen: ['wortspeicher', 'satzanfaenge'] }

  it('ist standardmäßig aus', () => {
    expect(OHNE_AUSGLEICH.aktiv).toBe(false)
    expect(OHNE_AUSGLEICH.hilfen).toEqual([])
  })

  it('sperrt den Wortspeicher ohne Ausgleich', () => {
    expect(pruefeBausteine([hilfe('wortspeicher', 'Wortspeicher')])).toHaveLength(1)
  })

  it('lässt ihn mit Ausgleich durch', () => {
    expect(pruefeBausteine([hilfe('wortspeicher', 'Wortspeicher')], mitAusgleich)).toEqual([])
    expect(pruefeBausteine([hilfe('satzanfaenge', 'Satzanfänge')], mitAusgleich)).toEqual([])
  })

  it('lässt nur zu, was ausdrücklich eingeschaltet ist', () => {
    const nurWorte: Nachteilsausgleich = { aktiv: true, hilfen: ['wortspeicher'] }
    expect(pruefeBausteine([hilfe('satzanfaenge', 'Satzanfänge')], nurWorte)).toHaveLength(1)
  })

  it('sperrt die Tippkarte auch mit Ausgleich', () => {
    /*
     * Der eigentliche Zweck der Ausnahme-Regel. Eine Tippkarte („So gehst du vor") ist kein
     * Ausgleich, sondern eine andere Aufgabe.
     */
    const w = pruefeBausteine([hilfe('tipp', 'Tipp')], mitAusgleich)
    expect(w).toHaveLength(1)
    expect(w[0].message).toMatch(/nimmt die geprüfte Leistung nicht vorweg/)
  })

  it('sperrt gestufte Hilfekarten auch mit Ausgleich', () => {
    expect(pruefeBausteine([hilfe('hilfekarten', 'Hilfekarten')], mitAusgleich)).toHaveLength(1)
  })

  it('deckt den Merkkasten nicht mit ab', () => {
    // Der Ausgleich betrifft nur sprachliche Hilfen, nicht die Wiederholung des Stoffes
    const merke: WsBlock = { id: 'i1', type: 'infoBox', variant: 'merke', title: 'Merke', body: 'Exponenten werden addiert.' }
    expect(pruefeBausteine([merke], mitAusgleich)).toHaveLength(1)
  })

  it('sagt der KI, dass die Anforderungen gleich bleiben', () => {
    const r = bausteinRegeln(mitAusgleich)
    expect(r).toMatch(/NACHTEILSAUSGLEICH/)
    expect(r).toMatch(/fachlichen Anforderungen bleiben unverändert/)
    expect(r).toMatch(/keine Lösungswörter/)
  })

  it('schweigt im Regelfall über den Ausgleich', () => {
    expect(bausteinRegeln()).not.toMatch(/NACHTEILSAUSGLEICH/)
    expect(bausteinRegeln({ aktiv: true, hilfen: [] })).not.toMatch(/NACHTEILSAUSGLEICH/)
  })
})
