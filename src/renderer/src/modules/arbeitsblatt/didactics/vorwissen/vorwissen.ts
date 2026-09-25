/**
 * Vorschläge zum Vorwissen der Lerngruppe – ohne KI, aus belegten Tabellen.
 *
 * Wunsch der Lehrkraft (25.09.2026): Beim Feld „Vorwissen der Lerngruppe“ sollen „abhängig vom
 * oben eingegebenen Fach, Thema und ggfs. den Lernzielen Vorschläge zum Vorwissen der
 * Lerngruppe gemacht werden“. Entscheidungen aus der Rücksprache:
 *
 * - Anklickbare Chips; nichts landet ungefragt im Prompt.
 * - Live ohne KI aus Tabellen, themenspezifisch per Knopf mit KI (`ki.ts`).
 * - Fünf Gruppen: Fachliches, Fachbegriffe, Methoden, mögliche Fehlvorstellungen und „noch nicht
 *   behandelt“. Je Gruppe 2–4 sichtbar, insgesamt etwa zwölf.
 * - Jeder Vorschlag nennt seine Herkunft; unsichere sind als „bitte prüfen“ gekennzeichnet.
 * - Reihenfolge statt Jahrgang; Jahrgänge nur, wo sie nachgelesen sind (`ketten.ts`).
 * - Hat das Fach noch nicht begonnen, erscheint ein Hinweis und die Vorschläge passen sich an.
 * - Integrationsfächer: Hinweis, Vorschläge fächerübergreifend.
 * - In Klassenarbeit und Kurztest bedeutet das Feld den geprüften STOFF, nicht das Vorwissen –
 *   dort liefert `stoffVorschlaege` die typischen Inhalte der Einheit.
 */
import { GRAMMAR_TOPICS } from '../grammarTopics'
import { kapitelKurz, LEHRWERK_THEMEN, lehrwerkStand } from '../../../../shared/lehrwerkThemen'
import { defaultSequence, findGrammarTopic, learningYear, topicStart, type LanguageSequence } from '../grammar'
import { subjectById } from '../../model/subjects'
import { STATES } from '../states'
import { KNOTEN, LEHRPLAN, NUR_RICHTWERT, type BelegLand, type Knoten } from './ketten'
import {
  DEUTSCH_PRIMAR,
  DEUTSCH_PRIMAR_QUELLE,
  FACHBEGINN,
  GESELLSCHAFT,
  INFORMATIK_OHNE_PFLICHT,
  INTEGRATION,
  LATEIN_KULTUR,
  METHODEN,
  NAWI,
  SPRACH_METHODEN,
  TRANSFER_AUS_ENGLISCH,
  TRANSFER_QUELLE,
  type Integration
} from './rahmen'

export type VorwissenArt = 'fach' | 'begriff' | 'methode' | 'fehlvorstellung' | 'nochNicht' | 'stoff'

export interface VorwissenVorschlag {
  art: VorwissenArt
  text: string
  /** Herkunft: Lehrplan, Lehrwerk, Forschung – oder „KI-Vorschlag“ */
  quelle: string
  /** Belegt (Lehrplan/Lehrwerk/Forschung) oder nur plausibel („bitte prüfen“) */
  sicher: boolean
  ki?: boolean
}

/** Was die Vorschläge brauchen – unabhängig vom Programm */
export interface VorwissenAnfrage {
  subjectId: string
  topic: string
  grade: number
  stateId: string
  schoolTypeId: string
  learningGoals?: string
  /** Fremdsprachen: 1., 2. oder 3. Fremdsprache */
  languageOrder?: number
  lateStartLanguage?: boolean
  /** Fremdsprachen: gewählter Lehrwerksstand („Green Line 1 bis Green Line 2, bis Unit 3“) */
  lehrwerk?: string
  /** Fremdsprachen: Band und Unit der Auswahl – für die Themen je Unit (shared/lehrwerkThemen.ts) */
  lehrwerkStand?: { buch: string; unit: string; fruehereBaende?: string[] }
}

export interface VorwissenErgebnis {
  vorschlaege: VorwissenVorschlag[]
  hinweise: string[]
  /** Knoten, die zum Thema passen – für die KI und für die Anzeige */
  treffer: string[]
}

