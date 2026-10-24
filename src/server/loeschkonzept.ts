/**
 * Löschkonzept des Servers (23.10.2026, Prüfung des Schulträgers, Punkt 7). Regeln: loeschRegeln.ts.
 *
 * Nachtlauf (3–6 Uhr deutscher Zeit, nach der Sicherung des Hosts um 2:30) und einmal kurz nach dem Start:
 *  1. Zeitfristen: Krisenhinweise 30 Tage (wie krise.ts), Vorfälle im Sprechtraining 14 Tage (wie sprechen.ts) – bisher
 *     nur beim Zugriff gelöscht –, Prüfprotokoll nach `protokollTage` (dazu die Obergrenze 20 000 in datenbank.ts).
 *  2. IServ-Benutzerliste (falls eingerichtet und freigegeben, iservAbgleich.ts): Wer darin steht, gilt als „gesehen"
 *     (`konto_gesehen`) – auch ohne eigene Anmeldung.
 *  3. Lernende: länger als die Karenzzeit nicht gesehen → „zur Löschung vorgesehen" (`loesch_vormerkung`); nach der
 *     Frist (samt Aufschub) werden Konto und ALLE Daten gelöscht (kontoEntfernen). Wer wieder da ist, fällt heraus.
 *     Schutz: zu viele neue Vormerkungen auf einmal → in dieser Nacht keine.
 *  4. Gäste (Code/QR) nach dem Ende ihrer Freigaben bzw. ihrem letzten Besuch (ein Schuljahr).
 *  5. Lehrkräfte nie automatisch: Liste für den Admin, Löschen von Hand mit Bestätigung.
 * Jeder Lauf schreibt höchstens eine Protokollzeile – nur Zahlen. Dazu alle 10 Minuten: Wiederherstellungstests des
 * Hosts abarbeiten (sicherungen.ts › pruefungenAbarbeiten).
 *
 *   GET  /server/loeschkonzept                       Admin: alles; Lehrkraft: Vorgemerkte ihrer Lerngruppen
 *   POST /server/loeschkonzept/einstellung  {…}       Admin
 *   POST /server/loeschkonzept/aufschieben  {id}      Admin oder Lehrkraft der Person
 *   POST /server/loeschkonzept/lehrkraft-loeschen {id, bestaetigt: true}   Admin, nur abgegangene Lehrkräfte
 *   POST /server/loeschkonzept/jetzt                  Admin: Lauf sofort
 *   POST /server/loeschkonzept/nachziehen             Admin: Löschungen nach einer Wiederherstellung nachziehen (23.10.2026)
 */
import type { DatabaseSync } from 'node:sqlite'
import { alleNutzer, datenbank, iservKennungen, kontoEntfernen, nutzerNachId, protokolliereServer, serverWert, setzeServerWert, type NutzerInfo } from './datenbank'
import { ADMIN_BENUTZER, iservBereit } from './anmeldung'
import { iservKontenLaden, type IservKonto } from './iservAbgleich'
import { alleVerknuepfungen } from './kontoVerknuepfung'
import { alleLerngruppen, aufsichtVerdichten, klasseVon, lerngruppenVon, mitgliederVon } from './onlinetest'
import { loeschungenNachziehen } from './personDaten'
import { json, type Anfrage } from './http'
import { DATEN } from './pfade'
import { alteEinzelsicherungenLoeschen, pruefungenAbarbeiten, sicherungAussen } from './sicherungen'
import { registerVergessen } from './namensschutz'
import {
  abgangEntscheiden,
  einstellungBereinigen,
  freigabeLage,
  gastEntscheiden,
  grenze,
  LOESCH_GRENZEN,
  LOESCH_STANDARD,
  loeschenAb,
  massenSchutz,
  nachtlaufFaellig,
  TAG,
  zuletztGesehen,
  type GastFreigabe,
  type LoeschEinstellung
} from './loeschRegeln'

