/**
 * Prüfungen für Fremdsprachenaufgaben (ohne KI).
 *
 * Grundlage sind die KMK-Bildungsstandards für die fortgeführte Fremdsprache:
 * Sprachmittlung gibt Adressat, Textsorte und inhaltlichen Fokus vor und verlangt eine
 * sinngemäße, adressatengerechte Wiedergabe – keine Übersetzung. Hörvorlagen werden
 * in der Regel zweimal dargeboten; währenddessen wird nicht frei geschrieben.
 */
import { stoppwortdichte } from '@shared/stoppwoerter'
import { plainText } from '../../../shared/richtext/parse'
import { woerter } from '../generation/kuerzung'
import type { AudioBlock, Sheet, TaskBlock, TextBlock, WorksheetMeta, WsBlock } from '../model/types'
import { subjectById } from '../model/subjects'
import type { DidacticWarning } from './checks'
import { phraseSheetModus } from '../generation/prompts'

/**
 * Steht dieser Text auf Deutsch, obwohl er in der Zielsprache stehen müsste?
 *
 * Gemeldet am 25.09.2026: „die ausformulierte musterlösung der aufgabe [wurde] auf Deutsch
 * verfasst, obwohl die Aufgabe Englisch erfordert."
 *
 * Eine Musterlösung auf Deutsch ist beim Korrigieren wertlos: Die Lehrkraft vergleicht damit
 * eine fremdsprachige Abgabe und kann weder Wortwahl noch Satzbau daran messen.
 *
 * Gemessen wird über die Dichte der häufigsten Wörter beider Sprachen – dieselbe Größe, die
 * auch die Fließtexterkennung benutzt. Einzelne Fachbegriffe oder Zitate kippen das Ergebnis
 * nicht; erst ein durchgehend deutscher Text tut es.
 */
export function inFalscherSprache(text: string, ziel: string): boolean {
  const zahl = woerter(text).length
  // Unter 25 Wörtern ist die Messung nicht belastbar – eine Überschrift sagt nichts
  if (!ziel || ziel === 'de' || zahl < 25) return false
  const deutsch = stoppwortdichte(text, 'de')
  const inZiel = stoppwortdichte(text, ziel)
  return deutsch > 0.08 && deutsch > inZiel * 1.5
}

/** Formulierungen, die eine Sprachmittlung zur Übersetzung machen würden */
const TRANSLATE = /(übersetz|translate|traduis|traduce|traduci|wörtlich|word[- ]for[- ]word|Satz für Satz)/i

/**
 * Wörter, die es nur im Deutschen gibt. Damit erkennt die App eine Worterklärung,
 * die auf Deutsch geschrieben ist, statt die zielsprachliche Entsprechung zu geben.
 * Erst ab zwei Treffern, damit ein mitgeführter deutscher Artikel („das Abitur – school-leaving exam")
 * nicht fälschlich als deutsche Erklärung gilt.
 */
const GERMAN_WORDS = /\b(der|das|dem|des|eine[nmr]?|und|oder|nicht|für|mit|von|zum|zur|über|dass|weil|bezeichnet|bedeutet|man|hier|wird|werden|sind|kann)\b/gi

function looksGerman(text: string): boolean {
  return (text.match(GERMAN_WORDS) ?? []).length >= 2
}

/**
 * Merkmale einer situierten Aufgabe: Rolle, Anlass und Adressat werden benannt.
 * („Your friend from England has been telling you about … You have found this article …“)
 */
const CONTEXT_MARKERS =
  /\b(you|your|imagine|dein|deine|du hast|ihr|tu|ton|ta|tes|votre|tu has|tus|su|il tuo|la tua|friend|partner|exchange|host|penpal|class|school|blog|forum|website|magazine|neighbour|neighbor|family)\b/i

/** Eine Wortzahl in der Arbeitsanweisung („about 120 words“, „ca. 150 Wörter“) */
const WORD_COUNT = /\b\d{2,4}\s*(–|-|bis|to)?\s*\d{0,4}\s*(wörter|worte|words|mots|palabras|parole)\b/i

/** Ist die Arbeitsanweisung als Situation erzählt? */
function isContextualized(instruction: string): boolean {
  const words = instruction.split(/\s+/).filter(Boolean).length
  return words >= 20 && CONTEXT_MARKERS.test(instruction)
}

