/**
 * Krisenhinweise (22.10.2026, Entscheidung der Lehrkraft nach der KI-Sicherheitsprüfung): Äußert ein Kind etwas zu
 * Selbstgefährdung (Sprechtrainer, Lerntagebuch, Rückmeldebogen, Arbeitsblatt …), gilt das NIE als Vorfall und führt nie
 * zu einer Sperre. Das Kind bekommt einen festen, freundlichen Hilfetext; die zuständige Lehrkraft bekommt einen
 * vertraulichen Hinweis OHNE Wortlaut (nur wer, wo, wann).
 *
 * Erkennung auf zwei Wegen:
 *  - `kriseVerdacht(text)`: einfache Wortliste (de/en/fr/es), ohne KI – Faustregel, lieber einmal zu oft
 *  - Feld `krise` in den Antwort-Schemata der KI (KRISEN_REGEL in den Anweisungen für Lernenden-Wege)
 *  - im Sprechtrainer zusätzlich die Moderation (Kategorie self-harm*)
 *
 * Meldeweg nach § 4 KKG (23.10.2026, Prüfung des Schulträgers, Entscheidung der Lehrkraft):
 *  - Die Verwaltung wählt eine oder mehrere Vertrauenspersonen (Beratungslehrkraft, Schulsozialarbeit – Konten mit
 *    Rolle Lehrkraft/Admin). Sie bekommen jeden Hinweis der Schule zusätzlich, mit demselben Inhalt (Name, Ort, Zeit –
 *    nie Wortlaut). Alle Zeilen eines Ereignisses teilen eine Fallkennung (`fall`).
 *  - Dazu ein freier Text der Schule zur Meldekette („Beratungslehrkraft Frau X, Raum Y …"), verschlüsselt bei den
 *    Servergeheimnissen; er steht in jeder Hinweiskarte vor den allgemeinen Hinweisen.
 *  - Sofort eine Benachrichtigung OHNE Inhalt („Neuer vertraulicher Hinweis in Schul-Apps") per Web Push an alle
 *    Empfänger mit angemeldetem Gerät (Geräte in push_geraete wie bei den Erinnerungen, erinnerungen.ts); dazu der
 *    rote Punkt an der Startseite (KrisenPunkt.tsx).
 *  - Nach 24 Stunden ohne „Gesehen" durch irgendeine zuständige Person genau eine Erinnerung (Zeitplaner alle 10 Minuten).
 *  - Wer zuerst „Gesehen" gewählt hat (und wann), sehen alle Empfänger des Falls.
 *  - Aufbewahrung unverändert 30 Tage, auch für die Kopien der Vertrauenspersonen; Spalte `schueler_id` bleibt
 *    (Löschen mit dem Konto des Kindes).
 */
import { randomBytes } from 'node:crypto'
import { alleNutzer, datenbank, nutzerNachId, protokolliereServer, serverGeheimnis, serverWert, setzeServerGeheimnis, setzeServerWert } from './datenbank'
import { json, type Anfrage } from './http'

