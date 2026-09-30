/**
 * Schaltpläne als NETZLISTE – Datenmodell, Bereinigung und elektrische Prüfung (30.09.2026, 2. Fassung).
 *
 * Befund der Lehrkraft (Physik): „Die Schaltzeichnungen kann man nicht erkennen. Die neue Art,
 * die Bilder zu generieren, ist unzuverlässig (und zu klein)." Nachgestellt mit zwölf Blättern
 * (einfacher Stromkreis bis Wechselschaltung) zeigte sich:
 *  - Das alte Modell kannte nur „oben/unten/Zweige rechts" und acht Bauteilarten. Wechselschalter,
 *    Diode, LED, Klingel und Taster gab es nicht – die KI wich auf falsche Bauteile aus, oder das
 *    Bauteil fiel bei der Bereinigung STUMM weg (Schaltplan ohne Diode, ohne Klingel …).
 *  - Überzählige Bauteile wurden ebenso stumm abgeschnitten (höchstens 4 je Leitung).
 *  - Ob der Kreis geschlossen ist, ob jedes Bauteil angeschlossen ist, ob ein Messgerät richtig
 *    liegt, prüfte niemand; bei einer leeren Antwort lief die Bildsuche – mit fremden Bildern.
 *
 * Jetzt beschreibt die KI jeden Schaltkreis als Netzliste: Bauteile mit ihren Anschlüssen an
 * benannten Knoten. Daraus baut `analysiereKreis` einen Reihen-/Parallel-Baum (Serien- und
 * Parallelreduktion), der sich deterministisch und kreuzungsfrei zeichnen lässt – und meldet
 * dabei jeden Fehler mit Namen: offene Enden, nicht verbundene Bauteile, Kurzschlüsse,
 * Spannungsmesser in Reihe, zu komplexe (nicht reihen-/parallel-zerlegbare) Schaltungen.
 * Die Meldungen gehen als gezielte Korrekturanfrage zurück an die KI (generation/schaltplan.ts).
 */

export const SCHALT_ARTEN = [
  'batterie',
  'lampe',
  'schalter_offen',
  'schalter_geschlossen',
  'taster',
  'wechselschalter',
  'widerstand',
  'amperemeter',
  'voltmeter',
  'motor',
  'diode',
  'led',
  'klingel',
  'sicherung',
  'leitung'
] as const
export type SchaltArt = (typeof SCHALT_ARTEN)[number]

export const SCHALT_NAMEN: Record<SchaltArt, string> = {
  batterie: 'Batterie/Spannungsquelle',
  lampe: 'Lampe',
  schalter_offen: 'Schalter (offen)',
  schalter_geschlossen: 'Schalter (geschlossen)',
  taster: 'Taster/Klingelknopf (nicht gedrückt)',
  wechselschalter: 'Wechselschalter (drei Anschlüsse)',
  widerstand: 'Widerstand',
  amperemeter: 'Strommessgerät',
  voltmeter: 'Spannungsmessgerät',
  motor: 'Motor',
  diode: 'Diode',
  led: 'Leuchtdiode (LED)',
  klingel: 'Klingel',
  sicherung: 'Sicherung',
  leitung: 'Leitung'
}

export interface SchaltBauteil {
  /** Kurzname, eindeutig im Schaltkreis (B1, L1, S1 …) */
  id: string
  art: SchaltArt
  /** Knoten am ersten Anschluss – Batterie: Pluspol; Diode/LED: Anode; Wechselschalter: Mittelkontakt */
  von: string
  /** Knoten am zweiten Anschluss – Batterie: Minuspol; Diode/LED: Kathode; Wechselschalter: Kontakt 1 */
  nach: string
  /** Nur Wechselschalter: Knoten an Kontakt 2 */
  nach2?: string
  /** Nur Wechselschalter: Mittelkontakt liegt an Kontakt 1 oder 2 */
  stellung?: 1 | 2
  /** Beschriftung am Bauteil; leer = keine */
  beschriftung?: string
  /** true = auf dem Schülerblatt eine leere Linie, im Lösungsteil der Text */
  leer?: boolean
}

