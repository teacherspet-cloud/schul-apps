/**
 * Fingergesten für die ganze App (30.09.2026) – einmal am Dokument, damit alle Programme
 * profitieren, ohne dass jedes Programm etwas dafür tun muss. Wirkt nur im Touch-Modus
 * (touchModus.ts); am PC mit Maus passiert hier nichts.
 *
 *  1. LANGER DRUCK (0,5 s) – der Ersatz für Rechtsklick und Überfahren:
 *     a) Ein Element mit `data-langdruck` bekommt das Ereignis `langerdruck` (z. B. Einträge der
 *        Bibliothek öffnen ihr ⋯-Menü).
 *     b) Sonst geht ein `contextmenu` an das Element – wer ein Rechtsklick-Menü hat, öffnet es.
 *     c) Sonst erscheint die Beschreibung des Knopfes (aria-label, title, data-tipp) als kleine
 *        Blase – die Tooltips der Maus erscheinen auf dem Tablet nie.
 *     Der Klick, der beim Loslassen folgt, wird dann verschluckt.
 *  2. DOPPELTIPPEN → `dblclick`. Einige Aktionen hängen am Doppelklick (Vokabeltest: richtige
 *     Antwort markieren); WebKit auf dem iPad meldet ihn nicht verlässlich.
 *  3. WISCHEN zwischen den Schritten eines Programms (Stepper oben): nach links = weiter,
 *     nach rechts = zurück – nur, wo der Schritt auch per Antippen erreichbar wäre. Vom linken
 *     Rand aus öffnet Wischen die Programmliste (Ereignis `schulapps:randwischen`).
 *  4. BILDSCHIRMTASTATUR: Das angetippte Feld rückt in den sichtbaren Bereich; im Browser
 *     (wo die Tastatur die Seite nur überdeckt) schrumpft die App auf den Platz darüber.
 */
import {
  bewegt,
  DOPPELTIPP_MS,
  istDoppeltipp,
  istTipp,
  LANGER_DRUCK_MS,
  RAND_PX,
  tastaturHoehe,
  tippText,
  verdeckt,
  wischRichtung,
  type Punkt
} from './gestenLogik'
import { touchAktiv } from './touchModus'

const EINGABE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), .rt-editable, [role="textbox"]'
const MIT_TIPP =
  'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="switch"], [role="radio"], [role="checkbox"], [data-tipp], [title], [aria-label]'

const istFinger = (e: PointerEvent): boolean => e.pointerType === 'touch' || e.pointerType === 'pen'

// ---------- Hinweisblase

let blase: HTMLDivElement | null = null
let blaseZeit = 0

export function tippZeigen(text: string, bei: DOMRect): void {
  tippWeg()
  const b = document.createElement('div')
  b.className = 'touch-tipp'
  b.setAttribute('role', 'tooltip')
  b.textContent = text
  document.body.appendChild(b)
  const r = b.getBoundingClientRect()
  const rand = 8
  let top = bei.top - r.height - 10
  if (top < rand + 20) top = bei.bottom + 10
  const left = Math.min(window.innerWidth - r.width - rand, Math.max(rand, bei.left + bei.width / 2 - r.width / 2))
  b.style.top = `${Math.round(top)}px`
  b.style.left = `${Math.round(left)}px`
  blase = b
  const meine = ++blaseZeit
  window.setTimeout(() => meine === blaseZeit && tippWeg(), 2600)
}

export function tippWeg(): void {
  blase?.remove()
  blase = null
  hoverEnde()
}

/*
 * Die Tooltips von Mantine öffnen nur für die Maus (floating-ui `mouseOnly`) – ihr Text steht
 * vorher nirgends im Dokument. Beim langen Druck wird deshalb ein Überfahren mit der Maus
 * nachgespielt: `pointerover` (meldet React „Maus“) und `mouseenter` an das Element und seine
 * Vorfahren (einer davon ist der Anker des Tooltips). Beim nächsten Antippen oder nach 2,6 s
 * folgt das Verlassen.
 */
let hoverKette: HTMLElement[] = []
let hoverUhr = 0

function hoverVorspielen(ziel: HTMLElement, bis: HTMLElement | null): void {
  hoverEnde()
  const kette: HTMLElement[] = []
  for (let el: HTMLElement | null = ziel; el && el !== document.body && kette.length < 6; el = el.parentElement) {
    kette.push(el)
    if (el === bis) break
  }
  ziel.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse', isPrimary: true }))
  for (const el of [...kette].reverse()) el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
  hoverKette = kette
  hoverUhr = window.setTimeout(hoverEnde, 2600)
}

