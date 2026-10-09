/**
 * Freischaltungen planen (09.10.2026, abgestimmt mit der Lehrkraft): Neben „Jetzt freischalten" gibt es in jedem
 * Freigabe-Dialog „Planen …" – Datum und Uhrzeit (Vorgabe: nächster Schultag 7:30), optional ein Ende („bis"; danach
 * nur noch ansehen). Vokabelabschnitte lassen sich nacheinander freischalten (je Abschnitt ein Datum, vorbelegt im
 * gewählten Abstand), der Testtermin kann am letzten Abschnitt hängen.
 *
 * Kein Zeitplaner auf dem Server: Ob etwas schon frei ist, entscheidet jeder Lesezugriff mit `Date.now()`.
 * Rein rechnend, ohne Datenbank (Server: server/freigabePlan.ts und server/planen.ts; Oberfläche: FreigabePlanen.tsx).
 */
import { abschnitteEinordnen } from './kursAbschnitte'
import { quelleUnits, type Quelle } from './vokabelLaufbahn'
import { verbSchluesselVonWort } from './verbTraining'

/** Was sich planen lässt. Onlinetests startet die Lehrkraft live – sie werden nicht geplant. */
export type PlanTyp = 'vok' | 'gram' | 'blatt' | 'tafel' | 'feedback' | 'reihe'
export const PLAN_TYPEN: PlanTyp[] = ['vok', 'gram', 'blatt', 'tafel', 'feedback', 'reihe']
export const PLAN_NAME: Record<PlanTyp, string> = {
  vok: 'Vokabeln',
  gram: 'Grammatik',
  blatt: 'Arbeitsblatt',
  tafel: 'Tafelbild',
  feedback: 'Schreibaufgabe',
  reihe: 'Unterrichtsreihe'
}

const TAG = 86_400_000
/** Weiter als ein gutes Schuljahr voraus wird nicht geplant */
export const PLAN_HOECHSTENS_TAGE = 400

/** Noch nicht frei? */
export const istGeplant = (ab: number | null | undefined, jetzt = Date.now()): boolean => typeof ab === 'number' && ab > jetzt
/** Ende erreicht (danach nur ansehen)? */
export const istVorbei = (bis: number | null | undefined, jetzt = Date.now()): boolean => typeof bis === 'number' && bis > 0 && bis <= jetzt

/** Nächster Schultag (Mo–Fr, ab morgen) um 7:30 Uhr Ortszeit – Vorgabe für „Planen …" (ohne Ferienkalender) */
export function naechsterSchultag(jetzt = new Date(), stunde = 7, minute = 30): Date {
  const d = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() + 1, stunde, minute, 0, 0)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  return d
}

/** Termine für Abschnitte nacheinander: der erste am Start, jeder weitere `abstandTage` später (gleiche Uhrzeit, auch über die Zeitumstellung) */
export function abschnittsTermine(start: number, anzahl: number, abstandTage: number): number[] {
  const s = new Date(start)
  const schritt = Math.max(0, Math.round(abstandTage))
  return Array.from({ length: Math.max(0, anzahl) }, (_, i) =>
    new Date(s.getFullYear(), s.getMonth(), s.getDate() + i * schritt, s.getHours(), s.getMinutes(), 0, 0).getTime()
  )
}

/** Testtermin am letzten Abschnitt: einen Abstand nach dessen Freischaltung, 8:00 Uhr */
export function testterminNach(letzterAbschnitt: number, abstandTage: number): number {
  const d = new Date(letzterAbschnitt)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + Math.max(1, Math.round(abstandTage)), 8, 0, 0, 0).getTime()
}

/** Angaben der Lehrkraft aus dem Anfragekörper (`plan`) */
export interface PlanEingabe {
  /** Freischalten ab (ms); null = jetzt */
  ab: number | null
  /** Ende (ms); null = offen */
  bis: number | null
  /** Vokabeln: je neuem Abschnitt ein Zeitpunkt (null = jetzt) – sonst gilt `ab` für alle */
  teile: (number | null)[]
  /** Vokabeln: Testtermin hängt am letzten Abschnitt (Abstand in Tagen) */
  testAbstand: number | null
}

/** Zeitpunkt prüfen: in der Zukunft (sonst „jetzt"), höchstens PLAN_HOECHSTENS_TAGE voraus */
function zeitpunkt(x: unknown, jetzt: number): number | null {
  const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() ? Number(x) : NaN
  if (!Number.isFinite(n) || n <= jetzt) return null
  return Math.min(Math.round(n), jetzt + PLAN_HOECHSTENS_TAGE * TAG)
}

