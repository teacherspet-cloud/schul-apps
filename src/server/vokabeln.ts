/**
 * Vokabeltrainer der Lern-App (03.10.2026) – Regeln in shared/vokabeltrainer.ts.
 *
 *  Lehrkraft: Vokabeln (Lehrwerk-Abschnitt oder eigene Liste) einer Lerngruppe oder Einzelnen
 *  zuweisen, optional mit Testtermin (Termin-Anker); Statistik je Lerngruppe und Kind (ohne Ranglisten):
 *  Verteilung auf die Fächer, Erkennen vs. Schreiben, Aktivität der letzten 7 Tage, Problemwörter
 *  mit typischen Falschantworten, Prognose zum Testtermin.
 *  Lernende: ihre Listen, Lernstand je Wort, Abfragen (der Server wertet und plant).
 *  Der Lernstand je Person liegt verschlüsselt (feldschutz.ts: vok_stand.daten, vok_zuweisungen.schueler).
 *
 *  Lehrkraft: GET /server/vokabeln · POST /server/vokabeln/freigeben · GET /server/vokabeln/<id>
 *             POST /server/vokabeln/<id>/termin|zeitraum|status|loeschen
 *  Lernende:  GET /s/api/vokabeln · GET /s/api/vokabeln/liste?id= · POST /s/api/vokabeln/antwort
 *  Gäste (eigene App „Vokabeltraining", 03.10.2026): per QR-Code/Code über einen längeren Zeitraum –
 *             GET /s/api/vokabeln/zugang?code= · POST /s/api/vokabeln/gast {code, name} → persönlicher
 *             Wiedereinstiegs-Code · POST /s/api/vokabeln/wieder {code, name, wieder}
 */
