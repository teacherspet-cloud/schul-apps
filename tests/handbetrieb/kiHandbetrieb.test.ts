/**
 * KI im Handbetrieb (29.10.2026, Auftrag der Lehrkraft: Grammatikaufgaben „mit den gleichen Absicherungen, wie ChatGPT sie
 * nutzen soll, wenn ich es von der App aus starten würde"): Dieses Werkzeug lässt den echten Erzeugungsweg der App laufen
 * (erzeugeBankAufgaben → Prüfung → Blindprobe → Überarbeitung → Regeln/Selbsttest) – nur beantwortet nicht ChatGPT die
 * Anfragen, sondern wer die Dateien „<nr>-<schema>.antwort.json" schreibt. Jede Anfrage liegt als „.anfrage.json" (system,
 * user, schema) im Ordner des Auftrags; fehlt eine Antwort, hält der Auftrag an. Ein erneuter Lauf spielt die vorhandenen
 * Antworten ab (feste Uhrzeit, gleiche Reihenfolge) und kommt bis zur nächsten offenen Anfrage.
 *
 * Nur mit HANDBETRIEB=<Ordner> (sonst übersprungen). Aufträge: <Ordner>/auftraege.json (Liste {id, auftrag: BankAuftrag}).
 * Ergebnis je Auftrag: <Ordner>/<id>/ergebnis.json ({regel, aufgaben, bericht}).
 */
import { describe, it, vi } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { erzeugeBankAufgaben, type BankAuftrag } from '../../src/renderer/src/modules/lernen/grammatikBankErzeugen'
import { vollstaendigeGerTabelle } from '../../src/shared/schulformen'
import type { CefrTable, StructuredRequest } from '../../src/shared/types'

const ORDNER = process.env.HANDBETRIEB ?? ''

class Ausstehend extends Error {}

describe.skipIf(!ORDNER)('KI im Handbetrieb', () => {
  it(
    'Aufträge bis zur nächsten offenen Anfrage',
    async () => {
      const tabelle = vollstaendigeGerTabelle(JSON.parse(readFileSync('resources/cefr/levels.json', 'utf8')) as CefrTable)
      ;(globalThis as unknown as { window: unknown }).window = { api: { cefr: { get: async () => tabelle } } }
      const auftraege = JSON.parse(readFileSync(join(ORDNER, 'auftraege.json'), 'utf8')) as { id: string; auftrag: BankAuftrag }[]
      const stand: Record<string, string> = {}
      for (const [n, j] of auftraege.entries()) {
        const dir = join(ORDNER, j.id)
        mkdirSync(dir, { recursive: true })
        if (existsSync(join(dir, 'ergebnis.json'))) {
          stand[j.id] = 'fertig'
          continue
        }
        // Feste Uhrzeit je Auftrag: Kennungen und damit die Mischung der Möglichkeiten bleiben bei jedem Lauf gleich
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(new Date(Date.UTC(2026, 9, 29, 8, 0, 0) + n * 1000))
        let nr = 0
        // Die Prüfschritte fangen KI-Fehler ab und machen ohne sie weiter – nach der ersten offenen Anfrage darum keine
        // weitere stellen und kein Ergebnis speichern (der nächste Lauf spielt ab und kommt weiter)
        let offen = ''
        const ai = async <T,>(req: StructuredRequest): Promise<T> => {
          if (offen) throw new Ausstehend(offen)
          nr++
          const basis = join(dir, `${String(nr).padStart(2, '0')}-${req.schemaName}`)
          if (existsSync(`${basis}.antwort.json`)) return JSON.parse(readFileSync(`${basis}.antwort.json`, 'utf8')) as T
          writeFileSync(`${basis}.anfrage.json`, JSON.stringify({ schemaName: req.schemaName, system: req.system, user: req.user, schema: req.schema }, null, 1))
          offen = `${basis}.anfrage.json`
          throw new Ausstehend(offen)
        }
        try {
          const r = await erzeugeBankAufgaben(j.auftrag, ai)
          if (offen) throw new Ausstehend(offen)
          writeFileSync(join(dir, 'ergebnis.json'), JSON.stringify(r, null, 1))
          stand[j.id] = `fertig (${r.aufgaben.length} Aufgaben)`
        } catch (e) {
          stand[j.id] = e instanceof Ausstehend ? `wartet: ${e.message.split(/[\\/]/).pop()}` : `Fehler: ${e instanceof Error ? e.message : String(e)}`
        } finally {
          vi.useRealTimers()
        }
      }
      writeFileSync(join(ORDNER, 'stand.json'), JSON.stringify(stand, null, 1))
    },
    600_000
  )
})
