// Wache für das Programm „Lernzielkontrolle" – OHNE KI (vorher: npm run build).
// Aufruf: node tests/e2e/lernzielkontrolle.mjs <Ausgabeordner>
//
// Geprüft wird beides: dass die Oberfläche steht (Schritt 1 und Schritt 2 ohne Absturz)
// und dass die Prüfungen an einem absichtlich fehlerhaften Blatt anschlagen. Das Prüfblatt
// trägt genau die Fehler aus der Lernzielkontrolle zu den Potenzgesetzen, die die Lehrkraft
// vorgelegt hat: „Bestimme" für eine Zuordnung, „Deute" ohne Sachzusammenhang, zwei
// Operatoren in einer Aufgabe – dazu ein Merkkasten, der auf ein Prüfungsblatt nicht gehört.
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/lernzielkontrolle')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'schulapps-lzk-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1' } })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

await app.evaluate(async ({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.setSize(1600, 1050)
    win.center()
  }
})
await warteAufOberflaeche(page)

const problems = []

// Schritt 1: Die Kachel muss da sein und die Einstellungen müssen erscheinen
const kachel = await page.$('[aria-label="Lernzielkontrolle"]')
if (!kachel) problems.push('Das Programm erscheint nicht in der Seitenleiste')
else {
  await kachel.click()
  await page.waitForTimeout(1200)
  const schritt1 = await page.evaluate(() => {
    const text = document.body.textContent ?? ''
    return {
      lerngruppe: text.includes('Lerngruppe'),
      format: text.includes('Format'),
      operatoren: text.includes('Operatoren'),
      nachteil: text.includes('Nachteilsausgleich'),
      // Tafelbilder und Buchseiten lassen sich hineinziehen
      ablage: text.includes('Tafelbild, Buchseite oder Hefteintrag hierher ziehen'),
      // Das Landesformat aus den Einstellungen – der Kern des Programms
      formatText: [...document.querySelectorAll('.mantine-Badge-root')].map((b) => b.textContent ?? '').join(' | ')
    }
  })
  console.log('Schritt 1 – Karten:', JSON.stringify(schritt1, null, 0).slice(0, 300))
  for (const [k, v] of Object.entries({
    Lerngruppe: schritt1.lerngruppe,
    Format: schritt1.format,
    Operatoren: schritt1.operatoren,
    Nachteilsausgleich: schritt1.nachteil
  })) {
    if (!v) problems.push(`Die Karte „${k}" fehlt in Schritt 1`)
  }
  /*
   * Bundesland und Schulform stehen in den Einstellungen und werden hier nicht erneut
   * abgefragt: Solange die Kontrolle die eingestellte Lerngruppe benutzt, steht statt der
   * zwei Auswahlfelder nur eine Zeile mit „ändern".
   */
  const eingeklappt = await page.evaluate(() => {
    const feld = (name) => [...document.querySelectorAll('label')].some((l) => l.textContent?.trim() === name)
    return { land: feld('Bundesland'), form: feld('Schulform'), aendern: (document.body.textContent ?? '').includes('ändern') }
  })
  console.log('Lerngruppe eingeklappt:', JSON.stringify(eingeklappt))
  if (eingeklappt.land || eingeklappt.form) problems.push('Bundesland und Schulform werden trotz Voreinstellung erneut abgefragt')
  if (!eingeklappt.aendern) problems.push('Es gibt keinen Weg, Bundesland und Schulform doch zu ändern')
  await page.screenshot({ path: join(out, '1-einstellungen.png'), fullPage: false })
  // Die Ablage für Tafelbilder liegt weiter unten – eigenes Bild davon
  await page.evaluate(() => {
    const e = [...document.querySelectorAll('*')].find((x) => x.textContent?.trim() === 'Inhalt und Umfang')
    e?.scrollIntoView({ block: 'start' })
  })
  await page.waitForTimeout(600)
  await page.screenshot({ path: join(out, '1b-unterlagen.png'), fullPage: false })

  /*
   * Niedersachsen + Deutsch + Sek I: Dort gilt die ANHÖRFASSUNG des Kerncurriculums. Die
   * Oberfläche muss das als Entwurf kennzeichnen – eine Liste, die sich noch ändern kann,
   * darf nicht wie geltendes Recht aussehen.
   */
  await page.evaluate(() => {
    const e = [...document.querySelectorAll('*')].find((x) => x.textContent?.trim() === 'Operatoren')
    e?.scrollIntoView({ block: 'start' })
  })
  const eingestellt = await page.evaluate(() => window.__selftest.lzkEinstellung('NI', 'deutsch', 'sek1'))
  console.log('Profil:', eingestellt.profil.slice(0, 110))
  await page.waitForTimeout(800)
  const entwurf = await page.evaluate(() => {
    const badges = [...document.querySelectorAll('.mantine-Badge-root')].map((b) => (b.textContent ?? '').trim())
    return { badges, anhoer: (document.body.textContent ?? '').includes('ANHÖRFASSUNG') }
  })
  console.log('Operatoren-Kennzeichnung:', entwurf.badges.filter((b) => /Entwurf|Liste/.test(b)).join(' · '))
  await page.screenshot({ path: join(out, '1c-entwurf.png'), fullPage: false })
  if (!entwurf.badges.includes('Entwurf')) problems.push('Die Anhörfassung wird nicht als Entwurf gekennzeichnet')
  if (!entwurf.anhoer) problems.push('Der Stand „ANHÖRFASSUNG" steht nicht in der Oberfläche')

  /*
   * Operatoren an- und abwählen. Die Auswahl ist ein Vorschlag an die KI – geprüft wird
   * hier nur, dass das Anklicken überhaupt ankommt und sich wieder rückgängig machen lässt.
   */
  const chip = await page.$('[role="checkbox"][aria-checked="false"]')
  if (!chip) problems.push('Die Operatoren lassen sich nicht anklicken')
  else {
    const name = (await chip.textContent())?.trim()
    await chip.click()
    await page.waitForTimeout(400)
    const nachKlick = await page.evaluate(() => ({
      gewaehlt: document.querySelectorAll('[role="checkbox"][aria-checked="true"]').length,
      hinweis: (document.body.textContent ?? '').includes('bevorzugt – als Vorschlag, nicht als Zwang')
    }))
    console.log(`Operator „${name}" angeklickt: ${nachKlick.gewaehlt} gewählt, Hinweis ${nachKlick.hinweis ? 'da' : 'fehlt'}`)
    if (nachKlick.gewaehlt !== 1) problems.push(`Nach dem Anklicken sind ${nachKlick.gewaehlt} Operatoren gewählt statt 1`)
    if (!nachKlick.hinweis) problems.push('Der Hinweis „als Vorschlag, nicht als Zwang" fehlt')
    await chip.click()
    await page.waitForTimeout(400)
    const nachAbwahl = await page.evaluate(() => document.querySelectorAll('[role="checkbox"][aria-checked="true"]').length)
    if (nachAbwahl !== 0) problems.push(`Abwählen wirkt nicht: noch ${nachAbwahl} gewählt`)
  }

  /*
   * Themenvorschläge aus den Lehrplänen.
   *
   * Zwei Fälle, weil die Länder ihre Themen unterschiedlich fest zuordnen:
   * Bayern nennt die Jahrgangsstufe, Berlin führt Doppeljahrgänge. Bei einem Doppeljahrgang
   * müssen dieselben Themen in BEIDEN Jahren erscheinen und die Oberfläche muss dazusagen,
   * dass der Lehrplan sie nicht auf ein einzelnes Jahr festlegt.
   */
  const themenListe = async () => {
    const feld = await page.$('input[placeholder="z. B. Potenzgesetze"]')
    if (!feld) return []
    // Erst den Fokus abgeben: ein Klick in ein Feld, das schon den Fokus hat, klappt die
    // Liste nicht erneut auf – der zweite Abruf käme sonst leer zurück.
    await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined))
    await page.waitForTimeout(200)
    await feld.click()
    await page.waitForTimeout(400)
    /*
     * Nur die Liste DIESES Feldes zählen. Ein `document.querySelectorAll('[role="option"]')`
     * sammelt auch die Einträge der Bundesland- und Fach-Auswahl ein und meldet dann 343
     * Themen, von denen eines „Baden-Württemberg" heißt.
     */
    return page.evaluate(() => {
      const eingabe = document.querySelector('input[placeholder="z. B. Potenzgesetze"]')
      const liste = eingabe?.getAttribute('aria-controls')
      const box = liste ? document.getElementById(liste) : null
      return box ? [...box.querySelectorAll('[role="option"]')].map((o) => (o.textContent ?? '').trim()) : []
    })
  }

  const bayern = await page.evaluate(() => window.__selftest.lzkLerngruppe('BY', 'mathematik', 9))
  await page.waitForTimeout(600)
  const listeBY = await themenListe()
  console.log(`Themen BY Mathematik 9: ${listeBY.length} zur Auswahl, u. a. „${listeBY[0] ?? '–'}"`)
  if (!listeBY.includes('Satz des Pythagoras')) problems.push('Bayern Mathematik 9 schlägt „Satz des Pythagoras" nicht vor')
  if (/beide Jahre|Doppeljahrgang/.test(bayern.hinweis)) problems.push('Bayern ist jahrgangsscharf, der Hinweis spricht aber von einem Doppeljahrgang')
  await page.keyboard.press('Escape')

  const berlin7 = await page.evaluate(() => window.__selftest.lzkLerngruppe('BE', 'chemie', 7))
  await page.waitForTimeout(600)
  const liste7 = await themenListe()
  await page.keyboard.press('Escape')
  const berlin8 = await page.evaluate(() => window.__selftest.lzkLerngruppe('BE', 'chemie', 8))
  await page.waitForTimeout(600)
  const liste8 = await themenListe()
  console.log(`Themen BE Chemie 7/8: ${liste7.length} bzw. ${liste8.length} zur Auswahl`)
  console.log('Hinweis:', berlin7.hinweis.slice(-90))
  if (!liste7.length) problems.push('Berlin Chemie 7 schlägt keine Themen vor')
  if (liste7.join('|') !== liste8.join('|')) problems.push('Der Doppeljahrgang 7/8 schlägt in Klasse 8 andere Themen vor als in Klasse 7')
  if (!berlin7.hinweis.includes('gelten für beide Jahre')) problems.push('Beim Doppeljahrgang fehlt der Hinweis, dass die Themen für beide Jahre gelten')
  // Seit Paket 6 steht der Themenhinweis nach seinem ersten Satz hinter „Mehr“
  // Ein geklicktes „Mehr“ heißt danach „Weniger“ – deshalb immer das erste verbleibende
  const mehr = page.getByRole('button', { name: 'Mehr', exact: true }).filter({ visible: true })
  for (let i = 0; i < 10 && (await mehr.count()); i++) await mehr.first().click()
  await page.waitForTimeout(300)
  const hinweisSichtbar = await page.evaluate(() => (document.body.textContent ?? '').includes('gelten für beide Jahre'))
  if (!hinweisSichtbar) problems.push('Der Doppeljahrgangs-Hinweis steht nicht in der Oberfläche')
  await page.screenshot({ path: join(out, '1d-themen.png'), fullPage: false })
  await page.keyboard.press('Escape')

  /*
   * Niedersachsen: Mathematik hat Themen, Deutsch nicht.
   *
   * Das Kerncurriculum Deutsch nennt in keiner Schulform Themen, nur Kompetenzbereiche.
   * Dort MUSS die Liste leer bleiben – eine aus Kompetenzformulierungen gebastelte
   * Vorschlagsliste sähe aus wie eine Lehrplanauskunft und wäre keine.
   */
  const niMathe = await page.evaluate(() => window.__selftest.lzkLerngruppe('NI', 'mathematik', 9))
  await page.waitForTimeout(600)
  const listeNI = await themenListe()
  await page.keyboard.press('Escape')
  const niDeutsch = await page.evaluate(() => window.__selftest.lzkLerngruppe('NI', 'deutsch', 9))
  await page.waitForTimeout(600)
  const listeDeutsch = await themenListe()
  await page.keyboard.press('Escape')
  console.log(`Themen NI Mathematik 9: ${listeNI.length} · NI Deutsch 9: ${listeDeutsch.length} (dort nennt das KC keine)`)
  if (!listeNI.length) problems.push('Niedersachsen Mathematik 9 schlägt keine Themen vor')
  if (!niMathe.hinweis.includes('Kerncurriculum')) problems.push('Bei Niedersachsen fehlt die Fundstelle im Hinweis')
  if (listeDeutsch.length) problems.push(`Niedersachsen Deutsch 9 schlägt ${listeDeutsch.length} Themen vor, obwohl das KC keine nennt`)
  if (niDeutsch.hinweis) problems.push('Ohne Themen darf auch kein Hinweis stehen')

  /*
   * Zweig-Auswahl: Sachsen teilt die Oberschule ab Klasse 7 in Haupt- und
   * Realschulbildungsgang mit unterschiedlichen Themen. Ohne die Auswahl stünden beide
   * Listen vermischt da, und eine Lehrkraft bekäme Themen vorgeschlagen, die ihr
   * Bildungsgang gar nicht hat.
   */
  await page.evaluate(() => window.__selftest.lzkLerngruppe('SN', 'mathematik', 7, 'oberschule'))
  await page.waitForTimeout(700)
  /*
   * Jetzt weicht die Kontrolle von den Einstellungen ab (Sachsen statt Niedersachsen).
   * Dann MUSS die Auswahl offen stehen – sonst verstecken wir genau den Unterschied, der
   * erklärt, warum hier andere Vorschläge kommen als sonst.
   */
  const abweichend = await page.evaluate(() => [...document.querySelectorAll('label')].some((l) => l.textContent?.trim() === 'Bundesland'))
  if (!abweichend) problems.push('Bei abweichendem Bundesland bleibt die Auswahl eingeklappt')
  const zweigAngaben = await page.evaluate(() => {
    const label = [...document.querySelectorAll('label')].find((l) => l.textContent?.trim() === 'Zweig laut Lehrplan')
    const eingabe = label?.parentElement?.querySelector('input')
    return { da: Boolean(label), wert: eingabe?.value ?? '', id: eingabe?.getAttribute('aria-controls') ?? '' }
  })
  const alleZweige = await themenListe()
  await page.keyboard.press('Escape')
  console.log(`Zweig-Auswahl SN Oberschule: ${zweigAngaben.da ? `„${zweigAngaben.wert}"` : 'fehlt'} · ${alleZweige.length} Themen über alle Zweige`)
  if (!zweigAngaben.da) problems.push('Für die sächsische Oberschule fehlt die Zweig-Auswahl')
  if (zweigAngaben.wert !== 'Alle Zweige') problems.push(`Die Zweig-Auswahl startet mit „${zweigAngaben.wert}" statt mit „Alle Zweige"`)

  // Einen Bildungsgang wählen – die Liste muss kürzer werden
  await page.evaluate(() => {
    const label = [...document.querySelectorAll('label')].find((l) => l.textContent?.trim() === 'Zweig laut Lehrplan')
    label?.parentElement?.querySelector('input')?.click()
  })
  await page.waitForTimeout(400)
  const gewaehlt = await page.evaluate(() => {
    const o = [...document.querySelectorAll('[role="option"]')].find((x) => (x.textContent ?? '').includes('Realschulbildungsgang'))
    o?.click()
    return (o?.textContent ?? '').trim()
  })
  await page.waitForTimeout(500)
  const nurRS = await themenListe()
  await page.keyboard.press('Escape')
  const zweigHinweis = await page.evaluate(() => (document.body.textContent ?? '').includes('trennt hier nach Zweig'))
  console.log(`Nach Wahl „${gewaehlt}": ${nurRS.length} Themen (vorher ${alleZweige.length})`)
  if (!gewaehlt) problems.push('Der Bildungsgang ließ sich nicht auswählen')
  else if (nurRS.length >= alleZweige.length) problems.push(`Die Auswahl eines Zweigs verkürzt die Liste nicht (${nurRS.length} von ${alleZweige.length})`)
  if (zweigHinweis) problems.push('Der Satz über die vermischten Zweige steht noch da, obwohl einer gewählt ist')
  await page.screenshot({ path: join(out, '1e-zweig.png'), fullPage: false })
}

