/**
 * Namen vor dem Senden an eine KI durch Kürzel ersetzen (Großprogramm 0.4, Rechtspaket).
 *
 * Schülerdaten gehören nicht zu einem KI-Anbieter: Die Länder erlauben die Verarbeitung
 * personenbezogener Daten von Lernenden mit privaten Werkzeugen der Lehrkraft nur eng oder gar
 * nicht, und ein Anbieter außerhalb der EU ist keine Auftragsverarbeitung der Schule. Deshalb
 * sucht die App vor dem Hochladen nach Namen und schlägt vor, sie durch S1, S2 … zu ersetzen.
 *
 * VORSCHLAG, NICHT AUTOMATIK: Vorbelegt sind nur Namen aus Kopfzeilen („Name: Lea Schmidt").
 * Namen im Fließtext sind oft gewollt – „Friedrich Ebert" in einer Geschichtsquelle, „Anna" in
 * einer Lektüre. Die Lehrkraft entscheidet, was ersetzt wird. Namen in Fotos und Scans findet
 * diese Suche nicht (dort gibt es keinen Text); darauf weist der Hinweis ausdrücklich hin.
 *
 * Die Zuordnung Kürzel → Name bleibt im Dokument auf diesem Rechner.
 */
import vornamenDatei from '../../resources/vornamen.json'

const VORNAMEN = new Set((vornamenDatei as { namen: string[] }).namen)

export interface NamensFund {
  name: string
  /** kopf = aus einer Kopfzeile („Name: …"), vorname = bekannter Vorname im Text */
  herkunft: 'kopf' | 'vorname'
  /** Wie oft der Name (oder sein erster Teil) im Text steht */
  anzahl: number
}

export interface Zuordnung {
  kuerzel: string
  name: string
}

const WORT = "[A-ZÄÖÜ][a-zäöüß]+(?:[-'][A-ZÄÖÜa-zäöüß]+)?"
const KOPF = new RegExp(
  `(?:^|\\n|>)\\s*(?:Name|Vor- und Nachname|Vorname|Nachname|Schüler(?:in)?|Schülerin/Schüler|Verfasser(?:in)?|Autor(?:in)?|Klasse/Name)\\s*[:：]\\s*(${WORT}(?:[ \\t]+${WORT}){0,2})`,
  'g'
)
// Wörter, die nach einem Vornamen stehen, aber kein Nachname sind
const KEIN_NACHNAME = new Set([
  'Und',
  'Oder',
  'Der',
  'Die',
  'Das',
  'Den',
  'Dem',
  'Des',
  'Ein',
  'Eine',
  'Im',
  'In',
  'Am',
  'An',
  'Auf',
  'Mit',
  'Von',
  'Zu',
  'Ist',
  'Hat',
  'War',
  'Sagt',
  'Sagte'
])

const zaehle = (text: string, wort: string): number => (text.match(new RegExp(`(?<![\\p{L}])${escape(wort)}(?![\\p{L}])`, 'gu')) ?? []).length
function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Mögliche Personennamen im Text – Kopfzeilen zuerst, dann bekannte Vornamen (mit Nachnamen, wenn einer folgt) */
export function findeNamen(text: string): NamensFund[] {
  const funde = new Map<string, NamensFund>()
  for (const m of text.matchAll(KOPF)) {
    const name = m[1].trim()
    if (!funde.has(name)) funde.set(name, { name, herkunft: 'kopf', anzahl: 0 })
  }
  const vorname = new RegExp(`(?<![\\p{L}])(${WORT})(?:[ \\t]+(${WORT}))?`, 'gu')
  for (const m of text.matchAll(vorname)) {
    if (!VORNAMEN.has(m[1])) continue
    const nach = m[2] && !KEIN_NACHNAME.has(m[2]) && !VORNAMEN.has(m[2]) ? m[2] : ''
    const name = nach ? `${m[1]} ${nach}` : m[1]
    // Steckt der Name schon in einem Kopf-Fund („Lea" in „Lea Schmidt"), nicht doppelt führen
    if ([...funde.values()].some((f) => f.name === name || f.name.split(/\s+/).includes(name))) continue
    if (!funde.has(name)) funde.set(name, { name, herkunft: 'vorname', anzahl: 0 })
  }
  // Einzelne Vornamen, die auch als Teil eines vollen Namens vorkommen, zusammenführen
  for (const f of [...funde.values()])
    if (!f.name.includes(' ') && [...funde.values()].some((g) => g !== f && g.name.split(/\s+/)[0] === f.name)) funde.delete(f.name)
  for (const f of funde.values()) f.anzahl = Math.max(zaehle(text, f.name), zaehle(text, f.name.split(/\s+/)[0]))
  return [...funde.values()].sort((a, b) => (a.herkunft === b.herkunft ? b.anzahl - a.anzahl : a.herkunft === 'kopf' ? -1 : 1))
}

/**
 * Ersetzt die gewählten Namen durch Kürzel. Voller Name, Vorname allein und Nachname allein
 * bekommen dasselbe Kürzel; bestehende Zuordnungen werden fortgeführt (S3 bleibt S3).
 */
export function ersetzeNamen(text: string, namen: string[], bisher: Zuordnung[] = []): { text: string; zuordnung: Zuordnung[] } {
  const zuordnung = [...bisher]
  const kuerzelFuer = (name: string): string => {
    const da = zuordnung.find((z) => z.name === name)
    if (da) return da.kuerzel
    const k = `S${zuordnung.length + 1}`
    zuordnung.push({ kuerzel: k, name })
    return k
  }
  // Längere Formen zuerst, damit „Lea Schmidt" vor „Lea" greift
  const formen: { form: string; kuerzel: string }[] = []
  for (const name of namen) {
    const k = kuerzelFuer(name)
    const teile = name.split(/\s+/)
    formen.push({ form: name, kuerzel: k })
    if (teile.length > 1) for (const t of teile) if (t.length > 2) formen.push({ form: t, kuerzel: k })
  }
  formen.sort((a, b) => b.form.length - a.form.length)
  let out = text
  for (const { form, kuerzel } of formen) out = out.replace(new RegExp(`(?<![\\p{L}])${escape(form)}(?![\\p{L}])`, 'gu'), kuerzel)
  return { text: out, zuordnung }
}

/** Kürzel in einer KI-Antwort wieder durch die Namen ersetzen (nur auf diesem Rechner) */
export function setzeNamenEin(text: string, zuordnung: Zuordnung[]): string {
  let out = text
  for (const z of [...zuordnung].sort((a, b) => b.kuerzel.length - a.kuerzel.length))
    out = out.replace(new RegExp(`(?<![\\p{L}\\d])${z.kuerzel}(?![\\p{L}\\d])`, 'gu'), z.name)
  return out
}
