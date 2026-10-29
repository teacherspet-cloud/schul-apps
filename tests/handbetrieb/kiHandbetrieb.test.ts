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
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { erzeugeBankAufgaben, type BankAuftrag } from '../../src/renderer/src/modules/lernen/grammatikBankErzeugen'
import { vollstaendigeGerTabelle } from '../../src/shared/schulformen'
import type { CefrTable, StructuredRequest, Textbook } from '../../src/shared/types'

const ORDNER = process.env.HANDBETRIEB ?? ''

class Ausstehend extends Error {}

/** Nummerierte Aufgabenblöcke einer Anfrage („1. Format: …") – Nummer → Text ohne Nummer */
function bloecke(user: string): Map<number, string> {
  const m = new Map<number, string>()
  for (const b of user.split(/\n\n+/)) {
    const k = /^(\d+)\.\s([\s\S]*)$/.exec(b.trim())
    if (k) m.set(Number(k[1]), k[2])
  }
  return m
}

/** Antwort mit Liste „antworten"/„urteile" je „nr" auf die neue Nummerierung umstellen; null, wenn eine Aufgabe neu ist */
function umnummeriert(alt: string, neu: string, antwort: unknown): unknown {
  const a = bloecke(alt)
  const n = bloecke(neu)
  if (!n.size) return null
  const nachText = new Map([...a].map(([k, t]) => [t, k]))
  const zuordnung = new Map<number, number>()
  for (const [k, t] of n) {
    const vorher = nachText.get(t)
    if (vorher === undefined) return null
    zuordnung.set(vorher, k)
  }
  const o = antwort as Record<string, unknown>
  const schluessel = Object.keys(o).find((k) => Array.isArray(o[k]))
  if (!schluessel) return null
  const liste = (o[schluessel] as { nr: number }[]).filter((x) => zuordnung.has(Number(x.nr))).map((x) => ({ ...x, nr: zuordnung.get(Number(x.nr))! }))
  return { ...o, [schluessel]: liste }
}

describe.skipIf(!ORDNER)('KI im Handbetrieb', () => {
  it(
    'Aufträge bis zur nächsten offenen Anfrage',
    async () => {
      const tabelle = vollstaendigeGerTabelle(JSON.parse(readFileSync('resources/cefr/levels.json', 'utf8')) as CefrTable)
      // Lehrwerke wie in der App (window.api.textbooks) – für Wortschatz und Grammatik nach Lehrwerksstand
      const buecher = readdirSync('resources/lehrwerke')
        .filter((f) => f.endsWith('.json'))
        .map((f) => JSON.parse(readFileSync(join('resources/lehrwerke', f), 'utf8')) as Textbook)
      ;(globalThis as unknown as { window: unknown }).window = {
        api: {
          cefr: { get: async () => tabelle },
          textbooks: {
            list: async () => buecher.map(({ units, ...m }) => ({ ...m, units: units.map((u) => ({ name: u.name, sections: [] })), entryCount: 0 })),
            get: async (id: string) => buecher.find((b) => b.id === id)
          }
        }
      }
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
          if (existsSync(`${basis}.antwort.json`)) {
            const antwort = JSON.parse(readFileSync(`${basis}.antwort.json`, 'utf8')) as T
            const alt = existsSync(`${basis}.anfrage.json`) ? (JSON.parse(readFileSync(`${basis}.anfrage.json`, 'utf8')) as { user: string }).user : req.user
            if (alt === req.user) return antwort
            // Anfrage hat sich seit der Antwort geändert (neue Regel streicht vorher Aufgaben): nummerierte Antworten über den
            // Aufgabentext der neuen Nummer zuordnen – sonst gehörte die Antwort zu Aufgabe 4 plötzlich zu Aufgabe 3
            const umgeordnet = umnummeriert(alt, req.user, antwort)
            if (umgeordnet) return umgeordnet as T
            writeFileSync(`${basis}.antwort.veraltet.json`, JSON.stringify(antwort, null, 1))
            rmSync(`${basis}.antwort.json`)
          }
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
