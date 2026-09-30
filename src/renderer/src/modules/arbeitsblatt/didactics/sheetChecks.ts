/**
 * Prüfungen für das ganze Arbeitsblatt (ohne KI): Operatoren des Fachs, Anforderungsbereiche,
 * Ergebnissicherung, Aufgabenmischung und die Länge der Arbeitsanweisungen.
 * Grundlage: KMK-Prüfungsanforderungen (Schwerpunkt AFB II, AFB I stärker als III),
 * Operatorenlisten der Länder und fachdidaktische Kriterien für Arbeitsblätter.
 */
import { plainText } from '../../../shared/richtext/parse'
import type { Afb, Sheet, TaskBlock, WorksheetMeta, WsBlock } from '../model/types'
import type { DidacticWarning } from './checks'
import { seitenBereich, seitenText } from './seiten'
import type { LearnerProfile } from './profile'
import { checkLanguageSkills } from './languageChecks'
import { checkSubjectOperator } from './subjectOperators'
import { comprehensionFormatById } from './comprehensionFormats'
import { checkClosedFormatsHistory, checkItemWording, checkTrueFalseEvidence } from './itemWording'
import { checkSourceHeaders } from './sourceHeader'
import { checkNarration } from './narration'
import { bilingualAktiv, checkBilingual } from './bilingual'
import { checkAnrede } from './anrede'

const tasks = (sheet: Sheet): TaskBlock[] => sheet.blocks.filter((b): b is TaskBlock => b.type === 'task')

/** Operatoren, mit denen üblicherweise gesichert wird */
const SECURE_OPERATORS =
  /(zusammenfass|fasse[^.]*zusammen|halte[^.]*fest|festhalt|notier|trage ein|ergänze die tabelle|erstell|fülle|formulier|schreibe auf|sichere|merksatz)/i

/** Dasselbe für bilinguale Blätter: Dort stehen die Aufgaben in der Arbeitssprache */
const SECURE_OPERATORS_BILINGUAL =
  /(summari[sz]e|sum up|outline|write down|note down|take notes|complete the (table|chart|grid)|fill in|résume|note[zr]|complète|rédige|resume|completa|riassumi|annota)/i

/** Aufgabenformate grob nach Antwortform */
function taskFormat(b: TaskBlock): 'geschlossen' | 'halboffen' | 'offen' {
  const kinds = [b.answer.kind, ...b.parts.map((p) => p.answer.kind)]
  if (kinds.some((k) => k === 'lines' || k === 'space' || k === 'none')) return 'offen'
  if (kinds.some((k) => k === 'gapText' || k === 'matching' || k === 'tableFill' || k === 'labels' || k === 'ordering')) return 'halboffen'
  return 'geschlossen'
}

export function checkSubjectOperators(sheet: Sheet, meta: WorksheetMeta, foreignLanguage?: string): DidacticWarning[] {
  const out: DidacticWarning[] = []
  // Geprüft wird gegen die Liste des Landes für genau diese Stufe, sonst gegen die fachübliche (30.09.2026)
  const kontext = meta.stateId ? { stateId: meta.stateId, stufe: meta.grade >= 11 ? ('sek2' as const) : ('sek1' as const), schulform: meta.schoolTypeId } : undefined
  tasks(sheet).forEach((t, i) => {
    const res = checkSubjectOperator(plainText(t.instruction), meta.subjectId, foreignLanguage, kontext)
    if (!res || !res.operator) return
    if (!res.known) {
      const vorschlag = res.vorschlag ? ` Nächstliegender Operator der Liste: „${res.vorschlag}“.` : ''
      out.push({
        kind: 'operator',
        message: res.landesliste
          ? `Aufgabe ${i + 1}: „${res.operator}“ ist kein Operator der Landesliste (${res.landesliste}).${vorschlag}`
          : `Aufgabe ${i + 1}: „${res.operator}“ steht nicht in der Operatorenliste für ${meta.subjectLabel}.${vorschlag}`
      })
      return
    }
    // Nur prüfen, wo das Fach den Anforderungsbereich am Operator festmacht
    if (res.afb && t.afb && res.afb !== t.afb) {
      out.push({
        kind: 'operator',
        message: `Aufgabe ${i + 1}: „${res.listed ?? res.operator}“ gilt in ${meta.subjectLabel} als Anforderungsbereich ${res.afb}, angegeben ist ${t.afb}.`
      })
    }
  })
  return out
}

