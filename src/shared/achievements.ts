/**
 * Achievements der Lernenden (08.10.2026, mit der Lehrkraft abgestimmt) – reine Berechnung, ohne Datenbank.
 *
 * Für Vokabeln und Grammatik der Sprachen-Lern-App: rund 40 feste Achievements in sechs Gruppen, viele in Stufen
 * (Bronze/Silber/Gold), dazu je Unit und je Lehrwerksband aus den eigenen Kursen. Erreichtes wird nie wieder entzogen
 * (Server: server/achievements.ts speichert den Zeitpunkt).
 *
 * Seit 09.10.2026 (Wunsch der Lehrkraft): Die Lernenden sehen ALLE Achievements, auch die noch nicht erreichten, mit
 * Fortschritt (`ist`/`ziel`, etwa 23/50) – nur die geheimen Überraschungen (`geheim`) bleiben verborgen, bis sie
 * erreicht sind. Vergleich nur über Zahlen: Anteil der Lernenden der Schule und der eigene Platz in der Klasse
 * (shared/achievementsVergleich.ts) – nie Namen oder Werte anderer.
 */
import { istFerienOderFeiertag } from './schulkalender'

export type AchGruppe = 'dranbleiben' | 'lehrwerk' | 'wortschatz' | 'grammatik' | 'spiele' | 'zusammen' | 'besonderes'
export const ACH_GRUPPEN: { id: AchGruppe; name: string }[] = [
  { id: 'dranbleiben', name: 'Dranbleiben' },
  { id: 'lehrwerk', name: 'Lehrwerk' },
  { id: 'wortschatz', name: 'Wortschatz' },
  { id: 'grammatik', name: 'Grammatik' },
  { id: 'spiele', name: 'Spiele' },
  { id: 'zusammen', name: 'Zusammen' },
  { id: 'besonderes', name: 'Besonderes' }
]

/** Stufe; null = einmaliges Achievement ohne Stufe */
export type Medaille = 'bronze' | 'silber' | 'gold' | null

export interface Achievement {
  id: string
  gruppe: AchGruppe
  titel: string
  text: string
  medaille: Medaille
  erreicht: boolean
  /** Fortschritt (09.10.2026): aktueller Wert und Ziel – bei Einmaligem 0/1 bzw. 1/1 */
  ist: number
  ziel: number
  /** Überraschung: erst sichtbar, wenn erreicht (09.10.2026) */
  geheim?: boolean
}

/** Zähler, die im Moment des Geschehens mitgeschrieben werden (server/achievementsDaten.ts) */
export interface AchZaehler {
  /** Eigene Rekorde gebrochen (ein früherer Rekord des Schuljahres wurde übertroffen) */
  rekordeGebrochen: number
  /** Blitzrunden ohne einen Fehler (mindestens 10 richtig) */
  blitzFehlerfrei: number
  /** Richtige Verbformen in den Verbspielen (Formen-Blitz, Bild-Verb, Verb-Blitz) */
  verbformen: number
  /** Richtig geschriebene Diktate im Kasten */
  diktate: number
  /** Wörter in „Lege das Wort" von Hand geschrieben */
  handschrift: number
  /** Übungstage mit mindestens 10 Antworten im Kasten und keinem Fehler */
  fehlerfreieTage: number
  // Zusammen spielen (08.10.2026, Plan F; Beschreib-Raten zählt nicht)
  /** Kooperative Runden zu Ende gespielt */
  koopRunden: number
  /** Team-Ziel geschafft */
  teamZiele: number
  fluchtraumFehlerfrei: number
  satzbaustelleFehlerfrei: number
  /** Versus-Spiele zu Ende gespielt */
  versusSpiele: number
  /** Siege im Versus (immer mit Handicap nach Können) */
  faireSiege: number
  comebackSiege: number
  /** Auf „unmöglich" das Team-Ziel bzw. einen Sieg geschafft */
  unmoeglich: number
  /** Bitmaske der ausprobierten Spielarten (shared/mehrspieler/typen.ts SPIELART_BIT) */
  spielarten: number
}
export const LEERE_ZAEHLER: AchZaehler = {
  rekordeGebrochen: 0,
  blitzFehlerfrei: 0,
  verbformen: 0,
  diktate: 0,
  handschrift: 0,
  fehlerfreieTage: 0,
  koopRunden: 0,
  teamZiele: 0,
  fluchtraumFehlerfrei: 0,
  satzbaustelleFehlerfrei: 0,
  versusSpiele: 0,
  faireSiege: 0,
  comebackSiege: 0,
  unmoeglich: 0,
  spielarten: 0
}

