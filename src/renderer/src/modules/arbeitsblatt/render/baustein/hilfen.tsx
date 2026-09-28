import { RichText } from '../../../../shared/richtext/RichText'
import type { GridBlock, WsBlock } from '../../model/types'
import { useWs } from '../WsContext'

/** Ab dieser Länge gilt ein Text als „länger" und wird im Blocksatz gesetzt */
export const LONG_TEXT_CHARS = 320

export const splitParagraphs = (body: string): string[] =>
  body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)

export const stars = (n?: number): string => (n ? '★'.repeat(n) : '')

/**
 * Ein kurzes bearbeitbares Feld: Überschrift, Tabellenkopf, Bildunterschrift, Quellenangabe.
 *
 * Läuft bewusst über `RichText` und nicht über `Editable`. `Editable` gibt den Wert als
 * REINEN TEXT aus – dadurch stand in einer Lernzielkontrolle zu den Potenzgesetzen in der
 * Tabellenzeile die gesetzte Formel, im Tabellenkopf darüber aber wörtlich `$x^2$`. Formeln
 * und **Fettdruck** gehören in jedes Feld eines Arbeitsblatts, nicht nur in den Fließtext.
 */
export function Feld({
  value,
  editable,
  onChange,
  className,
  placeholder
}: {
  value: string
  editable: boolean
  onChange?: (v: string) => void
  className?: string
  placeholder?: string
}): React.JSX.Element {
  return <RichText className={className} value={value} placeholder={placeholder} inline editable={editable} onChange={onChange} />
}

/** Alternativtext des Gitternetzes (Barrierefreiheit und Word-Export). */
export function gridAlt(block: GridBlock): string {
  if (block.diagram?.kind === 'zeitleiste') {
    const t = block.diagram.timeline
    return `Zeitleiste von ${t.from} bis ${t.to}: ${t.events.map((e) => `${e.date} ${e.text}`).join('; ')}`
  }
  if (block.kind === 'klima') return 'Raster für ein Klimadiagramm: zwölf Monate, links Temperatur, rechts Niederschlag'
  if (block.kind === 'koordinaten') {
    const a = block.axes
    return `Koordinatensystem, x von ${a.xMin} bis ${a.xMax}, y von ${a.yMin} bis ${a.yMax}`
  }
  if (block.kind === 'mm') return 'Millimeterpapier'
  return `Karoraster mit ${block.cellMm} mm Kästchen`
}

/** Spieldauer als m:ss. */
export function audioLength(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')} min`
}

export const playsLabel = (plays: number): string => (plays === 1 ? 'einmal hören' : plays === 2 ? 'zweimal hören' : `${plays}-mal hören`)

/**
 * Die Adresse in lesbarer Länge unter dem QR-Code.
 *
 * Abgetippt wird sie selten – aber sie muss abtippbar BLEIBEN, sonst hilft sie denen nicht,
 * die kein Gerät dabeihaben. Deshalb wird nur die Mitte gekürzt, nie der Anfang und nie das
 * Ende mit der Kennung des Videos.
 */
export function shortLink(url: string): string {
  const clean = url.replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (clean.length <= 44) return clean
  return `${clean.slice(0, 26)}…${clean.slice(-16)}`
}

/** Liefert einen Setter, der einen Entwurf des Bausteins verändert. */
export function useSetter<B extends WsBlock>(block: B) {
  const { update } = useWs()
  return (apply: (draft: B, value: string) => void) => (update ? (v: string) => update(block.id, (d) => apply(d as B, v)) : undefined)
}
