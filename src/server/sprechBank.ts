/**
 * Kartenpool der Sprechprüfungen (19.10.2026, App „Sprechprüfungen", abgestimmt mit der Lehrkraft): schulweit je Sprache
 * und Jahrgang – Interview-Sets, Bildkarten (Monolog) und Dialogkarten (Rollenspiel, Info-Gap, Diskussion). Erstellt
 * mit der KI (in der App, Durchsicht vor dem Speichern) oder von Hand; das Sprechtraining (sprechen.ts) wählt daraus.
 * Lesen dürfen alle Lehrkräfte; ändern jede/r die eigenen Karten, Admins und Fachobleute des Fachs alle
 * (main/services/rolle.ts `darfLehrwerkSprache`). Bilder liegen als Dateien unter <DATEN>/sprechbilder (ohne
 * Personenbezug, wie die Medienbank).
 *
 *   GET  /server/sprech-bank?sprache=en         → { karten (mit eigene, vorher), darfAlle }
 *   POST /server/sprech-bank/speichern {id?, sprache, jahrgang, teil, karte} → { id }
 *   POST /server/sprech-bank/loeschen {id}
 *   POST /server/sprech-bank/ergaenzen {id, karte}   KI-Ergänzung übernehmen (Hilfen, dritte Rolle; Status 'ki', alte Fassung in `vorher`)
 *   POST /server/sprech-bank/bestaetigen {id}        Hilfen als durchgesehen markieren
 *   POST /server/sprech-bank/zurueck {id}            vorherige Fassung wiederherstellen (eine Stufe)
 *
 * Ergänzen (24.10.2026, Partnerarbeit): Hilfen darf jede Lehrkraft mit der App an jede Karte ihrer Sprache anfügen,
 * solange die Karte keine durchgesehenen Hilfen hat – die Ergänzung ist für die ganze Fachschaft gedacht. Durchgesehene
 * Hilfen ändern nur Besitzer, Admin und Fachobleute. Die KI darf Dialogkarten dabei umarbeiten; deshalb bleibt die
 * vorherige Fassung in `vorher` (bis Bestätigen oder Zurück).
 *   POST /server/sprech-bank/bild {dataUrl}       → { datei }
 *   GET  /server/sprech-bank/bild/<datei> · /s/api/sprechen/bild/<datei>   Bild (angemeldet)
 */
