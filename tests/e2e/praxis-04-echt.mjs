// Praxislauf der neuen Funktionen 0.4 MIT ECHTER KI – VERBRAUCHT KONTINGENT (vorher: npm run build).
// Aufruf: node tests/e2e/praxis-04-echt.mjs <Ausgabeordner> [schritt,schritt …]
//
// Läuft in einem WEGWERF-Profil; übernommen werden nur settings.json und secrets.json aus dem
// Profil der Lehrkraft (KI-Zugang, Schlüssel). Nichts landet in ihrer Bibliothek.
// Geprüft wird nur der Aufbau – ob die Inhalte taugen, zeigen die Ausgaben im Ordner
// (ergebnisse.json, Bildschirmfotos), die ein Mensch ansieht.
import { _electron as electron } from 'playwright-core'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { warteAufOberflaeche } from './warten.mjs'

const out = resolve(process.argv[2] ?? 'test-results/praxis-04')
mkdirSync(out, { recursive: true })
const echt = join(process.env.APPDATA, 'schul-apps')
const userData = mkdtempSync(join(tmpdir(), 'schulapps-praxis04-'))
// „Local State" trägt den Schlüssel, mit dem secrets.json verschlüsselt ist
for (const f of ['settings.json', 'secrets.json', 'Local State']) if (existsSync(join(echt, f))) copyFileSync(join(echt, f), join(userData, f))

const problems = []
const ergebnisse = {}
const pruefe = (ok, text) => {
  if (!ok) problems.push(text)
  console.log(`${ok ? '  ok  ' : '  !!  '} ${text}`)
}
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env: { ...process.env, SCHULAPPS_SELFTEST: '1', SCHULAPPS_KI_ATTRAPPE: '' } })
const page = await app.firstWindow()
page.on('pageerror', (e) => problems.push(`Fehler im Fenster: ${e.message}`))
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1500, 1050))
await warteAufOberflaeche(page)
const sichtbar = (l) => l.filter({ visible: true }).first()
const warte = async (fn, arg, ms = 300000) => {
  const ende = Date.now() + ms
  while (Date.now() < ende) {
    const v = await page.evaluate(fn, arg)
    if (v) return v
    await page.waitForTimeout(1500)
  }
  return null
}
const nur = process.argv[3] ? process.argv[3].split(',') : null
const schritt = async (name, fn) => {
  if (nur && !nur.includes(name)) return
  console.log(`\n${name}`)
  const start = Date.now()
  try {
    await fn()
  } catch (e) {
    problems.push(`${name}: ${e.message}`)
    console.log(`  !!   Abbruch: ${e.message}`)
    await page.screenshot({ path: join(out, `${name}-fehler.png`) }).catch(() => undefined)
  }
  console.log(`   (${Math.round((Date.now() - start) / 1000)} s)`)
  writeFileSync(join(out, 'ergebnisse.json'), JSON.stringify(ergebnisse, null, 2))
}

