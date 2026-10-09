/**
 * Beschreib-Raten (Kooperativ, ohne Achievements): Eine Person sieht das Wort und wählt 2–3 Hinweiskarten (aus den
 * Daten, ohne Übersetzung: Wortart, Anfangs-/Endbuchstabe, Länge, Beispielsatz mit Lücke, Gegenteil aus der Notiz).
 * Die anderen raten aus Möglichkeiten. Die Rollen wechseln reihum.
 */
import { aktive, basisNeu, fehlerMerken, gut, itemsZiehen, koopErgebnis, melde, mischen, name, naechste, rueckBlock, ablenkerFuer, tx, type Basis, type Block, type Regeln } from '../kern'
import { spielText, wortartVon } from '../../spielSprache'
import type { SpielItem } from '../typen'

interface Hinweis {
  id: string
  text: string
}
interface Z extends Basis {
  reihe: string[]
  r: number
  erklaerer: number
  hinweise: Hinweis[]
  gewaehlt: string[] | null
  optionen: string[]
  raus: string[]
  erraten: number
}

/** Hinweiskarten in der Zielsprache des Kurses (09.10.2026); ohne Sprache Englisch */
export function hinweiseFuer(i: SpielItem, sprache = 'en', jahrgang: number | null = null): Hinweis[] {
  const v = i.vok
  if (!v) return []
  const s = (k: Parameters<typeof spielText>[2], ...w: (string | number)[]): string => spielText(sprache, jahrgang, k, ...w)
  const t = v.term
  const aus: Hinweis[] = []
  const art = wortartVon(v.pos)
  if (art) aus.push({ id: 'wortart', text: s(art === 'nomen' ? 'hNomen' : art === 'verb' ? 'hVerb' : art === 'adj' ? 'hAdj' : 'hAdv') })
  else if (v.pos) aus.push({ id: 'wortart', text: s('bWortart', v.pos.replace(/[()[\]]/g, '')) })
  aus.push({ id: 'anfang', text: s('bAnfang', t[0]) })
  aus.push({ id: 'ende', text: s('bEnde', t[t.length - 1]) })
  const n = t.replace(/\s/g, '').length
  aus.push({ id: 'laenge', text: /\s/.test(t) ? s('bLaengeWoerter', n, t.split(/\s+/).length) : s('bLaenge', n) })
  if (v.luecke) aus.push({ id: 'beispiel', text: `${v.luecke.vor}___${v.luecke.nach}` })
  const gegen = /(?:opp\.?|↔|Gegenteil:?)\s*([\p{L}' -]{2,30})/u.exec(v.note ?? '')
  if (gegen) aus.push({ id: 'gegenteil', text: s('bGegenteil', gegen[1].trim()) })
  return aus
}

function runde(z: Z): void {
  if (z.r >= z.reihe.length) return void (z.ende = true)
  const item = z.inhalt.items.find((i) => i.id === z.reihe[z.r])!
  z.hinweise = hinweiseFuer(item, z.inhalt.sprache, z.jahrgang)
  z.gewaehlt = null
  z.raus = []
  z.optionen = mischen(z, [item.vok!.term, ...ablenkerFuer(z, item.vok!.term, [], (x) => x.vok?.term, 3)])
}

const erklaererId = (z: Z): string => z.spieler[z.erklaerer]?.id ?? ''

export const beschreiben: Regeln<Z> = {
  id: 'beschreiben',
  passt: (i) => (i.items.filter((x) => x.vok).length >= 6 ? null : 'Braucht mindestens sechs Wörter.'),
  start(k) {
    const b = basisNeu(k)
    const z: Z = { ...b, reihe: [], r: 0, erklaerer: 0, hinweise: [], gewaehlt: null, optionen: [], raus: [], erraten: 0 }
    z.reihe = itemsZiehen(z, Math.min(8, k.spieler.length * 2), { filter: (i) => Boolean(i.vok) }).map((i) => i.id)
    runde(z)
    return z
  },
  zug(z, wer, zug) {
    if (z.ende) return
    const item = z.inhalt.items.find((i) => i.id === z.reihe[z.r])!
    if (zug.aktion === 'hinweise' && wer === erklaererId(z) && !z.gewaehlt) {
      const ids = (Array.isArray(zug.wert) ? zug.wert : []).map(String).filter((id) => z.hinweise.some((h) => h.id === id))
      if (ids.length < 1 || ids.length > 3) return
      z.gewaehlt = [...new Set(ids)]
      return
    }
    if (zug.aktion !== 'antwort' || !z.gewaehlt || wer === erklaererId(z) || z.raus.includes(wer)) return
    const wert = String(zug.wert ?? '')
    if (!z.optionen.includes(wert)) return
    const weiter = (): void => {
      z.r++
      z.erklaerer = naechste(z, z.spieler.map((s) => s.id), z.erklaerer)
      runde(z)
    }
    if (wert === item.vok!.term) {
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
        b.push({ typ: 'kacheln', titel: tx(z, 'bWaehle'), kacheln: z.hinweise.map((h) => ({ id: h.id, text: h.text })), mehrfach: 3, senden: 'hinweise' })
      else b.push({ typ: 'text', text: tx(z, 'bAndereRaten'), ton: 'leise' })
      return b
    }
    b.push({ typ: 'text', text: tx(z, 'bErklaert', name(z, erklaererId(z))), ton: 'leise' })
    if (!z.gewaehlt) return [...b, { typ: 'text', text: tx(z, 'bWarteHinweise'), ton: 'leise' }]
    b.push({ typ: 'kacheln', titel: tx(z, 'bHinweise'), kacheln: z.hinweise.filter((h) => z.gewaehlt!.includes(h.id)).map((h) => ({ id: h.id, text: h.text })) })
    b.push({ typ: 'frage', frage: tx(z, 'bWelchesGemeint'), optionen: z.optionen, aktion: 'antwort', gesperrt: z.raus.includes(wer) })
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
