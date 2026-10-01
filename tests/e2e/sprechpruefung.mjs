// Wache für die Sprechprüfung (01.10.2026) – mit KI-ATTRAPPE, ohne echte KI (vorher: npm run build).
// Aufruf: node tests/e2e/sprechpruefung.mjs <Ausgabeordner>
//
// 1. Klassenarbeit Englisch, Kl. 10, Niedersachsen: „Sprechprüfung" im Aufbau → Voreinstellung Paare,
//    zwei Kartensätze; erzeugt werden Karten A/B je Satz, Prüferbogen und Raster (Erwartungshorizont),
//    das Druck-HTML enthält alles und wird als PDF gesetzt.
// 2. Arbeitsblatt Englisch mit Kompetenzschwerpunkt „Sprechen: an Gesprächen teilnehmen (dialogisch)":
//    Musterdialog als eigener Hörtext mit zwei Stimmen, Redemittel, Beobachtungsbogen auf dem Blatt.
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/sprechpruefung')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-sprechen-'))
const protokoll = join(userData, 'ki-protokoll.jsonl')
const attrappe = join(userData, 'ki-attrappe.json')

// ---------- Antworten der Attrappe
const karte = (satz, i) => ({
  monologAufgabe: `Describe the photo and explain what it says about teenagers and social media (${satz}${i}).`,
  monologPunkte: ['what you can see', 'what the people might feel', 'your own opinion'],
  material:
    i === 0
      ? {
          art: 'bild',
          titel: `Photo ${satz}`,
          beschreibung: 'Jugendliche sitzen mit Smartphones auf einer Parkbank',
          text: '',
          quelle: '',
          kopf: [],
          zeilen: []
        }
      : {
          art: 'diagramm',
          titel: `Daily screen time ${satz}`,
          beschreibung: '',
          text: '',
          quelle: 'fiktive Daten',
          kopf: ['Age', 'Hours per day'],
          zeilen: [
            ['12', '3'],
            ['14', '4'],
            ['16', '5']
          ]
        },
  rolle: i === 0 ? 'You want a phone-free school day.' : 'You think phones help with learning.',
  rollenAufgabe: 'Discuss the idea with your partner and agree on a proposal for the school council.',
  rollenPunkte: ['give two reasons', 'react to your partner', 'make a compromise']
})
const sprech = {
  einstieg: ['How much time do you spend online?', 'Which apps do you use most?', 'What do you do offline in your free time?'],
  saetze: [1, 2].map((s) => ({
    thema: s === 1 ? 'Bildschirmzeit' : 'Handyverbot an Schulen',
    situation: `Your school council is planning project day ${s}.`,
    karten: [karte(s, 0), karte(s, 1)],
    nachfragen: ['Why do you think so?', 'Can you give an example?', 'What would your parents say?'],
    erwartungMonolog: ['Bild bzw. Diagramm beschreiben', 'Deutung', 'begründete Meinung'],
    erwartungDialog: ['Argumente austauschen', 'auf den Partner eingehen', 'Kompromiss']
  })),
  hinweise: ['Paare kurzfristig auslosen.', 'Sprechanteile ausgewogen halten.']
}

const leer = {
  kind: 'none',
  lines: 0,
  gapText: '',
  options: [],
  correctIndex: -1,
  pairs: [],
  items: [],
  rows: [],
  statements: [],
  labels: []
}
const baustein = (patch) => ({
  outlineIndex: 0,
  type: 'task',
  title: '',
  body: '',
  lineNumbers: false,
  items: [],
  instruction: '',
  operator: '',
  afb: '',
  afbReason: '',
  socialForm: 'EA',
  minutes: 5,
  points: 0,
  solution: '',
  answer: leer,
  parts: [],
  headers: [],
  rows: [],
  heightMm: 0,
  ...patch
})
const dialog =
  'Mia: I think we should ban phones during lessons.\nTom: Hmm, let me think about that. I see your point, but phones can help us learn.\nMia: That is true. What if we use them only for research?\nTom: Sounds like a good compromise.'
