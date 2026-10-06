/**
 * Nie mehr eine leere Seite (06.10.2026, Befund der Lehrkraft: „manchmal bleibt die Seite leer, nachdem man längere
 * Zeit nicht im Browser war – nur ein vollständiges Neuladen behebt den Fehler").
 *
 * Zwei Ursachen:
 *  1. Nach einem Update auf dem Server gibt es die Programmteile der alten Seite nicht mehr; ein spätes Nachladen
 *     (`import()`) schlägt fehl. → einmal von selbst neu laden (gesperrt gegen Schleifen).
 *  2. Ein Fehler beim Zeichnen riss ohne Fehlergrenze die ganze Oberfläche ab. → Hinweis mit „Neu laden" statt Leere.
 */
import { Component, type ReactNode } from 'react'

const SPERRE = 'schulapps-neu-geladen'

/** Fehler beim Nachladen eines Programmteils (Chromium, Safari, Firefox, Vite) */
export const istNachladeFehler = (e: unknown): boolean =>
  /dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to fetch dynamically|ChunkLoadError|Loading chunk|Unable to preload CSS/i.test(
    e instanceof Error ? `${e.name} ${e.message}` : String(e)
  )

/** Einmal neu laden – nicht öfter als einmal je Minute (sonst Schleife bei echtem Fehler) */
export function einmalNeuLaden(): boolean {
  try {
    const zuletzt = Number(sessionStorage.getItem(SPERRE) ?? 0)
    if (Date.now() - zuletzt < 60_000) return false
    sessionStorage.setItem(SPERRE, String(Date.now()))
  } catch {
    /* privates Fenster: trotzdem einmal versuchen */
  }
  window.location.reload()
  return true
}

/** Hörer für Nachladefehler außerhalb von React (Vite-Vorladen, nicht abgefangene Versprechen) */
export function nachladeFehlerAbfangen(): void {
  window.addEventListener('vite:preloadError', (e) => {
    e.preventDefault()
    einmalNeuLaden()
  })
  window.addEventListener('unhandledrejection', (e) => {
    if (istNachladeFehler(e.reason)) einmalNeuLaden()
  })
}

export class Fehlergrenze extends Component<{ children: ReactNode }, { fehler: Error | null }> {
  state = { fehler: null as Error | null }

  static getDerivedStateFromError(fehler: Error): { fehler: Error } {
    return { fehler }
  }

  componentDidCatch(fehler: Error): void {
    console.error('Oberfläche abgefangen:', fehler)
    if (istNachladeFehler(fehler)) einmalNeuLaden()
  }

  render(): ReactNode {
    const { fehler } = this.state
    if (!fehler) return this.props.children
    // Ohne Mantine-Abhängigkeit: auch dann sichtbar, wenn das Thema selbst nicht geladen ist
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: 16,
          font: '16px/1.45 system-ui, sans-serif',
          background: '#11181d',
          color: '#e6edf1'
        }}
      >
        <div
          style={{ maxWidth: 440, background: '#1b252c', border: '1px solid #2c3a43', borderRadius: 14, padding: 24, textAlign: 'center' }}
          data-fehlergrenze
        >
          <h2 style={{ marginTop: 0, fontSize: '1.2rem' }}>Die Seite ist hängen geblieben</h2>
          <p style={{ color: '#9fb0bb' }}>Vermutlich wurde die App inzwischen aktualisiert. Gespeichertes bleibt erhalten.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 8,
              padding: '10px 18px',
              border: 0,
              borderRadius: 10,
              background: '#34b39f',
              color: '#08201c',
              font: 'inherit',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Neu laden
          </button>
          <p style={{ marginTop: 16, fontSize: 12, color: '#6b7c87', wordBreak: 'break-word' }}>{fehler.message}</p>
        </div>
      </div>
    )
  }
}
