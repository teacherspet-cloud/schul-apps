/**
 * Größe, Lage und Maximierung des Fensters merken.
 *
 * Wunsch der Lehrkraft (25.09.2026): Das Fenster ging bei jedem Start wieder mit 1400×900 in
 * der Bildschirmmitte auf, auch wer es jedes Mal maximiert oder auf den zweiten Bildschirm
 * gezogen hatte.
 *
 * Der gemerkte Stand wird beim Start auf einen SICHTBAREN Bildschirm begrenzt: Ist der
 * zweite Bildschirm nicht mehr angeschlossen oder die Auflösung kleiner geworden, ginge das
 * Fenster sonst außerhalb auf – unerreichbar für jemanden, der Tastenkürzel zum Verschieben
 * nicht kennt.
 *
 * Diese Datei kennt Electron nicht, damit sich die Begrenzung ohne Fenster prüfen lässt
 * (tests/fensterStand.test.ts).
 */

export interface Rechteck {
  x: number
  y: number
  width: number
  height: number
}

export interface FensterStand {
  /** Größe und Lage im NICHT maximierten Zustand */
  bounds: Rechteck
  maximiert: boolean
}

export const STANDARD_GROESSE = { width: 1400, height: 900 }
export const MINDEST_GROESSE = { width: 1000, height: 700 }

/**
 * Erste Größe ohne gemerkten Stand (05.10.2026, Wunsch der Lehrkraft: „Lass sie sich als Fenster öffnen,
 * das nicht den ganzen Bildschirm belegt"): höchstens 85 % der Arbeitsfläche, mittig. Auf einem kleinen
 * Laptop-Bildschirm füllte 1400 × 900 sonst praktisch alles aus.
 */
export function startGroesse(flaeche: Rechteck | undefined): Rechteck | typeof STANDARD_GROESSE {
  if (!flaeche) return STANDARD_GROESSE
  const width = Math.round(Math.min(STANDARD_GROESSE.width, flaeche.width * 0.85))
  const height = Math.round(Math.min(STANDARD_GROESSE.height, flaeche.height * 0.85))
  return { x: Math.round(flaeche.x + (flaeche.width - width) / 2), y: Math.round(flaeche.y + (flaeche.height - height) / 2), width, height }
}

/** Liest einen gespeicherten Stand; alles Unplausible gilt als „nichts gemerkt". */
export function leseStand(roh: unknown): FensterStand | null {
  if (!roh || typeof roh !== 'object') return null
  const r = roh as { bounds?: Partial<Rechteck>; maximiert?: unknown }
  const b = r.bounds
  if (!b || ![b.x, b.y, b.width, b.height].every((v) => typeof v === 'number' && Number.isFinite(v))) return null
  if ((b.width as number) < 200 || (b.height as number) < 200) return null
  return { bounds: { x: b.x!, y: b.y!, width: b.width!, height: b.height! }, maximiert: r.maximiert === true }
}

const ueberlappung = (a: Rechteck, b: Rechteck): number =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))

/**
 * Begrenzt den Stand auf die Arbeitsflächen der angeschlossenen Bildschirme.
 *
 * Gewählt wird der Bildschirm, auf dem das Fenster zuletzt am meisten lag. Liegt es auf
 * keinem mehr, kommt es mittig auf den ersten (Haupt-)Bildschirm. Größer als die Arbeitsfläche
 * wird es nie, und es liegt immer vollständig darauf.
 */
export function begrenzeStand(stand: FensterStand | null, flaechen: Rechteck[]): FensterStand | null {
  if (!flaechen.length) return stand
  const haupt = flaechen[0]
  if (!stand) return null
  let ziel = haupt
  let best = 0
  for (const f of flaechen) {
    const u = ueberlappung(stand.bounds, f)
    if (u > best) {
      best = u
      ziel = f
    }
  }
  const width = Math.min(Math.max(stand.bounds.width, Math.min(MINDEST_GROESSE.width, ziel.width)), ziel.width)
  const height = Math.min(Math.max(stand.bounds.height, Math.min(MINDEST_GROESSE.height, ziel.height)), ziel.height)
  const x = best > 0 ? Math.min(Math.max(stand.bounds.x, ziel.x), ziel.x + ziel.width - width) : Math.round(ziel.x + (ziel.width - width) / 2)
  const y = best > 0 ? Math.min(Math.max(stand.bounds.y, ziel.y), ziel.y + ziel.height - height) : Math.round(ziel.y + (ziel.height - height) / 2)
  return { bounds: { x, y, width, height }, maximiert: stand.maximiert }
}
