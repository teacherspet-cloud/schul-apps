/**
 * Alle Prüfungen einer Lernzielkontrolle an einer Stelle.
 *
 * Die Oberfläche soll nicht wissen müssen, welche Regel aus welcher Recherche stammt. Sie
 * bekommt eine Liste von Befunden, jeder mit Schweregrad und – wo es eine gibt – der
 * Fundstelle im Text der Meldung.
 *
 * ZUR SCHWERE: Es gibt keine Fehler, die das Programm blockiert. Das ist eine Entscheidung
 * der Lehrkraft (23.09.2026) und sie ist gut begründet: Die Zeitgrenzen sind nur für fünf
 * Länder belegt, und wer an einer Schule unterrichtet, kennt ihre Gepflogenheiten besser als
 * eine Tabelle. Die App sagt, was ihr auffällt, und nennt den Beleg. Entscheiden tut die
 * Lehrkraft.
 */
import type { WsBlock } from '../../arbeitsblatt/model/types'
import { pruefeBausteine, pruefeMaterialtexte } from './bausteine'
import { pruefeBewertung } from './bewertung'
import { formatById, zeitWarnung } from './formate'
import { bedeutungsHinweise, operatorenIn, pruefeOperatoren, type AufgabeZurPruefung } from './operatorPruefung'
import { KERN_OPERATOREN, namenAus, PRAXIS_OPERATOREN, profilFuer, ZU_AUFWENDIG, type Laenderprofil } from './operatoren'
import type { Kurztest } from '../model/types'
import { anredeBefundeBaustein } from '../../arbeitsblatt/didactics/anrede'
import { worksheetMetaForKurztest } from '../render/kurztestWorksheet'

export type Schwere = 'hinweis' | 'warnung'

export interface Befund {
  /** Wonach die Oberfläche gruppiert */
  bereich: 'Umfang und Zeit' | 'Aufbau' | 'Operatoren' | 'Anrede' | 'Bewertung' | 'Bedeutung'
  schwere: Schwere
  message: string
  /** Baustein, auf den sich der Befund bezieht */
  blockId?: string
}

/**
 * Wandelt die Bausteine einer Variante in die Form, die die Operatorprüfung erwartet.
 *
 * DER OPERATOR VERERBT SICH VON DER AUFGABE AUF IHRE TEILAUFGABEN.
 *
 * Das ist die Bauform, die die App selbst verlangt: „**Berechne.**" steht einmal oben, und
 * darunter stehen nur noch die Terme – a) $2^4 \cdot 2^3$, b) … Im zweiten Prüfdurchlauf mit
 * echter KI kam genau diese, richtige Form zurück, und die Prüfung meldete trotzdem sieben
 * Mal „beginnt mit keinem erkennbaren Operator": Sie sah nur die Teilaufgaben. Geprüft wird
 * deshalb der geerbte Operator gegen die Antwortform der jeweiligen Teilaufgabe.
 */
function alsAufgaben(blocks: WsBlock[], profil?: Laenderprofil): AufgabeZurPruefung[] {
  const hatMaterial = blocks.some((b) => b.type === 'text' || b.type === 'table' || b.type === 'image')
  const bekannt = profil ? namenAus(profil) : KERN_OPERATOREN
  const out: AufgabeZurPruefung[] = []
  for (const b of blocks) {
    if (b.type !== 'task') continue
    if (!b.parts.length) {
      out.push({ id: b.id, instruction: b.instruction, answerKind: b.answer.kind, hatMaterial })
      continue
    }
    const obenErkannt = operatorenIn(b.instruction, [...bekannt, ...PRAXIS_OPERATOREN, ...ZU_AUFWENDIG]).length > 0
    for (const [i, p] of b.parts.entries()) {
      out.push({
        id: `${b.id}:${i}`,
        // Trägt die Aufgabe den Operator, gilt er für jede Teilaufgabe
        instruction: obenErkannt ? `${b.instruction} ${p.instruction}` : p.instruction,
        answerKind: p.answer.kind,
        hatMaterial
      })
    }
  }
  return out
}

/** Zählt die Teilaufgaben – die Größe, an der sich der Umfang bemisst. */
export function teilaufgaben(blocks: WsBlock[]): number {
  return blocks.filter((b) => b.type === 'task').reduce((s, b) => s + (b.type === 'task' ? Math.max(1, b.parts.length) : 0), 0)
}

