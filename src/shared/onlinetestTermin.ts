/**
 * Termin eines Onlinetests (10.10.2026, Entscheidung der Lehrkraft): Jeder Onlinetest kann einen Tag bekommen. Der Tag
 * steht im Namen („Vokabeltest Unit 3 – Fr 17.10."; ein Datum im Namen wird ersetzt). „Für Lernende ausblenden" (Vorgabe:
 * aus = sichtbar) verbirgt die Ankündigung. Gestartet wird weiter von der Lehrkraft – der Termin startet nichts.
 *
 * Sichtbar angekündigt heißt für die Lernenden:
 *  - ab 7 Tagen vorher „Als Nächstes" auf der Startseite („Vokabeltest am Fr 17.10. – jetzt Unit 3 üben"),
 *  - in den 3 Tagen davor stellt die Sprachrunde auf den Teststoff um (Vokabeltests: wie der Testtermin des Kurses),
 *  - in der Liste der Tests: „angekündigt – startet, wenn deine Lehrkraft ihn freigibt",
 *  - Erinnerung „Test bald" (server/erinnerungen.ts).
 * Rein rechnend; Speicher in server/onlinetest.ts (einstellungen.termin, einstellungen.terminVerborgen).
 */
import { berlinMs } from './erinnerungen'
import { fachAusName } from './faecher'
import { tagVon, wochentag } from './schulkalender'

const TAG = 86_400_000
const TAG_RE = /^\d{4}-\d{2}-\d{2}$/
const WT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

/** So viele Tage vorher steht die Ankündigung unter „Als Nächstes" */
export const ANKUENDIGUNG_TAGE = 7

/** Gültiger Tag „JJJJ-MM-TT" oder null */
export function terminBereinigt(roh: unknown): string | null {
  const s = String(roh ?? '').trim()
  if (!TAG_RE.test(s)) return null
  const [j, m, t] = s.split('-').map(Number)
  const d = new Date(Date.UTC(j, m - 1, t))
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t ? s : null
}

/** „Fr 17.10." */
export const terminKurz = (tag: string): string => `${WT[wochentag(tag) - 1]} ${tag.slice(8, 10)}.${tag.slice(5, 7)}.`

/** Zeitpunkt des Termins (8 Uhr Berliner Zeit) – wie der Testtermin eines Kurses */
export const terminMs = (tag: string): number => berlinMs(tag, 8 * 60)

/** Datum im Namen: „03.10.2026", „3.10.26", „Fr 17.10.", „Fr., 17.10." – auch ohne Jahr, wenn zweistellig oder mit Wochentag */
const DATUM_IM_NAMEN = /(?:\b(Mo|Di|Mi|Do|Fr|Sa|So)\.?,?\s+)?(?<![\d.])(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2}(?!\d))?/g

/**
 * Name mit Termin: Steht schon ein Datum im Namen, tritt der Termin an seine Stelle, sonst kommt er hinten an
 * („Vokabeltest Unit 3" → „Vokabeltest Unit 3 – Fr 17.10."). Ohne Termin bleibt der Name, wie er ist.
 */
export function nameMitTermin(name: string, tag: string | null | undefined): string {
  const t = tag ? terminBereinigt(tag) : null
  if (!t) return name
  const neu = terminKurz(t)
  let ersetzt = false
  const aus = name.replace(DATUM_IM_NAMEN, (ganz, wt: string | undefined, tagZ: string, monat: string, jahr: string | undefined) => {
    if (ersetzt) return ganz
    // „Unit 3.1." ist kein Datum: ohne Wochentag und Jahr nur zweistellig („17.10.")
    if (!wt && !jahr && (tagZ.length < 2 || monat.length < 2)) return ganz
    if (Number(tagZ) < 1 || Number(tagZ) > 31 || Number(monat) < 1 || Number(monat) > 12) return ganz
    ersetzt = true
    return neu
  })
  if (ersetzt) return aus
  const basis = name.trim()
  return basis ? `${basis} – ${neu}` : neu
}

/** Die Einstellungen eines Onlinetests, soweit sie den Termin betreffen */
export interface TerminAngaben {
  termin?: string | null
  terminVerborgen?: boolean
}

/** Termin für die Lernenden sichtbar? (gesetzt und nicht ausgeblendet) */
export const terminSichtbar = (e: TerminAngaben | null | undefined): boolean => Boolean(e && terminBereinigt(e.termin) && !e.terminVerborgen)

/** Tage bis zum Termin (heute = 0, morgen = 1; vorbei: negativ) – nach Berliner Kalendertagen */
export function tageBis(tag: string, jetzt = Date.now()): number {
  const heute = tagVon(jetzt)
  const a = Date.UTC(+heute.slice(0, 4), +heute.slice(5, 7) - 1, +heute.slice(8, 10))
  const b = Date.UTC(+tag.slice(0, 4), +tag.slice(5, 7) - 1, +tag.slice(8, 10))
  return Math.round((b - a) / TAG)
}

/** Ankündigung unter „Als Nächstes" fällig: heute bis 7 Tage vorher */
export const ankuendigungFaellig = (tag: string, jetzt = Date.now()): boolean => {
  const n = tageBis(tag, jetzt)
  return n >= 0 && n <= ANKUENDIGUNG_TAGE
}

/** Zum Üben passender Teil: „Unit 3" aus dem Thema („Green Line 3 - Unit 3 - Station 1" → „Unit 3 - Station 1") */
export function uebThema(thema: string | null | undefined): string {
  const t = String(thema ?? '').trim()
  if (!t) return ''
  const unit = /\b(Unit|Lektion|Lec?ción|Unité|Unità|Kapitel|Chapter|Module|Modul|Station|Topic|Theme)\b.*$/i.exec(t)
  return (unit ? unit[0] : t).slice(0, 60)
}

