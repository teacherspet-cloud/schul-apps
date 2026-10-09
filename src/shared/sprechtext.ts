/**
 * Sprechtext für die Sprachausgabe (09.10.2026, Wunsch der Lehrkraft: „ElevenLabs soll Abkürzungen richtig sprechen").
 *
 * Was ElevenLabs (und die Gerätestimme) sonst falsch machen: „YA" wird zu „ja", „US" zu „us", „sb" zu „S B",
 * „e.g." zu „e g". Deshalb wird vor der Vertonung der Text vorbereitet:
 *  1. Eigene Aussprache der Lehrkraft für das Wort („Aussprache als …") – immer zuerst.
 *  2. Geprüfte Tabelle des Lehrwerks/Fachs (shared/abkuerzungen) – genau der Sprechtext des Eintrags.
 *  3. Allgemein: Paar „YA = young adults" → „Y. A., young adults"; Initialwörter buchstabiert mit Punkt und Leerzeichen
 *     („Y. A.", „S. N. C. F.", „B. R. D." – so liest ElevenLabs jede Sprache Buchstabe für Buchstabe in der Sprache der
 *     Stimme); bekannte Akronyme als Wort („NASA", „OTAN"); Kürzel mit Punkt und Platzhalter ausgeschrieben je Sprache
 *     („e.g." → „for example", „sb" → „somebody", „z. B." → „zum Beispiel", „qn" → „quelqu'un").
 *
 * Für längere Hörtexte (mit Zeitmarken je Zeile) gibt es zusätzlich Ausspracheregeln: Initialwörter werden dort über ein
 * Aussprache-Wörterbuch von ElevenLabs gesprochen (PLS-Lexikon mit Alias-Regeln, `plsLexikon`), damit der Text der
 * Zeilen unverändert bleibt; klappt das nicht, wird der Text wie oben vorbereitet (main/services/audio/elevenlabs.ts).
 *
 * Inhalte in Klammern („[AE]", „(n)") bleiben, wie sie sind – das sind Angaben, keine Abkürzungen zum Sprechen.
 */
import { abkuerzungAus } from './abkuerzung'
import { abkEintrag } from './abkuerzungen'

interface SprachRegeln {
  /** Kürzel → gesprochene Form (Groß-/Kleinschreibung wie angegeben; Punkt-Kürzel auch ohne Leerzeichen) */
  kuerzel: Record<string, string>
  /** Großgeschriebene Abkürzungen, die als Wort gesprochen werden */
  alsWort: string[]
  /** „und" zwischen Buchstaben („B&B" → „B and B") */
  und: string
  /** Großgeschriebene gewöhnliche Wörter (Betonung im Satz: „look at ME!") – nie buchstabieren */
  woerter?: string[]
}

