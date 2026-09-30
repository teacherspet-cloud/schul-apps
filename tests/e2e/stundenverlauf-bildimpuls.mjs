// Wache für BILDIMPULSE im Stundenverlauf (01.10.2026) – mit KI-ATTRAPPE (vorher: npm run build).
// Aufruf: node tests/e2e/stundenverlauf-bildimpuls.mjs <Ausgabeordner>
//
// Die Attrappe plant einen Einstieg mit Bildimpuls. Erwartet: Die App sucht (Attrappen-Treffer
// statt Wikimedia, ohne Netz), die Prüf-KI wählt ein Bild, es erscheint mit Quellenangabe an der
// Einstiegsstelle. „Anderes Bild" zeigt einen anderen Fund, „KI-Bild entwerfen" wechselt auf den
// Entwurf der Bild-KI (gekennzeichnet, Auftrag mit Leitfrage). Folienansicht und „Aufs Blatt".
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/stundenverlauf-bildimpuls')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-bildimpuls-'))
const protokoll = join(userData, 'ki-protokoll.jsonl')
const attrappe = join(userData, 'ki-attrappe.json')

/** Kleines Testbild als SVG-data:-URL (Farbe + Beschriftung, damit man es im Bildschirmfoto erkennt) */
const svg = (farbe, text) =>
  `data:image/svg+xml;base64,${Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="${farbe}"/><circle cx="400" cy="225" r="140" fill="#fff" opacity="0.6"/><text x="400" y="240" font-size="48" text-anchor="middle" font-family="Arial">${text}</text></svg>`
  ).toString('base64')}`
const treffer = (id, titel, farbe) => ({
  id,
  title: titel,
  thumbnail: svg(farbe, titel),
  url: svg(farbe, titel),
  creator: 'Lewis Hine',
  license: 'Public domain',
  licenseUrl: `https://commons.wikimedia.org/wiki/File:${id}.jpg`,
  date: '1908',
  source: 'wikimedia'
})

writeFileSync(
  attrappe,
  JSON.stringify({
    verzoegerungMs: 150,
    protokoll,
    bild: svg('#8e44ad', 'KI-Entwurf'),
    bildsuche: [treffer('Spinnerin', 'Spinnerin 1908', '#c0a060'), treffer('Fabrikhalle', 'Fabrikhalle 1910', '#6090c0')],
    antworten: {
      stundenverlauf: {
        ziel: 'Die Lernenden können die Ursachen der Krise erklären.',
        phasen: [
          { phase: 'Einstieg', minuten: 7, geschehen: 'Bildimpuls: Kinderarbeit · stummer Impuls · Leitfrage festhalten', sozialform: 'UG', medien: 'Beamer' },
          { phase: 'Erarbeitung', minuten: 25, geschehen: 'Q1 lesen · Aufgabe 1', sozialform: 'EA', medien: 'Q1, Aufgabe 1' },
          { phase: 'Sicherung', minuten: 13, geschehen: 'Leitfrage beantworten', sozialform: 'UG', medien: 'Tafel' }
        ],
        hinweise: 'Schwächere Lernende lesen nur den ersten Absatz.',
        einstieg: {
          art: 'bild',
          titel: 'Foto: Mädchen an der Spinnmaschine (1908)',
          beschreibung: 'Ein Mädchen steht barfuß zwischen langen Spinnmaschinen.',
          bezug: 'Das Foto macht die Lebenswirklichkeit sichtbar, nach deren Ursachen die Stunde fragt.',
          leitfrage: 'Warum arbeiteten Kinder in Fabriken?',
          erwartungen: ['Die Familien brauchten Geld → festhalten', 'Es gab keine Schule → nachfragen', 'Die Kinder wollten das → am Bild prüfen'],
          ueberleitung: 'Ob unsere Vermutungen stimmen, prüfen wir mit Q1.',
          moderation: ['Bild stumm zeigen (30–60 s)', 'Beschreiben lassen, dann deuten', 'Vermutungen an der Tafel sammeln', 'Leitfrage festhalten'],
          bild: {
            motiv: 'Ein Kind arbeitet an einer Spinnmaschine in einer Fabrik',
            suche: 'child labor spinning mill',
            original: false,
            werk: '',
            stil: 'foto',
            entwurf: 'A young girl standing between long spinning machines in an early 20th-century mill'
          },
          zitat: { text: '', quelle: '' }
        }
      },
      image_choice: { choices: [{ id: 'einstieg', image: 1, fit: 'eindeutig', reason: 'zeigt das Motiv' }] },
      baustein_wunsch_vorschlaege: { vorschlaege: ['Mehr Fabrik im Bild'] }
    }
  })
)

