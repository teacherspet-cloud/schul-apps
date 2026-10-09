/**
 * Wort-Bingo (Versus): Jede Person hat ihr eigenes Feld (4×4, bei kleinen Kursen 3×3) mit deutschen Bedeutungen –
 * ausgewählt nach dem eigenen Band (Handicap). Die App ruft Wörter in der Fremdsprache auf; wer die Bedeutung im Feld
 * hat, tippt sie an. Eine volle Reihe, Spalte oder Diagonale ist Bingo; es geht weiter um Platz 2 und 3.
 * Ein Aufruf endet, wenn alle, die ihn haben, getippt haben – oder nach Ablauf der Zeit (ohne Zeitdruck: erst, wenn
 * alle „Weiter" gedrückt haben).
 * 09.10.2026 (Lehrkraft): ab Klasse 7 einsprachig – im Feld stehen die Wörter der Fremdsprache, aufgerufen wird eine
 * Umschreibung in der Zielsprache (Synonym aus dem Kurs oder der Beispielsatz mit Lücke); fehlt beides, die Bedeutung.
 */
import { aktive, basisNeu, fehlerMerken, gut, itemsZiehen, melde, mischen, name, rueckBlock, tx, versusErgebnis, type Basis, type Block, type Regeln } from '../kern'
import { normiert } from '../../grammatiktrainer'
import type { SpielItem } from '../typen'

const RUFZEIT: Record<string, number> = { leicht: 15000, mittel: 12000, schwer: 10000, unmoeglich: 8000 }

interface Z extends Basis {
  groesse: number
  felder: Record<string, string[]>
  markiert: Record<string, boolean[]>
  rufe: string[]
  ruf: number
  rufBis: number
  weiter: string[]
  plaetze: Record<string, number>
  bingoNach: Record<string, number>
  /** Ab Klasse 7: Wörter im Feld, Umschreibung als Aufruf */
  einsprachig: boolean
}

/** Umschreibung eines Wortes in der Zielsprache (ohne das Wort selbst); null = keine im Kurs */
export function umschreibung(z: Basis, i: SpielItem): string | null {
  const v = i.vok
  if (!v) return null
  const w = normiert(v.term)
  const syn = z.inhalt.synonyme.find((g) => g.woerter.some((x) => normiert(x) === w))?.woerter.find((x) => normiert(x) !== w)
  if (syn) return tx(z, 'hSynonym', syn)
  if (v.luecke) return tx(z, 'hLuecke', `${v.luecke.vor}___${v.luecke.nach}`)
  return null
}

function linien(n: number): number[][] {
  const l: number[][] = []
  for (let i = 0; i < n; i++) {
    l.push(Array.from({ length: n }, (_, j) => i * n + j))
    l.push(Array.from({ length: n }, (_, j) => j * n + i))
  }
  l.push(Array.from({ length: n }, (_, j) => j * n + j))
  l.push(Array.from({ length: n }, (_, j) => j * n + (n - 1 - j)))
  return l
}
const hatBingo = (m: boolean[], n: number): boolean => linien(n).some((l) => l.every((i) => m[i]))

function naechsterRuf(z: Z, jetzt: number): void {
  // Wer den Aufruf im Feld hatte und nicht getippt hat: verpasst
  const alt = z.rufe[z.ruf]
  if (alt)
    for (const s of aktive(z)) {
      const i = z.felder[s.id].indexOf(alt)
      if (i >= 0 && !z.markiert[s.id][i]) fehlerMerken(z, s.id, alt)
    }
  z.ruf++
  z.weiter = []
  z.rufBis = jetzt + RUFZEIT[z.schwierigkeit]
  const offen = aktive(z).filter((s) => !z.plaetze[s.id])
  if (z.ruf >= z.rufe.length || offen.length <= 1 || Object.keys(z.plaetze).length >= 3) z.ende = true
}