function hoverEnde(): void {
  if (!hoverKette.length) return
  window.clearTimeout(hoverUhr)
  const kette = hoverKette
  hoverKette = []
  for (const el of kette) el.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }))
  kette[0]?.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse', isPrimary: true }))
}

const tooltipOffen = (): boolean => [...document.querySelectorAll<HTMLElement>('.mantine-Tooltip-tooltip')].some((t) => t.getBoundingClientRect().width > 0)

// ---------- 1. Langer Druck, 2. Doppeltippen

function langerDruckUndDoppeltipp(): void {
  let start: (Punkt & { zeit: number; ziel: HTMLElement; id: number }) | null = null
  let uhr: number | null = null
  let klickSchlucken = 0
  let letzterTipp: (Punkt & { zeit: number }) | null = null
  let doppelBis = 0

  const abbrechen = (): void => {
    if (uhr) window.clearTimeout(uhr)
    uhr = null
  }

  const ausloesen = (): void => {
    uhr = null
    if (!start) return
    const { ziel, x, y } = start
    // a) Eigene Behandlung
    const eigen = ziel.closest<HTMLElement>('[data-langdruck]')
    if (eigen) {
      eigen.dispatchEvent(new CustomEvent('langerdruck', { bubbles: true, detail: { x, y } }))
      klickSchlucken = Date.now() + 900
      navigator.vibrate?.(10)
      return
    }
    if (ziel.closest(EINGABE)) return
    // b) Rechtsklick-Menü des Elements
    const kontext = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 })
    if (!ziel.dispatchEvent(kontext)) {
      klickSchlucken = Date.now() + 900
      return
    }
    // c) Beschreibung: der Tooltip des Knopfes – oder, wo es keinen gibt, eine eigene Blase
    const traeger = ziel.closest<HTMLElement>(MIT_TIPP)
    if (!traeger) return
    klickSchlucken = Date.now() + 1200
    hoverVorspielen(ziel, traeger)
    window.setTimeout(() => {
      if (tooltipOffen()) return
      const text = tippText(traeger.dataset.tipp ?? traeger.getAttribute('aria-label') ?? traeger.getAttribute('title'), traeger.textContent)
      if (text) tippZeigen(text, traeger.getBoundingClientRect())
    }, 450)
  }

  document.addEventListener(
    'pointerdown',
    (e) => {
      tippWeg()
      // Verschluckt wird nur der Klick, der zum langen Druck gehört – nie der eines neuen Antippens
      klickSchlucken = 0
      if (!touchAktiv() || !istFinger(e) || !e.isPrimary) {
        abbrechen()
        start = null
        return
      }
      const ziel = e.target as HTMLElement | null
      if (!ziel?.closest) return
      // Griffe zum Ziehen (Beschriftungspunkt, Schild, Anfassknopf): Halten beginnt dort einen Zug, es fragt nicht nach der Beschreibung
      if (ziel.closest('[data-griff], .editor-block-griff')) {
        abbrechen()
        start = null
        return
      }
      start = { x: e.clientX, y: e.clientY, zeit: Date.now(), ziel, id: e.pointerId }
      abbrechen()
      uhr = window.setTimeout(ausloesen, LANGER_DRUCK_MS)
    },
    { capture: true, passive: true }
  )
  document.addEventListener(
    'pointermove',
    (e) => {
      if (start && e.pointerId === start.id && bewegt(start, { x: e.clientX, y: e.clientY })) abbrechen()
    },
    { capture: true, passive: true }
  )
  document.addEventListener(
    'pointerup',
    (e) => {
      abbrechen()
      if (!start || e.pointerId !== start.id) return
      const s = start
      start = null
      const jetzt = { x: e.clientX, y: e.clientY, zeit: Date.now() }
      if (!istTipp(s, jetzt, jetzt.zeit - s.zeit)) {
        letzterTipp = null
        return
      }
      if (istDoppeltipp(letzterTipp, jetzt)) {
        letzterTipp = null
        const ziel = e.target as HTMLElement | null
        if (!ziel || ziel.closest('input, textarea, select')) return
        doppelBis = Date.now() + DOPPELTIPP_MS
        ziel.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY, detail: 2 }))
        return
      }
      letzterTipp = jetzt
    },
    { capture: true, passive: true }
  )
  document.addEventListener('pointercancel', () => {
    abbrechen()
    start = null
  })
  /*
   * Nach einem langen Druck keine nachgeahmten Mausereignisse: Der Browser schickt beim
   * Loslassen mousedown/mouseup/click hinterher – das mousedown schloss das gerade geöffnete
   * Menü sofort wieder („Klick daneben"). `preventDefault` am touchend unterbindet alle drei.
   */
  document.addEventListener(
    'touchend',
    (e) => {
      if (Date.now() < klickSchlucken && e.cancelable) e.preventDefault()
    },
    { capture: true, passive: false }
  )
  for (const art of ['mousedown', 'mouseup'] as const)
    document.addEventListener(
      art,
      (e) => {
        if (Date.now() < klickSchlucken) {
          e.preventDefault()
          e.stopPropagation()
        }
      },
      true
    )
  // Den Klick nach einem langen Druck verschlucken – sonst löste der Knopf zusätzlich aus
  document.addEventListener(
    'click',
    (e) => {
      if (Date.now() < klickSchlucken) {
        klickSchlucken = 0
        e.preventDefault()
        e.stopPropagation()
      }
    },
    true
  )
  // Meldet der Browser den Doppelklick selbst, gilt nur unserer
  document.addEventListener(
    'dblclick',
    (e) => {
      if (e.isTrusted && Date.now() < doppelBis) e.stopImmediatePropagation()
    },
    true
  )
  // Das Menü des Systems beim langen Druck auf Knöpfe unterdrücken (Android/Chrome); iOS regelt touch.css
  document.addEventListener(
    'contextmenu',
    (e) => {
      if (!touchAktiv() || !e.isTrusted) return
      const t = e.target as HTMLElement | null
      if (t?.closest?.('button, [role="button"], [data-langdruck]')) e.preventDefault()
    },
    false
  )
}

