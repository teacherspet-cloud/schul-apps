/**
 * „Zu schnell geklickt" (09.10.2026, Wunsch der Lehrkraft): Bei Richtig/Falsch-Spielen und -Abfragen klicken manche
 * Lernende blind immer dieselbe Seite („Stimmt" … „Stimmt" …), sobald die Frage erscheint. Solche Antworten zählen nicht:
 * kein Punkt, kein Rekord, keine Veränderung im Karteikasten – dazu ein freundlicher Hinweis.
 *
 * Muster: mindestens SCHNELL_FOLGE gleiche Antworten hintereinander, jede schneller als SCHNELL_MS nach dem Erscheinen
 * der Frage. Ab der Antwort, die das Muster vollmacht, wird nicht mehr gewertet, solange es weitergeht; die davor schon
 * gewerteten Antworten der Folge gibt `zurueck` an (wer kann, nimmt sie zurück). Eine langsame oder andere Antwort
 * beendet die Folge.
 * Verfeinert (09.10.2026): Ist bekannt, ob die Antworten stimmen, zählt eine Folge nur, wenn mindestens SCHNELL_FALSCH
 * davon falsch sind – wer schnell UND richtig antwortet (Wortduell: Tempo ist das Ziel), rät nicht blind.
 */
export const SCHNELL_MS = 700
export const SCHNELL_FOLGE = 5
export const SCHNELL_FALSCH = 2
export const ZU_SCHNELL_TEXT = 'Zu schnell geklickt – das wird nicht gewertet. Lies erst und entscheide dann.'

export interface SchnellErgebnis<T> {
  /** Diese Antwort zählt */
  werten: boolean
  /** Hinweis „Zu schnell geklickt" zeigen */
  hinweis: boolean
  /** Schon gewertete Antworten derselben Folge (nur beim Erkennen des Musters, sonst leer) */
  zurueck: T[]
}

export interface SchnellWaechter<T> {
  /** Eine Antwort melden: `antwort` (z. B. „ja"/„nein"), `ms` seit dem Erscheinen der Frage, `daten` für `zurueck` */
  melden: (antwort: string, ms: number, daten?: T, richtig?: boolean) => SchnellErgebnis<T>
  zuruecksetzen: () => void
}

export function schnellWaechter<T = undefined>(grenzeMs = SCHNELL_MS, folge = SCHNELL_FOLGE): SchnellWaechter<T> {
  let reihe: { antwort: string; daten?: T; gewertet: boolean; richtig?: boolean }[] = []
  return {
    melden(antwort, ms, daten, richtig) {
      const schnell = Number.isFinite(ms) && ms >= 0 && ms < grenzeMs
      if (!schnell) {
        reihe = []
        return { werten: true, hinweis: false, zurueck: [] }
      }
      if (reihe.length && reihe[reihe.length - 1].antwort !== antwort) reihe = []
      const alle = [...reihe, { richtig }]
      const bekannt = alle.every((x) => typeof x.richtig === 'boolean')
      const falsch = alle.filter((x) => x.richtig === false).length
      const voll = reihe.length + 1 >= folge && (!bekannt || falsch >= SCHNELL_FALSCH)
      const zurueck = voll ? reihe.filter((x) => x.gewertet && x.daten !== undefined).map((x) => x.daten as T) : []
      // Zurückgenommene gelten danach als nicht gewertet (kein zweites Zurücknehmen)
      if (voll) for (const x of reihe) x.gewertet = false
      reihe.push({ antwort, daten, gewertet: !voll, richtig })
      return { werten: !voll, hinweis: voll, zurueck }
    },
    zuruecksetzen() {
      reihe = []
    }
  }
}
