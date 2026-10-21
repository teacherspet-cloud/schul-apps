import { describe, expect, it } from 'vitest'
import type { StructuredRequest } from '../src/shared/types'
import { erzeugeBankAufgaben, type BankAuftrag } from '../src/renderer/src/modules/lernen/grammatikBankErzeugen'
import { bankBerichtText, leereBankSumme } from '../src/renderer/src/modules/grammatikformen/bank'

/*
 * „Ergänzen" meldete 0 neue Aufgaben ohne Grund (21.10.2026, Befund der Lehrkraft: Green Line 4, Unit 2, „Typische
 * Zustandsverben", Stufe mittel): Die Prüfung strich alles als „trivial für B1". Ohne echte KI: eine Attrappe.
 */
const AUFTRAG: BankAuftrag = {
  schluessel: 'en.verb.stative_dynamic/zustandsverben',
  titel: 'Typische Zustandsverben',
  fach: 'Englisch',
  sprache: 'en',
  jahrgang: 8,
  land: 'NI',
  schulform: 'gymnasium',
  uebungen: ['erkennen'],
  anzahl: 4,
  niveau: 'm',
  themenIds: ['en.verb.stative_dynamic'],
  vorhanden: []
}

function attrappe(urteil: { ok: boolean; zuLeicht?: boolean; grund: string }) {
  const anfragen: StructuredRequest[] = []
  const ai = async <T>(req: StructuredRequest): Promise<T> => {
    anfragen.push(req)
    if (req.schemaName === 'grammatik_pruefung')
      return { urteile: [1, 2, 3, 4].map((nr) => ({ nr, loesungen: [], optionen: [], fehlerWort: '', ...urteil })) } as T
    return {
      regel: { titel: 'Zustandsverben', erklaerung: 'Zustandsverben stehen nicht in der Verlaufsform.', beispiele: ['I know.'] },
      aufgaben: [1, 2, 3, 4].map((i) => ({
        uebung: 'erkennen',
        art: 'auswahl',
        anweisung: 'Wähle.',
        satz: `I ___ the answer ${i}.`,
        vorgabe: '',
        loesungen: ['know'],
        optionen: ['know', 'am knowing'],
        fehlerWort: '',
        teile: [],
        erklaerung: 'Zustandsverb.'
      }))
    } as T
  }
  return { ai, anfragen }
}

describe('Bericht der Aufgabenbank', () => {
  it('zählt „zu leicht" gestrichene Aufgaben und nennt den Grund', async () => {
    const { ai, anfragen } = attrappe({ ok: false, zuLeicht: true, grund: 'Für B1 trivial.' })
    const r = await erzeugeBankAufgaben(AUFTRAG, ai)
    expect(r.aufgaben).toHaveLength(0)
    expect(r.bericht).toMatchObject({ geprueft: 4, gestrichen: 4, zuLeicht: 4, gruende: ['Für B1 trivial.'] })
    const pruef = anfragen.find((q) => q.schemaName === 'grammatik_pruefung')!
    expect(pruef.system).toMatch(/zuLeicht = true/)
    expect(pruef.system).toMatch(/einfache Zielform macht eine Aufgabe NICHT trivial/)
  })
  it('ohne Leicht-Prüfung fragt die Prüfung nicht nach „trivial"', async () => {
    const { ai, anfragen } = attrappe({ ok: true, grund: '' })
    const r = await erzeugeBankAufgaben({ ...AUFTRAG, ohneLeichtPruefung: true }, ai)
    expect(r.aufgaben).toHaveLength(4)
    expect(anfragen.find((q) => q.schemaName === 'grammatik_pruefung')!.system).not.toMatch(/trivial/)
  })
  it('Meldetext: Zahlen und Gründe, leer ohne KI-Ergebnis', () => {
    expect(bankBerichtText(leereBankSumme())).toBe('')
    const t = bankBerichtText({ ...leereBankSumme(), geprueft: 30, gestrichen: 27, zuLeicht: 25, zeitform: 1, doppelt: 2, gruende: ['Für B1 trivial.'] })
    expect(t).toBe(
      'Die KI schrieb 30 Aufgaben, keine kam dazu: 27 strich die Prüfung (davon 25 als zu leicht für das Niveau), 1 brauchten eine Zeitform, die die Lerngruppe laut Lehrwerk noch nicht kennt, 2 gab es schon. Gründe u. a.: „Für B1 trivial.“.'
    )
  })
})
