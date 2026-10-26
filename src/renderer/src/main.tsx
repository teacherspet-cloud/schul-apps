import { einmalNeuLaden, Fehlergrenze, nachladeFehlerAbfangen } from './shared/components/Fehlergrenze'
import '@mantine/core/styles.css'
import '@mantine/dropzone/styles.css'
import '@mantine/notifications/styles.css'
import './app.css'

// MUSS vor allem anderen laufen: Kommt die Oberflaeche aus dem Netz, gibt es keine
// Electron-Bruecke – dann wird window.api hier aufgebaut, bevor irgendetwas darauf zugreift.
import { imNetz, netzZugangEinrichten } from './shared/netzZugang'

netzZugangEinrichten()

// Bedienung mit dem Finger (iPad, iPhone, Tablet im Browser): Größen, Gesten, Tastatur – am PC mit Maus ohne Wirkung
import './shared/touch/touch.css'
import { touchModusEinrichten } from './shared/touch/touchModus'
import { gestenEinrichten } from './shared/touch/gesten'

touchModusEinrichten()
gestenEinrichten()

import { ladeSchulkalender } from './shared/schulkalenderLaden'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { aufServer } from './shared/plattform'

/*
 * Fehler der Oberfläche ins Protokoll des Rechners (27.09.2026): nur Meldung und Stelle, keine
 * Inhalte. Im Netz (Tablet) nicht – dort gibt es den Kanal nicht.
 */
if (!imNetz()) {
  const melde = (text: string): void => void window.api?.protokoll?.melden(text).catch(() => undefined)
  window.addEventListener('error', (e) => melde(`${e.message} (${e.filename}:${e.lineno})`))
  window.addEventListener('unhandledrejection', (e) => melde(`Unbehandelt: ${e.reason instanceof Error ? e.reason.message : String(e.reason)}`))
}

if (new URLSearchParams(location.search).has('selftest')) void import('./selftest').then((m) => m.installSelftest())

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
  /*
   * Lehrkraft-Oberfläche nachladen (26.10.2026, Befund Ladezeiten): Programme, Druck, PDF, Word, Formeln und
   * Lehrpläne stecken in eigenen Bündeln (lehrkraftStart.tsx, modules/registry.ts) – die Schülerseite lädt sie nie.
   */
  void import('./lehrkraftStart').then(
    (m) => m.startLehrkraft(),
    (e: unknown) => {
      if (!einmalNeuLaden()) document.getElementById('root')!.textContent = `Die Oberfläche konnte nicht geladen werden – bitte neu laden. (${String(e)})`
    }
  )
}
