/**
 * Team-Match (Kooperativ, Quizlet-Live-Prinzip): Alle sehen die Frage, die Möglichkeiten sind auf die Geräte verteilt –
 * die richtige liegt nur auf EINEM. Gemeinsame Herzen: Ein falscher Tipp kostet eines; sind alle weg, wird die Lösung
 * gezeigt, die Herzen füllen sich wieder auf, das Team-Ziel ist dann verfehlt („weiche" Leben).
 */
import { ablenkerFuer, ablenkerStufe, aktive, basisNeu, fehlerMerken, gut, itemsZiehen, melde, mischen, rueckBlock, koopErgebnis, tx, type Basis, type Block, type Regeln } from '../kern'
import { istFrageItem } from '../inhalt'
import { frageItems } from './hilfen'

const HERZEN = 3

interface Z extends Basis {
  reihe: string[]
  i: number
  verteilung: Record<string, string[]>
  korrekt: string
  herzen: number
  leer: boolean
  geloest: number
  frage: string
  zusatz?: string
}

function runde(z: Z): void {
  if (z.i >= z.reihe.length) return void (z.ende = true)
  const item = z.inhalt.items.find((x) => x.id === z.reihe[z.i])!
  const leicht = z.schwierigkeit === 'leicht' && item.vok
  z.frage = leicht ? item.vok!.term : item.frage
  z.zusatz = leicht ? tx(z, 'wasBedeutet') : item.vok ? tx(z, 'wieHeisst') : item.zusatz
  z.korrekt = leicht ? item.vok!.translation : item.loesung
  const spieler = aktive(z).map((s) => s.id)
  const je = 3
  // Ab Klasse 7 verwechselbare Ablenker (gleiche Wortart, ähnliche Länge), ab Klasse 9 auch ähnliche Schreibung (09.10.2026)
  const ablenker = ablenkerFuer(
    z,
    z.korrekt,
    item.ablenker,
    leicht ? (x) => x.vok?.translation : (x) => (istFrageItem(x) ? x.loesung : undefined),
    je * spieler.length - 1,
    { stufe: ablenkerStufe(z), pos: item.vok?.pos }
  )
  const alle = mischen(z, [z.korrekt, ...ablenker])
  z.verteilung = Object.fromEntries(z.spieler.map((s) => [s.id, [] as string[]]))
  alle.forEach((o, k) => z.verteilung[spieler[k % spieler.length]].push(o))
}

export const teammatch: Regeln<Z> = {
  id: 'teammatch',
  passt: (i) => (frageItems(i.items) >= 6 ? null : 'Braucht mindestens sechs Wörter bzw. Aufgaben.'),
  start(k) {
    const b = basisNeu(k)
    const n = b.schwierigkeit === 'leicht' ? 10 : 12
    const z: Z = { ...b, reihe: [], i: 0, verteilung: {}, korrekt: '', herzen: HERZEN, leer: false, geloest: 0, frage: '' }
    z.reihe = itemsZiehen(z, n, { filter: istFrageItem }).map((x) => x.id)
    runde(z)
    return z
  },
  zug(z, wer, zug) {
    if (z.ende || zug.aktion !== 'antwort') return
    const meine = z.verteilung[wer] ?? []
    const wert = String(zug.wert ?? '')
    if (!meine.includes(wert)) return
    const id = z.reihe[z.i]
    if (wert === z.korrekt) {
      gut(z, wer, 1)
      z.geloest++
      melde(z, wer, true, tx(z, 'richtig'), z.korrekt)
      z.i++
      return runde(z)
    }
    fehlerMerken(z, wer, id)
    z.verteilung[wer] = meine.filter((o) => o !== wert)
    z.herzen--
    if (z.herzen > 0) return melde(z, wer, false, tx(z, 'passtNicht', wert))
    z.leer = true
    melde(z, wer, false, tx(z, 'keineHerzen'), z.korrekt)
    z.herzen = HERZEN
    z.i++
    runde(z)
  },
  sicht(z, wer) {
    const b: Block[] = [
      { typ: 'fortschritt', titel: tx(z, 'frageVon', Math.min(z.i + 1, z.reihe.length), z.reihe.length), wert: z.i, max: z.reihe.length },
      { typ: 'text', text: `${'♥'.repeat(z.herzen)}${'♡'.repeat(HERZEN - z.herzen)} ${tx(z, 'herzen')}`, ton: 'info' },
      ...rueckBlock(z)
    ]
    if (z.ende) return b
    const meine = z.verteilung[wer] ?? []
    b.push({ typ: 'frage', frage: z.frage, ...(z.zusatz ? { zusatz: z.zusatz } : {}), optionen: meine, aktion: 'antwort' })
    b.push({ typ: 'text', text: tx(z, 'nurEinGeraet'), ton: 'leise' })
    return b
  },
  weg(z, wer) {
    const rest = aktive(z).map((s) => s.id)
    const seine = z.verteilung[wer] ?? []
    z.verteilung[wer] = []
    seine.forEach((o, k) => rest.length && z.verteilung[rest[k % rest.length]].push(o))
  },
  ergebnis: (z) =>
    koopErgebnis(z, !z.leer, z.geloest, z.leer ? tx(z, 'tmLeer', z.geloest, z.reihe.length) : tx(z, 'tmGeschafft', z.geloest, z.reihe.length))
}
