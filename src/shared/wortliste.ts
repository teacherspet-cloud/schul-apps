/**
 * Wortliste im Fachordner der Lernenden (09.10.2026, Wunsch der Lehrkraft): ein eigenes Register neben Vokabeln,
 * Grammatik und Materialien – alle Wörter, die für die Person im Fach freigegeben sind (alle Kurse des Fachs, nur
 * freie Abschnitte, dazu bei Konten die freien Abschnitte des Vokabelwegs), nach Unit/Abschnitt gruppiert, neueste
 * zuerst. Je Wort ein Punkt für den eigenen Stand (neu / im Aufbau / sicher).
 * Suche sofort in beiden Sprachen und im Beispielsatz – ohne Rücksicht auf Groß/klein und Akzente (é/è/ê, ñ, ü,
 * Makra im Latein, Akzente im Griechischen); Kyrillisch und Griechisch werden so gesucht, wie sie getippt werden.
 * Rein rechnend: Der Server (server/wortliste.ts) reicht Wörter, Abschnitte und Lernstände herein.
 */
import { istSicher, type Vokabel, type WortStand } from './vokabeltrainer'
import type { AbschnittEinordnung, KursTeil } from './kursAbschnitte'
import type { MeinBuch } from './meineBuecher'

export type WortStatus = 'neu' | 'aufbau' | 'sicher'

export interface WortlisteWort {
  id: string
  term: string
  translation: string
  example?: string
  exampleTranslation?: string
  pos?: string
  status: WortStatus
}

export interface WortlisteGruppe {
  /** eindeutig im Fach (Kurs bzw. Vokabelweg + Abschnitt) */
  key: string
  titel: string
  /** Freigabe des Abschnitts (ms); Lehrwerksabschnitte des Vokabelwegs: 0 */
  zeit: number
  /** Reihenfolge bei gleicher Zeit (Buchreihenfolge im Vokabelweg) */
  folge: number
  woerter: WortlisteWort[]
  /** Im Buch (10.10.2026): Unit und Abschnitt einzeln – die Buchansicht gruppiert Abschnitte in ihre Unit */
  unit?: string
  abschnitt?: string
}

export interface Wortliste {
  fach: string
  /** Sprachkürzel für die Aussprache ('' = unbekannt) */
  sprache: string
  /** Seit „Meine Bücher" (09.10.2026): Wörter, die in keinem Band auf dem Bord stehen („Weitere Wörter") */
  gruppen: WortlisteGruppe[]
  /** Bücherbord (09.10.2026, shared/meineBuecher.ts): frühere Bände vollständig, der aktuelle mit freigegebenen Abschnitten */
  buecher?: MeinBuch[]
}

/** Eigener Stand eines Wortes: neu (noch nicht kennengelernt), sicher (zweimal frei gewusst im Abstand einer Woche oder Langzeit), sonst im Aufbau */
export function wortStatus(st: WortStand | undefined): WortStatus {
  if (!st || (st.fach <= 0 && !st.versuche)) return 'neu'
  if (istSicher(st) || st.fach >= 6) return 'sicher'
  return st.fach <= 0 ? 'neu' : 'aufbau'
}

export const STATUS_NAME: Record<WortStatus, string> = { neu: 'neu', aufbau: 'im Aufbau', sicher: 'sicher' }

/** Name eines Abschnitts aus der Einordnung („Unit 2 · Station 1"), sonst der Titel des Teils */
export function abschnittTitel(e: AbschnittEinordnung | undefined, titel: string): string {
  if (!e) return titel
  const name = e.name.trim()
  if (e.unit && name && name !== e.unit) return `${e.unit} · ${name}`
  return e.unit || name || titel
}

/**
 * Gruppen eines Vokabelkurses: Die Teile stehen in Freigabe-Reihenfolge hintereinander in der Wortliste
 * (server/vokabeln.ts `teileVon`). Passt die Summe nicht (ältere Daten), landen übrige Wörter im letzten Teil.
 */
export function kursGruppen(
  kursId: string,
  teile: Pick<KursTeil, 'titel' | 'anzahl' | 'zeit'>[],
  einordnung: AbschnittEinordnung[],
  woerter: Vokabel[],
  staende: Record<string, WortStand>
): WortlisteGruppe[] {
  const gruppen: WortlisteGruppe[] = []
  let pos = 0
  teile.forEach((t, i) => {
    const letzter = i === teile.length - 1
    const stueck = letzter ? woerter.slice(pos) : woerter.slice(pos, pos + Math.max(0, t.anzahl))
    pos += stueck.length
    if (!stueck.length) return
    gruppen.push({
      key: `${kursId}:${i}`,
      titel: abschnittTitel(einordnung[i], t.titel),
      zeit: t.zeit || 0,
      folge: i,
      woerter: stueck.map((v) => wortAus(v, staende[v.id]))
    })
  })
  return gruppen
}

