/**
 * Leveln: einen Text auf ein anderes Niveau bringen (Großprogramm 0.4, F1).
 *
 * Differenzieren heißt im Alltag oft: denselben Sachtext in zwei, drei Fassungen – leichter für
 * die einen, anspruchsvoller für die anderen, in Einfacher oder Leichter Sprache für Lernende
 * mit Förderbedarf, mit Worterklärungen für Lernende mit Deutsch als Zweitsprache. Die App
 * erzeugt diese Fassungen als neue „Fassung" des Bausteins (model/versions.ts): Der bisherige
 * Text bleibt erhalten und ist mit den Pfeilen am Baustein zurückzuholen.
 *
 * Grundlagen der Regeln:
 * - Einfache Sprache: DIN 8581-1:2024 „Einfache Sprache – Anwendung für das Deutsche" (klare
 *   Struktur, kurze Sätze, geläufige Wörter, Fachwörter erklärt; Zielgruppe breiter als bei
 *   Leichter Sprache, kein Mediopunkt).
 * - Leichte Sprache: DIN SPEC 33429:2023 „Empfehlungen für Deutsche Leichte Sprache" und die
 *   Regeln des Netzwerks Leichte Sprache (ein Gedanke je Satz, ein Satz je Zeile, keine
 *   Nebensätze, keine Passivformen, Erklärungen direkt im Text, lange Wörter gegliedert).
 * - GER-Stufen: Kann-Beschreibungen des Gemeinsamen europäischen Referenzrahmens
 *   (Begleitband 2020) für das Leseverstehen.
 *
 * Originalquellen werden NICHT gelevelt: Ihr Wortlaut ist Prüfgegenstand und durch die
 * Quellenangabe verbürgt (siehe `messbar` in generation/lesbarkeit.ts).
 */
import { subjectById } from '../model/subjects'
import type { WorksheetMeta, WsBlock } from '../model/types'

export type LevelArt = 'leichter' | 'anspruchsvoller' | 'einfach' | 'leicht' | 'glossar' | `ger-${'A1' | 'A2' | 'B1' | 'B2' | 'C1'}`

export const GER_STUFEN = ['A1', 'A2', 'B1', 'B2', 'C1'] as const

/** Darf dieser Baustein gelevelt werden? Nein bei Originalquellen und bei leeren Bausteinen */
export function levelbar(block: WsBlock): { ok: boolean; grund?: string } {
  if (block.type !== 'text' && block.type !== 'infoBox') return { ok: false, grund: 'Nur Texte und Kästen lassen sich leveln.' }
  const text = block.type === 'text' ? block.body : block.body
  if (!String(text ?? '').trim()) return { ok: false, grund: 'Der Baustein ist leer.' }
  if (block.type === 'text' && (block.source?.trim() || block.sourceHeader)) {
    return { ok: false, grund: 'Originalquelle – der Wortlaut bleibt unverändert. Für eine leichtere Fassung einen eigenen Text neben die Quelle stellen.' }
  }
  return { ok: true }
}

/** Ist der Text in der Zielsprache eines Fremdsprachenfachs? */
export const inZielsprache = (block: WsBlock, meta: Pick<WorksheetMeta, 'subjectId'>): boolean =>
  Boolean(subjectById(meta.subjectId).foreignLanguage) && !(block.type === 'text' && block.language === 'de')

const GEMEINSAM = [
  'Der Inhalt bleibt erhalten: dieselben Aussagen, Fakten, Namen, Zahlen und dieselbe Reihenfolge; nichts hinzuerfinden.',
  'Formatierung (Fettdruck, Formeln, Absätze) und die Überschrift beibehalten; Materialverweise wie M{…} unverändert lassen.',
  'Nur den Baustein verändern, keine Anmerkungen an die Lehrkraft in den Text schreiben.'
]

/**
 * Der Überarbeitungsauftrag an die KI – er läuft über den gewohnten Weg „Mit KI überarbeiten"
 * und landet als neue Fassung am Baustein.
 */
