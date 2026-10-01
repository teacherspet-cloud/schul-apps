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

/**
 * Bewertungs-, Abstimmungs- und Zählerelemente (01.10.2026): Über einem Artikel stand „Bewertung: 2",
 * und das Material hieß danach „M1 Bewertung: 2". Erfasst Sterne, „4,5 von 5", „(12 Bewertungen)",
 * „Artikel bewerten", „War dieser Artikel hilfreich?", Kommentar-/Like-Zähler.
 */
const BEWERTUNG_MUSTER: RegExp[] = [
  // „Bewertung: 2", „Rating: 4.5/5", „Durchschnittliche Bewertung 3,8", „Votes: 12"
  /^(?:(?:durchschnittliche |gesamt|nutzer|leser)?bewertung(?:en)?|rating(?:s)?|average rating|user rating|votes?|stimmen|sterne|stars?|punkte|score|likes?|gefällt mir|kommentare?|comments?|shares?|aufrufe|views)\s*:?\s*[\d.,/\s()★☆⭐✩✪+-]*(?:sterne|stars?|von \d+|out of \d+|stimmen|votes?|bewertungen|ratings?)?\s*$/iu,
  // „4,5 von 5 Sternen", „4 out of 5 stars", „3.8/5", „(12 Bewertungen)", „12 Kommentare"
  /^\(?\s*\d+(?:[.,]\d+)?\s*(?:\/\s*\d+|von \d+|out of \d+)?\s*(?:sternen?|stars?|bewertungen|ratings?|stimmen|votes?|kommentare?|comments?|likes?|reviews?|rezensionen|punkte)?\s*\)?$/iu,
  // Sternreihen „★★★★☆", „⭐⭐⭐"
  /^[\s★☆⭐✩✪✭✮✯]+(?:\s*\(?\d+(?:[.,]\d+)?\)?)?$/u,
  // Aufforderungen und Fragen des Bewertungswidgets
  /^(?:(?:jetzt |artikel |beitrag |seite |text )?bewerten!?|(?:diesen |den )?(?:artikel|beitrag|text) bewerten|rate (?:this|the) (?:article|post|story))$/iu,
  /^(?:(?:war|ist) (?:dieser|der) (?:artikel|beitrag|text|inhalt) hilfreich|(?:was|is) this (?:article|post|page|content) (?:helpful|useful))\??$/iu,
  /^(?:(?:ja|nein|yes|no)\s*[/|]\s*(?:nein|ja|no|yes)|daumen (?:hoch|runter))$/iu
]
const istBewertung = (z: string): boolean => BEWERTUNG_MUSTER.some((r) => r.test(z))

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
  if (n <= 12 && istBewertung(z)) return 'Bewertung'
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

  /*
   * Schlagzeile: eine kurze Zeile ohne Satzschluss vor dem ersten langen Absatz. Stimmt eine mit
   * dem Seitentitel überein, hat sie Vorrang; Bewertungen, Zähler, Knöpfe, Datum und Rubriken
   * kommen nie in Frage (01.10.2026: „M1 Bewertung: 2").
   */
  const ersterLanger = behalten.findIndex((a) => woerter(a).length >= 40)
  const kopf = ersterLanger < 0 ? 0 : ersterLanger
  const seitentitel = (opts.seitentitel ?? '').toLowerCase()
  const kandidaten: { i: number; z: string; gleich: boolean }[] = []
  for (let i = 0; i < kopf; i++) {
    const a = behalten[i]
    const z = ohneFett(a)
    if (woerter(z).length > 16 || keineSchlagzeile(z)) continue
    const gleich = Boolean(seitentitel) && woerter(z).length >= 2 && seitentitel.includes(z.toLowerCase().slice(0, 40))
    if (a.startsWith('**') || !SATZENDE.test(z) || gleich) kandidaten.push({ i, z, gleich })
  }
  const schlagzeile = kandidaten.find((k) => k.gleich) ?? kandidaten[0]
  if (schlagzeile) {
    out.titel = schlagzeile.z.replace(/[.:]$/, '')
    entfernt.push(`Schlagzeile (als Titel verwendet): ${schlagzeile.z}`)
    behalten.splice(schlagzeile.i, 1)
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

// ---------- Titel des Materials (01.10.2026) ----------

/**
 * Taugt eine Zeile NICHT als Schlagzeile? Bewertungs- und Zählerelemente („Bewertung: 2",
 * „★★★☆☆", „12 Kommentare"), Knöpfe („Teilen"), Datumszeilen, Rubriken, Brotkrumen,
 * Bildnachweise und „Bezeichnung: Zahl"-Zeilen.
 */
export function keineSchlagzeile(zeile: string): boolean {
  const z = ohneFett(zeile).trim()
  const w = woerter(z)
  if (!w.length || w.every((x) => /^\d+$/.test(x))) return true
  if (istBewertung(z) || WIDGET.test(z) || DATUM.test(z) || BROTKRUMEN.test(z) || BILDNACHWEIS.test(z) || /©/.test(z)) return true
  if (w.length <= 3 && RUBRIK.test(z)) return true
  // „Bewertung: 2", „Kommentare: 5", „Lesezeit: 4 Min."
  if (/^[\p{L} ]{2,30}:\s*[\d.,/]+\s*\p{L}{0,10}\.?$/u.test(z)) return true
  // Kurze Zeilen mit Widget-Wörtern („Jetzt bewerten", „Artikel teilen")
  return w.length <= 4 && /(?:bewert|rating|teilen|share|kommentar|comment|gefällt|like)/i.test(z)
}

/** Seitentitel ohne Website-Namen („Shakespeares Werke | LMU München" → „Shakespeares Werke") */
export function ohneSeitenname(t: string): string {
  const teile = t
    .replace(/^(?:webseite|adresse|titel):\s*/i, '')
    .split(/\s+[|–—-]\s+|\s+[|»·]\s*|\s*::\s*/)
    .map((x) => x.trim())
    .filter(Boolean)
  if (!teile.length) return ''
  // Gewöhnlich steht der Titel vorn; ist der vordere Teil nur ein kurzer Name („LMU | Shakespeares Werke: …"), der längste
  const vorn = teile[0]
  if (teile.length > 1 && woerter(vorn).length <= 2) {
    const laengster = [...teile].sort((a, b) => woerter(b).length - woerter(a).length)[0]
    if (woerter(laengster).length >= 3) return laengster
  }
  return vorn
}

const ENTITAETEN: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  bdquo: '„',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  laquo: '«',
  raquo: '»',
  hellip: '…',
  auml: 'ä',
  ouml: 'ö',
  uuml: 'ü',
  Auml: 'Ä',
  Ouml: 'Ö',
  Uuml: 'Ü',
  szlig: 'ß'
}