// Schritt 2: fertige Kontrolle in den Zustand legen und die Befunde prüfen
const info = await page.evaluate(() => window.__selftest.lzkSheet('BY', 3))
console.log('Bausteine gesetzt:', info.aufgaben)
await page.waitForTimeout(1500)

const seen = await page.evaluate(() => {
  /*
   * NUR im sichtbaren Programm suchen. Die Schul-Apps halten alle Programme im Hintergrund
   * geladen; über `document` gezählt erschienen hier Meldungen der Vokabelliste und der
   * Einstellungen, und die Wache hätte sie für Befunde dieses Programms gehalten.
   */
  const blatt = document.querySelector('.ws-editor-pages')
  const wurzel = blatt?.closest('.mantine-Container-root') ?? document
  const text = wurzel.textContent ?? ''
  const badges = [...wurzel.querySelectorAll('.mantine-Badge-root')].map((b) => (b.textContent ?? '').trim())
  return {
    seiteDa: Boolean(document.querySelector('.ws-editor-pages')),
    badges,
    // Die Befunde stehen in Warnkästen
    befunde: [...wurzel.querySelectorAll('.mantine-Alert-root')].map((a) => (a.textContent ?? '').replace(/\s+/g, ' ').trim()),
    // Formeln müssen auch hier gesetzt sein
    formeln: document.querySelectorAll('.ws-editor-pages .rt-math').length,
    dollar: (document.querySelector('.ws-editor-pages')?.textContent ?? '').match(/\$[^$]{1,30}\$/g) ?? [],
    kopfzeile: (document.querySelector('.ws-editor-pages .ws-header')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    text
  }
})

console.log('Kennzahlen:', seen.badges.filter((b) => /Teilaufgabe|Punkte|Minuten|Warnung|Hinweis/.test(b)).join(' · '))
console.log('Kopfzeile:', seen.kopfzeile.slice(0, 90))
console.log(`Befunde (${seen.befunde.length}):`)
for (const b of seen.befunde) console.log('  -', b.slice(0, 130))

await page.screenshot({ path: join(out, '2-editor.png'), fullPage: false })

/*
 * Der Befundbereich steht ZUGEKLAPPT.
 *
 * Vorher klappte er bei jeder Warnung von selbst auf und schob das Blatt fast aus dem Bild.
 */
const befundBereich = await page.evaluate(() => {
  const w = document.querySelector('.ws-editor-pages')?.closest('.mantine-Container-root') ?? document
  const ctrl = w.querySelector('.mantine-Accordion-control')
  return {
    da: Boolean(ctrl),
    text: (ctrl?.textContent ?? '').trim(),
    offen: ctrl?.getAttribute('aria-expanded') === 'true'
  }
})
console.log('Befundbereich:', JSON.stringify(befundBereich))
if (!befundBereich.da) problems.push('Der Befundbereich fehlt')
if (befundBereich.offen) problems.push('Der Befundbereich ist aufgeklappt statt zugeklappt')
if (!/^Was der App aufgefallen ist \(\d+\)$/.test(befundBereich.text)) {
  problems.push(`Der Befundbereich nennt die Zahl nicht: „${befundBereich.text}"`)
}

/*
 * Rueckfrage beim Ausgeben mehrerer Fassungen. Ohne sie bekaeme man beim Drucken
 * stillschweigend nur die angezeigte Fassung. Seit Paket 4 steht sie im Ausgabe-Dialog,
 * zusammen mit der Frage nach den Loesungen.
 */
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Drucken')
  b?.click()
})
await page.waitForTimeout(600)
const rueckfrage = await page.evaluate(() => {
  const text = document.body.textContent ?? ''
  return {
    gefragt: text.includes('nur die angezeigte oder alle?'),
    nurEine: [...document.querySelectorAll('.mantine-Modal-content label')].some((b) => /^Nur Gruppe [A-Z]$/.test(b.textContent?.trim() ?? '')),
    alle: [...document.querySelectorAll('.mantine-Modal-content label')].some((b) => b.textContent?.trim() === 'Alle in einer Datei')
  }
})
console.log('Rückfrage:', JSON.stringify(rueckfrage))
if (!rueckfrage.gefragt) problems.push('Bei mehreren Fassungen wird nicht gefragt')
if (!rueckfrage.nurEine || !rueckfrage.alle) problems.push('Die Rückfrage bietet nicht beide Möglichkeiten an')
await page.screenshot({ path: join(out, '2b-fassungen.png'), fullPage: false })
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Abbrechen')
  b?.click()
})
await page.waitForTimeout(300)

