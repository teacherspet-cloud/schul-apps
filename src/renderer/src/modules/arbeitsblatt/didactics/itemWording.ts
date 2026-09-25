/**
 * Wortlaut der EINZELNEN Fragen bei Hör- und Leseverstehen.
 *
 * Nicht das Aufgabenformat und nicht der Text, sondern der Satz, den die Lernenden lesen,
 * bevor sie ankreuzen oder antworten. Er entscheidet mit darüber, ob geprüft wird, was
 * geprüft werden soll.
 *
 * BELEGTE GRUNDLAGE (Recherche in den amtlichen Vorgaben):
 *
 * - QUA-LiS/MSB NRW, „Klausuren in den modernen Fremdsprachen…" (Stand 27.10.2025, S. 13–14).
 *   Items „sind so formuliert, dass ihr Sprachniveau nicht das Sprachniveau des Hörtextes
 *   übersteigt"; sie „vermeiden Verneinungen"; sie sind „ohne Einschränkungs- und
 *   Ausschließlichkeitspartikel (z. B. weniger, immer)"; sie „sind voneinander unabhängig";
 *   sie „sind nicht allein durch Weltwissen zu lösen"; in Attraktoren und Distraktoren
 *   werden „die Formulierungen des Originaltexts" nicht wiederholt.
 * - KMK 2012 (Abitur fortgeführte Fremdsprache): „Das sprachliche Anforderungsniveau der
 *   einzelnen Items liegt jeweils unterhalb des Anforderungsniveaus der Hörtexte, sodass
 *   Defizite im Bereich des Leseverstehens die Schülerleistungen im Bereich des
 *   Hörverstehens nach Möglichkeit nicht beeinflussen."
 * - KMK 2003 (MSB erste Fremdsprache): „weitgehende Reduktion von Lese- und
 *   Schreibleistungen als Kontrollinstrument".
 * - ALTE/Council of Europe, „Manual for Language Test Development and Examining" (2011):
 *   Prüffrage je Item „Do the words in the item repeat exactly the words in the text?";
 *   Item-Unabhängigkeit; Antworttyp und -länge müssen angegeben sein.
 * - Empirie zur wörtlichen Übernahme: Yanagawa & Green (2008), System 36, 107–122;
 *   Koyama, Sun & Ockey (2016), LL&T 20(1) – Lernende greifen dann zur „lexical matching
 *   strategy" und lösen über Wortgleichheit statt über Verstehen.
 *
 * Was hier NICHT geprüft wird, weil es sich lokal nicht entscheiden lässt: ob eine Frage
 * allein aus Weltwissen lösbar ist, ob die Distraktoren plausibel sind und ob genau eine
 * Antwort richtig ist. Das bleibt der KI-Prüfung und der Lehrkraft.
 */
import { plainText } from '../../../shared/richtext/parse'
import type { Sheet, TaskBlock, WorksheetMeta } from '../model/types'
import type { DidacticWarning } from './checks'

/** Zählt als Verstehensaufgabe – nur dort gelten diese Regeln. */
const istVerstehen = (b: TaskBlock, meta: WorksheetMeta): boolean =>
  b.skill === 'listening' || b.skill === 'reading' || meta.skillFocus === 'listening' || meta.skillFocus === 'reading'

/**
 * Verneinungen als GANZE Wörter.
 *
 * „not" steckt in „nothing", „kein" in „keineswegs" – als Teilzeichenfolge gesucht, schlüge
 * die Prüfung ständig grundlos an. Denselben Fehler hatte die App schon einmal beim
 * Sprachfilter der Stimmen.
 *
 * ABSICHTLICH NICHT ERFASST: zusammengezogene Formen wie „can't", „doesn't", „isn't".
 * Gemeint ist der Fehler, den die Vorgaben meinen – eine Frage, die nach dem NICHT-Fall
 * sucht („Which statement is not true?") und die man erst gedanklich umdrehen muss. Eine
 * inhaltliche Verneinung wie „What can't Karam find?" ist davon verschieden; sie steht so
 * in der Klassenarbeit der Lehrkraft und ist dort völlig in Ordnung. Würde die Prüfung sie
 * melden, hätte sie am ersten echten Blatt unrecht – und würde fortan weggeklickt.
 *
 * „never/nie" fehlt hier ebenfalls: Das fängt schon die Regel zu den Ausschließlichkeits-
 * wörtern ab, und zwei Meldungen zu einer Stelle sind eine zu viel.
 */
