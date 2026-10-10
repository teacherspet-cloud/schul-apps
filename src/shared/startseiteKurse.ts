/**
 * Startseite der Lehrkraft, Karte „Termine & Vokabeltraining" und Kasten „Meine Klassen" (10.10.2026, Wunsch der
 * Lehrkraft). Zweite Fassung (10.10.2026, Befund: „zu unübersichtlich"):
 *  a) EINE Zeile je laufendem Kurs – „7b · Englisch", kleiner Balken mit „64 %" (sicher) und höchstens EIN Abzeichen mit
 *     dem Wichtigsten: Test bald („Test Fr" / „Test morgen" / „Test heute") > „n nicht geübt" (7 Tage) > „n Problemwörter"
 *     (ab 3) > sonst ein stilles ✓. Keine Zeile „heute geübt", keine eigenen Hinweis- oder Grammatikzeilen (die stehen im
 *     Kurs).
 *  b) „Demnächst": Vokabeltests der Kurse und Haltepunkte der Unterrichtsreihen mit Datum, zeitlich geordnet, nur heute
 *     und später (Haltepunkte ohne Stundentermin stehen hinten, ohne Datum).
 * Rein rechnend; der Server (server/startseite.ts) liefert die Kurse mit EINER Anfrage, die Haltepunkte kommen mit den
 * laufenden Reihen (server/reihen.ts › laufend).
 */
import { abschnitteEinordnen, abschnittStelle, mitBaenden, unitZahl, type KursTeil } from './kursAbschnitte'
import { bandRang } from './lehrwerkBand'
import type { Quelle } from './vokabelLaufbahn'
import type { HinweisReiter } from './kursHinweise'
import type { Reihe } from './reihe'
import { tagVon, unterrichtsTage, wochentag } from './schulkalender'

const TAG = 86_400_000

/** Das eine Abzeichen einer Kurszeile */
export interface StartAbzeichen {
  art: 'test' | 'inaktiv' | 'problem' | 'leer' | 'ok'
  /** „Test Fr", „3 nicht geübt", „12 Problemwörter", „✓" */
  text: string
  /** Reiter des Kurses, in den ein Klick auf das Abzeichen führt (fehlt = Kurs öffnen) */
  reiter?: HinweisReiter
  /** Art des Hinweises für den Sprung an die Stelle (kursFokus) */
  hinweis?: string
  /** Betroffene (Kennungen) – Sprung an die Stelle */
  ids?: string[]
}

export interface StartKurs {
  id: string
  gruppeId: string
  /** „7b" */
  gruppe: string
  /** „Englisch" */
  fach: string
  /** Am weitesten fortgeschrittener Abschnitt „Green Line 3 · Unit 2 (Abschnitt 3 von 5)" (10.10.2026) */
  abschnitt: string
  /**
   * Teile von `abschnitt` für die Anzeige (10.10.2026): Band („Green Line 3", '' = unbekannt) und Fortschritt
   * („(Abschnitt 3 von 5)") neben der Unit (`einheit`) – am Smartphone kürzt zuerst der Band, dann der Fortschritt, die
   * Unit bleibt sichtbar. Fehlen ohne erkennbare Unit.
   */
  band?: string
  fortschritt?: string
  /** Kurz für „Demnächst": „Unit 2" */
  einheit: string
  woerter: number
  /** Anteil sicher im Schnitt der Lernenden (0–1); null ohne Wörter */
  sicher: number | null
  lernende: number
  testTermin: number | null
  abzeichen: StartAbzeichen
}

export interface StartKlasse {
  schluessel: string
  name: string
  /** Erste Lerngruppe der Klasse (öffnet die Klasse) */
  gruppeId: string
  faecher: { id: string; fach: string }[]
}

export interface StartseiteDaten {
  kurse: StartKurs[]
  klassen: StartKlasse[]
}

/** Gliederung eines Lehrwerks: Units mit ihren Abschnitten in Buchreihenfolge (Server: Lehrwerk-Datei) */
export type Gliederung = { name: string; abschnitte: string[] }[]

