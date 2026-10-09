/**
 * Vergleich bei den Achievements (09.10.2026, Wunsch der Lehrkraft) – Server. Rechnung in shared/achievementsVergleich.ts.
 *
 *  - Schule: Anteil aller Lernenden des Servers, die ein Achievement haben („12 % der Lernenden der Schule haben es").
 *    Gezählt werden Schülerkonten und Gäste – ohne Vorschaukonten („Als Schüler ansehen"), Testkonten der Verwaltung
 *    und gesperrte Konten; erst ab 10 Lernenden. Höchstens alle 10 Minuten neu berechnet.
 *  - Klasse: eigener Platz nach Übungstagen der letzten 4 Wochen (Vokabelkästen, Vokabelweg, Grammatik, Spiele –
 *    alles, was einen Übungstag einträgt). Klasse = die Lerngruppe der Person; bei mehreren die, deren Name der Klasse
 *    aus der Klassenliste/IServ entspricht, sonst die größte. Gäste zählen, wenn die Lehrkraft sie eingetragen hat.
 *    Erst ab 5 Lernenden; die Werte der anderen höchstens alle 10 Minuten neu, der eigene immer frisch.
 * Datenschutz: Nach außen gehen nur der Anteil, der eigene Platz und die Zahl der Verglichenen – keine Namen, keine
 * Werte oder Plätze anderer.
 */
import { alleNutzer, datenbank, type NutzerInfo } from './datenbank'
import { gehoertZu, klasseVon, lerngruppe, type Lerngruppe } from './onlinetest'
import { db as vokDb } from './vokabeln'
import { alleAchievementDaten, achDatenLesen } from './achievementsDaten'
import { anteileAus, platzVon, tageImZeitraum } from '../shared/achievementsVergleich'

const FRISCH_MS = 10 * 60_000

/** Wer im Schulvergleich zählt */
export const imVergleich = (n: NutzerInfo): boolean => n.rolle === 'schueler' && n.quelle !== 'vorschau' && n.quelle !== 'test' && !n.gesperrt

let schule: { t: number; anteile: Record<string, number> | null; lernende: number } | null = null

/** Anteile der Schule (zwischengespeichert) */
export function schulAnteile(jetzt = Date.now()): { anteile: Record<string, number> | null; lernende: number } {
  if (schule && jetzt - schule.t < FRISCH_MS) return schule
  let anteile: Record<string, number> | null = null
  let lernende = 0
  try {
    const ids = new Set(alleNutzer().filter(imVergleich).map((n) => n.id))
    lernende = ids.size
    const daten = alleAchievementDaten()
    anteile = anteileAus(
      [...daten].filter(([id]) => ids.has(id)).map(([, d]) => d.erreicht),
      lernende
    )
  } catch {
    // Vergleich ist Nebensache – ohne ihn bleibt die Liste vollständig
  }
  schule = { t: jetzt, anteile, lernende }
  return schule
}

const sicher = <T>(f: () => T, r: T): T => {
  try {
    return f()
  } catch {
    return r
  }
}
const tageAus = (roh: unknown): string[] => {
  try {
    const d = JSON.parse(String(roh)) as { tage?: unknown }
    return Array.isArray(d.tage) ? d.tage.map(String) : []
  } catch {
    return []
  }
}

/** Alle Übungstage einer Person: Vokabelkästen, Vokabelweg, Grammatik und das, was die Achievements gesammelt haben */
export function uebungsTage(nutzerId: string): string[] {
  const tage = new Set<string>()
  const lies = (f: () => { daten: string }[]): void => {
    for (const z of sicher(f, [])) for (const t of tageAus(z.daten)) tage.add(t)
  }
  lies(() => vokDb().prepare('SELECT daten FROM vok_stand WHERE schueler_id = ?').all(nutzerId) as { daten: string }[])
  lies(() => datenbank().prepare('SELECT daten FROM vok_laufbahn WHERE schueler_id = ?').all(nutzerId) as { daten: string }[])
  lies(() => datenbank().prepare('SELECT daten FROM gram_stand WHERE schueler_id = ?').all(nutzerId) as { daten: string }[])
  for (const t of sicher(() => achDatenLesen(nutzerId).tage, [] as string[])) tage.add(t)
  return [...tage]
}

let gruppenStand: { t: number; gruppen: Lerngruppe[]; lernende: NutzerInfo[] } | null = null
const klassen = new Map<string, { t: number; werte: Map<string, number> }>()

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ')
const istMitglied = (g: Lerngruppe, n: NutzerInfo): boolean => (n.quelle === 'gast' ? g.mitglieder.includes(n.benutzer) : gehoertZu(g, n))

function gruppenUndLernende(jetzt: number): { gruppen: Lerngruppe[]; lernende: NutzerInfo[] } {
  if (gruppenStand && jetzt - gruppenStand.t < FRISCH_MS) return gruppenStand
  const ids = sicher(() => (datenbank().prepare('SELECT id FROM lerngruppen').all() as { id: string }[]).map((z) => z.id), [])
  const gruppen = ids.map((id) => sicher(() => lerngruppe(id), null)).filter((g): g is Lerngruppe => Boolean(g))
  // Vorschaukonten fehlen schon in alleNutzer(); gesperrte zählen nicht mit
  const lernende = sicher(() => alleNutzer().filter((n) => n.rolle === 'schueler' && !n.gesperrt), [] as NutzerInfo[])
  gruppenStand = { t: jetzt, gruppen, lernende }
  return gruppenStand
}

/** Die Klasse der Person: Lerngruppe mit dem Namen ihrer Klasse, sonst die größte – mit ihren Mitgliedern */
export function hauptKlasse(ich: NutzerInfo, gruppen: Lerngruppe[], lernende: NutzerInfo[]): { g: Lerngruppe; mitglieder: NutzerInfo[] } | null {
  const klasse = norm(klasseVon(ich))
  const kandidaten = gruppen
    .filter((g) => istMitglied(g, ich))
    .map((g) => ({ g, mitglieder: lernende.filter((n) => istMitglied(g, n)) }))
    .sort(
      (a, b) =>
        Number(Boolean(klasse) && norm(b.g.name) === klasse) - Number(Boolean(klasse) && norm(a.g.name) === klasse) ||
        b.mitglieder.length - a.mitglieder.length ||
        (a.g.id < b.g.id ? -1 : 1)
    )
  return kandidaten[0] ?? null
}

/** Eigener Platz in der Klasse nach Übungstagen der letzten 4 Wochen – oder null */
export function klassenPlatz(ich: NutzerInfo, jetzt = Date.now()): { platz: number; von: number; tage: number } | null {
  try {
    const { gruppen, lernende } = gruppenUndLernende(jetzt)
    const k = hauptKlasse(ich, gruppen, lernende)
    if (!k) return null
    let c = klassen.get(k.g.id)
    if (!c || jetzt - c.t >= FRISCH_MS) {
      c = { t: jetzt, werte: new Map(k.mitglieder.map((n) => [n.id, tageImZeitraum(uebungsTage(n.id), jetzt)])) }
      klassen.set(k.g.id, c)
    }
    // Der eigene Wert immer frisch (eben geübt → sofort sichtbar)
    const werte = new Map(c.werte)
    const meine = tageImZeitraum(uebungsTage(ich.id), jetzt)
    werte.set(ich.id, meine)
    const p = platzVon(werte, ich.id)
    return p ? { ...p, tage: meine } : null
  } catch {
    return null
  }
}

/** Für Tests: Zwischenspeicher leeren */
export function vergleichVergessen(): void {
  schule = null
  gruppenStand = null
  klassen.clear()
}
