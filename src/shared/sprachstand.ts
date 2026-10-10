/**
 * Vokabeln je Sprache (10.10.2026, Entscheidung der Lehrkraft „Option A"; ersetzt die Seite „Mein Vokabelweg"):
 *
 *  - AKTUELLER Band zuerst („Green Line 3 · Klasse 7"): nur das bisher Freigegebene, die Units als Stationen mit ihren
 *    Abschnitten, „12 von 21 Abschnitten kennengelernt", EIN Knopf „Heute üben · N Wörter" – eine Tagesrunde über alle
 *    Kurse der Sprache. Spätere Units erscheinen nicht gesperrt, nur als „weitere Units folgen".
 *  - „Frühere Jahre": Bände früherer Schuljahre als Cover „Klasse 6 · 2025/26" mit Medaille (Bronze ab 50 %, Silber ab
 *    70 %, Gold ab 85 % sicher) und dem schneller wachsenden „kennengelernt". Lücken nur als ruhiges Angebot.
 *  - Tagesrunde: dazu 2–3 wackelige Wörter aus früheren Bänden (nach Vergessensrisiko), je Karte „aus Green Line 1 ·
 *    Unit 2". In den 3 Tagen vor einem angekündigten Vokabeltest ruht dieser Anteil – dann nur der Teststoff.
 *  - Ältere Kurse: keine Pflicht-Neuwörter, keine roten Zahlen; sie speisen die Wiederholung.
 *
 * EINE Bedeutung von Fortschritt überall (shared/wortliste.ts `wortStatus`):
 *  - sicher: zweimal frei gewusst im Abstand von mindestens einer Woche (oder Langzeitfach),
 *  - im Aufbau: kennengelernt, aber noch nicht sicher,
 *  - kennengelernt: mindestens einmal gesehen (im Aufbau + sicher), neu: noch nie gesehen.
 * Ein Abschnitt ist „kennengelernt", wenn alle seine Wörter kennengelernt sind.
 *
 * Rein rechnend – der Server (server/sprachstand.ts) reicht Bände, Freigaben und Lernstände herein.
 */
import { ABSTAENDE, istSicher, istWackelig, TAG, tagVon, type Vokabel, type WortStand } from './vokabeltrainer'
import type { WortStatus } from './wortliste'
import { abschnitteAus, type Abschnitt, type Buch } from './vokabelLaufbahn'

// ---------------------------------------------------------------- Zahlen

export interface StandZahlen {
  gesamt: number
  neu: number
  aufbau: number
  sicher: number
  /** im Aufbau + sicher: mindestens einmal gesehen */
  kennengelernt: number
}

export const LEER: StandZahlen = { gesamt: 0, neu: 0, aufbau: 0, sicher: 0, kennengelernt: 0 }

export function zahlenAus(status: Iterable<WortStatus>): StandZahlen {
  const z = { ...LEER }
  for (const s of status) {
    z.gesamt++
    z[s]++
  }
  z.kennengelernt = z.aufbau + z.sicher
  return z
}

export const summe = (liste: StandZahlen[]): StandZahlen => {
  const z = { ...LEER }
  for (const x of liste) for (const k of Object.keys(z) as (keyof StandZahlen)[]) z[k] += x[k]
  return z
}

/** Anteil in ganzen Prozent (abgerundet – 84,9 % ist noch kein Gold) */
export const prozent = (teil: number, gesamt: number): number => (gesamt ? Math.floor((teil / gesamt) * 100) : 0)

// ---------------------------------------------------------------- Medaillen je Band

export type BandMedaille = 'bronze' | 'silber' | 'gold'
/** Anteil sicherer Wörter eines Bandes ab dem die Medaille gilt */
export const MEDAILLE_AB: Record<BandMedaille, number> = { bronze: 0.5, silber: 0.7, gold: 0.85 }

export function bandMedaille(z: Pick<StandZahlen, 'gesamt' | 'sicher'>): BandMedaille | null {
  if (!z.gesamt) return null
  const a = z.sicher / z.gesamt
  return a >= MEDAILLE_AB.gold ? 'gold' : a >= MEDAILLE_AB.silber ? 'silber' : a >= MEDAILLE_AB.bronze ? 'bronze' : null
}

