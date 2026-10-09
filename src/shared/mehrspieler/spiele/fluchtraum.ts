/**
 * Fluchtraum (Kooperativ), neu gestaltet 09.10.2026 (Entscheidung der Lehrkraft): Das Schloss öffnet ein CODEWORT
 * statt Ziffern – ein schweres Wort, das alle Mitspielenden im Kurs haben und lernen sollten (das gemeinsam
 * wackeligste Wort nach den Bändern aller). Seine Buchstaben gibt es als Belohnung: Je Buchstabe braucht das Team
 * mehrere richtige Antworten (leicht 2, mittel 3, schwer 3–4, unmöglich 4 – gemeinsam gezählt). Ab „schwer" kommen die
 * Buchstaben ohne ihre Stelle – das Team muss das Wort zusammensetzen.
 *
 * Hinweise zum Codewort in der Zielsprache, nach Klasse: 5–6 kurze, einfache Sätze und das Bild; 7–8 Umschreibungen
 * (Wortart, Synonym, Lückensatz); ab 9 eine einsprachige Definition. Alles aus den Kursdaten (Beispielsätze mit Lücke,
 * Synonyme, Wortart) – keine KI beim Spielen. Mit jedem Buchstaben kommt ein weiterer Hinweis dazu.
 *
 * Der Server prüft alles; das Codewort steht nie in einer Sicht, bevor es geraten ist (das Codewort-Item fehlt in
 * den Aufgaben und unter den Ablenkern, Aufgaben mit dem Wort im Text fallen weg).
 */
import {
  antwortRichtig,
  aktive,
  basisNeu,
  fehlerMerken,
  frageAus,
  frageBlock,
  gut,
  itemsZiehen,
  koopErgebnis,
  melde,
  mischen,
  rueckBlock,
  tx,
  zufall,
  type Basis,
  type Block,
  type FragenArt,
  type Regeln,
  type StartKontext
} from '../kern'
import { istFrageItem } from '../inhalt'
import { BAND_RANG, type Frage, type SpielInhalt, type SpielItem } from '../typen'
import { frageItems } from './hilfen'
import { normiert } from '../../grammatiktrainer'
import { einfacheSprache, textSprache, wortartVon } from '../../spielSprache'

interface Hinweis {
  text: string
  bild?: string
}
interface Z extends Basis {
  /** Codewort und seine Bedeutung – nur auf dem Server */
  wort: string
  wortDe: string
  /** Stellen in der Reihenfolge, in der sie freigeschaltet werden */
  reihenfolge: number[]
  frei: number
  noetig: number
  zaehler: number
  anagramm: boolean
  aufgaben: Record<string, Frage | null>
  hinweise: Hinweis[]
  fehlversuche: number
  bis: number | null
  entkommen: boolean
  vorrat: string[]
  dauer: number
}

/** Ersatz, wenn der Kurs kein passendes Wort hat (z. B. Grammatik mit langen Lösungen) */
const ERSATZ: Record<string, [string, string]> = {
  de: ['Ausgang', 'Ausgang'],
  en: ['escape', 'Flucht'],
  fr: ['sortie', 'Ausgang'],
  es: ['salida', 'Ausgang'],
  it: ['uscita', 'Ausgang'],
  la: ['porta', 'Tür'],
  ru: ['выход', 'Ausgang'],
  nl: ['uitgang', 'Ausgang'],
  pt: ['saída', 'Ausgang'],
  pl: ['wyjście', 'Ausgang'],
  cs: ['východ', 'Ausgang'],
  tr: ['çıkış', 'Ausgang'],
  da: ['udgang', 'Ausgang'],
  el: ['έξοδος', 'Ausgang'],
  grc: ['ἔξοδος', 'Ausgang'],
  zh: ['出口', 'Ausgang'],
  ja: ['出口', 'Ausgang'],
  ar: ['مخرج', 'Ausgang']
}

const nurBuchstaben = (s: string): boolean => /^\p{L}+$/u.test(s)
const buchstabenVon = (s: string): string[] => Array.from(s.normalize('NFC'))
/** Vergleich beim Raten: Groß/klein, Längenzeichen und Akzente egal */
const kern = (s: string): string =>
  normiert(s)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}]/gu, '')
const enthaeltWort = (text: string | undefined, wort: string): boolean => {
  if (!text) return false
  const w = kern(wort)
  return text.split(/[^\p{L}]+/u).some((t) => t && kern(t) === w)
}

