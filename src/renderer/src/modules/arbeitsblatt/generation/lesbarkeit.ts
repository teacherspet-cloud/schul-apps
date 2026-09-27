/**
 * Lesbarkeit nach der Erzeugung angleichen (27.09.2026).
 *
 * Die Stufe „Sprache" (didactics/schwierigkeit.ts) geht als Regel in den Auftrag – ob die KI
 * sie trifft, zeigt erst der Text. Deshalb misst die App jeden Lesetext nach der Erzeugung
 * (LIX und Satzlänge, `didactics/checks.ts`) und lässt ihn bei Abweichung von der KI
 * umschreiben – Entscheidung der Lehrkraft: automatisch, auch wenn das je Text eine Anfrage
 * kostet. Der Inhalt bleibt, nur die Sprache ändert sich; nach dem Umschreiben wird erneut
 * gemessen, und nur eine Fassung, die dem Ziel näher kommt, wird übernommen.
 *
 * Nicht angetastet: Originalquellen und alles mit Quellenangabe (der Wortlaut ist geschützt),
 * Texte unter 40 Wörtern (LIX ist dort ohne Aussage), zielsprachige Texte in Fremdsprachen
 * (LIX ist für deutsche Texte geeicht; dort gilt das GER-Niveau).
 */
import { obj, str } from '../../../shared/aiSchema'
import { runLimited } from '../../../shared/async'
import { plainText } from '../../../shared/richtext/parse'
import { readability } from '../didactics/checks'
import type { LearnerProfile } from '../didactics/profile'
import type { Stufe } from '../didactics/schwierigkeit'
import { subjectById } from '../model/subjects'
import type { Sheet, TextBlock, WorksheetMeta, WsBlock } from '../model/types'
import type { AiCall } from './generate'

const SCHEMA = obj({ body: str('Der umgeschriebene Text, Absätze durch Leerzeile getrennt, Formatierung wie im Original') })

export interface LesbarkeitsZiel {
  lixMax: number
  /** nur bei anspruchsvoller Sprache: darunter ist der Text zu leicht */
  lixMin: number | null
  avgSentenceWords: number
  maxSentenceWords: number
}

export function lesbarkeitsZiel(profile: LearnerProfile, stufe: Stufe): LesbarkeitsZiel {
  return {
    lixMax: profile.language.lixMax,
    // Faustregel: 12 Punkte unter der Obergrenze ist etwa zwei Klassenstufen zu leicht
    lixMin: stufe.sprache === 'anspruchsvoll' ? profile.language.lixMax - 12 : null,
    avgSentenceWords: profile.language.avgSentenceWords,
    maxSentenceWords: profile.language.maxSentenceWords
  }
}

export interface Lesbarkeitsbefund {
  lix: number
  avgSentenceWords: number
  richtung: 'leichter' | 'schwerer'
}

/** Weicht der Text vom Ziel ab? Dieselben Schwellen wie `checkText` – plus die Untergrenze bei anspruchsvoller Sprache. */
export function lesbarkeitsBefund(text: string, ziel: LesbarkeitsZiel): Lesbarkeitsbefund | null {
  const r = readability(text)
  if (r.words < 40) return null
  if (r.lix > ziel.lixMax + 3 || r.avgSentenceWords > ziel.avgSentenceWords * 1.3)
    return { lix: r.lix, avgSentenceWords: r.avgSentenceWords, richtung: 'leichter' }
  if (ziel.lixMin != null && r.lix < ziel.lixMin) return { lix: r.lix, avgSentenceWords: r.avgSentenceWords, richtung: 'schwerer' }
  return null
}

/** Abstand zum Zielbereich – kleiner ist besser; 0 heißt „im Ziel" */
function abstand(text: string, ziel: LesbarkeitsZiel): number {
  const r = readability(text)
  const lix = r.lix > ziel.lixMax ? r.lix - ziel.lixMax : ziel.lixMin != null && r.lix < ziel.lixMin ? ziel.lixMin - r.lix : 0
  const satz = r.avgSentenceWords > ziel.avgSentenceWords ? r.avgSentenceWords - ziel.avgSentenceWords : 0
  return lix + satz
}

/** Welche Texte gemessen werden: Lesetexte ohne Quellenangabe, deutsch, kein Ausgangstext einer Sprachmittlung in der Zielsprache */
export function messbar(block: WsBlock, meta: WorksheetMeta): block is TextBlock {
  if (block.type !== 'text') return false
  if (block.source.trim() || block.sourceHeader || block.ref === 'quelle') return false
  if (block.nurLoesung) return false
  const fremdsprache = subjectById(meta.subjectId).foreignLanguage
  if (fremdsprache && block.language !== 'de') return false
  return true
}