/** Nächste Medaille und wie viele Wörter dafür noch sicher werden müssen (für ein ruhiges „noch 12 bis Silber") */
export function naechsteMedaille(z: Pick<StandZahlen, 'gesamt' | 'sicher'>): { medaille: BandMedaille; fehlen: number } | null {
  if (!z.gesamt) return null
  for (const m of ['bronze', 'silber', 'gold'] as BandMedaille[]) {
    const noetig = Math.ceil(MEDAILLE_AB[m] * z.gesamt - 1e-9)
    if (z.sicher < noetig) return { medaille: m, fehlen: noetig - z.sicher }
  }
  return null
}

// ---------------------------------------------------------------- Bände nach Schuljahren

export interface BandEingabe {
  id: string
  /** Stelle in der Reihe (Klassenstufe bzw. Band, shared/lehrwerkBand bandRang) */
  rang: number
  grade?: number
  /** Schuljahre (Beginn-Jahr), in denen Abschnitte des Bandes freigegeben wurden */
  jahre: number[]
}

export interface BandJahr {
  id: string
  /** Schuljahr des Bandes (Beginn-Jahr); unbekannt null */
  schuljahr: number | null
  /** Klassenstufe in jenem Schuljahr; unbekannt null */
  klasse: number | null
}

/**
 * Aktueller Band und frühere Jahre. Aktuell ist der höchste Band mit einer Freigabe in DIESEM Schuljahr. Früher sind
 * Bände, deren Freigaben alle in früheren Schuljahren liegen, und – als ganze Bände – die Bände der Reihe vor dem
 * aktuellen bzw. (ohne aktuellen) unter der eigenen Klassenstufe. Spätere Bände ohne Freigabe erscheinen nicht.
 * Schuljahr eines früheren Bandes: das seiner letzten Freigabe, sonst aus der Klassenstufe zurückgerechnet.
 * Reihenfolge der früheren: wie im Regal, der älteste links.
 */
export function baendeNachJahren(baende: BandEingabe[], schuljahr: number, jahrgang: number | null): { aktuell: BandJahr | null; frueher: BandJahr[] } {
  const mitJetzt = baende.filter((b) => b.jahre.includes(schuljahr)).sort((a, b) => b.rang - a.rang)
  const akt = mitJetzt[0] ?? null
  const klasseIn = (sj: number | null, grade?: number): number | null =>
    typeof grade === 'number' && Number.isFinite(grade) ? grade : jahrgang && sj !== null ? jahrgang - (schuljahr - sj) : null
  const aktuell: BandJahr | null = akt ? { id: akt.id, schuljahr, klasse: jahrgang ?? klasseIn(schuljahr, akt.grade) } : null
  const frueher: BandJahr[] = []
  for (const b of [...baende].sort((x, y) => x.rang - y.rang)) {
    if (b.id === akt?.id) continue
    const alt = b.jahre.filter((j) => j < schuljahr)
    const davor = akt ? b.rang < akt.rang : jahrgang !== null && typeof b.grade === 'number' && b.grade < jahrgang
    if (!alt.length && !davor) continue
    // Nur dieses Jahr freigegeben, aber unter dem aktuellen Band (Wiederholung): zählt auch zu den früheren Jahren
    const geschaetzt = jahrgang !== null && typeof b.grade === 'number' && b.grade < jahrgang ? schuljahr - (jahrgang - b.grade) : null
    const sj = alt.length ? Math.max(...alt) : geschaetzt
    frueher.push({ id: b.id, schuljahr: sj, klasse: klasseIn(sj, b.grade) })
  }
  return { aktuell, frueher }
}

// ---------------------------------------------------------------- Tagesrunde

/** Wörter aus früheren Bänden je Runde */
export const ALT_JE_RUNDE = 3
/** So viele Tage vor einem angekündigten Vokabeltest ruht der Anteil früherer Bände */
export const TEST_PAUSE_TAGE = 3

/** Steht ein Vokabeltest in den nächsten drei Tagen an (heute eingeschlossen)? */
export function testPause(termine: (number | null | undefined)[], jetzt = Date.now()): boolean {
  const heuteBeginn = jetzt - (jetzt % TAG) - TAG / 2
  return termine.some((t) => typeof t === 'number' && t >= heuteBeginn && t - jetzt <= TEST_PAUSE_TAGE * TAG)
}