export interface Schaltkreis {
  /** Kurzer Name unter dem Schaltkreis, z. B. „A: Schalter offen" */
  titel?: string
  bauteile: SchaltBauteil[]
}

export interface SchaltplanSpec {
  /** 2 = Netzliste (seit 30.09.2026); ältere Pläne (oben/unten/Zweige) werden beim Lesen umgesetzt */
  version: 2
  /** 1 oder 2 Schaltkreise (z. B. offen / geschlossen) */
  kreise: Schaltkreis[]
  /** Gewollte Sonderfälle (Kurzschluss, falsch angeschlossenes Messgerät) – gelten auch beim Neuzeichnen */
  erlaubt?: AnalyseOptionen
}

// ---------- Grenzen ----------

export const MAX_KREISE = 2
/** Mehr Bauteile je Schaltkreis sind auf einem Arbeitsblatt nicht mehr lesbar */
export const MAX_BAUTEILE = 12
/** So viele Beschriftungen trägt ein Schaltplan */
export const MAX_BESCHRIFTUNGEN = 10

// ---------- Bereinigung ----------

const text = (v: unknown): string => String(v ?? '').trim()
const knotenName = (v: unknown): string => text(v).toLowerCase().replace(/\s+/g, '_')

/** Freie Schreibweisen der KI auf die Bauteilarten abbilden */
const SYNONYME: Record<string, SchaltArt> = {
  gluehlampe: 'lampe',
  glühlampe: 'lampe',
  spannungsquelle: 'batterie',
  netzgeraet: 'batterie',
  netzgerät: 'batterie',
  strommessgeraet: 'amperemeter',
  spannungsmessgeraet: 'voltmeter',
  leuchtdiode: 'led',
  klingelknopf: 'taster',
  schalter: 'schalter_offen'
}

export interface Gelesen {
  spec: SchaltplanSpec | null
  /** Was an der Antwort nicht stimmt – für die Korrekturanfrage */
  fehler: string[]
}

function leseBauteil(v: unknown, nr: number, kreis: number, fehler: string[]): SchaltBauteil | null {
  const o = (v ?? {}) as Record<string, unknown>
  const roh = text(o.art).toLowerCase()
  const art = ((SCHALT_ARTEN as readonly string[]).includes(roh) ? roh : SYNONYME[roh]) as SchaltArt | undefined
  const id = text(o.id) || `T${nr + 1}`
  const wo = `Schaltkreis ${kreis + 1}, Bauteil ${id}`
  if (!art) {
    fehler.push(`${wo}: unbekannte Bauteilart „${text(o.art)}" – erlaubt sind nur ${SCHALT_ARTEN.join(', ')}.`)
    return null
  }
  const von = knotenName(o.von)
  const nach = knotenName(o.nach)
  if (!von || !nach) {
    fehler.push(`${wo} (${SCHALT_NAMEN[art]}): beide Anschlüsse brauchen einen Knoten (von, nach).`)
    return null
  }
  const beschriftung = text(o.beschriftung)
  const b: SchaltBauteil = { id, art, von, nach, ...(beschriftung ? { beschriftung } : {}), ...(beschriftung && o.leer ? { leer: true } : {}) }
  if (art === 'wechselschalter') {
    const nach2 = knotenName(o.nach2)
    if (!nach2) {
      fehler.push(`${wo} (Wechselschalter): Kontakt 2 fehlt (nach2).`)
      return null
    }
    b.nach2 = nach2
    b.stellung = String(o.stellung) === '2' ? 2 : 1
  }
  return b
}