export { HILFETEXT, KRISEN_REGEL, KRISEN_FELD, kriseVerdacht } from '../shared/krise'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS krisen_hinweise (
  id TEXT PRIMARY KEY,
  lehrkraft_id TEXT NOT NULL,
  schueler_id TEXT NOT NULL,
  quelle TEXT NOT NULL,
  zeit INTEGER NOT NULL,
  gesehen INTEGER
);`

/**
 * Spalten des Meldewegs (23.10.2026, Prüfung des Schulträgers): `lehrkraft_id` ist seither der Empfänger der Zeile
 * (Lehrkraft oder Vertrauensperson), `art` sagt welcher, `fall` verbindet die Kopien eines Ereignisses.
 * `erst_gesehen(_von)` = erste zuständige Person mit „Gesehen" (in allen Zeilen des Falls), `erinnert` = Erinnerung verschickt.
 */
const NEUE_SPALTEN: [string, string][] = [
  ['fall', 'TEXT'],
  ['art', 'TEXT'],
  ['erinnert', 'INTEGER'],
  ['erst_gesehen', 'INTEGER'],
  ['erst_gesehen_von', 'TEXT']
]

let bereit = false
const db = () => {
  const d = datenbank()
  if (!bereit) {
    d.exec(SCHEMA)
    const da = new Set((d.prepare('PRAGMA table_info(krisen_hinweise)').all() as { name: string }[]).map((z) => z.name))
    for (const [name, typ] of NEUE_SPALTEN) if (!da.has(name)) d.exec(`ALTER TABLE krisen_hinweise ADD COLUMN ${name} ${typ}`)
    // Alte Zeilen (vor dem Meldeweg): jede ist ihr eigener Fall, „Gesehen" der Lehrkraft gilt als erstes Sehen
    d.exec(
      "UPDATE krisen_hinweise SET fall = id, art = 'lehrkraft', erst_gesehen = gesehen, erst_gesehen_von = CASE WHEN gesehen IS NULL THEN NULL ELSE lehrkraft_id END WHERE fall IS NULL"
    )
    d.exec('CREATE INDEX IF NOT EXISTS krisen_hinweise_fall ON krisen_hinweise(fall)')
    bereit = true
  }
  return d
}

/** Hinweise nach 30 Tagen löschen – der Hinweis ist ein Anlass zum Gespräch, kein Akteneintrag */
const AUFBEWAHREN = 30 * 24 * 3600 * 1000
/** Höchstens ein Hinweis je Kind, Quelle und Stunde */
const SPERRE = 3600 * 1000
/** Erinnerung, wenn nach 24 Stunden niemand „Gesehen" gewählt hat (höchstens eine) */
export const ERINNERN_NACH = 24 * 3600 * 1000

/** Texte der Benachrichtigungen – bewusst ohne Namen, Ort oder Inhalt */
export const PUSH_NEU = 'Neuer vertraulicher Hinweis in Schul-Apps'
export const PUSH_ERINNERUNG = 'Ein vertraulicher Hinweis in Schul-Apps ist noch nicht gesehen.'

// ---------------------------------------------------------------- Einstellungen der Schule

const SCHLUESSEL_VERTRAUEN = 'krise:vertrauenspersonen'
const SCHLUESSEL_KETTE = 'krise:meldekette'
export const KETTE_MAX = 1500

const istZustaendig = (id: string): boolean => {
  const n = nutzerNachId(id)
  return Boolean(n && (n.rolle === 'lehrkraft' || n.rolle === 'admin') && !n.gesperrt)
}

/** Vertrauenspersonen der Schule (nur bestehende, nicht gesperrte Lehrkräfte/Admins) */
export function vertrauenspersonen(): string[] {
  const roh = serverWert<unknown>(SCHLUESSEL_VERTRAUEN, [])
  return (Array.isArray(roh) ? roh : []).filter((x): x is string => typeof x === 'string').filter(istZustaendig)
}

/** Meldekette der Schule (freier Text der Verwaltung, verschlüsselt gespeichert) */
export const meldekette = (): string => serverGeheimnis(SCHLUESSEL_KETTE)

export function krisenEinstellungSetzen(roh: { vertrauen?: unknown; kette?: unknown }): { vertrauen: string[]; kette: string } | { fehler: string } {
  if (roh.vertrauen !== undefined) {
    if (!Array.isArray(roh.vertrauen)) return { fehler: 'Auswahl ungültig.' }
    const ids = [...new Set(roh.vertrauen.filter((x): x is string => typeof x === 'string'))].slice(0, 20)
    if (ids.some((id) => !istZustaendig(id))) return { fehler: 'Vertrauenspersonen können nur Lehrkräfte sein.' }
    setzeServerWert(SCHLUESSEL_VERTRAUEN, ids)
  }
  if (roh.kette !== undefined) {
    if (typeof roh.kette !== 'string') return { fehler: 'Text ungültig.' }
    setzeServerGeheimnis(SCHLUESSEL_KETTE, roh.kette.replace(/\r\n/g, '\n').trim().slice(0, KETTE_MAX))
  }
  return { vertrauen: vertrauenspersonen(), kette: meldekette() }
}

// ---------------------------------------------------------------- Benachrichtigungen

let versandKette: Promise<void> = Promise.resolve()
/** Für Tests: warten, bis alle angestoßenen Benachrichtigungen verschickt sind */
export const kriseVersandAbwarten = (): Promise<void> => versandKette

/** Push ohne Inhalt an die Geräte der Empfänger (nur wer ein Gerät angemeldet hat) */
function benachrichtigen(empfaenger: string[], text: string): Promise<void> {
  const nutzlast = JSON.stringify({ t: 'Schul-Apps', b: text, u: '/', l: 'de', tag: 'sa-krise' })
  versandKette = versandKette.then(async () => {
    try {
      // Erst hier laden: erinnerungen.ts zieht viele Module nach, die ihrerseits kriseMelden nutzen
      const { anGeraete } = await import('./erinnerungen')
      for (const id of empfaenger) await anGeraete(id, nutzlast).catch(() => undefined)
    } catch (e) {
      protokolliereServer('krise', `Benachrichtigung fehlgeschlagen: ${e instanceof Error ? e.name : 'Fehler'}`)
    }
  })
  return versandKette
}

// ---------------------------------------------------------------- Melden

/**
 * Vertraulichen Hinweis an die Lehrkraft und alle Vertrauenspersonen. `quelle` ist eine kurze Ortsangabe ohne Inhalt,
 * z. B. „Sprechtraining (Englisch 7b)“ oder „Lerntagebuch: Reihe Julikrise“. Nie Wortlaut übergeben.
 */
export function kriseMelden(lehrkraftId: string, schuelerId: string, quelle: string, jetzt = Date.now()): void {
  if (!lehrkraftId || !schuelerId) return
  const d = db()
  d.prepare('DELETE FROM krisen_hinweise WHERE zeit < ?').run(jetzt - AUFBEWAHREN)
  const q = String(quelle).slice(0, 120)
  // Sperre je Lehrkraft, Kind und Quelle. `quelle` liegt verschlüsselt (feldschutz.ts) – deshalb nach dem Lesen
  // vergleichen (23.10.2026: „quelle = ?" traf das Chiffrat nie, die Sperre griff nicht)
  const frisch = (
    d.prepare('SELECT quelle FROM krisen_hinweise WHERE lehrkraft_id = ? AND schueler_id = ? AND zeit > ?').all(lehrkraftId, schuelerId, jetzt - SPERRE) as {
      quelle: string
    }[]
  ).some((z) => z.quelle === q)
  if (frisch) return
  const fall = randomBytes(9).toString('base64url')
  const empfaenger = [lehrkraftId, ...vertrauenspersonen().filter((id) => id !== lehrkraftId && id !== schuelerId)]
  const neu = d.prepare('INSERT INTO krisen_hinweise (id, lehrkraft_id, schueler_id, quelle, zeit, fall, art) VALUES (?, ?, ?, ?, ?, ?, ?)')
  empfaenger.forEach((id, i) => neu.run(randomBytes(9).toString('base64url'), id, schuelerId, q, jetzt, fall, i === 0 ? 'lehrkraft' : 'vertrauen'))
  void benachrichtigen(empfaenger, PUSH_NEU)
}

/** „Gesehen" einer zuständigen Person: die eigene Zeile, dazu als erstes Sehen in allen Zeilen des Falls */
export function kriseGesehen(nutzerId: string, id: string, jetzt = Date.now()): boolean {
  const d = db()
  const z = d.prepare('SELECT fall FROM krisen_hinweise WHERE id = ? AND lehrkraft_id = ?').get(id, nutzerId) as { fall: string } | undefined
  if (!z) return false
  d.prepare('UPDATE krisen_hinweise SET gesehen = ? WHERE id = ? AND gesehen IS NULL').run(jetzt, id)
  d.prepare('UPDATE krisen_hinweise SET erst_gesehen = ?, erst_gesehen_von = ? WHERE fall = ? AND erst_gesehen IS NULL').run(jetzt, nutzerId, z.fall)
  return true
}

/** Zeitplaner: Fälle ohne „Gesehen" nach 24 Stunden genau einmal erinnern. Liefert die Zahl der erinnerten Fälle. */
export async function krisenErinnern(jetzt = Date.now()): Promise<number> {
  const d = db()
  d.prepare('DELETE FROM krisen_hinweise WHERE zeit < ?').run(jetzt - AUFBEWAHREN)
  const faelle = d
    .prepare('SELECT DISTINCT fall FROM krisen_hinweise WHERE erst_gesehen IS NULL AND erinnert IS NULL AND zeit <= ? LIMIT 200')
    .all(jetzt - ERINNERN_NACH) as { fall: string }[]
  for (const { fall } of faelle) {
    d.prepare('UPDATE krisen_hinweise SET erinnert = ? WHERE fall = ?').run(jetzt, fall)
    const an = (d.prepare('SELECT lehrkraft_id FROM krisen_hinweise WHERE fall = ?').all(fall) as { lehrkraft_id: string }[]).map((z) => z.lehrkraft_id)
    await benachrichtigen(an, PUSH_ERINNERUNG)
  }
  return faelle.length
}

let zeitplaner: ReturnType<typeof setInterval> | null = null
/** Zeitplaner starten (start.ts): alle 10 Minuten */
export function krisenErinnerungStarten(): void {
  if (zeitplaner) return
  zeitplaner = setInterval(() => void krisenErinnern().catch(() => undefined), 10 * 60_000)
  zeitplaner.unref()
}

// ---------------------------------------------------------------- Lesen

export type KrisenArt = 'lehrkraft' | 'vertrauen'

export interface KrisenHinweis {
  id: string
  schuelerId: string
  /** Anzeigename der/des Lernenden (22.10.2026, am Server aufgelöst – nur für die zuständigen Personen) */
  name: string
  quelle: string
  zeit: number
  gesehen?: number
  /** 'lehrkraft' = zuständige Lehrkraft, 'vertrauen' = Kopie für eine Vertrauensperson (23.10.2026) */
  art: KrisenArt
  /** Die anderen Empfänger desselben Falls (Lehrkraft bzw. Vertrauenspersonen) mit Anzeigenamen */
  weitere: { name: string; art: KrisenArt }[]
  /** Erstes „Gesehen" im Fall: wer und wann */
  erstGesehen?: { name: string; zeit: number; selbst: boolean }
  /** Erinnerung nach 24 Stunden verschickt */
  erinnert?: number
}

interface Zeile {
  id: string
  schueler_id: string
  quelle: string
  zeit: number
  gesehen: number | null
  fall: string
  art: string | null
  erinnert: number | null
  erst_gesehen: number | null
  erst_gesehen_von: string | null
}

const artVon = (a: string | null): KrisenArt => (a === 'vertrauen' ? 'vertrauen' : 'lehrkraft')

export function krisenHinweise(lehrkraftId: string): KrisenHinweis[] {
  const d = db()
  d.prepare('DELETE FROM krisen_hinweise WHERE zeit < ?').run(Date.now() - AUFBEWAHREN)
  // Name wie im Überblick des Sprechtrainings (Name, sonst Benutzername)
  const namen = new Map(alleNutzer().map((n) => [n.id, n.name || n.benutzer] as const))
  const name = (id: string | null): string => namen.get(id ?? '') ?? 'Unbekannte Person'
  const eigene = d
    .prepare(
      'SELECT id, schueler_id, quelle, zeit, gesehen, fall, art, erinnert, erst_gesehen, erst_gesehen_von FROM krisen_hinweise WHERE lehrkraft_id = ? ORDER BY zeit DESC LIMIT 100'
    )
    .all(lehrkraftId) as unknown as Zeile[]
  const andere = d.prepare('SELECT lehrkraft_id, art FROM krisen_hinweise WHERE fall = ? AND lehrkraft_id != ?')
  return eigene.map((r) => ({
    id: r.id,
    schuelerId: r.schueler_id,
    name: name(r.schueler_id),
    quelle: r.quelle,
    zeit: r.zeit,
    ...(r.gesehen ? { gesehen: r.gesehen } : {}),
    art: artVon(r.art),
    weitere: (andere.all(r.fall, lehrkraftId) as { lehrkraft_id: string; art: string | null }[]).map((w) => ({ name: name(w.lehrkraft_id), art: artVon(w.art) })),
    ...(r.erst_gesehen ? { erstGesehen: { name: name(r.erst_gesehen_von), zeit: r.erst_gesehen, selbst: r.erst_gesehen_von === lehrkraftId } } : {}),
    ...(r.erinnert ? { erinnert: r.erinnert } : {})
  }))
}

/** Zahl der eigenen offenen Hinweise (roter Punkt an der Startseite) */
export function offeneKrisen(lehrkraftId: string): number {
  const z = db().prepare('SELECT COUNT(*) AS n FROM krisen_hinweise WHERE lehrkraft_id = ? AND gesehen IS NULL AND zeit >= ?').get(lehrkraftId, Date.now() - AUFBEWAHREN) as
    | { n: number }
    | undefined
  return Number(z?.n ?? 0)
}

// ---------------------------------------------------------------- Route

const testZuletzt = new Map<string, number>()

/**
 * Lehrkräfte und Vertrauenspersonen:
 *   GET  /server/krisen                       → { hinweise, offen, kette, vertrauensperson }
 *   GET  /server/krisen/zahl                  → { offen }
 *   POST /server/krisen/gesehen               { id }
 *   GET  /server/krisen/geraet                → { schluessel, geraete }   (Push für vertrauliche Hinweise, freiwillig)
 *   POST /server/krisen/geraet                { abo: PushSubscription.toJSON(), alt? }
 *   POST /server/krisen/geraet-pruefen        { endpoint } → { registriert }
 *   POST /server/krisen/geraet-entfernen      { endpoint }
 *   POST /server/krisen/test                  → { gesendet, geraete }
 * Verwaltung (nur Admin):
 *   GET  /server/krisen/einstellung           → { vertrauen, kette, lehrkraefte }
 *   POST /server/krisen/einstellung           { vertrauen?, kette? }
 */
export function kriseRoute(): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { url, req, res, sitzung } = k
    if (!url.pathname.startsWith('/server/krisen')) return false
    if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
    const ich = sitzung.nutzer
    if (ich.rolle === 'schueler') return (json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true)
    const teil = url.pathname.slice('/server/krisen'.length).replace(/^\//, '')
    if (req.method === 'GET') {
      if (!teil)
        return (
          json(res, 200, {
            hinweise: krisenHinweise(ich.id),
            offen: offeneKrisen(ich.id),
            kette: meldekette(),
            vertrauensperson: vertrauenspersonen().includes(ich.id)
          }),
          true
        )
      if (teil === 'zahl') return (json(res, 200, { offen: offeneKrisen(ich.id) }), true)
      if (teil === 'geraet') {
        const { vapid, geraeteVon } = await import('./erinnerungen')
        return (json(res, 200, { schluessel: vapid().oeffentlich, geraete: geraeteVon(ich.id).length }), true)
      }
      if (teil === 'einstellung') {
        if (ich.rolle !== 'admin') return (json(res, 403, { fehler: 'Nur für die Verwaltung.' }), true)
        const lehrkraefte = alleNutzer()
          .filter((n) => (n.rolle === 'lehrkraft' || n.rolle === 'admin') && !n.gesperrt)
          .map((n) => ({ id: n.id, name: n.name, benutzer: n.benutzer }))
        return (json(res, 200, { vertrauen: vertrauenspersonen(), kette: meldekette(), lehrkraefte }), true)
      }
      return (json(res, 404, { fehler: 'Unbekannt.' }), true)
    }
    if (req.method !== 'POST') return (json(res, 405, { fehler: 'Nicht erlaubt.' }), true)
    if (typeof req.headers['x-schulapps-token'] !== 'string') return (json(res, 403, { fehler: 'Nicht erlaubt.' }), true)
    const b = ((await k.koerper()) ?? {}) as Record<string, unknown>
    if (teil === 'gesehen') return (json(res, 200, { ok: kriseGesehen(ich.id, String(b.id ?? '')) }), true)
    if (teil === 'einstellung') {
      if (ich.rolle !== 'admin') return (json(res, 403, { fehler: 'Nur für die Verwaltung.' }), true)
      const r = krisenEinstellungSetzen({ vertrauen: b.vertrauen, kette: b.kette })
      if ('fehler' in r) return (json(res, 400, r), true)
      protokolliereServer('verwaltung', `Krisenhinweise: Meldeweg geändert (${r.vertrauen.length} Vertrauensperson(en))`, ich.id)
      return (json(res, 200, r), true)
    }
    const e = await import('./erinnerungen')
    if (teil === 'geraet') {
      const abo = e.aboPruefen(b.abo)
      if (!abo) return (json(res, 400, { fehler: 'Dieses Gerät lässt sich für Benachrichtigungen nicht anmelden.' }), true)
      if (typeof b.alt === 'string' && b.alt !== abo.endpoint) e.geraetEntfernen(ich.id, b.alt)
      e.geraetSpeichern(ich.id, sitzung.kennung, abo)
      return (json(res, 200, { ok: true, geraete: e.geraeteVon(ich.id).length }), true)
    }
    if (teil === 'geraet-pruefen') {
      const ep = typeof b.endpoint === 'string' ? b.endpoint : ''
      return (json(res, 200, { registriert: Boolean(ep) && e.geraeteVon(ich.id).some((g) => g.endpoint === ep) }), true)
    }
    if (teil === 'geraet-entfernen') {
      if (typeof b.endpoint === 'string') e.geraetEntfernen(ich.id, b.endpoint)
      return (json(res, 200, { ok: true, geraete: e.geraeteVon(ich.id).length }), true)
    }
    if (teil === 'test') {
      if (Date.now() - (testZuletzt.get(ich.id) ?? 0) < 20_000) return (json(res, 429, { fehler: 'Bitte kurz warten.' }), true)
      testZuletzt.set(ich.id, Date.now())
      const r = await e.anGeraete(
        ich.id,
        JSON.stringify({ t: 'Schul-Apps', b: 'Test: Benachrichtigungen für vertrauliche Hinweise sind eingeschaltet.', u: '/', l: 'de', tag: 'sa-krise-test' })
      )
      return (json(res, 200, { gesendet: r.ok, geraete: e.geraeteVon(ich.id).length }), true)
    }
    return (json(res, 404, { fehler: 'Unbekannt.' }), true)
  }
}
