// Ein kleiner WebDAV-Server wie IServ (01.10.2026) – für tests/iserv.test.ts und tests/e2e/mobil-iserv.mjs.
//
// Kann PROPFIND (Depth 0/1), MKCOL und PUT, prüft Basic-Anmeldung, antwortet mit CORS (der
// Prüf-Build im Browser ruft mit fetch ab) und lässt sich Fehler aufzwingen (401/405/507 …).
// Oberste Ebene wie bei IServ: Home (Eigene Dateien) und Groups (je Gruppe ein Ordner).
//
// Adressen: Der Prüf-Build biegt https://webdav.meineschule.de/… auf
// http://127.0.0.1:PORT/webdav.meineschule.de/… um – der erste Pfadteil ist also der Rechner.
// Nur die Rechner in `rechner` antworten mit WebDAV, alle anderen mit 404 (wie ohne Modul).
import { createServer } from 'http'

/**
 * @param {{ benutzer?: string, passwort?: string, rechner?: string[], ordner?: string[] }} [o]
 */
export function fakeWebdav(o = {}) {
  const benutzer = o.benutzer ?? 'erika.muster'
  const passwort = o.passwort ?? 'geheim-ä'
  const rechner = new Set(o.rechner ?? ['webdav.meineschule.de'])
  /** Pfad ('/Home/Unterricht') → { ordner, daten?, typ? } */
  const baum = new Map([['', { ordner: true }]])
  for (const p of ['/Home', '/Groups', '/Groups/Kollegium', '/Home/Unterricht', ...(o.ordner ?? [])]) baum.set(p, { ordner: true })
  /** Aufgezwungene Fehler: { methode?: string, pfad?: RegExp, status: number, einmal?: boolean } */
  const fehler = []
  /** Alle Anfragen (Methode, Pfad, Anmeldung ja/nein) – zum Prüfen in den Tests */
  const protokoll = []

  const kodiert = (pfad) => pfad.split('/').map(encodeURIComponent).join('/')
  const eltern = (pfad) => pfad.slice(0, pfad.lastIndexOf('/'))

  function multistatus(pfade, praefix) {
    const antworten = pfade
      .map((p) => {
        const e = baum.get(p)
        const href = praefix + kodiert(p) + (e.ordner ? '/' : '')
        const typ = e.ordner ? '<D:resourcetype><D:collection/></D:resourcetype>' : `<D:resourcetype/><D:getcontentlength>${e.daten.length}</D:getcontentlength>`
        return `<D:response><D:href>${href || '/'}</D:href><D:propstat><D:prop>${typ}</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`
      })
      .join('')
    return `<?xml version="1.0" encoding="utf-8"?><D:multistatus xmlns:D="DAV:">${antworten}</D:multistatus>`
  }

  /**
   * Eine Anfrage beantworten – ohne Netz (vitest) oder aus dem HTTP-Server (e2e).
   * `pfad` OHNE Rechner, dekodiert; `host` der Rechner; `praefix` steht vor jedem href (/webdav).
   */
  function behandle(methode, host, pfadRoh, kopf, koerper, praefix = '') {
    const pfad = pfadRoh.replace(/\/+$/, '')
    const auth = kopf.authorization ?? kopf.Authorization ?? ''
    protokoll.push({ methode, host, pfad, auth: Boolean(auth), laenge: koerper?.length ?? 0 })
    if (!rechner.has(host)) return { status: 404, text: '<html><body>Not Found</body></html>' }
    const erwartet = 'Basic ' + Buffer.from(`${benutzer}:${passwort}`, 'utf8').toString('base64')
    if (auth !== erwartet) return { status: 401, text: 'Unauthorized' }
    const zwang = fehler.find((f) => (!f.methode || f.methode === methode) && (!f.pfad || f.pfad.test(pfad)))
    if (zwang) {
      if (zwang.einmal) fehler.splice(fehler.indexOf(zwang), 1)
      return { status: zwang.status, text: '' }
    }
    if (methode === 'PROPFIND') {
      const e = baum.get(pfad)
      if (!e) return { status: 404, text: '' }
      const tiefe = String(kopf.depth ?? kopf.Depth ?? '1')
      const kinder = tiefe === '0' || !e.ordner ? [] : [...baum.keys()].filter((p) => p !== pfad && eltern(p) === pfad)
      return { status: 207, text: multistatus([pfad, ...kinder], praefix) }
    }
    if (methode === 'MKCOL') {
      if (baum.has(pfad)) return { status: 405, text: '' }
      if (!baum.get(eltern(pfad))?.ordner) return { status: 409, text: '' }
      baum.set(pfad, { ordner: true })
      return { status: 201, text: '' }
    }
    if (methode === 'PUT') {
      if (!baum.get(eltern(pfad))?.ordner) return { status: 409, text: '' }
      const neu = !baum.has(pfad)
      baum.set(pfad, { ordner: false, daten: Buffer.from(koerper ?? []), typ: kopf['content-type'] ?? kopf['Content-Type'] })
      return { status: neu ? 201 : 204, text: '' }
    }
    return { status: 405, text: '' }
  }

  /** DavAbruf für vitest: https://<rechner>/<pfad> ohne Netz */
  const abruf = async (a) => {
    const url = new URL(a.url)
    if (url.hostname.startsWith('netzfehler.')) throw new Error('getaddrinfo ENOTFOUND')
    const pfad = url.pathname.split('/').map((t) => decodeURIComponent(t)).join('/')
    const kopf = Object.fromEntries(Object.entries(a.kopf).map(([k, v]) => [k.toLowerCase(), v]))
    const koerper = a.koerper === undefined ? undefined : typeof a.koerper === 'string' ? Buffer.from(a.koerper) : Buffer.from(a.koerper)
    // <domain>/webdav/…: der Pfad beginnt mit /webdav
    if (url.pathname.startsWith('/webdav/') || url.pathname === '/webdav') {
      return behandle(a.methode, `${url.hostname}/webdav`, pfad.replace(/^\/webdav/, ''), kopf, koerper, '/webdav')
    }
    return behandle(a.methode, url.hostname, pfad, kopf, koerper)
  }

  let server = null
  /** Echter HTTP-Server (e2e); liefert http://127.0.0.1:PORT */
  async function starten() {
    server = createServer((req, res) => {
      const teile = []
      req.on('data', (t) => teile.push(t))
      req.on('end', () => {
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'PROPFIND, MKCOL, PUT, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Depth, Content-Type')
        if (req.method === 'OPTIONS') return res.writeHead(204).end()
        const roh = (req.url ?? '/').split('?')[0].split('/').map((t) => decodeURIComponent(t))
        // ['', 'webdav.meineschule.de', 'Home', …]
        const host = roh[1] ?? ''
        const pfad = '/' + roh.slice(2).join('/')
        const antwort = behandle(req.method ?? 'GET', host, pfad === '/' ? '' : pfad, req.headers, Buffer.concat(teile))
        res.writeHead(antwort.status, { 'Content-Type': antwort.status === 207 ? 'application/xml; charset=utf-8' : 'text/plain' }).end(antwort.text)
      })
    })
    await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
    return `http://127.0.0.1:${server.address().port}`
  }
  const beenden = () => new Promise((ok) => (server ? server.close(() => ok()) : ok()))

  return { baum, fehler, protokoll, behandle, abruf, starten, beenden, benutzer, passwort }
}
