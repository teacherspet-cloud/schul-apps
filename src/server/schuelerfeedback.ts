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
 *  - Abos (ChatGPT/Claude) dürfen dafür NICHT laufen: Die Anfragen stellen Lernende – das wäre
 *    ein geteiltes Konto. Es braucht einen API-Schlüssel (eigener oder von der Verwaltung freigegeben).
 *  - An die Lernenden geht der Bogen OHNE Einstufung/Notenvorschlag und ohne Hinweise für die
 *    Lehrkraft; die Lehrkraft sieht alle Fassungen und holt sie in ihre Rückmeldung.
 */
import { randomBytes } from 'node:crypto'
import { getSettings } from '../main/services/storage/settings'
import { bogenAnfrage, bogenAus, ohneNamen } from '../renderer/src/modules/rueckmeldung/generation'
import { bogenKontextAus, rueckmeldungSystem } from '../renderer/src/modules/rueckmeldung/system'
import type { Abgabe, Bogen, Rueckmeldung } from '../renderer/src/modules/rueckmeldung/model/types'
import { alleNutzer, datenbank, nutzerNachId, protokolliereServer, type NutzerInfo } from './datenbank'
import { imNutzer } from './kontext'
import { alsNutzer, json, type Anfrage, type Aufruf } from './http'
import { gehoertZu, lerngruppe } from './onlinetest'
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
    ...(b.ueberarbeitung ? { ueberarbeitung: b.ueberarbeitung } : {})
  }
}

const freigabe = (id: string): Freigabe | null => (db().prepare('SELECT * FROM feedback_freigaben WHERE id = ?').get(id) as Freigabe | undefined) ?? null

function offenFuer(f: Freigabe, ich: NutzerInfo): boolean {
  const g = lerngruppe(f.lerngruppe_id)
  return f.status === 'offen' && (!f.bis || Date.now() < f.bis) && Boolean(g && gehoertZu(g, ich))
}

/** Bogen erzeugen – im Namen der Lehrkraft, nur mit API-Schlüssel */
async function bogenErzeugen(f: Freigabe, schueler: NutzerInfo, text: string, aufruf: Aufruf): Promise<Bogen> {
  const lehrkraft = nutzerNachId(f.lehrkraft_id)
  if (!lehrkraft) throw new Error('Die Lehrkraft gibt es nicht mehr.')
  const r = json_(f.vorlage, {} as Rueckmeldung)
  return imNutzer(alsNutzer(lehrkraft), async () => {
    const settings = getSettings()
    const anbieter = settings.ai.textProvider
    if (settings.ai.access[anbieter] === 'subscription')
      throw new Error('Für Feedback an Lernende braucht die Lehrkraft einen API-Schlüssel (eigener oder von der Verwaltung freigegeben) – ein persönliches Abo darf nicht für andere laufen.')
    const a: Abgabe = { id: 'a', kuerzel: 'S1', name: schueler.name, dateiname: '', text, bilder: [] }
    const { text: ohne } = ohneNamen(a)
    const anonym = { ...a, text: ohne }
    const ctx = bogenKontextAus(settings, r)
    const antwort = await aufruf('ai:structured', [bogenAnfrage(r, anonym, rueckmeldungSystem(r), ctx)])
    return bogenAus(antwort, r, anonym, ctx)
  })
}

