/**
 * Tauziehen (Versus): zwei Seiten (1:1, 2:2; bei drei Personen gleicht ein Bot aus). Jede Person bekommt Fragen aus
 * ihrem EIGENEN Band (Handicap), jede richtige Antwort zieht das Seil nach Schwierigkeit gewichtet. Wer zurückliegt,
 * zieht etwas stärker (Aufholen). Ziel: Seil ganz auf die eigene Seite; nach drei Minuten gewinnt, wer vorn liegt.
 */
import { antwortRichtig, basisNeu, fehlerMerken, frageBlock, gewicht, gut, melde, rueckBlock, teamName, teamsAus, versusErgebnis, zufall, type Block, type Regeln } from '../kern'
import { frageItems, leereFragen, naechsteFrage, spaeterNochmal, type MitFragen } from './hilfen'

const ZIEL = 12
const DAUER_MS = 3 * 60_000
const BOT_TAKT: Record<string, number> = { leicht: 9000, mittel: 7000, schwer: 6000, unmoeglich: 5000 }

interface Z extends MitFragen {
  teams: [string[], string[]]
  bot: 0 | 1 | null
  seil: number
  tiefst: [number, number]
  botNaechster: number
  bis: number
}

export const tauziehen: Regeln<Z> = {
  id: 'tauziehen',
  passt: (i) => (frageItems(i.items) >= 6 ? null : 'Braucht mindestens sechs Wörter bzw. Aufgaben.'),
  start(k) {
    const b = basisNeu(k)
    const teams = teamsAus(k.spieler)
    const bot = teams[0].length !== teams[1].length ? (teams[0].length < teams[1].length ? 0 : 1) : null
    const z: Z = { ...b, ...leereFragen(b), teams, bot, seil: 0, tiefst: [0, 0], botNaechster: k.jetzt + BOT_TAKT[k.schwierigkeit], bis: k.jetzt + DAUER_MS }
    for (const s of k.spieler) naechsteFrage(z, s.id)
    return z
  },
  zug(z, wer, zug) {
    if (z.ende || zug.aktion !== 'antwort') return
    const f = z.fragen[wer]
    if (!f) return
    const seite = z.teams[0].includes(wer) ? 0 : 1
    if (antwortRichtig(f, zug.wert)) {
      const hinten = seite === 0 ? z.seil <= -6 : z.seil >= 6
      const p = gewicht(z, wer, f.itemId) + (hinten ? 1 : 0)
      gut(z, wer, p)
      ziehen(z, seite, p)
      melde(z, wer, true, `zieht mit ${p}!`)
    } else {
      fehlerMerken(z, wer, f.itemId)
      spaeterNochmal(z, wer, f.itemId)
      melde(z, wer, false, 'daneben.', f.loesung)
    }
    naechsteFrage(z, wer)
  },
  tick(z, jetzt) {
    if (z.ende) return false
    if (jetzt >= z.bis) {
      z.ende = true
      return true
    }
    if (z.bot !== null && jetzt >= z.botNaechster) {
      z.botNaechster = jetzt + BOT_TAKT[z.schwierigkeit]
      if (zufall(z) < 0.75) {
        ziehen(z, z.bot, 2)
        return true
      }
    }
    return false
  },
  sicht(z, wer) {
    const seite = z.teams[0].includes(wer) ? 0 : 1
    const links = teamName(z, z.teams[0]) + (z.bot === 0 ? ' & Bot' : '')
    const rechts = teamName(z, z.teams[1]) + (z.bot === 1 ? ' & Bot' : '')
    const b: Block[] = [
      { typ: 'seil', wert: z.seil, ziel: ZIEL, links, rechts },
      { typ: 'text', text: `Du ziehst nach ${seite === 0 ? 'links' : 'rechts'}.`, ton: 'leise' },
      { typ: 'uhr', bis: z.bis },
      ...rueckBlock(z)
    ]
    if (!z.ende && z.fragen[wer]) b.push(frageBlock(z.fragen[wer]!))
    return b
  },
  ergebnis(z) {
    const sieger = z.seil < 0 ? z.teams[0] : z.seil > 0 ? z.teams[1] : []
    const comeback = z.seil < 0 ? z.tiefst[0] >= 5 : z.seil > 0 ? z.tiefst[1] >= 5 : false
    return versusErgebnis(
      z,
      sieger,
      (id) => z.punkte[id] ?? 0,
      sieger.length ? `Gewonnen hat: ${teamName(z, sieger)}` : z.seil === 0 && z.bot !== null ? 'Unentschieden!' : 'Unentschieden!',
      { comeback, unentschieden: !sieger.length }
    )
  }
}

function ziehen(z: Z, seite: 0 | 1, p: number): void {
  z.seil = Math.max(-ZIEL, Math.min(ZIEL, z.seil + (seite === 0 ? -p : p)))
  // Größter Rückstand je Seite (für „Comeback-Sieg")
  z.tiefst = [Math.max(z.tiefst[0], z.seil), Math.max(z.tiefst[1], -z.seil)]
  if (Math.abs(z.seil) >= ZIEL) z.ende = true
}
