/**
 * Grammatik-Neubeginn (28.10.2026, von der Lehrkraft ausdrücklich gewünscht nach der Prüfung der Aufgabenbank: „Lade die
 * aktuellen Grammatikübungen zur Sicherung herunter. Entferne anschließend alle Grammatikübungen aus der Datenbank.“ –
 * Umfang abgestimmt: Aufgabenbank UND alle Grammatik-Trainings der Kurse samt Lernständen). Die Sicherung liegt beim
 * Betreiber (Schul-Apps-Sicherungen/Grammatik-2026-10-28), das Aufspielen legt zusätzlich eine Kopie der Datenbank an.
 * Ausgeführt mit den beiden Routinen vom 13.10.2026; die Grammatik-Auszeichnungen berichtigt achievements.ts still
 * (Regelstand 4). Das Protokoll nennt nur Zahlen.
 */
import type { DatabaseSync } from 'node:sqlite'
import { grammatikBankLoeschen } from './wartungBankLoeschen'
import { grammatikAlleLoeschen } from './wartungGrammatikAlle'

export function grammatikNeubeginn(d: DatabaseSync): string {
  const bank = grammatikBankLoeschen(d)
  const kurse = grammatikAlleLoeschen(d)
  return `${bank}; übrige: ${kurse}`
}

/** Eintrag für wartung.ts */
export const GRAMMATIK_NEUBEGINN: [string, (d: DatabaseSync) => string] = ['grammatik-neubeginn-2026-10-28', grammatikNeubeginn]
