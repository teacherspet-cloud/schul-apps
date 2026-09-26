import { useState } from 'react'

/**
 * Menüpunkte, die den Fokus WEITERGEBEN – an ein Eingabefeld („Umbenennen", „Unterbereich
 * anlegen") oder an eine Rückfrage („Löschen").
 *
 * Anlass (26.09.2026, Wache themenbereiche.mjs): Ein Mantine-Menü gibt beim Schließen den Fokus
 * an seinen ⋯-Knopf zurück – 10 ms später und nur, wenn der Fokus noch dort steht, wo er beim
 * Schließen stand. Das Feld mit `autoFocus` hat ihn in diesem Moment aber schon: Mantine hält
 * es für den Menüpunkt und holt ihn zurück. Wer nach „Unterbereich anlegen" tippte, tippte ins
 * Leere, Enter öffnete das Menü von Neuem; beim Umbenennen im Baum schloss der Fokusverlust das
 * Feld sofort wieder (onBlur). Die Wache fiel nur auf, wenn der Rechner langsam war – mit
 * `fill()` holt Playwright den Fokus selbst, eine Lehrkraft tut das nicht.
 *
 * Lösung: Nur bei diesen Punkten auf die Rückgabe verzichten; Esc und die übrigen Punkte geben
 * den Fokus weiter an den ⋯-Knopf zurück (Tastaturbedienung).
 */
export function useMenueFokus(): {
  /** An das `<Menu>` geben */
  menue: { returnFocus: boolean; onOpen: () => void }
  /** Um den onClick eines Menüpunkts legen, der den Fokus weitergibt */
  weiter: (fn: () => void) => () => void
} {
  const [zurueck, setZurueck] = useState(true)
  return {
    menue: { returnFocus: zurueck, onOpen: () => setZurueck(true) },
    // Im selben Klick wie das Schließen gesetzt – React bündelt beides, Mantine sieht beim Schließen schon „nicht zurück"
    weiter: (fn) => () => {
      setZurueck(false)
      fn()
    }
  }
}
