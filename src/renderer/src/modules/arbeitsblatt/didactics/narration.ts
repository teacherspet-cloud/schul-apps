/**
 * Geschichtserzählung – die erzählende Darstellung im Geschichtsunterricht.
 *
 * DREI DINGE AUSEINANDERHALTEN (EPA Geschichte 3.2.1):
 *   QUELLE       – stammt aus der Zeit. „Die Grundlagen unseres Wissens von der
 *                  Vergangenheit, nicht das Wissen selbst." Wird NIE erfunden.
 *   DARSTELLUNG  – heutiges, quellengestütztes Deutungsprodukt, „grundsätzlich narrativ".
 *   ERZÄHLUNG    – eine Darstellung in erzählender Form, mit Literarizitäts- und
 *                  Fiktionsanteil.
 * Ein Schulbuch- oder Sachtext ist eine DARSTELLUNG, keine Quelle. Genau daran scheitern
 * Lernende regelmäßig, und laut der Erhebung der Universität Gießen (2014) geben „viele
 * Lehrwerke … keine deutlichen Anhaltspunkte", das zu unterscheiden.
 *
 * ENTSCHEIDUNG DER LEHRKRAFT (23.09.2026): Die Ich-Erzählung aus der Innensicht ist erlaubt.
 *
 * Das ist die fachdidaktisch umstrittenste Form. Pandel lehnt sie ab (Gefahr einer
 * „universellen Zeitlosigkeit", in der „in jeder Zeit alles möglich gewesen zu sein
 * scheint"), Körber hält sie für nicht bewertbar, weil es kein Gütekriterium für
 * „gelungene" Perspektivübernahme gibt. Memminger und Rox-Helmer halten sie für tragfähig –
 * aber ausdrücklich nur MIT Auflagen: Memminger betont „die enorme Bedeutung einer
 * reflektierenden Auswertung und Überprüfung", die „Verfälschung und unhistorisches
 * Fantasieren eindämmen" soll.
 *
 * Deshalb sind hier genau diese Auflagen fest eingebaut und nicht wählbar:
 *   1. Der Fiktionsstatus steht IM TEXT, nicht im Kleingedruckten.
 *   2. Zu jeder Erzählung gehört mindestens eine Dekonstruktionsaufgabe.
 *   3. Keine wörtlichen Quellenzitate.
 * Ohne sie wäre die Erzählung das, was Körber an KI-Material kritisiert: Material, das
 * „passend zum gewünschten Ergebnis" konstruiert ist, statt Grundlage einer Aussage zu sein.
 *
 * ZITATE: Entscheidung der Lehrkraft – nur paraphrasieren, nie wörtlich zitieren. Grund ist
 * ein gemessener Befund, kein Verdacht: Körber (2025) prüfte einen von ChatGPT geplanten
 * Geschichtsunterricht; KEINE der zitierten Quellen war verifizierbar, die angeblichen
 * Passagen aus Chadwick (1842) und Engels (1845) stehen dort nicht.
 */
import type { Sheet, TextBlock, WorksheetMeta } from '../model/types'
import type { DidacticWarning } from './checks'

export type NarrationPerspective = 'ich' | 'er'

export interface Narration {
  /** Aus welcher Sicht erzählt wird */
  perspective: NarrationPerspective
  /** true = die erzählende Figur ist erfunden (aus Quellen erschlossen, aber nicht belegt) */
  fictional: boolean
}

/** Fächer, in denen Erzählungen als eigene Textsorte gelten. */
export const NARRATION_SUBJECTS = ['geschichte', 'politik']

export const wantsNarration = (meta: Pick<WorksheetMeta, 'subjectId'>): boolean => NARRATION_SUBJECTS.includes(meta.subjectId)

/**
 * Der Hinweis, der ÜBER der Erzählung steht.
 *
 * Er ist keine Fußnote und kein Kleingedrucktes: Eine Ich-Erzählung suggeriert
 * Authentizität, und wer sie für eine Quelle hält, lernt beim Analysieren das Falsche. Die
 * Wikipedia-Gütekriterien nennen „historische Korrektheit bei Orten, Zeiten, Figuren und
 * Handlungen" – eine erfundene Figur ist damit vereinbar, aber nur, wenn sie als erfunden
 * kenntlich ist.
 */
export function narrationNote(n: Narration | undefined): string {
  if (!n) return ''
  const basis = 'Erzählung – eine heutige Darstellung, keine Quelle aus der Zeit.'
  if (!n.fictional) return basis
  return `${basis} Die erzählende Person ist erfunden; ihr Alltag ist aus Quellen erschlossen.`
}