export const ART_LABEL: Record<VorwissenArt, string> = {
  fach: 'Fachliches',
  begriff: 'Fachbegriffe',
  methode: 'Methoden',
  fehlvorstellung: 'Mögliche Fehlvorstellungen',
  nochNicht: 'Noch nicht behandelt',
  stoff: 'Typische Inhalte der Einheit'
}

export const ARTEN_VORWISSEN: VorwissenArt[] = ['fach', 'begriff', 'methode', 'fehlvorstellung', 'nochNicht']

/** Höchstens so viele Vorschläge je Gruppe insgesamt (sichtbar sind weniger, der Rest unter „Mehr“) */
const JE_GRUPPE = 10

// ---------------------------------------------------------------- Zeilen im Feld

/**
 * Vorsilben im Freitextfeld.
 *
 * Das Feld bleibt frei editierbar. Die Vorsilbe sagt dem Prompt, welche WIRKUNG eine Zeile hat:
 * voraussetzen, aufgreifen oder nicht voraussetzen. Ohne Vorsilbe gilt eine Zeile als Vorwissen.
 */
export const PRAEFIX = { fehlvorstellung: 'Fehlvorstellung: ', nochNicht: 'Noch nicht behandelt: ' }

export function alsZeile(v: Pick<VorwissenVorschlag, 'art' | 'text'>): string {
  if (v.art === 'fehlvorstellung') return PRAEFIX.fehlvorstellung + v.text
  if (v.art === 'nochNicht') return PRAEFIX.nochNicht + v.text
  return v.text
}

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase()

/** Hängt eine Zeile an – nicht doppelt. */
export function zeileEinfuegen(feld: string, zeile: string): string {
  const zeilen = feld
    .split('\n')
    .map((z) => z.trim())
    .filter(Boolean)
  if (zeilen.some((z) => norm(z) === norm(zeile))) return feld
  return [...zeilen, zeile.trim()].join('\n')
}

/** Steht die Zeile schon im Feld? */
export function steht(feld: string, v: Pick<VorwissenVorschlag, 'art' | 'text'>): boolean {
  const ziel = norm(alsZeile(v))
  return feld.split('\n').some((z) => norm(z) === ziel)
}

export interface VorwissenTeile {
  vorwissen: string[]
  fehlvorstellungen: string[]
  nochNicht: string[]
}

export function teileVorwissen(text: string): VorwissenTeile {
  const t: VorwissenTeile = { vorwissen: [], fehlvorstellungen: [], nochNicht: [] }
  for (const roh of (text ?? '').split('\n')) {
    const z = roh.trim().replace(/^[-•*]\s*/, '')
    if (!z) continue
    const fv = z.match(/^fehlvorstellung(?:en)?\s*:\s*(.+)$/i)
    const nn = z.match(/^noch nicht (?:behandelt|eingeführt|bekannt)\s*:\s*(.+)$/i)
    if (fv) t.fehlvorstellungen.push(fv[1].trim())
    else if (nn) t.nochNicht.push(nn[1].trim())
    else t.vorwissen.push(z)
  }
  return t
}

/**
 * Die Regeln für den Prompt – nach Wirkung getrennt.
 *
 * Entscheidung der Lehrkraft (25.09.2026): Bekanntes nicht neu erklären, Vorwissen aktivieren,
 * an Fehlvorstellungen arbeiten. Grundlage: Expertise-Reversal-Effekt (Kalyuga 2007) – Hilfen,
 * die Anfängern nützen, stören bei Bekanntem; Conceptual Change (Vosniadou; Kattmann u. a.
 * 1997) – Fehlvorstellungen verschwinden nicht, wenn man sie übergeht.
 */
