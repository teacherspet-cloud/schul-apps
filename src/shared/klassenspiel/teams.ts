/**
 * Teams und Tische der Klassenspiele (02.11.2026).
 *
 * Abgestimmt: Teams werden AUSGEGLICHEN nach dem Lernstand gebildet, sollen auf die Lernenden aber ZUFÄLLIG wirken –
 * die Oberfläche zeigt nur eine Los-Animation und das Ergebnis, nie die Grundlage (θ) und nie eine Reihenfolge nach
 * Stärke. Namen und Farben werden zufällig vergeben.
 *
 * BELEGT: gemischte Teams mit Teamwertung über Einzelbeiträge (Slavin, STAD); Turnier-Tische mit Gleichstarken (TGT).
 * FAUSTREGEL: Schlangenzug nach θ, Gleichstarke (Abstand < 0,15) vorher gemischt; Tische zu dritt, Rest zu zweit.
 */
import { mischen } from '../mehrspieler/kern'

export interface TeamFarbe {
  name: string
  farbe: string
  symbol: string
}

/** Mantine-Farben und Symbole (sprachneutral) */
export const TEAM_FARBEN: TeamFarbe[] = [
  { name: 'Rot', farbe: 'red', symbol: '🦊' },
  { name: 'Blau', farbe: 'blue', symbol: '🐬' },
  { name: 'Grün', farbe: 'teal', symbol: '🐢' },
  { name: 'Gelb', farbe: 'yellow', symbol: '🐝' },
  { name: 'Lila', farbe: 'grape', symbol: '🦄' },
  { name: 'Orange', farbe: 'orange', symbol: '🐯' }
]

export interface Team {
  nr: number
  name: string
  farbe: string
  symbol: string
  mitglieder: string[]
}

interface MitTheta {
  id: string
  theta: number
}

/** Ausgeglichene Teams: Schlangenzug (A B C C B A …) über die nach θ sortierten Personen */
export function teamsBilden(personen: MitTheta[], anzahl: number, z: { saat: number }): Team[] {
  const n = Math.max(1, Math.min(TEAM_FARBEN.length, anzahl, personen.length || 1))
  // Gleichstarke mischen, damit gleiche Lernstände nicht immer gleich landen
  const sortiert = mischen(z, personen).sort((a, b) => (Math.abs(a.theta - b.theta) < 0.15 ? 0 : b.theta - a.theta))
  const listen: string[][] = Array.from({ length: n }, () => [])
  sortiert.forEach((p, i) => {
    const runde = Math.floor(i / n)
    const pos = i % n
    listen[runde % 2 ? n - 1 - pos : pos].push(p.id)
  })
  const farben = mischen(z, TEAM_FARBEN).slice(0, n)
  return listen.map((m, i) => ({ nr: i, name: farben[i].name, farbe: farben[i].farbe, symbol: farben[i].symbol, mitglieder: mischen(z, m) }))
}

/** Kleine Teams fester Größe (Team-Puzzle: 3–4 je Team; 2 nur, wenn es nicht anders geht) */
export function kleineTeams(personen: MitTheta[], z: { saat: number }): Team[] {
  const n = personen.length
  if (n <= 4) return teamsBilden(personen, 1, z)
  const anzahl = Math.max(2, Math.round(n / 3.5))
  // Mehr als 6 Teams: Farben wiederholen sich mit Nummer
  const teams = teamsBildenOhneGrenze(personen, anzahl, z)
  return teams
}

function teamsBildenOhneGrenze(personen: MitTheta[], anzahl: number, z: { saat: number }): Team[] {
  const sortiert = mischen(z, personen).sort((a, b) => (Math.abs(a.theta - b.theta) < 0.15 ? 0 : b.theta - a.theta))
  const listen: string[][] = Array.from({ length: anzahl }, () => [])
  sortiert.forEach((p, i) => {
    const runde = Math.floor(i / anzahl)
    const pos = i % anzahl
    listen[runde % 2 ? anzahl - 1 - pos : pos].push(p.id)
  })
  const farben = mischen(z, TEAM_FARBEN)
  return listen.map((m, i) => {
    const f = farben[i % farben.length]
    const zusatz = i >= farben.length ? ` ${Math.floor(i / farben.length) + 1}` : ''
    return { nr: i, name: `${f.name}${zusatz}`, farbe: f.farbe, symbol: f.symbol, mitglieder: mischen(z, m) }
  })
}

/** Wer später dazukommt: ins kleinste Team, bei Gleichstand ins schwächste (Summe θ) */
export function teamFuerNeue(teams: Team[], thetaVon: (id: string) => number): number {
  if (!teams.length) return -1
  const summe = (t: Team): number => t.mitglieder.reduce((s, id) => s + thetaVon(id), 0)
  return [...teams].sort((a, b) => a.mitglieder.length - b.mitglieder.length || summe(a) - summe(b))[0].nr
}

/** Tische unter Gleichstarken (TGT): nach θ sortiert, zu dritt, der Rest zu zweit; Tischnamen zufällig verteilt */
export function tischeBilden(personen: MitTheta[], z: { saat: number }): string[][] {
  const sortiert = mischen(z, personen).sort((a, b) => b.theta - a.theta)
  const n = sortiert.length
  if (n <= 3) return [sortiert.map((p) => p.id)]
  // Größen: so viele Dreier wie möglich, Rest 1 → zwei Zweier, Rest 2 → ein Zweier
  const groessen: number[] = []
  let rest = n
  while (rest > 0) {
    if (rest === 4) groessen.push(2, 2), (rest = 0)
    else if (rest === 2) groessen.push(2), (rest = 0)
    else groessen.push(3), (rest -= 3)
  }
  const tische: string[][] = []
  let i = 0
  for (const g of groessen) {
    tische.push(sortiert.slice(i, i + g).map((p) => p.id))
    i += g
  }
  return tische
}

/**
 * Umsetzen nach einer Turnierrunde („bumping", Slavin): Tischsieger:in rückt einen Tisch nach oben, wer zuletzt ist,
 * einen nach unten. `tische` ist von stark (0) nach schwach sortiert; `rang` = Platz je Person am eigenen Tisch (1 = vorn).
 */
export function umsetzen(tische: string[][], rang: Record<string, number>): string[][] {
  const neu = tische.map((t) => [...t])
  for (let i = 0; i < tische.length; i++) {
    const t = tische[i]
    if (t.length < 2) continue
    const sieger = t.find((id) => rang[id] === 1)
    const letzter = [...t].sort((a, b) => (rang[b] ?? 0) - (rang[a] ?? 0))[0]
    if (sieger && i > 0) {
      neu[i] = neu[i].filter((x) => x !== sieger)
      neu[i - 1].push(sieger)
    }
    if (letzter && letzter !== sieger && i < tische.length - 1) {
      neu[i] = neu[i].filter((x) => x !== letzter)
      neu[i + 1].unshift(letzter)
    }
  }
  // Tische ausgleichen (keiner unter 2, keiner über 4)
  for (let i = 0; i < neu.length; i++) {
    while (neu[i].length > 4 && i + 1 < neu.length) neu[i + 1].unshift(neu[i].pop()!)
    while (neu[i].length > 4 && i > 0) neu[i - 1].push(neu[i].shift()!)
  }
  for (let i = neu.length - 1; i >= 0; i--) {
    if (neu[i].length >= 2 || neu.length === 1) continue
    const ziel = i > 0 ? i - 1 : i + 1
    neu[ziel].push(...neu[i])
    neu.splice(i, 1)
  }
  return neu.filter((t) => t.length)
}