if (!seen.seiteDa) problems.push('Das Blatt wird nicht angezeigt')
if (seen.dollar.length) problems.push(`Dollarzeichen auf dem Blatt: ${seen.dollar.slice(0, 3).join(' , ')}`)
if (seen.formeln < 2) problems.push(`Nur ${seen.formeln} gesetzte Formeln auf dem Blatt`)

// Die Bezeichnung des Landesformats gehört in die Kopfzeile – Bayern: Stegreifaufgabe
if (!/Stegreifaufgabe/.test(seen.kopfzeile)) problems.push(`Die Kopfzeile nennt das Landesformat nicht: „${seen.kopfzeile.slice(0, 60)}"`)

// Die vier Befunde, die das Programm finden MUSS
const alle = seen.befunde.join(' ')
const erwartet = {
  'Zuordnung ohne Lösungsweg': /keinen Weg zum Darstellen/,
  'Deuten ohne Sachzusammenhang': /vorgegebenen Sachzusammenhang/,
  'zwei Operatoren in einer Aufgabe': /zwei Dinge auf einmal/,
  'Merkkasten auf dem Prüfungsblatt': /prüft, ob ohne Erklärung gewusst wird/,
  'halb bepunktetes Blatt': /Entweder alle oder keine/
}
for (const [name, muster] of Object.entries(erwartet)) {
  if (!muster.test(alle)) problems.push(`Nicht gemeldet: ${name}`)
}

