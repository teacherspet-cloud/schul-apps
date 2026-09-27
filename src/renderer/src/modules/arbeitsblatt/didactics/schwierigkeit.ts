/**
 * Schwierigkeit eines Arbeitsblatts (27.09.2026).
 *
 * Bis dahin bestimmte allein das Lerngruppen-Profil (Jahrgang, Schulform) den Anspruch, und bei
 * Differenzierung waren die Stufen fest vergeben: ★ grundlegend, ★★ mittel, ★★★ erweitert. Ein
 * einzelnes Blatt konnte also nicht bewusst leichter oder schwerer als der Jahrgang sein, und
 * zwei Fassungen konnten nicht „mittel und anspruchsvoll" heißen.
 *
 * BELEGT (Aufgabenanalyse nach Maier, Kleinknecht, Metz & Bohl 2010, „Ein allgemeindidaktisches
 * Kategoriensystem zur Analyse des kognitiven Potenzials von Aufgaben"): Schwierigkeit entsteht
 * aus mehreren Merkmalen – Wissensart, kognitiver Prozess (Reproduktion, naher Transfer, weiter
 * Transfer, Problemlösen), Zahl der Wissenseinheiten, Offenheit, Lebensweltbezug, sprachlogische
 * Komplexität, Repräsentationsformen. Die Anforderungsbereiche I–III (KMK/EPA) sind davon nur ein
 * Merkmal; AFB ist nicht gleich Schwierigkeit. Gestufte Hilfen (Leisen; Stäudel) senken die
 * Schwierigkeit, ohne die Aufgabe zu ändern. Lesbarkeit deutscher Texte: LIX (Björnsson),
 * Wiener Sachtextformel, Amstad-Flesch.
 *
 * FAUSTREGEL (nicht belegt): die Zahlen – Verschiebung der AFB-Anteile, LIX ± 6 als etwa eine
 * Klassenstufe (Wiener Sachtextformel), Satzlänge ± 20–25 %.
 *
 * Deshalb zwei getrennte Wahlen je Blatt (Entscheidung der Lehrkraft): der ANSPRUCH (Denkprozess,
 * Offenheit, Hilfen, Anforderungsbereiche) und die SPRACHE (Satzlänge, Lesbarkeit, Fachsprache).
 * „mittel" ist der Jahrgang, wie er im Profil steht – alles andere ist relativ dazu.
 */
import type { Stars } from './differentiation'
import { afbRegel, clampMix, hilfenRegel, spracheRegel, type LearnerProfile } from './profile'

export type Schwierigkeit = 'grundlegend' | 'mittel' | 'anspruchsvoll'

export interface Stufe {
  /** Denkprozess, Offenheit, Hilfen, Anforderungsbereiche */
  anspruch: Schwierigkeit
  /** Satzlänge, Lesbarkeit, Fachsprache, Darstellungsform */
  sprache: Schwierigkeit
}

export const SCHWIERIGKEITEN: Schwierigkeit[] = ['grundlegend', 'mittel', 'anspruchsvoll']

export const SCHWIERIGKEIT_LABEL: Record<Schwierigkeit, string> = { grundlegend: 'grundlegend', mittel: 'mittel', anspruchsvoll: 'anspruchsvoll' }

/** Was ein neues Blatt bekommt: die Stufen wie vor dieser Änderung */
export const STANDARD_STUFEN: Record<Stars, Stufe> = {
  1: { anspruch: 'grundlegend', sprache: 'grundlegend' },
  2: { anspruch: 'mittel', sprache: 'mittel' },
  3: { anspruch: 'anspruchsvoll', sprache: 'anspruchsvoll' }
}

export const MITTEL: Stufe = { anspruch: 'mittel', sprache: 'mittel' }

type Differenzierung = { levels: number; mode: string; schwierigkeit?: Stufe; stufen?: Partial<Record<Stars, Stufe>> }

/** Die Stufe einer Fassung: ohne Differenzierung die Wahl fürs ganze Blatt, sonst die Wahl je ★ */
export function stufeFuer(meta: { differentiation: Differenzierung }, level: Stars | null): Stufe {
  const d = meta.differentiation
  if (!level) return d.schwierigkeit ?? MITTEL
  return d.stufen?.[level] ?? STANDARD_STUFEN[level]
}

export const istMittel = (s: Stufe): boolean => s.anspruch === 'mittel' && s.sprache === 'mittel'

/** Kurzform für den Namen einer Fassung: „★ grundlegend" oder „★★ mittel / Sprache anspruchsvoll" */
export function fassungsLabel(level: Stars, s: Stufe): string {
  const stern = '★'.repeat(level)
  return s.anspruch === s.sprache
    ? `${stern} ${SCHWIERIGKEIT_LABEL[s.anspruch]}`
    : `${stern} ${SCHWIERIGKEIT_LABEL[s.anspruch]} / Sprache ${SCHWIERIGKEIT_LABEL[s.sprache]}`
}

export function stufeText(s: Stufe): string {
  if (istMittel(s)) return 'jahrgangsgemäß'
  return `Anspruch ${SCHWIERIGKEIT_LABEL[s.anspruch]}, Sprache ${SCHWIERIGKEIT_LABEL[s.sprache]}`
}

/**
 * Das Profil, das für diese Stufe gilt: Anforderungsbereiche, Sprachgrenzen und Hilfen werden
 * relativ zum Jahrgang verschoben – die Regeln für die KI und die Prüfungen nach der Erzeugung
 * lesen dieselben Werte. Bei „mittel" kommt das Profil unverändert zurück.
 */