/** Anzahl gesetzter Bits (ausprobierte Spielarten) */
export const bitZahl = (n: number): number => {
  let c = 0
  for (let x = n >>> 0; x; x >>>= 1) c += x & 1
  return c
}
/** Die acht Kernspiele ohne Beschreib-Raten = die ersten sieben Bits */
export const KERNSPIELE_BITS = 0b1111111

export interface AchEingabe {
  /** Übungstage als ISO-Datum (UTC, wie im Kasten) */
  tage: string[]
  /** Wochenziel aus Einstellungen › Lernen (Übungstage je Woche) */
  wochenziel: number
  woerter: { gelernt: number; sicher: number; langzeit: number }
  /** Je Lehrwerksband der eigenen Kurse: Wörter gesamt/kennengelernt, je Unit (aus der man Wörter bekam) gesamt/sicher */
  lehrwerk: { buch: string; name: string; gesamt: number; gelernt: number; units: { unit: string; gesamt: number; sicher: number }[] }[]
  /** Grammatikregeln (über alle Pakete nach Titel zusammengefasst) */
  regeln: { schluessel: string; sicher: boolean; schwaeche: boolean; staerke: boolean }[]
  /** Regeln, die irgendwann eine Schwäche waren (gespeichert) */
  warSchwaeche: string[]
  extrasGeschafft: number
  /** Verschiedene Spiele, die je gespielt wurden */
  spiele: number
  zaehler: AchZaehler
}

const TAG_MS = 86_400_000
const tagNr = (iso: string): number => Math.floor(Date.parse(`${iso}T00:00:00Z`) / TAG_MS)
const istWochenende = (n: number): boolean => {
  const d = new Date(n * TAG_MS).getUTCDay()
  return d === 0 || d === 6
}
const isoVon = (n: number): string => new Date(n * TAG_MS).toISOString().slice(0, 10)
const sortiert = (tage: string[]): number[] => [...new Set(tage.map(tagNr).filter((n) => Number.isFinite(n)))].sort((a, b) => a - b)

/**
 * Längste Serie von Übungstagen: Ein Werktag ohne Übung beendet sie, Samstag und Sonntag nicht (abgestimmt) – wer am
 * Wochenende übt, bekommt den Tag trotzdem dazu. Ferien und Feiertage (Schulkalender, 10.10.2026) zählen wie das
 * Wochenende: Die Serie pausiert. `pause` nur für Tests.
 */
export function besteSerie(tage: string[], pause: (tag: string) => boolean = istFerienOderFeiertag): number {
  const nr = sortiert(tage)
  if (!nr.length) return 0
  const da = new Set(nr)
  let beste = 0
  let jetzt = 0
  for (let n = nr[0]; n <= nr[nr.length - 1]; n++) {
    if (da.has(n)) beste = Math.max(beste, ++jetzt)
    else if (!istWochenende(n) && !pause(isoVon(n))) jetzt = 0
  }
  return beste
}

/** Comeback: nach mindestens `pause` Tagen ohne Übung wieder geübt */
export function hatComeback(tage: string[], pause = 14): boolean {
  const nr = sortiert(tage)
  return nr.some((n, i) => i > 0 && n - nr[i - 1] - 1 >= pause)
}

/** Wochen (Montag bis Sonntag), in denen das Wochenziel erreicht wurde – nicht unbedingt in Folge */
export function wochenMitZiel(tage: string[], ziel: number): number {
  const z = Math.max(1, Math.min(7, Math.round(ziel) || 3))
  const jeWoche = new Map<number, number>()
  for (const n of sortiert(tage)) {
    const w = n - ((n + 3) % 7)
    jeWoche.set(w, (jeWoche.get(w) ?? 0) + 1)
  }
  return [...jeWoche.values()].filter((x) => x >= z).length
}

/** Wie viele von `ganz` für `prozent` % nötig sind (dasselbe wie „Anteil ≥ prozent“) */
const noetig = (ganz: number, prozent: number): number => Math.max(1, Math.ceil((ganz * prozent) / 100 - 1e-9))

