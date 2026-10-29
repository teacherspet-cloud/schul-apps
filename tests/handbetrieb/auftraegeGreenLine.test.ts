/**
 * Aufträge für den Handbetrieb (29.10.2026): wie „Grammatikformen" › Green Line 1 › Unit 1 › „Fehlende Aufgaben mit KI
 * ergänzen" (GrammatikBank.tsx `auftrag`, bank.ts `bankSchritte`): je Teilbereich bzw. gemischter Übung und Stufe nur die
 * Übungsarten, denen Aufgaben fehlen (Stand am Server: <Ordner>/zaehler.json), je Anfrage höchstens drei Übungsarten, je
 * Übungsart das Fehlende plus Puffer. Dazu weitere Schlüssel aus HANDBETRIEB_EXTRA (Komma-Liste).
 * Nur mit HANDBETRIEB=<Ordner>.
 */
import { describe, it } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { LEHRWERK_GRAMMATIK } from '../../src/renderer/src/shared/lehrwerkGrammatik'
import { kennungLabel, teilbereicheVon, teilHinweise } from '../../src/renderer/src/modules/grammatikformen/grammatikformen'
import { mixSchluessel, UEBUNGEN, zielJeFeld, type Stufe, type Uebung } from '../../src/shared/grammatikBank'
import type { BankAuftrag } from '../../src/renderer/src/modules/lernen/grammatikBankErzeugen'
import { wortschatzStandServer } from '../../src/server/grammatikBank'

const ORDNER = process.env.HANDBETRIEB ?? ''
const PUFFER = 2
const ARTEN_JE_ANFRAGE = 3

describe.skipIf(!ORDNER)('Aufträge Green Line 1 Unit 1', () => {
  it('schreiben', () => {
    const zaehler = existsSync(join(ORDNER, 'zaehler.json'))
      ? (JSON.parse(readFileSync(join(ORDNER, 'zaehler.json'), 'utf8')) as Record<string, Record<string, Record<string, number>>>)
      : {}
    const unit = LEHRWERK_GRAMMATIK['Green Line 1']['Unit 1']
    const reiter: { schluessel: string; titel: string; themen: string[]; hinweise?: string; formen?: string[] }[] = []
    for (const punkte of Object.values(unit))
      for (const punkt of punkte) {
        const teile = teilbereicheVon(punkt.t)
        for (const k of teile) reiter.push({ schluessel: k, titel: kennungLabel(k), themen: [k.split('/')[0]], hinweise: teilHinweise(k) })
        if (teile.length >= 2)
          reiter.push({ schluessel: mixSchluessel(punkt.t), titel: `Gemischt: ${punkt.text}`, themen: [...new Set(punkt.t.map((k) => k.split('/')[0]))], formen: teile.map(kennungLabel) })
      }
    // Nur bestimmte Schlüssel (Nachtrag): HANDBETRIEB_NUR=<Komma-Liste> – Green Line 1 Unit 1 dann nicht
    const nur = (process.env.HANDBETRIEB_NUR ?? '').split(',').filter(Boolean)
    if (nur.length) reiter.splice(0, reiter.length, ...reiter.filter((r) => nur.includes(r.schluessel)))
    for (const k of (process.env.HANDBETRIEB_EXTRA ?? '').split(',').filter(Boolean))
      reiter.push({ schluessel: k, titel: kennungLabel(k), themen: [k.split('/')[0]], hinweise: teilHinweise(k) })
    const auftraege: { id: string; auftrag: BankAuftrag }[] = []
    for (const r of reiter) {
      // Klasse und Lehrwerksstelle aus der FRÜHESTEN Einführung der Form (29.10.2026, Befund der Lehrkraft: Zusatzformen wie
      // Past Progressive liefen mit „Klasse 5, Green Line 1 Unit 1" – sie stehen dort nicht)
      const ws = wortschatzStandServer(r.schluessel, 'en')
      const jahrgang = ws?.jahrgang ?? 5
      const lehrwerk = ws ? { buch: ws.stelle.buch, unit: ws.stelle.unit } : { buch: 'Green Line 1', unit: 'Unit 1' }
      for (const st of ['g', 'm', 'a'] as Stufe[]) {
        const da = (u: Uebung): number => zaehler[r.schluessel]?.[st]?.[u] ?? 0
        const offen = UEBUNGEN.filter((u) => da(u) < zielJeFeld(u))
        for (let i = 0; i < offen.length; i += ARTEN_JE_ANFRAGE) {
          const uebungen = offen.slice(i, i + ARTEN_JE_ANFRAGE)
          auftraege.push({
            id: `${r.schluessel.replace(/[^a-z0-9]+/gi, '_')}__${st}__${uebungen.join('-')}`,
            auftrag: {
              niveau: st,
              schluessel: r.schluessel,
              titel: r.titel,
              fach: 'Englisch',
              sprache: 'en',
              jahrgang,
              land: 'NI',
              schulform: 'gymnasium',
              uebungen,
              anzahl: Math.min(12, Math.max(...uebungen.map((u) => zielJeFeld(u) - da(u))) + PUFFER),
              jeUebung: Object.fromEntries(uebungen.map((u) => [u, Math.min(8, Math.max(1, zielJeFeld(u) - da(u)) + PUFFER)])),
              themenIds: r.themen,
              ...(r.hinweise ? { hinweise: r.hinweise } : {}),
              ...(r.formen ? { formen: r.formen } : {}),
              lehrwerk,
              vorhanden: []
            }
          })
        }
      }
    }
    writeFileSync(join(ORDNER, 'auftraege.json'), JSON.stringify(auftraege, null, 1))
    writeFileSync(join(ORDNER, 'reiter.json'), JSON.stringify(reiter, null, 1))
  })
})
