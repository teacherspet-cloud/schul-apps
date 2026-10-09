/**
 * Kooperative Spiele der Welle 2 (08.10.2026, abgestimmt): Wortkette, Team-Memory, Geteiltes Kreuzwort,
 * Fehlerdetektive, Dialog-Theater, Hör-Kette, Reiseplaner. Alles aus dem Kurs, ohne KI beim Spielen.
 */
import {
  ablenkerFuer,
  aktive,
  antwortRichtig,
  basisNeu,
  eines,
  fehlerMerken,
  frageAus,
  frageBlock,
  gut,
  itemsZiehen,
  koopErgebnis,
  melde,
  mischen,
  name,
  naechste,
  rueckBlock,
  satzTeile,
  tx,
  type Basis,
  type Block,
  type Regeln
} from '../kern'
import type { Frage, SpielItem } from '../typen'

const ids = (z: Basis): string[] => z.spieler.map((s) => s.id)
const dranName = (z: Basis, id: string): Block => ({ typ: 'text', text: tx(z, 'istDran', name(z, id)), ton: 'leise' })

// ---------------------------------------------------------------- Wortkette (Kl. 5–6)

interface Kette extends Basis {
  dran: number
  glieder: string[]
  brueche: number
  frage: Frage | null
  ziel: number
}
function kettenFrage(z: Kette): void {
  const letzter = z.glieder[z.glieder.length - 1]
  const buchstabe = letzter ? letzter.slice(-1).toLowerCase() : ''
  const passend = z.inhalt.items.filter((i) => i.vok && !z.glieder.includes(i.vok.term) && (!buchstabe || i.vok.term[0]?.toLowerCase() === buchstabe))
  const item = passend.length ? eines(z, passend) : itemsZiehen(z, 1, { filter: (i) => Boolean(i.vok) && !z.glieder.includes(i.vok!.term) })[0] ?? eines(z, z.inhalt.items)
  z.frage = frageAus(z, item, 'abrufen', 4, false)
  if (buchstabe && passend.length) z.frage.zusatz = tx(z, 'faengtMit', buchstabe)
}
export const wortkette: Regeln<Kette> = {
  id: 'wortkette',
  passt: (i) => (i.items.filter((x) => x.vok).length >= 8 ? null : 'Braucht mindestens acht Wörter.'),
  start(k) {
    const z: Kette = { ...basisNeu(k), dran: 0, glieder: [], brueche: 0, frage: null, ziel: 10 }
    kettenFrage(z)
    return z
  },
  zug(z, wer, zug) {
    if (z.ende || zug.aktion !== 'antwort' || wer !== z.spieler[z.dran].id || !z.frage) return
    if (antwortRichtig(z.frage, zug.wert)) {
      gut(z, wer)
      z.glieder.push(z.frage.loesung)
      melde(z, wer, true, tx(z, 'neuesGlied'))
    } else {
      z.brueche++
      fehlerMerken(z, wer, z.frage.itemId)
      melde(z, wer, false, tx(z, 'ketteHaelt'), z.frage.loesung)
    }
    if (z.glieder.length >= z.ziel || z.brueche >= 5) return void (z.ende = true)
    z.dran = naechste(z, ids(z), z.dran)
    kettenFrage(z)
  },
  sicht(z, wer) {
    const b: Block[] = [{ typ: 'reihe', titel: tx(z, 'kette', z.glieder.length, z.ziel), teile: z.glieder }, ...rueckBlock(z)]
    if (z.ende || !z.frage) return b
    return [...b, ...(wer === z.spieler[z.dran].id ? [frageBlock(z.frage)] : [dranName(z, z.spieler[z.dran].id)])]
  },
  weg(z, wer) {
    if (z.spieler[z.dran].id === wer) z.dran = naechste(z, ids(z), z.dran)
  },
  ergebnis: (z) => koopErgebnis(z, z.glieder.length >= z.ziel && z.brueche <= 2, z.glieder.length, tx(z, 'ketteErgebnis', z.glieder.length))
}

// ---------------------------------------------------------------- Team-Memory (Kl. 5–7)

