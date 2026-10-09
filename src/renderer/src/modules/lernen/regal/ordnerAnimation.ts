/**
 * Ordner aus dem Regal nehmen und aufschlagen (08.10.2026, abgestimmt mit der Lehrkraft; überarbeitet nach ihrem Befund:
 * „wird immer mehr zu einer Linie, verschwindet kurz, schlägt eher zu als auf; man sieht eine leere Seite mit Linien").
 *
 * Ohne leere Seite (09.10.2026, Befund der Lehrkraft: „der Ordner rückt in die Mitte, dann ist der Bildschirm kurz leer,
 * bevor die neue Seite lädt" – beim Zuklappen ebenso). Ursache war das Neuladen der Seite zwischen Regal und Ordner.
 * Jetzt bleibt alles in EINER Seite (schuelerNavigation.ts: Adresse per pushState, der Schülerbereich zeichnet neu):
 *  1. Im Regal: Der Rücken wird herausgezogen und wächst in einer leichten Drehung zum geschlossenen Ordner (Deckel mit
 *     Etikett) in der Bildmitte. Dahinter wird der Grund deckend in der Farbe der Seite – der Wechsel darunter ist
 *     unsichtbar, nie ein leeres Bild.
 *  2. Wechsel zur Ordnerseite ohne Neuladen. Der Deckel wartet, bis der echte Ordner gezeichnet ist und seine Größe
 *     nicht mehr ändert (Bilder geladen), rückt dann GENAU auf den Ordner (Ringe, Blatt und Registerlaschen; bei langem
 *     Inhalt bis zum Bildrand) und klappt nach links auf, während der Grund verblasst.
 * Zuklappen umgekehrt: Deckel schließt über dem Ordner, der Grund wird deckend, der Ordner wird klein; nach dem Wechsel
 * ins Regal fliegt er an den Platz seines Rückens.
 * Bei „Ruhige Darstellung" bzw. reduzierter Bewegung ohne Animation (aber ebenfalls ohne Neuladen).
 */
import { geheZu, ohneNeuladen } from '../../onlinetest/schuelerNavigation'

const CSS = `
.sa-ordner-buehne { position: fixed; inset: 0; z-index: 10000; perspective: 1800px; pointer-events: none; }
.sa-ordner-grund { position: absolute; inset: 0; background: var(--sa-grund, #fff); opacity: 0; }
.sa-ordner-dunkel { position: absolute; inset: 0; background: rgba(15, 18, 25, 0.45); opacity: 0; }
.sa-ordner-deckel { position: absolute; left: 0; top: 0; border-radius: 8px; transform-origin: 0% 50%; overflow: hidden;
  background: linear-gradient(135deg, var(--f), color-mix(in srgb, var(--f) 72%, #000));
  box-shadow: 0 24px 60px rgba(0,0,0,.45), inset 0 0 0 2px rgba(255,255,255,.12), inset 10px 0 0 color-mix(in srgb, var(--f) 70%, #000);
  backface-visibility: hidden; -webkit-backface-visibility: hidden; display: grid; place-items: center; }
.sa-ordner-etikett { width: 62%; min-height: 22%; max-height: 180px; border-radius: 6px; background: rgba(255,255,255,.88); color: #1f2328; display: grid; place-items: center;
  font: 800 clamp(14px, 2.6vw, 28px) system-ui, sans-serif; text-align: center; padding: 6px 10px; box-shadow: inset 0 0 0 2px rgba(0,0,0,.08); }
`

const ZURUECK = 'sa-ordner-zurueck'
const VON = 'sa-ordner-von'

/** Woher der Ordner kam (08.10.2026: Regal auch auf der Startseite) – Zuklappen führt dorthin zurück */
export function herkunft(rueckfall: string): string {
  try {
    const v = sessionStorage.getItem(VON)
    return v && v.startsWith('/s') ? v : rueckfall
  } catch {
    return rueckfall
  }
}