export function levelAnweisung(art: LevelArt, meta: Pick<WorksheetMeta, 'subjectLabel' | 'grade' | 'schoolTypeName' | 'cefrLevel'>): string {
  const gruppe = `${meta.subjectLabel}, Klasse ${meta.grade}, ${meta.schoolTypeName}`
  const regeln = (titel: string, eigene: string[]): string => [`${titel} (${gruppe}).`, 'REGELN:', ...[...eigene, ...GEMEINSAM].map((r) => `- ${r}`)].join('\n')
  switch (art) {
    case 'leichter':
      return regeln('Formuliere den Text eine Stufe LEICHTER', [
        'Kürzere Sätze (ein Gedanke je Satz), Hauptsätze statt Schachtelsätze, Aktiv statt Passiv.',
        'Geläufige Wörter statt seltener; Fachwörter, die bleiben müssen, beim ersten Vorkommen kurz erklären.',
        'Verben statt Nominalisierungen; Länge etwa gleich (höchstens 20 % länger).'
      ])
    case 'anspruchsvoller':
      return regeln('Formuliere den Text eine Stufe ANSPRUCHSVOLLER', [
        'Fachsprache verwenden, Sätze zu Satzgefügen verbinden, Zusammenhänge (weil, obwohl, sodass) ausdrücklich machen.',
        'Keine Erklärungen von Fachwörtern im Text; Länge etwa gleich.'
      ])
    case 'einfach':
      return regeln('Schreibe den Text in EINFACHER SPRACHE nach DIN 8581-1', [
        'Kurze Sätze (im Schnitt höchstens etwa 12 Wörter), höchstens ein Nebensatz je Satz.',
        'Geläufige Wörter; Fremd- und Fachwörter nur, wenn nötig, und dann direkt erklären.',
        'Aktiv statt Passiv, Verben statt Nominalisierungen, keine Redewendungen und Ironie.',
        'Klarer Aufbau: das Wichtigste zuerst, je Absatz ein Thema; Zahlen als Ziffern.'
      ])
    case 'leicht':
      return regeln('Schreibe den Text in LEICHTER SPRACHE nach DIN SPEC 33429 und den Regeln des Netzwerks Leichte Sprache', [
        'Sehr kurze Sätze, ein Gedanke je Satz, jeder Satz in einer eigenen Zeile (Zeilenumbruch nach jedem Satz).',
        'Keine Nebensätze, kein Passiv, kein Genitiv, kein Konjunktiv, keine Verneinung, wo sie sich vermeiden lässt.',
        'Einfache, bekannte Wörter; immer dasselbe Wort für dieselbe Sache.',
        'Lange zusammengesetzte Wörter mit Bindestrich gliedern (Klima-Wandel), schwierige Wörter direkt danach erklären.',
        'Zahlen als Ziffern, keine Prozentangaben ohne Erklärung; Länge darf deutlich zunehmen.'
      ])
    case 'glossar':
      return regeln('Ergänze Worterklärungen für Lernende mit Deutsch als Zweitsprache', [
        'Den TEXT SELBST NICHT VERÄNDERN.',
        'Im Feld glossary 5–12 Wörter oder Wendungen erklären, die für Lernende mit geringen Deutschkenntnissen schwer sind (Fachwörter, zusammengesetzte Wörter, Redewendungen, trennbare Verben).',
        'Je Eintrag: das Wort wie im Text (Nomen mit Artikel und Plural, z. B. „der Vertrag, die Verträge"; Verben im Infinitiv) und eine Erklärung in einfachen Worten, höchstens 12 Wörter.',
        'Vorhandene Einträge behalten.'
      ])
    default: {
      const stufe = art.slice(4)
      return regeln(
        `Bringe den Text in der Zielsprache auf das Niveau ${stufe} des Gemeinsamen europäischen Referenzrahmens`,
        [
          `Wortschatz und Strukturen des Niveaus ${stufe} (Kann-Beschreibungen Leseverstehen, GER-Begleitband 2020); was darüber hinausgeht, umschreiben${stufe <= 'A2' ? ' oder im Feld glossary mit deutscher Bedeutung angeben' : ''}.`,
          `Satzlänge und Zeitformen dem Niveau ${stufe} anpassen; die Sprache des Textes bleibt die Zielsprache.`,
          meta.cefrLevel ? `Die Lerngruppe arbeitet sonst auf Niveau ${meta.cefrLevel}.` : ''
        ].filter(Boolean)
      )
    }
  }
}

/** Beschriftung im Menü */
export const LEVEL_TITEL: Record<string, string> = {
  leichter: 'Eine Stufe leichter',
  anspruchsvoller: 'Eine Stufe anspruchsvoller',
  einfach: 'In Einfacher Sprache',
  leicht: 'In Leichter Sprache',
  glossar: 'Worterklärungen für DaZ ergänzen'
}

export const levelTitel = (art: LevelArt): string => LEVEL_TITEL[art] ?? `Auf Niveau ${art.slice(4)} (GER)`
