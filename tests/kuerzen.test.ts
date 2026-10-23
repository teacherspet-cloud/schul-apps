import { describe, expect, it } from 'vitest'
import { kuerzAnfrage, kuerzungAus, wendeKuerzungAn } from '../src/renderer/src/modules/arbeitsblatt/generation/kuerzen'
import type { Worksheet } from '../src/renderer/src/modules/arbeitsblatt/model/types'

/*
 * KI kürzt (23.10.2026): Aufgaben und Punkte bleiben, Zugaben fallen nur in ALLEN Fassungen weg (Nachtrag der Lehrkraft:
 * „bei A/B, A/B/C, A/B/C/D Tests … gleiche Anforderungen und Punktzahlen"), Quellentexte bleiben wörtlich.
 */
const task = (id: string, instruction: string) => ({ id, type: 'task', instruction, points: 4, answer: { kind: 'lines' }, parts: [] })
const ws = {
  sheets: [
    {
      id: 'a',
      label: 'Gruppe A',
      blocks: [
        { id: 'lz-a', type: 'learningGoals', title: 'Lernziele', goals: ['x'] },
        task('t1-a', 'Lies den Text genau und beschreibe dann bitte in eigenen Worten, was mit der Hauptfigur passiert.'),
        { id: 'q-a', type: 'text', title: 'Quelle', body: 'Originalzitat …', lineNumbers: true, source: 'Goethe' }
      ]
    },
    {
      id: 'b',
      label: 'Gruppe B',
      blocks: [
        { id: 'lz-b', type: 'learningGoals', title: 'Lernziele', goals: ['x'] },
        task('t1-b', 'Lies den Text genau und erkläre dann bitte in eigenen Worten, warum die Hauptfigur so handelt.'),
        { id: 'q-b', type: 'text', title: 'Quelle', body: 'Originalzitat …', lineNumbers: true, source: 'Goethe' }
      ]
    }
  ]
} as unknown as Worksheet

describe('KI-Kürzung', () => {
  it('Anfrage: Punkte sichtbar, Quellen unveränderlich, Regel für mehrere Fassungen', () => {
    const u = kuerzAnfrage(ws, 3).user
    expect(u).toContain('[t1-a] Aufgabe (4 P.)')
    expect(u).toContain('[q-a] Text – unveränderlich')
    expect(u).toContain('MEHRERE FASSUNGEN')
    expect(u).toContain('[lz-a] Lernziele – darf wegfallen')
  })
  it('nur erlaubte, kürzere Änderungen; Aufgaben und Quellen nie weg; Zugabe in allen Fassungen weg', () => {
    const k = kuerzungAus(ws, {
      aenderungen: [
        { blockId: 't1-a', feld: 'instruction', text: 'Beschreibe, was mit der Hauptfigur passiert.' },
        {
          blockId: 't1-b',
          feld: 'instruction',
          text: 'Ein viel längerer Text als vorher, der deshalb nicht übernommen werden darf, weil er gar nicht kürzer ist als das Original.'
        },
        { blockId: 'q-a', feld: 'body', text: 'kurz' },
        { blockId: 't1-a', feld: 'points', text: '1' }
      ],
      weglassen: ['lz-a', 't1-b', 'q-b']
    })
    expect(k.aenderungen.map((a) => a.blockId)).toEqual(['t1-a'])
    expect(k.weglassen.map((w) => w.blockId).sort()).toEqual(['lz-a', 'lz-b'])
    expect(new Set(k.weglassen.map((w) => w.gruppe)).size).toBe(1)
  })
  it('anwenden: über das ganze Dokument, Punkte unverändert', () => {
    const k = kuerzungAus(ws, { aenderungen: [{ blockId: 't1-a', feld: 'instruction', text: 'Beschreibe kurz.' }], weglassen: ['lz-b'] })
    const doc = { parts: [{ blocks: structuredClone(ws.sheets[0].blocks) }], varianten: [{ blocks: structuredClone(ws.sheets[1].blocks) }] }
    const neu = wendeKuerzungAn(doc, k)
    expect(neu.parts[0].blocks.map((b) => b.id)).toEqual(['t1-a', 'q-a'])
    expect(neu.varianten[0].blocks.map((b) => b.id)).toEqual(['t1-b', 'q-b'])
    expect((neu.parts[0].blocks[0] as { instruction: string; points: number }).instruction).toBe('Beschreibe kurz.')
    expect((neu.parts[0].blocks[0] as { points: number }).points).toBe(4)
    expect(doc.parts[0].blocks.length).toBe(3)
  })
})

describe('Probelauf mit echter KI (23.10.2026)', () => {
  it('von der App ergänzte Bausteine (Kopf, Operatorenliste) sind unveränderlich; Hilfen und Infokästen bleiben', () => {
    const blatt = {
      sheets: [
        {
          id: 'a',
          label: 'A',
          blocks: [
            { id: 'exam-head', type: 'infoBox', title: 'Exam – Group A', body: 'Name …' },
            { id: 'h1', type: 'scaffold', title: 'Hilfekarten', items: ['x'] },
            { id: 'i1', type: 'selfCheck', title: 'Wie gut kann ich das?', statements: ['x'] }
          ]
        },
        {
          id: 'b',
          label: 'B',
          blocks: [
            { id: 'exam-b-head', type: 'infoBox', title: 'Exam – Group B', body: 'Name …' },
            { id: 'div', type: 'divider', title: 'Gruppe B' },
            { id: 'h1-b', type: 'scaffold', title: 'Hilfekarten', items: ['x'] },
            { id: 'i1-b', type: 'selfCheck', title: 'Wie gut kann ich das?', statements: ['x'] }
          ]
        }
      ]
    } as unknown as Worksheet
    // Gespeichert sind nur die eigenen Bausteine – Kopf und Gruppenzeile setzt die App
    const quelle = {
      parts: [{ blocks: [blatt.sheets[0].blocks[1], blatt.sheets[0].blocks[2]], weitereFassungen: [[blatt.sheets[1].blocks[2], blatt.sheets[1].blocks[3]]] }]
    }
    expect(kuerzAnfrage(blatt, 3, quelle).user).toContain('[exam-head] Infokasten – unveränderlich')
    const k = kuerzungAus(blatt, { aenderungen: [{ blockId: 'exam-head', feld: 'body', text: 'N' }], weglassen: ['exam-head', 'h1', 'i1'] }, quelle)
    expect(k.aenderungen).toEqual([])
    // Entsprechung in B über „n-te Selbsteinschätzung“, nicht über die Stelle (B hat davor eine Zeile mehr)
    expect(k.weglassen.map((w) => w.blockId).sort()).toEqual(['i1', 'i1-b'])
    expect(kuerzungAus(blatt, { aenderungen: [], weglassen: ['exam-head'] }).weglassen).toEqual([])
  })
})
