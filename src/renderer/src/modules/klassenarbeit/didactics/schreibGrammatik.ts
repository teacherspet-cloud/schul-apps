/**
 * Grammatik in Schreibaufgaben der Fremdsprachen (29.09.2026, Wunsch der Lehrkraft: „auswählen,
 * welche Grammatik ggfs. explizit in den Schreibaufgaben mit abgeprüft werden soll").
 *
 * Grundlage: recherche/grammatik-in-schreibaufgaben-2026-09-29.md. Kernbefunde:
 * - Kein Land regelt ausdrücklich, ob eine Schreibaufgabe Grammatik vorschreiben darf; überall
 *   gilt die dienende Funktion sprachlicher Mittel (KMK).
 * - Niedersachsen am strengsten: sprachliche Mittel nur integrativ, keine Bepunktung einzelner
 *   sprachlicher Aspekte (KC Spanisch Sek I 2024 S. 61; sinngemäß KC Englisch 2026 S. 62,
 *   KC Französisch 2025 S. 40) → nur als Erinnerung, ohne eigene Punkte.
 * - NRW: „Schreiben und Verfügen über sprachliche Mittel (integriert)" ausdrücklich vorgesehen;
 *   BB/SH: Raster darf an die Aufgabe angepasst werden.
 * - Nachrecherche MV, RP, SL, SN, ST, TH: überall „nicht isoliert, sondern im Kontext"; SL Gymnasium
 *   Englisch Kl. 8–10 Bandbreite, Inhalt : Sprache 25 : 75 bis 40 : 60 (ab Kl. 9 Voreinstellung Bandbreite); ST zentrale Klassenarbeit Kl. 6 Inhalt : Sprache = 5 : 5;
 *   TH 2026 nennt Kriterien je grammatischem Phänomen.
 * - Abschlussprüfungen und Oberstufe: keine Vorgabe, bewertet wird die Bandbreite.
 * - Feste Anzahl passt in Lernjahr 1–4, danach „use a variety of …".
 * - Abzug bei fehlender Struktur ist nirgends vorgesehen; bewertet wird nur im eigenen Kriterium.
 * Die Formulierungen in der Zielsprache sind fachübliche Muster, kein amtlicher Wortlaut.
 */
import { GRAMMAR_TOPICS, type GrammarTopic } from '../../arbeitsblatt/didactics/grammarTopics'
import { lernjahrFuer } from '../../arbeitsblatt/didactics/vorwissen/vorwissen'
import type { Exam, ExamPart } from '../model/types'

/** Wie die Grammatik in der Aufgabe erscheint */
export type GrammatikModus = 'anzahl' | 'erinnerung' | 'bandbreite' | 'inhaltspunkte'

export interface SchreibGrammatik {
  /** Kennungen aus grammarTopics.ts */
  themen: string[]
  /** Freie Angabe (Italienisch, Russisch oder was in der Liste fehlt) */
  frei?: string
  modus: GrammatikModus
  /** Mindestanzahl bei „anzahl" */
  anzahl?: number
  /** Die geforderten Formen unterstreichen lassen */
  unterstreichen?: boolean
  /** Eigenes Kriterium mit Punkten oder integriert in „Sprache" */
  bewertung: 'kriterium' | 'integriert'
}

export const MODI: { value: GrammatikModus; label: string; beschreibung: string }[] = [
  { value: 'anzahl', label: 'Mit Anzahl', beschreibung: '„Use the simple past at least three times." – Lernjahr 1–4' },
  { value: 'erinnerung', label: 'Als Erinnerung', beschreibung: '„Remember: you are writing about the past." – ohne Anzahl (Niedersachsen)' },
  { value: 'inhaltspunkte', label: 'Über Inhaltspunkte', beschreibung: '„Tell … what you did / what you would do if …" – die Struktur ergibt sich aus dem Inhalt' },
  { value: 'bandbreite', label: 'Bandbreite', beschreibung: '„Use a variety of tenses and structures." – ab Lernjahr 5, Abschluss, Oberstufe' }
]

const SPRACHE: Record<string, 'en' | 'fr' | 'es' | 'it' | 'ru'> = { englisch: 'en', franzoesisch: 'fr', spanisch: 'es', italienisch: 'it', russisch: 'ru' }

type Meta = Exam['meta']

export const lernjahr = (m: Meta): number =>
  lernjahrFuer({ subjectId: m.subjectId, topic: m.topic, grade: m.grade, stateId: m.stateId, schoolTypeId: m.schoolTypeId, languageOrder: m.languageOrder })