interface Memory extends Basis {
  karten: { item: string; text: string; seite: 'fs' | 'de' }[]
  gefunden: number[]
  offen: number[]
  /** zuletzt aufgedeckt (bleibt bis zum nächsten Zug sichtbar) */
  zuletzt: number[]
  dran: number
  zuege: number
}
export const teammemory: Regeln<Memory> = {
  id: 'teammemory',
  passt: (i) => (i.items.filter((x) => x.vok).length >= 6 ? null : 'Braucht mindestens sechs Wörter.'),
  start(k) {
    const z: Memory = { ...basisNeu(k), karten: [], gefunden: [], offen: [], zuletzt: [], dran: 0, zuege: 0 }
    const n = z.schwierigkeit === 'leicht' || z.schwierigkeit === 'mittel' ? 6 : 8
    const items = [...new Map(itemsZiehen(z, n * 2, { filter: (i) => Boolean(i.vok) }).map((i) => [i.id, i])).values()].slice(0, n)
    z.karten = mischen(
      z,
      items.flatMap((i) => [
        { item: i.id, text: i.vok!.term, seite: 'fs' as const },
        { item: i.id, text: i.vok!.translation, seite: 'de' as const }
      ])
    )
    return z
  },
  zug(z, wer, zug) {
    if (z.ende || zug.aktion !== 'karte' || wer !== z.spieler[z.dran].id) return
    const i = Number(zug.wert)
    if (!Number.isInteger(i) || i < 0 || i >= z.karten.length || z.gefunden.includes(i) || z.offen.includes(i)) return
    if (z.offen.length === 0) z.zuletzt = []
    z.offen.push(i)
    if (z.offen.length < 2) return
    z.zuege++
    const [a, b] = z.offen
    z.zuletzt = [a, b]
    z.offen = []
    if (z.karten[a].item === z.karten[b].item) {
      z.gefunden.push(a, b)
      gut(z, wer)
      melde(z, wer, true, tx(z, 'paarGefunden'))
      if (z.gefunden.length >= z.karten.length) z.ende = true
      return
    }
    melde(z, wer, false, tx(z, 'keinPaar'))
    z.dran = naechste(z, ids(z), z.dran)
  },
  sicht(z, wer) {
    const sichtbar = new Set([...z.gefunden, ...z.offen, ...z.zuletzt])
    const b: Block[] = [{ typ: 'text', text: tx(z, 'memoryStand', z.zuege, z.gefunden.length / 2, z.karten.length / 2), ton: 'info' }, ...rueckBlock(z)]
    if (!z.ende) b.push(wer === z.spieler[z.dran].id ? { typ: 'text', text: tx(z, 'memoryDran'), ton: 'info' } : dranName(z, z.spieler[z.dran].id))
    b.push({
      typ: 'kacheln',
      spalten: 4,
      kacheln: z.karten.map((k, i) => ({
        id: String(i),
        ...(sichtbar.has(i) ? { text: k.text, status: z.gefunden.includes(i) ? ('gut' as const) : ('offen' as const) } : { text: '?' })
      })),
      ...(wer === z.spieler[z.dran].id && !z.ende ? { aktion: 'karte' } : {})
    })
    return b
  },
  weg(z, wer) {
    if (z.spieler[z.dran].id === wer) {
      z.offen = []
      z.dran = naechste(z, ids(z), z.dran)
    }
  },
  ergebnis: (z) => koopErgebnis(z, z.zuege <= Math.round((z.karten.length / 2) * 2), z.zuege, tx(z, 'memoryErgebnis', z.zuege))
}

// ---------------------------------------------------------------- Geteiltes Kreuzwort (Kl. 6–10)

