/**
 * Seiten vor dem PDF-Druck einpassen (19.11.2026, Befund der Lehrkraft, Blatt „Welcome to my home!": im PDF stand die
 * Wortzahl im Fußbereich, die letzte Textzeile auf der Trennlinie).
 *
 * Ursache: Die Seiten teilt der Browser der Lehrkraft auf – mit SEINEN Schriften (Windows: Calibri). Das PDF setzt der
 * Server-Chromium; dort fehlten Calibri und Carlito, der Text lief in einer breiteren Ersatzschrift, brach in mehr
 * Zeilen um und schob sich über den Fuß. Seitdem liegen im Server-Bild maßgleiche Schriften (deploy/vps/Dockerfile).
 *
 * Bleibt trotzdem eine Abweichung (eine Schrift ohne maßgleichen Ersatz, z. B. Verdana oder Segoe UI), fängt dieses
 * Netz sie auf: Ragt der Inhalt einer Seite in den Fuß, wird nur DIESE Seite so weit verkleinert, dass er passt –
 * per transform, also ohne neuen Umbruch (Zeilennummern bleiben stimmig). Höchstens auf 85 %.
 *
 * Wird als Quelltext in die Druckseite gegeben (`(${seitenEinpassen})(document)`) – keine Importe, keine Hilfsfunktionen.
 */
export function seitenEinpassen(doc: Document): { seite: number; massstab: number }[] {
  const aus: { seite: number; massstab: number }[] = []
  const seiten = Array.from(doc.querySelectorAll<HTMLElement>('.ws-page'))
  seiten.forEach((seite, i) => {
    const body = seite.querySelector<HTMLElement>('.ws-body')
    if (!body) return
    const fuss = seite.querySelector<HTMLElement>('.ws-footer')
    const inhalt = seite.querySelector<HTMLElement>('.ws-content') ?? seite
    const br = body.getBoundingClientRect()
    const pad = parseFloat(getComputedStyle(body).paddingTop) || 0
    const oben = br.top + pad
    // Unterkante: Oberkante des Fußes (mit 1 mm Luft zur Linie), ohne Fuß das Ende des Satzspiegels
    const mm = 96 / 25.4
    const grenze = (fuss ? fuss.getBoundingClientRect().top : inhalt.getBoundingClientRect().bottom) - mm
    let unten = 0
    body.querySelectorAll<HTMLElement>('*').forEach((el) => {
      const st = getComputedStyle(el)
      if (st.position === 'absolute' || st.position === 'fixed' || st.display === 'none' || st.visibility === 'hidden') return
      const r = el.getBoundingClientRect()
      if (r.height > 0 && r.bottom > unten) unten = r.bottom
    })
    if (unten <= grenze || unten <= oben) return
    const massstab = Math.max(0.85, Math.floor(((grenze - oben) / (unten - oben)) * 1000) / 1000)
    /*
     * Der Inhalt kommt in eine Hülle, nur sie wird verkleinert. Der Rumpf selbst schneidet ab (overflow: clip) – auf
     * ihm verkleinert, wäre der überstehende Teil schon VOR dem Verkleinern abgeschnitten.
     * `overflow: hidden` statt `clip` am Rumpf: Erst so ist der Seiteninhalt für den Druck EIN Block. Mit `clip` verteilt
     * Chromium einen Baustein, der über die Seite ragt, auf die nächste Druckseite – dort wird er abgeschnitten, und auf
     * dieser Seite fehlt er ganz (nachgestellt mit breiterer Schrift: M1 verschwand von Seite 1).
     * Die Hülle ist so hoch wie die Inhaltsfläche und `position: relative` – frei platzierte Bausteine (Prozent) behalten
     * ihren Bezug.
     */
    const huelle = doc.createElement('div')
    huelle.setAttribute('data-eingepasst', String(massstab))
    huelle.style.cssText = `position:relative;height:${br.height - pad}px;transform:scale(${massstab});transform-origin:top center`
    while (body.firstChild) huelle.appendChild(body.firstChild)
    body.appendChild(huelle)
    body.style.overflow = 'hidden'
    aus.push({ seite: i, massstab })
  })
  return aus
}
