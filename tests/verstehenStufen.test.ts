import { describe, expect, it } from 'vitest'
import {
  istStufe,
  pruefeDeckel,
  stufeAus,
  stufenVorschlag,
  STUFEN_VERTEILUNGEN,
  verteileAufStufen
} from '../src/renderer/src/shared/verstehen/stufen'
import { optionImText, pruefeAufgabeStufen, pruefeStufe, schaetzeStufe, type PruefItem } from '../src/renderer/src/shared/verstehen/pruefung'
import { stufenRaster, zusatzfragenRegeln } from '../src/renderer/src/shared/verstehen/regeln'
import { stufenZeile } from '../src/renderer/src/shared/verstehen/anzeige'
import { checkDemand } from '../src/renderer/src/modules/arbeitsblatt/didactics/demand'
import { emptyAnswer } from '../src/renderer/src/modules/arbeitsblatt/model/factory'
import type { TaskBlock } from '../src/renderer/src/modules/arbeitsblatt/model/types'
import { scriptForSheet, skriptAusBaustein } from '../src/renderer/src/modules/arbeitsblatt/generation/listening'
import { trueFalseZugelassen } from '../src/renderer/src/modules/arbeitsblatt/didactics/listeningStates'

/*
 * Schwierigkeitsraster (Entscheidung der Lehrkraft, 29.09.2026) – Beispiel aus dem Bericht
 * recherche/hoerverstehen-schwierigkeit-2026-09-29.md, Abschnitt 2.3.
 */
const MIA =
  "Mia: The bus to the museum leaves at nine fifteen, so we should meet at the station at nine. Oh wait – Tom just texted, the museum doesn't open until ten on Saturdays. Let's say nine forty-five then. And bring some money, the café there isn't exactly cheap."

const mc = (stamm: string, optionen: string[], richtig: number, stufe?: 1 | 2 | 3 | 4 | 5): PruefItem => ({
  label: 'Frage 1',
  stamm,
  richtig: [optionen[richtig]],
  distraktoren: optionen.filter((_, i) => i !== richtig),
  stufe
})

const aufgabe = (patch: Partial<TaskBlock> = {}): TaskBlock => ({
  id: 't',
  type: 'task',
  instruction: '**Tick** the correct answer.',
  operator: 'tick',
  afbReason: '',
  socialForm: 'EA',
  answer: emptyAnswer('none'),
  parts: [],
  solution: '',
  points: 0,
  minutes: 5,
  skill: 'listening',
  ...patch
})

describe('Stufenraster', () => {
  it('kennt genau fünf Stufen', () => {
    expect([0, 1, 5, 6, 2.5].map(istStufe)).toEqual([false, true, true, false, false])
    expect(stufeAus('3')).toBe(3)
    expect(stufeAus(0)).toBeUndefined()
  })

  it('schlägt die Verteilung nach Jahrgang und Niveau vor', () => {
    expect(stufenVorschlag({ grade: 5 }).id).toBe('ka-5-6')
    expect(stufenVorschlag({ grade: 8 }).id).toBe('ka-7-8')
    expect(stufenVorschlag({ grade: 10, cefrLevel: 'B1' }).id).toBe('ka-9-10-msa')
    expect(stufenVorschlag({ grade: 10, cefrLevel: 'A2' }).id).toBe('ka-9-10-esa')
    expect(stufenVorschlag({ grade: 12 }).id).toBe('sek2')
    expect(stufenVorschlag({ grade: 8, einsatz: 'uebung' }).id).toBe('uebung')
    for (const v of STUFEN_VERTEILUNGEN) expect(v.anteile.reduce((a, b) => a + b, 0)).toBe(100)
  })

  it('verteilt eine Anzahl vollständig auf die Stufen', () => {
    const r = verteileAufStufen(7, [15, 35, 35, 15, 0])
    expect(r.reduce((a, b) => a + b, 0)).toBe(7)
    expect(r[4]).toBe(0)
  })

  it('deckelt „sehr leicht" auf ein Viertel aller Items', () => {
    // 4 vorhandene Items, davon 1 auf Stufe 1; 4 neue mit viel Stufe 1 gewünscht → höchstens 2 insgesamt
    const r = verteileAufStufen(4, [100, 0, 0, 0, 0], { deckel: 0.25, vorhanden: 4, vorhandenSehrLeicht: 1 })
    expect(r[0]).toBe(1)
    expect(r[1]).toBe(3)
    expect(pruefeDeckel([1, 1, 2, 3])).toContain('höchstens ein Viertel')
    expect(pruefeDeckel([1, 2, 3, 3])).toBeNull()
    expect(pruefeDeckel([1, 1, 1, 1], 'uebung')).toBeNull()
  })
})

