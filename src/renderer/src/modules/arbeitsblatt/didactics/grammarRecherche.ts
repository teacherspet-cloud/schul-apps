/**
 * Grammatik-Recherche vom 06.10.2026 über den Bestand legen (Wunsch der Lehrkraft: „Recherchiere für jedes Bundesland,
 * Schulform und Fach noch einmal die Grammatikformen, ordne sie dem GER und den Schuljahrgängen je Schulform zu. Sei sehr
 * ausführlich."). Abgestimmt:
 *  - THEMA MIT TEILFORMEN: Jedes Thema trägt seine Teilformen (simple past → regelmäßig, unregelmäßig, Verneinung …),
 *    jede mit eigener Stufe und GER.
 *  - GRUNDLINIE + BELEGTE ABWEICHUNGEN je Land/Schulform (und Fremdsprachenfolge) – nur mit Lehrplanbeleg.
 *  - GER getrennt: erkennen / bilden / sicher (Latein/Griechisch: Phasen; Deutsch: Jahrgangsstufe als Text).
 *
 * Daten: grammatikRecherche.json, erzeugt mit `node scripts/grammatik-katalog.mjs` aus recherche/grammatik-2026-10-06/
 * (Berichte mit Quellenlage je Land dort). NICHT von Hand bearbeiten – die Recherche ändern und neu erzeugen.
 *
 * Zusammenführung: Bestandsthemen (gleiche Kennung) behalten Name und Fachbegriff und übernehmen Stufen, GER, Fehler,
 * Quellen und Teilformen der Recherche;
 * Übungsformate und „Quellen uneins" bleiben aus dem Bestand. Neue Themen kommen dazu.
 */
import daten from './grammatikRecherche.json'
import type { GrammarTopic } from './grammarTopics'

export interface GrammarTeilform {
  id: string
  label: string
  term?: string
  from: number
  to: number
  erkennen?: string
  bilden?: string
  sicher?: string
  /** Auf der Stufe nur erkennen, nicht selbst bilden */
  nurErkennen?: boolean
  beispiele?: string[]
  fehler?: string
  quelle?: string
}

export interface GrammarAbweichung {
  /** Leer = alle Länder */
  laender: string[]
  /** Leer = alle Schulformen */
  schulformen: string[]
  /** Gilt nur für diese Fremdsprachenfolge (grammar.ts LanguageSequence); from/to zählen dann im Lernjahr DIESES Kurses */
  folge?: 'fs1' | 'fs2' | 'fs3' | 'spaet'
  folgeText?: string
  /** Im Plan dieser Schulform nicht genannt */
  entfaellt?: boolean
  /** Gilt nur für diese Teilform (Kennung) */
  teilform?: string
  /** Im Plan nur als Wahlinhalt */
  fakultativ?: boolean
  /** Dort zunächst nur erkennen */
  nurErkennen?: boolean
  from?: number
  to?: number
  /** Nur GER-Stufe, keine Jahrgänge (z. B. Hamburger Basisgrammatik) */
  niveau?: string
  quelle?: string
  hinweis?: string
}

interface RechercheThema {
  id: string
  neu?: boolean
  label?: string
  term?: string
  area?: string
  from: number
  to: number
  erkennen?: string
  bilden?: string
  sicher?: string
  nurErkennen?: boolean
  quelle?: string
  beschreibung?: string
  beispiele?: string[]
  fehler?: string
  lateStart?: number
  teilformen: GrammarTeilform[]
  abweichungen: GrammarAbweichung[]
}

const KATALOG = daten as unknown as Record<string, { quellen: { kurz: string; titel: string; url: string }[]; themen: RechercheThema[] }>

/** Quellenverzeichnis je Fach (Kurzzeichen → Titel, Adresse) */
export const GRAMMATIK_QUELLEN: Record<string, { kurz: string; titel: string; url: string }[]> = Object.fromEntries(
  Object.entries(KATALOG).map(([f, k]) => [f, k.quellen])
)

const stufe = (from: number, to: number): string => (from === to ? `${from}` : `${from}–${to}`)

export function mitRecherche(bestand: GrammarTopic[]): GrammarTopic[] {
  const nachId = new Map(bestand.map((t) => [t.id, t]))
  const neu: GrammarTopic[] = []
  const geaendert = new Map<string, GrammarTopic>()
  for (const [fach, k] of Object.entries(KATALOG)) {
    const skala = bestand.find((t) => t.subject === fach)?.scale ?? (fach === 'deutsch' ? 'jahrgang' : fach === 'daz' ? 'erwerbsstufe' : 'lernjahr')
    for (const r of k.themen) {
      const alt = nachId.get(r.id)
      const gleich = alt && alt.subject === fach
      const basis: GrammarTopic = gleich
        ? alt
        : {
            id: r.id,
            subject: fach,
            scale: skala,
            label: r.label ?? r.term ?? r.id,
            term: r.term ?? '',
            area: r.area ?? 'Weitere',
            from: r.from,
            to: r.to,
            stage: stufe(r.from, r.to),
            level: '',
            errors: '',
            formats: [],
            formatsText: ''
          }
      const stufenGeaendert = !gleich || alt.from !== r.from || alt.to !== r.to
      const t: GrammarTopic = {
        ...basis,
        // Name und Fachbegriff bestehender Themen bleiben (gespeicherte Blätter, Aufträge, Tests)
        ...(r.term && !basis.term ? { term: r.term } : {}),
        ...(r.area && !gleich ? { area: r.area } : {}),
        from: r.from,
        to: r.to,
        // DaZ „1a/1b", Latein „Lektürephase": die feinere Angabe bleibt, solange sich die Stufe nicht ändert
        stage: stufenGeaendert ? stufe(r.from, r.to) : basis.stage,
        // Einführungsniveau (grammar.ts einfuehrungsNiveau, Niveau-Filter der Auswahl) = ab wann die Form im Unterricht
        // vorkommt (erkennen). „bilden" als Maßstab war zu streng: Klasse 6 (A1+) verlor das Perfekt.
        level: r.erkennen ?? r.bilden ?? basis.level,
        ...(r.erkennen ? { erkennen: r.erkennen } : {}),
        ...(r.bilden ? { bilden: r.bilden } : {}),
        ...(r.sicher ? { sicher: r.sicher } : {}),
        ...(r.nurErkennen ? { receptive: true } : {}),
        // Stolperstellen: belegte des Bestands UND der Recherche
        ...(r.fehler ? { errors: basis.errors && !basis.errors.includes(r.fehler) ? `${basis.errors}; ${r.fehler}` : r.fehler } : {}),
        ...(r.beschreibung ? { description: r.beschreibung } : {}),
        ...(r.beispiele?.length ? { examples: r.beispiele } : {}),
        ...(r.quelle ? { source: r.quelle } : {}),
        ...(r.lateStart !== undefined ? { lateStart: r.lateStart } : {}),
        teilformen: r.teilformen,
        abweichungen: r.abweichungen
      }
      if (gleich) geaendert.set(t.id, t)
      else if (!nachId.has(t.id)) neu.push(t)
    }
  }
  return [...bestand.map((t) => geaendert.get(t.id) ?? t), ...neu]
}