const problems = []
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const anfragen = () =>
  existsSync(protokoll)
    ? readFileSync(protokoll, 'utf-8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((z) => JSON.parse(z))
    : []
const impulsJetzt = (page) => page.evaluate(() => window.__selftest.worksheetJetzt()?.stundenverlauf?.phasen?.[0]?.impuls ?? null)
const warteAuf = async (page, pruef, ms = 15000) => {
  const ende = Date.now() + ms
  while (Date.now() < ende) {
    const i = await impulsJetzt(page)
    if (pruef(i)) return i
    await page.waitForTimeout(250)
  }
  return impulsJetzt(page)
}

const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
  env: { ...process.env, SCHULAPPS_SELFTEST: '1', SCHULAPPS_KI_ATTRAPPE: attrappe }
})
const page = await app.firstWindow()
page.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${e.message}`))
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1500, 1050))
await warteAufOberflaeche(page)
try {
  await page.click('[aria-label="Arbeitsblatt"]')
  await page.waitForTimeout(500)
  await page.evaluate(() => window.__selftest.wsMaterialtext(2, 'text'))
  await page.waitForTimeout(800)
  await page.getByText('Verlauf +', { exact: true }).filter({ visible: true }).first().click()
  await page.locator('[data-verlauf-erstellen]').click()
  await page.locator('[data-einstiegsimpuls]').waitFor({ timeout: 15000 })
  pruefe(true, 'Der Einstiegsimpuls erscheint im Verlauf')

  const a = anfragen().find((z) => z.schemaName === 'stundenverlauf')
  pruefe(Boolean(a?.user.includes('EINSTIEG (didaktische Regeln') && a.user.includes('Leitfrage')), 'Der Auftrag enthält die Einstiegsregeln')

  // 1. Gefundenes Bild mit Quellenangabe
  let i = await warteAuf(page, (x) => x?.image)
  pruefe(i?.image?.source === 'wikimedia', `Bild aus der Suche übernommen (${i?.image?.source})`)
  await page.locator('[data-impuls-bild="wikimedia"]').waitFor({ timeout: 10000 })
  const kennung = await page.locator('[data-impuls-kennung]').innerText()
  pruefe(/Lewis Hine/.test(kennung) && /Public domain/i.test(kennung), `Quellenangabe unter dem Bild („${kennung.slice(0, 80)}")`)
  pruefe(/Gemeinfrei/.test(kennung), 'Lizenzhinweis: gemeinfrei')
  const pruefung = anfragen().filter((z) => z.schemaName === 'image_choice')
  pruefe(pruefung.length === 1 && pruefung[0].bilder > 0 && pruefung[0].user.includes('Warum arbeiteten Kinder'), 'Die Prüf-KI sah die Funde samt Leitfrage')
  await page.locator('[data-einstiegsimpuls]').scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(out, '1-gefundenes-bild.png') })
  await page.locator('[data-einstiegsimpuls]').screenshot({ path: join(out, '1b-karte.png') })

  // 2. Anderes Bild
  const erstesBild = i.image.dataUrl
  await page.locator('[data-impuls-anderes]').click()
  i = await warteAuf(page, (x) => x?.image && x.image.dataUrl !== erstesBild)
  pruefe(i?.image && i.image.dataUrl !== erstesBild, '„Anderes Bild" zeigt einen anderen Fund')

  // 3. Wechsel auf KI-Entwurf
  await page.locator('[data-impuls-ki]').click()
  i = await warteAuf(page, (x) => x?.image?.source === 'ai')
  pruefe(i?.image?.source === 'ai', 'Wechsel auf den KI-Entwurf')
  pruefe(Boolean(i?.image?.aiPrompt?.includes('Warum arbeiteten Kinder')), 'Der Bildauftrag nennt die Leitfrage')
  const bildAuftrag = anfragen().find((z) => z.schemaName === 'bild')
  pruefe(Boolean(bildAuftrag?.user.includes('spinning machines') && bildAuftrag.user.includes('no text')), 'Die Bild-KI bekam Impulsidee und Stilregeln')
  await page.locator('[data-impuls-bild="ai"]').waitFor({ timeout: 10000 })
  const kiKennung = await page.locator('[data-impuls-kennung]').innerText()
  pruefe(/KI-generiert/.test(kiKennung), 'KI-Bild ist gekennzeichnet')
  await page.locator('[data-einstiegsimpuls]').scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(out, '2-ki-entwurf.png') })

  // 4. Folienansicht mit Leitfrage
  await page.locator('[data-impuls-folie]').click()
  await page.locator('[data-impuls-foliensicht]').waitFor({ timeout: 5000 })
  await page.locator('[data-impuls-frage-zeigen]').click()
  await page.getByText('Warum arbeiteten Kinder in Fabriken?', { exact: true }).filter({ visible: true }).first().waitFor({ timeout: 5000 })
  pruefe(true, 'Folienansicht blendet die Leitfrage ein')
  await page.screenshot({ path: join(out, '3-folie.png') })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // 5. Aufs Blatt
  const vorher = await page.evaluate(() => window.__selftest.worksheetJetzt().sheets[0].blocks.length)
  await page.locator('[data-impuls-aufs-blatt]').click()
  await page.waitForTimeout(300)
  const blatt = await page.evaluate(() => window.__selftest.worksheetJetzt().sheets[0].blocks)
  const neu = blatt.find((b) => b.type === 'image' && b.role === 'motivation')
  pruefe(blatt.length === vorher + 1 && neu?.image?.source === 'ai', 'Bild als Abbildung aufs Blatt übernommen')
} catch (e) {
  problems.push(`Abbruch: ${e.message}`)
  await page.screenshot({ path: join(out, 'fehler.png') }).catch(() => undefined)
} finally {
  await app.close()
  rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
}

if (problems.length) {
  console.log(`\n${problems.length} Problem(e):\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
