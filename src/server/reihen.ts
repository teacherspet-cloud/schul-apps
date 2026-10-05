/**
 * Unterrichtsreihen (Etappe 6 des Schülerbereichs, 02.10.2026) – Regeln in shared/reihe.ts.
 *
 *  - Lehrkraft baut eine Reihe (Vorlage) und weist sie Lerngruppen bzw. einzelnen Lernenden zu.
 *    Beim Zuweisen (und wenn später Schritte dazukommen) entstehen die verknüpften Aufgaben:
 *    Arbeitsblatt-Freigabe, Rückmeldungs-Freigabe, Onlinetest im eigenen Tempo, KI-Bogen für
 *    Zwischenaufgaben. Sie stehen NICHT in den gewöhnlichen Listen, nur in der Reihe.
 *  - Der Stand je Person (Antworten, Ampel, Uploads …) liegt verschlüsselt (feldschutz.ts).
 *  - Lernende sehen nie Lösungen, Erwartungen oder die richtigen Antworten der Diagnose.
 *
 *  Lehrkraft: /server/reihen …   Lernende: /s/api/reihen, /s/api/reihe …
 *  Gäste (05.10.2026): GET /s/api/reihe/zugang?code= · POST /s/api/reihe/gast (Seite /s/rq/<CODE>) – ein Gast
 *  bekommt Zugang zur Reihe UND zu allen verknüpften Blättern, Aufgaben und Vokabeln (auch später ergänzten).
 */
