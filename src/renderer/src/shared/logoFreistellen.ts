/**
 * Schullogo freistellen (10.10.2026, Wunsch der Lehrkraft: „Mach den Hintergrund des Schullogos transparent, damit nur
 * das Logo zu sehen ist"). Logos kommen meist als Bild mit weißem bzw. hellem Hintergrund. Hier wird der Hintergrund
 * vom Rand her durchsichtig gemacht (Flutfüllung über helle, wenig farbige Pixel) – Weiß im Inneren des Logos bleibt.
 */

/** Hell genug und kaum farbig, um als Hintergrund zu gelten */
const istHintergrund = (r: number, g: number, b: number, schwelle: number): boolean =>
  Math.min(r, g, b) >= schwelle && Math.max(r, g, b) - Math.min(r, g, b) <= 24

/**
 * RGBA-Pixel (wie ImageData.data) an Ort und Stelle freistellen: alles Helle, das mit dem Rand verbunden ist, wird
 * durchsichtig; ein schmaler Übergang (fast hell) wird halb durchsichtig, damit keine harte Kante bleibt.
 */
export function hintergrundEntfernen(daten: Uint8ClampedArray, breite: number, hoehe: number, schwelle = 232): number {
  const besucht = new Uint8Array(breite * hoehe)
  const stapel: number[] = []
  const pruefe = (i: number): void => {
    if (besucht[i]) return
    const o = i * 4
    if (daten[o + 3] === 0 || istHintergrund(daten[o], daten[o + 1], daten[o + 2], schwelle)) {
      besucht[i] = 1
      stapel.push(i)
    }
  }
  for (let x = 0; x < breite; x++) {
    pruefe(x)
    pruefe((hoehe - 1) * breite + x)
  }
  for (let y = 0; y < hoehe; y++) {
    pruefe(y * breite)
    pruefe(y * breite + breite - 1)
  }
  let n = 0
  while (stapel.length) {
    const i = stapel.pop() as number
    daten[i * 4 + 3] = 0
    n++
    const x = i % breite
    const y = (i - x) / breite
    if (x > 0) pruefe(i - 1)
    if (x < breite - 1) pruefe(i + 1)
    if (y > 0) pruefe(i - breite)
    if (y < hoehe - 1) pruefe(i + breite)
  }
  // Weiche Kante: Nachbarn freigestellter Pixel, die fast hell sind, halb durchsichtig
  for (let i = 0; i < breite * hoehe; i++) {
    if (besucht[i]) continue
    const o = i * 4
    const x = i % breite
    const nachbar = (x > 0 && besucht[i - 1]) || (x < breite - 1 && besucht[i + 1]) || besucht[i - breite] || besucht[i + breite]
    if (nachbar && istHintergrund(daten[o], daten[o + 1], daten[o + 2], schwelle - 40)) daten[o + 3] = Math.min(daten[o + 3], 110)
  }
  return n
}

const zwischenspeicher = new Map<string, Promise<string>>()

/** Ein Logo (data:- oder normale URL) freigestellt als PNG-data:-URL; bei Fehlern das Original */
export function logoFreigestellt(quelle: string): Promise<string> {
  const vorhanden = zwischenspeicher.get(quelle)
  if (vorhanden) return vorhanden
  const p = new Promise<string>((ok) => {
    const bild = new Image()
    bild.onload = () => {
      try {
        const massstab = Math.min(1, 512 / Math.max(bild.naturalWidth, bild.naturalHeight))
        const b = Math.max(1, Math.round(bild.naturalWidth * massstab))
        const h = Math.max(1, Math.round(bild.naturalHeight * massstab))
        const c = document.createElement('canvas')
        c.width = b
        c.height = h
        const k = c.getContext('2d')
        if (!k) return ok(quelle)
        k.drawImage(bild, 0, 0, b, h)
        const d = k.getImageData(0, 0, b, h)
        hintergrundEntfernen(d.data, b, h)
        k.putImageData(d, 0, 0)
        ok(c.toDataURL('image/png'))
      } catch {
        ok(quelle)
      }
    }
    bild.onerror = () => ok(quelle)
    bild.src = quelle
  })
  zwischenspeicher.set(quelle, p)
  return p
}
