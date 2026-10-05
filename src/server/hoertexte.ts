/**
 * Hörtexte für die Lernenden per QR-Code (02.10.2026).
 *
 * Wunsch der Lehrkraft: „Generierte Hörverstehenstexte sollen auf dem VPS gespeichert werden und
 * über einen QR-Code auf dem Material dann für Schüler abrufbar sein."
 *
 *  - Jede Aufnahme (audio:speak, audio:import) bekommt eine Freigabe mit 128-Bit-Zufallskennung:
 *    https://<server>/h/<kennung>. Die Adresse kommt mit dem Ergebnis zurück; die Oberfläche trägt
 *    sie als QR-Adresse am Hörtext ein (AudioBlock.url) – der vorhandene QR-Weg druckt sie.
 *  - /h/<kennung> ist eine schlichte Abspielseite OHNE Anmeldung (Schülerinnen und Schüler haben
 *    dort keine Konten nötig); sie enthält keine personenbezogenen Daten, nur Titel und Ton.
 *  - Dieselbe Aufnahme behält ihre Adresse (auch nach dem Neuvertonen) – gedruckte Blätter
 *    bleiben gültig. Widerrufen geht in der Verwaltung.
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { datenbank, protokolliereServer } from './datenbank'
import { nutzerOrdner } from './pfade'
import { json, type Anfrage } from './http'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS hoertext_freigaben (
  kennung TEXT PRIMARY KEY,
  nutzer_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  datei TEXT NOT NULL,
  titel TEXT NOT NULL DEFAULT '',
  erstellt TEXT NOT NULL,
  abrufe INTEGER NOT NULL DEFAULT 0,
  UNIQUE (nutzer_id, datei)
);`

let bereit = false
const db = () => {
  const d = datenbank()
  if (!bereit) {
    d.exec(SCHEMA)
    bereit = true
  }
  return d
}

/** Für Tests nach einer neuen Datenbank */
export const hoertexteZuruecksetzen = (): void => {
  bereit = false
}

const gueltigeDatei = (n: string): boolean => /^[A-Za-z0-9_-]{1,80}\.mp3$/.test(n)

/** Freigabe für eine Aufnahme des Nutzers anlegen (oder die vorhandene liefern) */
export function freigabeFuer(nutzerId: string, datei: string, titel = ''): string {
  if (!gueltigeDatei(datei)) throw new Error('Ungültiger Dateiname.')
  const da = db().prepare('SELECT kennung FROM hoertext_freigaben WHERE nutzer_id = ? AND datei = ?').get(nutzerId, datei) as { kennung: string } | undefined
  if (da) return da.kennung
  const kennung = randomBytes(16).toString('base64url')
  db()
    .prepare('INSERT INTO hoertext_freigaben (kennung, nutzer_id, datei, titel, erstellt) VALUES (?, ?, ?, ?, ?)')
    .run(kennung, nutzerId, datei, titel.slice(0, 120), new Date().toISOString())
  return kennung
}

export function freigabeWiderrufen(kennung: string): boolean {
  return db().prepare('DELETE FROM hoertext_freigaben WHERE kennung = ?').run(kennung).changes > 0
}

export function alleFreigaben(): { kennung: string; nutzer_id: string; datei: string; titel: string; erstellt: string; abrufe: number }[] {
  return db().prepare('SELECT kennung, nutzer_id, datei, titel, erstellt, abrufe FROM hoertext_freigaben ORDER BY erstellt DESC').all() as unknown as {
    kennung: string
    nutzer_id: string
    datei: string
    titel: string
    erstellt: string
    abrufe: number
  }[]
}

