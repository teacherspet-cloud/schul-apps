/*
 * „Einrichtung neu starten" (23.10.2026, Wunsch der Lehrkraft): Der Knopf in den Einstellungen öffnet den
 * Einrichtungsassistenten (Einrichtung.tsx) von vorn. Er zeigt dieselben Karten wie die Einstellungen – alles schon
 * Eingetragene steht darin und lässt sich ändern. Eigene Datei, weil Einrichtung.tsx aus SettingsPage.tsx importiert.
 */
const neuStart = new Set<() => void>()

export function einrichtungNeuStarten(): void {
  neuStart.forEach((f) => f())
}

/** Der Assistent meldet sich an; liefert das Abmelden */
export function aufNeustartHoeren(f: () => void): () => void {
  neuStart.add(f)
  return () => void neuStart.delete(f)
}
