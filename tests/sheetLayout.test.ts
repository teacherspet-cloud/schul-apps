import { describe, expect, it, vi } from 'vitest'
import { loadLastChoice, saveLastChoice } from '../src/renderer/src/shared/lastChoice'
import { galleryColumns } from '../src/renderer/src/modules/arbeitsblatt/render/BlockView'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { imageCredits, isHelpCard, materialNumbersFor } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'
import { linieGebunden } from '../src/renderer/src/modules/arbeitsblatt/render/baustein/hilfen'
import { paginate } from '../src/renderer/src/shared/render/paginate'
import { stripMaterialNo } from '../src/renderer/src/modules/arbeitsblatt/render/BlockView'
import { checkIntegrity, sameOrder } from '../src/renderer/src/modules/arbeitsblatt/didactics/integrity'
import type { Sheet, WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'

describe('Darstellung der Blätter', () => {
  it('hebt bearbeitbare Texte unabhängig vom Farbschema hervor', () => {
    // Die Blätter sind immer weiß: Eine Hervorhebung aus dem Farbschema wäre im
    // Dunkelmodus dunkel und der schwarze Text nicht mehr lesbar.
    const css = readFileSync(resolve('src/renderer/src/modules/vokabeltest/steps/editor.css'), 'utf8')
    const rules = css.slice(css.indexOf('.vt-editable:hover'), css.indexOf('.vt-editable:empty'))
    expect(rules).not.toContain('--mantine-')
    expect(rules).toMatch(/background: rgba\(/)
  })

  it('sammelt die Bildnachweise für die Schlussseite', () => {
    const sheet: Sheet = {
      id: 's1',
      label: 'Blatt',
      blocks: [
        { id: 'b1', type: 'text', title: 'M1', body: 'Text' },
        {
          id: 'b2',
          type: 'image',
          caption: 'Blattquerschnitt',
          description: '',
          image: {
            dataUrl: 'x',
            source: 'wikimedia',
            credit: 'Foto: A. B., CC BY-SA 4.0'
          }
        },
        {
          id: 'b3',
          type: 'image',
          caption: 'ohne Nachweis',
          description: '',
          image: { dataUrl: 'x', source: 'ai' }
        },
        {
          id: 'b4',
          type: 'image',
          caption: 'Reihe',
          description: '',
          items: [
            {
              id: 'i1',
              caption: 'Igel',
              image: {
                dataUrl: 'x',
                source: 'openverse',
                credit: 'C. D., CC0'
              }
            },
            {
              id: 'i2',
              caption: 'Eule',
              image: {
                dataUrl: 'x',
                source: 'openverse',
                credit: 'E. F., CC0'
              }
            }
          ]
        }
      ] as Sheet['blocks']
    }
    const credits = imageCredits(sheet)
    expect(credits.map((c) => c.credit)).toEqual(['Foto: A. B., CC BY-SA 4.0', 'C. D., CC0', 'E. F., CC0'])
    expect(credits[0].label).toBe('Bild 1 – Blattquerschnitt')
    expect(credits[2].label).toBe('Bild 3 – Eule')
  })
})

describe('Zuletzt getroffene Auswahl', () => {
  it('merkt sich die Angaben je Programm und überschreibt nichts mit Leerwerten', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k)
    })

    expect(loadLastChoice('arbeitsblatt')).toEqual({})
    saveLastChoice('arbeitsblatt', {
      subjectId: 'englisch',
      stateId: 'NI',
      schoolTypeId: 'gymnasium',
      grade: 8
    })
    expect(loadLastChoice('arbeitsblatt')).toMatchObject({
      subjectId: 'englisch',
      grade: 8
    })
    // Leere Angaben lassen den gemerkten Wert stehen
    saveLastChoice('arbeitsblatt', { subjectId: '', grade: 9 })
    expect(loadLastChoice('arbeitsblatt')).toMatchObject({
      subjectId: 'englisch',
      grade: 9
    })
    // Jedes Programm merkt für sich
    saveLastChoice('klassenarbeit', { subjectId: 'geschichte' })
    expect(loadLastChoice('klassenarbeit').subjectId).toBe('geschichte')
    expect(loadLastChoice('arbeitsblatt').subjectId).toBe('englisch')
    vi.unstubAllGlobals()
  })
})

