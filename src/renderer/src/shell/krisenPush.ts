/**
 * Benachrichtigungen für vertrauliche Hinweise – das Gerät der Lehrkraft (23.10.2026, Prüfung des Schulträgers;
 * Server: src/server/krise.ts). Derselbe Service Worker wie bei den Erinnerungen der Lernenden (/s/sw.js, Bereich
 * „/s/") – eine Seite außerhalb des Bereichs darf ihn anmelden; die Push-Anmeldung hängt an der Registrierung, nicht an
 * der Seite. Angemeldet wird nur nach Antippen und nur bei der Route der Krisenhinweise (/server/krisen/geraet).
 * Die Nachricht enthält nie Namen oder Inhalt, nur „Neuer vertraulicher Hinweis in Schul-Apps".
 */
import { holen, senden } from '../modules/onlinetest/serverApi'
import { pushUnterstuetzung, vorhandeneAnmeldung, type PushUnterstuetzung } from '../modules/onlinetest/erinnerungenGeraet'

export { pushUnterstuetzung, type PushUnterstuetzung }

const ausB64u = (s: string): Uint8Array => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

/** Ist dieses Gerät für vertrauliche Hinweise angemeldet? */
export async function krisenPushAn(): Promise<boolean> {
  const abo = await vorhandeneAnmeldung()
  if (!abo) return false
  try {
    return Boolean((await senden<{ registriert: boolean }>('/server/krisen/geraet-pruefen', { endpoint: abo.endpoint })).registriert)
  } catch {
    return false
  }
}

/** Nach Antippen: Erlaubnis erfragen, anmelden, beim Server eintragen. Liefert einen Fehlertext oder ''. */
export async function krisenPushEinschalten(): Promise<string> {
  const erlaubnis = await Notification.requestPermission()
  if (erlaubnis !== 'granted')
    return erlaubnis === 'denied'
      ? 'Benachrichtigungen sind für diese Seite im Browser gesperrt und lassen sich dort in den Einstellungen erlauben.'
      : 'Ohne Erlaubnis zeigt das Gerät keine Benachrichtigungen.'
  const { schluessel } = await holen<{ schluessel: string }>('/server/krisen/geraet')
  await navigator.serviceWorker.register('/s/sw.js', { scope: '/s/' })
  const reg = await navigator.serviceWorker.ready
  let abo = await reg.pushManager.getSubscription()
  if (!abo) abo = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: ausB64u(schluessel) as BufferSource })
  await senden('/server/krisen/geraet', { abo: abo.toJSON() })
  return ''
}

/** Dieses Gerät beim Server abmelden (die Browser-Anmeldung bleibt, falls andere sie nutzen) */
export async function krisenPushAusschalten(): Promise<void> {
  const abo = await vorhandeneAnmeldung()
  if (abo) await senden('/server/krisen/geraet-entfernen', { endpoint: abo.endpoint })
}

/** Ereignis, wenn sich die Zahl offener Hinweise geändert haben kann (Karte → roter Punkt) */
export const KRISEN_EREIGNIS = 'schulapps-krisen'
export const krisenGeaendert = (): void => void window.dispatchEvent(new Event(KRISEN_EREIGNIS))