/** Ausgeschlossene Bereiche: reine Formenbereiche und Wortbildung (Bericht 4) */
const UNGEEIGNET = /Nomen\/Begleiter|Wortbildung|Morphologie|Orthografie/

/** Auswählbare Strukturen: Fach passt, nicht nur rezeptiv, kein reiner Formenbereich; eingeführt bis zum Lernjahr (+1 als „bald") */
export function strukturenFuer(m: Meta): { topic: GrammarTopic; eingefuehrt: boolean }[] {
  const lj = lernjahr(m)
  return GRAMMAR_TOPICS.filter((t) => t.subject === m.subjectId && t.scale === 'lernjahr' && !t.receptive && !UNGEEIGNET.test(t.area) && t.from <= lj + 1).map((t) => ({
    topic: t,
    eingefuehrt: t.from <= lj
  }))
}

/** Voreinstellung nach Land und Lernjahr (Bericht 5.5) */
export function vorschlag(m: Meta): SchreibGrammatik {
  const lj = lernjahr(m)
  if (m.stateId === 'NI') return { themen: [], modus: 'erinnerung', bewertung: 'integriert' }
  if (m.grade >= 11 || lj >= 5) return { themen: [], modus: 'bandbreite', bewertung: 'integriert' }
  // Saarland, Gymnasium Kl. 9/10 Englisch (1. und 2. FS): Raster im Lehrplan 2025 – „Bandbreite ist … der ausschlaggebende Faktor"
  if (m.stateId === 'SL' && m.schoolTypeId === 'gymnasium' && m.subjectId === 'englisch' && m.grade >= 9) return { themen: [], modus: 'bandbreite', bewertung: 'integriert' }
  return { themen: [], modus: lj <= 4 ? 'anzahl' : 'bandbreite', anzahl: lj <= 2 ? 3 : 2, bewertung: 'kriterium' }
}

/** Landesregeln aus der Nachrecherche 29.09.2026 (Bericht, Abschnitt „Nachrecherche 29.09.") */
const LANDESHINWEIS: Record<string, string> = {
  MV: 'Mecklenburg-Vorpommern: Klassenarbeiten prüfen in der Regel mindestens zwei Teilkompetenzen in komplexen Aufgaben. Als sprachliche Kriterien nennt der Rahmenplan u. a. „Repertoire grammatischer und syntaktischer Strukturen" und „Einhaltung der sprachlichen Norm"; Kriterien und Gewichtung legt die Fachkonferenz fest (Rahmenpläne Englisch/Französisch 2025/2026, Kap. 3.3).',
  RP: 'Rheinland-Pfalz: Sprachliche Mittel sollen nicht isoliert, sondern verknüpft mit einer Kompetenz und in einen situativen Kontext eingebettet überprüft werden – eine Vorgabe in der Schreibaufgabe entspricht dem. Der Mut zur anspruchsvollen Sprachgestaltung ist angemessen zu berücksichtigen (Lehrplan Französisch Sek I 2022; sinngemäß Spanisch 2012).',
  SL: 'Saarland: Sprachliche Mittel werden nicht isoliert, sondern anwendungsbezogen in einem sprachlich-situativen Kontext überprüft; sie haben dienende Funktion (Lehrpläne Englisch 2023 und Französisch 2024, jahrgangsübergreifender Teil).',
  SN: 'Sachsen: Kommunikationsfähigkeit ist das oberste Kriterium; Zeitformen werden thematisch eingebettet, nicht isoliert behandelt. Die Bewertungsmatrix Schreiben (Sek I) enthält die Kriterien „Strukturen" (Satzbau variabel und komplex) und „Sprachliche Korrektheit" – dort lässt sich die geforderte Struktur einordnen.',
  ST: 'Sachsen-Anhalt: Die zentrale Klassenarbeit Englisch Kl. 6 schreibt in der Schreibaufgabe keine Grammatik vor, bewertet Inhalt und Sprache je zur Hälfte (Content 5 BE, Language 5 BE) und prüft Grammatik in einem eigenen Teil „Language in Use". Das LISA empfiehlt, die für eine Schreibaufgabe nötigen Strukturen vorab bewusst zu machen (z. B. simple past bei einem Ferienbericht).',
  TH: 'Thüringen: Nach den Lehrplänen 2026 (Erprobungsfassungen) werden Grammatikkenntnisse grundsätzlich nicht isoliert, sondern im Kontext bewertet – nach Korrektheit der Bildung und funktionaler, kontextangemessener Anwendung des grammatischen Phänomens. Ein eigenes Kriterium für die geforderte Struktur passt dazu; kommunikativer Erfolg hat Vorrang vor sprachlicher Korrektheit.'
}

