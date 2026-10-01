/**
 * Anrede der Lernenden auf dem MATERIAL (Paket 8b, Entscheidung der Lehrkraft 25.09.2026).
 *
 * Die Regel: Deutschsprachige Texte für Schülerinnen und Schüler der Sekundarstufe II werden
 * gesiezt („Erläutern Sie …"), in der Primarstufe und der Sekundarstufe I geduzt („Erkläre …").
 * Fremdsprachige Arbeitsanweisungen sind nicht betroffen – sie folgen den Gepflogenheiten
 * der Sprache.
 *
 * Bis dahin stand die Regel nur im Arbeitsblatt-Auftrag. Grammatiktest, Vokabeltest (Latein)
 * und die Lernzielkontrolle hatten eigene oder gar keine Regeln, und die festen Texte der App
 * („Das lernst du", „Nimm eine Karte erst, wenn du …") duzten auch in der Oberstufe.
 *
 * Diese Datei ist bewusst frei von Stufenwissen: WELCHE Stufe gilt, entscheidet jedes Modul
 * aus seiner eigenen Stufenlogik (Arbeitsblatt und Nachbarn: `gehoertZurSekII` über
 * `arbeitsblatt/didactics/anrede.ts`; LZK: die gewählte Stufe). Die Verben für die Prüfung
 * kommen aus den Operatorenlisten der Module (shared/anredeVerben.ts).
 */

import { DOPPELDEUTIG, duImperativFormen, NACH_NOMEN } from './anredeVerben'
import { operatorSatzbauRegel } from '@shared/operatoren/satzbau'

export type Anrede = 'du' | 'sie'

/** Stufe → Anrede. Nur die Sekundarstufe II wird gesiezt. */
export const anredeFuerStufe = (stufe: 'primar' | 'sek1' | 'sek2'): Anrede => (stufe === 'sek2' ? 'sie' : 'du')

/**
 * Die Regel für den KI-Auftrag.
 *
 * Der zweite Satz ist der wichtigere: Die Aufträge enthalten viele Beispiele in der du-Form
 * („Sieh dir Bild 2 an …", „Erinnere dich: …") – und manche in der Sie-Form („Analysieren
 * Sie das Wahlplakat M1 …"). Ein Beispiel wirkt auf die KI stärker als eine Regel. Statt jedes
 * Beispiel zweimal zu führen, sagt der Auftrag ausdrücklich, dass sie umzuformen sind.
 */
export function anredeRegel(anrede: Anrede): string {
  return [anredeRegelText(anrede), operatorSatzbauRegel(anrede)].join('\n')
}

/*
 * Satzbau der Operatoren (01.10.2026): Beim Umformen in die Sie-Form entstand „Zusammenfassen Sie
 * anhand von M1 …". Die Regel mit Beispielen trennbarer Verben steht deshalb immer bei der Anrede.
 */
function anredeRegelText(anrede: Anrede): string {
  return anrede === 'sie'
    ? [
        'ANREDE (verbindlich, Sekundarstufe II): Deutschsprachige Arbeitsanweisungen, Hilfen, Tipps und Hinweise für die Lernenden stehen in der Sie-Form – „Erläutern Sie …", „Lesen Sie M1 und …", „Begründen Sie Ihre Antwort."',
        '- Beispiele in diesem Auftrag, die in der du-Form stehen („Erkläre …", „Kreuze an …"), überträgst du in die Sie-Form',
        '- Wörtliche Zitate, Quellentexte, Rollentexte, Dialoge und Mustertexte behalten ihre eigene Anrede. Fremdsprachige Arbeitsanweisungen folgen den Gepflogenheiten ihrer Sprache.'
      ].join('\n')
    : [
        'ANREDE (verbindlich, Sekundarstufe I): Deutschsprachige Arbeitsanweisungen, Hilfen, Tipps und Hinweise für die Lernenden stehen in der du-Form – „Erkläre …", „Lies M1 und …", „Begründe deine Antwort."',
        '- Beispiele in diesem Auftrag, die in der Sie-Form stehen („Analysieren Sie …", „Fassen Sie … zusammen"), überträgst du in die du-Form.',
        '- Wörtliche Zitate, Quellentexte, Rollentexte, Dialoge und Mustertexte behalten ihre eigene Anrede. Fremdsprachige Arbeitsanweisungen folgen den Gepflogenheiten ihrer Sprache.'
      ].join('\n')
}

/**
 * Feste Texte, die die App selbst auf das Schülermaterial schreibt – in beiden Formen.
 *
 * An einer Stelle gesammelt, damit eine Wache prüfen kann, dass jede Form wirklich die ihre
 * ist (tests/anredeMaterial.test.ts), und damit ein neuer Text nicht nur in einer Form entsteht.
 */
