// Entwürfe für Programmbilder über die Bild-KI der App (02.10.2026) – mit dem KI-Zugang der
// Lehrkraft, in einem Wegwerf-Profil (Kopie von settings.json, secrets.json und „Local State",
// siehe tests/e2e/praxis-04-echt.mjs). Verbraucht Bild-Kontingent: nur auf Wunsch der Lehrkraft.
//
//   node scripts/bauen.mjs && node scripts/programmbild-ki.mjs <Ausgabeordner> <id> [<id> …] [--anzahl=2]
//
// Ergebnis: <Ausgabeordner>/<id>-<n>.png. Die gewählten Bilder als <id>.png in einen Ordner legen
// und mit `npx electron scripts/programmbilder.mjs <Ordner>` zu Kachelbildern machen.
import { _electron as electron } from 'playwright-core'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

const STIL =
  'A single glossy 3D app icon in the style of modern macOS / iOS icons: a rounded-square (squircle) tile with a soft vertical colour gradient, subtle top highlight and slight thickness, ' +
  'on a plain flat white background, centred, no text, no letters, no words, no watermark. On the tile, clean white and light-grey objects with soft shadows, friendly and simple, ' +
  'matching a set of school app icons (worksheet with a pencil on blue, speech bubbles on green, letter with fountain pen on yellow).'

const MOTIVE = {
  onlinetest:
    'Tile colour: teal (#12b886 to #0c8599). Motif: a white tablet computer standing slightly tilted, its screen shows a short checklist with two green check marks and one empty box; ' +
    'in front of the tablet a small round white stopwatch with a teal hand; a tiny QR-code sticker in the corner of the tablet.',
  verwaltung:
    'Tile colour: slate grey-blue (#868e96 to #495057). Motif: a large white gear wheel, in front of it two simple white person silhouettes (head and shoulders) ' +
    'and a small golden key leaning against the gear.',
  // 03.10.2026: Unterrichtsreihe (Lernpfad) und „Meine Ergebnisse" im Schülerbereich
  unterrichtsreihe:
    'Tile colour: indigo (#5c7cfa to #3b5bdb). Motif: a winding white path seen from above that climbs from the lower left to the upper right like a board-game trail, ' +
    'with four round white stepping stones on it, the first two marked with small green check marks; at the top end a small golden flag on a pole.',
  ergebnisse:
    'Tile colour: warm orange to coral (#ff922b to #f76707). Motif: a white sheet of paper with a large friendly green check mark and three short grey lines, ' +
    'in front of it a small golden medal with a ribbon and a tiny white bar chart with three rising bars.',
  // 03.10.2026 abends: neue Apps und die vier Obermenüs der Leiste (Wunsch der Lehrkraft)
  laufendereihen:
    'Tile colour: violet (#9775fa to #7048e8). Motif: a white board with three horizontal progress bars of different lengths, filled in green, ' +
    'the longest ending at a small golden flag; in front a small round white clock.',
  freigaben:
    'Tile colour: bright blue (#4dabf7 to #1c7ed6). Motif: a white worksheet with grey lines and a pencil, from which a curved white arrow leads to two small white tablets ' +
    'standing side by side, each showing the same tiny worksheet.',
  vokabeltraining:
    'Tile colour: warm orange (#ffa94d to #f76707). Motif: a white index-card box (vocabulary card file) seen at an angle, with coloured divider tabs (red, yellow, green) ' +
    'and cards inside; one card is lifted out above the box and shows a green check mark.',
  'gruppe-unterricht':
    'Tile colour: fresh green (#51cf66 to #2f9e44). Motif: a dark green school chalkboard on a light wooden frame with a simple white chalk drawing of a sun and a tree, ' +
    'a piece of white chalk on the ledge and a small red apple in front.',
  'gruppe-planung':
    'Tile colour: sky blue (#74c0fc to #1971c2). Motif: an open white spiral-bound planner with a calendar grid, some days marked with small coloured dots, ' +
    'a yellow pencil and a short ruler lying diagonally across it.',
  'gruppe-pruefung':
    'Tile colour: rose red (#ff8787 to #e03131). Motif: a white clipboard holding a test sheet with short grey lines, three of them with red check marks; ' +
    'a red pen leaning against the clipboard and a small round white stopwatch.',
  'gruppe-verwaltung':
    'Tile colour: cool grey (#adb5bd to #495057). Motif: a white filing cabinet with two drawers, the top drawer slightly open showing coloured folders (blue, yellow, green), ' +
    'and a small silver gear wheel in front.'
}

const out = resolve(process.argv[2] ?? 'test-results/programmbilder')
const anzahl = Number(process.argv.find((a) => a.startsWith('--anzahl='))?.slice(9) ?? 2)
const ids = process.argv.slice(3).filter((a) => !a.startsWith('--'))
if (!ids.length || ids.some((i) => !MOTIVE[i])) {
  console.error(`Bitte Programme angeben: ${Object.keys(MOTIVE).join(', ')}`)
  process.exit(1)
}
mkdirSync(out, { recursive: true })
const echt = join(process.env.APPDATA ?? '', 'schul-apps')
const userData = mkdtempSync(join(tmpdir(), 'schulapps-bilder-'))
for (const f of ['settings.json', 'secrets.json', 'Local State']) if (existsSync(join(echt, f))) copyFileSync(join(echt, f), join(userData, f))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_KI_ATTRAPPE: '' } })
try {
  // Das erste Fenster kann ein Zwischenfenster sein – das Hauptfenster hat window.api
  let page = null
  for (let i = 0; i < 60 && !page; i++) {
    for (const w of app.windows()) if (await w.evaluate(() => Boolean(window.api?.ai?.image)).catch(() => false)) page = w
    if (!page) await new Promise((r) => setTimeout(r, 500))
  }
  if (!page) throw new Error('Kein Hauptfenster mit window.api gefunden.')
  for (const id of ids) {
    for (let n = 1; n <= anzahl; n++) {
      const t0 = Date.now()
      const dataUrl = await page.evaluate((prompt) => window.api.ai.image(prompt), `${STIL}\n\n${MOTIVE[id]}`)
      const datei = join(out, `${id}-${n}.png`)
      writeFileSync(datei, Buffer.from(String(dataUrl).split(',')[1] ?? '', 'base64'))
      console.log(`${datei} (${Math.round((Date.now() - t0) / 1000)} s)`)
    }
  }
} finally {
  await app.close()
  rmSync(userData, { recursive: true, force: true })
}