/** Ältere Pläne (oben/unten/Zweige) als Netzliste – so bleiben gespeicherte Blätter lesbar */
function ausAltform(k: Record<string, any>): Schaltkreis {
  const alt = (v: unknown): { art: string; beschriftung?: string; leer?: boolean }[] =>
    (Array.isArray(v) ? v : []).filter((b) => (SCHALT_ARTEN as readonly string[]).includes(text(b?.art)))
  const bauteile: SchaltBauteil[] = []
  let n = 0
  const neu = (): string => `a${++n}`
  const setze = (b: { art: string; beschriftung?: string; leer?: boolean }, von: string, nach: string): void => {
    const beschriftung = text(b.beschriftung)
    bauteile.push({ id: `T${bauteile.length + 1}`, art: b.art as SchaltArt, von, nach, ...(beschriftung ? { beschriftung } : {}), ...(beschriftung && b.leer ? { leer: true } : {}) })
  }
  const q = (k.quelle ?? {}) as Record<string, unknown>
  const plus = 'p'
  const minus = 'n'
  setze({ art: 'batterie', beschriftung: text(q.beschriftung), leer: Boolean(q.leer) }, plus, minus)
  let links = plus
  for (const b of alt(k.oben)) {
    const r = neu()
    setze(b, links, r)
    links = r
  }
  const oben = links
  const zweige = (Array.isArray(k.zweige) ? k.zweige : []).map((z: any) => alt(Array.isArray(z) ? z : z?.bauteile)).filter((z: unknown[]) => z.length)
  const unten = zweige.length ? neu() : oben
  for (const z of zweige) {
    let v = oben
    z.forEach((b, i) => {
      const r = i === z.length - 1 ? unten : neu()
      setze(b, v, r)
      v = r
    })
  }
  // Untere Leitung: von rechts nach links zurück zum Minuspol
  const u = alt(k.unten)
  let rechts = unten
  u.slice()
    .reverse()
    .forEach((b, i, liste) => {
      const l = i === liste.length - 1 ? minus : neu()
      setze(b, rechts, l)
      rechts = l
    })
  if (rechts !== minus) bauteile.forEach((b) => (b.von === rechts ? (b.von = minus) : b.nach === rechts && (b.nach = minus)))
  return { ...(text(k.titel) ? { titel: text(k.titel) } : {}), bauteile }
}

/**
 * Liest, was die KI (oder ein gespeichertes Blatt) liefert. Unbekanntes wird NICHT stumm
 * verworfen, sondern als Fehler gemeldet – die KI bekommt es zur Korrektur zurück.
 */
export function leseSchaltplan(v: unknown): Gelesen {
  const roh = (v ?? {}) as Record<string, unknown>
  const fehler: string[] = []
  const liste = Array.isArray(roh.kreise) ? roh.kreise : []
  if (liste.length > MAX_KREISE) fehler.push(`Höchstens ${MAX_KREISE} Schaltkreise je Bild – geliefert wurden ${liste.length}.`)
  const kreise: Schaltkreis[] = liste.slice(0, MAX_KREISE).map((k: any, ki) => {
    if (!Array.isArray(k?.bauteile) && (k?.quelle || k?.oben || k?.unten || k?.zweige)) return ausAltform(k)
    const bauteile = (Array.isArray(k?.bauteile) ? k.bauteile : []).map((b: unknown, i: number) => leseBauteil(b, i, ki, fehler)).filter((b: SchaltBauteil | null): b is SchaltBauteil => Boolean(b))
    // Doppelte Kurznamen eindeutig machen (die Beschriftungen hängen daran)
    const gesehen = new Set<string>()
    for (const b of bauteile) {
      let id = b.id
      for (let i = 2; gesehen.has(id); i++) id = `${b.id}_${i}`
      b.id = id
      gesehen.add(id)
    }
    return { ...(text(k?.titel) ? { titel: text(k.titel) } : {}), bauteile }
  })
  const brauchbar = kreise.filter((k) => k.bauteile.some((b) => b.art !== 'batterie' && b.art !== 'leitung'))
  if (!brauchbar.length) fehler.push('Die Antwort enthält keinen Schaltkreis mit Bauteilen.')
  kreise.forEach((k, i) => {
    if (k.bauteile.length > MAX_BAUTEILE) fehler.push(`Schaltkreis ${i + 1} hat ${k.bauteile.length} Bauteile – mehr als ${MAX_BAUTEILE} sind auf einem Arbeitsblatt nicht lesbar.`)
  })
  const e = (roh.erlaubt ?? {}) as Record<string, unknown>
  const erlaubt: AnalyseOptionen = { ...(e.kurzschlussErlaubt ? { kurzschlussErlaubt: true } : {}), ...(e.fehlschaltungErlaubt ? { fehlschaltungErlaubt: true } : {}) }
  return { spec: brauchbar.length ? { version: 2, kreise: brauchbar, ...(Object.keys(erlaubt).length ? { erlaubt } : {}) } : null, fehler }
}