/**
 * Vergessensrisiko eines schon gesehenen Wortes: wie weit es über seine Fälligkeit ist (gemessen am eigenen Abstand),
 * dazu die Fehlerquote; wackelige Wörter zuerst. 0 = kein Kandidat (neu, sicher im Langzeitfach, nicht fällig).
 */
export function vergessensRisiko(st: WortStand | undefined, jetzt = Date.now()): number {
  if (!st || (st.fach <= 0 && !st.versuche)) return 0
  // Heute schon geübt: nicht noch einmal (sonst käme ein wackeliges Wort in jede Runde des Tages)
  if (st.zuletzt && tagVon(st.zuletzt) === tagVon(jetzt)) return 0
  const wackelig = istWackelig(st, jetzt)
  if (st.faellig > jetzt && !wackelig) return 0
  if (istSicher(st) && st.fach >= 6 && !wackelig) return 0
  const abstand = Math.max(1, ABSTAENDE[Math.min(6, Math.max(0, st.fach))] ?? 1) * TAG
  const ueber = Math.max(0, jetzt - (st.faellig || st.zuletzt || 0)) / abstand
  const fehler = st.versuche ? st.falsch / st.versuche : 0
  return 1 + Math.min(5, ueber) + 2 * fehler + (wackelig ? 2 : 0)
}

export interface AltKandidat {
  v: Vokabel
  st: WortStand | undefined
  /** „aus Green Line 1 · Unit 2" */
  herkunft: string
}

/** Kleine, feste Streuzahl (je Tag gleich) für gleich riskante Wörter */
const streu = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Die riskantesten Wörter früherer Bände (höchstens `n`, je Begriff einmal) */
export function altWoerterWaehlen(kandidaten: AltKandidat[], jetzt = Date.now(), n = ALT_JE_RUNDE): AltKandidat[] {
  const tag = new Date(jetzt).toISOString().slice(0, 10)
  const gesehen = new Set<string>()
  return kandidaten
    .map((k) => ({ k, r: vergessensRisiko(k.st, jetzt), z: streu(`${tag}|${k.v.id}`) }))
    .filter((x) => x.r > 0)
    .sort((a, b) => b.r - a.r || a.z - b.z)
    .filter((x) => {
      const t = x.k.v.term.trim().toLowerCase()
      if (gesehen.has(t)) return false
      gesehen.add(t)
      return true
    })
    .slice(0, n)
    .map((x) => x.k)
}

/**
 * Wörter der Tagesrunde einer Sprache. `aktuell`: Wörter aus Abschnitten dieses Schuljahres (offene Kurse);
 * `test`: Kennungen der Wörter aus Kursen mit einem Test in den nächsten drei Tagen (dann NUR diese, ohne frühere Bände);
 * `alt`: Kandidaten aus früheren Bänden. Frühere Wörter tragen ihre Herkunft. Gleiche Begriffe zählen einmal.
 */
export function rundenWoerter(
  aktuell: Vokabel[],
  alt: AltKandidat[],
  o: { test?: Set<string> | null; jetzt?: number; n?: number } = {}
): { woerter: Vokabel[]; alt: string[]; pause: boolean } {
  const pause = Boolean(o.test && o.test.size)
  const basis = pause ? aktuell.filter((v) => o.test!.has(v.id)) : aktuell
  const da = new Set(basis.map((v) => v.term.trim().toLowerCase()))
  const dazu = pause ? [] : altWoerterWaehlen(alt.filter((k) => !da.has(k.v.term.trim().toLowerCase())), o.jetzt, o.n)
  return {
    woerter: [...basis, ...dazu.map((k) => ({ ...k.v, herkunft: k.herkunft }))],
    alt: dazu.map((k) => k.v.id),
    pause
  }
}

// ---------------------------------------------------------------- Aktueller Band: Units als Stationen

export const abschnittSchluessel = (unit: string, abschnitt: string): string => `${unit.trim().toLowerCase()}\u0001${abschnitt.trim().toLowerCase()}`

/**
 * Units und Abschnitte eines Kurs-Abschnitts aus seiner Einordnung: „Check-in, Station 1" (eine Unit) oder
 * „Unit 1: Check-in · Unit 2: Station 1" (mehrere Units in einem Teil).
 */