/** Antworten je Buchstabe nach Schwierigkeit (schwer: 3 zu zweit, 4 ab drei Personen) */
export const antwortenJeBuchstabe = (schwierigkeit: string, personen: number): number =>
  schwierigkeit === 'leicht' ? 2 : schwierigkeit === 'mittel' ? 3 : schwierigkeit === 'schwer' ? (personen >= 3 ? 4 : 3) : 4

/** Das Wort eines Items, das als Codewort taugt (ein Wort, nur Buchstaben) */
function wortVon(i: SpielItem): string | null {
  const w = (i.vok ? i.vok.term : istFrageItem(i) ? i.loesung : '').trim()
  return w && nurBuchstaben(w) ? w : null
}

/**
 * Codewort wählen: das schwerste gemeinsame Wort – zuerst nach dem Band der Person, für die es am LEICHTESTEN ist
 * (wackelig für alle), dann nach dem Band der Gruppe; unter den Besten zufällig. Länge nach Klasse.
 */
export function codewortWaehlen(k: StartKontext, z: { saat: number }): SpielItem | null {
  const einfach = einfacheSprache(k.jahrgang)
  // Chinesisch/Japanisch: Wörter aus wenigen Schriftzeichen
  const cjk = ['zh', 'ja'].includes(textSprache(k.inhalt.sprache))
  const [min, max] = cjk ? [2, 6] : einfach ? [3, 8] : [4, 12]
  const rang = (b: string | null | undefined): number => (b ? BAND_RANG[b as keyof typeof BAND_RANG] : 1)
  const alle = k.inhalt.items.flatMap((i) => {
    const w = wortVon(i)
    return w ? [{ i, w }] : []
  })
  const passend = alle.filter((x) => buchstabenVon(x.w).length >= min && buchstabenVon(x.w).length <= max)
  const pool = passend.length ? passend : alle.filter((x) => buchstabenVon(x.w).length >= (cjk ? 2 : 3) && buchstabenVon(x.w).length <= 14)
  if (!pool.length) return null
  const wert = (id: string): number => {
    const je = k.spieler.map((s) => rang(k.band.je[s.id]?.[id] ?? k.band.gemeinsam[id]))
    return Math.min(...je) * 10 + rang(k.band.gemeinsam[id])
  }
  const bewertet = pool.map((x) => ({ ...x, v: wert(x.i.id), r: zufall(z) })).sort((a, b) => b.v - a.v || a.r - b.r)
  const beste = bewertet.filter((x) => x.v === bewertet[0].v).slice(0, 5)
  return beste[Math.floor(zufall(z) * beste.length)].i
}

/** Andere Wörter mit gleicher Bedeutung (aus den Synonymgruppen des Kurses) */
function synonymVon(inhalt: SpielInhalt, wort: string): string | null {
  const w = kern(wort)
  for (const g of inhalt.synonyme) if (g.woerter.some((x) => kern(x) === w)) return g.woerter.find((x) => kern(x) !== w) ?? null
  return null
}

/** Hinweise zum Codewort in der Zielsprache – nach Klasse gestuft, ohne das Wort selbst */
function hinweiseFuer(z: Basis, item: SpielItem | null, wort: string, inhalt: SpielInhalt): Hinweis[] {
  const n = buchstabenVon(wort).length
  const laenge: Hinweis = { text: tx(z, 'hLaenge', n) }
  if (!item) return [laenge]
  const v = item.vok
  if (!v) {
    // Grammatik: die Aufgabe, deren Lösung das Codewort ist
    const aufgabe = [item.frage, item.zusatz].filter(Boolean).join(' – ')
    return [laenge, ...(aufgabe ? [{ text: tx(z, 'hAufgabe', aufgabe) }] : [])]
  }
  const art = wortartVon(v.pos)
  const artSatz: Hinweis | null = art ? { text: tx(z, art === 'nomen' ? 'hNomen' : art === 'verb' ? 'hVerb' : art === 'adj' ? 'hAdj' : 'hAdv') } : null
  const luecke: Hinweis | null = v.luecke ? { text: tx(z, 'hLuecke', `${v.luecke.vor}___${v.luecke.nach}`) } : null
  const synonym = synonymVon(inhalt, wort)
  const bild: Hinweis | null = v.bild ? { text: tx(z, 'hBild'), bild: v.bild } : null
  let aus: (Hinweis | null)[]
  if (z.jahrgang !== null && z.jahrgang <= 6) aus = [laenge, bild, artSatz, luecke]
  else if (z.jahrgang === null || z.jahrgang <= 8) aus = [laenge, artSatz, synonym ? { text: tx(z, 'hSynonym', synonym) } : null, luecke, bild]
  else {
    const artikel = tx(z, art === 'nomen' ? 'wortartNomen' : art === 'verb' ? 'wortartVerb' : art === 'adj' ? 'wortartAdj' : art === 'adv' ? 'wortartAdv' : 'wortartWort')
    aus = [
      synonym ? { text: tx(z, 'hDefinition', artikel, n, synonym) } : laenge,
      synonym ? null : artSatz,
      v.luecke ? { text: tx(z, 'hGebrauch', `${v.luecke.vor}___${v.luecke.nach}`) } : null,
      bild
    ]
  }
  // Sicherheitsnetz: nie ein Hinweis, der das Wort enthält
  return aus.filter((h): h is Hinweis => Boolean(h) && !enthaeltWort(h!.text, wort))
}