/**
 * Steht die Situation ZWEIMAL auf dem Blatt – einmal als Vorspann, einmal in der
 * Arbeitsanweisung?
 *
 * Gemeldet von der Lehrkraft (24.09.2026) zu einer Sprachmittlungsaufgabe: „diese beiden
 * abschnitte muessen sinnvoll und nicht ueberfrachtet gebuendelt werden."
 *
 * Gemessen an gemeinsamen Fünf-Wort-Folgen. Ein einzelner Rückgriff („In your article …")
 * ist erwünscht und schlägt hier nicht an; eine nacherzählte Situation schon.
 */
export function doppeltSituiert(situation: string, instruction: string): number {
  const a = woerter(situation)
  const b = new Set<string>()
  const bw = woerter(instruction)
  for (let i = 0; i + 5 <= bw.length; i++) b.add(bw.slice(i, i + 5).join(' '))
  if (a.length < 5 || !b.size) return 0
  let treffer = 0
  let gesamt = 0
  for (let i = 0; i + 5 <= a.length; i++) {
    gesamt++
    if (b.has(a.slice(i, i + 5).join(' '))) treffer++
  }
  return gesamt ? treffer / gesamt : 0
}

/** Ab hier gilt die Situation als nacherzählt statt aufgegriffen. */
const DOPPELUNG_GRENZE = 0.25

/** Antwortformen, die sich während des Hörens ausfüllen lassen */
const WHILE_LISTENING = ['multipleChoice', 'trueFalse', 'matching', 'tableFill', 'gapText', 'ordering', 'labels']

const tasks = (sheet: Sheet): TaskBlock[] => sheet.blocks.filter((b): b is TaskBlock => b.type === 'task')

/** Index eines Bausteins im Blatt */
const indexOf = (sheet: Sheet, block: WsBlock): number => sheet.blocks.indexOf(block)

/**
 * Sprachmittlung: deutscher Ausgangstext davor, Adressat und Textsorte benannt,
 * Ergebnis ist ein zusammenhängender Text in der Zielsprache.
 */
export function checkMediation(sheet: Sheet, meta: WorksheetMeta): DidacticWarning[] {
  // Die Sprache, in der die Lernenden schreiben – und damit auch der Mustertext
  const zielsprache = subjectById(meta.subjectId).foreignLanguage ?? 'de'
  const out: DidacticWarning[] = []
  tasks(sheet)
    .filter((t) => t.skill === 'mediation')
    .forEach((t, i) => {
      const label = `Sprachmittlung ${i + 1}`
      const before = sheet.blocks.slice(0, indexOf(sheet, t))
      const german = before.filter((b): b is TextBlock => b.type === 'text' && b.language === 'de')
      if (!german.length) {
        out.push({ kind: 'mediation', message: `${label}: Es fehlt der deutsche Ausgangstext vor der Aufgabe.` })
      } else {
        const words = plainText(german[german.length - 1].body)
          .split(/\s+/)
          .filter(Boolean).length
        if (words < 50)
          out.push({
            kind: 'mediation',
            message: `${label}: Der deutsche Ausgangstext ist mit ${words} Wörtern zu kurz, um auswählen und zusammenfassen zu können.`
          })
      }
      const text = plainText(t.instruction)
      if (TRANSLATE.test(text)) {
        out.push({
          kind: 'mediation',
          message: `${label}: Die Aufgabe verlangt eine Übersetzung. Sprachmittlung gibt den Inhalt sinngemäß und adressatengerecht wieder.`
        })
      }
      // Hilfen zum deutschen Text gehören in die Zielsprache: Die Lernenden verstehen das Deutsche,
      // ihnen fehlen die zielsprachlichen Wörter für die Wiedergabe.
      for (const text of german) {
        const germanGloss = text.glossary.filter((g) => looksGerman(g.explanation))
        if (germanGloss.length) {
          out.push({
            kind: 'mediation',
            message: `${label}: Die Worterklärung zu „${germanGloss[0].term}" ist auf Deutsch. Stattdessen die Entsprechung auf ${meta.subjectLabel} angeben – gebraucht werden die zielsprachlichen Wörter, nicht die Bedeutung des deutschen Ausdrucks.`
          })
        }
      }
      const brief = t.brief
      const missing = [
        !brief?.situation ? 'Situation' : '',
        !brief?.audience ? 'Adressat' : '',
        !brief?.textType ? 'Textsorte' : '',
        !brief?.purpose ? 'Zweck' : ''
      ].filter(Boolean)
      if (missing.length)
        out.push({
          kind: 'mediation',
          message: `${label}: Es fehlt die Situierung (${missing.join(', ')}). Ohne Adressat und Textsorte ist keine Sprachmittlung möglich.`
        })
      if (!['lines', 'space'].includes(t.answer.kind) && !t.parts.length) {
        out.push({ kind: 'mediation', message: `${label}: Sprachmittlung ist eine Schreibaufgabe – der Antwortbereich sollte Schreiblinien sein.` })
      }
      if (!t.solution.trim()) out.push({ kind: 'mediation', message: `${label}: Es fehlt der Erwartungshorizont mit den erwarteten Inhaltspunkten.` })
      /*
       * Gemeldet von der Lehrkraft (24.09.2026): Auf dem Lösungsblatt einer Sprachmittlung
       * standen nur Kriterien und „Dinge, die Schüler beachten sollten" – kein Beispieltext.
       *
       * Beim Korrigieren einer Sprachmittlung reicht eine Kriterienliste nicht: Erst an einem
       * ausformulierten Text sieht man, welche Auslassungen vertretbar sind und wo die
       * Wiedergabe in Übersetzung umschlägt.
       */
      if (!t.brief?.model?.trim())
        out.push({
          kind: 'mediation',
          message: `${label}: Es fehlt der ausformulierte Mustertext für das Lösungsblatt – Kriterien allein zeigen nicht, wie eine gute Wiedergabe klingt.`
        })
      else if (inFalscherSprache(plainText(t.brief.model), zielsprache))
        out.push({
          kind: 'mediation',
          message: `${label}: Der Mustertext steht auf Deutsch. Die Sprachmittlung wird in der Zielsprache verfasst – sonst lässt sich eine Abgabe nicht damit vergleichen.`
        })
      if (!t.brief?.expected?.length)
        out.push({ kind: 'mediation', message: `${label}: Es fehlt der Erwartungshorizont mit Beispiellösungen und Punkten je Inhaltspunkt.` })
      out.push(...contextWarnings(t, 'mediation', label, meta))
      if (meta.instructionsInGerman === false && /[äöüß]/i.test(text.replace(/[„“]/g, ''))) {
        out.push({ kind: 'mediation', message: `${label}: Die Arbeitsanweisung sollte in der Zielsprache stehen; nur der Ausgangstext ist auf Deutsch.` })
      }
    })
  return out
}