/** Der ganze Katalog für diese Eingabe – erreicht oder nicht */
export function berechneAchievements(e: AchEingabe): Achievement[] {
  const aus: Achievement[] = []
  /** `wert`: Zahl mit Ziel `ziel`, oder Ja/Nein (dann 1/1 bzw. 0/1) */
  const neu = (id: string, gruppe: AchGruppe, medaille: Medaille, titel: string, text: string, wert: number | boolean, ziel = 1, geheim = false): void => {
    const ist = typeof wert === 'boolean' ? (wert ? 1 : 0) : Math.max(0, Math.floor(wert))
    aus.push({ id, gruppe, titel, text, medaille, erreicht: ist >= ziel, ist: Math.min(ist, ziel), ziel, ...(geheim ? { geheim: true } : {}) })
  }
  const stufen = (
    basis: string,
    gruppe: AchGruppe,
    ist: number,
    werte: [number, Exclude<Medaille, null>][],
    titel: (n: number) => string,
    text: (n: number) => string
  ): void => {
    for (const [n, m] of werte) neu(`${basis}-${n}`, gruppe, m, titel(n), text(n), ist, n)
  }
  const z = { ...LEERE_ZAEHLER, ...e.zaehler }

  // 1. Dranbleiben
  stufen(
    'serie',
    'dranbleiben',
    besteSerie(e.tage),
    [
      [3, 'bronze'],
      [7, 'bronze'],
      [14, 'silber'],
      [30, 'silber'],
      [60, 'gold'],
      [100, 'gold']
    ],
    (n) => `${n} Tage am Stück`,
    (n) => `An ${n} Tagen hintereinander geübt – das Wochenende unterbricht die Serie nicht.`
  )
  stufen(
    'wochenziel',
    'dranbleiben',
    wochenMitZiel(e.tage, e.wochenziel),
    [
      [1, 'bronze'],
      [4, 'silber'],
      [10, 'gold']
    ],
    (n) => (n === 1 ? 'Wochenziel geschafft' : `Wochenziel in ${n} Wochen`),
    (n) => (n === 1 ? 'Eine Woche lang so oft geübt, wie du es dir vorgenommen hast.' : `In ${n} Wochen dein Wochenziel erreicht.`)
  )
  // Geheim (09.10.2026): eine Überraschung, kein Ziel zum Hinarbeiten
  neu('comeback', 'dranbleiben', null, 'Comeback', 'Nach mindestens zwei Wochen Pause wieder eingestiegen.', hatComeback(e.tage), 1, true)

  // 2. Lehrwerk: je Unit (sicher) und je Band (kennengelernt)
  for (const b of e.lehrwerk) {
    for (const u of b.units) {
      if (!u.gesamt) continue
      for (const [s, m] of [
        [50, 'bronze'],
        [80, 'silber'],
        [100, 'gold']
      ] as [number, Exclude<Medaille, null>][])
        neu(
          `unit:${b.buch}:${u.unit}:${s}`,
          'lehrwerk',
          m,
          `${u.unit} (${b.name}) zu ${s} % sicher`,
          `${s === 100 ? 'Alle' : `${s} %`} der Wörter aus ${u.unit} sitzen sicher.`,
          u.sicher,
          noetig(u.gesamt, s)
        )
    }
    if (!b.gesamt) continue
    for (const [s, m] of [
      [25, 'bronze'],
      [50, 'silber'],
      [75, 'gold'],
      [100, 'gold']
    ] as [number, Exclude<Medaille, null>][])
      neu(
        `band:${b.buch}:${s}`,
        'lehrwerk',
        m,
        `${b.name}: ${s} % kennengelernt`,
        `${s === 100 ? 'Alle' : `${s} %`} der Wörter aus ${b.name} hast du schon kennengelernt.`,
        b.gelernt,
        noetig(b.gesamt, s)
      )
  }

  // 3. Wortschatz
  stufen(
    'sicher',
    'wortschatz',
    e.woerter.sicher,
    [
      [50, 'bronze'],
      [100, 'bronze'],
      [250, 'silber'],
      [500, 'silber'],
      [1000, 'gold']
    ],
    (n) => `${n} Wörter sicher`,
    (n) => `${n} Wörter sitzen sicher – auch nach einer Woche noch gewusst.`
  )
  neu('langzeit-100', 'wortschatz', 'gold', '100 Wörter im Langzeit-Fach', '100 Wörter haben es bis ins oberste Fach geschafft.', e.woerter.langzeit, 100)
  stufen(
    'fehlerfrei',
    'wortschatz',
    z.fehlerfreieTage,
    [
      [1, 'bronze'],
      [10, 'silber'],
      [30, 'gold']
    ],
    (n) => (n === 1 ? 'Fehlerfreie Tagesrunde' : `${n} fehlerfreie Tagesrunden`),
    (n) => (n === 1 ? 'Einen Tag lang mindestens 10 Wörter geübt – ohne einen Fehler.' : `An ${n} Tagen mindestens 10 Wörter ohne einen Fehler geübt.`)
  )

  // 4. Grammatik
  const sichereRegeln = e.regeln.filter((r) => r.sicher).length
  neu('regel-1', 'grammatik', 'bronze', 'Erste sichere Regel', 'Die erste Grammatikregel sitzt sicher.', sichereRegeln)
  stufen(
    'regeln',
    'grammatik',
    sichereRegeln,
    [
      [5, 'bronze'],
      [10, 'silber'],
      [25, 'gold']
    ],
    (n) => `${n} sichere Regeln`,
    (n) => `${n} Grammatikregeln sitzen sicher.`
  )
  const war = new Set(e.warSchwaeche)
  neu(
    'schwaeche-staerke',
    'grammatik',
    null,
    'Aus Schwäche wird Stärke',
    'Eine Regel, die dir schwerfiel, sitzt jetzt.',
    e.regeln.some((r) => war.has(r.schluessel) && !r.schwaeche && (r.staerke || r.sicher))
  )
  neu('extra', 'grammatik', null, '„Extra für dich" geschafft', 'Alle Aufgaben eines Extras für dich bearbeitet.', e.extrasGeschafft)

  // 5. Spiele
  stufen(
    'rekord',
    'spiele',
    z.rekordeGebrochen,
    [
      [1, 'bronze'],
      [10, 'silber'],
      [50, 'gold']
    ],
    (n) => (n === 1 ? 'Rekord gebrochen' : `${n} Rekorde gebrochen`),
    (n) => (n === 1 ? 'Deinen eigenen Rekord in einem Spiel übertroffen.' : `${n}-mal deinen eigenen Rekord übertroffen.`)
  )
  stufen(
    'spiele',
    'spiele',
    e.spiele,
    [
      [5, 'bronze'],
      [10, 'silber'],
      [20, 'gold']
    ],
    (n) => `${n} Spiele ausprobiert`,
    (n) => `${n} verschiedene Spiele gespielt.`
  )
  neu('blitz-fehlerfrei', 'spiele', null, 'Fehlerfreie Blitzrunde', 'Eine Blitzrunde mit mindestens 10 richtigen und keinem Fehler.', z.blitzFehlerfrei)

  // 6. Zusammen (Mehrspieler, 08.10.2026)
  neu('zusammen-erste', 'zusammen', 'bronze', 'Erste Teamrunde', 'Zum ersten Mal gemeinsam mit anderen gespielt.', z.koopRunden)
  stufen(
    'teamziel',
    'zusammen',
    z.teamZiele,
    [
      [1, 'bronze'],
      [10, 'silber'],
      [25, 'gold']
    ],
    (n) => (n === 1 ? 'Team-Ziel geschafft' : `${n} Team-Ziele geschafft`),
    (n) => (n === 1 ? 'Gemeinsam das Ziel einer Teamrunde erreicht.' : `${n}-mal gemeinsam das Ziel einer Teamrunde erreicht.`)
  )
  neu('fluchtraum-fehlerfrei', 'zusammen', 'silber', 'Ausbruch ohne Fehlversuch', 'Aus dem Fluchtraum entkommen – jeder Code saß beim ersten Mal.', z.fluchtraumFehlerfrei)
  neu('satzbaustelle-fehlerfrei', 'zusammen', 'silber', 'Saubere Baustelle', 'Alle Sätze der Satzbaustelle ohne einen Fehler gebaut.', z.satzbaustelleFehlerfrei)
  stufen(
    'versus',
    'zusammen',
    z.versusSpiele,
    [
      [5, 'bronze'],
      [25, 'silber'],
      [50, 'gold']
    ],
    (n) => `${n} Versus-Spiele`,
    (n) => `${n} Versus-Spiele zu Ende gespielt – gewonnen oder nicht.`
  )
  stufen(
    'fair',
    'zusammen',
    z.faireSiege,
    [
      [1, 'bronze'],
      [10, 'silber']
    ],
    (n) => (n === 1 ? 'Fairer Sieg' : `${n} faire Siege`),
    (n) => (n === 1 ? 'Ein Versus-Spiel gewonnen – mit Fragen passend zu deinem Können.' : `${n} Versus-Spiele gewonnen – mit Fragen passend zu deinem Können.`)
  )
  neu('comeback-sieg', 'zusammen', 'silber', 'Comeback-Sieg', 'Deutlich zurückgelegen und trotzdem gewonnen.', z.comebackSiege, 1, true)
  neu('unmoeglich', 'zusammen', 'gold', '„Unmöglich“ geschafft', 'Auf der Stufe „unmöglich“ das Ziel erreicht.', z.unmoeglich, 1, true)
  neu('alle-spielarten', 'zusammen', 'gold', 'Alle Kernspiele ausprobiert', 'Jedes der Kernspiele zum gemeinsamen Spielen einmal gespielt.', bitZahl(z.spielarten & KERNSPIELE_BITS), bitZahl(KERNSPIELE_BITS))
  neu('viele-spielarten', 'zusammen', 'gold', '15 Zusammen-Spiele ausprobiert', '15 verschiedene Spiele mit anderen gespielt.', bitZahl(z.spielarten), 15)

  // 7. Besonderes
  stufen(
    'diktat',
    'besonderes',
    z.diktate,
    [
      [10, 'bronze'],
      [50, 'silber'],
      [150, 'gold']
    ],
    (n) => `${n} Diktate richtig`,
    (n) => `${n} Wörter nach Gehör richtig geschrieben.`
  )
  stufen(
    'hand',
    'besonderes',
    z.handschrift,
    [
      [20, 'bronze'],
      [100, 'silber'],
      [300, 'gold']
    ],
    (n) => `${n} Wörter von Hand geschrieben`,
    (n) => `${n} Wörter in „Lege das Wort" mit Finger oder Stift geschrieben.`
  )
  stufen(
    'stammformen',
    'besonderes',
    z.verbformen,
    [
      [25, 'bronze'],
      [100, 'silber'],
      [250, 'gold']
    ],
    (n) => (n >= 250 ? 'Stammformen-Profi' : `${n} Verbformen richtig`),
    (n) => `${n} Verbformen in den Verbspielen richtig.`
  )
  return aus
}