/** Fragenart der eigenen Aufgabe nach Klasse: 5–6 erkennen/abrufen, 7–8 dazu Lückensätze, ab 9 Lücke und Abruf */
function artFuer(z: Z, wer: string): FragenArt {
  if (z.inhalt.bereich === 'gram') return 'standard'
  const platz = z.spieler.findIndex((p) => p.id === wer)
  const arten: FragenArt[] = z.jahrgang !== null && z.jahrgang <= 6 ? ['erkennen', 'abrufen'] : z.jahrgang !== null && z.jahrgang >= 9 ? ['luecke', 'abrufen'] : ['luecke', 'abrufen', 'erkennen']
  return arten[(platz + z.frei + z.zaehler) % arten.length]
}

function aufgabeFuer(z: Z, wer: string): Frage | null {
  if (!z.inhalt.items.length) return null
  if (!z.vorrat.length) z.vorrat = itemsZiehen(z, 16, { filter: istFrageItem }).map((i) => i.id)
  const art = artFuer(z, wer)
  // Lückensatz nur mit Beispielsatz
  const k = z.vorrat.findIndex((id) => art !== 'luecke' || z.inhalt.items.find((i) => i.id === id)?.vok?.luecke)
  const id = z.vorrat.splice(k >= 0 ? k : 0, 1)[0]
  const item = z.inhalt.items.find((i) => i.id === id)
  return item ? frageAus(z, item, art === 'luecke' && !item.vok?.luecke ? 'abrufen' : art) : null
}

const fertigFrei = (z: Z): boolean => z.frei >= z.reihenfolge.length