function htmlZeile(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, c: string) => {
      if (c[0] === '#') {
        const n = c[1].toLowerCase() === 'x' ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10)
        return Number.isFinite(n) ? String.fromCodePoint(n) : m
      }
      return ENTITAETEN[c] ?? m
    })
    .replace(/\s+/g, ' ')
    .trim()
}

/** Inhalt eines <meta>-Tags mit property/name = schluessel (Reihenfolge der Attribute beliebig) */
function metaInhalt(html: string, schluessel: string): string {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0]
    const name = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]
    if (name?.toLowerCase() !== schluessel) continue
    const inhalt = /\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i.exec(tag)
    if (inhalt) return htmlZeile(inhalt[1] ?? inhalt[2] ?? '')
  }
  return ''
}

/**
 * Titel eines Artikels aus dem HTML der Seite (01.10.2026) – in dieser Rangfolge: og:title,
 * twitter:title, <h1> im <article>, erstes <h1>, <title> ohne Website-Namen. Kandidaten, die
 * nach Bewertung, Zähler, Knopf, Datum oder Rubrik aussehen, fallen weg.
 */
export function seitentitelAusHtml(html: string): string {
  const artikel = /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(html)?.[1] ?? ''
  const h1 = (quelle: string): string => htmlZeile(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i.exec(quelle)?.[1] ?? '')
  const kandidaten = [
    ohneSeitenname(metaInhalt(html, 'og:title')),
    ohneSeitenname(metaInhalt(html, 'twitter:title')),
    h1(artikel),
    h1(html),
    ohneSeitenname(htmlZeile(/<title[^>]*>([\s\S]{1,300}?)<\/title>/i.exec(html)?.[1] ?? ''))
  ]
  return kandidaten.find((k) => k && woerter(k).length <= 25 && !keineSchlagzeile(k)) ?? ''
}