/** Bereinigter Plan oder null – für gespeicherte Blätter und Stellen ohne Fehlerbericht */
export function sanitizeSchaltplan(v: unknown): SchaltplanSpec | null {
  return leseSchaltplan(v).spec
}

// ---------- Topologie: Reihen-/Parallel-Baum ----------

export type Baum =
  /** Ein Bauteil; `rueck` = sein Anschluss „von" liegt in Laufrichtung hinten */
  | { t: 'teil'; b: SchaltBauteil; rueck: boolean; ord: number }
  | { t: 'reihe'; k: Baum[]; ord: number }
  | { t: 'parallel'; k: Baum[]; ord: number }
  /** Wechselschaltung: zwei Wechselschalter mit zwei Leitungen dazwischen; `reihe1/2` = Zeile (0 oben, 1 unten) des gewählten Kontakts */
  | { t: 'wechsel'; s1: SchaltBauteil; s2: SchaltBauteil; reihe1: 0 | 1; reihe2: 0 | 1; ord: number }

function umdrehen(b: Baum): Baum {
  switch (b.t) {
    case 'teil':
      return { ...b, rueck: !b.rueck }
    case 'reihe':
      return { ...b, k: b.k.map(umdrehen).reverse() }
    case 'parallel':
      return { ...b, k: b.k.map(umdrehen) }
    case 'wechsel':
      return { ...b, s1: b.s2, s2: b.s1, reihe1: b.reihe2, reihe2: b.reihe1 }
  }
}

const VERBRAUCHER: SchaltArt[] = ['lampe', 'widerstand', 'motor', 'diode', 'led', 'klingel']
const LEITEND: SchaltArt[] = ['leitung', 'schalter_geschlossen', 'amperemeter', 'sicherung']

/** Leitet dieser Teil ohne Verbraucher (Kurzschlussgefahr)? */
export function leitetOhneLast(b: Baum): boolean {
  switch (b.t) {
    case 'teil':
      return LEITEND.includes(b.b.art)
    case 'reihe':
      return b.k.every(leitetOhneLast)
    case 'parallel':
      return b.k.some(leitetOhneLast)
    case 'wechsel':
      return b.reihe1 === b.reihe2
  }
}

export const bauteileIm = (b: Baum): SchaltBauteil[] =>
  b.t === 'teil' ? [b.b] : b.t === 'wechsel' ? [b.s1, b.s2] : b.k.flatMap(bauteileIm)

const hatVerbraucher = (b: Baum): boolean => bauteileIm(b).some((x) => VERBRAUCHER.includes(x.art))
const nurVoltmeter = (b: Baum): boolean => bauteileIm(b).every((x) => x.art === 'voltmeter' || x.art === 'leitung')

export interface Analyse {
  /** Quelle (Batterie) und der Rest des Kreises als Baum vom Plus- zum Minuspol */
  quelle?: SchaltBauteil
  baum?: Baum
  fehler: string[]
  /** Nicht als Reihen-/Parallelschaltung zerlegbar – für die automatische Zeichnung zu komplex */
  zuKomplex?: boolean
}