export const fluchtraum: Regeln<Z> = {
  id: 'fluchtraum',
  passt: (i) => (frageItems(i.items) >= 6 ? null : 'Braucht mindestens sechs Wörter bzw. Aufgaben.'),
  start(k) {
    const b = basisNeu(k)
    const item = codewortWaehlen(k, b)
    const ersatz = ERSATZ[textSprache(k.inhalt.sprache)] ?? ERSATZ.en
    const wort = item ? wortVon(item)! : ersatz[0]
    const wortDe = item ? (item.vok ? item.vok.translation : item.frage) : ersatz[1]
    // Aufgaben ohne das Codewort: weder als Aufgabe noch als Ablenker noch im Fragetext
    const items = k.inhalt.items.filter(
      (i) => i.id !== item?.id && !enthaeltWort(i.vok?.term, wort) && !enthaeltWort(i.frage, wort) && !enthaeltWort(i.loesung, wort) && !enthaeltWort(i.vok?.beispiel, wort)
    )
    const inhalt: SpielInhalt = { ...k.inhalt, items }
    const n = buchstabenVon(wort).length
    const noetig = antwortenJeBuchstabe(b.schwierigkeit, k.spieler.length)
    const z: Z = {
      ...b,
      inhalt,
      wort,
      wortDe,
      reihenfolge: [],
      frei: 0,
      noetig,
      zaehler: 0,
      anagramm: b.schwierigkeit === 'schwer' || b.schwierigkeit === 'unmoeglich',
      aufgaben: {},
      hinweise: [],
      fehlversuche: 0,
      bis: null,
      entkommen: false,
      vorrat: [],
      dauer: 0
    }
    z.reihenfolge = mischen(
      z,
      Array.from({ length: n }, (_, i) => i)
    )
    z.hinweise = hinweiseFuer(z, item, wort, k.inhalt)
    if (b.zeitdruck) z.bis = k.jetzt + Math.max(8 * 60_000, Math.ceil((n * noetig) / Math.max(1, k.spieler.length)) * 35_000 + 3 * 60_000)
    for (const p of aktive(z)) z.aufgaben[p.id] = aufgabeFuer(z, p.id)
    return z
  },
  zug(z, wer, zug, jetzt) {
    if (z.ende) return
    if (zug.aktion === 'antwort') {
      const f = z.aufgaben[wer]
      if (!f || fertigFrei(z)) return
      if (antwortRichtig(f, zug.wert)) {
        gut(z, wer)
        z.zaehler++
        if (z.zaehler >= z.noetig) {
          z.zaehler = 0
          z.frei++
          melde(z, wer, true, tx(z, 'buchstabeFrei'))
        } else melde(z, wer, true, tx(z, 'richtigWeiter', z.zaehler, z.noetig))
      } else {
        fehlerMerken(z, wer, f.itemId)
        melde(z, wer, false, tx(z, 'neueAufgabe'), f.loesung)
      }
      z.aufgaben[wer] = fertigFrei(z) ? null : aufgabeFuer(z, wer)
      return
    }
    if (zug.aktion === 'wort') {
      const versuch = String(zug.wert ?? '').slice(0, 60)
      if (!kern(versuch)) return
      if (kern(versuch) !== kern(z.wort)) {
        z.fehlversuche++
        return melde(z, wer, false, tx(z, 'falschesWort'))
      }
      z.frei = z.reihenfolge.length
      z.entkommen = true
      z.ende = true
      z.dauer = Math.round((jetzt - z.start) / 1000)
      gut(z, wer)
      melde(z, wer, true, tx(z, 'entkommen', z.wort, z.wortDe))
    }
  },
  tick(z, jetzt) {
    if (z.ende || !z.bis || jetzt < z.bis) return false
    z.ende = true
    melde(z, '', false, tx(z, 'zeitAusWort', z.wort, z.wortDe))
    return true
  },
  sicht(z, wer) {
    const buchstaben = buchstabenVon(z.wort)
    const b: Block[] = [{ typ: 'fortschritt', titel: tx(z, 'codewortN', buchstaben.length), wert: Math.min(z.frei, buchstaben.length), max: buchstaben.length }]
    if (z.bis && !z.ende) b.push({ typ: 'uhr', bis: z.bis, text: tx(z, 'gemeinsameZeit') })
    b.push(...rueckBlock(z))
    if (z.ende) return b
    const offen = new Set(z.reihenfolge.slice(0, z.frei))
    if (!fertigFrei(z)) {
      if (z.aufgaben[wer]) b.push(frageBlock(z.aufgaben[wer]!))
      b.push({ typ: 'text', text: tx(z, 'bisBuchstabe', z.noetig - z.zaehler), ton: 'leise' })
    } else b.push({ typ: 'text', text: tx(z, 'alleBuchstaben'), ton: 'info', gross: true })
    b.push({
      typ: 'codewort',
      felder: buchstaben.map((c, i) => (!z.anagramm && offen.has(i) ? c.toUpperCase() : null)),
      // Ab „schwer": gefundene Buchstaben ohne Stelle (alphabetisch – verrät die Reihenfolge nicht)
      ...(z.anagramm ? { buchstaben: [...offen].map((i) => buchstaben[i].toUpperCase()).sort((x, y) => x.localeCompare(y)) } : {}),
      aktion: 'wort',
      titel: z.anagramm ? tx(z, 'buchstabenGefunden') : tx(z, 'codewort'),
      platzhalter: tx(z, 'wortEingeben'),
      knopf: tx(z, 'tuerOeffnen')
    })
    // Hinweise: der erste sofort, mit jedem Buchstaben einer mehr
    const sichtbar = z.hinweise.slice(0, Math.min(z.hinweise.length, 1 + z.frei))
    if (sichtbar.length) {
      b.push({ typ: 'text', text: tx(z, 'hinweise'), ton: 'info' })
      for (const h of sichtbar) {
        b.push({ typ: 'text', text: h.text })
        if (h.bild) b.push({ typ: 'kacheln', kacheln: [{ id: 'bild', bild: h.bild }], spalten: 1 })
      }
    }
    if (z.fehlversuche) b.push({ typ: 'text', text: tx(z, 'fehlversuche', z.fehlversuche), ton: 'leise' })
    return b
  },
  weg(z, wer) {
    z.aufgaben[wer] = null
  },
  ergebnis: (z) =>
    koopErgebnis(
      z,
      z.entkommen,
      z.entkommen ? z.dauer : null,
      z.entkommen ? tx(z, 'entkommenIn', `${Math.floor(z.dauer / 60)}:${String(z.dauer % 60).padStart(2, '0')}`) : tx(z, 'nichtGereicht'),
      z.entkommen && z.fehlversuche === 0
    )
}
