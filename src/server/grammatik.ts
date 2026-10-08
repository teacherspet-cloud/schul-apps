/**
 * Grammatik-Lern-App (06.10.2026) – Server. Regeln in shared/grammatiktrainer.ts, Grundgerüst wie vokabeln.ts.
 *
 *  Lehrkraft: GET /server/grammatik · POST /server/grammatik/freigeben (mit dem fertigen, von der KI erzeugten Paket)
 *             GET /server/grammatik/<id> · POST /server/grammatik/<id>/status|loeschen|gast-entfernen
 *  Lernende:  GET /s/api/grammatik · GET /s/api/grammatik/liste?id= · POST /s/api/grammatik/antwort · POST /s/api/grammatik/spiel
 *  Gäste:     GET /s/api/grammatik/zugang?code= · POST /s/api/grammatik/gast {code, name} · POST /s/api/grammatik/wieder
 *
 * Der Lernstand je Person liegt verschlüsselt (feldschutz.ts: gram_stand.daten, gram_zuweisungen.schueler). Lernende lösen
 * keine KI-Anfragen aus – der Aufgabenpool entsteht einmal beim Freigeben.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  GRAMMATIK_SPIELE,
  grammatikRekord,
  paketBereinigt,
  pruefeGrammatik,
  alsKarten,
  type GrammatikPaket,
  type GrammatikSpielId
} from '../shared/grammatiktrainer'
import { istSicher, nachAbfrage, TAG, uebersicht, type Vokabel, type WortStand } from '../shared/vokabeltrainer'
import { nachSpielfehler } from '../shared/vokabelSpiele'
import { alleNutzer, datenbank, nutzerAnlegen, nutzerLoeschen, nutzerNachId, protokolliereServer, sitzungAnlegen, type NutzerInfo } from './datenbank'
import { json, setzeSitzungsCookie, type Anfrage } from './http'
import { alleLernenden, gastName, gehoertZu, lerngruppe, mitgliederVon } from './onlinetest'
import { iservBereit } from './anmeldung'
import { gastEntfernen } from './gaeste'
import { lernendeVon as vokLernende, ueberschriftVon, vokIstFuer, zeile as vokZeile } from './vokabeln'
import { registerVergessen } from './namensschutz'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS gram_zuweisungen (
  id TEXT PRIMARY KEY,
  lehrkraft_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  lerngruppe_id TEXT NOT NULL DEFAULT '',
  schueler TEXT NOT NULL DEFAULT '[]',
  titel TEXT NOT NULL,
  fach TEXT NOT NULL DEFAULT '',
  sprache TEXT NOT NULL DEFAULT '',
  thema TEXT NOT NULL DEFAULT '',
  paket TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offen',
  erstellt TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT '',
  bis INTEGER
);
CREATE TABLE IF NOT EXISTS gram_stand (
  zuweisung_id TEXT NOT NULL REFERENCES gram_zuweisungen(id) ON DELETE CASCADE,
  schueler_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  daten TEXT NOT NULL,
  aktualisiert INTEGER NOT NULL,
  PRIMARY KEY (zuweisung_id, schueler_id)
);
CREATE TABLE IF NOT EXISTS gram_gaeste (
  zuweisung_id TEXT NOT NULL REFERENCES gram_zuweisungen(id) ON DELETE CASCADE,
  nutzer_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  wieder TEXT NOT NULL,
  PRIMARY KEY (zuweisung_id, nutzer_id)
);`

let bereit = false
const db = () => {
  const d = datenbank()
  if (!bereit) {
    d.exec(SCHEMA)
    // Fest mit einem Vokabeltraining verbunden (08.10.2026, abgestimmt): gilt für genau dessen Lernende
    const spalten = new Set((d.prepare('PRAGMA table_info(gram_zuweisungen)').all() as { name: string }[]).map((s) => s.name))
    if (!spalten.has('vok_id')) d.exec("ALTER TABLE gram_zuweisungen ADD COLUMN vok_id TEXT NOT NULL DEFAULT ''")
    bereit = true
  }
  return d
}
export const grammatikZuruecksetzen = (): void => {
  bereit = false
}
const json_ = <T>(s: string | null | undefined, r: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : r
  } catch {
    return r
  }
}

interface Zeile {
  id: string
  lehrkraft_id: string
  lerngruppe_id: string
  schueler: string
  titel: string
  fach: string
  sprache: string
  thema: string
  paket: string
  status: 'offen' | 'beendet'
  erstellt: string
  code: string
  bis: number | null
  /** Verbundenes Vokabeltraining (08.10.2026) */
  vok_id?: string
}

