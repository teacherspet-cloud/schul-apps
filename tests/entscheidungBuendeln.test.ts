import { describe, expect, it } from 'vitest'
import { buendeln, einordnen } from '../src/renderer/src/modules/onlinetest/entscheidungBuendeln'
import { urteileAus } from '../src/renderer/src/modules/onlinetest/kiBewertung'

/* „Zu entscheiden" gebündelt (06.10.2026) */
const fall = (id: string, antwort: string, loesung: string, extra = {}) => ({
  schluessel: id,
  antwort,
  loesung,
  pruefen: 'kleinerFehler' as const,
  daten: id,
  ...extra
})

describe('Fehler bündeln', () => {
  it('ordnet ohne KI-Angabe nach einfachem Vergleich ein', () => {
    expect(einordnen(fall('a', 'dgo', 'dog'))).toEqual({ gruppe: 'rechtschreibung', art: 'Buchstaben vertauscht' })
    expect(einordnen(fall('b', 'London', 'london'))).toMatchObject({ gruppe: 'grossklein' })
    expect(einordnen(fall('c', 'recieve', 'receive'))).toMatchObject({ gruppe: 'rechtschreibung' })
    expect(einordnen(fall('d', 'big', 'large', { pruefen: 'sinnvoll' }))).toMatchObject({ gruppe: 'wortwahl' })
  })
  it('KI-Angabe gewinnt; gleiche Fehler stehen zusammen, größte Gruppe zuerst', () => {
    const g = buendeln([
      fall('1', 'goed', 'went', { fehlerGruppe: 'endung', fehlerArt: 'unregelmäßige Vergangenheit' }),
      fall('2', 'goed', 'went', { fehlerGruppe: 'endung', fehlerArt: 'Unregelmäßige Vergangenheit' }),
      fall('3', 'buyed', 'bought', { fehlerGruppe: 'endung', fehlerArt: 'unregelmäßige Vergangenheit' }),
      fall('4', 'dgo', 'dog')
    ])
    expect(g.map((x) => [x.gruppe, x.anzahl])).toEqual([
      ['endung', 3],
      ['rechtschreibung', 1]
    ])
    expect(g[0].arten).toHaveLength(1)
    expect(g[0].arten[0].buendel[0].faelle.map((f) => f.daten)).toEqual(['1', '2'])
  })
  it('liest Gruppe und Art aus der KI-Antwort, unbekannte Gruppen fallen weg', () => {
    const u = urteileAus(
      {
        urteile: [
          { id: 'A1', urteil: 'kleinerFehler', begruendung: 'x', fehlerGruppe: 'grammatik', fehlerArt: '3. Person -s fehlt' },
          { id: 'A2', urteil: 'kleinerFehler', begruendung: 'x', fehlerGruppe: 'quatsch', fehlerArt: '' }
        ]
      },
      [
        { id: 'A1', frage: '', erwartung: '', antwort: '' },
        { id: 'A2', frage: '', erwartung: '', antwort: '' }
      ]
    )
    expect(u.get('A1')).toMatchObject({ fehlerGruppe: 'grammatik', fehlerArt: '3. Person -s fehlt' })
    expect(u.get('A2')?.fehlerGruppe).toBeUndefined()
  })
})