import { randomBytes } from 'node:crypto'
import { alleNutzer, datenbank, nutzerAnlegen, nutzerNachId, protokolliereServer, sitzungAnlegen, SITZUNG_MS, type NutzerInfo } from './datenbank'
import { json, setzeSitzungsCookie, type Anfrage, type Aufruf } from './http'
import { alleLernenden, gastName, gehoertZu, lerngruppe, mitgliederVon, onlinetestStand, reihenTestAnlegen, reihenTestCode } from './onlinetest'
import { iservBereit } from './anmeldung'
import { registerVergessen } from './namensschutz'
import { gastEntfernen } from './gaeste'
import { blattFassung, feedbackStand, feedbackZusatzrunde, verknuepfteFreigabeAnlegen, verknuepfteFreigabeStatus } from './schuelerfeedback'
import { blattStand, blattZusatzrunde, reihenBlattAnlegen } from './arbeitsblaetter'
import { vokabelnZuweisen, vokabelStand } from './vokabeln'
import { PULS_MS } from '../main/services/lanServer'
import type { Rueckmeldung } from '../renderer/src/modules/rueckmeldung/model/types'
import type { TestDocument } from '../renderer/src/modules/vokabeltest/model/types'
import {
  berechneWeg,
  diagnoseProzent,
  inhaltFuerLernende,
  type Extern,
  type Reihe,
  type Schritt,
  type SchrittStand,
  type Stand,
  type Weg,
  alleLernziele,
  ampelAbweichungen,
  niveauEmpfehlung
} from '../shared/reihe'
import type { BlattAufgabe } from '../shared/blattFreigabe'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS reihen (
  id TEXT PRIMARY KEY,
  lehrkraft_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  titel TEXT NOT NULL,
  daten TEXT NOT NULL,
  erstellt TEXT NOT NULL,
  geaendert TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reihen_zuweisungen (
  id TEXT PRIMARY KEY,
  reihe_id TEXT NOT NULL REFERENCES reihen(id) ON DELETE CASCADE,
  lehrkraft_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  lerngruppe_id TEXT NOT NULL,
  schueler TEXT NOT NULL DEFAULT '[]',
  halte_frei TEXT NOT NULL DEFAULT '[]',
  verknuepft TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'offen',
  erstellt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reihen_stand (
  zuweisung_id TEXT NOT NULL REFERENCES reihen_zuweisungen(id) ON DELETE CASCADE,
  schueler_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  daten TEXT NOT NULL,
  aktualisiert INTEGER NOT NULL,
  PRIMARY KEY (zuweisung_id, schueler_id)
);
CREATE TABLE IF NOT EXISTS reihen_dateien (
  id TEXT PRIMARY KEY,
  zuweisung_id TEXT NOT NULL REFERENCES reihen_zuweisungen(id) ON DELETE CASCADE,
  schueler_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  schritt_id TEXT NOT NULL,
  name TEXT NOT NULL,
  typ TEXT NOT NULL,
  daten BLOB NOT NULL,
  erstellt INTEGER NOT NULL
);`

let bereit = false
const db = () => {
  const d = datenbank()
  if (!bereit) {
    d.exec(SCHEMA)
    // Gäste per QR-Code (05.10.2026)
    try {
      d.exec('ALTER TABLE reihen_zuweisungen ADD COLUMN code TEXT')
    } catch {
      /* schon da */
    }
    d.exec(
      'CREATE TABLE IF NOT EXISTS reihe_gaeste (zuweisung_id TEXT NOT NULL REFERENCES reihen_zuweisungen(id) ON DELETE CASCADE, nutzer_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE, PRIMARY KEY (zuweisung_id, nutzer_id))'
    )
    bereit = true
  }
  return d
}

const CODE_ZEICHEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function neuerCode(): string {
  for (;;) {
    const c = Array.from(randomBytes(6), (b) => CODE_ZEICHEN[b % CODE_ZEICHEN.length]).join('')
    // Ein Code für alles (Blätter, Tests, Aufgaben …): Die Code-Eingabe probiert die Arten nacheinander
    if (!db().prepare('SELECT 1 FROM reihen_zuweisungen WHERE code = ?').get(c)) return c
  }
}
const nachCode = (code: string): ZuweisungZeile | null =>
  /^[A-Z0-9]{4,12}$/.test(code) ? ((db().prepare('SELECT * FROM reihen_zuweisungen WHERE code = ?').get(code) as ZuweisungZeile | undefined) ?? null) : null

/**
 * Gäste einer Zuweisung in alle verknüpften Freigaben eintragen (Blätter, Aufgaben/Rückmeldungen, Vokabeln) –
 * nach dem Beitritt und wenn neue Schritte verknüpft werden. Onlinetests laufen über ihren eigenen Code.
 */
function gaesteNachziehen(z: ZuweisungZeile, r: Reihe, nur?: string): void {
  const gaeste = nur
    ? [nur]
    : (db().prepare('SELECT nutzer_id FROM reihe_gaeste WHERE zuweisung_id = ?').all(z.id) as { nutzer_id: string }[]).map((g) => g.nutzer_id)
  if (!gaeste.length) return
  const v = json_(z.verknuepft, {} as Record<string, string>)
  const art = new Map(r.schritte.map((s) => [s.id, s.inhalt.art]))
  for (const [schluessel, ziel] of Object.entries(v)) {
    if (!ziel || ziel === '*') continue
    const a = art.get(schluessel.split(':')[0])
    const tabelle =
      a === 'arbeitsblatt'
        ? 'INSERT OR IGNORE INTO blatt_gaeste (freigabe_id, nutzer_id) VALUES (?, ?)'
        : a === 'rueckmeldung' || a === 'aufgabe'
          ? 'INSERT OR IGNORE INTO feedback_gaeste (freigabe_id, nutzer_id) VALUES (?, ?)'
          : a === 'vokabeln'
            ? "INSERT OR IGNORE INTO vok_gaeste (zuweisung_id, nutzer_id, wieder) VALUES (?, ?, '')"
            : null
    if (!tabelle) continue
    for (const g of gaeste)
      try {
        db().prepare(tabelle).run(ziel, g)
      } catch {
        /* Freigabe inzwischen gelöscht */
      }
  }
}

const json_ = <T>(s: string | null | undefined, r: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : r
  } catch {
    return r
  }
}
const neueId = (): string => randomBytes(8).toString('hex')

interface ZuweisungZeile {
  id: string
  reihe_id: string
  lehrkraft_id: string
  lerngruppe_id: string
  schueler: string
  halte_frei: string
  verknuepft: string
  status: 'offen' | 'beendet'
  erstellt: string
  /** QR-Code für Gäste (05.10.2026) */
  code?: string | null
}

/**
 * Reihe aus der Datenbank. Platzhalter der KI-Planung (05.10.2026) sind noch leer – für Lernende,
 * Fortschritt und Auswertung gibt es sie nicht; nur der Editor (`roh`) sieht sie.
 */
const reiheVon = (id: string, roh = false): (Reihe & { lehrkraftId: string }) | null => {
  const z = db().prepare('SELECT * FROM reihen WHERE id = ?').get(id) as { daten: string; lehrkraft_id: string } | undefined
  if (!z) return null
  const r = { ...json_(z.daten, {} as Reihe), id, lehrkraftId: z.lehrkraft_id }
  return roh ? r : { ...r, schritte: (r.schritte ?? []).filter((s) => !s.platzhalter) }
}
const zuweisung = (id: string): ZuweisungZeile | null =>
  (db().prepare('SELECT * FROM reihen_zuweisungen WHERE id = ?').get(id) as ZuweisungZeile | undefined) ?? null

/** Gehört die Zuweisung dieser Person? (Lerngruppe, ggf. nur Ausgewählte, oder per Code beigetreten) */
function istFuer(z: ZuweisungZeile, ich: NutzerInfo): boolean {
  if (db().prepare('SELECT 1 FROM reihe_gaeste WHERE zuweisung_id = ? AND nutzer_id = ?').get(z.id, ich.id)) return true
  if (ich.quelle === 'gast') return false
  // Einzelnen Lernenden zugewiesen, ohne Lerngruppe (03.10.2026)
  if (!z.lerngruppe_id) return ich.rolle === 'schueler' && json_(z.schueler, [] as string[]).includes(ich.benutzer)
  const g = lerngruppe(z.lerngruppe_id)
  if (!g || !gehoertZu(g, ich)) return false
  const nur = json_(z.schueler, [] as string[])
  return !nur.length || nur.includes(ich.benutzer)
}

function lernendeVon(z: ZuweisungZeile): NutzerInfo[] {
  // Per QR-Code beigetreten (Gäste und Konten, 05.10.2026)
  const perCode = new Set(
    (db().prepare('SELECT nutzer_id FROM reihe_gaeste WHERE zuweisung_id = ?').all(z.id) as { nutzer_id: string }[]).map((x) => x.nutzer_id)
  )
  const dazu = (liste: NutzerInfo[]): NutzerInfo[] => {
    const da = new Set(liste.map((n) => n.id))
    return [...liste, ...alleNutzer().filter((n) => perCode.has(n.id) && !da.has(n.id))]
  }
  if (!z.lerngruppe_id) {
    const nur = new Set(json_(z.schueler, [] as string[]))
    return dazu(alleNutzer().filter((n) => n.rolle === 'schueler' && n.quelle !== 'gast' && nur.has(n.benutzer)))
  }
  const g = lerngruppe(z.lerngruppe_id)
  if (!g) return dazu([])
  const nur = json_(z.schueler, [] as string[])
  return dazu(mitgliederVon(g).filter((n) => !nur.length || nur.includes(n.benutzer)))
}

const standVon = (zid: string, sid: string): Stand => {
  const z = db().prepare('SELECT daten FROM reihen_stand WHERE zuweisung_id = ? AND schueler_id = ?').get(zid, sid) as { daten: string } | undefined
  return json_(z?.daten, { schritte: {} } as Stand)
}
function standSpeichern(zid: string, sid: string, s: Stand): void {
  db()
    .prepare(
      'INSERT INTO reihen_stand (zuweisung_id, schueler_id, daten, aktualisiert) VALUES (?, ?, ?, ?) ON CONFLICT (zuweisung_id, schueler_id) DO UPDATE SET daten = excluded.daten, aktualisiert = excluded.aktualisiert'
    )
    .run(zid, sid, JSON.stringify(s), Date.now())
}

/** Rückmeldungs-Vorlage für eine Zwischenaufgabe (KI-Bogen) */
function aufgabenVorlage(r: Reihe, s: Schritt): Rueckmeldung | null {
  if (s.inhalt.art !== 'aufgabe') return null
  const i = s.inhalt
  return {
    version: 1,
    meta: {
      title: s.titel,
      subjectId: r.fachId,
      subjectLabel: r.fachLabel,
      grade: r.grade,
      stateId: r.stateId,
      schoolTypeId: r.schoolTypeId,
      schoolTypeName: '',
      anrede: 'du',
      schwerpunkt: ''
    },
    grundlage: {
      art: 'frei',
      titel: s.titel,
      aufgaben: [
        i.anweisung,
        i.material ? `Material:\n${i.material}` : '',
        i.fragen.length ? `Fragen:\n${i.fragen.map((f, k) => `${k + 1}. ${f}`).join('\n')}` : ''
      ]
        .filter(Boolean)
        .join('\n\n'),
      erwartung: [i.erwartung, s.lernziele.length ? `Lernziele: ${s.lernziele.map((l) => l.text).join('; ')}` : ''].filter(Boolean).join('\n')
    },
    abgaben: [],
    createdAt: new Date().toISOString()
  } as unknown as Rueckmeldung
}

/** Fehlende verknüpfte Aufgaben einer Zuweisung anlegen (beim Zuweisen und nach dem Ergänzen von Schritten) */
function verknuepfe(z: ZuweisungZeile, r: Reihe): void {
  const v = json_(z.verknuepft, {} as Record<string, string>)
  const schueler = json_(z.schueler, [] as string[])
  let neu = false
  for (const s of r.schritte) {
    if (v[s.id]) continue
    const i = s.inhalt
    try {
      if (i.art === 'arbeitsblatt' && (i.varianten?.length ?? 0) > 1) {
        // Niveaustufen: je Stufe ein eigenes Blatt; die Lernenden wählen (03.10.2026)
        i.varianten!.forEach((va, k) => {
          v[`${s.id}:${k}`] = reihenBlattAnlegen({
            lehrkraftId: z.lehrkraft_id,
            lerngruppeId: z.lerngruppe_id,
            schueler,
            titel: `${s.titel || i.titel} (${va.label})`,
            html: va.html,
            aufgaben: va.aufgaben as BlattAufgabe[],
            vorlage: va.vorlage as Rueckmeldung,
            runden: i.runden,
            stift: i.stift,
            reiheId: r.id,
            fach: r.fachLabel,
            thema: r.oberthema,
            merk: va.merk ?? [],
            loesung: va.loesung,
            schrittweise: i.schrittweise,
            merkAmEnde: i.merkAmEnde
          })
        })
        v[s.id] = '*'
      } else if (i.art === 'arbeitsblatt' && i.html)
        v[s.id] = reihenBlattAnlegen({
          lehrkraftId: z.lehrkraft_id,
          lerngruppeId: z.lerngruppe_id,
          schueler,
          titel: s.titel || i.titel,
          html: i.html,
          aufgaben: i.aufgaben as BlattAufgabe[],
          vorlage: i.vorlage as Rueckmeldung,
          runden: i.runden,
          stift: i.stift,
          reiheId: r.id,
          fach: r.fachLabel,
          thema: r.oberthema,
          merk: i.merk ?? [],
          loesung: i.loesung,
          schrittweise: i.schrittweise,
          merkAmEnde: i.merkAmEnde
        })
      else if (i.art === 'rueckmeldung' && i.vorlage)
        v[s.id] = verknuepfteFreigabeAnlegen({
          lehrkraftId: z.lehrkraft_id,
          lerngruppeId: z.lerngruppe_id,
          schueler,
          titel: s.titel,
          vorlage: i.vorlage as Rueckmeldung,
          runden: i.runden,
          art: 'reihe'
        })
      else if (i.art === 'onlinetest' && i.test)
        v[s.id] = reihenTestAnlegen(z.lehrkraft_id, { titel: s.titel, test: i.test as TestDocument, lerngruppeId: z.lerngruppe_id, zeitMin: i.zeitMin })
      else if (i.art === 'vokabeln' && i.woerter.length)
        v[s.id] = vokabelnZuweisen({
          lehrkraftId: z.lehrkraft_id,
          lerngruppeId: z.lerngruppe_id,
          schueler,
          titel: s.titel || i.titel,
          sprache: i.sprache,
          fach: i.fach,
          woerter: i.woerter,
          reihe: r.id
        })
      else if (i.art === 'aufgabe' && i.feedback)
        v[s.id] = verknuepfteFreigabeAnlegen({
          lehrkraftId: z.lehrkraft_id,
          lerngruppeId: z.lerngruppe_id,
          schueler,
          titel: s.titel,
          vorlage: aufgabenVorlage(r, s)!,
          runden: 3,
          art: 'reihe-aufgabe'
        })
      else continue
      neu = true
    } catch (e) {
      protokolliereServer('reihe', `Schritt „${s.titel}" nicht verknüpft: ${e instanceof Error ? e.message : String(e)}`, z.lehrkraft_id)
    }
  }
  if (neu) {
    db().prepare('UPDATE reihen_zuweisungen SET verknuepft = ? WHERE id = ?').run(JSON.stringify(v), z.id)
    z.verknuepft = JSON.stringify(v)
    gaesteNachziehen(z, r)
  }
}

