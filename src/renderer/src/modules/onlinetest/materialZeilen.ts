/**
 * Materialtexte des Blatts mit den Zeilennummern, wie sie gedruckt dastehen (03.10.2026).
 *
 * Befund der Lehrkraft: Das Feedback behauptete „Die Zeilenangabe ‚Z. 21f.' passt nicht zu dem
 * genannten Kriegseintritt" – dabei steht er genau dort. Die KI sah M1 gar nicht mit Nummern und
 * hat geraten. Hier werden die Zeilen so gelesen, wie das Blatt sie setzt: Der Textkörper trägt
 * die erste Nummer (`data-zeile-start`), jede Zeile ist 1,5 Zeilenhöhen der Textschrift hoch
 * (blockview.tsx, ws.css). Jedes Wort wird an seiner Höhe einer Zeile zugeordnet.
 */
export function materialMitZeilen(doc: Document, hoechstens = 24000): string {
  const bloecke: { label: string; zeilen: Map<number, string[]> }[] = []
  doc.querySelectorAll<HTMLElement>('.ws-text-numbered .ws-text-body[data-zeile-start]').forEach((body) => {
    const start = Number(body.dataset.zeileStart) || 0
    const zeilenhoehe = (parseFloat(getComputedStyle(body).fontSize) || 15) * 1.5
    const oben = body.getBoundingClientRect().top
    const block = body.closest('.ws-text')
    const kopf = block?.querySelector('.ws-material-no')?.textContent?.trim() || /M\s?\d+/.exec(block?.textContent ?? '')?.[0] || 'Material'
    let ziel = bloecke.find((b) => b.label === kopf)
    if (!ziel) {
      ziel = { label: kopf, zeilen: new Map() }
      bloecke.push(ziel)
    }
    const laeufer = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement?.closest('.ws-line-numbers, .ws-glossary, .ws-fassung') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
    })
    const bereich = doc.createRange()
    for (let n = laeufer.nextNode(); n; n = laeufer.nextNode()) {
      const text = n.textContent ?? ''
      for (const m of text.matchAll(/\S+/g)) {
        bereich.setStart(n, m.index ?? 0)
        bereich.setEnd(n, (m.index ?? 0) + m[0].length)
        const r = bereich.getClientRects()[0]
        if (!r) continue
        const nr = start + 1 + Math.max(0, Math.floor((r.top - oben + zeilenhoehe * 0.25) / zeilenhoehe))
        const liste = ziel.zeilen.get(nr) ?? []
        liste.push(m[0])
        ziel.zeilen.set(nr, liste)
      }
    }
  })
  const aus = bloecke
    .filter((b) => b.zeilen.size)
    .map(
      (b) =>
        `${b.label}\n${[...b.zeilen.entries()]
          .sort((x, y) => x[0] - y[0])
          .map(([nr, w]) => `Z. ${nr}: ${w.join(' ')}`)
          .join('\n')}`
    )
    .join('\n\n')
  return aus.slice(0, hoechstens)
}
