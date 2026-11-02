/**
 * Tauziehen & Rennen (Teams, 02.11.2026): 2 Teams ziehen am Seil, 3–6 Teams laufen auf Bahnen.
 *
 * Jede richtige Antwort bringt das eigene Team voran – geschriebene (Stufe 3–4) doppelt. Gezählt wird JE TEAMMITGLIED
 * (Summe ÷ Teamgröße), damit kleine Teams nicht im Nachteil sind. Weil jede:r Aufgaben auf dem eigenen Niveau bekommt
 * (adaptiv), trägt jedes Mitglied gleich viel bei – das ist die Idee der Verbesserungspunkte (Slavin, STAD).
 * Ende: ein Team erreicht das Ziel oder die Zeit läuft ab (dann gewinnt das weitere Team).
 *
 * FAUSTREGEL: Ziel = 2,5 Schritte je Mitglied und Minute × 0,8.
 */
import { levelNachZeit, meldung, teamGroesse, teamText, type BBlock, type KBasis, type KlassenRegeln } from '../kern'
import { kt } from '../texte'

export interface Rennen extends KBasis {
  /** Schritte je Team (Summe, nicht normiert) */
  schritte: number[]
  ziel: number
  fuehrung: number
}

export const zielFuer = (z: KBasis): number => Math.max(8, Math.round(z.einst.dauer * 2.5 * 0.8))
export const stand = (z: Rennen, nr: number): number => z.schritte[nr] / teamGroesse(z, nr)

const fuehrend = (z: Rennen): number[] => {
  const werte = z.teams.map((_, i) => stand(z, i))
  const max = Math.max(...werte)
  return werte.map((w, i) => (Math.abs(w - max) < 1e-9 ? i : -1)).filter((i) => i >= 0)
}

export const rennen: KlassenRegeln<Rennen> = {
  id: 'rennen',
  start(z) {
    return Object.assign(z, { schritte: z.teams.map(() => 0), ziel: zielFuer(z), fuehrung: -1 })
  },
  nachAntwort(z, wer, a, richtig, _p, jetzt) {
    const t = z.personen[wer]?.team ?? -1
    if (!richtig || t < 0) return
    while (z.schritte.length < z.teams.length) z.schritte.push(0)
    z.schritte[t] += a.stufe >= 3 ? 2 : 1
    if (z.einst.schwierigkeit === 'level') z.level = levelNachZeit(z, jetzt)
    const vorn = fuehrend(z)
    if (vorn.length === 1 && vorn[0] !== z.fuehrung) {
      z.fuehrung = vorn[0]
      if (z.verlauf.length > 6) meldung(z, kt(z.sprache, 'fuehrt', teamText(z, vorn[0])), 'info')
    }
    if (stand(z, t) >= z.ziel) {
      z.ende = true
      meldung(z, kt(z.sprache, 'imZiel', teamText(z, t)), 'gut')
    }
  },
  tick(z, jetzt) {
    if (z.einst.schwierigkeit !== 'level') return false
    const l = levelNachZeit(z, jetzt)
    if (l === z.level) return false
    z.level = l
    return true
  },
  beamer(z) {
    const zwei = z.teams.length === 2
    const aus: BBlock[] = [
      {
        typ: 'bahnen',
        seil: zwei,
        zielText: kt(z.sprache, 'reZiel', z.ziel),
        teams: z.teams.map((t, i) => ({ name: kt(z.sprache, 'team', t.name), farbe: t.farbe, symbol: t.symbol, wert: Math.round(stand(z, i) * 10) / 10, ziel: z.ziel, n: teamGroesse(z, i) }))
      }
    ]
    return aus
  },
  geraet(z, wer) {
    const t = z.personen[wer]?.team ?? -1
    if (t < 0) return []
    const team = z.teams[t]
    if (z.teams.length === 2) {
      const ich = stand(z, t)
      const andere = stand(z, 1 - t)
      return [{ typ: 'seil', wert: Math.max(-z.ziel, Math.min(z.ziel, ich - andere)), ziel: z.ziel, links: `${team.symbol} ${team.name}`, rechts: `${z.teams[1 - t].symbol} ${z.teams[1 - t].name}` }]
    }
    return [{ typ: 'fortschritt', titel: teamText(z, t), wert: Math.min(z.ziel, stand(z, t)), max: z.ziel, ton: 'info' }]
  },
  ergebnis(z) {
    const vorn = fuehrend(z)
    const teams = z.teams.map((t, i) => ({ nr: i, name: t.name, farbe: t.farbe, symbol: t.symbol, wert: Math.round(stand(z, i) * 10) / 10 }))
    const text = vorn.length === 1 ? kt(z.sprache, 'gewinnt', teamText(z, vorn[0])) : kt(z.sprache, 'unentschieden', vorn.map((i) => teamText(z, i)).join(' & '))
    const gesamt = z.schritte.reduce((s, x) => s + x, 0)
    return { text, teams, siegerTeams: vorn, klassenwert: gesamt, klassenwertText: kt(z.sprache, 'reSchritte', gesamt) }
  }
}