/** Kennung der verknüpften Aufgabe – bei Niveaustufen die der gewählten Stufe */
function verknuepfteId(s: Schritt, z: ZuweisungZeile, stand: Stand): string | undefined {
  const v = json_(z.verknuepft, {} as Record<string, string>)
  if (v[s.id] !== '*') return v[s.id]
  const n = stand.schritte[s.id]?.niveau
  return n === undefined ? undefined : v[`${s.id}:${n}`]
}

/** Stand der verknüpften Aufgaben einer Person */
function externVon(r: Reihe, z: ZuweisungZeile, sid: string, stand = standVon(z.id, sid)): Record<string, Extern> {
  const aus: Record<string, Extern> = {}
  for (const s of r.schritte) {
    const id = verknuepfteId(s, z, stand)
    if (!id) continue
    const e =
      s.inhalt.art === 'arbeitsblatt'
        ? blattStand(id, sid)
        : s.inhalt.art === 'rueckmeldung'
          ? feedbackStand(id, sid)
          : s.inhalt.art === 'onlinetest'
            ? onlinetestStand(id, sid)
            : s.inhalt.art === 'vokabeln'
              ? vokabelStand(id, sid)
              : null
    if (e) aus[s.id] = e
  }
  return aus
}

function wegVon(r: Reihe, z: ZuweisungZeile, sid: string, stand = standVon(z.id, sid)): Weg {
  return berechneWeg(r, stand, externVon(r, z, sid, stand), json_(z.halte_frei, [] as string[]))
}

/** Link zu einer verknüpften Aufgabe (für die Lernenden) */
function linkFuer(s: Schritt, z: ZuweisungZeile, stand: Stand): string | undefined {
  const id = verknuepfteId(s, z, stand)
  if (!id) return undefined
  if (s.inhalt.art === 'arbeitsblatt') return `/s/b/${id}`
  if (s.inhalt.art === 'rueckmeldung') return `/s/a/${id}`
  if (s.inhalt.art === 'vokabeln') return `/s/v/${id}`
  if (s.inhalt.art === 'onlinetest') {
    const code = reihenTestCode(id)
    return code ? `/s/t/${code}` : undefined
  }
  return undefined
}

/** Stand für die Ansicht ohne große Daten */
const standKurz = (s: Stand): Stand => ({ ...s, schritte: Object.fromEntries(Object.entries(s.schritte).map(([k, v]) => [k, { ...v }])) })

const MAX_DATEI = 12 * 1024 * 1024

