/**
 * „Grammatik hinzufügen" im Kurs (08.10.2026, Wunsch der Lehrkraft): Der Dialog „Grammatik zum Üben freigeben" zeigt die
 * schon freigegebenen Formen angehakt. Beim Speichern gilt:
 *  - neu angehakt (noch nie im Kurs) → Aufgaben erstellen lassen (KI, wie bisher),
 *  - schon freigegeben und angehakt → nichts (keine neuen Aufgaben),
 *  - schon freigegeben und abgehakt → sanft entfernen (Status „entfernt", Lernstand bleibt),
 *  - entfernt und wieder angehakt → wiederherstellen, ohne neue Aufgaben.
 * Ein Training mit mehreren Themen wird erst entfernt, wenn keines seiner Themen mehr angehakt ist. Trainings ohne
 * Katalog-Thema (eigenes Thema, Verben) und Extra-Aufgaben fasst der Dialog nicht an. Entwürfe (KI fertig, noch nicht
 * freigegeben) gelten als vorhanden – für sie entstehen keine zweiten Aufgaben.
 */
export interface BestehendeGrammatik {
  id: string
  themen: string[]
  status: 'offen' | 'beendet' | 'entfernt' | 'entwurf'
}

export interface FreigabeAbgleich {
  /** Themen, für die die KI Aufgaben erstellt */
  erzeugen: string[]
  /** Trainings, die sanft entfernt werden */
  entfernen: string[]
  /** Entfernte Trainings, die zurückkommen */
  wiederherstellen: string[]
}

/** Vorab angehakt: die Themen der freigegebenen (auch abgeschlossenen) Trainings und der Entwürfe */
export const vorabGewaehlt = (bestehend: BestehendeGrammatik[]): string[] => [
  ...new Set(bestehend.filter((b) => b.status !== 'entfernt').flatMap((b) => b.themen))
]

export function freigabeAbgleich(gewaehlt: string[], bestehend: BestehendeGrammatik[]): FreigabeAbgleich {
  const an = new Set(gewaehlt)
  const vorhanden = new Set(bestehend.flatMap((b) => b.themen))
  return {
    erzeugen: [...new Set(gewaehlt)].filter((t) => !vorhanden.has(t)),
    entfernen: bestehend
      .filter((b) => (b.status === 'offen' || b.status === 'beendet') && b.themen.length > 0 && !b.themen.some((t) => an.has(t)))
      .map((b) => b.id),
    wiederherstellen: bestehend.filter((b) => b.status === 'entfernt' && b.themen.some((t) => an.has(t))).map((b) => b.id)
  }
}
