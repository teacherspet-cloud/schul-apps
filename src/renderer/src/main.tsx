import '@mantine/core/styles.css'
import '@mantine/dropzone/styles.css'
import '@mantine/notifications/styles.css'
import './app.css'

// MUSS vor allem anderen laufen: Kommt die Oberflaeche aus dem Netz, gibt es keine
// Electron-Bruecke – dann wird window.api hier aufgebaut, bevor irgendetwas darauf zugreift.
import { abgemeldet, imNetz, netzZugangEinrichten } from './shared/netzZugang'

netzZugangEinrichten()

import { MantineProvider } from '@mantine/core'
import { useColorScheme } from '@mantine/hooks'
import { Notifications } from '@mantine/notifications'
import { StrictMode, useLayoutEffect, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { useAppSettings } from './shared/settingsStore'
import { applyThemeAttributes, buildMantineTheme, themeById, themeCssVariables } from './shared/themes'

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
const ersterLauf = imNetz() && abgemeldet() ? Promise.resolve() : useAppSettings.getState().load()
ersterLauf.finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Root />
    </StrictMode>
  )
})
