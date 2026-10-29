/**
 * Aufgabenbank der Grammatik (13.10.2026, mit der Lehrkraft abgestimmt; Memory „grammatik-aufgabenbank-2026-10-13"):
 * Übungsaufgaben hängen nicht mehr an einem Kurs, sondern an der Grammatikform – gepflegt im Seitenfenster der App
 * „Grammatikformen", schulweit wie die Zuordnung der Formen zu den Lehrwerken.
 *
 *  - Schlüssel: je Teilbereich die Katalog-Kennung („en.verb.past_simple/fragen"; ein Thema ohne Teilformen steht für
 *    sich), dazu gemischte Aufgaben je Grammatikpunkt („mix:" + die Kennungen des Punkts) und je Unit
 *    („unit:" + Band + Unit) als gemischte Wiederholung.
 *  - Je Schlüssel eine Regelkarte und Aufgaben in fünf Übungsarten: Erkennen, Bilden, Anwenden (Kern – sie entscheiden
 *    über „sicher") sowie Unterscheiden und Fehler finden (Zusatz – zählen weder für „sicher" noch für Medaillen).
 *  - „Grammatik hinzufügen" weist dem Kurs die hinterlegten Aufgaben zu; der Kurs verweist auf die Bank (Änderungen
 *    gelten überall, server/grammatikBank.ts baut die Pakete der Kurse neu). Kennungen der Aufgaben bleiben, damit der
 *    Lernstand an der richtigen Aufgabe hängt.
 *
 * Reine Regeln ohne Datenbank und ohne Katalog (den kennt nur die Oberfläche) – für Server, Oberfläche und Tests.
 */
import { normiert, type GrammatikAufgabe, type GrammatikPaket, type GrammatikRegel } from './grammatiktrainer'

export type Uebung = 'erkennen' | 'bilden' | 'anwenden' | 'unterscheiden' | 'fehler'
export const UEBUNGEN: Uebung[] = ['erkennen', 'bilden', 'anwenden', 'unterscheiden', 'fehler']
/** Kern-Übungsarten: entscheiden über „sicher" und zählen für Medaillen */
export const KERN_UEBUNGEN: Uebung[] = ['erkennen', 'bilden', 'anwenden']
export const istKern = (u: Uebung | undefined): boolean => Boolean(u && KERN_UEBUNGEN.includes(u))
export const istUebung = (x: unknown): x is Uebung => typeof x === 'string' && (UEBUNGEN as string[]).includes(x)

export const UEBUNG_NAME: Record<Uebung, string> = {
  erkennen: 'Erkennen',
  bilden: 'Bilden',
  anwenden: 'Anwenden',
  unterscheiden: 'Unterscheiden',
  fehler: 'Fehler finden'
}
/** Kurz, was die Übungsart verlangt – für die Oberfläche und den Auftrag an die KI */
export const UEBUNG_TEXT: Record<Uebung, string> = {
  // 28.10.2026 (Prüfung der Bank): Erkennen und Unterscheiden nie als freie Lücke – dort musste geraten werden
  erkennen: 'die Form erkennen bzw. aus Möglichkeiten die richtige wählen (Auswahl, Zuordnen, Sortieren, Markieren im Text, Mehrfachauswahl, Richtig oder falsch) – nie Tippen; die Form entscheidet über die Bedeutung',
  bilden: 'die Form aus einem Grundwort selbst bilden (Lücke mit Grundwort, ggf. mit Signalwort oder Zielform-Etikett; Umformen mit Satzanfang; Satzbau; Frage zur gegebenen Antwort)',
  anwenden: 'die Form im Zusammenhang verwenden (Lücke mit Kontext-Vorlauf, kurzer Lückentext oder Dialog, Sätze verbinden mit Bindewort, Frage bilden, Umformen mit Satzanfang)',
  unterscheiden: 'die Form von einer verwechselbaren Form abgrenzen (Auswahl mit beiden Formen und Kontext, Kontrastpaar, Sortieren, „alle richtigen ankreuzen“, Richtig oder falsch) – nie als freie Lücke',
  fehler: 'einen Fehler mit der Form im Satz finden und durch EIN Wort berichtigen (oder Richtig oder falsch)'
}
/** Aufgabenarten, die zur Übungsart passen (Englisch, Französisch, Spanisch …) */
export const UEBUNG_ARTEN: Record<Uebung, string[]> = {
  // zuordnen und richtigfalsch seit 26.10.2026 (Entscheidung der Lehrkraft, ohne KI prüfbar)
  // Neubeginn 28.10.2026: neue Formate je Etappe (Recherche + Abstimmung)
  erkennen: ['auswahl', 'zuordnen', 'sortieren', 'markieren', 'mehrfach', 'richtigfalsch'],
  bilden: ['luecke', 'umformen', 'satzbau', 'frage'],
  anwenden: ['luecke', 'lueckentext', 'verbinden', 'frage', 'umformen', 'auswahl'],
  unterscheiden: ['auswahl', 'mehrfach', 'sortieren', 'richtigfalsch', 'zuordnen'],
  fehler: ['fehler', 'richtigfalsch']
}
/** Stufe für Reihenfolge und ältere Ansichten: Erkennen 1, Bilden 2, sonst 3 */
export const uebungStufe = (u: Uebung): 1 | 2 | 3 => (u === 'erkennen' ? 1 : u === 'bilden' ? 2 : 3)

