import { describe, expect, it } from 'vitest'
import { blockLayout, istFrei, seiteVon } from '../src/renderer/src/modules/arbeitsblatt/render/SheetPages'
import { checkImageWish } from '../src/renderer/src/modules/arbeitsblatt/didactics/sheetChecks'
import { defaultMeta } from '../src/renderer/src/modules/arbeitsblatt/model/defaults'
import { emptyAnswer } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { Sheet, WsBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'

/*
 * Bild ODER Tabelle neben den Schreiblinien.
 *
 * Gewünscht von der Lehrkraft (23.09.2026): „die bilder für die aufgaben etc sollen auch
 * bündig mit linien zum schreiben daneben möglich sein" und „auch tabellen usw sollen wie
 * die bilder angeordnet/platziert werden können", die Seite je Aufgabe wählbar.
 *
 * Das Nebeneinander gab es vorher nur für Bilder, nur automatisch nach Rolle und nur rechts.
 */

const bild = (over: Record<string, unknown> = {}): WsBlock =>
  ({ id: 'b1', type: 'image', description: 'Ein Fuchs', caption: '', widthPercent: 60, role: 'illustration', ...over }) as WsBlock

const tabelle = (over: Record<string, unknown> = {}): WsBlock =>
  ({ id: 't1', type: 'table', title: 'Notizen', headers: ['A', 'B'], rows: [['', '']], ...over }) as WsBlock

const aufgabe = (id = 'a1'): WsBlock =>
  ({
    id,
    type: 'task',
    instruction: '**Schreibe** einen Bericht.',
    operator: 'schreiben',
    afbReason: '',
    socialForm: 'EA',
    answer: { ...emptyAnswer(), kind: 'lines', count: 20 },
    parts: [],
    solution: '',
    points: 10,
    minutes: 20
  }) as WsBlock

describe('Anordnung neben den Schreiblinien', () => {
  it('stellt ein Verständnisbild wie bisher rechts neben die Aufgabe', () => {
    // Ohne ausdrückliche Angabe bleibt das bisherige Verhalten erhalten
    expect(seiteVon(bild())).toBe('right')
    const [eintrag] = blockLayout([bild(), aufgabe()])
    expect(eintrag.block.type).toBe('task')
    expect(eintrag.side?.type).toBe('image')
    expect(eintrag.sideAt).toBe('right')
  })

  it('stellt ein Bild auf Wunsch nach links', () => {
    const [eintrag] = blockLayout([bild({ side: 'left' }), aufgabe()])
    expect(eintrag.sideAt).toBe('left')
  })

  it('stellt ein Bild auf Wunsch untereinander – auch ein Verständnisbild', () => {
    expect(seiteVon(bild({ side: 'none' }))).toBeUndefined()
    const teile = blockLayout([bild({ side: 'none' }), aufgabe()])
    expect(teile).toHaveLength(2)
    expect(teile[0].side).toBeUndefined()
  })

  it('stellt eine Tabelle neben die Aufgabe, wenn es so eingestellt ist', () => {
    /*
     * Der eigentliche Zugewinn: Eine Notizentabelle neben den Schreiblinien spart eine halbe
     * Seite. Ohne Angabe bleibt die Tabelle über die volle Breite – breite Tabellen neben
     * Linien wären unlesbar.
     */
    expect(seiteVon(tabelle())).toBeUndefined()
    const [eintrag] = blockLayout([tabelle({ side: 'left' }), aufgabe()])
    expect(eintrag.block.type).toBe('task')
    expect(eintrag.side?.type).toBe('table')
    expect(eintrag.sideAt).toBe('left')
  })

  it('stellt eine Bildreihe nie daneben', () => {
    // Die Einzelbilder einer Reihe werden nebeneinander verglichen – dafür braucht es Breite
    expect(seiteVon(bild({ items: [{ id: 'i1', caption: '', description: 'a' }], side: 'left' }))).toBeUndefined()
  })

  it('stellt nichts daneben, wenn kein passender Baustein folgt', () => {
    const teile = blockLayout([bild({ side: 'left' })])
    expect(teile).toHaveLength(1)
    expect(teile[0].side).toBeUndefined()
  })
})

describe('Bilder, die gewünscht sind, aber nicht entstehen', () => {
  const blatt = (blocks: WsBlock[]): Sheet => ({ id: 's1', label: '', blocks }) as Sheet

  it('schweigt, solange die KI selbst entscheiden soll', () => {
    const meta = { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), pages: 1 }
    expect(checkImageWish(blatt([aufgabe()]), meta)).toHaveLength(0)
  })

  it('meldet, wenn trotz Wunsch kein Bild eingeplant wurde', () => {
    /*
     * Der stille Fall: Bildersuche und KI-Erzeugung arbeiten einwandfrei – sie bekommen nur
     * nichts zu tun, weil die Gliederung keinen Bild-Baustein vorsah. Auf dem Blatt sieht
     * das aus wie ein Fehler der Bilderzeugung.
     */
    const meta = { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), pages: 1, imageAmount: 'min1' as const }
    const warnungen = checkImageWish(blatt([aufgabe()]), meta)
    expect(warnungen).toHaveLength(1)
    expect(warnungen[0].message).toContain('kein Bild')
  })

  it('meldet auch zu wenige Bilder bei mehreren Seiten', () => {
    const meta = { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), pages: 3, imageAmount: 'min1' as const }
    expect(checkImageWish(blatt([bild(), aufgabe()]), meta)[0].message).toContain('1 Bilder')
  })

  it('schweigt, wenn genug Bilder da sind', () => {
    const meta = { ...defaultMeta('NI', 'gymnasium', 'Gymnasium'), pages: 1, imageAmount: 'min1' as const }
    expect(checkImageWish(blatt([bild(), aufgabe()]), meta)).toHaveLength(0)
  })
})