const REGELN: Record<string, SprachRegeln> = {
  en: {
    kuerzel: {
      'e.g.': 'for example',
      'i.e.': 'that is',
      'etc.': 'et cetera',
      'approx.': 'approximately',
      'vs.': 'versus',
      'a.m.': 'A. M.',
      'p.m.': 'P. M.',
      Mr: 'Mister',
      'Mr.': 'Mister',
      Mrs: 'Missus',
      'Mrs.': 'Missus',
      Ms: 'Miz',
      'Ms.': 'Miz',
      Dr: 'Doctor',
      'Dr.': 'Doctor',
      sb: 'somebody',
      'sb.': 'somebody',
      "sb's": "somebody's",
      'sb’s': 'somebody’s',
      sth: 'something',
      'sth.': 'something',
      '°C': 'degrees Celsius',
      '°F': 'degrees Fahrenheit',
      'km/h': 'kilometres per hour',
      km: 'kilometres',
      cm: 'centimetres',
      ml: 'millilitres',
      kg: 'kilograms'
    },
    alsWort: ['NASA', 'NATO', 'UNESCO', 'UNICEF', 'AIDS', 'FIFA', 'UEFA', 'FOMO', 'JOMO', 'YOLO', 'EPIC', 'GIF', 'SCUBA', 'LASER', 'RADAR', 'OPEC', 'ASCII'],
    und: 'and',
    woerter: ['ME', 'MY', 'WE', 'NO', 'SO', 'GO', 'DO', 'OH', 'HI', 'YES', 'NOT', 'AND', 'THE', 'YOU', 'ALL', 'NOW', 'WAS', 'WHAT', 'WANT', 'HELP', 'STOP', 'COOL', 'WOW', 'OKAY', 'HEY']
  },
  de: {
    kuerzel: {
      'z. B.': 'zum Beispiel',
      'z.B.': 'zum Beispiel',
      'd. h.': 'das heißt',
      'd.h.': 'das heißt',
      'u. a.': 'unter anderem',
      'usw.': 'und so weiter',
      'bzw.': 'beziehungsweise',
      'ca.': 'circa',
      'Nr.': 'Nummer',
      'ugs.': 'umgangssprachlich',
      'jmdn.': 'jemanden',
      'jmdm.': 'jemandem',
      'jmds.': 'jemandes',
      'jmd.': 'jemand',
      'etw.': 'etwas',
      '°C': 'Grad Celsius',
      'km/h': 'Kilometer pro Stunde',
      km: 'Kilometer',
      cm: 'Zentimeter',
      ml: 'Milliliter',
      kg: 'Kilogramm'
    },
    alsWort: ['NATO', 'UNESCO', 'UNICEF', 'AIDS', 'FIFA', 'UEFA', 'TÜV', 'DAX', 'BAföG', 'NASA', 'UNO'],
    und: 'und',
    woerter: ['ICH', 'DU', 'ER', 'ES', 'WIR', 'IHR', 'SIE', 'JA', 'MICH', 'DICH', 'UND', 'AUS', 'NICHT', 'NEIN', 'DAS', 'WAS', 'HALT']
  },
  fr: {
    kuerzel: {
      qn: "quelqu'un",
      qc: 'quelque chose',
      qch: 'quelque chose',
      'p. ex.': 'par exemple',
      'etc.': 'et cetera',
      'M.': 'Monsieur',
      Mme: 'Madame',
      Mlle: 'Mademoiselle',
      '°C': 'degrés Celsius',
      'km/h': 'kilomètres-heure',
      km: 'kilomètres'
    },
    alsWort: ['OTAN', 'UNESCO', 'SIDA', 'OVNI', 'SMIC', 'ONG', 'NASA'],
    und: 'et',
    woerter: ['NON', 'OUI', 'MOI', 'TOI', 'ET', 'LE', 'LA', 'JE', 'TU']
  },
  es: {
    kuerzel: {
      algn: 'alguien',
      'algn.': 'alguien',
      'p. ej.': 'por ejemplo',
      'etc.': 'etcétera',
      'Sr.': 'señor',
      'Sra.': 'señora',
      'Srta.': 'señorita',
      'Ud.': 'usted',
      'Uds.': 'ustedes',
      '°C': 'grados Celsius',
      'km/h': 'kilómetros por hora',
      km: 'kilómetros'
    },
    alsWort: ['OTAN', 'ONU', 'SIDA', 'OVNI', 'UNESCO', 'RENFE', 'NASA'],
    und: 'y',
    woerter: ['NO', 'SÍ', 'YO', 'TU', 'TÚ', 'MÍ', 'EL', 'LA', 'Y']
  },
  it: {
    kuerzel: { qc: 'qualcosa', qn: 'qualcuno', 'p. es.': 'per esempio', 'ecc.': 'eccetera', 'Sig.': 'signor', 'Sig.ra': 'signora', '°C': 'gradi Celsius' },
    alsWort: ['NATO', 'ONU', 'UNESCO', 'AIDS', 'FIAT', 'NASA'],
    und: 'e'
  }
}
const regelnFuer = (sprache: string): SprachRegeln => REGELN[String(sprache ?? '').toLowerCase().split(/[-_]/)[0]] ?? REGELN.en

