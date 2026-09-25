import { describe, expect, it } from 'vitest'
import { istLeer, newBlock } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { WsBlockType } from '../src/renderer/src/modules/arbeitsblatt/model/types'

/*
 * Wunsch der Lehrkraft (25.09.2026): „füge einen zauberstab in ‚bearbeiten & export' bei einem
 * noch leeren baustein hinzu, wodurch der inhalt hier von einer KI gefüllt wird."
 *
 * Damit der Zauberstab am richtigen Baustein erscheint, muss „leer" genau bestimmt sein: Ein
 * frisch eingefügter Merkkasten trägt schon die Überschrift „Merke", ein Lernziel-Baustein die
 * Zeile „Ich kann …". Beides kommt aus `newBlock` und sagt nichts über den Inhalt.
 */
describe('Ein Baustein ohne Inhalt', () => {
  const frisch = (type: WsBlockType) => newBlock(type)

  it('erkennt jeden frisch eingefügten Baustein als leer', () => {
    const fuellbar: WsBlockType[] = ['learningGoals', 'infoBox', 'text', 'phrases', 'image', 'task', 'scaffold', 'table', 'audio', 'selfCheck']
    for (const type of fuellbar) {
      expect(istLeer(frisch(type)), `${type} sollte leer sein`).toBe(true)
    }
  })

  it('lässt sich von den Platzhaltern aus `newBlock` nicht täuschen', () => {
    // „Merke", „Das lernst du", „Ich kann …" stehen schon da, bevor jemand etwas geschrieben hat
    const kasten = frisch('infoBox')
    expect(kasten.type === 'infoBox' && kasten.title).toBe('Merke')
    expect(istLeer(kasten)).toBe(true)
  })

  it('erkennt einen gefüllten Baustein', () => {
    const text = frisch('text')
    if (text.type !== 'text') throw new Error('falscher Typ')
    text.body = 'Die Versammlung beriet über den Antrag.'
    expect(istLeer(text)).toBe(false)
  })

  it('zählt eine ausgefüllte Aufgabe als gefüllt – auch nur über die Teilaufgaben', () => {
    const task = frisch('task')
    if (task.type !== 'task') throw new Error('falscher Typ')
    expect(istLeer(task)).toBe(true)
    task.parts = [{ id: 'a', instruction: 'Nenne drei Gründe.', answer: { kind: 'lines', count: 3 } } as never]
    expect(istLeer(task)).toBe(false)
  })

  it('hält eine Tabelle mit Spaltenköpfen, aber leeren Zeilen für leer', () => {
    // Die Köpfe „Spalte 1/2" kommen aus `newBlock`; gefüllt ist sie erst mit Zeileninhalt
    const tabelle = frisch('table')
    expect(istLeer(tabelle)).toBe(true)
    if (tabelle.type !== 'table') throw new Error('falscher Typ')
    tabelle.rows = [['Ursache', 'Folge']]
    expect(istLeer(tabelle)).toBe(false)
  })

  it('bietet nichts an, wo es nichts zu füllen gibt', () => {
    /*
     * Schreibraum, Gitternetz und Trennlinie sind bewusst leer – ein Zauberstab daran wäre
     * ein Versprechen, das die KI nicht einlösen kann. Beim Film gilt dasselbe: Eine erfundene
     * Fundstelle wäre schlimmer als ein leeres Feld.
     */
    for (const type of ['workspace', 'grid', 'divider', 'video'] as WsBlockType[]) {
      expect(istLeer(frisch(type)), `${type} sollte keinen Zauberstab bekommen`).toBe(false)
    }
  })
})
