/**
 * Versus-Spiele der Welle 2 (08.10.2026, abgestimmt): Schnapp!, Galgen-Duell, Team-Buzzer, Wort-Auktion, Wort-Domino,
 * Stadt-Land-Fluss, Fehler-Sniper. Ergebnis wie immer: nur Sieger öffentlich, die eigene Leistung privat.
 */
import {
  ablenkerFuer,
  aktive,
  antwortRichtig,
  basisNeu,
  fehlerMerken,
  frageAus,
  frageBlock,
  gewicht,
  gleicherText,
  gut,
  itemsZiehen,
  melde,
  mischen,
  name,
  naechste,
  rueckBlock,
  satzTeile,
  standBlock,
  teamName,
  teamsAus,
  tx,
  versusErgebnis,
  zufall,
  type Basis,
  type Block,
  type Regeln
} from '../kern'
import { istFrageItem } from '../inhalt'
import { kernform } from '../../vokabeltrainer'
import type { Frage } from '../typen'
import { artNach, frageItems } from './hilfen'
import type { TextSchluessel } from '../../spielSprache'

const ids = (z: Basis): string[] => z.spieler.map((s) => s.id)
const besteNach = (z: Basis, wert: (id: string) => number): string[] => {
  const max = Math.max(...aktive(z).map((s) => wert(s.id)))
  return max > 0 ? aktive(z).filter((s) => wert(s.id) === max).map((s) => s.id) : []
}
const siegText = (z: Basis, sieger: string[]): string => (sieger.length ? tx(z, 'gewonnenHat', sieger.map((id) => name(z, id)).join(' & ')) : tx(z, 'unentschieden'))

// ---------------------------------------------------------------- Schnapp! (Kl. 5–6, ohne Uhr)

interface Schnapp extends Basis {
  karten: { item: string; de: string; passt: boolean }[]
  k: number
  abgestimmt: string[]
}
export const schnapp: Regeln<Schnapp> = {
  id: 'schnapp',
  passt: (i) => (i.items.filter((x) => x.vok).length >= 6 ? null : 'Braucht mindestens sechs Wörter.'),
  start(k) {
    const z: Schnapp = { ...basisNeu(k), karten: [], k: 0, abgestimmt: [] }
    const items = itemsZiehen(z, 12, { filter: (i) => Boolean(i.vok) })
    z.karten = items.map((i) => {
      const passt = zufall(z) < 0.5
      const de = passt ? i.vok!.translation : ablenkerFuer(z, i.vok!.translation, [], (x) => x.vok?.translation, 1)[0] ?? i.vok!.translation
      return { item: i.id, de, passt: passt || de === i.vok!.translation }
    })
    return z
  },
  zug(z, wer, zug) {
    if (z.ende || (zug.aktion !== 'schnapp' && zug.aktion !== 'nicht') || z.abgestimmt.includes(wer)) return
    const karte = z.karten[z.k]
    const item = z.inhalt.items.find((i) => i.id === karte.item)!
    const weiter = (): void => {
      z.k++
      z.abgestimmt = []
      if (z.k >= z.karten.length) z.ende = true
    }
    if (zug.aktion === 'schnapp') {
      if (karte.passt) {
        gut(z, wer, 1)
        melde(z, wer, true, tx(z, 'schnapp'), `${item.vok!.term} = ${item.vok!.translation}`)
        return weiter()
      }
      z.punkte[wer] = Math.max(0, (z.punkte[wer] ?? 0) - 1)
      fehlerMerken(z, wer, item.id)
      z.abgestimmt.push(wer)
      melde(z, wer, false, tx(z, 'zuFrueh'), `${item.vok!.term} = ${item.vok!.translation}`)
    } else {
      z.abgestimmt.push(wer)
      if (karte.passt) fehlerMerken(z, wer, item.id)
      else z.richtig[wer] = (z.richtig[wer] ?? 0) + 1
    }
    if (aktive(z).every((s) => z.abgestimmt.includes(s.id))) {
      if (!karte.passt) melde(z, '', true, tx(z, 'passteNicht'), `${item.vok!.term} = ${item.vok!.translation}`)
      weiter()
    }
  },
  sicht(z, wer) {
    const b: Block[] = [
      { typ: 'fortschritt', titel: tx(z, 'karteVon', Math.min(z.k + 1, z.karten.length), z.karten.length), wert: z.k, max: z.karten.length },
      { typ: 'text', text: tx(z, 'deinePunkte', z.punkte[wer] ?? 0), ton: 'info' },
      ...rueckBlock(z)
    ]
    if (z.ende) return b
    const karte = z.karten[z.k]
    const item = z.inhalt.items.find((i) => i.id === karte.item)!
    b.push({ typ: 'text', text: `${item.vok!.term}  –  ${karte.de}`, gross: true })
    b.push({
      typ: 'knoepfe',
      knoepfe: [
        { text: tx(z, 'schnappPasst'), aktion: 'schnapp', farbe: 'green', gesperrt: z.abgestimmt.includes(wer) },
        { text: tx(z, 'passtNichtKnopf'), aktion: 'nicht', gesperrt: z.abgestimmt.includes(wer) }
      ]
    })
    return b
  },
  ergebnis: (z) => {
    const sieger = besteNach(z, (id) => z.punkte[id] ?? 0)
    return versusErgebnis(z, sieger, (id) => z.punkte[id] ?? 0, siegText(z, sieger), { unentschieden: sieger.length !== 1 })
  }
}

