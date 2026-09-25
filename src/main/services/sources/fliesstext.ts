/**
 * Den LESBAREN TEXT aus einer Internetseite herausschneiden.
 *
 * Anlass, nachgemessen am 24.09.2026 mit echten Suchtreffern: Die Websuche fand
 * ausgezeichnete Quellen – bpb.de, Deutschlandfunk, tagesschau.de, goethe.de –, und die
 * Qualitätsprüfung verwarf jede einzelne. Zwei Gründe, beide hausgemacht:
 *
 * 1. Das bisherige Entschlacken machte aus der ganzen Seite EINE Zeile ohne Absätze. Die
 *    Prüfung „enden die Zeilen auf einem Satzzeichen?" hatte damit nichts mehr zu messen und
 *    schlug bei jedem Fund an.
 * 2. Der Text enthielt Navigationsleisten, Cookie-Hinweise und Impressumszeilen. Die Prüfung
 *    „überwiegend Seitenbeiwerk" schlug zu Recht an – nur lag es nicht am Artikel, sondern
 *    daran, dass niemand das Beiwerk entfernt hatte.
 *
 * Das Verfahren folgt jusText (corpus.tools) mit dessen Zahlenwerten: Die Seite wird in
 * Blöcke zerlegt, jeder Block nach Länge, Linkdichte und Stoppwortdichte eingestuft, und nur
 * die guten bleiben. Ein Absatz mit vielen Links und wenigen Stoppwörtern ist fast immer
 * Navigation; ein langer Absatz mit hoher Stoppwortdichte ist fast immer Fließtext.
 *
 * Die Absatzstruktur bleibt erhalten. Das ist kein Beiwerk: Ein Quellentext ohne Absätze ist
 * auf dem Arbeitsblatt eine Bleiwüste, und die Kürzung („streiche ganze Absätze") setzt
 * Absätze voraus.
 */
import { stoppwortSatz } from '@shared/stoppwoerter'

/** Schwellenwerte aus jusText (corpus.tools/wiki/Justext/Algorithm). */
const LENGTH_LOW = 70
const LENGTH_HIGH = 200
const MAX_LINK_DENSITY = 0.2
const STOPWORDS_LOW = 0.3
const STOPWORDS_HIGH = 0.32

/** Bereiche, die nie Artikeltext sind – sie fliegen vor dem Zerlegen heraus. */
const WEG =
  /<(script|style|noscript|nav|header|footer|aside|form|button|select|svg|iframe|figure|template)\b[^>]*>[\s\S]*?<\/\1>|<!--[\s\S]*?-->|<(script|style|link|meta|input|img|source)\b[^>]*\/?>/gi

/** Elemente, die einen Absatz beenden. */
/*
 * OHNE einfangende Klammern – `String.split` mit einem Regex, der Gruppen enthält, fügt die
 * eingefangenen Teile MIT ins Ergebnis ein. Vorher landeten dadurch die Tag-Namen selbst im
 * Text: Zwischen zwei Absätzen stand dann „p", „div" oder „h1". Meist wurden diese
 * Ein-Wort-Stücke als „kurz" wieder aussortiert – verlassen konnte man sich darauf nicht.
 */
const BLOCKENDE = /<\/(?:p|div|section|article|li|ul|ol|tr|table|h[1-6]|blockquote|pre|dd|dt|figcaption)\s*>|<br\s*\/?>|<hr\s*\/?>/gi

export type Einstufung = 'gut' | 'fast' | 'kurz' | 'schlecht'

/**
 * Unsichtbares Zeichen, mit dem eine Zwischenüberschrift markiert wird, bis die Tags weg sind.
 *
 * Gemeldet von der Lehrkraft (24.09.2026) zu einem Zeitungsartikel: „In Zeile 35 ist aus
 * irgendeinem Grund ein abgebrochener Satz ‚Der Körper verhärtet'."
 *
 * Es war kein abgebrochener Satz, sondern eine ZWISCHENÜBERSCHRIFT – der Artikel hatte drei
 * davon. Die Extraktion gab sie als gewöhnlichen Absatz aus, und auf dem Arbeitsblatt stand
 * damit mitten im Text ein Satz ohne Verb. Wer das liest, hält den Originaltext für fehlerhaft.
 */
const UEBERSCHRIFT = '@@H@@'

export interface Block {
  text: string
  /** Zwischenüberschrift des Originals – wird fett gesetzt, nicht als Absatz */
  ueberschrift?: boolean
  /** Anteil der Zeichen, die in einem Verweis stehen */
  linkdichte: number
  stoppdichte: number
  einstufung: Einstufung
}

function entferneTags(html: string): string {
  return entities(html.replace(/<[^>]+>/g, ' '))
    .replace(/[ \t ]+/g, ' ')
    .trim()
}