const VERNEINUNG = /\b(not|nicht|kein|keine|keinen|keiner|ne\s+pas|aucun|aucune|nunca|nada)\b/i

/**
 * Einschränkungs- und Ausschließlichkeitspartikel.
 *
 * NRW nennt sie ausdrücklich („z. B. weniger, immer"). Sie machen eine Aussage absolut und
 * damit leicht widerlegbar – die Frage wird über die Logik lösbar statt über den Text.
 */
const ABSOLUT =
  /\b(always|never|only|all|every|none|immer|nie|nur|alle|jede[rs]?|sämtliche|weniger|ausschließlich|toujours|jamais|seulement|siempre|solo|sempre)\b/i

/** Kombinationsoptionen und Sammeloptionen – in jeder Itemschreib-Liste verboten. */
const SAMMELOPTION = /^(all of the above|none of the above|both a and b|a and c|alles davon|nichts davon|keine der (genannten|obigen)|a und b|a und c)/i

const woerter = (s: string): string[] =>
  plainText(s)
    .toLowerCase()
    .split(/[^\p{L}\p{N}']+/u)
    .filter(Boolean)

/**
 * Wörtliche Übernahme: vier aufeinanderfolgende Wörter, die genauso im Text stehen.
 *
 * Vier ist die Grenze, die auch `didactics/demand.ts` benutzt – darunter trifft man
 * Alltagswendungen („there is a"), darüber entgeht einem die halbe Abschrift.
 */
export function wortgleicheStelle(item: string, text: string): string | null {
  const a = woerter(item)
  const b = woerter(text)
  if (a.length < 4 || b.length < 4) return null
  const imText = new Set<string>()
  for (let i = 0; i + 4 <= b.length; i++) imText.add(b.slice(i, i + 4).join(' '))
  for (let i = 0; i + 4 <= a.length; i++) {
    const gramm = a.slice(i, i + 4).join(' ')
    if (imText.has(gramm)) return gramm
  }
  return null
}

/**
 * Obergrenze für die Länge einer Einzelfrage.
 *
 * Faustregel aus der NRW-Vorgabe „eher kurz formuliert, um die erforderliche Leseleistung
 * möglichst gering zu halten" – eine Zahl nennt sie nicht. 20 Wörter sind rund zwei Zeilen;
 * beim Hörverstehen muss die Frage in der Lesezeit vor dem Hören erfasst sein.
 */
export const ITEM_MAX_WOERTER = 20

/** Enthält die Frage mehr als eine Frage? */
export function mehrteiligeFrage(item: string): boolean {
  const t = plainText(item).trim()
  if ((t.match(/\?/g) ?? []).length > 1) return true
  // „Was macht Anna und warum tut sie das?" – zwei Fragewörter, verbunden
  return /\b(and|und|et|y|e)\b\s+(why|how|what|where|when|who|warum|wie|was|wo|wann|wer|pourquoi|comment)\b/i.test(t)
}

/** Alle Einzelfragen einer Aufgabe mit ihrer Nummer. */
function items(b: TaskBlock): { nr: string; text: string; optionen: string[] }[] {
  if (b.parts.length) {
    return b.parts.map((p, i) => ({
      nr: `${i + 1}`,
      text: p.instruction,
      optionen: p.answer.kind === 'multipleChoice' ? p.answer.options : []
    }))
  }
  return [{ nr: '1', text: b.instruction, optionen: b.answer.kind === 'multipleChoice' ? b.answer.options : [] }]
}

/** Der Text, auf den sich die Aufgaben beziehen (Lesetext oder Hörskript). */
function bezugstexte(sheet: Sheet): string {
  return sheet.blocks
    .map((b) => (b.type === 'text' ? b.body : b.type === 'audio' ? b.transcript : ''))
    .filter(Boolean)
    .join('\n')
}

/**
 * Prüft den Wortlaut der Einzelfragen.
 *
 * Absichtlich zurückhaltend: Jede Meldung soll eine sein, die eine Lehrkraft nachvollzieht
 * und ändern würde. Eine Prüfung, die bei jeder zweiten Aufgabe anschlägt, wird weggeklickt.
 */
export function checkItemWording(sheet: Sheet, meta: WorksheetMeta): DidacticWarning[] {
  const out: DidacticWarning[] = []
  const text = bezugstexte(sheet)
  for (const block of sheet.blocks) {
    if (block.type !== 'task' || !istVerstehen(block, meta)) continue
    for (const it of items(block)) {
      const roh = plainText(it.text).trim()
      if (!roh) continue
      const label = block.parts.length ? `Frage ${it.nr}` : 'Die Frage'

      if (VERNEINUNG.test(roh)) {
        out.push({
          kind: 'itemWording',
          message: `${label} enthält eine Verneinung: „${kurz(roh)}". Verstehensfragen werden positiv formuliert (NRW: Items „vermeiden Verneinungen").`
        })
      }
      if (ABSOLUT.test(roh)) {
        out.push({
          kind: 'itemWording',
          message: `${label} enthält ein Ausschließlichkeitswort (immer, nie, nur, alle): „${kurz(roh)}". Solche Fragen lassen sich über die Logik statt über den Text lösen.`
        })
      }
      if (mehrteiligeFrage(roh)) {
        out.push({ kind: 'itemWording', message: `${label} stellt mehr als eine Frage: „${kurz(roh)}". Eine Frage je Item.` })
      }
      const anzahl = woerter(roh).length
      if (anzahl > ITEM_MAX_WOERTER) {
        out.push({
          kind: 'itemWording',
          message: `${label} ist mit ${anzahl} Wörtern lang. Beim Verstehen soll die Leseleistung der Frage gering bleiben – höchstens etwa ${ITEM_MAX_WOERTER} Wörter.`
        })
      }
      const gleich = text ? wortgleicheStelle(roh, text) : null
      if (gleich) {
        out.push({
          kind: 'itemWording',
          message: `${label} übernimmt den Wortlaut des Textes („${gleich}"). Dann wird über Wortgleichheit gelöst, nicht über Verstehen – paraphrasiere.`
        })
      }
      for (const o of it.optionen) {
        const ot = plainText(o).trim()
        if (SAMMELOPTION.test(ot)) {
          out.push({ kind: 'itemWording', message: `${label}: „${kurz(ot)}" ist als Antwortmöglichkeit ungeeignet – sie prüft Logik statt Verstehen.` })
          break
        }
        const treffer = text ? wortgleicheStelle(ot, text) : null
        if (treffer) {
          out.push({
            kind: 'itemWording',
            message: `${label}: Die Antwortmöglichkeit „${kurz(ot)}" steht wörtlich im Text. Auch die falschen Möglichkeiten dürfen den Wortlaut nicht wiederholen.`
          })
          break
        }
      }
    }
  }
  return out
}

/**
 * Richtig/Falsch im Leseverstehen ohne Textbeleg.
 *
 * Bei zwei Möglichkeiten trifft man die Hälfte durch Raten – und wer eine Aussage als
 * falsch erkennt, weiß deshalb noch nicht, was richtig ist. Der Beleg macht aus dem Kreuz
 * einen Nachweis.
 *
 * Belegt: MSB/QUA-LiS NRW, Unterrichtsvorgaben ZP10 Englisch 2027, Abschnitt 1.5 – für das
 * Leseverstehen sind „Richtig-/Falsch-Aufgaben MIT BEGRÜNDUNG" vorgesehen, in MSA,
 * Gymnasium und EESA gleichermaßen. Ebenso KMK 2012 (illustrierende Prüfungsaufgabe
 * Französisch: „Citez le passage qui justifie votre réponse") und die DELF-Prüfungen aller
 * Niveaus ab A2.
 *
 * Gilt NUR fürs Lesen. Beim Hören ist der Text flüchtig; NRW schließt dort richtig/falsch
 * und Begründungsformate für die Leistungsmessung ausdrücklich aus.
 */
export function checkTrueFalseEvidence(sheet: Sheet, meta: WorksheetMeta): DidacticWarning[] {
  const out: DidacticWarning[] = []
  for (const block of sheet.blocks) {
    if (block.type !== 'task') continue
    // Ausschlaggebend ist der Kompetenzbereich der AUFGABE; fehlt er, gilt der des Blattes
    const skill = block.skill ?? (meta.skillFocus === 'reading' ? 'reading' : undefined)
    if (skill !== 'reading') continue
    const arten = [block.answer.kind, ...block.parts.map((p) => p.answer.kind)]
    if (!arten.includes('trueFalse')) continue
    out.push({
      kind: 'itemWording',
      message:
        'Richtig/Falsch beim Leseverstehen ohne Textbeleg: Bei zwei Möglichkeiten ist die Hälfte erraten. Verlange ein kurzes Zitat aus dem Text (NRW ZP10: „Richtig-/Falsch-Aufgaben mit Begründung") – in der App das Format „Richtig / Falsch mit Textbeleg".'
    })
  }
  return out
}

/**
 * Geschlossene Aufgabenformate in Geschichte.
 *
 * Belegt: EPA Geschichte 3.2.2 – „Eine mehrgliedrige Prüfungsaufgabe besteht aus WENIGEN,
 * ABER KOMPLEXEN Arbeitsanweisungen … Ein unzusammenhängendes, additives Reihen von
 * Arbeitsaufträgen ist NICHT ZULÄSSIG." Eine Batterie aus Ankreuz- und Zuordnungsaufgaben
 * ist dort also systemfremd; geprüft werden Deutung und Urteil, nicht Informationsentnahme.
 *
 * Das erklärt auch, warum die Aufgabenformate der Fremdsprachen hier nicht taugen: Dort ist
 * der Text der Prüfgegenstand und viele kleine Items sind gerade erwünscht („eine
 * hinreichende Anzahl (Teil)Aufgaben"). In Geschichte ist der Text Material.
 *
 * NUR EINE WARNUNG, keine Sperre – Entscheidung der Lehrkraft (22.09.2026): Für die
 * Übungsphase im Unterricht sind diese Formate durchaus brauchbar.
 */
export function checkClosedFormatsHistory(sheet: Sheet, meta: WorksheetMeta): DidacticWarning[] {
  if (meta.subjectId !== 'geschichte') return []
  const geschlossen = new Set(['multipleChoice', 'trueFalse', 'matching', 'ordering'])
  const betroffen = sheet.blocks.filter((b) => b.type === 'task' && [b.answer.kind, ...b.parts.map((p) => p.answer.kind)].some((k) => geschlossen.has(k)))
  // Eine einzelne geschlossene Aufgabe ist kein „additives Reihen"
  if (betroffen.length < 2) return []
  return [
    {
      kind: 'taskMix',
      message: `${betroffen.length} Aufgaben mit Ankreuz-, Zuordnungs- oder Reihenfolgeformat. Die EPA Geschichte verlangt „wenige, aber komplexe Arbeitsanweisungen" und schließt ein „unzusammenhängendes, additives Reihen von Arbeitsaufträgen" aus. Für eine Klassenarbeit sind Deutungs- und Urteilsaufgaben vorzuziehen; zum Üben im Unterricht sind die Formate in Ordnung.`
    }
  ]
}

const kurz = (s: string): string => (s.length <= 48 ? s : `${s.slice(0, 45)}…`)
