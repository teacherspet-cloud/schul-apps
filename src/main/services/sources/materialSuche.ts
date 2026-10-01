/**
 * Suche nach Originalmaterial im Netz – und das Laden des echten Wortlauts.
 *
 * Wunsch der Lehrkraft (24.09.2026): „Hier soll die KI im Hintergrund nach geeigneten
 * Originalmaterialien im Internet suchen."
 *
 * Wichtig ist dabei die Arbeitsteilung. Bisher nannte die KI eine Quelle aus dem Gedächtnis
 * und die App prüfte hinterher nach – dabei entstehen erfundene Fundstellen, weil ein
 * Sprachmodell eine Adresse ebenso flüssig erfindet wie ein Zitat. Jetzt SUCHT und LÄDT die
 * App, und die KI bekommt den tatsächlichen Text vorgelegt. Was sie daraus macht, lässt sich
 * dann Wort für Wort gegen das Original halten (siehe `generation/kuerzung.ts`).
 *
 * Durchsucht werden Archive mit offener Schnittstelle und geklärter Rechtslage. Das offene
 * Netz erreicht die App nicht selbst – dafür ist die Websuche des KI-Anbieters zuständig;
 * deren Fundstellen kommen aber durch `ladeOriginalquelle` und werden damit ebenso geprüft.
 */
import type { GeladeneQuelle, Materialanfrage, Quellentreffer } from '@shared/types'
import { politeFetch } from '../images/politeFetch'
import { begrenzteAntwort, GRENZEN } from '../netz/zieladresse'
import { fetchText, kennungFuer, stripHtml, WIKIMEDIA_UA } from '../images/sources'
import { seitentitelAusHtml } from '@shared/artikelText'

/** Sprachen, für die es eine eigene Wikisource gibt und die in dieser App vorkommen. */
const WIKISOURCE_SPRACHEN = new Set(['de', 'en', 'fr', 'es', 'it', 'la', 'ru', 'pl', 'nl', 'pt'])

/**
 * Eine Suche muss zügig antworten oder ausfallen.
 *
 * Nachgemessen am 24.09.2026: Ein Archiv, das nicht antwortet, hielt mit den üblichen drei
 * Wiederholungen die ganze Suche über zwei Minuten auf. Die Lehrkraft sieht in dieser Zeit
 * nur einen Wartebalken und kann nicht unterscheiden, ob gesucht wird oder nichts da ist.
 */
const SUCHE_MS = 8000
const SUCHE_VERSUCHE = 1

const zaehleWoerter = (text: string): number => (text.match(/[\p{L}\p{N}]+/gu) ?? []).length

function kuerzeAuszug(text: string, zeichen = 320): string {
  const sauber = text.replace(/\s+/g, ' ').trim()
  if (sauber.length <= zeichen) return sauber
  return `${sauber.slice(0, zeichen).replace(/\s+\S*$/, '')} …`
}

// ---------- Wikisource ----------

interface WikiSeite {
  pageid: number
  index?: number
  title: string
  extract?: string
  /** Groesse des Seitenquelltextes in Bytes (prop=info) */
  length?: number
  /** sichtbare Kategorien (prop=categories) */
  categories?: { title: string }[]
}

/** Eine einzelne Suchabfrage an eine Wikisource-Sprachausgabe. */
async function wikisourceAbfrage(lang: string, suche: string, limit: number): Promise<Quellentreffer[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: suche,
    gsrlimit: String(limit),
    gsrnamespace: '0',
    prop: 'extracts|info|categories',
    exlimit: 'max',
    explaintext: '1',
    exchars: '600',
    /*
     * Kategorien mitholen (01.10.2026): Nur an ihnen erkennt man sicher, dass „Friedrich
     * Gundolf" eine Autorenseite (Werkliste) und „Die Musikforschung" das Inhaltsverzeichnis
     * einer Zeitschrift ist. Am Titel sieht man es keiner der beiden an.
     */
    clshow: '!hidden',
    cllimit: 'max'
  })
  const res = await politeFetch(
    `https://${lang}.wikisource.org/w/api.php?${params}`,
    { headers: { 'User-Agent': WIKIMEDIA_UA }, signal: AbortSignal.timeout(SUCHE_MS) },
    SUCHE_VERSUCHE
  )
  if (!res.ok) return []
  const json = (await res.json()) as { query?: { pages?: Record<string, WikiSeite> } }
  return Object.values(json.query?.pages ?? {})
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((p) => ({
      titel: p.title,
      url: `https://${lang}.wikisource.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`,
      herkunft: 'wikisource' as const,
      zeichen: p.length,
      auszug: kuerzeAuszug(p.extract ?? ''),
      lizenz: 'gemeinfrei bzw. freie Lizenz (siehe Seite)',
      ...(p.categories?.length ? { kategorien: p.categories.map((c) => c.title) } : {})
    }))
}

