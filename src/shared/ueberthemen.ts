/**
 * Überthemen für Materialien einer Lerngruppe (19.10.2026, abgestimmt mit der Lehrkraft).
 *
 * Ein Überthema ist das Thema aus dem Lehrplan des Landes für Fach, Schulform und Jahrgang („Industrialisierung und
 * Soziale Frage"); ein schulinternes Curriculum (Fach-Vorgaben, themen[jahrgang]) geht vor. In der Qualifikationsphase
 * (bisher nur Niedersachsen, resources/lehrplaene/oberstufe/NI.json) ist das Überthema das Rahmenthema, darunter steht
 * das Kern-, Wahlpflicht- oder Wahlmodul; die Halbjahre (Q1.1 … Q2.2) kommen aus KC bzw. Abitur-Hinweisen des
 * Abiturjahrgangs, sonst aus dem Datum der Freigabe.
 *
 * Zuordnung OHNE KI (Entscheidung der Lehrkraft): erst der Wortlaut (Thema bzw. Oberthema der Reihe nennt ein
 * Überthema), dann ein Stichwort-Abgleich mit Thema, Stichwörtern und Unterthemen des Lehrplans. Was nicht passt, steht
 * unter „Weitere Materialien"; die Lehrkraft kann jedes Material umhängen und Überthemen je Lerngruppe umbenennen.
 *
 * Belegt: Lehrplan-Einträge und die Q-Phase-Struktur (Recherche 19.10.2026, Quellen in der Datendatei).
 * Faustregel: die Schwelle des Stichwort-Abgleichs und das Halbjahr aus dem Datum (2. Halbjahr ab Februar).
 */
import type { LehrplanEintrag, LehrplanUnterthema } from './lehrplan'

export const WEITERE = 'weitere'

export interface UeberthemaKandidat {
  /** fv:<thema> · kc:<thema> · rt:<rahmenthema> */
  schluessel: string
  name: string
  /** Reihenfolge im Lehrplan bzw. Curriculum (für frühere Jahrgänge: chronologisch nach Plan) */
  rang: number
  /** Stämme der Wörter aus Thema, Stichwörtern und Unterthemen */
  worte: string[]
  /** Stämme nur aus dem Namen – zählen doppelt */
  namensWorte: string[]
  /** Q-Phase: Halbjahr laut KC/Abitur-Hinweisen */
  semester?: string
  /** Q-Phase: Module des Rahmenthemas (Name → Art) */
  module?: { name: string; art: string; worte: string[] }[]
}

/** Ein Fach der Q-Phase-Daten (Recherche, gekürzt) */
export interface OberstufeFach {
  reihenfolgeFest: 'kc' | 'abitur' | 'frei'
  struktur: { bereich?: string; thema: string; modul?: string; art?: string; lokalThema?: string | null }[]
  abitur?: Record<string, Partial<Record<'eA' | 'gA', { semester: string; bereich?: string; themen?: string[]; lokalThemen?: string[] }[]>>>
}

const STOPP = new Set(
  'und oder der die das den dem des ein eine einer eines einem einen mit von vom zur zum für fuer über ueber unter nach aus bei auf als wie im in an am zu bis seit durch gegen ohne um sowie their the and of to from with into seine ihre ihrer sich nicht auch'.split(
    ' '
  )
)

/** Wörter → Stämme (klein, ohne Akzente/Umlaute, ab 4 Zeichen, auf 6 gekürzt) */
export function stamme(text: string): string[] {
  const roh = text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
  return [...new Set(roh.filter((w) => w.length >= 4 && !STOPP.has(w)).map((w) => w.slice(0, 6)))]
}

const norm = (s: string): string => stamme(s).join(' ')

function unterNamen(u: LehrplanUnterthema[] | undefined, tiefe = 0): string[] {
  if (!u || tiefe > 3) return []
  return u.flatMap((x) => [x.thema, ...unterNamen(x.unterthemen, tiefe + 1)])
}

/** Halbjahr der Q-Phase aus Datum und Jahrgang: Jg 12 → Q1.x, Jg 13 → Q2.x; 2. Halbjahr ab Februar (Faustregel) */
export function semesterVon(ms: number, jahrgang: number, ersterQJahrgang = 12): string | null {
  const q = jahrgang - ersterQJahrgang + 1
  if (q < 1 || q > 2) return null
  const monat = new Date(ms).getMonth() + 1
  const zweites = monat >= 2 && monat <= 7
  return `Q${q}.${zweites ? 2 : 1}`
}

/** Abiturjahr eines Kurses: Jahrgang 12 im Schuljahr 2026/27 → 2028 (Abitur nach Jahrgang 13) */
export const abiturjahrVon = (jahrgang: number, schuljahrBeginn: number, letzterJahrgang = 13): number => schuljahrBeginn + 1 + (letzterJahrgang - jahrgang)

const SEMESTER = ['Q1.1', 'Q1.2', 'Q2.1', 'Q2.2']

/**
 * Kandidaten für Fach und Jahrgang. Reihenfolge: Fach-Vorgaben, dann Q-Phase-Daten (ab Jahrgang 12, wenn vorhanden),
 * sonst Lehrplan-Einträge des Jahrgangs (verbindliche vor empfohlenen).
 */
