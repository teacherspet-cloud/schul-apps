import { RichText } from '../../../../shared/richtext/RichText'
import type { ProtocolBlock } from '../../model/types'
import type { ProtokollAbschnitt } from '../../model/protokoll'
import { GESTIS_URL, SCHUTZMASSNAHMEN, SICHERHEIT_HINWEIS, artInfo } from '../../didactics/protokoll'
import type { PlacedItem } from '../paginate'
import { isKeyMode, useWs } from '../WsContext'
import { GhsPiktogramm } from '../ghs'
import { Feld, FortsetzungsHinweis, useSetter } from './hilfen'

/** „___" im vorgegebenen Text als Schreiblücke */
function mitLuecken(text: string): React.JSX.Element[] {
  return text.split(/(_{3,})/).map((t, i) => (/^_{3,}$/.test(t) ? <span key={i} className="ws-protokoll-luecke" /> : <span key={i}>{t}</span>))
}

/**
 * Versuchsprotokoll und verwandte Protokolle (29.09.2026) – Darstellung auf dem Blatt.
 *
 * Jeder Abschnitt ist eine Einheit für den Seitenumbruch (`data-unit`): Ein langes Protokoll
 * darf zwischen zwei Abschnitten auf die nächste Seite gehen, nie mitten in einer Skizze. In der
 * Lösungsansicht stehen statt der Schreibflächen die Musterlösungen, dazu der Sicherheitsvermerk
 * und das Bewertungsraster.
 */
