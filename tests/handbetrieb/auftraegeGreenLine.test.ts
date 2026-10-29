/**
 * Aufträge für den Handbetrieb (29.10.2026): genau wie „Grammatikformen" › Green Line 1 › Unit 1 › „Fehlende Aufgaben mit
 * KI ergänzen" sie bildet (GrammatikBank.tsx `auftrag`, bank.ts `bankSchritte`): je Teilbereich bzw. gemischter Übung und
 * Stufe, je Anfrage höchstens drei Übungsarten, je Übungsart das Ziel plus Puffer. Phase 1: Erkennen/Bilden/Anwenden,
 * Phase 2: Unterscheiden/Fehler (mit den Sätzen aus Phase 1 als „vorhanden").
 * Nur mit HANDBETRIEB=<Ordner> und HANDBETRIEB_PHASE=1|2.
 */
import { describe, it } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { LEHRWERK_GRAMMATIK } from '../../src/renderer/src/shared/lehrwerkGrammatik'
import { kennungLabel, teilbereicheVon, teilHinweise } from '../../src/renderer/src/modules/grammatikformen/grammatikformen'
import { aufgabeVorschau } from '../../src/renderer/src/modules/lernen/kurs/AufgabenEditor'
import { mixSchluessel, zielJeFeld, type Stufe, type Uebung } from '../../src/shared/grammatikBank'
import type { BankAuftrag } from '../../src/renderer/src/modules/lernen/grammatikBankErzeugen'

const ORDNER = process.env.HANDBETRIEB ?? ''
const PHASE = process.env.HANDBETRIEB_PHASE ?? '1'
const PUFFER = 2

describe.skipIf(!ORDNER)('Aufträge Green Line 1 Unit 1', () => {
  it('schreiben', () => {
    const unit = LEHRWERK_GRAMMATIK['Green Line 1']['Unit 1']
    const reiter: { schluessel: string; titel: string; themen: string[]; hinweise?: string; formen?: string[] }[] = []
    for (const punkte of Object.values(unit))
      for (const punkt of punkte) {
        const teile = teilbereicheVon(punkt.t)
        for (const k of teile) reiter.push({ schluessel: k, titel: kennungLabel(k), themen: [k.split('/')[0]], hinweise: teilHinweise(k) })
        if (teile.length >= 2)
          reiter.push({
            schluessel: mixSchluessel(punkt.t),
            titel: `Gemischt: ${punkt.text}`,
            themen: [...new Set(punkt.t.map((k) => k.split('/')[0]))],
            formen: teile.map(kennungLabel)
          })
      }
    const stufen: Stufe[] = ['g', 'm', 'a']
    const gruppen: Uebung[][] = PHASE === '1' ? [['erkennen', 'bilden', 'anwenden']] : [['unterscheiden', 'fehler']]
    const auftraege: { id: string; auftrag: BankAuftrag }[] = []
    for (const r of reiter)
      for (const st of stufen)
        for (const uebungen of gruppen) {
          const id = `${r.schluessel.replace(/[^a-z0-9]+/gi, '_')}__${st}__p${PHASE}`
          // Phase 2: Sätze aus Phase 1 nicht wiederholen
          const vorher = join(ORDNER, `${r.schluessel.replace(/[^a-z0-9]+/gi, '_')}__${st}__p1`, 'ergebnis.json')
          const vorhanden = existsSync(vorher)
            ? (JSON.parse(readFileSync(vorher, 'utf8')) as { aufgaben: Parameters<typeof aufgabeVorschau>[0][] }).aufgaben.map((a) =>
                aufgabeVorschau(a).aufgabe.slice(0, 120)
              )
            : []
          auftraege.push({
            id,
            auftrag: {
              niveau: st,
              schluessel: r.schluessel,
              titel: r.titel,
              fach: 'Englisch',
              sprache: 'en',
              jahrgang: 5,
              land: 'NI',
              schulform: 'gymnasium',
              uebungen,
              anzahl: Math.min(12, Math.max(...uebungen.map(zielJeFeld)) + PUFFER),
              jeUebung: Object.fromEntries(uebungen.map((u) => [u, Math.min(8, zielJeFeld(u) + PUFFER)])),
              themenIds: r.themen,
              ...(r.hinweise ? { hinweise: r.hinweise } : {}),
              ...(r.formen ? { formen: r.formen } : {}),
              lehrwerk: { buch: 'Green Line 1', unit: 'Unit 1' },
              vorhanden
            }
          })
        }
    const datei = join(ORDNER, 'auftraege.json')
    const alt = existsSync(datei) ? (JSON.parse(readFileSync(datei, 'utf8')) as typeof auftraege) : []
    const ids = new Set(alt.map((x) => x.id))
    writeFileSync(datei, JSON.stringify([...alt, ...auftraege.filter((x) => !ids.has(x.id))], null, 1))
    writeFileSync(join(ORDNER, 'reiter.json'), JSON.stringify(reiter, null, 1))
  })
})
