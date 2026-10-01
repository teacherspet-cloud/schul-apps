/**
 * Operatorenliste als Anlage der Klausur (27.09.2026).
 *
 * Anlass der Lehrkraft: In Niedersachsen müssen den Schülerinnen und Schülern der Sek II die
 * Operatoren zu Klausuren zur Verfügung gestellt werden. Der Baustein listet GENAU die
 * Operatoren auf, die in den Aufgaben der Arbeit vorkommen, und definiert sie – ausschließlich
 * nach der amtlichen Liste des Landes (Entscheidung der Lehrkraft: keine KI-Formulierungen).
 * Fehlt zu einem verwendeten Operator die amtliche Definition, bleibt er weg und die Lehrkraft
 * bekommt einen Hinweis. Entsteht bei Sek II von selbst, in der Sek I per Schalter; steht als
 * eigener Abschnitt am Ende der Arbeit.
 *
 * Die Listen selbst: `operatorenlistenDaten.ts` (Land → Fach → Operatoren mit Quelle).
 */
import { fachDerArbeit, formatArt } from '../model/faecher'
import type { InfoBoxBlock, TaskBlock } from '../../arbeitsblatt/model/types'
import type { AnlageWunsch } from '@shared/operatoren/zugriff'
import { anlageFuer, operatorenAuswahl } from '@shared/operatoren/zugriff'
import type { Listensprache, OperatorDefinition, Operatorenliste } from '@shared/operatoren/typen'
import { enthaeltOperatorForm, findeOperatoren } from '@shared/operatoren/erkennung'
import { upperSecondary } from '../generation/generateExam'
import { alleFassungen } from '../model/fassungen'
import type { Exam } from '../model/types'
import { OPERATORENLISTEN } from './operatorenlistenDaten'
import { STOPPWOERTER } from '@shared/stoppwoerter'

/*
 * Die Typen stehen seit dem gemeinsamen Operatoren-Bestand (Großprogramm 0.4, D3) in
 * `shared/operatoren/typen.ts`; hier nur weitergereicht, damit bestehende Importe gelten.
 */
export type { OperatorDefinition, Operatorenliste } from '@shared/operatoren/typen'

/**
 * Welcher Kompetenzbereich einer Liste zu welchem Teil der Arbeit gehört. Die Erläuterung eines
 * Operators unterscheidet sich je Bereich („explain" in der Sprachmittlung: „… taking into account
 * culture-related differences"). Ohne Zuordnung gilt der erste passende Eintrag.
 */
export const KOMPETENZBEREICH_JE_FORMAT: Record<string, string> = {
  'en-mediation': 'Sprachmittlung',
  'en-speaking': 'Sprechen',
  'en-listening': 'Hör-/Hörsehverstehen',
  'en-writing': 'Schreiben',
  'en-reading': 'Schreiben',
  'en-language': 'Schreiben',
  'en-grammar': 'Schreiben'
}

/** Kompetenzbereich eines Teils – für alle Fremdsprachen (fr-mediation wie en-mediation) */
export function kompetenzbereichFuer(formatId: string): string | undefined {
  const art = formatArt(formatId)
  return art ? KOMPETENZBEREICH_JE_FORMAT[`en-${art}`] : undefined
}

export const OPERATOREN_BLOCK_ID = 'exam-operatoren'

/** Ist der Baustein für diese Arbeit vorgesehen? Fehlt die Wahl, entscheidet die Stufe. */
export const operatorenlisteAktiv = (exam: Exam): boolean => exam.meta.operatorenliste ?? upperSecondary(exam.meta)

/**
 * Die amtliche Liste des Landes für das Fach – oder null, wenn keine hinterlegt ist.
 * Niedersachsen: von Hand erfasste Listen mit Vorbemerkungen (`operatorenlistenDaten.ts`).
 * Alle anderen Länder: gemeinsamer Bestand aus der Recherche vom 28.09.2026, nur Listen aus
 * Dokumenten des Landes selbst.
 */
