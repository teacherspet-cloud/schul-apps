/**
 * Tastatur-Hinweis zum Apostroph (08.10.2026, abgestimmt mit der Lehrkraft): Eine Antwort mit typografischem Apostroph
 * (’ ‘ ´ ` …) zählt als richtig; danach erscheint höchstens einmal am Tag je Gerät ein kleiner Hinweis, wie man das
 * gerade ' tippt – am PC über die Tastatur, am iPad/Telefon über die Bildschirmtastatur. Nicht im Onlinetest.
 */
import { notifications } from '@mantine/notifications'
import { falschesApostroph } from '@shared/apostroph'
import { touchAktiv } from '../../shared/touch/touchModus'

const SCHLUESSEL = 'sa-apostroph-hinweis'

const heute = (): string => new Date().toISOString().slice(0, 10)

const mitFinger = (): boolean => {
  try {
    return touchAktiv() || Boolean(window.matchMedia?.('(pointer: coarse)').matches)
  } catch {
    return false
  }
}

/** Nach einer als richtig gewerteten Eingabe aufrufen – zeigt den Hinweis, wenn ein falsches Apostroph-Zeichen darin steht */
export function apostrophHinweis(eingabe: string): void {
  if (!falschesApostroph(eingabe)) return
  try {
    if (localStorage.getItem(SCHLUESSEL) === heute()) return
    localStorage.setItem(SCHLUESSEL, heute())
  } catch {
    // Ohne Speicher (privates Fenster): Hinweis trotzdem zeigen
  }
  notifications.show({
    id: SCHLUESSEL,
    color: 'teal',
    autoClose: 9000,
    message: mitFinger()
      ? "Richtig! Das Apostroph ' findest du auf der Bildschirmtastatur auf der Zahlenebene (Taste .?123)."
      : "Richtig! Das Apostroph ' schreibst du auf der deutschen Tastatur mit ⇧ Umschalt + # (rechts neben dem Ä)."
  })
}
