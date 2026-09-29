import type { GhsId } from '../model/protokoll'
import { GHS } from '../didactics/protokoll'

/**
 * GHS-Piktogramme (29.09.2026) als vereinfachte Zeichnung: roter Rahmen auf der Spitze, weißer
 * Grund, schwarzes Symbol, darunter die Kennung. Vereinfacht gezeichnet, damit sie in Druck und
 * Word ohne Bilddateien stehen; die Kennung (GHS01 … GHS09) macht sie eindeutig.
 */
const SYMBOL: Record<GhsId, string> = {
  // Explodierende Bombe
  GHS01: '<circle cx="50" cy="56" r="11"/><path d="M50 30v8M50 74v8M26 56h8M66 56h8M33 39l6 6M61 67l6 6M33 73l6-6M61 45l6-6" stroke="#000" stroke-width="4" fill="none"/>',
  // Flamme
  GHS02: '<path d="M50 26c6 10 16 16 16 30 0 10-7 18-16 18s-16-8-16-18c0-8 5-12 8-18 1 6 4 8 6 9 0-8-2-13 2-21z"/><rect x="30" y="76" width="40" height="4"/>',
  // Flamme über Kreis
  GHS03: '<circle cx="50" cy="64" r="11" fill="none" stroke="#000" stroke-width="4"/><path d="M50 26c4 7 11 11 11 20 0 5-3 9-6 11 1-4-1-7-5-9-3 3-6 5-6 9-3-2-5-6-5-11 0-7 5-10 11-20z"/><rect x="30" y="78" width="40" height="3"/>',
  // Gasflasche
  GHS04: '<rect x="28" y="46" width="44" height="18" rx="9"/><rect x="70" y="51" width="8" height="8"/>',
  // Ätzwirkung
  GHS05: '<path d="M30 30l10 6-4 6-10-6zM56 30l10 6-4 6-10-6z"/><path d="M36 46c0 4-3 6-3 9M62 46c0 4-3 6-3 9" stroke="#000" stroke-width="3" fill="none"/><rect x="26" y="64" width="18" height="6"/><path d="M52 62h22v10H52z"/>',
  // Totenkopf mit gekreuzten Knochen
  GHS06: '<circle cx="50" cy="44" r="13"/><rect x="43" y="52" width="14" height="8"/><circle cx="45" cy="43" r="3.5" fill="#fff"/><circle cx="55" cy="43" r="3.5" fill="#fff"/><path d="M32 64l36 12M68 64L32 76" stroke="#000" stroke-width="5"/>',
  // Ausrufezeichen
  GHS07: '<rect x="45" y="28" width="10" height="32" rx="3"/><circle cx="50" cy="70" r="5.5"/>',
  // Gesundheitsgefahr
  GHS08: '<circle cx="50" cy="32" r="7"/><path d="M36 76V50c0-6 6-10 14-10s14 4 14 10v26z"/><path d="M50 48l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" fill="#fff"/>',
  // Umwelt
  GHS09: '<path d="M34 72V52M34 52l-8 8M34 52l8 8M34 44l-10 10M34 44l10 10" stroke="#000" stroke-width="3" fill="none"/><path d="M52 66c6-6 14-6 20 0-6 6-14 6-20 0zM72 66l6-5v10z"/><path d="M26 76h52" stroke="#000" stroke-width="3"/>'
}

export function ghsSvg(id: GhsId, groesseMm = 12): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${groesseMm}mm" height="${groesseMm}mm"><path d="M50 3L97 50 50 97 3 50z" fill="#fff" stroke="#e00" stroke-width="7"/>${SYMBOL[id]}</svg>`
}

export const ghsDataUrl = (id: GhsId): string => `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(ghsSvg(id))))}`

export function GhsPiktogramm({ id, groesseMm = 12 }: { id: GhsId; groesseMm?: number }): React.JSX.Element {
  const info = GHS.find((g) => g.id === id)
  return (
    <span className="ws-ghs" title={info ? `${id}: ${info.name} – ${info.bedeutung}` : id}>
      <span dangerouslySetInnerHTML={{ __html: ghsSvg(id, groesseMm) }} />
      <small>{id}</small>
    </span>
  )
}