/**
 * Text der Ankündigung (Lernende, „du"): „Vokabeltest am Fr 17.10. – jetzt Unit 3 üben"; heute/morgen statt Datum.
 * Ohne Thema: „Vokabeltest am Fr 17.10. – jetzt üben" bzw. bei anderen Testarten „– bereite dich vor".
 */
export function ankuendigungText(t: { art?: string | null; termin: string; thema?: string | null }, jetzt = Date.now()): string {
  const art = (t.art || 'Test').trim()
  const n = tageBis(t.termin, jetzt)
  const wann = n === 0 ? 'heute' : n === 1 ? `morgen (${terminKurz(t.termin)})` : `am ${terminKurz(t.termin)}`
  const thema = uebThema(t.thema)
  const zum = art === 'Vokabeltest' || art === 'Grammatiktest' ? (thema ? `jetzt ${thema} üben` : 'jetzt üben') : 'bereite dich vor'
  return `${art} ${wann} – ${zum}`
}

/** Status-Text in der Liste der Lernenden */
export const ANGEKUENDIGT_TEXT = 'angekündigt – startet, wenn deine Lehrkraft ihn freigibt'

/** Zeile unter einem angekündigten Test: „Fr 17.10. · 20 Minuten · angekündigt – startet, …" – sonst null */
export function testStatusText(t: { wartend: boolean; termin?: string | null; zeitMin: number }): string | null {
  if (!t.wartend || !t.termin || !terminBereinigt(t.termin)) return null
  return `${terminKurz(t.termin)} · ${t.zeitMin} Minuten · ${ANGEKUENDIGT_TEXT}`
}

/** Ein angekündigter Onlinetest, wie ihn die Sprachrunde braucht */
export interface OnlineTermin {
  lerngruppeId: string | null
  art: string
  fach: string
  zielsprache: string
  termin: string
}

/**
 * Testtermin eines Sprachkurses mit den angekündigten Vokabeltests seiner Lerngruppe (gleiches Fach oder gleiche
 * Sprache): der frühere von Kurstermin und Onlinetest-Termin, der heute oder später liegt – derselbe Mechanismus wie der
 * Testtermin des Kurses (Sprachrunde stellt in den 3 Tagen davor auf den Teststoff um).
 */
export function kursTerminMitOnlinetests(
  kurs: { lerngruppe_id?: string | null; fach?: string | null; sprache?: string | null; test_termin?: number | null },
  tests: OnlineTermin[],
  jetzt = Date.now()
): number | null {
  const eigener = typeof kurs.test_termin === 'number' ? kurs.test_termin : null
  return kursTestMitOnlinetests(kurs, tests, jetzt)?.termin ?? eigener
}

/**
 * Wie `kursTerminMitOnlinetests`, aber mit der Quelle (12.10.2026, Abschnitte des Tests): der frühere von Kurstermin und
 * Onlinetest-Termin (ab gestern), dazu der Onlinetest, wenn er es ist. null = kein solcher Termin.
 */
export function kursTestMitOnlinetests<T extends OnlineTermin>(
  kurs: { lerngruppe_id?: string | null; fach?: string | null; sprache?: string | null; test_termin?: number | null },
  tests: T[],
  jetzt = Date.now()
): { termin: number; online: T | null } | null {
  const eigener = typeof kurs.test_termin === 'number' ? kurs.test_termin : null
  const gruppe = kurs.lerngruppe_id || ''
  const fachId = (x: string | null | undefined): string => (x ? (fachAusName(x)?.id ?? x.trim().toLowerCase()) : '')
  const fach = fachId(kurs.fach)
  const sprache = String(kurs.sprache ?? '').toLowerCase()
  const heute = tagVon(jetzt)
  const online = tests
    .filter(
      (t) =>
        t.art === 'Vokabeltest' &&
        gruppe &&
        t.lerngruppeId === gruppe &&
        t.termin >= heute &&
        ((fach && fachId(t.fach) === fach) || (sprache && t.zielsprache.toLowerCase() === sprache))
    )
    .map((t) => ({ termin: terminMs(t.termin), online: t as T | null }))
  const kandidaten = [...(eigener !== null ? [{ termin: eigener, online: null as T | null }] : []), ...online].filter((x) => x.termin >= jetzt - TAG)
  if (!kandidaten.length) return null
  // Bei gleichem Tag gilt der Kurstermin (seine Auswahl der Lehrkraft)
  return kandidaten.reduce((a, b) => (b.termin < a.termin ? b : a))
}

/**
 * Eintrag „Test bald" im Handlungsbedarf von „Meine Klassen" (Lehrkraft): angekündigter Test in den nächsten 7 Tagen,
 * nur wenn er für die Lernenden sichtbar ist (ausgeblendete stehen nur in der Liste der Onlinetests).
 */
export function onlinetestBaldBedarf(
  t: { id: string; titel: string; termin: string; verborgen?: boolean },
  jetzt = Date.now()
): { text: string; schluessel: string; merkmal: { art: 'termin'; termin: number } } | null {
  if (t.verborgen || !terminBereinigt(t.termin) || !ankuendigungFaellig(t.termin, jetzt)) return null
  const n = tageBis(t.termin, jetzt)
  const wann = n === 0 ? 'heute' : n === 1 ? `morgen (${terminKurz(t.termin)})` : `am ${terminKurz(t.termin)}`
  return {
    text: `Onlinetest „${t.titel}" ${wann} – noch nicht gestartet`,
    schluessel: `onlinetest-termin:${t.id}`,
    merkmal: { art: 'termin', termin: terminMs(t.termin) }
  }
}