describe('Prüfung auf Vollständigkeit', () => {
  const task = (id: string, instruction: string): WsBlock =>
    ({
      id,
      type: 'task',
      instruction,
      operator: 'vergleichen',
      afbReason: '',
      socialForm: 'single',
      answer: { kind: 'lines', lines: 4 },
      parts: [],
      solution: 'x',
      points: 4,
      minutes: 10
    }) as unknown as WsBlock

  it('findet Verweise auf Material, das es nicht gibt', () => {
    const sheet = {
      id: 's',
      label: 'Blatt',
      blocks: [
        {
          id: 'm3',
          type: 'text',
          title: 'M3 Die beiden Schultaschen',
          body: 'Alex: ruler, book, pen\nSam: glue, book, ruler'
        },
        task('t1', 'Evaluate Bag A and Bag B in M5 for today.')
      ] as WsBlock[]
    }
    const findings = checkIntegrity(sheet)
    expect(findings.some((f) => f.severity === 'hoch' && f.message.includes('M5'))).toBe(true)
    expect(findings.find((f) => f.message.includes('M5'))?.message).toContain('M3')
  })

  it('meldet nichts, wenn der Verweis stimmt', () => {
    const sheet = {
      id: 's',
      label: 'Blatt',
      blocks: [
        {
          id: 'm3',
          type: 'text',
          title: 'M3 Die beiden Schultaschen',
          body: 'Alex: ruler, book, pen\nSam: glue, book, ruler'
        },
        task('t1', 'Compare the two school bags in M3.')
      ] as WsBlock[]
    }
    expect(checkIntegrity(sheet).filter((f) => f.severity === 'hoch')).toHaveLength(0)
  })

  it('erkennt Vergleichslisten in gleicher Reihenfolge', () => {
    // Gleiche Reihenfolge: Die Aufgabe ließe sich durch Abgleichen der Position lösen
    expect(sameOrder(['book', 'pen', 'ruler'], ['book', 'pen', 'ruler', 'glue'])).toBe(true)
    expect(sameOrder(['book', 'pen', 'ruler'], ['ruler', 'book', 'pen'])).toBe(false)
    const sheet = {
      id: 's',
      label: 'Blatt',
      blocks: [
        {
          id: 'm1',
          type: 'text',
          title: 'M1',
          body: 'Alex: book, pen, ruler, glue\nSam: book, pen, ruler, scissors'
        }
      ] as WsBlock[]
    }
    expect(checkIntegrity(sheet).some((f) => f.message.includes('derselben Reihenfolge'))).toBe(true)
  })

  it('meldet leeres Material', () => {
    const sheet = {
      id: 's',
      label: 'Blatt',
      blocks: [{ id: 'm1', type: 'text', title: 'M1', body: '   ' }] as WsBlock[]
    }
    expect(checkIntegrity(sheet).some((f) => f.message.includes('leer'))).toBe(true)
  })
})

describe('Materialnummern und Hilfekarten', () => {
  it('vergibt die Materialnummern selbst, fortlaufend über alle Materialien', () => {
    const sheet = {
      id: 's',
      label: 'Blatt',
      blocks: [
        { id: 'a', type: 'text', title: 'M7 falsch nummeriert', body: 'x' },
        {
          id: 'task',
          type: 'task',
          instruction: 'Vergleiche M1 und M2.',
          operator: 'vergleichen',
          afbReason: '',
          socialForm: 'single',
          answer: { kind: 'lines', lines: 3 },
          parts: [],
          solution: 'x',
          points: 3,
          minutes: 5
        },
        { id: 'b', type: 'image', caption: 'Ein Bild', description: '' },
        {
          id: 'c',
          type: 'scaffold',
          variant: 'hilfekarten',
          title: 'Hilfen',
          items: ['1']
        }
      ] as unknown as WsBlock[]
    }
    const numbers = materialNumbersFor(sheet)
    expect(numbers.get('a')).toBe('M1')
    expect(numbers.get('b')).toBe('M2')
    // Aufgaben und Hilfekarten zählen nicht als Material
    expect(numbers.has('task')).toBe(false)
    expect(numbers.has('c')).toBe(false)
    // Eine von der KI mitgeschriebene Nummer wird nicht doppelt angezeigt
    expect(stripMaterialNo('M7 falsch nummeriert')).toBe('falsch nummeriert')
    expect(stripMaterialNo('Die Schultaschen')).toBe('Die Schultaschen')
  })

  it('erkennt Hilfekarten als Baustein für die Extraseite', () => {
    expect(
      isHelpCard({
        id: 'c',
        type: 'scaffold',
        variant: 'hilfekarten',
        title: '',
        items: []
      } as unknown as WsBlock)
    ).toBe(true)
    expect(
      isHelpCard({
        id: 'c',
        type: 'scaffold',
        variant: 'tipp',
        title: '',
        items: []
      } as unknown as WsBlock)
    ).toBe(false)
  })
})

