import { RichText } from '../../../../shared/richtext/RichText'
import { notenvorschlag } from '@shared/diktat'
import type { DiktatBlock } from '../../model/types'
import { diktatInhalt } from '../../didactics/diktat'
import { isKeyMode, useWs } from '../WsContext'
import { Feld, useSetter } from './hilfen'

/**
 * Diktat (26.11.2026) – auf dem Schülerblatt nur, was die Form braucht (Laufzettel, Dosenstreifen,
 * Partnertexte, Wendesätze), beim klassischen Diktat und Lückendiktat gar nichts: Dort steht nur die
 * Niederschrift-Aufgabe. Im Lösungsteil und im Editor das Lehrkraftblatt (didactics/diktat.ts › diktatInhalt).
 * Jeder Teil ist eine Einheit für den Seitenumbruch.
 */
export function DiktatView({ block }: { block: DiktatBlock }): React.JSX.Element | null {
  const { mode } = useWs()
  const edit = mode === 'edit'
  const lehrkraft = edit || isKeyMode(mode)
  const set = useSetter(block)
  const teile = diktatInhalt(block, lehrkraft, notenvorschlag)
  if (!teile.length) return null
  return (
    <div className={`ws-block ws-diktat ${lehrkraft ? 'ws-diktat-lehrkraft' : ''}`} data-diktat={block.form}>
      {lehrkraft && (
        <div className="ws-diktat-titel" data-unit>
          <Feld value={block.title} editable={edit} onChange={set((d, v) => ((d as DiktatBlock).title = v))} />
        </div>
      )}
      {teile.map((t, i) => {
        if (t.art === 'hinweis')
          return (
            <div key={i} className="ws-diktat-hinweis" data-unit>
              {t.text}
            </div>
          )
        if (t.art === 'text')
          return (
            <div key={i} className="ws-diktat-text" data-unit>
              {t.titel && <div className="ws-diktat-teiltitel">{t.titel}</div>}
              {/* Im Editor der Rohtext mit Pausenzeichen zum Bearbeiten, sonst mit fetten Zielwörtern */}
              {edit && i === 1 ? (
                <RichText value={block.text} editable onChange={set((d, v) => ((d as DiktatBlock).text = v))} />
              ) : (
                <RichText value={t.text} editable={false} />
              )}
            </div>
          )
        if (t.art === 'liste')
          return (
            <div key={i} className="ws-diktat-liste" data-unit>
              <div className="ws-diktat-teiltitel">{t.titel}</div>
              <ol>
                {t.punkte.map((p, k) => (
                  <li key={k}>{p}</li>
                ))}
              </ol>
            </div>
          )
        return (
          <div key={i} className="ws-diktat-streifen" data-unit>
            <div className="ws-diktat-teiltitel">✂ {t.titel}</div>
            {t.streifen.map((s, k) => (
              <div key={k} className="ws-diktat-streifen-eins">
                <span className="ws-diktat-nr">{k + 1}</span> {s}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
