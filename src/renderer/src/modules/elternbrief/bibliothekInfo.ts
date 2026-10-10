/**
 * Bibliothek der Elternbriefe (09.10.2026, Entscheidung der Lehrkraft): geordnet nach Schuljahr → Klasse → Datum
 * (neueste zuerst). Je Brief stehen Anlass (ohne KI aus Betreff und Text erkannt, im Menü änderbar), der
 * Termin aus dem Brief, die Rückmeldefrist mit Ampel und die Sprachen der Übersetzungen. „Als Vorlage für neuen
 * Brief" übernimmt Text und Aufbau ohne Daten, Fristen und Klasse.
 *
 * Alles hier ist reine Rechnung (ohne Oberfläche) – getestet in tests/elternbriefBibliothek.test.ts.
 */
import { schuljahrVon } from '@shared/grammatikJahrgang'
import type { BriefText, Elternbrief } from './model'

// ---------- Anlass ----------

export const ANLASS_ARTEN = ['Ausflug/Wandertag', 'Elternabend', 'Klassenfahrt', 'Information', 'Termine', 'Sprechtag', 'Sonstiges'] as const
export type AnlassArt = (typeof ANLASS_ARTEN)[number]

/** Farbe der Anlass-Marke (Mantine-Farbname) */
export const ANLASS_FARBE: Record<AnlassArt, string> = {
  'Ausflug/Wandertag': 'green',
  Elternabend: 'violet',
  Klassenfahrt: 'teal',
  Information: 'blue',
  Termine: 'cyan',
  Sprechtag: 'grape',
  Sonstiges: 'gray'
}

/** Stichwörter je Anlass – Reihenfolge = Vorrang (Klassenfahrt vor Ausflug: „Fahrt" ist spezieller) */
const STICHWOERTER: [AnlassArt, RegExp][] = [
  ['Klassenfahrt', /klassenfahrt|klassenreise|schullandheim|studienfahrt|abschlussfahrt|skifahrt|skifreizeit|kursfahrt|jugendherberge|mehrtägige fahrt/i],
  ['Elternabend', /elternabend|elternversammlung|klassenpflegschaft|klassenelternversammlung|elterninformationsabend/i],
  ['Sprechtag', /sprechtag|sprechstunde|sprechzeit|gesprächsangebot|gesprächstermin|beratungsgespräch|elterngespräch/i],
  ['Ausflug/Wandertag', /ausflug|wandertag|exkursion|unterrichtsgang|museumsbesuch|theaterbesuch|kinobesuch|besuch (?:des|der|im|in)|wildpark|tierpark|zoo\b|lerngang/i],
  ['Termine', /\btermine\b|terminübersicht|terminplan|jahresplanung|ferientermine|schulfest|sportfest|bundesjugendspiele|zeugnisausgabe|beweglicher ferientag/i],
  ['Information', /information|informationen|\binfo\b|mitteilung|hinweis|neuigkeiten|wichtig/i]
]

/** Anlass aus dem Formular (model.ts, ANLAESSE) → Art; „Allgemeine Information" zählt erst nach dem Text */
const AUS_FORMULAR: Record<string, AnlassArt> = {
  Elternabend: 'Elternabend',
  'Ausflug oder Wandertag': 'Ausflug/Wandertag',
  Klassenfahrt: 'Klassenfahrt',
  Gesprächsangebot: 'Sprechtag'
}

const treffer = (text: string): AnlassArt | null => STICHWOERTER.find(([, re]) => re.test(text))?.[0] ?? null

/**
 * Anlass ohne KI: zuerst Betreff und Titel, dann der Anlass aus dem Formular (wenn er eindeutig ist), dann der
 * Text, zuletzt „Allgemeine Information" → Information, sonst Sonstiges.
 */
export function erkenneAnlass(b: Pick<Elternbrief, 'meta' | 'text'>): AnlassArt {
  const kopf = [b.meta.title, b.text?.betreff ?? ''].join(' ')
  const ausKopf = treffer(kopf)
  if (ausKopf) return ausKopf
  const formular = AUS_FORMULAR[b.meta.anlass]
  if (formular) return formular
  const text = [...(b.text?.absaetze ?? []), b.meta.stichpunkte].join(' ')
  // Im Fließtext ist „Information/Hinweis" zu allgemein – nur die spezielleren Anlässe zählen dort
  const ausText = treffer(text)
  if (ausText && ausText !== 'Information') return ausText
  if (b.meta.anlass === 'Allgemeine Information' || ausText === 'Information') return 'Information'
  return 'Sonstiges'
}