export interface KursStandOptionen {
  /** Herkunft des Kurses (Units für Abschnitte ohne Unit im Titel, letzter Rückfall für den Band) */
  quelle?: Partial<Quelle> | null
  /** Name des Lehrwerks zur Kennung (Server: aus der Lehrwerk-Datei) */
  nameVon?: (kennung: string) => string
  /** Gliederung zu Kennung bzw. Band; null = unbekannt oder Platzhalter (dann ohne „Abschnitt k von n") */
  gliederung?: (kennung: string, buch: string) => Gliederung | null
}

export interface WeitesterAbschnitt {
  buch: string
  unit: string
  name: string
  /** Stelle des Abschnitts in seiner Unit im Lehrwerk (1-basiert) und Zahl der Abschnitte der Unit – null = unbekannt */
  k: number | null
  n: number | null
}

const vgl = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

/**
 * Am weitesten fortgeschrittener Abschnitt des Kurses (10.10.2026, Entscheidung der Lehrkraft: statt des zuletzt
 * freigeschalteten – „Hello" kam zuletzt, Unit 2 ist weiter). Nur freigeschaltete Abschnitte (Zeit ≤ jetzt) des Kurses
 * selbst; Einzelfreigaben sind eigene Kurse (server/startseite.ts lässt sie neben dem Klassenkurs weg). Rangfolge:
 * höchster Band (`bandRang`), darin die höchste Unit in Buchreihenfolge, darin der späteste Abschnitt; Gleichstand:
 * später freigegeben.
 * Mit bekannter Gliederung des Lehrwerks zählt die Stelle im Buch (auch „Hello", „Media smart"); ohne sie die Nummer der
 * Unit (`unitZahl`) und die übliche Abschnittsfolge (`abschnittStelle`) – Units ohne Nummer stehen dann hinter allen
 * nummerierten (ihre Stelle im Buch ist unbekannt). Abschnitte ohne Unit (eigene Listen) nur, wenn es nichts anderes
 * gibt (dann der zuletzt freigeschaltete).
 */
export function weitesterAbschnitt(teile: KursTeil[], titel: string, jetzt = Date.now(), opt: KursStandOptionen = {}): WeitesterAbschnitt | null {
  const quelle = opt.quelle ?? null
  // Über ALLE Abschnitte eingeordnet (die Herkunft ordnet „Station 1" der Reihe nach zu), danach nur die freigeschalteten
  const einordnung = mitBaenden(teile, abschnitteEinordnen(teile, quelle), quelle, titel, opt.nameVon)
  const frei = teile.map((t, i) => ({ t, e: einordnung[i], i })).filter((x) => x.e && (!x.t.zeit || x.t.zeit <= jetzt))
  if (!frei.length) return null
  const mitUnit = frei.filter((x) => x.e.unit)
  if (!mitUnit.length) {
    const e = frei[frei.length - 1].e
    return { buch: e.buch ?? '', unit: '', name: e.name, k: null, n: null }
  }
  const gemerkt = new Map<string, Gliederung | null>()
  const gliederungVon = (kennung: string, buch: string): Gliederung | null => {
    if (!opt.gliederung || (!kennung && !buch)) return null
    const s = `${kennung}|${buch}`
    if (!gemerkt.has(s)) gemerkt.set(s, opt.gliederung(kennung, buch))
    return gemerkt.get(s) ?? null
  }
  const bewertet = mitUnit.map(({ t, e, i }) => {
    const buch = e.buch ?? ''
    const g = gliederungVon(t.lehrwerk || quelle?.lehrwerk || '', buch)
    const u = g ? g.findIndex((x) => vgl(x.name) === vgl(e.unit)) : -1
    // „Check-in, Station 1" → die spätere Stelle
    const teil = e.name.split(/,\s*|\s·\s/).map(vgl)
    const s = g && u >= 0 ? Math.max(-1, ...teil.map((a) => g[u].abschnitte.findIndex((x) => vgl(x) === a))) : -1
    const n = g && u >= 0 ? g[u].abschnitte.length : 0
    const rang = [buch ? bandRang(buch) : -1, g ? u : (unitZahl(e.unit) ?? -1), g ? s : (abschnittStelle(e.name) ?? -1), i]
    // Eine Unit mit nur einem Abschnitt („Wortschatz") braucht kein „Abschnitt 1 von 1"
    return { e, buch, rang, k: s >= 0 && n > 1 ? s + 1 : null, n: s >= 0 && n > 1 ? n : null }
  })
  const weiter = (a: number[], b: number[]): number => a.reduce((d, x, j) => d || x - b[j], 0)
  const w = bewertet.reduce((a, b) => (weiter(b.rang, a.rang) > 0 ? b : a))
  return { buch: w.buch, unit: w.e.unit, name: w.e.name, k: w.k, n: w.n }
}

