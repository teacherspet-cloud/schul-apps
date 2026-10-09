/**
 * Fettdruck im Elternbrief (09.10.2026, Wunsch der Lehrkraft): Die KI markiert das Wichtigste mit **…** (Datum,
 * Uhrzeit, Treffpunkt, Kosten, Mitzubringendes, Rückgabefrist), höchstens etwa 6–8 Stellen. Erlaubt ist NUR fett;
 * alles andere (HTML, Kursiv, Überschriften-Rauten) wird entfernt. Die Rückgabefrist ist zusätzlich unterstrichen
 * und steht auf dem Rückmeldeabschnitt („Bitte bis **Fr, 17.10.** zurückgeben.").
 *
 * Hat die KI wenig markiert, ergänzt eine feste Nachprüfung fett für Datumsangaben, Uhrzeiten und Euro-Beträge –
 * bis zur Obergrenze. Die Markierung bleibt im gespeicherten Text (**…**), damit sie beim Bearbeiten sichtbar ist
 * und in alle Ausgaben (PDF/Druck, Word) gleich übernommen wird.
 */
import type { BriefText } from './model'

/** Ein Stück Text mit Auszeichnung */
export interface Stueck {
  text: string
  fett: boolean
  unterstrichen: boolean
}

/** So viele fette Stellen sind höchstens gewollt; darunter ergänzt die Nachprüfung erst ab „wenig" */
export const FETT_HOECHSTENS = 8
export const FETT_WENIG = 3

/**
 * Nur Fettdruck zulassen: HTML-Tags, *kursiv*, Rauten am Zeilenanfang und eine unpaarige
 * Markierung entfernen; leere und doppelte Markierungen zusammenfassen.
 */
export function bereinigeFett(text: string): string {
  let t = String(text ?? '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/^#{1,6}\s+/gm, '')
    // *kursiv* (einzelner Stern, nicht Teil von **) → schlicht
    .replace(/(^|[^*])\*(?!\*)([^*\n]+?)\*(?!\*)/g, '$1$2')
    // Zwei fette Stellen direkt hintereinander („**a****b**") werden eine
    .replace(/(?<!\*)\*{4}(?!\*)/g, '')
    .replace(/\*{3,}/g, '**')
  // Ungerade Zahl an Markierungen: die letzte, unpaarige fällt weg
  if (t.split('**').length % 2 === 0) {
    const letzte = t.lastIndexOf('**')
    t = t.slice(0, letzte) + t.slice(letzte + 2)
  }
  // Fett ohne Inhalt oder nur aus Leerraum fällt weg (nach Lage, damit „**a** **b**" zwei Stellen bleiben)
  return t
    .split('**')
    .map((x, i) => (i % 2 === 1 ? (x.trim() ? `**${x}**` : x) : x))
    .join('')
}

/** Alle Markierungen entfernen (Betreff: steht ohnehin fett) */
export const ohneFett = (text: string): string => bereinigeFett(text).replace(/\*\*/g, '')

/** Zahl der fetten Stellen */
export const fettZahl = (text: string): number => Math.floor(bereinigeFett(text).split('**').length / 2)

// ---------- Rückgabefrist ----------

const MONATSNAMEN = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const WOCHENTAG_KURZ = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
/** Wochentag vor einem Datum („Freitag, ", „Fr, ", „Freitag, den ") – wird mit hervorgehoben */
const WOCHENTAGE = '\\b(?:Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag|Mo|Di|Mi|Do|Fr|Sa|So)\\.?,?\\s+(?:den\\s+)?'

const isoTeile = (iso?: string): { j: number; m: number; t: number } | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '')
  return m ? { j: Number(m[1]), m: Number(m[2]), t: Number(m[3]) } : null
}

/** „Fr, 17.10." aus JJJJ-MM-TT; leer ohne gültiges Datum */
export function fristKurz(iso?: string): string {
  const d = isoTeile(iso)
  if (!d) return ''
  const tag = new Date(d.j, d.m - 1, d.t).getDay()
  return `${WOCHENTAG_KURZ[tag]}, ${String(d.t).padStart(2, '0')}.${String(d.m).padStart(2, '0')}.`
}

/** Erkennt die Frist in einem Text: (Fr, / Freitag,) 17.10. / 17.10.2026 / 17. Oktober (2026), führende Null egal */
export function fristMuster(iso?: string): RegExp | null {
  const d = isoTeile(iso)
  if (!d) return null
  return new RegExp(
    `(?:${WOCHENTAGE})?(?<![\\d.])0?${d.t}\\.\\s?(?:0?${d.m}\\.(?:\\d{4}|\\d{2})?(?!\\d)|${MONATSNAMEN[d.m - 1]}\\b(?:\\s\\d{4})?)`,
    'i'
  )
}

