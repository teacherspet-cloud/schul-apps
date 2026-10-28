/**
 * Testvorbereitung der Lernenden (28.10.2026, abgestimmt mit der Lehrkraft): Unter „Mein Fortschritt" steht ein
 * anstehender Test (Testtermin eines Kurses oder angekündigter Onlinetest) ab 14 Tage vorher. Ein Klick führt auf die Seite
 * „Für den Test üben" mit Bereitschaft, „Vokabeln für den Test üben" (zuerst das Unsichere) und der Grammatik des Tests.
 * Geübt wird im normalen Kasten – es zählt aufs Tagesziel.
 */

/** Ab so vielen Tagen vor dem Termin erscheint der Test */
export const TEST_VORLAUF_TAGE = 14

export interface AnstehenderTest {
  /** Kurs-Kennung bzw. „online:<id>" */
  id: string
  art: 'kurs' | 'online'
  titel: string
  fach: string
  termin: number
  kursId?: string
  onlineId?: string
  /** Abschnitte des Tests (Namen) */
  abschnitte: string[]
  /** Vokabeln des Tests: sicher, im Aufbau, neu */
  vok: { sicher: number; aufbau: number; neu: number; gesamt: number } | null
  /** Grammatik des Tests: je Training der Anteil sicherer Aufgaben */
  gram: { id: string; titel: string; sicher: number; gesamt: number }[]
}

/** Bereitschaft 0–1: sichere Vokabeln zählen voll, Wörter im Aufbau halb; Grammatik nach sicheren Aufgaben */
export function bereitschaft(t: Pick<AnstehenderTest, 'vok' | 'gram'>): number | null {
  let soll = 0
  let ist = 0
  if (t.vok && t.vok.gesamt) {
    soll += t.vok.gesamt
    ist += t.vok.sicher + t.vok.aufbau / 2
  }
  for (const g of t.gram)
    if (g.gesamt) {
      // Jede Grammatik zählt so viel wie zehn Wörter – sonst ginge sie neben langen Wortlisten unter
      soll += 10
      ist += (g.sicher / g.gesamt) * 10
    }
  return soll ? ist / soll : null
}

/** „heute", „morgen", „in 5 Tagen" bzw. „am Fr, 7.11." */
export function testWann(termin: number, jetzt = Date.now()): string {
  const tag = (x: number): number => {
    const d = new Date(x)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  const n = Math.round((tag(termin) - tag(jetzt)) / 864e5)
  if (n <= 0) return 'heute'
  if (n === 1) return 'morgen'
  if (n <= 6) return `in ${n} Tagen`
  return `am ${new Date(termin).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' })}`
}
