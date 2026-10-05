/**
 * Auswertung freigegebener Blätter je Person (05.10.2026, Wunsch der Lehrkraft).
 *
 * „Ein grüner Button soll anzeigen, dass ein Schüler die Aufgabe(n) korrekt und eigenständig erledigt hat.
 * Ein orangener … mit Einschränkungen korrekt und/oder mit Einschränkungen eigenständig. Ein roter …
 * inkorrekt und/oder uneigenständig. Die Übergänge sollen graduell sein." Dazu eine Plausibilitätsprüfung
 * je Aufgabe: Art der Eingabe (Dauer, selbst eingetippte Zeichen …) und gleiche/ähnliche Ergebnisse.
 *
 * Reine Rechnungen ohne Datenbank und ohne KI – der Server sammelt, die Oberfläche zeigt (Tests:
 * tests/blattAuswertung.test.ts). Das Urteil über Mitarbeit und Hilfen fällt die KI (Vorschlag).
 */

/** Eingabeverhalten je Feld: getippte und auf einmal eingefügte Zeichen, aktive Zeit, Änderungen */
export interface FeldEingabe {
  g: number
  e: number
  ms: number
  n: number
}

/** Schlüssel in den Antworten: Eingabeverhalten und Zuordnung Feld → Aufgabe */
export const PLAUS_SCHLUESSEL = 'plaus'
export const ZUORDNUNG_SCHLUESSEL = 'zuordnung'

/** Ab so vielen Zeichen in EINER Änderung gilt es als eingefügt (Einfügen, Ziehen, Diktat) */
export const EINGEFUEGT_AB = 16
/** Pausen über 45 s zählen nicht als Bearbeitungszeit */
export const PAUSE_MS = 45_000

/** Eine Änderung eines Feldes verbuchen */
export function eingabeVerbuchen(alt: FeldEingabe | undefined, vorher: string, nachher: string, seitLetzter: number): FeldEingabe {
  const a = alt ?? { g: 0, e: 0, ms: 0, n: 0 }
  const dazu = Math.max(0, nachher.length - vorher.length)
  const zeit = seitLetzter > 0 && seitLetzter < PAUSE_MS ? seitLetzter : 0
  return {
    g: a.g + (dazu < EINGEFUEGT_AB ? dazu : 0),
    e: a.e + (dazu >= EINGEFUEGT_AB ? dazu : 0),
    ms: a.ms + zeit,
    n: a.n + 1
  }
}

export function eingabenAus(roh: unknown): Record<string, FeldEingabe> {
  const aus: Record<string, FeldEingabe> = {}
  let o: unknown = roh
  if (typeof roh === 'string') {
    try {
      o = JSON.parse(roh)
    } catch {
      return aus
    }
  }
  if (!o || typeof o !== 'object') return aus
  for (const [k, v] of Object.entries(o as Record<string, unknown>).slice(0, 1000)) {
    if (!/^f\d{1,3}$/.test(k) || !v || typeof v !== 'object') continue
    const x = v as Record<string, unknown>
    const zahl = (y: unknown, max: number): number => Math.max(0, Math.min(max, Math.round(Number(y) || 0)))
    aus[k] = { g: zahl(x.g, 1e6), e: zahl(x.e, 1e6), ms: zahl(x.ms, 1e9), n: zahl(x.n, 1e6) }
  }
  return aus
}

export function zuordnungAus(roh: unknown): Record<string, number> {
  const aus: Record<string, number> = {}
  let o: unknown = roh
  if (typeof roh === 'string') {
    try {
      o = JSON.parse(roh)
    } catch {
      return aus
    }
  }
  if (!o || typeof o !== 'object') return aus
  for (const [k, v] of Object.entries(o as Record<string, unknown>).slice(0, 1000))
    if (/^f\d{1,3}$/.test(k) && Number.isInteger(v) && Number(v) > 0) aus[k] = Number(v)
  return aus
}

/** Text vergleichbar machen: klein, ohne Satzzeichen, Leerraum zusammengefasst */
export const normiert = (t: string): string =>
  t
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Ähnlichkeit zweier Antworten (0…1): Überlappung der Drei-Wort-Folgen (bei kurzen Texten der Wörter) */
export function aehnlichkeit(a: string, b: string): number {
  const x = normiert(a).split(' ').filter(Boolean)
  const y = normiert(b).split(' ').filter(Boolean)
  if (!x.length || !y.length) return 0
  const folgen = (w: string[]): Set<string> => {
    const n = w.length >= 6 ? 3 : 1
    const s = new Set<string>()
    for (let i = 0; i + n <= w.length; i++) s.add(w.slice(i, i + n).join(' '))
    return s
  }
  const fa = folgen(x)
  const fb = folgen(y)
  let gemeinsam = 0
  for (const f of fa) if (fb.has(f)) gemeinsam++
  return gemeinsam / Math.max(1, Math.min(fa.size, fb.size))
}

/** Erst ab dieser Länge vergleichen – kurze Antworten („1914", „richtig") sind zwangsläufig gleich */
export const VERGLEICH_AB_ZEICHEN = 40
export const AEHNLICH_AB = 0.75