/** Hinweise je Land und Einstellung (Bericht 5.4), unpersönlich */
export function hinweise(m: Meta, g: SchreibGrammatik): { text: string; warnung?: boolean }[] {
  const lj = lernjahr(m)
  const out: { text: string; warnung?: boolean }[] = []
  const themen = g.themen.map((id) => GRAMMAR_TOPICS.find((t) => t.id === id)).filter((t): t is GrammarTopic => Boolean(t))
  if (m.stateId === 'NI' && g.bewertung === 'kriterium')
    out.push({
      warnung: true,
      text: 'In Niedersachsen werden sprachliche Mittel integrativ bewertet; eine Bepunktung einzelner sprachlicher Aspekte ist laut Kerncurriculum ausgeschlossen (KC Spanisch Sek I 2024, S. 61; sinngemäß KC Englisch 2026, S. 62, KC Französisch 2025, S. 40). Empfohlen: als Erinnerung formulieren und im Kriterium „Sprache" mitbewerten.'
    })
  if (m.stateId === 'NI' && g.modus === 'anzahl' && g.unterstreichen)
    out.push({ warnung: true, text: 'Aufgaben, die vorrangig auf ein grammatikalisches Phänomen reduziert sind, erfüllen die Vorgaben des Kerncurriculums nicht; die Schreibaufgabe sollte Gestaltungsspielraum lassen.' })
  if (m.stateId === 'NW') out.push({ text: 'NRW: Die Kombination „Schreiben und Verfügen über sprachliche Mittel (integriert)" ist in den Empfehlungen der Fachaufsicht vorgesehen; das Raster wird an die Aufgabe angepasst.' })
  if (m.stateId === 'HE') out.push({ text: 'Hessen: Sprachliche Mittel sind an kommunikative Situationen anzubinden – die Vorgabe sollte sich aus dem Schreibanlass ergeben.' })
  const land = LANDESHINWEIS[m.stateId]
  if (land) out.push({ text: land })
  if (m.stateId === 'SL' && m.schoolTypeId === 'gymnasium' && m.subjectId === 'englisch' && m.grade >= 8 && m.grade <= 10)
    out.push({
      text: `Saarland, Gymnasium Kl. ${m.grade}: Das Bewertungsraster Schreiben im Lehrplan Englisch (2025) bewertet Grammatik vor allem nach der Bandbreite – eine unzureichende Bandbreite lässt sich nicht durch Korrektheit ausgleichen. Empfohlene Gewichtung Inhalt : Sprache ${m.grade === 8 ? '25 : 75 bei gelenkten bis 40 : 60 bei freieren Aufgaben' : '40 : 60'}.`
    })
  if (m.stateId === 'ST' && g.modus === 'anzahl')
    out.push({ text: 'Sachsen-Anhalt: Näher an den LISA-Hinweisen liegt es, die benötigte Struktur vorab bewusst zu machen („Als Erinnerung" oder „Über Inhaltspunkte"), statt eine Anzahl zu verlangen.' })
  if (m.grade >= 11 && g.modus !== 'bandbreite')
    out.push({ warnung: true, text: 'In der Oberstufe ist die Vorgabe bestimmter Grammatik unüblich; bewertet wird die Bandbreite (vgl. Fachbrief Englisch BB Nr. 9, 2025).' })
  else if (lj >= 5 && g.modus === 'anzahl')
    out.push({ text: 'Zentrale Abschlussprüfungen (z. B. ZP10 NRW, Realschulabschluss Bayern) schreiben keine Grammatik vor, sondern bewerten die Bandbreite – empfohlen: „Use a variety of …" statt fester Anzahl.' })
  for (const t of themen) if (t.from > lj) out.push({ warnung: true, text: `„${t.label}" wird laut Lehrplan- und Lehrwerksauswertung erst ab Lernjahr ${t.from} eingeführt.` })
  if (g.modus === 'anzahl' && themen.length > 2) out.push({ text: 'Mehr als zwei geforderte Formen können den Text unnatürlich machen; eine Strukturgruppe („different past tenses") ist oft sinnvoller.' })
  if (g.unterstreichen) out.push({ text: 'Das Unterstreichen erleichtert die Korrektur, kostet aber Schreibzeit.' })
  return out
}