/** Ein Eintrag, wie ihn die Lernenden sehen (09.10.2026) */
export interface AchSicht {
  id: string
  gruppe: AchGruppe
  titel: string
  text: string
  medaille: Medaille
  erreicht: boolean
  /** Zeitpunkt des Erreichens, sonst null */
  am: number | null
  ist: number
  ziel: number
  /** Anteil der Lernenden der Schule in Prozent, die es haben – null, wenn zu wenige im Vergleich sind */
  anteil: number | null
}

/** Gespeichert Erreichtes (server/achievementsDaten.ts Erreicht) – nur, was die Sicht braucht */
interface Gespeichert {
  am: number
  titel: string
  text: string
  gruppe: AchGruppe
  medaille: Medaille
}

/**
 * Was die Lernenden sehen (09.10.2026): den ganzen Katalog mit Fortschritt, Erreichtes nie entzogen (auch wenn es im
 * Katalog nicht mehr vorkommt, etwa nach einem entfernten Kurs) – geheime erst, wenn erreicht. `anteile` = Prozent je
 * Achievement aus dem Schulvergleich oder null (zu wenige Lernende); ohne Eintrag dort hat es noch niemand.
 */
export function achievementSicht(
  katalog: Achievement[],
  gespeichert: Record<string, Gespeichert>,
  anteile: Record<string, number> | null
): { liste: AchSicht[]; verborgen: number } {
  const liste: AchSicht[] = []
  let verborgen = 0
  const gesehen = new Set<string>()
  const anteil = (id: string): number | null => (anteile ? anteile[id] ?? 0 : null)
  for (const a of katalog) {
    if (gesehen.has(a.id)) continue
    gesehen.add(a.id)
    const g = gespeichert[a.id]
    if (a.geheim && !g) {
      verborgen++
      continue
    }
    liste.push({
      id: a.id,
      gruppe: a.gruppe,
      titel: g?.titel ?? a.titel,
      text: g?.text ?? a.text,
      medaille: a.medaille,
      erreicht: Boolean(g),
      am: g?.am ?? null,
      ist: g ? a.ziel : Math.min(a.ist, a.ziel),
      ziel: a.ziel,
      anteil: anteil(a.id)
    })
  }
  for (const [id, g] of Object.entries(gespeichert))
    if (!gesehen.has(id)) liste.push({ id, gruppe: g.gruppe, titel: g.titel, text: g.text, medaille: g.medaille, erreicht: true, am: g.am, ist: 1, ziel: 1, anteil: anteil(id) })
  const reihenfolge = ACH_GRUPPEN.map((x) => x.id)
  // Stabil nach Gruppen – innerhalb der Gruppe in der Reihenfolge des Katalogs (Stufen aufsteigend)
  const index = new Map(liste.map((x, i) => [x.id, i]))
  liste.sort((a, b) => reihenfolge.indexOf(a.gruppe) - reihenfolge.indexOf(b.gruppe) || index.get(a.id)! - index.get(b.id)!)
  return { liste, verborgen }
}
