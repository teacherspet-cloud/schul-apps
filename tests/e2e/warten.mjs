/**
 * Auf die geladene Oberfläche warten – mit Wiederholung.
 *
 * Das Projekt liegt in einem Dropbox-Ordner. Startet die App unmittelbar nach dem Bauen,
 * tauscht Dropbox die Dateien unter `out/renderer` gerade noch aus: Das Fenster lädt dann
 * ein index.html, dessen Bündel es noch nicht gibt („ERR_FILE_NOT_FOUND"), und bleibt leer.
 * Eine Sekunde später ist alles da.
 *
 * Ein echter Absturz übersteht das Neuladen dagegen – derselbe Code bricht wieder ab.
 * Die Wiederholung versteckt also nichts, sie gleicht nur die Umgebung aus. Bleibt es auch
 * nach dem zweiten Versuch leer, ist es ein Fehler und der Aufruf schlägt fehl.
 */
export async function warteAufOberflaeche(page, versuche = 3, { assistent = false } = {}) {
  for (let i = 1; i <= versuche; i++) {
    try {
      await page.waitForSelector('text=Schul-Apps', { timeout: 15000 })
      if (!assistent) await schliesseAssistent(page)
      return
    } catch (e) {
      if (i === versuche) throw e
      console.log(`  (Oberfläche kam nicht – Versuch ${i + 1} von ${versuche})`)
      await page.waitForTimeout(2000)
      await page.reload()
    }
  }
}

/**
 * Bundesland und Schulform aufklappen, falls sie eingeklappt sind.
 *
 * In den Programmen stehen beide nur als Zeile da, solange sie den Einstellungen
 * entsprechen; „ändern" holt die Auswahlfelder zurück. Wachen, die ein anderes Land
 * einstellen wollen, müssen diesen Weg nehmen – denselben, den auch eine Lehrkraft nimmt.
 */
export async function oeffneLerngruppe(page) {
  const aendern = page.getByRole('button', { name: 'ändern' }).filter({ visible: true }).first()
  if (await aendern.count()) {
    await aendern.click()
    await page.waitForTimeout(200)
  }
}

/**
 * Den Einrichtungsassistenten wegklicken.
 *
 * Fast alle Wachen starten mit einem LEEREN Profil – und genau dann erscheint seit dem
 * 25.09.2026 der Assistent und legt sich über alles. Er kommt verzögert (erst nach der
 * Abfrage des KI-Zugangs), deshalb wird kurz auf ihn gewartet. Nur die Wache
 * `ersteinrichtung.mjs` will ihn sehen und schaltet das ab.
 */
export async function schliesseAssistent(page) {
  const spaeter = page.getByRole('button', { name: 'Später einrichten' })
  try {
    await spaeter.waitFor({ state: 'visible', timeout: 4000 })
  } catch {
    return
  }
  await spaeter.click()
  await page.waitForTimeout(500)
}
