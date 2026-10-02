/**
 * Arbeitsblätter für Lernende freigeben (Etappe 5 des Schülerbereichs, 02.10.2026).
 *
 * Abgestimmt mit der Lehrkraft:
 *  - Freigabe an eine Lerngruppe, an einzelne Lernende oder (QR-Code + Name) an Gäste.
 *  - Die Lernenden bekommen NUR das fertige Blatt – als Schülerfassung ohne Lösungen, gezeichnet
 *    beim Freigeben auf dem Rechner der Lehrkraft (dasselbe HTML wie Druck/PDF). Lösungen und
 *    Erwartungen bleiben hier auf dem Server und gehen nur an die KI.
 *  - Ausfüllen am iPad/PC direkt auf dem Blatt (Felder an Linien, Lücken, Kästchen – gemessen auf
 *    dem Gerät wie beim ausfüllbaren PDF), am Telefon als Liste; tippen oder mit dem Stift.
 *  - Mit KI-Feedback: kurz je Aufgabe UND nach dem Einreichen ein Bogen wie in der Rückmeldungs-App.
 *    Dazu gehört eine verknüpfte Rückmeldung (Aufgaben + Lösungsblatt = Erwartungshorizont); alle
 *    Abgaben landen dort, die Lehrkraft holt sie in der Rückmeldungs-App wie gewohnt.
 *  - KI: Zugang der freigebenden Lehrkraft (Schlüssel oder Abo), ohne Namen.
 *
 *  Lehrkraft:  GET /server/blaetter · POST /server/blaetter/freigeben · GET /server/blaetter/<id>
 *              POST /server/blaetter/<id>/status · POST /server/blaetter/<id>/loeschen
 *  Lernende:   GET /s/api/blaetter · GET /s/api/blatt?id= · POST /s/api/blatt/speichern|aufgabe|abgeben
 *  Gäste:      GET /s/api/blatt/zugang?code= · POST /s/api/blatt/gast   (Seite /s/w/<CODE>)
 */