/*
 * Bibliothek: speichern, wiederfinden, loeschen.
 *
 * Geprueft wird der ganze Weg - der Eintrag muss nach dem Speichern in der Liste stehen,
 * und nach dem Loeschen wieder verschwunden sein. Eine Bibliothek, die speichert, aber
 * nicht loescht, laesst sich nicht aufraeumen.
 */
const gespeichert = await page.evaluate(() => window.__selftest.lzkSpeichern('Prüflauf Potenzgesetze'))
console.log(`Bibliothek nach dem Speichern: ${gespeichert.anzahl} Eintrag/Einträge · „${gespeichert.namen[0] ?? '-'}"`)
if (gespeichert.anzahl < 1) problems.push('Die Kontrolle wurde nicht in der Bibliothek gespeichert')
if (!gespeichert.namen.includes('Prüflauf Potenzgesetze')) problems.push('Der gespeicherte Eintrag trägt nicht den gewählten Namen')
if (gespeichert.erste && gespeichert.erste.bezeichnung !== 'Stegreifaufgabe') {
  problems.push(`Der Eintrag nennt das Landesformat nicht: „${gespeichert.erste.bezeichnung}"`)
}

// Die Übersicht öffnen und ansehen
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.includes('Meine Lernzielkontrollen'))
  b?.click()
})
await page.waitForTimeout(900)
const uebersicht = await page.evaluate(() => {
  const text = document.body.textContent ?? ''
  return {
    ueberschrift: text.includes('Meine Lernzielkontrollen'),
    eintrag: text.includes('Prüflauf Potenzgesetze'),
    oeffnen: [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Öffnen')
  }
})
console.log('Übersicht:', JSON.stringify(uebersicht))
if (!uebersicht.ueberschrift) problems.push('Die Übersicht „Meine Lernzielkontrollen" erscheint nicht')
if (!uebersicht.eintrag) problems.push('Der gespeicherte Eintrag steht nicht in der Übersicht')
if (!uebersicht.oeffnen) problems.push('Es gibt keinen Knopf zum Öffnen')
await page.screenshot({ path: join(out, '3-bibliothek.png'), fullPage: false })

const geloescht = await page.evaluate((id) => window.__selftest.lzkLoeschen(id), gespeichert.erste?.id ?? '')
console.log('Nach dem Löschen:', geloescht.anzahl, 'Einträge')
if (geloescht.anzahl !== 0) problems.push(`Nach dem Löschen sind noch ${geloescht.anzahl} Einträge übrig`)

/*
 * Notenschluessel in den Einstellungen: allgemein und je Fach.
 *
 * Geprueft wird, dass die fuenf Schwellen da sind und die Voreinstellung 91/78/64/50/25
 * lautet - der Wunsch der Lehrkraft.
 */
await page.click('[aria-label="Einstellungen"]').catch(() => undefined)
await page.waitForTimeout(1200)

/*
 * Die Einstellungen sind in Reiter gegliedert. Geprueft wird, dass alle fuenf da sind und
 * dass der Notenschluessel ueber seinen Reiter erreichbar bleibt - sonst waere er zwar
 * vorhanden, aber niemand faende ihn.
 */
const reiter = await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].map((t) => (t.textContent ?? '').trim()))
console.log('Reiter in den Einstellungen:', reiter.join(' · '))
for (const name of ['Schule', 'Material', 'Darstellung', 'KI-Zugang', 'Bilder und Hörtexte']) {
  if (!reiter.includes(name)) problems.push(`Der Reiter „${name}" fehlt in den Einstellungen`)
}
await page.evaluate(() => {
  const t = [...document.querySelectorAll('[role="tab"]')].find((x) => (x.textContent ?? '').trim() === 'Material')
  t?.click()
})
await page.waitForTimeout(700)