/** Erkennt wörtliche Zitate im Erzähltext (deutsche und gerade Anführungszeichen). */
export function hasVerbatimQuote(body: string): boolean {
  // Mindestens drei Wörter in Anführungszeichen – einzelne Begriffe sind keine Zitate
  return /[„"»][^""«»\n]{15,}[""«]/.test(body)
}

/** Fragt eine Aufgabe nach Perspektive, Auswahl oder Absicht des Verfassers? */
export function isDeconstruction(instruction: string): boolean {
  return /perspektiv|sichtweise|absicht|auswahl|verfasser|standpunkt|weggelassen|wer erzählt|deut(ung|et)/i.test(instruction)
}

/**
 * Prüft die Erzählungen auf einem Blatt.
 *
 * Die drei Auflagen aus dem Kopfkommentar – sie sind der Preis dafür, dass die Ich-Form
 * überhaupt erlaubt ist.
 */
export function checkNarration(sheet: Sheet, meta: WorksheetMeta): DidacticWarning[] {
  if (!wantsNarration(meta)) return []
  const erzaehlungen = sheet.blocks.filter((b): b is TextBlock => b.type === 'text' && Boolean(b.narration))
  if (!erzaehlungen.length) return []
  const out: DidacticWarning[] = []

  for (const b of erzaehlungen) {
    if (hasVerbatimQuote(b.body)) {
      out.push({
        kind: 'instruction',
        message: `${b.title || 'Die Erzählung'} enthält ein wörtliches Zitat. In einer Erzählung wird nur paraphrasiert – erfundene Zitate sind der dokumentierte Hauptfehler von KI im Geschichtsunterricht (Körber 2025).`
      })
    }
  }

  const hatDekonstruktion = sheet.blocks.some(
    (b) => b.type === 'task' && (isDeconstruction(b.instruction) || b.parts.some((p) => isDeconstruction(p.instruction)))
  )
  if (!hatDekonstruktion) {
    out.push({
      kind: 'taskMix',
      message:
        'Zur Erzählung fehlt eine Aufgabe zur Dekonstruktion (Perspektive, Auswahl, Absicht des Verfassers). Ohne sie wirkt der Text wie „die eine Geschichte" – das FUER-Modell führt Dekonstruktion als eigene Teilkompetenz.'
    })
  }
  return out
}

/**
 * Regelteil für den KI-Auftrag: die Gütekriterien einer Geschichtserzählung.
 *
 * Zusammengestellt aus Rüsens Triftigkeitsbegriff (Historik 1, 1983, S. 82–84: empirisch,
 * normativ, narrativ), der EPA Geschichte, dem NRW-Kernlehrplanentwurf 2025 („Vermeidung
 * unhistorischer Linearitätsnarrative", „Kontingenzen") und Bergmanns Multiperspektivität.
 *
 * Hinweis zur Belegqualität: Rüsen und Pandel lagen der Recherche nur in Sekundärdarstellung
 * vor. Die Formulierungen sind damit belegt, die Seitenangaben aus zweiter Hand.
 */
export function narrationRules(meta: Pick<WorksheetMeta, 'subjectId'>): string {
  if (!wantsNarration(meta)) return ''
  return [
    'GESCHICHTSERZÄHLUNG (erzählende Darstellung):',
    '- Eine Erzählung ist eine DARSTELLUNG, keine Quelle. Sie wird als solche gekennzeichnet; sie gibt nicht vor, aus der Zeit zu stammen.',
    '- Erfinde KEINE Quellen und zitiere NICHT wörtlich – weder aus Urkunden noch aus Forschungsliteratur. Erwähne Quellen sinngemäß.',
    '- Eine erfundene erzählende Figur ist erlaubt. Dann steht im Text selbst, dass sie erfunden und ihr Alltag aus Quellen erschlossen ist.',
    '- Orte, Zeiten, belegte Personen und Handlungen müssen historisch korrekt sein (empirische Triftigkeit).',
    '- Deutungen werden als Deutungen formuliert („nach heutiger Forschungslage", „wahrscheinlich"), nicht als Tatsachen (narrative Triftigkeit).',
    '- Keine Teleologie: Erzähle nicht auf ein Ergebnis hin. Zeige Handlungsspielräume und nicht verwirklichte Alternativen.',
    '- Keine Anachronismen: keine modernen Begriffe, Motive oder Denkweisen für vergangene Menschen.',
    '- Mehrere Sichtweisen kommen im selben Text vor, und mindestens eine fachwissenschaftliche Kontroverse wird benannt.',
    '- Kein Text, der auf eine erwünschte Meinung hinschreibt: Was in der Wissenschaft strittig ist, bleibt im Text strittig.',
    '- Zur Erzählung gehört mindestens eine Aufgabe, die nach Perspektive, Auswahl und Absicht des Verfassers fragt.'
  ].join('\n')
}