export interface Rechteck {
  x: number
  y: number
  b: number
  h: number
}

export const ruhig = (): boolean =>
  document.documentElement.classList.contains('sa-ruhig') || Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) || typeof document.body.animate !== 'function'

interface Buehne {
  el: HTMLDivElement
  deckel: HTMLDivElement
  dunkel: HTMLDivElement
  grund: HTMLDivElement
}

/** Laufender Übergang (eine Seite, kein Neuladen): Aufschlagen wartet auf den Ordner, Zuklappen auf das Regal */
let laufend: (Buehne & { art: 'auf' | 'zu' }) | null = null

/** Hintergrund der Seite (deckender Grund während des Wechsels) */
function seitenGrund(): string {
  const leer = (c: string): boolean => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c)
  const body = getComputedStyle(document.body).backgroundColor
  if (!leer(body)) return body
  const html = getComputedStyle(document.documentElement).backgroundColor
  if (!leer(html)) return html
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? '#1a1b1e' : '#ffffff'
}

/** Bühne mit Grund, Abdunklung und Deckel anlegen */
function buehne(farbe: string, text: string): Buehne {
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
  el.style.setProperty('--sa-grund', seitenGrund())
  el.innerHTML = '<div class="sa-ordner-grund"></div><div class="sa-ordner-dunkel"></div><div class="sa-ordner-deckel"><div class="sa-ordner-etikett"></div></div>'
  ;(el.querySelector('.sa-ordner-etikett') as HTMLElement).textContent = text
  document.body.appendChild(el)
  return {
    el,
    deckel: el.querySelector('.sa-ordner-deckel') as HTMLDivElement,
    dunkel: el.querySelector('.sa-ordner-dunkel') as HTMLDivElement,
    grund: el.querySelector('.sa-ordner-grund') as HTMLDivElement
  }
}

const lage = (r: Rechteck, extra = ''): Keyframe => ({ transform: `translate(${r.x}px, ${r.y}px) ${extra}`, width: `${r.b}px`, height: `${r.h}px` })

/** Wo der geschlossene Ordner in der Mitte liegt (Hochformat eines Aktenordners) */
function mitte(): Rechteck {
  const h = Math.min(window.innerHeight * 0.62, 440)
  const b = Math.min(h * 0.74, window.innerWidth * 0.8)
  return { x: (window.innerWidth - b) / 2, y: (window.innerHeight - h) / 2, b, h }
}

/**
 * Sichtbarer Teil eines Elements: genau seine Breite, oben/unten auf das Bild begrenzt (langer Inhalt: bis zum
 * Bildrand – der Deckel ist nie kürzer oder länger als der sichtbare Ordner)
 */
export function sichtbarerTeil(r: Pick<DOMRect, 'left' | 'top' | 'width' | 'bottom'>, hoehe: number): Rechteck {
  const oben = Math.max(0, r.top)
  const unten = Math.min(hoehe, r.bottom)
  return { x: r.left, y: oben, b: r.width, h: Math.max(40, unten - oben) }
}

const bild = (): Promise<void> => new Promise((ok) => requestAnimationFrame(() => ok()))

/**
 * Warten, bis `finde()` ein Element liefert, es gezeichnet ist und seine Größe ein paar Bilder lang gleich bleibt
 * (Inhalt geladen, Bilder darin fertig) – höchstens `max` ms. Liefert das Element (oder null).
 */
