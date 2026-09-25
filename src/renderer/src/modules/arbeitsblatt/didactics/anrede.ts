/**
 * Anrede der Lernenden für Arbeitsblatt, Grammatiktest, Klassenarbeit und Vokabeltest
 * (Paket 8b). Die Regel selbst und die festen Texte stehen in `shared/anrede.ts`.
 *
 * WELCHE STUFE GILT: dieselbe Quelle wie für alle übrigen Stufenregeln – `stageForGrade`.
 * Das Lerngruppen-Profil (`profile.stage`), die Oberstufenregeln der Klassenarbeit
 * (`upperSecondary`) und die Hörtext-Regeln lesen sie ebenfalls dort ab. Eine zweite,
 * eigene Grenze nur für die Anrede liefe früher oder später auseinander.
 *
 * Folge, bewusst so belassen: `stageForGrade` setzt die Oberstufe ab Klasse 11 an – auch in
 * G8-Ländern, in denen Klasse 10 am Gymnasium schon Einführungsphase ist. Dort wird in
 * Klasse 10 geduzt, genau wie dort auch die übrigen Regeln noch der Sekundarstufe I folgen.
 * Soll sich das ändern, dann in `stageForGrade` für alle Regeln zugleich.
 *
 * Die Lernzielkontrolle hat eine eigene, von der Lehrkraft wählbare Stufe und reicht sie über
 * `WorksheetMeta.anrede` durch (render/kurztestWorksheet.ts).
 */
import { anredeFuerStufe, anredeMeldung, falscheAnrede, type Anrede } from '../../../shared/anrede'
import { plainText } from '../../../shared/richtext/parse'
import type { Sheet, WorksheetMeta, WsBlock } from '../model/types'
import { subjectById } from '../model/subjects'
import type { DidacticWarning } from './checks'
import { stageForGrade } from './profile'

/** Jahrgang und Schulform → Anrede, über dieselbe Stufengrenze wie alle anderen Regeln. */
export const anredeFuer = (grade: number, schoolTypeId: string): Anrede => anredeFuerStufe(stageForGrade(grade, schoolTypeId))

/** Anrede eines Blattes; eine ausdrücklich gesetzte (LZK) geht vor. */
export const anredeFuerMeta = (meta: Pick<WorksheetMeta, 'grade' | 'schoolTypeId'> & { anrede?: Anrede }): Anrede =>
  meta.anrede ?? anredeFuer(meta.grade, meta.schoolTypeId)

/**
 * Stehen die Arbeitsanweisungen dieses Blattes auf Deutsch?
 *
 * Nur dann wird die Anrede geprüft. In den Fremdsprachen stehen sie in der Zielsprache,
 * außer die Lehrkraft hat deutsche Anweisungen gewählt; bilingual in der Arbeitssprache.
 */
export function anweisungenDeutsch(meta: Pick<WorksheetMeta, 'subjectId' | 'instructionsInGerman' | 'bilingual'>): boolean {
  if (meta.bilingual?.an && meta.bilingual.sprache) return false
  return !subjectById(meta.subjectId).foreignLanguage || Boolean(meta.instructionsInGerman)
}

/**
 * Die Texte eines Bausteins, die die Lernenden ANSPRECHEN.
 *
 * Material bleibt außen vor – Texte, Quellen, Tabellen, Hörtexte, Rollenkarten, Merkkästen:
 * Dort darf „du" oder „Sie" stehen (wörtliche Rede, Brief, Dialog). Die Satzanfänge eines
 * Hilfekastens gehören ebenfalls zum Text der Lernenden („Hast du schon …?") und bleiben
 * ungeprüft; geprüft werden Tipp- und Hilfekarten, weil sie sich an die Lernenden wenden.
 */
function ansprechendeTexte(block: WsBlock, nummer?: number): { ort: string; text: string }[] {
  const aufgabe = nummer ? `Aufgabe ${nummer}` : 'Aufgabe'
  switch (block.type) {
    case 'task':
      return [
        { ort: aufgabe, text: plainText(block.instruction) },
        ...block.parts.map((p, i) => ({ ort: `${aufgabe} ${String.fromCharCode(97 + i)})`, text: plainText(p.instruction) })),
        ...(block.brief?.situation ? [{ ort: `${aufgabe} (Situation)`, text: plainText(block.brief.situation) }] : [])
      ]
    case 'scaffold':
      return block.variant === 'tipp' || block.variant === 'hilfekarten' ? block.items.map((t) => ({ ort: block.title || 'Hilfe', text: plainText(t) })) : []
    case 'phrases':
      return [{ ort: 'Hilfsblatt', text: block.hint }]
    case 'learningGoals':
      return [{ ort: 'Lernziele', text: block.title }]
    default:
      return []
  }
}

/** Befunde eines einzelnen Bausteins – für neu erzeugte und überarbeitete Bausteine. */
export function anredeBefundeBaustein(block: WsBlock, meta: WorksheetMeta, nummer?: number): string[] {
  if (!anweisungenDeutsch(meta)) return []
  const soll = anredeFuerMeta(meta)
  const fach = { fremdsprache: subjectById(meta.subjectId).foreignLanguage }
  const out: string[] = []
  for (const { ort, text } of ansprechendeTexte(block, nummer)) {
    const fund = falscheAnrede(text, soll, fach)
    if (fund) out.push(anredeMeldung(ort, fund, soll))
  }
  return out
}

/** Prüfung für das ganze Blatt (sheetChecks-Stil): meldet, korrigiert nichts. */
export function checkAnrede(sheet: Sheet, meta: WorksheetMeta): DidacticWarning[] {
  if (!anweisungenDeutsch(meta)) return []
  let nummer = 0
  return sheet.blocks.flatMap((b) => {
    if (b.type === 'task') nummer++
    return anredeBefundeBaustein(b, meta, b.type === 'task' ? nummer : undefined).map((message) => ({ kind: 'anrede' as const, message }))
  })
}