// ---------------------------------------------------------------- Galgen-Duell (Kl. 5–7)

const FEHLER_MAX = 7
interface Galgen extends Basis {
  wort: Record<string, string>
  item: Record<string, string>
  geraten: Record<string, string[]>
  falschZahl: Record<string, number>
  geschafft: Record<string, number>
  ziel: number
}
const nurBuchstaben = (w: string): string => w.toLowerCase().replace(/[^\p{L}]/gu, '')
function galgenWort(z: Galgen, wer: string): void {
  const i = itemsZiehen(z, 1, { fuer: wer, filter: (x) => Boolean(x.vok && /^[\p{L}' -]{3,14}$/u.test(x.vok.term)) })[0]
  z.item[wer] = i?.id ?? ''
  z.wort[wer] = i?.vok?.term ?? 'word'
  z.geraten[wer] = []
  z.falschZahl[wer] = 0
}
export const galgen: Regeln<Galgen> = {
  id: 'galgen',
  passt: (i) => (i.items.filter((x) => x.vok && /^[\p{L}' -]{3,14}$/u.test(x.vok.term)).length >= 6 ? null : 'Braucht mindestens sechs kurze Wörter.'),
  start(k) {
    const z: Galgen = { ...basisNeu(k), wort: {}, item: {}, geraten: {}, falschZahl: {}, geschafft: {}, ziel: 3 }
    for (const s of k.spieler) {
      z.geschafft[s.id] = 0
      galgenWort(z, s.id)
    }
    return z
  },
  zug(z, wer, zug) {
    if (z.ende || zug.aktion !== 'buchstabe') return
    const b = String(zug.wert ?? '').toLowerCase()
    if (!/^\p{L}$/u.test(b) || z.geraten[wer]?.includes(b)) return
    z.geraten[wer].push(b)
    const w = nurBuchstaben(z.wort[wer])
    if (!w.includes(b)) z.falschZahl[wer]++
    const fertig = [...w].every((c) => z.geraten[wer].includes(c))
    if (fertig) {
      z.geschafft[wer]++
      gut(z, wer, 1)
      melde(z, wer, true, tx(z, 'wortGeschafft'))
      if (z.geschafft[wer] >= z.ziel) return void (z.ende = true)
      return galgenWort(z, wer)
    }
    if (z.falschZahl[wer] >= FEHLER_MAX) {
      fehlerMerken(z, wer, z.item[wer])
      melde(z, wer, false, tx(z, 'neuesWort'), z.wort[wer])
      galgenWort(z, wer)
    }
  },
  sicht(z, wer) {
    const w = z.wort[wer] ?? ''
    const item = z.inhalt.items.find((i) => i.id === z.item[wer])
    const sichtbar = [...w].map((c) => (/\p{L}/u.test(c) && !z.geraten[wer]?.includes(c.toLowerCase()) ? '_' : c)).join(' ')
    const buchstaben = [...new Set([...'abcdefghijklmnopqrstuvwxyz', ...z.inhalt.items.flatMap((i) => [...nurBuchstaben(i.vok?.term ?? '')])])].sort()
    const b: Block[] = [
      standBlock(z.spieler.map((s) => ({ name: s.name, wert: `${z.geschafft[s.id]} / ${z.ziel}`, ...(s.id === wer ? { ich: true } : {}) }))),
      ...rueckBlock(z)
    ]
    if (z.ende) return b
    b.push({ typ: 'text', text: tx(z, 'gesucht', item?.vok?.translation ?? ''), ton: 'info' })
    b.push({ typ: 'text', text: sichtbar, gross: true })
    b.push({ typ: 'fortschritt', titel: tx(z, 'fehlerVonMax', z.falschZahl[wer], FEHLER_MAX), wert: z.falschZahl[wer], max: FEHLER_MAX, ton: 'warn' })
    b.push({
      typ: 'kacheln',
      spalten: 7,
      kacheln: buchstaben.map((c) => ({
        id: c,
        text: c,
        ...(z.geraten[wer]?.includes(c) ? { status: nurBuchstaben(w).includes(c) ? ('gut' as const) : ('aus' as const) } : {})
      })),
      aktion: 'buchstabe'
    })
    return b
  },
  ergebnis: (z) => {
    const sieger = besteNach(z, (id) => z.geschafft[id] ?? 0)
    return versusErgebnis(z, sieger, (id) => z.geschafft[id] ?? 0, siegText(z, sieger), { unentschieden: sieger.length !== 1 })
  }
}

// ---------------------------------------------------------------- Team-Buzzer (Kl. 7–10)

interface Buzzer extends Basis {
  teams: [string[], string[]]
  reihe: string[]
  r: number
  frage: Frage | null
  buzz: string | null
  zweite: 0 | 1 | null
  stand: [number, number]
}
function buzzerRunde(z: Buzzer): void {
  z.buzz = null
  z.zweite = null
  if (z.r >= z.reihe.length) return void (z.ende = true)
  const item = z.inhalt.items.find((i) => i.id === z.reihe[z.r])!
  z.frage = frageAus(z, item, artNach(z))
}
const teamVon = (z: Buzzer, id: string): 0 | 1 => (z.teams[0].includes(id) ? 0 : 1)
export const buzzer: Regeln<Buzzer> = {
  id: 'buzzer',
  passt: (i) => (frageItems(i.items) >= 6 ? null : 'Braucht mindestens sechs Wörter bzw. Aufgaben.'),
  start(k) {
    const z: Buzzer = { ...basisNeu(k), teams: teamsAus(k.spieler), reihe: [], r: 0, frage: null, buzz: null, zweite: null, stand: [0, 0] }
    z.reihe = itemsZiehen(z, 10, { filter: istFrageItem }).map((i) => i.id)
    buzzerRunde(z)
    return z
  },
  zug(z, wer, zug) {
    if (z.ende || !z.frage) return
    if (zug.aktion === 'buzz' && !z.buzz && z.zweite === null) {
      z.buzz = wer
      return
    }
    if (zug.aktion !== 'antwort') return
    const darf = z.zweite === null ? wer === z.buzz : teamVon(z, wer) === z.zweite
    if (!darf) return
    if (antwortRichtig(z.frage, zug.wert)) {
      const p = gewicht(z, wer, z.frage.itemId)
      gut(z, wer, p)
      z.stand[teamVon(z, wer)] += p
      melde(z, wer, true, tx(z, 'fuersTeam', p), z.frage.loesung)
      z.r++
      return buzzerRunde(z)
    }
    fehlerMerken(z, wer, z.frage.itemId)
    if (z.zweite === null) {
      z.zweite = teamVon(z, wer) === 0 ? 1 : 0
      return melde(z, wer, false, tx(z, 'danebenAnderes'))
    }
    melde(z, wer, false, tx(z, 'auchDaneben'), z.frage.loesung)
    z.r++
    buzzerRunde(z)
  },
  sicht(z, wer) {
    const b: Block[] = [
      { typ: 'fortschritt', titel: tx(z, 'frageVon', Math.min(z.r + 1, z.reihe.length), z.reihe.length), wert: z.r, max: z.reihe.length },
      standBlock([0, 1].map((t) => ({ name: teamName(z, z.teams[t]), wert: String(z.stand[t]), ...(teamVon(z, wer) === t ? { ich: true } : {}) }))),
      ...rueckBlock(z)
    ]
    if (z.ende || !z.frage) return b
    const darf = z.zweite === null ? wer === z.buzz : teamVon(z, wer) === z.zweite
    if (!z.buzz) return [...b, { typ: 'text', text: z.frage.frage, gross: true }, { typ: 'knoepfe', knoepfe: [{ text: tx(z, 'buzzer'), aktion: 'buzz', farbe: 'red' }] }]
    if (darf) return [...b, frageBlock(z.frage)]
    return [...b, { typ: 'text', text: z.frage.frage, gross: true }, { typ: 'text', text: z.zweite === null ? tx(z, 'antwortet', name(z, z.buzz)) : tx(z, 'anderesTeamAntwortet'), ton: 'leise' }]
  },
  ergebnis(z) {
    const t = z.stand[0] > z.stand[1] ? 0 : z.stand[1] > z.stand[0] ? 1 : null
    const sieger = t === null ? [] : z.teams[t]
    return versusErgebnis(z, sieger, (id) => z.punkte[id] ?? 0, t === null ? tx(z, 'unentschieden') : tx(z, 'gewonnenHat', teamName(z, sieger)), { unentschieden: t === null })
  }
}

// ---------------------------------------------------------------- Wort-Auktion (Kl. 8–13)

const EINSAETZE = ['10', '20', '30']
interface Auktion extends Basis {
  aussagen: { item: string; text: string; stimmt: boolean; loesung: string }[]
  a: number
  muenzen: Record<string, number>
  gebote: Record<string, { setzt: boolean; betrag: number }>
}
export const auktion: Regeln<Auktion> = {
  id: 'auktion',
  passt: (i) => (frageItems(i.items) >= 6 ? null : 'Braucht mindestens sechs Wörter bzw. Aufgaben.'),
  start(k) {
    const z: Auktion = { ...basisNeu(k), aussagen: [], a: 0, muenzen: {}, gebote: {} }
    for (const s of k.spieler) z.muenzen[s.id] = 100
    for (const i of itemsZiehen(z, 8, { filter: istFrageItem })) {
      const stimmt = zufall(z) < 0.5
      const ab = ablenkerFuer(z, i.loesung, i.ablenker, (x) => (istFrageItem(x) ? x.loesung : undefined), 1)[0]
      const zeige = stimmt || !ab ? i.loesung : ab
      const text = i.vok ? `${i.vok.translation} = ${i.vok.luecke && z.schwierigkeit !== 'leicht' ? zeige : zeige}` : i.frage.includes('___') ? i.frage.replace('___', zeige) : `${i.frage} → ${zeige}`
      z.aussagen.push({ item: i.id, text, stimmt: zeige === i.loesung, loesung: i.vok ? `${i.vok.translation} = ${i.loesung}` : i.loesung })
    }
    return z
  },
  zug(z, wer, zug) {
    if (z.ende || z.gebote[wer]) return
    const [haltung, betrag] = String(zug.wert ?? '').split(':')
    if (zug.aktion !== 'gebot' || !EINSAETZE.includes(betrag) || (haltung !== 'ja' && haltung !== 'nein')) return
    z.gebote[wer] = { setzt: haltung === 'ja', betrag: Math.min(Number(betrag), z.muenzen[wer]) }
    if (!aktive(z).every((s) => z.gebote[s.id])) return
    const a = z.aussagen[z.a]
    for (const [id, g] of Object.entries(z.gebote)) {
      if (g.setzt === a.stimmt) {
        z.muenzen[id] += g.betrag
        gut(z, id)
      } else {
        z.muenzen[id] = Math.max(0, z.muenzen[id] - g.betrag)
        fehlerMerken(z, id, a.item)
      }
    }
    melde(z, '', a.stimmt, a.stimmt ? tx(z, 'aussageStimmte') : tx(z, 'aussageStimmteNicht'), a.loesung)
    z.gebote = {}
    z.a++
    if (z.a >= z.aussagen.length) z.ende = true
  },
  sicht(z, wer) {
    const b: Block[] = [
      { typ: 'fortschritt', titel: tx(z, 'aussageVon', Math.min(z.a + 1, z.aussagen.length), z.aussagen.length), wert: z.a, max: z.aussagen.length },
      { typ: 'text', text: tx(z, 'deineMuenzen', z.muenzen[wer] ?? 0), ton: 'info' },
      ...rueckBlock(z)
    ]
    if (z.ende) return b
    b.push({ typ: 'text', text: z.aussagen[z.a].text, gross: true })
    if (z.gebote[wer]) return [...b, { typ: 'text', text: tx(z, 'gebotAb'), ton: 'leise' }]
    b.push({
      typ: 'knoepfe',
      knoepfe: [
        ...EINSAETZE.map((e) => ({ text: tx(z, 'aufStimmt', e), aktion: 'gebot', wert: `ja:${e}`, farbe: 'green' })),
        ...EINSAETZE.map((e) => ({ text: tx(z, 'aufStimmtNicht', e), aktion: 'gebot', wert: `nein:${e}`, farbe: 'red' }))
      ]
    })
    return b
  },
  ergebnis: (z) => {
    const sieger = besteNach(z, (id) => z.muenzen[id] ?? 0)
    return versusErgebnis(z, sieger, (id) => z.muenzen[id] ?? 0, siegText(z, sieger), { unentschieden: sieger.length !== 1 })
  }
}

// ---------------------------------------------------------------- Wort-Domino (Kl. 5–7)

interface Domino extends Basis {
  /** Kette der Items: Stein k = [Wort von kette[k] | Bedeutung von kette[k+1]] */
  kette: string[]
  steine: { id: string; k: number; besitzer: string; gelegt: boolean }[]
  offen: number
  dran: number
  gelegt: number
}
export const domino: Regeln<Domino> = {
  id: 'domino',
  passt: (i) => (i.items.filter((x) => x.vok).length >= 6 ? null : 'Braucht mindestens sechs Wörter.'),
  start(k) {
    const z: Domino = { ...basisNeu(k), kette: [], steine: [], offen: 0, dran: 0, gelegt: 0 }
    z.kette = [...new Set(itemsZiehen(z, 16, { filter: (i) => Boolean(i.vok) }).map((i) => i.id))].slice(0, Math.min(13, 3 * k.spieler.length + 1))
    const leute = ids(z)
    z.steine = mischen(
      z,
      z.kette.slice(0, -1).map((_, k) => k)
    ).map((k, n) => ({ id: `d${n}${Math.floor(zufall(z) * 1e5).toString(36)}`, k, besitzer: leute[n % leute.length], gelegt: false }))
    return z
  },
  zug(z, wer, zug) {
    if (z.ende || wer !== z.spieler[z.dran].id) return
    const offenItem = z.kette[z.offen]
    const hat = z.steine.find((s) => !s.gelegt && s.besitzer === wer && s.k === z.offen)
    const weiter = (): void => {
      z.dran = naechste(z, ids(z), z.dran)
    }
    if (zug.aktion === 'passen') {
      if (hat) {
        fehlerMerken(z, wer, offenItem)
        melde(z, wer, false, tx(z, 'steinDoch'))
      }
      return weiter()
    }
    if (zug.aktion !== 'stein') return
    const st = z.steine.find((s) => s.id === String(zug.wert) && s.besitzer === wer && !s.gelegt)
    if (!st) return
    if (st.k !== z.offen) {
      fehlerMerken(z, wer, z.kette[st.k])
      melde(z, wer, false, tx(z, 'steinPasstNicht'))
      return weiter()
    }
    st.gelegt = true
    z.offen++
    z.gelegt++
    gut(z, wer, 1)
    melde(z, wer, true, tx(z, 'legtAn'))
    if (z.offen >= z.kette.length - 1 || !z.steine.some((s) => s.besitzer === wer && !s.gelegt)) z.ende = true
    else weiter()
  },
  sicht(z, wer) {
    const it = (id: string) => z.inhalt.items.find((i) => i.id === id)!.vok!
    const b: Block[] = [...rueckBlock(z)]
    if (!z.ende) {
      b.push({ typ: 'text', text: tx(z, 'offen', it(z.kette[z.offen]).translation), gross: true, ton: 'info' })
      b.push(wer === z.spieler[z.dran].id ? { typ: 'text', text: tx(z, 'dominoDran'), ton: 'info' } : { typ: 'text', text: tx(z, 'istDran', name(z, z.spieler[z.dran].id)), ton: 'leise' })
    }
    const meine = z.steine.filter((s) => s.besitzer === wer && !s.gelegt)
    b.push({
      typ: 'kacheln',
      titel: tx(z, 'deineSteine', meine.length),
      kacheln: meine.map((s) => ({ id: s.id, text: `${it(z.kette[s.k]).term} | ${it(z.kette[s.k + 1]).translation}` })),
      ...(wer === z.spieler[z.dran].id && !z.ende ? { aktion: 'stein' } : {})
    })
    if (wer === z.spieler[z.dran].id && !z.ende) b.push({ typ: 'knoepfe', knoepfe: [{ text: tx(z, 'passen'), aktion: 'passen' }] })
    return b
  },
  weg(z, wer) {
    const rest = aktive(z).map((s) => s.id)
    z.steine.forEach((s, n) => {
      if (s.besitzer === wer && rest.length) s.besitzer = rest[n % rest.length]
    })
    if (z.spieler[z.dran].id === wer) z.dran = naechste(z, ids(z), z.dran)
  },
  ergebnis: (z) => {
    const leer = aktive(z).filter((s) => !z.steine.some((x) => x.besitzer === s.id && !x.gelegt)).map((s) => s.id)
    const sieger = leer.length ? leer : besteNach(z, (id) => z.punkte[id] ?? 0)
    return versusErgebnis(z, sieger, (id) => z.punkte[id] ?? 0, siegText(z, sieger), { unentschieden: sieger.length !== 1 })
  }
}

// ---------------------------------------------------------------- Stadt-Land-Fluss (Kl. 6–10; der Server prüft gegen den Kurs)

const SLF_ZEIT = 90_000
interface Kategorie {
  id: string
  titel: string
}
interface Slf extends Basis {
  runden: { buchstabe: string; kategorien: Kategorie[] }[]
  r: number
  antworten: Record<string, Record<string, string>>
  fertig: string[]
  bis: number | null
  bewertung: string[]
}
const KATEGORIEN: Kategorie[] = [
  { id: 'wort', titel: 'Ein Wort aus dem Kurs' },
  { id: 'lang', titel: 'Ein Wort mit mindestens 5 Buchstaben' },
  { id: 'nomen', titel: 'Ein Nomen' },
  { id: 'verb', titel: 'Ein Verb' },
  { id: 'deutsch', titel: 'Die deutsche Bedeutung eines Kursworts (das Kurswort beginnt mit dem Buchstaben)' }
]
/** Titel der Kategorien in der Zielsprache (09.10.2026) */
const KATEGORIE_TEXT: Record<string, TextSchluessel> = { wort: 'slfWort', lang: 'slfLang', nomen: 'slfNomen', verb: 'slfVerb', deutsch: 'slfDeutsch' }
const posArt = (pos: string | undefined): 'nomen' | 'verb' | null =>
  !pos ? null : /^\(?\s*(n|noun|nm|nf|nt|s|subst)\b/i.test(pos) ? 'nomen' : /^\(?\s*(v|verb|vt|vi)\b/i.test(pos) ? 'verb' : null
/** Gilt die Antwort? Nur Wörter des Kurses (Fremdsprache bzw. bei „deutsch" die Bedeutung) */
export function slfGilt(z: Basis, kat: string, buchstabe: string, antwort: string): string | null {
  const a = antwort.trim()
  if (!a) return null
  for (const i of z.inhalt.items) {
    const v = i.vok
    if (!v || v.term[0]?.toLowerCase() !== buchstabe) continue
    if (kat === 'deutsch') {
      if (gleicherText(kernform(a), kernform(v.translation)) || v.translation.split(/[,;/]/).some((t) => gleicherText(kernform(t), kernform(a)))) return i.id
      continue
    }
    if (!gleicherText(kernform(a), kernform(v.term)) && !gleicherText(a, v.term)) continue
    if (kat === 'lang' && v.term.replace(/[^\p{L}]/gu, '').length < 5) continue
    if ((kat === 'nomen' || kat === 'verb') && posArt(v.pos) !== kat) continue
    return i.id
  }
  return null
}
function slfAuswerten(z: Slf): void {
  const runde = z.runden[z.r]
  const zeilen: string[] = []
  for (const kat of runde.kategorien) {
    const gueltig = new Map<string, string[]>()
    for (const s of aktive(z)) {
      const a = z.antworten[s.id]?.[kat.id] ?? ''
      const id = slfGilt(z, kat.id, runde.buchstabe, a)
      if (id) gueltig.set(s.id, [id, kernform(a).toLowerCase()])
      else if (a.trim()) zeilen.push(tx(z, 'zaehltNicht', s.name, a))
    }
    for (const [sid, [, norm]] of gueltig) {
      const doppelt = [...gueltig.entries()].some(([o, [, n]]) => o !== sid && n === norm)
      z.punkte[sid] = (z.punkte[sid] ?? 0) + (doppelt ? 1 : 2)
      gut(z, sid)
    }
  }
  z.bewertung = zeilen
  melde(z, '', true, tx(z, 'rundeAusgewertet', z.r + 1))
  z.r++
  z.antworten = {}
  z.fertig = []
  if (z.r >= z.runden.length) z.ende = true
}
export const stadtland: Regeln<Slf> = {
  id: 'stadtland',
  passt: (i) => (i.items.filter((x) => x.vok).length >= 15 ? null : 'Braucht mindestens 15 Wörter.'),
  start(k) {
    const z: Slf = { ...basisNeu(k), runden: [], r: 0, antworten: {}, fertig: [], bis: null, bewertung: [] }
    const je = new Map<string, number>()
    for (const i of z.inhalt.items) if (i.vok) je.set(i.vok.term[0].toLowerCase(), (je.get(i.vok.term[0].toLowerCase()) ?? 0) + 1)
    const buchstaben = mischen(
      z,
      [...je.entries()].filter(([b, n]) => n >= 2 && /\p{L}/u.test(b)).map(([b]) => b)
    ).slice(0, 3)
    for (const b of buchstaben) {
      const mitPos = (art: string) => z.inhalt.items.some((i) => i.vok?.term[0].toLowerCase() === b && posArt(i.vok.pos) === art)
      const kategorien = KATEGORIEN.filter((c) => (c.id === 'nomen' || c.id === 'verb' ? mitPos(c.id) : true)).slice(0, 4)
      z.runden.push({ buchstabe: b, kategorien })
    }
    z.bis = z.zeitdruck ? k.jetzt + SLF_ZEIT : null
    return z
  },
  zug(z, wer, zug, jetzt) {
    if (z.ende || zug.aktion !== 'antworten' || z.fertig.includes(wer)) return
    const w = zug.wert && typeof zug.wert === 'object' ? (zug.wert as Record<string, unknown>) : {}
    z.antworten[wer] = Object.fromEntries(z.runden[z.r].kategorien.map((c) => [c.id, String(w[c.id] ?? '').slice(0, 40)]))
    z.fertig.push(wer)
    if (aktive(z).every((s) => z.fertig.includes(s.id))) {
      slfAuswerten(z)
      if (!z.ende && z.zeitdruck) z.bis = jetzt + SLF_ZEIT
    }
  },
  tick(z, jetzt) {
    if (z.ende || !z.bis || jetzt < z.bis) return false
    slfAuswerten(z)
    if (!z.ende) z.bis = jetzt + SLF_ZEIT
    return true
  },
  sicht(z, wer) {
    const b: Block[] = [{ typ: 'text', text: tx(z, 'deinePunkte', z.punkte[wer] ?? 0), ton: 'info' }, ...rueckBlock(z)]
    if (z.bewertung.length) b.push({ typ: 'text', text: z.bewertung.join(' · '), ton: 'leise' })
    if (z.ende) return b
    const runde = z.runden[z.r]
    b.push({ typ: 'text', text: tx(z, 'rundeBuchstabe', z.r + 1, runde.buchstabe.toUpperCase()), gross: true })
    if (z.bis) b.push({ typ: 'uhr', bis: z.bis })
    b.push({
      typ: 'eingaben',
      felder: runde.kategorien.map((c) => ({ id: c.id, titel: tx(z, KATEGORIE_TEXT[c.id] ?? 'slfWort') })),
      aktion: 'antworten',
      gesperrt: z.fertig.includes(wer)
    })
    if (z.fertig.includes(wer)) b.push({ typ: 'text', text: tx(z, 'abgegebenWarte'), ton: 'leise' })
    return b
  },
  ergebnis: (z) => {
    const sieger = besteNach(z, (id) => z.punkte[id] ?? 0)
    return versusErgebnis(z, sieger, (id) => z.punkte[id] ?? 0, siegText(z, sieger), { unentschieden: sieger.length !== 1 })
  }
}

// ---------------------------------------------------------------- Fehler-Sniper (Kl. 8–13)

const SPERRE_MS = 3000
interface Sniper extends Basis {
  reihe: string[]
  r: number
  sperre: Record<string, number>
  versuche: Record<string, number>
  finder: string | null
  verbessern: Frage | null
  /** Wer „Überspringen" gedrückt hat (alle Anwesenden → nächster Satz; 09.10.2026: nie hängen bleiben) */
  skip: string[]
}
function sniperRunde(z: Sniper): void {
  z.finder = null
  z.verbessern = null
  z.versuche = {}
  z.skip = []
  if (z.r >= z.reihe.length) z.ende = true
}
export const sniper: Regeln<Sniper> = {
  id: 'sniper',
  passt: (i) => (i.items.filter((x) => x.fehler).length >= 3 ? null : 'Braucht mindestens drei Sätze mit Fehler.'),
  start(k) {
    const z: Sniper = { ...basisNeu(k), reihe: [], r: 0, sperre: {}, versuche: {}, finder: null, verbessern: null, skip: [] }
    z.reihe = [...new Set(itemsZiehen(z, 6, { filter: (i) => Boolean(i.fehler) }).map((i) => i.id))]
    return z
  },
  zug(z, wer, zug, jetzt) {
    if (z.ende) return
    const item = z.inhalt.items.find((i) => i.id === z.reihe[z.r])!
    const f = item.fehler!
    const weiter = (): void => {
      z.r++
      sniperRunde(z)
    }
    if (zug.aktion === 'weiter' && !z.finder) {
      if (!z.skip.includes(wer)) z.skip.push(wer)
      if (aktive(z).every((s) => z.skip.includes(s.id))) {
        melde(z, '', false, tx(z, 'uebersprungen'), `${f.wort} → ${f.korrektur}`)
        weiter()
      }
      return
    }
    if ((z.sperre[wer] ?? 0) > jetzt) return
    if (zug.aktion === 'wort' && !z.finder) {
      const i = Number(zug.wert)
      const wort = satzTeile(f.satz)[i]
      if (!wort) return
      if (f.stellen.includes(i)) {
        z.finder = wer
        z.verbessern = { itemId: item.id, frage: f.satz, zusatz: tx(z, 'wieRichtig', f.wort), optionen: [], loesung: f.korrektur }
        if (z.tippen) z.verbessern.tippen = true
        else z.verbessern.optionen = mischen(z, [f.korrektur, ...ablenkerFuer(z, f.korrektur, [f.wort], (x) => x.fehler?.korrektur ?? x.vok?.term, 3)])
        return melde(z, wer, true, tx(z, 'fehlerEntdeckt'))
      }
      z.sperre[wer] = jetzt + SPERRE_MS
      z.versuche[wer] = (z.versuche[wer] ?? 0) + 1
      fehlerMerken(z, wer, item.id)
      melde(z, wer, false, tx(z, 'danebenPause'))
      if (aktive(z).every((s) => (z.versuche[s.id] ?? 0) >= 2)) {
        melde(z, '', false, tx(z, 'niemandGefunden'), `${f.wort} → ${f.korrektur}`)
        weiter()
      }
      return
    }
    if (zug.aktion === 'antwort' && z.finder === wer && z.verbessern) {
      if (antwortRichtig(z.verbessern, zug.wert)) {
        const p = gewicht(z, wer, item.id)
        gut(z, wer, p)
        melde(z, wer, true, `+${p}!`, f.korrektur)
      } else {
        fehlerMerken(z, wer, item.id)
        melde(z, wer, false, tx(z, 'verbesserungFalsch'), f.korrektur)
      }
      weiter()
    }
  },
  sicht(z, wer, jetzt) {
    const b: Block[] = [
      { typ: 'fortschritt', titel: tx(z, 'satzVon', Math.min(z.r + 1, z.reihe.length), z.reihe.length), wert: z.r, max: z.reihe.length },
      { typ: 'text', text: tx(z, 'deinePunkte', z.punkte[wer] ?? 0), ton: 'info' },
      ...rueckBlock(z)
    ]
    if (z.ende) return b
    const f = z.inhalt.items.find((i) => i.id === z.reihe[z.r])!.fehler!
    const gesperrt = (z.sperre[wer] ?? 0) > jetzt
    if (gesperrt) b.push({ typ: 'uhr', bis: z.sperre[wer], text: tx(z, 'pause') })
    b.push({
      typ: 'kacheln',
      titel: z.finder ? tx(z, 'gefunden') : tx(z, 'tippeFalsches'),
      kacheln: satzTeile(f.satz).map((w, i) => ({ id: String(i), text: w, ...(z.finder && f.stellen.includes(i) ? { status: 'schlecht' as const } : {}) })),
      ...(z.finder || gesperrt ? {} : { aktion: 'wort' })
    })
    if (z.finder === wer && z.verbessern) b.push(frageBlock(z.verbessern))
    else if (z.finder) b.push({ typ: 'text', text: tx(z, 'verbessert', name(z, z.finder)), ton: 'leise' })
    else
      b.push({
        typ: 'knoepfe',
        knoepfe: [{ text: z.skip.includes(wer) ? tx(z, 'warteAndere') : tx(z, 'findeNicht'), aktion: 'weiter', gesperrt: z.skip.includes(wer) }]
      })
    return b
  },
  weg(z, wer) {
    // Wer gerade verbessert, geht: Satz auflösen und weiter; sonst ggf. die fehlende Stimme zum Überspringen
    if (z.ende) return
    const f = z.inhalt.items.find((i) => i.id === z.reihe[z.r])?.fehler
    if (z.finder === wer || (!z.finder && aktive(z).length && aktive(z).every((s) => z.skip.includes(s.id)))) {
      if (f) melde(z, '', false, tx(z, 'naechsterSatz'), `${f.wort} → ${f.korrektur}`)
      z.r++
      sniperRunde(z)
    }
  },
  ergebnis: (z) => {
    const sieger = besteNach(z, (id) => z.punkte[id] ?? 0)
    return versusErgebnis(z, sieger, (id) => z.punkte[id] ?? 0, siegText(z, sieger), { unentschieden: sieger.length !== 1 })
  }
}