/** Kurszeile und „Demnächst" aus dem am weitesten fortgeschrittenen Abschnitt (10.10.2026) */
export function kursStand(
  teile: KursTeil[],
  baende: string,
  titel: string,
  jetzt = Date.now(),
  opt: KursStandOptionen = {}
): { abschnitt: string; einheit: string; band?: string; fortschritt?: string } {
  const w = weitesterAbschnitt(teile, titel, jetzt, opt)
  if (!w) return { abschnitt: baende || titel, einheit: baende || titel }
  if (!w.unit) {
    const text = baende || w.name || titel
    return { abschnitt: text, einheit: text }
  }
  const band = w.buch || baende
  const fortschritt = w.k && w.n ? `(Abschnitt ${w.k} von ${w.n})` : ''
  return { abschnitt: [[band, w.unit].filter(Boolean).join(' · '), fortschritt].filter(Boolean).join(' '), einheit: w.unit, band, fortschritt }
}

/**
 * Am weitesten fortgeschrittener Abschnitt als „Green Line 3 · Unit 2 (Abschnitt 3 von 5)" – ohne bekannte Gliederung
 * „Green Line 3 · Unit 2"; ohne Lehrwerk: Bände bzw. Name des Abschnitts
 */
export const abschnittText = (teile: KursTeil[], baende: string, titel: string, jetzt = Date.now(), opt: KursStandOptionen = {}): string =>
  kursStand(teile, baende, titel, jetzt, opt).abschnitt

/** Kurz für „Demnächst": nur die Unit des am weitesten fortgeschrittenen Abschnitts („Unit 2"), sonst wie `abschnittText` */
export const einheitText = (teile: KursTeil[], baende: string, titel: string, jetzt = Date.now(), opt: KursStandOptionen = {}): string =>
  kursStand(teile, baende, titel, jetzt, opt).einheit

/** Kopf einer Kurszeile: „7b · Englisch" */
export const kursKopf = (gruppe: string, fach: string): string => [gruppe.trim(), fach.trim()].filter(Boolean).join(' · ')

// ---------------------------------------------------------------- Tage

/** Ganze Kalendertage von `heute` bis `tag` (beide „JJJJ-MM-TT") */
export const tageBis = (tag: string, heute: string): number => Math.round((Date.parse(`${tag}T12:00:00Z`) - Date.parse(`${heute}T12:00:00Z`)) / TAG)

const WT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
/** „Fr 17.10." */
export const tagKurz = (tag: string): string => `${WT[wochentag(tag) - 1]} ${tag.slice(8, 10)}.${tag.slice(5, 7)}.`

/** „Test heute" / „Test morgen" / „Test Fr" – nur in den nächsten 7 Tagen, sonst null */
export function testBaldText(termin: number | null | undefined, jetzt = Date.now()): string | null {
  if (!termin) return null
  const tag = tagVon(termin)
  const n = tageBis(tag, tagVon(jetzt))
  if (n < 0 || n > 7) return null
  return n === 0 ? 'Test heute' : n === 1 ? 'Test morgen' : `Test ${WT[wochentag(tag) - 1]}`
}

// ---------------------------------------------------------------- Abzeichen

/**
 * Das EINE Abzeichen einer Kurszeile nach Vorrang: Test bald > nicht geübt (Lernende ohne Übung seit 7 Tagen) >
 * Problemwörter (ab 3) > ✓. Ein Kurs ohne Lernende zeigt statt ✓ ein stilles „leer".
 */
export function kursAbzeichen(
  k: { testTermin: number | null; inaktiv: string[]; problem: number; lernende: number },
  jetzt = Date.now()
): StartAbzeichen {
  const test = testBaldText(k.testTermin, jetzt)
  if (test) return { art: 'test', text: test, reiter: 'vokabeln', hinweis: 'termin' }
  if (k.inaktiv.length) return { art: 'inaktiv', text: `${k.inaktiv.length} nicht geübt`, reiter: 'lernende', hinweis: 'inaktiv', ids: k.inaktiv }
  if (k.problem >= 3) return { art: 'problem', text: `${k.problem} Problemwörter`, reiter: 'vokabeln', hinweis: 'problem' }
  if (!k.lernende) return { art: 'leer', text: 'leer', reiter: 'lernende', hinweis: 'leer' }
  return { art: 'ok', text: '✓' }
}

