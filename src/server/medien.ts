/**
 * Medienbank der Vokabeln für Lernende (05.10.2026; Ablage: main/services/storage/medienbank.ts).
 *
 *   GET /s/api/medien?sprache=en&w=park&w=river   Einträge (Bild, Aussprache, Satz-Aussprache) mit Adressen
 *   GET /medien/<24 Hex>.jpg|png|webp|mp3         die Datei – mit Bereichsanfragen (Safari auf dem iPad)
 *
 * Nur mit Anmeldung (auch Gäste per QR-Code). Inhalt sind Wörter, Bilder und Aussprache – nichts Persönliches.
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { json, type Anfrage } from './http'
import { medienDateiPfad, medienFuer } from '../main/services/storage/medienbank'
import { MEDIEN_DATEI } from '../shared/medienbank'

const TYP: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp3: 'audio/mpeg' }

export async function medienRoute(k: Anfrage): Promise<boolean> {
  const { url, req, res, sitzung } = k
  if (url.pathname === '/s/api/medien' && req.method === 'GET') {
    if (!sitzung) return json(res, 401, { fehler: 'Nicht angemeldet.' }), true
    const sprache = String(url.searchParams.get('sprache') ?? '')
    const woerter = url.searchParams.getAll('w').slice(0, 600)
    // Bevorzugte Fassung der Aussprache (Einstellungen der Lernenden, 07.10.2026) – die andere als Rückfall
    const lage = url.searchParams.get('lage') === 'm' ? 'm' : 'w'
    return json(res, 200, { medien: medienFuer(sprache, woerter, { basisUrl: '/medien/', lage }) }), true
  }
  const m = /^\/medien\/([a-f0-9]{24}\.(jpg|png|webp|mp3))$/.exec(url.pathname)
  if (!m || req.method !== 'GET') return false
  if (!sitzung) return json(res, 401, { fehler: 'Nicht angemeldet.' }), true
  if (!MEDIEN_DATEI.test(m[1])) return json(res, 404, { fehler: 'Unbekannt.' }), true
  const datei = medienDateiPfad(m[1])
  if (!existsSync(datei)) return json(res, 404, { fehler: 'Die Datei fehlt.' }), true
  const groesse = statSync(datei).size
  const typ = TYP[m[2]]
  // Dateinamen ändern sich bei jeder neuen Fassung – lange zwischenspeichern ist unbedenklich
  const kopf = { 'content-type': typ, 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=604800, immutable' }
  const bereich = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''))
  if (bereich) {
    const start = bereich[1] ? Number(bereich[1]) : Math.max(0, groesse - Number(bereich[2]))
    const ende = bereich[1] && bereich[2] ? Math.min(groesse - 1, Number(bereich[2])) : groesse - 1
    if (start >= groesse || start > ende) return res.writeHead(416, { 'content-range': `bytes */${groesse}` }).end(), true
    res.writeHead(206, { ...kopf, 'content-range': `bytes ${start}-${ende}/${groesse}`, 'content-length': ende - start + 1 })
    createReadStream(datei, { start, end: ende }).pipe(res)
    return true
  }
  res.writeHead(200, { ...kopf, 'content-length': groesse })
  createReadStream(datei).pipe(res)
  return true
}