/**
 * Kontextbindung und Umfangsangabe – gilt für Sprachmittlung und Schreiben gleichermaßen.
 * Die Arbeitsanweisung erzählt die Situation; eine Wortzahl steht nur dort, wo sie gewünscht ist.
 */
function contextWarnings(t: TaskBlock, kind: 'mediation' | 'writing', label: string, meta: WorksheetMeta): DidacticWarning[] {
  const out: DidacticWarning[] = []
  const instruction = plainText(t.instruction)
  const situation = plainText(t.brief?.situation ?? '')
  /*
   * Die Situation darf in der Arbeitsanweisung ODER im Vorspann stehen – gefordert ist, dass
   * sie ueberhaupt da ist. Beides zu verlangen hatte zur Folge, dass sie ZWEIMAL dastand.
   */
  if (!isContextualized(instruction) && !isContextualized(situation)) {
    out.push({
      kind,
      message: `${label}: Die Aufgabe ist nicht in eine Situation eingebettet. Zwei bis drei Sätze sollten erzählen, wer schreibt, aus welchem Anlass und an wen – z. B. „Your friend from England has been telling you about extreme sports. You have found this article and want to write him an email …“.`
    })
  }
  /*
   * Und der umgekehrte Fall, den die Lehrkraft am 24.09.2026 gemeldet hat: Die Situation
   * steht im Vorspann UND noch einmal in der Arbeitsanweisung. Auf dem Blatt liest sich das
   * wie zwei Aufgaben, und die Lernenden suchen den Unterschied.
   */
  const doppelung = situation ? doppeltSituiert(situation, instruction) : 0
  if (doppelung > DOPPELUNG_GRENZE) {
    out.push({
      kind,
      message: `${label}: Die Situation steht zweimal – im Vorspann und noch einmal in der Arbeitsanweisung (${Math.round(doppelung * 100)} % wörtlich gleich). Der Vorspann erzählt die Lage, die Arbeitsanweisung nennt nur den Auftrag.`
    })
  }
  if (!meta.wordLimit && WORD_COUNT.test(instruction)) {
    out.push({ kind, message: `${label}: Die Arbeitsanweisung nennt eine Wortzahl. Die Wortvorgabe ist für dieses Blatt ausgeschaltet.` })
  }
  if (meta.wordLimit && !WORD_COUNT.test(instruction)) {
    out.push({ kind, message: `${label}: Die Wortvorgabe ist eingeschaltet, die Arbeitsanweisung nennt aber keine Wortzahl.` })
  }
  return out
}

