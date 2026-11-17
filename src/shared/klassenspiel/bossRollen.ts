/**
 * Boss-Kampf „mit Rollen" (17.11.2026, abgestimmt mit der Lehrkraft): Tank, Heiler, Angreifer.
 * - Alle bekommen dieselben Aufgaben; die Rolle bestimmt nur, was eine richtige Antwort bewirkt:
 *   Angreifer schaden dem Boss (1,5-fach, als Einzige), Tanks laden den Klassenschild (fängt Bossschläge zuerst ab) und
 *   bekommen Angriffskugeln bevorzugt, Heiler heilen die Klasse.
 * - Freie Wahl im Wartebereich mit Obergrenze: je Rolle höchstens die Hälfte der Klasse; wer nicht wählt, kommt beim
 *   Start in die kleinste Rolle. Kein Wechsel im Kampf. Namen je Rolle nur im Wartebereich am Beamer.
 * FAUSTREGELN (Simulation in tests/klassenspiel.test.ts, 17.11.2026): Der Boss schlägt mit Rollen doppelt so hart zu
 * (boss.ts ROLLEN_BOSSSCHADEN). Schild je richtiger Tank-Antwort 0,4 Grund-Kugeln, je Abwehr durch einen Tank 0,7,
 * höchstens 30; Heilung je richtiger Heiler-Antwort 0,3 Grund-Kugeln. Gemischte Klasse (¼ Tanks, ¼ Heiler, ½ Angreifer)
 * bei 78 %: Boss fällt, Klasse behält ≈ 65 % Leben (wie ohne Rollen); bei 45 %: Niederlage. Ohne Tanks und Heiler wird es
 * spürbar knapper.
 */
export type BossRolle = 'tank' | 'heiler' | 'angreifer'
export const BOSS_ROLLEN: BossRolle[] = ['tank', 'heiler', 'angreifer']
export const istBossRolle = (x: unknown): x is BossRolle => x === 'tank' || x === 'heiler' || x === 'angreifer'

export const ROLLEN_SYMBOL: Record<BossRolle, string> = { tank: '🛡️', heiler: '💚', angreifer: '⚔️' }

export const SCHILD_MAX = 30
export const SCHILD_JE_ANTWORT = 0.4
export const SCHILD_JE_ABWEHR = 0.7
export const HEILUNG_JE_ANTWORT = 0.3
export const ANGREIFER_FAKTOR = 1.5

/** Höchstzahl je Rolle bei `n` Personen (mindestens 1, damit die Ersten frei wählen können) */
export const rollenGrenze = (n: number): number => Math.max(1, Math.ceil(n / 2))

export function rollenZahlen(rollen: Record<string, BossRolle | undefined>, ids: string[]): Record<BossRolle, number> {
  const z: Record<BossRolle, number> = { tank: 0, heiler: 0, angreifer: 0 }
  for (const id of ids) {
    const r = rollen[id]
    if (r) z[r]++
  }
  return z
}

/** Kleinste Rolle (bei Gleichstand: Tank, dann Heiler, dann Angreifer – Schutz zuerst) */
export function kleinsteRolle(zahlen: Record<BossRolle, number>): BossRolle {
  return [...BOSS_ROLLEN].sort((a, b) => zahlen[a] - zahlen[b])[0]
}
