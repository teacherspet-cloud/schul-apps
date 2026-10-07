/**
 * Übersichtstabellen als Kartenliste auf dem Telefon (07.10.2026, Recherche Mobil-Navigation): Tabellen mit
 * `data-karten` (Lernstand, Ergebnisse, Auswertungen …) zeigen am Telefon je Zeile eine Karte „Spalte: Wert" (touch.css).
 * Damit das ohne Änderung jeder Zelle geht, schreibt dieser Wächter die Spaltennamen aus dem Tabellenkopf als
 * `data-label` an die Zellen – auch an Zeilen, die später dazukommen.
 */
export function beschrifteKartenTabelle(t: HTMLTableElement): void {
  const kopf = [...(t.tHead?.rows[0]?.cells ?? [])].map((c) => (c.textContent ?? '').trim())
  if (!kopf.length) return
  for (const body of [...t.tBodies])
    for (const zeile of [...body.rows]) {
      let spalte = 0
      for (const zelle of [...zeile.cells]) {
        const name = kopf[spalte] ?? ''
        if (name && zelle.getAttribute('data-label') !== name) zelle.setAttribute('data-label', name)
        spalte += zelle.colSpan || 1
      }
    }
}

let waechter: MutationObserver | null = null

/** Einmal beim Start (touchModus.ts): alle Kartentabellen beschriften, auch künftige */
export function kartenTabellenEinrichten(): void {
  if (waechter || typeof document === 'undefined' || typeof MutationObserver === 'undefined') return
  let geplant = false
  const alle = (): void => {
    geplant = false
    for (const t of document.querySelectorAll<HTMLTableElement>('table[data-karten]')) beschrifteKartenTabelle(t)
  }
  waechter = new MutationObserver(() => {
    if (geplant) return
    geplant = true
    requestAnimationFrame(alle)
  })
  waechter.observe(document.body, { childList: true, subtree: true })
  alle()
}
