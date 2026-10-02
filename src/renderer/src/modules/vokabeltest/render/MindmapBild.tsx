import type { MindmapBlock } from '../model/types'
import { mindmapAeste, mindmapLage, type Rechteck } from './mindmapLayout'
import { showsAnswers, T, useRender } from './RenderContext'

/*
 * Echte Mindmap auf dem Blatt (02.10.2026): Linien als SVG, Texte als HTML darüber – so bleiben
 * Thema, Oberbegriffe und Lösungen im Editor direkt bearbeitbar. Waagerecht in Prozent (die
 * Fläche passt sich der Satzbreite an), senkrecht in mm (feste Höhe für die Seitenmessung).
 * Schwarz-weiß druckbar; nur die Mitte trägt die Fachfarbe (--vt-accent).
 */
export function MindmapBild({ block }: { block: MindmapBlock }): React.JSX.Element {
  const { mode, updateBlock } = useRender()
  const answers = showsAnswers(mode)
  const lage = mindmapLage(mindmapAeste(block))
  const pos = (r: Rechteck): React.CSSProperties => ({
    left: `${(r.x / lage.breite) * 100}%`,
    width: `${(r.b / lage.breite) * 100}%`,
    top: `${r.y}mm`,
    height: `${r.h}mm`
  })
  const edit = (fn: (d: MindmapBlock, v: string) => void) => (updateBlock ? (v: string) => updateBlock(block.id, (d) => fn(d as MindmapBlock, v)) : undefined)

  return (
    <div className="vt-mm" style={{ height: `${lage.hoehe}mm`, maxWidth: `${lage.breite}mm` }} data-mindmap>
      <svg className="vt-mm-linien" viewBox={`0 0 ${lage.breite} ${lage.hoehe}`} preserveAspectRatio="none" aria-hidden="true">
        {lage.aeste.map((a) => (
          <g key={a.ast.id}>
            <path d={a.pfad} className="vt-mm-ast-linie" vectorEffect="non-scaling-stroke" />
            <path d={a.zweigPfad} className="vt-mm-zweig-linie" vectorEffect="non-scaling-stroke" />
          </g>
        ))}
      </svg>
      <div className="vt-mm-mitte" style={pos(lage.mitte)}>
        <T value={block.topic} onChange={edit((d, v) => (d.topic = v))} />
      </div>
      {lage.aeste.map((a) => {
        const branchIndex = (block.branches ?? []).findIndex((b) => b.id === a.ast.id)
        const setLabel = branchIndex >= 0 ? edit((d, v) => d.branches && (d.branches[branchIndex].label = v)) : undefined
        return (
          <div key={a.ast.id}>
            <div className={`vt-mm-label${a.ast.vorgegeben ? '' : ' vt-mm-label-leer'}`} style={pos(a.label)}>
              {a.ast.vorgegeben ? (
                <T value={a.ast.label} onChange={setLabel} />
              ) : answers && a.ast.label ? (
                // Offene Form: der Oberbegriff ist im Lösungsteil nur ein Vorschlag
                <span className="vt-mm-vorschlag">
                  (<T value={a.ast.label} onChange={setLabel} />)
                </span>
              ) : null}
            </div>
            {a.zweige.map((z, i) => {
              const wort = a.ast.woerter[i]
              const itemIndex = wort ? block.items.findIndex((it) => it.id === wort.id) : -1
              return (
                <div key={i} className={`vt-mm-zweig vt-mm-${a.seite}`} style={pos(z)}>
                  {answers && wort ? (
                    <span className="vt-mm-loesung">
                      <T value={wort.answer} onChange={itemIndex >= 0 ? edit((d, v) => (d.items[itemIndex].answer = v)) : undefined} />
                    </span>
                  ) : null}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