/**
 * Seiten, die kein zusammenhängender Quellentext sind.
 *
 * Nachgemessen am 24.09.2026: Auf „Heinrich Heine Loreley" lieferte die Volltextsuche als
 * beste Treffer „Heinrich Heine/Gedichtanfänge", „Simplicissimus/Inhalt 1896–1913" und zwei
 * Lexikonartikel – Register und Nachschlagewerke, in denen die Suchwörter zufällig
 * nebeneinanderstehen.
 *
 * Gefiltert wird deshalb genau zweierlei: Lexikon-Namensräume (ADB:, BLKÖ:, RE: …) und
 * Seiten, deren Titel selbst ein Verzeichnis ankündigt. NICHT gefiltert werden Unterseiten
 * allgemein – „Beschreibung des Oberamts Crailsheim/Kapitel B 25" ist ein richtiger Text.
 * Ein zu grober Filter wäre hier schlimmer als gar keiner: Er nimmt der Lehrkraft Treffer
 * weg, ohne dass sie erfährt, dass es sie gab.
 */
export function istVerzeichnis(titel: string, kategorien: string[] = []): boolean {
  const letzter = titel.split('/').pop() ?? titel
  return (
    /^[A-ZÄÖÜ][\wÄÖÜäöüß]{1,10}:/.test(titel) ||
    /^(Inhalt|Register|Verzeichnis|Inhaltsverzeichnis|Gedichtanfänge|Liste\b)/i.test(letzter) ||
    kategorien.some((k) => KEIN_TEXT.test(k))
  )
}

/**
 * Kategorien, die nie einen zusammenhängenden Quellentext bezeichnen (01.10.2026).
 *
 * Gemeldet von der Lehrkraft: Zu „German Macbeth Adaptations" kamen wiederholt die
 * Autorenseite „Friedrich Gundolf" (Kategorie:Autoren – eine Werkliste, in der „Macbeth" als
 * Bandinhalt seiner Shakespeare-Übersetzung steht) und „Die Musikforschung"
 * (Kategorie:Zeitschrift – das Inhaltsverzeichnis von 67 Jahrgängen, in dem ein Aufsatz über
 * Verdis „Macbeth" steht). Beide Seiten sind Verzeichnisse, auch wenn ihr Titel es nicht sagt.
 *
 * Nachgemessen am selben Tag mit „Macbeth Rezeption Deutschland": Alle acht besten Treffer waren
 * Autoren-, Zeitschriften- und Themenseiten („William Shakespeare", „Friedrich Schiller",
 * „Die Musikforschung", „Archiv für Musikwissenschaft", „Hexenwesen" – Kategorie:Thema –,
 * „Merkur (Zeitschrift)", „Der Merker/Inhalt" – Kategorie:Zeitschriftenartikelliste).
 */
const KEIN_TEXT =
  /^(Kategorie|Category):(Autoren|Autorinnen|Authors?|Zeitschrift|Zeitschriftenartikelliste|Zeitung|Periodikum|Periodicals?|Kalender|Begriffsklärung|Disambiguation|Thema|Themen|Portal)\b/i

/**
 * Wikisource ist das Archiv für gemeinfreie Quellentexte: Reden, Urkunden, Gesetze, Briefe,
 * literarische Werke. Der Volltext steht dort in Schriftform, nicht als Bildscan – nur
 * deshalb lässt sich der Wortlaut überhaupt abgleichen.
 *
 * Gesucht wird zweimal: erst im Titel, dann im Volltext. Ein Werk, dessen Titel passt, ist
 * fast immer das gesuchte Werk; ein Volltexttreffer kann auch ein Register sein.
 */
async function sucheWikisource(anfrage: Materialanfrage, limit: number): Promise<Quellentreffer[]> {
  const lang = WIKISOURCE_SPRACHEN.has(anfrage.sprache) ? anfrage.sprache : 'de'
  const begriffe = anfrage.suchwoerter.split(/\s+/).filter((w) => w.length > 3)
  const imTitel = begriffe.length ? begriffe.map((w) => `intitle:${w}`).join(' ') : ''
  const [titel, volltext] = await Promise.allSettled([
    imTitel ? wikisourceAbfrage(lang, imTitel, limit) : Promise.resolve([]),
    wikisourceAbfrage(lang, anfrage.suchwoerter, limit)
  ])
  // Auch die Titeltreffer prüfen – eine Autorenseite heißt wie die Person, nicht wie ein Verzeichnis
  const aus = (titel.status === 'fulfilled' ? titel.value : []).filter((t) => !istVerzeichnis(t.titel, t.kategorien))
  const rest = (volltext.status === 'fulfilled' ? volltext.value : []).filter((t) => !istVerzeichnis(t.titel, t.kategorien))
  const gesehen = new Set(aus.map((t) => t.url))
  return [...aus, ...rest.filter((t) => !gesehen.has(t.url))].slice(0, limit)
}