export function reihenRoute(aufruf: Aufruf, adresse = ''): (k: Anfrage) => Promise<boolean> {
  const reiheLink = (code: string): string => `${adresse.replace(/\/$/, '')}/s/rq/${code}`
  return async (k) => {
    const { url, req, res, sitzung } = k
    const schueler = url.pathname === '/s/api/reihen' || url.pathname === '/s/api/reihe' || url.pathname.startsWith('/s/api/reihe/')
    const lehrer = url.pathname === '/server/reihen' || url.pathname.startsWith('/server/reihen/')
    if (!schueler && !lehrer) return false
    const mitKopf = typeof req.headers['x-schulapps-token'] === 'string'

    // ---------- Gäste per Code (vor der Anmeldeprüfung, 05.10.2026)
    if (req.method === 'GET' && url.pathname === '/s/api/reihe/zugang') {
      const z = nachCode(String(url.searchParams.get('code') ?? '').toUpperCase())
      const r = z && z.status === 'offen' ? reiheVon(z.reihe_id) : null
      if (!z || !r) return (json(res, 404, { fehler: 'Diese Unterrichtsreihe gibt es nicht (mehr). Bitte den Code prüfen.' }), true)
      return (json(res, 200, { id: z.id, titel: r.titel, gaeste: !iservBereit(), dabei: Boolean(sitzung && istFuer(z, sitzung.nutzer)) }), true)
    }
    if (req.method === 'POST' && url.pathname === '/s/api/reihe/gast') {
      if (!mitKopf) return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
      const k0 = (await k.koerper()) as Record<string, unknown>
      const z = nachCode(String(k0.code ?? '').toUpperCase())
      const r = z && z.status === 'offen' ? reiheVon(z.reihe_id) : null
      if (!z || !r) return (json(res, 404, { fehler: 'Diese Unterrichtsreihe gibt es nicht (mehr). Bitte den Code prüfen.' }), true)
      if (sitzung && istFuer(z, sitzung.nutzer)) return (json(res, 200, { ok: true, id: z.id }), true)
      if (sitzung && sitzung.nutzer.quelle !== 'gast' && sitzung.nutzer.rolle === 'schueler') {
        db().prepare('INSERT OR IGNORE INTO reihe_gaeste (zuweisung_id, nutzer_id) VALUES (?, ?)').run(z.id, sitzung.nutzer.id)
        gaesteNachziehen(z, r, sitzung.nutzer.id)
        return (json(res, 200, { ok: true, id: z.id }), true)
      }
      if (iservBereit()) return (json(res, 403, { fehler: 'Bitte mit IServ anmelden.' }), true)
      const name = gastName(k0.name)
      if (!name) return (json(res, 400, { fehler: 'Bitte Vorname und Anfangsbuchstaben des Nachnamens eingeben, z. B. „Anna K.“' }), true)
      const gaeste = db().prepare('SELECT nutzer_id FROM reihe_gaeste WHERE zuweisung_id = ?').all(z.id) as { nutzer_id: string }[]
      const namen = new Map(alleNutzer().map((n) => [n.id, n.name.toLowerCase()]))
      if (gaeste.some((x) => namen.get(x.nutzer_id) === name.toLowerCase()))
        return (json(res, 409, { fehler: `„${name}“ ist schon dabei. Bitte einen zweiten Buchstaben des Nachnamens dazunehmen, z. B. „Anna Ko.“` }), true)
      if (gaeste.length >= 80) return (json(res, 429, { fehler: 'Für diese Reihe sind schon zu viele Gäste angemeldet.' }), true)
      const gast = nutzerAnlegen({ benutzer: `gast-${randomBytes(6).toString('hex')}`, name, rolle: 'schueler', quelle: 'gast' })
      registerVergessen()
      db().prepare('INSERT INTO reihe_gaeste (zuweisung_id, nutzer_id) VALUES (?, ?)').run(z.id, gast.id)
      gaesteNachziehen(z, r, gast.id)
      const neu = sitzungAnlegen(gast.id, 'schueler')
      setzeSitzungsCookie(res, neu.cookie, SITZUNG_MS.schueler, Boolean((req.socket as { encrypted?: boolean }).encrypted))
      protokolliereServer('reihe', 'Beitritt mit Namen (ohne IServ)', gast.id)
      return (json(res, 200, { ok: true, id: z.id }), true)
    }

    if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
    const ich = sitzung.nutzer
    if (req.method === 'POST' && !mitKopf) return (json(res, 403, { fehler: 'Nur aus der App.' }), true)

    // ---------------------------------------------------------------- Lernende
    if (schueler) {
      if (req.method === 'GET' && url.pathname === '/s/api/reihen') {
        const alle = (
          db().prepare("SELECT * FROM reihen_zuweisungen WHERE status = 'offen' ORDER BY erstellt DESC").all() as unknown as ZuweisungZeile[]
        ).filter((z) => istFuer(z, ich))
        const reihen = alle.flatMap((z) => {
          const r = reiheVon(z.reihe_id)
          if (!r) return []
          const w = wegVon(r, z, ich.id)
          return [{ id: z.id, titel: r.titel, oberthema: r.oberthema, fach: r.fachLabel, fortschritt: w.fortschritt, abzeichen: w.abzeichen, fertig: w.fertig }]
        })
        return (json(res, 200, { reihen }), true)
      }
      const zid = req.method === 'GET' ? String(url.searchParams.get('id') ?? '') : String(((await k.koerper()) as Record<string, unknown>).id ?? '')
      const z = zuweisung(zid)
      if (!z || !istFuer(z, ich)) return (json(res, 404, { fehler: 'Diese Unterrichtsreihe ist nicht für dich freigegeben.' }), true)
      const r = reiheVon(z.reihe_id)
      if (!r) return (json(res, 404, { fehler: 'Die Reihe gibt es nicht mehr.' }), true)
      verknuepfe(z, r)
      const stand = standVon(z.id, ich.id)

      if (req.method === 'GET' && url.pathname === '/s/api/reihe') {
        const weg = wegVon(r, z, ich.id, stand)
        const lage = new Map(weg.schritte.map((l) => [l.id, l]))
        const sichtbar = (s: Schritt): boolean =>
          lage.get(s.id)?.status !== 'gesperrt' && (!s.nach || ['geschafft', 'uebersprungen'].includes(lage.get(s.nach)?.status ?? ''))
        return (
          json(res, 200, {
            id: z.id,
            titel: r.titel,
            oberthema: r.oberthema,
            fach: r.fachLabel,
            lernziele: r.lernziele.map((l) => ({ ichKann: l.ichKann || l.text })),
            schritte: r.schritte.map((s) => ({
              id: s.id,
              titel: s.titel,
              rolle: s.rolle,
              abschnitt: s.abschnitt,
              erfolg: s.erfolg.art,
              lernziele: s.lernziele.map((l) => ({ ichKann: l.ichKann || l.text })),
              // Inhalt erst, wenn der Schritt erreichbar ist (Hefter erst nach seinem Schritt)
              ...(lage.get(s.id)?.status !== 'gesperrt' && (s.inhalt.art !== 'hefter' || sichtbar(s))
                ? {
                    inhalt: inhaltFuerLernende(s.inhalt),
                    link: linkFuer(s, z, stand),
                    // Niveaustufen: Empfehlung aus der Eingangsdiagnose
                    ...(s.inhalt.art === 'arbeitsblatt' && (s.inhalt.varianten?.length ?? 0) > 1
                      ? { empfehlung: niveauEmpfehlung(r, stand, s.inhalt.varianten!.length) }
                      : {}),
                    // Musterlösung erst nach dem Abgeben
                    ...(s.inhalt.art === 'aufgabe' && s.inhalt.musterloesung && (stand.schritte[s.id]?.eingereicht ?? 0) > 0
                      ? { musterloesung: s.inhalt.musterloesung }
                      : {})
                  }
                : {})
            })),
            weg,
            stand: standKurz(stand),
            hefter: r.schritte
              .filter((s) => s.inhalt.art === 'hefter' && sichtbar(s))
              .map((s) => ({ titel: s.titel, text: (s.inhalt as { text: string }).text }))
          }),
          true
        )
      }
      if (req.method === 'GET' && url.pathname === '/s/api/reihe/datei') {
        const d = db()
          .prepare('SELECT * FROM reihen_dateien WHERE id = ? AND zuweisung_id = ? AND schueler_id = ?')
          .get(String(url.searchParams.get('datei') ?? ''), z.id, ich.id) as { typ: string; daten: Uint8Array } | undefined
        if (!d) return (json(res, 404, { fehler: 'Unbekannte Datei.' }), true)
        res.writeHead(200, { 'content-type': d.typ, 'cache-control': 'private, no-store' })
        return (res.end(Buffer.from(d.daten)), true)
      }
      if (req.method !== 'POST' || url.pathname !== '/s/api/reihe/schritt') return (json(res, 404, { fehler: 'Unbekannt.' }), true)
      if (z.status !== 'offen') return (json(res, 409, { fehler: 'Diese Reihe ist abgeschlossen.' }), true)
      const k0 = (await k.koerper()) as Record<string, unknown>
      const aktion = String(k0.aktion ?? '')
      if (aktion === 'hilfe') {
        stand.hilfe =
          k0.an === false
            ? null
            : {
                zeit: Date.now(),
                ...(typeof k0.schritt === 'string' ? { schritt: k0.schritt } : {}),
                ...(typeof k0.text === 'string' ? { text: k0.text.slice(0, 500) } : {})
              }
        standSpeichern(z.id, ich.id, stand)
        protokolliereServer('reihe', stand.hilfe ? 'Hilfe angefordert' : 'Hilfe zurückgenommen', ich.id)
        return (json(res, 200, { ok: true }), true)
      }
      const s = r.schritte.find((x) => x.id === String(k0.schritt ?? ''))
      if (!s) return (json(res, 400, { fehler: 'Unbekannter Schritt.' }), true)
      const weg = wegVon(r, z, ich.id, stand)
      const lage = weg.schritte.find((l) => l.id === s.id)
      if (!lage || lage.status === 'gesperrt') return (json(res, 409, { fehler: 'Dieser Schritt ist noch gesperrt.' }), true)
      const st: SchrittStand = stand.schritte[s.id] ?? {}
      stand.schritte[s.id] = st
      const antworten = (): Record<string, string> => {
        const a = (k0.antworten ?? {}) as Record<string, unknown>
        return Object.fromEntries(
          Object.entries(a)
            .slice(0, 60)
            .map(([x, y]) => [x.slice(0, 20), String(y ?? '').slice(0, 8000)])
        )
      }

      if (aktion === 'niveau') {
        const s0 = s.inhalt
        const n = Number(k0.niveau)
        if (s0.art !== 'arbeitsblatt' || !s0.varianten || !Number.isInteger(n) || n < 0 || n >= s0.varianten.length)
          return (json(res, 400, { fehler: 'Unbekannte Stufe.' }), true)
        if (st.niveau !== undefined && st.niveau !== n && (externVon(r, z, ich.id, stand)[s.id]?.eingereicht ?? 0) > 0)
          return (json(res, 409, { fehler: 'Du hast auf dieser Stufe schon eingereicht.' }), true)
        st.niveau = n
        standSpeichern(z.id, ich.id, stand)
        return (json(res, 200, { ok: true, link: linkFuer(s, z, stand) }), true)
      }
      if (aktion === 'frage') {
        const text = String(k0.text ?? '')
          .trim()
          .slice(0, 600)
        if (!text) return (json(res, 400, { fehler: 'Bitte die Frage aufschreiben.' }), true)
        stand.fragen = [...(stand.fragen ?? []), { schritt: s.id, text, zeit: Date.now() }].slice(-40)
        standSpeichern(z.id, ich.id, stand)
        protokolliereServer('reihe', 'Frage an einen Schritt gestellt', ich.id)
        return (json(res, 200, { ok: true }), true)
      }
      if (aktion === 'datei') {
        const roh = String(k0.daten ?? '')
        const m = /^data:([a-z0-9.+/-]+);base64,(.*)$/i.exec(roh)
        if (!m) return (json(res, 400, { fehler: 'Die Datei fehlt.' }), true)
        const daten = Buffer.from(m[2], 'base64')
        if (daten.length > MAX_DATEI) return (json(res, 413, { fehler: 'Die Datei ist zu groß (höchstens 12 MB).' }), true)
        const id = neueId()
        const name = String(k0.name ?? 'Datei').slice(0, 120)
        db()
          .prepare('INSERT INTO reihen_dateien (id, zuweisung_id, schueler_id, schritt_id, name, typ, daten, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(id, z.id, ich.id, s.id, name, m[1].slice(0, 80), daten, Date.now())
        st.dateien = [...(st.dateien ?? []), { id, name, typ: m[1] }].slice(-10)
        standSpeichern(z.id, ich.id, stand)
        return (json(res, 200, { id, name, typ: m[1] }), true)
      }
      if (aktion === 'datei-weg') {
        st.dateien = (st.dateien ?? []).filter((d) => d.id !== k0.datei)
        db()
          .prepare('DELETE FROM reihen_dateien WHERE id = ? AND schueler_id = ?')
          .run(String(k0.datei ?? ''), ich.id)
        standSpeichern(z.id, ich.id, stand)
        return (json(res, 200, { ok: true }), true)
      }
      if (aktion === 'speichern') {
        st.antworten = antworten()
        if (typeof k0.tagebuch === 'string') st.tagebuch = k0.tagebuch.slice(0, 4000)
        if (k0.ampel && typeof k0.ampel === 'object') st.ampel = k0.ampel as SchrittStand['ampel']
        standSpeichern(z.id, ich.id, stand)
        return (json(res, 200, { ok: true }), true)
      }
      if (aktion === 'gewusst' && s.inhalt.art === 'lernkarten') {
        st.gewusst = true
        st.zeit = Date.now()
        standSpeichern(z.id, ich.id, stand)
        return (json(res, 200, { ok: true }), true)
      }
      if (aktion === 'diagnose' && s.inhalt.art === 'diagnose') {
        const warten = (s.inhalt.wiederholbarNachMin ?? 0) * 60_000
        if (st.diagnose && (!warten || Date.now() - st.diagnose.zeit < warten))
          return (
            json(res, 409, {
              fehler: warten
                ? `Noch einmal möglich ab ${new Date(st.diagnose.zeit + warten).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr.`
                : 'Die Diagnose ist schon ausgewertet.'
            }),
            true
          )
        st.antworten = antworten()
        st.diagnose = { prozent: diagnoseProzent(s.inhalt.fragen, st.antworten), zeit: Date.now() }
        standSpeichern(z.id, ich.id, stand)
        return (json(res, 200, { prozent: st.diagnose.prozent, bestanden: st.diagnose.prozent >= s.inhalt.schwelle }), true)
      }
      if (aktion === 'abgeben') {
        if (s.inhalt.art === 'reflexion') {
          if (k0.ampel && typeof k0.ampel === 'object') st.ampel = k0.ampel as SchrittStand['ampel']
          if (typeof k0.tagebuch === 'string') st.tagebuch = k0.tagebuch.slice(0, 4000)
          st.eingereicht = (st.eingereicht ?? 0) + 1
          st.zeit = Date.now()
          standSpeichern(z.id, ich.id, stand)
          return (json(res, 200, { ok: true }), true)
        }
        if (s.inhalt.art !== 'aufgabe' && s.inhalt.art !== 'abschluss' && s.inhalt.art !== 'sprechen')
          return (json(res, 400, { fehler: 'Dieser Schritt wird anders erledigt.' }), true)
        st.antworten = antworten()
        const hatDatei = Boolean(st.dateien?.length)
        const text = Object.values(st.antworten).join('\n').trim()
        if (!text && !hatDatei) return (json(res, 400, { fehler: 'Bitte zuerst etwas eintragen oder hochladen.' }), true)
        if (s.inhalt.art === 'aufgabe' && (st.eingereicht ?? 0) >= 3)
          return (json(res, 409, { fehler: 'Du hast diese Aufgabe schon dreimal eingereicht.' }), true)
        st.eingereicht = (st.eingereicht ?? 0) + 1
        st.zeit = Date.now()
        // Neu eingereicht: alte Bewertung der Lehrkraft gilt nicht mehr
        delete st.bewertung
        standSpeichern(z.id, ich.id, stand)
        const fid = json_(z.verknuepft, {} as Record<string, string>)[s.id]
        if (s.inhalt.art !== 'aufgabe' || !s.inhalt.feedback || !fid) return (json(res, 200, { ok: true }), true)
        // Zwischenaufgabe mit KI-Feedback (Bogen wie in der Rückmeldungs-App)
        const fragen = s.inhalt.fragen
        const abgabeText = fragen.length
          ? fragen.map((f, i) => `${i + 1}. ${f}\n${st.antworten?.[String(i)] ?? ''}`).join('\n\n')
          : (st.antworten?.['0'] ?? text)
        const bilder = (st.dateien ?? [])
          .filter((d) => d.typ.startsWith('image/'))
          .slice(0, 4)
          .flatMap((d) => {
            const z0 = db().prepare('SELECT typ, daten FROM reihen_dateien WHERE id = ?').get(d.id) as { typ: string; daten: Uint8Array } | undefined
            return z0 ? [`data:${z0.typ};base64,${Buffer.from(z0.daten).toString('base64')}`] : []
          })
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        const puls = setInterval(() => res.write(' '), PULS_MS)
        res.on('close', () => clearInterval(puls))
        try {
          const f = await blattFassung(fid, nutzerNachId(ich.id)!, abgabeText || '(siehe Foto)', bilder, true, aufruf)
          if (f.volleBogen) {
            const neu = standVon(z.id, ich.id)
            neu.schritte[s.id] = {
              ...(neu.schritte[s.id] ?? {}),
              ki: { einschaetzungen: f.volleBogen.kriterien.map((x) => x.einschaetzung), zeit: Date.now() }
            }
            standSpeichern(z.id, ich.id, neu)
          }
          res.end(JSON.stringify({ ok: !f.fehler, fehler: f.fehler, bogen: f.bogen }))
        } catch (e) {
          res.end(JSON.stringify({ ok: false, fehler: e instanceof Error ? e.message : String(e) }))
        } finally {
          clearInterval(puls)
        }
        return true
      }
      return (json(res, 400, { fehler: 'Unbekannte Aktion.' }), true)
    }

    // ---------------------------------------------------------------- Lehrkraft
    if (ich.rolle === 'schueler') return (json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true)
    const teile = url.pathname.split('/').filter(Boolean).slice(2)
    if (req.method === 'GET' && teile.length === 0) {
      const liste = db().prepare('SELECT id, daten, geaendert FROM reihen WHERE lehrkraft_id = ? ORDER BY geaendert DESC').all(ich.id) as {
        id: string
        daten: string
        geaendert: string
      }[]
      return (
        json(res, 200, {
          reihen: liste.map((x) => {
            const r = json_(x.daten, {} as Reihe)
            const zw = db().prepare('SELECT * FROM reihen_zuweisungen WHERE reihe_id = ? ORDER BY erstellt').all(x.id) as unknown as ZuweisungZeile[]
            return {
              id: x.id,
              titel: r.titel,
              fach: r.fachLabel,
              fachId: r.fachId,
              oberthema: r.oberthema,
              schritte: r.schritte?.length ?? 0,
              geaendert: x.geaendert,
              zuweisungen: zw.map((z) => ({
                id: z.id,
                lerngruppe: z.lerngruppe_id
                  ? (lerngruppe(z.lerngruppe_id)?.name ?? '')
                  : z.code && !json_(z.schueler, [] as string[]).length
                    ? 'Gäste per QR-Code'
                    : 'Einzelne Lernende',
                schueler: json_(z.schueler, [] as string[]).length,
                status: z.status,
                ...(z.code ? { code: z.code, link: reiheLink(z.code) } : {})
              }))
            }
          })
        }),
        true
      )
    }
    /*
     * Laufende Unterrichtsreihen (03.10.2026, Wunsch der Lehrkraft): je offene Zuweisung Reihe,
     * Lerngruppe, Fach, Fortschritt der Lernenden und Handlungsbedarf – für die App „Laufende
     * Reihen" und die Startseite.
     */
    if (req.method === 'GET' && teile[0] === 'laufend') {
      const alle = db()
        .prepare("SELECT * FROM reihen_zuweisungen WHERE lehrkraft_id = ? AND status = 'offen' ORDER BY erstellt DESC")
        .all(ich.id) as unknown as ZuweisungZeile[]
      const reihen = alle.flatMap((z) => {
        const r = reiheVon(z.reihe_id)
        if (!r) return []
        const { bedarf, lernende } = bedarfFuer(r, z)
        const fortschritte = lernende.map((l) => l.weg.fortschritt)
        const schnitt = fortschritte.length ? fortschritte.reduce((a, b) => a + b, 0) / fortschritte.length : 0
        const halteFrei = json_(z.halte_frei, [] as string[])
        return [
          {
            zid: z.id,
            reiheId: r.id,
            titel: r.titel,
            fach: r.fachLabel,
            thema: r.oberthema,
            gruppe: z.lerngruppe_id ? (lerngruppe(z.lerngruppe_id)?.name ?? '') : 'Einzelne Lernende',
            erstellt: z.erstellt,
            schritte: r.schritte.length,
            lernende: lernende.length,
            schnitt,
            fertig: lernende.filter((l) => l.weg.fertig).length,
            begonnen: fortschritte.filter((f) => f > 0).length,
            // Verteilung für die kleine Grafik: 0–25, 25–50, 50–75, 75–100 %
            verteilung: [0, 1, 2, 3].map((k) => fortschritte.filter((f) => Math.min(3, Math.floor(f * 4)) === k).length),
            bedarf: bedarf.length,
            bedarfArten: [...new Set(bedarf.map((b) => b.art))],
            halte: r.schritte.filter((s) => s.halt?.art === 'freigabe' && !halteFrei.includes(s.id)).map((s) => s.titel)
          }
        ]
      })
      return (json(res, 200, { reihen }), true)
    }
    // Korrektur-Eingang über alle Reihen (03.10.2026, Idee aus LearningView)
    if (req.method === 'GET' && teile[0] === 'eingang') {
      const alle = db()
        .prepare("SELECT * FROM reihen_zuweisungen WHERE lehrkraft_id = ? AND status = 'offen' ORDER BY erstellt DESC")
        .all(ich.id) as unknown as ZuweisungZeile[]
      const eintraege = alle.flatMap((z) => {
        const r = reiheVon(z.reihe_id)
        if (!r) return []
        const gruppe = z.lerngruppe_id ? (lerngruppe(z.lerngruppe_id)?.name ?? '') : 'Einzelne Lernende'
        return bedarfFuer(r, z).bedarf.map((b) => ({ ...b, zid: z.id, reihe: r.titel, gruppe }))
      })
      return (json(res, 200, { eintraege }), true)
    }
    if (req.method === 'POST' && teile[0] === 'speichern') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      const r = k0.reihe as Reihe | undefined
      if (!r?.titel?.trim() || !Array.isArray(r.schritte)) return (json(res, 400, { fehler: 'Die Reihe braucht einen Titel.' }), true)
      const roh = JSON.stringify(r)
      if (roh.length > 40 * 1024 * 1024) return (json(res, 413, { fehler: 'Die Reihe ist zu groß.' }), true)
      const jetzt = new Date().toISOString()
      const alt = r.id ? reiheVon(r.id, true) : null
      if (alt && alt.lehrkraftId !== ich.id) return (json(res, 403, { fehler: 'Diese Reihe gehört einer anderen Lehrkraft.' }), true)
      const id = alt ? alt.id : neueId()
      const neu = { ...r, id, geaendert: jetzt }
      if (alt) db().prepare('UPDATE reihen SET titel = ?, daten = ?, geaendert = ? WHERE id = ?').run(r.titel.slice(0, 200), JSON.stringify(neu), jetzt, id)
      else
        db()
          .prepare('INSERT INTO reihen (id, lehrkraft_id, titel, daten, erstellt, geaendert) VALUES (?, ?, ?, ?, ?, ?)')
          .run(id, ich.id, r.titel.slice(0, 200), JSON.stringify(neu), jetzt, jetzt)
      // Neue Schritte auch in bestehenden Zuweisungen bereitstellen
      for (const z of db().prepare("SELECT * FROM reihen_zuweisungen WHERE reihe_id = ? AND status = 'offen'").all(id) as unknown as ZuweisungZeile[])
        verknuepfe(z, { ...neu, schritte: neu.schritte.filter((s) => !s.platzhalter) })
      return (json(res, 200, { id, geaendert: jetzt }), true)
    }
    if (teile[0] === 'z' && teile[1]) {
      const z = zuweisung(teile[1])
      if (!z || z.lehrkraft_id !== ich.id) return (json(res, 404, { fehler: 'Unbekannte Zuweisung.' }), true)
      const r = reiheVon(z.reihe_id)
      if (!r) return (json(res, 404, { fehler: 'Die Reihe gibt es nicht mehr.' }), true)
      if (req.method === 'GET' && teile.length === 2) {
        verknuepfe(z, r)
        const halteFrei = json_(z.halte_frei, [] as string[])
        const { bedarf, lernende } = bedarfFuer(r, z)
        return (
          json(res, 200, {
            reihe: r,
            zuweisung: {
              id: z.id,
              lerngruppe: z.lerngruppe_id ? (lerngruppe(z.lerngruppe_id)?.name ?? '') : 'Einzelne Lernende',
              status: z.status,
              halteFrei,
              ...(z.code ? { code: z.code, link: reiheLink(z.code) } : {}),
              // Per Code beigetreten – entfernbar
              perCode: (db().prepare('SELECT nutzer_id FROM reihe_gaeste WHERE zuweisung_id = ?').all(z.id) as { nutzer_id: string }[]).map((g) => g.nutzer_id)
            },
            lernende,
            bedarf
          }),
          true
        )
      }
      // Gast entfernen (05.10.2026): Zugang zur Reihe und zu allen verknüpften Freigaben, Konto ggf. ganz
      if (req.method === 'POST' && teile[2] === 'gast-entfernen') {
        const nid = String(((await k.koerper()) as Record<string, unknown>).nutzer ?? '')
        const v = Object.values(json_(z.verknuepft, {} as Record<string, string>)).filter((x) => x && x !== '*')
        for (const fid of v)
          for (const t of [
            'DELETE FROM blatt_gaeste WHERE freigabe_id = ? AND nutzer_id = ?',
            'DELETE FROM feedback_gaeste WHERE freigabe_id = ? AND nutzer_id = ?',
            'DELETE FROM vok_gaeste WHERE zuweisung_id = ? AND nutzer_id = ?'
          ])
            try {
              db().prepare(t).run(fid, nid)
            } catch {
              /* Tabelle fehlt */
            }
        const ok = gastEntfernen(
          { tabelle: 'reihe_gaeste', spalte: 'zuweisung_id', freigabeId: z.id, stand: [{ tabelle: 'reihen_stand', spalte: 'zuweisung_id' }] },
          nid,
          ich.id
        )
        return (json(res, ok ? 200 : 404, ok ? { ok: true } : { fehler: 'Diese Person ist nicht per Code beigetreten.' }), true)
      }
      if (req.method === 'GET' && teile[2] === 'datei') {
        const d = db()
          .prepare('SELECT * FROM reihen_dateien WHERE id = ? AND zuweisung_id = ?')
          .get(String(teile[3] ?? ''), z.id) as { typ: string; name: string; daten: Uint8Array } | undefined
        if (!d) return (json(res, 404, { fehler: 'Unbekannte Datei.' }), true)
        res.writeHead(200, {
          'content-type': d.typ,
          'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(d.name)}`,
          'cache-control': 'private, no-store'
        })
        return (res.end(Buffer.from(d.daten)), true)
      }
      if (req.method === 'POST' && teile[2] === 'aktion') {
        const k0 = (await k.koerper()) as Record<string, unknown>
        const art = String(k0.art ?? '')
        if (art === 'halt') {
          const frei = new Set(json_(z.halte_frei, [] as string[]))
          const sid = String(k0.schritt ?? '')
          if (k0.frei === false) frei.delete(sid)
          else frei.add(sid)
          db()
            .prepare('UPDATE reihen_zuweisungen SET halte_frei = ? WHERE id = ?')
            .run(JSON.stringify([...frei]), z.id)
          return (json(res, 200, { ok: true }), true)
        }
        if (art === 'beenden' || art === 'oeffnen') {
          const status = art === 'beenden' ? 'beendet' : 'offen'
          db().prepare('UPDATE reihen_zuweisungen SET status = ? WHERE id = ?').run(status, z.id)
          for (const [sid, id] of Object.entries(json_(z.verknuepft, {} as Record<string, string>))) {
            const s = r.schritte.find((x) => x.id === sid)
            if (s && (s.inhalt.art === 'rueckmeldung' || s.inhalt.art === 'aufgabe')) verknuepfteFreigabeStatus(id, status)
          }
          return (json(res, 200, { ok: true }), true)
        }
        const n = lernendeVon(z).find((x) => x.id === k0.schueler)
        if (!n) return (json(res, 400, { fehler: 'Unbekannte Person.' }), true)
        const stand = standVon(z.id, n.id)
        if (art === 'antworten') {
          const i = Number(k0.frage)
          const f = stand.fragen?.[i]
          if (!f) return (json(res, 400, { fehler: 'Unbekannte Frage.' }), true)
          f.antwort = String(k0.text ?? '').slice(0, 1200)
          f.antwortZeit = Date.now()
          standSpeichern(z.id, n.id, stand)
          return (json(res, 200, { ok: true }), true)
        }
        if (art === 'lehrkraft-ampel') {
          const farbe = String(k0.farbe ?? '')
          stand.lehrkraftAmpel = { ...(stand.lehrkraftAmpel ?? {}) }
          if (farbe === 'gruen' || farbe === 'gelb' || farbe === 'rot') stand.lehrkraftAmpel[String(Number(k0.ziel))] = farbe
          else delete stand.lehrkraftAmpel[String(Number(k0.ziel))]
          standSpeichern(z.id, n.id, stand)
          return (json(res, 200, { ok: true }), true)
        }
        if (art === 'hilfe-erledigt') {
          stand.hilfe = null
          standSpeichern(z.id, n.id, stand)
          return (json(res, 200, { ok: true }), true)
        }
        const s = r.schritte.find((x) => x.id === k0.schritt)
        if (!s) return (json(res, 400, { fehler: 'Unbekannter Schritt.' }), true)
        const st: SchrittStand = stand.schritte[s.id] ?? {}
        if (art === 'freischalten') st.hand = 'offen'
        else if (art === 'geschafft') st.hand = 'geschafft'
        else if (art === 'zuruecksetzen') {
          delete st.hand
          delete st.bewertung
          delete st.praesenz
        } else if (art === 'praesenz') st.praesenz = k0.erledigt !== false
        else if (art === 'bewerten') {
          st.bewertung = { text: String(k0.text ?? '').slice(0, 2000), geschafft: k0.geschafft !== false, zeit: Date.now() }
          delete st.ueberarbeiten
        } else if (art === 'ueberarbeiten') {
          // Zur Überarbeitung zurück: wieder offen bis zur nächsten Einreichung, mit einer zusätzlichen Runde
          const id = verknuepfteId(s, z, stand)
          const ex = externVon(r, z, n.id, stand)[s.id]
          st.ueberarbeiten = { text: String(k0.text ?? '').slice(0, 2000), zeit: Date.now(), bei: ex ? ex.eingereicht : (st.eingereicht ?? 0) }
          delete st.bewertung
          if (st.hand === 'geschafft') delete st.hand
          if (id && s.inhalt.art === 'arbeitsblatt') blattZusatzrunde(id, n.id)
          if (id && (s.inhalt.art === 'rueckmeldung' || s.inhalt.art === 'aufgabe')) feedbackZusatzrunde(id, n.id)
        } else return (json(res, 400, { fehler: 'Unbekannte Aktion.' }), true)
        stand.schritte[s.id] = st
        standSpeichern(z.id, n.id, stand)
        return (json(res, 200, { ok: true }), true)
      }
      return (json(res, 404, { fehler: 'Unbekannt.' }), true)
    }
    const r = teile[0] ? reiheVon(teile[0], true) : null
    if (!r || r.lehrkraftId !== ich.id) return (json(res, 404, { fehler: 'Unbekannte Reihe.' }), true)
    if (req.method === 'GET' && teile.length === 1) {
      const { lehrkraftId: _l, ...rein } = r
      return (json(res, 200, { reihe: rein }), true)
    }
    if (req.method === 'POST' && teile[1] === 'zuweisen') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      const gid = String(k0.lerngruppeId ?? '')
      const g = gid ? lerngruppe(gid) : null
      if (gid && (!g || g.lehrkraft_id !== ich.id)) return (json(res, 400, { fehler: 'Bitte eine eigene Lerngruppe wählen.' }), true)
      // Ohne Lerngruppe: einzelne Lernende aus allen eigenen Lerngruppen
      const erlaubt = new Set((g ? mitgliederVon(g) : alleLernenden()).map((n) => n.benutzer))
      const einzelne = Array.isArray(k0.schueler) ? [...new Set((k0.schueler as unknown[]).map(String).filter((b) => erlaubt.has(b)))] : []
      // Gäste per QR-Code (05.10.2026): auch ohne Lerngruppe; mit IServ melden sich alle dort an
      const mitGaesten = k0.gaeste === true
      if (!g && !einzelne.length && !mitGaesten)
        return (json(res, 400, { fehler: 'Bitte eine Lerngruppe, einzelne Lernende oder Gäste per QR-Code wählen.' }), true)
      const id = neueId()
      const code = mitGaesten ? neuerCode() : null
      db()
        .prepare(
          'INSERT INTO reihen_zuweisungen (id, reihe_id, lehrkraft_id, lerngruppe_id, schueler, halte_frei, verknuepft, status, erstellt, code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .run(id, r.id, ich.id, g?.id ?? '', JSON.stringify(einzelne), '[]', '{}', 'offen', new Date().toISOString(), code)
      verknuepfe(zuweisung(id)!, r)
      protokolliereServer('reihe', 'Unterrichtsreihe zugewiesen', ich.id)
      return (json(res, 200, { id, ...(code ? { code, link: reiheLink(code) } : {}) }), true)
    }
    if (req.method === 'POST' && teile[1] === 'loeschen') {
      db().prepare('DELETE FROM reihen WHERE id = ?').run(r.id)
      return (json(res, 200, { ok: true }), true)
    }
    return (json(res, 404, { fehler: 'Unbekannt.' }), true)
  }
}

