import type { IllustrationBlock, WsBlock } from '../model/types'
import { maskottchenBild, useMaskottchen } from '../../../shared/maskottchenStore'
import { Feld } from './BlockView'

/**
 * Maskottchen auf dem Blatt (26.09.2026).
 *
 * Zwei Formen: ANGEHEFTET an einen Baustein (`block.illustration`: Pose, wahlweise
 * Sprechblase) – die Figur sitzt an der rechten oberen Ecke des Bausteins und nimmt keinen
 * Platz im Satz ein; und als eigener BAUSTEIN „Illustration" (frei verschiebbar, mit
 * Breite und Sprechblase). Bilder kommen aus dem Maskottchen-Speicher; fehlt die Figur,
 * bleibt die Stelle leer – nie ein leerer Rahmen.
 *
 * Nur auf dem Schülerblatt: Im Lösungsteil lenkt eine Figur nur ab.
 */

export function MaskottchenBild({ id, pose, className, style }: { id?: string; pose: string; className?: string; style?: React.CSSProperties }): React.JSX.Element | null {
  // Hook: neu zeichnen, wenn der Speicher nachlädt
  useMaskottchen((s) => s.liste.length)
  const src = maskottchenBild(id, pose)
  if (!src) return null
  return <img className={className} src={src} alt="" style={style} draggable={false} />
}

/** Sprechblase mit Zeiger zur Figur. */
function Sprechblase({ text, editable, onChange, seite }: { text: string; editable: boolean; onChange?: (v: string) => void; seite: 'left' | 'right' }): React.JSX.Element | null {
  if (!text && !editable) return null
  return (
    <div className={`ws-illu-bubble ws-illu-bubble-${seite}`}>
      <Feld value={text} editable={editable} onChange={onChange} placeholder="Sprechblase" />
    </div>
  )
}

/** Angeheftete Figur an einem Baustein. */
export function Illustriert({ block, editable, onBubble, children }: { block: WsBlock; editable: boolean; onBubble?: (v: string) => void; children: React.ReactNode }): React.JSX.Element {
  const illu = block.illustration
  if (!illu) return <>{children}</>
  const seite = illu.side ?? 'right'
  return (
    <div className={`ws-illu-host ws-illu-host-${seite}`}>
      {children}
      <div className={`ws-illu-anker ws-illu-anker-${seite}`}>
        {illu.bubble !== undefined && (illu.bubble || editable) && <Sprechblase text={illu.bubble} editable={editable} onChange={onBubble} seite={seite} />}
        <MaskottchenBild id={illu.maskottchenId} pose={illu.pose} className="ws-illu" />
      </div>
    </div>
  )
}

/** Eigener Baustein „Illustration" – frei platzierbar. */
export function IllustrationView({ block, editable, onBubble }: { block: IllustrationBlock; editable: boolean; onBubble?: (v: string) => void }): React.JSX.Element {
  const seite = block.side ?? 'left'
  return (
    <figure className={`ws-block ws-illustration ws-illustration-${seite}`} style={{ width: `${block.widthPercent}%` }}>
      {(block.bubble || editable) && <Sprechblase text={block.bubble} editable={editable} onChange={onBubble} seite={seite === 'left' ? 'right' : 'left'} />}
      <MaskottchenBild id={block.maskottchenId} pose={block.pose} className="ws-illu ws-illu-frei" />
    </figure>
  )
}