/** Schreiben: Situation statt Thema, Umfang und Kriterien angegeben. */
export function checkWriting(sheet: Sheet, meta: WorksheetMeta): DidacticWarning[] {
  // Die Sprache, in der die Lernenden schreiben – und damit auch der Mustertext
  const zielsprache = subjectById(meta.subjectId).foreignLanguage ?? 'de'
  const out: DidacticWarning[] = []
  tasks(sheet)
    .filter((t) => t.skill === 'writing')
    .forEach((t, i) => {
      const label = `Schreibaufgabe ${i + 1}`
      const brief = t.brief
      const missing = [!brief?.audience ? 'Adressat' : '', !brief?.textType ? 'Textsorte' : '', !brief?.purpose ? 'Zweck' : ''].filter(Boolean)
      if (missing.length)
        out.push({ kind: 'writing', message: `${label}: Es fehlt die Situierung (${missing.join(', ')}). Eine reine Themenangabe genügt nicht.` })
      // words ist der Planungswert für Schreibraum und Erwartungshorizont – auch ohne Wortvorgabe nötig
      if (!brief?.words)
        out.push({ kind: 'writing', message: `${label}: Es fehlt der geplante Umfang (Anzahl der Wörter) für Schreibraum und Erwartungshorizont.` })
      out.push(...contextWarnings(t, 'writing', label, meta))
      if (brief?.words && t.answer.kind === 'lines') {
        const needed = Math.round(brief.words / 10)
        if (t.answer.count < needed)
          out.push({
            kind: 'writing',
            message: `${label}: ${t.answer.count} Schreiblinien reichen für ${brief.words} Wörter nicht – nötig sind etwa ${needed}.`
          })
      }
      if (!brief?.criteria.length) out.push({ kind: 'writing', message: `${label}: Es fehlen die Bewertungskriterien (Inhalt, Textsorte, Sprache).` })

      /*
       * Erwartungshorizont: Er entsteht nicht immer vollständig.
       *
       * In einem Durchlauf mit echter KI kamen zu jedem Inhaltspunkt ein übergeordnetes
       * Kriterium und eine Punktzahl – aber KEINE Beispiellösungen. Ohne die steht beim
       * Korrigieren nur die Anforderung da, und man ahnt nicht, was fehlt: Das sieht nach
       * einem dürftigen Erwartungshorizont aus, ist aber eine Lücke in der Erzeugung.
       */
      const erwartet = brief?.expected ?? []
      if (!erwartet.length) {
        out.push({ kind: 'writing', message: `${label}: Es fehlt der Erwartungshorizont – zu jedem Inhaltspunkt ein Kriterium mit Punktzahl.` })
      } else {
        if (erwartet.length < (brief?.points.length ?? 0)) {
          out.push({
            kind: 'writing',
            message: `${label}: Der Erwartungshorizont deckt ${erwartet.length} von ${brief?.points.length} Inhaltspunkten ab.`
          })
        }
        const ohneBeispiel = erwartet.filter((e) => !e.examples.length).length
        if (ohneBeispiel)
          out.push({
            kind: 'writing',
            message: `${label}: ${ohneBeispiel} von ${erwartet.length} Zeilen des Erwartungshorizonts haben keine Beispiellösung. Das Kriterium allein sagt nicht, was zählt.`
          })
        const ohnePunkte = erwartet.filter((e) => !e.points).length
        if (ohnePunkte) out.push({ kind: 'writing', message: `${label}: ${ohnePunkte} Zeilen des Erwartungshorizonts tragen keine Punktzahl.` })
      }
      if (!brief?.model) out.push({ kind: 'writing', message: `${label}: Es fehlt der Mustertext für das Lösungsblatt.` })
      else if (inFalscherSprache(plainText(brief.model), zielsprache))
        out.push({
          kind: 'writing',
          message: `${label}: Der Mustertext steht auf Deutsch. Die Schreibaufgabe wird in der Zielsprache verfasst – sonst lässt sich eine Abgabe nicht damit vergleichen.`
        })
    })

  /*
   * Sprachliches Gerüst: angefordert, aber nicht entstanden.
   *
   * Die Lehrkraft hat es in Schritt 1 eingeschaltet. Fehlt es dann still, sucht sie es auf
   * dem Blatt und hält die Einstellung für kaputt.
   */
  const willGeruest = phraseSheetModus(meta) !== 'aus'
  const hatSchreibaufgabe = tasks(sheet).some((t) => t.skill === 'writing')
  if (willGeruest && hatSchreibaufgabe && !sheet.blocks.some((b) => b.type === 'phrases')) {
    out.push({ kind: 'writing', message: 'Das sprachliche Gerüst ist eingeschaltet, aber kein Baustein „Nützliche Ausdrücke" entstanden.' })
  }
  return out
}