function finde(kennung: string): { nutzer_id: string; datei: string; titel: string } | null {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(kennung)) return null
  return (
    (db().prepare('SELECT nutzer_id, datei, titel FROM hoertext_freigaben WHERE kennung = ?').get(kennung) as
      { nutzer_id: string; datei: string; titel: string } | undefined) ?? null
  )
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function abspielseite(kennung: string, titel: string): string {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>${esc(titel || 'Hörtext')}</title>
<style>
:root { color-scheme: dark; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; font: 17px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; background: #11181d; color: #e6edf1; padding: 16px; }
main { width: 100%; max-width: 520px; background: #1b252c; border: 1px solid #2c3a43; border-radius: 16px; padding: 24px; text-align: center; }
h1 { font-size: 1.3rem; margin: 0 0 18px; }
audio { width: 100%; }
p { font-size: .85rem; opacity: .7; margin: 16px 0 0; }
</style>
</head>
<body>
<main>
<h1>${esc(titel || 'Hörtext')}</h1>
<audio controls preload="metadata" src="/h/${kennung}/ton.mp3"></audio>
<p>Schul-Apps · Hörtext zum Material</p>
</main>
</body>
</html>`
}

/** /h/<kennung> und /h/<kennung>/ton.mp3 – ohne Anmeldung */
export async function hoertextRoute(k: Anfrage): Promise<boolean> {
  const m = /^\/h\/([A-Za-z0-9_-]+)(\/ton\.mp3)?$/.exec(k.url.pathname)
  if (!m || k.req.method !== 'GET') return false
  const f = finde(m[1])
  if (!f) return (k.res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Dieser Hörtext ist nicht (mehr) freigegeben.'), true)
  if (!m[2]) {
    k.res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; media-src 'self'; base-uri 'none'"
    })
    k.res.end(abspielseite(m[1], f.titel))
    return true
  }
  const datei = join(nutzerOrdner(f.nutzer_id), 'hoertexte', f.datei)
  if (!existsSync(datei)) return (json(k.res, 404, { fehler: 'Die Aufnahme fehlt.' }), true)
  const groesse = statSync(datei).size
  // Bereichsanfragen: Safari auf dem iPad spielt Ton nur damit ab
  const bereich = /^bytes=(\d*)-(\d*)$/.exec(String(k.req.headers.range ?? ''))
  if (bereich) {
    const start = bereich[1] ? Number(bereich[1]) : Math.max(0, groesse - Number(bereich[2]))
    const ende = bereich[1] && bereich[2] ? Math.min(groesse - 1, Number(bereich[2])) : groesse - 1
    if (start >= groesse || start > ende) return (k.res.writeHead(416, { 'content-range': `bytes */${groesse}` }).end(), true)
    k.res.writeHead(206, {
      'content-type': 'audio/mpeg',
      'content-range': `bytes ${start}-${ende}/${groesse}`,
      'accept-ranges': 'bytes',
      'content-length': ende - start + 1,
      'cache-control': 'no-cache'
    })
    createReadStream(datei, { start, end: ende }).pipe(k.res)
    return true
  }
  db().prepare('UPDATE hoertext_freigaben SET abrufe = abrufe + 1 WHERE kennung = ?').run(m[1])
  k.res.writeHead(200, { 'content-type': 'audio/mpeg', 'accept-ranges': 'bytes', 'content-length': groesse, 'cache-control': 'no-cache' })
  createReadStream(datei).pipe(k.res)
  return true
}

/** Nach audio:speak / audio:import: Freigabe anlegen und die Adresse ans Ergebnis hängen */
export function mitFreigabe(ergebnis: unknown, nutzerId: string, adresse: string, titel?: string): unknown {
  if (!ergebnis || typeof ergebnis !== 'object') return ergebnis
  const datei = (ergebnis as { fileName?: unknown }).fileName
  if (typeof datei !== 'string' || !gueltigeDatei(datei)) return ergebnis
  try {
    const kennung = freigabeFuer(nutzerId, datei, titel)
    return { ...ergebnis, freigabe: `${adresse.replace(/\/$/, '')}/h/${kennung}` }
  } catch (e) {
    protokolliereServer('hoertext', `Freigabe nicht angelegt: ${e instanceof Error ? e.message : String(e)}`, nutzerId)
    return ergebnis
  }
}
