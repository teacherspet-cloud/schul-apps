/**
 * Fächer aus IServ übernehmen (02.10.2026, Wunsch der Lehrkraft).
 *
 * Die Ordner unter „Gruppen" zeigen, wo jemand Mitglied ist – „Englisch" heißt: Englischlehrkraft
 * (shared/iservFaecher.ts). Nach dem Verbinden mit IServ (Einrichtungsassistent, Einstellungen)
 * werden die erkannten Fächer in die eigenen Fächer übernommen; auf dem Server bekommt sie
 * zusätzlich die Fachschaft (server/fachschaft.ts). Gilt für die Exe ohne Server, die iPad-App und
 * die Exe „Schul-Apps Online" – im reinen Browser kennt der Server das IServ-Passwort nicht.
 */
import { faecherAusGruppen } from '@shared/iservFaecher'
import { aufServer, hatClient } from './plattform'
import { useAppSettings } from './settingsStore'

/** IServ-Ordner sind hier lesbar (Exe, iPad-App, „Schul-Apps Online") */
export const iservHier = (): boolean => !aufServer() || hatClient()

/** Gruppenordner lesen, Fächer erkennen und übernehmen. Liefert die erkannten Fächer (ohne Verbindung: null). */
export async function faecherAusIservUebernehmen(): Promise<string[] | null> {
  if (!iservHier()) return null
  const status = (await window.api.iserv.status().catch(() => null)) as { verbunden?: boolean } | null
  if (!status?.verbunden) return null
  const ordner = (await window.api.iserv.ordner('Groups').catch(() => [])).map((e) => e.name)
  const erkannt = faecherAusGruppen(ordner)
  if (erkannt.length) {
    const { settings, update } = useAppSettings.getState()
    const vorher = settings.eigeneFaecher ?? []
    const neu = [...new Set([...vorher, ...erkannt])]
    if (neu.length !== vorher.length) await update({ eigeneFaecher: neu })
  }
  // Server: die Fachschaft kennt die Fächer aus IServ auch dann, wenn die eigene Auswahl leer bleibt
  if (aufServer())
    await fetch('/server/fachschaft/iserv-gruppen', {
      method: 'POST',
      headers: { 'x-schulapps-token': 'server', 'content-type': 'application/json' },
      body: JSON.stringify({ ordner })
    }).catch(() => undefined)
  return erkannt
}