/**
 * Gruppen gleicher/ähnlicher Antworten einer Aufgabe: Personen-Kennung → Text; liefert Gruppen mit
 * mindestens zwei Personen. `gleich`: wortgleich nach dem Normieren.
 */
export function gleicheAbgaben(antworten: Record<string, string>): { personen: string[]; gleich: boolean; wert: number }[] {
  const ids = Object.keys(antworten).filter((id) => normiert(antworten[id]).length >= VERGLEICH_AB_ZEICHEN)
  const gruppe = new Map<string, number>()
  const gruppen: { personen: string[]; gleich: boolean; wert: number }[] = []
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const w = aehnlichkeit(antworten[ids[i]], antworten[ids[j]])
      if (w < AEHNLICH_AB) continue
      const gleich = normiert(antworten[ids[i]]) === normiert(antworten[ids[j]])
      const gi = gruppe.get(ids[i])
      const gj = gruppe.get(ids[j])
      if (gi === undefined && gj === undefined) {
        gruppen.push({ personen: [ids[i], ids[j]], gleich, wert: w })
        gruppe.set(ids[i], gruppen.length - 1)
        gruppe.set(ids[j], gruppen.length - 1)
      } else {
        const g = gi ?? gj!
        for (const id of [ids[i], ids[j]])
          if (!gruppe.has(id)) {
            gruppen[g].personen.push(id)
            gruppe.set(id, g)
          }
        gruppen[g].gleich = gruppen[g].gleich && gleich
        gruppen[g].wert = Math.min(gruppen[g].wert, w)
      }
    }
  return gruppen
}

/** Auffälligkeiten einer Aufgabe – Hinweise für die Lehrkraft, kein Urteil */
export interface Auffaelligkeit {
  art: 'eingefuegt' | 'schnell' | 'material' | 'gleich' | 'aehnlich'
  text: string
  /** Gewicht 0…1 für die Eigenständigkeit */
  gewicht: number
}

/** Plausibilität aus dem Eingabeverhalten einer Aufgabe */
export function eingabeAuffaellig(e: FeldEingabe): Auffaelligkeit[] {
  const aus: Auffaelligkeit[] = []
  const zeichen = e.g + e.e
  if (zeichen >= 30 && e.e / zeichen >= 0.5)
    aus.push({
      art: 'eingefuegt',
      text: `${Math.round((e.e / zeichen) * 100)} % auf einmal eingefügt (Einfügen, Ziehen oder Diktat)`,
      gewicht: Math.min(1, e.e / zeichen)
    })
  // Mehr als ~6 Zeichen je Sekunde über mindestens 80 Zeichen ist zum Tippen kaum plausibel
  if (zeichen >= 80 && e.ms > 0 && zeichen / (e.ms / 1000) > 6)
    aus.push({ art: 'schnell', text: `${zeichen} Zeichen in ${Math.max(1, Math.round(e.ms / 1000))} s`, gewicht: 0.6 })
  return aus
}

export type AmpelStand = 'rot' | 'gelb' | 'gruen'

/** Korrektheit 0…1 aus den Ampeln (bearbeitete Aufgaben); null = noch keine Einschätzung */
export function korrektheit(ampeln: (AmpelStand | null)[]): number | null {
  const da = ampeln.filter((a): a is AmpelStand => a !== null)
  if (!da.length) return null
  return da.reduce((s, a) => s + (a === 'gruen' ? 1 : a === 'gelb' ? 0.5 : 0), 0) / ampeln.length
}

/** Eigenständigkeit 0…1 aus den Auffälligkeiten aller Aufgaben */
export function eigenstaendigkeit(auffaellig: Auffaelligkeit[][], aufgaben: number): number {
  if (!aufgaben) return 1
  const je = auffaellig.map((l) =>
    Math.min(
      1,
      l.reduce((s, a) => s + a.gewicht, 0)
    )
  )
  return Math.max(0, 1 - je.reduce((s, x) => s + x, 0) / aufgaben)
}

/**
 * Gesamtwert für die Farbe: „und/oder" – die schwächere Seite zählt mehr (halb Minimum, halb Mittel).
 * null, solange nichts einzuschätzen ist.
 */
export function gesamtwert(korrekt: number | null, eigen: number): number | null {
  if (korrekt === null) return null
  return 0.5 * Math.min(korrekt, eigen) + 0.25 * (korrekt + eigen)
}

/** Farbton für den Knopf: stufenlos Rot (0) → Orange (0,5) → Grün (1); dunkel genug für weiße Schrift */
export function farbeFuer(wert: number): string {
  const w = Math.max(0, Math.min(1, wert))
  const ton = w <= 0.5 ? (w / 0.5) * 32 : 32 + ((w - 0.5) / 0.5) * 98
  // Gelb-/Orangetöne sind hell: dort dunkler, damit weiße Schrift trägt
  const hell = ton >= 20 && ton <= 115 ? 30 : 36
  return `hsl(${Math.round(ton)} 78% ${hell}%)`
}

export type MitarbeitNote = '++' | '+' | '0' | '-' | '--'
export const MITARBEIT_NOTEN: MitarbeitNote[] = ['++', '+', '0', '-', '--']
export type Strenge = 'milde' | 'normal' | 'streng'