export function vorwissenRegeln(text: string): string {
  const t = teileVorwissen(text)
  if (!t.vorwissen.length && !t.fehlvorstellungen.length && !t.nochNicht.length) return ''
  return [
    t.vorwissen.length ? 'VORWISSEN DER LERNGRUPPE (von der Lehrkraft bestätigt):' : '',
    ...t.vorwissen.map((z) => `- ${z}`),
    t.vorwissen.length
      ? '- Setze dieses Vorwissen voraus: Erkläre es NICHT neu und gib dafür keine Hilfen – Erklärungen und Beispiele gehören dem, was neu ist.'
      : '',
    t.vorwissen.length
      ? '- Ein kurzer Einstieg knüpft ausdrücklich an dieses Vorwissen an (z. B. „Erinnere dich: …“ oder eine kurze Aktivierungsfrage) – höchstens ein Satz oder eine kleine Aufgabe.'
      : '',
    t.fehlvorstellungen.length ? 'MÖGLICHE FEHLVORSTELLUNGEN DER LERNGRUPPE – gezielt aufgreifen:' : '',
    ...t.fehlvorstellungen.map((z) => `- ${z}`),
    t.fehlvorstellungen.length
      ? '- Greife mindestens eine davon in einer Aufgabe auf, etwa als Aussage zum Prüfen oder als Widerspruch zu einer Beobachtung. Stelle sie NIE als richtig dar, und erkläre im Erwartungshorizont, woran man die Fehlvorstellung erkennt.'
      : '',
    t.nochNicht.length ? 'NOCH NICHT BEHANDELT – nicht voraussetzen:' : '',
    ...t.nochNicht.map((z) => `- ${z}`),
    t.nochNicht.length
      ? '- Verwende diese Inhalte, Begriffe und Verfahren NICHT als bekannt. Wo sie sich nicht vermeiden lassen, erkläre sie knapp auf dem Blatt.'
      : ''
  ]
    .filter(Boolean)
    .join('\n')
}

// ---------------------------------------------------------------- Hilfen

const landName = (id: string): string => STATES.find((s) => s.id === id)?.name ?? id
const fachLabel = (id: string): string => subjectById(id).label

function passtSchulform(schulformen: string[] | undefined, schoolTypeId: string): boolean {
  return !schulformen || schulformen.includes(schoolTypeId)
}

/** Greift ein Integrationsfach für diese Lerngruppe? */
export function integrationFuer(a: Pick<VorwissenAnfrage, 'stateId' | 'schoolTypeId' | 'grade' | 'subjectId'>): Integration | undefined {
  const bereich = GESELLSCHAFT.includes(a.subjectId) ? 'gesellschaft' : NAWI.includes(a.subjectId) ? 'nawi' : null
  if (!bereich) return undefined
  return INTEGRATION.find(
    (i) => i.land === a.stateId && i.bereich === bereich && a.grade >= i.von && a.grade <= i.bis && passtSchulform(i.schulformen, a.schoolTypeId)
  )
}

/** Hat das Fach für diese Lerngruppe schon begonnen? */
export function fachbeginnFuer(a: Pick<VorwissenAnfrage, 'stateId' | 'schoolTypeId' | 'grade' | 'subjectId'>) {
  const eintraege = FACHBEGINN.filter((f) => f.fach === a.subjectId && f.land === a.stateId && passtSchulform(f.schulformen, a.schoolTypeId))
  // Der Eintrag mit Schulform ist genauer als der für alle
  const f = eintraege.find((e) => e.schulformen) ?? eintraege[0]
  if (!f || a.grade >= f.ab) return undefined
  return f
}

type Stand = { status: 'bekannt' | 'laufend' | 'spaeter' | 'offen'; quelle: string; sicher: boolean }

/** Wo steht ein Knoten für diese Lerngruppe – nur mit nachgelesenem Jahrgang eindeutig */
function stand(k: Knoten, a: VorwissenAnfrage): Stand {
  const land = a.stateId as BelegLand
  const spanne = LEHRPLAN[land] ? k.jahrgang?.[land] : undefined
  if (!spanne) return { status: 'offen', quelle: '', sicher: false }
  const [von, bis] = spanne
  const kl = von === bis ? `Kl. ${von}` : `Kl. ${von}–${bis}`
  const gym = a.schoolTypeId === 'gymnasium'
  const richtwert = NUR_RICHTWERT.includes(land)
  const quelle = `${LEHRPLAN[land]}, ${kl}${richtwert ? ' (Richtwert – gilt nur ohne Schulcurriculum)' : ''}${gym ? '' : ' (Gymnasium; an dieser Schulform ggf. später)'}`
  const sicher = gym && !richtwert
  if (a.grade > bis) return { status: 'bekannt', quelle, sicher }
  if (a.grade < von) return { status: 'spaeter', quelle, sicher }
  return { status: 'laufend', quelle: `${quelle} – ob schon dran, bitte prüfen`, sicher: false }
}