/** Muster für die Aufgabenstellung in der Zielsprache (Bericht 5.2) – die KI formuliert danach */
const MUSTER: Record<'en' | 'fr' | 'es' | 'it' | 'ru', Record<GrammatikModus, string>> = {
  en: {
    anzahl: 'Use the {form} at least {n} times.',
    erinnerung: 'Remember: think about the tenses you need (e.g. the {form}).',
    inhaltspunkte: 'Formuliere Inhaltspunkte, die die Struktur hervorrufen (z. B. „Tell … what you did / what you would do if …").',
    bandbreite: 'Use a variety of tenses and structures. Use linking words to connect your ideas.'
  },
  fr: {
    anzahl: 'Utilise le {form} au moins {n} fois.',
    erinnerung: 'Attention : pense aux temps dont tu as besoin (p. ex. le {form}).',
    inhaltspunkte: 'Formuliere Inhaltspunkte, die die Struktur hervorrufen (z. B. « Raconte ce que tu as fait … »).',
    bandbreite: 'Utilise des temps variés et des connecteurs (d’abord, ensuite, parce que, mais …).'
  },
  es: {
    anzahl: 'Usa el {form} al menos {n} veces.',
    erinnerung: 'Recuerda: piensa en los tiempos verbales que necesitas (p. ej. el {form}).',
    inhaltspunkte: 'Formuliere Inhaltspunkte, die die Struktur hervorrufen (z. B. «Cuenta qué hiciste …»).',
    bandbreite: 'Usa diferentes tiempos verbales y conectores (primero, después, además, sin embargo …).'
  },
  it: {
    anzahl: 'Usa almeno {n} volte questa struttura: {form}.',
    erinnerung: 'Ricorda: pensa ai tempi verbali che ti servono.',
    inhaltspunkte: 'Formuliere Inhaltspunkte, die die Struktur hervorrufen.',
    bandbreite: 'Usa tempi verbali diversi e connettivi (prima, poi, perché, però …).'
  },
  ru: {
    anzahl: 'Используй в тексте не менее {n} раз следующую конструкцию: {form}.',
    erinnerung: 'Обрати внимание на нужные времена глаголов.',
    inhaltspunkte: 'Formuliere Inhaltspunkte, die die Struktur hervorrufen.',
    bandbreite: 'Используй разные времена глаголов и средства логической связи (сначала, потом, потому что, однако …).'
  }
}

/** Die Regeln für den KI-Auftrag des Schreibteils */
export function schreibGrammatikRegeln(exam: Exam, part: ExamPart): string {
  const g = part.grammatik
  if (!g || (!g.themen.length && !g.frei?.trim() && g.modus !== 'bandbreite')) return ''
  const sprache = SPRACHE[exam.meta.subjectId]
  if (!sprache) return ''
  const themen = g.themen.map((id) => GRAMMAR_TOPICS.find((t) => t.id === id)).filter((t): t is GrammarTopic => Boolean(t))
  const formen = [...themen.map((t) => t.term || t.label), ...(g.frei?.trim() ? [g.frei.trim()] : [])]
  const muster = MUSTER[sprache][g.modus].replace('{form}', formen.join(' / ') || '…').replace('{n}', String(g.anzahl ?? 2))
  return [
    'GRAMMATIK IN DER SCHREIBAUFGABE (Vorgabe der Lehrkraft, verbindlich):',
    formen.length ? `- Geforderte Strukturen: ${formen.join(', ')}.` : '',
    g.modus === 'inhaltspunkte'
      ? `- ${muster} Die Strukturen werden NICHT ausdrücklich genannt.`
      : `- Ergänze die Aufgabenstellung um einen kurzen Zusatz in der Zielsprache nach diesem Muster: „${muster}"${g.modus === 'anzahl' && formen.length > 1 ? ' (für jede Struktur bzw. als Gruppe)' : ''}.`,
    g.unterstreichen && g.modus === 'anzahl' ? '- Zusätzlich verlangen: die geforderten Formen unterstreichen („Underline …" in der Zielsprache).' : '',
    '- Die Strukturen müssen sich natürlich aus der Schreibsituation ergeben (dienende Funktion); die Aufgabe darf nicht auf das Grammatikphänomen reduziert werden.',
    g.bewertung === 'kriterium'
      ? `- Bewertungsraster: ein eigenes Kriterium „Verwendung der geforderten Strukturen" (Sprache, höchstens etwa 20–25 % der Punkte des Schreibteils): volle Punktzahl bei geforderter Anzahl und weitgehend korrekten Formen, etwa die Hälfte bei erkennbarem Versuch, keine Punkte, wenn nicht erkennbar. Fehlende Strukturen wirken sich nur in diesem Kriterium aus.`
      : '- Bewertung: integriert im Kriterium „Sprache" (Bandbreite und Korrektheit der geübten Strukturen) – KEIN eigenes Kriterium, keine eigenen Punkte.'
  ]
    .filter(Boolean)
    .join('\n')
}