export function feedbackRoute(aufruf: Aufruf): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { url, req, res, sitzung } = k
    const schueler = url.pathname.startsWith('/s/api/aufgaben') || url.pathname.startsWith('/s/api/aufgabe/')
    const lehrer = url.pathname.startsWith('/server/feedback')
    if (!schueler && !lehrer) return false
    if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
    const ich = sitzung.nutzer
    const mitKopf = typeof req.headers['x-schulapps-token'] === 'string'
    if (req.method === 'POST' && !mitKopf) return (json(res, 403, { fehler: 'Nur aus der App.' }), true)

    // ---------- Lernende
    if (schueler) {
      if (req.method === 'GET' && url.pathname === '/s/api/aufgaben') {
        const alle = (db().prepare("SELECT * FROM feedback_freigaben WHERE status = 'offen'").all() as unknown as Freigabe[]).filter((f) => offenFuer(f, ich))
        return (
          json(res, 200, {
            aufgaben: alle.map((f) => {
              const ab = db().prepare('SELECT fassungen FROM feedback_abgaben WHERE freigabe_id = ? AND schueler_id = ?').get(f.id, ich.id) as { fassungen: string } | undefined
              const fassungen = json_(ab?.fassungen ?? '[]', [] as Fassung[])
              const v = json_(f.vorlage, {} as Rueckmeldung)
              return {
                id: f.id,
                titel: f.titel,
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
        if (!f || !offenFuer(f, ich)) return (json(res, 404, { fehler: 'Diese Aufgabe ist nicht (mehr) freigegeben.' }), true)
        const text = String(k0.text ?? '').trim().slice(0, 20000)
        if (text.length < 20) return (json(res, 400, { fehler: 'Bitte zuerst etwas schreiben (mindestens ein paar Sätze).' }), true)
        const zeile = db().prepare('SELECT id, fassungen FROM feedback_abgaben WHERE freigabe_id = ? AND schueler_id = ?').get(f.id, ich.id) as { id: string; fassungen: string } | undefined
        const fassungen = json_(zeile?.fassungen ?? '[]', [] as Fassung[])
        if (fassungen.filter((x) => x.bogen).length >= f.runden) return (json(res, 409, { fehler: `Alle ${f.runden} Feedback-Runden sind genutzt. Die Arbeit ist gespeichert – deine Lehrkraft sieht sie.` }), true)
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
        else db().prepare('INSERT INTO feedback_abgaben (id, freigabe_id, schueler_id, fassungen, aktualisiert) VALUES (?, ?, ?, ?, ?)').run(randomBytes(8).toString('hex'), f.id, ich.id, JSON.stringify(alle), neu.zeit)
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
            runden: f.runden,
            bis: f.bis,
            lerngruppe: lerngruppe(f.lerngruppe_id)?.name ?? '',
            abgaben: (db().prepare('SELECT COUNT(*) AS n FROM feedback_abgaben WHERE freigabe_id = ?').get(f.id) as { n: number }).n
          }))
        }),
        true
      )
    }
    if (req.method === 'POST' && teile[0] === 'freigeben') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      const g = lerngruppe(String(k0.lerngruppeId ?? ''))
      if (!g || g.lehrkraft_id !== ich.id) return (json(res, 400, { fehler: 'Bitte eine eigene Lerngruppe wählen.' }), true)
      const r = k0.rueckmeldung as Rueckmeldung | undefined
      if (!r?.grundlage?.aufgaben?.trim()) return (json(res, 400, { fehler: 'Die Rückmeldung braucht eine Aufgabenstellung (Schritt „Einrichten“).' }), true)
      // Nur die Vorlage – keine vorhandenen Abgaben (fremde Schülerdaten)
      const vorlage: Rueckmeldung = { ...r, abgaben: [] }
      const id = randomBytes(8).toString('hex')
      db()
        .prepare('INSERT INTO feedback_freigaben (id, lehrkraft_id, lerngruppe_id, titel, vorlage, runden, bis, status, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(
          id,
          ich.id,
          g.id,
          String(k0.titel ?? r.meta?.title ?? r.grundlage.titel ?? 'Aufgabe').slice(0, 160),
          JSON.stringify(vorlage),
          Math.max(1, Math.min(10, Math.round(Number(k0.runden) || 2))),
          typeof k0.bis === 'number' ? k0.bis : null,
          'offen',
          new Date().toISOString()
        )
      return (json(res, 200, { id }), true)
    }
    const f = teile[0] ? freigabe(teile[0]) : null
    if (!f || f.lehrkraft_id !== ich.id) return (json(res, 404, { fehler: 'Unbekannt.' }), true)
    if (req.method === 'GET' && teile.length === 1) {
      const namen = new Map(alleNutzer().map((n) => [n.id, n]))
      const abgaben = (db().prepare('SELECT * FROM feedback_abgaben WHERE freigabe_id = ? ORDER BY aktualisiert DESC').all(f.id) as unknown as { schueler_id: string; fassungen: string; aktualisiert: string }[]).map(
        (a) => ({ name: namen.get(a.schueler_id)?.name ?? '', benutzer: namen.get(a.schueler_id)?.benutzer ?? '', aktualisiert: a.aktualisiert, fassungen: json_(a.fassungen, [] as Fassung[]) })
      )
      return (json(res, 200, { id: f.id, titel: f.titel, status: f.status, runden: f.runden, bis: f.bis, abgaben }), true)
    }
    if (req.method === 'POST' && teile[1] === 'status') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      db().prepare('UPDATE feedback_freigaben SET status = ? WHERE id = ?').run(k0.status === 'beendet' ? 'beendet' : 'offen', f.id)
      return (json(res, 200, { ok: true }), true)
    }
    if (req.method === 'POST' && teile[1] === 'loeschen') {
      db().prepare('DELETE FROM feedback_freigaben WHERE id = ?').run(f.id)
      return (json(res, 200, { ok: true }), true)
    }
    return (json(res, 404, { fehler: 'Unbekannt.' }), true)
  }
}