/** Knoten, die zum Thema oder zu den Lernzielen passen */
export function trefferFuer(a: VorwissenAnfrage, faecher: string[]): Knoten[] {
  const text = ` ${`${a.topic} ${a.learningGoals ?? ''}`.toLowerCase()} `
  if (!text.trim()) return []
  return KNOTEN.filter((k) => faecher.includes(k.fach))
    .map((k) => ({ k, laenge: Math.max(0, ...k.stichwoerter.filter((s) => text.includes(s)).map((s) => s.length)) }))
    .filter((x) => x.laenge > 0)
    .sort((x, y) => y.laenge - x.laenge)
    .slice(0, 3)
    .map((x) => x.k)
}

/** Welche Fächer mitzählen: bei Integrationsfächern die Nachbarfächer */
function faecherFuer(a: VorwissenAnfrage, integration?: Integration): string[] {
  if (integration) return integration.bereich === 'gesellschaft' ? GESELLSCHAFT : NAWI
  if (a.subjectId === 'sachunterricht') return ['sachunterricht']
  // Religion, Ethik und Werte und Normen teilen Themen (Weltreligionen, Menschenwürde …)
  if (a.subjectId === 'religion') return ['religion', 'ethik']
  if (a.subjectId === 'werte-und-normen') return ['ethik', 'religion']
  return [a.subjectId]
}

function ohneDoppel(liste: VorwissenVorschlag[]): VorwissenVorschlag[] {
  const gesehen = new Set<string>()
  return liste.filter((v) => {
    const key = `${v.art}|${norm(v.text)}`
    if (gesehen.has(key)) return false
    gesehen.add(key)
    return true
  })
}

function begrenzt(liste: VorwissenVorschlag[]): VorwissenVorschlag[] {
  const zaehler: Partial<Record<VorwissenArt, number>> = {}
  return liste.filter((v) => {
    zaehler[v.art] = (zaehler[v.art] ?? 0) + 1
    return (zaehler[v.art] ?? 0) <= JE_GRUPPE
  })
}

// ---------------------------------------------------------------- Vorwissen