// ---------- Projekt Gutenberg ----------

/**
 * Projekt Gutenberg über die hauseigene Suche.
 *
 * Dort liegen nur Werke, deren Urheberrecht abgelaufen ist – für literarische Originaltexte
 * der sicherste Fundort.
 *
 * Die Schnittstelle antwortet im OpenSearch-Format: [Anfrage, Titel[], Urheber[], Adressen[]].
 * Der erste Eintrag ist eine Kopfzeile („Displaying results 1–23") ohne Urheber und Adresse.
 *
 * (Der bekanntere Dienst gutendex.com wäre bequemer, war am 24.09.2026 aber nicht erreichbar –
 * drei Messungen, jedes Mal Zeitüberschreitung. Die hauseigene Suche antwortet in 0,4 s.)
 */
async function sucheGutenberg(anfrage: Materialanfrage, limit: number): Promise<Quellentreffer[]> {
  const params = new URLSearchParams({ query: anfrage.suchwoerter, format: 'json' })
  const res = await politeFetch(
    `https://www.gutenberg.org/ebooks/search/?${params}`,
    { headers: { 'User-Agent': WIKIMEDIA_UA }, signal: AbortSignal.timeout(SUCHE_MS) },
    SUCHE_VERSUCHE
  )
  if (!res.ok) return []
  const json = (await res.json()) as [string, string[], (string | null)[], (string | null)[]]
  const [, titel = [], urheber = [], adressen = []] = json
  const treffer: Quellentreffer[] = []
  for (let i = 0; i < titel.length && treffer.length < limit; i++) {
    const nummer = /\/ebooks\/(\d+)/.exec(adressen[i] ?? '')?.[1]
    if (!nummer) continue
    treffer.push({
      titel: titel[i],
      urheber: urheber[i] ?? undefined,
      url: `https://www.gutenberg.org/cache/epub/${nummer}/pg${nummer}.txt`,
      herkunft: 'gutenberg',
      auszug: '',
      lizenz: 'gemeinfrei (Projekt Gutenberg)'
    })
  }
  return treffer
}

/**
 * Entfernt den Lizenzvorspann und -nachspann von Projekt Gutenberg.
 *
 * Ohne das begänne der „Originaltext" auf dem Arbeitsblatt mit „The Project Gutenberg eBook
 * of …" und mehreren Absätzen Nutzungsbedingungen – rund 20.000 Zeichen, die mit dem Werk
 * nichts zu tun haben und jede Wortzählung unbrauchbar machen.
 */
export function ohneGutenbergRahmen(text: string): string {
  const start = /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i.exec(text)
  const ende = /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i.exec(text)
  const von = start ? start.index + start[0].length : 0
  const bis = ende && ende.index > von ? ende.index : text.length
  /*
   * Hinter der Startmarke steht meist noch eine Zeile mit den Namen der Freiwilligen, die
   * den Text abgetippt und korrekturgelesen haben. Sie gehört zur Ausgabe, nicht zum Werk –
   * und stünde sonst als erster Satz des „Originaltextes" auf dem Arbeitsblatt.
   */
  return text
    .slice(von, bis)
    .replace(/^\s*(?:Produced by|E-?text prepared by|Transcribed (?:from|by))\b[\s\S]{0,400}?(?:\n\s*\n|$)/i, '')
    .trim()
}

// ---------- Suche ----------

/**
 * Sucht Originalmaterial in den freien Archiven.
 *
 * Fällt ein Archiv aus, liefern die anderen trotzdem Treffer: Eine Suche, die wegen einer
 * langsamen Fremdseite ganz scheitert, wäre für die Lehrkraft nicht von „nichts gefunden"
 * zu unterscheiden.
 */
export async function sucheOriginalquellen(anfrage: Materialanfrage): Promise<Quellentreffer[]> {
  const limit = Math.min(Math.max(anfrage.max ?? 6, 1), 20)
  const ergebnisse = await Promise.allSettled([sucheWikisource(anfrage, limit), sucheGutenberg(anfrage, limit)])
  return ergebnisse.flatMap((e) => (e.status === 'fulfilled' ? e.value : [])).slice(0, limit * 2)
}

