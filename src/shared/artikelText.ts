/**
 * Seitenbeiwerk aus dem Fließtext eines Artikels entfernen – regelbasiert, vor jeder KI.
 *
 * Befund der Lehrkraft (01.10.2026) zu einer Klausur mit eigener Internetadresse: Auf dem Blatt
 * stand über dem Text „News / **Shakespeares Werke: Betörend, verstörend** / 10.03.2025 / Wie auf
 * die heutige Zeit geschrieben: … erklärt die LMU-Anglistin Claudia Olk. Aus dem Magazin
 * EINSICHTEN / © © Hermann Bredehorst/Polaris/laif". Nichts davon ist Artikeltext: eine
 * Rubrik, die Schlagzeile, ein Datum, ein Vorspann, der den Artikel nur ankündigt, und ein
 * Bildnachweis.
 *
 * Die Fließtext-Extraktion (main/services/sources/fliesstext.ts) behält kurze Blöcke, wenn sie
 * neben langen Absätzen stehen – so bleiben Zwischenüberschriften erhalten, aber eben auch
 * Rubrik, Datum und Bildnachweis direkt über dem ersten Absatz. Diese Datei räumt danach auf:
 *
 * - Schlagzeile → Titel des Materials (M1), nicht Teil des Textes,
 * - Datum, Verfasserzeile, „Aus dem Magazin …" → Quellenangabe, nicht Teil des Textes,
 * - Rubriken, Bildnachweise (©, Foto:, Bild:), Teilen-/Drucken-/Newsletter-Knöpfe, „Mehr zum
 *   Thema", Brotkrumen, Cookie-Hinweise → weg,
 * - ein Vorspann, der den Artikel nur ankündigt oder wiederholt → weg.
 *
 * Danach prüft die KI den gewählten Ausschnitt noch einmal („nur Artikeltext?") – zweite Stufe in
 * arbeitsblatt/generation/zuschnitt.ts. Die Regeln hier sind bewusst vorsichtig: Was sie
 * entfernen, ist sicher kein Artikeltext; im Zweifel bleibt eine Zeile stehen.
 *
 * Liegt in src/shared, weil Hauptprozess und Oberfläche dieselben Regeln brauchen.
 */

export interface Artikel {
  /** der bereinigte Fließtext, Absätze durch Leerzeile getrennt */
  text: string
  /** Schlagzeile des Artikels, falls erkannt */
  titel?: string
  /** Erscheinungsdatum, wie es auf der Seite stand */
  datum?: string
  /** Verfasser aus einer Verfasserzeile („Von …", „Text: …") */
  autor?: string
  /** Publikationsort aus „Aus dem Magazin …", „Erschienen in …" */
  medium?: string
  /** entfernte Zeilen – für das Protokoll der Lehrkraft */
  entfernt: string[]
}

