/**
 * Bildbestand des Boss-Kampfs (17.11.2026, abgestimmt mit der Lehrkraft): Figuren der Lernenden, Monster und
 * Hintergründe je Jahrgangsband (5–6, 7–8, 9–10, 11–13) und Welt (Fantasy, Weltraum, Natur/Urzeit, Mythologie).
 * Die Bilder entstehen per Bild-KI (ChatGPT-Abo der Lehrkraft) als Bögen mit vier Posen und liegen als WebP unter
 * renderer/src/assets/klassenspiele/boss/ – Dateinamen: held-<id>-<pose>, boss-<id>-<pose>, hg-<id>, begleiter-<id>.
 * Die Listen erzeugt scripts/bossbilder/bestand.py aus den vorhandenen Bildern (bossBestandDaten.ts).
 *
 * Fehlt einem Band noch etwas, gilt das nächstgelegene Band mit Bildern (Aufbau des Bestands Band für Band).
 * Monsternamen in der Kurssprache (Wunsch der Lehrkraft) – de/en/fr/es/it/la, sonst Englisch.
 * Mit Rollen (17.11.2026): Tanks und Heiler wählen nur Figuren ihrer Rolle, Angreifer alle übrigen.
 */
import { textSprache } from '../spielSprache'
import { BEGLEITER_DATEN, FIGUREN_DATEN, HINTERGRUND_DATEN, MONSTER_DATEN } from './bossBestandDaten'

export type BossBand = '5-6' | '7-8' | '9-10' | '11-13'
export type BossWelt = 'fantasy' | 'weltraum' | 'natur' | 'mythos'
export const BOSS_BAENDER: BossBand[] = ['5-6', '7-8', '9-10', '11-13']

/** Band aus dem Jahrgang der Lerngruppe; ohne Jahrgang das mittlere Band 7–8 (abgestimmt) */
export function bandVon(jahrgang: number | null | undefined): BossBand {
  if (!jahrgang) return '7-8'
  if (jahrgang <= 6) return '5-6'
  if (jahrgang <= 8) return '7-8'
  if (jahrgang <= 10) return '9-10'
  return '11-13'
}

type Namen = { de: string; en: string; fr: string; es: string; it: string; la: string }

export interface FigurInfo {
  id: string
  band: BossBand
  /** Rollenfigur (Boss-Kampf mit Rollen); ohne Angabe: Angreifer */
  rolle?: 'tank' | 'heiler'
  /** Spezialangriff-Pose vorhanden (held-<id>-spezial) */
  spezial?: boolean
  /** Rollenposen vorhanden (held-<id>-rolle1/-rolle2) */
  rollenposen?: boolean
}
export interface MonsterInfo {
  id: string
  band: BossBand
  welt: BossWelt
  namen: Namen
  /** Rückfall-Symbol (Gerät, alte Ansichten) */
  symbol: string
  /** Rüstungs- und Raserei-Fassung vorhanden */
  phasen?: boolean
}
export interface HintergrundInfo {
  id: string
  band: BossBand
  welt: BossWelt
}

export const FIGUREN: FigurInfo[] = FIGUREN_DATEN
export const MONSTER: MonsterInfo[] = MONSTER_DATEN
export const HINTERGRUENDE: HintergrundInfo[] = HINTERGRUND_DATEN
/** Begleiter (Ausrüstung Stufe 3) – Bilder begleiter-<id> */
export const BEGLEITER: string[] = BEGLEITER_DATEN

/** Bänder nach Nähe zum gewünschten (für den Rückfall) */
function naechsteBaender(b: BossBand): BossBand[] {
  const i = BOSS_BAENDER.indexOf(b)
  return [...BOSS_BAENDER].sort((x, y) => Math.abs(BOSS_BAENDER.indexOf(x) - i) - Math.abs(BOSS_BAENDER.indexOf(y) - i) || BOSS_BAENDER.indexOf(x) - BOSS_BAENDER.indexOf(y))
}
function imBand<T extends { band: BossBand }>(liste: T[], band: BossBand): T[] {
  for (const b of naechsteBaender(band)) {
    const l = liste.filter((x) => x.band === b)
    if (l.length) return l
  }
  return []
}

/**
 * Figuren zur Wahl: Band des Jahrgangs (sonst das nächste mit Bildern). Mit Rolle: Tanks/Heiler nur ihre Figuren,
 * Angreifer alle ohne Rolle; gibt es (noch) keine passenden, alle des Bands.
 */
export function figurenFuer(jahrgang: number | null | undefined, rolle?: 'tank' | 'heiler' | 'angreifer' | null): FigurInfo[] {
  const alle = imBand(FIGUREN, bandVon(jahrgang))
  if (!rolle) return alle
  const passend = alle.filter((f) => (rolle === 'angreifer' ? !f.rolle : f.rolle === rolle))
  return passend.length ? passend : alle
}
export const monsterFuer = (jahrgang: number | null | undefined): MonsterInfo[] => imBand(MONSTER, bandVon(jahrgang))
export const monster = (id: string): MonsterInfo | undefined => MONSTER.find((m) => m.id === id)
export const istFigur = (id: unknown): id is string => typeof id === 'string' && FIGUREN.some((f) => f.id === id)

/** Hintergrund zur Welt des Monsters (sonst irgendeiner des Bands) */
export function hintergrundFuer(jahrgang: number | null | undefined, welt: BossWelt, zufall: number): HintergrundInfo | null {
  const l = imBand(HINTERGRUENDE, bandVon(jahrgang))
  const passend = l.filter((h) => h.welt === welt)
  const aus = passend.length ? passend : l
  return aus.length ? aus[Math.floor(zufall * aus.length) % aus.length] : null
}

/** Monstername in der Kurssprache (Rückfall Englisch) */
export function monsterName(m: MonsterInfo, sprache: string | null | undefined): string {
  return (m.namen as Record<string, string>)[textSprache(sprache)] ?? m.namen.en
}

/**
 * Ausrüstung je Kind (abgestimmt 17.11.2026): zählt gewonnene Boss-Kämpfe mit Teilnahme (nur Schülerkonten).
 * Stufe 1 Bodenplattform, 2 Leuchtaura, 3 Begleiter, 4 Abzeichen über dem Kopf, 5 goldene Aura.
 * FAUSTREGEL: Schwellen 1/3/6/10/15 Siege.
 */
export const AUSRUESTUNG_SCHWELLEN = [1, 3, 6, 10, 15]
export const ausruestungStufe = (siege: number): number => AUSRUESTUNG_SCHWELLEN.filter((s) => siege >= s).length