/**
 * Aufgaben je Feld (Teilbereich × Übungsart × Stufe) – Neubeginn 28.10.2026 (Wunsch der Lehrkraft: deutlich weniger,
 * Stufen bleiben): je Stufe 4 Erkennen, 4 Bilden, 3 Anwenden, je 1 Unterscheiden und Fehler finden = 13 (bisher je 8).
 * Ein Lückentext zählt als eine Aufgabe.
 */
export const AUFGABEN_JE_UEBUNG: Record<Uebung, number> = { erkennen: 4, bilden: 4, anwenden: 3, unterscheiden: 1, fehler: 1 }
/** Höchstes Ziel eines Felds (für Stellen ohne bestimmte Übungsart) */
export const AUFGABEN_JE_FELD = 4
/** Ziel eines Felds dieser Übungsart */
export const zielJeFeld = (u: Uebung): number => AUFGABEN_JE_UEBUNG[u]

/**
 * Nur bis zum Ziel behalten (Probelauf 28.10.2026: mit Puffer und Blindprobe kamen je Feld 6 statt 4 Aufgaben an).
 * Je Übungsart höchstens `frei(u)` Aufgaben – zuerst je Aufgabenart eine, damit die Formate gemischt bleiben, dann in der
 * Reihenfolge der KI (leicht → schwer). Die Reihenfolge der behaltenen Aufgaben bleibt.
 */
export function aufZielGekuerzt<T extends { uebung?: Uebung; art: string }>(aufgaben: readonly T[], frei: (u: Uebung) => number): T[] {
  const behalten = new Set<number>()
  for (const u of UEBUNGEN) {
    const idx = aufgaben.flatMap((a, i) => (a.uebung === u ? [i] : []))
    const n = Math.max(0, frei(u))
    const arten = new Set<string>()
    const wahl: number[] = []
    for (const i of idx) if (wahl.length < n && !arten.has(aufgaben[i].art)) (arten.add(aufgaben[i].art), wahl.push(i))
    for (const i of idx) if (wahl.length < n && !wahl.includes(i)) wahl.push(i)
    for (const i of wahl) behalten.add(i)
  }
  return aufgaben.filter((a, i) => !a.uebung || behalten.has(i))
}

// ---------------------------------------------------------------- Stufen (13.10.2026, abgestimmt)

/**
 * Schwierigkeit je Aufgabe: grundlegend, mittel, anspruchsvoll – für alle Fächer. Ein Kurs bekommt die Stufen seiner
 * Schulform (`stufenFuerSchulform`), je Kurs änderbar. Aufgaben ohne Angabe gelten als mittel.
 */