/** Gewählter Anlass (Menü) vor dem erkannten */
export const anlassVon = (b: Pick<Elternbrief, 'meta' | 'text'>): AnlassArt =>
  b.meta.anlassArt && (ANLASS_ARTEN as readonly string[]).includes(b.meta.anlassArt) ? (b.meta.anlassArt as AnlassArt) : erkenneAnlass(b)

// ---------- Datum im Text ----------

const MONATE = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember']
const WOCHENTAG = '(?:Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag|Mo|Di|Mi|Do|Fr|Sa|So)\\.?,?\\s+(?:den\\s+)?'
/** 17.10. / 17.10.2026 / 17.10.26 / 17. Oktober (2026) – mit Wochentag davor, wenn einer da ist */
const DATUM_QUELLE = `(?:${WOCHENTAG})?(?<![\\d.])(\\d{1,2})\\.\\s?(?:(\\d{1,2})\\.(\\d{4}|\\d{2})?(?![\\d])|(${MONATE.join('|')})\\b(?:\\s(\\d{4}))?)`
const datumRe = (): RegExp => new RegExp(DATUM_QUELLE, 'gi')

const iso = (j: number, m: number, t: number): string => `${j}-${String(m).padStart(2, '0')}-${String(t).padStart(2, '0')}`
const gueltigIso = (s?: string): s is string => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '')
const alsDatum = (s: string): Date => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)))

/**
 * Alle Daten eines Textes als JJJJ-MM-TT. Ohne Jahr gilt das Jahr des Bezugs (Briefdatum); liegt der Tag dann
 * mehr als ein halbes Jahr davor, ist das nächste Jahr gemeint (Brief im Dezember, Termin im Januar).
 */
export function datenImText(text: string, bezug: string): { iso: string; index: number; laenge: number }[] {
  const ref = gueltigIso(bezug) ? alsDatum(bezug) : new Date()
  const out: { iso: string; index: number; laenge: number }[] = []
  for (const m of text.matchAll(datumRe())) {
    const tag = Number(m[1])
    const monat = m[2] ? Number(m[2]) : MONATE.indexOf((m[4] ?? '').toLowerCase()) + 1
    let jahr = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : m[5] ? Number(m[5]) : 0
    if (tag < 1 || tag > 31 || monat < 1 || monat > 12) continue
    if (!jahr) {
      jahr = ref.getFullYear()
      if (new Date(jahr, monat - 1, tag).getTime() < ref.getTime() - 183 * 864e5) jahr++
    }
    out.push({ iso: iso(jahr, monat, tag), index: m.index ?? 0, laenge: m[0].length })
  }
  return out
}

/** Fette Stellen eines Textes (**…**) */
const fetteStellen = (text: string): string[] => text.split('**').filter((_, i) => i % 2 === 1)

/**
 * Rückmeldefrist: das Feld „Rückgabe bis" (bei Rücklaufzettel), sonst das erste Datum auf dem Abschnitt, sonst ein
 * „bis …"-Datum in einem Satz über Rückmeldung/Anmeldung/Rückgabe. Leer, wenn es keine gibt.
 */
export function rueckmeldungBis(b: Pick<Elternbrief, 'meta' | 'text'>): string {
  const bezug = b.meta.datum
  if (b.meta.ruecklauf && gueltigIso(b.meta.rueckgabeBis)) return b.meta.rueckgabeBis
  const abschnitt = b.text?.ruecklauf?.zeilen.join(' ') ?? ''
  const ausAbschnitt = datenImText(abschnitt, bezug)[0]
  if (ausAbschnitt) return ausAbschnitt.iso
  for (const absatz of b.text?.absaetze ?? []) {
    for (const satz of absatz.replace(/\*\*/g, '').split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ])/)) {
      if (!/rückmeld|rückgabe|zurück|anmeld|melden|abgeben|abzugeben|mitteilen|antwort|zusagen|absagen/i.test(satz)) continue
      const d = datenImText(satz, bezug).find((x) => /(?:bis|spätestens)\s+(?:zum\s+|zur\s+|am\s+)?$/i.test(satz.slice(Math.max(0, x.index - 20), x.index)))
      if (d) return d.iso
    }
  }
  return ''
}

/**
 * Termin des Briefes (nicht das Briefdatum): das Termin-Feld, sonst das erste fette Datum im Text, sonst das erste
 * Datum im Text – jeweils ohne die Rückmeldefrist. Leer, wenn der Brief keinen Termin nennt.
 */
export function kernDatum(b: Pick<Elternbrief, 'meta' | 'text'>): string {
  if (gueltigIso(b.meta.termin?.datum)) return b.meta.termin.datum
  const frist = rueckmeldungBis(b)
  const bezug = b.meta.datum
  const absaetze = b.text?.absaetze ?? []
  const fett = absaetze.flatMap(fetteStellen).flatMap((s) => datenImText(s, bezug))
  const erstes = fett.find((d) => d.iso !== frist) ?? absaetze.flatMap((a) => datenImText(a.replace(/\*\*/g, ''), bezug)).find((d) => d.iso !== frist)
  return erstes?.iso ?? ''
}

