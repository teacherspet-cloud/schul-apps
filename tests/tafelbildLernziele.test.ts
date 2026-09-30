import { describe, expect, it } from 'vitest'
import {
  lernzielAnfrage,
  lernzielBefunde,
  lernzieleAus,
  lernzielEntfernen,
  lernzielGewaehlt,
  lernzielOperatoren,
  lernzielUebernehmen,
  lernzielZeilen
} from '../src/renderer/src/modules/tafelbild/lernziele'
import { leeresTafelbild, type TafelbildMeta } from '../src/renderer/src/modules/tafelbild/model'
import { elementAnfrage, inhaltAnfrage, inhaltAus } from '../src/renderer/src/modules/tafelbild/prompt'
import { pruefeAlle } from '../src/renderer/src/modules/tafelbild/pruefung'
import { NETZ } from './tafelbildBeispiele'

/*
 * Lernziele vor der Erstellung (Wunsch der Lehrkraft, 30.09.2026): „Vor der Erstellung kann man die
 * Lernziele des Tafelbilds nicht wie bei Arbeitsblättern z. B. von einer KI generieren lassen."
 * Mehrere operatorisierte Vorschläge (Operatorenliste des Landes, AFB-Mischung der Lerngruppe),
 * zum Anklicken; die gewählten Ziele steuern Erzeugung und Prüfung.
 */

const meta = (o: Partial<TafelbildMeta> = {}): TafelbildMeta => ({
  ...leeresTafelbild({ stateId: 'NI', subjectId: 'geschichte', subjectLabel: 'Geschichte', grade: 9 }).meta,
  thema: 'Scheitern der Weimarer Republik',
  ...o
})

describe('Lernziele vorschlagen', () => {
  it('Anfrage nennt Lerngruppe, Land, Operatoren der Landesliste, AFB-Mischung und Material', () => {
    const a = lernzielAnfrage(meta(), [{ name: 'M1 Karikatur', text: 'Die Karikatur zeigt die Dolchstoßlegende.' }], ['die Ursachen erläutern'])
    expect(a.schemaName).toBe('tafelbild_lernziele')
    expect(a.system).toContain('Klasse 9')
    expect(a.system).toContain('Niedersachsen')
    expect(a.system).toContain('Kerncurriculum')
    // Operatoren aus der Liste des Landes mit AFB
    expect(a.system).toContain('erläutern (AFB II)')
    expect(a.system).toContain('beurteilen (AFB III)')
    expect(a.system).toMatch(/\d+ % AFB I, \d+ % AFB II, \d+ % AFB III/)
    expect(a.system).toContain('mindestens ein Ziel je Bereich')
    expect(a.user).toContain('Scheitern der Weimarer Republik')
    expect(a.user).toContain('Dolchstoßlegende')
    expect(a.user).toContain('Schon gewählt')
  })

  it('liest die Antwort: Operator aus der Landesliste bestimmt den AFB, fremde Operatoren und Dubletten fallen weg', () => {
    const { operatoren } = lernzielOperatoren(meta())
    const v = lernzieleAus(
      {
        vorschlaege: [
          { text: 'Die Schülerinnen und Schüler können die Ursachen der Hyperinflation 1923 erläutern', operator: 'erläutern', afb: 'I', bereich: 'Sachkompetenz' },
          { text: 'die Bedeutung von Artikel 48 für das Ende der Republik beurteilen', operator: 'beurteilen', afb: 'III', bereich: 'Urteilskompetenz' },
          { text: 'wichtige Ereignisse 1918–1933 in eine Zeitleiste einordnen', operator: '', afb: 'II', bereich: 'Orientierungskompetenz' },
          { text: 'die Weimarer Republik verstehen', operator: 'verstehen', afb: 'I', bereich: '' },
          { text: 'die Bedeutung von Artikel 48 für das Ende der Republik beurteilen', operator: 'beurteilen', afb: 'III', bereich: '' }
        ]
      },
      operatoren
    )
    expect(v.map((x) => x.text)).toEqual([
      'die Ursachen der Hyperinflation 1923 erläutern',
      'die Bedeutung von Artikel 48 für das Ende der Republik beurteilen',
      'wichtige Ereignisse 1918–1933 in eine Zeitleiste einordnen'
    ])
    // AFB nach der Liste des Landes, nicht nach der Angabe der KI
    expect(v.map((x) => x.afb)).toEqual([2, 3, 2])
    expect(v[2].operator).toBe('einordnen')
  })

  it('ein Klick übernimmt ein Ziel als Zeile, ein zweiter nimmt es wieder heraus', () => {
    const v = { text: 'die Ursachen erläutern' }
    let feld = lernzielUebernehmen('eigenes Ziel', v)
    expect(lernzielZeilen(feld)).toEqual(['eigenes Ziel', 'die Ursachen erläutern'])
    expect(lernzielGewaehlt(feld, v)).toBe(true)
    // nicht doppelt
    expect(lernzielUebernehmen(feld, v)).toBe(feld)
    feld = lernzielEntfernen(feld, v)
    expect(lernzielZeilen(feld)).toEqual(['eigenes Ziel'])
  })
})

describe('Lernziele steuern Erzeugung und Prüfung', () => {
  it('Auftrag an die KI: Ziele verbindlich, Merksatz sichert das Ergebnis zum Lernziel', () => {
    const m = meta({ lernziel: 'die Ursachen der Hyperinflation erläutern\ndie Rolle von Artikel 48 beurteilen' })
    const a = inhaltAnfrage(m, [], [])
    expect(a.user).toContain('LERNZIELE (verbindlich)')
    expect(a.user).toContain('- die Ursachen der Hyperinflation erläutern')
    expect(a.user).toContain('Merksatz hält das Ergebnis zum wichtigsten Lernziel fest')
    const i = inhaltAus(NETZ, m)
    const e = elementAnfrage(m, { id: 'x', typ: 'kasten', x: 0, y: 0, w: 0.2, h: 0.2, titel: 'Politik', text: '• a', farbe: 'grund', schritt: 1 }, [], 'ueberarbeiten', '')
    expect(e.user).toContain('Lernziele: die Ursachen der Hyperinflation erläutern; die Rolle von Artikel 48 beurteilen')
    expect(i.knoten.length).toBeGreaterThan(0)
  })

  it('Prüfung: ein Lernziel ohne Entsprechung im Tafelbild und ein Merksatz ohne Bezug werden gemeldet', () => {
    const m = meta()
    const i = inhaltAus(NETZ, m)
    // Netz: Versailler Vertrag, Inflation 1923, Artikel 48 … – Merksatz „mehrere Ursachen"
    expect(lernzielBefunde(i, 'die Ursachen des Scheiterns erläutern\ndie Rolle von Artikel 48 beurteilen')).toEqual([])
    const b = lernzielBefunde(i, 'die Rolle der Frauenbewegung beschreiben')
    expect(b.some((x) => x.includes('Frauenbewegung'))).toBe(true)
    expect(b.some((x) => x.includes('Merksatz passt zu keinem'))).toBe(true)
    const alle = pruefeAlle([], { grade: 9, regler: m.regler, inhalt: i, lernziel: 'die Rolle der Frauenbewegung beschreiben' })
    expect(alle.some((x) => x.text.includes('wird im Tafelbild nicht gesichert'))).toBe(true)
  })
})