function entities(s: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    shy: '',
    ndash: '–',
    mdash: '—',
    laquo: '«',
    raquo: '»',
    bdquo: '„',
    ldquo: '“',
    rdquo: '”',
    sbquo: '‚',
    lsquo: '‘',
    rsquo: '’',
    hellip: '…',
    euro: '€',
    szlig: 'ß',
    auml: 'ä',
    ouml: 'ö',
    uuml: 'ü',
    Auml: 'Ä',
    Ouml: 'Ö',
    Uuml: 'Ü'
  }
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : m
    }
    return named[code] ?? named[code.toLowerCase()] ?? m
  })
}

/**
 * Wandelt Zwischenüberschriften in eigene, markierte Absätze um.
 *
 * Eigene Funktion statt einer Zeile in der Kette: Nur so lässt sich nachmessen, ob sie tut,
 * was sie soll. Genau daran hat es hier gefehlt – die Markierung blieb aus, und die Suche
 * nach dem Grund ging durch drei Ebenen.
 */
export function markiereUeberschriften(html: string): string {
  return (
    html
      // 1. Echte Überschriftenelemente
      .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]\s*>/gi, (_t, inhalt: string) => `<p>${UEBERSCHRIFT}${inhalt}${UEBERSCHRIFT}</p>`)
      /*
       * 2. Absätze, die per Klasse als Zwischentitel ausgewiesen sind.
       *
       * Nachgemessen am 24.09.2026 an nachtkritik.de: Dort steht
       * `<p class="text_zwischentitel">Helft dem Tyrannen!</p>` – kein Überschriftenelement.
       * Redaktionssysteme lösen das häufig so.
       */
      .replace(
        /<p[^>]*class="[^"]*(?:zwischentitel|zwischenueberschrift|zwischenüberschrift|subhead|subheading|crosshead|intertitle)[^"]*"[^>]*>([\s\S]*?)<\/p\s*>/gi,
        (_t, inhalt: string) => `<p>${UEBERSCHRIFT}${inhalt}${UEBERSCHRIFT}</p>`
      )
      // 3. Ein kurzer Absatz, der VOLLSTÄNDIG fett gesetzt ist
      .replace(
        /<p[^>]*>\s*<(strong|b)[^>]*>([^<]{1,90})<\/\s*>\s*<\/p\s*>/gi,
        (_t, _tag: string, inhalt: string) => `<p>${UEBERSCHRIFT}${inhalt}${UEBERSCHRIFT}</p>`
      )
  )
}

