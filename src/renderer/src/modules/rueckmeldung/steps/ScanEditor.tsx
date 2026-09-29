import { useRef, useState } from 'react'
import { newId } from '../../vokabeltest/model/random'
import { klemme, type NummerierterKommentar } from '../korrekturrand'
import { RandNotiz } from './RandEditor'
import { useBlatt } from './blattTeile'

/**
 * Kommentare am eingescannten Schülertext – als Seite des A4-Blatts (29.09.2026, abgestimmt:
 * „halbautomatisch, zum Feinjustieren ziehbar"): Die KI setzt nummerierte Marker ungefähr an die
 * Stelle; hier lassen sie sich mit der Maus oder dem Finger genau hinziehen. Ist „Marker setzen"
 * an (Leiste über dem Blatt), entsteht mit einem Klick ins Bild eine neue Notiz an dieser Stelle.
 * Die Notizen stehen am Korrekturrand daneben und sind dort direkt bearbeitbar.
 */
export default function ScanEditor({
  seite,
  src,
  notizen,
  markerSetzen,
  gesetzt
}: {
  seite: number
  src: string
  notizen: NummerierterKommentar[]
  markerSetzen: boolean
  /** Nach dem Setzen eines Markers (schaltet „Marker setzen" wieder aus) */
  gesetzt: () => void
}): React.JSX.Element {
  const c = useBlatt()
  const [zieht, setZieht] = useState<string | null>(null)
  const flaeche = useRef<HTMLDivElement>(null)

  const lage = (e: React.PointerEvent | React.MouseEvent): { x: number; y: number } | null => {
    const el = flaeche.current
    if (!el) return null
    const b = el.getBoundingClientRect()
    return { x: klemme(((e.clientX - b.left) / b.width) * 100), y: klemme(((e.clientY - b.top) / b.height) * 100) }
  }

  return (
    <div className="bl-block bl-scan" data-rm-scan>
      <div className="bl-text">
        <div
          ref={flaeche}
          className="bl-scanbild"
          style={{ cursor: markerSetzen ? 'crosshair' : undefined, touchAction: zieht ? 'none' : undefined, userSelect: 'none' }}
          onClick={(e) => {
            if (!markerSetzen) return
            const p = lage(e)
            if (!p) return
            const id = newId()
            c.setzeRand((r) => r.push({ id, zitat: '', text: '', art: 'fehler', seite, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, gesetzt: true }))
            c.setFokus(id)
            gesetzt()
          }}
          data-scan-seite={seite}
        >
          <img src={src} alt={`Seite ${seite + 1}`} draggable={false} />
          {notizen.map(({ nr, k }) => (
            <span
              key={k.id}
              className={`bl-marker ${k.art} rm-marker`}
              style={{ left: `${k.x ?? 50}%`, top: `${k.y ?? 50}%` }}
              onPointerDown={(e) => {
                e.stopPropagation()
                ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                setZieht(k.id)
              }}
              onPointerMove={(e) => {
                if (zieht !== k.id) return
                const p = lage(e)
                if (p)
                  c.setzeRand((r) => {
                    const x = r.find((y) => y.id === k.id)
                    if (!x) return
                    x.x = Math.round(p.x * 10) / 10
                    x.y = Math.round(p.y * 10) / 10
                    x.gesetzt = true
                  }, `marker-${k.id}`)
              }}
              onPointerUp={(e) => {
                ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
                setZieht(null)
              }}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Marker ${nr}`}
              data-marker={nr}
            >
              {nr}
            </span>
          ))}
        </div>
      </div>
      <div className="bl-rand">
        {notizen.map((g) => (
          <RandNotiz key={g.k.id} g={g} />
        ))}
      </div>
    </div>
  )
}