/** Großbuchstaben-Abkürzung (2–6 Zeichen, mindestens zwei Großbuchstaben) – „YA", „BBC", „CO2", „B&B" */
const INITIAL = /^(?=(?:[^\p{Lu}]*\p{Lu}){2})[\p{Lu}\d&]{2,6}$/u
/** Römische Zahlen („II", „XIV") und „OK" bleiben, wie sie sind */
const NICHT_BUCHSTABIEREN = /^(?:[IVXLCDM]+|OK)$/

/** Buchstabiert für die Sprachausgabe: „YA" → „Y. A.", „B&B" → „B and B", „CO2" → „C. O. 2" */
export function buchstabiert(kurz: string, sprache = 'en'): string {
  const und = regelnFuer(sprache).und
  return String(kurz ?? '')
    .split('&')
    .map((teil) =>
      [...teil.replace(/[.\s]/g, '')]
        .map((z) => (/\p{L}/u.test(z) ? `${z}.` : z))
        .join(' ')
    )
    .join(` ${und} `)
    .replace(/\s+/g, ' ')
    .trim()
}

/** Wird diese Abkürzung buchstabiert? (nicht: Akronym als Wort, römische Zahl, „OK") */
export function wirdBuchstabiert(kurz: string, sprache = 'en'): boolean {
  const k = String(kurz ?? '').trim()
  if (!INITIAL.test(k) || NICHT_BUCHSTABIEREN.test(k) || regelnFuer(sprache).woerter?.includes(k)) return false
  // Ab fünf Buchstaben mit Selbstlaut ist es meist ein betontes Wort („NOBODY", „UNTER") – Abkürzungen dieser Länge
  // („LGBTQ") haben selten einen; Ausnahmen gehören in die Tabelle
  if (k.replace(/[^\p{L}]/gu, '').length >= 5 && /[AEIOUÄÖÜ]/.test(k)) return false
  return !regelnFuer(sprache).alsWort.some((w) => w.toUpperCase() === k.toUpperCase())
}

/** Gesprochene Form einer Abkürzung allein */
export function kurzGesprochen(kurz: string, sprache = 'en'): string {
  const k = String(kurz ?? '').trim()
  const r = regelnFuer(sprache)
  if (r.kuerzel[k] !== undefined) return r.kuerzel[k]
  if (wirdBuchstabiert(k, sprache)) return buchstabiert(k, sprache)
  // Akronym als Wort: „FOMO" → „Fomo" (in Großbuchstaben würde die Stimme es oft buchstabieren)
  if (r.alsWort.some((w) => w.toUpperCase() === k.toUpperCase())) return k[0] + k.slice(1).toLowerCase()
  return k
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Teile außerhalb von Klammern bearbeiten – „[AE]", „(n)" bleiben unberührt */
function ausserhalbKlammern(text: string, fn: (teil: string) => string): string {
  return String(text ?? '')
    .split(/(\[[^\]]*\]|\([^)]*\))/)
    .map((teil, i) => (i % 2 ? teil : fn(teil)))
    .join('')
}

/*
 * Varianten und Formenreihen (09.10.2026, Wunsch der Lehrkraft: „was / were" soll als „was … were" mit kurzer Pause
 * klingen, nie „slash"). Recherche und Liste der betroffenen Verben: recherche/aussprache-unregelmaessige-verben.md.
 *
 * Die Pause steht anbieterneutral als Auslassungspunkte im Sprechtext (so wird er auch mit der Aufnahme gespeichert):
 * eleven_v3 (Dialoge) und OpenAI (gpt-4o-mini-tts) machen daraus eine Pause; für eleven_multilingual_v2 setzt der
 * Hauptprozess bei kurzen Einzeltexten eine echte Pausenmarke `<break time="0.4s" />` ein (`mitPausenMarken`), die
 * Gerätestimme bekommt ein Komma (`fuerGeraetestimme`). Der angezeigte Text bleibt immer, wie er ist.
 */