/** Endet der Text mit einem Satzzeichen? Eine Überschrift tut das meistens nicht. */
const SATZSCHLUSS = /[.!?…:;]["')\]]?$/

/**
 * Zwischenüberschriften, die im Markup nicht als solche ausgewiesen sind.
 *
 * Manche Seiten setzen sie als gewöhnlichen Absatz ohne jede Auszeichnung. Erkennbar bleiben
 * sie an der Gestalt: kurz, ohne Satzzeichen am Ende, und zwischen zwei richtigen Absätzen.
 * Genau so sah der gemeldete Fall aus – „Der Körper verhärtet" stand zwischen zwei langen
 * Absätzen und las sich wie ein abgebrochener Satz.
 *
 * Die Regel greift bewusst nur ZWISCHEN zwei langen Absätzen: Ein kurzer Block am Anfang
 * oder Ende einer Seite ist meist Beiwerk, kein Zwischentitel.
 */
export function erkenneZwischentitel(liste: Block[], behalten: boolean[]): void {
  for (let i = 1; i < liste.length - 1; i++) {
    const b = liste[i]
    if (!behalten[i] || b.ueberschrift) continue
    if (b.text.length > 90 || SATZSCHLUSS.test(b.text)) continue
    const davor = liste
      .slice(0, i)
      .reverse()
      .find((_b, k) => behalten[i - 1 - k])
    const danach = liste.slice(i + 1).find((_b, k) => behalten[i + 1 + k])
    if (davor && danach && davor.text.length > LENGTH_HIGH && danach.text.length > LENGTH_HIGH) b.ueberschrift = true
  }
}

/** Zerlegt die Seite in Blöcke und stuft jeden ein. */
export function bloecke(html: string, sprache = 'de'): Block[] {
  const koerper = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html
  /*
   * Zwischenüberschriften markieren, BEVOR die Tags fallen. Danach lässt sich nicht mehr
   * erkennen, dass ein kurzer Block eine Überschrift war und kein angefangener Satz.
   */
  const sauber = markiereUeberschriften(koerper.replace(WEG, ' '))
  const stopp = stoppwortSatz(sprache)
  const roh = sauber.split(BLOCKENDE).filter((t): t is string => typeof t === 'string')

  const out: Block[] = []
  for (const stueck of roh) {
    const roher = entferneTags(stueck)
    const ueberschrift = roher.includes(UEBERSCHRIFT)
    const text = ueberschrift ? roher.split(UEBERSCHRIFT).join('').trim() : roher
    if (!text) continue
    // Linkdichte am ROHEN Stück messen – nach dem Entfernen der Tags sieht man die Verweise nicht mehr
    const linkText = [...stueck.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => entferneTags(m[1])).join(' ')
    const linkdichte = text.length ? Math.min(1, linkText.length / text.length) : 0
    const woerter = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
    const stoppdichte = woerter.length ? woerter.filter((w) => stopp.has(w)).length / woerter.length : 0
    /*
     * Eine Überschrift wird immer als „kurz" eingestuft, nie nach der Stoppwortdichte
     * bewertet: Überschriften enthalten kaum Stoppwörter und würden sonst als Beiwerk
     * verworfen – obwohl sie den Text gliedern.
     */
    out.push({
      text,
      ueberschrift,
      linkdichte,
      stoppdichte,
      einstufung: ueberschrift ? 'kurz' : einstufen(text, linkdichte, stoppdichte)
    })
  }
  return out
}

/** Kontextfreie Einstufung nach jusText. */
function einstufen(text: string, linkdichte: number, stoppdichte: number): Einstufung {
  if (linkdichte > MAX_LINK_DENSITY) return 'schlecht'
  if (text.length < LENGTH_LOW) return 'kurz'
  if (stoppdichte < STOPWORDS_LOW) return 'schlecht'
  if (stoppdichte > STOPWORDS_HIGH) return text.length > LENGTH_HIGH ? 'gut' : 'fast'
  return 'fast'
}

/**
 * Kontextabhängige Nachbesserung: „kurz" und „fast" richten sich nach ihren Nachbarn.
 *
 * Beiwerk steht neben Beiwerk, und ein kurzer Absatz mitten im Artikel gehört zum Artikel.
 * Genau das ist die zweite Stufe des jusText-Verfahrens – ohne sie fielen Überschriften und
 * kurze Zwischensätze aus dem Text heraus.
 */
export function entscheiden(liste: Block[]): boolean[] {
  const gut = liste.map((b) => b.einstufung === 'gut')
  const behalten = [...gut]
  /*
   * Kurze Seiten haben keinen einzigen langen Absatz, an dem sich die Nachbarn ausrichten
   * koennten – dann bliebe nichts uebrig. In diesem Fall zaehlen die brauchbaren Bloecke
   * ('fast') selbst als Anker. Ohne das lieferte eine Seite mit einem einzigen Absatz
   * nichts, und der Fund waere verloren, obwohl er taugt.
   */
  if (!gut.some(Boolean)) return liste.map((b) => b.einstufung === 'fast')
  for (let i = 0; i < liste.length; i++) {
    if (liste[i].einstufung === 'gut' || liste[i].einstufung === 'schlecht') continue
    // Nächster eindeutig eingestufter Nachbar in beide Richtungen
    let vor: Einstufung = 'schlecht'
    for (let j = i - 1; j >= 0; j--) {
      if (liste[j].einstufung === 'gut' || liste[j].einstufung === 'schlecht') {
        vor = liste[j].einstufung
        break
      }
    }
    let nach: Einstufung = 'schlecht'
    for (let j = i + 1; j < liste.length; j++) {
      if (liste[j].einstufung === 'gut' || liste[j].einstufung === 'schlecht') {
        nach = liste[j].einstufung
        break
      }
    }
    behalten[i] = vor === 'gut' || nach === 'gut'
  }
  return behalten
}

/**
 * Der Artikeltext einer Seite, in Absätzen.
 *
 * Leer, wenn die Seite keinen zusammenhängenden Text enthält – dann war es eine Übersichts-
 * oder Navigationsseite, und das ist eine Antwort, kein Fehler.
 */
export function fliesstext(html: string, sprache = 'de'): string {
  const liste = bloecke(html, sprache)
  const behalten = entscheiden(liste)
  // Zwischentitel, die im Markup nicht ausgezeichnet sind, an ihrer Gestalt erkennen
  erkenneZwischentitel(liste, behalten)
  /*
   * Zwischenüberschriften werden FETT gesetzt (`**…**` ist das Textformat der App). Damit
   * sind sie auf dem Blatt als Überschrift erkennbar statt als Satz, dem das Verb fehlt.
   * Am Wortlaut ändert das nichts – die Prüfung vergleicht nur Wörter.
   */
  const absaetze = liste.filter((_, i) => behalten[i]).map((b) => (b.ueberschrift ? `**${b.text}**` : b.text))
  /*
   * Doppelte Absätze entfernen. Verschachtelte Elemente (ein <p> in einem <div>) erzeugen
   * denselben Text zweimal – einmal aus dem inneren, einmal aus dem äußeren Block.
   */
  const gesehen = new Set<string>()
  const einmalig: string[] = []
  for (const a of absaetze) {
    const schluessel = a.slice(0, 200)
    if (gesehen.has(schluessel)) continue
    gesehen.add(schluessel)
    einmalig.push(a)
  }
  return einmalig.join('\n\n').trim()
}