async function wartenAuf(finde: () => HTMLElement | null, max: number): Promise<HTMLElement | null> {
  const t0 = performance.now()
  let el: HTMLElement | null = null
  let letzte = ''
  let gleich = 0
  while (performance.now() - t0 < max) {
    await bild()
    el = finde()
    if (!el) continue
    const r = el.getBoundingClientRect()
    const jetzt = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`
    gleich = jetzt === letzte && r.width > 0 ? gleich + 1 : 0
    letzte = jetzt
    const bilderFertig = Array.from(el.querySelectorAll('img')).every((i) => i.complete || i.loading === 'lazy')
    // Lädt darin noch etwas (Ladekreis), kommt gleich mehr Inhalt – dann warten (höchstens die Hälfte der Zeit)
    const laedt = Boolean(el.querySelector('.mantine-Loader-root'))
    // Einige gleiche Bilder hintereinander, Bilder geladen, nichts lädt mehr
    if (gleich >= 5 && ((bilderFertig && !laedt) || performance.now() - t0 > max / 2)) return el
  }
  return el
}

/** Übergang beenden: Bühne weg, für den nächsten bereit */
function aufraeumen(b: Buehne): void {
  b.el.remove()
  if (laufend?.el === b.el) laufend = null
}

/**
 * Teil 1 – im Regal: `quelle` ist der Rücken. Danach `ziel` öffnen (ohne Neuladen) und dort aufklappen.
 */
export function mitOrdner(ziel: string, farbe: string, quelle: HTMLElement | null, text: string): void {
  if (laufend) return
  try {
    sessionStorage.setItem(VON, window.location.pathname)
  } catch {
    /* dann zurück zum Rückfall */
  }
  if (ruhig() || !quelle) return geheZu(ziel)
  if (!ohneNeuladen()) return void window.location.assign(ziel)
  const r = quelle.getBoundingClientRect()
  const start: Rechteck = { x: r.left, y: r.top, b: r.width, h: r.height }
  const z = mitte()
  const b = buehne(farbe, text)
  laufend = { ...b, art: 'auf' }
  quelle.style.visibility = 'hidden'
  b.dunkel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, fill: 'forwards' })
  // Grund: deckend in der Farbe der Seite, ehe die Seite wechselt (darunter wird nie etwas leer gezeigt)
  b.grund.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 560, easing: 'ease-in', fill: 'forwards' })
  // Herausziehen (ein Stück nach vorn und oben), dann zur Mitte wachsen – mit leichter Drehung, nie hochkant
  b.deckel.animate(
    [
      { ...lage(start), opacity: 1 },
      { ...lage({ ...start, y: start.y - 14 }, 'scale(1.06)'), offset: 0.3 },
      { ...lage(z, 'rotateY(-18deg)'), offset: 0.8 },
      lage(z, 'rotateY(0deg)')
    ],
    { duration: 620, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' }
  )
  // Sicherheitsnetz: nie länger als 6 s liegen bleiben
  const notaus = window.setTimeout(() => aufraeumen(b), 6000)
  window.setTimeout(async () => {
    geheZu(ziel)
    const ordner = await wartenAuf(() => document.querySelector<HTMLElement>('[data-ordner] .og-ordner'), 1800)
    window.clearTimeout(notaus)
    if (!ordner || !b.el.isConnected) return aufraeumen(b)
    const mass = (): Rechteck => {
      const r = sichtbarerTeil(ordner.getBoundingClientRect(), window.innerHeight)
      b.el.setAttribute('data-ordner-ziel', `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.b)},${Math.round(r.h)}`)
      return r
    }
    const echt = mass()
    b.grund.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, delay: 120, easing: 'ease-out', fill: 'forwards' })
    b.dunkel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, delay: 250, fill: 'forwards' })
    // Erst auf den Ordner rücken, dann – neu gemessen, falls inzwischen mehr Inhalt kam – aufklappen
    const hin = b.deckel.animate([lage(z), lage(echt)], { duration: 380, easing: 'cubic-bezier(.35,.6,.25,1)', fill: 'forwards' })
    hin.oncancel = () => aufraeumen(b)
    hin.onfinish = () => {
      const jetzt = ordner.isConnected ? mass() : echt
      const auf = b.deckel.animate([lage(echt), { ...lage(jetzt), offset: 0.08 }, lage(jetzt, 'rotateY(-150deg)')], {
        duration: 900,
        easing: 'cubic-bezier(.4,.2,.3,1)',
        fill: 'forwards'
      })
      auf.onfinish = () => aufraeumen(b)
      auf.oncancel = () => aufraeumen(b)
    }
  }, 620)
}

/** Auf der Ordnerseite: Liegt gerade ein Deckel darüber (dann ohne eigenes Einblenden zeichnen)? */
export const ordnerUebergangLaeuft = (): boolean => laufend?.art === 'auf'

/** Zuklappen: Deckel schließt über dem Ordner, wird klein – Wechsel zum Regal, dort an den Platz des Rückens */
export function ordnerZu(ziel: string, farbe: string, ordner: HTMLElement | null, text: string, fach: string): void {
  if (laufend) return
  if (ruhig() || !ordner) {
    try {
      sessionStorage.setItem(ZURUECK, JSON.stringify({ fach, t: Date.now() }))
    } catch {
      /* egal */
    }
    return geheZu(ziel)
  }
  if (!ohneNeuladen()) return void window.location.assign(ziel)
  const echt = sichtbarerTeil(ordner.getBoundingClientRect(), window.innerHeight)
  const m = mitte()
  const b = buehne(farbe, text)
  laufend = { ...b, art: 'zu' }
  b.dunkel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, fill: 'forwards' })
  b.grund.animate([{ opacity: 0 }, { opacity: 0, offset: 0.3 }, { opacity: 1 }], { duration: 640, easing: 'ease-in', fill: 'forwards' })
  b.deckel.animate([lage(echt, 'rotateY(-150deg)'), { ...lage(echt, 'rotateY(0deg)'), offset: 0.55 }, lage(m)], {
    duration: 700,
    easing: 'cubic-bezier(.4,.1,.3,1)',
    fill: 'forwards'
  })
  const notaus = window.setTimeout(() => aufraeumen(b), 6000)
  window.setTimeout(async () => {
    geheZu(ziel)
    const sel = `[data-regal-ordner="${window.CSS?.escape ? window.CSS.escape(fach) : fach.replace(/"/g, '\\"')}"]`
    let ruecken = await wartenAuf(() => document.querySelector<HTMLElement>(sel), 1500)
    window.clearTimeout(notaus)
    if (!b.el.isConnected) return
    if (ruecken) {
      // Liegt das Regal außerhalb des Bildes (Startseite weiter unten): dorthin scrollen, dann landen
      const r0 = ruecken.getBoundingClientRect()
      if (r0.bottom < 0 || r0.top > window.innerHeight) {
        ruecken.scrollIntoView({ block: 'center' })
        await bild()
        ruecken = document.querySelector<HTMLElement>(sel)
      }
    }
    b.grund.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 380, easing: 'ease-out', fill: 'forwards' })
    b.dunkel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 520, fill: 'forwards' })
    if (!ruecken) {
      const a = b.deckel.animate([{ ...lage(m), opacity: 1 }, { ...lage(m, 'scale(.6)'), opacity: 0 }], { duration: 420, fill: 'forwards' })
      a.onfinish = () => aufraeumen(b)
      return
    }
    const r = ruecken.getBoundingClientRect()
    const ziel2: Rechteck = { x: r.left, y: r.top, b: r.width, h: r.height }
    ruecken.style.visibility = 'hidden'
    const a = b.deckel.animate(
      [{ ...lage(m), opacity: 1 }, { ...lage(ziel2, 'rotateY(-12deg)'), opacity: 1, offset: 0.85 }, { ...lage(ziel2), opacity: 0 }],
      { duration: 560, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' }
    )
    const fertig = (): void => {
      if (ruecken) ruecken.style.visibility = ''
      aufraeumen(b)
    }
    a.onfinish = fertig
    a.oncancel = fertig
  }, 700)
}

/** Im Regal: Welcher Ordner kommt gerade zurück (ruhige Darstellung: der Rücken gleitet an seinen Platz)? */
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
