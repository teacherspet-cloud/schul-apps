/**
 * Rückgängig und Wiederholen – ein gemeinsamer Verlauf für alle Programme.
 *
 * Anlass: Rückgängig gab es nur im Arbeitsblatt-Editor und im Vokabeltest, jeweils eigens
 * gebaut. In der Gliederung, der Lernzielkontrolle, dem Grammatiktest und der Klassenarbeit
 * war ein entfernter Baustein oder ein neu erzeugter Test unwiederbringlich weg. Die
 * Lehrkraft hat Rückfragen vor dem Überschreiben bewusst abgewählt (25.09.2026) – umso mehr
 * muss jeder solche Schritt mit Strg+Z zurückzuholen sein.
 *
 * Diese Datei kennt weder React noch einen Speicher: Sie rechnet nur mit Ständen. Die Stores
 * der Programme legen ihren Verlauf damit an; die Unit-Tests prüfen sie ohne Oberfläche.
 */

export interface Verlauf<T> {
  /** Frühere Stände, der jüngste zuletzt */
  past: T[]
  /** Rückgängig gemachte Stände, der nächste zuerst */
  future: T[]
  /** Kennung der laufenden Gruppe (Tippen in einem Feld, Ziehen, Schieberegler) */
  gruppe: string | null
  /** Zeitpunkt der letzten Änderung in dieser Gruppe (ms) */
  zuletzt: number
}

/** So viele Schritte lassen sich zurückgehen – wie bisher im Arbeitsblatt und im Vokabeltest. */
export const VERLAUF_GRENZE = 60

/**
 * So lange nach der letzten Änderung setzt dieselbe Gruppe den Schritt noch fort.
 *
 * Wer in ein Feld tippt, will mit Strg+Z nicht Buchstabe für Buchstabe zurück, sondern das
 * Getippte als Ganzes. Nach einer Pause beginnt ein neuer Schritt – sonst verschwände mit
 * einem Druck alles, was über Minuten in dasselbe Feld geschrieben wurde. Ein Zug mit der
 * Maus liefert laufend Ereignisse und bleibt deshalb sicher innerhalb des Fensters.
 */
export const GRUPPEN_FENSTER_MS = 4000

export const leererVerlauf = <T>(): Verlauf<T> => ({ past: [], future: [], gruppe: null, zuletzt: 0 })

/**
 * Vor einer Änderung: den bisherigen Stand ablegen.
 *
 * Mit `gruppe` bilden aufeinanderfolgende Änderungen derselben Gruppe EINEN Schritt – beim
 * Ziehen eines Bausteins kommt sonst für jede Mausbewegung ein Eintrag, und nach sechzig
 * Pixeln wäre der Verlauf voll (so war es bis 25.09.2026).
 */
export function merke<T>(v: Verlauf<T>, vorher: T, gruppe: string | null = null, jetzt = Date.now(), grenze = VERLAUF_GRENZE): Verlauf<T> {
  if (gruppe && v.gruppe === gruppe && jetzt - v.zuletzt <= GRUPPEN_FENSTER_MS && v.past.length) {
    // Derselbe Schritt geht weiter: Der Stand VOR der Gruppe liegt schon im Verlauf
    return { ...v, future: [], zuletzt: jetzt }
  }
  return { past: [...v.past, vorher].slice(-grenze), future: [], gruppe, zuletzt: jetzt }
}

/** Die laufende Gruppe beenden – die nächste Änderung wird ein eigener Schritt. */
export const schliesseGruppe = <T>(v: Verlauf<T>): Verlauf<T> => (v.gruppe ? { ...v, gruppe: null } : v)

/** Einen Schritt zurück. `null`, wenn es nichts zurückzunehmen gibt. */
export function rueckgaengig<T>(v: Verlauf<T>, aktuell: T): { verlauf: Verlauf<T>; stand: T } | null {
  if (!v.past.length) return null
  return {
    stand: v.past[v.past.length - 1],
    verlauf: { past: v.past.slice(0, -1), future: [aktuell, ...v.future], gruppe: null, zuletzt: 0 }
  }
}

/** Einen zurückgenommenen Schritt wiederholen. `null`, wenn keiner da ist. */
export function wiederholen<T>(v: Verlauf<T>, aktuell: T): { verlauf: Verlauf<T>; stand: T } | null {
  if (!v.future.length) return null
  return {
    stand: v.future[0],
    verlauf: { past: [...v.past, aktuell], future: v.future.slice(1), gruppe: null, zuletzt: 0 }
  }
}

export type VerlaufsTaste = 'undo' | 'redo'

/**
 * Welche Verlaufstaste wurde gedrückt?
 *
 * Strg+Z zurück, Strg+Y und Strg+Umschalt+Z wiederholen – die zweite Form kennen viele aus
 * anderen Programmen, und vorher tat sie hier stillschweigend dasselbe wie Strg+Z.
 */
export function verlaufsTaste(e: { key: string; ctrlKey: boolean; metaKey?: boolean; shiftKey: boolean; altKey: boolean }): VerlaufsTaste | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null
  const k = e.key.toLowerCase()
  if (k === 'z') return e.shiftKey ? 'redo' : 'undo'
  if (k === 'y' && !e.shiftKey) return 'redo'
  return null
}

/** Eingabefelder, in denen Strg+Z dem Feld gehört (Text zurücknehmen), nicht dem Blatt. */
const TEXT_TYPEN = new Set(['', 'text', 'search', 'number', 'email', 'url', 'tel', 'password'])

/**
 * Gehört die Taste dem Feld, in dem gerade geschrieben wird?
 *
 * Ein Häkchen oder ein Schalter hat den Fokus nach dem Anklicken ebenfalls – dort soll
 * Strg+Z trotzdem das Blatt zurücknehmen. Nur wo wirklich Text entsteht, bleibt die Taste
 * beim Feld.
 */
export function schreibfeld(ziel: EventTarget | null): boolean {
  const el = ziel as HTMLElement | null
  if (!el || typeof el.tagName !== 'string') return false
  if (el.isContentEditable) return true
  if (el.tagName === 'TEXTAREA') return !(el as HTMLTextAreaElement).readOnly
  if (el.tagName === 'INPUT') {
    const input = el as HTMLInputElement
    return !input.readOnly && TEXT_TYPEN.has((input.getAttribute('type') ?? '').toLowerCase())
  }
  return Boolean(el.closest?.('[contenteditable]:not([contenteditable="false"])'))
}