const WOCHENTAG_KURZ = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

/** „Fr 17.10." aus JJJJ-MM-TT; leer ohne gültiges Datum */
export function tagKurz(s?: string): string {
  if (!gueltigIso(s)) return ''
  return `${WOCHENTAG_KURZ[alsDatum(s).getDay()]} ${s.slice(8, 10)}.${s.slice(5, 7)}.`
}

/** Tage von heute bis zum Datum (heute = 0, gestern = -1) */
export function tageBis(s: string, heute = new Date()): number {
  const h = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate())
  return Math.round((alsDatum(s).getTime() - h.getTime()) / 864e5)
}

export type FristStufe = 'vorbei' | 'dringend' | 'bald' | 'spaeter'

/** Ampel der Frist: vorbei (grau), in höchstens 3 Tagen (rot), in höchstens 7 Tagen (orange), später */
export function fristStufe(s: string, heute = new Date()): FristStufe {
  const t = tageBis(s, heute)
  return t < 0 ? 'vorbei' : t <= 3 ? 'dringend' : t <= 7 ? 'bald' : 'spaeter'
}

export const FRIST_FARBE: Record<FristStufe, string> = { vorbei: 'gray', dringend: 'red', bald: 'orange', spaeter: 'blue' }

// ---------- Klassen und Schuljahr ----------

/** „7a, 7b" / „7a und 7b" / „7a/b" → ['7a', '7b']; „Klasse 7b" → ['7b'] */
export function klassenListe(klasse: string): string[] {
  const teile = String(klasse ?? '')
    .replace(/\bKlassen?\b/gi, '')
    .split(/\s*(?:,|;|\/|&|\+|\bund\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean)
  const out: string[] = []
  let stufe = ''
  for (const t of teile) {
    const m = /^(\d{1,2})/.exec(t)
    if (m) stufe = m[1]
    // „7a/b": der Buchstabe allein gehört zur Stufe davor
    const k = !m && stufe && /^[a-zäöü]{1,2}$/i.test(t) ? `${stufe}${t}` : t
    if (!out.includes(k)) out.push(k)
  }
  return out
}

/** Beginn-Jahr des Schuljahres eines Datums (Schulkalender: ab dem ersten Schultag nach den Sommerferien; sonst 1. August) */
export const schuljahrAus = (s: string): number => schuljahrVon(alsDatum(s).getTime())
/** „2026/27" */
export const schuljahrName = (j: number): string => `${j}/${String((j + 1) % 100).padStart(2, '0')}`

export const OHNE_KLASSE = 'Ohne Klasse'

// ---------- Kurzinfo je Brief (steht in den Bibliotheks-Angaben) ----------

export interface BriefInfo {
  v: 1
  betreff: string
  anlassArt: AnlassArt
  /** Termin des Anlasses (JJJJ-MM-TT) oder leer */
  termin: string
  /** Rückmeldefrist (JJJJ-MM-TT) oder leer */
  frist: string
  /** Sprachen der Übersetzungen („tr", „ar" …) */
  sprachen: string[]
  klassen: string[]
  /** Briefdatum (JJJJ-MM-TT) – bestimmt das Schuljahr */
  datum: string
}

export function briefInfo(b: Elternbrief): BriefInfo {
  return {
    v: 1,
    betreff: b.text?.betreff ?? '',
    anlassArt: anlassVon(b),
    termin: kernDatum(b),
    frist: rueckmeldungBis(b),
    sprachen: b.uebersetzungen.map((u) => u.code),
    klassen: klassenListe(b.meta.klasse),
    datum: gueltigIso(b.meta.datum) ? b.meta.datum : b.createdAt.slice(0, 10)
  }
}

/** Kurzinfo aus den gespeicherten Angaben – undefined bei Briefen von vor dieser Bibliothek */
export const gespeicherteInfo = (m: { [feld: string]: unknown }): BriefInfo | undefined =>
  m.eb && typeof m.eb === 'object' && (m.eb as BriefInfo).v === 1 ? (m.eb as BriefInfo) : undefined

// ---------- Ordnen ----------

export interface Eintrag<M> {
  meta: M
  info: BriefInfo
}

export interface SchuljahrGruppe<M> {
  jahr: number
  name: string
  aktuell: boolean
  anzahl: number
  klassen: { klasse: string; briefe: Eintrag<M>[] }[]
}

/** Klassen natürlich sortiert (5a < 5b < 10a), „Ohne Klasse" zuletzt */
const klassenOrdnung = (a: string, b: string): number =>
  a === OHNE_KLASSE ? 1 : b === OHNE_KLASSE ? -1 : a.localeCompare(b, 'de', { numeric: true, sensitivity: 'base' })

/**
 * Schuljahr → Klasse → Briefe nach Datum (neueste zuerst). Ein Brief an mehrere Klassen steht unter jeder; ohne
 * Klasse unter „Ohne Klasse". Neuestes Schuljahr zuerst. `anzahl` zählt jeden Brief einmal.
 */
export function ordneBriefe<M extends { id: string; updatedAt: string }>(liste: Eintrag<M>[], heute = new Date()): SchuljahrGruppe<M>[] {
  const jetzt = schuljahrVon(heute.getTime())
  const jahre = new Map<number, Eintrag<M>[]>()
  for (const e of liste) {
    const j = schuljahrAus(e.info.datum)
    jahre.set(j, [...(jahre.get(j) ?? []), e])
  }
  const neuesteZuerst = (a: Eintrag<M>, b: Eintrag<M>): number => b.info.datum.localeCompare(a.info.datum) || b.meta.updatedAt.localeCompare(a.meta.updatedAt)
  return [...jahre.entries()]
    .sort(([a], [b]) => b - a)
    .map(([jahr, briefe]) => {
      const klassen = new Map<string, Eintrag<M>[]>()
      for (const e of briefe) for (const k of e.info.klassen.length ? e.info.klassen : [OHNE_KLASSE]) klassen.set(k, [...(klassen.get(k) ?? []), e])
      return {
        jahr,
        name: schuljahrName(jahr),
        aktuell: jahr === jetzt,
        anzahl: briefe.length,
        klassen: [...klassen.entries()].sort(([a], [b]) => klassenOrdnung(a, b)).map(([klasse, l]) => ({ klasse, briefe: [...l].sort(neuesteZuerst) }))
      }
    })
}

/** Die zuletzt bearbeiteten Briefe (höchstens `n`) */
export const zuletztBearbeitet = <M extends { updatedAt: string }>(liste: M[], n = 4): M[] => [...liste].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, n)

