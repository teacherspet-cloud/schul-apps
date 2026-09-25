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
 * Diese Datei ist bewusst frei von Modulwissen: WELCHE Stufe gilt, entscheidet jedes Modul
 * aus seiner eigenen Stufenlogik (Arbeitsblatt und Nachbarn: `stageForGrade` über
 * `arbeitsblatt/didactics/anrede.ts`; LZK: die gewählte Stufe). So laufen Anrede und die
 * übrigen Stufenregeln nie auseinander.
 */

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
  return anrede === 'sie'
    ? [
        'ANREDE (verbindlich, Sekundarstufe II): Deutschsprachige Arbeitsanweisungen, Hilfen, Tipps und Hinweise für die Lernenden stehen in der Sie-Form – „Erläutern Sie …", „Lesen Sie M1 und …", „Begründen Sie Ihre Antwort."',
        '- Beispiele in diesem Auftrag, die in der du-Form stehen („Erkläre …", „Kreuze an …"), überträgst du in die Sie-Form.',
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

/** Du-Imperative, mit denen Arbeitsanweisungen üblicherweise beginnen. */
const DU_IMPERATIVE =
  'Kreuze|Ordne|Ergänze|Lies|Schreib|Schreibe|Verbinde|Übersetze|Setze|Markiere|Nummeriere|Beschrifte|Finde|Unterstreiche|Streiche|Trage|Notiere|Erkläre|Erläutere|Beschreibe|Nenne|Benenne|Fülle|Bilde|Hör|Höre|Sieh|Schau|Beantworte|Vergleiche|Korrigiere|Wähle|Löse|Rechne|Berechne|Bestimme|Ermittle|Gib|Nimm|Arbeite|Merke|Überprüfe|Prüfe|Bewerte|Beurteile|Begründe|Belege|Zitiere|Deute|Denk|Denke|Tausche|Stelle|Präsentiere|Sprich|Lege|Zeichne|Skizziere|Suche|Achte|Nutze|Formuliere|Fasse|Lerne|Wiederhole|Vervollständige|Erstelle|Entwickle|Gestalte|Überlege|Sammle|Bringe|Übertrage|Halte|Sortiere|Zähle|Kläre|Untersuche|Entscheide|Recherchiere|Erinnere|Mach|Mache|Antworte|Ersetze|Leite|Wende|Zeige|Gliedere|Charakterisiere|Analysiere|Interpretiere|Diskutiere|Erörtere|Überführe|Verfasse|Setz|Kennzeichne|Konstruiere|Beweise|Widerlege|Vermute|Schätze|Miss|Führe'

/** Satzanfang: Textbeginn, nach Satzzeichen, nach „a)" oder nach einer öffnenden Klammer */
const ANFANG = String.raw`(?:^|[.!?:;]\s+|\n\s*|[a-z0-9]\)\s+|\(\s*|[-–•]\s+)`

const DU_WORT = /\b(du|dich|dir|dein|deine|deinen|deinem|deiner|deines|Du|Dich|Dir|Dein|Deine|Deinen|Deinem|Deiner|Deines)\b/
const DU_IMPERATIV = new RegExp(`${ANFANG}(${DU_IMPERATIVE})\\b(?!\\s+(?:Sie|wir)\\b)`)
/** Im Satz: „… und begründe …", „…, dann vergleiche …" */
const DU_IMPERATIV_KLEIN = new RegExp(`\\s(?:und|oder|dann)\\s+(${DU_IMPERATIVE.toLowerCase()})\\b(?!\\s+(?:Sie|wir)\\b)`)

/**
 * „Sie" und „Ihr…" als Anrede: GROSS geschrieben und NICHT am Satzanfang. Mitten im Satz ist
 * das großgeschriebene „Sie" immer die Höflichkeitsform; am Satzanfang meint es oft „sie"
 * (Plural), deshalb zählt dort nur die Verbindung Verb + Sie („Erläutern Sie").
 */
const SIE_IM_SATZ = /[\p{Ll},]\s+(Sie|Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)\b/u
const SIE_IMPERATIV = new RegExp(`${ANFANG}(\\p{Lu}\\p{Ll}+(?:en|ern|eln))\\s+Sie\\b`, 'u')

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
      ? (duWort ?? DU_IMPERATIV.exec(t)?.[1] ?? DU_IMPERATIV_KLEIN.exec(t)?.[1])
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
