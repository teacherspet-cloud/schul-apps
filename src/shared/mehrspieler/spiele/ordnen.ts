/**
 * Gemeinsam ordnen (Kooperativ): Die Teile einer Lösung liegen verteilt auf den Geräten, das Team legt sie in die
 * gemeinsame Reihe. Satzbaustelle (Sätze aus Wörtern), Bildergeschichte (Bilder nach der Wortfolge), Übersetzungs-
 * Puzzle (mit Fallen, die nicht dazugehören) und Zeitstrahl (Sätze nach ihrer Zeit, danach die Zeitform nennen).
 */
import { abstand, aktive, ablenkerStufe, basisNeu, eines, fehlerMerken, gut, itemsZiehen, koopErgebnis, melde, mischen, rueckBlock, tx, type Basis, type Block, type Regeln, type StartKontext } from '../kern'
import type { TextSchluessel } from '../../spielSprache'
import { ordnenGelegt, ordnenLegen, ordnenNeu, ordnenUmverteilen, type Ordnen } from './hilfen'
import type { MehrspielId, SpielInhalt } from '../typen'

export interface OrdnenRunde {
  itemIds: string[]
  hinweis: string
  teile: { text: string; wert?: string; bild?: string; falle?: boolean }[]
  /** Zeitstrahl: nach dem Ordnen je Teil die Zeitform nennen */
  benennen?: { text: string; loesung: string; optionen: string[]; itemId: string }[]
  /** Lösung als Text für die Rückmeldung */
  loesung: string
}

interface Z extends Basis {
  runden: OrdnenRunde[]
  r: number
  o: Ordnen
  fehlerZahl: number
  /** Zeitstrahl: welche Benennung gerade dran ist, und wer sie bekommt */
  b: number
  bWer: string
}

function rundeStarten(z: Z): void {
  if (z.r >= z.runden.length) return void (z.ende = true)
  z.o = ordnenNeu(z, z.runden[z.r].teile, aktive(z).map((s) => s.id))
  z.b = -1
}

export function ordnenSpiel(cfg: {
  id: MehrspielId
  passt: (i: SpielInhalt) => string | null
  runden: (z: Basis, k: StartKontext) => OrdnenRunde[]
  titel: TextSchluessel
  zielFehler?: number
}): Regeln<Z> {
  return {
    id: cfg.id,
    passt: cfg.passt,
    start(k) {
      const b = basisNeu(k)
      const z: Z = { ...b, runden: [], r: 0, o: { kacheln: [], ziel: [], gelegt: [] }, fehlerZahl: 0, b: -1, bWer: '' }
      z.runden = cfg.runden(z, k)
      rundeStarten(z)
      return z
    },
    zug(z, wer, zug) {
      if (z.ende) return
      const runde = z.runden[z.r]
      if (z.b >= 0 && runde.benennen) {
        if (zug.aktion !== 'antwort' || wer !== z.bWer) return
        const ben = runde.benennen[z.b]
        if (String(zug.wert) === ben.loesung) {
          gut(z, wer)
          melde(z, wer, true, tx(z, 'richtigDoppel', ben.loesung))
        } else {
          z.fehlerZahl++
          fehlerMerken(z, wer, ben.itemId)
          melde(z, wer, false, tx(z, 'nichtGanz'), ben.loesung)
        }
        z.b++
        if (z.b >= runde.benennen.length) {
          z.r++
          return rundeStarten(z)
        }
        z.bWer = eines(z, aktive(z)).id
        return
      }
      if (zug.aktion !== 'legen') return
      const e = ordnenLegen(z.o, wer, String(zug.wert ?? ''))
      if (!e) return
      if (e === 'falsch') {
        z.fehlerZahl++
        for (const id of runde.itemIds) fehlerMerken(z, wer, id)
        return melde(z, wer, false, tx(z, 'passtNochNicht'))
      }
      gut(z, wer)
      if (e === 'richtig') return melde(z, wer, true, tx(z, 'passt'))
      melde(z, wer, true, tx(z, 'fertig'), runde.loesung)
      if (runde.benennen?.length) {
        z.b = 0
        z.bWer = eines(z, aktive(z)).id
        return
      }
      z.r++
      rundeStarten(z)
    },
    sicht(z, wer) {
      const runde = z.runden[Math.min(z.r, z.runden.length - 1)]
      const b: Block[] = [
        { typ: 'fortschritt', titel: tx(z, 'vonN', tx(z, cfg.titel), Math.min(z.r + 1, z.runden.length), z.runden.length), wert: z.r, max: z.runden.length },
        ...rueckBlock(z)
      ]
      if (z.ende || !runde) return b
      b.push({ typ: 'text', text: runde.hinweis, gross: true })
      if (runde.teile.some((t) => t.falle)) b.push({ typ: 'text', text: tx(z, 'nichtJedesTeil'), ton: 'leise' })
      b.push({ typ: 'reihe', titel: tx(z, 'gemeinsameReihe'), teile: ordnenGelegt(z.o), leer: z.o.ziel.length - z.o.gelegt.length })
      if (z.b >= 0 && runde.benennen) {
        const ben = runde.benennen[z.b]
        if (wer === z.bWer) b.push({ typ: 'frage', frage: ben.text, zusatz: tx(z, 'welcheZeitform'), optionen: ben.optionen, aktion: 'antwort' })
        else b.push({ typ: 'text', text: tx(z, 'nenntZeitform', z.spieler.find((s) => s.id === z.bWer)?.name ?? tx(z, 'jemand'), ben.text), ton: 'leise' })
        return b
      }
      const meine = z.o.kacheln.filter((k) => k.besitzer === wer && !k.gelegt)
      b.push({
        typ: 'kacheln',
        titel: meine.length ? tx(z, 'deineTeile') : tx(z, 'keineTeile'),
        kacheln: meine.map((k) => ({ id: k.id, text: k.text, ...(k.bild ? { bild: k.bild } : {}) })),
        aktion: 'legen'
      })
      return b
    },
    weg(z, wer) {
      ordnenUmverteilen(
        z.o,
        wer,
        aktive(z).map((s) => s.id)
      )
      if (z.bWer === wer && aktive(z).length) z.bWer = aktive(z)[0].id
    },
    ergebnis(z) {
      const ziel = cfg.zielFehler ?? 2
      return koopErgebnis(
        z,
        z.fehlerZahl <= ziel,
        z.fehlerZahl,
        z.fehlerZahl === 0 ? tx(z, 'fehlerfreiGebaut') : z.fehlerZahl === 1 ? tx(z, 'mitEinemFehler') : tx(z, 'mitFehlern', z.fehlerZahl),
        z.fehlerZahl === 0
      )
    }
  }
}

