/**
 * Ordner aus dem Regal nehmen und aufschlagen (08.10.2026, abgestimmt mit der Lehrkraft; überarbeitet nach ihrem Befund:
 * „wird immer mehr zu einer Linie, verschwindet kurz, schlägt eher zu als auf; man sieht eine leere Seite mit Linien").
 * Jetzt in zwei Teilen über den Seitenwechsel hinweg:
 *  1. Im Regal: Der Rücken wird herausgezogen und wächst in einer leichten Drehung zum geschlossenen Ordner (Deckel mit
 *     Etikett) in der Bildmitte – ohne Kante-voraus-Drehung. Lage und Farbe gehen über sessionStorage an die neue Seite.
 *  2. Auf der Ordnerseite: Der Deckel liegt zuerst über dem echten Inhalt, rückt an die Stelle des Ordners und klappt nach
 *     links auf – darunter steht schon die richtige Seite.
 * Zuklappen umgekehrt: Deckel schließt über dem Inhalt, Ordner wird klein, im Regal gleitet der Rücken an seinen Platz.
 * Bei „Ruhige Darstellung" bzw. reduzierter Bewegung ohne Animation.
 */

const CSS = `
.sa-ordner-buehne { position: fixed; inset: 0; z-index: 10000; perspective: 1800px; pointer-events: none; }
.sa-ordner-dunkel { position: absolute; inset: 0; background: rgba(15, 18, 25, 0.45); opacity: 0; }
.sa-ordner-deckel { position: absolute; left: 0; top: 0; border-radius: 8px; transform-origin: 0% 50%; overflow: hidden;
  background: linear-gradient(135deg, var(--f), color-mix(in srgb, var(--f) 72%, #000));
  box-shadow: 0 24px 60px rgba(0,0,0,.45), inset 0 0 0 2px rgba(255,255,255,.12), inset 10px 0 0 color-mix(in srgb, var(--f) 70%, #000);
  backface-visibility: hidden; display: grid; place-items: center; }
.sa-ordner-etikett { width: 62%; min-height: 22%; border-radius: 6px; background: rgba(255,255,255,.88); color: #1f2328; display: grid; place-items: center;
  font: 800 clamp(14px, 2.6vw, 28px) system-ui, sans-serif; text-align: center; padding: 6px 10px; box-shadow: inset 0 0 0 2px rgba(0,0,0,.08); }
`

const SCHLUESSEL = 'sa-ordner-uebergang'
const ZURUECK = 'sa-ordner-zurueck'

export interface Rechteck {
  x: number
  y: number
  b: number
  h: number
}

export const ruhig = (): boolean =>
  document.documentElement.classList.contains('sa-ruhig') || Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) || typeof document.body.animate !== 'function'

let gestartet = false

/** Bühne mit Deckel anlegen */
function buehne(farbe: string, text: string): { el: HTMLDivElement; deckel: HTMLDivElement; dunkel: HTMLDivElement } {
  if (!document.getElementById('sa-ordner-stil')) {
    const stil = document.createElement('style')
    stil.id = 'sa-ordner-stil'
    stil.textContent = CSS
    document.head.appendChild(stil)
  }
  const el = document.createElement('div')
  el.className = 'sa-ordner-buehne'
  el.setAttribute('data-ordner-uebergang', '')
  el.style.setProperty('--f', farbe)
  el.innerHTML = '<div class="sa-ordner-dunkel"></div><div class="sa-ordner-deckel"><div class="sa-ordner-etikett"></div></div>'
  ;(el.querySelector('.sa-ordner-etikett') as HTMLElement).textContent = text
  document.body.appendChild(el)
  return { el, deckel: el.querySelector('.sa-ordner-deckel') as HTMLDivElement, dunkel: el.querySelector('.sa-ordner-dunkel') as HTMLDivElement }
}

const lage = (r: Rechteck, extra = ''): Keyframe => ({ transform: `translate(${r.x}px, ${r.y}px) ${extra}`, width: `${r.b}px`, height: `${r.h}px` })

/** Wo der geschlossene Ordner in der Mitte liegt (Hochformat eines Aktenordners) */
function mitte(): Rechteck {
  const h = Math.min(window.innerHeight * 0.62, 440)
  const b = Math.min(h * 0.74, window.innerWidth * 0.8)
  return { x: (window.innerWidth - b) / 2, y: (window.innerHeight - h) / 2, b, h }
}

/**
 * Teil 1 – im Regal: `quelle` ist der Rücken. Danach `ziel` öffnen.
 */
