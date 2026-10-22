/**
 * Ansage für Bildschirmleser (22.10.2026, Prüfung des Schulträgers, Punkt 12 – WCAG 2.1 AA 4.1.3 „Statusmeldungen“).
 *
 * Eine einzige, dauerhaft vorhandene aria-live-Region am Ende der Seite: Bedingt eingeblendete Rückmeldungen
 * („Richtig!“) werden von manchen Bildschirmlesern nicht vorgelesen – über diese Region schon.
 */
let region: HTMLElement | null = null

function holeRegion(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  if (region && document.body.contains(region)) return region
  region = document.createElement('div')
  region.setAttribute('aria-live', 'polite')
  region.setAttribute('role', 'status')
  region.setAttribute('data-ansage', '')
  // Unsichtbar, aber vorlesbar
  Object.assign(region.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    margin: '-1px',
    padding: '0',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
    border: '0'
  })
  document.body.appendChild(region)
  return region
}

/** Liest einen kurzen Text vor (höflich, unterbricht nichts). */
export function ansagen(text: string): void {
  const r = holeRegion()
  if (!r) return
  // Leeren und neu setzen, damit dieselbe Meldung zweimal hintereinander erneut vorgelesen wird
  r.textContent = ''
  window.setTimeout(() => {
    r.textContent = text
  }, 30)
}