export function profilFuerStufe(profile: LearnerProfile, stufe: Stufe): LearnerProfile {
  if (istMittel(stufe)) return profile
  const p = profile
  // Faustregel: grundlegend nimmt AFB III weitgehend heraus, anspruchsvoll verdoppelt ihn etwa
  const afbMix =
    stufe.anspruch === 'grundlegend'
      ? clampMix({ I: Math.min(70, p.afbMix.I + 25), II: 0, III: Math.max(0, p.afbMix.III - 15) })
      : stufe.anspruch === 'anspruchsvoll'
        ? clampMix({ I: Math.max(5, p.afbMix.I - 20), II: 0, III: Math.min(50, p.afbMix.III + 20) })
        : p.afbMix
  // Faustregel: LIX ± 6 entspricht etwa einer Klassenstufe der Wiener Sachtextformel
  const faktor = stufe.sprache === 'grundlegend' ? 0.8 : stufe.sprache === 'anspruchsvoll' ? 1.25 : 1
  const language =
    stufe.sprache === 'mittel'
      ? p.language
      : {
          avgSentenceWords: Math.max(5, Math.round(p.language.avgSentenceWords * faktor)),
          maxSentenceWords: Math.max(8, Math.round(p.language.maxSentenceWords * faktor)),
          lixMax: Math.max(20, Math.min(60, p.language.lixMax + (stufe.sprache === 'grundlegend' ? -6 : 6)))
        }
  const scaffolding = stufe.anspruch === 'grundlegend' ? 'hoch' : stufe.anspruch === 'anspruchsvoll' ? 'gering' : p.scaffolding
  const ersetze = new Map<string, string>([
    [afbRegel(p.afbMix), afbRegel(afbMix)],
    [spracheRegel(p.language), spracheRegel(language)],
    [hilfenRegel(p.scaffolding), hilfenRegel(scaffolding)]
  ])
  return { ...p, afbMix, language, scaffolding, promptRules: p.promptRules.map((r) => ersetze.get(r) ?? r) }
}

/**
 * Regeln für den Auftrag – die Merkmale nach Maier u. a. je Stufe. Die Zahlen (AFB, Satzlänge,
 * LIX) stehen bereits in den Profilregeln von `profilFuerStufe`; hier steht, WIE die Stufe
 * gemeint ist.
 */
export function stufenRegeln(stufe: Stufe, profile?: LearnerProfile): string[] {
  const out: string[] = []
  const maxSatz = profile ? profilFuerStufe(profile, stufe).language.maxSentenceWords : null
  if (stufe.anspruch === 'grundlegend') {
    out.push(
      'ANSPRUCH grundlegend: Denkprozess Reproduktion und naher Transfer (Bekanntes in bekannter Form anwenden); jede Aufgabe verknüpft höchstens zwei Wissenseinheiten; geschlossene oder halboffene Formate; jede Aufgabe ist in vorgegebene Teilschritte zerlegt; enger Bezug zur Lebenswelt, konkrete oder bildliche Darstellung.',
      'HILFEN sichtbar auf dem Blatt: ein gelöstes Beispiel vor der ersten Übungsaufgabe, Wortspeicher und Satzanfänge zu jeder Schreibaufgabe; dazu gestufte Hilfekarten (1. Aufgabe in eigenen Worten, 2. Denkanstoß, 3. Fachwissen, 4. Lösungsbeispiel).'
    )
  } else if (stufe.anspruch === 'anspruchsvoll') {
    out.push(
      'ANSPRUCH anspruchsvoll: Denkprozess weiter Transfer und Problemlösen (Bekanntes auf neue Fälle übertragen, Lösungswege selbst finden); Aufgaben verknüpfen mehrere Wissenseinheiten; offene Formate ohne vorgegebene Teilschritte; mehrere Lösungswege zulassen; Begründung und eigenes Urteil verlangen.',
      'HILFEN: keine Wortspeicher, Satzanfänge oder gelösten Beispiele auf dem Blatt; Hilfekarten nur, wenn die Lehrkraft sie eingeschaltet hat.',
      'ZUSATZ: Ergänze am Ende eine Knobel- oder Forscheraufgabe, die über das Lernziel hinausgeht (im Titel als „Zusatz" gekennzeichnet).'
    )
  } else {
    out.push('ANSPRUCH mittel (jahrgangsgemäß): naher Transfer mit Schwerpunkt Anforderungsbereich II, halboffene Formate, Hilfen nur als optionaler Tipp.')
  }
  if (stufe.sprache === 'grundlegend') {
    out.push(
      `SPRACHE grundlegend: ein Gedanke je Satz${maxSatz ? `, kein Satz länger als ${maxSatz} Wörter` : ''}; Hauptsätze, keine Schachtelsätze; jedes Fachwort wird beim ersten Vorkommen in einem kurzen Satz erklärt; konkrete Wörter statt Abstrakta, Verben statt Nominalisierungen; Inhalte zusätzlich bildlich oder als einfache Tabelle darstellen.`
    )
  } else if (stufe.sprache === 'anspruchsvoll') {
    out.push(
      'SPRACHE anspruchsvoll: Fachsprache wird im Text vorausgesetzt (Erklärungen nur im Glossar); auch längere Satzgefüge mit Nebensätzen; abstrakte und symbolische Darstellung (Tabelle, Diagramm, Formel) statt Bild; Texte im Anspruch eines Sachbuchs für die nächsthöhere Jahrgangsstufe.'
    )
  }
  return out
}