const woerter = (s: string): string[] => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
const ohneFett = (s: string): string => s.replace(/^\*\*([\s\S]*)\*\*$/, '$1').trim()
const SATZENDE = /[.!?…:;]["'“”»«)\]]?$/

/** Rubriken und Ressorts, die als eigene Zeile über dem Artikel stehen */
const RUBRIK =
  /^(news|aktuelles|aktuell|neuigkeiten|nachrichten|meldungen|magazin|presse|pressemitteilungen?|blog|startseite|home|ressort|themen|top ?news|latest|features?|opinion|meinung|kommentar|panorama|feuilleton|kultur|wissen|wissenschaft|forschung|campus|interview|reportage|analyse|hintergrund|politik|wirtschaft|gesellschaft|sport|digital|culture|arts|science|world|news ?& ?events|veranstaltungen)$/i

const MONATE =
  'januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember|jan|feb|mär|apr|jun|jul|aug|sep|sept|okt|nov|dez|january|february|march|may|june|july|october|december|mar|oct|dec'

/** Eine Zeile, die nur ein Datum (ggf. mit Uhrzeit und Vorwort) ist */
const DATUM = new RegExp(
  [
    '^(?:(?:stand|veröffentlicht|veroeffentlicht|erschienen|aktualisiert|zuletzt aktualisiert|published|updated|posted)(?: am| on)?:?\\s*)?',
    '(?:(?:mo|di|mi|do|fr|sa|so|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\.?,?\\s+)?',
    `(\\d{1,2}\\.\\s?\\d{1,2}\\.\\s?\\d{2,4}|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}\\.?\\s+(?:${MONATE})\\.?\\s+\\d{4}|(?:${MONATE})\\.?\\s+\\d{1,2},?\\s+\\d{4})`,
    '(?:,?\\s*(?:um\\s*)?\\d{1,2}[:.]\\d{2}(?:\\s*uhr)?)?',
    '(?:\\s*[|·–-]\\s*(?:lesezeit:?\\s*)?\\d{1,2}\\s*(?:min\\.?|minuten|minutes?)(?:\\s*lesezeit)?)?$'
  ].join(''),
  'iu'
)

/** Lesezeit, Teilen, Drucken, Newsletter, Kommentare, „Mehr zum Thema" … */
const WIDGET =
  /^(?:(?:lesezeit:?\s*)?\d{1,2}\s*(?:min\.?|minuten|minutes?)(?:\s*lesezeit|\s*read)?|teilen|artikel teilen|seite teilen|share|share this( article)?|drucken|seite drucken|print|e-?mail|per e-?mail (?:senden|teilen)|facebook|twitter|x|whatsapp|linkedin|pinterest|instagram|threads|mastodon|bluesky|link kopieren|copy link|merken|speichern|newsletter.*|jetzt abonnieren.*|abonnieren|abo|zum newsletter.*|mehr zum thema.*|mehr zu diesem thema.*|weitere artikel.*|weitere informationen:?|das könnte sie auch interessieren.*|das koennte sie auch interessieren.*|lesen sie auch.*|auch interessant.*|related( articles)?.*|read more.*|mehr lesen|weiterlesen|zurück|zurück zur übersicht|zur übersicht|nach oben|top|kommentare?(?:\s*\(\d+\))?|kommentieren|anzeige|werbung|advertisement|audio(?:version)?(?: anhören)?|artikel (?:vor)?lesen lassen|vorlesen|feedback|schlagworte:?.*|tags:?.*|themen:?\s*$)$/i

/** Bildnachweise und Rechtezeilen */
const BILDNACHWEIS =
  /^(?:©|\(c\)|copyright\b|foto(?:s|grafie)?\s*:|bild(?:er|quelle)?\s*:|abbildung\s*:|abb\.\s*\d*:?|grafik\s*:|illustration\s*:|image\s*:|images?\s+(?:by|credit)|photo(?:s|graph)?\s*(?:by|:)|credit\s*:|quelle\s*:\s*(?:dpa|afp|reuters|ap|epd|kna|imago|getty))/i
const AGENTUR =
  /(?:\/laif\b|getty ?images|picture[- ]alliance|imago(?: images)?\b|shutterstock|istock|adobe ?stock|\bdpa\b|\bafp\b|\breuters\b|\/polaris\b|unsplash|pixabay|wikimedia commons)/i

/** Cookie- und Datenschutzhinweise */
const COOKIE = /(cookie|datenschutzerkl|tracking|einwilligung|consent)/i

/** Verfasserzeile: „Von Anna Müller", „Text: …", „By Jane Doe", „Interview: …" */
const VERFASSER =
  /^(?:von|by|text(?:\s+und\s+interview)?|autor(?:in)?|interview|redaktion)\s*:?\s+(\p{Lu}[\p{L}.'-]+(?:\s+(?:und|and|&|von|van|de)?\s*\p{Lu}[\p{L}.'-]+){0,4})\s*$/u

/** „Aus dem Magazin EINSICHTEN", „Erschienen in: …", „Dieser Artikel erschien zuerst in …" */
const HERKUNFT =
  /(?:^|\s)(?:aus dem (?:magazin|heft|forschungsmagazin|journal)|aus der (?:zeitschrift|ausgabe)|erschienen in:?|dieser (?:artikel|beitrag|text) erschien (?:zuerst )?in|first published in|this article (?:first )?appeared in)\s+([^.\n]{2,80})\.?\s*$/i

/** Brotkrumen: „Startseite > Forschung > Shakespeare" */
const BROTKRUMEN = /^(?:[^.!?\n]{1,40}\s*(?:>|›|»|\/|\|)\s*){2,}[^.!?\n]{1,40}$/

/** Ein Vorspann, der den Artikel nur ankündigt („… erklärt die Anglistin X.") */
const ANKUENDIGUNG =
  /(?:\b(?:erklärt|erklaert|erläutert|erlaeutert|berichtet|verrät|verraet|beschreibt|zeigt|sagt|meint|spricht|erzählt|erzaehlt|explains|says|reveals|describes)\b[^.!?]{0,90}[.!?]?\s*$|^im interview\b|^interview mit\b|\bim gespräch mit\b|\bim gespraech mit\b)/i

function istBeiwerk(zeile: string): string | null {
  const z = ohneFett(zeile).trim()
  if (!z) return 'leer'
  const n = woerter(z).length
  if (n <= 3 && RUBRIK.test(z)) return 'Rubrik'
  if (n <= 12 && DATUM.test(z)) return 'Datum'
  if (n <= 8 && WIDGET.test(z)) return 'Seitenelement'
  if (n <= 30 && (BILDNACHWEIS.test(z) || /©/.test(z) || (AGENTUR.test(z) && !SATZENDE.test(z)))) return 'Bildnachweis'
  if (n <= 40 && COOKIE.test(z) && /(akzeptier|zustimm|einverstanden|ablehnen|accept|agree|einstellungen)/i.test(z)) return 'Cookie-Hinweis'
  if (n <= 16 && BROTKRUMEN.test(z)) return 'Brotkrumen'
  return null
}

