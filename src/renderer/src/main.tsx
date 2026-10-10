import { einmalNeuLaden, Fehlergrenze, nachladeFehlerAbfangen } from './shared/components/Fehlergrenze'
import { SchulbuchDialog } from './shared/schulbuch/SchulbuchDialog'
import '@mantine/core/styles.css'
import '@mantine/dropzone/styles.css'
import '@mantine/notifications/styles.css'
import './app.css'

// MUSS vor allem anderen laufen: Kommt die Oberflaeche aus dem Netz, gibt es keine
// Electron-Bruecke – dann wird window.api hier aufgebaut, bevor irgendetwas darauf zugreift.
import { abgemeldet, imNetz, netzZugangEinrichten } from './shared/netzZugang'

netzZugangEinrichten()

// Bedienung mit dem Finger (iPad, iPhone, Tablet im Browser): Größen, Gesten, Tastatur – am PC mit Maus ohne Wirkung
import './shared/touch/touch.css'
import { touchModusEinrichten } from './shared/touch/touchModus'
import { gestenEinrichten } from './shared/touch/gesten'

touchModusEinrichten()
gestenEinrichten()

import { MantineProvider } from '@mantine/core'
import { useColorScheme } from '@mantine/hooks'
import { Notifications } from '@mantine/notifications'
import { SeitenWahlHost } from './shared/components/SeitenAuswahl'
import { PdfVorschauHost } from './shared/export/PdfVorschau'
import { AusgabeOrtDialog, installiereOrtWahl } from './shared/export/ausgabeOrt'
import { EingabeOrtDialog, installiereDateiWahl } from './shared/export/eingabeOrt'
import { installiereVorhandenFrage, VorhandenDialog } from './shared/export/vorhandenFrage'
import { installiereTabellenAuswahl, TabellenKreismenue } from './modules/arbeitsblatt/render/tabellenAuswahl'
import { beobachteTrennung, htmlMitTrennung } from './shared/silbentrennung'
import { aufServer, hatClient } from './shared/plattform'
import { ladeSchulkalender } from './shared/schulkalenderLaden'
import { StrictMode, useLayoutEffect, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { useAppSettings } from './shared/settingsStore'
import { applyThemeAttributes, buildMantineTheme, themeById, themeCssVariables } from './shared/themes'

/*
 * Fehler der Oberfläche ins Protokoll des Rechners (27.09.2026): nur Meldung und Stelle, keine
 * Inhalte. Im Netz (Tablet) nicht – dort gibt es den Kanal nicht.
 */
if (!imNetz()) {
  const melde = (text: string): void => void window.api?.protokoll?.melden(text).catch(() => undefined)
  window.addEventListener('error', (e) => melde(`${e.message} (${e.filename}:${e.lineno})`))
  window.addEventListener('unhandledrejection', (e) => melde(`Unbehandelt: ${e.reason instanceof Error ? e.reason.message : String(e.reason)}`))
}

// iPad und – seit 02.10.2026 – PC: Speichern mit Ablageziel fragt bei Bedarf nach dem Ort, Öffnen nach der Quelle (IServ)
// Tabellen: Zellen markieren, Rechtsklick → Kreismenü „angleichen" (02.10.2026)
installiereTabellenAuswahl()

// Silbentrennung (02.10.2026): Druck/PDF aller Programme und die Seiten am Bildschirm
window.api?.vermittlung?.htmlVorbereiten(htmlMitTrennung)
beobachteTrennung()

if (!imNetz() || hatClient()) {
  installiereOrtWahl()
  installiereDateiWahl()
}
// Gleichnamiges Material am Speicherort: überschreiben oder neue Version? (05.10.2026)
installiereVorhandenFrage()

if (new URLSearchParams(location.search).has('selftest')) void import('./selftest').then((m) => m.installSelftest())

function Root(): React.JSX.Element {
  const appearance = useAppSettings((s) => s.settings.appearance)
  const systemScheme = useColorScheme()
  const scheme = appearance.colorScheme === 'auto' ? systemScheme : appearance.colorScheme

  const appTheme = themeById(appearance.theme)
  const theme = useMemo(() => buildMantineTheme(appTheme), [appTheme])
  useLayoutEffect(() => applyThemeAttributes(appTheme), [appTheme])

  return (
    <MantineProvider theme={theme} cssVariablesResolver={themeCssVariables} forceColorScheme={scheme}>
      <Notifications position="top-right" />
      {/* Seitenauswahl vor dem Speichern (shared/export/ausgabe.tsx) */}
      <SeitenWahlHost />
      {/* PDF ansehen, ohne zu speichern (shared/export/PdfVorschau.tsx) */}
      <PdfVorschauHost />
      {/* iPad: wohin speichern – Gerät, IServ, Dateien-App, Teilen (shared/export/ausgabeOrt.tsx) */}
      <AusgabeOrtDialog />
      {/* Datei öffnen: dieses Gerät oder IServ (shared/export/eingabeOrt.tsx) */}
      <EingabeOrtDialog />
      {/* Gibt es schon – überschreiben oder neue Version (shared/export/vorhandenFrage.tsx) */}
      <VorhandenDialog />
      {/* Schulbuchseiten erkannt (Phase 6b) */}
      <SchulbuchDialog />
      {/* Markierte Tabellenzellen angleichen (modules/arbeitsblatt/render/tabellenAuswahl.tsx) */}
      <TabellenKreismenue />
      <App />
    </MantineProvider>
  )
}

/*
 * Einstellungen vor dem ersten Zeichnen laden, damit das Theme nicht kurz falsch aufblitzt.
 *
 * ABER NICHT, solange die Anmeldung fehlt. Gemeldet von der Lehrkraft (24.09.2026): „in der
 * webversion ist das in der app hinterlegte schullogo nicht hinterlegt."
 *
 * Die Ursache saß genau hier: Im Browser lief dieser Aufruf VOR der PIN-Abfrage. Der Server
 * lehnte ihn mit „Nicht angemeldet" ab, die Einstellungen blieben auf den Voreinstellungen
 * stehen – und danach lud sie niemand mehr nach. Betroffen war nicht nur das Logo, sondern
 * alles aus den Einstellungen: Schulname, Farbschema, KI-Anbieter, Piktogramme. Aufgefallen
 * ist es am Logo, weil man dessen Fehlen auf dem Blatt sieht.
 *
 * Beim zweiten Besuch lag die Anmeldung im Browserspeicher, dann ging es gut – deshalb war
 * der Fehler launisch.
 */
/*
 * Server: Der Schülerbereich (/s/…, Onlinetest) braucht weder Programme noch Einstellungen –
 * Schülerinnen und Schüler haben auf die Programme keinen Zugriff (src/server/http.ts).
 */
// Nie mehr leere Seite (06.10.2026): Nachladefehler nach Updates → einmal neu laden; Zeichenfehler → Hinweis
nachladeFehlerAbfangen()
// Schulkalender des Servers (10.10.2026): Ferien, Feiertage, genaues Schuljahr – für Lehrkräfte und Lernende
void ladeSchulkalender()
if (aufServer() && window.location.pathname.startsWith('/s/')) {
  void Promise.all([import('./modules/onlinetest/SchuelerBereich'), import('./modules/onlinetest/SchuelerEinstellungen')]).then(
    ([{ default: SchuelerBereich }, { SchuelerRahmen }]) =>
      createRoot(document.getElementById('root')!).render(
        <StrictMode>
          <Fehlergrenze>
            <SchuelerRahmen>
              <SchuelerBereich />
            </SchuelerRahmen>
          </Fehlergrenze>
        </StrictMode>
      ),
    (e: unknown) => {
      // Schon das Laden des Schülerbereichs scheitert (Update dazwischen): neu laden statt leer bleiben
      if (!einmalNeuLaden()) document.getElementById('root')!.textContent = `Die Seite konnte nicht geladen werden – bitte neu laden. (${String(e)})`
    }
  )
} else {
  const ersterLauf = imNetz() && abgemeldet() ? Promise.resolve() : useAppSettings.getState().load()
  ersterLauf.finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <Fehlergrenze>
          <Root />
        </Fehlergrenze>
      </StrictMode>
    )
  })
}