export function abschnitteDesTeils(e: { unit: string; name: string }): { unit: string; abschnitt: string }[] {
  if (/:\s/.test(e.name))
    return e.name.split(/\s·\s|\s-\s/).flatMap((seg) => {
      const m = /^(.*?):\s*(.*)$/.exec(seg.trim())
      if (!m) return e.unit ? seg.split(/,\s*/).filter(Boolean).map((a) => ({ unit: e.unit, abschnitt: a.trim() })) : []
      return m[2].split(/,\s*/).filter(Boolean).map((a) => ({ unit: m[1].trim(), abschnitt: a.trim() }))
    })
  if (!e.unit) return []
  return e.name
    .split(/,\s*|\s·\s/)
    .filter(Boolean)
    .map((a) => ({ unit: e.unit, abschnitt: a.trim() }))
}

/** Aktueller Band: freigegebene Abschnitte, gruppiert nach Units */
/** Platzhalter-Bände ohne Wörter liefern nichts – dann gibt es keinen Weg, nur die Kursliste */
export function freieAbschnitte(buch: Buch, frei: Set<string>): Abschnitt[] {
  return abschnitteAus(buch).filter((x) => frei.has(abschnittSchluessel(x.unit, x.section)))
}


export interface AbschnittStand {
  key: string
  name: string
  zahlen: StandZahlen
}

export interface UnitStand {
  unit: string
  abschnitte: AbschnittStand[]
  zahlen: StandZahlen
}

/** Ein Abschnitt ist kennengelernt, wenn alle seine Wörter mindestens einmal gesehen wurden */
export const abschnittKennen = (z: StandZahlen): boolean => z.gesamt > 0 && z.kennengelernt >= z.gesamt

/** Abschnitte (in Buchreihenfolge) zu Units zusammenfassen – mit Summen je Unit */
export function nachUnitsImBuch(abschnitte: (AbschnittStand & { unit: string })[]): UnitStand[] {
  const aus: UnitStand[] = []
  for (const a of abschnitte) {
    const letzte = aus[aus.length - 1]
    const eintrag = { key: a.key, name: a.name, zahlen: a.zahlen }
    if (letzte && letzte.unit === a.unit) letzte.abschnitte.push(eintrag)
    else aus.push({ unit: a.unit, abschnitte: [eintrag], zahlen: LEER })
  }
  for (const u of aus) u.zahlen = summe(u.abschnitte.map((a) => a.zahlen))
  return aus
}

// ---------------------------------------------------------------- Antwort von /s/api/sprachstand

export interface BandAnsicht {
  id: string
  name: string
  reihe?: string
  band?: string
  stateId?: string
  grade?: number
  kurz: string
  klasse: number | null
  schuljahr: number | null
  zahlen: StandZahlen
}

export interface AktuellerBand extends BandAnsicht {
  /** Nur Freigegebenes, Units in Buchreihenfolge mit ihren Abschnitten */
  units: UnitStand[]
  abschnitte: number
  abschnitteKennen: number
  /** Unit, an der die Klasse gerade ist (die zuletzt freigegebene im Buch) */
  aktuelleUnit: string
  /** Units des Bandes nach der aktuellen (noch nicht freigegeben) */
  weitereUnits: number
}

export interface FruehererBand extends BandAnsicht {
  medaille: BandMedaille | null
  naechste: { medaille: BandMedaille; fehlen: number } | null
  /** Kennengelernt, aber noch nicht sicher – ruhiges Angebot „Wiederholen?" */
  wiederholen: number
  /** Noch nie gesehen */
  neu: number
}

export interface SprachStand {
  sprache: string
  fach: string
  farbe: string | null
  aktuell: AktuellerBand | null
  frueher: FruehererBand[]
  /** Größe der heutigen Runde (gleiche Zahl im Ordner, im Tipp und auf der Startseite), weitere fällige freiwillig */
  heute: { anzahl: number; extra: number; pause: boolean; alt: number; tagesziel: number }
  /** Offene Kurse der Sprache (Liste „Einzelne Kurse") */
  kurse: { id: string; titel: string }[]
  /** Kein Lehrwerk mit Wörtern (eigene Listen, Platzhalter-Bände): nur die Kursliste */
  nurKurse: boolean
}