const blatt = {
  blocks: [
    baustein({
      type: 'infoBox',
      variant: 'regel',
      title: 'Situation',
      body: 'Your school council discusses a phone-free school day.'
    }),
    baustein({
      outlineIndex: 1,
      type: 'infoBox',
      variant: 'regel',
      title: 'Partner A',
      body: 'You are for a phone-free day. Give two reasons.'
    }),
    baustein({
      outlineIndex: 2,
      type: 'infoBox',
      variant: 'regel',
      title: 'Partner B',
      body: 'You are against it. Give two reasons.'
    }),
    baustein({
      outlineIndex: 3,
      instruction: '**Discuss** the idea with your partner for about five minutes.',
      operator: 'discuss',
      afb: 'III',
      socialForm: 'PA'
    }),
    baustein({
      outlineIndex: 4,
      type: 'phrases',
      title: 'Useful phrases',
      body: 'Für Aufgabe 1',
      phraseGroups: [
        {
          label: 'Giving your opinion',
          items: [{ text: 'In my opinion …', german: 'Meiner Meinung nach …' }]
        },
        {
          label: 'Gaining time',
          items: [
            {
              text: 'Let me think about that.',
              german: 'Lass mich kurz überlegen.'
            }
          ]
        }
      ]
    }),
    baustein({
      outlineIndex: 5,
      type: 'table',
      title: 'Beobachtungsbogen',
      headers: ['Kriterium', 'gelungen', 'noch üben', 'Beispiel bzw. Tipp'],
      rows: [
        ['Interaktion', '', '', ''],
        ['Aussprache und Intonation', '', '', '']
      ]
    }),
    baustein({
      outlineIndex: 6,
      type: 'selfCheck',
      title: 'Selbsteinschätzung',
      variant: 'kompetenzraster',
      items: ['Ich kann meine Meinung begründen.', 'Ich kann auf meinen Partner eingehen.']
    }),
    baustein({
      outlineIndex: 7,
      type: 'audio',
      title: 'Model dialogue',
      variant: 'Mustergespräch',
      body: dialog,
      speakers: [{ name: 'Mia' }, { name: 'Tom' }],
      plays: 2,
      instruction: 'Zwei Prüflinge im Gespräch.'
    }),
    baustein({
      outlineIndex: 8,
      instruction: '**Tick** the phrases you hear.',
      operator: 'tick',
      afb: 'I',
      skill: 'listening',
      solution: 'Let me think about that.',
      answer: {
        ...leer,
        kind: 'multipleChoice',
        options: ['Let me think about that.', 'I am sorry.'],
        correct: [0]
      }
    })
  ]
}
writeFileSync(
  attrappe,
  JSON.stringify({
    verzoegerungMs: 200,
    protokoll,
    antworten: {
      speaking_exam: sprech,
      listening_script: {
        title: 'Model dialogue',
        textType: 'Mustergespräch',
        speakers: ['Mia', 'Tom'],
        transcript: dialog,
        beforeListening: 'Zwei Prüflinge im Gespräch.',
        plays: 2
      },
      worksheet_outline: {
        title: 'Speaking: phones at school',
        learningGoals: ['Ich kann an einem Gespräch teilnehmen.'],
        minutes: 45,
        teacherNote: '',
        items: [
          {
            type: 'infoBox',
            purpose: 'Karten',
            afb: '',
            operator: '',
            socialForm: 'PA',
            stars: 0,
            answerKind: 'none'
          }
        ]
      },
      worksheet: blatt,
      worksheet_review: { problems: [] }
    }
  })
)

