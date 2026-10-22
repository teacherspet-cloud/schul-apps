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
 *
 * Transkript für Lernende (23.10.2026, Barrierefreiheit/Nachteilsausgleich, Entscheidung der Lehrkraft): Schalter JE
 * Freigabe, Vorgabe „aus"; sonst „für alle" oder „nur für ausgewählte" Lernende. Der Text ist das Skript des Hörtexts
 * (AudioBlock.transcript): beim Vertonen aus der Anfrage (TtsRequest.skript), sonst beim Speichern der Einstellung aus
 * der Oberfläche. Text und Auswahl liegen verschlüsselt in der Freigabe (feldschutz.ts). Die Abspielseite entscheidet am
 * Server aus der Sitzung (transkriptErlaubt): Ohne Anmeldung und für Gastkonten nur bei „für alle"; ist es nicht
 * erlaubt, steht der Text NICHT in der Seite.
 *   GET  /server/hoertext/transkript?kennung=          Einstellung (nur die eigene Freigabe)
 *   POST /server/hoertext/transkript {kennung, wer, schueler, text?}
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { datenbank, fehlerKurz, protokolliereServer, type NutzerInfo } from './datenbank'
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
    // Transkript für Lernende (23.10.2026): Text und Wahl, beide verschlüsselt (SENSIBEL)
    const spalten = new Set((d.prepare('PRAGMA table_info(hoertext_freigaben)').all() as { name: string }[]).map((x) => x.name))
    if (!spalten.has('transkript')) d.exec("ALTER TABLE hoertext_freigaben ADD COLUMN transkript TEXT NOT NULL DEFAULT ''")
    if (!spalten.has('transkript_wahl')) d.exec("ALTER TABLE hoertext_freigaben ADD COLUMN transkript_wahl TEXT NOT NULL DEFAULT ''")
    bereit = true
  }
  return d
}

/** Für Tests nach einer neuen Datenbank */
export const hoertexteZuruecksetzen = (): void => {
  bereit = false
}

const gueltigeDatei = (n: string): boolean => /^[A-Za-z0-9_-]{1,80}\.mp3$/.test(n)

const TRANSKRIPT_MAX = 50_000

/** Freigabe für eine Aufnahme des Nutzers anlegen (oder die vorhandene liefern); `transkript`: das vertonte Skript */
export function freigabeFuer(nutzerId: string, datei: string, titel = '', transkript?: string): string {
  if (!gueltigeDatei(datei)) throw new Error('Ungültiger Dateiname.')
  // Neu vertont (23.10.2026): Das Transkript folgt dem vertonten Skript
  const neuerText = (k: string): void => {
    if (typeof transkript === 'string' && transkript.trim())
      db().prepare('UPDATE hoertext_freigaben SET transkript = ? WHERE kennung = ?').run(transkript.slice(0, TRANSKRIPT_MAX), k)
  }
  const da = db().prepare('SELECT kennung FROM hoertext_freigaben WHERE nutzer_id = ? AND datei = ?').get(nutzerId, datei) as { kennung: string } | undefined
  if (da) {
    neuerText(da.kennung)
    return da.kennung
  }
  const kennung = randomBytes(16).toString('base64url')
  db()
    .prepare('INSERT INTO hoertext_freigaben (kennung, nutzer_id, datei, titel, erstellt) VALUES (?, ?, ?, ?, ?)')
    .run(kennung, nutzerId, datei, titel.slice(0, 120), new Date().toISOString())
  neuerText(kennung)
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

interface Fund {
  nutzer_id: string
  datei: string
  titel: string
  transkript: string
  transkript_wahl: string
}

function finde(kennung: string): Fund | null {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(kennung)) return null
  return (
    (db().prepare('SELECT nutzer_id, datei, titel, transkript, transkript_wahl FROM hoertext_freigaben WHERE kennung = ?').get(kennung) as Fund | undefined) ??
    null
  )
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// ---------------------------------------------------------------- Transkript für Lernende (23.10.2026, Barrierefreiheit)

export type TranskriptWer = 'aus' | 'alle' | 'einzelne'
export interface TranskriptWahl {
  wer: TranskriptWer
  /** Benutzernamen der ausgewählten Lernenden (nur bei „einzelne") */
  schueler: string[]
}
export type TranskriptEinstellung = TranskriptWahl & { hatText: boolean }

/** Gespeicherte oder gesendete Wahl bereinigen; alles Unbekannte ist „aus" */
export function transkriptWahlVon(roh: unknown): TranskriptWahl {
  let w: unknown = roh
  if (typeof roh === 'string') {
    try {
      w = roh ? JSON.parse(roh) : {}
    } catch {
      w = {}
    }
  }
  const o = (w && typeof w === 'object' ? w : {}) as { wer?: unknown; schueler?: unknown }
  const wer: TranskriptWer = o.wer === 'alle' || o.wer === 'einzelne' ? o.wer : 'aus'
  const schueler =
    wer === 'einzelne' && Array.isArray(o.schueler)
      ? [
          ...new Set(
            o.schueler.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim().toLowerCase().slice(0, 120))
          )
        ].slice(0, 500)
      : []
  // „Nur für ausgewählte" ohne Auswahl gibt niemandem etwas frei
  return { wer: wer === 'einzelne' && !schueler.length ? 'aus' : wer, schueler }
}

