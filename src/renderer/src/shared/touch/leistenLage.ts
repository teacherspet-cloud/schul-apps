/**
 * Lage der Werkzeugleiste eines Bausteins (01.10.2026).
 *
 * Befund der Lehrkraft: „Auf dem iPad lassen sich die Knöpfe neben dem Baustein (Zauberstab usw.)
 * nicht antippen" und „Die Leiste ist nur über dem Blatt zu sehen, nicht über der leeren Fläche
 * daneben – auch am PC."
 *
 * Ursachen (nachgemessen mit WebKit und Chromium, iPad hochkant 820 × 1180):
 *  1. Die Leiste steht im rechten Seitenrand und ragt über die Seite hinaus. `.ws-page` schnitt
 *     mit `overflow: clip` alles ab, was über den Blattrand reicht – unsichtbar UND nicht
 *     antippbar. Auf dem Tablet ist die Leiste fingergroß (44 Punkte, `right: -52px`) und damit
 *     breiter als der verkleinerte Seitenrand.
 *  2. Die Leiste ist länger als ein kurzer Baustein. Die folgenden Bausteine lagen darüber –
 *     ihre Fläche fing den Finger ab. Am PC hob `:hover` den Baustein an; mit dem Finger gibt es
 *     kein Überfahren.
 *  3. Unten rechts schwebten die Zoom-Knöpfe über den unteren Knöpfen der Leiste.
 *
 * Abhilfe: Das Blatt schneidet im Editor nur noch oben und unten ab (ws.css), der angetippte
 * Baustein liegt oben (editor.css), und diese Rechnung rückt die Leiste ganz in den sichtbaren
 * Bereich – auch beim Rollen und Zoomen.
 */

/** Rechteck in Bildschirmpunkten */
export interface Kasten {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * Wie weit muss die Leiste rücken, damit sie ganz im Feld steht (Bildschirmpunkte)?
 *
 * Waagerecht: Reicht sie rechts aus dem Feld (das Blatt füllt die Breite), rückt sie nach links
 * über den Baustein. Senkrecht: zuerst nach oben, falls sie unten herausragt; der obere Rand hat
 * Vorrang. Nach unten folgt sie dem Feld höchstens bis kurz vor die Unterkante des Bausteins –
 * sie gehört sichtbar zu ihm.
 */
export function leistenVersatz(leiste: Kasten, feld: Kasten, baustein: Kasten): { dx: number; dy: number } {
  let dx = 0
  if (leiste.right > feld.right) dx = feld.right - leiste.right
  if (leiste.left + dx < feld.left) dx = feld.left - leiste.left
  let dy = 0
  if (leiste.bottom > feld.bottom) dy = feld.bottom - leiste.bottom
  if (leiste.top + dy < feld.top) dy = feld.top - leiste.top
  if (dy > 0) dy = Math.min(dy, Math.max(0, baustein.bottom - 24 - leiste.top))
  return { dx: Math.round(dx), dy: Math.round(dy) }
}

const schnitt = (a: Kasten, b: Kasten): Kasten => ({
  left: Math.max(a.left, b.left),
  top: Math.max(a.top, b.top),
  right: Math.min(a.right, b.right),
  bottom: Math.min(a.bottom, b.bottom)
})

/** Sichtbarer Bereich um ein Element: Fenster geschnitten mit allen rollenden Vorfahren */
export function sichtfeld(el: HTMLElement, rand = 8): Kasten {
  let feld: Kasten = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
  for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
    const cs = getComputedStyle(e)
    if (!/auto|scroll/.test(`${cs.overflowX} ${cs.overflowY}`)) continue
    const r = e.getBoundingClientRect()
    // Rechts liegt der Rollbalken (ScrollArea) – er bleibt frei
    feld = schnitt(feld, { left: r.left, top: r.top, right: r.right - 10, bottom: r.bottom })
  }
  return { left: feld.left + rand, top: feld.top + rand, right: feld.right - rand, bottom: feld.bottom - rand }
}

/**
 * Leiste an ihren Platz rücken. `seite` begrenzt senkrecht (das Blatt schneidet oben und unten ab).
 * Die Leiste ist absolut im Baustein gesetzt; verschoben wird über `top`/`right` in ihren eigenen
 * Punkten – sie kann gezoomt sein (Blatt-Zoom, touch.css), daher die Umrechnung.
 */
export function leisteAusrichten(leiste: HTMLElement, baustein: HTMLElement, seite: HTMLElement | null): void {
  leiste.style.top = ''
  leiste.style.right = ''
  const cs = getComputedStyle(leiste)
  // Telefon: die Leiste steht fest unten (touch.css) – nichts zu rücken
  if (cs.position === 'fixed') return
  const lr = leiste.getBoundingClientRect()
  if (!lr.width || !leiste.offsetWidth) return
  const faktor = lr.width / leiste.offsetWidth
  const br = baustein.getBoundingClientRect()
  let feld = sichtfeld(baustein)
  if (seite) {
    const sr = seite.getBoundingClientRect()
    feld = { ...feld, top: Math.max(feld.top, sr.top + 8), bottom: Math.min(feld.bottom, sr.bottom - 8) }
  }
  const erst = leistenVersatz(lr, feld, br)
  // Die Zoom-Knöpfe schweben unten rechts über dem Blatt: dort rückt die Leiste darüber
  const bereich = baustein.closest('.module-container, .mantine-Modal-root') ?? document.body
  for (const zk of bereich.querySelectorAll<HTMLElement>('.zoom-knoepfe')) {
    const zr = zk.getBoundingClientRect()
    if (!zr.width || getComputedStyle(zk).display === 'none') continue
    const links = lr.left + erst.dx
    const rechts = lr.right + erst.dx
    if (rechts > zr.left && links < zr.right) feld = { ...feld, bottom: Math.min(feld.bottom, zr.top - 6) }
  }
  const { dx, dy } = leistenVersatz(lr, feld, br)
  if (dy) leiste.style.top = `${parseFloat(cs.top) + dy / faktor}px`
  if (dx) leiste.style.right = `${parseFloat(cs.right) - dx / faktor}px`
}