const mitSatz = (i: SpielInhalt): number => i.items.filter((x) => x.satz && x.satz.length >= 3).length

/**
 * Fallen-Wörter für die Satzbaustelle nach Klasse (09.10.2026): ab Klasse 7 eins, ab Klasse 9 zwei – aus anderen
 * Sätzen des Kurses, möglichst verwechselbar (ähnliche Länge, gleicher Anfang, ab Klasse 9 ähnliche Schreibung).
 */
function fallenWoerter(z: Basis, satz: string[], n: number): string[] {
  if (n <= 0) return []
  const kernW = (w: string): string => w.replace(/[^\p{L}']/gu, '').toLowerCase()
  const drin = new Set(satz.map(kernW))
  const andere = [...new Set(z.inhalt.items.flatMap((i) => i.satz ?? []))].filter((w) => kernW(w) && !drin.has(kernW(w)))
  const nah = (w: string): number =>
    Math.min(
      ...satz.map((s) => {
        const a = s.replace(/[^\p{L}']/gu, '').toLowerCase()
        const b = w.replace(/[^\p{L}']/gu, '').toLowerCase()
        return abstand(a, b) + (a[0] === b[0] ? 0 : 1)
      })
    )
  return mischen(z, andere)
    .sort((a, b) => nah(a) - nah(b))
    .slice(0, n)
}

export const satzbaustelle = ordnenSpiel({
  id: 'satzbaustelle',
  titel: 'satz',
  passt: (i) => (mitSatz(i) >= 3 ? null : 'Braucht mindestens drei Beispielsätze bzw. Satzaufgaben.'),
  runden(z) {
    const max = z.schwierigkeit === 'leicht' ? 7 : z.schwierigkeit === 'mittel' ? 10 : 14
    let items = itemsZiehen(z, 4, { filter: (i) => Boolean(i.satz && i.satz.length >= 3 && i.satz.length <= max) })
    if (items.length < 4) items = itemsZiehen(z, 4, { filter: (i) => Boolean(i.satz && i.satz.length >= 3) })
    return [...new Map(items.map((i) => [i.id, i])).values()].slice(0, 4).map((i) => ({
      itemIds: [i.id],
      hinweis: i.satzHinweis || tx(z, 'baut'),
      teile: [...i.satz!.map((t) => ({ text: t })), ...fallenWoerter(z, i.satz!, ablenkerStufe(z)).map((t) => ({ text: t, falle: true }))],
      loesung: i.satz!.join(' ')
    }))
  }
})

export const bildergeschichte = ordnenSpiel({
  id: 'bildergeschichte',
  titel: 'geschichte',
  passt: (i) => (i.items.filter((x) => x.vok?.bild).length >= 4 ? null : 'Braucht mindestens vier Wörter mit Bild.'),
  runden(z) {
    const n = z.schwierigkeit === 'leicht' ? 4 : z.schwierigkeit === 'mittel' ? 5 : 6
    const aus = []
    for (let r = 0; r < 3; r++) {
      const items = [...new Map(itemsZiehen(z, n, { filter: (i) => Boolean(i.vok?.bild) }).map((i) => [i.id, i])).values()]
      aus.push({
        itemIds: items.map((i) => i.id),
        hinweis: tx(z, 'dieGeschichte', items.map((i) => i.vok!.term).join(' → ')),
        teile: items.map((i) => ({ text: '', wert: i.id, bild: i.vok!.bild })),
        loesung: items.map((i) => i.vok!.term).join(' → ')
      })
    }
    return aus
  }
})

export const uebersetzung = ordnenSpiel({
  id: 'uebersetzung',
  titel: 'satz',
  passt: (i) => (i.items.filter((x) => x.uebersetzung).length >= 3 ? null : 'Braucht mindestens drei Sätze mit Übersetzung.'),
  runden(z) {
    const items = [...new Map(itemsZiehen(z, 4, { filter: (i) => Boolean(i.uebersetzung) }).map((i) => [i.id, i])).values()]
    const fallen = z.schwierigkeit === 'leicht' ? 1 : z.schwierigkeit === 'mittel' ? 2 : 3
    return items.map((i) => {
      const andere = mischen(
        z,
        z.inhalt.items.flatMap((x) => (x.id !== i.id ? x.uebersetzung?.teile ?? [] : []))
      ).filter((t) => !i.uebersetzung!.teile.includes(t))
      return {
        itemIds: [i.id],
        hinweis: tx(z, 'uebersetzt', i.uebersetzung!.de),
        teile: [...i.uebersetzung!.teile.map((t) => ({ text: t })), ...[...new Set(andere)].slice(0, fallen).map((t) => ({ text: t, falle: true }))],
        loesung: i.uebersetzung!.teile.join(' ')
      }
    })
  }
})

export const zeitstrahl = ordnenSpiel({
  id: 'zeitstrahl',
  titel: 'zeitstrahl',
  zielFehler: 3,
  passt: (i) =>
    new Set(i.zeitSaetze.map((s) => s.rang)).size >= 2 && i.zeitSaetze.length >= 4 ? null : 'Braucht Sätze aus mindestens zwei Zeitformen.',
  runden(z) {
    const namen = [...new Set(z.inhalt.zeitSaetze.map((s) => s.name))]
    const aus: OrdnenRunde[] = []
    for (let r = 0; r < 3; r++) {
      // Je Lage auf dem Zeitstrahl höchstens ein Satz – so ist die Reihenfolge eindeutig
      const jeRang = new Map<number, (typeof z.inhalt.zeitSaetze)[number]>()
      for (const s of mischen(z, z.inhalt.zeitSaetze)) if (!jeRang.has(s.rang)) jeRang.set(s.rang, s)
      const saetze = [...jeRang.values()].sort((a, b) => a.rang - b.rang).slice(0, z.schwierigkeit === 'leicht' ? 3 : 4)
      aus.push({
        itemIds: saetze.map((s) => s.id),
        hinweis: tx(z, 'frueherSpaeter'),
        teile: saetze.map((s) => ({ text: s.satz, wert: String(s.rang) })),
        loesung: saetze.map((s) => s.satz).join(' → '),
        benennen: saetze.map((s) => ({ text: s.satz, loesung: s.name, optionen: mischen(z, [s.name, ...mischen(z, namen.filter((n) => n !== s.name)).slice(0, 3)]), itemId: s.id }))
      })
    }
    return aus
  }
})