// ---------- Als Vorlage ----------

const escRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Daten durch „[Datum]" ersetzen, die alten Klassen hinter „Klasse(n)" durch „[Klasse]" */
export function ohneDatenUndKlasse(text: string, klassen: string[]): string {
  let t = text.replace(datumRe(), '[Datum]')
  for (const k of [...klassen].sort((a, b) => b.length - a.length)) {
    t = t.replace(new RegExp(`(Klassen?\\s+(?:(?:\\[Klasse\\]|[\\wäöüÄÖÜ]+)\\s*(?:,|und|/|&)\\s*)*)${escRe(k)}(?![\\wäöüÄÖÜ])`, 'g'), '$1[Klasse]')
  }
  // „[Klasse], [Klasse] und [Klasse]" → eine Lücke
  return t.replace(/\[Klasse\](?:\s*(?:,|und|\/|&)\s*\[Klasse\])+/g, '[Klasse]')
}

const textOhne = (t: BriefText, klassen: string[]): BriefText => {
  const f = (s: string): string => ohneDatenUndKlasse(s, klassen)
  return {
    betreff: f(t.betreff),
    anrede: f(t.anrede),
    absaetze: t.absaetze.map(f),
    gruss: t.gruss,
    ...(t.ruecklauf ? { ruecklauf: { titel: f(t.ruecklauf.titel), zeilen: t.ruecklauf.zeilen.map(f) } } : {})
  }
}

/**
 * „Als Vorlage für neuen Brief": Text und Aufbau (Ton, Rücklaufzettel, Stichpunkte) bleiben, der Anlass auch.
 * Weg sind Termin, Rückgabefrist, Klasse, Titel, Übersetzungen und frühere Fassungen; Daten im Text werden zu
 * „[Datum]", die alte Klasse zu „[Klasse]". Das Briefdatum (Datum der Unterschrift) ist heute.
 */
export function alsVorlage(b: Elternbrief, heute = new Date()): Elternbrief {
  const klassen = klassenListe(b.meta.klasse)
  const { termin: _t, rueckgabeBis: _r, ...meta } = b.meta
  return {
    version: 1,
    meta: {
      ...meta,
      title: '',
      klasse: '',
      anlassArt: anlassVon(b),
      stichpunkte: ohneDatenUndKlasse(b.meta.stichpunkte, klassen),
      datum: iso(heute.getFullYear(), heute.getMonth() + 1, heute.getDate())
    },
    text: b.text ? textOhne(b.text, klassen) : null,
    uebersetzungen: [],
    createdAt: heute.toISOString(),
    ...(b.design !== undefined ? { design: b.design } : {})
  }
}
