/**
 * Erinnerungen zum Üben – das Gerät (10.10.2026, Server: src/server/erinnerungen.ts).
 *
 * Web Push braucht drei Dinge im Browser: einen Service Worker (/s/sw.js, Bereich „/s/"), die Erlaubnis für
 * Benachrichtigungen (nur nach Antippen erfragt) und eine Push-Anmeldung mit dem öffentlichen Schlüssel des Servers.
 * Auf iPhone/iPad geht das erst ab iOS 16.4 und nur in der Web-App vom Home-Bildschirm, nicht im Safari-Tab.
 */
import { senden } from './serverApi'

export type PushUnterstuetzung = 'ok' | 'ios-browser' | 'ios-alt' | 'unsicher' | 'keine' | 'gesperrt'

const aufAppleMobil = (): boolean =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const alsWebApp = (): boolean =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true

/** Kann dieses Gerät Erinnerungen bekommen – und wenn nicht, warum? */
export function pushUnterstuetzung(): PushUnterstuetzung {
  const da = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (aufAppleMobil() && !alsWebApp()) return 'ios-browser'
  if (!window.isSecureContext) return 'unsicher'
  if (!da) return aufAppleMobil() ? 'ios-alt' : 'keine'
  if (Notification.permission === 'denied') return 'gesperrt'
  return 'ok'
}

const ausB64u = (s: string): Uint8Array => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

async function registrierung(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register('/s/sw.js', { scope: '/s/' })
  return navigator.serviceWorker.ready
}

/** Bestehende Anmeldung dieses Geräts (ohne zu fragen) */
export async function vorhandeneAnmeldung(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null
  try {
    const reg = await navigator.serviceWorker.getRegistration('/s/')
    return reg ? await reg.pushManager.getSubscription() : null
  } catch {
    return null
  }
}

/**
 * Nach Antippen: Erlaubnis erfragen, anmelden, beim Server eintragen. Die Erlaubnis kommt zuerst – iOS fragt nur
 * direkt nach einer Berührung. Liefert einen Fehlertext oder ''.
 */
export async function geraetAnmelden(schluessel: string): Promise<string> {
  const erlaubnis = await Notification.requestPermission()
  if (erlaubnis !== 'granted')
    return erlaubnis === 'denied'
      ? 'Benachrichtigungen sind für diese Seite gesperrt. Du kannst sie in den Einstellungen des Browsers bzw. des Geräts erlauben.'
      : 'Ohne deine Erlaubnis kann das Gerät keine Erinnerungen zeigen.'
  const reg = await registrierung()
  let abo = await reg.pushManager.getSubscription()
  if (!abo) abo = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: ausB64u(schluessel) as BufferSource })
  await senden('/s/api/erinnerungen/geraet', { abo: abo.toJSON() })
  return ''
}

/** Dieses Gerät abmelden (beim Ausschalten und beim Abmelden vom Konto) – wartet höchstens kurz */
export async function geraetAbmelden(): Promise<void> {
  const ablauf = async (): Promise<void> => {
    const abo = await vorhandeneAnmeldung()
    if (!abo) return
    await fetch('/s/api/erinnerungen/geraet-entfernen', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-schulapps-token': 'server' },
      body: JSON.stringify({ endpoint: abo.endpoint })
    }).catch(() => undefined)
    await abo.unsubscribe().catch(() => false)
  }
  await Promise.race([ablauf().catch(() => undefined), new Promise((r) => setTimeout(r, 2500))])
}
