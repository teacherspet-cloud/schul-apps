import { describe, expect, it, vi } from 'vitest'
import { loadLastChoice, saveLastChoice } from '../src/renderer/src/shared/lastChoice'
import { galleryColumns } from '../src/renderer/src/modules/arbeitsblatt/render/BlockView'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { imageCredits, isHelpCard, materialNumbersFor } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'
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

describe('Schusterjungen und Hurenkinder', () => {
  /*
   * Gemeldet am 25.09.2026: „sobald man den notizrand aktiviert, geht etwas an den
   * seitenumbrüchen kaputt … Aufgabe/Material wird zerrissen."
   *
   * Der Notizrand ist nicht die Ursache. Er macht den Text schmaler und damit höher und
   * trifft dadurch nur viel häufiger einen Fall, den die Verteilung vorher nicht kannte: Sie
   * füllte die Seite bis zur letzten passenden Einheit – und ein einzelner übrig gebliebener
   * Absatz stand allein auf der Folgeseite.
   */
  it('lässt nicht eine einzelne Einheit allein auf die letzte Seite fallen', () => {
    // Sieben Einheiten à 100, Seite fasst 6 – ohne Regel stünde die siebte allein
    const units = Array.from({ length: 7 }, () => 100)
    const plan = paginate([{ id: 'text', height: 700, units }], 600, 600)
    expect(plan).toHaveLength(2)
    const letzte = plan[1].items[0]
    expect(letzte.to! - letzte.from!).toBeGreaterThanOrEqual(2)
    // und die erste Seite gibt genau eine Einheit dafür ab
    expect(plan[0].items[0].to).toBe(5)
  })

  it('lässt einen Baustein nicht mit einer einzelnen Einheit am Seitenende anfangen', () => {
    /*
     * Unten ist noch Platz für genau eine Einheit. Der Text beginnt dann lieber ganz oben
     * auf der nächsten Seite – eine einzelne Zeile unter der Aufgabe sieht aus wie ein
     * Versehen.
     */
    const units = Array.from({ length: 6 }, () => 100)
    const plan = paginate(
      [
        { id: 'aufgabe', height: 500 },
        { id: 'text', height: 600, units }
      ],
      600,
      600
    )
    expect(plan[0].items.map((i) => i.id)).toEqual(['aufgabe'])
    expect(plan[1].items[0].from).toBe(0)
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