/**
 * Darf diese Person das Transkript sehen? Ohne Anmeldung (QR-Code) und für Gastkonten nur bei „für alle";
 * „nur für ausgewählte" gilt nur für angemeldete Schülerkonten, deren Benutzername ausgewählt ist.
 */
export function transkriptErlaubt(wahl: TranskriptWahl, betrachter: Pick<NutzerInfo, 'rolle' | 'benutzer' | 'quelle'> | null | undefined): boolean {
  if (wahl.wer === 'alle') return true
  if (wahl.wer !== 'einzelne' || !betrachter) return false
  if (betrachter.rolle !== 'schueler' || betrachter.quelle === 'gast') return false
  return wahl.schueler.includes(betrachter.benutzer.trim().toLowerCase())
}

/** Einstellung für die Lehrkraft – nur die eigene Freigabe */
export function transkriptEinstellung(kennung: string, nutzerId: string): TranskriptEinstellung | null {
  const f = finde(kennung)
  if (!f || f.nutzer_id !== nutzerId) return null
  return { ...transkriptWahlVon(f.transkript_wahl), hatText: Boolean(f.transkript.trim()) }
}

/** Einstellung speichern; `text` (das Skript des Hörtexts) ersetzt den gespeicherten Text, wenn angegeben */
export function transkriptSetzen(kennung: string, nutzerId: string, roh: { wer?: unknown; schueler?: unknown; text?: unknown }): TranskriptEinstellung | null {
  const f = finde(kennung)
  if (!f || f.nutzer_id !== nutzerId) return null
  const wahl = transkriptWahlVon({ wer: roh.wer, schueler: roh.schueler })
  db().prepare('UPDATE hoertext_freigaben SET transkript_wahl = ? WHERE kennung = ?').run(JSON.stringify(wahl), kennung)
  if (typeof roh.text === 'string' && roh.text.trim())
    db().prepare('UPDATE hoertext_freigaben SET transkript = ? WHERE kennung = ?').run(roh.text.slice(0, TRANSKRIPT_MAX), kennung)
  return transkriptEinstellung(kennung, nutzerId)
}

/** Knopf „Transkript anzeigen": klappt den Bereich auf und zu (per Hash in der CSP freigegeben, wie ANMELDE_CSP in seiten.ts) */
const TRANSKRIPT_JS = `(function(){var k=document.getElementById('transkript-knopf'),b=document.getElementById('transkript');if(!k||!b)return
k.addEventListener('click',function(){var auf=k.getAttribute('aria-expanded')!=='true';k.setAttribute('aria-expanded',auf?'true':'false');b.hidden=!auf;k.textContent=auf?'Transkript ausblenden':'Transkript anzeigen'})})()`
const TRANSKRIPT_HASH = `'sha256-${createHash('sha256').update(TRANSKRIPT_JS).digest('base64')}'`

/** CSP der Abspielseite – ein (gehashtes) Skript nur, wenn das Transkript auf der Seite steht */
export const abspielCsp = (mitTranskript: boolean): string =>
  `default-src 'none'; style-src 'unsafe-inline'; media-src 'self'; ${mitTranskript ? `script-src ${TRANSKRIPT_HASH}; ` : ''}base-uri 'none'`

function transkriptTeil(text: string): string {
  const absaetze = text
    .split(/\r?\n/)
    .map((z) => z.trim())
    .filter(Boolean)
    .map((z) => `<p>${esc(z)}</p>`)
    .join('\n')
  return `<button type="button" id="transkript-knopf" class="knopf" aria-expanded="false" aria-controls="transkript">Transkript anzeigen</button>
<section id="transkript" aria-labelledby="transkript-titel" hidden>
<h2 id="transkript-titel">Transkript</h2>
${absaetze}
</section>
<script>${TRANSKRIPT_JS}</script>
`
}

