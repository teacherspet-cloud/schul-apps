/**
 * Erinnerungen zum Üben per Web Push (10.10.2026, Entscheidungen der Lehrkraft; Regeln in shared/erinnerungen.ts,
 * Verschlüsselung in webPush.ts, Hintergrund in recherche/web-push-erinnerungen.md).
 *
 *  - Die Lehrkraft bietet Erinnerungen je Kurs an (Kurseinstellungen, Vorgabe: nicht angeboten). Zieht sie das Angebot
 *    zurück oder endet der Kurs, kommen keine mehr.
 *  - Lernende schalten sie selbst ein (Einstellungen › Erinnerungen; Erlaubnis des Browsers erst nach Antippen), wählen
 *    Uhrzeit, Tage, Auslöser, Ferien-Pause, Sprache und optional einen eigenen Text.
 *  - Ein leichter Zeitplaner (alle 5 Minuten) liest nur die fälligen Zeilen (Index auf aktiv/naechste) und entscheidet je
 *    Person, ob es etwas zu sagen gibt.
 *
 * Datenschutz: Geräte (Endpunkt und Schlüssel) und Einstellungen liegen verschlüsselt (feldschutz.ts: push_geraete.daten,
 * push_wahl.daten); gesucht wird ein Gerät über einen HMAC des Endpunkts. Die Nachricht ist Ende-zu-Ende verschlüsselt
 * und enthält nur Titel, Text, Ziel und Sprache – nie Namen. Geräte verschwinden bei 404/410 des Push-Dienstes, beim
 * Abmelden (Geräte dieser Sitzung, dazu meldet die Seite ihr Gerät ab), beim Sperren/Löschen des Kontos.
 *
 *  Lernende: GET  /s/api/erinnerungen                    → { angeboten, wahl, geraete, schluessel }
 *            POST /s/api/erinnerungen/wahl               { wahl }
 *            POST /s/api/erinnerungen/geraet             { abo: PushSubscription.toJSON(), alt? }
 *            POST /s/api/erinnerungen/geraet-pruefen     { endpoint } → { registriert }
 *            POST /s/api/erinnerungen/geraet-entfernen   { endpoint }
 *            POST /s/api/erinnerungen/test               → { gesendet, geraete }
 *  Lehrkraft: POST /server/vokabeln/<id>/erinnerungen { an } (vokabeln.ts); Zahl der Aktiven in GET /server/vokabeln/<id>
 */
