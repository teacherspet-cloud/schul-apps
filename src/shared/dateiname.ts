/**
 * Freier Dateiname in einem Ordner: „Blatt.pdf", sonst „Blatt (2).pdf", „Blatt (3).pdf" …
 *
 * Anlass (25.09.2026): Das Arbeitsblatt speichert Blatt, Lösungen, Tafelbild und Hörtexte
 * jetzt in einem Rutsch in einen gewählten Ordner – ohne Speichern-Dialog je Datei. Damit
 * fehlt auch die Rückfrage von Windows „Datei ersetzen?". Eine vorhandene Datei (etwa die
 * Fassung von letzter Woche) darf deshalb nie stumm überschrieben werden.
 *
 * Gemeinsam für Hauptprozess und Oberfläche, damit die Regel an genau einer Stelle steht.
 */
export function freierDateiname(name: string, vorhanden: (kandidat: string) => boolean): string {
  if (!vorhanden(name)) return name
  const punkt = name.lastIndexOf('.')
  // „.pdf" am Ende ist die Endung – ein Punkt ganz vorn oder ohne Endung dahinter nicht
  const stamm = punkt > 0 ? name.slice(0, punkt) : name
  const endung = punkt > 0 ? name.slice(punkt) : ''
  for (let n = 2; n < 1000; n++) {
    const kandidat = `${stamm} (${n})${endung}`
    if (!vorhanden(kandidat)) return kandidat
  }
  // Tausend gleichnamige Dateien gibt es nicht wirklich – zur Sicherheit trotzdem eindeutig
  return `${stamm} (${Date.now()})${endung}`
}
