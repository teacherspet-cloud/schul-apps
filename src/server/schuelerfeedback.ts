/**
 * Direktes Feedback für Lernende (02.10.2026) – Wunsch der Lehrkraft: „Sie stellen ihre Aufgaben
 * selber in die Rückmeldungs-App zu Aufgaben, die für sie freigeschaltet sind. Können danach
 * überarbeiten und neues Feedback anfordern."
 *
 *  - Die Lehrkraft gibt eine Rückmeldung (Aufgabe, Erwartung, Formen) für eine Lerngruppe frei:
 *    Zahl der Feedback-Runden je Schülerin/Schüler, Abgabeschluss. Geteilt wird nur die Vorlage
 *    OHNE vorhandene Abgaben (keine fremden Schülerdaten).
 *  - Lernende reichen Text ein; der Server erzeugt den Bogen mit denselben Bausteinen wie die
 *    Rückmeldungs-App (renderer/modules/rueckmeldung) – im Namen der LEHRKRAFT (ihr Schlüssel),
 *    über den Namensschutz; der eigene Name der Schülerin/des Schülers wird vorher durch das
 *    Kürzel ersetzt (`ohneNamen`).
 *  - KI: der Zugang der freigebenden Lehrkraft – API-Schlüssel ODER ihr Abo (Entscheidung der
 *    Lehrkraft, 02.10.2026; vorher nur Schlüssel).
 *  - Etappe 4 (02.10.2026): Freigabe an die ganze Lerngruppe ODER an einzelne Lernende (Spalte
 *    `schueler`, Benutzernamen); Gäste per QR-Code/Code und Namenseingabe (`/s/f/<CODE>`, nur
 *    solange IServ nicht eingerichtet ist) – wie beim Onlinetest, ein Gastkonto je Aufgabe.
 *  - An die Lernenden geht der Bogen OHNE Einstufung/Notenvorschlag und ohne Hinweise für die
 *    Lehrkraft; die Lehrkraft sieht alle Fassungen und holt sie in ihre Rückmeldung.
 */