import { randomBytes } from 'node:crypto'
import { alleNutzer, datenbank, nutzerAnlegen, nutzerNachId, protokolliereServer, sitzungAnlegen, SITZUNG_MS, type NutzerInfo } from './datenbank'
import { imNutzer } from './kontext'
import { alsNutzer, json, setzeSitzungsCookie, type Anfrage, type Aufruf } from './http'
import { gastName, gehoertZu, lerngruppe, mitgliederVon } from './onlinetest'
import { iservBereit } from './anmeldung'
import { registerVergessen } from './namensschutz'
import { blattFassung, blattFassungen, verknuepfteFreigabeAnlegen, verknuepfteFreigabeStatus } from './schuelerfeedback'
import { PULS_MS } from '../main/services/lanServer'
import { seitenMitTinte } from './druck'
import type { Rueckmeldung } from '../renderer/src/modules/rueckmeldung/model/types'
import { ohneNamen } from '../renderer/src/modules/rueckmeldung/generation'
import { aufgabenFeedbackAnfrage, aufgabenFeedbackAus, blattAbgabeText, type BlattAufgabe, type BlattFeld } from '../shared/blattFreigabe'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS blatt_freigaben (
  id TEXT PRIMARY KEY,
  lehrkraft_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  lerngruppe_id TEXT NOT NULL DEFAULT '',
  schueler TEXT NOT NULL DEFAULT '[]',
  code TEXT,
  titel TEXT NOT NULL,
  html TEXT NOT NULL,
  aufgaben TEXT NOT NULL,
  einstellungen TEXT NOT NULL,
  rueckmeldung_id TEXT NOT NULL,
  status TEXT NOT NULL,
  erstellt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS blatt_abgaben (
  freigabe_id TEXT NOT NULL REFERENCES blatt_freigaben(id) ON DELETE CASCADE,
  schueler_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  antworten TEXT NOT NULL DEFAULT '{}',
  tinte TEXT NOT NULL DEFAULT '{}',
  aufgaben_feedback TEXT NOT NULL DEFAULT '{}',
  abgaben INTEGER NOT NULL DEFAULT 0,
  aktualisiert INTEGER NOT NULL,
  PRIMARY KEY (freigabe_id, schueler_id)
);
CREATE TABLE IF NOT EXISTS blatt_gaeste (
  freigabe_id TEXT NOT NULL REFERENCES blatt_freigaben(id) ON DELETE CASCADE,
  nutzer_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  PRIMARY KEY (freigabe_id, nutzer_id)
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

const json_ = <T>(s: string, r: T): T => {
  try {
    return JSON.parse(s) as T
  } catch {
    return r
  }
}

/** Was die Lehrkraft beim Freigeben festlegt */
export interface BlattEinstellungen {
  /** KI-Feedback (Bogen nach dem Einreichen) */
  feedback: boolean
  /** Kurzes KI-Feedback je Aufgabe während des Ausfüllens */
  aufgabenFeedback: boolean
  /** Einreichungen mit Bogen je Person (Überarbeiten) */
  runden: number
  /** Kurz-Feedbacks je Aufgabe und Person */
  aufgabenRunden: number
  /** Stift erlaubt */
  stift: boolean
  /** Zielsprache des Blattes (Fremdsprachen) – für die Ansprache im Feedback */
  sprache?: string
}

interface Zeile {
  id: string
  lehrkraft_id: string
  lerngruppe_id: string
  schueler: string
  code: string | null
  titel: string
  html: string
  aufgaben: string
  einstellungen: string
  rueckmeldung_id: string
  status: 'offen' | 'beendet'
  erstellt: string
}

interface Abgabe {
  freigabe_id: string
  schueler_id: string
  antworten: string
  tinte: string
  aufgaben_feedback: string
  abgaben: number
  aktualisiert: number
}

const freigabe = (id: string): Zeile | null => (db().prepare('SELECT * FROM blatt_freigaben WHERE id = ?').get(id) as Zeile | undefined) ?? null
const nachCode = (code: string): Zeile | null =>
  /^[A-Z0-9]{4,12}$/.test(code) ? ((db().prepare('SELECT * FROM blatt_freigaben WHERE code = ?').get(code) as Zeile | undefined) ?? null) : null
const einstellungenVon = (z: Zeile): BlattEinstellungen =>
  json_(z.einstellungen, { feedback: false, aufgabenFeedback: false, runden: 1, aufgabenRunden: 2, stift: true })
const abgabeVon = (fid: string, sid: string): Abgabe | null =>
  (db().prepare('SELECT * FROM blatt_abgaben WHERE freigabe_id = ? AND schueler_id = ?').get(fid, sid) as Abgabe | undefined) ?? null

/** Gehört das Blatt dieser Person? (Lerngruppe, ggf. nur Ausgewählte, oder per Code beigetreten) */
export function blattIstFuer(z: Zeile, ich: NutzerInfo): boolean {
  if (db().prepare('SELECT 1 FROM blatt_gaeste WHERE freigabe_id = ? AND nutzer_id = ?').get(z.id, ich.id)) return true
  if (ich.quelle === 'gast') return false
  const g = z.lerngruppe_id ? lerngruppe(z.lerngruppe_id) : null
  if (!g || !gehoertZu(g, ich)) return false
  const nur = json_(z.schueler, [] as string[])
  return !nur.length || nur.includes(ich.benutzer)
}

const CODE_ZEICHEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function neuerCode(): string {
  for (;;) {
    const c = Array.from(randomBytes(6), (b) => CODE_ZEICHEN[b % CODE_ZEICHEN.length]).join('')
    if (!db().prepare('SELECT 1 FROM blatt_freigaben WHERE code = ?').get(c)) return c
  }
}

/** Antworten der Lernenden begrenzen (Feld-IDs f0…f999, Text bis 4000 Zeichen, Kreuz „x") */
function bereinigeAntworten(roh: unknown): Record<string, string> {
  const aus: Record<string, string> = {}
  if (!roh || typeof roh !== 'object') return aus
  for (const [k, v] of Object.entries(roh as Record<string, unknown>).slice(0, 1000))
    if (/^f\d{1,3}$/.test(k) && typeof v === 'string') aus[k] = v.slice(0, 4000)
  return aus
}

/** Stift-Seitenbilder: je Seite ein PNG (höchstens 16 Seiten, je 900 KB) */
function bereinigeTinte(roh: unknown): Record<string, string> {
  const aus: Record<string, string> = {}
  if (!roh || typeof roh !== 'object') return aus
  for (const [k, v] of Object.entries(roh as Record<string, unknown>).slice(0, 16))
    if (/^\d{1,2}$/.test(k) && typeof v === 'string' && v.startsWith('data:image/png;base64,') && v.length < 1_200_000) aus[k] = v
  return aus
}

const bereinigeFelder = (roh: unknown): BlattFeld[] =>
  (Array.isArray(roh) ? roh : [])
    .slice(0, 1000)
    .map((x) => x as Record<string, unknown>)
    .filter((x) => /^f\d{1,3}$/.test(String(x.id)))
    .map((x) => ({ id: String(x.id), nr: Number(x.nr) || 0, art: String(x.art ?? 'text').slice(0, 12), seite: Number(x.seite) || 0 }))

/** Für Lernende: Übersicht eines Blattes */
function kurz(z: Zeile, ich: NutzerInfo) {
  const e = einstellungenVon(z)
  const a = abgabeVon(z.id, ich.id)
  return { id: z.id, titel: z.titel, offen: z.status === 'offen', feedback: e.feedback, runden: e.runden, genutzt: a?.abgaben ?? 0, begonnen: Boolean(a) }
}

export function blaetterRoute(aufruf: Aufruf, adresse = ''): (k: Anfrage) => Promise<boolean> {
  const link = (code: string): string => `${adresse.replace(/\/$/, '')}/s/w/${code}`
  return async (k) => {
    const { url, req, res, sitzung } = k
    const schueler = url.pathname === '/s/api/blaetter' || url.pathname === '/s/api/blatt' || url.pathname.startsWith('/s/api/blatt/')
    const lehrer = url.pathname === '/server/blaetter' || url.pathname.startsWith('/server/blaetter/')
    if (!schueler && !lehrer) return false
    const mitKopf = typeof req.headers['x-schulapps-token'] === 'string'
    if (req.method === 'POST' && !mitKopf) return (json(res, 403, { fehler: 'Nur aus der App.' }), true)

    // ---------- Gäste per Code (vor der Anmeldeprüfung)
    if (req.method === 'GET' && url.pathname === '/s/api/blatt/zugang') {
      const z = nachCode(String(url.searchParams.get('code') ?? '').toUpperCase())
      if (!z || z.status !== 'offen') return (json(res, 404, { fehler: 'Dieses Arbeitsblatt gibt es nicht (mehr). Bitte den Code prüfen.' }), true)
      return (json(res, 200, { id: z.id, titel: z.titel, gaeste: !iservBereit(), dabei: Boolean(sitzung && blattIstFuer(z, sitzung.nutzer)) }), true)
    }
    if (req.method === 'POST' && url.pathname === '/s/api/blatt/gast') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      const z = nachCode(String(k0.code ?? '').toUpperCase())
      if (!z || z.status !== 'offen') return (json(res, 404, { fehler: 'Dieses Arbeitsblatt gibt es nicht (mehr). Bitte den Code prüfen.' }), true)
      if (sitzung && blattIstFuer(z, sitzung.nutzer)) return (json(res, 200, { ok: true, id: z.id }), true)
      if (sitzung && sitzung.nutzer.quelle !== 'gast' && sitzung.nutzer.rolle === 'schueler') {
        db().prepare('INSERT OR IGNORE INTO blatt_gaeste (freigabe_id, nutzer_id) VALUES (?, ?)').run(z.id, sitzung.nutzer.id)
        return (json(res, 200, { ok: true, id: z.id }), true)
      }
      if (iservBereit()) return (json(res, 403, { fehler: 'Bitte mit IServ anmelden.' }), true)
      const name = gastName(k0.name)
      if (!name) return (json(res, 400, { fehler: 'Bitte Vorname und Anfangsbuchstaben des Nachnamens eingeben, z. B. „Anna K.“' }), true)
      const gaeste = db().prepare('SELECT nutzer_id FROM blatt_gaeste WHERE freigabe_id = ?').all(z.id) as { nutzer_id: string }[]
      const namen = new Map(alleNutzer().map((n) => [n.id, n.name.toLowerCase()]))
      if (gaeste.some((x) => namen.get(x.nutzer_id) === name.toLowerCase()))
        return (json(res, 409, { fehler: `„${name}“ ist schon dabei. Bitte einen zweiten Buchstaben des Nachnamens dazunehmen, z. B. „Anna Ko.“` }), true)
      if (gaeste.length >= 80) return (json(res, 429, { fehler: 'Für dieses Blatt sind schon zu viele Gäste angemeldet.' }), true)
      const gast = nutzerAnlegen({ benutzer: `gast-${randomBytes(6).toString('hex')}`, name, rolle: 'schueler', quelle: 'gast' })
      registerVergessen()
      db().prepare('INSERT INTO blatt_gaeste (freigabe_id, nutzer_id) VALUES (?, ?)').run(z.id, gast.id)
      const neu = sitzungAnlegen(gast.id, 'schueler')
      setzeSitzungsCookie(res, neu.cookie, SITZUNG_MS.schueler, Boolean((req.socket as { encrypted?: boolean }).encrypted))
      protokolliereServer('arbeitsblatt', 'Beitritt mit Namen (ohne IServ)', gast.id)
      return (json(res, 200, { ok: true, id: z.id }), true)
    }

    if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
    const ich = sitzung.nutzer

    // ---------- Lernende
    if (schueler) {
      if (req.method === 'GET' && url.pathname === '/s/api/blaetter') {
        const alle = (db().prepare('SELECT * FROM blatt_freigaben ORDER BY erstellt DESC').all() as unknown as Zeile[]).filter((z) => blattIstFuer(z, ich))
        // Beendete nur, wenn schon etwas eingetragen ist (zum Nachlesen)
        return (json(res, 200, { blaetter: alle.filter((z) => z.status === 'offen' || abgabeVon(z.id, ich.id)).map((z) => kurz(z, ich)) }), true)
      }
      const id = req.method === 'GET' ? String(url.searchParams.get('id') ?? '') : String(((await k.koerper()) as Record<string, unknown>).id ?? '')
      const z = freigabe(id)
      if (!z || !blattIstFuer(z, ich)) return (json(res, 404, { fehler: 'Dieses Arbeitsblatt ist nicht für dich freigegeben.' }), true)
      const e = einstellungenVon(z)
      const a = abgabeVon(z.id, ich.id)
      if (req.method === 'GET' && url.pathname === '/s/api/blatt') {
        // NUR die Schülerfassung – Aufgaben ohne Erwartungen
        return (
          json(res, 200, {
            ...kurz(z, ich),
            html: z.html,
            einstellungen: { feedback: e.feedback, aufgabenFeedback: e.aufgabenFeedback, aufgabenRunden: e.aufgabenRunden, stift: e.stift },
            antworten: json_(a?.antworten ?? '{}', {}),
            tinte: json_(a?.tinte ?? '{}', {}),
            aufgabenFeedback: json_(a?.aufgaben_feedback ?? '{}', {}),
            fassungen: blattFassungen(z.rueckmeldung_id, ich.id).map(({ volleBogen: _v, ...rest }) => rest)
          }),
          true
        )
      }
      if (req.method !== 'POST') return (json(res, 405, { fehler: 'Nicht erlaubt.' }), true)
      if (z.status !== 'offen') return (json(res, 409, { fehler: 'Dieses Arbeitsblatt ist abgeschlossen.' }), true)
      const k0 = (await k.koerper()) as Record<string, unknown>
      const speichern = (
        antworten: Record<string, string>,
        tinte: Record<string, string> | null,
        mehr: Partial<Pick<Abgabe, 'aufgaben_feedback' | 'abgaben'>> = {}
      ): void => {
        const jetzt = Date.now()
        const alt = abgabeVon(z.id, ich.id)
        if (!alt)
          db()
            .prepare(
              'INSERT INTO blatt_abgaben (freigabe_id, schueler_id, antworten, tinte, aufgaben_feedback, abgaben, aktualisiert) VALUES (?, ?, ?, ?, ?, ?, ?)'
            )
            .run(z.id, ich.id, JSON.stringify(antworten), JSON.stringify(tinte ?? {}), mehr.aufgaben_feedback ?? '{}', mehr.abgaben ?? 0, jetzt)
        else
          db()
            .prepare(
              'UPDATE blatt_abgaben SET antworten = ?, tinte = ?, aufgaben_feedback = ?, abgaben = ?, aktualisiert = ? WHERE freigabe_id = ? AND schueler_id = ?'
            )
            .run(
              JSON.stringify(antworten),
              tinte ? JSON.stringify(tinte) : alt.tinte,
              mehr.aufgaben_feedback ?? alt.aufgaben_feedback,
              mehr.abgaben ?? alt.abgaben,
              jetzt,
              z.id,
              ich.id
            )
      }
      if (url.pathname === '/s/api/blatt/speichern') {
        speichern(bereinigeAntworten(k0.antworten), k0.tinte ? bereinigeTinte(k0.tinte) : null)
        return (json(res, 200, { ok: true }), true)
      }
      const aufgaben = json_(z.aufgaben, [] as BlattAufgabe[])
      const lehrkraft = nutzerNachId(z.lehrkraft_id)
      if (url.pathname === '/s/api/blatt/aufgabe') {
        // Kurzes Feedback zu EINER Aufgabe – ohne die Lösung zu verraten
        if (!e.aufgabenFeedback || !lehrkraft) return (json(res, 403, { fehler: 'Für dieses Blatt ist kein Feedback je Aufgabe vorgesehen.' }), true)
        const nr = Number(k0.nr)
        const aufgabe = aufgaben.find((x) => x.nr === nr)
        if (!aufgabe) return (json(res, 400, { fehler: 'Unbekannte Aufgabe.' }), true)
        const antworten = bereinigeAntworten(k0.antworten)
        const felder = bereinigeFelder(k0.felder).filter((f) => f.nr === nr)
        const tinte = k0.tinte ? bereinigeTinte(k0.tinte) : json_(a?.tinte ?? '{}', {} as Record<string, string>)
        const bisher = json_(a?.aufgaben_feedback ?? '{}', {} as Record<string, { text: string; einschaetzung: string; zeit: number }[]>)
        const liste = bisher[String(nr)] ?? []
        if (liste.length >= e.aufgabenRunden)
          return (json(res, 409, { fehler: `Zu dieser Aufgabe gab es schon ${e.aufgabenRunden}× Feedback. Reiche das Blatt ein, wenn du fertig bist.` }), true)
        const seiten = [...new Set(felder.map((f) => f.seite))]
        const mitTinte = Object.fromEntries(seiten.filter((s) => tinte[String(s)]).map((s) => [String(s), tinte[String(s)]]))
        const bilder = e.stift ? await seitenMitTinte(z.html, mitTinte).catch(() => [] as string[]) : []
        // Eigene und fremde Namen im Text durch Kürzel ersetzen (wie beim Bogen); der Namensfilter greift zusätzlich
        const text = ohneNamen({ id: 'a', kuerzel: 'S1', name: ich.name, dateiname: '', text: blattAbgabeText([aufgabe], felder, antworten), bilder: [] }).text
        if (!text.trim() && !bilder.length) return (json(res, 400, { fehler: 'Bitte zuerst etwas eintragen.' }), true)
        try {
          const antwort = await imNutzer(alsNutzer(lehrkraft), () => aufruf('ai:structured', [aufgabenFeedbackAnfrage(aufgabe, text, bilder, e.sprache)]))
          const fb = aufgabenFeedbackAus(antwort)
          bisher[String(nr)] = [...liste, { ...fb, zeit: Date.now() }]
          speichern(antworten, k0.tinte ? tinte : null, { aufgaben_feedback: JSON.stringify(bisher) })
          protokolliereServer('arbeitsblatt', 'Feedback zu einer Aufgabe', ich.id)
          return (json(res, 200, { ...fb, rest: e.aufgabenRunden - liste.length - 1 }), true)
        } catch (err) {
          return (json(res, 503, { fehler: err instanceof Error ? err.message : String(err) }), true)
        }
      }
      if (url.pathname === '/s/api/blatt/abgeben') {
        const genutzt = a?.abgaben ?? 0
        if (genutzt >= e.runden) return (json(res, 409, { fehler: `Du hast das Blatt schon ${e.runden}× eingereicht.` }), true)
        const antworten = bereinigeAntworten(k0.antworten)
        const tinte = k0.tinte ? bereinigeTinte(k0.tinte) : json_(a?.tinte ?? '{}', {} as Record<string, string>)
        const felder = bereinigeFelder(k0.felder)
        speichern(antworten, k0.tinte ? tinte : null, { abgaben: genutzt + 1 })
        const text = blattAbgabeText(aufgaben, felder, antworten)
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        const puls = setInterval(() => res.write(' '), PULS_MS)
        res.on('close', () => clearInterval(puls))
        try {
          // Stift-Einträge über dem Blatt als Seitenbilder (sonst sieht die KI nur Striche ohne Zusammenhang)
          const bilder = e.stift ? await seitenMitTinte(z.html, tinte).catch(() => [] as string[]) : []
          const r = await blattFassung(z.rueckmeldung_id, nutzerNachId(ich.id)!, text, bilder, e.feedback, aufruf)
          res.end(JSON.stringify({ ok: !r.fehler, fehler: r.fehler, bogen: r.bogen, nr: r.nr }))
        } catch (err) {
          res.end(JSON.stringify({ ok: false, fehler: err instanceof Error ? err.message : String(err) }))
        } finally {
          clearInterval(puls)
        }
        return true
      }
      return (json(res, 404, { fehler: 'Unbekannt.' }), true)
    }

    // ---------- Lehrkraft
    if (ich.rolle === 'schueler') return (json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true)
    const teile = url.pathname.split('/').filter(Boolean).slice(2)
    if (req.method === 'GET' && teile.length === 0) {
      const liste = db().prepare('SELECT * FROM blatt_freigaben WHERE lehrkraft_id = ? ORDER BY erstellt DESC').all(ich.id) as unknown as Zeile[]
      return (
        json(res, 200, {
          blaetter: liste.map((z) => ({
            id: z.id,
            titel: z.titel,
            status: z.status,
            lerngruppe: (z.lerngruppe_id ? lerngruppe(z.lerngruppe_id)?.name : '') ?? '',
            schueler: json_(z.schueler, [] as string[]).length,
            einstellungen: einstellungenVon(z),
            ...(z.code ? { code: z.code, link: link(z.code) } : {}),
            abgaben: (db().prepare('SELECT COUNT(*) AS n FROM blatt_abgaben WHERE freigabe_id = ? AND abgaben > 0').get(z.id) as { n: number }).n,
            begonnen: (db().prepare('SELECT COUNT(*) AS n FROM blatt_abgaben WHERE freigabe_id = ?').get(z.id) as { n: number }).n
          }))
        }),
        true
      )
    }
    if (req.method === 'POST' && teile[0] === 'freigeben') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      const mitGaesten = k0.gaeste === true && !iservBereit()
      const gruppeId = String(k0.lerngruppeId ?? '')
      const g = gruppeId ? lerngruppe(gruppeId) : null
      if (gruppeId && (!g || g.lehrkraft_id !== ich.id)) return (json(res, 400, { fehler: 'Bitte eine eigene Lerngruppe wählen.' }), true)
      if (!g && !mitGaesten) return (json(res, 400, { fehler: 'Bitte eine Lerngruppe wählen oder Gäste mit QR-Code zulassen.' }), true)
      const html = String(k0.html ?? '')
      if (!html.includes('ws-page') || html.length > 30 * 1024 * 1024) return (json(res, 400, { fehler: 'Das Blatt fehlt oder ist zu groß.' }), true)
      const aufgaben = (Array.isArray(k0.aufgaben) ? k0.aufgaben : []).slice(0, 80).map((x) => {
        const y = x as Record<string, unknown>
        return { nr: Number(y.nr) || 0, anweisung: String(y.anweisung ?? '').slice(0, 4000), erwartung: String(y.erwartung ?? '').slice(0, 8000) }
      })
      const vorlage = k0.rueckmeldung as Rueckmeldung | undefined
      if (!vorlage?.grundlage) return (json(res, 400, { fehler: 'Die Erwartung fehlt.' }), true)
      const erlaubt = new Set(g ? mitgliederVon(g).map((n) => n.benutzer) : [])
      const einzelne = Array.isArray(k0.schueler) ? [...new Set((k0.schueler as unknown[]).map(String).filter((b) => erlaubt.has(b)))] : []
      const e0 = (k0.einstellungen ?? {}) as Record<string, unknown>
      const einstellungen: BlattEinstellungen = {
        feedback: e0.feedback !== false,
        aufgabenFeedback: e0.aufgabenFeedback !== false,
        runden: Math.max(1, Math.min(5, Math.round(Number(e0.runden) || 2))),
        aufgabenRunden: Math.max(1, Math.min(5, Math.round(Number(e0.aufgabenRunden) || 2))),
        stift: e0.stift !== false,
        ...(typeof e0.sprache === 'string' ? { sprache: e0.sprache.slice(0, 8) } : {})
      }
      const titel = String(k0.titel ?? 'Arbeitsblatt').slice(0, 160)
      const rid = verknuepfteFreigabeAnlegen({
        lehrkraftId: ich.id,
        lerngruppeId: g?.id ?? '',
        schueler: einzelne,
        titel: `Arbeitsblatt: ${titel}`,
        vorlage,
        runden: einstellungen.runden
      })
      const id = randomBytes(8).toString('hex')
      const code = mitGaesten ? neuerCode() : null
      db()
        .prepare(
          "INSERT INTO blatt_freigaben (id, lehrkraft_id, lerngruppe_id, schueler, code, titel, html, aufgaben, einstellungen, rueckmeldung_id, status, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'offen', ?)"
        )
        .run(
          id,
          ich.id,
          g?.id ?? '',
          JSON.stringify(einzelne),
          code,
          titel,
          html,
          JSON.stringify(aufgaben),
          JSON.stringify(einstellungen),
          rid,
          new Date().toISOString()
        )
      protokolliereServer('arbeitsblatt', 'Arbeitsblatt für Lernende freigegeben', ich.id)
      return (json(res, 200, { id, ...(code ? { code, link: link(code) } : {}) }), true)
    }
    const z = teile[0] ? freigabe(teile[0]) : null
    if (!z || z.lehrkraft_id !== ich.id) return (json(res, 404, { fehler: 'Unbekannt.' }), true)
    if (req.method === 'GET' && teile.length === 1) {
      const namen = new Map(alleNutzer().map((n) => [n.id, n]))
      const abgaben = (db().prepare('SELECT * FROM blatt_abgaben WHERE freigabe_id = ? ORDER BY aktualisiert DESC').all(z.id) as unknown as Abgabe[]).map(
        (a) => ({
          name: namen.get(a.schueler_id)?.name ?? '',
          benutzer: namen.get(a.schueler_id)?.benutzer ?? '',
          eingereicht: a.abgaben,
          aktualisiert: a.aktualisiert,
          fassungen: blattFassungen(z.rueckmeldung_id, a.schueler_id).map((f) => ({ nr: f.nr, zeit: f.zeit, bogen: f.volleBogen, fehler: f.fehler }))
        })
      )
      return (json(res, 200, { id: z.id, titel: z.titel, status: z.status, rueckmeldungId: z.rueckmeldung_id, abgaben }), true)
    }
    if (req.method === 'POST' && teile[1] === 'status') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      const status = k0.status === 'beendet' ? 'beendet' : 'offen'
      db().prepare('UPDATE blatt_freigaben SET status = ? WHERE id = ?').run(status, z.id)
      verknuepfteFreigabeStatus(z.rueckmeldung_id, status)
      return (json(res, 200, { ok: true }), true)
    }
    if (req.method === 'POST' && teile[1] === 'loeschen') {
      db().prepare('DELETE FROM blatt_freigaben WHERE id = ?').run(z.id)
      return (json(res, 200, { ok: true }), true)
    }
    return (json(res, 404, { fehler: 'Unbekannt.' }), true)
  }
}

/** Für die Unterrichtsreihe: Stand einer Person bei einem freigegebenen Blatt */
export function blattStand(freigabeId: string, schuelerId: string): { eingereicht: number; kriterien: string[] } | null {
  const z = freigabe(freigabeId)
  if (!z) return null
  const a = abgabeVon(z.id, schuelerId)
  const letzte = blattFassungen(z.rueckmeldung_id, schuelerId).at(-1)
  return { eingereicht: a?.abgaben ?? 0, kriterien: (letzte?.volleBogen?.kriterien ?? []).map((k) => k.einschaetzung) }
}

export { freigabe as blattFreigabe }
