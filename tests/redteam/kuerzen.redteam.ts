/**
 * KI-Kürzung mit echter KI (23.10.2026, Auftrag der Lehrkraft: „probier die ki-kürzung mit echter ki an einem blatt aus").
 * Echte Dokumente aus dem lokalen Profil (nur gelesen): ein Arbeitsblatt und eine Klassenarbeit mit einer künstlichen
 * Fassung B (Kopie von A mit eigenen Kennungen) – geprüft wird, ob die KI die Regeln einhält und Entsprechendes gleich kürzt.
 * Bericht: test-results/kuerzen-echt/. Aufruf: npx vitest run -c vitest.redteam.config.ts tests/redteam/kuerzen.redteam.ts
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { kuerzAnfrage, kuerzungAus } from '../../src/renderer/src/modules/arbeitsblatt/generation/kuerzen'
import { examToWorksheetAlle } from '../../src/renderer/src/modules/klassenarbeit/render/examWorksheet'
import type { Worksheet } from '../../src/renderer/src/modules/arbeitsblatt/model/types'
import type { Exam } from '../../src/renderer/src/modules/klassenarbeit/model/types'
import { claude } from './claude'

const lade = (ordner: string, passt: (x: { name: string; payload: unknown }) => boolean): { name: string; payload: unknown } => {
  const o = join(process.env.APPDATA ?? '', 'schul-apps', ordner)
  return readdirSync(o)
    .filter((f) => f.endsWith('.json') && f !== 'index.json')
    .map((f) => join(o, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    .map((f) => JSON.parse(readFileSync(f, 'utf8')))
    .find(passt)
}

const OUT = 'test-results/kuerzen-echt'

async function lauf(name: string, ws: Worksheet, seiten: number, quelle?: unknown): Promise<void> {
  const anfrage = kuerzAnfrage(ws, seiten, quelle)
  writeFileSync(join(OUT, `${name}-anfrage.txt`), anfrage.user)
  const t0 = Date.now()
  const roh = await claude<{ aenderungen: unknown[]; weglassen: unknown[] }>(anfrage)
  const k = kuerzungAus(ws, roh, quelle)
  const bericht = {
    name,
    sekunden: Math.round((Date.now() - t0) / 1000),
    roh: { aenderungen: roh.aenderungen?.length ?? 0, weglassen: roh.weglassen },
    angenommen: { aenderungen: k.aenderungen.length, weglassen: k.weglassen.map((w) => w.wo) },
    zeichenAlt: k.aenderungen.reduce((a, x) => a + x.alt.length, 0),
    zeichenNeu: k.aenderungen.reduce((a, x) => a + x.neu.length, 0),
    aenderungen: k.aenderungen.map((a) => ({ wo: a.wo, feld: a.feld, alt: a.alt, neu: a.neu })),
    rohAntwort: roh
  }
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(bericht, null, 2))
  console.log(name, bericht.sekunden, 's', bericht.roh.aenderungen, '→', bericht.angenommen.aenderungen, 'weg:', bericht.angenommen.weglassen)
  expect(k.aenderungen.length + k.weglassen.length).toBeGreaterThan(0)
}

it('Arbeitsblatt', async () => {
  const w = lade('arbeitsblaetter', (x) => ((x.payload as Worksheet)?.sheets?.[0]?.blocks?.length ?? 0) >= 4)
  const ws = structuredClone(w.payload as Worksheet)
  ws.sheets = ws.sheets.slice(0, 1)
  await lauf('arbeitsblatt', ws, 4)
})

it('Klassenarbeit A/B', async () => {
  const e = lade('klassenarbeiten', (x) => (x.payload as Exam).parts?.some((p) => p.blocks.length > 0))
  const exam = structuredClone(e.payload as Exam)
  for (const p of exam.parts) p.weitereFassungen = [p.blocks.map((b) => ({ ...structuredClone(b), id: `${b.id}-b` }))]
  await lauf('klassenarbeit-ab', examToWorksheetAlle(exam), 3, exam)
})