// ---------- Angetippt: Ersatz für das Überfahren

/**
 * Elemente, deren Werkzeuge am PC beim Überfahren erscheinen (Bausteine, Einträge im
 * Vokabeltest, Notizen der Rückmeldung). Mit dem Finger gibt es kein Überfahren – das
 * zuletzt angetippte Element trägt deshalb `data-angetippt`, und touch.css blendet dessen
 * Werkzeuge ein, bis etwas anderes angetippt wird. Tippen in ein Menü oder einen Dialog
 * (Portale außerhalb des Blattes) zählt als „drinnen“ – sonst schlösse die Leiste beim Auswählen.
 */
export const ANTIPP_ZIELE = '.editor-block, .vt-item, .vt-gaptext-gap, .vt-picture, .vt-match tr, .rm-notiz, .rm-zeile, .bl-k, [data-antippen]'
const PORTALE = '.mantine-Menu-dropdown, .mantine-Popover-dropdown, .mantine-Modal-root, .mantine-Drawer-root, .touch-tipp'

function angetippt(): void {
  let markiert: HTMLElement[] = []
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!touchAktiv() || e.pointerType === 'mouse') return
      const ziel = e.target as HTMLElement | null
      if (!ziel?.closest || ziel.closest(PORTALE)) return
      const neu: HTMLElement[] = []
      for (let el = ziel.closest<HTMLElement>(ANTIPP_ZIELE); el; el = el.parentElement?.closest<HTMLElement>(ANTIPP_ZIELE) ?? null) neu.push(el)
      for (const el of markiert) if (!neu.includes(el)) el.removeAttribute('data-angetippt')
      for (const el of neu) el.setAttribute('data-angetippt', '')
      markiert = neu
    },
    { capture: true, passive: true }
  )
}

// ---------- 3. Wischen zwischen den Schritten

/** Hier beginnt kein Schritt-Wischen: Eingaben, Blätter (Zoom), Zeichenflächen, Menüs, seitwärts rollende Bereiche */
const KEIN_WISCHEN =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), .fit-to-width, .zoom-flaeche, canvas, svg, [data-kein-wischen], [data-wisch-zeile], .mantine-Drawer-root, .mantine-Popover-dropdown, .mantine-Menu-dropdown, .mantine-Slider-root, .editor-block'

function rolltSeitwaerts(el: HTMLElement | null): boolean {
  for (let e = el; e && e !== document.body; e = e.parentElement) {
    if (e.scrollWidth > e.clientWidth + 2) {
      const ox = getComputedStyle(e).overflowX
      if (ox === 'auto' || ox === 'scroll') return true
    }
  }
  return false
}