/**
 * Den Fließtext eines Artikels bereinigen.
 *
 * `seitentitel` ist der Titel der Webseite (aus dem `<title>`); stimmt eine kurze Zeile am Anfang
 * damit überein, ist sie sicher die Schlagzeile.
 */
export function bereinigeArtikeltext(roh: string, opts: { seitentitel?: string } = {}): Artikel {
  const entfernt: string[] = []
  const out: Artikel = { text: '', entfernt }
  // Absätze; einzelne Zeilenumbrüche innerhalb eines Absatzes bleiben Zeilen (Beiwerk steht oft je Zeile)
  const absaetze = roh
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((a) => a.split('\n').map((z) => z.trim()))

  const behalten: string[] = []
  for (const zeilen of absaetze) {
    const rest: string[] = []
    for (const zeile of zeilen) {
      if (!zeile) continue
      const art = istBeiwerk(zeile)
      if (!art) {
        rest.push(zeile)
        continue
      }
      if (art === 'leer') continue
      entfernt.push(`${art}: ${zeile}`)
      if (art === 'Datum') out.datum ??= DATUM.exec(ohneFett(zeile))?.[1] ?? ohneFett(zeile)
    }
    if (!rest.length) continue
    let absatz = rest.join(' ').replace(/\s+/g, ' ').trim()
    // Herkunftszusatz am Ende eines Absatzes („… Claudia Olk. Aus dem Magazin EINSICHTEN")
    const herkunft = HERKUNFT.exec(absatz)
    if (herkunft) {
      out.medium ??= herkunft[0]
        .replace(/^\s*(?:aus dem|aus der|erschienen in:?|dieser \w+ erschien (?:zuerst )?in|first published in|this article (?:first )?appeared in)\s*/i, '')
        .replace(/\.$/, '')
        .trim()
      out.medium = /^(?:magazin|heft|zeitschrift)/i.test(out.medium) ? out.medium : `${/magazin/i.test(herkunft[0]) ? 'Magazin ' : ''}${out.medium}`
      entfernt.push(`Herkunft: ${herkunft[0].trim()}`)
      absatz = absatz.slice(0, herkunft.index).trim()
      if (!absatz) continue
    }
    // Bildnachweis am Absatzende („… im Jahr 1606. © Foto: dpa")
    const credit = /\s(?:©|Foto:|Bild:|Fotos:)\s[^.!?]{1,80}$/.exec(absatz)
    if (credit && SATZENDE.test(absatz.slice(0, credit.index).trim())) {
      entfernt.push(`Bildnachweis: ${credit[0].trim()}`)
      absatz = absatz.slice(0, credit.index).trim()
    }
    const verfasser = VERFASSER.exec(ohneFett(absatz))
    if (verfasser && woerter(absatz).length <= 8) {
      out.autor ??= verfasser[1].trim()
      entfernt.push(`Verfasserzeile: ${absatz}`)
      continue
    }
    behalten.push(absatz)
  }

  // Schlagzeile: die erste kurze Zeile ohne Satzschluss vor dem ersten langen Absatz
  const ersterLanger = behalten.findIndex((a) => woerter(a).length >= 40)
  const kopf = ersterLanger < 0 ? 0 : ersterLanger
  const seitentitel = (opts.seitentitel ?? '').toLowerCase()
  for (let i = 0; i < kopf; i++) {
    const a = behalten[i]
    const z = ohneFett(a)
    const kurz = woerter(z).length <= 16
    const gleichSeitentitel = seitentitel && woerter(z).length >= 2 && seitentitel.includes(z.toLowerCase().slice(0, 40))
    if (kurz && (a.startsWith('**') || !SATZENDE.test(z) || gleichSeitentitel)) {
      out.titel = z.replace(/[.:]$/, '')
      entfernt.push(`Schlagzeile (als Titel verwendet): ${z}`)
      behalten.splice(i, 1)
      break
    }
  }

  /*
   * Vorspann: ein kurzer Absatz vor dem ersten langen, der den Artikel nur ankündigt („… erklärt
   * die Anglistin X") oder dessen Wörter fast alle später noch einmal vorkommen (Wiederholung).
   * Ein echter Einstieg ins Thema bleibt stehen.
   */
  const langIndex = behalten.findIndex((a) => woerter(a).length >= 40)
  for (let i = 0; i >= 0 && i < (langIndex < 0 ? 0 : langIndex + 1) && i < 2; i++) {
    const a = behalten[i]
    if (!a || a.startsWith('**')) continue
    const w = woerter(a)
    if (w.length > 70) break
    const spaeter = new Set(woerter(behalten.slice(i + 1).join(' ')))
    const inhalt = w.filter((x) => x.length > 3)
    const wiederholt = inhalt.length >= 5 && inhalt.filter((x) => spaeter.has(x)).length / inhalt.length >= 0.85
    if (ANKUENDIGUNG.test(a) || wiederholt) {
      entfernt.push(`Vorspann: ${a}`)
      behalten.splice(i, 1)
      i--
    }
  }

  out.text = behalten.join('\n\n').trim()
  return out
}
