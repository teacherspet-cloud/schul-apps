import { useAppSettings } from '../../../shared/settingsStore'
import type { Pictogram } from './pictograms'

/**
 * Ein Piktogramm auf dem Blatt.
 *
 * Zeichnet flächig in der Textfarbe, damit es denselben Kontrast erreicht wie die Schrift und
 * die Graustufen-Kopie übersteht. Es trägt einen Alternativtext, ist aber nie der alleinige
 * Träger der Information: Neben dem Symbol steht immer auch das Wort – Bild allein als
 * Bedeutungsträger schließt Lernende aus, die das Symbol nicht kennen.
 *
 * Hat die Lehrkraft das Symbol in den Einstellungen neu gestalten lassen, gilt ihre Fassung –
 * in allen Programmen. Ein erzeugtes Bild kann die Textfarbe nicht übernehmen; es steht
 * deshalb, wie es ist.
 */
export function PictogramIcon({ picto, size = 14 }: { picto: Pictogram; size?: number }): React.JSX.Element {
  const custom = useAppSettings((s) => s.pictograms[picto.id])
  if (custom) return <img className="ws-picto ws-picto-custom" src={custom} alt={picto.label} width={size} height={size} />
  return (
    <svg className="ws-picto" viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={picto.label} focusable="false">
      {picto.paths.map((d, i) => (
        <path key={i} d={d} fill="currentColor" fillRule={picto.evenodd ? 'evenodd' : undefined} />
      ))}
    </svg>
  )
}
