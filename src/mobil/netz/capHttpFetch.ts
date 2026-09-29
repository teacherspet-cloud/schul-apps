/**
 * `fetch` über die native HTTP-Schicht von Capacitor – für Abrufe fremder Seiten.
 *
 * Im WKWebView scheitert `fetch` an allen Seiten, die kein CORS erlauben: Wikisource, Projekt
 * Gutenberg, YouTube-Untertitel, Bildarchive. CapacitorHttp ruft sie nativ ab (URLSession) und
 * kennt kein CORS. Eingesetzt wird dieser Abrufer NUR für die Dienste, die über
 * main/services/images/politeFetch.ts laufen (`setzeAbrufer` in mobil/start.ts). Das globale
 * CapacitorHttp bleibt aus (capacitor.config.ts): Die KI-SDKs brauchen das normale `fetch` mit
 * Datenstrom, und deren Schnittstellen erlauben CORS.
 *
 * Unterschiede zu `fetch`: Der Körper kommt am Stück (kein Strom), `redirect: 'manual'` schaltet
 * das Folgen ab (politeFetch prüft jede Station selbst), ein Abbruch über `signal` beendet das
 * Warten – die native Anfrage läuft dann still zu Ende.
 */
import { CapacitorHttp, type HttpOptions } from '@capacitor/core'
import { ausBase64 } from '../base64'

const OHNE_KOERPER = new Set([101, 103, 204, 205, 304])
const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s)

function kopfzeilen(h: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  new Headers(h ?? {}).forEach((v, k) => (out[k] = v))
  return out
}

/** Der Körper der Antwort – je nach Inhaltstyp und Plattform kommt er verschieden an */
export function antwortKoerper(daten: unknown, inhaltstyp: string): Uint8Array {
  if (daten === null || daten === undefined || daten === '') return new Uint8Array()
  if (typeof daten !== 'string') return utf8(JSON.stringify(daten))
  if (inhaltstyp.includes('json')) {
    // JSON, das sich nicht auswerten ließ, kommt als Text – oder als Base64, wenn die Schicht es nicht erkannte
    try {
      JSON.parse(daten)
      return utf8(daten)
    } catch {
      try {
        return ausBase64(daten)
      } catch {
        return utf8(daten)
      }
    }
  }
  try {
    return ausBase64(daten)
  } catch {
    return utf8(daten)
  }
}

async function koerperFuer(body: BodyInit | null | undefined, kopf: Record<string, string>): Promise<unknown> {
  if (body === null || body === undefined) return undefined
  if (typeof body === 'string') {
    if ((kopf['content-type'] ?? '').includes('json')) {
      try {
        return JSON.parse(body)
      } catch {
        return body
      }
    }
    return body
  }
  if (body instanceof URLSearchParams) {
    kopf['content-type'] ??= 'application/x-www-form-urlencoded'
    return body.toString()
  }
  return new TextDecoder().decode(await new Response(body).arrayBuffer())
}

export async function capHttpFetch(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  const url = input instanceof Request ? input.url : String(input)
  const signal = init.signal ?? undefined
  if (signal?.aborted) throw signal.reason ?? new DOMException('Der Vorgang wurde abgebrochen.', 'AbortError')
  const kopf = kopfzeilen(init.headers)
  const optionen: HttpOptions = {
    url,
    method: (init.method ?? 'GET').toUpperCase(),
    headers: kopf,
    data: await koerperFuer(init.body, kopf),
    responseType: 'arraybuffer',
    connectTimeout: 20_000,
    readTimeout: 30_000,
    disableRedirects: init.redirect === 'manual'
  }
  const anfrage = CapacitorHttp.request(optionen)
  const antwort = await (signal
    ? Promise.race([
        anfrage,
        new Promise<never>((_, nein) =>
          signal.addEventListener('abort', () => nein(signal.reason ?? new DOMException('Der Vorgang wurde abgebrochen.', 'AbortError')), { once: true })
        )
      ])
    : anfrage)
  const headers = new Headers()
  for (const [k, v] of Object.entries(antwort.headers ?? {})) headers.set(k, String(v))
  const status = Math.min(599, Math.max(200, antwort.status || 200))
  const koerper = OHNE_KOERPER.has(status) ? null : antwortKoerper(antwort.data, headers.get('content-type') ?? '')
  // Die Kopie: Response nimmt keinen Puffer, der größer ist als die Ansicht darauf
  const res = new Response(koerper ? new Uint8Array(koerper).slice().buffer : null, { status, headers })
  // Die Adresse nach Weiterleitungen – `Response.url` ist sonst leer
  Object.defineProperty(res, 'url', { value: antwort.url || url })
  return res
}