/**
 * Für die Lern-App (03.10.2026): je zugewiesener Reihe die freigeschalteten Merkzettel (Wissensspeicher)
 * und die hochgeladenen Lernprodukte (Bilder als data:-Adresse, höchstens 4 je Reihe).
 */
export function reihenFuerLernen(ich: NutzerInfo): {
  id: string
  titel: string
  fach: string
  oberthema: string
  hefter: { titel: string; text: string }[]
  produkte: { titel: string; datum: number; bild?: string }[]
}[] {
  const alle = (db().prepare('SELECT * FROM reihen_zuweisungen ORDER BY erstellt DESC').all() as unknown as ZuweisungZeile[]).filter((z) => istFuer(z, ich))
  return alle.flatMap((z) => {
    const r = reiheVon(z.reihe_id)
    if (!r) return []
    const stand = standVon(z.id, ich.id)
    const weg = wegVon(r, z, ich.id, stand)
    const lage = new Map(weg.schritte.map((l) => [l.id, l]))
    const sichtbar = (s: Schritt): boolean =>
      lage.get(s.id)?.status !== 'gesperrt' && (!s.nach || ['geschafft', 'uebersprungen'].includes(lage.get(s.nach)?.status ?? ''))
    const hefter = r.schritte
      .filter((s) => s.inhalt.art === 'hefter' && sichtbar(s))
      .map((s) => ({ titel: s.titel, text: (s.inhalt as { text: string }).text }))
    const produkte = r.schritte
      .filter((s) => s.inhalt.art === 'abschluss')
      .flatMap((s) =>
        (stand.schritte[s.id]?.dateien ?? []).slice(0, 4).map((d) => {
          const z0 = d.typ.startsWith('image/')
            ? (db().prepare('SELECT typ, daten, erstellt FROM reihen_dateien WHERE id = ?').get(d.id) as
                { typ: string; daten: Uint8Array; erstellt: number } | undefined)
            : undefined
          return {
            titel: `${s.titel}: ${d.name}`,
            datum: z0?.erstellt ?? stand.schritte[s.id]?.zeit ?? 0,
            ...(z0 ? { bild: `data:${z0.typ};base64,${Buffer.from(z0.daten).toString('base64')}` } : {})
          }
        })
      )
    return [{ id: z.id, titel: r.titel, fach: r.fachLabel, oberthema: r.oberthema, hefter, produkte }]
  })
}

