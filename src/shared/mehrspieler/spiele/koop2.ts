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
  gleicherText,
  gut,
  itemsZiehen,
  koopErgebnis,
  melde,
  mischen,
  name,
  naechste,
  rueckBlock,
  satzTeile,
  zufall,
  type Basis,
  type Block,
  type Regeln
} from '../kern'
import type { Frage, SpielItem } from '../typen'

const ids = (z: Basis): string[] => z.spieler.map((s) => s.id)
const dranName = (z: Basis, id: string): Block => ({ typ: 'text', text: `${name(z, id)} ist dran.`, ton: 'leise' })

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
  if (buchstabe && passend.length) z.frage.zusatz = `Fängt mit „${buchstabe}“ an.`
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
      melde(z, wer, true, 'Neues Glied!')
    } else {
      z.brueche++
      fehlerMerken(z, wer, z.frage.itemId)
      melde(z, wer, false, 'Die Kette hält trotzdem – weiter!', z.frage.loesung)
    }
    if (z.glieder.length >= z.ziel || z.brueche >= 5) return void (z.ende = true)
    z.dran = naechste(z, ids(z), z.dran)
    kettenFrage(z)
  },
  sicht(z, wer) {
    const b: Block[] = [{ typ: 'reihe', titel: `Kette (${z.glieder.length} von ${z.ziel})`, teile: z.glieder }, ...rueckBlock(z)]
    if (z.ende || !z.frage) return b
    return [...b, ...(wer === z.spieler[z.dran].id ? [frageBlock(z.frage)] : [dranName(z, z.spieler[z.dran].id)])]
  },
  weg(z, wer) {
    if (z.spieler[z.dran].id === wer) z.dran = naechste(z, ids(z), z.dran)
  },
  ergebnis: (z) => koopErgebnis(z, z.glieder.length >= z.ziel && z.brueche <= 2, z.glieder.length, `Eure Kette hat ${z.glieder.length} Glieder.`)
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
      melde(z, wer, true, 'Paar gefunden!')
      if (z.gefunden.length >= z.karten.length) z.ende = true
      return
    }
    melde(z, wer, false, 'Kein Paar.')
    z.dran = naechste(z, ids(z), z.dran)
  },
  sicht(z, wer) {
    const sichtbar = new Set([...z.gefunden, ...z.offen, ...z.zuletzt])
    const b: Block[] = [{ typ: 'text', text: `Züge: ${z.zuege} · Paare: ${z.gefunden.length / 2} von ${z.karten.length / 2}`, ton: 'info' }, ...rueckBlock(z)]
    if (!z.ende) b.push(wer === z.spieler[z.dran].id ? { typ: 'text', text: 'Du bist dran: zwei Karten aufdecken.', ton: 'info' } : dranName(z, z.spieler[z.dran].id))
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
  ergebnis: (z) => koopErgebnis(z, z.zuege <= Math.round((z.karten.length / 2) * 2), z.zuege, `Alle Paare in ${z.zuege} Zügen gefunden.`)
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
      melde(z, wer, true, `${w.wort} passt!`)
      if (z.woerter.every((x) => x.geloest)) {
        z.ende = true
        z.dauer = Math.round((jetzt - z.start) / 1000)
      }
    } else {
      z.fehlerZahl++
      fehlerMerken(z, wer, w.item)
      melde(z, wer, false, 'passt nicht.')
    }
  },
  sicht(z, wer) {
    const b: Block[] = [
      {
        typ: 'kacheln',
        titel: 'Gemeinsames Rätsel',
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
    if (!meine.length) return [...b, { typ: 'text', text: 'Deine Wörter sind gelöst – helft euch gegenseitig!', ton: 'gut' }]
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
    koopErgebnis(z, z.fehlerZahl <= 3, z.dauer || null, `Rätsel gelöst mit ${z.fehlerZahl} Fehlversuchen.`, z.fehlerZahl === 0)
}

// ---------------------------------------------------------------- Fehlerdetektive (Kl. 8–13)

interface Detektive extends Basis {
  reihe: string[]
  r: number
  gefunden: string | null
  verbessert: Frage | null
  fehlerZahl: number
}
function detektivRunde(z: Detektive): void {
  z.gefunden = null
  z.verbessert = null
  if (z.r >= z.reihe.length) z.ende = true
}
export const fehlerdetektive: Regeln<Detektive> = {
  id: 'fehlerdetektive',
  passt: (i) => (i.items.filter((x) => x.fehler).length >= 3 ? null : 'Braucht mindestens drei Sätze mit Fehler.'),
  start(k) {
    const z: Detektive = { ...basisNeu(k), reihe: [], r: 0, gefunden: null, verbessert: null, fehlerZahl: 0 }
    z.reihe = [...new Set(itemsZiehen(z, 5, { filter: (i) => Boolean(i.fehler) }).map((i) => i.id))]
    return z
  },
  zug(z, wer, zug) {
    if (z.ende) return
    const item = z.inhalt.items.find((i) => i.id === z.reihe[z.r])!
    const f = item.fehler!
    if (zug.aktion === 'wort' && !z.gefunden) {
      const wort = satzTeile(f.satz)[Number(zug.wert)]
      if (!wort) return
      if (gleicherText(wort.replace(/[^\p{L}\p{N}']/gu, ''), f.wort)) {
        z.gefunden = wer
        const loes = { ...item, loesung: f.korrektur, ablenker: [], frage: f.satz, zusatz: `Wie heißt „${f.wort}“ richtig?` }
        z.verbessert = frageAus(z, loes, 'standard')
        z.verbessert.optionen = z.tippen ? [] : mischen(z, [f.korrektur, ...ablenkerFuer(z, f.korrektur, [f.wort], (x) => x.fehler?.korrektur ?? x.vok?.term, 3)])
        return melde(z, wer, true, `hat den Fehler gefunden: „${f.wort}“.`)
      }
      z.fehlerZahl++
      fehlerMerken(z, wer, item.id)
      return melde(z, wer, false, `„${wort}“ ist richtig.`)
    }
    if (zug.aktion === 'antwort' && z.gefunden && z.verbessert) {
      // Verbessern darf die nächste Person nach der Finderin bzw. dem Finder (bei zwei Personen: die andere)
      const verbesserer = z.spieler[naechste(z, ids(z), z.spieler.findIndex((s) => s.id === z.gefunden))].id
      if (wer !== verbesserer) return
      if (antwortRichtig(z.verbessert, zug.wert)) {
        gut(z, wer)
        melde(z, wer, true, 'Fall gelöst!', f.korrektur)
      } else {
        z.fehlerZahl++
        fehlerMerken(z, wer, item.id)
        melde(z, wer, false, 'Nicht ganz.', f.korrektur)
      }
      z.r++
      detektivRunde(z)
    }
  },
  sicht(z, wer) {
    const b: Block[] = [{ typ: 'fortschritt', titel: `Fall ${Math.min(z.r + 1, z.reihe.length)} von ${z.reihe.length}`, wert: z.r, max: z.reihe.length }, ...rueckBlock(z)]
    if (z.ende) return b
    const f = z.inhalt.items.find((i) => i.id === z.reihe[z.r])!.fehler!
    b.push({
      typ: 'kacheln',
      titel: z.gefunden ? 'Der Satz' : 'Welches Wort ist falsch? Tippe es an.',
      kacheln: satzTeile(f.satz).map((w, i) => ({ id: String(i), text: w })),
      ...(z.gefunden ? {} : { aktion: 'wort' })
    })
    if (z.gefunden && z.verbessert) {
      const verbesserer = z.spieler[naechste(z, ids(z), z.spieler.findIndex((s) => s.id === z.gefunden))].id
      b.push(wer === verbesserer ? frageBlock(z.verbessert) : { typ: 'text', text: `${name(z, verbesserer)} verbessert jetzt.`, ton: 'leise' })
    }
    return b
  },
  ergebnis: (z) => koopErgebnis(z, z.fehlerZahl <= 2, z.fehlerZahl, `${z.reihe.length} Fälle bearbeitet, ${z.fehlerZahl} Fehltipps.`, z.fehlerZahl === 0)
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
      melde(d, wer, false, 'Nicht ganz:', item.vok!.beispiel)
    }
    d.gespielt.push(item.vok!.beispiel ?? '')
    d.z++
    if (d.z >= d.zeilen.length) d.ende = true
  },
  sicht(d, wer) {
    const meine = rolleVon(d, wer)
    const b: Block[] = [
      { typ: 'text', text: `Deine Rolle: ${meine.map((r) => (r === 0 ? 'A' : 'B')).join(' und ')}`, ton: 'info' },
      { typ: 'kacheln', titel: 'Bisher im Gespräch', kacheln: d.gespielt.map((t, i) => ({ id: String(i), text: `${i % 2 ? 'B' : 'A'}: ${t}` })) },
      ...rueckBlock(d)
    ]
    const zeile = d.zeilen[d.z]
    if (d.ende || !zeile) return b
    if (meine.includes(zeile.rolle)) b.push(frageBlock({ ...zeile.frage, zusatz: `Rolle ${zeile.rolle ? 'B' : 'A'}: Welches Wort fehlt?` }))
    else b.push({ typ: 'text', text: `Rolle ${zeile.rolle ? 'B' : 'A'} spricht: ${zeile.frage.frage}`, ton: 'leise' })
    return b
  },
  ergebnis: (d) => {
    const r = Object.values(d.richtig).reduce((a, b) => a + b, 0)
    return koopErgebnis(d, r >= d.zeilen.length - 1, r, `${r} von ${d.zeilen.length} Zeilen richtig gespielt.`)
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
      melde(z, wer, true, 'richtig verstanden!', i.vok!.term)
      return weiter()
    }
    z.raus.push(wer)
    fehlerMerken(z, wer, i.id)
    if (aktive(z).filter((s) => s.id !== hoerer).every((s) => z.raus.includes(s.id))) {
      fehlerMerken(z, hoerer, i.id)
      melde(z, wer, false, 'Diesmal nicht.', i.vok!.term)
      return weiter()
    }
    melde(z, wer, false, 'war es nicht.')
  },
  sicht(z, wer) {
    const b: Block[] = [{ typ: 'reihe', titel: `Kette: ${z.glieder} Glieder`, teile: Array.from({ length: z.glieder }, () => '●') }, ...rueckBlock(z)]
    if (z.ende) return b
    const i = z.inhalt.items.find((x) => x.id === z.reihe[z.r])!
    const hoerer = z.spieler[z.hoerer].id
    if (wer === hoerer)
      return [
        ...b,
        { typ: 'text', text: 'Du hörst das Wort. Sprich es laut nach – die anderen tippen es an.', ton: 'info' },
        { typ: 'vorlesen', text: i.vok!.term, sprache: z.inhalt.sprache }
      ]
    return [
      ...b,
      { typ: 'text', text: `${name(z, hoerer)} spricht dir das Wort vor.`, ton: 'leise' },
      { typ: 'frage', frage: 'Welches Wort hast du gehört?', optionen: z.optionen, aktion: 'antwort', gesperrt: z.raus.includes(wer) }
    ]
  },
  weg(z, wer) {
    if (z.spieler[z.hoerer].id === wer) z.hoerer = naechste(z, ids(z), z.hoerer)
  },
  ergebnis: (z) => koopErgebnis(z, z.glieder >= Math.ceil(z.reihe.length * 0.8), z.glieder, `${z.glieder} von ${z.reihe.length} Wörtern richtig weitergegeben.`)
}

// ---------------------------------------------------------------- Reiseplaner (Kl. 7–10)

interface Reise extends Basis {
  runden: { reisen: string[][]; ziel: number; hinweise: Record<string, string[]>; raus: number[] }[]
  r: number
  fehlerZahl: number
}
/** Vier Reisen aus je drei Kurswörtern; Hinweise (✓ dabei / ✗ nicht dabei, in der Fremdsprache) grenzen auf genau eine ein */
export function reiseRunde(z: Basis, leute: string[]): Reise['runden'][number] {
  const items = [...new Map(itemsZiehen(z, 12, { filter: (i) => Boolean(i.vok) }).map((i) => [i.id, i])).values()].slice(0, 6)
  const reisen: string[][] = []
  for (let v = 0; reisen.length < 4 && v < 50; v++) {
    const r = mischen(z, items).slice(0, 3).map((i) => i.id).sort()
    if (!reisen.some((x) => x.join() === r.join())) reisen.push(r)
  }
  const ziel = Math.floor(zufall(z) * reisen.length)
  const aussagen: { text: string; passt: (r: string[]) => boolean }[] = items.map((i) => {
    const drin = reisen[ziel].includes(i.id)
    return { text: `${drin ? '✓' : '✗'} ${i.vok!.term}`, passt: (r: string[]) => r.includes(i.id) === drin }
  })
  // Gierig Aussagen wählen, bis nur noch die Zielreise passt
  const gewaehlt: typeof aussagen = []
  let uebrig = reisen.map((_, k) => k).filter((k) => k !== ziel)
  for (const a of mischen(z, aussagen)) {
    if (!uebrig.length && gewaehlt.length >= leute.length) break
    const weg = uebrig.filter((k) => !a.passt(reisen[k]))
    if (weg.length || gewaehlt.length < leute.length) {
      gewaehlt.push(a)
      uebrig = uebrig.filter((k) => a.passt(reisen[k]))
    }
  }
  const hinweise: Record<string, string[]> = Object.fromEntries(leute.map((id) => [id, [] as string[]]))
  gewaehlt.forEach((a, k) => hinweise[leute[k % leute.length]].push(a.text))
  return { reisen, ziel, hinweise, raus: [] }
}
export const reiseplaner: Regeln<Reise> = {
  id: 'reiseplaner',
  passt: (i) => (i.items.filter((x) => x.vok).length >= 9 ? null : 'Braucht mindestens neun Wörter.'),
  start(k) {
    const z: Reise = { ...basisNeu(k), runden: [], r: 0, fehlerZahl: 0 }
    for (let r = 0; r < 3; r++) z.runden.push(reiseRunde(z, ids(z)))
    return z
  },
  zug(z, wer, zug) {
    if (z.ende || zug.aktion !== 'reise') return
    const runde = z.runden[z.r]
    const k = Number(zug.wert)
    if (!Number.isInteger(k) || k < 0 || k >= runde.reisen.length || runde.raus.includes(k)) return
    if (k === runde.ziel) {
      gut(z, wer)
      melde(z, wer, true, 'Das ist eure Reise!')
      z.r++
      if (z.r >= z.runden.length) z.ende = true
      return
    }
    runde.raus.push(k)
    z.fehlerZahl++
    for (const id of runde.reisen[k]) if (!runde.reisen[runde.ziel].includes(id)) fehlerMerken(z, wer, id)
    melde(z, wer, false, 'Diese Reise passt nicht zu allen Hinweisen.')
  },
  sicht(z, wer) {
    const b: Block[] = [{ typ: 'fortschritt', titel: `Reise ${Math.min(z.r + 1, z.runden.length)} von ${z.runden.length}`, wert: z.r, max: z.runden.length }, ...rueckBlock(z)]
    if (z.ende) return b
    const runde = z.runden[z.r]
    b.push({ typ: 'kacheln', titel: 'Deine Hinweise (nur du siehst sie)', kacheln: (runde.hinweise[wer] ?? []).map((t, i) => ({ id: String(i), text: t })) })
    b.push({
      typ: 'kacheln',
      titel: 'Welche Reise ist es? Besprecht euch!',
      spalten: 2,
      kacheln: runde.reisen.map((r, k) => ({
        id: String(k),
        text: r.map((id) => z.inhalt.items.find((i) => i.id === id)?.vok?.translation ?? '').join(' · '),
        ...(runde.raus.includes(k) ? { status: 'aus' as const } : {})
      })),
      aktion: 'reise'
    })
    return b
  },
  weg(z, wer) {
    const rest = aktive(z).map((s) => s.id)
    for (const r of z.runden) {
      const seine = r.hinweise[wer] ?? []
      r.hinweise[wer] = []
      seine.forEach((t, k) => rest.length && r.hinweise[rest[k % rest.length]].push(t))
    }
  },
  ergebnis: (z) => koopErgebnis(z, z.fehlerZahl <= 1, z.fehlerZahl, `${z.runden.length} Reisen geplant, ${z.fehlerZahl} Fehlversuche.`, z.fehlerZahl === 0)
}
