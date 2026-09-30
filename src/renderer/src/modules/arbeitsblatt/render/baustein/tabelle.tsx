import { useRef, useState } from 'react'
import { RichText } from '../../../../shared/richtext/RichText'
import type { TableBlock } from '../../model/types'
import type { PlacedItem } from '../paginate'
import { spaltenBreiten, spalteVerschieben, tabellenBreite, zeilenHoehe, zeilenHoehen } from '../tabelleMasse'
import { isEditMode, useWs } from '../WsContext'
import { Feld, useSetter } from './hilfen'

/**
 * Tabelle mit ziehbaren Maßen (27.09.2026, render/tabelleMasse.ts).
 *
 * Wunsch der Lehrkraft: Spalten und Zeilen von Hand breiter/schmaler und höher/niedriger
 * ziehen, das Blatt passt sich an. Im Editor sitzen Griffe an den Spaltenlinien (rechts der
 * letzten Spalte ändert sich die Breite der ganzen Tabelle) und an den Zeilenlinien. Während
 * des Ziehens zeigt eine Vorschau die Maße; losgelassen wird EINMAL gespeichert – erst dann
 * misst die Messfläche denselben Baustein mit den neuen Maßen und das Blatt bricht neu um.
 */
export function TabelleAnsicht({ block, placed }: { block: TableBlock; placed?: PlacedItem }): React.JSX.Element {
  const ctx = useWs()
  const edit = ctx.mode === 'edit'
  // Texte auch in der Lösungsansicht bearbeitbar (30.09.2026)
  const schreiben = isEditMode(ctx.mode)
  const set = useSetter(block)
  const tableRef = useRef<HTMLTableElement>(null)
  const [vorschau, setVorschau] = useState<{ colWidths: number[]; rowHeightsMm: number[]; headerHeightMm: number; widthPercent: number } | null>(null)
  const from = placed?.from ?? 0
  const to = placed?.to ?? block.rows.length
  /*
   * Stück einer geteilten Tabelle ohne eigene Maße: die beim Messen der GANZEN Tabelle
   * ermittelten Spaltenbreiten (PlacedItem.spalten). Sonst setzt der Browser die Spalten nur
   * nach den Zeilen dieses Stücks – sie brechen anders um, und die letzte Zeile ragt über den
   * Seitenrand (Befund 30.09.2026).
   */
  const gemessen = !block.colWidths?.length && placed?.spalten?.length === spaltenBreiten(block).length ? placed.spalten : undefined
  const breiten = vorschau?.colWidths ?? gemessen ?? spaltenBreiten(block)
  const hoehen = vorschau?.rowHeightsMm ?? zeilenHoehen(block)
  const kopfHoehe = vorschau?.headerHeightMm ?? block.headerHeightMm ?? 0
  const breite = vorschau?.widthPercent ?? block.widthPercent ?? 100
  const mitMassen = Boolean(block.colWidths?.length || vorschau || gemessen)

  const ziehen = (e: React.PointerEvent, art: 'spalte' | 'tabelle' | 'zeile' | 'kopf', index: number): void => {
    const table = tableRef.current
    if (!edit || !ctx.update || !table) return
    e.preventDefault()
    e.stopPropagation()
    const rect = table.getBoundingClientRect()
    const startX = e.clientX
    const startY = e.clientY
    const inhaltMm = ctx.contentWidthMm ?? 170
    // Millimeter je Bildschirmpunkt – so stimmt es auch in der verkleinerten Vorschau
    const mmProPx = (inhaltMm * (breite / 100)) / Math.max(1, rect.width)
    const zeileDom = art === 'zeile' ? table.rows[index - from + 1] : art === 'kopf' ? table.rows[0] : null
    const startHoeheMm = zeileDom ? zeileDom.getBoundingClientRect().height * mmProPx : 0
    const start = { colWidths: [...breiten], rowHeightsMm: [...hoehen], headerHeightMm: kopfHoehe, widthPercent: breite }
    let letzte = start
    const bewegen = (ev: PointerEvent): void => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (art === 'spalte') letzte = { ...start, colWidths: spalteVerschieben(start.colWidths, index, (dx / rect.width) * 100) }
      else if (art === 'tabelle') letzte = { ...start, widthPercent: tabellenBreite(start.widthPercent + (dx / rect.width) * start.widthPercent) }
      else if (art === 'kopf') letzte = { ...start, headerHeightMm: zeilenHoehe(startHoeheMm + dy * mmProPx) }
      else {
        const h = [...start.rowHeightsMm]
        h[index] = zeilenHoehe(startHoeheMm + dy * mmProPx)
        letzte = { ...start, rowHeightsMm: h }
      }
      setVorschau(letzte)
    }
    const ende = (): void => {
      window.removeEventListener('pointermove', bewegen)
      window.removeEventListener('pointerup', ende)
      window.removeEventListener('pointercancel', ende)
      setVorschau(null)
      const m = letzte
      ctx.update!(block.id, (d) => {
        if (d.type !== 'table') return
        d.colWidths = m.colWidths
        if (m.rowHeightsMm.some((x) => x > 0)) d.rowHeightsMm = m.rowHeightsMm
        else delete d.rowHeightsMm
        if (m.headerHeightMm > 0) d.headerHeightMm = m.headerHeightMm
        else delete d.headerHeightMm
        if (m.widthPercent !== 100) d.widthPercent = m.widthPercent
        else delete d.widthPercent
      })
    }
    window.addEventListener('pointermove', bewegen)
    window.addEventListener('pointerup', ende)
    window.addEventListener('pointercancel', ende)
  }

  return (
    <div className={`ws-block ws-table-block ${placed?.continued ? 'ws-continued' : ''}`}>
      {from === 0 && (block.title || ctx.materialNumbers?.get(block.id)) && (
        <div className="ws-table-title" data-head>
          {ctx.materialNumbers?.get(block.id) && <span className="ws-material-no">{ctx.materialNumbers.get(block.id)}</span>}
          <Feld value={block.title} editable={schreiben} onChange={set((d, v) => (d.title = v))} />
        </div>
      )}
      <table
        ref={tableRef}
        className={`ws-table ${edit ? 'ws-table-ziehbar' : ''}`}
        style={{ width: `${breite}%`, tableLayout: mitMassen ? 'fixed' : undefined }}
      >
        {mitMassen && (
          <colgroup>
            {breiten.map((w, c) => (
              <col key={c} style={{ width: `${w}%` }} />
            ))}
          </colgroup>
        )}
        <thead data-head>
          <tr style={kopfHoehe ? { height: `${kopfHoehe}mm` } : undefined}>
            {block.headers.map((h, c) => (
              <th key={c}>
                <Feld value={h} editable={schreiben} onChange={set((d, v) => (d.headers[c] = v))} />
                {edit && (
                  <>
                    <span
                      className="ws-spalten-griff"
                      title={c < breiten.length - 1 ? 'Spaltenbreite ziehen' : 'Tabellenbreite ziehen'}
                      onPointerDown={(e) => ziehen(e, c < breiten.length - 1 ? 'spalte' : 'tabelle', c)}
                    />
                    <span className="ws-zeilen-griff" title="Zeilenhöhe ziehen" onPointerDown={(e) => ziehen(e, 'kopf', 0)} />
                  </>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.slice(from, to).map((row, r) => (
            <tr key={from + r} data-unit style={hoehen[from + r] ? { height: `${hoehen[from + r]}mm` } : undefined}>
              {row.map((cell, c) => (
                <td key={c}>
                  <RichText value={cell} inline editable={schreiben} onChange={set((d, v) => (d.rows[from + r][c] = v))} />
                  {edit && <span className="ws-zeilen-griff" title="Zeilenhöhe ziehen" onPointerDown={(e) => ziehen(e, 'zeile', from + r)} />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
