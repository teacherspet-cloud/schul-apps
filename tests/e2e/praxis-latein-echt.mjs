// Praxislauf Latein im Grammatiktraining MIT ECHTER KI (07.10.2026) – VERBRAUCHT KONTINGENT, nur auf Wunsch der Lehrkraft.
// Vorher: npm run build. Aufruf: node tests/e2e/praxis-latein-echt.mjs <Ausgabeordner> [deklination|konjugation]
//
// Erzeugt mit dem KI-Zugang der Lehrkraft (Wegwerf-Profil mit Kopie von settings.json, secrets.json und „Local State",
// siehe praxis-04-echt.mjs) zwei Aufgabenpools – a-/o-Deklination (Kl. 6, Grundwortschatz) und Konjugation Präsens
// Aktiv (Kl. 7) – genau wie „Grammatik freigeben" (modules/lernen/grammatikErzeugen.ts, für den Lauf mit esbuild
// gebündelt). Geprüft wird der Aufbau (Aufgabenarten, Lesarten, Tabellen, Längenzeichen); ob die Formen stimmen, zeigt
// ergebnisse.json – ein Mensch sieht es an.
import { _electron as electron } from 'playwright-core'
import { build } from 'esbuild'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'test-results/praxis-latein')
mkdirSync(out, { recursive: true })
const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const root = resolve('.')
// Bündeln: erzeugeGrammatikPaket + Grundwortschatz als globales Objekt
const eintrag = join(mkdtempSync(join(tmpdir(), 'latein-probe-')), 'eintrag.ts')
writeFileSync(
  eintrag,
  `import { erzeugeGrammatikPaket, lateinLernjahr } from ${JSON.stringify(join(root, 'src/renderer/src/modules/lernen/grammatikErzeugen.ts'))}
import { grundwortschatzBis } from ${JSON.stringify(join(root, 'src/shared/lateinGrundwortschatz.ts'))}
;(globalThis as any).__latein = { erzeugeGrammatikPaket, lateinLernjahr, grundwortschatzBis }`
)
const bündel = await build({
  entryPoints: [eintrag],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  alias: { '@shared': join(root, 'src/shared') }
})
const code = bündel.outputFiles[0].text

const echt = join(process.env.APPDATA ?? '', 'schul-apps')
const userData = mkdtempSync(join(tmpdir(), 'schulapps-latein-'))
for (const f of ['settings.json', 'secrets.json', 'Local State']) if (existsSync(join(echt, f))) copyFileSync(join(echt, f), join(userData, f))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_KI_ATTRAPPE: '' } })
const ergebnisse = {}
try {
  let page = null
  for (let i = 0; i < 60 && !page; i++) {
    for (const w of app.windows()) if (await w.evaluate(() => Boolean(window.api?.ai?.structured)).catch(() => false)) page = w
    if (!page) await new Promise((r) => setTimeout(r, 500))
  }
  if (!page) throw new Error('Kein Hauptfenster mit window.api gefunden.')
  await page.evaluate(code)
  const LAEUFE = [
    { name: 'deklination', thema: 'a- und o-Deklination', jahrgang: 6, grund: true },
    { name: 'konjugation', thema: 'Präsensstamm-Tempora Aktiv: Präsens', jahrgang: 7, grund: false }
  ]
  const nur = process.argv[3]
  for (const l of LAEUFE.filter((x) => !nur || x.name === nur)) {
    const t0 = Date.now()
    const paket = await page.evaluate(async (l) => {
      const L = globalThis.__latein
      return L.erzeugeGrammatikPaket(
        {
          thema: l.thema,
          fach: 'Latein',
          sprache: 'la',
          jahrgang: l.jahrgang,
          ...(l.grund ? { woerter: L.grundwortschatzBis(L.lateinLernjahr(l.jahrgang)), wortQuelle: 'Grundwortschatz Latein' } : {})
        },
        async (req) => {
          const antwort = await window.api.ai.structured(req)
          ;(globalThis.__roh ??= []).push({ schema: req.schemaName, antwort })
          return antwort
        }
      )
    }, l)
    ergebnisse[l.name] = paket
    const arten = {}
    for (const a of paket.aufgaben) arten[a.art] = (arten[a.art] ?? 0) + 1
    console.log(`\n${l.name}: ${paket.aufgaben.length} Aufgaben in ${Math.round((Date.now() - t0) / 1000)} s – ${JSON.stringify(arten)}`)
    pruefe(paket.aufgaben.length >= 25, `${l.name}: mindestens 25 Aufgaben nach Prüfung (${paket.aufgaben.length})`)
    pruefe((arten.bestimmen ?? 0) >= 5, `${l.name}: Bestimmen-Aufgaben (${arten.bestimmen ?? 0})`)
    pruefe(!arten.fehler && !arten.satzbau, `${l.name}: kein Satzbau/Fehler finden`)
    const mehrdeutig = paket.aufgaben.filter((a) => a.art === 'bestimmen' && !a.satz && (a.lesarten?.length ?? 0) > 1)
    if (l.name === 'deklination') pruefe(mehrdeutig.length >= 2, `${l.name}: mehrdeutige Einzelformen mit allen Lesarten (${mehrdeutig.map((a) => `${a.form}: ${a.lesarten.length}`).join(', ')})`)
    const laengen = JSON.stringify(paket.aufgaben).match(/[āēīōū]/g)?.length ?? 0
    pruefe(laengen > 5, `${l.name}: Längenzeichen in den Formen (${laengen})`)
    pruefe(paket.regeln.every((r) => !/\b(the|is|are)\b/.test(r.erklaerung)), `${l.name}: Regelkarten auf Deutsch`)
  }
} catch (e) {
  pruefe(false, `Abbruch – ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  writeFileSync(join(out, 'ergebnisse.json'), JSON.stringify(ergebnisse, null, 2))
  // Rohantworten der KI (vor der Bereinigung) – zum Nachvollziehen, was aussortiert wurde
  const roh = await app.windows()[0]?.evaluate(() => globalThis.__roh ?? []).catch(() => [])
  for (const w of app.windows()) {
    const r2 = await w.evaluate(() => globalThis.__roh ?? []).catch(() => [])
    if (r2.length) writeFileSync(join(out, 'roh.json'), JSON.stringify(r2, null, 2))
  }
  void roh
  await app.close()
  rmSync(userData, { recursive: true, force: true })
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`)
  for (const p of problems) console.log(` - ${p}`)
  process.exit(1)
}
console.log(`\nAlles in Ordnung – Inhalte ansehen: ${join(out, 'ergebnisse.json')}`)