/** KMK-Regel: alle drei Bereiche vertreten, Schwerpunkt in AFB II, AFB I stärker als AFB III. */
export function checkAfbBalance(sheet: Sheet): DidacticWarning[] {
  const list = tasks(sheet)
  if (list.length < 3) return []
  const count = (a: Afb): number => list.filter((t) => t.afb === a).length
  const [one, two, three] = [count('I'), count('II'), count('III')]
  const out: DidacticWarning[] = []
  if (two < one || two < three)
    out.push({ kind: 'afbMix', message: `Schwerpunkt sollte im Anforderungsbereich II liegen (jetzt I: ${one}, II: ${two}, III: ${three}).` })
  if (three > one)
    out.push({ kind: 'afbMix', message: `Anforderungsbereich III (${three}) ist stärker vertreten als Bereich I (${one}) – laut KMK umgekehrt.` })
  if (list.length >= 4 && (one === 0 || two === 0 || three === 0))
    out.push({ kind: 'afbMix', message: 'Es fehlen Aufgaben in mindestens einem Anforderungsbereich.' })
  return out
}

/** Ergebnissicherung: ein Merkkasten, eine Tabelle zum Ausfüllen oder eine Sicherungsaufgabe am Ende. */
export function checkClosure(sheet: Sheet): DidacticWarning[] {
  const blocks: WsBlock[] = sheet.blocks
  const hasBox = blocks.some((b) => b.type === 'infoBox' && ['merke', 'regel', 'definition'].includes(b.variant))
  const hasSelfCheck = blocks.some((b) => b.type === 'selfCheck')
  const last = tasks(sheet).slice(-2)
  // Bei einer Sprachmittlungs- oder Schreibaufgabe ist der eigene Text das Ergebnis
  const hasProduct = tasks(sheet).some((t) => t.skill === 'mediation' || t.skill === 'writing')
  const hasSecuring =
    hasProduct ||
    last.some(
      (t) => SECURE_OPERATORS.test(plainText(t.instruction)) || SECURE_OPERATORS_BILINGUAL.test(plainText(t.instruction)) || t.answer.kind === 'tableFill'
    )
  if (hasBox || hasSelfCheck || hasSecuring) return []
  return [
    { kind: 'closure', message: 'Es fehlt eine Ergebnissicherung: ein Merkkasten, eine Tabelle zum Ausfüllen oder eine Aufgabe, die das Ergebnis festhält.' }
  ]
}

/** Aufgabenzahl und Formatmischung (mindestens zwei verschiedene Aufgabenstellungen). */
export function checkTaskMix(sheet: Sheet): DidacticWarning[] {
  const list = tasks(sheet)
  const out: DidacticWarning[] = []
  // Sprachmittlung und Schreiben laufen auf EINE Hauptaufgabe zu – dann ist ein einzelner Auftrag richtig
  const singleProduct = list.some((t) => t.skill === 'mediation' || t.skill === 'writing')
  if (list.length < 2 && !singleProduct)
    out.push({ kind: 'taskMix', message: 'Ein Arbeitsblatt sollte mindestens zwei verschiedene Aufgabenstellungen enthalten.' })
  const formats = new Set(list.map(taskFormat))
  if (list.length >= 3 && formats.size < 2)
    out.push({ kind: 'taskMix', message: 'Alle Aufgaben haben dieselbe Antwortform – besser geschlossene, halboffene und offene Formate mischen.' })
  return out
}

/**
 * Zahl der Aufgaben: Auf normalem Niveau sind wenige, tragfähige Aufgaben besser als viele kleine Schritte.
 * Kleinschrittigkeit ist ein Mittel der Vereinfachung und gehört zur Stufe ★, nicht zum Regelfall.
 */