describe('Bearbeitungsfeld in den Kästen', () => {
  it('gibt dem Textfeld die volle Breite statt der Browser-Vorgabe', () => {
    const css = readFileSync(resolve('src/renderer/src/modules/vokabeltest/steps/editor.css'), 'utf8')
    const rule = css.slice(css.indexOf('.rt-editor {'))
    expect(css).toContain('.rt-editor {')
    // Ohne Breite fällt ein textarea auf 20 Zeichen zurück – rund ein Drittel der Seite
    expect(rule.slice(0, 400)).toContain('width: 100%')
    expect(rule.slice(0, 400)).toContain('box-sizing: border-box')
  })
})

describe('Größe von Material-Bildern', () => {
  it('stellt Karten und Quellen höchstens zu zweit nebeneinander', () => {
    // Piktogramme dürfen eng stehen
    expect(galleryColumns(4, 'illustration')).toBe(4)
    expect(galleryColumns(8, 'illustration')).toBe(4)
    // Material wird ausgewertet und braucht Fläche
    expect(galleryColumns(2, 'material')).toBe(2)
    expect(galleryColumns(4, 'material')).toBe(2)
    expect(galleryColumns(1, 'material')).toBe(1)
  })

  it('gibt Material-Bildern mehr Höhe als den 38 mm der Piktogramme', () => {
    const css = readFileSync(resolve('src/renderer/src/modules/arbeitsblatt/render/ws.css'), 'utf8')
    expect(css).toContain('.ws-gallery-material .ws-gallery-frame')
    const mm = [...css.matchAll(/\.ws-gallery-material[^}]*height:\s*(\d+)mm/g)].map((m) => Number(m[1]))
    expect(mm.length).toBeGreaterThan(0)
    for (const h of mm) expect(h).toBeGreaterThan(38)
  })
})

describe('Erzwungener Seitenumbruch', () => {
  /*
   * Wunsch der Lehrkraft (24.09.2026): „füge bei übungsklausuren die aufgabenstellungen
   * außerdem an den anfang auf eine eigene seite und das material auf nachfolgende seiten."
   *
   * Ohne erzwungenen Umbruch begänne das Material irgendwo mitten auf der Aufgabenseite –
   * und der Prüfling blättert beim Lesen ständig zwischen beidem hin und her.
   */
  it('beginnt auf einer neuen Seite, auch wenn noch Platz wäre', () => {
    const plan = paginate(
      [
        { id: 'aufgaben', height: 100 },
        { id: 'material', height: 100, pageBreakBefore: true }
      ],
      800,
      800
    )
    expect(plan).toHaveLength(2)
    expect(plan[0].items.map((i) => i.id)).toEqual(['aufgaben'])
    expect(plan[1].items.map((i) => i.id)).toEqual(['material'])
  })

  it('verschwendet keine leere Seite am Anfang', () => {
    // Steht der Baustein ohnehin ganz oben, gibt es nichts umzubrechen
    const plan = paginate([{ id: 'material', height: 100, pageBreakBefore: true }], 800, 800)
    expect(plan).toHaveLength(1)
  })

  it('lässt geteilte Bausteine danach normal weiterlaufen', () => {
    /*
     * Ein langer Materialtext wird weiterhin über mehrere Seiten verteilt – der erzwungene
     * Umbruch gilt nur für seinen Anfang.
     */
    const units = Array.from({ length: 20 }, () => 100)
    const plan = paginate(
      [
        { id: 'aufgaben', height: 200 },
        { id: 'material', height: 2000, units, pageBreakBefore: true }
      ],
      800,
      800
    )
    expect(plan.length).toBeGreaterThan(2)
    expect(plan[0].items.map((i) => i.id)).toEqual(['aufgaben'])
    expect(plan[1].items[0].id).toBe('material')
  })
})