export function amtlicheListe(stateId: string, subjectId: string, wunsch: AnlageWunsch = {}): Operatorenliste | null {
  const hand = OPERATORENLISTEN[stateId]?.[subjectId]
  // Die von Hand erfassten Listen sind Abiturlisten – für die Sek I hat eine Sek-I-Liste des Landes Vorrang
  if (hand && wunsch.stufe === 'sek1') {
    const sek1 = operatorenAuswahl({ stateId, fach: subjectId, stufe: 'sek1', sprache: wunsch.sprache, schulform: wunsch.schulform, nurLand: true })
    if (sek1 && !sek1.stufeAbweichend) return { sprache: sek1.sprache, quelle: sek1.quelle, operatoren: sek1.operatoren }
  }
  return hand ?? anlageFuer(stateId, subjectId, wunsch)
}

const LISTEN_SPRACHEN: string[] = ['de', 'en', 'fr', 'es', 'it', 'ru']

/** Sprache und Stufe der Arbeit für die Wahl der Liste */
export function anlageWunsch(meta: Exam['meta']): AnlageWunsch {
  const zielsprache = meta.bilingual ? 'en' : fachDerArbeit(meta.subjectId).sprache
  // Amtliche Operatorenlisten gibt es in Deutsch, Englisch, Französisch, Spanisch, Italienisch und Russisch –
  // die übrigen Sprachen (Niederländisch, Polnisch, Tschechisch, Portugiesisch, Türkisch, Chinesisch) ohne Liste
  const sprache = LISTEN_SPRACHEN.includes(zielsprache) ? (zielsprache as AnlageWunsch['sprache']) : undefined
  return { sprache, stufe: upperSecondary(meta) ? 'sek2' : 'sek1', schulform: meta.schoolTypeId }
}

const normal = (s: string): string => s.toLocaleLowerCase('de').replace(/[*_]/g, '').replace(/\s+/g, ' ').trim()

/**
 * Der Operator einer Arbeitsanweisung: die fett gesetzten Teile des ersten Satzes
 * („**Outline** the …" → „Outline"; „**Stelle** die Entwicklung **dar**" → „Stelle dar";
 * „**Setze** die Quellen **in Beziehung**" → „Setze in Beziehung").
 */
export function operatorAusAnweisung(instruction: string): string {
  const satz = (instruction ?? '').split(/(?<=[.!?])\s/)[0] ?? ''
  const teile = [...satz.matchAll(/\*\*([^*]{1,40})\*\*/g)].map((m) => m[1].trim()).filter(Boolean)
  return teile.slice(0, 3).join(' ')
}

/** Die Operatoren aller Aufgaben und Teilaufgaben in der Reihenfolge des ersten Vorkommens */
export function operatorenDerArbeit(exam: Exam): string[] {
  const out: string[] = []
  const gesehen = new Set<string>()
  const merke = (op: string | undefined): void => {
    const n = normal(op ?? '')
    if (!n || gesehen.has(n)) return
    gesehen.add(n)
    out.push(n)
  }
  for (const part of exam.parts)
    for (const liste of alleFassungen(part))
      for (const b of liste) {
        if (b.type !== 'task') continue
        const t = b as TaskBlock
        // Der Operator steht fett vorn in der Anweisung; das Feld `operator` ist der Rückfall
        merke(operatorAusAnweisung(t.instruction) || t.operator)
        for (const p of t.parts) merke(operatorAusAnweisung(p.instruction))
      }
  return out
}

/** Jeder Operator mit dem Teil, in dem er zuerst vorkommt (für den Kompetenzbereich) */
export function operatorVorkommen(exam: Exam): { op: string; formatId: string; text: string }[] {
  const out: { op: string; formatId: string; text: string }[] = []
  const gesehen = new Set<string>()
  for (const part of exam.parts)
    for (const liste of alleFassungen(part))
      for (const b of liste) {
        if (b.type !== 'task') continue
        const t = b as TaskBlock
        for (const [roh, text] of [
          [operatorAusAnweisung(t.instruction) || t.operator, t.instruction],
          ...t.parts.map((x) => [operatorAusAnweisung(x.instruction), x.instruction])
        ]) {
          const op = normal(roh ?? '')
          const bereich = kompetenzbereichFuer(part.formatId) ?? ''
          const k = `${op}|${bereich}`
          if (!op || gesehen.has(k)) continue
          gesehen.add(k)
          out.push({ op, formatId: part.formatId, text: text ?? '' })
        }
      }
  return out
}

