/**
 * „Grammatik hinzufügen" im Kurs (08.10.2026, Wunsch der Lehrkraft). Seit 09.10.2026 (Wunsch der Lehrkraft) steht schon
 * freigegebene Grammatik NICHT mehr zur Wahl – sie steht in der Grammatik-Tabelle des Kurses (dort „+ Aufgaben" und
 * Entfernen). Der Dialog fügt also nur hinzu:
 *  - neu angehakt (noch nie im Kurs) → Aufgaben erstellen lassen (KI, wie bisher),
 *  - früher entfernt und wieder angehakt → wiederherstellen, ohne neue Aufgaben (Lernstand gilt weiter).
 * Entfernt wird hier nichts mehr. Entwürfe (KI fertig, noch nicht freigegeben) gelten als vorhanden – für sie entstehen
 * keine zweiten Aufgaben.
 */
export interface BestehendeGrammatik {
  id: string
  themen: string[]
  status: 'offen' | 'beendet' | 'entfernt' | 'entwurf'
}

export interface FreigabeAbgleich {
  /** Themen, für die die KI Aufgaben erstellt */
  erzeugen: string[]
  /** Entfernte Trainings, die zurückkommen */
  wiederherstellen: string[]
}

/** Nicht zur Wahl: Themen der freigegebenen (auch abgeschlossenen) Trainings und der Entwürfe – nicht Entferntes */
export const schonImKurs = (bestehend: BestehendeGrammatik[]): string[] => [
  ...new Set(bestehend.filter((b) => b.status !== 'entfernt').flatMap((b) => b.themen))
]

export function freigabeAbgleich(gewaehlt: string[], bestehend: BestehendeGrammatik[]): FreigabeAbgleich {
  const aktiv = new Set(schonImKurs(bestehend))
  const an = new Set(gewaehlt.filter((t) => !aktiv.has(t)))
  const vorhanden = new Set(bestehend.flatMap((b) => b.themen))
  return {
    erzeugen: [...an].filter((t) => !vorhanden.has(t)),
    wiederherstellen: bestehend.filter((b) => b.status === 'entfernt' && b.themen.some((t) => an.has(t))).map((b) => b.id)
  }
}

/** Zusammenfassung unter der Auswahl: „2 neu (KI erstellt Aufgaben) · 1 zurückholen" */
export function abgleichText(a: FreigabeAbgleich): string {
  return [a.erzeugen.length ? `${a.erzeugen.length} neu (KI erstellt Aufgaben)` : '', a.wiederherstellen.length ? `${a.wiederherstellen.length} zurückholen` : '']
    .filter(Boolean)
    .join(' · ')
}