export function vorwissenVorschlaege(a: VorwissenAnfrage): VorwissenErgebnis {
  const hinweise: string[] = []
  const out: VorwissenVorschlag[] = []
  const fach = subjectById(a.subjectId)

  const integration = integrationFuer(a)
  if (integration)
    hinweise.push(
      `In ${landName(a.stateId)} wird in Klasse ${a.grade} an dieser Schulform meist ${integration.name} unterrichtet (${integration.quelle}). Das Vorwissen kann aus allen Teilfächern stammen – die Vorschläge mischen sie.`
    )
  // Bei einem Integrationsfach ist der Fachbeginn des Einzelfachs kein Hinweis wert: Unterrichtet wird ja
  const beginn = integration ? undefined : fachbeginnFuer(a)
  if (beginn)
    hinweise.push(
      `${beginn.name} beginnt in ${landName(a.stateId)} an dieser Schulform erst in Klasse ${beginn.ab} (${beginn.quelle}). Fachliches Vorwissen stammt hier aus ${beginn.stattdessen}.`
    )
  if (a.subjectId === 'informatik' && INFORMATIK_OHNE_PFLICHT.includes(a.stateId))
    hinweise.push(
      `Informatik ist in ${landName(a.stateId)} kein Pflichtfach (Informatik-Monitor 2025/26). Das Vorwissen hängt davon ab, ob die Gruppe Informatik hatte.`
    )
  if (a.subjectId === 'religion')
    hinweise.push(
      'Ob die Gruppe vorher Religion oder Ethik hatte, bestimmt das Vorwissen stark. Das Ersatzfach Ethik beginnt in vielen Ländern erst in Klasse 7.'
    )

  // --- Fremdsprachen und Latein: Grammatiktabelle, Lehrwerk, Methoden
  if (fach.foreignLanguage || fach.uebersetzungssprache) out.push(...sprachVorschlaege(a))

  // --- Deutsch: der KMK-Übergangsbestand ab Klasse 5
  if (a.subjectId === 'deutsch' && a.grade >= 5)
    for (const text of DEUTSCH_PRIMAR) out.push({ art: 'begriff', text, quelle: DEUTSCH_PRIMAR_QUELLE, sicher: true })

  // --- Ketten
  const faecher = faecherFuer(a, integration)
  const treffer = trefferFuer(a, faecher)
  const trefferIds = new Set(treffer.map((k) => k.id))
  const voraus: Knoten[] = []
  for (const k of treffer)
    for (const id of k.nach ?? []) {
      const v = KNOTEN.find((x) => x.id === id)
      if (v && !trefferIds.has(v.id) && !voraus.includes(v)) voraus.push(v)
    }
  // Zu wenig direkte Voraussetzungen: eine Stufe tiefer
  if (voraus.length < 2)
    for (const v of [...voraus])
      for (const id of v.nach ?? []) {
        const w = KNOTEN.find((x) => x.id === id)
        if (w && !trefferIds.has(w.id) && !voraus.includes(w)) voraus.push(w)
      }

  for (const v of voraus) {
    // Fach noch nicht begonnen: Voraussetzungen aus dem eigenen Fach gibt es nicht
    if (beginn && v.fach === a.subjectId) continue
    const s = stand(v, a)
    const fremd = v.fach !== a.subjectId && !faecher.includes(v.fach) ? ` (${fachLabel(v.fach)})` : ''
    if (s.status === 'spaeter') {
      out.push({ art: 'nochNicht', text: v.titel + fremd, quelle: s.quelle, sicher: s.sicher })
      continue
    }
    const vor = treffer.find((t) => t.nach?.includes(v.id)) ?? treffer[0]
    const quelle = s.status === 'offen' ? `fachliche Reihenfolge: vor „${vor.titel}“ – Jahrgang je nach Lehrplan, bitte prüfen` : s.quelle
    const sicher = s.status === 'bekannt' && s.sicher
    out.push({ art: 'fach', text: v.titel + fremd, quelle, sicher })
    if (v.begriffe?.length) out.push({ art: 'begriff', text: `Begriffe: ${v.begriffe.join(', ')}`, quelle, sicher })
  }
  if (beginn) out.push({ art: 'fach', text: `Vorwissen aus ${beginn.stattdessen}`, quelle: beginn.quelle, sicher: false })

  // Fehlvorstellungen: zuerst die des Themas, dann die der Voraussetzungen
  for (const k of [...treffer, ...voraus])
    for (const f of k.fehlvorstellungen ?? []) out.push({ art: 'fehlvorstellung', text: f.text, quelle: f.quelle, sicher: true })

  // Noch nicht behandelt: was auf dem Thema aufbaut
  for (const k of treffer)
    for (const n of KNOTEN.filter((x) => x.nach?.includes(k.id) && faecher.includes(x.fach) && !trefferIds.has(x.id))) {
      const s = stand(n, a)
      if (s.status === 'bekannt') continue
      out.push({
        art: 'nochNicht',
        text: n.titel,
        quelle: s.status === 'offen' ? `fachliche Reihenfolge: baut auf „${k.titel}“ auf` : s.quelle,
        sicher: s.status === 'spaeter' && s.sicher
      })
    }

  // Methoden: zum Thema gehörige zuerst, dann belegte, dann die jüngsten
  const bezug = new Set([...trefferIds, ...voraus.map((v) => v.id)])
  const methoden = METHODEN.filter((m) => faecher.includes(m.fach) || m.fach === a.subjectId)
  const passend = methoden
    .filter((m) => m.ab <= a.grade)
    .sort(
      (x, y) =>
        Number(Boolean(y.knoten?.some((k) => bezug.has(k)))) - Number(Boolean(x.knoten?.some((k) => bezug.has(k)))) ||
        Number(y.sicher) - Number(x.sicher) ||
        y.ab - x.ab
    )
  for (const m of passend) out.push({ art: 'methode', text: m.text, quelle: m.quelle, sicher: m.sicher })
  for (const m of methoden.filter((m) => m.ab > a.grade && m.knoten?.some((k) => trefferIds.has(k))))
    out.push({ art: 'nochNicht', text: m.text, quelle: `${m.quelle} – meist ab Kl. ${m.ab}`, sicher: false })

  if (!treffer.length && a.topic.trim() && !fach.foreignLanguage && !fach.uebersetzungssprache)
    hinweise.push('Zu diesem Thema ist keine Voraussetzungskette hinterlegt. „Mit KI ergänzen“ schlägt themenbezogen vor.')

  return { vorschlaege: begrenzt(ohneDoppel(out)), hinweise, treffer: treffer.map((k) => k.titel) }
}

// ---------------------------------------------------------------- Fremdsprachen

function sequenzFuer(a: VorwissenAnfrage): LanguageSequence {
  if (a.lateStartLanguage) return 'spaet'
  if (a.languageOrder === undefined) return defaultSequence(a.subjectId, a.grade)
  if (a.languageOrder >= 3) return 'fs3'
  if (a.languageOrder === 2) return 'fs2'
  return 'fs1'
}

