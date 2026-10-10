/**
 * Reine Regeln von „Lege das Wort" (09.10.2026 aus LegeEingabe.tsx herausgelöst, damit Tests sie prüfen können).
 */
export interface Kachel {
  b: string
  i: number
}

/** Ein selbst gesetztes Leerzeichen in `gelegt` (schwerste Stufe, 09.10.2026) – keine Kachel */
export const LEER = -1

/** Gelegte Buchstaben ohne die selbst gesetzten Leerzeichen */
export const nurBuchstaben = (gelegt: number[]): number[] => gelegt.filter((i) => i !== LEER)

/** Gelegtes als Text: Buchstaben der Kacheln, selbst gesetzte Leerzeichen als „ " */
export const gelegtText = (gelegt: number[], kacheln: Kachel[]): string =>
  gelegt.map((i) => (i === LEER ? ' ' : kacheln.find((k) => k.i === i)?.b ?? '')).join('')

/** Ein Leerzeichen anhängen – nie am Anfang und nie zwei hintereinander */
export const leerAnhaengen = (g: number[]): number[] => (!g.length || g[g.length - 1] === LEER ? g : [...g, LEER])

const gleich = (a: string, b: string): boolean => a.toLocaleLowerCase() === b.toLocaleLowerCase()

/**
 * Welches freie Plättchen ein getippter/geschriebener Buchstabe nimmt (10.10.2026, Befund der Lehrkraft: „i like" wurde
 * bei „I like …" zu „i lIke"). Früher gewann das Plättchen in der getippten Schreibung – das kleine „i" nahm das „i" aus
 * „like", und für „like" blieb nur das große „I". Gleiche Buchstaben in anderer Schreibung sind aber austauschbar:
 * Darum zuerst das Plättchen, das an DIESER Stelle der Lösung steht (`soll`, Groß/Klein wie in der Lösung), dann die
 * getippte Schreibung, dann irgendeine. Index in `frei`, -1 wenn keins passt.
 */
export function passendeKachel(frei: Kachel[], z: string, soll?: string): number {
  if (soll && gleich(soll, z)) {
    const k = frei.findIndex((x) => x.b === soll)
    if (k >= 0) return k
  }
  const genau = frei.findIndex((x) => x.b === z)
  return genau >= 0 ? genau : frei.findIndex((x) => gleich(x.b, z))
}

/**
 * Buchstaben eines Textes den freien Plättchen zuordnen (Groß/Klein egal); `fehlt`, wenn einer fehlt. Leerzeichen und
 * Apostrophe stehen schon im Wort – außer `mitLeer` (schwerste Stufe): Dann wird ein Leerzeichen zu LEER (nie doppelt,
 * nie am Anfang). `loesung`: die Buchstaben der Lösung der Reihe nach (ohne Leerzeichen/Apostrophe) – damit nimmt jeder
 * Buchstabe das Plättchen in der Schreibung seiner Stelle; `ab`: wie viele Buchstaben schon davor liegen.
 */
export function zuordnen(text: string, kacheln: Kachel[], mitLeer = false, loesung = '', ab = 0): { gelegt: number[]; fehlt?: string } {
  const frei = [...kacheln]
  const soll = [...loesung]
  const gelegt: number[] = []
  let n = ab
  for (const z of [...text]) {
    if (/\s/.test(z)) {
      if (mitLeer && gelegt.length && gelegt[gelegt.length - 1] !== LEER) gelegt.push(LEER)
      continue
    }
    // Apostrophe stehen schon im Wort
    if (/['’‘ʼ´`′]/.test(z)) continue
    const k = passendeKachel(frei, z, soll[n])
    if (k < 0) return { gelegt, fehlt: z }
    gelegt.push(frei[k].i)
    frei.splice(k, 1)
    n++
  }
  return { gelegt }
}

/**
 * Neuer Stand aus dem Tippfeld (09.10.2026). Leerzeichen, die das Feld von selbst zeigt, verbrauchen nichts und werden
 * nicht doppelt, wenn man sie selbst tippt. Löscht jemand nur so ein vorgegebenes Zeichen (Rücktaste direkt dahinter),
 * geht der Buchstabe davor mit – sonst ließe es sich nie löschen, weil das Feld es sofort wieder zeigte.
 */
export function tippStand(
  alt: { text: string; gelegt: number[] },
  neuText: string,
  kacheln: Kachel[],
  mitLeer = false,
  loesung = ''
): { gelegt: number[]; fehlt?: string } {
  const r = zuordnen(neuText, kacheln, mitLeer, loesung)
  if (r.fehlt) return r
  const geloescht = neuText.length < alt.text.length && alt.text.startsWith(neuText)
  if (geloescht && r.gelegt.length && r.gelegt.length === alt.gelegt.length) return { gelegt: r.gelegt.slice(0, -1) }
  return r
}