describe('Frei auf die Seite gezogene Bausteine', () => {
  /*
   * Ausdrücklicher Wunsch der Lehrkraft (24.09.2026): „es soll überall von hand gehen
   * (drag and drop)". Ein frei gezogener Baustein verlässt den automatischen Satz – genau
   * das muss hier festgehalten werden, denn es ist der Preis der freien Platzierung.
   */
  const frei = { page: 2, x: 30, y: 40, width: 35 }

  it('nimmt einen frei gezogenen Baustein aus dem Fluss', () => {
    expect(istFrei(bild({ free: frei }))).toBe(true)
    const teile = blockLayout([bild({ free: frei }), aufgabe()])
    expect(teile).toHaveLength(1)
    expect(teile[0].block.type).toBe('task')
    expect(teile[0].side).toBeUndefined()
  })

  it('stellt einen frei gezogenen Baustein nie daneben', () => {
    // Beides zugleich ginge nicht: „daneben" ist eine Aussage über den Fluss
    expect(seiteVon(bild({ free: frei, side: 'left' }))).toBeUndefined()
    expect(blockLayout([bild({ free: frei, side: 'left' }), aufgabe()])[0].side).toBeUndefined()
  })

  it('behält ihn für den Word-Export im Fluss', () => {
    /*
     * Word setzt die Seiten selbst und kennt unsere Seitennummern nicht. Würde der Baustein
     * dort ebenfalls aus dem Fluss genommen, fehlte er in der Word-Datei ersatzlos – ein
     * stiller Verlust, den man erst beim Ausdrucken bemerkt.
     */
    const teile = blockLayout([bild({ free: frei }), aufgabe()], false, true)
    expect(teile.map((t) => t.block.type)).toContain('image')
  })

  it('reiht ihn nach dem Entfernen der Lage wieder ein', () => {
    expect(istFrei(bild())).toBe(false)
    expect(blockLayout([bild(), aufgabe()])[0].side?.type).toBe('image')
  })
})