// ---------------------------------------------------------------- Demnächst

export interface DemnaechstEintrag {
  /** „JJJJ-MM-TT"; null = Haltepunkt ohne Stundentermin */
  tag: string | null
  art: 'test' | 'halt' | 'onlinetest'
  /** „Vokabeltest 7b – Unit 2" bzw. „Haltepunkt „Julikrise" (9c)" bzw. Name des Onlinetests */
  text: string
  /** Kurs (Vokabeltest) bzw. Zuweisung der Reihe (Haltepunkt) bzw. Onlinetest */
  ziel: string
}

export const vokabeltestText = (gruppe: string, einheit: string): string => (einheit ? `Vokabeltest ${gruppe} – ${einheit}` : `Vokabeltest ${gruppe}`)
export const haltepunktText = (titel: string, gruppe: string): string => `Haltepunkt „${titel}"${gruppe ? ` (${gruppe})` : ''}`

/**
 * Offene Haltepunkte einer Reihe mit dem Tag ihrer Stunde (Stundentermine der Reihe, Ferien übersprungen) – ohne
 * Stundentermin bzw. ohne Stunde: tag = null.
 */
export function haltepunktTermine(
  r: Pick<Reihe, 'schritte' | 'stunden' | 'stundenTermine'>,
  frei: string[] = []
): { titel: string; tag: string | null }[] {
  const t = r.stundenTermine
  const tage = t && r.stunden?.length ? unterrichtsTage(t.beginn, t.tage, r.stunden.length) : []
  return (r.schritte ?? [])
    .filter((s) => s.halt?.art === 'freigabe' && !frei.includes(s.id))
    .map((s) => ({ titel: s.titel, tag: s.stunde !== undefined ? (tage[s.stunde] ?? null) : null }))
}

/**
 * „Demnächst": Vokabeltests der Kurse und Haltepunkte der Reihen – nur heute und später, zeitlich geordnet (am selben
 * Tag Tests zuerst), Haltepunkte ohne Datum am Ende. Seit 10.10.2026 auch noch nicht gestartete Onlinetests mit Termin,
 * sofern der Termin für die Lernenden nicht ausgeblendet ist.
 */
export function demnaechst(
  kurse: Pick<StartKurs, 'id' | 'gruppe' | 'einheit' | 'testTermin'>[],
  reihen: { zid: string; gruppe: string; halteTermine?: { titel: string; tag: string | null }[] }[],
  jetzt = Date.now(),
  onlinetests: { id: string; titel: string; status: string; termin?: string | null; terminVerborgen?: boolean }[] = []
): DemnaechstEintrag[] {
  const heute = tagVon(jetzt)
  const liste: DemnaechstEintrag[] = [
    ...onlinetests.flatMap((t) =>
      t.status === 'wartend' && t.termin && !t.terminVerborgen ? [{ tag: t.termin, art: 'onlinetest' as const, text: t.titel, ziel: t.id }] : []
    ),
    ...kurse.flatMap((k) => (k.testTermin ? [{ tag: tagVon(k.testTermin), art: 'test' as const, text: vokabeltestText(k.gruppe, k.einheit), ziel: k.id }] : [])),
    ...reihen.flatMap((r) => (r.halteTermine ?? []).map((h) => ({ tag: h.tag, art: 'halt' as const, text: haltepunktText(h.titel, r.gruppe), ziel: r.zid })))
  ]
  const rang = (e: DemnaechstEintrag): string => `${e.tag ?? '9999-99-99'}${e.art === 'halt' ? 1 : 0}`
  return liste.filter((e) => !e.tag || e.tag >= heute).sort((a, b) => (rang(a) < rang(b) ? -1 : rang(a) > rang(b) ? 1 : 0))
}

// ---------------------------------------------------------------- Kopf der Startseite (10.10.2026)

/** Ein Info-Chip im Kopf der Startseite („1 Test geplant") – führt in die passende App */
export interface KopfZahl {
  id: 'laeuft' | 'geplant' | 'pruefen' | 'abgaben' | 'bedarf' | 'vokabeltest' | 'haltepunkt'
  anzahl: number
  text: string
  /** Ausführlicher Text für den Tooltip */
  titel: string
  /** App, in die der Chip führt */
  ziel: string
}

