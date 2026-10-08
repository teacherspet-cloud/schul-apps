import { describe, expect, it } from 'vitest'
import { diagnoseAbschliessen, diagnoseAnfrage, diagnoseVorpruefen } from '../src/shared/diagnoseAuswertung'
import type { DiagnoseFrage } from '../src/shared/reihe'
import { naechsterSchritt, schrittErledigt, schrittZiel, schrittZumLink } from '../src/shared/reiheWeiter'

/*
 * Diagnose (08.10.2026): je Frage ✓/✗ mit richtiger Antwort; Auswahl und wortgleiche Antworten ohne KI, abweichende
 * freie Antworten prüft die KI kurz; Prozent aus beidem. Dazu „Weiter: <nächster Schritt>" auf dem Weg.
 */
const fragen: DiagnoseFrage[] = [
  { frage: 'Simple past von go?', optionen: [], richtig: 'went' },
  { frage: 'Wie viele Beine hat eine Spinne?', optionen: ['6', '8'], richtig: '8' },
  { frage: 'Was ist eine Ursache?', optionen: [], richtig: 'ein Grund für ein Ereignis' },
  { frage: 'Hauptstadt von Frankreich?', optionen: [], richtig: 'Paris' }
]

describe('Diagnose auswerten', () => {
  it('Vorprüfung: Auswahl und wortgleiche Antworten ohne KI, nur abweichende freie Antworten an die KI', () => {
    const antworten = { '0': ' Went. ', '1': '6', '2': 'der Grund, warum etwas passiert', '3': '' }
    const vor = diagnoseVorpruefen(fragen, antworten)
    expect(vor.offen).toEqual([2])
    expect(vor.ergebnis[0]).toEqual({ antwort: 'Went.', loesung: 'went', richtig: true })
    expect(vor.ergebnis[1]).toEqual({ antwort: '6', loesung: '8', richtig: false })
    expect(vor.ergebnis[3]?.richtig).toBe(false)
    const anfrage = diagnoseAnfrage(fragen, antworten, vor.offen, { fach: 'Englisch', jahrgang: 6 })
    expect(anfrage.schemaName).toBe('reihe_diagnose_pruefung')
    expect(anfrage.user).toContain('FRAGE 3')
    expect(anfrage.user).not.toContain('FRAGE 1:')
    // KI hält die freie Antwort für richtig → 2 von 4
    const aus = diagnoseAbschliessen(fragen, antworten, vor, { antworten: [{ nr: 3, richtig: true, hinweis: 'Passt inhaltlich.' }] })
    expect(aus.prozent).toBe(50)
    expect(aus.ergebnis[2]).toEqual({ antwort: 'der Grund, warum etwas passiert', loesung: 'ein Grund für ein Ereignis', richtig: true, ki: true, hinweis: 'Passt inhaltlich.' })
  })

  it('ohne KI-Urteil zählt eine abweichende freie Antwort als falsch; Alternativen mit „/"', () => {
    const f: DiagnoseFrage[] = [{ frage: 'Plural von child?', optionen: [], richtig: 'children/childs' }]
    const vor = diagnoseVorpruefen(f, { '0': 'kids' })
    const aus = diagnoseAbschliessen(f, { '0': 'kids' }, vor)
    expect(aus.prozent).toBe(0)
    expect(aus.ergebnis[0].loesung).toBe('children oder childs')
    expect(diagnoseVorpruefen(f, { '0': 'Children' }).ergebnis[0]?.richtig).toBe(true)
  })
})

describe('Weiter auf dem Weg', () => {
  const schritte = [
    { id: 'a', titel: 'Blatt', link: '/s/b/abc123abc123' },
    { id: 'b', titel: 'Zusatz', rolle: 'forder' },
    { id: 'c', titel: 'Lernkarten', rolle: 'pflicht' },
    { id: 'd', titel: 'Selbsteinschätzung', link: '/s/b/def456def456', inhalt: { art: 'arbeitsblatt', zweck: 'reflexion' } }
  ]
  it('nächster offener Schritt nach dem aktuellen, Pflicht vor Zusatz; sonst der erste offene davor', () => {
    const lagen = [
      { id: 'a', status: 'geschafft' as const },
      { id: 'b', status: 'offen' as const },
      { id: 'c', status: 'offen' as const },
      { id: 'd', status: 'gesperrt' as const }
    ]
    expect(naechsterSchritt(schritte, lagen, 'a')?.id).toBe('c')
    expect(naechsterSchritt(schritte, lagen, 'c')?.id).toBe('b')
    expect(naechsterSchritt(schritte, lagen.map((l) => ({ ...l, status: l.id === 'a' ? ('nicht_geschafft' as const) : ('geschafft' as const) })), 'd')?.id).toBe('a')
    expect(naechsterSchritt(schritte, lagen.map((l) => ({ ...l, status: 'geschafft' as const })))).toBeNull()
  })
  it('Ziel: Blatt direkt mit Rückweg, Selbsteinschätzung über die Schrittseite; Schritt zum Blatt finden', () => {
    expect(schrittZiel('z1', schritte[0])).toBe('/s/b/abc123abc123?reihe=z1')
    expect(schrittZiel('z1', schritte[3])).toBe('/s/r/z1/d')
    expect(schrittZiel('z1', schritte[2])).toBe('/s/r/z1/c')
    expect(schrittZumLink(schritte, '/s/b/abc123abc123?reihe=z1')?.id).toBe('a')
    expect(schrittErledigt({ status: 'eingereicht', wartet: true })).toBe(true)
    expect(schrittErledigt({ status: 'offen' })).toBe(false)
  })
})