import { randomBytes } from 'node:crypto'
import { getSettings } from '../main/services/storage/settings'
import { bogenAnfrage, bogenAus, ohneNamen } from '../renderer/src/modules/rueckmeldung/generation'
import { bogenKontextAus, rueckmeldungSystem } from '../renderer/src/modules/rueckmeldung/system'
import type { Abgabe, Bogen, Rueckmeldung } from '../renderer/src/modules/rueckmeldung/model/types'
import { alleNutzer, datenbank, nutzerAnlegen, nutzerNachId, protokolliereServer, sitzungAnlegen, SITZUNG_MS, type NutzerInfo } from './datenbank'
import { imNutzer } from './kontext'
import { alsNutzer, json, setzeSitzungsCookie, type Anfrage, type Aufruf } from './http'
import { alleLernenden, gastName, gehoertZu, klasseVon, lerngruppe, lerngruppenVon, mitgliederVon } from './onlinetest'
import { iservBereit } from './anmeldung'
import { registerVergessen } from './namensschutz'
import { PULS_MS } from '../main/services/lanServer'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS feedback_freigaben (
  id TEXT PRIMARY KEY,
  lehrkraft_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  lerngruppe_id TEXT NOT NULL,
  titel TEXT NOT NULL,
  vorlage TEXT NOT NULL,
  runden INTEGER NOT NULL,
  bis INTEGER,
  status TEXT NOT NULL,
  erstellt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS feedback_abgaben (
  id TEXT PRIMARY KEY,
  freigabe_id TEXT NOT NULL REFERENCES feedback_freigaben(id) ON DELETE CASCADE,
  schueler_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  fassungen TEXT NOT NULL DEFAULT '[]',
  aktualisiert TEXT NOT NULL,
  UNIQUE (freigabe_id, schueler_id)
);
CREATE TABLE IF NOT EXISTS feedback_gaeste (
  freigabe_id TEXT NOT NULL REFERENCES feedback_freigaben(id) ON DELETE CASCADE,
  nutzer_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  PRIMARY KEY (freigabe_id, nutzer_id)
);`

let bereit = false
const db = () => {
  const d = datenbank()
  if (!bereit) {
    d.exec(SCHEMA)
    // Etappe 4: einzelne Lernende, Gast-Code
    const spalten = new Set((d.prepare('PRAGMA table_info(feedback_freigaben)').all() as { name: string }[]).map((x) => x.name))
    if (!spalten.has('schueler')) d.exec("ALTER TABLE feedback_freigaben ADD COLUMN schueler TEXT NOT NULL DEFAULT '[]'")
    if (!spalten.has('code')) d.exec('ALTER TABLE feedback_freigaben ADD COLUMN code TEXT')
    // Etappe 5: verknüpfte Rückmeldung eines freigegebenen Arbeitsblatts (art 'blatt') – erscheint nicht in der Aufgabenliste der Lernenden
    if (!spalten.has('art')) d.exec("ALTER TABLE feedback_freigaben ADD COLUMN art TEXT NOT NULL DEFAULT ''")
    const sp2 = new Set((d.prepare('PRAGMA table_info(feedback_abgaben)').all() as { name: string }[]).map((x) => x.name))
    if (!sp2.has('extra')) d.exec('ALTER TABLE feedback_abgaben ADD COLUMN extra INTEGER NOT NULL DEFAULT 0')
    bereit = true
  }
  return d
}

interface Fassung {
  nr: number
  text: string
  zeit: string
  bogen?: Bogen
  fehler?: string
}

interface Freigabe {
  id: string
  lehrkraft_id: string
  lerngruppe_id: string
  titel: string
  vorlage: string
  runden: number
  bis: number | null
  status: 'offen' | 'beendet'
  erstellt: string
  /** JSON-Liste von Benutzernamen; leer = ganze Lerngruppe */
  schueler: string
  /** Code für Gäste (QR-Code + Name); null = keine Gäste */
  code: string | null
  /** '' = Rückmeldungsaufgabe, 'blatt' = gehört zu einem freigegebenen Arbeitsblatt (src/server/arbeitsblaetter.ts) */
  art?: string
}

const json_ = <T>(s: string, r: T): T => {
  try {
    return JSON.parse(s) as T
  } catch {
    return r
  }
}

/** Was die Lernenden vom Bogen sehen: Stärken, Schritte, Einschätzung je Kriterium, Schlusssatz, Überarbeitungsauftrag */
export function bogenFuerLernende(b: Bogen | undefined): Partial<Bogen> | undefined {
  if (!b) return undefined
  return {
    staerken: b.staerken,
    schritte: b.schritte,
    kriterien: b.kriterien.map((k) => ({ kriterium: k.kriterium, einschaetzung: k.einschaetzung, ...(k.beleg ? { beleg: k.beleg } : {}) })),
    ...(b.schluss ? { schluss: b.schluss } : {}),
    ...(b.ueberarbeitung ? { ueberarbeitung: b.ueberarbeitung } : {}),
    // Für das digitale Blatt: Fazit je Aufgabe und Randkommentare (ohne Lage im Scan)
    ...(b.aufgaben?.length ? { aufgaben: b.aufgaben } : {}),
    ...(b.rand?.length
      ? { rand: b.rand.map((k) => ({ id: k.id, zitat: k.zitat, text: k.text, art: k.art, ...(k.zeichen ? { zeichen: k.zeichen } : {}) })) }
      : {})
  }
}

const freigabe = (id: string): Freigabe | null => (db().prepare('SELECT * FROM feedback_freigaben WHERE id = ?').get(id) as Freigabe | undefined) ?? null

const schuelerVon = (f: Freigabe): string[] => json_(f.schueler ?? '[]', [] as string[])

/** Gehört die Aufgabe dieser Person? Lerngruppe (ggf. nur ausgewählte) oder als Gast beigetreten */
function istFuer(f: Freigabe, ich: NutzerInfo): boolean {
  // Per Code beigetreten (Gast oder Konto)?
  if (db().prepare('SELECT 1 FROM feedback_gaeste WHERE freigabe_id = ? AND nutzer_id = ?').get(f.id, ich.id)) return true
  if (ich.quelle === 'gast') return false
  const nur = schuelerVon(f)
  // Ohne Lerngruppe (Unterrichtsreihe an Einzelne, 03.10.2026): nur die genannten Lernenden
  if (!f.lerngruppe_id) return ich.rolle === 'schueler' && nur.includes(ich.benutzer)
  const g = lerngruppe(f.lerngruppe_id)
  if (!g || !gehoertZu(g, ich)) return false
  return !nur.length || nur.includes(ich.benutzer)
}

function offenFuer(f: Freigabe, ich: NutzerInfo): boolean {
  return f.status === 'offen' && (!f.bis || Date.now() < f.bis) && istFuer(f, ich)
}

const CODE_ZEICHEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function neuerCode(): string {
  for (;;) {
    const c = Array.from(randomBytes(6), (b) => CODE_ZEICHEN[b % CODE_ZEICHEN.length]).join('')
    if (!db().prepare('SELECT 1 FROM feedback_freigaben WHERE code = ?').get(c)) return c
  }
}
const freigabeNachCode = (code: string): Freigabe | null =>
  /^[A-Z0-9]{4,12}$/.test(code) ? ((db().prepare('SELECT * FROM feedback_freigaben WHERE code = ?').get(code) as Freigabe | undefined) ?? null) : null
const MAX_GAESTE = 80

/** Bogen erzeugen – im Namen der Lehrkraft, mit ihrem KI-Zugang (Schlüssel oder Abo) */
async function bogenErzeugen(f: Freigabe, schueler: NutzerInfo, text: string, aufruf: Aufruf, bilder: string[] = [], material = ''): Promise<Bogen> {
  const lehrkraft = nutzerNachId(f.lehrkraft_id)
  if (!lehrkraft) throw new Error('Die Lehrkraft gibt es nicht mehr.')
  const r = json_(f.vorlage, {} as Rueckmeldung)
  // Freigegebene Arbeitsblätter (auch ältere): Fazit je Aufgabe und Randkommentare (03.10.2026)
  if (f.art === 'blatt' && r.meta) {
    r.meta.digitalesBlatt = true
    const formen = new Set(r.meta.formen?.length ? r.meta.formen : ['schriftlich', 'tipps'])
    formen.add('rand')
    r.meta.formen = [...formen] as typeof r.meta.formen
  }
  return imNutzer(alsNutzer(lehrkraft), async () => {
    const settings = getSettings()
    const a: Abgabe = { id: 'a', kuerzel: 'S1', name: schueler.name, dateiname: '', text, bilder: [] }
    const { text: ohne } = ohneNamen(a)
    const anonym = { ...a, text: ohne }
    const ctx = bogenKontextAus(settings, r)
    const anfrage = bogenAnfrage(r, anonym, rueckmeldungSystem(r), ctx)
    // Handschriftliche Einträge (Arbeitsblatt im Stift-Modus): Seitenbilder mitgeben
    if (bilder.length) {
      anfrage.images = [...(anfrage.images ?? []), ...bilder.slice(0, 8)]
      anfrage.user +=
        '\nHANDSCHRIFTLICHE EINTRÄGE: Die beigefügten Seitenbilder zeigen das Blatt mit dem, was mit dem Stift eingetragen wurde – beziehe es ein.'
    }
    // Zeilenangaben prüfbar machen (03.10.2026): das Material so nummeriert, wie es gedruckt ist
    if (material)
      anfrage.user += `\n${'MATERIAL DES BLATTS MIT ZEILENNUMMERN (genau so gedruckt; verbindlich für jede Zeilenangabe – prüfe Zeilenangaben und Belege der Person NUR hieran; was du hier nicht eindeutig widerlegen kannst, bemängelst du nicht; nicht Teil der Antwort):'}\n${material}`
    const antwort = await aufruf('ai:structured', [anfrage])
    return bogenAus(antwort, r, anonym, ctx)
  })
}

// ---------------------------------------------------------------- für freigegebene Arbeitsblätter (Etappe 5)

/** Verknüpfte Rückmeldung anlegen: Aufgaben + Lösungsblatt sind der Erwartungshorizont */
export function verknuepfteFreigabeAnlegen(e: {
  lehrkraftId: string
  lerngruppeId: string
  schueler: string[]
  titel: string
  vorlage: Rueckmeldung
  runden: number
  /** 'blatt' (Arbeitsblatt), 'reihe' (Schritt einer Unterrichtsreihe – über die Reihe erreichbar), 'reihe-aufgabe' (nur KI-Bogen) */
  art?: 'blatt' | 'reihe' | 'reihe-aufgabe'
}): string {
  const id = randomBytes(8).toString('hex')
  db()
    .prepare(
      "INSERT INTO feedback_freigaben (id, lehrkraft_id, lerngruppe_id, titel, vorlage, runden, bis, status, erstellt, schueler, code, art) VALUES (?, ?, ?, ?, ?, ?, NULL, 'offen', ?, ?, NULL, ?)"
    )
    .run(
      id,
      e.lehrkraftId,
      e.lerngruppeId,
      e.titel.slice(0, 160),
      JSON.stringify({ ...e.vorlage, abgaben: [] }),
      e.runden,
      new Date().toISOString(),
      JSON.stringify(e.schueler),
      e.art ?? 'blatt'
    )
  return id
}

export function verknuepfteFreigabeStatus(id: string, status: 'offen' | 'beendet'): void {
  db().prepare("UPDATE feedback_freigaben SET status = ? WHERE id = ? AND art != ''").run(status, id)
}

/**
 * Fassung eines Arbeitsblatts in die verknüpfte Rückmeldung legen (mit oder ohne Bogen) – so sieht
 * die Lehrkraft sie in der Rückmeldungs-App („Abgaben holen").
 */
export async function blattFassung(
  freigabeId: string,
  schueler: NutzerInfo,
  text: string,
  bilder: string[],
  mitFeedback: boolean,
  aufruf: Aufruf,
  material = ''
): Promise<{ nr: number; bogen?: Partial<Bogen>; fehler?: string; volleBogen?: Bogen }> {
  const f = freigabe(freigabeId)
  if (!f) throw new Error('Die verknüpfte Rückmeldung fehlt.')
  const zeile = db().prepare('SELECT id, fassungen FROM feedback_abgaben WHERE freigabe_id = ? AND schueler_id = ?').get(f.id, schueler.id) as
    { id: string; fassungen: string } | undefined
  const fassungen = json_(zeile?.fassungen ?? '[]', [] as Fassung[])
  const neu: Fassung & { bilder?: string[] } = { nr: fassungen.length + 1, text, zeit: new Date().toISOString(), ...(bilder.length ? { bilder } : {}) }
  if (mitFeedback) {
    try {
      neu.bogen = await bogenErzeugen(f, schueler, text, aufruf, bilder, material)
    } catch (e) {
      neu.fehler = e instanceof Error ? e.message : String(e)
    }
  }
  const alle = [...fassungen, neu]
  if (zeile) db().prepare('UPDATE feedback_abgaben SET fassungen = ?, aktualisiert = ? WHERE id = ?').run(JSON.stringify(alle), neu.zeit, zeile.id)
  else
    db()
      .prepare('INSERT INTO feedback_abgaben (id, freigabe_id, schueler_id, fassungen, aktualisiert) VALUES (?, ?, ?, ?, ?)')
      .run(randomBytes(8).toString('hex'), f.id, schueler.id, JSON.stringify(alle), neu.zeit)
  protokolliereServer('feedback', neu.bogen ? 'Feedback zu einem Arbeitsblatt erzeugt' : 'Arbeitsblatt abgegeben', schueler.id)
  return { nr: neu.nr, bogen: bogenFuerLernende(neu.bogen), fehler: neu.fehler, volleBogen: neu.bogen }
}

/** Die Fassungen einer Person in einer verknüpften Rückmeldung (für die Lernenden, ohne Lehrkraft-Teile) */
export function blattFassungen(
  freigabeId: string,
  schuelerId: string
): { nr: number; zeit: string; bogen?: Partial<Bogen>; fehler?: string; volleBogen?: Bogen }[] {
  const zeile = db().prepare('SELECT fassungen FROM feedback_abgaben WHERE freigabe_id = ? AND schueler_id = ?').get(freigabeId, schuelerId) as
    { fassungen: string } | undefined
  return json_(zeile?.fassungen ?? '[]', [] as Fassung[]).map((x) => ({
    nr: x.nr,
    zeit: x.zeit,
    bogen: bogenFuerLernende(x.bogen),
    fehler: x.fehler,
    volleBogen: x.bogen
  }))
}

export function feedbackRoute(aufruf: Aufruf, adresse = ''): (k: Anfrage) => Promise<boolean> {
  const link = (code: string): string => `${adresse.replace(/\/$/, '')}/s/f/${code}`
  return async (k) => {
    const { url, req, res, sitzung } = k
    const schueler = url.pathname.startsWith('/s/api/aufgaben') || url.pathname.startsWith('/s/api/aufgabe/')
    const lehrer = url.pathname.startsWith('/server/feedback')
    if (!schueler && !lehrer) return false
    const mitKopf0 = typeof req.headers['x-schulapps-token'] === 'string'

    // ---------- Gäste per Code (QR) und Namen – vor der Anmeldeprüfung
    if (req.method === 'GET' && url.pathname === '/s/api/aufgabe/zugang') {
      const f = freigabeNachCode(String(url.searchParams.get('code') ?? '').toUpperCase())
      if (!f || f.status !== 'offen') return (json(res, 404, { fehler: 'Diese Aufgabe gibt es nicht (mehr). Bitte den Code prüfen.' }), true)
      return (json(res, 200, { id: f.id, titel: f.titel, gaeste: !iservBereit(), dabei: Boolean(sitzung && istFuer(f, sitzung.nutzer)) }), true)
    }
    if (req.method === 'POST' && url.pathname === '/s/api/aufgabe/gast') {
      if (!mitKopf0) return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
      const k0 = (await k.koerper()) as Record<string, unknown>
      const f = freigabeNachCode(String(k0.code ?? '').toUpperCase())
      if (!f || f.status !== 'offen') return (json(res, 404, { fehler: 'Diese Aufgabe gibt es nicht (mehr). Bitte den Code prüfen.' }), true)
      if (sitzung && istFuer(f, sitzung.nutzer)) return (json(res, 200, { ok: true, id: f.id }), true)
      // Mit Schülerkonto per Code: ohne Namen dazu – die Abgabe steht dann unter dem Konto
      if (sitzung && sitzung.nutzer.quelle !== 'gast' && sitzung.nutzer.rolle === 'schueler') {
        db().prepare('INSERT OR IGNORE INTO feedback_gaeste (freigabe_id, nutzer_id) VALUES (?, ?)').run(f.id, sitzung.nutzer.id)
        return (json(res, 200, { ok: true, id: f.id }), true)
      }
      if (iservBereit()) return (json(res, 403, { fehler: 'Bitte mit IServ anmelden.' }), true)
      const name = gastName(k0.name)
      if (!name) return (json(res, 400, { fehler: 'Bitte Vorname und Anfangsbuchstaben des Nachnamens eingeben, z. B. „Anna K.“' }), true)
      const gaeste = db().prepare('SELECT nutzer_id FROM feedback_gaeste WHERE freigabe_id = ?').all(f.id) as { nutzer_id: string }[]
      const namen = new Map(alleNutzer().map((n) => [n.id, n.name.toLowerCase()]))
      if (gaeste.some((x) => namen.get(x.nutzer_id) === name.toLowerCase()))
        return (json(res, 409, { fehler: `„${name}“ ist schon dabei. Bitte einen zweiten Buchstaben des Nachnamens dazunehmen, z. B. „Anna Ko.“` }), true)
      if (gaeste.length >= MAX_GAESTE) return (json(res, 429, { fehler: 'Für diese Aufgabe sind schon zu viele Gäste angemeldet.' }), true)
      const gast = nutzerAnlegen({ benutzer: `gast-${randomBytes(6).toString('hex')}`, name, rolle: 'schueler', quelle: 'gast' })
      registerVergessen()
      db().prepare('INSERT INTO feedback_gaeste (freigabe_id, nutzer_id) VALUES (?, ?)').run(f.id, gast.id)
      const neu = sitzungAnlegen(gast.id, 'schueler')
      setzeSitzungsCookie(res, neu.cookie, SITZUNG_MS.schueler, Boolean((req.socket as { encrypted?: boolean }).encrypted))
      protokolliereServer('feedback', 'Beitritt mit Namen (ohne IServ)', gast.id)
      return (json(res, 200, { ok: true, id: f.id }), true)
    }

    if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
    const ich = sitzung.nutzer
    const mitKopf = typeof req.headers['x-schulapps-token'] === 'string'
    if (req.method === 'POST' && !mitKopf) return (json(res, 403, { fehler: 'Nur aus der App.' }), true)

    // ---------- Lernende
    if (schueler) {
      if (req.method === 'GET' && url.pathname === '/s/api/aufgaben') {
        const offen = (
          db()
            .prepare(
              `SELECT * FROM feedback_freigaben WHERE status = 'offen' AND ${url.searchParams.get('mit') === 'reihe' ? "art IN ('', 'reihe')" : "art = ''"}`
            )
            .all() as unknown as Freigabe[]
        ).filter((f) => offenFuer(f, ich))
        // Abgeschlossene Aufgaben mit eigener Abgabe bleiben zum Nachlesen da (Schüler-Startseite, 02.10.2026)
        const frueher = (
          db()
            .prepare(
              "SELECT f.* FROM feedback_freigaben f JOIN feedback_abgaben a ON a.freigabe_id = f.id WHERE a.schueler_id = ? AND f.art = '' ORDER BY f.erstellt DESC"
            )
            .all(ich.id) as unknown as Freigabe[]
        ).filter((f) => !offen.some((o) => o.id === f.id) && istFuer(f, ich))
        const alle = [...offen, ...frueher]
        return (
          json(res, 200, {
            aufgaben: alle.map((f) => {
              const ab = db().prepare('SELECT fassungen FROM feedback_abgaben WHERE freigabe_id = ? AND schueler_id = ?').get(f.id, ich.id) as
                { fassungen: string } | undefined
              const fassungen = json_(ab?.fassungen ?? '[]', [] as Fassung[])
              const v = json_(f.vorlage, {} as Rueckmeldung)
              return {
                id: f.id,
                titel: f.titel,
                offen: offen.includes(f),
                aufgabe: v.grundlage?.aufgaben ?? '',
                runden: f.runden,
                genutzt: fassungen.filter((x) => x.bogen).length,
                bis: f.bis,
                fassungen: fassungen.map((x) => ({ nr: x.nr, text: x.text, zeit: x.zeit, bogen: bogenFuerLernende(x.bogen), fehler: x.fehler }))
              }
            })
          }),
          true
        )
      }
      if (req.method === 'POST' && url.pathname === '/s/api/aufgabe/einreichen') {
        const k0 = (await k.koerper()) as Record<string, unknown>
        const f = freigabe(String(k0.id ?? ''))
        if (!f || (f.art !== '' && f.art !== 'reihe') || !offenFuer(f, ich))
          return (json(res, 404, { fehler: 'Diese Aufgabe ist nicht (mehr) freigegeben.' }), true)
        const text = String(k0.text ?? '')
          .trim()
          .slice(0, 20000)
        if (text.length < 20) return (json(res, 400, { fehler: 'Bitte zuerst etwas schreiben (mindestens ein paar Sätze).' }), true)
        const zeile = db().prepare('SELECT id, fassungen FROM feedback_abgaben WHERE freigabe_id = ? AND schueler_id = ?').get(f.id, ich.id) as
          { id: string; fassungen: string } | undefined
        const fassungen = json_(zeile?.fassungen ?? '[]', [] as Fassung[])
        if (fassungen.filter((x) => x.bogen).length >= f.runden + feedbackExtra(f.id, ich.id))
          return (json(res, 409, { fehler: `Alle ${f.runden} Feedback-Runden sind genutzt. Die Arbeit ist gespeichert – deine Lehrkraft sieht sie.` }), true)
        const neu: Fassung = { nr: fassungen.length + 1, text, zeit: new Date().toISOString() }
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        const puls = setInterval(() => res.write(' '), PULS_MS)
        res.on('close', () => clearInterval(puls))
        try {
          neu.bogen = await bogenErzeugen(f, nutzerNachId(ich.id)!, text, aufruf)
        } catch (e) {
          neu.fehler = e instanceof Error ? e.message : String(e)
        } finally {
          clearInterval(puls)
        }
        const alle = [...fassungen, neu]
        if (zeile) db().prepare('UPDATE feedback_abgaben SET fassungen = ?, aktualisiert = ? WHERE id = ?').run(JSON.stringify(alle), neu.zeit, zeile.id)
        else
          db()
            .prepare('INSERT INTO feedback_abgaben (id, freigabe_id, schueler_id, fassungen, aktualisiert) VALUES (?, ?, ?, ?, ?)')
            .run(randomBytes(8).toString('hex'), f.id, ich.id, JSON.stringify(alle), neu.zeit)
        protokolliereServer('feedback', neu.bogen ? 'Feedback für eine Abgabe erzeugt' : 'Feedback fehlgeschlagen', ich.id)
        res.end(JSON.stringify({ ok: !neu.fehler, fehler: neu.fehler, bogen: bogenFuerLernende(neu.bogen), nr: neu.nr }))
        return true
      }
      return (json(res, 404, { fehler: 'Unbekannt.' }), true)
    }

    // ---------- Lehrkraft
    if (ich.rolle === 'schueler') return (json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true)
    const teile = url.pathname.split('/').filter(Boolean).slice(2)
    if (req.method === 'GET' && teile.length === 0) {
      const liste = db().prepare('SELECT * FROM feedback_freigaben WHERE lehrkraft_id = ? ORDER BY erstellt DESC').all(ich.id) as unknown as Freigabe[]
      return (
        json(res, 200, {
          freigaben: liste.map((f) => ({
            id: f.id,
            titel: f.titel,
            status: f.status,
            ...(f.art ? { art: f.art } : {}),
            runden: f.runden,
            bis: f.bis,
            lerngruppe: (f.lerngruppe_id ? lerngruppe(f.lerngruppe_id)?.name : '') ?? '',
            schueler: schuelerVon(f).length,
            ...(f.code ? { code: f.code, link: link(f.code) } : {}),
            abgaben: (db().prepare('SELECT COUNT(*) AS n FROM feedback_abgaben WHERE freigabe_id = ?').get(f.id) as { n: number }).n
          }))
        }),
        true
      )
    }
    // Mitglieder einer eigenen Lerngruppe – für die Auswahl einzelner Lernender
    if (req.method === 'GET' && teile[0] === 'mitglieder') {
      const g = lerngruppe(String(url.searchParams.get('gruppe') ?? ''))
      if (!g || g.lehrkraft_id !== ich.id) return (json(res, 404, { fehler: 'Unbekannte Lerngruppe.' }), true)
      return (json(res, 200, { mitglieder: mitgliederVon(g).map((n) => ({ benutzer: n.benutzer, name: n.name || n.benutzer })) }), true)
    }
    // Alle Schülerkonten der Schule – für „Einzelne Lernende" ohne Lerngruppe (03.10.2026)
    if (req.method === 'GET' && teile[0] === 'alle-lernenden') {
      const eigene = new Set(lerngruppenVon(ich.id).flatMap((g) => mitgliederVon(g).map((n) => n.benutzer)))
      return (
        json(res, 200, {
          lernende: alleLernenden().map((n) => ({ benutzer: n.benutzer, name: n.name || n.benutzer, klasse: klasseVon(n), eigen: eigene.has(n.benutzer) }))
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
      // Einzelne Lernende: nur Mitglieder der gewählten Lerngruppe
      const erlaubt = new Set(g ? mitgliederVon(g).map((n) => n.benutzer) : [])
      const einzelne = Array.isArray(k0.schueler) ? [...new Set((k0.schueler as unknown[]).map(String).filter((b) => erlaubt.has(b)))] : []
      const r = k0.rueckmeldung as Rueckmeldung | undefined
      if (!r?.grundlage?.aufgaben?.trim()) return (json(res, 400, { fehler: 'Die Rückmeldung braucht eine Aufgabenstellung (Schritt „Einrichten“).' }), true)
      // Nur die Vorlage – keine vorhandenen Abgaben (fremde Schülerdaten)
      const vorlage: Rueckmeldung = { ...r, abgaben: [] }
      const id = randomBytes(8).toString('hex')
      db()
        .prepare(
          'INSERT INTO feedback_freigaben (id, lehrkraft_id, lerngruppe_id, titel, vorlage, runden, bis, status, erstellt, schueler, code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .run(
          id,
          ich.id,
          g?.id ?? '',
          String(k0.titel ?? r.meta?.title ?? r.grundlage.titel ?? 'Aufgabe').slice(0, 160),
          JSON.stringify(vorlage),
          Math.max(1, Math.min(10, Math.round(Number(k0.runden) || 2))),
          typeof k0.bis === 'number' ? k0.bis : null,
          'offen',
          new Date().toISOString(),
          JSON.stringify(einzelne),
          mitGaesten ? neuerCode() : null
        )
      const neu = freigabe(id)!
      return (json(res, 200, { id, ...(neu.code ? { code: neu.code, link: link(neu.code) } : {}) }), true)
    }
    const f = teile[0] ? freigabe(teile[0]) : null
    if (!f || f.lehrkraft_id !== ich.id) return (json(res, 404, { fehler: 'Unbekannt.' }), true)
    if (req.method === 'GET' && teile.length === 1) {
      const namen = new Map(alleNutzer().map((n) => [n.id, n]))
      const abgaben = (
        db().prepare('SELECT * FROM feedback_abgaben WHERE freigabe_id = ? ORDER BY aktualisiert DESC').all(f.id) as unknown as {
          schueler_id: string
          fassungen: string
          aktualisiert: string
        }[]
      ).map((a) => ({
        name: namen.get(a.schueler_id)?.name ?? '',
        benutzer: namen.get(a.schueler_id)?.benutzer ?? '',
        aktualisiert: a.aktualisiert,
        fassungen: json_(a.fassungen, [] as Fassung[])
      }))
      return (json(res, 200, { id: f.id, titel: f.titel, status: f.status, runden: f.runden, bis: f.bis, abgaben }), true)
    }
    if (req.method === 'POST' && teile[1] === 'status') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      db()
        .prepare('UPDATE feedback_freigaben SET status = ? WHERE id = ?')
        .run(k0.status === 'beendet' ? 'beendet' : 'offen', f.id)
      return (json(res, 200, { ok: true }), true)
    }
    if (req.method === 'POST' && teile[1] === 'loeschen') {
      db().prepare('DELETE FROM feedback_freigaben WHERE id = ?').run(f.id)
      return (json(res, 200, { ok: true }), true)
    }
    return (json(res, 404, { fehler: 'Unbekannt.' }), true)
  }
}

/** Stand einer Person in einer Rückmeldungs-Freigabe (für die Unterrichtsreihe) */
export function feedbackStand(freigabeId: string, schuelerId: string): { eingereicht: number; runden: number; kriterien?: string[] } | null {
  const f = freigabe(freigabeId)
  if (!f) return null
  const zeile = db().prepare('SELECT fassungen FROM feedback_abgaben WHERE freigabe_id = ? AND schueler_id = ?').get(f.id, schuelerId) as
    { fassungen: string } | undefined
  const fassungen = json_(zeile?.fassungen ?? '[]', [] as Fassung[])
  const mitBogen = fassungen.filter((x) => x.bogen)
  const letzte = mitBogen[mitBogen.length - 1]
  return {
    eingereicht: mitBogen.length,
    runden: f.runden + feedbackExtra(f.id, schuelerId),
    ...(letzte?.bogen ? { kriterien: letzte.bogen.kriterien.map((k) => k.einschaetzung) } : {})
  }
}

const feedbackExtra = (fid: string, sid: string): number =>
  (db().prepare('SELECT extra FROM feedback_abgaben WHERE freigabe_id = ? AND schueler_id = ?').get(fid, sid) as { extra: number } | undefined)?.extra ?? 0

/** „Zur Überarbeitung" (Unterrichtsreihe): eine zusätzliche Feedback-Runde erlauben */
export function feedbackZusatzrunde(fid: string, sid: string): void {
  db().prepare('UPDATE feedback_abgaben SET extra = extra + 1 WHERE freigabe_id = ? AND schueler_id = ?').run(fid, sid)
}
