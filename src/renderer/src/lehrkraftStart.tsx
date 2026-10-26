/**
 * Start der Lehrkraft-Oberfläche (26.10.2026, Befund Ladezeiten: EIN Skript von 15 MB für alle, auch für jede
 * Schülerseite). Alles, was nur Lehrkräfte brauchen – die Programme (modules/registry.ts, dort je Programm nachgeladen),
 * Druck- und PDF-Vorschau, Speicherorte, Schulbuch-Erkennung, Tabellen-Kreismenü, Silbentrennung, Grammatikformen –
 * hängt an dieser Datei. main.tsx lädt sie erst, wenn feststeht, dass keine Schülerseite (/s/…) geöffnet wird; der
 * Schülerbereich bekommt so sein eigenes, kleines Bündel.
 */
import { MantineProvider } from '@mantine/core'
import { useColorScheme } from '@mantine/hooks'
import { Notifications } from '@mantine/notifications'
import { StrictMode, useLayoutEffect, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { Fehlergrenze } from './shared/components/Fehlergrenze'
import { SchulbuchDialog } from './shared/schulbuch/SchulbuchDialog'
import { SeitenWahlHost } from './shared/components/SeitenAuswahl'
import { PdfVorschauHost } from './shared/export/PdfVorschau'
import { AusgabeOrtDialog, installiereOrtWahl } from './shared/export/ausgabeOrt'
import { EingabeOrtDialog, installiereDateiWahl } from './shared/export/eingabeOrt'
import { installiereVorhandenFrage, VorhandenDialog } from './shared/export/vorhandenFrage'
import { installiereTabellenAuswahl, TabellenKreismenue } from './modules/arbeitsblatt/render/tabellenAuswahl'
import { beobachteTrennung, htmlMitTrennung } from './shared/silbentrennung'
import { hatClient } from './shared/plattform'
import { abgemeldet, imNetz } from './shared/netzZugang'
import { ladeGrammatikformen } from './shared/grammatikformenLaden'
import { useAppSettings } from './shared/settingsStore'
import { applyThemeAttributes, buildMantineTheme, themeById, themeCssVariables } from './shared/themes'

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

/** Lehrkraft-Oberfläche einrichten und zeichnen (aus main.tsx nachgeladen) */
export function startLehrkraft(): void {
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
  const ersterLauf = imNetz() && abgemeldet() ? Promise.resolve() : useAppSettings.getState().load()
  // Grammatikformen der Lehrwerke (12.10.2026): Bearbeitungen der Schule vor dem ersten Zeichnen über die eingebaute Liste legen
  const grammatik = imNetz() && abgemeldet() ? Promise.resolve() : ladeGrammatikformen()
  Promise.allSettled([ersterLauf, grammatik]).finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <Fehlergrenze>
          <Root />
        </Fehlergrenze>
      </StrictMode>
    )
  })
}