export function ProtokollView({ block, placed }: { block: ProtocolBlock; placed?: PlacedItem }): React.JSX.Element {
  const ctx = useWs()
  const { mode } = ctx
  const edit = mode === 'edit'
  const key = isKeyMode(mode)
  const set = useSetter(block)
  const from = placed?.from ?? 0
  const units: { key: string; node: React.JSX.Element }[] = []

  const abschnitt = (a: ProtokollAbschnitt, i: number): React.JSX.Element => {
    const setA = (fn: (x: ProtokollAbschnitt, v: string) => void): ((v: string) => void) | undefined =>
      set((d, v) => fn((d as ProtocolBlock).abschnitte[i], v))
    const flaeche = ((): React.JSX.Element | null => {
      // Steht das Muster schon als Vorgabe da (z. B. die Fragestellung), nicht doppelt zeigen
      if (key && a.muster && a.form !== 'kopf') return a.muster.trim() === (a.vorgabe ?? '').trim() ? null : <div className="ws-protokoll-muster">{a.muster}</div>
      switch (a.form) {
        case 'kopf':
          return (
            <div className="ws-protokoll-kopfzeile">
              <span>Datum:</span>
              <span className="ws-protokoll-feld" />
              <span>Name(n):</span>
              <span className="ws-protokoll-feld ws-protokoll-feld-lang" />
            </div>
          )
        case 'skizze':
          return <div className="ws-protokoll-skizze" style={{ height: `${a.hoeheMm ?? 60}mm` }} />
        case 'diagramm':
          return <div className="ws-grid" style={{ height: `${a.hoeheMm ?? 70}mm` }} />
        case 'tabelle': {
          const spalten = a.spalten?.length ? a.spalten : ['', '']
          return (
            <table className="ws-protokoll-tabelle">
              <thead>
                <tr>
                  {spalten.map((s, k) => (
                    <th key={k}>
                      <Feld value={s} editable={edit} onChange={setA((x, v) => ((x.spalten ??= [...spalten])[k] = v))} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: a.tabellenZeilen ?? 6 }, (_, r) => (
                  <tr key={r}>
                    {spalten.map((_, k) => (
                      <td key={k} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
        default:
          return a.zeilen ? (
            <div className="ws-lines">
              {Array.from({ length: a.zeilen }, (_, k) => (
                <div key={k} className="ws-line" />
              ))}
            </div>
          ) : null
      }
    })()
    const sicherheit = a.id === 'sicherheit' || (a.id === 'chemikalien' && !block.abschnitte.some((x) => x.id === 'sicherheit'))
    return (
      <div className={`ws-protokoll-abschnitt ws-protokoll-${a.form}`} data-abschnitt={a.id}>
        {a.form !== 'kopf' && (
          <div className="ws-protokoll-titel">
            <Feld value={a.titel} editable={edit} onChange={setA((x, v) => (x.titel = v))} />
          </div>
        )}
        {a.leitfrage && !key && (
          <div className="ws-protokoll-leitfrage">
            <RichText value={a.leitfrage} inline editable={edit} onChange={setA((x, v) => (x.leitfrage = v))} />
          </div>
        )}
        {a.id === 'chemikalien' && block.chemikalien?.length ? (
          <table className="ws-protokoll-stoffe">
            <tbody>
              {block.chemikalien.map((c, k) => (
                <tr key={k}>
                  <td>
                    <b>{c.name}</b>
                    {c.menge ? ` (${c.menge})` : ''}
                  </td>
                  <td className="ws-protokoll-ghs">
                    {c.ghs.map((g) => (
                      <GhsPiktogramm key={g} id={g} groesseMm={9} />
                    ))}
                  </td>
                  <td className="ws-protokoll-saetze">
                    {c.signalwort ? <b>{c.signalwort}</b> : null} {[c.hSaetze, c.pSaetze].filter(Boolean).join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {sicherheit && (
          <div className="ws-protokoll-schutz">
            {a.id === 'sicherheit' && block.chemikalien?.length && !block.abschnitte.some((x) => x.id === 'chemikalien') ? (
              <div className="ws-protokoll-ghs">
                {[...new Set(block.chemikalien.flatMap((c) => c.ghs))].map((g) => (
                  <GhsPiktogramm key={g} id={g} groesseMm={9} />
                ))}
              </div>
            ) : null}
            {SCHUTZMASSNAHMEN.map((s) => (
              <span key={s.id} className="ws-protokoll-kreuz">
                <span className="ws-protokoll-box">{block.schutz?.includes(s.id) ? '✗' : ''}</span>
                {s.label}
              </span>
            ))}
          </div>
        )}
        {a.vorgabe && !(key && a.muster && a.form === 'linien' && /_{3,}/.test(a.vorgabe)) && (
          <div className="ws-protokoll-vorgabe">
            {edit ? <RichText value={a.vorgabe} editable onChange={setA((x, v) => (x.vorgabe = v))} /> : mitLuecken(a.vorgabe)}
          </div>
        )}
        {a.satzanfaenge?.length && !key ? <div className="ws-protokoll-satz">Satzanfänge: {a.satzanfaenge.join(' · ')}</div> : null}
        {flaeche}
      </div>
    )
  }

  block.abschnitte.forEach((a, i) => units.push({ key: `${a.id}-${i}`, node: abschnitt(a, i) }))
  if (block.checkliste?.length && !key)
    units.push({
      key: 'checkliste',
      node: (
        <div className="ws-protokoll-abschnitt ws-protokoll-checkliste">
          <div className="ws-protokoll-titel">Ist mein Protokoll vollständig?</div>
          {block.checkliste.map((c, k) => (
            <div key={k} className="ws-protokoll-kreuz">
              <span className="ws-protokoll-box" />
              <RichText value={c} inline editable={edit} onChange={set((d, v) => ((d as ProtocolBlock).checkliste![k] = v))} />
            </div>
          ))}
        </div>
      )
    })
  if (key && block.raster?.length)
    units.push({
      key: 'raster',
      node: (
        <div className="ws-protokoll-abschnitt">
          <div className="ws-protokoll-titel">Bewertungsraster</div>
          <table className="ws-protokoll-tabelle">
            <tbody>
              {block.raster.map((r, k) => (
                <tr key={k}>
                  <td>
                    <b>{r.kriterium}</b>
                  </td>
                  <td>{r.erwartung}</td>
                  <td style={{ width: '18%' }} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    })
  const bis = placed?.to ?? units.length
  const gezeigt = units.slice(from, bis)

  return (
    <div className={`ws-block ws-protokoll ${from > 0 ? 'ws-continued' : ''}`} data-protokoll={block.art}>
      {/* Folgestück: „Versuchsprotokoll (Fortsetzung)" – derselbe Wegweiser wie bei Aufgaben (01.10.2026) */}
      {from > 0 && <FortsetzungsHinweis bezeichnung={block.title || artInfo(block.art).label} />}
      {from === 0 && (
        <div className="ws-protokoll-kopf">
          <Feld value={block.title} editable={edit} onChange={set((d, v) => ((d as ProtocolBlock).title = v))} />
          {edit && <span className="ws-protokoll-art">{artInfo(block.art).label}</span>}
        </div>
      )}
      {from === 0 && (key || edit) && block.sicherheitZuPruefen && (
        <div className="ws-protokoll-pruefen" data-sicherheit-pruefen>
          {SICHERHEIT_HINWEIS} {GESTIS_URL}
        </div>
      )}
      {gezeigt.map((u) => (
        <div key={u.key} data-unit>
          {u.node}
        </div>
      ))}
    </div>
  )
}