/** Pause zwischen gleichwertigen Varianten („was / were", „burnt or burned") */
export const VARIANTEN_PAUSE = ' … '
/** Pause zwischen den Formen einer Reihe („be – was – been") */
export const FORMEN_PAUSE = '. '

/** „stato/a", „cansado/a", „Schüler/-innen": nur die Grundform sprechen */
const ENDUNG_NACH_STRICH = /([\p{L}\p{M}]{2,})\/-?(?:a|e|i|o|s|as|es|os|is|ne|in|innen)(?![\p{L}\p{M}\d])/gu
/** Adressen bleiben unberührt */
const ADRESSE = /(\S*(?:\/\/|www\.)\S*)/
/** Schrägstrich zwischen Wörtern (nicht „1/2", nicht „km/h") */
const STRICH_ZWISCHEN_WOERTERN = /([\p{L}\p{M}.)\]'’])[ \t]*\/[ \t]*(?=[\p{L}\p{M}]{2}|[(\['’])/gu

/** Schrägstriche zwischen Wörtern als kurze Pause: „was/were" → „was … were", „il/elle" → „il … elle" */
export function ohneSchraegstrich(text: string): string {
  return String(text ?? '')
    .split(ADRESSE)
    .map((teil, i) => (i % 2 ? teil : teil.replace(ENDUNG_NACH_STRICH, '$1').replace(STRICH_ZWISCHEN_WOERTERN, `$1${VARIANTEN_PAUSE}`)))
    .join('')
}

/** Für eleven_multilingual_v2 (kurze Einzeltexte): Auslassungspunkte zwischen Wörtern als echte Pause von 0,4 s */
export const mitPausenMarken = (text: string, sekunden = 0.4): string =>
  String(text ?? '').replace(/\s*…\s*(?=\S)/g, (m, i: number) => (i === 0 ? m : ` <break time="${sekunden}s" /> `))

/** Für die Stimme des Geräts: Pause als Komma (manche Gerätestimmen lesen „…" vor oder überspringen es) */
export const fuerGeraetestimme = (text: string): string =>
  String(text ?? '')
    .replace(/\s*…\s*(?=\S)/g, ', ')
    .replace(/\s*…\s*$/, '')

/** Angaben, die nie gesprochen werden: „(AE)", „[BE]", „(infml)", „(irr.)" */
const ANGABE_IN_KLAMMERN =
  /\s*\((?:AE|BE|AmE|BrE|US|UK|Am\.?|Br\.?|am\.|brit\.|amerik\.|infml\.?|fml\.?|informal|formal|irr\.?|unregelm\.?|selten|veraltet|old|lit\.?|liter\.?|ugs\.?|fam\.?|pop\.?|vulg\.?)\)/giu