const einstellungen = await page.evaluate(() => {
  const karte = [...document.querySelectorAll('.mantine-Card-root')].find((c) => c.textContent?.startsWith('Notenschlüssel'))
  const felder = [...(karte?.querySelectorAll('input[type="text"], input.mantine-NumberInput-input') ?? [])].map((i) => i.value)
  return {
    da: Boolean(karte),
    werte: felder.slice(0, 5),
    jeFach: Boolean(karte?.textContent?.includes('Eigener Schlüssel für ein Fach'))
  }
})
console.log('Notenschlüssel in den Einstellungen:', JSON.stringify(einstellungen))
if (!einstellungen.da) problems.push('Die Karte „Notenschlüssel" fehlt in den Einstellungen')
if (einstellungen.werte.join(' ') !== '91 % 78 % 64 % 50 % 25 %') {
  problems.push(`Die Voreinstellung lautet nicht 91/78/64/50/25: ${JSON.stringify(einstellungen.werte)}`)
}
if (!einstellungen.jeFach) problems.push('Es lässt sich kein eigener Schlüssel je Fach anlegen')
await page.screenshot({ path: join(out, '4-notenschluessel.png'), fullPage: false })

const react = errors.filter((e) => /Maximum update depth|Minified React error|#185|#310/i.test(e))
if (react.length) problems.push(`React-Fehler: ${react[0].slice(0, 160)}`)
if (errors.length) console.log('Meldungen im Fenster:\n- ' + errors.slice(0, 4).join('\n- '))

await app.close()
rmSync(userData, { recursive: true, force: true })

if (problems.length) {
  console.error('\nProbleme:\n- ' + problems.join('\n- '))
  process.exit(1)
}
console.log('\nDas Programm steht und die Prüfungen greifen. Bilder in', out)