export function mitOrdner(ziel: string, farbe: string, quelle: HTMLElement | null, text: string): void {
  if (gestartet) return
  if (ruhig() || !quelle) return void window.location.assign(ziel)
  gestartet = true
  const r = quelle.getBoundingClientRect()
  const start: Rechteck = { x: r.left, y: r.top, b: r.width, h: r.height }
  const z = mitte()
  const { el, deckel, dunkel } = buehne(farbe, text)
  quelle.style.visibility = 'hidden'
  dunkel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, fill: 'forwards' })
  // Herausziehen (ein Stück nach vorn und oben), dann zur Mitte wachsen – mit leichter Drehung, nie hochkant
  deckel.animate(
    [
      { ...lage(start), opacity: 1 },
      { ...lage({ ...start, y: start.y - 14 }, 'scale(1.06)'), offset: 0.3 },
      { ...lage(z, 'rotateY(-18deg)'), offset: 0.8 },
      lage(z, 'rotateY(0deg)')
    ],
    { duration: 620, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' }
  )
  try {
    sessionStorage.setItem(SCHLUESSEL, JSON.stringify({ farbe, text, r: z, t: Date.now() }))
  } catch {
    /* ohne Speicher: die Ordnerseite erscheint ohne Aufklappen */
  }
  setTimeout(() => window.location.assign(ziel), 600)
  window.addEventListener(
    'pageshow',
    () => {
      el.remove()
      quelle.style.visibility = ''
      gestartet = false
    },
    { once: true }
  )
}

/** Teil 2 – auf der Ordnerseite: Übergang vom Regal abholen (nur frisch) */
export function nimmUebergang(): { farbe: string; text: string; r: Rechteck } | null {
  try {
    const roh = sessionStorage.getItem(SCHLUESSEL)
    sessionStorage.removeItem(SCHLUESSEL)
    const u = roh ? (JSON.parse(roh) as { farbe: string; text: string; r: Rechteck; t: number }) : null
    return u && Date.now() - u.t < 8000 && !ruhig() ? u : null
  } catch {
    return null
  }
}

/**
 * Deckel sofort über die Ordnerseite legen (vor dem Laden der Daten, damit nichts aufblitzt). Liefert eine Funktion,
 * die den Deckel an den Ordner rücken und aufklappen lässt, sobald `ziel` (der echte Ordner) steht.
 */
export function deckelBereit(u: { farbe: string; text: string; r: Rechteck }): (ziel: HTMLElement | null) => void {
  const { el, deckel, dunkel } = buehne(u.farbe, u.text)
  dunkel.style.opacity = '1'
  Object.assign(deckel.style, { transform: `translate(${u.r.x}px, ${u.r.y}px)`, width: `${u.r.b}px`, height: `${u.r.h}px` })
  let fertig = false
  const weg = (): void => el.remove()
  // Sicherheitsnetz: nie länger als 6 s liegen bleiben
  const notaus = window.setTimeout(weg, 6000)
  return (ziel) => {
    if (fertig) return
    fertig = true
    window.clearTimeout(notaus)
    if (!ziel) return weg()
    const z = ziel.getBoundingClientRect()
    const echt: Rechteck = { x: z.left, y: z.top, b: z.width, h: Math.min(z.height, window.innerHeight - z.top) }
    dunkel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, delay: 250, fill: 'forwards' })
    const a = deckel.animate(
      [lage(u.r), { ...lage(echt), offset: 0.3 }, lage(echt, 'rotateY(-150deg)')],
      { duration: 1250, easing: 'cubic-bezier(.35,.6,.25,1)', fill: 'forwards' }
    )
    a.onfinish = weg
  }
}

/** Zuklappen: Deckel schließt über dem Ordner, wird klein – dann zur Regalseite */
export function ordnerZu(ziel: string, farbe: string, ordner: HTMLElement | null, text: string, fach: string): void {
  if (gestartet) return
  try {
    sessionStorage.setItem(ZURUECK, JSON.stringify({ fach, t: Date.now() }))
  } catch {
    /* egal */
  }
  if (ruhig() || !ordner) return void window.location.assign(ziel)
  gestartet = true
  const z = ordner.getBoundingClientRect()
  const echt: Rechteck = { x: z.left, y: z.top, b: z.width, h: Math.min(z.height, window.innerHeight - z.top) }
  const m = mitte()
  const { el, deckel, dunkel } = buehne(farbe, text)
  dunkel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, fill: 'forwards' })
  deckel.animate(
    [
      lage(echt, 'rotateY(-150deg)'),
      { ...lage(echt, 'rotateY(0deg)'), offset: 0.5 },
      { ...lage(m), offset: 0.8, opacity: 1 },
      { ...lage({ x: m.x + m.b * 0.35, y: m.y + m.h * 0.1, b: m.b * 0.3, h: m.h * 0.8 }), opacity: 0 }
    ],
    { duration: 760, easing: 'cubic-bezier(.4,.1,.3,1)', fill: 'forwards' }
  )
  setTimeout(() => window.location.assign(ziel), 680)
  window.addEventListener(
    'pageshow',
    () => {
      el.remove()
      gestartet = false
    },
    { once: true }
  )
}

/** Im Regal: Welcher Ordner kommt gerade zurück? (Rücken gleitet an seinen Platz) */
export function nimmZurueck(): string | null {
  try {
    const roh = sessionStorage.getItem(ZURUECK)
    sessionStorage.removeItem(ZURUECK)
    const u = roh ? (JSON.parse(roh) as { fach: string; t: number }) : null
    return u && Date.now() - u.t < 8000 && !ruhig() ? u.fach : null
  } catch {
    return null
  }
}