export function planBereinigt(roh: unknown, jetzt = Date.now()): PlanEingabe {
  const p = (roh && typeof roh === 'object' ? roh : {}) as Record<string, unknown>
  const ab = zeitpunkt(p.ab, jetzt)
  const bisRoh = typeof p.bis === 'number' && Number.isFinite(p.bis) && p.bis > 0 ? Math.round(p.bis) : null
  const teile = (Array.isArray(p.teile) ? p.teile : []).slice(0, 60).map((t) => zeitpunkt(t, jetzt))
  const abstand = Number(p.testAbstand)
  return {
    ab,
    // Ein Ende vor dem Beginn ergibt keinen Sinn
    bis: bisRoh && bisRoh > (ab ?? jetzt) ? bisRoh : null,
    teile,
    testAbstand: Number.isFinite(abstand) && abstand >= 1 && abstand <= 60 ? Math.round(abstand) : null
  }
}

/** Gibt es überhaupt etwas zu planen? */
export const planLeer = (p: PlanEingabe): boolean => p.ab === null && !p.teile.some((t) => t !== null)

// ---------------------------------------------------------------- Vokabelabschnitte

export interface PlanTeil {
  titel: string
  anzahl: number
  /** Zeitpunkt der Freigabe (bei geplanten der geplante) */
  zeit: number
  /** Geplant ab (ms) – fehlt bei sofort freigegebenen */
  ab?: number
  /** Testtermin hängt an diesem Abschnitt: Abstand in Tagen (09.10.2026) */
  testAbstand?: number
}

/** Wörter je Abschnitt (die Abschnitte stehen hintereinander; Rest zählt zum letzten) – wie shared/kursEntfernen.ts */
function jeTeil<T>(teile: Pick<PlanTeil, 'anzahl'>[], woerter: T[]): T[][] {
  const out: T[][] = []
  let von = 0
  teile.forEach((t, i) => {
    const bis = i === teile.length - 1 ? woerter.length : Math.min(woerter.length, von + Math.max(0, t.anzahl))
    out.push(woerter.slice(von, bis))
    von = bis
  })
  return out
}

/** Nur die schon freien Abschnitte samt ihren Wörtern */
export function freieTeile<T>(teile: PlanTeil[], woerter: T[], jetzt = Date.now()): { teile: PlanTeil[]; woerter: T[] } {
  if (!teile.some((t) => istGeplant(t.ab, jetzt))) return { teile, woerter }
  const je = jeTeil(teile, woerter)
  const frei = teile.map((t, i) => ({ t, w: je[i] })).filter((x) => !istGeplant(x.t.ab, jetzt))
  return { teile: frei.map((x) => ({ ...x.t, anzahl: x.w.length })), woerter: frei.flatMap((x) => x.w) }
}

/** Die geplanten (noch nicht freien) Abschnitte mit ihrer Stelle */
export function geplanteTeile(teile: PlanTeil[], jetzt = Date.now()): (PlanTeil & { index: number; ab: number })[] {
  return teile.flatMap((t, index) => (istGeplant(t.ab, jetzt) ? [{ ...t, index, ab: t.ab! }] : []))
}

/** Neue Abschnitte (ab `start`) mit Zeitpunkten versehen; `zeit` wird zum geplanten Zeitpunkt (für „reif" und „neu") */
export function teilePlanen(teile: PlanTeil[], start: number, plan: PlanEingabe): PlanTeil[] {
  const neu = teile.map((t, i) => {
    if (i < start) return t
    // je Abschnitt ein Zeitpunkt (null = jetzt); fehlen welche, gilt der letzte
    const ab = plan.teile.length ? (i - start < plan.teile.length ? plan.teile[i - start] : plan.teile[plan.teile.length - 1]) : plan.ab
    if (!ab) return t
    return { ...t, ab, zeit: ab }
  })
  if (plan.testAbstand && neu.length > start) {
    const letzte = neu.length - 1
    return neu.map((t, i) => (i === letzte ? { ...t, testAbstand: plan.testAbstand! } : (({ testAbstand: _x, ...rest }) => rest)(t)))
  }
  return neu
}

/** Herkunft ohne die Abschnitte geplanter Teile (Vokabelweg, bekannte Grammatik) */
export function quelleOhneGeplante(quelle: Partial<Quelle> | null, teile: PlanTeil[], jetzt = Date.now()): Partial<Quelle> | null {
  if (!quelle || !teile.some((t) => istGeplant(t.ab, jetzt))) return quelle
  const einordnung = abschnitteEinordnen(teile, quelle)
  const frei = new Set<string>()
  const weg = new Set<string>()
  teile.forEach((t, i) => {
    const e = einordnung[i]
    for (const a of e.name.split(/,\s*|\s·\s/).map((x) => x.trim().toLowerCase())) (istGeplant(t.ab, jetzt) ? weg : frei).add(`${e.unit}|${a}`)
  })
  const units = quelleUnits(quelle)
    .map((u) => ({ unit: u.unit, abschnitte: u.abschnitte.filter((a) => !weg.has(`${u.unit}|${a.trim().toLowerCase()}`) || frei.has(`${u.unit}|${a.trim().toLowerCase()}`)) }))
    .filter((u) => u.abschnitte.length)
  if (!units.length) return null
  const letzte = units[units.length - 1]
  return { ...quelle, unit: letzte.unit, abschnitte: units.flatMap((u) => u.abschnitte), units }
}