export function kandidatenFuer(p: {
  lehrplan: LehrplanEintrag[]
  fachId: string
  schulformen: string[]
  jahrgang: number | undefined
  fachvorgaben?: string[]
  oberstufe?: OberstufeFach | null
  abiturjahr?: number
  niveau?: 'eA' | 'gA'
}): UeberthemaKandidat[] {
  const aus: UeberthemaKandidat[] = []
  const schon = new Set<string>()
  const dazu = (k: UeberthemaKandidat): void => {
    const n = norm(k.name)
    if (!n || schon.has(n)) return
    schon.add(n)
    aus.push(k)
  }
  for (const [i, t] of (p.fachvorgaben ?? []).entries()) dazu({ schluessel: `fv:${t}`, name: t, rang: i, worte: stamme(t), namensWorte: stamme(t) })
  const q = p.jahrgang && p.jahrgang >= 12 && p.oberstufe ? p.oberstufe : null
  if (q) {
    // Halbjahr je Rahmenthema: Abitur-Hinweise des Jahrgangs, sonst feste KC-Reihenfolge (Rahmenthema n = n-tes Halbjahr)
    const plan = p.abiturjahr ? q.abitur?.[String(p.abiturjahr)]?.[p.niveau ?? 'eA'] ?? q.abitur?.[String(p.abiturjahr)]?.gA : undefined
    const bereiche = [...new Set(q.struktur.map((s) => s.bereich ?? s.thema))]
    for (const [i, b] of bereiche.entries()) {
      const module = q.struktur.filter((s) => (s.bereich ?? s.thema) === b)
      const semester =
        plan?.find((x) => (x.bereich ?? '').split(' + ').some((y) => y.trim() === b) || (x.themen ?? []).some((y) => y.trim() === b))?.semester ??
        (q.reihenfolgeFest === 'kc' && bereiche.length === 4 ? SEMESTER[i] : undefined)
      dazu({
        schluessel: `rt:${b}`,
        name: b,
        rang: semester ? SEMESTER.indexOf(semester) * 100 + i : 1000 + i,
        worte: stamme([b, ...module.map((m) => m.thema)].join(' ')),
        namensWorte: stamme(b.replace(/^Rahmenthema\s*\d+\s*:\s*/i, '')),
        ...(semester ? { semester } : {}),
        module: module.map((m) => ({ name: m.thema, art: m.art ?? '', worte: stamme(m.thema) }))
      })
    }
    if (aus.length) return aus
  }
  const passend = p.lehrplan.filter(
    (e) =>
      e.fach === p.fachId &&
      (!p.jahrgang || !e.jahrgaenge?.length || e.jahrgaenge.includes(p.jahrgang)) &&
      (!e.schulformen?.length || !p.schulformen.length || e.schulformen.some((s) => p.schulformen.includes(s)))
  )
  const rangV = (e: LehrplanEintrag): number => (e.verbindlichkeit === 'verbindlich' ? 0 : e.verbindlichkeit === 'wahlpflicht' ? 1 : 2)
  passend
    .map((e, i) => ({ e, i }))
    .sort((a, b) => rangV(a.e) - rangV(b.e) || a.i - b.i)
    .forEach(({ e, i }) =>
      dazu({
        schluessel: `kc:${e.thema}`,
        name: e.thema,
        rang: 100 + i,
        worte: stamme([e.thema, ...(e.stichwoerter ?? []), ...unterNamen(e.unterthemen)].join(' ')),
        namensWorte: stamme(e.thema)
      })
    )
  return aus
}

/** Material, wie es zugeordnet wird */
export interface MaterialText {
  titel: string
  thema?: string
  /** Oberthema der Reihe, aus der es stammt */
  oberthema?: string
}

/** Bestes Überthema (und in der Q-Phase das Modul) – null = „Weitere Materialien" */
export function zuordnen(m: MaterialText, kandidaten: UeberthemaKandidat[]): { kandidat: UeberthemaKandidat; modul?: string } | null {
  if (!kandidaten.length) return null
  // 1) Wortlaut: Thema oder Oberthema nennt ein Überthema bzw. Modul
  for (const t of [m.oberthema, m.thema].filter((x): x is string => Boolean(x?.trim()))) {
    const n = norm(t)
    if (!n) continue
    for (const k of kandidaten) {
      if (norm(k.name) === n) return { kandidat: k }
      const mod = k.module?.find((x) => norm(x.name) === n)
      if (mod) return { kandidat: k, modul: mod.name }
    }
  }
  // 2) Stichwörter: Namenswörter zählen doppelt, mindestens 2 Punkte
  const mw = new Set(stamme([m.titel, m.thema ?? '', m.oberthema ?? ''].join(' ')))
  if (!mw.size) return null
  let best: { k: UeberthemaKandidat; punkte: number } | null = null
  for (const k of kandidaten) {
    const name = new Set(k.namensWorte)
    let punkte = 0
    for (const w of new Set(k.worte)) if (mw.has(w)) punkte += name.has(w) ? 2 : 1
    if (punkte >= 2 && (!best || punkte > best.punkte || (punkte === best.punkte && k.rang < best.k.rang))) best = { k, punkte }
  }
  if (!best) return null
  // Modul der Q-Phase: das mit den meisten gemeinsamen Wörtern
  const mod = best.k.module
    ?.map((x) => ({ x, n: x.worte.filter((w) => mw.has(w)).length }))
    .filter((y) => y.n > 0)
    .sort((a, b) => b.n - a.n)[0]
  return { kandidat: best.k, ...(mod ? { modul: mod.x.name } : {}) }
}