export type Stufe = 'g' | 'm' | 'a'
export const STUFEN: Stufe[] = ['g', 'm', 'a']
export const STUFE_NAME: Record<Stufe, string> = { g: 'grundlegend', m: 'mittel', a: 'anspruchsvoll' }
export const istStufe = (x: unknown): x is Stufe => x === 'g' || x === 'm' || x === 'a'
export const stufeVon = (a: { niveau?: Stufe }): Stufe => a.niveau ?? 'm'
/** Was die Stufe für die KI heißt */
export const STUFE_TEXT: Record<Stufe, string> = {
  g: 'grundlegend – kurze Sätze, einfacher Wortschatz, die Regel in ihrer Grundform, viel Hilfe durch Vorgaben',
  m: 'mittel – wie im Unterricht üblich, gemischte Fälle',
  a: 'anspruchsvoll – längere Sätze, Ausnahmen und Sonderfälle, Transfer, wenig Vorgaben'
}
/**
 * Stufen eines Kurses nach Schulform (abgestimmt): Hauptschule, Mittelschule, Förderschule grundlegend; Gymnasium mittel und
 * anspruchsvoll; alle übrigen (Real-, Ober-, Gesamtschule …) grundlegend und mittel – anspruchsvoll ergänzt die Lehrkraft
 * je Kurs (z. B. IGS-E-Kurs). Ohne Schulform: alle drei.
 */
export function stufenFuerSchulform(schulform: string | undefined | null): Stufe[] {
  const s = String(schulform ?? '').toLowerCase()
  if (!s) return [...STUFEN]
  if (/gymnas/.test(s)) return ['m', 'a']
  if (/haupt|mittelschule|foerder|förder|werkreal/.test(s)) return ['g']
  return ['g', 'm']
}
export const stufenBereinigt = (x: unknown): Stufe[] | undefined => {
  const l = Array.isArray(x) ? STUFEN.filter((s) => x.includes(s)) : []
  return l.length ? l : undefined
}

// ---------------------------------------------------------------- Schlüssel

/**
 * Kern einer Aufgabe zum Erkennen von Dopplungen (13.10.2026, Wunsch der Lehrkraft): derselbe Satz (bzw. dieselben Teile)
 * mit derselben ersten Lösung – unabhängig von Groß-/Kleinschreibung, Satzzeichen und Leerzeichen. Leer = nicht vergleichbar.
 */