export const ANREDE_TEXTE = {
  /** Überschrift des Lernziel-Kastens */
  lernziele: { du: 'Das lernst du', sie: 'Das lernen Sie' },
  /** Hinweis über dem Hilfsblatt „Useful phrases" */
  wendungen: { du: 'Diese Wendungen helfen dir bei den Aufgaben.', sie: 'Diese Wendungen helfen Ihnen bei den Aufgaben.' },
  /** Hinweis über den Tipp- und Hilfekarten */
  hilfekarten: {
    du: 'Nimm eine Karte erst, wenn du allein nicht weiterkommst – und immer nur die nächste.',
    sie: 'Nehmen Sie eine Karte erst, wenn Sie allein nicht weiterkommen – und immer nur die nächste.'
  },
  /** Abspielzahl am Hörtext, wenn das Hören nicht Prüfgegenstand ist (didactics/audioRules.ts) */
  anhoeren: { du: 'so oft anhören, wie du möchtest', sie: 'so oft anhören, wie Sie möchten' },
  /** Richtig/Falsch mit Textbeleg (shared/evidenceInstruction.ts) */
  textbeleg: {
    du: 'Kreuze an und belege deine Antwort durch ein kurzes Zitat aus dem Text. Verzichte auf Zeilenangaben.',
    sie: 'Kreuzen Sie an und belegen Sie Ihre Antwort durch ein kurzes Zitat aus dem Text. Verzichten Sie auf Zeilenangaben.'
  }
} as const satisfies Record<string, Record<Anrede, string>>

export const anredeText = (schluessel: keyof typeof ANREDE_TEXTE, anrede: Anrede): string => ANREDE_TEXTE[schluessel][anrede]

// ---------- Prüfung ----------

/*
 * Die Prüfung ist eine HEURISTIK und bewusst eng gefasst: Eine Wache, die bei jeder zweiten
 * Aufgabe anschlägt, wird überlesen. Sie prüft nur Texte, die die Lernenden ansprechen
 * (Arbeitsanweisungen, Hilfen) – nie Material. Und sie meldet nur; korrigiert wird nichts,
 * weil ein automatisch umgeformter Satz leicht schief wird.
 */

/** Satzanfang: Textbeginn, nach Satzzeichen, nach „a)" oder nach einer öffnenden Klammer */
const ANFANG = String.raw`(?:^|[.!?:;]\s+|\n\s*|[a-z0-9]\)\s+|\(\s*|[-–•]\s+)`

/*
 * du-Imperative (Paket 8b, erweitert): nicht mehr aus einer festen Liste, sondern regelhaft aus
 * allen Operatoren der App und einem Grundwortschatz gebildet (shared/anredeVerben.ts). So fällt
 * auch „Erörtere", „Skizziere", „Entwirf" oder „Nimm Stellung" auf.
 */
const WORT_AM_ANFANG = new RegExp(String.raw`${ANFANG}(\p{Lu}\p{Ll}*)(?![\p{L}])`, 'gu')
/** Im Satz: „… und begründe …", „…, dann vergleiche …", „…, markiere …" */
const WORT_IM_SATZ = /(?:\s(?:und|oder|dann|danach|anschließend|zuerst|zunächst|schließlich|abschließend|bitte|sowie)\s+|,\s+)(\p{Ll}+)(?![\p{L}])/gu

/** Das Wort nach der Fundstelle (für die doppeldeutigen Formen) */
const naechstesWort = (t: string, ab: number): string => /^\s+([^\s.,;:!?]+)/u.exec(t.slice(ab))?.[1] ?? ''

/**
 * Ist das Wort an dieser Stelle ein du-Imperativ? Doppeldeutige Formen („Teile", „Frage",
 * „Werte") nur, wenn ein kleingeschriebenes Wort folgt, das nicht zu einem Nomen gehört:
 * „Teile den Text" ja, „Teile der Bevölkerung" und „Frage 3:" nein.
 */
function istDuImperativ(wort: string, t: string, ende: number): boolean {
  const gross = wort.charAt(0).toUpperCase() + wort.slice(1)
  if (!duImperativFormen().has(gross)) return false
  const danach = naechstesWort(t, ende)
  // „Erläutern Sie", „Lasst uns" – keine du-Form
  if (danach === 'Sie' || danach === 'wir') return false
  if (!DOPPELDEUTIG.has(gross)) return true
  return /^\p{Ll}/u.test(danach) && !NACH_NOMEN.has(danach)
}