export function lernjahrFuer(a: VorwissenAnfrage): number {
  return learningYear(a.grade, sequenzFuer(a), a.stateId)
}

function sprachVorschlaege(a: VorwissenAnfrage): VorwissenVorschlag[] {
  const out: VorwissenVorschlag[] = []
  const seq = sequenzFuer(a)
  const lj = learningYear(a.grade, seq, a.stateId)
  const gym = a.schoolTypeId === 'gymnasium'
  const themen = GRAMMAR_TOPICS.filter((t) => t.subject === a.subjectId && t.scale === 'lernjahr').map((t) => ({ t, start: topicStart(t, seq) }))
  const quelle = (start: number): string => `Grammatiktabelle der App (Lehrpläne und Lehrwerke), Einführung meist Lernjahr ${start}`

  // Das Lehrwerk zuerst: der verlässlichste Beleg, den es für diese Gruppe gibt
  const ausBuch = lehrwerkVorschlaege(a)
  out.push(...ausBuch)
  if (a.lehrwerk && !ausBuch.length) out.push({ art: 'fach', text: `Wortschatz und Themen aus ${a.lehrwerk}`, quelle: 'gewähltes Lehrwerk', sicher: true })
  for (const m of SPRACH_METHODEN.filter((m) => a.subjectId !== 'latein' && m.ab <= lj && (!m.nurEnglisch || a.subjectId === 'englisch')))
    out.push({ art: m.art, text: m.text, quelle: m.quelle, sicher: false })

  /*
   * Grammatik: nur die zuletzt eingeführten sechs Themen. Alles aus den ersten Lernjahren
   * aufzuzählen, verdrängte die übrigen Vorschläge – und wer „present perfect“ braucht, hat
   * „simple present“ ohnehin gehabt.
   */
  for (const { t, start } of themen
    .filter((x) => x.start < lj)
    .sort((x, y) => y.start - x.start)
    // Mit Lehrwerksstand kennt die App die Grammatik der Units genauer – dann genügen drei
    .slice(0, ausBuch.length ? 3 : 6))
    out.push({ art: 'fach', text: `Grammatik: ${t.label}`, quelle: quelle(start), sicher: gym && !t.contested })
  // Noch nicht: die nächsten drei Themen
  for (const { t, start } of themen
    .filter((x) => x.start > lj)
    .sort((x, y) => x.start - y.start)
    .slice(0, 3))
    out.push({ art: 'nochNicht', text: `Grammatik: ${t.label}`, quelle: quelle(start), sicher: gym && !t.contested })

  // Grammatikthema des Blattes: seine typischen Fehler
  const thema = findGrammarTopic(a.subjectId, a.topic)
  if (thema?.errors)
    out.push({ art: 'fehlvorstellung', text: `${thema.label}: ${thema.errors}`, quelle: 'Grammatiktabelle der App: typische Fehler', sicher: true })

  if (a.subjectId === 'latein') {
    if (lj >= 2) out.push({ art: 'fach', text: `Kultur: ${LATEIN_KULTUR.lehrbuch}`, quelle: LATEIN_KULTUR.quelle, sicher: false })
    if (lj <= 3) out.push({ art: 'nochNicht', text: LATEIN_KULTUR.lektuere, quelle: LATEIN_KULTUR.quelle, sicher: false })
    return out
  }

  // 2./3. Fremdsprache: Methoden und Textsorten aus Englisch sind da
  if (a.subjectId !== 'englisch' && seq !== 'fs1')
    for (const text of TRANSFER_AUS_ENGLISCH) out.push({ art: 'methode', text, quelle: TRANSFER_QUELLE, sicher: false })
  return out
}

/**
 * Themen und Grammatik aus den Units vor der gewählten – Wunsch der Lehrkraft vom 25.09.2026.
 * Frühere Bände erscheinen zusammengefasst, die letzten Units des Bandes einzeln, die nächsten
 * Units als „noch nicht behandelt“.
 */