/** Das verbundene Vokabeltraining (falls es noch existiert) */
const vokVon = (z: Zeile): ReturnType<typeof vokZeile> => (z.vok_id ? vokZeile(z.vok_id) : null)

/** Lernstand einer Person: je Aufgabe wie ein Wort im Kasten, dazu Übungstage, Rekorde, „nochmal ansehen" */
interface GramStand {
  aufgaben: Record<string, WortStand>
  tage: string[]
  rekorde?: Record<string, number>
  ansehen?: string[]
}

const istOffen = (z: Pick<Zeile, 'status' | 'bis'>): boolean => z.status === 'offen' && !(z.bis && z.bis < Date.now())
const zeile = (id: string): Zeile | null => (db().prepare('SELECT * FROM gram_zuweisungen WHERE id = ?').get(id) as Zeile | undefined) ?? null
const paketVon = (z: Zeile): GrammatikPaket => json_(z.paket, { thema: z.thema, regeln: [], aufgaben: [] } as GrammatikPaket)
const standVon = (zid: string, sid: string): GramStand =>
  json_((db().prepare('SELECT daten FROM gram_stand WHERE zuweisung_id = ? AND schueler_id = ?').get(zid, sid) as { daten: string } | undefined)?.daten, {
    aufgaben: {},
    tage: []
  } as GramStand)
function standSpeichern(zid: string, sid: string, s: GramStand): void {
  db()
    .prepare(
      'INSERT INTO gram_stand (zuweisung_id, schueler_id, daten, aktualisiert) VALUES (?, ?, ?, ?) ON CONFLICT (zuweisung_id, schueler_id) DO UPDATE SET daten = excluded.daten, aktualisiert = excluded.aktualisiert'
    )
    .run(zid, sid, JSON.stringify(s), Date.now())
}