/** Hörverstehen: Skript vorhanden, Aufgaben danach und während des Hörens lösbar. */
export function checkListening(sheet: Sheet): DidacticWarning[] {
  const out: DidacticWarning[] = []
  const audios = sheet.blocks.filter((b): b is AudioBlock => b.type === 'audio')
  audios.forEach((a, i) => {
    const label = `Hörtext ${i + 1}`
    const words = plainText(a.transcript).split(/\s+/).filter(Boolean).length
    if (words < 40) out.push({ kind: 'listening', message: `${label}: Das Skript fehlt oder ist mit ${words} Wörtern zu kurz.` })
    if (a.plays < 2) out.push({ kind: 'listening', message: `${label}: Hörtexte werden in der Regel zweimal abgespielt.` })
    if (!a.beforeListening.trim()) out.push({ kind: 'listening', message: `${label}: Es fehlt der Hinweis vor dem Hören (worauf zu achten ist).` })
    if (!sheet.blocks.some((b) => b.type === 'task' && b.skill === 'listening' && indexOf(sheet, b) > indexOf(sheet, a))) {
      out.push({ kind: 'listening', message: `${label}: Nach dem Hörtext folgt keine Aufgabe zum Hörverstehen.` })
    }
  })
  tasks(sheet)
    .filter((t) => t.skill === 'listening')
    .forEach((t, i) => {
      const label = `Höraufgabe ${i + 1}`
      const audio = audios.find((a) => indexOf(sheet, a) < indexOf(sheet, t))
      if (!audio) out.push({ kind: 'listening', message: `${label}: Die Aufgabe steht vor dem Hörtext oder es gibt keinen.` })
      const kinds = [t.answer.kind, ...t.parts.map((p) => p.answer.kind)]
      if (!kinds.some((k) => WHILE_LISTENING.includes(k))) {
        out.push({
          kind: 'listening',
          message: `${label}: Während des Hörens lässt sich kein zusammenhängender Text schreiben – besser ankreuzen, zuordnen oder eine Tabelle ergänzen.`
        })
      }
    })
  return out
}

/** Bausteine, die auf einem Sprachmittlungs- bzw. Schreibblatt erlaubt sind */
const FOCUS_BLOCKS: Record<'mediation' | 'writing', string[]> = {
  mediation: ['text', 'task'],
  writing: ['text', 'task']
}

/**
 * Sprachmittlung und Schreiben füllen ein ganzes Blatt mit einer einzigen Aufgabe:
 * nur der Ausgangstext und der eine Auftrag, sonst nichts. Alles Weitere lenkt vom
 * eigentlichen Schreibprodukt ab und zerlegt die Aufgabe.
 */
export function checkSkillFocus(sheet: Sheet, meta: WorksheetMeta): DidacticWarning[] {
  const focus = meta.skillFocus
  if (focus !== 'mediation' && focus !== 'writing') return []
  const name = focus === 'mediation' ? 'Sprachmittlung' : 'Schreiben'
  const out: DidacticWarning[] = []
  const list = tasks(sheet)
  if (list.length > 1) {
    out.push({ kind: focus, message: `Schwerpunkt ${name}: ${list.length} Aufgaben – vorgesehen ist genau eine Aufgabe, dazu nur der Ausgangstext.` })
  }
  const extra = sheet.blocks.filter((b) => !FOCUS_BLOCKS[focus].includes(b.type))
  if (extra.length) {
    out.push({
      kind: focus,
      message: `Schwerpunkt ${name}: zusätzliche Bausteine (${[...new Set(extra.map((b) => b.type))].join(', ')}) – das Blatt enthält nur den Text und die eine Aufgabe.`
    })
  }
  const texts = sheet.blocks.filter((b) => b.type === 'text')
  if (texts.length > 1) out.push({ kind: focus, message: `Schwerpunkt ${name}: ${texts.length} Textbausteine – einer genügt.` })
  if (list.some((t) => t.parts.length))
    out.push({ kind: focus, message: `Schwerpunkt ${name}: Die Aufgabe ist in Teilaufgaben zerlegt – sie bleibt ein einziger Arbeitsauftrag.` })
  return out
}

/** Alle Fremdsprachenprüfungen zusammen (nur für Fremdsprachenfächer aufrufen). */
export function checkLanguageSkills(sheet: Sheet, meta: WorksheetMeta): DidacticWarning[] {
  return [...checkMediation(sheet, meta), ...checkWriting(sheet, meta), ...checkListening(sheet), ...checkSkillFocus(sheet, meta)]
}