export interface OperatorenBefund {
  /** Verwendete Operatoren mit amtlicher Definition, in der Reihenfolge der Arbeit */
  gefunden: OperatorDefinition[]
  /** Verwendete Operatoren ohne amtliche Definition */
  fehlend: string[]
  liste: Operatorenliste | null
}

export function operatorenBefund(exam: Exam): OperatorenBefund {
  const liste = amtlicheListe(exam.meta.stateId, exam.meta.subjectId, anlageWunsch(exam.meta))
  if (!liste) return { gefunden: [], fehlend: operatorenDerArbeit(exam), liste: null }
  const fach = exam.meta.subjectId
  // Einträge, die nur für andere Fächer gelten („darstellen" nur Erdkunde/Politik), zählen nicht
  const gueltig = liste.operatoren.filter((d) => !d.nurFaecher?.length || d.nurFaecher.includes(fach))
  const gefunden: OperatorDefinition[] = []
  const fehlend: string[] = []
  for (const { op, formatId, text } of operatorVorkommen(exam)) {
    const bereich = kompetenzbereichFuer(formatId)
    // Zuerst im Kompetenzbereich des Teils, sonst irgendwo in der Liste
    const treffer =
      gueltig.find((d) => passt(op, d, liste.sprache) && (!bereich || !d.kompetenzbereich || d.kompetenzbereich === bereich)) ??
      gueltig.find((d) => passt(op, d, liste.sprache)) ??
      /*
       * Nur ein Teil fett („**Fassen** Sie … zusammen" → „fassen"): der ganze Satz über die gemeinsame
       * Erkennung (01.10.2026). Sonst stand „fassen" als fehlende Definition da – und eine Reparatur
       * setzte „Zusammenfassen Sie" an den Satzanfang.
       */
      gueltig[findeOperatoren(text, gueltig, { sprache: liste.sprache, nomen: false })[0]?.index ?? -1]
    if (!treffer) {
      if (!fehlend.includes(op)) fehlend.push(op)
    } else if ((treffer.definition || treffer.beispiele?.length) && !gefunden.includes(treffer)) gefunden.push(treffer)
  }
  return { gefunden, fehlend, liste }
}

/**
 * Wortstamm eines Verbs: „analysiere" und „analysieren" → „analysier"; seit Phase G auch Französisch
 * („analysez" ↔ „analyser") und Spanisch („analiza" ↔ „analizar", „describid" ↔ „describir").
 */
const stamm = (w: string): string => w.replace(/(issez|ez|er|ir|ad|ar|id|en|n|e|a)$/, '')

/**
 * Passt der Operator der Aufgabe zum Eintrag? Gleicher Wortlaut, eine hinterlegte Form
 * („Nimm Stellung"), derselbe Wortstamm bei einem einzelnen Verb („Erläutere" ↔ „erläutern") –
 * und seit 30.09.2026 alles, was die gemeinsame Erkennung kennt: Sie- und ihr-Form
 * („Erläutern Sie"), trennbare Verben („Arbeiten Sie … heraus"), Wendungen.
 */
export function passt(op: string, d: OperatorDefinition, sprache: Listensprache = 'de'): boolean {
  const n = normal(d.operator)
  if (n === op) return true
  if ((d.formen ?? []).some((f) => normal(f) === op)) return true
  const w1 = op.split(' ')
  const w2 = n.split(' ')
  if (w1.length === 1 && w2.length === 1 && stamm(w1[0]) === stamm(w2[0]) && stamm(w1[0]).length >= 4) return true
  return enthaeltOperatorForm(op, d, { sprache })
}