// ---------- Zerlegen für die Ausgabe ----------

/** Text in Stücke zerlegen; ein fettes Stück mit der Frist ist zusätzlich unterstrichen */
export function stuecke(text: string, frist?: RegExp | null): Stueck[] {
  return bereinigeFett(text)
    .split('**')
    .map((t, i) => ({ text: t, fett: i % 2 === 1, unterstrichen: i % 2 === 1 && Boolean(frist?.test(t)) }))
    .filter((s) => s.text)
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** HTML eines Textes: alles maskiert, nur <strong> (und <u> für die Frist) */
export function fettHtml(text: string, frist?: RegExp | null): string {
  return stuecke(text, frist)
    .map((s) => (s.fett ? `<strong>${s.unterstrichen ? `<u>${esc(s.text)}</u>` : esc(s.text)}</strong>` : esc(s.text)))
    .join('')
}

// ---------- Nachprüfung ----------

const MONATE_RE = MONATSNAMEN.join('|')
/** Datum (mit Wochentag), Uhrzeit, Euro-Betrag – nur ganze Angaben, nicht mitten in anderen Zahlen */
const WICHTIG = new RegExp(
  [
    `(?:${WOCHENTAGE})?(?<![\\d.])\\d{1,2}\\.\\s?(?:\\d{1,2}\\.(?:\\d{4}|\\d{2}(?!\\d))?|(?:${MONATE_RE})(?:\\s\\d{4})?)`,
    '(?<![\\d.:])\\d{1,2}[:.]\\d{2}\\s*Uhr|(?<![\\d.:])\\d{1,2}:\\d{2}(?!\\d)|(?<![\\d.:])\\d{1,2}\\s+Uhr',
    '(?<![\\d.,])\\d+(?:[.,]\\d{1,2})?\\s*(?:€|Euro\\b|EUR\\b)'
  ].join('|'),
  'g'
)

/** Fett um passende Angaben im nicht-fetten Teil eines Textes ergänzen; `rest` = wie viele noch dürfen */
function fetteIn(text: string, muster: RegExp, rest: { n: number }): string {
  return bereinigeFett(text)
    .split('**')
    .map((t, i) => {
      if (i % 2 === 1) return t
      return t.replace(new RegExp(muster.source, muster.flags.includes('g') ? muster.flags : muster.flags + 'g'), (treffer) => {
        if (rest.n <= 0) return treffer
        rest.n--
        return `\u0000${treffer}\u0000`
      })
    })
    .join('**')
    .replace(/\u0000/g, '**')
    .replace(/\*\*\*\*/g, '')
}

/**
 * Nach dem Schreiben: Text bereinigen, die Rückgabefrist fett (immer), bei wenig Fettem Datum/Uhrzeit/Betrag
 * ergänzen (bis FETT_HOECHSTENS) und die Frist auf dem Rückmeldeabschnitt wiederholen.
 */
export function briefNachbereiten(t: BriefText, rueckgabeBis?: string): BriefText {
  const frist = fristMuster(rueckgabeBis)
  const absaetze = t.absaetze.map(bereinigeFett)
  // Frist: wo sie steht und noch nicht fett ist, fett machen (zählt nicht gegen die Obergrenze)
  const mitFrist = frist ? absaetze.map((a) => fetteIn(a, frist, { n: 99 })) : absaetze
  const gesamt = mitFrist.reduce((s, a) => s + fettZahl(a), 0)
  const rest = { n: gesamt < FETT_WENIG ? FETT_HOECHSTENS - gesamt : 0 }
  const fertig = mitFrist.map((a) => (rest.n > 0 ? fetteIn(a, WICHTIG, rest) : a))
  let ruecklauf = t.ruecklauf ? { titel: ohneFett(t.ruecklauf.titel), zeilen: t.ruecklauf.zeilen.map(bereinigeFett) } : undefined
  if (ruecklauf && frist) {
    ruecklauf.zeilen = ruecklauf.zeilen.map((z) => fetteIn(z, frist, { n: 99 }))
    if (!ruecklauf.zeilen.some((z) => frist.test(z))) ruecklauf = { ...ruecklauf, zeilen: [`Bitte bis **${fristKurz(rueckgabeBis)}** zurückgeben.`, ...ruecklauf.zeilen] }
  }
  return {
    ...t,
    betreff: ohneFett(t.betreff),
    anrede: ohneFett(t.anrede),
    gruss: ohneFett(t.gruss),
    absaetze: fertig,
    ...(ruecklauf ? { ruecklauf } : {})
  }
}
