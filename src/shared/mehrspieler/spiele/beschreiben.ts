/**
 * Beschreib-Raten (Kooperativ, ohne Achievements): Eine Person sieht das Wort und wählt Hinweiskarten (aus den Daten,
 * ohne Übersetzung). Die anderen raten. Die Rollen wechseln reihum.
 *
 * Schwerer seit 12.11.2026 (Befund der Lehrkraft „Describe it ist zu einfach", abgestimmt):
 * - Inhalts- statt Buchstabenhinweise: Wortart, Synonym, Gegenteil, Beispielsatz mit Lücke, Bild. Anfangs-/Endbuchstabe
 *   und Länge verrieten bei vier Möglichkeiten sofort das Wort; nur Klasse 5–6 behält den Anfangsbuchstaben als Joker
 *   (und ihn als Rückfall, wenn ein Wort sonst keine zwei Hinweise hätte).
 * - Höchstens zwei Hinweise statt drei.
 * - Schwerere Auswahl: die falschen Möglichkeiten sind ähnliche Wörter derselben Wortart.
 * - Ab Klasse 7 (in 5–6 ab „schwer") schreiben die Ratenden das Wort selbst (Tippfehler-tolerant wie überall).
 */
import { aktive, antwortRichtig, basisNeu, fehlerMerken, gut, itemsZiehen, koopErgebnis, melde, mischen, name, naechste, rueckBlock, ablenkerFuer, tx, type Basis, type Block, type Regeln } from '../kern'
import { spielText, wortartVon } from '../../spielSprache'
import type { Frage, SpielInhalt, SpielItem } from '../typen'
import { nachweisOhneLoesung } from '../../bildLizenz'
import { enthaeltWort, synonymVon } from './fluchtraum'

/** Höchstens so viele Hinweise je Wort */
export const MAX_HINWEISE = 2

interface Hinweis {
  id: string
  text: string
  bild?: string
  bildNachweis?: string
}
interface Z extends Basis {
  reihe: string[]
  r: number
  erklaerer: number
  hinweise: Hinweis[]
  gewaehlt: string[] | null
  optionen: string[]
  /** Ratende schreiben das Wort (ab Klasse 7, in 5–6 ab „schwer") */
  schreiben?: boolean
  raus: string[]
  erraten: number
}