export interface AnalyseOptionen {
  /** Die Beschreibung will einen Kurzschluss bzw. eine überbrückte Lampe zeigen */
  kurzschlussErlaubt?: boolean
  /** Die Beschreibung will eine falsch angeschlossene Schaltung zeigen (z. B. Messgerät falsch) */
  fehlschaltungErlaubt?: boolean
}

const nameVon = (b: SchaltBauteil): string => `${b.id} (${SCHALT_NAMEN[b.art]}${b.beschriftung ? ` „${b.beschriftung}"` : ''})`

/**
 * Prüft einen Schaltkreis elektrisch und zerlegt ihn in Reihe/Parallel.
 * Jede Meldung nennt das Bauteil – so kann die KI gezielt nachbessern.
 */
export function analysiereKreis(k: Schaltkreis, opts: AnalyseOptionen = {}, nr = 1): Analyse {
  const wo = `Schaltkreis ${nr}`
  const fehler: string[] = []
  const quellen = k.bauteile.filter((b) => b.art === 'batterie')
  if (!quellen.length) return { fehler: [`${wo}: Es fehlt die Batterie (Spannungsquelle).`] }
  const quelle = quellen[0]

  // Unbeschriftete Leitungen sind keine Bauteile: ihre Knoten sind derselbe Knoten
  const eltern = new Map<string, string>()
  const wurzel = (x: string): string => {
    let r = x
    while (eltern.has(r) && eltern.get(r) !== r) r = eltern.get(r)!
    return r
  }
  const vereine = (a: string, b: string): void => {
    const ra = wurzel(a)
    const rb = wurzel(b)
    if (ra !== rb) eltern.set(rb, ra)
  }
  const teile = k.bauteile.filter((b) => {
    if (b.art === 'leitung' && !b.beschriftung) {
      vereine(b.von, b.nach)
      return false
    }
    return true
  })
  const ord = new Map(k.bauteile.map((b, i) => [b.id, i]))

  // Anschlüsse je Knoten – offene Enden und freie Knoten melden
  const anschluesse = new Map<string, string[]>()
  const merke = (knoten: string, b: SchaltBauteil): void => {
    const w = wurzel(knoten)
    anschluesse.set(w, [...(anschluesse.get(w) ?? []), b.id])
  }
  for (const b of teile) {
    merke(b.von, b)
    merke(b.nach, b)
    if (b.nach2) merke(b.nach2, b)
  }
  for (const [knoten, an] of anschluesse) {
    if (an.length < 2) {
      const b = teile.find((t) => t.id === an[0])!
      fehler.push(`${wo}: ${nameVon(b)} hat einen freien Anschluss (Knoten „${knoten}") – der Stromkreis ist dort nicht geschlossen. Jeder Knoten braucht mindestens zwei Anschlüsse.`)
    }
  }

  // Zusammenhang: Alles muss mit der Batterie verbunden sein
  const nachbarn = new Map<string, Set<string>>()
  for (const b of teile) {
    const ks = [b.von, b.nach, ...(b.nach2 ? [b.nach2] : [])].map(wurzel)
    for (const x of ks) for (const y of ks) if (x !== y) nachbarn.set(x, (nachbarn.get(x) ?? new Set()).add(y))
  }
  const erreicht = new Set([wurzel(quelle.von)])
  const offen = [wurzel(quelle.von)]
  while (offen.length) for (const n of nachbarn.get(offen.pop()!) ?? []) if (!erreicht.has(n)) (erreicht.add(n), offen.push(n))
  for (const b of teile) if (!erreicht.has(wurzel(b.von))) fehler.push(`${wo}: ${nameVon(b)} ist nicht mit dem Stromkreis der Batterie verbunden.`)
  if (fehler.length) return { quelle, fehler }

  const P = wurzel(quelle.von)
  const N = wurzel(quelle.nach)
  if (P === N) return { quelle, fehler: [`${wo}: Plus- und Minuspol der Batterie liegen am selben Knoten – die Batterie ist direkt kurzgeschlossen.`] }

  // Kanten: jedes Bauteil außer der Hauptquelle; Wechselschalter paarweise als Wechselschaltung
  type Kante = { u: string; v: string; baum: Baum }
  let kanten: Kante[] = []
  const wechsel = teile.filter((b) => b.art === 'wechselschalter')
  const gepaart = new Set<string>()
  for (let i = 0; i < wechsel.length; i++) {
    for (let j = i + 1; j < wechsel.length; j++) {
      const a = wechsel[i]
      const b = wechsel[j]
      if (gepaart.has(a.id) || gepaart.has(b.id)) continue
      const ka = [wurzel(a.nach), wurzel(a.nach2!)]
      const kb = [wurzel(b.nach), wurzel(b.nach2!)]
      if (ka[0] === ka[1] || !kb.includes(ka[0]) || !kb.includes(ka[1])) continue
      // Die beiden Verbindungsleitungen dürfen nur die zwei Schalter verbinden
      if (ka.some((x) => (anschluesse.get(x) ?? []).length !== 2)) continue
      const wahlA = wurzel(a.stellung === 2 ? a.nach2! : a.nach)
      const wahlB = wurzel(b.stellung === 2 ? b.nach2! : b.nach)
      gepaart.add(a.id).add(b.id)
      kanten.push({
        u: wurzel(a.von),
        v: wurzel(b.von),
        baum: { t: 'wechsel', s1: a, s2: b, reihe1: wahlA === ka[0] ? 0 : 1, reihe2: wahlB === ka[0] ? 0 : 1, ord: Math.min(ord.get(a.id)!, ord.get(b.id)!) }
      })
    }
  }
  for (const w of wechsel)
    if (!gepaart.has(w.id))
      return {
        quelle,
        zuKomplex: true,
        fehler: [
          `${wo}: ${nameVon(w)} hat kein Gegenstück. Eine Wechselschaltung braucht zwei Wechselschalter, deren Kontakte 1 und 2 über zwei gemeinsame Knoten direkt verbunden sind (keine weiteren Bauteile an diesen Knoten).`
        ]
      }
  for (const b of teile) {
    if (b === quelle || b.art === 'wechselschalter') continue
    kanten.push({ u: wurzel(b.von), v: wurzel(b.nach), baum: { t: 'teil', b, rueck: false, ord: ord.get(b.id)! } })
  }
  if (!kanten.length) return { quelle, fehler: [`${wo}: Außer der Batterie enthält der Stromkreis kein Bauteil.`] }

  // Reduktion: Parallel (gleiche Knoten) und Reihe (Knoten mit genau zwei Anschlüssen)
  const orient = (e: Kante, u: string): Baum => (e.u === u ? e.baum : umdrehen(e.baum))
  for (let runde = 0; runde < 200; runde++) {
    const schleife = kanten.find((e) => e.u === e.v)
    if (schleife) {
      const namen = bauteileIm(schleife.baum).map(nameVon).join(', ')
      return { quelle, fehler: [`${wo}: ${namen} ist an beiden Anschlüssen mit demselben Knoten verbunden – es wird überbrückt, kein Strom fließt hindurch.`] }
    }
    let geaendert = false
    // Parallel
    const gruppen = new Map<string, Kante[]>()
    for (const e of kanten) {
      const s = [e.u, e.v].sort().join('|')
      gruppen.set(s, [...(gruppen.get(s) ?? []), e])
    }
    for (const g of gruppen.values()) {
      if (g.length < 2) continue
      const u = g[0].u
      const kinder = g.map((e) => orient(e, u)).flatMap((b) => (b.t === 'parallel' ? b.k : [b]))
      kinder.sort((a, b) => Number(nurVoltmeter(a)) - Number(nurVoltmeter(b)) || a.ord - b.ord)
      kanten = kanten.filter((e) => !g.includes(e))
      kanten.push({ u, v: g[0].u === u ? g[0].v : g[0].u, baum: { t: 'parallel', k: kinder, ord: Math.min(...kinder.map((x) => x.ord)) } })
      geaendert = true
    }
    // Reihe
    const grad = new Map<string, Kante[]>()
    for (const e of kanten) for (const x of [e.u, e.v]) grad.set(x, [...(grad.get(x) ?? []), e])
    for (const [x, es] of grad) {
      if (x === P || x === N) continue
      if (es.length === 1) {
        const namen = bauteileIm(es[0].baum).map(nameVon).join(', ')
        return { quelle, fehler: [`${wo}: ${namen} hängt nur mit einem Ende am Stromkreis (Knoten „${x}") – durch diesen Teil fließt kein Strom.`] }
      }
      if (es.length !== 2 || es[0] === es[1]) continue
      const [e1, e2] = es
      const a = e1.u === x ? e1.v : e1.u
      const c = e2.u === x ? e2.v : e2.u
      const glieder = [orient(e1, a), orient(e2, x)].flatMap((b) => (b.t === 'reihe' ? b.k : [b]))
      kanten = kanten.filter((e) => e !== e1 && e !== e2)
      kanten.push({ u: a, v: c, baum: { t: 'reihe', k: glieder, ord: Math.min(...glieder.map((g) => g.ord)) } })
      geaendert = true
      break
    }
    if (!geaendert) break
  }
  if (kanten.length !== 1 || ![kanten[0].u, kanten[0].v].includes(P) || ![kanten[0].u, kanten[0].v].includes(N)) {
    return {
      quelle,
      zuKomplex: true,
      fehler: [`${wo}: Die Schaltung lässt sich nicht in Reihen- und Parallelschaltungen zerlegen (z. B. Brückenschaltung oder zweite Spannungsquelle in einem Zweig) – dafür ist die automatische Zeichnung nicht ausgelegt.`]
    }
  }
  const baum = orient(kanten[0], P)

  // Elektrische Plausibilität
  const pruefe = (b: Baum, eltern: Baum | null): void => {
    if (b.t === 'parallel') {
      const kurz = b.k.filter(leitetOhneLast)
      const last = b.k.filter((x) => !leitetOhneLast(x) && hatVerbraucher(x))
      if (kurz.length && last.length && !opts.kurzschlussErlaubt)
        fehler.push(
          `${wo}: ${bauteileIm(kurz[0]).map(nameVon).join(', ') || 'eine Leitung'} liegt parallel zu ${bauteileIm(last[0]).map(nameVon).join(', ')} und schließt es kurz. Parallel liegende Zweige brauchen je einen Verbraucher.`
        )
    }
    if (b.t === 'teil' && b.b.art === 'voltmeter' && eltern?.t === 'reihe' && !opts.fehlschaltungErlaubt)
      fehler.push(`${wo}: ${nameVon(b.b)} liegt in Reihe. Ein Spannungsmessgerät wird parallel zu dem Bauteil geschaltet, dessen Spannung es misst (an dieselben zwei Knoten).`)
    if (b.t === 'reihe' || b.t === 'parallel') for (const x of b.k) pruefe(x, b)
  }
  pruefe(baum, null)
  if (leitetOhneLast(baum) && !opts.kurzschlussErlaubt) fehler.push(`${wo}: Zwischen Plus- und Minuspol liegt kein Verbraucher – die Batterie wäre kurzgeschlossen.`)
  for (const q of quellen.slice(1)) if (!bauteileIm(baum).includes(q)) fehler.push(`${wo}: Die zweite Batterie ${q.id} liegt nicht in Reihe im Stromkreis.`)
  return { quelle, baum, fehler }
}