const CODE_ZEICHEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function neuerCode(n = 6): string {
  for (;;) {
    const c = Array.from(randomBytes(n), (b) => CODE_ZEICHEN[b % CODE_ZEICHEN.length]).join('')
    if (!db().prepare('SELECT 1 FROM gram_zuweisungen WHERE code = ?').get(c)) return c
  }
}
const hashVon = (s: string): string =>
  createHash('sha256')
    .update(s.toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .digest('hex')
const nachCode = (code: string): Zeile | null =>
  code ? ((db().prepare("SELECT * FROM gram_zuweisungen WHERE code = ? AND code != ''").get(code.toUpperCase()) as Zeile | undefined) ?? null) : null
const gaesteVon = (zid: string): NutzerInfo[] =>
  (db().prepare('SELECT nutzer_id FROM gram_gaeste WHERE zuweisung_id = ?').all(zid) as { nutzer_id: string }[])
    .map((g) => nutzerNachId(g.nutzer_id))
    // Vorschaukonten (vorschau.ts) zählen nie mit
    .filter((n): n is NutzerInfo => Boolean(n && n.quelle !== 'vorschau'))
const gastDauer = (z: Pick<Zeile, 'bis'>): number => Math.max(864e5, Math.min(120 * 864e5, (z.bis ?? Date.now() + 90 * 864e5) - Date.now() + 864e5))

function istFuer(z: Zeile, ich: NutzerInfo): boolean {
  if (ich.rolle !== 'schueler') return false
  if (db().prepare('SELECT 1 FROM gram_gaeste WHERE zuweisung_id = ? AND nutzer_id = ?').get(z.id, ich.id)) return true
  // Verbunden mit einem Vokabeltraining: wer dort lernt (auch eingetragene Gäste), hat auch diese Grammatik
  const v = vokVon(z)
  if (v && vokIstFuer(v, ich)) return true
  if (ich.quelle === 'gast') return false
  const nur = json_(z.schueler, [] as string[])
  if (!z.lerngruppe_id) return nur.includes(ich.benutzer)
  const g = lerngruppe(z.lerngruppe_id)
  if (!g || !gehoertZu(g, ich)) return false
  return !nur.length || nur.includes(ich.benutzer)
}

function lernendeVon(z: Zeile): NutzerInfo[] {
  const nur = json_(z.schueler, [] as string[])
  const g = z.lerngruppe_id ? lerngruppe(z.lerngruppe_id) : null
  const feste = !z.lerngruppe_id
    ? alleNutzer().filter((n) => n.rolle === 'schueler' && n.quelle !== 'gast' && nur.includes(n.benutzer))
    : g
      ? mitgliederVon(g).filter((n) => !nur.length || nur.includes(n.benutzer))
      : []
  const v = vokVon(z)
  if (v) {
    // Lernende des verbundenen Vokabeltrainings – zusätzlich zu den bisherigen Empfängern
    const ids = new Set<string>()
    return [...vokLernende(v), ...feste, ...gaesteVon(z.id)].filter((n) => !ids.has(n.id) && Boolean(ids.add(n.id)))
  }
  const ids = new Set(feste.map((n) => n.id))
  return [...feste, ...gaesteVon(z.id).filter((n) => !ids.has(n.id))]
}

const karten = (p: GrammatikPaket): Vokabel[] => alsKarten(p.aufgaben) as Vokabel[]

/** Für den Lernraum der Lernenden */
export function grammatikFuer(ich: NutzerInfo): { id: string; titel: string; fach: string; uebersicht: ReturnType<typeof uebersicht> }[] {
  return (db().prepare("SELECT * FROM gram_zuweisungen WHERE status = 'offen' ORDER BY erstellt DESC").all() as unknown as Zeile[])
    .filter((z) => istOffen(z) && istFuer(z, ich))
    .map((z) => ({ id: z.id, titel: z.titel, fach: z.fach, uebersicht: uebersicht(karten(paketVon(z)), standVon(z.id, ich.id).aufgaben) }))
}

/** Vorschaukonto („Als Schüler ansehen", vorschau.ts): Beispielstand je offenem Training – `stand` bekommt die Kennungen der Aufgaben */
export function grammatikStandSetzen(ich: NutzerInfo, stand: (ids: string[]) => { aufgaben: Record<string, WortStand>; tage: string[] }): void {
  for (const z of (db().prepare("SELECT * FROM gram_zuweisungen WHERE status = 'offen'").all() as unknown as Zeile[]).filter(
    (z) => istOffen(z) && istFuer(z, ich)
  ))
    standSpeichern(z.id, ich.id, stand(karten(paketVon(z)).map((k) => k.id)))
}

/**
 * „Meine Klassen": Grammatiktrainings einer Lerngruppe – Anteil sicherer Aufgaben je Person (nur laufende), dazu je
 * Training Status, Zeitraum, Umfang, aktive Lernende der letzten 7 Tage und die schwierigsten Aufgaben (Runde 2, 06.10.2026).
 */
export function grammatikDerGruppe(
  lehrkraftId: string,
  lerngruppeId: string,
  jetzt = Date.now()
): {
  trainings: {
    id: string
    titel: string
    sicherSchnitt: number
    status: 'offen' | 'beendet'
    erstellt: string
    bis: number | null
    thema: string
    aufgaben: number
    regeln: number
    lernende: number
    aktiv7: number
    probleme: { satz: string; loesung: string; quote: number; typisch: string[] }[]
  }[]
  jePerson: Record<string, { sicher: number; gesamt: number }>
} {
  const zs = db()
    .prepare('SELECT * FROM gram_zuweisungen WHERE lehrkraft_id = ? AND lerngruppe_id = ? ORDER BY erstellt DESC')
    .all(lehrkraftId, lerngruppeId) as unknown as Zeile[]
  const jePerson: Record<string, { sicher: number; gesamt: number }> = {}
  const vor7 = new Date(jetzt - 7 * TAG).toISOString().slice(0, 10)
  const trainings = zs.map((z) => {
    const offen = istOffen(z)
    const p = paketVon(z)
    const k = karten(p)
    const lernende = lernendeVon(z)
    let aktiv7 = 0
    const jeAufgabe = new Map<string, { versuche: number; falsch: number; texte: Map<string, number> }>()
    const anteile = lernende.map((n) => {
      const st = standVon(z.id, n.id)
      const u = uebersicht(k, st.aufgaben, jetzt)
      if (st.tage.some((t) => t >= vor7)) aktiv7++
      for (const [id, s] of Object.entries(st.aufgaben)) {
        if (!s.versuche) continue
        const j = jeAufgabe.get(id) ?? { versuche: 0, falsch: 0, texte: new Map<string, number>() }
        j.versuche += s.versuche
        j.falsch += s.falsch
        for (const t of s.fehlerTexte ?? []) j.texte.set(t, (j.texte.get(t) ?? 0) + 1)
        jeAufgabe.set(id, j)
      }
      if (offen) {
        const q = (jePerson[n.id] ??= { sicher: 0, gesamt: 0 })
        q.sicher += u.sicher
        q.gesamt += u.gesamt
      }
      return u.gesamt ? u.sicher / u.gesamt : 0
    })
    return {
      id: z.id,
      titel: z.titel,
      sicherSchnitt: anteile.length ? anteile.reduce((a, b) => a + b, 0) / anteile.length : 0,
      status: offen ? ('offen' as const) : ('beendet' as const),
      erstellt: z.erstellt,
      bis: z.bis ?? null,
      thema: z.thema,
      aufgaben: p.aufgaben.length,
      regeln: p.regeln.length,
      lernende: lernende.length,
      aktiv7,
      probleme: p.aufgaben
        .map((a) => ({ a, j: jeAufgabe.get(a.id) }))
        .filter((x): x is { a: (typeof p.aufgaben)[number]; j: { versuche: number; falsch: number; texte: Map<string, number> } } =>
          Boolean(x.j && x.j.versuche >= 3 && x.j.falsch > 0)
        )
        .sort((x, y) => y.j.falsch / y.j.versuche - x.j.falsch / x.j.versuche)
        .slice(0, 5)
        .map(({ a, j }) => ({
          satz: a.satz || (a.teile ?? []).join(' / '),
          loesung: a.loesungen[0] ?? '',
          quote: j.falsch / j.versuche,
          typisch: [...j.texte.entries()]
            .sort((x, y) => y[1] - x[1])
            .slice(0, 2)
            .map(([t]) => t)
        }))
    }
  })
  return { trainings, jePerson }
}

export function grammatikRoute(adresse = ''): (k: Anfrage) => Promise<boolean> {
  const link = (code: string): string => `${adresse.replace(/\/$/, '')}/s/gt/${code}`
  return async (k) => {
    const { url, req, res, sitzung } = k
    const schueler = url.pathname === '/s/api/grammatik' || url.pathname.startsWith('/s/api/grammatik/')
    const lehrer = url.pathname === '/server/grammatik' || url.pathname.startsWith('/server/grammatik/')
    if (!schueler && !lehrer) return false
    if (req.method === 'POST' && typeof req.headers['x-schulapps-token'] !== 'string') return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
    const sicher = Boolean((req.socket as { encrypted?: boolean }).encrypted)

    // ---------------------------------------------------------------- Zugang per Code
    if (req.method === 'GET' && url.pathname === '/s/api/grammatik/zugang') {
      const z = nachCode(String(url.searchParams.get('code') ?? ''))
      if (!z || !istOffen(z)) return (json(res, 404, { fehler: 'Dieses Grammatiktraining gibt es nicht (mehr). Bitte den Code prüfen.' }), true)
      return (json(res, 200, { id: z.id, titel: z.titel, gaeste: !iservBereit(), dabei: Boolean(sitzung && istFuer(z, sitzung.nutzer)), bis: z.bis }), true)
    }
    if (req.method === 'POST' && (url.pathname === '/s/api/grammatik/gast' || url.pathname === '/s/api/grammatik/wieder')) {
      const k0 = (await k.koerper()) as Record<string, unknown>
      const z = nachCode(String(k0.code ?? ''))
      if (!z || !istOffen(z)) return (json(res, 404, { fehler: 'Dieses Grammatiktraining gibt es nicht (mehr). Bitte den Code prüfen.' }), true)
      if (sitzung && istFuer(z, sitzung.nutzer)) return (json(res, 200, { ok: true, id: z.id }), true)
      if (sitzung && sitzung.nutzer.quelle !== 'gast' && sitzung.nutzer.rolle === 'schueler') {
        db().prepare('INSERT OR IGNORE INTO gram_gaeste (zuweisung_id, nutzer_id, wieder) VALUES (?, ?, ?)').run(z.id, sitzung.nutzer.id, '')
        return (json(res, 200, { ok: true, id: z.id }), true)
      }
      if (iservBereit()) return (json(res, 403, { fehler: 'Bitte mit IServ anmelden.' }), true)
      const name = gastName(k0.name)
      if (!name) return (json(res, 400, { fehler: 'Bitte Vorname und Anfangsbuchstaben des Nachnamens eingeben, z. B. „Anna K.“' }), true)
      const gaeste = gaesteVon(z.id).filter((n) => n.quelle === 'gast')
      const gleich = gaeste.find((n) => n.name.toLowerCase() === name.toLowerCase())
      if (url.pathname === '/s/api/grammatik/wieder') {
        const soll = gleich
          ? (db().prepare('SELECT wieder FROM gram_gaeste WHERE zuweisung_id = ? AND nutzer_id = ?').get(z.id, gleich.id) as { wieder: string } | undefined)
              ?.wieder
          : undefined
        const ist = hashVon(String(k0.wieder ?? ''))
        if (!gleich || !soll || soll.length !== ist.length || !timingSafeEqual(Buffer.from(soll), Buffer.from(ist)))
          return (json(res, 403, { fehler: 'Name und persönlicher Code passen nicht zusammen.' }), true)
        const neu = sitzungAnlegen(gleich.id, 'schueler', gastDauer(z))
        setzeSitzungsCookie(res, neu.cookie, gastDauer(z), sicher)
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
      db().prepare('INSERT INTO gram_gaeste (zuweisung_id, nutzer_id, wieder) VALUES (?, ?, ?)').run(z.id, gast.id, hashVon(wieder))
      const neu = sitzungAnlegen(gast.id, 'schueler', gastDauer(z))
      setzeSitzungsCookie(res, neu.cookie, gastDauer(z), sicher)
      protokolliereServer('grammatik', 'Beitritt mit Namen (ohne IServ)', gast.id)
      return (json(res, 200, { ok: true, id: z.id, wieder }), true)
    }

    if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
    const ich = sitzung.nutzer

    // ---------------------------------------------------------------- Lernende
    if (schueler) {
      if (req.method === 'GET' && url.pathname === '/s/api/grammatik') return (json(res, 200, { listen: grammatikFuer(ich) }), true)
      const k0 = req.method === 'POST' ? ((await k.koerper()) as Record<string, unknown>) : {}
      const id = req.method === 'GET' ? String(url.searchParams.get('id') ?? '') : String(k0.id ?? '')
      const z = zeile(id)
      if (!z || !istFuer(z, ich)) return (json(res, 404, { fehler: 'Dieses Grammatiktraining ist nicht für dich freigegeben.' }), true)
      const p = paketVon(z)
      const st = standVon(z.id, ich.id)
      if (req.method === 'GET' && url.pathname === '/s/api/grammatik/liste')
        return (
          json(res, 200, {
            id: z.id,
            titel: z.titel,
            fach: z.fach,
            sprache: z.sprache,
            paket: p,
            staende: st.aufgaben,
            rekorde: st.rekorde ?? {},
            ansehen: st.ansehen ?? []
          }),
          true
        )
      if (req.method === 'POST' && url.pathname === '/s/api/grammatik/antwort') {
        if (!istOffen(z)) return (json(res, 409, { fehler: 'Dieses Training ist abgeschlossen.' }), true)
        const a = p.aufgaben.find((x) => x.id === k0.aufgabeId)
        if (!a) return (json(res, 400, { fehler: 'Unbekannte Aufgabe.' }), true)
        // Tabellen und Bestimmungen kommen als JSON – deshalb mehr Platz als für einen Satz
        const antwort = String(k0.antwort ?? '').slice(0, 4000)
        const selbst = k0.selbst === 'richtig' || k0.selbst === 'fast' || k0.selbst === 'falsch' ? k0.selbst : undefined
        const e = pruefeGrammatik(a, antwort, typeof k0.wort === 'string' ? k0.wort : undefined, selbst)
        const jetzt = Date.now()
        const neu = nachAbfrage(
          st.aufgaben[a.id] ?? { fach: 0, faellig: 0, frei: [], erkannt: 0, erkennenVersuche: 0, versuche: 0, falsch: 0, fehlerTexte: [], zuletzt: 0 },
          'frei',
          e.urteil,
          antwort,
          jetzt
        )
        st.aufgaben[a.id] = neu
        if (e.urteil === 'richtig' && st.ansehen?.includes(a.id)) st.ansehen = st.ansehen.filter((x) => x !== a.id)
        const heute = new Date(jetzt).toISOString().slice(0, 10)
        if (!st.tage.includes(heute)) st.tage = [...st.tage, heute].slice(-60)
        standSpeichern(z.id, ich.id, st)
        return (json(res, 200, { urteil: e.urteil, richtig: e.richtig, erklaerung: a.erklaerung ?? '', stand: neu, sicher: istSicher(neu) }), true)
      }
      if (req.method === 'POST' && url.pathname === '/s/api/grammatik/spiel') {
        const spiel = String(k0.spiel ?? '') as GrammatikSpielId
        const wert = Number(k0.wert)
        if (!GRAMMATIK_SPIELE.some((x) => x.id === spiel) || !Number.isFinite(wert) || wert < 0 || wert > 100000)
          return (json(res, 400, { fehler: 'Unbekanntes Spiel.' }), true)
        const rekord = grammatikRekord(spiel, wert, st.rekorde?.[spiel])
        if (rekord) st.rekorde = { ...(st.rekorde ?? {}), [spiel]: wert }
        // Fehler wie bei den Vokabelspielen: wackelig, gleich wieder dran; sichere ein Fach zurück
        const fehler = (Array.isArray(k0.fehler) ? k0.fehler : []).map(String).filter((x) => p.aufgaben.some((a) => a.id === x))
        st.ansehen = [...new Set([...(st.ansehen ?? []), ...fehler])].slice(-30)
        for (const f of new Set(fehler)) if (st.aufgaben[f]) st.aufgaben[f] = nachSpielfehler(st.aufgaben[f])
        const heute = new Date().toISOString().slice(0, 10)
        if (!st.tage.includes(heute)) st.tage = [...st.tage, heute].slice(-60)
        standSpeichern(z.id, ich.id, st)
        return (json(res, 200, { rekord, rekorde: st.rekorde ?? {}, ansehen: st.ansehen }), true)
      }
      return (json(res, 404, { fehler: 'Unbekannt.' }), true)
    }

    // ---------------------------------------------------------------- Lehrkraft
    if (ich.rolle === 'schueler') return (json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true)
    const teile = url.pathname.split('/').filter(Boolean).slice(2)
    const gruppeName = (z: Zeile): string =>
      vokVon(z)
        ? `${z.lerngruppe_id ? `${lerngruppe(z.lerngruppe_id)?.name ?? ''} + ` : ''}wie Vokabeltraining „${ueberschriftVon(vokVon(z)!)}“`
        : z.lerngruppe_id ? (lerngruppe(z.lerngruppe_id)?.name ?? '') : z.code && !json_(z.schueler, [] as string[]).length ? 'Per QR-Code' : 'Einzelne Lernende'
    if (req.method === 'GET' && teile.length === 0) {
      const liste = db().prepare('SELECT * FROM gram_zuweisungen WHERE lehrkraft_id = ? ORDER BY erstellt DESC').all(ich.id) as unknown as Zeile[]
      return (
        json(res, 200, {
          zuweisungen: liste.map((z) => {
            const kk = karten(paketVon(z))
            const l = lernendeVon(z)
            const sicherZahl = l.map((n) => uebersicht(kk, standVon(z.id, n.id).aufgaben).sicher)
            return {
              id: z.id,
              titel: z.titel,
              fach: z.fach,
              thema: z.thema,
              lerngruppe: gruppeName(z),
              vokId: z.vok_id ?? '',
              aufgaben: kk.length,
              lernende: l.length,
              sicherSchnitt: l.length && kk.length ? sicherZahl.reduce((a, b) => a + b, 0) / l.length / kk.length : 0,
              status: istOffen(z) ? 'offen' : 'beendet',
              erstellt: z.erstellt,
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
      // Lernende eines eigenen Vokabeltrainings (08.10.2026)
      const vok = k0.vokId ? vokZeile(String(k0.vokId)) : null
      if (k0.vokId && (!vok || vok.lehrkraft_id !== ich.id)) return (json(res, 400, { fehler: 'Bitte ein eigenes Vokabeltraining wählen.' }), true)
      if (!g && !einzelne.length && !mitGaesten && !vok)
        return (json(res, 400, { fehler: 'Bitte eine Lerngruppe, einzelne Lernende oder den Zugang per QR-Code wählen.' }), true)
      const paket = paketBereinigt(k0.paket, String(k0.thema ?? ''))
      if (paket.aufgaben.length < 8) return (json(res, 400, { fehler: 'Der Aufgabenpool ist zu klein (mindestens 8 brauchbare Aufgaben).' }), true)
      const id = randomBytes(8).toString('hex')
      db()
        .prepare(
          "INSERT INTO gram_zuweisungen (id, lehrkraft_id, lerngruppe_id, schueler, titel, fach, sprache, thema, paket, status, erstellt, code, bis, vok_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'offen', ?, ?, ?, ?)"
        )
        .run(
          id,
          ich.id,
          g?.id ?? '',
          JSON.stringify(einzelne),
          String(k0.titel ?? paket.thema ?? 'Grammatik').slice(0, 160),
          String(k0.fach ?? '').slice(0, 40),
          String(k0.sprache ?? '').slice(0, 8),
          paket.thema.slice(0, 160),
          JSON.stringify(paket),
          new Date().toISOString(),
          mitGaesten ? neuerCode() : '',
          typeof k0.bis === 'number' && k0.bis > Date.now() ? k0.bis : null,
          vok?.id ?? ''
        )
      protokolliereServer('grammatik', 'Grammatiktraining freigegeben', ich.id)
      return (json(res, 200, { id, aufgaben: paket.aufgaben.length }), true)
    }
    const z = teile[0] ? zeile(teile[0]) : null
    if (!z || z.lehrkraft_id !== ich.id) return (json(res, 404, { fehler: 'Unbekannt.' }), true)
    if (req.method === 'GET' && teile.length === 1) {
      const p = paketVon(z)
      const kk = karten(p)
      const jetzt = Date.now()
      const vor7 = new Date(jetzt - 7 * TAG).toISOString().slice(0, 10)
      const lernende = lernendeVon(z).map((n) => {
        const st = standVon(z.id, n.id)
        return {
          id: n.id,
          name: n.name || n.benutzer,
          gast: n.quelle === 'gast',
          uebersicht: uebersicht(kk, st.aufgaben, jetzt),
          tage7: st.tage.filter((t) => t >= vor7).length,
          stand: st.aufgaben
        }
      })
      const problem = p.aufgaben
        .map((a) => {
          let versuche = 0
          let falsch = 0
          const texte = new Map<string, number>()
          for (const l of lernende) {
            const s = l.stand[a.id]
            if (!s) continue
            versuche += s.versuche
            falsch += s.falsch
            for (const t of s.fehlerTexte) texte.set(t, (texte.get(t) ?? 0) + 1)
          }
          return {
            id: a.id,
            art: a.art,
            satz: a.satz,
            loesung: a.loesungen[0],
            versuche,
            falsch,
            quote: versuche ? falsch / versuche : 0,
            typisch: [...texte.entries()]
              .sort((x, y) => y[1] - x[1])
              .slice(0, 3)
              .map(([t]) => t)
          }
        })
        .filter((x) => x.versuche >= 3 && x.falsch > 0)
        .sort((x, y) => y.quote - x.quote)
        .slice(0, 10)
      return (
        json(res, 200, {
          id: z.id,
          titel: z.titel,
          fach: z.fach,
          thema: z.thema,
          status: istOffen(z) ? 'offen' : 'beendet',
          bis: z.bis,
          ...(z.code ? { code: z.code, link: link(z.code) } : {}),
          lerngruppe: gruppeName(z),
          paket: p,
          lernende: lernende.map(({ stand: _s, ...rest }) => rest),
          problem
        }),
        true
      )
    }
    if (req.method === 'POST') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      if (teile[1] === 'status') {
        db()
          .prepare('UPDATE gram_zuweisungen SET status = ? WHERE id = ?')
          .run(k0.status === 'beendet' ? 'beendet' : 'offen', z.id)
        return (json(res, 200, { ok: true }), true)
      }
      // Mit einem Vokabeltraining verbinden bzw. lösen (08.10.2026: auch fertige Grammatiktrainings zuordnen)
      if (teile[1] === 'verbinden') {
        const vid = String(k0.vokId ?? '')
        const vok = vid ? vokZeile(vid) : null
        if (vid && (!vok || vok.lehrkraft_id !== ich.id)) return (json(res, 400, { fehler: 'Bitte ein eigenes Vokabeltraining wählen.' }), true)
        db().prepare('UPDATE gram_zuweisungen SET vok_id = ? WHERE id = ?').run(vok?.id ?? '', z.id)
        return (json(res, 200, { ok: true }), true)
      }
      if (teile[1] === 'gast-entfernen') {
        const ok = gastEntfernen(
          { tabelle: 'gram_gaeste', spalte: 'zuweisung_id', freigabeId: z.id, stand: [{ tabelle: 'gram_stand', spalte: 'zuweisung_id' }] },
          String(k0.id ?? ''),
          ich.id
        )
        return ok ? (json(res, 200, { ok: true }), true) : (json(res, 404, { fehler: 'Diese Person ist nicht per Code beigetreten.' }), true)
      }
      if (teile[1] === 'loeschen') {
        const gaeste = gaesteVon(z.id).filter((n) => n.quelle === 'gast')
        db().prepare('DELETE FROM gram_zuweisungen WHERE id = ?').run(z.id)
        // Gäste, die noch in einem Vokabel- oder anderen Grammatiktraining sind, behalten ihr Konto (08.10.2026)
        for (const n of gaeste)
          if (!db().prepare('SELECT 1 FROM gram_gaeste WHERE nutzer_id = ? UNION SELECT 1 FROM vok_gaeste WHERE nutzer_id = ?').get(n.id, n.id)) nutzerLoeschen(n.id)
        return (json(res, 200, { ok: true }), true)
      }
    }
    return (json(res, 404, { fehler: 'Unbekannt.' }), true)
  }
}