export const bingo: Regeln<Z> = {
  id: 'bingo',
  passt: (i) => (i.items.filter((x) => x.vok).length >= 9 ? null : 'Braucht mindestens neun Wörter.'),
  start(k) {
    const b = basisNeu(k)
    const vok = k.inhalt.items.filter((i) => i.vok)
    const groesse = vok.length >= 20 ? 4 : 3
    const einsprachig = k.jahrgang !== null && k.jahrgang >= 7
    const z: Z = { ...b, groesse, felder: {}, markiert: {}, rufe: [], ruf: -1, rufBis: 0, weiter: [], plaetze: {}, bingoNach: {}, einsprachig }
    // Einsprachig: möglichst Wörter mit Umschreibung (reichen sie für ein Feld)
    const mitUmschreibung = vok.filter((i) => umschreibung(z, i))
    const filter = einsprachig && mitUmschreibung.length >= groesse * groesse + 2 ? (i: SpielItem) => Boolean(i.vok && umschreibung(z, i)) : (i: SpielItem) => Boolean(i.vok)
    const alle = new Set<string>()
    for (const s of k.spieler) {
      const ids = [...new Set(itemsZiehen(z, groesse * groesse * 2, { fuer: s.id, filter }).map((i) => i.id))].slice(0, groesse * groesse)
      z.felder[s.id] = mischen(z, ids)
      z.markiert[s.id] = ids.map(() => false)
      ids.forEach((id) => alle.add(id))
    }
    z.rufe = mischen(z, [...alle])
    naechsterRuf(z, k.jetzt)
    return z
  },
  zug(z, wer, zug, jetzt) {
    if (z.ende) return
    if (zug.aktion === 'weiter') {
      if (!z.weiter.includes(wer)) z.weiter.push(wer)
      // Wer schon Bingo hat, muss nicht mehr „weiter“ drücken (09.10.2026: sonst hing die Runde)
      if (aktive(z).filter((s) => !z.plaetze[s.id]).every((s) => z.weiter.includes(s.id))) naechsterRuf(z, jetzt)
      return
    }
    if (zug.aktion !== 'feld' || z.plaetze[wer]) return
    const i = Number(zug.wert)
    const feld = z.felder[wer]
    if (!feld || !Number.isInteger(i) || i < 0 || i >= feld.length || z.markiert[wer][i]) return
    const ruf = z.rufe[z.ruf]
    if (feld[i] !== ruf) {
      fehlerMerken(z, wer, ruf)
      fehlerMerken(z, wer, feld[i])
      return melde(z, wer, false, tx(z, 'nichtGerufen'))
    }
    z.markiert[wer][i] = true
    gut(z, wer)
    if (hatBingo(z.markiert[wer], z.groesse)) {
      const platz = Object.keys(z.plaetze).length + 1
      z.plaetze[wer] = platz
      z.bingoNach[wer] = z.ruf + 1
      melde(z, wer, true, platz === 1 ? tx(z, 'bingo') : tx(z, 'auchBingo', platz))
    }
    // Alle, die den Aufruf haben, haben getippt → weiter
    const haben = aktive(z).filter((s) => !z.plaetze[s.id] || s.id === wer).filter((s) => z.felder[s.id].includes(ruf))
    if (haben.every((s) => z.markiert[s.id][z.felder[s.id].indexOf(ruf)])) naechsterRuf(z, jetzt)
  },
  tick(z, jetzt) {
    if (z.ende || !z.zeitdruck || jetzt < z.rufBis) return false
    naechsterRuf(z, jetzt)
    return true
  },
  sicht(z, wer) {
    const ruf = z.inhalt.items.find((i) => i.id === z.rufe[z.ruf])
    const b: Block[] = [{ typ: 'fortschritt', titel: tx(z, 'aufrufVon', Math.min(z.ruf + 1, z.rufe.length), z.rufe.length), wert: z.ruf, max: z.rufe.length }, ...rueckBlock(z)]
    if (!z.ende && ruf) {
      if (z.einsprachig) b.push({ typ: 'text', text: umschreibung(z, ruf) ?? ruf.vok!.translation, gross: true, ton: 'info' })
      else {
        b.push({ typ: 'text', text: ruf.vok!.term, gross: true, ton: 'info' })
        b.push({ typ: 'vorlesen', text: ruf.vok!.term, sprache: z.inhalt.sprache })
      }
      if (z.zeitdruck) b.push({ typ: 'uhr', bis: z.rufBis })
    }
    const feld = z.felder[wer] ?? []
    b.push({
      typ: 'kacheln',
      titel: z.plaetze[wer] ? tx(z, 'bingoPlatz', z.plaetze[wer]) : tx(z, 'deinFeld'),
      spalten: z.groesse,
      kacheln: feld.map((id, i) => ({
        id: String(i),
        text: (z.einsprachig ? z.inhalt.items.find((x) => x.id === id)?.vok?.term : z.inhalt.items.find((x) => x.id === id)?.vok?.translation) ?? '',
        ...(z.markiert[wer]?.[i] ? { status: 'markiert' as const } : {})
      })),
      ...(z.ende || z.plaetze[wer] ? {} : { aktion: 'feld' })
    })
    if (!z.ende && !z.zeitdruck)
      b.push({ typ: 'knoepfe', knoepfe: [{ text: z.weiter.includes(wer) ? tx(z, 'warteAndere') : tx(z, 'nichtImFeld'), aktion: 'weiter', gesperrt: z.weiter.includes(wer) }] })
    const bingos = Object.entries(z.plaetze).sort((a, c) => a[1] - c[1])
    if (bingos.length) b.push({ typ: 'text', text: tx(z, 'bingoListe', bingos.map(([id, p]) => `${p}. ${name(z, id)}`).join(' · ')), ton: 'leise' })
    return b
  },
  ergebnis(z) {
    const erste = Object.entries(z.plaetze).find(([, p]) => p === 1)?.[0]
    return versusErgebnis(z, erste ? [erste] : [], (id) => z.bingoNach[id] ?? null, erste ? tx(z, 'bingoErste', name(z, erste)) : tx(z, 'keinBingo'), {
      plaetze: z.plaetze,
      unentschieden: !erste
    })
  }
}