export const wortAus = (v: Vokabel, st: WortStand | undefined): WortlisteWort => ({
  id: v.id,
  term: v.term,
  translation: v.translation,
  ...(v.example ? { example: v.example } : {}),
  ...(v.exampleTranslation ? { exampleTranslation: v.exampleTranslation } : {}),
  ...(v.pos ? { pos: v.pos } : {}),
  status: wortStatus(st)
})

/**
 * Gruppen zusammenführen: jedes Wort nur einmal (gleiches Wort mit gleicher Bedeutung – in dem Abschnitt, in dem
 * es zuerst kam), leere Gruppen fallen weg, neueste Gruppe zuerst.
 */
export function zusammenfuehren(gruppen: WortlisteGruppe[]): WortlisteGruppe[] {
  const alt = [...gruppen].sort((a, b) => a.zeit - b.zeit || a.folge - b.folge)
  const gesehen = new Set<string>()
  const aus: WortlisteGruppe[] = []
  for (const g of alt) {
    const woerter = g.woerter.filter((w) => {
      const k = `${suchform(w.term)}\u0001${suchform(w.translation)}`
      if (gesehen.has(k)) return false
      gesehen.add(k)
      return true
    })
    if (woerter.length) aus.push({ ...g, woerter })
  }
  return aus.reverse()
}

const ERSATZ: Record<string, string> = { ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ı: 'i', ς: 'σ', '’': "'", '‘': "'", ʼ: "'", '`': "'", '´': "'" }

/**
 * Suchform: klein, ohne diakritische Zeichen (é → e, ñ → n, ü → u, ā → a, ά → α, ё → е; „й" bleibt), Sonderbuchstaben
 * ausgeschrieben (ß → ss), Apostrophe vereinheitlicht, Leerraum zusammengefasst. Andere Schriften bleiben, wie sie sind.
 */
export function suchform(s: string): string {
  return s
    .normalize('NFKD')
    .toLowerCase()
    // „й" ist im Russischen ein eigener Buchstabe (anders als „ё", das oft als „е" geschrieben wird)
    .replace(/й/g, 'й')
    .replace(/\p{M}+/gu, '')
    .replace(/[ßæœøłđðþıς’‘ʼ`´]/g, (c) => ERSATZ[c] ?? c)
    .replace(/\s+/g, ' ')
    .trim()
}

/** Suchtext eines Wortes (beide Sprachen, Beispielsatz und seine Übersetzung) – einmal je Liste berechnen */
export const suchtextVon = (w: WortlisteWort): string =>
  suchform([w.term, w.translation, w.pos ?? '', w.example ?? '', w.exampleTranslation ?? ''].join(' \u0001 '))

export interface Suchindex {
  texte: Map<string, string>
}
export function suchindex(gruppen: WortlisteGruppe[]): Suchindex {
  const texte = new Map<string, string>()
  for (const g of gruppen) for (const w of g.woerter) texte.set(`${g.key}\u0002${w.id}`, suchtextVon(w))
  return { texte }
}

/**
 * Filtern: Jedes Suchwort muss vorkommen (Teilwort genügt, Reihenfolge egal). Leere Suche = alles.
 * Ergebnis: nur Gruppen mit Treffern, in der Reihenfolge der Liste, und die Zahl der Treffer.
 */
export function wortlisteFiltern(gruppen: WortlisteGruppe[], suche: string, index: Suchindex = suchindex(gruppen)): { gruppen: WortlisteGruppe[]; anzahl: number } {
  const teile = suchform(suche).split(' ').filter(Boolean)
  if (!teile.length) return { gruppen, anzahl: gruppen.reduce((n, g) => n + g.woerter.length, 0) }
  let anzahl = 0
  const aus: WortlisteGruppe[] = []
  for (const g of gruppen) {
    const woerter = g.woerter.filter((w) => {
      const t = index.texte.get(`${g.key}\u0002${w.id}`) ?? suchtextVon(w)
      return teile.every((x) => t.includes(x))
    })
    if (woerter.length) {
      anzahl += woerter.length
      aus.push({ ...g, woerter })
    }
  }
  return { gruppen: aus, anzahl }
}
