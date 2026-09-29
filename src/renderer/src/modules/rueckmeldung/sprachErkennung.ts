/**
 * Spracherkennung für Abgaben (29.09.2026, Fehlerbericht der Lehrkraft): „Für Fremdsprachen kam
 * kein Feedback dazu, dass es in Deutsch statt in der Zielsprache verfasst wurde." Entscheidung der
 * Lehrkraft: Deutscher Text in einer Zielsprachenaufgabe gilt als „Ganze Aufgabe nicht erfüllt".
 *
 * Bewusst ein kleiner, deterministischer Detektor ohne KI: Er zählt häufige Funktionswörter je
 * Sprache (Wörter, die in mehreren Listen stehen – „in", „so", „was" –, zählen für keine) und
 * kyrillische Buchstaben für Russisch. Bewertet wird Satz für Satz; entscheidend ist der Anteil
 * deutscher Sätze. Kurze Texte ohne genug Belege gelten als unklar – dann keine Warnung.
 */
import { istModerneFremdsprache } from '../klassenarbeit/model/nachweise'

export type SprachCode = 'de' | 'en' | 'fr' | 'es' | 'it' | 'la' | 'ru'

const FUNKTIONSWOERTER: Record<Exclude<SprachCode, 'ru'>, string> = {
  de: 'der die das den dem des ein eine einen einem einer eines und oder aber nicht ich du er sie wir ihr mich mir dich dir sich ist sind war waren bin bist hat habe haben hatte wird werden wurde dass weil wenn auch noch schon sehr mit von zu zum zur auf für bei nach über unter aus ist es mein meine dein deine sein seine unser wie wo warum was wer dieser diese dieses jetzt immer kein keine nicht nur viel viele man ganz gut echt finde denke glaube gibt',
  en: 'the a an and or but not i you he she we they me him her us them my your his our their is are was were be been am has have had will would can could should do does did that this these those with from for of to at by about because if when what who which there here very also just so too it its',
  fr: 'le la les un une des et ou mais ne pas je tu il elle nous vous ils elles me te se mon ma mes ton ta tes son sa ses notre votre leur est sont était être avoir ai as avons avez ont que qui quoi avec pour dans sur par chez du au aux ce cette ces très aussi mais oui non bien',
  es: 'el la los las un una unos unas y o pero no yo tú él ella nosotros vosotros ellos ellas me te se mi mis tu tus su sus es son era estar está están ser tengo tiene tienen que quien con para por en del al este esta estos estas muy también porque cuando donde sí',
  it: 'il lo la i gli le un una uno e o ma non io tu lui lei noi voi loro mi ti si mio mia miei tuo tua suo sua è sono era essere ho hai ha abbiamo hanno che chi con per di da in su del della dei al alla questo questa questi molto anche perché quando dove sì',
  la: 'et est sunt non in cum ad ab ex de sed quod qui quae quid ut ne enim autem atque neque nec erat esse sum es eius eorum hic haec hoc ille illa illud ego tu nos vos se sibi suus sua suum iam tum nunc'
}

/** Funktionswörter je Sprache – ohne Wörter, die in mehreren Sprachen vorkommen */
const LISTEN: Record<Exclude<SprachCode, 'ru'>, Set<string>> = (() => {
  const roh = Object.entries(FUNKTIONSWOERTER).map(([k, v]) => [k, new Set(v.split(/\s+/).filter(Boolean))] as const)
  const zaehler = new Map<string, number>()
  for (const [, s] of roh) for (const w of s) zaehler.set(w, (zaehler.get(w) ?? 0) + 1)
  return Object.fromEntries(roh.map(([k, s]) => [k, new Set([...s].filter((w) => zaehler.get(w) === 1))])) as Record<Exclude<SprachCode, 'ru'>, Set<string>>
})()

/** Zielsprache eines Fachs (null: unbekannt – dann zählt nur „Deutsch oder nicht") */
export const ZIELSPRACHE: Record<string, SprachCode> = {
  englisch: 'en',
  franzoesisch: 'fr',
  spanisch: 'es',
  italienisch: 'it',
  russisch: 'ru',
  latein: 'la'
}

