/**
 * Niveau und Ablauf der Sprechprüfung je Sprache und Jahrgang (19.10.2026, Recherche „vorgaben.md").
 *
 * Belegt: GER-Ziele Sprechen am Ende der Jahrgänge (KC Englisch Gym 2015, KC Französisch 2025, KC Spanisch Gym 2017),
 * Höchstdauer für zwei Prüflinge (Erlass 02.11.2015), drei Teile ohne Vorbereitungszeit; in den ersten beiden
 * Lernjahren darf ein Teil entfallen. Die Zwischenjahrgänge sind interpoliert (Faustregel).
 */
export type SprechSprache = 'en' | 'fr' | 'es'
export type Niveau = 'A1' | 'A1+' | 'A2' | 'A2+' | 'B1' | 'B1+' | 'B2'
export const NIVEAUS: Niveau[] = ['A1', 'A1+', 'A2', 'A2+', 'B1', 'B1+', 'B2']

/** GER-Ziel je Jahrgang (Gymnasium; 2. Fremdsprache ab Jg 6/7) */
const ZIELE: Record<SprechSprache, Record<number, Niveau>> = {
  en: { 5: 'A1', 6: 'A1+', 7: 'A2', 8: 'A2+', 9: 'B1', 10: 'B1+', 11: 'B1+', 12: 'B2', 13: 'B2' },
  fr: { 6: 'A1', 7: 'A1', 8: 'A1+', 9: 'A2', 10: 'A2+', 11: 'B1', 12: 'B1+', 13: 'B2' },
  es: { 6: 'A1', 7: 'A1', 8: 'A1+', 9: 'A2+', 10: 'B1', 11: 'B1', 12: 'B1+', 13: 'B2' }
}

/**
 * Andere Schulformen (24.10.2026, Wunsch der Lehrkraft: alle Schulformen): Englisch nach KC Sek I 2026 bzw. IGS-Erlass
 * 2017 Anlage 1 – erweitertes Niveau (Realschule, Oberschule, IGS/KGS E-Kurs): 5 A1 · 6 A1+ · 7 A1+ · 8 A2 · 9 A2+ ·
 * 10 B1; grundlegendes Niveau (Hauptschule, G-Kurs): 5–7 A1 · 8 A1+ · 9 A2 · 10 A2+. Zweite Fremdsprache (KC 2025, alle
 * Schulformen): Jg 7 A1 · 9 A2 · 10 A2/B1 – eine Stufe unter dem Gymnasium ab Jg 9.
 */
const ZIELE_ERWEITERT: Record<number, Niveau> = { 5: 'A1', 6: 'A1+', 7: 'A1+', 8: 'A2', 9: 'A2+', 10: 'B1' }
const ZIELE_GRUNDLEGEND: Record<number, Niveau> = { 5: 'A1', 6: 'A1', 7: 'A1', 8: 'A1+', 9: 'A2', 10: 'A2+' }
export type NiveauProfil = 'gymnasial' | 'erweitert' | 'grundlegend'

/** Profil aus der Schulform-Kennung (shared/schulformen.ts), unbekannt = gymnasial */
export function niveauProfil(schulform: string | null | undefined): NiveauProfil {
  const s = (schulform ?? '').toLowerCase()
  if (!s) return 'gymnasial'
  if (s.includes('haupt')) return 'grundlegend'
  if (
    s.includes('real') ||
    s.includes('ober') ||
    s.includes('gesamt') ||
    s.includes('igs') ||
    s.includes('kgs') ||
    s.includes('sekundar') ||
    s.includes('gemeinschaft') ||
    s.includes('stadtteil') ||
    s.includes('regional') ||
    s.includes('mittel') ||
    s.includes('werkreal')
  )
    return 'erweitert'
  return 'gymnasial'
}

const eineStufeTiefer = (n: Niveau): Niveau => NIVEAUS[Math.max(0, NIVEAUS.indexOf(n) - 1)]

export function zielNiveau(sprache: SprechSprache, jahrgang: number | null | undefined, schulform?: string | null): Niveau {
  const z = ZIELE[sprache]
  if (!jahrgang) return 'A2'
  const j = Math.max(Math.min(...Object.keys(z).map(Number)), Math.min(13, jahrgang))
  const gym = z[j] ?? 'A2'
  const profil = niveauProfil(schulform)
  if (profil === 'gymnasial' || j >= 11) return gym
  if (sprache === 'en') return (profil === 'erweitert' ? ZIELE_ERWEITERT : ZIELE_GRUNDLEGEND)[j] ?? gym
  // 2. Fremdsprache: ab Jg 9 eine Stufe unter dem Gymnasium (grundlegend: ab Jg 8)
  return j >= (profil === 'erweitert' ? 9 : 8) ? eineStufeTiefer(gym) : gym
}

/** Grobe Stufe für Phrases und Aufgaben */
export type Stufe = 'A1' | 'A2' | 'B1' | 'B2'
export const stufeVonNiveau = (n: Niveau): Stufe => (n.startsWith('A1') ? 'A1' : n.startsWith('A2') ? 'A2' : n.startsWith('B1') ? 'B1' : 'B2')

export type Teil = 'interview' | 'monolog' | 'dialog' | 'simulation'
export const TEILE: Teil[] = ['interview', 'monolog', 'dialog', 'simulation']
export const TEIL_NAME: Record<Teil, string> = { interview: 'Interview', monolog: 'Monolog', dialog: 'Dialog', simulation: 'Ganze Sprechprüfung' }

/**
 * Minuten je Teil für EINEN Prüfling (Höchstdauer für zwei Prüflinge geteilt, belegt: A1 8–10, A2 12–13, B1 15–16,
 * Oberstufe 20 Min.; Teil-Anteile nach den Materialbänden: Interview 1–2, Monolog 2, Dialog 2–3 bzw. 5 Min.).
 */
export function minutenJeTeil(n: Niveau, oberstufe = false): Record<Exclude<Teil, 'simulation'>, number> {
  if (oberstufe) return { interview: 3.5, monolog: 2, dialog: 3.5 }
  const s = stufeVonNiveau(n)
  if (s === 'A1') return { interview: 1.5, monolog: 1, dialog: 2 }
  if (s === 'A2') return { interview: 2, monolog: 1.5, dialog: 2.5 }
  return { interview: 2.5, monolog: 2, dialog: 3 }
}

/** Obergrenze einer Übung in Minuten (Prüfungszeit + Puffer; Simulation: alle Teile + Moderation) */
export function hoechstMinuten(teil: Teil, n: Niveau, oberstufe = false): number {
  const m = minutenJeTeil(n, oberstufe)
  if (teil === 'simulation') return Math.ceil(m.interview + m.monolog + m.dialog + 3)
  return Math.ceil(m[teil] * 2 + 1)
}

/** Teile, die es im Jahrgang gibt: im ersten Lernjahr (A1) darf ein Teil entfallen – angeboten werden trotzdem alle */
export const TEIL_BESCHREIBUNG: Record<Teil, string> = {
  interview: 'Die Prüferin stellt Fragen zu dir und deinem Alltag – zuerst offen, dann gezielter.',
  monolog: 'Du sprichst allein über ein Bild: beschreiben, vermuten, deine Meinung sagen.',
  dialog: 'Du sprichst mit einer Partnerin: fragen, Vorschläge machen, euch einigen.',
  simulation: 'Alle drei Teile am Stück wie in der echten Prüfung – ohne Hilfen.'
}