const problems = []
const pruefe = (ok, t) => {
  if (!ok) problems.push(t)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${t}`)
}
const anfragen = () =>
  existsSync(protokoll)
    ? readFileSync(protokoll, 'utf-8')
        .trim()
        .split('\n')
        .map((z) => JSON.parse(z))
    : []

const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`],
  env: {
    ...process.env,
    SCHULAPPS_SELFTEST: '1',
    SCHULAPPS_KI_ATTRAPPE: attrappe
  }
})
const page = await app.firstWindow()
page.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${e.message}`))
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1500, 1050))
await warteAufOberflaeche(page)
const sichtbar = (l) => l.filter({ visible: true }).first()
const waehle = async (label, option) => {
  await sichtbar(page.getByLabel(label, { exact: true })).click()
  await sichtbar(page.getByRole('option', { name: option, exact: true })).click()
  await page.waitForTimeout(300)
}
const blattText = () => sichtbar(page.locator('.ws-editor-pages')).innerText()

try {
  // ---------- 1. Klassenarbeit
  await page.click('[aria-label="Klassenarbeiten"]')
  await page.waitForSelector('text=Rahmen der Arbeit')
  await waehle('Fach', 'Englisch')
  await waehle('Jahrgang', 'Klasse 10')
  await sichtbar(page.getByLabel('Thema', { exact: false })).fill('Teenagers and social media')
  await page.getByRole('button', { name: 'Sprechprüfung', exact: true }).click()
  const einstellungen = page.getByTestId('sprechpruefung-einstellungen')
  await einstellungen.waitFor({ timeout: 5000 })
  const segment = einstellungen.getByRole('radiogroup', {
    name: 'Gruppengröße'
  })
  pruefe(await segment.getByRole('radio', { name: 'Paare' }).isChecked(), 'Niedersachsen: Voreinstellung Paarprüfung')
  pruefe(
    await einstellungen.getByRole('switch', { name: 'Ersetzt eine schriftliche Klassenarbeit' }).isChecked(),
    'Ersetzt eine schriftliche Arbeit (NI: je Doppeljahrgang)'
  )
  pruefe((await einstellungen.innerText()).includes('Doppeljahrgang'), 'Die Regel des Landes steht dabei')
  await einstellungen.scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(out, '01-rahmen-sprechpruefung.png') })

  await page.getByRole('button', { name: 'Weiter zu den Aufgaben' }).click()
  await sichtbar(page.getByRole('button', { name: 'Klassenarbeit erzeugen' })).click()
  await page.locator('.ws-editor-pages .ws-page').first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(1200)
  const arbeit = await blattText()
  pruefe(/Set 1/.test(arbeit) && /Set 2/.test(arbeit), 'Zwei Kartensätze auf dem Blatt')
  pruefe(
    (arbeit.match(/Candidate A · Part 2/g) ?? []).length === 2 && (arbeit.match(/Candidate B · Part 3/g) ?? []).length === 2,
    'Karten für Prüfling A und B in jedem Satz'
  )
  // Lehrkraft-Bausteine stehen im Editor mit Vermerk „nur im Lösungsteil" und fehlen im Druck der Arbeit
  pruefe((await page.locator('[data-nur-loesung]', { hasText: 'Prüferbogen' }).count()) > 0, 'Prüferbogen ist als „nur im Lösungsteil" gekennzeichnet')
  await page.screenshot({ path: join(out, '02-karten.png') })
  const sp = anfragen().filter((a) => a.schemaName === 'speaking_exam')
  pruefe(sp.length === 1 && sp[0].user.includes('GENAU 2 gleichwertige Kartensätze'), 'Eine Anfrage für alle Kartensätze')

  await page.getByText('Erwartungshorizont', { exact: true }).click()
  await page.waitForTimeout(1000)
  const key = await blattText()
  pruefe(
    key.includes('Prüferbogen') && key.includes('Zeitplan') && key.includes('Einstiegsfragen'),
    'Erwartungshorizont: Prüferbogen mit Zeitplan und Einstiegsfragen'
  )
  pruefe(key.includes('Bewertungsraster') && key.includes('Prüfling A') && key.includes('Prüfling B'), 'Erwartungshorizont: Raster je Prüfling')
  pruefe(key.includes('Notenschlüssel der Sprechprüfung'), 'Notenschlüssel zum Raster')
  await page.screenshot({ path: join(out, '03-erwartungshorizont.png') })
  await sichtbar(page.locator('.ws-editor-pages').getByText('Bewertungsraster', { exact: false })).scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(out, '04-raster.png') })

  // Druck: dasselbe HTML wie der Export, als PDF gesetzt
  const html = await page.evaluate(() => window.__selftest.druckHtmlJetzt())
  pruefe(html.includes('Candidate A') && html.includes('Prüferbogen') && html.includes('Bewertungsraster'), 'Druck enthält Karten, Prüferbogen und Raster')
  const pfad = join(userData, 'druck.html')
  writeFileSync(pfad, html, 'utf8')
  const seiten = await app.evaluate(async ({ BrowserWindow }, p) => {
    const win = new BrowserWindow({
      show: false,
      width: 1000,
      height: 1400,
      webPreferences: { sandbox: true }
    })
    try {
      await win.loadFile(p)
      const pdf = await win.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        preferCSSPageSize: true
      })
      return {
        n: (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length,
        b64: pdf.toString('base64')
      }
    } finally {
      win.destroy()
    }
  }, pfad)
  writeFileSync(join(out, 'sprechpruefung.pdf'), Buffer.from(seiten.b64, 'base64'))
  pruefe(seiten.n >= 4, `Druck als PDF: ${seiten.n} Seiten (${join(out, 'sprechpruefung.pdf')})`)

  // ---------- 2. Arbeitsblatt zur Vorbereitung
  await page.click('[aria-label="Arbeitsblatt"]')
  const thema = sichtbar(page.getByRole('textbox', { name: 'Thema' }))
  await thema.waitFor({ timeout: 15000 })
  await waehle('Fach', 'Englisch')
  await thema.fill('Phones at school')
  await waehle('Kompetenzschwerpunkt', 'Sprechen: an Gesprächen teilnehmen (dialogisch)')
  const teile = sichtbar(page.getByLabel('Teile des Blattes zur Sprechprüfung', { exact: false }))
  pruefe(await teile.isVisible(), 'Auswahl der Teile erscheint beim Schwerpunkt Sprechen')
  await page.screenshot({ path: join(out, '05-arbeitsblatt-schwerpunkt.png') })
  await sichtbar(page.getByRole('button', { name: 'Gliederung planen' })).click()
  await sichtbar(page.getByText('Gliederung prüfen')).waitFor({
    timeout: 30000
  })
  await sichtbar(page.getByRole('button', { name: 'Arbeitsblatt ausformulieren' })).click()
  await sichtbar(page.getByText('Bearbeiten & Export')).waitFor({
    timeout: 30000
  })
  await page.waitForTimeout(1500)
  const ab = await blattText()
  pruefe(ab.includes('Partner A') && ab.includes('Partner B'), 'Übungskarten für Partner A und B')
  pruefe(ab.includes('Useful phrases') && ab.includes('Gaining time'), 'Redemittel und Strategien')
  pruefe(ab.includes('Beobachtungsbogen'), 'Beobachtungsbogen')
  pruefe(ab.includes('Model dialogue'), 'Musterdialog als Hörtext')
  const skript = anfragen().find((a) => a.schemaName === 'listening_script')
  pruefe(Boolean(skript?.user.includes('GENAU ZWEI Sprechende')), 'Hörtext-Auftrag: Musterdialog mit zwei Stimmen')
  const auftrag = anfragen().find((a) => a.schemaName === 'worksheet')
  pruefe(
    Boolean(
      `${auftrag?.system ?? ''}
${auftrag?.user ?? ''}`.includes('SCHWERPUNKT SPRECHEN')
    ),
    'Blatt-Auftrag mit den Regeln zum Sprechen'
  )
  await page.screenshot({ path: join(out, '06-arbeitsblatt.png') })
} catch (e) {
  problems.push(`Abbruch: ${e.message}`)
  await page.screenshot({ path: join(out, 'fehler.png') }).catch(() => undefined)
} finally {
  await app.close().catch(() => undefined)
  try {
    rmSync(userData, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 500
    })
  } catch {
    // Electron hält Dateien manchmal noch kurz fest
  }
}

if (problems.length) {
  console.error(`\n${problems.length} Problem(e):\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log(`\nSprechprüfung: alles in Ordnung. Bilder in ${out}`)
