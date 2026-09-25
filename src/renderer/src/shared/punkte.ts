/**
 * Punktsummen auf einen Zielwert bringen, ohne die Gewichtung zu zerstören.
 *
 * Gemeinsam für Lernzielkontrolle (Spanne der Gesamtpunkte) und Klassenarbeit (Punkte je
 * Teil). Anlass (Paket 6, 25.09.2026): Die Punkte der KI gingen bis dahin auf dem gemeinsamen
 * Weg `convertBlock` verloren; seit sie ankommen, muss jedes Modul sie auf seine Vorgabe
 * bringen – und zwar mit derselben Rechnung, sonst rundet die eine App anders als die andere.
 */
import type { WsBlock } from '../modules/arbeitsblatt/model/types'

type Aufgabe = Extract<WsBlock, { type: 'task' }>

export const aufgabenIn = (blocks: WsBlock[]): Aufgabe[] => blocks.filter((b): b is Aufgabe => b.type === 'task')

/**
 * Hat die KI keiner Aufgabe Punkte gegeben, zählt die Zahl der Teilaufgaben als Aufwand –
 * der beste verfügbare Hinweis. Kam auch nur eine Punktzahl, bleibt alles stehen.
 */
export function punkteNachTeilaufgaben(aufgaben: Aufgabe[]): void {
  if (aufgaben.some((a) => a.points > 0)) return
  for (const a of aufgaben) a.points = Math.max(1, a.parts.length || 1)
}

/**
 * Skaliert die Punkte der Aufgaben auf genau `ziel`.
 *
 * Die Verhältnisse bleiben erhalten: Wer doppelt so viel Arbeit hat, bekommt weiterhin doppelt
 * so viele Punkte. Jede Aufgabe behält mindestens einen Punkt. Der Rundungsrest wandert auf
 * die umfangreichste Aufgabe – dort fällt ein Punkt mehr oder weniger am wenigsten ins Gewicht.
 */
export function skalierePunkte(aufgaben: Aufgabe[], ziel: number): void {
  const summe = aufgaben.reduce((s, a) => s + a.points, 0)
  if (summe <= 0 || ziel <= 0 || summe === ziel) return
  for (const a of aufgaben) a.points = Math.max(1, Math.round((a.points * ziel) / summe))
  const rest = ziel - aufgaben.reduce((s, a) => s + a.points, 0)
  if (rest !== 0) {
    const groesste = aufgaben.reduce((a, b) => (b.points > a.points ? b : a))
    groesste.points = Math.max(1, groesste.points + rest)
  }
}