import { istRekord, nachSpielfehler, SPIELE, type SpielId } from '../shared/vokabelSpiele'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { alleNutzer, datenbank, nutzerAnlegen, nutzerLoeschen, nutzerNachId, protokolliereServer, sitzungAnlegen, type NutzerInfo } from './datenbank'
import { alsNutzer, json, setzeSitzungsCookie, type Anfrage } from './http'
import { imNutzer } from './kontext'
import { getSettings } from '../main/services/storage/settings'
import { fachFarbeAus } from '../renderer/src/shared/fachfarben'
import { alleLernenden, gastName, gehoertZu, lerngruppe, mitgliederVon } from './onlinetest'
import { iservBereit } from './anmeldung'
import { bereinigeVerbKarten } from '../shared/verbTraining'
import { istVerbSprache } from '../shared/verben'
import { jahrgangAus } from '../shared/lernstand'
import { gastEntfernen } from './gaeste'
import { registerVergessen } from './namensschutz'
import {
  bewerte,
  istSicher,
  nachAbfrage,
  neuerStand,
  satzMitLuecke,
  TAG,
  uebersicht,
  UEBUNGEN,
  type Urteil,
  type Uebung,
  type Vokabel,
  type WortStand
} from '../shared/vokabeltrainer'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS vok_zuweisungen (
  id TEXT PRIMARY KEY,
  lehrkraft_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  lerngruppe_id TEXT NOT NULL DEFAULT '',
  schueler TEXT NOT NULL DEFAULT '[]',
  titel TEXT NOT NULL,
  sprache TEXT NOT NULL DEFAULT '',
  fach TEXT NOT NULL DEFAULT '',
  woerter TEXT NOT NULL,
  test_termin INTEGER,
  reihe TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'offen',
  erstellt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vok_stand (
  zuweisung_id TEXT NOT NULL REFERENCES vok_zuweisungen(id) ON DELETE CASCADE,
  schueler_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  daten TEXT NOT NULL,
  aktualisiert INTEGER NOT NULL,
  PRIMARY KEY (zuweisung_id, schueler_id)
);
CREATE TABLE IF NOT EXISTS vok_gaeste (
  zuweisung_id TEXT NOT NULL REFERENCES vok_zuweisungen(id) ON DELETE CASCADE,
  nutzer_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  wieder TEXT NOT NULL,
  PRIMARY KEY (zuweisung_id, nutzer_id)
);`

let bereit = false
export const db = () => {
  const d = datenbank()
  if (!bereit) {
    d.exec(SCHEMA)
    const spalten = new Set((d.prepare('PRAGMA table_info(vok_zuweisungen)').all() as { name: string }[]).map((x) => x.name))
    if (!spalten.has('code')) d.exec("ALTER TABLE vok_zuweisungen ADD COLUMN code TEXT NOT NULL DEFAULT ''")
    if (!spalten.has('bis')) d.exec('ALTER TABLE vok_zuweisungen ADD COLUMN bis INTEGER')
    // Herkunft aus dem Lehrwerk (Vokabelweg, 03.10.2026): {lehrwerk, unit, abschnitte}
    if (!spalten.has('quelle')) d.exec("ALTER TABLE vok_zuweisungen ADD COLUMN quelle TEXT NOT NULL DEFAULT ''")
    // Unregelmäßige Verben der Liste (07.10.2026): {sprache, karten} – für Stammformen-Übung und Verbspiele
    if (!spalten.has('verben')) d.exec("ALTER TABLE vok_zuweisungen ADD COLUMN verben TEXT NOT NULL DEFAULT ''")
    bereit = true
  }
  return d
}
export const json_ = <T>(s: string | null | undefined, r: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : r
  } catch {
    return r
  }
}

export interface Zeile {
  id: string
  lehrkraft_id: string
  lerngruppe_id: string
  schueler: string
  titel: string
  sprache: string
  fach: string
  woerter: string
  test_termin: number | null
  reihe: string
  status: 'offen' | 'beendet'
  erstellt: string
  /** Code für Gäste (QR), leer = ohne Gäste */
  code: string
  /** Lernzeitraum bis (ms); danach abgeschlossen */
  bis: number | null
  /** Herkunft aus dem Lehrwerk (JSON), leer bei eigenen Listen */
  quelle?: string
  /** Unregelmäßige Verben der Liste (JSON {sprache, karten}, 07.10.2026) */
  verben?: string
}

/** Offen = nicht beendet und Zeitraum nicht abgelaufen */
export const istOffen = (z: Pick<Zeile, 'status' | 'bis'>): boolean => z.status === 'offen' && !(z.bis && z.bis < Date.now())

const CODE_ZEICHEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function neuerCode(n = 6): string {
  for (;;) {
    const c = Array.from(randomBytes(n), (b) => CODE_ZEICHEN[b % CODE_ZEICHEN.length]).join('')
    if (n !== 6 || !db().prepare('SELECT 1 FROM vok_zuweisungen WHERE code = ?').get(c)) return c
  }
}
const hashVon = (s: string): string =>
  createHash('sha256')
    .update(s.toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .digest('hex')
const nachCode = (code: string): Zeile | null =>
  code ? ((db().prepare("SELECT * FROM vok_zuweisungen WHERE code = ? AND code != ''").get(code.toUpperCase()) as Zeile | undefined) ?? null) : null
const gaesteVon = (zid: string): NutzerInfo[] =>
  (db().prepare('SELECT nutzer_id FROM vok_gaeste WHERE zuweisung_id = ?').all(zid) as { nutzer_id: string }[])
    .map((g) => nutzerNachId(g.nutzer_id))
    // Vorschaukonten (vorschau.ts) zählen nie mit
    .filter((n): n is NutzerInfo => Boolean(n && n.quelle !== 'vorschau'))
/** Gäste lernen über Wochen: Sitzung bis zum Ende des Zeitraums (höchstens 120 Tage, mindestens 1 Tag) */
const gastDauer = (z: Pick<Zeile, 'bis'>): number => Math.max(864e5, Math.min(120 * 864e5, (z.bis ?? Date.now() + 90 * 864e5) - Date.now() + 864e5))

/** Lernstand einer Person in einer Liste: je Wort + Übungstage (für „aktiv in den letzten 7 Tagen") */
export interface VokStand {
  woerter: Record<string, WortStand>
  tage: string[]
  /** Spiele (03.10.2026): eigener Rekord je Spiel; Wörter, die im Spiel danebengingen („nochmal ansehen") */
  rekorde?: Record<string, number>
  ansehen?: string[]
}

export const zeile = (id: string): Zeile | null => (db().prepare('SELECT * FROM vok_zuweisungen WHERE id = ?').get(id) as Zeile | undefined) ?? null
export const standVon = (zid: string, sid: string): VokStand => {
  const z = db().prepare('SELECT daten FROM vok_stand WHERE zuweisung_id = ? AND schueler_id = ?').get(zid, sid) as { daten: string } | undefined
  return json_(z?.daten, { woerter: {}, tage: [] } as VokStand)
}
export function standSpeichern(zid: string, sid: string, s: VokStand): void {
  db()
    .prepare(
      'INSERT INTO vok_stand (zuweisung_id, schueler_id, daten, aktualisiert) VALUES (?, ?, ?, ?) ON CONFLICT (zuweisung_id, schueler_id) DO UPDATE SET daten = excluded.daten, aktualisiert = excluded.aktualisiert'
    )
    .run(zid, sid, JSON.stringify(s), Date.now())
}

/** Klassenstufe der Lernenden zu einer Freigabe – Name der Lerngruppe („7a"), sonst die IServ-Gruppen; null = unbekannt */
function klasseFuer(z: Pick<Zeile, 'lerngruppe_id'>, ich: NutzerInfo): number | null {
  const g = z.lerngruppe_id ? lerngruppe(z.lerngruppe_id) : null
  const aus = [g?.name, ...ich.gruppen.map((x) => x.name)].map((n) => jahrgangAus(n)).find((j) => j && j >= 1 && j <= 13)
  return aus ?? null
}

export function vokIstFuer(z: Pick<Zeile, 'lerngruppe_id' | 'schueler'> & { id?: string }, ich: NutzerInfo): boolean {
  if (ich.rolle !== 'schueler') return false
  // Gäste (QR-Code) und Lernende mit Konto, die per Code dazugekommen sind
  if (z.id && db().prepare('SELECT 1 FROM vok_gaeste WHERE zuweisung_id = ? AND nutzer_id = ?').get(z.id, ich.id)) return true
  if (ich.quelle === 'gast') return false
  const nur = json_(z.schueler, [] as string[])
  if (!z.lerngruppe_id) return nur.includes(ich.benutzer)
  const g = lerngruppe(z.lerngruppe_id)
  if (!g || !gehoertZu(g, ich)) return false
  return !nur.length || nur.includes(ich.benutzer)
}

export function lernendeVon(z: Zeile): NutzerInfo[] {
  const nur = json_(z.schueler, [] as string[])
  const g = z.lerngruppe_id ? lerngruppe(z.lerngruppe_id) : null
  const feste = !z.lerngruppe_id
    ? alleNutzer().filter((n) => n.rolle === 'schueler' && n.quelle !== 'gast' && nur.includes(n.benutzer))
    : g
      ? mitgliederVon(g).filter((n) => !nur.length || nur.includes(n.benutzer))
      : []
  const ids = new Set(feste.map((n) => n.id))
  return [...feste, ...gaesteVon(z.id).filter((n) => !ids.has(n.id))]
}

/** Wörter bereinigen (Bilder höchstens 200 KB, höchstens 400 Wörter) */
function bereinigeWoerter(roh: unknown): Vokabel[] {
  return (Array.isArray(roh) ? roh : [])
    .slice(0, 400)
    .map((x, i) => {
      const y = (x ?? {}) as Record<string, unknown>
      const t = (k: string, n = 400): string => String(y[k] ?? '').slice(0, n)
      const bild = typeof y.bild === 'string' && y.bild.startsWith('data:image/') && y.bild.length < 200_000 ? y.bild : undefined
      return {
        id: /^[a-z0-9-]{1,40}$/i.test(String(y.id ?? '')) ? String(y.id) : `w${i}`,
        term: t('term'),
        translation: t('translation'),
        ...(y.example ? { example: t('example', 600) } : {}),
        ...(y.exampleTranslation ? { exampleTranslation: t('exampleTranslation', 600) } : {}),
        ...(y.pos ? { pos: t('pos', 60) } : {}),
        ...(y.note ? { note: t('note', 200) } : {}),
        ...(bild ? { bild } : {})
      }
    })
    .filter((v) => v.term && v.translation)
}

/** Herkunft aus dem Lehrwerk prüfen (nur Kennung, Unit, Abschnittsnamen) */
function quelleBereinigt(roh: unknown): string {
  const q = (roh ?? {}) as Record<string, unknown>
  if (typeof q.lehrwerk !== 'string' || !/^[a-z0-9-]{1,60}$/.test(q.lehrwerk) || typeof q.unit !== 'string' || !Array.isArray(q.abschnitte)) return ''
  return JSON.stringify({
    lehrwerk: q.lehrwerk,
    unit: q.unit.slice(0, 120),
    abschnitte: q.abschnitte
      .map(String)
      .slice(0, 20)
      .map((x) => x.slice(0, 120))
  })
}

/** Verben der Liste prüfen: {sprache, karten} */
function verbenBereinigt(roh: unknown): string {
  const v = (roh ?? {}) as Record<string, unknown>
  if (!istVerbSprache(v.sprache)) return ''
  const karten = bereinigeVerbKarten(v.karten)
  return karten.length ? JSON.stringify({ sprache: v.sprache, karten }) : ''
}

/** Neue Zuweisung anlegen (auch für einen Schritt einer Unterrichtsreihe) */
export function vokabelnZuweisen(e: {
  lehrkraftId: string
  lerngruppeId: string
  schueler: string[]
  titel: string
  sprache: string
  fach: string
  woerter: unknown
  testTermin?: number | null
  reihe?: string
  gaeste?: boolean
  bis?: number | null
  quelle?: unknown
  /** Unregelmäßige Verben der Liste (07.10.2026) */
  verben?: unknown
}): string {
  const id = randomBytes(8).toString('hex')
  const woerter = bereinigeWoerter(e.woerter)
  if (!woerter.length) throw new Error('Die Liste hat keine Vokabeln.')
  db()
    .prepare(
      "INSERT INTO vok_zuweisungen (id, lehrkraft_id, lerngruppe_id, schueler, titel, sprache, fach, woerter, test_termin, reihe, status, erstellt, code, bis, quelle, verben) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'offen', ?, ?, ?, ?, ?)"
    )
    .run(
      id,
      e.lehrkraftId,
      e.lerngruppeId,
      JSON.stringify(e.schueler),
      e.titel.slice(0, 160),
      e.sprache.slice(0, 8),
      e.fach.slice(0, 40),
      JSON.stringify(woerter),
      e.testTermin ?? null,
      e.reihe ?? '',
      new Date().toISOString(),
      e.gaeste ? neuerCode() : '',
      e.bis ?? null,
      quelleBereinigt(e.quelle),
      verbenBereinigt(e.verben)
    )
  return id
}

/** Für die Unterrichtsreihe: Anteil der Wörter, die mindestens in Fach 2 sind (eingeübt), in Prozent */
export function vokabelStand(zid: string, sid: string): { eingereicht: number; runden: number; prozent: number } | null {
  const z = zeile(zid)
  if (!z) return null
  const woerter = json_(z.woerter, [] as Vokabel[])
  const st = standVon(z.id, sid)
  const geuebt = woerter.filter((v) => (st.woerter[v.id]?.fach ?? 0) >= 2).length
  const prozent = woerter.length ? Math.round((geuebt / woerter.length) * 100) : 0
  return { eingereicht: Object.keys(st.woerter).length ? 1 : 0, runden: 99, prozent }
}

/** Kurzfassung für die Lernenden (auch für die Lern-App) */
export function vokabelListenFuer(
  ich: NutzerInfo
): { id: string; titel: string; fach: string; sprache: string; testTermin: number | null; uebersicht: ReturnType<typeof uebersicht> }[] {
  return (db().prepare("SELECT * FROM vok_zuweisungen WHERE status = 'offen' ORDER BY erstellt DESC").all() as unknown as Zeile[])
    .filter((z) => istOffen(z) && vokIstFuer(z, ich))
    .map((z) => ({
      id: z.id,
      titel: z.titel,
      fach: z.fach,
      sprache: z.sprache,
      testTermin: z.test_termin,
      uebersicht: uebersicht(json_(z.woerter, [] as Vokabel[]), standVon(z.id, ich.id).woerter)
    }))
}

/**
 * Fachfarbe des Kopfbands, wie die Lehrkraft sie eingestellt hat (sonst der Vorschlag des Fachs) –
 * das Vokabeltraining der Lernenden sieht aus wie ihre Arbeitsblätter (03.10.2026)
 */
export async function fachfarbeDerLehrkraft(z: Zeile): Promise<string | null> {
  const lk = nutzerNachId(z.lehrkraft_id)
  const eigene = lk ? await imNutzer(alsNutzer(lk), async () => getSettings().fachfarben).catch(() => undefined) : undefined
  return fachFarbeAus(z.fach, eigene)
}

/**
 * Eine Abfrage auswerten und den Stand des Wortes fortschreiben – für die Liste und den Vokabelweg.
 */
export function abfrageAuswerten(
  v: Vokabel,
  k0: Record<string, unknown>,
  stand: VokStand,
  testTermin?: number
): { ergebnis: { urteil: Urteil; hinweis?: string; richtig: string }; neu: WortStand } | null {
  const uebung = String(k0.uebung ?? '') as Uebung
  if (!UEBUNGEN.includes(uebung)) return null
  const antwort = String(k0.antwort ?? '').slice(0, 200)
  // Lernkarte: Selbsteinschätzung nur beim ersten Kontakt; „Stimmt das Paar?": richtig, wenn das Urteil zur gezeigten Übersetzung passt
  const paarStimmt = uebung === 'paar' ? bewerte(String(k0.gezeigt ?? ''), v.translation, true).urteil === 'richtig' : false
  const ergebnis: { urteil: Urteil; hinweis?: string; richtig: string } =
    uebung === 'karte'
      ? { urteil: k0.gewusst === true ? 'richtig' : 'falsch', richtig: v.term }
      : uebung === 'paar'
        ? { urteil: (antwort === 'stimmt') === paarStimmt ? 'richtig' : 'falsch', richtig: `${v.term} – ${v.translation}` }
        : bewerte(antwort, loesungFuer(v, uebung), uebung === 'auswahlFs')
  const jetzt = Date.now()
  const neu = nachAbfrage(
    stand.woerter[v.id] ?? neuerStand(),
    uebung,
    ergebnis.urteil,
    // „Typische Falschantworten" nur aus eigenen Antworten – nicht aus vorgegebenen Falschschreibungen oder „stimmt nicht"
    uebung === 'karte' || uebung === 'paar' || uebung === 'auswahlFs' ? '' : antwort,
    jetzt,
    testTermin
  )
  stand.woerter[v.id] = neu
  // Richtig geübt: von der Liste „nochmal ansehen" (aus den Spielen) streichen
  if (ergebnis.urteil === 'richtig' && stand.ansehen?.includes(v.id)) stand.ansehen = stand.ansehen.filter((x) => x !== v.id)
  const heute = new Date(jetzt).toISOString().slice(0, 10)
  if (!stand.tage.includes(heute)) stand.tage = [...stand.tage, heute].slice(-60)
  return { ergebnis, neu }
}

/** Spiel beendet: Rekord und „nochmal ansehen" in einen Stand eintragen */
export function spielEintragen(stand: VokStand, k0: Record<string, unknown>, gueltig: (wortId: string) => boolean): { rekord: boolean } | null {
  const spiel = String(k0.spiel ?? '') as SpielId
  const wert = Number(k0.wert)
  if (!SPIELE.some((x) => x.id === spiel) || !Number.isFinite(wert) || wert < 0 || wert > 100000) return null
  const rekord = istRekord(spiel, wert, stand.rekorde?.[spiel])
  if (rekord) stand.rekorde = { ...(stand.rekorde ?? {}), [spiel]: wert }
  const fehler = (Array.isArray(k0.fehler) ? k0.fehler : []).map(String).filter(gueltig)
  stand.ansehen = [...new Set([...(stand.ansehen ?? []), ...fehler])].slice(-30)
  // Fehler im Spiel wirken auf den Kasten (06.10.2026): wackelig, gleich wieder dran; sicher → ein Fach zurück
  const jetzt = Date.now()
  for (const id of new Set(fehler)) if (stand.woerter[id]) stand.woerter[id] = nachSpielfehler(stand.woerter[id], jetzt)
  const heute = new Date().toISOString().slice(0, 10)
  if (!stand.tage.includes(heute)) stand.tage = [...stand.tage, heute].slice(-60)
  return { rekord }
}

/** Was eine Übung als Lösung erwartet */
function loesungFuer(v: Vokabel, uebung: Uebung): string {
  if (uebung === 'auswahl' || uebung === 'hoeren') return v.translation
  if (uebung === 'luecke' && v.example) return satzMitLuecke(v.example, v.term)?.loesung ?? v.term
  return v.term
}

export function vokabelRoute(adresse = ''): (k: Anfrage) => Promise<boolean> {
  const link = (code: string): string => `${adresse.replace(/\/$/, '')}/s/vt/${code}`
  return async (k) => {
    const { url, req, res, sitzung } = k
    const schueler = url.pathname === '/s/api/vokabeln' || url.pathname.startsWith('/s/api/vokabeln/')
    const lehrer = url.pathname === '/server/vokabeln' || url.pathname.startsWith('/server/vokabeln/')
    if (!schueler && !lehrer) return false
    if (req.method === 'POST' && typeof req.headers['x-schulapps-token'] !== 'string') return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
    const sicher = Boolean((req.socket as { encrypted?: boolean }).encrypted)

    // ---------------------------------------------------------------- Zugang per Code (auch ohne Anmeldung)
    if (req.method === 'GET' && url.pathname === '/s/api/vokabeln/zugang') {
      const z = nachCode(String(url.searchParams.get('code') ?? ''))
      if (!z || !istOffen(z)) return (json(res, 404, { fehler: 'Dieses Vokabeltraining gibt es nicht (mehr). Bitte den Code prüfen.' }), true)
      return (json(res, 200, { id: z.id, titel: z.titel, gaeste: !iservBereit(), dabei: Boolean(sitzung && vokIstFuer(z, sitzung.nutzer)), bis: z.bis }), true)
    }
    if (req.method === 'POST' && (url.pathname === '/s/api/vokabeln/gast' || url.pathname === '/s/api/vokabeln/wieder')) {
      const k0 = (await k.koerper()) as Record<string, unknown>
      const z = nachCode(String(k0.code ?? ''))
      if (!z || !istOffen(z)) return (json(res, 404, { fehler: 'Dieses Vokabeltraining gibt es nicht (mehr). Bitte den Code prüfen.' }), true)
      if (sitzung && vokIstFuer(z, sitzung.nutzer)) return (json(res, 200, { ok: true, id: z.id }), true)
      // Lernende mit Konto kommen über den Code dazu – ohne Wiedereinstiegs-Code, ihr Konto reicht
      if (sitzung && sitzung.nutzer.quelle !== 'gast' && sitzung.nutzer.rolle === 'schueler') {
        db().prepare('INSERT OR IGNORE INTO vok_gaeste (zuweisung_id, nutzer_id, wieder) VALUES (?, ?, ?)').run(z.id, sitzung.nutzer.id, '')
        return (json(res, 200, { ok: true, id: z.id }), true)
      }
      if (iservBereit()) return (json(res, 403, { fehler: 'Bitte mit IServ anmelden.' }), true)
      const name = gastName(k0.name)
      if (!name) return (json(res, 400, { fehler: 'Bitte Vorname und Anfangsbuchstaben des Nachnamens eingeben, z. B. „Anna K.“' }), true)
      const gaeste = gaesteVon(z.id).filter((n) => n.quelle === 'gast')
      const gleich = gaeste.find((n) => n.name.toLowerCase() === name.toLowerCase())
      if (url.pathname === '/s/api/vokabeln/wieder') {
        // Weiterlernen an einem anderen Tag oder Gerät: Name + persönlicher Code
        const soll = gleich
          ? (db().prepare('SELECT wieder FROM vok_gaeste WHERE zuweisung_id = ? AND nutzer_id = ?').get(z.id, gleich.id) as { wieder: string } | undefined)
              ?.wieder
          : undefined
        const ist = hashVon(String(k0.wieder ?? ''))
        if (!gleich || !soll || soll.length !== ist.length || !timingSafeEqual(Buffer.from(soll), Buffer.from(ist)))
          return (json(res, 403, { fehler: 'Name und persönlicher Code passen nicht zusammen.' }), true)
        const neu = sitzungAnlegen(gleich.id, 'schueler', gastDauer(z))
        setzeSitzungsCookie(res, neu.cookie, gastDauer(z), sicher)
        protokolliereServer('vokabeln', 'Wiedereinstieg mit persönlichem Code', gleich.id)
        return (json(res, 200, { ok: true, id: z.id }), true)
      }
      if (gleich)
        return (
          json(res, 409, {
            fehler: `„${name}“ ist schon dabei. Zum Weiterlernen unten „Schon dabei?“ wählen – oder einen zweiten Buchstaben des Nachnamens dazunehmen, z. B. „Anna Ko.“`
          }),
          true
        )
      if (gaeste.length >= 120) return (json(res, 429, { fehler: 'Für dieses Training sind schon zu viele Gäste angemeldet.' }), true)
      const gast = nutzerAnlegen({ benutzer: `gast-${randomBytes(6).toString('hex')}`, name, rolle: 'schueler', quelle: 'gast' })
      registerVergessen()
      const wieder = neuerCode(6)
      db().prepare('INSERT INTO vok_gaeste (zuweisung_id, nutzer_id, wieder) VALUES (?, ?, ?)').run(z.id, gast.id, hashVon(wieder))
      const neu = sitzungAnlegen(gast.id, 'schueler', gastDauer(z))
      setzeSitzungsCookie(res, neu.cookie, gastDauer(z), sicher)
      protokolliereServer('vokabeln', 'Beitritt mit Namen (ohne IServ)', gast.id)
      return (json(res, 200, { ok: true, id: z.id, wieder }), true)
    }

    if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
    const ich = sitzung.nutzer

    // ---------------------------------------------------------------- Lernende
    if (schueler) {
      if (req.method === 'GET' && url.pathname === '/s/api/vokabeln') return (json(res, 200, { listen: vokabelListenFuer(ich) }), true)
      const id = req.method === 'GET' ? String(url.searchParams.get('id') ?? '') : String(((await k.koerper()) as Record<string, unknown>).id ?? '')
      const z = zeile(id)
      if (!z || !vokIstFuer(z, ich)) return (json(res, 404, { fehler: 'Diese Vokabeln sind nicht für dich freigegeben.' }), true)
      const woerter = json_(z.woerter, [] as Vokabel[])
      const st = standVon(z.id, ich.id)
      if (req.method === 'GET' && url.pathname === '/s/api/vokabeln/liste')
        return (
          json(res, 200, {
            id: z.id,
            titel: z.titel,
            sprache: z.sprache,
            fach: z.fach,
            testTermin: z.test_termin,
            woerter,
            staende: st.woerter,
            farbe: await fachfarbeDerLehrkraft(z),
            // Unregelmäßige Verben der Liste (07.10.2026)
            verben: json_(z.verben, null as unknown),
            // Klasse der Lernenden (Bildstufe der Beispielbilder, 07.10.2026): aus der Lerngruppe, sonst aus den eigenen Gruppen
            klasse: klasseFuer(z, ich),
            rekorde: st.rekorde ?? {},
            ansehen: st.ansehen ?? []
          }),
          true
        )
      // Spiel beendet: Rekord und „nochmal ansehen" – der Karteikasten bleibt unverändert (abgestimmt 03.10.2026)
      if (req.method === 'POST' && url.pathname === '/s/api/vokabeln/spiel') {
        const r = spielEintragen(st, (await k.koerper()) as Record<string, unknown>, (wid) => woerter.some((w) => w.id === wid))
        if (!r) return (json(res, 400, { fehler: 'Unbekanntes Spiel.' }), true)
        standSpeichern(z.id, ich.id, st)
        return (json(res, 200, { rekord: r.rekord, rekorde: st.rekorde ?? {}, ansehen: st.ansehen }), true)
      }
      if (req.method === 'POST' && url.pathname === '/s/api/vokabeln/antwort') {
        if (!istOffen(z)) return (json(res, 409, { fehler: 'Diese Liste ist abgeschlossen.' }), true)
        const k0 = (await k.koerper()) as Record<string, unknown>
        const v = woerter.find((w) => w.id === k0.wortId)
        const r = v ? abfrageAuswerten(v, k0, st, z.test_termin ?? undefined) : null
        if (!r) return (json(res, 400, { fehler: 'Unbekannte Abfrage.' }), true)
        standSpeichern(z.id, ich.id, st)
        const { ergebnis, neu } = r
        return (json(res, 200, { ...ergebnis, stand: neu, sicher: istSicher(neu) }), true)
      }
      return (json(res, 404, { fehler: 'Unbekannt.' }), true)
    }

    // ---------------------------------------------------------------- Lehrkraft
    if (ich.rolle === 'schueler') return (json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true)
    const teile = url.pathname.split('/').filter(Boolean).slice(2)
    if (req.method === 'GET' && teile.length === 0) {
      const liste = db().prepare("SELECT * FROM vok_zuweisungen WHERE lehrkraft_id = ? AND reihe = '' ORDER BY erstellt DESC").all(ich.id) as unknown as Zeile[]
      return (
        json(res, 200, {
          zuweisungen: liste.map((z) => {
            const woerter = json_(z.woerter, [] as Vokabel[])
            const lernende = lernendeVon(z)
            const sicher = lernende.map((n) => uebersicht(woerter, standVon(z.id, n.id).woerter).sicher)
            return {
              id: z.id,
              titel: z.titel,
              fach: z.fach,
              lerngruppe: z.lerngruppe_id
                ? (lerngruppe(z.lerngruppe_id)?.name ?? '')
                : z.code && !json_(z.schueler, [] as string[]).length
                  ? 'Per QR-Code'
                  : 'Einzelne Lernende',
              woerter: woerter.length,
              lernende: lernende.length,
              sicherSchnitt: lernende.length && woerter.length ? sicher.reduce((a, b) => a + b, 0) / lernende.length / woerter.length : 0,
              testTermin: z.test_termin,
              status: istOffen(z) ? 'offen' : 'beendet',
              erstellt: z.erstellt,
              bis: z.bis,
              gaeste: gaesteVon(z.id).filter((n) => n.quelle === 'gast').length,
              ...(z.code ? { code: z.code, link: link(z.code) } : {})
            }
          })
        }),
        true
      )
    }
    if (req.method === 'POST' && teile[0] === 'freigeben') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      const gid = String(k0.lerngruppeId ?? '')
      const g = gid ? lerngruppe(gid) : null
      if (gid && (!g || g.lehrkraft_id !== ich.id)) return (json(res, 400, { fehler: 'Bitte eine eigene Lerngruppe wählen.' }), true)
      const erlaubt = new Set((g ? mitgliederVon(g) : alleLernenden()).map((n) => n.benutzer))
      const einzelne = Array.isArray(k0.schueler) ? [...new Set((k0.schueler as unknown[]).map(String).filter((b) => erlaubt.has(b)))] : []
      const mitGaesten = k0.gaeste === true
      if (!g && !einzelne.length && !mitGaesten)
        return (json(res, 400, { fehler: 'Bitte eine Lerngruppe, einzelne Lernende oder den Zugang per QR-Code wählen.' }), true)
      const bis = typeof k0.bis === 'number' && k0.bis > Date.now() ? k0.bis : null
      try {
        const id = vokabelnZuweisen({
          lehrkraftId: ich.id,
          lerngruppeId: g?.id ?? '',
          schueler: einzelne,
          titel: String(k0.titel ?? 'Vokabeln'),
          sprache: String(k0.sprache ?? ''),
          fach: String(k0.fach ?? ''),
          woerter: k0.woerter,
          verben: k0.verben,
          testTermin: typeof k0.testTermin === 'number' ? k0.testTermin : null,
          gaeste: mitGaesten,
          bis,
          quelle: k0.quelle
        })
        protokolliereServer('vokabeln', 'Vokabeln zum Lernen freigegeben', ich.id)
        return (json(res, 200, { id }), true)
      } catch (e) {
        return (json(res, 400, { fehler: e instanceof Error ? e.message : String(e) }), true)
      }
    }
    const z = teile[0] ? zeile(teile[0]) : null
    if (!z || z.lehrkraft_id !== ich.id) return (json(res, 404, { fehler: 'Unbekannt.' }), true)
    if (req.method === 'GET' && teile.length === 1) {
      const woerter = json_(z.woerter, [] as Vokabel[])
      const jetzt = Date.now()
      const vor7 = new Date(jetzt - 7 * TAG).toISOString().slice(0, 10)
      // Per Code/QR beigetreten – lässt sich wieder entfernen (05.10.2026)
      const perCode = new Set(
        (db().prepare('SELECT nutzer_id FROM vok_gaeste WHERE zuweisung_id = ?').all(z.id) as { nutzer_id: string }[]).map((g) => g.nutzer_id)
      )
      const lernende = lernendeVon(z).map((n) => {
        const st = standVon(z.id, n.id)
        return {
          id: n.id,
          name: n.name || n.benutzer,
          gast: n.quelle === 'gast',
          perCode: perCode.has(n.id),
          uebersicht: uebersicht(woerter, st.woerter, jetzt),
          tage7: st.tage.filter((t) => t >= vor7).length,
          stand: st.woerter
        }
      })
      // Problemwörter: höchste Fehlerquote über die Lerngruppe, mit typischen Falschantworten
      const problem = woerter
        .map((v) => {
          let versuche = 0
          let falsch = 0
          const texte = new Map<string, number>()
          for (const l of lernende) {
            const s = l.stand[v.id]
            if (!s) continue
            versuche += s.versuche
            falsch += s.falsch
            for (const t of s.fehlerTexte) texte.set(t, (texte.get(t) ?? 0) + 1)
          }
          return {
            id: v.id,
            term: v.term,
            translation: v.translation,
            versuche,
            falsch,
            quote: versuche ? falsch / versuche : 0,
            typisch: [...texte.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([t]) => t)
          }
        })
        .filter((p) => p.versuche >= 3 && p.falsch > 0)
        .sort((a, b) => b.quote - a.quote)
        .slice(0, 12)
      return (
        json(res, 200, {
          id: z.id,
          titel: z.titel,
          fach: z.fach,
          sprache: z.sprache,
          testTermin: z.test_termin,
          status: istOffen(z) ? 'offen' : 'beendet',
          bis: z.bis,
          ...(z.code ? { code: z.code, link: link(z.code) } : {}),
          lerngruppe: z.lerngruppe_id
            ? (lerngruppe(z.lerngruppe_id)?.name ?? '')
            : z.code && !json_(z.schueler, [] as string[]).length
              ? 'Per QR-Code'
              : 'Einzelne Lernende',
          woerter,
          lernende: lernende.map(({ stand: _s, ...rest }) => rest),
          gesamt: uebersicht(
            woerter.flatMap((v) => lernende.map((l) => ({ ...v, id: `${l.id}:${v.id}` }))),
            Object.fromEntries(lernende.flatMap((l) => Object.entries(l.stand).map(([wid, s]) => [`${l.id}:${wid}`, s]))),
            jetzt
          ),
          problem
        }),
        true
      )
    }
    if (req.method === 'POST') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      if (teile[1] === 'termin') {
        db()
          .prepare('UPDATE vok_zuweisungen SET test_termin = ? WHERE id = ?')
          .run(typeof k0.testTermin === 'number' ? k0.testTermin : null, z.id)
        return (json(res, 200, { ok: true }), true)
      }
      if (teile[1] === 'zeitraum') {
        db()
          .prepare('UPDATE vok_zuweisungen SET bis = ? WHERE id = ?')
          .run(typeof k0.bis === 'number' ? k0.bis : null, z.id)
        return (json(res, 200, { ok: true }), true)
      }
      if (teile[1] === 'status') {
        const auf = k0.status !== 'beendet'
        db()
          .prepare('UPDATE vok_zuweisungen SET status = ? WHERE id = ?')
          .run(auf ? 'offen' : 'beendet', z.id)
        // Wieder öffnen nach abgelaufenem Zeitraum: Zeitraum aufheben
        if (auf && z.bis && z.bis < Date.now()) db().prepare('UPDATE vok_zuweisungen SET bis = NULL WHERE id = ?').run(z.id)
        return (json(res, 200, { ok: true }), true)
      }
      if (teile[1] === 'gast-entfernen') {
        const ok = gastEntfernen(
          { tabelle: 'vok_gaeste', spalte: 'zuweisung_id', freigabeId: z.id, stand: [{ tabelle: 'vok_stand', spalte: 'zuweisung_id' }] },
          String(k0.id ?? ''),
          ich.id
        )
        return ok ? (json(res, 200, { ok: true }), true) : (json(res, 404, { fehler: 'Diese Person ist nicht per Code beigetreten.' }), true)
      }
      if (teile[1] === 'loeschen') {
        // Gastkonten, die nur für dieses Training angelegt wurden, gehen mit
        const gaeste = gaesteVon(z.id).filter((n) => n.quelle === 'gast')
        db().prepare('DELETE FROM vok_zuweisungen WHERE id = ?').run(z.id)
        for (const n of gaeste) nutzerLoeschen(n.id)
        return (json(res, 200, { ok: true }), true)
      }
    }
    return (json(res, 404, { fehler: 'Unbekannt.' }), true)
  }
}

/**
 * „Meine Klassen" (06.10.2026): Vokabeltrainings einer Lerngruppe – Anteil sicherer Wörter je Person, letzter Übungstag,
 * Testtermin und die wackeligsten Wörter der ganzen Gruppe (Grundlage für den Vorschlag „Wackelige Wörter").
 * Runde 2 (06.10.2026): auch beendete Trainings (Status), Umfang, Zeitraum, Lehrwerk, aktive Lernende der letzten
 * 7 Tage und die schwierigsten Wörter je Training mit typischer Falschantwort. Lernstand je Person und „wackelig"
 * nur aus den laufenden Trainings (Handlungsbedarf).
 */
export function vokabelnDerGruppe(
  lehrkraftId: string,
  lerngruppeId: string,
  jetzt = Date.now()
): {
  trainings: {
    id: string
    titel: string
    sprache: string
    fach: string
    testTermin: number | null
    sicherSchnitt: number
    status: 'offen' | 'beendet'
    erstellt: string
    bis: number | null
    woerter: number
    quelle: string
    lernende: number
    aktiv7: number
    probleme: { term: string; translation: string; quote: number; typisch: string[] }[]
  }[]
  jePerson: Record<string, { sicher: number; gesamt: number; zuletzt: string | null }>
  wackelig: { term: string; translation: string; example?: string; quote: number; sprache: string; fach: string }[]
} {
  const zs = db()
    .prepare("SELECT * FROM vok_zuweisungen WHERE lehrkraft_id = ? AND lerngruppe_id = ? AND reihe = '' ORDER BY erstellt DESC")
    .all(lehrkraftId, lerngruppeId) as unknown as Zeile[]
  const jePerson: Record<string, { sicher: number; gesamt: number; zuletzt: string | null }> = {}
  const woerterFehler = new Map<string, { v: Vokabel; versuche: number; falsch: number; sprache: string; fach: string }>()
  const vor7 = new Date(jetzt - 7 * TAG).toISOString().slice(0, 10)
  const trainings = zs.map((z) => {
    const offen = istOffen(z)
    const woerter = json_(z.woerter, [] as Vokabel[])
    const anteile: number[] = []
    let aktiv7 = 0
    const jeWort = new Map<string, { v: Vokabel; versuche: number; falsch: number; texte: Map<string, number> }>()
    const lernende = lernendeVon(z)
    for (const n of lernende) {
      const st = standVon(z.id, n.id)
      const u = uebersicht(woerter, st.woerter, jetzt)
      anteile.push(u.gesamt ? u.sicher / u.gesamt : 0)
      if (st.tage.some((t) => t >= vor7)) aktiv7++
      if (offen) {
        const p = (jePerson[n.id] ??= { sicher: 0, gesamt: 0, zuletzt: null })
        p.sicher += u.sicher
        p.gesamt += u.gesamt
        const letzter = st.tage[st.tage.length - 1] ?? null
        if (letzter && (!p.zuletzt || letzter > p.zuletzt)) p.zuletzt = letzter
      }
      for (const v of woerter) {
        const w = st.woerter[v.id]
        if (!w || !w.versuche) continue
        const j = jeWort.get(v.id) ?? { v, versuche: 0, falsch: 0, texte: new Map<string, number>() }
        j.versuche += w.versuche
        j.falsch += w.falsch
        for (const t of w.fehlerTexte ?? []) j.texte.set(t, (j.texte.get(t) ?? 0) + 1)
        jeWort.set(v.id, j)
        if (!offen) continue
        const k = `${z.sprache}|${v.term}`
        const e = woerterFehler.get(k) ?? { v, versuche: 0, falsch: 0, sprache: z.sprache, fach: z.fach }
        e.versuche += w.versuche
        e.falsch += w.falsch
        woerterFehler.set(k, e)
      }
    }
    const q = json_(z.quelle || '{}', {} as { lehrwerk?: string; unit?: string; abschnitte?: string[] })
    return {
      id: z.id,
      titel: z.titel,
      sprache: z.sprache,
      fach: z.fach,
      testTermin: z.test_termin ?? null,
      sicherSchnitt: anteile.length ? anteile.reduce((a, b) => a + b, 0) / anteile.length : 0,
      status: offen ? ('offen' as const) : ('beendet' as const),
      erstellt: z.erstellt,
      bis: z.bis ?? null,
      woerter: woerter.length,
      quelle: [q.lehrwerk, q.unit, q.abschnitte?.length ? q.abschnitte.join(', ') : ''].filter(Boolean).join(' · '),
      lernende: lernende.length,
      aktiv7,
      probleme: [...jeWort.values()]
        .filter((e) => e.versuche >= 3 && e.falsch > 0)
        .sort((a, b) => b.falsch / b.versuche - a.falsch / a.versuche)
        .slice(0, 5)
        .map((e) => ({
          term: e.v.term,
          translation: e.v.translation,
          quote: e.falsch / e.versuche,
          typisch: [...e.texte.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .map(([t]) => t)
        }))
    }
  })
  const wackelig = [...woerterFehler.values()]
    .filter((e) => e.versuche >= 3 && e.falsch > 0)
    .map((e) => ({
      term: e.v.term,
      translation: e.v.translation,
      ...(e.v.example ? { example: e.v.example } : {}),
      quote: e.falsch / e.versuche,
      sprache: e.sprache,
      fach: e.fach
    }))
    .sort((a, b) => b.quote - a.quote)
    .slice(0, 15)
  return { trainings, jePerson, wackelig }
}