/** Abspielseite; `transkript` nur übergeben, wenn er für diese Person freigegeben ist */
export function abspielseite(kennung: string, titel: string, transkript = ''): string {
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
.knopf { margin-top: 18px; font: inherit; font-size: .95rem; padding: 10px 16px; border-radius: 10px; border: 1px solid #5a7484; background: #24323b; color: #e6edf1; cursor: pointer; }
.knopf:focus-visible { outline: 3px solid #8cc8ff; outline-offset: 2px; }
#transkript { text-align: left; margin-top: 16px; border-top: 1px solid #2c3a43; }
#transkript h2 { font-size: 1.05rem; margin: 16px 0 8px; }
#transkript p { font-size: 1rem; opacity: 1; margin: 0 0 10px; line-height: 1.55; }
</style>
</head>
<body>
<main>
<h1>${esc(titel || 'Hörtext')}</h1>
<audio controls preload="metadata" src="/h/${kennung}/ton.mp3"></audio>
${transkript.trim() ? transkriptTeil(transkript) : ''}<p>Schul-Apps · Hörtext zum Material</p>
</main>
</body>
</html>`
}

/** Einstellung „Transkript für Lernende" (Lehrkraft, 23.10.2026) */
async function transkriptRoute(k: Anfrage): Promise<boolean> {
  const { req, res, sitzung, url } = k
  if (url.pathname !== '/server/hoertext/transkript') return false
  if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
  const ich = sitzung.nutzer
  if (ich.rolle === 'schueler') return (json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true)
  if (req.method === 'GET') {
    const e = transkriptEinstellung(url.searchParams.get('kennung') ?? '', ich.id)
    return (e ? json(res, 200, e) : json(res, 404, { fehler: 'Hörtext-Freigabe nicht gefunden.' }), true)
  }
  if (req.method !== 'POST') return false
  if (typeof req.headers['x-schulapps-token'] !== 'string') return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
  const b = ((await k.koerper()) ?? {}) as { kennung?: unknown; wer?: unknown; schueler?: unknown; text?: unknown }
  const e = transkriptSetzen(String(b.kennung ?? ''), ich.id, b)
  return (e ? json(res, 200, e) : json(res, 404, { fehler: 'Hörtext-Freigabe nicht gefunden.' }), true)
}

/** /h/<kennung> und /h/<kennung>/ton.mp3 – ohne Anmeldung; dazu die Transkript-Einstellung der Lehrkraft */
export async function hoertextRoute(k: Anfrage): Promise<boolean> {
  if (await transkriptRoute(k)) return true
  const m = /^\/h\/([A-Za-z0-9_-]+)(\/ton\.mp3)?$/.exec(k.url.pathname)
  if (!m || k.req.method !== 'GET') return false
  const f = finde(m[1])
  if (!f) return (k.res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Dieser Hörtext ist nicht (mehr) freigegeben.'), true)
  if (!m[2]) {
    // Transkript nur, wenn die Freigabe es dieser Person erlaubt – sonst kommt der Text gar nicht erst zum Gerät
    const text = f.transkript.trim() && transkriptErlaubt(transkriptWahlVon(f.transkript_wahl), k.sitzung?.nutzer) ? f.transkript : ''
    k.res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': abspielCsp(Boolean(text))
    })
    k.res.end(abspielseite(m[1], f.titel, text))
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

/** Skript aus einer audio:speak-Anfrage (TtsRequest.skript, sonst die Sprecherzeilen) – für das Transkript (23.10.2026) */
export function skriptAusAnfrage(anfrage: unknown): string | undefined {
  if (!anfrage || typeof anfrage !== 'object') return undefined
  const a = anfrage as { skript?: unknown; turns?: unknown }
  if (typeof a.skript === 'string' && a.skript.trim()) return a.skript
  if (!Array.isArray(a.turns)) return undefined
  const t = a.turns
    .map((x) => (x && typeof x === 'object' && typeof (x as { text?: unknown }).text === 'string' ? (x as { text: string }).text.trim() : ''))
    .filter(Boolean)
    .join('\n')
  return t || undefined
}

/** Nach audio:speak / audio:import: Freigabe anlegen und die Adresse ans Ergebnis hängen */
export function mitFreigabe(ergebnis: unknown, nutzerId: string, adresse: string, titel?: string, transkript?: string): unknown {
  if (!ergebnis || typeof ergebnis !== 'object') return ergebnis
  const datei = (ergebnis as { fileName?: unknown }).fileName
  if (typeof datei !== 'string' || !gueltigeDatei(datei)) return ergebnis
  try {
    const kennung = freigabeFuer(nutzerId, datei, titel, transkript)
    return { ...ergebnis, freigabe: `${adresse.replace(/\/$/, '')}/h/${kennung}` }
  } catch (e) {
    protokolliereServer('hoertext', `Freigabe nicht angelegt: ${fehlerKurz(e)}`, nutzerId)
    return ergebnis
  }
}
