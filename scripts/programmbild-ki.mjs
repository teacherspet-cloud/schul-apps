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
    'and a small silver gear wheel in front.',
  // 06.10.2026: „Meine Klassen" (Verwaltung) – Lernstand der eigenen Klassen auf einen Blick
  meineklassen:
    'Tile colour: emerald to ocean blue (#20c997 to #1c7ed6). Motif: three simple white person silhouettes (head and shoulders) of different heights standing side by side in front of ' +
    'a white board with a small bar chart of three rising bars (green, yellow, green); a small round golden badge with a white check mark at the upper right of the board.',
  // 07.10.2026: Grammatiktraining (Lern-App der Lernenden, Kachelfarbe grape wie in der Leiste)
  grammatiktraining:
    'Tile colour: grape purple (#cc5de8 to #9c36b5). Motif: three chunky rounded white building blocks lying in a row and snapping together like sentence parts, ' +
    'each block with a coloured stripe on top (blue, yellow, green) and no letters; above them a small white dumbbell for training and a green check mark badge at the upper right.',
  // 03.10.2026: Vokabelspiele („Spielen mit deinen Wörtern")
  'spiel-memory':
    'Tile colour: coral red (#ff8787 to #e03131). Motif: four white memory cards in a 2 by 2 grid, two of them turned face up showing a matching pair (a small sun symbol on both), two face down with a question mark.',
  'spiel-zuordnen':
    'Tile colour: purple (#cc5de8 to #9c36b5). Motif: two short columns of three white rounded word tiles (blank, no letters), connected left to right by two curved white lines; a small white stopwatch in the corner.',
  'spiel-blitz':
    'Tile colour: sunny yellow (#ffd43b to #f59f00). Motif: a big white lightning bolt in front of a round white clock face with a short orange segment, small sparkles around.',
  'spiel-satz':
    'Tile colour: cyan (#3bc9db to #0c8599). Motif: four white jigsaw puzzle pieces in a row, the last one slightly lifted and about to click into place, each with a short grey line suggesting a word.',
  'spiel-wortraten':
    'Tile colour: pink (#f783ac to #d6336c). Motif: a friendly white flower with seven petals, one petal gently falling off; below it three white letter tiles with blank spaces (no letters), like a word-guessing game.',
  'spiel-kreuzwort':
    'Tile colour: indigo (#748ffc to #4263eb). Motif: a white crossword grid with a few crossing rows of squares, some squares filled with small blue dots instead of letters, a yellow pencil lying diagonally.',
  'spiel-fallend':
    'Tile colour: teal (#38d9a9 to #099268). Motif: three white rounded word bubbles (blank) falling from the top at different heights with small motion lines, and a white keyboard key at the bottom.',
  'spiel-suchsel':
    'Tile colour: lime green (#a9e34b to #66a80f). Motif: a white square grid of small tiles (no letters, just light grey squares) with one diagonal row and one horizontal row highlighted in bright yellow, a small magnifying glass in front.'
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