type Bedarf = { art: string; schueler?: string; name?: string; schritt?: string; text: string; frage?: number }

/** Handlungsbedarf einer Zuweisung (Übersicht und Korrektur-Eingang) */
function bedarfFuer(r: Reihe, z: ZuweisungZeile): { bedarf: Bedarf[]; lernende: { id: string; name: string; benutzer: string; weg: Weg; stand: Stand }[] } {
  verknuepfe(z, r)
  const halteFrei = json_(z.halte_frei, [] as string[])
  const bedarf: Bedarf[] = []
  const lernende = lernendeVon(z).map((n) => {
    const stand = standVon(z.id, n.id)
    const weg = wegVon(r, z, n.id, stand)
    for (const l of weg.schritte) {
      const s = r.schritte.find((x) => x.id === l.id)!
      if (l.wartet && l.status === 'eingereicht')
        bedarf.push({ art: 'bewerten', schueler: n.id, name: n.name, schritt: s.id, text: `${s.titel}: eingereicht – bitte ansehen und bestätigen` })
      if (s.inhalt.art === 'praesenz' && l.status === 'offen')
        bedarf.push({ art: 'praesenz', schueler: n.id, name: n.name, schritt: s.id, text: `${s.titel}: im Unterricht abhaken` })
      if (l.status === 'nicht_geschafft' && !r.schritte.some((f) => f.rolle === 'foerder' && f.foerderFuer === s.id))
        bedarf.push({ art: 'hilfe', schueler: n.id, name: n.name, schritt: s.id, text: `${s.titel}: nicht geschafft – braucht Hilfe` })
    }
    if (stand.hilfe)
      bedarf.push({
        art: 'hilferuf',
        schueler: n.id,
        name: n.name,
        schritt: stand.hilfe.schritt,
        text: `bittet um Hilfe${stand.hilfe.text ? `: „${stand.hilfe.text}“` : ''}`
      })
    ;(stand.fragen ?? []).forEach((f, i) => {
      if (f.antwort) return
      const s = r.schritte.find((x) => x.id === f.schritt)
      bedarf.push({ art: 'frage', schueler: n.id, name: n.name, schritt: f.schritt, frage: i, text: `fragt${s ? ` zu „${s.titel}“` : ''}: „${f.text}“` })
    })
    const ziele = alleLernziele(r)
    for (const k of ampelAbweichungen(stand))
      bedarf.push({
        art: 'abweichung',
        schueler: n.id,
        name: n.name,
        text: `schätzt „${ziele[k]?.ichKann || ziele[k]?.text || 'ein Lernziel'}“ deutlich anders ein als du`
      })
    return { id: n.id, name: n.name, benutzer: n.benutzer, weg, stand: standKurz(stand) }
  })
  for (const s of r.schritte)
    if (s.halt?.art === 'freigabe' && !halteFrei.includes(s.id)) {
      const wartend = lernende.filter((l) => l.weg.schritte.find((x) => x.id === s.id)?.hinweis?.startsWith('Wartet auf die gemeinsame')).length
      if (wartend) bedarf.push({ art: 'halt', schritt: s.id, text: `Haltepunkt vor „${s.titel}“: ${wartend} warten auf die Besprechung` })
    }
  return { bedarf, lernende }
}