function lehrwerkVorschlaege(a: VorwissenAnfrage): VorwissenVorschlag[] {
  const st = a.lehrwerkStand
  if (!st || !LEHRWERK_THEMEN[st.buch]) return []
  const out: VorwissenVorschlag[] = []
  const quelle = (buch: string, kap?: string): string => `${buch}${kap ? `, ${kap}` : ''} – ${LEHRWERK_THEMEN[buch]?.quelle ?? 'Lehrwerk'}`
  const istUnit = (name: string): boolean => /^(Unit|Topic)\b/.test(name)

  const { vorher, danach } = lehrwerkStand(st.buch, st.unit)
  for (const { name, k } of vorher
    .filter((x) => istUnit(x.name))
    .slice(-4)
    .reverse()) {
    out.push({ art: 'fach', text: `Aus ${name}: ${kapitelKurz(k)}`, quelle: quelle(st.buch, name), sicher: true })
    if (k.grammatik) out.push({ art: 'fach', text: `Grammatik aus ${name}: ${k.grammatik}`, quelle: quelle(st.buch, name), sicher: true })
  }
  for (const band of (st.fruehereBaende ?? []).slice(-2).reverse()) {
    const units = Object.entries(LEHRWERK_THEMEN[band]?.kapitel ?? {}).filter(([name]) => istUnit(name))
    if (units.length) out.push({ art: 'fach', text: `Aus ${band}: ${units.map(([, k]) => k.titel).join(', ')}`, quelle: quelle(band), sicher: true })
  }
  for (const { name, k } of danach.filter((x) => istUnit(x.name)).slice(0, 2))
    out.push({
      art: 'nochNicht',
      text: `${name}: ${kapitelKurz(k)}${k.grammatik ? ` – Grammatik: ${k.grammatik}` : ''}`,
      quelle: quelle(st.buch, name),
      sicher: true
    })
  return out
}

// ---------------------------------------------------------------- Stoff (Klassenarbeit, Kurztest)

/**
 * Typische Inhalte einer Einheit – für „Inhalte der Unterrichtseinheit“ (Klassenarbeit) und
 * „Was wurde unmittelbar vorher behandelt?“ (Kurztest). Entscheidung der Lehrkraft: Dort meint
 * das Feld den geprüften Stoff, also werden Inhalte vorgeschlagen, keine Voraussetzungen.
 */
export function stoffVorschlaege(a: VorwissenAnfrage): VorwissenErgebnis {
  const out: VorwissenVorschlag[] = []
  const fach = subjectById(a.subjectId)
  const treffer = trefferFuer(a, faecherFuer(a, integrationFuer(a)))
  for (const k of treffer) {
    for (const i of k.inhalte ?? []) out.push({ art: 'stoff', text: i, quelle: `typische Inhalte zu „${k.titel}“`, sicher: false })
    if (k.begriffe?.length) out.push({ art: 'stoff', text: `Begriffe: ${k.begriffe.join(', ')}`, quelle: `Fachbegriffe zu „${k.titel}“`, sicher: false })
  }
  // Klassenarbeit mit Lehrwerk: Thema und Grammatik der gewählten Unit sind der Stoff
  const st = a.lehrwerkStand
  const aktuell = st ? lehrwerkStand(st.buch, st.unit).aktuell : undefined
  if (st && aktuell) {
    const quelle = `${st.buch}, ${st.unit} – ${LEHRWERK_THEMEN[st.buch].quelle}`
    out.push({ art: 'stoff', text: `${st.unit}: ${kapitelKurz(aktuell)}`, quelle, sicher: true })
    if (aktuell.grammatik) out.push({ art: 'stoff', text: `Grammatik: ${aktuell.grammatik}`, quelle, sicher: true })
  }
  if (fach.foreignLanguage || fach.uebersetzungssprache) {
    const seq = sequenzFuer(a)
    const lj = learningYear(a.grade, seq, a.stateId)
    for (const t of GRAMMAR_TOPICS.filter((t) => t.subject === a.subjectId && t.scale === 'lernjahr' && [lj, lj - 1].includes(topicStart(t, seq))))
      out.push({
        art: 'stoff',
        text: `Grammatik: ${t.label}`,
        quelle: `Grammatiktabelle der App, Einführung meist Lernjahr ${topicStart(t, seq)}`,
        sicher: false
      })
  }
  const hinweise = !treffer.length && a.topic.trim() ? ['Zu diesem Thema sind keine typischen Inhalte hinterlegt. „Mit KI ergänzen“ schlägt sie vor.'] : []
  return { vorschlaege: begrenzt(ohneDoppel(out)), hinweise, treffer: treffer.map((k) => k.titel) }
}
