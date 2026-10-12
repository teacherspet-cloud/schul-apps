/**
 * Grammatikformen der Lehrwerke laden (12.10.2026, App „Grammatikformen"): Die Bearbeitungen der Admins und Fachobleute
 * (Server: gemeinsamer Speicher, PC: eigener Ordner) über die eingebaute Liste legen – vor dem ersten Zeichnen der
 * Oberfläche (main.tsx) und nach jedem Speichern in der App. Alle Nutzer von LEHRWERK_GRAMMATIK lesen danach die
 * überlagerte Fassung; ohne Antwort bleibt die eingebaute (Rückfall).
 */
import { wendeGrammatikAn, type LehrwerkGrammatikEintrag } from './lehrwerkGrammatik'

/** Höchstens so lange wartet der Start auf die Liste */
const WARTEN_MS = 4000

export async function ladeGrammatikformen(): Promise<LehrwerkGrammatikEintrag[]> {
  try {
    const liste = await Promise.race([window.api.lehrwerkGrammatik.list(), new Promise<null>((ok) => setTimeout(() => ok(null), WARTEN_MS))])
    if (liste) wendeGrammatikAn(liste)
    return liste ?? []
  } catch {
    // ohne Liste gilt die eingebaute Grammatik
    return []
  }
}