export function aufgabeKern(a: { satz?: string; teile?: string[]; loesungen?: string[] }): string {
  const n = (s: unknown): string =>
    String(s ?? '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
  const text = n(a.satz) || n((a.teile ?? []).join(' '))
  return text ? `${text}|${n(a.loesungen?.[0])}` : ''
}

/** Ohne Dopplungen (die erste bleibt); `schon` = Kerne, die es anderswo schon gibt (z. B. in der Bank) */
export function ohneDoppelte<T extends { satz?: string; teile?: string[]; loesungen?: string[] }>(l: readonly T[], schon: Set<string> = new Set()): T[] {
  const da = new Set(schon)
  return l.filter((a) => {
    const k = aufgabeKern(a)
    if (!k) return true
    if (da.has(k)) return false
    da.add(k)
    return true
  })
}

export const MIX = 'mix:'
export const UNIT = 'unit:'
/** Gemischte Aufgaben eines Grammatikpunkts: seine Kennungen (sortiert) */
export const mixSchluessel = (kennungen: readonly string[]): string => `${MIX}${[...new Set(kennungen)].sort().join('+')}`
/** Gemischte Wiederholung einer Unit */
export const unitSchluessel = (band: string, unit: string): string => `${UNIT}${band}|${unit}`
export const istMix = (s: string): boolean => s.startsWith(MIX) || s.startsWith(UNIT)
/** Kennungen hinter einem Mix-Schlüssel (Unit: leer – die kennt nur die Lehrwerk-Liste) */
export const mixKennungen = (s: string): string[] => (s.startsWith(MIX) ? s.slice(MIX.length).split('+').filter(Boolean) : [])
/** Band und Unit eines Unit-Schlüssels */
export function unitVon(s: string): { band: string; unit: string } | null {
  if (!s.startsWith(UNIT)) return null
  const [band, unit] = s.slice(UNIT.length).split('|')
  return band && unit ? { band, unit } : null
}
/** Form (Katalogthema) eines Teilbereichs; Mix: '' */
export const formVon = (s: string): string => (istMix(s) ? '' : s.split('/')[0])
/** Ist der Schlüssel brauchbar? (Kennungen wie im Katalog, Mix aus solchen, Unit mit Band und Unit) */
export function schluesselGueltig(s: unknown): s is string {
  if (typeof s !== 'string' || !s || s.length > 400) return false
  const kennung = (k: string): boolean => /^[a-z]{2,3}\.[a-z0-9_.-]+(\/[a-z0-9_-]+)?$/i.test(k)
  if (s.startsWith(MIX)) {
    const k = mixKennungen(s)
    return k.length >= 1 && k.every(kennung)
  }
  if (s.startsWith(UNIT)) return Boolean(unitVon(s)) && !/[\n\r]/.test(s)
  return kennung(s)
}

/** Kennung der Regelkarte eines Schlüssels (fest, damit der Lernstand bleibt): „t" + Prüfsumme */
export function regelIdVon(schluessel: string): string {
  let h = 2166136261
  for (let i = 0; i < schluessel.length; i++) {
    h ^= schluessel.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `t${(h >>> 0).toString(36)}`
}

// ---------------------------------------------------------------- Einträge und Pakete

export interface BankRegel {
  titel: string
  erklaerung: string
  beispiele: string[]
}
/** Platzhalter statt Regelkarte (29.10.2026, „x"): kein Titel oder Titel/Erklärung von höchstens zwei Zeichen */
export const istRegelPlatzhalter = (r: Partial<BankRegel> | null | undefined): boolean =>
  !r || String(r.titel ?? '').trim().length <= 2 || String(r.erklaerung ?? '').trim().length <= 2
/** Eine Aufgabe der Bank: wie im Training, dazu die Übungsart (und die Stufe); `id` ist die feste Kennung der Bank („b…") */
export type BankAufgabe = GrammatikAufgabe & { uebung: Uebung }
export interface BankEintrag {
  schluessel: string
  regel: BankRegel
  aufgaben: BankAufgabe[]
}

/** Zahlen je Schlüssel und Übungsart (Übersicht im Pop-up), dazu je Übungsart und Stufe */
export type BankZahlen = Record<
  string,
  Partial<Record<Uebung, number>> & {
    stufen?: Partial<Record<Uebung, Partial<Record<Stufe, number>>>>
    /** Zurückgestellt (28.10.2026): Aufgaben mit Mangel oder Befund – zählen nirgends mit, bis sie überarbeitet sind */
    zurueck?: number
  }
>

/** Kern-Aufgaben eines Eintrags */
export const kernZahl = (z: Partial<Record<Uebung, number>> | undefined): number => KERN_UEBUNGEN.reduce((n, u) => n + (z?.[u] ?? 0), 0)

/**
 * Paket eines Kurs-Trainings aus Bank-Einträgen: je Schlüssel mit Aufgaben eine Regelkarte (Kennung `regelIdVon`, mit
 * Schlüssel als `kennung`), die Aufgaben in Teilbereich- und Übungs-Reihenfolge mit Stufe (Erkennen vor Bilden).
 */
export function bankPaket(thema: string, eintraege: readonly BankEintrag[], stufen?: readonly Stufe[]): GrammatikPaket {
  const regeln: GrammatikRegel[] = []
  const aufgaben: GrammatikAufgabe[] = []
  const reserve: GrammatikAufgabe[] = []
  // Förderreserve (13.10.2026): Übt der Kurs nicht „grundlegend", liegen die grundlegenden Aufgaben als Reserve bereit
  const mitReserve = Boolean(stufen?.length && !stufen.includes('g'))
  for (const e of eintraege) {
    // Zurückgestellte Aufgaben (28.10.2026, Mangel oder Befund) bekommen die Lernenden nicht – bis sie überarbeitet sind
    const brauchbar = e.aufgaben.filter((a) => !a.pruefen)
    const passend = stufen?.length ? brauchbar.filter((a) => stufen.includes(stufeVon(a))) : brauchbar
    if (!passend.length) continue
    if (mitReserve)
      for (const a of brauchbar.filter((x) => stufeVon(x) === 'g')) reserve.push({ ...a, regelId: regelIdVon(e.schluessel), stufe: uebungStufe(a.uebung) })
    const regelId = regelIdVon(e.schluessel)
    regeln.push({
      id: regelId,
      titel: e.regel.titel || e.schluessel,
      erklaerung: e.regel.erklaerung || e.regel.titel || e.schluessel,
      beispiele: e.regel.beispiele,
      kennung: e.schluessel
    })
    // Übungsart, darin vom Leichten zum Schweren
    const sortiert = [...passend].sort(
      (a, b) => UEBUNGEN.indexOf(a.uebung) - UEBUNGEN.indexOf(b.uebung) || STUFEN.indexOf(stufeVon(a)) - STUFEN.indexOf(stufeVon(b))
    )
    for (const a of sortiert) aufgaben.push({ ...a, regelId, stufe: uebungStufe(a.uebung) })
  }
  return { thema, regeln, aufgaben, ...(reserve.length ? { reserve } : {}) }
}

// ---------------------------------------------------------------- „sicher" (13.10.2026, Entscheidung der Lehrkraft)

/** Je Kern-Übungsart: mindestens so viele verschiedene Aufgaben (bzw. alle, wenn es weniger gibt) */
export const MIN_JE_UEBUNG = 5
/** Ab so vielen offenen späteren Fehlern im Teilbereich gilt er nicht mehr als sicher */
export const SPAETER_FEHLER_AB = 2
/** Form sicher: so viele ihrer Teilbereiche sicher (und keiner schwach) */
export const FORM_TEILE_SICHER_AB = 0.8

// ---------------------------------------------------------------- Alternativlösungen (25.10.2026)

/**
 * Regel für jeden KI-Auftrag, der Grammatikaufgaben schreibt (25.10.2026, Befund der Lehrkraft: bei „It is said /
 * believed / thought that …" galt nur eine Fassung). Die App wertet eine Antwort nur als richtig, wenn sie GENAU einer
 * hinterlegten Lösung entspricht – deshalb müssen alle gleichwertigen Antworten in `loesungen` stehen.
 */
export const LOESUNGEN_REGEL =
  'LÖSUNGEN („loesungen"): Die App zählt eine Antwort nur als richtig, wenn sie GENAU einer hinterlegten Lösung entspricht. Nenne deshalb ALLE gleichwertig richtigen Antworten: Kurz- und Langformen (it is / it\'s, do not / don\'t), gleichwertige Umformungen (People say that he is rich → „It is said that he is rich" UND „He is said to be rich"), alle passenden Formen des vorgegebenen Worts, gleichwertige Wortstellung. Lässt eine Aufgabe sonst mehrere verschiedene richtige Antworten zu, mache sie durch „vorgabe" eindeutig. Antworten, die die geübte Grammatik umgehen, gehören nicht dazu.'

/** Aufgabenarten, bei denen die Lernenden frei tippen – nur dort helfen weitere Lösungen (Auswahl hat ihre Möglichkeiten) */
export const ALTERNATIVEN_ARTEN: readonly string[] = ['luecke', 'umformen', 'fehler', 'satzbau', 'uebersetzen']

/**
 * Weitere Lösungen aufnehmen: ohne Doppelte (verglichen wie beim Prüfen der Antwort, `normiert`), leer und zu lange
 * Fassungen fallen weg, die bisherige Reihenfolge bleibt (die erste Lösung ist die angezeigte Musterlösung).
 */
export function loesungenZusammenfuehren(alt: readonly string[], neu: readonly unknown[], hoechstens = 8): string[] {
  const aus = alt.map((x) => String(x ?? '').trim()).filter(Boolean)
  const da = new Set(aus.map(normiert))
  for (const x of neu) {
    const t = String(x ?? '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!t || t.length > 200 || t.includes('___')) continue
    const n = normiert(t)
    if (!n || da.has(n)) continue
    da.add(n)
    aus.push(t)
    if (aus.length >= hoechstens) break
  }
  return aus
}

/**
 * Passt eine weitere Lösung zur Aufgabe? Bei Lücken darf sie nicht viel länger sein als die bekannten Lösungen (sonst
 * hat die KI den ganzen Satz geliefert); Umformen und Satzbau verlangen ganze Sätze.
 */
export function alternativePasst(a: { art: string; loesungen: string[] }, weitere: string): boolean {
  const woerter = (x: string): number => x.trim().split(/\s+/).filter(Boolean).length
  const w = woerter(weitere)
  if (!w) return false
  if (a.art === 'luecke' || a.art === 'fehler') {
    const max = Math.max(1, ...a.loesungen.map(woerter))
    return w <= max + 3
  }
  if (a.art === 'umformen' || a.art === 'satzbau') return w >= 2
  return true
}