/** Hinweiskarten in der Zielsprache des Kurses (09.10.2026); ohne Sprache Englisch. Klasse 5–6 mit Anfangsbuchstaben-Joker. */
export function hinweiseFuer(i: SpielItem, sprache = 'en', jahrgang: number | null = null, inhalt?: SpielInhalt): Hinweis[] {
  const v = i.vok
  if (!v) return []
  const s = (k: Parameters<typeof spielText>[2], ...w: (string | number)[]): string => spielText(sprache, jahrgang, k, ...w)
  const t = v.term
  const aus: Hinweis[] = []
  const art = wortartVon(v.pos)
  if (art) aus.push({ id: 'wortart', text: s(art === 'nomen' ? 'hNomen' : art === 'verb' ? 'hVerb' : art === 'adj' ? 'hAdj' : 'hAdv') })
  else if (v.pos) aus.push({ id: 'wortart', text: s('bWortart', v.pos.replace(/[()[\]]/g, '')) })
  const synonym = inhalt ? synonymVon(inhalt, t) : null
  if (synonym) aus.push({ id: 'synonym', text: s('hSynonym', synonym) })
  const gegen = /(?:opp\.?|↔|Gegenteil:?)\s*([\p{L}' -]{2,30})/u.exec(v.note ?? '')
  if (gegen) aus.push({ id: 'gegenteil', text: s('bGegenteil', gegen[1].trim()) })
  if (v.luecke) aus.push({ id: 'beispiel', text: `${v.luecke.vor}___${v.luecke.nach}` })
  if (v.bild) {
    const nw = nachweisOhneLoesung(v.bildNachweis, [v.term, v.translation])
    aus.push({ id: 'bild', text: s('hBild'), bild: v.bild, ...(nw ? { bildNachweis: nw } : {}) })
  }
  // Nie ein Hinweis, der das Wort selbst enthält
  const inhaltlich = aus.filter((h) => !enthaeltWort(h.text, t))
  const klein = jahrgang !== null && jahrgang <= 6
  if (klein || inhaltlich.length < 2) inhaltlich.push({ id: 'anfang', text: s('bAnfang', t[0]) })
  return inhaltlich
}

function runde(z: Z): void {
  if (z.r >= z.reihe.length) return void (z.ende = true)
  const item = z.inhalt.items.find((i) => i.id === z.reihe[z.r])!
  z.hinweise = hinweiseFuer(item, z.inhalt.sprache, z.jahrgang, z.inhalt)
  z.gewaehlt = null
  z.raus = []
  // Ähnliche Wörter derselben Wortart – die Form allein verrät das Wort nicht mehr
  z.optionen = z.schreiben ? [] : mischen(z, [item.vok!.term, ...ablenkerFuer(z, item.vok!.term, [], (x) => x.vok?.term, 3, { stufe: 2, pos: item.vok!.pos })])
}

const kachel = (h: Hinweis): { id: string; text: string; bild?: string; bildNachweis?: string } => ({
  id: h.id,
  text: h.text,
  ...(h.bild ? { bild: h.bild } : {}),
  ...(h.bildNachweis ? { bildNachweis: h.bildNachweis } : {})
})
const erklaererId = (z: Z): string => z.spieler[z.erklaerer]?.id ?? ''

export const beschreiben: Regeln<Z> = {
  id: 'beschreiben',
  passt: (i) => (i.items.filter((x) => x.vok).length >= 6 ? null : 'Braucht mindestens sechs Wörter.'),
  start(k) {
    const b = basisNeu(k)
    const schreiben = (k.jahrgang ?? 7) >= 7 || k.schwierigkeit === 'schwer' || k.schwierigkeit === 'unmoeglich'
    const z: Z = { ...b, reihe: [], r: 0, erklaerer: 0, hinweise: [], gewaehlt: null, optionen: [], schreiben, raus: [], erraten: 0 }
    z.reihe = itemsZiehen(z, Math.min(8, k.spieler.length * 2), { filter: (i) => Boolean(i.vok) }).map((i) => i.id)
    runde(z)
    return z
  },
  zug(z, wer, zug) {
    if (z.ende) return
    const item = z.inhalt.items.find((i) => i.id === z.reihe[z.r])!
    if (zug.aktion === 'hinweise' && wer === erklaererId(z) && !z.gewaehlt) {
      const ids = (Array.isArray(zug.wert) ? zug.wert : []).map(String).filter((id) => z.hinweise.some((h) => h.id === id))
      if (ids.length < 1 || ids.length > MAX_HINWEISE) return
      z.gewaehlt = [...new Set(ids)]
      return
    }
    if (zug.aktion !== 'antwort' || !z.gewaehlt || wer === erklaererId(z) || z.raus.includes(wer)) return
    const wert = String(zug.wert ?? '').slice(0, 100)
    if (!wert.trim() || (!z.schreiben && !z.optionen.includes(wert))) return
    const weiter = (): void => {
      z.r++
      z.erklaerer = naechste(z, z.spieler.map((s) => s.id), z.erklaerer)
      runde(z)
    }
    const f = { itemId: item.id, frage: '', optionen: z.optionen, loesung: item.vok!.term, ...(z.schreiben ? { tippen: true } : {}) } as Frage
    if (z.schreiben ? antwortRichtig(f, wert) : wert === item.vok!.term) {
      gut(z, wer)
      z.erraten++
      melde(z, wer, true, tx(z, 'bErraten'), item.vok!.term)
      return weiter()
    }
    fehlerMerken(z, wer, item.id)
    z.raus.push(wer)
    const rater = aktive(z).filter((s) => s.id !== erklaererId(z))
    if (rater.every((s) => z.raus.includes(s.id))) {
      melde(z, wer, false, tx(z, 'bNichtErraten'), `${item.vok!.term} (${item.vok!.translation})`)
      return weiter()
    }
    melde(z, wer, false, tx(z, 'bWarNicht', wert))
  },
  sicht(z, wer) {
    const b: Block[] = [{ typ: 'fortschritt', titel: tx(z, 'wortVon', Math.min(z.r + 1, z.reihe.length), z.reihe.length), wert: z.r, max: z.reihe.length }, ...rueckBlock(z)]
    if (z.ende) return b
    const item = z.inhalt.items.find((i) => i.id === z.reihe[z.r])!
    if (wer === erklaererId(z)) {
      b.push({ typ: 'text', text: tx(z, 'bDuErklaerst', item.vok!.term, item.vok!.translation), gross: true, ton: 'info' })
      if (!z.gewaehlt)
        b.push({ typ: 'kacheln', titel: tx(z, 'bWaehle'), kacheln: z.hinweise.map(kachel), mehrfach: MAX_HINWEISE, senden: 'hinweise' })
      else b.push({ typ: 'text', text: tx(z, 'bAndereRaten'), ton: 'leise' })
      return b
    }
    b.push({ typ: 'text', text: tx(z, 'bErklaert', name(z, erklaererId(z))), ton: 'leise' })
    if (!z.gewaehlt) return [...b, { typ: 'text', text: tx(z, 'bWarteHinweise'), ton: 'leise' }]
    b.push({ typ: 'kacheln', titel: tx(z, 'bHinweise'), kacheln: z.hinweise.filter((h) => z.gewaehlt!.includes(h.id)).map(kachel) })
    b.push({ typ: 'frage', frage: tx(z, 'bWelchesGemeint'), optionen: z.optionen, ...(z.schreiben ? { tippen: true } : {}), aktion: 'antwort', gesperrt: z.raus.includes(wer) })
    return b
  },
  weg(z, wer) {
    if (wer === erklaererId(z)) {
      z.erklaerer = naechste(z, z.spieler.map((s) => s.id), z.erklaerer)
      z.gewaehlt = null
    }
  },
  ergebnis: (z) => koopErgebnis(z, z.erraten >= Math.ceil(z.reihe.length / 2), z.erraten, tx(z, 'bErgebnis', z.erraten, z.reihe.length))
}