describe('App-Prüfung der Stufe über die Wortgleichheit', () => {
  it('erkennt die wörtlich im Text stehende Option', () => {
    expect(optionImText('at the station', MIA).woertlich).toBe(true)
    expect(optionImText('at school', MIA).woertlich).toBe(false)
    expect(optionImText('expensive', MIA).anteil).toBe(0)
  })

  it('bestätigt Stufe 1, wenn die Lösung wörtlich steht und die Distraktoren nicht vorkommen', () => {
    const it1 = mc('Where do they meet?', ['at school', 'at the station', "at Tom's house"], 1, 1)
    expect(pruefeStufe(it1, MIA)).toEqual([])
    expect(schaetzeStufe(it1, MIA)).toBe(1)
  })

  it('meldet einen Distraktor mit Textwörtern bei Stufe 1 (Word-Spotting)', () => {
    const it1 = mc('Where do they meet?', ['at school', 'at the station', 'at the museum'], 1, 1)
    expect(pruefeStufe(it1, MIA).some((b) => /Distraktoren/.test(b.meldung))).toBe(true)
  })

  it('meldet Stufe 3, wenn die Lösung doch wörtlich im Text steht', () => {
    const it3 = mc('Where do they meet?', ['at school', 'at the station', 'at home'], 1, 3)
    expect(pruefeStufe(it3, MIA).some((b) => /Stufe 1/.test(b.meldung))).toBe(true)
  })

  it('lässt Stufe 3 mit Synonym und Word-Spotting-Distraktor in Ruhe', () => {
    const it3 = mc('The café at the museum is …', ['expensive', 'closed on Saturdays', 'new'], 0, 3)
    expect(pruefeStufe(it3, MIA)).toEqual([])
    // Distraktor teilt mehr Wörter mit dem Text als die richtige Option – Merkmal von Stufe 4
    expect(schaetzeStufe(it3, MIA)).toBe(4)
  })

  it('bewertet Items ohne Stufe nicht', () => {
    expect(pruefeStufe(mc('Where do they meet?', ['at school', 'at the station', 'at the museum'], 1), MIA)).toEqual([])
  })

  it('prüft Richtig/Falsch-Aussagen einzeln mit ihrer eigenen Stufe', () => {
    const block = aufgabe({
      answer: {
        ...emptyAnswer('trueFalse'),
        statements: [
          { text: 'The bus to the museum leaves at nine fifteen.', isTrue: true, stufe: 1 },
          { text: 'The bus to the museum leaves at nine fifteen.', isTrue: true, stufe: 4 }
        ]
      }
    })
    const befunde = pruefeAufgabeStufen(block, MIA)
    expect(befunde).toHaveLength(1)
    expect(befunde[0].stufe).toBe(4)
  })

  it('zeigt die Stufe nur als Lehrkraft-Zeile', () => {
    const block = aufgabe({
      parts: [
        { id: 'a', instruction: 'Where?', answer: emptyAnswer('lines'), solution: '', stufe: 1 },
        { id: 'b', instruction: 'Why?', answer: emptyAnswer('lines'), solution: '', stufe: 5 }
      ]
    })
    expect(stufenZeile(block)).toBe('Stufen: a) 1 · b) 5')
    expect(stufenZeile(aufgabe({ stufe: 3 }))).toBe('Stufe 3 (mittel)')
    expect(stufenZeile(aufgabe())).toBe('')
  })
})

describe('Wortgleichheit in demand.ts folgt der Stufe', () => {
  const material = {
    id: 'm',
    type: 'text' as const,
    title: 'M1',
    body: 'Viele Bewegungen wollten einen eigenen Staat gründen oder Menschen ihrer Nation in einem Staat vereinen.',
    glossary: [],
    lineNumbers: false,
    source: ''
  }
  const loesung = 'Viele Bewegungen wollten einen eigenen Staat gründen oder Menschen ihrer Nation in einem Staat vereinen.'
  const sheet = (t: TaskBlock) => ({ id: 's', label: 'Blatt', blocks: [material, t] }) as never

  it('meldet eine abgeschriebene Lösung bei ausgewiesener Stufe 3 auch ohne AFB II', () => {
    expect(checkDemand(sheet(aufgabe({ afb: 'I', solution: loesung, stufe: 3 })))).toHaveLength(1)
  })

  it('lässt sie bei Stufe 1–2 zu – auch wenn der AFB höher angesetzt ist', () => {
    expect(checkDemand(sheet(aufgabe({ afb: 'II', operator: 'Arbeite heraus', solution: loesung, stufe: 2 })))).toHaveLength(0)
  })
})

describe('Regeln für die KI', () => {
  it('nennen das Raster und den gewünschten Mix', () => {
    expect(stufenRaster()).toContain('Stufe 1 (sehr leicht)')
    const r = zusatzfragenRegeln([0, 2, 1, 0, 0], false)
    expect(r).toContain('GENAU 3 NEUE ITEMS')
    expect(r).toContain('KEINE Richtig/Falsch')
  })

  it('bindet den Stufenmix in den Auftrag zum fertigen Hörtext ein', () => {
    const skript = skriptAusBaustein({ title: 'Trip', textType: 'Gespräch', transcript: 'Mia: Hello.\nTom: Hi.', plays: 2, beforeListening: '' })
    expect(skript.speakers).toEqual(['Mia', 'Tom'])
    const auftrag = scriptForSheet(skript, [10, 30, 40, 20, 0])
    expect(auftrag).toContain('Stufe 3: 40 %')
    expect(auftrag).toContain('sehr leichte')
  })

  it('kennt das Verbot von Richtig/Falsch in der Oberstufe (KMK-Rahmen)', () => {
    expect(trueFalseZugelassen(undefined, 'sek2')).toBe(false)
    expect(trueFalseZugelassen(undefined, 'sek1')).toBe(true)
  })
})
