/**
 * Wohin die Lösungen beim Ausgeben gehen – gemeinsam für alle Programme.
 *
 * Anlass (25.09.2026): Nur Arbeitsblatt und Vokabeltest fragten danach. Lernzielkontrolle,
 * Grammatiktest und Klassenarbeit hängten die Lösungen stillschweigend an, sobald sie
 * eingeschaltet waren – wer das Blatt für die Klasse druckte, druckte den Lösungsteil mit.
 * Jetzt gibt es überall dieselben drei Möglichkeiten, Vorgabe „als eigene Datei" (beim
 * Drucken: „separat drucken", ein eigener Druckauftrag), und die letzte Wahl je Programm
 * wird gemerkt.
 */
export type LoesungsModus = 'none' | 'append' | 'separate'
export type AusgabeModus = 'docx' | 'pdf' | 'print'

const speicherSchluessel = (modul: string): string => `schul-apps-loesungen-${modul}`

/**
 * Was im Dialog vorgewählt ist. Ohne Lösungen im Dokument: „ohne". Sonst die zuletzt in diesem
 * Programm getroffene Wahl, beim ersten Mal „als eigene Datei".
 */
export function loesungsVorgabe(modul: string, hatLoesungen: boolean): LoesungsModus {
  if (!hatLoesungen) return 'none'
  try {
    const gemerkt = localStorage.getItem(speicherSchluessel(modul))
    if (gemerkt === 'none' || gemerkt === 'append' || gemerkt === 'separate') return gemerkt
  } catch {
    // ohne lokalen Speicher gilt die Vorgabe
  }
  return 'separate'
}

export function merkeLoesungsWahl(modul: string, wahl: LoesungsModus): void {
  try {
    localStorage.setItem(speicherSchluessel(modul), wahl)
  } catch {
    // nicht kritisch – beim nächsten Mal steht die Vorgabe da
  }
}

/** Beschriftung der drei Möglichkeiten; die Klassenarbeit sagt fachlich richtig „Erwartungshorizont". */
export function loesungsTexte(modus: AusgabeModus | null, erwartungshorizont = false): Record<LoesungsModus, string> {
  const wort = erwartungshorizont ? 'Erwartungshorizont' : 'Lösungen'
  return {
    none: `ohne ${wort}`,
    append: erwartungshorizont ? 'Erwartungshorizont anhängen' : 'Lösungsseiten anhängen',
    separate: modus === 'print' ? `${wort} separat drucken` : `${wort} als eigene Datei`
  }
}
