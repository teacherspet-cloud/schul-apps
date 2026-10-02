/**
 * WebDAV-Abrufer der iPad-App für IServ (01.10.2026, main/services/iserv/webdav.ts).
 *
 * In der App über die native HTTP-Schicht (CapacitorHttp → URLSession): kein CORS, beliebige
 * Methoden (PROPFIND, MKCOL), Dateien als Base64 mit `dataType: 'file'` – capHttpFetch würde
 * Bytes als Text weiterreichen und PDFs zerstören. Im Browser (Prüf-Build, Fake-Server mit
 * CORS) das normale `fetch`. Nur https – die Prüfung steht zusätzlich in webdav.ts.
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import type { DavAbruf } from '../../main/services/iserv/webdav'
import { ausBase64, nachBase64 } from '../base64'

/** Nur im Prüf-Build (SCHULAPPS_MOBIL_TEST=1, vite.mobil.config.ts) – im Build für die Lehrkraft immer false */
declare const __KI_ATTRAPPE_ERLAUBT__: boolean
const pruefBuild = (): boolean => typeof __KI_ATTRAPPE_ERLAUBT__ !== 'undefined' && __KI_ATTRAPPE_ERLAUBT__ && !Capacitor.isNativePlatform()

/** Prüf-Build: Der Fake-Server läuft auf http://127.0.0.1 – nur dort erlaubt */
const pruefAdresse = (url: string): boolean => pruefBuild() && /^http:\/\/127\.0\.0\.1:\d+\//.test(url)

/** Für den Prüf-Build: https-Adressen auf den Fake-Server umbiegen (localStorage „schulapps-iserv-test") */
function umleiten(url: string): string {
  if (!pruefBuild()) return url
  let ziel: string | null = null
  try {
    ziel = localStorage.getItem('schulapps-iserv-test')
  } catch {
    ziel = null
  }
  if (!ziel || !/^http:\/\/127\.0\.0\.1:\d+$/.test(ziel)) return url
  // https://webdav.meineschule.de/Home/… → http://127.0.0.1:PORT/webdav.meineschule.de/Home/…
  return url.replace(/^https:\/\//, `${ziel}/`)
}

export const mobilDavAbruf: DavAbruf = async (a) => {
  if (Capacitor.isNativePlatform()) {
    const bytes = a.koerper instanceof Uint8Array
    const antwort = await CapacitorHttp.request({
      url: a.url,
      method: a.methode,
      headers: a.kopf,
      ...(a.koerper === undefined ? {} : bytes ? { data: nachBase64(a.koerper as Uint8Array), dataType: 'file' as const } : { data: a.koerper }),
      // Dateien laden (02.10.2026): als Blob kommt der Inhalt Base64-kodiert zurück
      responseType: a.binaer ? 'blob' : 'text',
      connectTimeout: 20_000,
      readTimeout: 120_000
    })
    if (antwort.url && !antwort.url.startsWith('https://')) throw new Error('Weiterleitung auf eine unverschlüsselte Adresse')
    if (a.binaer) return { status: antwort.status, text: '', bytes: typeof antwort.data === 'string' ? ausBase64(antwort.data) : new Uint8Array() }
    const text = typeof antwort.data === 'string' ? antwort.data : antwort.data == null ? '' : JSON.stringify(antwort.data)
    return { status: antwort.status, text }
  }
  const url = umleiten(a.url)
  if (!url.startsWith('https://') && !pruefAdresse(url)) throw new Error('Nur verschlüsselte Verbindungen')
  const res = await fetch(url, {
    method: a.methode,
    headers: a.kopf,
    body: a.koerper === undefined ? undefined : typeof a.koerper === 'string' ? a.koerper : new Uint8Array(a.koerper).slice().buffer
  })
  if (a.binaer) return { status: res.status, text: '', bytes: new Uint8Array(await res.arrayBuffer()) }
  return { status: res.status, text: await res.text() }
}