const rund = (n: number): string => String(Math.round(n))

/**
 * Misst alle Lesetexte des Blattes und lässt abweichende umschreiben. Jede Änderung steht als
 * Hinweis am Baustein; schlägt eine Anfrage fehl, bleibt der Text, und der Befund steht als
 * Hinweis da.
 */
export async function lesbarkeitAngleichen(
  meta: WorksheetMeta,
  sheet: Sheet,
  profile: LearnerProfile,
  stufe: Stufe,
  ai: AiCall,
  step: (message: string) => void = () => undefined
): Promise<Sheet> {
  const ziel = lesbarkeitsZiel(profile, stufe)
  const faellig = sheet.blocks
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => messbar(b, meta))
    .map(({ b, i }) => ({ block: b as TextBlock, i, befund: lesbarkeitsBefund(plainText((b as TextBlock).body), ziel) }))
    .filter((x): x is { block: TextBlock; i: number; befund: Lesbarkeitsbefund } => Boolean(x.befund))
  if (!faellig.length) return sheet
  step(`${faellig.length} Text(e) werden sprachlich angeglichen …`)
  const blocks = [...sheet.blocks]
  await runLimited(
    faellig.map(({ block, i, befund }) => async () => {
      const zielText = `LIX ${ziel.lixMin != null ? `zwischen ${rund(ziel.lixMin)} und ${rund(ziel.lixMax)}` : `höchstens ${rund(ziel.lixMax)}`}, Sätze im Schnitt etwa ${rund(ziel.avgSentenceWords)} Wörter, höchstens ${rund(ziel.maxSentenceWords)}`
      const ist = `LIX ${rund(befund.lix)}, Sätze im Schnitt ${rund(befund.avgSentenceWords)} Wörter`
      try {
        const data = await ai<{ body: string }>({
          system: [
            `Du passt die sprachliche Schwierigkeit eines Lesetextes für ein Arbeitsblatt an (${meta.subjectLabel}, Klasse ${meta.grade}, ${meta.schoolTypeName}).`,
            'REGELN:',
            '- Der Inhalt bleibt vollständig erhalten: dieselben Aussagen, Fakten, Namen, Zahlen und dieselbe Reihenfolge; nichts hinzuerfinden, nichts weglassen.',
            '- Länge etwa gleich (± 15 % der Wörter), Absätze und Formatierung (Fettdruck, Formeln) beibehalten.',
            befund.richtung === 'leichter'
              ? '- LEICHTER machen: kürzere Sätze (ein Gedanke je Satz), Hauptsätze statt Schachtelsätze, geläufige Wörter statt langer Fachwörter, Verben statt Nominalisierungen; Fachwörter, die bleiben müssen, kurz erklären.'
              : '- ANSPRUCHSVOLLER machen: Fachsprache verwenden, Sätze zu Satzgefügen verbinden, abstraktere Formulierungen; keine Erklärungen von Fachwörtern im Text.',
            '- Nur den Text zurückgeben, keine Überschrift, keine Anmerkung.'
          ].join('\n'),
          user: [`Ziel: ${zielText}.`, `Ist: ${ist} – der Text soll ${befund.richtung} werden.`, 'TEXT:', block.body].join('\n\n'),
          schemaName: 'text_lesbarkeit',
          schema: SCHEMA
        })
        const neu = String(data?.body ?? '').trim()
        const vorher = abstand(plainText(block.body), ziel)
        const nachher = neu ? abstand(plainText(neu), ziel) : Infinity
        if (neu && nachher < vorher) {
          const r = readability(plainText(neu))
          blocks[i] = {
            ...block,
            body: neu,
            warnings: [
              ...(block.warnings ?? []),
              `[Lesbarkeit] Text sprachlich ${befund.richtung} gemacht: LIX ${rund(befund.lix)} → ${rund(r.lix)} (Ziel ${zielText}).`
            ]
          }
        } else {
          blocks[i] = {
            ...block,
            warnings: [...(block.warnings ?? []), `[Lesbarkeit] Text nicht im Ziel (${ist}; Ziel ${zielText}) – die Umformulierung brachte keine Verbesserung.`]
          }
        }
      } catch {
        blocks[i] = {
          ...block,
          warnings: [...(block.warnings ?? []), `[Lesbarkeit] Text nicht im Ziel (${ist}; Ziel ${zielText}) – die Anpassung ist fehlgeschlagen.`]
        }
      }
    }),
    3
  )
  return { ...sheet, blocks }
}