/*
 * ---------- Darstellung auf dem Schülerblatt (01.10.2026) ----------
 *
 * Befund der Lehrkraft zu einer Englisch-Klausur (NI, Sek II) mit Sprachmittlung: Unter der
 * Aufgabe stand ein Kasten „Operators used in this test" mit der deutschen Vorbemerkung des
 * Ministeriums („Es ist erforderlich, die hier dargestellten Operatoren in einen situativen
 * Rahmen … einzubetten.") und dem illustrierenden Aufgabenbeispiel der Liste.
 *
 * Herkunft: Seit 849edee (28.09.2026, „alles aus der amtlichen Liste") setzte `operatorenBlock`
 * Vorbemerkungen (`hinweise`), Aufgabenbeispiele (`beispiele`), weitere Spalten (`zusatz`) und
 * die deutschen Namen der Kompetenzbereiche mit auf das Blatt. Die Vorbemerkung richtet sich an
 * die Aufgabenersteller, die Beispiele sind keine Definitionen. Seit 13e5784 (27.09.2026) stand
 * der Kasten zudem DIREKT hinter der letzten Aufgabe – bei einer Sprachmittlung also zwischen
 * Aufgabe und Material M1, als gehöre er zur Aufgabe.
 *
 * Jetzt: eine knappe Liste – Operator und Erläuterung in der Sprache der Liste, jeder Operator
 * einmal – als eigener Anhang am Ende der Arbeit. Vorbemerkungen bekommt nur die Lehrkraft
 * (`operatorenVorbemerkungen`, Hinweis im Aufgabenschritt).
 */

/** Ein Wort aus einer Liste: Deutsch erkennbar an seinen Stoppwörtern */
const DEUTSCH = new Set(STOPPWOERTER.de)

/** Steht eine Erläuterung auf Deutsch, obwohl die Liste eine Fremdsprache ist? (HE/NW erläutern englische Operatoren deutsch) */
export function erlaeuterungDeutsch(text: string, sprache: Listensprache): boolean {
  if (sprache === 'de') return false
  const woerter = text.toLowerCase().match(/[\p{L}]+/gu) ?? []
  if (woerter.length < 4) return false
  const ziel = new Set(STOPPWOERTER[sprache] ?? [])
  const de = woerter.filter((w) => DEUTSCH.has(w) && !ziel.has(w)).length
  return de / woerter.length >= 0.12 || /[äöüß]/.test(text)
}

/**
 * Die Erläuterung eines Operators für das Schülerblatt: nur der Definitionstext, ohne angehängte
 * Hinweise („Besonderer Hinweis: …") – leer, wenn es keine Erläuterung in der Sprache der Liste gibt.
 */
export function schuelerErlaeuterung(d: OperatorDefinition, sprache: Listensprache): string {
  const def = (d.definition ?? '')
    .replace(/\s*(?:besonderer\s+)?(?:hinweis|anmerkung|note|nota)\s*:[\s\S]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!def || erlaeuterungDeutsch(def, sprache)) return ''
  return def
}

/** Die Einträge des Schülerblatts: je Operator EINMAL (der erste Fund), nur mit Erläuterung in der Sprache der Liste */
export function schuelerEintraege(befund: OperatorenBefund): { operator: string; erlaeuterung: string }[] {
  if (!befund.liste) return []
  const out: { operator: string; erlaeuterung: string }[] = []
  const gesehen = new Set<string>()
  for (const d of befund.gefunden) {
    const k = normal(d.operator)
    if (gesehen.has(k)) continue
    const erlaeuterung = schuelerErlaeuterung(d, befund.liste.sprache)
    if (!erlaeuterung) continue
    gesehen.add(k)
    out.push({ operator: d.operator, erlaeuterung })
  }
  return out
}

