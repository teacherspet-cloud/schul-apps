/**
 * Fluchtraum (Kooperativ): 3–4 Schlösser. Je Schloss löst jede Person eine eigene Teilaufgabe (andere Fragenart als
 * die Nachbarn) und sieht dann NUR ihre Ziffer. Den Code setzt das Team zusammen (Ziffern in der Reihenfolge der
 * Plätze) – dafür muss man miteinander reden. Gemeinsame Uhr (nicht bei „leicht" und nicht in Klasse 5–6).
 */
import { aktive, antwortRichtig, basisNeu, fehlerMerken, frageAus, frageBlock, gut, itemsZiehen, koopErgebnis, melde, name, rueckBlock, zufall, type Basis, type Block, type FragenArt, type Regeln } from '../kern'
import { istFrageItem } from '../inhalt'
import type { Frage } from '../typen'
import { frageItems } from './hilfen'

const ZEIT_MS = 10 * 60_000

interface Schloss {
  ziffern: Record<string, number>
  geloest: Record<string, boolean>
  aufgaben: Record<string, Frage | null>
  offen: boolean
}
interface Z extends Basis {
  schloesser: Schloss[]
  s: number
  fehlversuche: number
  bis: number | null
  entkommen: boolean
  vorrat: string[]
  dauer: number
}

const ARTEN: FragenArt[] = ['abrufen', 'erkennen', 'luecke', 'standard']

function aufgabeFuer(z: Z, wer: string, s: number): Frage | null {
  if (!z.vorrat.length) z.vorrat = itemsZiehen(z, 16, { filter: istFrageItem }).map((i) => i.id)
  const platz = z.spieler.findIndex((p) => p.id === wer)
  const art = z.inhalt.bereich === 'gram' ? 'standard' : ARTEN[(platz + s) % 3]
  // Lückensatz nur mit Beispielsatz
  const k = z.vorrat.findIndex((id) => art !== 'luecke' || z.inhalt.items.find((i) => i.id === id)?.vok?.luecke)
  const id = z.vorrat.splice(k >= 0 ? k : 0, 1)[0]
  const item = z.inhalt.items.find((i) => i.id === id)
  return item ? frageAus(z, item, art === 'luecke' && !item.vok?.luecke ? 'abrufen' : art) : null
}

function schlossNeu(z: Z, s: number): Schloss {
  const sch: Schloss = { ziffern: {}, geloest: {}, aufgaben: {}, offen: false }
  for (const p of aktive(z)) {
    sch.ziffern[p.id] = 1 + Math.floor(zufall(z) * 9)
    sch.geloest[p.id] = false
    sch.aufgaben[p.id] = aufgabeFuer(z, p.id, s)
  }
  return sch
}

const code = (z: Z, sch: Schloss): string =>
  z.spieler
    .filter((p) => p.id in sch.ziffern && !z.weg.includes(p.id))
    .map((p) => sch.ziffern[p.id])
    .join('')

export const fluchtraum: Regeln<Z> = {
  id: 'fluchtraum',
  passt: (i) => (frageItems(i.items) >= 6 ? null : 'Braucht mindestens sechs Wörter bzw. Aufgaben.'),
  start(k) {
    const b = basisNeu(k)
    const n = b.schwierigkeit === 'leicht' || b.schwierigkeit === 'mittel' ? 3 : 4
    const z: Z = { ...b, schloesser: [], s: 0, fehlversuche: 0, bis: b.zeitdruck ? k.jetzt + ZEIT_MS : null, entkommen: false, vorrat: [], dauer: 0 }
    for (let s = 0; s < n; s++) z.schloesser.push(schlossNeu(z, s))
    return z
  },
  zug(z, wer, zug, jetzt) {
    if (z.ende) return
    const sch = z.schloesser[z.s]
    if (zug.aktion === 'antwort') {
      const f = sch.aufgaben[wer]
      if (!f || sch.geloest[wer]) return
      if (antwortRichtig(f, zug.wert)) {
        sch.geloest[wer] = true
        gut(z, wer)
        return melde(z, wer, true, 'hat eine Ziffer gefunden.')
      }
      fehlerMerken(z, wer, f.itemId)
      melde(z, wer, false, 'Nicht ganz – hier ist eine neue Aufgabe.', f.loesung)
      sch.aufgaben[wer] = aufgabeFuer(z, wer, z.s)
      return
    }
    if (zug.aktion === 'code') {
      if (!Object.entries(sch.geloest).every(([id, g]) => g || z.weg.includes(id))) return
      if (String(zug.wert ?? '').replace(/\D/g, '') !== code(z, sch)) {
        z.fehlversuche++
        return melde(z, wer, false, 'Der Code stimmt nicht. Vergleicht eure Ziffern und die Reihenfolge!')
      }
      sch.offen = true
      melde(z, wer, true, `Schloss ${z.s + 1} ist offen!`)
      z.s++
      if (z.s >= z.schloesser.length) {
        z.entkommen = true
        z.ende = true
        z.dauer = Math.round((jetzt - z.start) / 1000)
      }
    }
  },
  tick(z, jetzt) {
    if (z.ende || !z.bis || jetzt < z.bis) return false
    z.ende = true
    melde(z, '', false, 'Die Zeit ist abgelaufen.')
    return true
  },
  sicht(z, wer) {
    const b: Block[] = [{ typ: 'fortschritt', titel: `Schloss ${Math.min(z.s + 1, z.schloesser.length)} von ${z.schloesser.length}`, wert: z.s, max: z.schloesser.length }]
    if (z.bis && !z.ende) b.push({ typ: 'uhr', bis: z.bis, text: 'Gemeinsame Zeit' })
    b.push(...rueckBlock(z))
    if (z.ende) return b
    const sch = z.schloesser[z.s]
    const reihenfolge = z.spieler.filter((p) => p.id in sch.ziffern && !z.weg.includes(p.id))
    const stelle = reihenfolge.findIndex((p) => p.id === wer) + 1
    if (sch.geloest[wer]) b.push({ typ: 'text', text: `Deine Ziffer: ${sch.ziffern[wer]} – sie steht an Stelle ${stelle} des Codes.`, ton: 'gut', gross: true })
    else if (sch.aufgaben[wer]) b.push(frageBlock(sch.aufgaben[wer]!))
    b.push({
      typ: 'kacheln',
      titel: 'Reihenfolge des Codes',
      kacheln: reihenfolge.map((p, k) => ({ id: p.id, text: `${k + 1}. ${name(z, p.id)}`, status: sch.geloest[p.id] ? 'gut' : 'aus' }))
    })
    const alle = reihenfolge.every((p) => sch.geloest[p.id])
    b.push({ typ: 'code', stellen: reihenfolge.length, aktion: 'code', gesperrt: !alle })
    if (z.fehlversuche) b.push({ typ: 'text', text: `Fehlversuche am Code: ${z.fehlversuche}`, ton: 'leise' })
    return b
  },
  weg(z, wer) {
    const sch = z.schloesser[z.s]
    if (sch) sch.geloest[wer] = true
  },
  ergebnis: (z) =>
    koopErgebnis(
      z,
      z.entkommen,
      z.entkommen ? z.dauer : null,
      z.entkommen ? `Entkommen in ${Math.floor(z.dauer / 60)}:${String(z.dauer % 60).padStart(2, '0')} Minuten!` : 'Diesmal hat die Zeit nicht gereicht.',
      z.entkommen && z.fehlversuche === 0
    )
}