describe('Teilen ohne Mindestzahl, aber nie die Aufgabenstellung allein', () => {
  /*
   * Bis 30.09.2026 galt „mindestens zwei Einheiten je Stück" (Schusterjunge/Hurenkind, nach
   * „Aufgabe/Material wird zerrissen" vom 25.09.2026). Eine Einheit ist aber ein ganzer Absatz
   * oder eine Frage – die Regel schob ganze Absätze weiter und kostete Seiten. Entscheidung der
   * Lehrkraft (01.10.2026): keine harte Mindestzeilen-Regel; die Aufgabenstellung (Kopf) steht
   * nie ohne die erste Einheit, gebundene Einheiten (`unitGlue`) nie am Ende eines Stücks.
   */
  it('füllt die Seite bis zur letzten passenden Einheit', () => {
    const units = Array.from({ length: 7 }, () => 100)
    const plan = paginate([{ id: 'text', height: 700, units }], 600, 600)
    expect(plan).toHaveLength(2)
    expect(plan[0].items[0].to).toBe(6)
    expect(plan[1].items[0]).toMatchObject({ from: 6, to: 7, continued: true })
  })

  it('setzt unten eine einzelne Einheit samt Kopf, statt den Baustein ganz weiterzuschieben', () => {
    const units = Array.from({ length: 6 }, () => 100)
    const plan = paginate(
      [
        { id: 'aufgabe', height: 450 },
        { id: 'text', height: 650, headHeight: 50, units }
      ],
      600,
      600
    )
    expect(plan[0].items.map((i) => i.id)).toEqual(['aufgabe', 'text'])
    expect(plan[0].items[1]).toMatchObject({ from: 0, to: 1 })
  })

  it('der Kopf (Aufgabenstellung) steht nie ohne erste Einheit am Seitenende', () => {
    // Unten passt nur noch der Kopf (80) – die erste Einheit (100) nicht: Der Baustein wandert ganz
    const plan = paginate(
      [
        { id: 'vorher', height: 500 },
        { id: 'aufgabe', height: 380, headHeight: 80, units: [100, 100, 100] }
      ],
      600,
      600
    )
    expect(plan[0].items.map((i) => i.id)).toEqual(['vorher'])
    expect(plan[1].items[0]).toMatchObject({ id: 'aufgabe', from: 0, to: 3 })
  })

  it('gebundene Einheiten wandern mit der folgenden – z. B. „b) Ergänze …" nicht ohne seine erste Zeile', () => {
    // Einheiten: a)-Kopf, Zeile, Zeile, b)-Kopf (gebunden), Zeile, Zeile; unten ist Platz für vier Einheiten
    const aufgabe = { id: 'a', height: 20 + 600, headHeight: 20, units: Array(6).fill(100), unitGlue: [true, false, false, true, false, false] }
    const plan = paginate([{ id: 'vorher', height: 180 }, aufgabe], 600, 600)
    // Ohne Bindung stünde b) als vierte Einheit allein unten – so endet Seite 1 nach der dritten
    expect(plan[0].items[1]).toMatchObject({ from: 0, to: 3 })
    expect(plan[1].items[0]).toMatchObject({ from: 3, continued: true })
  })

  it('eine Kette gebundener Einheiten, die länger ist als die Seite, wird oben auf einer leeren Seite doch geteilt', () => {
    const plan = paginate([{ id: 'a', height: 900, headHeight: 0, units: [300, 300, 300], unitGlue: [true, true, false] }], 600, 600)
    expect(plan[0].overflow).toBe(false)
    expect(plan[0].items[0]).toMatchObject({ from: 0, to: 2 })
  })

  it('Schreiblinien: jedes Stück hat mindestens zwei Linien (erste an zweite, vorletzte an letzte gebunden)', () => {
    // Entscheidung der Lehrkraft (01.10.2026); Kopf 50, zehn Linien à 32
    const n = 10
    const unitGlue = Array.from({ length: n }, (_, k) => linieGebunden(k, n))
    const schreiben = { id: 's', height: 50 + n * 32, headHeight: 50, continuedHead: 20, units: Array(n).fill(32), unitGlue }
    for (let vorher = 300; vorher <= 600; vorher += 7) {
      const plan = paginate([{ id: 'v', height: vorher }, schreiben], 650, 650)
      const stuecke = plan.flatMap((p) => p.items.filter((i) => i.id === 's'))
      for (const st of stuecke) expect(st.to! - st.from!, `Vorlauf ${vorher}`).toBeGreaterThanOrEqual(2)
    }
  })

  it('ein Folgestück rechnet die wiederholte Kopfzeile einer inneren Tabelle mit (`unitRepeat`)', () => {
    const units = Array(20).fill(50)
    const plan = paginate([{ id: 'tf', height: 1000, headHeight: 0, continuedHead: 20, units, unitRepeat: Array(20).fill(40) }], 300, 300)
    expect(plan[0].items[0].to).toBe(6)
    // Seite 2: 20 + 40 + n·50 ≤ 300 → vier Zeilen; ohne die wiederholte Kopfzeile wären es fünf und die Seite liefe über
    expect(plan[1].items[0].to! - plan[1].items[0].from!).toBe(4)
  })

  it('setzt eine übergroße Einheit trotzdem, statt endlos umzubrechen', () => {
    // Eine einzelne Einheit, die größer ist als die Seite: Sie muss gesetzt werden
    const plan = paginate([{ id: 'text', height: 900, units: [900, 100] }], 600, 600)
    expect(plan[0].overflow).toBe(true)
    expect(plan[0].items[0].to).toBe(1)
  })

  it('teilt kurze Bausteine weiterhin normal', () => {
    // Zwei Einheiten auf jeder Seite – daran ändert die Regel nichts
    const units = Array.from({ length: 4 }, () => 100)
    const plan = paginate([{ id: 'text', height: 400, units }], 200, 200)
    expect(plan).toHaveLength(2)
    expect(plan.map((p) => p.items[0].to! - p.items[0].from!)).toEqual([2, 2])
  })
})
