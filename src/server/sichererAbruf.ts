/**
 * Abruf zu frei eingetragenen KI-Adressen ohne DNS-Rebinding (22.10.2026, offener Punkt der KI-Sicherheitsprüfung).
 *
 * Vorher prüfte der Server den Namen VOR dem Abruf (bremse.ts › dnsAdressPruefer); ein Name, der danach auf eine interne
 * Adresse wechselt, kam noch durch. Jetzt prüft die Namensauflösung der Verbindung selbst (`lookup` von http/https):
 * Die Adresse, mit der sich der Server tatsächlich verbindet, ist genau die geprüfte. Ohne zusätzliche Abhängigkeit.
 */
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns'
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { Readable } from 'node:stream'
import { istInterneIp } from '../main/services/ai/kompatibel'

type Rueckruf = (err: NodeJS.ErrnoException | null, adresse: string | LookupAddress[], familie?: number) => void

/** Namensauflösung, die interne Ziele ablehnt – für jede Verbindung, auch nach Weiterleitungen und Wiederholungen */
export function pruefendesLookup(host: string, opts: LookupOptions, rueck: Rueckruf, nachschlagen = dnsLookup): void {
  nachschlagen(host, { ...opts, all: true }, (err, liste) => {
    if (err) return rueck(err, '')
    const adressen = (liste as unknown as LookupAddress[]) ?? []
    if (!adressen.length || adressen.some((a) => istInterneIp(a.address))) {
      const e = new Error('Auf dem Server sind lokale oder interne Adressen nicht erlaubt.') as NodeJS.ErrnoException
      e.code = 'EINTERN'
      return rueck(e, '')
    }
    if (opts.all) return rueck(null, adressen)
    rueck(null, adressen[0].address, adressen[0].family)
  })
}

const kopfZeilen = (h: IncomingHttpHeaders): Headers => {
  const aus = new Headers()
  for (const [k, v] of Object.entries(h)) {
    if (v === undefined) continue
    for (const w of Array.isArray(v) ? v : [v]) aus.append(k, String(w))
  }
  return aus
}

/** fetch-artiger Abruf über http/https mit `pruefendesLookup` (Weiterleitungen folgen wir nicht – KI-APIs leiten nicht weiter) */
export function sichererAbruf(eingabe: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  return new Promise((ok, fehler) => {
    const url = new URL(typeof eingabe === 'string' || eingabe instanceof URL ? eingabe : eingabe.url)
    const anfrage = url.protocol === 'http:' ? httpRequest : httpsRequest
    const kopf: Record<string, string> = {}
    new Headers(init.headers).forEach((v, k) => (kopf[k] = v))
    const req = anfrage(url, { method: init.method ?? 'GET', headers: kopf, lookup: pruefendesLookup as never, signal: init.signal ?? undefined }, (res) => {
      const status = res.statusCode ?? 0
      const ohneKoerper = [204, 205, 304].includes(status) || init.method === 'HEAD'
      if (ohneKoerper) res.resume()
      ok(
        new Response(ohneKoerper ? null : (Readable.toWeb(res) as unknown as ReadableStream), {
          status,
          statusText: res.statusMessage ?? '',
          headers: kopfZeilen(res.headers)
        })
      )
    })
    req.on('error', fehler)
    const koerper = init.body
    if (koerper == null) req.end()
    else if (typeof koerper === 'string' || koerper instanceof Uint8Array) req.end(koerper)
    else if (koerper instanceof ArrayBuffer) req.end(Buffer.from(koerper))
    else {
      req.destroy()
      fehler(new Error('Diese Art von Anfragekörper wird hier nicht unterstützt.'))
    }
  })
}
