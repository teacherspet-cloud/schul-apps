/**
 * Alternativlösungen (25.10.2026, Befund der Lehrkraft: bei „It is said / believed / thought that …" galt nur eine
 * Fassung): Zusammenführen ohne Doppelte, Passung je Aufgabenart, der KI-Auftrag „Nachtragen" lässt Aufgaben und
 * Kennungen unverändert und erweitert nur `loesungen`; die Erzeugungs-Prompts tragen die Lösungsregel.
 */
import { describe, expect, it } from 'vitest'
import type { StructuredRequest } from '../src/shared/types'
import { alternativePasst, loesungenZusammenfuehren, LOESUNGEN_REGEL, type BankAufgabe } from '../src/shared/grammatikBank'
import { ergaenzeAlternativen, erzeugeBankAufgaben } from '../src/renderer/src/modules/lernen/grammatikBankErzeugen'

const aufgabe = (id: string, art: BankAufgabe['art'], satz: string, loesungen: string[], extra: Partial<BankAufgabe> = {}): BankAufgabe => ({
  id,
  art,
  regelId: 'r',
  anweisung: 'Setze ein.',
  satz,
  loesungen,
  uebung: 'bilden',
  ...extra
})

describe('Alternativlösungen', () => {
  it('führt Lösungen ohne Doppelte zusammen – verglichen wie beim Prüfen der Antwort', () => {
    expect(loesungenZusammenfuehren(['It is said'], ["It's said", 'it is said.', 'IT IS SAID', '', 'He ___ said'])).toEqual(['It is said', "It's said"])
    expect(loesungenZusammenfuehren(['a'], ['b', 'c', 'd'], 3)).toEqual(['a', 'b', 'c'])
    // Die erste Lösung bleibt die Musterlösung
    expect(loesungenZusammenfuehren(['He is said to be rich.'], ['It is said that he is rich.'])[0]).toBe('He is said to be rich.')
  })

  it('lässt bei Lücken keine ganzen Sätze zu, bei Umformen keine Einzelwörter', () => {
    expect(alternativePasst({ art: 'luecke', loesungen: ['It is said'] }, "It's said")).toBe(true)
    expect(alternativePasst({ art: 'luecke', loesungen: ['It is said'] }, 'It is said that this road becomes dangerous in winter')).toBe(false)
    expect(alternativePasst({ art: 'umformen', loesungen: ['He is said to be rich.'] }, 'It is said that he is rich.')).toBe(true)
    expect(alternativePasst({ art: 'umformen', loesungen: ['He is said to be rich.'] }, 'rich')).toBe(false)
    expect(alternativePasst({ art: 'fehler', loesungen: ['goes'] }, 'is going')).toBe(true)
  })

  it('trägt weitere Lösungen nach, ohne Aufgaben oder Kennungen zu ändern; Auswahl bleibt außen vor', async () => {
    const anfragen: StructuredRequest[] = []
    const ai = async <T>(req: StructuredRequest): Promise<T> => {
      anfragen.push(req)
      // Die KI nennt eine Kurzform, eine gleichwertige Umformung, einen Doppelgänger und einen ganzen Satz für eine Lücke
      return {
        aufgaben: [
          { nr: 1, weitere: ["It's said", 'it is said', 'It is said that the museum closes early.'] },
          { nr: 2, weitere: ['It is said that he is rich.'] }
        ]
      } as T
    }
    const aufgaben = [
      aufgabe('b1', 'luecke', '___ that the museum closes early.', ['It is said'], { vorgabe: 'say' }),
      aufgabe('b2', 'umformen', 'People say that he is rich.', ['He is said to be rich.'], { vorgabe: 'Beginne mit „He …“' }),
      aufgabe('b3', 'auswahl', '___ the castle is old.', ['It is said that'], { optionen: ['It is said that', 'It says that'] })
    ]
    const r = await ergaenzeAlternativen({ fach: 'Englisch', sprache: 'en', jahrgang: 10, titel: 'Passiv mit Verben des Sagens', aufgaben }, ai)
    expect(anfragen).toHaveLength(1)
    expect(anfragen[0].schemaName).toBe('grammatik_alternativen')
    expect(anfragen[0].user).toContain('1. [luecke]')
    expect(anfragen[0].user).not.toContain('[auswahl]')
    expect(r.geprueft).toBe(2)
    expect(r.betroffen).toBe(2)
    expect(r.ergaenzt).toBe(2)
    expect(r.aufgaben.map((a) => a.id)).toEqual(['b1', 'b2', 'b3'])
    expect(r.aufgaben[0].loesungen).toEqual(['It is said', "It's said"])
    expect(r.aufgaben[1].loesungen).toEqual(['He is said to be rich.', 'It is said that he is rich.'])
    expect(r.aufgaben[2]).toEqual(aufgaben[2])
    // Nichts Neues: unverändert
    const leer = await ergaenzeAlternativen({ fach: 'Englisch', sprache: 'en', jahrgang: 10, titel: 'x', aufgaben }, async <T>() => ({ aufgaben: [] } as T))
    expect(leer.ergaenzt).toBe(0)
    expect(leer.aufgaben).toEqual(aufgaben)
  })

  it('verlangt beim Erzeugen neuer Aufgaben alle gleichwertigen Lösungen', async () => {
    const anfragen: StructuredRequest[] = []
    const ai = async <T>(req: StructuredRequest): Promise<T> => {
      anfragen.push(req)
      if (req.schemaName === 'grammatik_pruefung') return { urteile: [] } as T
      return { regel: { titel: 'r', erklaerung: 'e', beispiele: [] }, aufgaben: [] } as T
    }
    await erzeugeBankAufgaben(
      {
        schluessel: 'en.verb.passive_reporting/it-is-said',
        titel: 'It is said that',
        fach: 'Englisch',
        sprache: 'en',
        jahrgang: 10,
        uebungen: ['bilden'],
        anzahl: 2,
        themenIds: ['en.verb.passive_reporting'],
        vorhanden: []
      },
      ai
    )
    expect(anfragen[0].system).toContain(LOESUNGEN_REGEL)
    expect(LOESUNGEN_REGEL).toMatch(/He is said to be rich/)
  })
})