try {
  await schritt('leveln', async () => {
    await page.click('[aria-label="Arbeitsblatt"]')
    await page.waitForTimeout(500)
    await page.evaluate(() => window.__selftest.wsMaterialtext(8, 'text'))
    await page.waitForTimeout(600)
    await page.evaluate(() => {
      const ws = structuredClone(window.__selftest.worksheetJetzt())
      const vorlage = ws.sheets[0].blocks.find((b) => b.type === 'text')
      ws.sheets[0].blocks.unshift({
        ...structuredClone(vorlage),
        sourceHeader: undefined,
        id: 'lese1',
        type: 'text',
        title: 'Die Fotosynthese',
        body: 'Die Fotosynthese ist ein biochemischer Prozess, bei dem Pflanzen unter Nutzung von Lichtenergie aus Kohlenstoffdioxid und Wasser Glucose synthetisieren. Dieser Vorgang findet in den Chloroplasten statt, deren grüner Farbstoff Chlorophyll das Licht absorbiert. Als Nebenprodukt wird Sauerstoff freigesetzt, der für die Atmung nahezu aller Lebewesen unentbehrlich ist. Die gebildete Glucose dient der Pflanze als Energielieferant und als Baustein für Stärke und Cellulose.',
        source: '',
        lineNumbers: false
      })
      window.__selftest.setWorksheet(ws)
    })
    await page.waitForTimeout(1200)
    const lese = page.locator('.editor-block', { hasText: 'biochemischer Prozess' }).first()
    await lese.hover()
    await page.waitForTimeout(300)
    await lese.getByRole('button', { name: 'KI-Aktionen' }).click()
    await sichtbar(page.getByText('Leveln', { exact: true })).hover()
    await page.waitForTimeout(400)
    await sichtbar(page.locator('[data-leveln="einfach"]')).click()
    const body = await warte(() => {
      const b = window.__selftest.worksheetJetzt().sheets[0].blocks.find((x) => x.id === 'lese1')
      return (b?.versions?.length ?? 0) >= 2 ? b.body : null
    })
    ergebnisse.leveln = { original: 'siehe Skript', einfacheSprache: body }
    const saetze = (t) => t.split(/[.!?]\s+/).filter(Boolean)
    const schnitt = (t) => t.split(/\s+/).length / Math.max(1, saetze(t).length)
    pruefe(Boolean(body) && body.length > 100, 'Leveln: neue Fassung in Einfacher Sprache ist da')
    pruefe(Boolean(body) && schnitt(body) < 12, `Leveln: kurze Sätze (im Schnitt ${body ? schnitt(body).toFixed(1) : '–'} Wörter)`)
    await page.screenshot({ path: join(out, 'leveln.png') })
  })

  await schritt('stundenverlauf', async () => {
    await page.getByText('Verlauf +', { exact: true }).filter({ visible: true }).first().click()
    await page.locator('[data-verlauf-erstellen]').click()
    const v = await warte(() => window.__selftest.worksheetJetzt().stundenverlauf ?? null)
    ergebnisse.stundenverlauf = v
    const summe = v?.phasen?.reduce((s, p) => s + (p.minuten ?? 0), 0)
    pruefe(Boolean(v?.phasen?.length), `Stundenverlauf: ${v?.phasen?.length ?? 0} Phasen`)
    pruefe(summe === 45 || summe === 90, `Stundenverlauf: Minuten ergeben ${summe}`)
    await page.screenshot({ path: join(out, 'stundenverlauf.png') })
  })

  await schritt('raster', async () => {
    await page.click('[aria-label="Arbeitsblatt"]')
    await page.waitForTimeout(500)
    await page.evaluate(() => window.__selftest.wsMaterialtext(3, 'klausur'))
    await page.waitForTimeout(1000)
    // Nach dem Stundenverlauf steht die Ansicht noch auf „Verlauf" – zurück zum Blatt
    await page
      .getByText('Arbeitsblatt', { exact: true })
      .filter({ visible: true })
      .nth(1)
      .click()
      .catch(() => undefined)
    await page.waitForTimeout(800)
    const aufgabeId = await page.evaluate(() => window.__selftest.worksheetJetzt().sheets[0].blocks.find((b) => b.type === 'task')?.id)
    const aufgabe = page.locator('.editor-block', { has: page.locator('.ws-task') }).first()
    await aufgabe.hover()
    await page.waitForTimeout(300)
    await aufgabe.getByRole('button', { name: 'KI-Aktionen' }).click()
    await sichtbar(page.locator('[data-raster-erstellen]')).click()
    const tabelle = await warte((id) => window.__selftest.worksheetJetzt().sheets[0].blocks.find((b) => b.id === `raster-${id}`) ?? null, aufgabeId)
    const aufgabeBlock = await page.evaluate((id) => window.__selftest.worksheetJetzt().sheets[0].blocks.find((b) => b.id === id), aufgabeId)
    ergebnisse.raster = { aufgabe: aufgabeBlock?.instruction, punkte: aufgabeBlock?.points, tabelle }
    pruefe(Boolean(tabelle), 'Raster: Tabelle hinter der Aufgabe')
    await page.getByText('Lösungen', { exact: true }).filter({ visible: true }).first().click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: join(out, 'raster.png') })
  })

  await schritt('rueckmeldung', async () => {
    await page.click('[aria-label="Rückmeldung"]')
    await page.getByText('Rückmeldung ohne Note', { exact: true }).waitFor({ timeout: 10000 })
    await sichtbar(page.getByText('Eigene Aufgabe', { exact: true })).click()
    await sichtbar(page.getByLabel('Titel der Aufgabe')).fill('Leserbrief zum Handyverbot')
    await sichtbar(page.locator('[data-rm-aufgaben]')).fill(
      'Schreibe einen Leserbrief an die Schülerzeitung zum geplanten Handyverbot an unserer Schule. Nenne mindestens zwei Argumente mit Beispielen und formuliere eine eigene Forderung. Klasse 8.'
    )
    await sichtbar(page.locator('[data-rm-eintippen]')).click()
    await sichtbar(page.getByLabel('Name zu S1')).fill('Lea Schmidt')
    await sichtbar(page.getByLabel('Text von S1')).fill(
      'Liebe Redaktion, ich finde das Handyverbot falsch. Wir brauchen das Handy doch für den Unterricht, zum Beispiel für Recherche. Außerdem müssen meine Eltern mich erreichen können wenn der Bus ausfällt. Lea Schmidt sagt auch das es unfair ist. Deshalb fordere ich das man Handys in der Pause benutzen darf. Viele Grüße'
    )
    await sichtbar(page.locator('[data-rm-schreiben]')).click()
    const bogen = await warte(() => window.__selftest.rmJetzt()?.abgaben?.[0]?.bogen ?? null)
    ergebnisse.rueckmeldung = bogen
    const text = JSON.stringify(bogen ?? {})
    pruefe(Boolean(bogen), 'Rückmeldung: Bogen ist entstanden')
    pruefe(!/\b(Note|Punkte?|Punkten)\b\s*[:\d]/.test(text), 'Rückmeldung: keine Note und keine Punkte im Bogen')
    pruefe(!/Lea|Schmidt/.test(text), 'Rückmeldung: kein Klarname im Bogen (steht nur lokal im Ausdruck)')
    await page.screenshot({ path: join(out, 'rueckmeldung.png') })
  })

  await schritt('elternbrief', async () => {
    await page.keyboard.press('Control+8')
    await page.getByText('Anlass & Stichpunkte', { exact: true }).waitFor({ timeout: 10000 })
    await sichtbar(page.locator('[data-eb-stichpunkte]')).fill(
      'Wandertag am 12.10., Treffpunkt 8:00 Schulhof, Ziel Wildpark Hundshaupten, Rückkehr ca. 14 Uhr, 5 € Eintritt bis 5.10. mitgeben, feste Schuhe, Regenjacke, Proviant'
    )
    await sichtbar(page.getByLabel('Mit Rücklaufzettel zum Abschneiden')).check()
    await sichtbar(page.locator('[data-eb-schreiben]')).click()
    const brief = await warte(() => window.__selftest.ebJetzt?.()?.text ?? null)
    ergebnisse.elternbrief = { brief }
    pruefe(Boolean(brief?.absaetze?.length), 'Elternbrief: Brief ist da')
    pruefe(!/\b(Max|Anna|Lukas)\b/.test(JSON.stringify(brief ?? {})), 'Elternbrief: keine erfundenen Namen')
    await page.screenshot({ path: join(out, 'elternbrief.png') })
    await sichtbar(page.locator('[data-eb-sprachen]')).click()
    await sichtbar(page.getByRole('option', { name: /^Arabisch/ })).click()
    await page.keyboard.press('Escape')
    await sichtbar(page.locator('[data-eb-uebersetzen]')).click()
    const u = await warte(() => window.__selftest.ebJetzt?.()?.uebersetzungen?.[0] ?? null)
    ergebnisse.elternbrief.arabisch = u
    pruefe(Boolean(u) && u.text.absaetze.length === brief?.absaetze?.length, 'Elternbrief: arabische Fassung mit gleich vielen Absätzen')
    if (u) {
      await sichtbar(page.getByRole('tab', { name: 'Arabisch' })).click()
      await page.waitForTimeout(500)
      await page.screenshot({ path: join(out, 'elternbrief-arabisch.png') })
    }
  })

  const klassenarbeit = async (fach, thema) => {
    const waehle = async (label, option) => {
      await sichtbar(page.getByLabel(label, { exact: true })).click()
      await sichtbar(page.getByRole('option', { name: option, exact: true })).click()
      await page.waitForTimeout(300)
    }
    await page.click('[aria-label="Klassenarbeiten"]')
    await page.waitForTimeout(800)
    const neu = page.getByRole('button', { name: 'Neue Klassenarbeit' })
    if (await neu.count()) await sichtbar(neu).click()
    await page.waitForSelector('text=Rahmen der Arbeit')
    await waehle('Fach', fach)
    await waehle('Jahrgang', 'Klasse 8')
    await sichtbar(page.getByLabel('Thema', { exact: false })).fill(thema)
    await page.getByRole('button', { name: 'Vorschlag erzeugen' }).click()
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: 'Weiter zu den Aufgaben' }).click()
    await page.getByRole('button', { name: 'Arbeit erzeugen' }).click()
    // Fertig, wenn jeder Teil Bausteine hat und kein Auftrag mehr läuft
    const exam = await warte(
      () => {
        const e = window.__selftest.kaJetzt()
        return e?.parts?.length && e.parts.every((p) => (p.blocks?.length ?? 0) > 0) ? e : null
      },
      null,
      900000
    )
    await page.waitForTimeout(3000)
    const text = await page
      .locator('.ws-editor-pages')
      .first()
      .innerText()
      .catch(() => '')
    ergebnisse[`klassenarbeit-${fach}`] = {
      teile: exam?.parts?.map((p) => ({ format: p.formatId, punkte: p.points, bausteine: p.blocks?.length })),
      blatt: text.slice(0, 6000)
    }
    pruefe(Boolean(exam), `Klassenarbeit ${fach}: alle Teile erzeugt`)
    await page.screenshot({ path: join(out, `klassenarbeit-${fach}.png`), fullPage: false })
    return { exam, text }
  }

  await schritt('klassenarbeit-fr', async () => {
    const { text } = await klassenarbeit('Französisch', 'Les vacances')
    pruefe(/Contrôle/.test(text) && /Partie 1/.test(text), 'Klassenarbeit Französisch: Kopf und Teile auf Französisch')
  })

  await schritt('klassenarbeit-de', async () => {
    const { text } = await klassenarbeit('Deutsch', 'Kurzgeschichten')
    pruefe(/Teil 1/.test(text), 'Klassenarbeit Deutsch: Teile heißen „Teil"')
  })

  // ---------- Nacharbeit 29.09.2026: Elternbrief mit Termin, Zauberstab, Neuformulierung
  await schritt('elternbrief-neu', async () => {
    await page.evaluate(() =>
      window.api.settings.set({
        schoolName: 'Gymnasium Wesermünde',
        briefkopf: { lehrkraft: 'Frau Müller', strasse: 'Humboldtstraße 12-14', plz: '27570', ort: 'Bremerhaven', telefon: '0471 483670' }
      })
    )
    await page.keyboard.press('Control+8')
    await page.waitForTimeout(800)
    const neuKnopf = page.getByRole('button', { name: 'Neuer Elternbrief' })
    if (await neuKnopf.count()) await sichtbar(neuKnopf).click()
    await page.getByText('Anlass & Stichpunkte', { exact: true }).waitFor({ timeout: 10000 })
    await sichtbar(page.locator('[data-eb-stichpunkte]')).fill(
      'Klasse 9c: Ausflug zur Eisarena, anschließend Weihnachtsmarkt. Treffpunkt an der Eisarena. Eintritt und Schlittschuhverleih 8 €, bitte passend mitgeben. Warme Kleidung, Handschuhe.'
    )
    await sichtbar(page.locator('[data-eb-termin]')).fill('2026-12-11')
    await sichtbar(page.locator('[data-eb-uhrzeit]')).fill('08:00')
    await sichtbar(page.getByLabel('Mit Rücklaufzettel zum Abschneiden')).check()
    await sichtbar(page.locator('[data-eb-frist]')).fill('2026-12-04')
    await sichtbar(page.locator('[data-eb-schreiben]')).click()
    const brief = await warte(() => window.__selftest.ebJetzt?.()?.text ?? null)
    const alles = JSON.stringify(brief ?? {})
    ergebnisse.elternbriefNeu = { brief, pruefung: await page.evaluate(() => window.__selftest.ebJetzt()?.pruefung ?? []) }
    pruefe(alles.includes('11.12.2026') && alles.includes('8:00'), 'Elternbrief: Termin und Uhrzeit stehen im Brief')
    pruefe(alles.includes('04.12.2026'), 'Elternbrief: Rückgabefrist steht im Brief')
    pruefe(!/\[(Datum|Rückgabefrist|Frist|Uhrzeit)\]/i.test(alles), 'Elternbrief: keine offenen Platzhalter für Datum/Frist')

    // Zauberstab am ersten Absatz: einfacher
    const vorher = brief?.absaetze?.[0] ?? ''
    await sichtbar(page.locator('[data-eb-teil="absatz-0"] [data-eb-zauberstab]')).click()
    await sichtbar(page.locator('[data-eb-aktion="einfacher"]')).click()
    const nachher = await warte((alt) => {
      const t = window.__selftest.ebJetzt()?.text?.absaetze?.[0]
      return t && t !== alt ? t : null
    }, vorher)
    ergebnisse.elternbriefNeu.zauberstab = { vorher, nachher, pruefung: await page.evaluate(() => window.__selftest.ebJetzt()?.pruefung ?? []) }
    pruefe(Boolean(nachher), 'Zauberstab „Einfacher": Absatz neu formuliert')

    // Ganzen Brief sachlich, in einfacher Sprache
    await page.getByLabel('Ton').filter({ visible: true }).first().click()
    await sichtbar(page.getByRole('option', { name: 'Sachlich', exact: true })).click()
    await sichtbar(page.getByLabel('Einfache Sprache')).check()
    const fassungenVorher = await page.evaluate(() => window.__selftest.ebJetzt()?.fassungen?.length ?? 0)
    await sichtbar(page.locator('[data-eb-neu]')).click()
    const neu = await warte((n) => ((window.__selftest.ebJetzt()?.fassungen?.length ?? 0) > n ? window.__selftest.ebJetzt() : null), fassungenVorher)
    const text = JSON.stringify(neu?.text ?? {})
    ergebnisse.elternbriefNeu.neu = { text: neu?.text, pruefung: neu?.pruefung }
    pruefe(Boolean(neu), 'Neu formuliert (sachlich, einfache Sprache)')
    pruefe(
      text.includes('11.12') && text.includes('8:00') && /8\s?(€|Euro)/.test(text) && text.includes('04.12'),
      'Neuformulierung: Datum, Uhrzeit, Betrag und Frist erhalten'
    )
    pruefe(!(neu?.pruefung ?? []).some((p) => /fehlen/.test(p)), 'Neuformulierung: Prüfung meldet keine verlorenen Angaben')
    await page.screenshot({ path: join(out, 'elternbrief-neu.png') })
  })

  // ---------- Nacharbeit 29.09.2026: Rückmeldung – Aufgabe aus einer Datei
  await schritt('rueckmeldung-datei', async () => {
    await page.evaluate(() => window.api.settings.set({ datenschutz: { hinweisBestaetigt: new Date().toISOString(), namenErsetzen: true } }))
    await page.click('[aria-label="Rückmeldung"]')
    await page.waitForTimeout(800)
    await sichtbar(page.getByRole('button', { name: 'Neue Rückmeldung' })).click()
    await page.waitForTimeout(800)
    await sichtbar(page.getByText('Eigene Aufgabe', { exact: true })).click()
    const ablage = page.locator('.mantine-Dropzone-root', { hasText: 'Aufgabenblatt hierher ziehen' }).filter({ visible: true }).first()
    await ablage.locator('input[type=file]').setInputFiles({
      name: 'klassenarbeit-deutsch-9.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(
        [
          'Gymnasium Wesermünde · Deutsch · Klasse 9a · 2. Klassenarbeit',
          'Name: ____________   Datum: ________',
          '',
          'Material: Zeitungsartikel „Einheitlich gekleidet?“ (Auszug)',
          'Immer mehr Schulen diskutieren über Schulkleidung. Befürworter sagen, sie stärke das Gemeinschaftsgefühl und verringere Druck durch Markenkleidung. Gegner betonen, Kleidung sei Ausdruck der Persönlichkeit, und verweisen auf die Kosten für Familien.',
          '',
          'Aufgabe: Erörtere auf der Grundlage des Materials, ob an deiner Schule eine einheitliche Schulkleidung eingeführt werden sollte. Wäge Pro- und Kontra-Argumente ab und formuliere ein begründetes Urteil. (30 Punkte)',
          '',
          'Hinweis für die Lehrkraft: Bewertung nach Raster des Fachbereichs.'
        ].join('\n')
      )
    })
    const hochladen = page.getByRole('button', { name: 'Hochladen', exact: true })
    await hochladen.waitFor({ timeout: 10000 }).catch(() => undefined)
    if (await hochladen.count()) await hochladen.click()
    const rm = await warte(() => {
      const d = window.__selftest.rmJetzt()
      return d?.grundlage?.erwartung ? d : null
    })
    ergebnisse.rueckmeldungDatei = { grundlage: rm?.grundlage, meta: { fach: rm?.meta?.subjectId, jahrgang: rm?.meta?.grade, erkannt: rm?.meta?.erkannt } }
    pruefe(Boolean(rm?.grundlage?.aufgaben?.includes('Erörtere')), 'Aufgabe aus der Datei übernommen')
    pruefe(!/Hinweis für die Lehrkraft|30 Punkte|Name: ___/.test(rm?.grundlage?.aufgaben ?? ''), 'Kopf, Punkte und Lehrkraft-Hinweis sind weggelassen')
    pruefe(Boolean(rm?.grundlage?.erwartung?.startsWith('[Entwurf der KI')), 'Erwartungshorizont als gekennzeichneter Entwurf')
    pruefe(rm?.meta?.subjectId === 'deutsch' && rm?.meta?.grade === 9, 'Fach Deutsch und Klasse 9 erkannt')
    await page.screenshot({ path: join(out, 'rueckmeldung-datei.png') })
  })

  await schritt('openai-tts', async () => {
    const r = await page.evaluate(() =>
      window.api.audio.speak({
        id: 'praxis04-tts',
        languageCode: 'en',
        turns: [
          { voiceId: 'openai:coral', text: 'Hi Tom, are you coming to the school trip on Friday?' },
          { voiceId: 'openai:ash', text: 'Yes, of course. I have already packed my rain jacket.' }
        ]
      })
    )
    ergebnisse.tts = { datei: r.fileName, bytes: r.bytes }
    writeFileSync(join(out, 'openai-dialog.mp3'), Buffer.from(r.dataUrl.slice(r.dataUrl.indexOf(',') + 1), 'base64'))
    pruefe(r.bytes > 10000, `OpenAI-Hörtext: ${Math.round(r.bytes / 1024)} KB MP3`)
  })
} finally {
  writeFileSync(join(out, 'ergebnisse.json'), JSON.stringify(ergebnisse, null, 2))
  await app.close()
  rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
}
console.log(problems.length ? `\n${problems.length} Problem(e):\n- ${problems.join('\n- ')}` : '\nAlles in Ordnung.')
console.log(`Ausgaben: ${out}`)
process.exit(problems.length ? 1 : 0)