/**
 * Die Schritte, um die es geht (Mantine-Stepper): im Dialog, in dem gewischt wurde (Einrichtung),
 * sonst im vorderen Programm.
 */
function schritte(bei?: HTMLElement | null): HTMLElement[] {
  const dialog = bei?.closest?.<HTMLElement>('.mantine-Modal-root')
  const bereich = dialog ?? document.querySelector<HTMLElement>('.module-container:not([hidden])')
  const stepper = bereich?.querySelector<HTMLElement>('.mantine-Stepper-steps')
  if (!stepper || !stepper.offsetParent) return []
  return [...stepper.querySelectorAll<HTMLElement>('.mantine-Stepper-step')]
}

/** Einen Schritt weiter oder zurück – nur, wenn er per Antippen erreichbar ist (tabIndex 0 setzt Mantine dann) */
export function schrittWechseln(richtung: 'vor' | 'zurueck', bei?: HTMLElement | null): boolean {
  const liste = schritte(bei)
  const aktiv = liste.findIndex((s) => s.hasAttribute('data-progress'))
  if (aktiv < 0) return false
  const ziel = liste[aktiv + (richtung === 'vor' ? 1 : -1)]
  if (!ziel || ziel.tabIndex < 0 || ziel.hasAttribute('disabled')) return false
  ziel.click()
  return true
}

function wischen(): void {
  let start: (Punkt & { zeit: number; ziel: HTMLElement | null }) | null = null
  document.addEventListener(
    'touchstart',
    (e) => {
      if (!touchAktiv() || e.touches.length !== 1) {
        start = null
        return
      }
      const t = e.touches[0]
      start = { x: t.clientX, y: t.clientY, zeit: Date.now(), ziel: e.target as HTMLElement | null }
    },
    { capture: true, passive: true }
  )
  document.addEventListener(
    'touchend',
    (e) => {
      const s = start
      start = null
      if (!s || e.touches.length > 0) return
      const t = e.changedTouches[0]
      if (!t) return
      const richtung = wischRichtung(t.clientX - s.x, t.clientY - s.y, Date.now() - s.zeit)
      if (!richtung) return
      // Vom linken Rand nach rechts: Programmliste
      if (richtung === 'zurueck' && s.x <= RAND_PX) {
        window.dispatchEvent(new CustomEvent('schulapps:randwischen'))
        return
      }
      const ziel = s.ziel
      if (ziel?.closest?.(KEIN_WISCHEN) || rolltSeitwaerts(ziel)) return
      if (window.getSelection()?.toString()) return
      schrittWechseln(richtung, ziel)
    },
    { capture: true, passive: true }
  )
  document.addEventListener('touchcancel', () => (start = null), { capture: true, passive: true })
}

// ---------- 4. Bildschirmtastatur

function tastatur(): void {
  const vv = window.visualViewport
  const html = document.documentElement

  const feldZeigen = (): void => {
    const el = document.activeElement as HTMLElement | null
    if (!touchAktiv() || !el || !el.matches?.(EINGABE)) return
    const oben = vv?.offsetTop ?? 0
    const unten = oben + (vv?.height ?? window.innerHeight)
    const r = el.getBoundingClientRect()
    // Große Felder (lange Texte): der Anfang genügt
    if (verdeckt({ top: r.top, bottom: Math.min(r.bottom, r.top + 120) }, oben, unten))
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
  }

  const messen = (): void => {
    const h = touchAktiv() && vv ? tastaturHoehe(window.innerHeight, vv.height, vv.offsetTop) : 0
    html.style.setProperty('--tastatur-hoehe', `${h}px`)
    if (h > 0) html.setAttribute('data-tastatur', '')
    else html.removeAttribute('data-tastatur')
    window.setTimeout(feldZeigen, 60)
  }

  document.addEventListener('focusin', () => window.setTimeout(feldZeigen, 320), true)
  vv?.addEventListener('resize', messen)
  // In der App schrumpft das Fenster selbst (Capacitor Keyboard, resize: native)
  window.addEventListener('resize', () => window.setTimeout(feldZeigen, 60))
  messen()
}

let eingerichtet = false

/** Einmal beim Start (main.tsx) – die Gesten prüfen selbst, ob der Touch-Modus gerade gilt */
export function gestenEinrichten(): void {
  if (eingerichtet || typeof document === 'undefined') return
  eingerichtet = true
  langerDruckUndDoppeltipp()
  angetippt()
  wischen()
  tastatur()
}