const woerter = (s: string): string[] => s.toLowerCase().match(/[\p{L}]+(?:['’][\p{L}]+)?/gu) ?? []

/** Sprache eines Satzes nach Funktionswörtern; null bei zu wenig Belegen */
export function satzSprache(satz: string): SprachCode | null {
  const kyrillisch = (satz.match(/[Ѐ-ӿ]/g) ?? []).length
  const lateinisch = (satz.match(/[a-zA-ZäöüßÄÖÜàâçéèêëîïôûùüÿñáíóúœ]/g) ?? []).length
  if (kyrillisch > 3 && kyrillisch > lateinisch) return 'ru'
  const w = woerter(satz)
  if (w.length < 3) return null
  let beste: SprachCode | null = null
  let besteZahl = 0
  let zweite = 0
  for (const [code, liste] of Object.entries(LISTEN) as [Exclude<SprachCode, 'ru'>, Set<string>][]) {
    const n = w.filter((x) => liste.has(x)).length
    if (n > besteZahl) {
      zweite = besteZahl
      besteZahl = n
      beste = code
    } else if (n > zweite) zweite = n
  }
  // Eindeutig genug: mindestens zwei Funktionswörter und mehr als die zweitbeste Sprache
  return besteZahl >= 2 && besteZahl > zweite ? beste : null
}

export interface SprachBefund {
  /** Überwiegende Sprache (null: unklar) */
  sprache: SprachCode | null
  /** Anteil deutscher Sätze an den erkannten Sätzen (0–1) */
  anteilDeutsch: number
  /** Sätze mit erkannter Sprache */
  saetze: number
  woerter: number
  /** Längster zusammenhängender deutscher Abschnitt in Wörtern (für gemischte Abgaben) */
  deutscherAbschnitt: number
}

export function erkenneSprache(text: string): SprachBefund {
  const saetze = text
    .split(/(?<=[.!?;:])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const zaehl = new Map<SprachCode, number>()
  let erkannt = 0
  let deutsch = 0
  let abschnitt = 0
  let laengster = 0
  for (const s of saetze) {
    const sp = satzSprache(s)
    if (!sp) continue
    erkannt++
    zaehl.set(sp, (zaehl.get(sp) ?? 0) + 1)
    if (sp === 'de') {
      deutsch++
      abschnitt += woerter(s).length
      laengster = Math.max(laengster, abschnitt)
    } else abschnitt = 0
  }
  const sprache = [...zaehl.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  return { sprache, anteilDeutsch: erkannt ? deutsch / erkannt : 0, saetze: erkannt, woerter: woerter(text).length, deutscherAbschnitt: laengster }
}

export interface ZielsprachPruefung {
  /** Die Abgabe ist überwiegend auf Deutsch verfasst – Aufgabe in der Zielsprache nicht erfüllt */
  verfehlt: boolean
  /** Ein längerer Abschnitt ist auf Deutsch, der Rest nicht (z. B. ein Schreibteil) */
  teilweise: boolean
  befund: SprachBefund
}

/** Ab diesem Anteil deutscher Sätze gilt die ganze Abgabe als deutsch */
export const SCHWELLE_DEUTSCH = 0.6

/**
 * Prüft eine Abgabe in einer modernen Fremdsprache: Ist sie (überwiegend) auf Deutsch verfasst?
 * Außerhalb der modernen Fremdsprachen und bei zu wenig Text immer „nicht verfehlt".
 */
export function pruefeZielsprache(text: string, subjectId: string): ZielsprachPruefung {
  const befund = erkenneSprache(text)
  if (!subjectId || !istModerneFremdsprache(subjectId) || befund.woerter < 8 || !befund.saetze) return { verfehlt: false, teilweise: false, befund }
  const verfehlt = befund.anteilDeutsch >= SCHWELLE_DEUTSCH
  const teilweise = !verfehlt && befund.deutscherAbschnitt >= 25
  return { verfehlt, teilweise, befund }
}

/**
 * Verlangt die Aufgabe (auch) Deutsch – etwa eine Sprachmittlung ins Deutsche oder Antworten auf
 * Deutsch? Dann setzt die App nichts automatisch auf 0, sondern weist nur hin.
 */
export function deutschVerlangt(aufgaben: string): boolean {
  return /\b(auf|ins|in)\s+deutsch(e)?\b|\bdeutsche[nr]?\s+(zusammenfassung|fassung|text|sprache)\b|\bin(to)?\s+german\b|\ben\s+allemand\b|\ben\s+alem[aá]n\b|\bin\s+tedesco\b|[→>]\s*(deutsch|german)\b/i.test(
    aufgaben
  )
}

/** Hinweis für die Lehrkraft am Bogen bzw. an der Abgabe */
export function zielsprachHinweis(p: ZielsprachPruefung, fach: string, deutschErlaubt = false, mitEinstufung = true): string | null {
  const prozent = Math.round(p.befund.anteilDeutsch * 100)
  if (p.verfehlt)
    return deutschErlaubt
      ? `Abgabe überwiegend auf Deutsch (etwa ${prozent} % der Sätze). Die Aufgabe verlangt teilweise Deutsch – ${mitEinstufung ? 'Einstufung' : 'Rückmeldung'} bitte prüfen.`
      : `Abgabe überwiegend auf Deutsch statt auf ${fach} (etwa ${prozent} % der Sätze) – gilt als nicht erfüllt${mitEinstufung ? ', Einstufung auf 0 % gesetzt' : ''}.`
  if (p.teilweise) return `Ein längerer Abschnitt ist auf Deutsch statt auf ${fach} verfasst – betroffenen Teil bitte prüfen.`
  return null
}