export function checkTaskCount(sheet: Sheet, meta: WorksheetMeta, profile?: LearnerProfile): DidacticWarning[] {
  const list = tasks(sheet)
  const out: DidacticWarning[] = []
  const simplified = sheet.stars === 1
  /*
   * Hat die Lehrkraft eine Zahl vorgegeben, wird GEGEN SIE geprüft – in beide Richtungen.
   * Der Richtwert des Altersbands hat dann nichts mehr zu melden: Wer sechs Aufgaben bestellt,
   * will bei fünf oder sieben einen Hinweis, nicht bei zwölf.
   */
  const wanted = Math.round(meta.taskCount ?? 0)
  if (wanted > 0 && !simplified && list.length !== wanted) {
    out.push({
      kind: 'taskCount',
      message: `${list.length} Aufgaben, vorgegeben waren ${wanted}. ${list.length > wanted ? 'Aufgaben zusammenfassen, die einen Denkschritt bilden' : 'Es fehlt eine Aufgabe'}.`
    })
  }
  if (profile && !simplified && wanted === 0) {
    // Ohne Seitenvorgabe zählt die geschätzte Seitenzahl, bei einer Spanne die Obergrenze (didactics/seiten.ts, Paket 7)
    const max = profile.tasks.perPage[1] * seitenBereich(meta).max
    if (list.length > max) {
      out.push({
        kind: 'taskCount',
        message: `${list.length} Aufgaben auf ${seitenText(meta)} – das wirkt kleinschrittig. Auf normalem Niveau sind höchstens ${max} Aufgaben vorgesehen; Aufgaben zusammenfassen, die einen Denkschritt bilden.`
      })
    }
    const manyParts = list.filter((t) => t.parts.length > 4)
    if (manyParts.length) {
      out.push({
        kind: 'taskCount',
        message: `Aufgabe mit ${manyParts[0].parts.length} Teilaufgaben – so viele Teilschritte sind ein Mittel der Vereinfachung (Stufe ★), nicht der Normalfall.`
      })
    }
  }
  for (const skill of ['mediation', 'writing'] as const) {
    const hits = list.filter((t) => t.skill === skill)
    if (hits.length > 1) {
      const name = skill === 'mediation' ? 'Sprachmittlungsaufgabe' : 'Schreibaufgabe'
      out.push({ kind: 'taskCount', message: `${hits.length} ${name}n auf einem Blatt – eine genügt; die übrigen Aufgaben bereiten sie vor.` })
    }
  }
  return out
}

/** Arbeitsanweisungen: ein Auftrag je Nummer, höchstens 25 Wörter. */
export function checkInstructions(sheet: Sheet): DidacticWarning[] {
  const out: DidacticWarning[] = []
  tasks(sheet).forEach((t, i) => {
    const text = plainText(t.instruction).trim()
    const words = text.split(/\s+/).filter(Boolean).length
    // Sprachmittlung und Schreiben tragen die Situation in der Arbeitsanweisung – sie darf dort länger sein
    const situated = t.skill === 'mediation' || t.skill === 'writing'
    if (words > 25 && t.parts.length === 0 && !situated)
      out.push({ kind: 'instruction', message: `Aufgabe ${i + 1}: Arbeitsanweisung mit ${words} Wörtern – kürzer fassen oder in Teilaufgaben gliedern.` })
    if (words > 90 && situated)
      out.push({ kind: 'instruction', message: `Aufgabe ${i + 1}: Die Situation ist mit ${words} Wörtern zu ausführlich – zwei bis vier Sätze genügen.` })
    if (!t.solution.trim() && t.parts.every((p) => !p.solution.trim()))
      out.push({ kind: 'instruction', message: `Aufgabe ${i + 1}: keine Lösung bzw. kein Erwartungshorizont hinterlegt.` })
  })
  return out
}

/** Alle Blatt-Prüfungen zusammen. */
/**
 * Kommen die bestellten Aufgabenformate wirklich vor?
 *
 * Die Lehrkraft wählt bei Hör- und Leseverstehen ausdrücklich Formate aus. Fehlte eines
 * davon, fiel das erst beim Durchsehen auf – und nur, wenn man genau hinsah. Geprüft wird
 * über die Antwortform: Jedes gewählte Format bringt eine mit.
 */
export function checkComprehensionFormats(sheet: Sheet, meta: WorksheetMeta): DidacticWarning[] {
  const skill = meta.skillFocus === 'listening' ? 'listening' : meta.skillFocus === 'reading' ? 'reading' : null
  if (!skill || !meta.comprehensionFormats?.length) return []
  // Bei genau einer bestellten Aufgabe kann nicht jedes Format vorkommen – das ist gewollt
  if (Math.round(meta.taskCount ?? 0) === 1) return []
  const kinds = new Set(
    tasks(sheet)
      .filter((t) => !t.skill || t.skill === skill)
      .flatMap((t) => [t.answer.kind, ...t.parts.map((p) => p.answer.kind)])
  )
  const fehlend = meta.comprehensionFormats.map((id) => comprehensionFormatById(id)).filter((f) => f && !kinds.has(f.answerKind))
  return fehlend
    .filter((f) => f !== undefined)
    .map((f) => ({
      kind: 'taskMix' as const,
      message: `Das gewählte Format „${f.label}" kommt auf dem Blatt nicht vor. Einzelnen Baustein neu erzeugen oder das Format abwählen.`
    }))
}