function duImperativIn(t: string): string | null {
  for (const m of t.matchAll(WORT_AM_ANFANG)) {
    if (istDuImperativ(m[1], t, m.index! + m[0].length)) return m[1]
  }
  for (const m of t.matchAll(WORT_IM_SATZ)) {
    // nach dem Komma nur längere Formen – „…, male …" ist zu unsicher
    if (m[0].startsWith(',') && (m[1].length < 5 || DOPPELDEUTIG.has(m[1].charAt(0).toUpperCase() + m[1].slice(1)))) continue
    if (istDuImperativ(m[1], t, m.index! + m[0].length)) return m[1]
  }
  return null
}

/**
 * du, dich, dir, dein…, euch, euer… als Anrede – dazu Verbformen, die es NUR in der 2. Person
 * gibt („kannst", „bist", „habt", „seid"). „ihr" allein nicht: meist ist es das besitzanzeigende
 * „ihr Vater"; als Anrede zählt es nur hinter einem Verb auf -t („Arbeitet ihr zu zweit").
 */
const DU_WORT =
  /(?<![\p{L}])(du|dich|dir|dein|deine|deinen|deinem|deiner|deines|euch|euer|eure|euren|eurem|eurer|eures|Du|Dich|Dir|Dein|Deine|Deinen|Deinem|Deiner|Deines|Euch|Euer|Eure|Euren|Eurem|Eurer|Eures)(?![\p{L}])/u
const DU_VERB = /(?<![\p{L}])(bist|hast|kannst|musst|sollst|darfst|willst|wirst|weißt|möchtest|seid|habt|könnt|müsst|dürft|sollt|wollt|wisst)(?![\p{L}])/u
const IHR_ANREDE = new RegExp(String.raw`${ANFANG}((?:\p{Lu}\p{Ll}+t)\s+ihr|Ihr\s+\p{Ll}+t)(?![\p{L}])(?!\s+\p{Lu})`, 'u')

/**
 * „Sie" und „Ihr…" als Anrede: GROSS geschrieben und NICHT am Satzanfang. Mitten im Satz ist
 * das großgeschriebene „Sie" immer die Höflichkeitsform; am Satzanfang meint es oft „sie"
 * (Plural), deshalb zählt dort nur die Verbindung Verb + Sie („Erläutern Sie"). Die Sie-Form
 * braucht keine Verbliste: Infinitiv + „Sie" am Satzanfang ist eindeutig, auch bei seltenen
 * Operatoren („Skizzieren Sie", „Nehmen Sie Stellung", „Setzen Sie … ein").
 */
const SIE_IM_SATZ = /[\p{Ll},]\s+(Sie|Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)(?![\p{L}])/u
const SIE_IMPERATIV = new RegExp(String.raw`${ANFANG}(\p{Lu}\p{Ll}+(?:en|ern|eln))\s+Sie(?![\p{L}])`, 'u')

/**
 * Entfernt, was die Lernenden NICHT anspricht: Anführungen („…", "…", »…«, ‚…'), weil dort
 * Zitate, Titel oder Beispielsätze stehen, sowie Formeln.
 */
function ohneZitate(text: string): string {
  return text
    .replace(/„[^“”"]*[“”"]/g, ' ')
    .replace(/»[^«]*«/g, ' ')
    .replace(/‚[^‘’']*[‘’']/g, ' ')
    .replace(/"[^"]*"/g, ' ')
    .replace(/\$[^$]*\$/g, ' ')
    .replace(/[*_]/g, '')
}

/**
 * Findet die falsche Anrede in einem deutschen Text, der die Lernenden anspricht.
 * Gibt die Fundstelle zurück („Erkläre", „Ihre") oder null.
 */
export function falscheAnrede(text: string, soll: Anrede, fach?: { fremdsprache?: string }): string | null {
  const t = ohneZitate(text)
  if (!t.trim()) return null
  // Französisch mit deutschen Anweisungen: „Setze du, de la oder des ein" ist kein Duzen
  const duWort = fach?.fremdsprache === 'fr' ? null : DU_WORT.exec(t)?.[1]
  const treffer =
    soll === 'sie'
      ? (duWort ?? DU_VERB.exec(t)?.[1] ?? IHR_ANREDE.exec(t)?.[1] ?? duImperativIn(t))
      : SIE_IMPERATIV.exec(t)
        ? `${SIE_IMPERATIV.exec(t)![1]} Sie`
        : SIE_IM_SATZ.exec(t)?.[1]
  return treffer ?? null
}

/** Die Meldung für die Lehrkraft – gleich formuliert in allen Modulen. */
export function anredeMeldung(ort: string, fund: string, soll: Anrede): string {
  return soll === 'sie'
    ? `${ort}: „${fund}" – in der Sekundarstufe II werden die Lernenden gesiezt („Erläutern Sie …").`
    : `${ort}: „${fund}" – in der Sekundarstufe I werden die Lernenden geduzt („Erkläre …").`
}
