/**
 * Rechenkern der Fingergesten (30.09.2026) – ohne DOM, damit er sich prüfen lässt (tests/touchGesten.test.ts).
 *
 * Die Schwellen folgen den Vorgaben von Apple und der WCAG (recherche/mobile-bedienung-2026-09-30.md):
 *  - Langer Druck: 0,5 s, abgebrochen ab 10 Punkten Bewegung (UILongPressGestureRecognizer).
 *  - Antippen: kurz und ohne nennenswerte Bewegung; zwei davon rasch hintereinander = Doppeltippen.
 *  - Wischen: deutlich waagerecht, weit genug und zügig – sonst war es Rollen.
 */

export const LANGER_DRUCK_MS = 500
export const BEWEGUNG_PX = 10
export const DOPPELTIPP_MS = 350
export const DOPPELTIPP_PX = 24
export const WISCHEN_PX = 80
export const WISCHEN_MS = 700
/** Wischen vom linken Rand öffnet die Programmliste */
export const RAND_PX = 24

export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 3

export interface Punkt {
  x: number
  y: number
}

export const abstand = (a: Punkt, b: Punkt): number => Math.hypot(a.x - b.x, a.y - b.y)

/** Hat sich der Finger so weit bewegt, dass es kein Drücken/Tippen mehr ist? */
export const bewegt = (start: Punkt, jetzt: Punkt): boolean => abstand(start, jetzt) > BEWEGUNG_PX

/** Ein Tipp: kurz und (fast) ohne Bewegung */
export const istTipp = (start: Punkt, ende: Punkt, dauerMs: number): boolean => dauerMs < 300 && !bewegt(start, ende)

/** Zweiter Tipp kurz nach dem ersten, an (fast) derselben Stelle */
export function istDoppeltipp(vorher: (Punkt & { zeit: number }) | null, jetzt: Punkt & { zeit: number }): boolean {
  if (!vorher) return false
  return jetzt.zeit - vorher.zeit <= DOPPELTIPP_MS && abstand(vorher, jetzt) <= DOPPELTIPP_PX
}

/**
 * Richtung eines Wischens – oder null, wenn es keins war.
 * 'vor' = nach links gewischt (der nächste Schritt kommt von rechts), 'zurueck' = nach rechts.
 */
export function wischRichtung(dx: number, dy: number, dauerMs: number): 'vor' | 'zurueck' | null {
  if (dauerMs > WISCHEN_MS) return null
  if (Math.abs(dx) < WISCHEN_PX) return null
  // Deutlich waagerecht: höchstens halb so viel senkrecht wie waagerecht
  if (Math.abs(dy) > Math.abs(dx) / 2) return null
  return dx < 0 ? 'vor' : 'zurueck'
}

/** Zoom in den erlaubten Grenzen, auf zwei Stellen gerundet */
export function zoomBegrenzen(z: number, min = ZOOM_MIN, max = ZOOM_MAX): number {
  if (!Number.isFinite(z)) return 1
  return Math.round(Math.min(max, Math.max(min, z)) * 100) / 100
}

/** Zoom während des Aufziehens mit zwei Fingern */
export function pinchZoom(startZoom: number, startAbstand: number, abstandJetzt: number, min = ZOOM_MIN, max = ZOOM_MAX): number {
  if (startAbstand <= 0) return zoomBegrenzen(startZoom, min, max)
  return zoomBegrenzen(startZoom * (abstandJetzt / startAbstand), min, max)
}

/** Nächste Zoomstufe für die Knöpfe „+" und „–" */
export function zoomSchritt(z: number, richtung: 1 | -1, min = ZOOM_MIN, max = ZOOM_MAX): number {
  const stufen = [0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 1.75, 2, 2.5, 3].filter((s) => s >= min && s <= max)
  if (richtung > 0) return stufen.find((s) => s > z + 0.001) ?? max
  return [...stufen].reverse().find((s) => s < z - 0.001) ?? min
}

const normal = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * Text des Hinweises beim langen Druck: die Beschreibung eines Knopfes – aber nur, wenn sie
 * mehr sagt als die Aufschrift selbst („Speichern" auf einem Knopf „Speichern" hilft niemandem).
 */
export function tippText(beschreibung: string | null | undefined, aufschrift: string | null | undefined): string | null {
  const b = (beschreibung ?? '').trim()
  if (!b) return null
  const a = normal(aufschrift ?? '')
  if (a && normal(b) === a) return null
  return b
}

/**
 * Wie viel der Bildschirmtastatur über der Seite liegt.
 * Im Browser schrumpft nur der sichtbare Bereich (visualViewport), die Seite nicht. In der App
 * schrumpft das ganze Fenster (Keyboard resize: native) – dann ist der Wert 0.
 * Kleine Unterschiede (Leiste mit Wortvorschlägen allein, Rundung) zählen nicht.
 */
export function tastaturHoehe(fensterHoehe: number, sichtHoehe: number, sichtOben: number): number {
  const h = Math.round(fensterHoehe - sichtHoehe - sichtOben)
  return h > 60 ? h : 0
}

/** Liegt ein Feld (ganz oder teilweise) außerhalb des sichtbaren Bereichs über der Tastatur? */
export function verdeckt(feld: { top: number; bottom: number }, sichtOben: number, sichtUnten: number, rand = 12): boolean {
  return feld.bottom > sichtUnten - rand || feld.top < sichtOben + rand
}

/**
 * Stift oder Finger (Apple Pencil, recherche/mobile-bedienung-2026-09-30.md): Auf Zeichenflächen
 * zeichnet der Stift (und die Maus), der Finger rollt und zoomt – außer die Lehrkraft hat
 * „Mit dem Finger zeichnen" gewählt. Für Zeichenflächen gedacht (`e.pointerType` des Pointer-Ereignisses).
 */
export function zeichnetZeiger(pointerType: string, fingerZeichnet = false): boolean {
  if (pointerType === 'pen' || pointerType === 'mouse') return true
  return pointerType === 'touch' ? fingerZeichnet : false
}