export function pruefeKurztest(test: Kurztest, varianteIndex = 0): Befund[] {
  const blocks = test.varianten[varianteIndex]?.blocks ?? []
  const m = test.meta
  const format = formatById(m.formatId)
  const profil = profilFuer(m.stateId, m.subjectId, m.stufe, m.schoolTypeId)
  const out: Befund[] = []

  // Zeit gegen die Landesgrenze
  const zeit = zeitWarnung(m.minutes, format)
  if (zeit) out.push({ bereich: 'Umfang und Zeit', schwere: zeit.ueberschritten ? 'warnung' : 'hinweis', message: zeit.message })

  /*
   * Umfang gegen die Zeit.
   *
   * Der Richtwert ist an den beiden echten bayerischen Stegreifaufgaben kalibriert:
   * vier Teilaufgaben mit Rechenweg bzw. neun ohne, jeweils für 20 Minuten. Das war der
   * Befund, an dem die vorgelegte Lernzielkontrolle mit zehn Aufgaben über drei Seiten
   * gescheitert wäre.
   */
  const anzahl = teilaufgaben(blocks)
  const obergrenze = Math.max(4, Math.round(m.minutes / 2.2))
  if (anzahl > obergrenze) {
    out.push({
      bereich: 'Umfang und Zeit',
      schwere: 'warnung',
      message: `${anzahl} Teilaufgaben sind für ${m.minutes} Minuten viel. Eine bayerische Stegreifaufgabe hat für 20 Minuten 4 bis 9 Teilaufgaben auf EINER Seite. Ab diesem Umfang ist es der Sache nach eine Klassenarbeit.`
    })
  }

  /*
   * Fehlende Arbeitsanweisung.
   *
   * Im ersten Prüfdurchlauf mit echter KI stand alles in den Teilaufgaben und die
   * Arbeitsanweisung blieb leer. Auf dem Blatt erschien an ihrer Stelle der Platzhalter des
   * Editors – „Arbeitsanweisung (Operator **fett**)" –, und im Druck wäre die Zeile schlicht
   * leer geblieben.
   */
  for (const b of blocks) {
    if (b.type !== 'task' || b.instruction.trim()) continue
    out.push({
      bereich: 'Aufbau',
      schwere: 'warnung',
      message:
        'Eine Aufgabe hat keine Arbeitsanweisung. Auch wenn alles in den Teilaufgaben steht, braucht die Aufgabe einen gemeinsamen Auftrag – sonst bleibt die Zeile auf dem gedruckten Blatt leer.',
      blockId: b.id
    })
  }

  // Aufbau: nur Aufgaben und Material
  for (const w of pruefeBausteine(blocks, m.nachteilsausgleich)) out.push({ bereich: 'Aufbau', schwere: 'warnung', message: w.message, blockId: w.blockId })
  for (const w of pruefeMaterialtexte(blocks)) out.push({ bereich: 'Aufbau', schwere: 'warnung', message: w.message, blockId: w.blockId })

  // Operatoren
  for (const w of pruefeOperatoren(alsAufgaben(blocks, profil), profil)) {
    // „zu aufwendig" ist ein Hinweis, kein Fehler – kein Land verbietet AFB III im Kurztest
    out.push({ bereich: 'Operatoren', schwere: w.art === 'aufwendig' ? 'hinweis' : 'warnung', message: w.message, blockId: w.blockId.split(':')[0] })
  }

  /*
   * Anrede (Paket 8b): Sek I du, Sek II Sie – nach der gewählten Stufe. Der Auftrag an die KI
   * sagt es; ob sie sich daran hält, zeigt erst diese Prüfung. Gemeldet, nicht korrigiert.
   */
  const blattMeta = worksheetMetaForKurztest(test)
  let nummer = 0
  for (const b of blocks) {
    if (b.type === 'task') nummer++
    for (const message of anredeBefundeBaustein(b, blattMeta, b.type === 'task' ? nummer : undefined)) {
      out.push({ bereich: 'Anrede', schwere: 'hinweis', message, blockId: b.id })
    }
  }

  // Bedeutungsunterschiede zwischen Ländern
  for (const h of bedeutungsHinweise(alsAufgaben(blocks, profil), profil, m.subjectId)) out.push({ bereich: 'Bedeutung', schwere: 'hinweis', message: h })

  // Bewertung
  for (const w of pruefeBewertung(blocks, m.bewertung)) out.push({ bereich: 'Bewertung', schwere: 'warnung', message: w.message })

  return out
}

/** Für die Anzeige: wie viele Warnungen und wie viele Hinweise. */
export function zaehleBefunde(befunde: Befund[]): { warnungen: number; hinweise: number } {
  return {
    warnungen: befunde.filter((b) => b.schwere === 'warnung').length,
    hinweise: befunde.filter((b) => b.schwere === 'hinweis').length
  }
}
