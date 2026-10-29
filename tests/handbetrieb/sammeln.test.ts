/**
 * Ergebnisse des Handbetriebs sammeln (29.10.2026): je Auftrag ergebnis.json → resources/grammatik-bank/<Datei>, gekürzt
 * wie bank.ts (`aufZielGekuerzt`) auf das, was am Server fehlt (<Ordner>/zaehler.json). Regelkarte je Schlüssel aus dem
 * ersten fertigen Auftrag (der Server legt sie nur an, wo noch keine liegt). Nur mit HANDBETRIEB=<Ordner> und
 * HANDBETRIEB_DATEI=<Dateiname>.
 */
import { describe, it } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { aufZielGekuerzt, zielJeFeld, type BankAufgabe, type BankRegel } from '../../src/shared/grammatikBank'
import type { BankAuftrag } from '../../src/renderer/src/modules/lernen/grammatikBankErzeugen'

const ORDNER = process.env.HANDBETRIEB ?? ''
const DATEI = process.env.HANDBETRIEB_DATEI ?? ''

describe.skipIf(!ORDNER || !DATEI)('Handbetrieb sammeln', () => {
  it('Datendatei schreiben', () => {
    const auftraege = JSON.parse(readFileSync(join(ORDNER, 'auftraege.json'), 'utf8')) as { id: string; auftrag: BankAuftrag }[]
    const zaehler = existsSync(join(ORDNER, 'zaehler.json'))
      ? (JSON.parse(readFileSync(join(ORDNER, 'zaehler.json'), 'utf8')) as Record<string, Record<string, Record<string, number>>>)
      : {}
    const regeln: Record<string, BankRegel> = {}
    const neu: { schluessel: string; aufgabe: Record<string, unknown> }[] = []
    const bericht: string[] = []
    for (const j of auftraege) {
      const f = join(ORDNER, j.id, 'ergebnis.json')
      if (!existsSync(f)) {
        bericht.push(`${j.id}: kein Ergebnis`)
        continue
      }
      const r = JSON.parse(readFileSync(f, 'utf8')) as { regel: BankRegel; aufgaben: BankAufgabe[]; bericht: { gestrichen: number; gruende: string[] } }
      const k = j.auftrag.schluessel
      regeln[k] ??= r.regel
      const st = j.auftrag.niveau ?? 'm'
      const da = (u: string): number => zaehler[k]?.[st]?.[u] ?? 0
      const behalten = aufZielGekuerzt(r.aufgaben, (u) => zielJeFeld(u) - da(u))
      for (const a of behalten) {
        const { id: _i, regelId: _r, ...rest } = a as BankAufgabe & { regelId?: string }
        void _i
        void _r
        neu.push({ schluessel: k, aufgabe: { ...rest, niveau: st } })
      }
      const fehlt = j.auftrag.uebungen.filter((u) => da(u) + behalten.filter((a) => a.uebung === u).length < zielJeFeld(u))
      bericht.push(
        `${j.id}: ${behalten.length} übernommen, ${r.bericht.gestrichen} gestrichen${fehlt.length ? `, FEHLT: ${fehlt.join(', ')}` : ''}${r.bericht.gruende.length ? ` – ${r.bericht.gruende.slice(0, 3).join(' | ')}` : ''}`
      )
    }
    writeFileSync(
      join('resources', 'grammatik-bank', DATEI),
      JSON.stringify({ hinweis: 'Erzeugt über den App-Weg im Handbetrieb (29.10.2026, tests/handbetrieb) – alle Absicherungen der App', regeln, neu }, null, 1) + '\n'
    )
    writeFileSync(join(ORDNER, 'sammelbericht.txt'), bericht.join('\n'))
  })
})
