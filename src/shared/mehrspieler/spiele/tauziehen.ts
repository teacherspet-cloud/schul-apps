/**
 * Tauziehen (Versus): zwei Seiten (1:1, 2:2; bei drei Personen gleicht ein Bot aus). Jede Person bekommt Fragen aus
 * ihrem EIGENEN Band (Handicap), jede richtige Antwort zieht das Seil nach Schwierigkeit gewichtet. Wer zurückliegt,
 * zieht etwas stärker (Aufholen). Ziel: Seil ganz auf die eigene Seite; nach drei Minuten gewinnt, wer vorn liegt.
 * 09.10.2026 (Lehrkraft): ab „schwer" mehrteilige Aufgaben – zwei (unmöglich: drei, Klasse 5–6 höchstens zwei) Fragen
 * hintereinander richtig, dann zieht die Summe; ein Fehler macht die Aufgabe ungültig.
 */
import { antwortRichtig, basisNeu, fehlerMerken, frageBlock, gewicht, gut, melde, rueckBlock, teamName, teamsAus, tx, versusErgebnis, zufall, type Basis, type Block, type Regeln } from '../kern'
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
  /** Mehrteilige Aufgaben: Teile je Aufgabe, gelöste Teile und gesammelte Punkte je Person */
  teile: number
  stand: Record<string, { n: number; p: number }>
}

export const teileJeAufgabe = (z: Basis): number =>
  z.schwierigkeit === 'unmoeglich' ? (z.jahrgang !== null && z.jahrgang <= 6 ? 2 : 3) : z.schwierigkeit === 'schwer' ? 2 : 1

export const tauziehen: Regeln<Z> = {
  id: 'tauziehen',
  passt: (i) => (frageItems(i.items) >= 6 ? null : 'Braucht mindestens sechs Wörter bzw. Aufgaben.'),
  start(k) {
    const b = basisNeu(k)
    const teams = teamsAus(k.spieler)
    const bot = teams[0].length !== teams[1].length ? (teams[0].length < teams[1].length ? 0 : 1) : null
    const z: Z = { ...b, ...leereFragen(b), teams, bot, seil: 0, tiefst: [0, 0], botNaechster: k.jetzt + BOT_TAKT[k.schwierigkeit], bis: k.jetzt + DAUER_MS, teile: 1, stand: {} }
    z.teile = teileJeAufgabe(z)
    for (const s of k.spieler) z.stand[s.id] = { n: 0, p: 0 }
    for (const s of k.spieler) naechsteFrage(z, s.id)
    return z
  },
  zug(z, wer, zug) {
    if (z.ende || zug.aktion !== 'antwort') return
    const f = z.fragen[wer]
    if (!f) return
    const seite = z.teams[0].includes(wer) ? 0 : 1
    const st = (z.stand[wer] ??= { n: 0, p: 0 })
    if (antwortRichtig(f, zug.wert)) {
      st.n++
      st.p += gewicht(z, wer, f.itemId)
      if (st.n < z.teile) melde(z, wer, true, tx(z, 'teilRichtig', st.n, z.teile))
      else {
        const hinten = seite === 0 ? z.seil <= -6 : z.seil >= 6
        const p = st.p + (hinten ? 1 : 0)
        z.stand[wer] = { n: 0, p: 0 }
        gut(z, wer, p)
        ziehen(z, seite, p)
        melde(z, wer, true, tx(z, 'ziehtMit', p))
      }
    } else {
      z.stand[wer] = { n: 0, p: 0 }
      fehlerMerken(z, wer, f.itemId)
      spaeterNochmal(z, wer, f.itemId)
      melde(z, wer, false, tx(z, 'daneben'), f.loesung)
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
      { typ: 'text', text: tx(z, seite === 0 ? 'duZiehstLinks' : 'duZiehstRechts'), ton: 'leise' },
      { typ: 'uhr', bis: z.bis },
      ...rueckBlock(z)
    ]
    if (!z.ende && z.fragen[wer]) {
      if (z.teile > 1) b.push({ typ: 'fortschritt', titel: tx(z, 'teilVon', (z.stand[wer]?.n ?? 0) + 1, z.teile), wert: z.stand[wer]?.n ?? 0, max: z.teile, ton: 'info' })
      b.push(frageBlock(z.fragen[wer]!))
    }
    return b
  },
  ergebnis(z) {
    const sieger = z.seil < 0 ? z.teams[0] : z.seil > 0 ? z.teams[1] : []
    const comeback = z.seil < 0 ? z.tiefst[0] >= 5 : z.seil > 0 ? z.tiefst[1] >= 5 : false
    return versusErgebnis(
      z,
      sieger,
      (id) => z.punkte[id] ?? 0,
      sieger.length ? tx(z, 'gewonnenHat', teamName(z, sieger)) : tx(z, 'unentschieden'),
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