/**
 * Verbkarten ohne die Verben geplanter Abschnitte: Eine Karte fällt weg, wenn ihr Verb nur in noch nicht freien Wörtern
 * vorkommt; Karten ohne passendes Wort im Kurs (eigene Ergänzungen der Lehrkraft) bleiben.
 */
export function verbenOhneGeplante<K extends { schluessel: string }>(karten: K[], frei: { term: string }[], geplant: { term: string }[]): K[] {
  const schl = (l: { term: string }[]): Set<string> => new Set(l.map((w) => verbSchluesselVonWort(w.term)).filter(Boolean))
  const f = schl(frei)
  const g = schl(geplant)
  return karten.filter((k) => {
    const s = (k.schluessel ?? '').toLowerCase()
    return f.has(s) || !g.has(s)
  })
}

/** Die Sicht der Lernenden auf einen Vokabelkurs: nur freie Abschnitte, Wörter, Verben und Herkunft (JSON-Spalten bleiben JSON) */
export function kursFuerLernende<Z extends { teile?: string; woerter: string; titel: string; erstellt: string; quelle?: string; verben?: string }>(
  z: Z,
  jetzt = Date.now()
): Z {
  // Schneller Weg: ohne geplante Abschnitte bleibt alles, wie es ist
  if (!z.teile || !z.teile.includes('"ab"')) return z
  let teile: PlanTeil[]
  let woerter: unknown[]
  try {
    teile = JSON.parse(z.teile) as PlanTeil[]
    woerter = JSON.parse(z.woerter || '[]') as unknown[]
  } catch {
    return z
  }
  if (!Array.isArray(teile) || !teile.some((t) => istGeplant(t.ab, jetzt))) return z
  const f = freieTeile(teile, woerter, jetzt)
  let quelle = z.quelle
  try {
    if (z.quelle) {
      const q = quelleOhneGeplante(JSON.parse(z.quelle) as Partial<Quelle>, teile, jetzt)
      quelle = q ? JSON.stringify(q) : ''
    }
  } catch {
    /* Herkunft unlesbar – bleibt */
  }
  let verben = z.verben
  try {
    if (z.verben) {
      const v = JSON.parse(z.verben) as { karten?: { schluessel: string }[] }
      if (Array.isArray(v.karten)) {
        const freiSet = new Set(f.woerter)
        const geplant = woerter.filter((w) => !freiSet.has(w)) as { term: string }[]
        verben = JSON.stringify({ ...v, karten: verbenOhneGeplante(v.karten, f.woerter as { term: string }[], geplant) })
      }
    }
  } catch {
    /* Verben unlesbar – bleiben */
  }
  return {
    ...z,
    teile: JSON.stringify(f.teile),
    woerter: JSON.stringify(f.woerter),
    ...(z.quelle !== undefined ? { quelle } : {}),
    ...(z.verben !== undefined ? { verben } : {})
  }
}

/**
 * Code-Seite eines Kurses (09.10.2026): Ist noch kein Abschnitt frei, wann kommt der erste? null = schon etwas frei
 * (oder nichts geplant).
 */
export function ersteFreischaltung(teileJson: string | undefined, jetzt = Date.now()): number | null {
  if (!teileJson || !teileJson.includes('"ab"')) return null
  try {
    const teile = JSON.parse(teileJson) as PlanTeil[]
    if (!Array.isArray(teile) || !teile.length || teile.some((t) => !istGeplant(t.ab, jetzt))) return null
    return Math.min(...teile.map((t) => t.ab!))
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- Lernende: „Demnächst" und „Neu freigeschaltet"

export interface PlanEintrag {
  typ: PlanTyp
  /** Kennung des Materials (Vokabeln: Kurs) */
  id: string
  /** Vokabeln: Stelle des Abschnitts */
  teil?: number
  titel: string
  fach: string
  ab: number
}

/** Seit dem letzten Hinweis frei geworden (gesehenBis = letzter Hinweis; ohne: die letzten 7 Tage) */
export function neuFreigeschaltet<T extends Pick<PlanEintrag, 'ab'>>(liste: T[], gesehenBis: number | null, jetzt = Date.now()): T[] {
  const seit = gesehenBis ?? jetzt - 7 * TAG
  return liste.filter((e) => e.ab > seit && e.ab <= jetzt).sort((a, b) => a.ab - b.ab)
}

/** „Mo, 13.10." */
export const kurzDatum = (ms: number): string =>
  new Date(ms).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })

/** „Ab Mo, 13.10.: Unit 2 · Station 1" (mit Uhrzeit, wenn nicht 7:30 oder früher) */
export function demnaechstText(e: Pick<PlanEintrag, 'ab' | 'titel'>): string {
  const d = new Date(e.ab)
  const uhr = d.getHours() * 60 + d.getMinutes() > 7 * 60 + 30 ? `, ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr` : ''
  return `Ab ${kurzDatum(e.ab)}${uhr}: ${e.titel}`
}