// ---------- Volltext laden ----------

/** Sauberer Fließtext einer Wikisource-Seite über die Schnittstelle statt über HTML. */
async function ladeWikisource(url: URL): Promise<GeladeneQuelle | null> {
  const lang = /^([a-z]{2,3})\.wikisource\.org$/.exec(url.hostname)?.[1]
  if (!lang) return null
  const titel = decodeURIComponent(url.pathname.replace(/^\/wiki\//, '')).replace(/_/g, ' ')
  const params = new URLSearchParams({ action: 'query', format: 'json', prop: 'extracts', explaintext: '1', redirects: '1', titles: titel })
  const res = await politeFetch(`https://${lang}.wikisource.org/w/api.php?${params}`, { headers: { 'User-Agent': WIKIMEDIA_UA } })
  if (!res.ok) return null
  const json = (await res.json()) as { query?: { pages?: Record<string, WikiSeite> } }
  const seite = Object.values(json.query?.pages ?? {})[0]
  if (!seite?.extract) return null
  return { url: url.toString(), titel: seite.title, text: seite.extract, wortzahl: zaehleWoerter(seite.extract) }
}

/**
 * Holt ein PDF als Bytes – oder null, wenn die Adresse kein PDF liefert.
 *
 * Wissenschaftliche Quellen, Behoerdenberichte und Unterrichtsmaterial liegen sehr oft als
 * PDF vor. Ohne diesen Weg fielen sie mit „Die Adresse liefert keinen Text" heraus.
 */
async function ladePdf(url: URL): Promise<GeladeneQuelle | null> {
  const res = await politeFetch(url, {
    headers: { 'User-Agent': kennungFuer(url), Accept: 'application/pdf,*/*;q=0.8' },
    signal: AbortSignal.timeout(25000)
  })
  if (!res.ok) return null
  const typ = res.headers.get('content-type') ?? ''
  const nachEndung = /\.pdf($|\?)/i.test(url.pathname + url.search)
  if (!/application\/pdf/i.test(typ) && !nachEndung) return null
  // 30 MB: Darueber ist es ein Buchscan und kein Unterrichtsmaterial – und wird gar nicht erst geladen
  let daten: Uint8Array
  try {
    daten = await begrenzteAntwort(res, GRENZEN.pdf)
  } catch {
    return null
  }
  if (daten.length < 1000) return null
  return { url: url.toString(), titel: '', text: '', wortzahl: 0, pdf: daten }
}

/**
 * Lädt den Wortlaut einer Quelle.
 *
 * Jede Fundstelle geht durch diese Stelle – auch die, die die KI über ihre eigene Websuche
 * gefunden hat. Nur was die App selbst gelesen hat, darf als Originaltext aufs Blatt.
 */
export async function ladeOriginalquelle(adresse: string): Promise<GeladeneQuelle> {
  let url: URL
  try {
    url = new URL(adresse)
  } catch {
    return { url: adresse, titel: '', text: '', wortzahl: 0, fehler: 'Die Internetadresse der Quelle ist ungültig.' }
  }
  if (url.protocol !== 'https:') return { url: adresse, titel: '', text: '', wortzahl: 0, fehler: 'Nur öffentliche https-Adressen werden geladen.' }

  const wiki = await ladeWikisource(url).catch(() => null)
  if (wiki) return wiki

  /*
   * PDF: nur die Bytes holen. Den Text gewinnt die Oberflaeche daraus – dort liegt der
   * PDF-Leser, den auch das hochgeladene Material der Lehrkraft benutzt.
   */
  const alsPdf = await ladePdf(url).catch(() => null)
  if (alsPdf) return alsPdf

  const seite = await fetchText(url)
  if ('error' in seite) return { url: adresse, titel: '', text: '', wortzahl: 0, fehler: seite.error }
  // Titel des Artikels: og:title, <h1> im Artikel, <title> ohne Website-Namen – nie ein Bewertungs- oder Zählerelement (01.10.2026)
  const titel = seitentitelAusHtml(seite.raw) || stripHtml(/<title[^>]*>([\s\S]{1,300}?)<\/title>/i.exec(seite.raw)?.[1] ?? '')
  const text = url.hostname.endsWith('gutenberg.org') ? ohneGutenbergRahmen(seite.text) : seite.text
  return { url: adresse, titel, text, wortzahl: zaehleWoerter(text) }
}