/**
 * Kein AFB III bei reinen Verstehensaufgaben.
 *
 * Belegt über alle amtlichen Quellen hinweg: Rezeptive Prüfungsteile liegen in AFB I und II
 * (IQB: „schwerpunktmäßig I, vereinzelt II"; Hamburg: „I und II"). Bereich III wird über die
 * produktiven Aufgaben eingelöst. Steht er trotzdem an einer Höraufgabe, ist das ein Fehler
 * in der Einstufung – nicht eine besonders anspruchsvolle Aufgabe.
 */
export function checkReceptiveAfb(sheet: Sheet, meta: WorksheetMeta): DidacticWarning[] {
  const skill = meta.skillFocus === 'listening' ? 'listening' : meta.skillFocus === 'reading' ? 'reading' : null
  if (!skill) return []
  return tasks(sheet)
    .filter((t) => (!t.skill || t.skill === skill) && t.afb === 'III')
    .map((t) => ({
      kind: 'afbMix' as const,
      message: `„${plainText(t.instruction).slice(0, 40)}…" ist als AFB III eingestuft. Hör- und Leseverstehen liegen in AFB I und II; Bewerten und Gestalten gehören zu einer produktiven Aufgabe.`
    }))
}

/**
 * Wollte die Lehrkraft Bilder – und kam keines?
 *
 * Das ist der stille Fall: Die Bildersuche und die KI-Erzeugung arbeiten einwandfrei, sie
 * bekommen nur nichts zu tun, weil die Gliederung keinen Bild-Baustein vorsah. Auf dem Blatt
 * sieht das aus wie ein Fehler der Bilderzeugung. Deshalb wird es hier benannt.
 */
export function checkImageWish(sheet: Sheet, meta: WorksheetMeta): DidacticWarning[] {
  if ((meta.imageAmount ?? 'auto') !== 'min1') return []
  const bilder = sheet.blocks.filter((b) => b.type === 'image').length
  // Bei einer Seitenspanne genügt ein Bild je Seite der Untergrenze
  if (bilder >= seitenBereich(meta).min) return []
  return [
    {
      kind: 'image',
      message:
        bilder === 0
          ? 'Es wurde kein Bild eingeplant, obwohl mindestens eines je Seite gewünscht war. Über „Baustein hinzufügen → Bild" lässt sich eines ergänzen; die App sucht dann selbst ein passendes.'
          : `Es wurden ${bilder} Bilder eingeplant, gewünscht war mindestens eines je Seite (${seitenText(meta)}).`
    }
  ]
}

export function checkSheet(sheet: Sheet, meta: WorksheetMeta, foreignLanguage?: string, profile?: LearnerProfile): DidacticWarning[] {
  return [
    ...checkComprehensionFormats(sheet, meta),
    // Wortlaut der einzelnen Fragen – zählt nur bei Hör- und Leseverstehen
    ...checkItemWording(sheet, meta),
    // Leseverstehen: richtig/falsch nur mit Textbeleg
    ...checkTrueFalseEvidence(sheet, meta),
    // Geschichte: keine Batterie geschlossener Formate (EPA 3.2.2)
    ...checkClosedFormatsHistory(sheet, meta),
    // Quellen brauchen Verfasser, Datum, Textsorte und Zeilennummern (EPA 3.3.3)
    ...checkSourceHeaders(sheet, meta),
    // Erzaehlungen: keine woertlichen Zitate, mindestens eine Dekonstruktionsaufgabe
    ...checkNarration(sheet, meta),
    ...checkReceptiveAfb(sheet, meta),
    // Bilingual stehen die Operatoren in der Arbeitssprache – die deutsche Liste passt dort nicht
    ...(bilingualAktiv(meta) ? checkBilingual(sheet, meta) : checkSubjectOperators(sheet, meta, foreignLanguage)),
    ...checkAfbBalance(sheet),
    ...checkClosure(sheet),
    ...checkTaskMix(sheet),
    ...checkTaskCount(sheet, meta, profile),
    ...checkInstructions(sheet),
    ...checkImageWish(sheet, meta),
    // Sek I du, Sek II Sie – nur Arbeitsanweisungen und Hilfen, nie Material (Paket 8b)
    ...checkAnrede(sheet, meta),
    ...(foreignLanguage ? checkLanguageSkills(sheet, meta) : [])
  ]
}