interface Kreuz extends Basis {
  dauer: number
  woerter: { item: string; wort: string; hinweis: string; besitzer: string; geloest: boolean; frage: Frage | null }[]
  fehlerZahl: number
}
const istEinWort = (i: SpielItem): boolean => Boolean(i.vok && /^[\p{L}'-]{3,12}$/u.test(i.vok.term))
export const kreuzwort: Regeln<Kreuz> = {
  id: 'kreuzwort',
  passt: (i) => (i.items.filter(istEinWort).length >= 5 ? null : 'Braucht mindestens fünf einzelne Wörter (3–12 Buchstaben).'),
  start(k) {
    const z: Kreuz = { ...basisNeu(k), dauer: 0, woerter: [], fehlerZahl: 0 }
    const items = [...new Map(itemsZiehen(z, 16, { filter: istEinWort }).map((i) => [i.id, i])).values()].slice(0, 2 * k.spieler.length + 2)
    const leute = ids(z)
    z.woerter = items.map((i, n) => ({
      item: i.id,
      wort: i.vok!.term,
      hinweis: i.vok!.translation,
      besitzer: leute[n % leute.length],
      geloest: false,
      frage: z.schwierigkeit === 'leicht' ? frageAus(z, i, 'abrufen', 4, false) : null
    }))
    return z
  },
  zug(z, wer, zug, jetzt) {
    if (z.ende) return
    // Schreiben: {nr: text} aus den Eingabefeldern; leicht: Auswahl mit Aktion „wort:<nr>"
    const [nr, text] =
      zug.aktion === 'wort' && zug.wert && typeof zug.wert === 'object'
        ? Object.entries(zug.wert as Record<string, unknown>).find(([, v]) => String(v ?? '').trim()) ?? []
        : zug.aktion.startsWith('wort:')
        ? [zug.aktion.slice(5), zug.wert]
        : []
    const w = z.woerter[Number(nr)]
    if (!w || w.geloest || w.besitzer !== wer) return
    const f: Frage = w.frage ?? { itemId: w.item, frage: w.hinweis, optionen: [], loesung: w.wort, tippen: true }
    if (antwortRichtig(f, text)) {
      w.geloest = true
      gut(z, wer)
      melde(z, wer, true, tx(z, 'wortPasst', w.wort))
      if (z.woerter.every((x) => x.geloest)) {
        z.ende = true
        z.dauer = Math.round((jetzt - z.start) / 1000)
      }
    } else {
      z.fehlerZahl++
      fehlerMerken(z, wer, w.item)
      melde(z, wer, false, tx(z, 'passtNichtKlein'))
    }
  },
  sicht(z, wer) {
    const b: Block[] = [
      {
        typ: 'kacheln',
        titel: tx(z, 'gemeinsamesRaetsel'),
        kacheln: z.woerter.map((w, n) => ({
          id: String(n),
          text: `${n + 1}. ${w.geloest ? w.wort : w.wort.replace(/\p{L}/gu, '_ ').trim()}`,
          ...(w.geloest ? { status: 'gut' as const } : {}),
          klein: name(z, w.besitzer)
        }))
      },
      ...rueckBlock(z)
    ]
    if (z.ende) return b
    const meine = z.woerter.map((w, n) => ({ w, n })).filter((x) => x.w.besitzer === wer && !x.w.geloest)
    if (!meine.length) return [...b, { typ: 'text', text: tx(z, 'woerterGeloest'), ton: 'gut' }]
    if (z.schwierigkeit === 'leicht')
      for (const { w, n } of meine.slice(0, 1)) b.push(frageBlock({ ...w.frage!, frage: `${n + 1}. ${w.hinweis}` }, `wort:${n}`))
    else b.push({ typ: 'eingaben', felder: meine.map(({ w, n }) => ({ id: String(n), titel: `${n + 1}. ${w.hinweis}` })), aktion: 'wort' })
    return b
  },
  weg(z, wer) {
    const rest = aktive(z).map((s) => s.id)
    z.woerter.forEach((w, n) => {
      if (w.besitzer === wer && rest.length) w.besitzer = rest[n % rest.length]
    })
  },
  ergebnis: (z) =>
    koopErgebnis(z, z.fehlerZahl <= 3, z.dauer || null, tx(z, 'kreuzErgebnis', z.fehlerZahl), z.fehlerZahl === 0)
}

// ---------------------------------------------------------------- Fehlerdetektive (Kl. 8–13)

/**
 * 09.10.2026 (Befund der Lehrkraft: zu viert waren nur zwei beschäftigt, Sätze ohne Fehler ließen das Spiel hängen):
 * Je Runde bekommt JEDE Person einen eigenen Fehlersatz und sucht darin das falsche Wort; verbessert wird er von der
 * nächsten Person – so findet jede ihren Fehler und verbessert zugleich den der Nachbarin. Die Fehlerstellen kennt
 * nur der Server (`fehler.stellen`); falsch Getipptes wird als richtig markiert, das gefundene Wort als Fehler.
 * „Überspringen" zeigt die Lösung und geht weiter – das Spiel kann nie hängen bleiben.
 */
interface Fall {
  item: string
  finder: string
  gefunden: boolean
  getippt: number[]
  frage: Frage | null
  fertig: boolean
}
interface Detektive extends Basis {
  runden: number
  r: number
  faelle: Fall[]
  fehlerZahl: number
  gesamt: number
}
/** Korrektor eines Falls: die nächste anwesende Person nach der Finderin bzw. dem Finder */
const korrektorVon = (z: Detektive, f: Fall): string => z.spieler[naechste(z, ids(z), z.spieler.findIndex((s) => s.id === f.finder))].id
function detektivRunde(z: Detektive): void {
  if (z.r >= z.runden) return void (z.ende = true)
  const leute = aktive(z).map((s) => s.id)
  const items = itemsZiehen(z, leute.length * 2, { filter: (i) => Boolean(i.fehler) })
  const eindeutig = [...new Map(items.map((i) => [i.id, i])).values()]
  z.faelle = leute.map((id, n) => ({ item: (eindeutig[n] ?? items[n % items.length]).id, finder: id, gefunden: false, getippt: [], frage: null, fertig: false }))
  z.gesamt += z.faelle.length
}
function fallFertig(z: Detektive): void {
  if (z.faelle.every((f) => f.fertig)) {
    z.r++
    detektivRunde(z)
  }
}
const fehlerVon = (z: Detektive, f: Fall): NonNullable<SpielItem['fehler']> => z.inhalt.items.find((i) => i.id === f.item)!.fehler!
export const fehlerdetektive: Regeln<Detektive> = {
  id: 'fehlerdetektive',
  passt: (i) => (i.items.filter((x) => x.fehler).length >= 3 ? null : 'Braucht mindestens drei Sätze mit Fehler.'),
  start(k) {
    const b = basisNeu(k)
    const z: Detektive = { ...b, runden: b.schwierigkeit === 'leicht' ? 2 : 3, r: 0, faelle: [], fehlerZahl: 0, gesamt: 0 }
    detektivRunde(z)
    return z
  },
  zug(z, wer, zug) {
    if (z.ende) return
    const [aktion, nr] = zug.aktion.split(':')
    if (aktion === 'wort') {
      const [fs, ws] = String(zug.wert ?? '').split(':')
      const fall = z.faelle[Number(fs)]
      if (!fall || fall.finder !== wer || fall.gefunden || fall.fertig) return
      const f = fehlerVon(z, fall)
      const i = Number(ws)
      if (!Number.isInteger(i) || i < 0 || i >= satzTeile(f.satz).length || fall.getippt.includes(i)) return
      if (f.stellen.includes(i)) {
        fall.gefunden = true
        const item = z.inhalt.items.find((x) => x.id === fall.item)!
        const loes = { ...item, loesung: f.korrektur, alternativen: [], ablenker: [], frage: f.satz, zusatz: tx(z, 'wieRichtig', f.wort) }
        fall.frage = frageAus(z, loes, 'standard')
        if (!z.tippen) fall.frage.optionen = mischen(z, [f.korrektur, ...ablenkerFuer(z, f.korrektur, [f.wort], (x) => x.fehler?.korrektur ?? x.vok?.term, 3)])
        return melde(z, wer, true, tx(z, 'fehlerGefunden', f.wort))
      }
      fall.getippt.push(i)
      z.fehlerZahl++
      fehlerMerken(z, wer, fall.item)
      return melde(z, wer, false, tx(z, 'istRichtigWort', satzTeile(f.satz)[i]))
    }
    if (aktion === 'antwort') {
      const fall = z.faelle[Number(nr)]
      if (!fall || !fall.gefunden || fall.fertig || !fall.frage || korrektorVon(z, fall) !== wer) return
      const f = fehlerVon(z, fall)
      if (antwortRichtig(fall.frage, zug.wert)) {
        gut(z, wer)
        melde(z, wer, true, tx(z, 'fallGeloest'), f.korrektur)
      } else {
        z.fehlerZahl++
        fehlerMerken(z, wer, fall.item)
        melde(z, wer, false, tx(z, 'nichtGanz'), `${f.wort} → ${f.korrektur}`)
      }
      fall.fertig = true
      return fallFertig(z)
    }
    if (aktion === 'weiter') {
      // Überspringen: die Person, die gerade an dem Fall ist, zeigt die Lösung und macht weiter
      const fall = z.faelle[Number(zug.wert)]
      if (!fall || fall.fertig) return
      const dran = fall.gefunden ? korrektorVon(z, fall) : fall.finder
      if (dran !== wer) return
      const f = fehlerVon(z, fall)
      z.fehlerZahl++
      fall.fertig = true
      melde(z, wer, false, tx(z, 'hatUebersprungen'), `${f.wort} → ${f.korrektur}`)
      return fallFertig(z)
    }
  },
  sicht(z, wer) {
    const b: Block[] = [{ typ: 'fortschritt', titel: tx(z, 'rundeVon', Math.min(z.r + 1, z.runden), z.runden), wert: z.r, max: z.runden }, ...rueckBlock(z)]
    if (z.ende) return b
    z.faelle.forEach((fall, n) => {
      const f = fehlerVon(z, fall)
      const korrektor = korrektorVon(z, fall)
      const kacheln = (aktiv: boolean): Block => ({
        typ: 'kacheln',
        titel: fall.gefunden ? tx(z, 'satzRot') : tx(z, 'deinSatz'),
        kacheln: satzTeile(f.satz).map((w, i) => ({
          id: `${n}:${i}`,
          text: w,
          ...(fall.gefunden && f.stellen.includes(i) ? { status: 'schlecht' as const } : fall.getippt.includes(i) ? { status: 'gut' as const } : {})
        })),
        ...(aktiv ? { aktion: 'wort' } : {})
      })
      if (fall.finder === wer && !fall.fertig && !fall.gefunden) {
        b.push(kacheln(true))
        b.push({ typ: 'knoepfe', knoepfe: [{ text: tx(z, 'ueberspringenLoesung'), aktion: 'weiter', wert: String(n) }] })
      } else if (korrektor === wer && fall.gefunden && !fall.fertig && fall.frage) {
        b.push({ typ: 'text', text: tx(z, 'duVerbesserst', name(z, fall.finder)), ton: 'info' })
        b.push(kacheln(false))
        b.push(frageBlock(fall.frage, `antwort:${n}`))
        b.push({ typ: 'knoepfe', knoepfe: [{ text: tx(z, 'ueberspringenLoesung'), aktion: 'weiter', wert: String(n) }] })
      } else if (fall.finder === wer && fall.gefunden && !fall.fertig)
        b.push({ typ: 'text', text: tx(z, 'verbessertDeinen', name(z, korrektor)), ton: 'leise' })
    })
    const offen = z.faelle.filter((f) => !f.fertig).length
    b.push({ typ: 'text', text: offen ? (offen === 1 ? tx(z, 'nochEinFall') : tx(z, 'nochFaelle', offen)) : tx(z, 'rundeFertig'), ton: 'leise' })
    return b
  },
  weg(z, wer) {
    // Fälle der Person, die gegangen ist: Finden übernimmt die nächste anwesende Person
    for (const f of z.faelle) if (f.finder === wer && !f.fertig) f.finder = z.spieler[naechste(z, ids(z), z.spieler.findIndex((s) => s.id === wer))].id
  },
  ergebnis: (z) => koopErgebnis(z, z.fehlerZahl <= 2, z.fehlerZahl, tx(z, 'faelleErgebnis', z.gesamt, z.fehlerZahl), z.fehlerZahl === 0)
}

// ---------------------------------------------------------------- Dialog-Theater (Kl. 6–10)

interface Dialog extends Basis {
  zeilen: { item: string; rolle: 0 | 1; frage: Frage }[]
  z: number
  gespielt: string[]
}
export const dialog: Regeln<Dialog> = {
  id: 'dialog',
  passt: (i) => (i.items.filter((x) => x.vok?.luecke).length >= 4 ? null : 'Braucht mindestens vier Wörter mit Beispielsatz.'),
  start(k) {
    const d: Dialog = { ...basisNeu(k), zeilen: [], z: 0, gespielt: [] }
    const items = [...new Map(itemsZiehen(d, 12, { filter: (i) => Boolean(i.vok?.luecke) }).map((i) => [i.id, i])).values()].slice(0, 6)
    // Fragen und Aussagen abwechselnd (wie ein Gespräch), Rolle A und B im Wechsel
    const fragen = items.filter((i) => i.vok!.beispiel?.trim().endsWith('?'))
    const aussagen = items.filter((i) => !fragen.includes(i))
    const folge: SpielItem[] = []
    while (fragen.length || aussagen.length) {
      if (fragen.length) folge.push(fragen.shift()!)
      if (aussagen.length) folge.push(aussagen.shift()!)
    }
    d.zeilen = folge.map((i, n) => ({ item: i.id, rolle: (n % 2) as 0 | 1, frage: frageAus(d, i, 'luecke') }))
    return d
  },
  zug(d, wer, zug) {
    if (d.ende || zug.aktion !== 'antwort') return
    const zeile = d.zeilen[d.z]
    if (!zeile || !rolleVon(d, wer).includes(zeile.rolle)) return
    const item = d.inhalt.items.find((i) => i.id === zeile.item)!
    if (antwortRichtig(zeile.frage, zug.wert)) {
      gut(d, wer)
      melde(d, wer, true, item.vok!.beispiel ?? '')
    } else {
      fehlerMerken(d, wer, item.id)
      melde(d, wer, false, tx(d, 'nichtGanzDoppel'), item.vok!.beispiel)
    }
    d.gespielt.push(item.vok!.beispiel ?? '')
    d.z++
    if (d.z >= d.zeilen.length) d.ende = true
  },
  sicht(d, wer) {
    const meine = rolleVon(d, wer)
    const b: Block[] = [
      { typ: 'text', text: tx(d, 'deineRolle', meine.map((r) => (r === 0 ? 'A' : 'B')).join(' + ')), ton: 'info' },
      { typ: 'kacheln', titel: tx(d, 'bisherGespraech'), kacheln: d.gespielt.map((t, i) => ({ id: String(i), text: `${i % 2 ? 'B' : 'A'}: ${t}` })) },
      ...rueckBlock(d)
    ]
    const zeile = d.zeilen[d.z]
    if (d.ende || !zeile) return b
    if (meine.includes(zeile.rolle)) b.push(frageBlock({ ...zeile.frage, zusatz: tx(d, 'rolleFehlt', zeile.rolle ? 'B' : 'A') }))
    else b.push({ typ: 'text', text: tx(d, 'rolleSpricht', zeile.rolle ? 'B' : 'A', zeile.frage.frage), ton: 'leise' })
    return b
  },
  ergebnis: (d) => {
    const r = Object.values(d.richtig).reduce((a, b) => a + b, 0)
    return koopErgebnis(d, r >= d.zeilen.length - 1, r, tx(d, 'dialogErgebnis', r, d.zeilen.length))
  }
}
/** Rolle(n) einer Person: Plätze abwechselnd A/B; wer allein in einer Rolle übrig ist, spielt beide */
function rolleVon(d: Dialog, wer: string): (0 | 1)[] {
  const a = aktive(d)
  const i = a.findIndex((s) => s.id === wer)
  if (i < 0) return []
  if (a.length === 1) return [0, 1]
  return [(i % 2) as 0 | 1]
}

// ---------------------------------------------------------------- Hör-Kette (Kl. 5–8)

interface Hoer extends Basis {
  reihe: string[]
  r: number
  hoerer: number
  optionen: string[]
  raus: string[]
  glieder: number
}
function hoerRunde(z: Hoer): void {
  z.raus = []
  if (z.r >= z.reihe.length) return void (z.ende = true)
  const i = z.inhalt.items.find((x) => x.id === z.reihe[z.r])!
  z.optionen = mischen(z, [i.vok!.term, ...ablenkerFuer(z, i.vok!.term, [], (x) => x.vok?.term, 3)])
}
export const hoerkette: Regeln<Hoer> = {
  id: 'hoerkette',
  passt: (i, stimme) =>
    i.items.filter((x) => x.vok).length < 6 ? 'Braucht mindestens sechs Wörter.' : stimme === false ? 'Braucht eine Stimme zum Vorlesen auf dem Gerät.' : null,
  start(k) {
    const z: Hoer = { ...basisNeu(k), reihe: [], r: 0, hoerer: 0, optionen: [], raus: [], glieder: 0 }
    z.reihe = itemsZiehen(z, 10, { filter: (i) => Boolean(i.vok) }).map((i) => i.id)
    hoerRunde(z)
    return z
  },
  zug(z, wer, zug) {
    const hoerer = z.spieler[z.hoerer].id
    if (z.ende || zug.aktion !== 'antwort' || wer === hoerer || z.raus.includes(wer) || !z.optionen.includes(String(zug.wert))) return
    const i = z.inhalt.items.find((x) => x.id === z.reihe[z.r])!
    const weiter = (): void => {
      z.r++
      z.hoerer = naechste(z, ids(z), z.hoerer)
      hoerRunde(z)
    }
    if (String(zug.wert) === i.vok!.term) {
      gut(z, wer)
      gut(z, hoerer)
      z.glieder++
      melde(z, wer, true, tx(z, 'richtigVerstanden'), i.vok!.term)
      return weiter()
    }
    z.raus.push(wer)
    fehlerMerken(z, wer, i.id)
    if (aktive(z).filter((s) => s.id !== hoerer).every((s) => z.raus.includes(s.id))) {
      fehlerMerken(z, hoerer, i.id)
      melde(z, wer, false, tx(z, 'diesmalNicht'), i.vok!.term)
      return weiter()
    }
    melde(z, wer, false, tx(z, 'warEsNicht'))
  },
  sicht(z, wer) {
    const b: Block[] = [{ typ: 'reihe', titel: tx(z, 'ketteGlieder', z.glieder), teile: Array.from({ length: z.glieder }, () => '●') }, ...rueckBlock(z)]
    if (z.ende) return b
    const i = z.inhalt.items.find((x) => x.id === z.reihe[z.r])!
    const hoerer = z.spieler[z.hoerer].id
    if (wer === hoerer)
      return [
        ...b,
        { typ: 'text', text: tx(z, 'duHoerst'), ton: 'info' },
        { typ: 'vorlesen', text: i.vok!.term, sprache: z.inhalt.sprache }
      ]
    return [
      ...b,
      { typ: 'text', text: tx(z, 'sprichtVor', name(z, hoerer)), ton: 'leise' },
      { typ: 'frage', frage: tx(z, 'welchesGehoert'), optionen: z.optionen, aktion: 'antwort', gesperrt: z.raus.includes(wer) }
    ]
  },
  weg(z, wer) {
    if (z.spieler[z.hoerer].id === wer) z.hoerer = naechste(z, ids(z), z.hoerer)
  },
  ergebnis: (z) => koopErgebnis(z, z.glieder >= Math.ceil(z.reihe.length * 0.8), z.glieder, tx(z, 'hoerErgebnis', z.glieder, z.reihe.length))
}

// Reiseplaner: neu gestaltet am 09.10.2026 in reiseplaner.ts