import { dateiTypAusBytes, istRasterbild } from './dateiTyp'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { datenbank, protokolliereServer } from './datenbank'
import { alsNutzer, json, type Anfrage } from './http'
import { imNutzer } from './kontext'
import { ordner } from './pfade'
import { darfLehrwerkSprache } from '../main/services/rolle'
import { karteBereinigt, type SprechKarte } from '../shared/sprechen/karten'
import { bildVersionen, entfalleneBilder } from '../shared/sprechen/bildVersionen'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sprech_bank (
  id TEXT PRIMARY KEY,
  sprache TEXT NOT NULL,
  jahrgang INTEGER NOT NULL,
  teil TEXT NOT NULL,
  karte TEXT NOT NULL,
  lehrkraft_id TEXT NOT NULL DEFAULT '',
  geaendert TEXT NOT NULL,
  vorher TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS sprech_bank_sj ON sprech_bank(sprache, jahrgang);`

let bereit = false
const db = () => {
  const d = datenbank()
  if (!bereit) {
    d.exec(SCHEMA)
    // Bestehende Tabellen (vor 0.4.179): Spalte für die vorherige Fassung nachziehen
    const spalten = new Set((d.prepare('PRAGMA table_info(sprech_bank)').all() as { name: string }[]).map((x) => x.name))
    if (!spalten.has('vorher')) d.exec("ALTER TABLE sprech_bank ADD COLUMN vorher TEXT NOT NULL DEFAULT ''")
    bereit = true
  }
  return d
}

const BILD = /^[a-f0-9]{24}\.(png|jpe?g|webp)$/
const TEILE = ['interview', 'monolog', 'dialog']
const bildOrdner = (): string => ordner('sprechbilder')

export interface BankKarte {
  id: string
  sprache: string
  jahrgang: number
  teil: string
  karte: SprechKarte
  lehrkraftId: string
  geaendert: string
  /** Es gibt eine vorherige Fassung (vor der letzten KI-Überarbeitung) */
  vorher: boolean
}

const alsKarte = (z: Record<string, unknown>): BankKarte | null => {
  let roh: unknown
  try {
    roh = JSON.parse(String(z.karte))
  } catch {
    return null
  }
  const k = karteBereinigt(roh, String(z.id))
  return k
    ? {
        id: String(z.id),
        sprache: String(z.sprache),
        jahrgang: Number(z.jahrgang),
        teil: String(z.teil),
        karte: k,
        lehrkraftId: String(z.lehrkraft_id ?? ''),
        geaendert: String(z.geaendert),
        vorher: Boolean(z.vorher)
      }
    : null
}

/** Karten einer Sprache (optional Jahrgang und Teil) */
export function bankKarten(sprache: string, jahrgang?: number | null, teil?: string): BankKarte[] {
  const zeilen = db().prepare('SELECT * FROM sprech_bank WHERE sprache = ? ORDER BY jahrgang, teil, geaendert').all(sprache) as Record<string, unknown>[]
  return zeilen
    .map(alsKarte)
    .filter((k): k is BankKarte => Boolean(k))
    .filter((k) => (jahrgang == null || k.jahrgang === jahrgang) && (!teil || k.teil === teil))
}

/**
 * Gelöschte Bildfassungen aufräumen (21.10.2026, „Version löschen"): Gewählt wurde das Aufräumen beim Speichern statt
 * eines eigenen Lösch-Endpunkts – gelöscht wird nur, was die Karte vorher nannte und jetzt nicht mehr, nach der
 * Rechteprüfung des Speicherns, und nur, wenn KEINE andere Karte die Datei noch nennt.
 */
function bilderAufraeumen(alt: SprechKarte | undefined, neu: SprechKarte): void {
  if (alt?.art !== 'monolog' || neu.art !== 'monolog') return
  const weg = entfalleneBilder(alt, neu)
  if (!weg.length) return
  const andere = new Set(
    (db().prepare('SELECT * FROM sprech_bank WHERE id != ?').all(neu.id) as Record<string, unknown>[])
      .map(alsKarte)
      .flatMap((k) => (k?.karte.art === 'monolog' ? bildVersionen(k.karte) : []))
  )
  for (const datei of weg)
    if (BILD.test(datei) && !andere.has(datei))
      try {
        unlinkSync(join(bildOrdner(), datei))
      } catch {
        // schon weg
      }
}

/** Bilddatei lesen (null = gibt es nicht) */
export function bildLesen(datei: string): { daten: Buffer; typ: string } | null {
  if (!BILD.test(datei)) return null
  const p = join(bildOrdner(), datei)
  if (!existsSync(p)) return null
  const typ = datei.endsWith('.png') ? 'image/png' : datei.endsWith('.webp') ? 'image/webp' : 'image/jpeg'
  return { daten: readFileSync(p), typ }
}

export function sprechBankRoute(): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { url, req, res, sitzung } = k
    const bildPfad = /^\/(?:server\/sprech-bank|s\/api\/sprechen)\/bild\/([^/]+)$/.exec(url.pathname)
    if (!url.pathname.startsWith('/server/sprech-bank') && !bildPfad) return false
    if (!sitzung) return json(res, 401, { fehler: 'Nicht angemeldet.' }), true
    if (bildPfad && req.method === 'GET') {
      const b = bildLesen(bildPfad[1])
      if (!b) return json(res, 404, { fehler: 'Bild nicht gefunden.' }), true
      // Typ aus den Bytes, nosniff und CSP ohne Skripte – auch für Bilder von Lehrkräften (22.10.2026, KI-Sicherheitsprüfung)
      const typ = dateiTypAusBytes(b.daten)
      res.writeHead(200, {
        'content-type': typ && istRasterbild(typ) ? typ : 'application/octet-stream',
        'cache-control': 'private, max-age=86400',
        'content-length': b.daten.length,
        'x-content-type-options': 'nosniff',
        'content-security-policy': "sandbox; default-src 'none'"
      })
      res.end(b.daten)
      return true
    }
    const ich = sitzung.nutzer
    if (ich.rolle === 'schueler') return json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true
    const darfAlle = (sprache: string): boolean => imNutzer(alsNutzer(ich, sitzung.kennung), () => darfLehrwerkSprache(sprache))
    const sprache = (x: unknown): string => (/^(en|fr|es)$/.test(String(x ?? '')) ? String(x) : '')

    if (req.method === 'GET' && url.pathname === '/server/sprech-bank') {
      const s = sprache(url.searchParams.get('sprache'))
      if (!s) return json(res, 400, { fehler: 'Unbekannte Sprache.' }), true
      return json(res, 200, { karten: bankKarten(s).map((x) => ({ ...x, eigene: x.lehrkraftId === ich.id })), darfAlle: darfAlle(s) }), true
    }
    if (req.method !== 'POST' || typeof req.headers['x-schulapps-token'] !== 'string') return json(res, 403, { fehler: 'Nicht erlaubt.' }), true
    const k0 = (await k.koerper()) as Record<string, unknown>

    if (url.pathname === '/server/sprech-bank/bild') {
      const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(k0.dataUrl ?? ''))
      if (!m) return json(res, 400, { fehler: 'Kein Bild.' }), true
      const daten = Buffer.from(m[2], 'base64')
      if (daten.length > 4 * 1024 * 1024) return json(res, 400, { fehler: 'Das Bild ist zu groß.' }), true
      const datei = `${randomBytes(12).toString('hex')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`
      writeFileSync(join(bildOrdner(), datei), daten)
      return json(res, 200, { datei }), true
    }
    if (url.pathname === '/server/sprech-bank/speichern') {
      const s = sprache(k0.sprache)
      const jahrgang = Math.round(Number(k0.jahrgang))
      const teil = String(k0.teil ?? '')
      if (!s || !(jahrgang >= 5 && jahrgang <= 13) || !TEILE.includes(teil)) return json(res, 400, { fehler: 'Sprache, Jahrgang oder Teil fehlt.' }), true
      const id = typeof k0.id === 'string' && /^k[a-f0-9]{16}$/.test(k0.id) ? k0.id : `k${randomBytes(8).toString('hex')}`
      const karte = karteBereinigt({ ...(k0.karte as object), art: teil }, id)
      if (!karte) return json(res, 400, { fehler: 'Die Karte ist unvollständig.' }), true
      const alt = db().prepare('SELECT lehrkraft_id, karte, vorher FROM sprech_bank WHERE id = ?').get(id) as { lehrkraft_id: string; karte: string; vorher: string } | undefined
      if (alt && alt.lehrkraft_id !== ich.id && !darfAlle(s)) return json(res, 403, { fehler: 'Nur die eigenen Karten (oder als Fachobfrau/Fachobmann alle).' }), true
      db()
        .prepare('INSERT OR REPLACE INTO sprech_bank (id, sprache, jahrgang, teil, karte, lehrkraft_id, geaendert, vorher) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, s, jahrgang, teil, JSON.stringify(karte), alt?.lehrkraft_id ?? ich.id, new Date().toISOString(), alt?.vorher ?? '')
      if (!alt) protokolliereServer('sprechen', `Sprechkarte angelegt (${s}, Jg ${jahrgang}, ${teil})`, ich.id)
      if (alt) bilderAufraeumen(alsKarte({ ...alt, id })?.karte, karte)
      return json(res, 200, { id }), true
    }
    // ---------------------------------------------------------------- Ergänzen, Bestätigen, Zurück (24.10.2026)
    const zeile = (id: unknown): (Record<string, unknown> & { karteAlt: SprechKarte }) | null => {
      const z = db().prepare('SELECT * FROM sprech_bank WHERE id = ?').get(String(id ?? '')) as Record<string, unknown> | undefined
      const k = z && alsKarte(z)
      return z && k ? { ...z, karteAlt: k.karte } : null
    }
    // Hilfen darf jede Lehrkraft der Sprache anfügen; durchgesehene nur Besitzer/Fachobleute
    const darfHilfen = (z: Record<string, unknown> & { karteAlt: SprechKarte }): boolean =>
      z.karteAlt.hilfenStatus !== 'geprueft' || z.lehrkraft_id === ich.id || darfAlle(String(z.sprache))
    if (url.pathname === '/server/sprech-bank/ergaenzen') {
      const z = zeile(k0.id)
      if (!z) return json(res, 404, { fehler: 'Unbekannte Karte.' }), true
      if (!darfHilfen(z)) return json(res, 403, { fehler: 'Die Hilfen dieser Karte wurden schon durchgesehen – nur Besitzer oder Fachobleute ändern sie.' }), true
      const alt = z.karteAlt
      const roh = (k0.karte ?? {}) as Record<string, unknown>
      // Kennung, Stand und Bilder bleiben immer die der vorhandenen Karte
      const neu = karteBereinigt(
        { ...roh, art: alt.art, stand: alt.stand, ...(alt.art === 'monolog' ? { bilder: alt.bilder, bildVersionen: alt.bildVersionen } : {}), hilfenStatus: 'ki' },
        alt.id
      )
      if (!neu || !neu.hilfen) return json(res, 400, { fehler: 'Die Ergänzung ist unvollständig.' }), true
      db()
        .prepare('UPDATE sprech_bank SET karte = ?, vorher = ?, geaendert = ? WHERE id = ?')
        .run(JSON.stringify(neu), JSON.stringify(alt), new Date().toISOString(), alt.id)
      protokolliereServer('sprechen', `Sprechkarte von der KI ergänzt (${z.sprache}, Jg ${z.jahrgang}, ${z.teil})`, ich.id)
      return json(res, 200, { id: alt.id }), true
    }
    if (url.pathname === '/server/sprech-bank/bestaetigen') {
      const z = zeile(k0.id)
      if (!z) return json(res, 404, { fehler: 'Unbekannte Karte.' }), true
      if (!z.karteAlt.hilfen) return json(res, 400, { fehler: 'Die Karte hat keine Hilfen.' }), true
      const neu = { ...z.karteAlt, hilfenStatus: 'geprueft' as const }
      db().prepare('UPDATE sprech_bank SET karte = ?, vorher = ?, geaendert = ? WHERE id = ?').run(JSON.stringify(neu), '', new Date().toISOString(), z.karteAlt.id)
      return json(res, 200, { id: z.karteAlt.id }), true
    }
    if (url.pathname === '/server/sprech-bank/zurueck') {
      const z = zeile(k0.id)
      if (!z) return json(res, 404, { fehler: 'Unbekannte Karte.' }), true
      if (!darfHilfen(z)) return json(res, 403, { fehler: 'Nur Besitzer oder Fachobleute.' }), true
      let vorher: SprechKarte | null = null
      try {
        vorher = karteBereinigt(JSON.parse(String(z.vorher || 'null')), z.karteAlt.id)
      } catch {
        vorher = null
      }
      if (!vorher) return json(res, 400, { fehler: 'Es gibt keine vorherige Fassung.' }), true
      // Bilder bleiben die aktuellen (sie gehören nicht zur Überarbeitung)
      const alt = z.karteAlt
      const neu = alt.art === 'monolog' && vorher.art === 'monolog' ? { ...vorher, bilder: alt.bilder, bildVersionen: alt.bildVersionen } : vorher
      db().prepare('UPDATE sprech_bank SET karte = ?, vorher = ?, geaendert = ? WHERE id = ?').run(JSON.stringify(neu), '', new Date().toISOString(), alt.id)
      return json(res, 200, { id: alt.id }), true
    }
    if (url.pathname === '/server/sprech-bank/loeschen') {
      const z = db().prepare('SELECT sprache, lehrkraft_id FROM sprech_bank WHERE id = ?').get(String(k0.id ?? '')) as { sprache: string; lehrkraft_id: string } | undefined
      if (!z) return json(res, 404, { fehler: 'Unbekannte Karte.' }), true
      if (z.lehrkraft_id !== ich.id && !darfAlle(z.sprache)) return json(res, 403, { fehler: 'Nur die eigenen Karten.' }), true
      db().prepare('DELETE FROM sprech_bank WHERE id = ?').run(String(k0.id))
      return json(res, 200, { ok: true }), true
    }
    return json(res, 404, { fehler: 'Unbekannt.' }), true
  }
}