/** Wie krise.ts (AUFBEWAHREN) und sprechen.ts (VORFALL_TAGE) */
export const KRISEN_TAGE = 30
export const VORFALL_TAGE = 14
/** Partnerarbeiten (24.10.2026, partnerarbeit.ts): 90 Tage nach dem Ende */
export const PARTNERARBEIT_TAGE = 90

// ---------------------------------------------------------------- Ablage

let bereitFuer: DatabaseSync | null = null
const db = (): DatabaseSync => {
  const d = datenbank()
  if (bereitFuer !== d) {
    d.exec(`CREATE TABLE IF NOT EXISTS loesch_vormerkung (
  nutzer_id TEXT PRIMARY KEY REFERENCES nutzer(id) ON DELETE CASCADE,
  markiert INTEGER NOT NULL,
  aufschub_bis INTEGER
);
CREATE TABLE IF NOT EXISTS konto_gesehen (
  nutzer_id TEXT PRIMARY KEY REFERENCES nutzer(id) ON DELETE CASCADE,
  iserv INTEGER NOT NULL
)`)
    bereitFuer = d
  }
  return d
}

const vorhanden = (d: DatabaseSync, t: string): boolean => Boolean(d.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t))
const spaltenVon = (d: DatabaseSync, t: string): Set<string> => new Set((d.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((s) => s.name))

export const loeschEinstellung = (): LoeschEinstellung => einstellungBereinigen(serverWert('loeschkonzept', {}), LOESCH_STANDARD)

export interface LoeschStand {
  zeit: string
  anlass: string
  zahlen: Record<string, number>
  warnung: string
  iserv: { zeit: string; ok: boolean; anzahl: number; meldung: string } | null
}
export const loeschStand = (): LoeschStand | null => serverWert<LoeschStand | null>('loeschkonzept-stand', null)

function vormerkungen(): Map<string, { markiert: number; aufschubBis: number | null }> {
  const z = db().prepare('SELECT nutzer_id, markiert, aufschub_bis FROM loesch_vormerkung').all() as { nutzer_id: string; markiert: number; aufschub_bis: number | null }[]
  return new Map(z.map((x) => [x.nutzer_id, { markiert: Number(x.markiert), aufschubBis: x.aufschub_bis === null ? null : Number(x.aufschub_bis) }]))
}
function iservGesehen(): Map<string, number> {
  const z = db().prepare('SELECT nutzer_id, iserv FROM konto_gesehen').all() as { nutzer_id: string; iserv: number }[]
  return new Map(z.map((x) => [x.nutzer_id, Number(x.iserv)]))
}

// ---------------------------------------------------------------- Wer zählt wozu

/** Konten, für die die Abgangsregel gilt: Lernende aus IServ und der Klassenliste, dazu Gäste mit IServ oder in einer Lerngruppe */
export function lernendeFuerAbgang(nutzer: NutzerInfo[] = alleNutzer()): NutzerInfo[] {
  const verknuepft = new Set(alleVerknuepfungen().map((v) => v.nutzerId))
  let mitglieder = new Set<string>()
  try {
    mitglieder = new Set(alleLerngruppen().flatMap((g) => g.mitglieder))
  } catch {
    // noch keine Lerngruppen
  }
  return nutzer.filter(
    (n) =>
      n.rolle === 'schueler' &&
      (n.quelle === 'iserv' || n.quelle === 'lokal' || (n.quelle === 'gast' && (verknuepft.has(n.id) || mitglieder.has(n.benutzer))))
  )
}

/** Freigaben, an denen ein Gast hängt (Code/QR), mit offen/Ende */
export function gastFreigaben(id: string, jetzt: number): GastFreigabe[] {
  const d = db()
  const aus: GastFreigabe[] = []
  const paare: [string, string, string][] = [
    ['blatt_gaeste', 'freigabe_id', 'blatt_freigaben'],
    ['vok_gaeste', 'zuweisung_id', 'vok_zuweisungen'],
    ['feedback_gaeste', 'freigabe_id', 'feedback_freigaben'],
    ['reihe_gaeste', 'zuweisung_id', 'reihen_zuweisungen'],
    ['gram_gaeste', 'zuweisung_id', 'gram_zuweisungen']
  ]
  for (const [g, s, f] of paare) {
    if (!vorhanden(d, g) || !vorhanden(d, f)) continue
    const sp = spaltenVon(d, f)
    const zeilen = d
      .prepare(`SELECT ${sp.has('status') ? 'f.status' : 'NULL'} AS status, ${sp.has('bis') ? 'f.bis' : 'NULL'} AS bis FROM ${g} g JOIN ${f} f ON f.id = g.${s} WHERE g.nutzer_id = ?`)
      .all(id) as { status: string | null; bis: number | null }[]
    for (const z of zeilen) aus.push(freigabeLage(z.status, z.bis === null ? null : Number(z.bis), null, jetzt))
  }
  // Onlinetests: Gäste hängen über ihre Teilnahme am Test
  if (vorhanden(d, 'teilnahmen') && vorhanden(d, 'onlinetests')) {
    const zeilen = d.prepare('SELECT o.status AS status, o.beendet AS beendet FROM teilnahmen t JOIN onlinetests o ON o.id = t.test_id WHERE t.schueler_id = ?').all(id) as {
      status: string | null
      beendet: string | null
    }[]
    for (const z of zeilen) aus.push(freigabeLage(z.status, null, z.beendet, jetzt))
  }
  return aus
}

/** Lehrkräfte, die länger als die Karenzzeit nicht gesehen wurden (nur Liste – nie automatisch gelöscht) */
export function abgegangeneLehrkraefte(jetzt = Date.now(), e = loeschEinstellung()): { id: string; name: string; benutzer: string; gesehen: string; tage: number }[] {
  const iserv = iservGesehen()
  return alleNutzer()
    .filter((n) => n.rolle === 'lehrkraft' && n.quelle !== 'test' && n.benutzer !== ADMIN_BENUTZER)
    .map((n) => ({ n, g: zuletztGesehen(n, iserv.get(n.id)) }))
    .filter(({ g }) => jetzt - g >= e.abgangTage * TAG)
    .sort((a, b) => a.g - b.g)
    .map(({ n, g }) => ({ id: n.id, name: n.name, benutzer: n.benutzer, gesehen: new Date(g).toISOString(), tage: Math.floor((jetzt - g) / TAG) }))
}

// ---------------------------------------------------------------- Lauf

/** Zeitfristen (laufen immer, auch wenn das automatische Löschen von Konten aus ist) */
export function fristenLoeschen(jetzt: number, e: LoeschEinstellung): { krisen: number; vorfaelle: number; protokoll: number; partnerarbeiten: number } {
  const d = db()
  const weg = (t: string, sql: string, wert: number | string): number => (vorhanden(d, t) ? Number(d.prepare(sql).run(wert).changes) : 0)
  return {
    krisen: weg('krisen_hinweise', 'DELETE FROM krisen_hinweise WHERE zeit < ?', grenze(jetzt, KRISEN_TAGE)),
    vorfaelle: weg('sprech_vorfaelle', 'DELETE FROM sprech_vorfaelle WHERE zeit < ?', grenze(jetzt, VORFALL_TAGE)),
    protokoll: weg('protokoll', 'DELETE FROM protokoll WHERE zeit < ?', new Date(grenze(jetzt, e.protokollTage)).toISOString()),
    partnerarbeiten: weg('partner_arbeiten', 'DELETE FROM partner_arbeiten WHERE ende < ?', grenze(jetzt, PARTNERARBEIT_TAGE))
  }
}

/** Wer in der IServ-Liste steht, gilt als gesehen (Kennung/UUID oder Benutzername, wie beim Abgleich) */
export function iservListeEintragen(konten: IservKonto[], jetzt: number): number {
  if (!konten.length) return 0
  const uuids = new Set(konten.map((k) => k.uuid).filter(Boolean))
  const namen = new Set(konten.map((k) => k.benutzer).filter(Boolean))
  const subs = iservKennungen()
  const d = db()
  const verkn = new Map(alleVerknuepfungen().map((v) => [v.nutzerId, v]))
  const schreib = d.prepare('INSERT INTO konto_gesehen (nutzer_id, iserv) VALUES (?, ?) ON CONFLICT (nutzer_id) DO UPDATE SET iserv = excluded.iserv')
  let n = 0
  for (const k of alleNutzer()) {
    const v = verkn.get(k.id)
    const da =
      namen.has(k.benutzer.toLowerCase()) ||
      (subs.has(k.id) && uuids.has(subs.get(k.id)!)) ||
      Boolean(v && ((v.sub && uuids.has(v.sub.toLowerCase())) || namen.has(v.benutzer.toLowerCase())))
    if (da) (schreib.run(k.id, jetzt), n++)
  }
  return n
}

/** Ein Haken des Nachtlaufs: Fehler stoppen den übrigen Lauf nicht (beim nächsten Mal wieder) */
function nachtHaken(f: () => number): number {
  try {
    return f()
  } catch {
    return 0
  }
}

/** Löschungen nachziehen (nach einer Wiederherstellung): Konten mit vermerkter Kennung samt Daten löschen */
export function loeschungenNachholen(jetzt = Date.now()): number {
  const n = loeschungenNachziehen(
    datenbank(),
    (id) => {
      const k = nutzerNachId(id)
      if (k) kontoEntfernen(k)
    },
    jetzt
  )
  if (n) registerVergessen()
  return n
}

let laeuft = false

/** Ein Lauf des Löschkonzepts. `iservListe`: nur für Tests (statt der IDM-API) */
export async function loeschLauf(anlass: 'nacht' | 'start' | 'hand', jetzt = Date.now(), iservListe?: () => Promise<IservKonto[]>): Promise<LoeschStand> {
  if (laeuft) return loeschStand() ?? { zeit: new Date(jetzt).toISOString(), anlass, zahlen: {}, warnung: 'Läuft bereits.', iserv: null }
  laeuft = true
  try {
    const e = loeschEinstellung()
    const f = fristenLoeschen(jetzt, e)
    const zahlen: Record<string, number> = { vorgemerkt: 0, zurueck: 0, geloescht: 0, gaeste: 0, krisen: f.krisen, vorfaelle: f.vorfaelle, protokoll: f.protokoll }
    // Haken (23.10.2026, Nachprüfung des Schulträgers): Aufsichtsvermerke der Onlinetests nach 30 Tagen nur noch als
    // Zahl je Art; Löschungen nach dem Zurückspielen einer Sicherung nachziehen (personDaten.ts › geloeschte_konten)
    zahlen.aufsicht = nachtHaken(() => aufsichtVerdichten(jetzt))
    zahlen.nachgezogen = nachtHaken(() => loeschungenNachholen(jetzt))
    // Einzelsicherungen (sicherung-vor-*.db) und Vor-Update-Kopien (vor-*.db) nach 14 Tagen (sicherungen.ts)
    zahlen.einzelsicherungen = nachtHaken(() => alteEinzelsicherungenLoeschen(DATEN, jetzt))
    let warnung = ''
    // 2. IServ-Liste
    let iserv: LoeschStand['iserv'] = loeschStand()?.iserv ?? null
    if (iservListe || iservBereit()) {
      try {
        const konten = await (iservListe ?? (() => iservKontenLaden()))()
        const n = iservListeEintragen(konten, jetzt)
        iserv = { zeit: new Date(jetzt).toISOString(), ok: konten.length > 0, anzahl: n, meldung: konten.length ? '' : 'IServ hat keine Konten geliefert.' }
      } catch (x) {
        iserv = { zeit: new Date(jetzt).toISOString(), ok: false, anzahl: 0, meldung: (x instanceof Error ? x.message : String(x)).replace(/\s+/g, ' ').slice(0, 300) }
      }
    }
    /*
     * 3./4. Konten. Abgang nur mit aktueller IServ-Benutzerliste (23.10.2026, Entscheidung der Lehrkraft: Löschen erst am
     * Ende der Schulzeit): Ohne Liste hieße „nicht angemeldet“ nicht „abgegangen“ – dann wird niemand vorgemerkt oder
     * gelöscht (Gäste ohne Lerngruppe laufen weiter über ihre Freigaben).
     */
    const listeAktuell = Boolean(iserv?.ok && jetzt - Date.parse(iserv.zeit) < 3 * 24 * 3600 * 1000)
    if (e.an && !listeAktuell)
      warnung = 'Keine aktuelle IServ-Benutzerliste – Lernende werden nicht als abgegangen vorgemerkt (Freigabe iserv:idm:api-read prüfen).'
    if (e.an) {
      const alle = alleNutzer()
      const lernende = listeAktuell ? lernendeFuerAbgang(alle) : []
      const imAbgang = new Set(lernende.map((n) => n.id))
      const marken = vormerkungen()
      const gesehen = iservGesehen()
      const d = db()
      // Vormerkungen, die nicht mehr passen (Konto ist jetzt Lehrkraft o. Ä.)
      for (const id of marken.keys()) if (listeAktuell && !imAbgang.has(id)) (d.prepare('DELETE FROM loesch_vormerkung WHERE nutzer_id = ?').run(id), marken.delete(id))
      const neu: string[] = []
      const loeschen: NutzerInfo[] = []
      for (const n of lernende) {
        const m = marken.get(n.id)
        const r = abgangEntscheiden({ gesehen: zuletztGesehen(n, gesehen.get(n.id)), markiert: m?.markiert ?? null, aufschubBis: m?.aufschubBis ?? null }, e, jetzt)
        if (r === 'vormerken') neu.push(n.id)
        else if (r === 'loeschen') loeschen.push(n)
        else if (r === 'zuruecknehmen') (d.prepare('DELETE FROM loesch_vormerkung WHERE nutzer_id = ?').run(n.id), zahlen.zurueck++)
      }
      if (massenSchutz(neu.length, lernende.length, e.schwelle))
        warnung = `Abgebrochen: ${neu.length} von ${lernende.length} Lernenden wären auf einmal vorgemerkt worden. Das deutet auf einen Fehler hin (IServ-Liste, Server lange aus) – niemand wurde vorgemerkt.`
      else {
        const ein = d.prepare('INSERT OR IGNORE INTO loesch_vormerkung (nutzer_id, markiert) VALUES (?, ?)')
        for (const id of neu) ein.run(id, jetzt)
        zahlen.vorgemerkt = neu.length
      }
      for (const n of loeschen) kontoEntfernen(n)
      zahlen.geloescht = loeschen.length
      // Gäste ohne Lerngruppe und ohne IServ
      // Gäste mit Lerngruppe/IServ-Bezug ohne aktuelle Liste: nicht hier (sie gehören zur Abgangsregel)
      const abgangsGaeste = new Set(lernendeFuerAbgang(alle).map((n) => n.id))
      for (const n of alle.filter((x) => x.quelle === 'gast' && !imAbgang.has(x.id) && !abgangsGaeste.has(x.id))) {
        const r = gastEntscheiden({ wieLernende: false, freigaben: gastFreigaben(n.id, jetzt), gesehen: zuletztGesehen(n) }, e, jetzt)
        if (r === 'loeschen') (kontoEntfernen(n), zahlen.gaeste++)
      }
      if (zahlen.geloescht || zahlen.gaeste) registerVergessen()
    }
    const stand: LoeschStand = { zeit: new Date(jetzt).toISOString(), anlass, zahlen, warnung, iserv }
    setzeServerWert('loeschkonzept-stand', stand)
    if (Object.values(zahlen).some((x) => x > 0) || warnung)
      protokolliereServer(
        'loeschkonzept',
        `Löschkonzept (${anlass}): ${zahlen.vorgemerkt} vorgemerkt, ${zahlen.zurueck} zurückgenommen, ${zahlen.geloescht} Lernende und ${zahlen.gaeste} Gäste gelöscht, ` +
          `${zahlen.krisen} Krisenhinweise, ${zahlen.vorfaelle} Vorfälle, ${zahlen.protokoll} Protokollzeilen entfernt, ` +
          `${zahlen.aufsicht} Aufsichtsprotokolle verdichtet, ${zahlen.nachgezogen} Löschungen nachgezogen${warnung ? ` – ${warnung}` : ''}`
      )
    return stand
  } finally {
    laeuft = false
  }
}

/** Zeitplaner (start.ts): kurz nach dem Start einmal, dann alle 10 Minuten prüfen, ob die Nacht dran ist */
export function loeschkonzeptStarten(): void {
  setTimeout(() => {
    try {
      pruefungenAbarbeiten(DATEN)
    } catch {
      /* beim nächsten Durchgang */
    }
    void loeschLauf('start').catch(() => undefined)
  }, 2 * 60_000).unref?.()
  setInterval(() => {
    try {
      pruefungenAbarbeiten(DATEN)
    } catch {
      /* beim nächsten Durchgang */
    }
    const letzter = Date.parse(loeschStand()?.zeit ?? '') || 0
    // Der Lauf beim Start zählt nicht als Nachtlauf
    const nacht = loeschStand()?.anlass === 'nacht' ? letzter : 0
    if (nachtlaufFaellig(Date.now(), nacht)) void loeschLauf('nacht').catch(() => undefined)
  }, 10 * 60_000).unref?.()
}

// ---------------------------------------------------------------- Listen und Schnittstelle

export interface Vorgemerkt {
  id: string
  name: string
  benutzer: string
  klasse: string
  quelle: string
  gesehen: string
  markiert: string
  loeschenAb: string
  aufgeschoben: boolean
}

export function vorgemerkteListe(nurIds?: Set<string>, e = loeschEinstellung()): Vorgemerkt[] {
  const marken = vormerkungen()
  const gesehen = iservGesehen()
  const aus: Vorgemerkt[] = []
  for (const [id, m] of marken) {
    if (nurIds && !nurIds.has(id)) continue
    const n = nutzerNachId(id)
    if (!n) continue
    aus.push({
      id,
      name: n.name,
      benutzer: n.benutzer,
      klasse: klasseVon(n),
      quelle: n.quelle,
      gesehen: new Date(zuletztGesehen(n, gesehen.get(id))).toISOString(),
      markiert: new Date(m.markiert).toISOString(),
      loeschenAb: new Date(loeschenAb(m, e) ?? m.markiert).toISOString(),
      aufgeschoben: Boolean(m.aufschubBis && m.aufschubBis > m.markiert + e.fristTage * TAG)
    })
  }
  return aus.sort((a, b) => a.loeschenAb.localeCompare(b.loeschenAb) || a.name.localeCompare(b.name, 'de'))
}

/** Lernende in den Lerngruppen einer Lehrkraft */
function lernendeDerLehrkraft(id: string): Set<string> {
  const aus = new Set<string>()
  for (const g of lerngruppenVon(id)) for (const n of mitgliederVon(g)) aus.add(n.id)
  return aus
}

export function aufschieben(id: string, jetzt = Date.now(), e = loeschEinstellung()): boolean {
  const r = db().prepare('UPDATE loesch_vormerkung SET aufschub_bis = ? WHERE nutzer_id = ?').run(jetzt + e.aufschubTage * TAG, id)
  return Number(r.changes) > 0
}

export async function loeschkonzeptRoute(k: Anfrage): Promise<boolean> {
  const { url, req, res, sitzung } = k
  if (url.pathname !== '/server/loeschkonzept' && !url.pathname.startsWith('/server/loeschkonzept/')) return false
  if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
  const ich = sitzung.nutzer
  if (ich.rolle === 'schueler') return (json(res, 403, { fehler: 'Nur für Lehrkräfte und die Verwaltung.' }), true)
  const admin = ich.rolle === 'admin'
  const was = url.pathname.slice('/server/loeschkonzept'.length).replace(/^\//, '')
  const e = loeschEinstellung()

  if (req.method === 'GET' && was === '') {
    if (!admin) return (json(res, 200, { vorgemerkt: vorgemerkteListe(lernendeDerLehrkraft(ich.id), e), einstellung: { fristTage: e.fristTage, aufschubTage: e.aufschubTage } }), true)
    return (
      json(res, 200, {
        einstellung: e,
        standard: LOESCH_STANDARD,
        grenzen: LOESCH_GRENZEN,
        stand: loeschStand(),
        iservBereit: iservBereit(),
        lernende: lernendeFuerAbgang().length,
        vorgemerkt: vorgemerkteListe(undefined, e),
        lehrkraefte: abgegangeneLehrkraefte(Date.now(), e),
        sicherung: sicherungAussen(DATEN)
      }),
      true
    )
  }
  if (req.method !== 'POST') return (json(res, 405, { fehler: 'Nicht erlaubt.' }), true)
  if (typeof req.headers['x-schulapps-token'] !== 'string') return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
  const k0 = ((await k.koerper()) ?? {}) as Record<string, unknown>

  if (was === 'aufschieben') {
    const id = String(k0.id ?? '')
    if (!admin && !lernendeDerLehrkraft(ich.id).has(id)) return (json(res, 404, { fehler: 'Diese Person ist in keiner eigenen Lerngruppe.' }), true)
    if (!aufschieben(id, Date.now(), e)) return (json(res, 404, { fehler: 'Diese Person ist nicht zur Löschung vorgesehen.' }), true)
    protokolliereServer('loeschkonzept', `Löschung um ${e.aufschubTage} Tage aufgeschoben (1 Konto)`, ich.id)
    return (json(res, 200, { ok: true, vorgemerkt: vorgemerkteListe(admin ? undefined : lernendeDerLehrkraft(ich.id), e) }), true)
  }
  if (!admin) return (json(res, 403, { fehler: 'Nur für die Verwaltung.' }), true)
  if (was === 'einstellung') {
    const neu = einstellungBereinigen(k0, e)
    setzeServerWert('loeschkonzept', neu)
    protokolliereServer(
      'loeschkonzept',
      `Löschkonzept geändert (${neu.an ? 'an' : 'aus'}, Karenz ${neu.abgangTage} T., Frist ${neu.fristTage} T., Gäste ${neu.gastTage} T., Protokoll ${neu.protokollTage} T.)`,
      ich.id
    )
    return (json(res, 200, { einstellung: neu }), true)
  }
  if (was === 'jetzt') {
    const stand = await loeschLauf('hand')
    return (json(res, 200, { stand }), true)
  }
  // „Löschungen nachziehen" (23.10.2026): nach dem Zurückspielen einer Sicherung sofort statt erst in der Nacht
  if (was === 'nachziehen') {
    const n = loeschungenNachholen()
    protokolliereServer('loeschkonzept', `Löschungen nachgezogen (${n} Konten)`, ich.id)
    return (json(res, 200, { ok: true, nachgezogen: n }), true)
  }
  if (was === 'lehrkraft-loeschen') {
    if (k0.bestaetigt !== true) return (json(res, 400, { fehler: 'Das Löschen braucht eine ausdrückliche Bestätigung.' }), true)
    const id = String(k0.id ?? '')
    if (id === ich.id) return (json(res, 400, { fehler: 'Das eigene Konto lässt sich hier nicht löschen.' }), true)
    if (!abgegangeneLehrkraefte(Date.now(), e).some((x) => x.id === id)) return (json(res, 409, { fehler: 'Dieses Konto steht nicht (mehr) in der Liste der abgegangenen Lehrkräfte.' }), true)
    const n = nutzerNachId(id)
    if (!n || n.rolle !== 'lehrkraft') return (json(res, 404, { fehler: 'Unbekannt.' }), true)
    kontoEntfernen(n)
    registerVergessen()
    protokolliereServer('loeschkonzept', 'Konto einer abgegangenen Lehrkraft samt Daten gelöscht (1 Konto)', ich.id)
    return (json(res, 200, { ok: true, lehrkraefte: abgegangeneLehrkraefte(Date.now(), e) }), true)
  }
  return (json(res, 404, { fehler: 'Unbekannt.' }), true)
}