/** „Bald" im Kopf: heute und die nächsten 7 Tage */
export const KOPF_BALD_TAGE = 7

const zahlWort = (n: number, eins: string, viele: string): string => `${n} ${n === 1 ? eins : viele}`

/**
 * Info-Chips im Kopf der Startseite (10.10.2026, Wunsch der Lehrkraft): nur aus den Daten, die der Schnellzugriff ohnehin
 * lädt, und nur mit einer Zahl > 0. Vokabeltests und Haltepunkte zählen, wenn sie in den nächsten 7 Tagen liegen.
 */
export function kopfZahlen(
  d: {
    laufend: number
    geplant: number
    zuPruefen: number
    /** Freigegebene Blätter mit neuen Abgaben (letzte zwei Tage) */
    neueAbgaben: number
    bedarf: number
    bald: DemnaechstEintrag[]
  },
  jetzt = Date.now()
): KopfZahl[] {
  const heute = tagVon(jetzt)
  const nah = (e: DemnaechstEintrag): boolean => !!e.tag && tageBis(e.tag, heute) <= KOPF_BALD_TAGE
  const tests = d.bald.filter((e) => e.art === 'test' && nah(e))
  const halte = d.bald.filter((e) => e.art === 'halt' && nah(e))
  const liste = (e: DemnaechstEintrag[]): string => e.map((x) => `${tagKurz(x.tag ?? '')} ${x.text}`).join('\n')
  const alle: KopfZahl[] = [
    { id: 'laeuft', anzahl: d.laufend, text: d.laufend === 1 ? '1 Test läuft' : `${d.laufend} Tests laufen`, titel: 'Laufende Onlinetests', ziel: 'onlinetest' },
    { id: 'geplant', anzahl: d.geplant, text: `${zahlWort(d.geplant, 'Test', 'Tests')} geplant`, titel: 'Geplante, noch nicht gestartete Onlinetests', ziel: 'onlinetest' },
    { id: 'pruefen', anzahl: d.zuPruefen, text: `${zahlWort(d.zuPruefen, 'Test', 'Tests')} zu prüfen`, titel: 'Beendete Onlinetests mit Antworten zu prüfen', ziel: 'onlinetest' },
    {
      id: 'abgaben',
      anzahl: d.neueAbgaben,
      text: `${zahlWort(d.neueAbgaben, 'Blatt', 'Blätter')} mit neuen Abgaben`,
      titel: 'Freigegebene Blätter mit Abgaben aus den letzten zwei Tagen',
      ziel: 'freigaben'
    },
    { id: 'bedarf', anzahl: d.bedarf, text: `${d.bedarf} × Handlungsbedarf`, titel: 'Unterrichtsreihen: Abgaben, Fragen, Hilferufe', ziel: 'laufendereihen' },
    { id: 'vokabeltest', anzahl: tests.length, text: `${zahlWort(tests.length, 'Vokabeltest', 'Vokabeltests')} bald`, titel: liste(tests), ziel: 'sprachenlernen' },
    { id: 'haltepunkt', anzahl: halte.length, text: `${zahlWort(halte.length, 'Haltepunkt', 'Haltepunkte')} bald`, titel: liste(halte), ziel: 'laufendereihen' }
  ]
  return alle.filter((z) => z.anzahl > 0)
}

// ---------------------------------------------------------------- Anzahl je Karte (Smartphone)

/** Wahl der Anzahl: 0 = alle */
export const ANZAHL_WAHL = [5, 10, 20, 0] as const
export const ANZAHL_VORGABE = 5

/** Gespeicherten Wert lesen: nur erlaubte Werte, sonst die Vorgabe */
export function anzahlAus(roh: string | null | undefined): number {
  const n = Number(roh)
  return roh != null && roh !== '' && (ANZAHL_WAHL as readonly number[]).includes(n) ? n : ANZAHL_VORGABE
}

export const anzahlText = (n: number): string => (n === 0 ? 'alle' : String(n))

/** Die ersten `n` (0 = alle) */
export const begrenzt = <T>(liste: T[], n: number): T[] => (n === 0 ? liste : liste.slice(0, n))
