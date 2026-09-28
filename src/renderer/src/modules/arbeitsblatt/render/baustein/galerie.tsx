import type { ImageBlock, ImageRole } from '../../model/types'
import { useWs } from '../WsContext'
import { Feld, useSetter } from './hilfen'

/** „M3 Die Schultaschen" → „Die Schultaschen" (die Nummer setzt die App selbst davor) */
export const stripMaterialNo = (title: string): string => String(title ?? '').replace(/^\s*[MQB]\s?\d+\s*[:.–-]?\s*/, '')

/** Bildreihe: Einzelbilder nebeneinander mit Unterschriften, Bildnachweise gesammelt darunter. */
/**
 * Spalten einer Bildreihe.
 *
 * Material-Bilder (Karten, Quellen, Diagramme) werden ausgewertet – sie brauchen Fläche und
 * stehen deshalb höchstens zu zweit nebeneinander. Piktogramme zum Beschriften dürfen eng
 * stehen.
 */
export function galleryColumns(count: number, role: ImageRole = 'illustration'): number {
  if (role === 'material') return Math.min(count, 2)
  return count <= 4 ? count : count <= 6 ? 3 : 4
}

export function GalleryView({ block }: { block: ImageBlock }): React.JSX.Element {
  const { mode, actions } = useWs()
  const edit = mode === 'edit'
  const set = useSetter(block)
  const items = block.items ?? []
  return (
    <figure className={`ws-block ws-image ws-gallery ws-gallery-${block.role}`}>
      <div className="ws-gallery-grid" style={{ gridTemplateColumns: `repeat(${galleryColumns(items.length, block.role)}, 1fr)` }}>
        {items.map((it, k) => (
          <div className="ws-gallery-item" key={it.id}>
            <div
              className={`ws-gallery-frame ${edit ? 'ws-gallery-pick' : ''}`}
              onClick={edit ? () => actions?.pickImage?.(block.id, it.id) : undefined}
              title={edit ? 'Bild wählen' : undefined}
            >
              {it.image ? <img src={it.image.dataUrl} alt={it.description} /> : <div className="ws-image-placeholder">{it.description}</div>}
              {items.length > 1 && <span className="ws-gallery-number">{k + 1}</span>}
            </div>
            {(it.caption || edit) && (
              <div className="ws-gallery-caption">
                <Feld
                  value={it.caption}
                  editable={edit}
                  placeholder="Unterschrift"
                  onChange={set((d, v) => {
                    const item = (d as ImageBlock).items?.[k]
                    if (item) item.caption = v
                  })}
                />
              </div>
            )}
          </div>
        ))}
      </div>
      {(block.caption || edit) && (
        <figcaption>
          <Feld value={block.caption} editable={edit} onChange={set((d, v) => ((d as ImageBlock).caption = v))} placeholder="Bildunterschrift" />
        </figcaption>
      )}
    </figure>
  )
}
