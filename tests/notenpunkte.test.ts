import { describe, expect, it } from 'vitest'
import {
  KMK_PUNKTE_SCHWELLEN,
  ST_PUNKTE_SCHWELLEN,
  notenpunkteGelten,
  punkteFuerErreicht,
  punkteGrenzen,
  punkteNote,
  punkteRegelFuer,
  punkteZeile,
  punkteZeilen
} from '../src/renderer/src/shared/notenpunkte'

describe('Notenpunkte 0–15 (Sekundarstufe II)', () => {
  it('ordnet Punkte den Noten mit Tendenz zu (KMK)', () => {
    expect(punkteNote(15)).toBe('1+')
    expect(punkteNote(14)).toBe('1')
    expect(punkteNote(13)).toBe('1−')
    expect(punkteNote(10)).toBe('2−')
    expect(punkteNote(5)).toBe('4')
    expect(punkteNote(1)).toBe('5−')
    expect(punkteNote(0)).toBe('6')
  })

  it('rechnet das KMK-Raster auf 60 Bewertungseinheiten um (Sachsen: 60–57 = 15)', () => {
    const g = punkteGrenzen(60)
    expect(g[0]).toMatchObject({ punkte: 15, percent: 95, fromPoints: 57 })
    expect(g[1].fromPoints).toBe(54)
    expect(g.find((x) => x.punkte === 5)?.fromPoints).toBe(27)
    expect(g.find((x) => x.punkte === 1)?.fromPoints).toBe(12)
    expect(g[15]).toMatchObject({ punkte: 0, fromPoints: 0 })
  })

  it('rundet die Punktgrenze AUF – der Prozentsatz muss erreicht sein', () => {
    // 47 Punkte, 20 % = 9,4 → erst 10 Punkte erreichen 20 %
    expect(punkteGrenzen(47).find((x) => x.punkte === 1)?.fromPoints).toBe(10)
    // Fließkommarest: 0,95 × 20 = 19,000000000000004 bleibt 19
    expect(punkteGrenzen(20)[0].fromPoints).toBe(19)
  })

  it('findet die Notenpunkte zu einer erreichten Punktzahl', () => {
    expect(punkteFuerErreicht(57, 60).punkte).toBe(15)
    expect(punkteFuerErreicht(56, 60).punkte).toBe(14)
    expect(punkteFuerErreicht(11, 60).punkte).toBe(0)
  })

  it('Sachsen-Anhalt hat eigene, um 1 % höhere Schwellen', () => {
    expect(punkteRegelFuer('ST').schwellen).toBe(ST_PUNKTE_SCHWELLEN)
    expect(punkteRegelFuer('ST').verbindlich).toBe(true)
    expect(punkteRegelFuer('NI').schwellen).toBe(KMK_PUNKTE_SCHWELLEN)
    expect(punkteRegelFuer('NI').verbindlich).toBe(false)
    expect(punkteRegelFuer('HE').verbindlich).toBe(true)
    expect(punkteRegelFuer('BB').verbindlich).toBe(true)
  })

  it('gilt in der Qualifikationsphase, in der Einführungsphase nur in HE/BE/RP, nie in der Sek I', () => {
    expect(notenpunkteGelten(12, 'gymnasium', 'NI')).toBe(true)
    expect(notenpunkteGelten(13, 'gymnasium', 'NI')).toBe(true)
    // Einführungsphase Klasse 11 (G9): Niedersachsen und Bayern geben noch Noten
    expect(notenpunkteGelten(11, 'gymnasium', 'NI')).toBe(false)
    expect(notenpunkteGelten(11, 'gymnasium', 'BY')).toBe(false)
    // Hessen: Punkte schon in der Einführungsphase
    expect(notenpunkteGelten(11, 'gymnasium', 'HE')).toBe(true)
    // G8 (Berlin): Klasse 10 = Einführungsphase, Berlin gibt dort Punkte; Klasse 11 = Q-Phase
    expect(notenpunkteGelten(10, 'gymnasium', 'BE')).toBe(true)
    expect(notenpunkteGelten(11, 'gymnasium', 'BE')).toBe(true)
    // Sek I
    expect(notenpunkteGelten(10, 'gymnasium', 'NI')).toBe(false)
    expect(notenpunkteGelten(9, 'gymnasium', 'HE')).toBe(false)
  })

  it('Zeile und Tabelle für Kopf und Lösungsblatt', () => {
    const zeile = punkteZeile(60)
    expect(zeile.startsWith('15 P ab 57 · 14 ab 54')).toBe(true)
    expect(zeile.endsWith('1 ab 12')).toBe(true)
    const zeilen = punkteZeilen(60)
    expect(zeilen).toHaveLength(16)
    expect(zeilen[0]).toEqual({ punkte: '15', note: '1+', range: '57 – 60', percent: 'ab 95 %' })
    expect(zeilen[15]).toEqual({ punkte: '0', note: '6', range: '0 – 11', percent: 'unter 20 %' })
  })
})