/** Verwendete Operatoren, deren amtliche Erläuterung nicht aufs Schülerblatt kommt (fehlt oder steht nur auf Deutsch) – für den Hinweis an die Lehrkraft */
export function ohneSchuelerErlaeuterung(befund: OperatorenBefund): string[] {
  if (!befund.liste) return []
  const drauf = new Set(schuelerEintraege(befund).map((e) => normal(e.operator)))
  return [...new Set(befund.gefunden.filter((d) => !drauf.has(normal(d.operator))).map((d) => d.operator))]
}

/** Vorbemerkungen der Liste zu den Kompetenzbereichen der verwendeten Operatoren – nur für die Lehrkraft */
export function operatorenVorbemerkungen(befund: OperatorenBefund): { bereich: string; text: string }[] {
  const h = befund.liste?.hinweise ?? {}
  const bereiche = [...new Set(befund.gefunden.map((d) => d.kompetenzbereich ?? ''))]
  return bereiche.filter((b) => h[b]?.trim()).map((b) => ({ bereich: b, text: h[b] }))
}

const TITEL: Record<Listensprache, string> = {
  de: 'Operatoren dieser Arbeit',
  en: 'Operators used in this test',
  fr: 'Consignes utilisées dans ce devoir',
  es: 'Operadores de este examen',
  it: 'Operatori usati in questa verifica',
  ru: 'Операторы в этой работе'
}
const QUELLE: Record<Listensprache, string> = { de: 'Quelle', en: 'Source', fr: 'Source', es: 'Fuente', it: 'Fonte', ru: 'Источник' }
const ANHANG: Record<Listensprache, string> = { de: 'Anhang', en: 'Appendix', fr: 'Annexe', es: 'Anexo', it: 'Allegato', ru: 'Приложение' }

/** Überschrift des Anhangs, unter dem die Liste steht – trennt sie sichtbar vom letzten Teil */
export const OPERATOREN_ANHANG_ID = 'exam-operatoren-anhang'
export const operatorenAnhangTitel = (sprache: Listensprache): string => ANHANG[sprache] ?? ANHANG.de

/**
 * Der Baustein für das Ende der Arbeit – ein Kasten ohne Materialnummer. Null, wenn die Liste
 * nicht vorgesehen ist oder kein verwendeter Operator eine Erläuterung für das Blatt hat.
 */
export function operatorenBlock(exam: Exam): InfoBoxBlock | null {
  if (!operatorenlisteAktiv(exam)) return null
  const befund = operatorenBefund(exam)
  const { liste } = befund
  if (!liste) return null
  const eintraege = schuelerEintraege(befund)
  if (!eintraege.length) return null
  const sprache = liste.sprache
  return {
    id: OPERATOREN_BLOCK_ID,
    type: 'infoBox',
    variant: 'definition',
    title: TITEL[sprache] ?? TITEL.de,
    body: [...eintraege.map((e) => `- **${e.operator}**: ${e.erlaeuterung}`), '', `${QUELLE[sprache] ?? QUELLE.de}: ${liste.quelle}`].join('\n')
  }
}

/** Ein Operator mit allem, was die Liste angibt (Erläuterung, AFB, Beispiele, weitere Spalten) – nur für Ansichten der Lehrkraft, nie für das Schülerblatt */
export function operatorZeilen(d: OperatorDefinition, en: boolean): string[] {
  const kopf = `**${d.operator}**${d.afb ? ` (${en ? 'level' : 'AFB'} ${d.afb})` : ''}${d.definition ? `: ${d.definition}` : ''}`
  const out = [kopf]
  for (const [spalte, inhalt] of Object.entries(d.zusatz ?? {})) if (inhalt) out.push(`${spalte}: ${inhalt}`)
  if (d.beispiele?.length)
    out.push(
      `${en ? (d.beispiele.length > 1 ? 'Examples' : 'Example') : d.beispiele.length > 1 ? 'Beispiele' : 'Beispiel'}: ${d.beispiele.map((b) => (en ? `“${b}”` : `„${b}“`)).join(' · ')}`
    )
  return out
}