/** Allein stehende Marker britisch/amerikanisch („gotten AE") */
const MARKER_ALLEIN = /(?<![\p{L}\d])(?:AE|BE|AmE|BrE)(?![\p{L}\d])/gu
/** Angehängte Endungen in Klammern: „allé(e)", „assis(e)", „venu(e)s", „cansado(a)" */
const ENDUNG_IN_KLAMMERN = /([\p{L}\p{M}])\((?:e|s|es|x|a|o|as|os|ne|le|n|in|innen)\)/giu
/** Französisch: Partizip nach „être" in der weiblichen Form, wie sie früher aus „allé(e)" entstand („je suis allée") */
const FR_WEIBLICH_NACH_ETRE = /(^|[^\p{L}])((?:je|tu|il|on|nous|vous|ils)\s+(?:(?:me|m'|te|t'|se|s'|nous|vous)\s*)?(?:suis|es|est|sommes|êtes|sont)\s+[\p{L}\p{M}]*[\p{L}\p{M}])e(s?)(?![\p{L}\p{M}])/gu

/**
 * Englische Homographen (09.10.2026): gleiche Schreibung, andere Aussprache je nach Form. Nur in Verbformen und nur in
 * der genannten Spalte (`inf` bzw. `past`/`pp`) – nie im freien Text. Die Ersatzschreibung klingt bei jeder Stimme
 * (ElevenLabs, OpenAI, Gerät) richtig; Lautschrift-Marken versteht eleven_multilingual_v2 nicht.
 */
export const VERB_HOMOGRAPHE: { wort: string; spalten: ('inf' | 'past' | 'pp')[]; gesprochen: string; laut: string }[] = [
  { wort: 'read', spalten: ['past', 'pp'], gesprochen: 'red', laut: '/rɛd/ (nicht /riːd/)' },
  { wort: 'lead', spalten: ['inf'], gesprochen: 'leed', laut: '/liːd/ (nicht /lɛd/ wie das Metall)' },
  { wort: 'wind', spalten: ['inf'], gesprochen: 'wined', laut: '/waɪnd/ (nicht /wɪnd/ wie der Wind)' },
  { wort: 'wound', spalten: ['past', 'pp'], gesprochen: 'wownd', laut: '/waʊnd/ (nicht /wuːnd/ wie die Wunde)' },
  { wort: 'tear', spalten: ['inf'], gesprochen: 'tare', laut: '/teə/ (nicht /tɪə/ wie die Träne)' },
  { wort: 'sow', spalten: ['inf'], gesprochen: 'so', laut: '/səʊ/ (nicht /saʊ/ wie die Sau)' },
  { wort: 'dove', spalten: ['past'], gesprochen: 'dohv', laut: '/dəʊv/ (AE, nicht /dʌv/ wie die Taube)' },
  { wort: 'bow', spalten: ['inf'], gesprochen: 'bough', laut: '/baʊ/ (sich verbeugen, nicht /bəʊ/ wie der Bogen)' }
]

/**
 * Sprechtext einer Zelle der Liste unregelmäßiger Verben (09.10.2026). `spalte`: Kennung aus VERB_SPALTEN (`inf`,
 * `past`, `pp` …) – steuert die Homographen. Nimmt auch den alten Sprechtext („was, were") an.
 *  - Angaben fallen weg: „[AE]", „(AE)", „(infml)", „gotten AE" → „gotten"
 *  - Endungen fallen weg: „allé(e)" → „allé", „sono stato/a" → „sono stato" (die Grundform genügt)
 *  - Klammer vorn wird mitgesprochen: „(to) be" → „to be", „(s')asseoir" → „s'asseoir"
 *  - Varianten mit kurzer Pause: „was/were", „learnt or learned", „burnt, burned", „learnt (learned)" → „… … …"
 *  - Reihen mit Pause statt Strich: „be – was – been" → „be. was. been"
 *  - Platzhalter wie im freien Text („sb" → „somebody")
 */
export function verbFormSprechtext(zelle: string, sprache = 'en', spalte = ''): string {
  const sp = String(sprache ?? '').toLowerCase().split(/[-_]/)[0]
  let t = String(zelle ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
  if (!t || /^[-–—]+$/.test(t)) return ''
  t = t
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(ANGABE_IN_KLAMMERN, ' ')
    .replace(MARKER_ALLEIN, ' ')
    .replace(ENDUNG_IN_KLAMMERN, '$1')
    .replace(ENDUNG_IN_KLAMMERN, '$1')
  // Endung nach Schrägstrich; im alten Sprechtext stand dort ein Komma („sono stato, a")
  t = t.replace(ENDUNG_NACH_STRICH, '$1').replace(/([\p{L}\p{M}]{2,}), (?:a|as)(?=$|[,;/])/gu, '$1')
  if (sp === 'fr') t = t.replace(FR_WEIBLICH_NACH_ETRE, (m, vor: string, kern: string, s: string) => (/\b(?:elle|elles)\b/.test(m) ? m : `${vor}${kern}${s}`))
  // Klammer vorn: mitsprechen; Klammer mitten/hinten: Variante („learnt (learned)")
  t = t.replace(/^\(([^)]*)\)\s*/, (_m, x: string) => `${x.trim()}${/['’]$/.test(x.trim()) ? '' : ' '}`)
  t = t.replace(/\s*\(([^)]*)\)/g, (_m, x: string) => (x.trim() ? `${VARIANTEN_PAUSE}${x.trim()} ` : ' '))
  t = t
    .replace(/\s+[–—-]\s+/g, FORMEN_PAUSE)
    .replace(/\s*\/\s*/g, VARIANTEN_PAUSE)
    .replace(/\s*[,;]\s*/g, VARIANTEN_PAUSE)
    .replace(/\s+(?:or|ou|o|oder|или)\s+/giu, VARIANTEN_PAUSE)
  if (sp === 'en' && spalte)
    for (const h of VERB_HOMOGRAPHE)
      if ((h.spalten as string[]).includes(spalte)) t = t.replace(new RegExp(`(?<![\\p{L}'’])${h.wort}(?![\\p{L}'’])`, 'giu'), h.gesprochen)
  t = sprechText(t, sp || 'en')
  return t
    .replace(/\s*…\s*/g, VARIANTEN_PAUSE)
    .replace(/(?:\s*…\s*){2,}/g, VARIANTEN_PAUSE)
    .replace(/^\s*…\s*|\s*…\s*$/g, '')
    .replace(/\s*\.\s*(?=\.|$)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Sprechtext einer ganzen Zeile („be – was/were – been"): die Formen nacheinander mit Pause, ohne leere Formen */
export const verbReiheSprechtext = (formen: { spalte: string; zelle: string }[], sprache = 'en'): string =>
  formen
    .map((f) => verbFormSprechtext(f.zelle, sprache, f.spalte))
    .filter(Boolean)
    .join(FORMEN_PAUSE)

/**
 * Freien Text für die Sprachausgabe vorbereiten (Beispielsätze, Hörtexte, Wörter ohne Tabelleneintrag).
 * `nurKuerzel`: Initialwörter NICHT buchstabieren (das übernimmt dann das Aussprache-Wörterbuch).
 */
export function sprechText(text: string, sprache = 'en', nurKuerzel = false): string {
  const r = regelnFuer(sprache)
  // Längere Kürzel zuerst („Mrs" vor „Mr", „z. B." vor „B.")
  const kuerzel = Object.keys(r.kuerzel).sort((a, b) => b.length - a.length)
  const muster = kuerzel.length ? new RegExp(`(^|[^\\p{L}\\d°])(${kuerzel.map(escape).join('|')})(?![\\p{L}\\d])`, 'gu') : null
  const vorbereitet = ausserhalbKlammern(text, (teil) => {
    let t = muster ? teil.replace(muster, (_m, vor: string, k: string) => `${vor}${r.kuerzel[k]}`) : teil
    // „No. 5" → „number 5" – nur vor einer Zahl (sonst ist „No." das Wort „nein")
    if (r === REGELN.en) t = t.replace(/(?<![\p{L}])No\.\s?(?=\d)/gu, 'number ')
    if (!nurKuerzel)
      t = t.replace(/(?<![\p{L}\d])[\p{Lu}\d&]{2,6}(?![\p{L}\d])/gu, (k, i: number, ganz: string) => {
        if (!wirdBuchstabiert(k, sprache)) return kurzGesprochen(k, sprache)
        const b = buchstabiert(k, sprache)
        // Kein doppelter Punkt am Satzende („the BBC." → „the B. B. C.")
        return ganz[i + k.length] === '.' ? b.replace(/\.$/, '') : b
      })
    return t
  })
  // Nie „slash" (09.10.2026): „was/were" → „was … were" – auch in Klammern („be (was/were, been)")
  return ohneSchraegstrich(vorbereitet)
}

/**
 * Sprechtext eines Vokabel-Eintrags: eigene Aussprache der Lehrkraft, sonst Tabelle, sonst Paar „Abkürzung, Langform",
 * sonst der vorbereitete Text. Wörter ohne Abkürzung bleiben genau, wie sie sind (vorhandene Aufnahmen gelten weiter).
 */
export function sprechTextFuerWort(v: { term: string; aussprache?: string }, sprache = 'en'): string {
  const eigen = String(v.aussprache ?? '').trim()
  if (eigen) return eigen
  const tab = abkEintrag(v.term)
  if (tab) return ohneSchraegstrich(tab.aussprache)
  const abk = abkuerzungAus(v.term)
  if (abk) {
    const kurz = kurzGesprochen(abk.kurz, sprache)
    // „Mr (= Mister)", „e.g. (= for example)": die Abkürzung klingt wie die Langform – einmal genügt
    const gleich = kurz.toLowerCase().replace(/[^\p{L}]/gu, '') === abk.lang.toLowerCase().replace(/[^\p{L}]/gu, '')
    return gleich ? sprechText(abk.lang, sprache) : `${kurz}, ${sprechText(abk.lang, sprache)}`
  }
  return sprechText(v.term, sprache)
}

/** Eine Alias-Regel des Aussprache-Wörterbuchs: genau diese Zeichenfolge wird so gesprochen */
export interface AusspracheRegel {
  von: string
  zu: string
}

/** Regeln für Initialwörter in den Texten (für das Aussprache-Wörterbuch von ElevenLabs) – sortiert, ohne Doppelte */
export function ausspracheRegeln(texte: string[], sprache = 'en'): AusspracheRegel[] {
  const gefunden = new Map<string, string>()
  for (const text of texte)
    ausserhalbKlammern(text, (teil) => {
      for (const m of teil.matchAll(/(?<![\p{L}\d])[\p{Lu}\d&]{2,6}(?![\p{L}\d])/gu))
        if (wirdBuchstabiert(m[0], sprache) && /^[\p{Lu}\d]+$/u.test(m[0])) gefunden.set(m[0], buchstabiert(m[0], sprache))
      return teil
    })
  return [...gefunden].sort(([a], [b]) => a.localeCompare(b)).map(([von, zu]) => ({ von, zu }))
}

const XML_SPRACHE: Record<string, string> = { en: 'en-GB', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', it: 'it-IT', nl: 'nl-NL', pl: 'pl-PL', ru: 'ru-RU', tr: 'tr-TR' }
const xml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** PLS-Lexikon (W3C Pronunciation Lexicon) mit Alias-Regeln – so nimmt ElevenLabs ein Aussprache-Wörterbuch an */
export function plsLexikon(regeln: AusspracheRegel[], sprache = 'en'): string {
  const sp = String(sprache ?? '').toLowerCase().split(/[-_]/)[0]
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<lexicon version="1.0" xmlns="http://www.w3.org/2005/01/pronunciation-lexicon" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.w3.org/2005/01/pronunciation-lexicon http://www.w3.org/TR/2007/CR-pronunciation-lexicon-20071212/pls.xsd" alphabet="ipa" xml:lang="${xml(XML_SPRACHE[sp] ?? sp ?? 'en')}">`,
    ...regeln.map((r) => `  <lexeme>\n    <grapheme>${xml(r.von)}</grapheme>\n    <alias>${xml(r.zu)}</alias>\n  </lexeme>`),
    '</lexicon>',
    ''
  ].join('\n')
}

/** Kurzer, stabiler Fingerabdruck (FNV-1a) – Schlüssel für gespeicherte Wörterbücher */
export function fingerabdruck(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