import { createHmac } from 'node:crypto'
import { datenbank, nutzerNachId, protokolliereServer, serverGeheimnis, setzeServerGeheimnis, type NutzerInfo } from './datenbank'
import { hauptschluessel } from './geheim'
import { beimAbmelden, json, type Anfrage } from './http'
import { db as vokDb, istOffen, json_, kursHaken, standVon as vokStandVon, tageszielVon, teileVon, vokIstFuer, type Zeile as VokZeile } from './vokabeln'
import { grammatikFuerErinnerung } from './grammatik'
import { achDatenLesen } from './achievementsDaten'
import { kursFuerLernende } from '../shared/freigabePlan'
import { sitzungsWoerter, type Vokabel } from '../shared/vokabeltrainer'
import { endpunktErlaubt, pushSenden, vapidErzeugen, vapidGueltig, vonB64u, type PushZiel, type VapidSchluessel } from './webPush'
import {
  ausloeserWaehlen,
  berlin,
  berlinMs,
  nachrichtFuer,
  naechsterTermin,
  nutzlast,
  serieVon,
  STANDARD_WAHL,
  wahlBereinigt,
  wochenAnfang,
  type ErinnerungsLage,
  type ErinnerungsWahl
} from '../shared/erinnerungen'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS push_wahl (
  nutzer_id TEXT PRIMARY KEY REFERENCES nutzer(id) ON DELETE CASCADE,
  daten TEXT NOT NULL,
  aktiv INTEGER NOT NULL DEFAULT 0,
  naechste INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS push_wahl_faellig ON push_wahl(aktiv, naechste);
CREATE TABLE IF NOT EXISTS push_geraete (
  endpunkt_k TEXT PRIMARY KEY,
  nutzer_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  sitzung TEXT NOT NULL DEFAULT '',
  daten TEXT NOT NULL,
  erstellt INTEGER NOT NULL,
  fehler INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS push_geraete_nutzer ON push_geraete(nutzer_id);`

let bereit = false
const db = () => {
  const d = datenbank()
  if (!bereit) {
    d.exec(SCHEMA)
    bereit = true
  }
  return d
}

const TAG_MS = 86_400_000
/** Höchstens so viele Geräte je Person (ältere fallen heraus) */
const MAX_GERAETE = 8
/** Nach so vielen Fehlversuchen in Folge gilt ein Gerät als verloren */
const MAX_FEHLER = 10

// ---------------------------------------------------------------- Schlüssel und Versand

/** VAPID-Schlüsselpaar: einmal erzeugt, verschlüsselt bei den Servergeheimnissen */
export function vapid(): VapidSchluessel {
  try {
    const v = JSON.parse(serverGeheimnis('vapid') || 'null') as unknown
    if (vapidGueltig(v)) return v
  } catch {
    /* neu erzeugen */
  }
  const v = vapidErzeugen()
  setzeServerGeheimnis('vapid', JSON.stringify(v))
  protokolliereServer('start', 'Schlüssel für Erinnerungen (Web Push) erzeugt')
  return v
}

/** Versandweg – in Tests austauschbar */
export const versand = {
  senden: (ziel: PushZiel, text: string, v: VapidSchluessel, kontakt: string): Promise<number> =>
    pushSenden(ziel, text, v, kontakt, { lokal: process.env.SCHULAPPS_PUSH_LOKAL === '1', thema: 'erinnerung' })
}

let kontakt = 'https://www.meineschulapps.de'

/** Suchschlüssel eines Endpunkts (nicht umkehrbar) */
const endpunktK = (endpoint: string): string =>
  `p1:${createHmac('sha256', createHmac('sha256', hauptschluessel()).update('push-endpunkt').digest()).update(endpoint).digest('hex')}`

// ---------------------------------------------------------------- Geräte

interface Geraet extends PushZiel {
  k: string
  fehler: number
}

export function geraeteVon(nid: string): Geraet[] {
  return (db().prepare('SELECT endpunkt_k, daten, fehler FROM push_geraete WHERE nutzer_id = ? ORDER BY erstellt').all(nid) as { endpunkt_k: string; daten: string; fehler: number }[])
    .map((z) => ({ k: z.endpunkt_k, fehler: z.fehler, ...json_(z.daten, { endpoint: '', p256dh: '', auth: '' } as PushZiel) }))
    .filter((g) => g.endpoint)
}

/** Anmeldung des Browsers prüfen: erlaubter Dienst, Schlüssel der richtigen Länge */
export function aboPruefen(roh: unknown, lokal = process.env.SCHULAPPS_PUSH_LOKAL === '1'): PushZiel | null {
  const a = (roh && typeof roh === 'object' ? roh : {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
  const endpoint = typeof a.endpoint === 'string' ? a.endpoint : ''
  const p256dh = typeof a.keys?.p256dh === 'string' ? a.keys.p256dh : ''
  const auth = typeof a.keys?.auth === 'string' ? a.keys.auth : ''
  const p = vonB64u(p256dh)
  if (p.length !== 65 || p[0] !== 4 || vonB64u(auth).length !== 16) return null
  return endpunktErlaubt(endpoint, lokal) ? { endpoint, p256dh, auth } : null
}

export function geraetSpeichern(nid: string, sitzung: string, abo: PushZiel, jetzt = Date.now()): void {
  db()
    .prepare(
      'INSERT INTO push_geraete (endpunkt_k, nutzer_id, sitzung, daten, erstellt, fehler) VALUES (?, ?, ?, ?, ?, 0) ON CONFLICT(endpunkt_k) DO UPDATE SET nutzer_id = excluded.nutzer_id, sitzung = excluded.sitzung, daten = excluded.daten, fehler = 0'
    )
    .run(endpunktK(abo.endpoint), nid, sitzung, JSON.stringify(abo), jetzt)
  const alle = geraeteVon(nid)
  for (const g of alle.slice(0, Math.max(0, alle.length - MAX_GERAETE))) geraetLoeschen(g.k)
}
const geraetLoeschen = (k: string): void => void db().prepare('DELETE FROM push_geraete WHERE endpunkt_k = ?').run(k)
export const geraetEntfernen = (nid: string, endpoint: string): void =>
  void db().prepare('DELETE FROM push_geraete WHERE endpunkt_k = ? AND nutzer_id = ?').run(endpunktK(endpoint), nid)
export const geraeteEntfernen = (nid: string): void => void db().prepare('DELETE FROM push_geraete WHERE nutzer_id = ?').run(nid)

/**
 * An alle Geräte einer Person. Erloschene Anmeldungen (404/410) werden sofort entfernt, andere Fehler gezählt
 * (nach zehn in Folge ebenfalls entfernt). Liefert die Zahl der angenommenen Nachrichten.
 */
export async function anGeraete(nid: string, text: string): Promise<{ ok: number; geraete: number }> {
  const geraete = geraeteVon(nid)
  if (!geraete.length) return { ok: 0, geraete: 0 }
  const v = vapid()
  let ok = 0
  for (const g of geraete) {
    const status = await versand.senden(g, text, v, kontakt).catch(() => 0)
    if (status >= 200 && status < 300) {
      ok++
      if (g.fehler) db().prepare('UPDATE push_geraete SET fehler = 0 WHERE endpunkt_k = ?').run(g.k)
    } else if (status === 404 || status === 410) geraetLoeschen(g.k)
    else if (g.fehler + 1 >= MAX_FEHLER) geraetLoeschen(g.k)
    else db().prepare('UPDATE push_geraete SET fehler = ? WHERE endpunkt_k = ?').run(g.fehler + 1, g.k)
  }
  return { ok, geraete: geraete.length }
}

// ---------------------------------------------------------------- Einstellungen und Zustand

interface Zustand {
  /** Letzter Tag, für den entschieden wurde (höchstens eine Erinnerung je Tag) */
  erledigt: string
  /** Seit wann Neues als neu gilt (ms) – beim Einschalten bzw. nach der letzten Meldung */
  neuSeit: number
  /** Schon gemeldete Termine („kurs:t:zeit") */
  termine: string[]
  /** Zuletzt gewählter Text je Auslöser (für Abwechslung) */
  letzte: Record<string, number>
}
interface Gespeichert {
  wahl: ErinnerungsWahl
  zustand: Zustand
}

export function lesen(nid: string): Gespeichert {
  const z = db().prepare('SELECT daten FROM push_wahl WHERE nutzer_id = ?').get(nid) as { daten: string } | undefined
  const g = json_(z?.daten, {} as Partial<Gespeichert>)
  const s = (g.zustand ?? {}) as Partial<Zustand>
  return {
    wahl: wahlBereinigt(g.wahl ?? STANDARD_WAHL),
    zustand: {
      erledigt: typeof s.erledigt === 'string' ? s.erledigt : '',
      neuSeit: Number(s.neuSeit) || 0,
      termine: Array.isArray(s.termine) ? s.termine.map(String).slice(-30) : [],
      letzte: s.letzte && typeof s.letzte === 'object' ? s.letzte : {}
    }
  }
}

/** Speichern und den nächsten Termin festhalten (nur diese Zahl liest der Zeitplaner unverschlüsselt) */
export function schreiben(nid: string, g: Gespeichert, jetzt = Date.now()): void {
  const t = naechsterTermin(g.wahl, g.zustand.erledigt, jetzt)
  // Lange Pause o. Ä.: einmal am Tag neu rechnen
  const naechste = t ? t.ms : jetzt + TAG_MS
  db()
    .prepare(
      'INSERT INTO push_wahl (nutzer_id, daten, aktiv, naechste) VALUES (?, ?, ?, ?) ON CONFLICT(nutzer_id) DO UPDATE SET daten = excluded.daten, aktiv = excluded.aktiv, naechste = excluded.naechste'
    )
    .run(nid, JSON.stringify(g), g.wahl.an ? 1 : 0, naechste)
}

/**
 * Neue Einstellungen der Person. Beim Einschalten gilt erst ab jetzt etwas als „neu"; ein Termin, der schon vorbei
 * ist oder gleich käme, gilt für heute als erledigt – wer gerade einstellt, bekommt nicht im selben Moment eine Erinnerung.
 */
export function wahlSetzen(nid: string, roh: unknown, jetzt = Date.now()): ErinnerungsWahl {
  const g = lesen(nid)
  const wahl = wahlBereinigt(roh)
  if (wahl.an && !g.wahl.an) g.zustand.neuSeit = jetzt
  g.wahl = wahl
  const t = naechsterTermin(wahl, g.zustand.erledigt, jetzt)
  if (t && t.ms <= jetzt + 5 * 60_000) g.zustand.erledigt = t.tag
  schreiben(nid, g, jetzt)
  return wahl
}

/** Wie viele dieser Personen Erinnerungen eingeschaltet und mindestens ein Gerät haben – nur die Zahl (Lehrkraft) */
export function aktiveZahl(nutzerIds: string[]): number {
  if (!nutzerIds.length) return 0
  const an = new Set(
    (db().prepare('SELECT nutzer_id FROM push_wahl WHERE aktiv = 1 AND nutzer_id IN (SELECT nutzer_id FROM push_geraete)').all() as { nutzer_id: string }[]).map((z) => z.nutzer_id)
  )
  return nutzerIds.filter((id) => an.has(id)).length
}

// ---------------------------------------------------------------- Lage einer Person

/** Offene Kurse dieser Person, in denen die Lehrkraft Erinnerungen anbietet */
export function angeboteneKurse(n: NutzerInfo): VokZeile[] {
  if (n.rolle !== 'schueler' || n.quelle === 'vorschau') return []
  return (vokDb().prepare("SELECT * FROM vok_zuweisungen WHERE erinnerungen = 'an' AND status = 'offen'").all() as unknown as VokZeile[]).filter(
    (z) => istOffen(z) && vokIstFuer(z, n)
  )
}

/** Was es heute zu sagen gäbe – Zahlen und Ziele, keine Namen und keine Inhalte */
export function lageVon(n: NutzerInfo, zustand: Pick<Zustand, 'neuSeit' | 'termine'>, jetzt = Date.now()): ErinnerungsLage {
  const kurse = angeboteneKurse(n)
  const heute = berlin(jetzt).tag
  const heuteUtc = new Date(jetzt).toISOString().slice(0, 10)
  const tage = new Set<string>()
  let offen = 0
  let offenZiel = ''
  let neu: ErinnerungsLage['neu'] = null
  let termin: ErinnerungsLage['termin'] = null
  for (const z0 of kurse) {
    const z = kursFuerLernende(z0, jetzt)
    const woerter = json_(z.woerter, [] as Vokabel[])
    const st = vokStandVon(z.id, n.id)
    for (const t of st.tage ?? []) tage.add(t)
    if (woerter.length) {
      const ziel = tageszielVon(z)
      const o = sitzungsWoerter(woerter, st.woerter, jetzt, ziel, ziel + 25).length
      if (o && !offenZiel) offenZiel = `/s/v/${z.id}`
      offen += o
      // Neu: Abschnitte, die seit der letzten Meldung frei wurden (geplante ab ihrem Zeitpunkt)
      for (const t of teileVon(z0) as { zeit: number; ab?: number | null }[]) {
        const ab = Number(t.ab) || 0
        if (ab > jetzt) continue
        if (Math.max(Number(t.zeit) || 0, ab) > zustand.neuSeit && !neu) neu = { art: 'vokabeln', ziel: `/s/v/${z.id}` }
      }
    }
    // Testtermin in den nächsten zwei Tagen bzw. Ende des Lernzeitraums in den nächsten drei – je einmal
    const tt = Number(z0.test_termin) || 0
    if (tt > jetzt && tt - jetzt <= 2 * TAG_MS && !zustand.termine.includes(`${z0.id}:t:${tt}`))
      termin ??= { ziel: woerter.length ? `/s/v/${z0.id}` : '/s/', schluessel: `${z0.id}:t:${tt}`, art: 'test' }
    const bis = Number(z0.bis) || 0
    if (bis > jetzt && bis - jetzt <= 3 * TAG_MS && !zustand.termine.includes(`${z0.id}:e:${bis}`))
      termin ??= { ziel: woerter.length ? `/s/v/${z0.id}` : '/s/', schluessel: `${z0.id}:e:${bis}`, art: 'ende' }
  }
  for (const g of grammatikFuerErinnerung(n, new Set(kurse.map((z) => z.id)), jetzt)) {
    for (const t of g.tage) tage.add(t)
    if (g.offen && !offenZiel) offenZiel = `/s/g/${g.id}`
    offen += g.offen
    if (g.seit > zustand.neuSeit && !neu) neu = { art: 'grammatik', ziel: `/s/g/${g.id}` }
  }
  const ach = achDatenLesen(n.id)
  for (const t of ach.tage) tage.add(t)
  const anfang = wochenAnfang(heute)
  const anfangMs = berlinMs(anfang, 0)
  return {
    kurse: kurse.length,
    heuteGeuebt: tage.has(heute) || tage.has(heuteUtc),
    offen,
    offenZiel,
    serie: serieVon(tage, heute),
    neu,
    termin,
    woche: {
      tage: [...tage].filter((t) => t >= anfang && t <= heute).length,
      abzeichen: Object.values(ach.erreicht).filter((e) => Number(e?.am) >= anfangMs).length,
      offen
    }
  }
}

// ---------------------------------------------------------------- Zeitplaner

/** Eine fällige Person bearbeiten: entscheiden, ggf. senden, nächsten Termin festhalten */
export async function bearbeiten(nid: string, jetzt = Date.now()): Promise<'gesendet' | 'nichts' | 'spaeter' | 'aus'> {
  const g = lesen(nid)
  const n = nutzerNachId(nid)
  if (!n || n.gesperrt || n.rolle !== 'schueler' || n.quelle === 'vorschau') {
    // Gesperrt oder kein Lernkonto: keine Geräte mehr, ausgeschaltet
    geraeteEntfernen(nid)
    g.wahl.an = false
    schreiben(nid, g, jetzt)
    return 'aus'
  }
  const t = naechsterTermin(g.wahl, g.zustand.erledigt, jetzt)
  if (!t || t.ms > jetzt) {
    schreiben(nid, g, jetzt)
    return 'spaeter'
  }
  // Erst festhalten, dann senden: auch bei einem Fehler höchstens eine Erinnerung je Tag
  g.zustand.erledigt = t.tag
  schreiben(nid, g, jetzt)
  if (!geraeteVon(nid).length) return 'nichts'
  const lage = lageVon(n, g.zustand, jetzt)
  const a = ausloeserWaehlen(g.wahl, lage, t.art)
  if (!a) return 'nichts'
  const nachricht = nachrichtFuer(a, g.wahl, lage, Math.random, g.zustand.letzte[a] ?? -1)
  g.zustand.letzte[a] = nachricht.nr
  if (a === 'neu') {
    if (lage.neu) g.zustand.neuSeit = jetzt
    else if (lage.termin) g.zustand.termine = [...g.zustand.termine, lage.termin.schluessel].slice(-30)
  }
  schreiben(nid, g, jetzt)
  await anGeraete(nid, nutzlast(nachricht))
  return 'gesendet'
}

let laeuft = false
/** Ein Durchgang: nur die fälligen Zeilen (Index), höchstens 300 je Durchgang */
export async function durchlauf(jetzt = Date.now()): Promise<number> {
  if (laeuft) return 0
  laeuft = true
  let n = 0
  try {
    const faellig = db().prepare('SELECT nutzer_id FROM push_wahl WHERE aktiv = 1 AND naechste <= ? ORDER BY naechste LIMIT 300').all(jetzt) as { nutzer_id: string }[]
    for (const z of faellig) {
      try {
        if ((await bearbeiten(z.nutzer_id, jetzt)) === 'gesendet') n++
      } catch (e) {
        // Eine Person darf den Durchgang nie aufhalten – für heute erledigt
        protokolliereServer('erinnerungen', `Fehler bei einer Erinnerung: ${e instanceof Error ? e.name : 'Fehler'}`)
        try {
          const g = lesen(z.nutzer_id)
          g.zustand.erledigt = berlin(jetzt).tag
          schreiben(z.nutzer_id, g, jetzt)
        } catch {
          /* beim nächsten Durchgang */
        }
      }
    }
  } finally {
    laeuft = false
  }
  return n
}

/** Zeitplaner starten (start.ts): alle 5 Minuten, der erste Durchgang eine Minute nach dem Start */
export function erinnerungenStarten(adresse: string): void {
  if (/^https:\/\//.test(adresse)) kontakt = adresse.replace(/\/$/, '')
  const los = (): void => void durchlauf().catch(() => undefined)
  setTimeout(los, 60_000).unref()
  setInterval(los, 5 * 60_000).unref()
}

// ---------------------------------------------------------------- Haken

// Lehrkraft: Zahl der Aktiven je Kurs (vokabeln.ts)
kursHaken.erinnerungenAktiv = (ids) => {
  try {
    return aktiveZahl(ids)
  } catch {
    return 0
  }
}
// Abmelden: Geräte dieser Sitzung entfernen (http.ts)
beimAbmelden.push((nid, kennung) => void db().prepare('DELETE FROM push_geraete WHERE nutzer_id = ? AND sitzung = ?').run(nid, kennung))

// ---------------------------------------------------------------- Route der Lernenden

const testZuletzt = new Map<string, number>()

export function erinnerungenRoute(adresse = ''): (k: Anfrage) => Promise<boolean> {
  if (/^https:\/\//.test(adresse)) kontakt = adresse.replace(/\/$/, '')
  return async (k) => {
    const { req, res, url, sitzung } = k
    if (!url.pathname.startsWith('/s/api/erinnerungen')) return false
    if (!sitzung) return json(res, 401, { fehler: 'Bitte zuerst anmelden.' }), true
    const ich = sitzung.nutzer
    if (ich.quelle === 'vorschau') {
      if (req.method === 'GET') return json(res, 200, { angeboten: false, vorschau: true, wahl: STANDARD_WAHL, geraete: 0 }), true
      return json(res, 403, { fehler: 'In der Vorschau gibt es keine Erinnerungen.' }), true
    }
    if (ich.rolle !== 'schueler') return json(res, 403, { fehler: 'Nur für Lernende.' }), true
    const teil = url.pathname.slice('/s/api/erinnerungen'.length).replace(/^\//, '')
    if (req.method === 'GET' && !teil) {
      const angeboten = angeboteneKurse(ich).length > 0
      return (
        json(res, 200, {
          angeboten,
          wahl: lesen(ich.id).wahl,
          geraete: geraeteVon(ich.id).length,
          ...(angeboten ? { schluessel: vapid().oeffentlich } : {})
        }),
        true
      )
    }
    if (req.method !== 'POST') return false
    if (typeof req.headers['x-schulapps-token'] !== 'string') return json(res, 403, { fehler: 'Nur aus der App.' }), true
    const k0 = (await k.koerper()) as Record<string, unknown>
    if (teil === 'wahl') return json(res, 200, { wahl: wahlSetzen(ich.id, k0.wahl) }), true
    if (teil === 'geraet') {
      if (!angeboteneKurse(ich).length) return json(res, 403, { fehler: 'Für deine Kurse sind Erinnerungen gerade nicht eingeschaltet.' }), true
      const abo = aboPruefen(k0.abo)
      if (!abo) return json(res, 400, { fehler: 'Dieses Gerät lässt sich für Erinnerungen nicht anmelden.' }), true
      if (typeof k0.alt === 'string' && k0.alt !== abo.endpoint) geraetEntfernen(ich.id, k0.alt)
      geraetSpeichern(ich.id, sitzung.kennung, abo)
      return json(res, 200, { ok: true, geraete: geraeteVon(ich.id).length }), true
    }
    if (teil === 'geraet-pruefen') {
      const e = typeof k0.endpoint === 'string' ? k0.endpoint : ''
      return json(res, 200, { registriert: Boolean(e) && geraeteVon(ich.id).some((g) => g.endpoint === e) }), true
    }
    if (teil === 'geraet-entfernen') {
      if (typeof k0.endpoint === 'string') geraetEntfernen(ich.id, k0.endpoint)
      return json(res, 200, { ok: true, geraete: geraeteVon(ich.id).length }), true
    }
    if (teil === 'test') {
      if (!angeboteneKurse(ich).length) return json(res, 403, { fehler: 'Für deine Kurse sind Erinnerungen gerade nicht eingeschaltet.' }), true
      const vorher = testZuletzt.get(ich.id) ?? 0
      if (Date.now() - vorher < 20_000) return json(res, 429, { fehler: 'Bitte kurz warten, bevor du noch eine Test-Benachrichtigung schickst.' }), true
      testZuletzt.set(ich.id, Date.now())
      const r = await anGeraete(ich.id, nutzlast(nachrichtFuer('test', lesen(ich.id).wahl, null)))
      return json(res, 200, { gesendet: r.ok, geraete: geraeteVon(ich.id).length }), true
    }
    return json(res, 404, { fehler: 'Unbekannt.' }), true
  }
}
