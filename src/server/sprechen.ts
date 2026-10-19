/**
 * Sprechprüfungstraining am Server (19.10.2026, Plan „synthetic-seeking-popcorn", abgestimmt mit der Lehrkraft).
 *
 * Freigabe je Kurs (Vokabelkurs der Klasse) und Teil (Interview, Monolog, Dialog, Simulation), zeitlich begrenzt
 * (Standard 2 Wochen), mit Minutengrenze je Woche, Niveau, nur Schulzeit (7–21 Uhr).
 *
 * Gespräch OHNE Audio auf unserem Server: Der Browser schickt seine WebRTC-Beschreibung (SDP, Text) hierher; der Server
 * meldet die Sitzung mit dem Schlüssel der freigebenden Lehrkraft (sonst der Schule) bei OpenAI an
 * (POST /v1/realtime/calls, feste Anweisungen, `store` aus) und gibt die Antwort-SDP zurück. Das Audio fließt direkt
 * Browser ↔ OpenAI. Der Server hängt sich als Kontrollkanal an (wss …/realtime?call_id=): Er liest das Transkript als
 * Text im Speicher mit, setzt veränderte Anweisungen zurück (Umgehungsversuch), nimmt `uebung_beenden` entgegen und
 * legt bei Zeitablauf auf. Audio-Ereignisse verwirft er ungelesen. Gespeichert werden nur Einschätzung, Kennzahlen und
 * Tipps (verschlüsselt); das Transkript wird nach der Auswertung verworfen. Vorfälle: Art, Zeit und der eine Satz
 * (verschlüsselt, nach 14 Tagen gelöscht); nach 3 Vorfällen ist das Training für die Person gesperrt.
 *
 *   GET  /server/sprechen/verfuegbar                             Gesprächs-KI eingerichtet? (Reiter nur dann)
 *   GET  /server/sprechen?kurs=<vokId>                          Freigaben, Überblick je Person (Lehrkraft)
 *   POST /server/sprechen/freigeben {kurs, teile, tage, schueler, minutenWoche, niveau, nurSchulzeit}
 *   POST /server/sprechen/<id>/beenden · /<id>/entsperren {schueler}
 *   GET  /s/api/sprechen                                        meine Freigaben, Stand, Tipps
 *   POST /s/api/sprechen/start {freigabe, teil, modus, sdp}      → {sitzung, sdp | attrappe, karte, minuten}
 *   GET  /s/api/sprechen/status?sitzung=                         → {beendet, grund}
 *   POST /s/api/sprechen/attrappe {sitzung, text}                (nur Browsertests: Gespräch ohne KI)
 *   POST /s/api/sprechen/ende {sitzung, kennzahlen}             → Einschätzung
 */
import { randomBytes } from 'node:crypto'
import { alleNutzer, datenbank, protokolliereServer, type NutzerInfo } from './datenbank'
import { alsNutzer, json, type Anfrage, type Aufruf } from './http'
import { imNutzer } from './kontext'
import { lerngruppe } from './onlinetest'
import { vokIstFuer, zeile as vokZeile } from './vokabeln'
import { jahrgangDerGruppe } from './ueberthemen'
import { getSecret, getSettings } from '../main/services/storage/settings'
import { anweisungen, WERKZEUG_BEENDEN, type Gespraech } from '../shared/sprechen/anweisungen'
import { ATTRAPPE_EINSCHAETZUNG, bewertungsAnfrage, einschaetzungAus, istUmgehung, type Einschaetzung, type Kennzahlen, type TranskriptZeile } from '../shared/sprechen/bewertung'
import { GRUNDKARTEN, karteBereinigt, type SprechKarte } from '../shared/sprechen/karten'
import { punkteVon, type KriteriumId } from '../shared/sprechen/kriterien'
import { hoechstMinuten, NIVEAUS, stufeVonNiveau, TEILE, zielNiveau, type Niveau, type SprechSprache, type Teil } from '../shared/sprechen/niveaus'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sprech_freigaben (
  id TEXT PRIMARY KEY,
  lehrkraft_id TEXT NOT NULL,
  vok_id TEXT NOT NULL,
  lerngruppe_id TEXT NOT NULL DEFAULT '',
  schueler TEXT NOT NULL DEFAULT '[]',
  teile TEXT NOT NULL,
  bis INTEGER NOT NULL,
  einstellungen TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'offen',
  erstellt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sprech_stand (
  freigabe_id TEXT NOT NULL,
  schueler_id TEXT NOT NULL,
  daten TEXT NOT NULL,
  aktualisiert INTEGER NOT NULL,
  PRIMARY KEY (freigabe_id, schueler_id)
);
CREATE TABLE IF NOT EXISTS sprech_vorfaelle (
  id TEXT PRIMARY KEY,
  freigabe_id TEXT NOT NULL,
  schueler_id TEXT NOT NULL,
  art TEXT NOT NULL,
  satz TEXT NOT NULL DEFAULT '',
  zeit INTEGER NOT NULL
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

const json_ = <T>(s: unknown, leer: T): T => {
  try {
    return s ? (JSON.parse(String(s)) as T) : leer
  } catch {
    return leer
  }
}

const SPRACHEN: SprechSprache[] = ['en', 'fr', 'es']
const TAG = 86_400_000
export const VORFAELLE_BIS_SPERRE = 3
export const VORFALL_TAGE = 14

interface FreigabeZeile {
  id: string
  lehrkraft_id: string
  vok_id: string
  lerngruppe_id: string
  schueler: string
  teile: string
  bis: number
  einstellungen: string
  status: string
  erstellt: string
}

export interface SprechEinstellungen {
  minutenWoche: number
  niveau?: Niveau
  nurSchulzeit: boolean
  /** Vorgegebene Karten (Pool-Kennungen); leer = die App wählt */
  karten?: string[]
}

export interface Uebung {
  zeit: number
  teil: Teil
  modus: 'ueben' | 'pruefung'
  minuten: number
  wertung: Partial<Record<KriteriumId, number>>
  punkte: number
  staerke: string
  tipps: Einschaetzung['tipps']
  proaktiv?: string
  ausspracheUnsicher: boolean
}

interface StandDaten {
  uebungen: Uebung[]
  gesperrt?: boolean
}

// ---------------------------------------------------------------- Freigaben

function freigabe(id: string): FreigabeZeile | null {
  return (db().prepare('SELECT * FROM sprech_freigaben WHERE id = ?').get(id) as FreigabeZeile | undefined) ?? null
}

const einstellungenVon = (f: FreigabeZeile): SprechEinstellungen => ({ minutenWoche: 30, nurSchulzeit: true, ...json_<Partial<SprechEinstellungen>>(f.einstellungen, {}) })
const teileVon = (f: FreigabeZeile): Teil[] => json_<Teil[]>(f.teile, []).filter((t) => TEILE.includes(t))

/** Laufend und für diese Person? */
export function sprechIstFuer(f: FreigabeZeile, ich: NutzerInfo, jetzt = Date.now()): boolean {
  if (ich.rolle !== 'schueler' || f.status !== 'offen' || f.bis < jetzt) return false
  const vok = vokZeile(f.vok_id)
  if (!vok || !vokIstFuer(vok, ich)) return false
  const nur = json_<string[]>(f.schueler, [])
  return !nur.length || nur.includes(ich.benutzer)
}

function sprachUndJahrgang(f: FreigabeZeile): { sprache: SprechSprache; jahrgang: number | null } {
  const vok = vokZeile(f.vok_id)
  const sprache = (SPRACHEN.includes((vok?.sprache ?? '') as SprechSprache) ? vok!.sprache : 'en') as SprechSprache
  const g = f.lerngruppe_id ? lerngruppe(f.lerngruppe_id) : null
  return { sprache, jahrgang: g ? jahrgangDerGruppe(g) : null }
}

function niveauVon(f: FreigabeZeile): Niveau {
  const e = einstellungenVon(f)
  if (e.niveau && NIVEAUS.includes(e.niveau)) return e.niveau
  const { sprache, jahrgang } = sprachUndJahrgang(f)
  return zielNiveau(sprache, jahrgang)
}

// ---------------------------------------------------------------- Stand und Vorfälle

function standVon(fid: string, sid: string): StandDaten {
  const z = db().prepare('SELECT daten FROM sprech_stand WHERE freigabe_id = ? AND schueler_id = ?').get(fid, sid) as { daten: string } | undefined
  return json_<StandDaten>(z?.daten, { uebungen: [] })
}

function standSpeichern(fid: string, sid: string, d: StandDaten): void {
  db()
    .prepare('INSERT OR REPLACE INTO sprech_stand (freigabe_id, schueler_id, daten, aktualisiert) VALUES (?, ?, ?, ?)')
    .run(fid, sid, JSON.stringify({ ...d, uebungen: d.uebungen.slice(-60) }), Date.now())
}

/** Minuten in der laufenden Woche (ab Montag) */
export function minutenDieseWoche(u: Uebung[], jetzt = Date.now()): number {
  const d = new Date(jetzt)
  const montag = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime()
  return u.filter((x) => x.zeit >= montag).reduce((s, x) => s + x.minuten, 0)
}

function vorfaelleAufraeumen(jetzt = Date.now()): void {
  db().prepare('DELETE FROM sprech_vorfaelle WHERE zeit < ?').run(jetzt - VORFALL_TAGE * TAG)
}

export function vorfallMerken(fid: string, sid: string, art: string, satz: string, jetzt = Date.now()): { gesperrt: boolean } {
  vorfaelleAufraeumen(jetzt)
  db()
    .prepare('INSERT INTO sprech_vorfaelle (id, freigabe_id, schueler_id, art, satz, zeit) VALUES (?, ?, ?, ?, ?, ?)')
    .run(`v${randomBytes(8).toString('hex')}`, fid, sid, art.slice(0, 30), satz.slice(0, 300), jetzt)
  const n = Number((db().prepare('SELECT COUNT(*) AS n FROM sprech_vorfaelle WHERE freigabe_id = ? AND schueler_id = ?').get(fid, sid) as { n: number }).n)
  if (n >= VORFAELLE_BIS_SPERRE) {
    const st = standVon(fid, sid)
    standSpeichern(fid, sid, { ...st, gesperrt: true })
    return { gesperrt: true }
  }
  return { gesperrt: false }
}

// ---------------------------------------------------------------- Gesprächs-KI der Lehrkraft

function lehrkraftVon(id: string): NutzerInfo | undefined {
  return alleNutzer().find((n) => n.id === id)
}

/** Gesprächs-KI eingerichtet (eigener Schlüssel oder Schulschlüssel)? */
export function gespraechVerfuegbar(lehrkraftId: string): boolean {
  if (process.env.SCHULAPPS_KI_ATTRAPPE) return true
  const n = lehrkraftVon(lehrkraftId)
  if (!n) return false
  return imNutzer(alsNutzer(n), () => {
    const g = getSettings().ai.gespraech
    return g?.anbieter === 'openai' && Boolean(getSecret('openai'))
  })
}

function schluesselUndModell(lehrkraftId: string, teil: Teil): { key: string; modell: string } | null {
  const n = lehrkraftVon(lehrkraftId)
  if (!n) return null
  return imNutzer(alsNutzer(n), () => {
    const g = getSettings().ai.gespraech
    const key = getSecret('openai')
    if (g?.anbieter !== 'openai' || !key) return null
    const gross = g.modell === 'gross' || (teil === 'simulation' && g.simulationGross)
    return { key, modell: gross ? 'gpt-realtime' : 'gpt-realtime-mini' }
  })
}

const STIMME: Record<SprechSprache, string> = { en: 'marin', fr: 'marin', es: 'marin' }

// ---------------------------------------------------------------- Sitzungen (nur im Speicher)

interface Sitzung {
  id: string
  freigabeId: string
  schuelerId: string
  lehrkraftId: string
  teil: Teil
  modus: 'ueben' | 'pruefung'
  sprache: SprechSprache
  niveau: Niveau
  start: number
  maxMs: number
  anweisungen: string
  transkript: TranskriptZeile[]
  themenfremd: number
  beendet: boolean
  grund?: string
  attrappe: boolean
  callId?: string
  key?: string
  ws?: WebSocket
  uhr?: ReturnType<typeof setTimeout>
}

const sitzungen = new Map<string, Sitzung>()

function karteWaehlen(sprache: SprechSprache, niveau: Niveau, teil: Teil): SprechKarte[] {
  const stufe = stufeVonNiveau(niveau)
  const grund = (GRUNDKARTEN[sprache]?.[stufe] ?? GRUNDKARTEN.en?.[stufe] ?? GRUNDKARTEN.en?.A2 ?? []).map((k) => karteBereinigt(k, k.id)).filter((k): k is SprechKarte => Boolean(k))
  const zufall = <T>(l: T[]): T[] => (l.length ? [l[Math.floor(Math.random() * l.length)]] : [])
  if (teil === 'simulation') return [...zufall(grund.filter((k) => k.art === 'interview')), ...zufall(grund.filter((k) => k.art === 'monolog')), ...zufall(grund.filter((k) => k.art === 'dialog'))]
  return zufall(grund.filter((k) => k.art === teil))
}

/** Für die Anzeige im Browser: was die/der Lernende auf der Karte sieht (keine Prüferfragen) */
function karteFuerAnzeige(k: SprechKarte): Record<string, unknown> {
  if (k.art === 'interview') return { art: k.art, thema: k.thema }
  if (k.art === 'monolog') return { art: k.art, titel: k.titel, bilder: k.bilder, leitfragen: k.leitfragen }
  return { art: k.art, titel: k.titel, situation: k.situation, rolle: k.rolleSchueler, punkte: k.punkte, ziel: k.ziel }
}

async function beenden(s: Sitzung, grund: string): Promise<void> {
  if (s.beendet) return
  s.beendet = true
  s.grund = grund
  if (s.uhr) clearTimeout(s.uhr)
  try {
    s.ws?.close()
  } catch {
    /* schon zu */
  }
  if (s.callId && s.key)
    await fetch(`https://api.openai.com/v1/realtime/calls/${encodeURIComponent(s.callId)}/hangup`, { method: 'POST', headers: { Authorization: `Bearer ${s.key}` } }).catch(
      () => undefined
    )
}

/** Äußerung der/des Lernenden prüfen: Umgehung (2. Mal = Ende) */
async function schuelerSagt(s: Sitzung, text: string): Promise<void> {
  const t = text.trim()
  if (!t) return
  s.transkript.push({ rolle: 'schueler', text: t.slice(0, 1000) })
  if (istUmgehung(t)) {
    s.themenfremd++
    if (s.themenfremd >= 2) {
      vorfallMerken(s.freigabeId, s.schuelerId, 'umgehung', t)
      await beenden(s, 'themenfremd')
    }
  }
  // Inhaltsfilter (Text, ohne Speicherung): Moderation des Anbieters
  if (s.key && !s.beendet) {
    const r = (await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: t })
    })
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null)) as { results?: { flagged?: boolean }[] } | null
    if (r?.results?.[0]?.flagged) {
      vorfallMerken(s.freigabeId, s.schuelerId, 'unangemessen', t)
      await beenden(s, 'unangemessen')
    }
  }
}

/** Kontrollkanal: Transkript mitlesen, Anweisungen festhalten, Werkzeugaufruf und Ende */
function kontrollkanal(s: Sitzung): void {
  if (!s.callId || !s.key) return
  const url = `wss://api.openai.com/v1/realtime?call_id=${encodeURIComponent(s.callId)}`
  // Node (undici) nimmt Kopfzeilen als zweites Argument; der Schlüssel bleibt am Server
  const WS = WebSocket as unknown as new (u: string, o: unknown) => WebSocket
  const ws = new WS(url, { headers: { Authorization: `Bearer ${s.key}` } })
  s.ws = ws
  ws.addEventListener('message', (ev: MessageEvent) => {
    let e: { type?: string; transcript?: string; name?: string; arguments?: string; session?: { instructions?: string } }
    try {
      e = JSON.parse(String(ev.data))
    } catch {
      return
    }
    const typ = e.type ?? ''
    // Audio-Ereignisse ungelesen verwerfen
    if (typ.includes('audio') && !typ.includes('transcript') && !typ.includes('transcription')) return
    if (typ === 'conversation.item.input_audio_transcription.completed' && e.transcript) void schuelerSagt(s, e.transcript)
    else if ((typ === 'response.output_audio_transcript.done' || typ === 'response.audio_transcript.done') && e.transcript)
      s.transkript.push({ rolle: 'ki', text: e.transcript.slice(0, 1000) })
    else if (typ === 'response.function_call_arguments.done' && e.name === 'uebung_beenden') {
      const a = json_<{ grund?: string; satz?: string }>(e.arguments, {})
      if (a.grund === 'themenfremd' || a.grund === 'unangemessen') vorfallMerken(s.freigabeId, s.schuelerId, a.grund, a.satz ?? '')
      setTimeout(() => void beenden(s, a.grund ?? 'fertig'), 4000)
    } else if (typ === 'session.updated' && e.session?.instructions !== undefined && e.session.instructions !== s.anweisungen) {
      // Anweisungen wurden verändert (z. B. über die Entwicklerwerkzeuge): zurücksetzen und als Umgehung werten
      ws.send(JSON.stringify({ type: 'session.update', session: { type: 'realtime', instructions: s.anweisungen } }))
      const { gesperrt } = vorfallMerken(s.freigabeId, s.schuelerId, 'manipulation', '')
      if (gesperrt) void beenden(s, 'themenfremd')
    }
  })
}

// ---------------------------------------------------------------- Lernende: Übersicht

interface MeineFreigabe {
  id: string
  fach: string
  sprache: SprechSprache
  teile: Teil[]
  bis: number
  niveau: Niveau
  jahrgang: number | null
  minutenRest: number
  gesperrt: boolean
  uebungen: Uebung[]
}

export function meineFreigaben(ich: NutzerInfo, jetzt = Date.now()): MeineFreigabe[] {
  const alle = db().prepare("SELECT * FROM sprech_freigaben WHERE status = 'offen' AND bis > ?").all(jetzt) as unknown as FreigabeZeile[]
  return alle
    .filter((f) => sprechIstFuer(f, ich, jetzt))
    .map((f) => {
      const st = standVon(f.id, ich.id)
      const e = einstellungenVon(f)
      const { sprache, jahrgang } = sprachUndJahrgang(f)
      return {
        id: f.id,
        fach: vokZeile(f.vok_id)?.fach ?? '',
        sprache,
        teile: teileVon(f),
        bis: f.bis,
        niveau: niveauVon(f),
        jahrgang,
        minutenRest: Math.max(0, e.minutenWoche - minutenDieseWoche(st.uebungen, jetzt)),
        gesperrt: Boolean(st.gesperrt),
        uebungen: st.uebungen
      }
    })
}

// ---------------------------------------------------------------- Lehrkraft: Überblick

function ueberblick(vokId: string, lehrkraftId: string) {
  const freigaben = (db().prepare('SELECT * FROM sprech_freigaben WHERE vok_id = ? AND lehrkraft_id = ? ORDER BY erstellt DESC').all(vokId, lehrkraftId) as unknown as FreigabeZeile[]).map(
    (f) => ({ id: f.id, teile: teileVon(f), bis: f.bis, status: f.bis < Date.now() ? 'abgelaufen' : f.status, einstellungen: einstellungenVon(f), schueler: json_<string[]>(f.schueler, []), erstellt: f.erstellt, niveau: niveauVon(f) })
  )
  vorfaelleAufraeumen()
  const namen = new Map(alleNutzer().map((n) => [n.id, n.name || n.benutzer] as const))
  const personen = new Map<string, { id: string; name: string; uebungen: Uebung[]; gesperrt: boolean; vorfaelle: { art: string; satz: string; zeit: number; freigabe: string }[] }>()
  for (const f of freigaben) {
    for (const z of db().prepare('SELECT schueler_id, daten FROM sprech_stand WHERE freigabe_id = ?').all(f.id) as { schueler_id: string; daten: string }[]) {
      const d = json_<StandDaten>(z.daten, { uebungen: [] })
      const p = personen.get(z.schueler_id) ?? { id: z.schueler_id, name: namen.get(z.schueler_id) ?? '?', uebungen: [], gesperrt: false, vorfaelle: [] }
      p.uebungen.push(...d.uebungen)
      p.gesperrt = p.gesperrt || Boolean(d.gesperrt)
      personen.set(z.schueler_id, p)
    }
    for (const v of db().prepare('SELECT schueler_id, art, satz, zeit FROM sprech_vorfaelle WHERE freigabe_id = ? ORDER BY zeit DESC').all(f.id) as {
      schueler_id: string
      art: string
      satz: string
      zeit: number
    }[]) {
      const p = personen.get(v.schueler_id) ?? { id: v.schueler_id, name: namen.get(v.schueler_id) ?? '?', uebungen: [], gesperrt: false, vorfaelle: [] }
      p.vorfaelle.push({ art: v.art, satz: v.satz, zeit: v.zeit, freigabe: f.id })
      personen.set(v.schueler_id, p)
    }
  }
  return { freigaben, personen: [...personen.values()].map((p) => ({ ...p, uebungen: p.uebungen.sort((a, b) => a.zeit - b.zeit) })) }
}

// ---------------------------------------------------------------- Route

export function sprechenRoute(aufruf: Aufruf): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { url, req, res, sitzung } = k
    const lernende = url.pathname === '/s/api/sprechen' || url.pathname.startsWith('/s/api/sprechen/')
    const lehrer = url.pathname === '/server/sprechen' || url.pathname.startsWith('/server/sprechen/')
    if (!lernende && !lehrer) return false
    if (!sitzung) return json(res, 401, { fehler: 'Nicht angemeldet.' }), true
    const ich = sitzung.nutzer

    // ---------- Lehrkraft
    if (lehrer) {
      if (ich.rolle === 'schueler') return json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true
      // Reiter nur mit Gesprächs-KI (eigener Schlüssel oder Schulschlüssel)
      if (req.method === 'GET' && url.pathname === '/server/sprechen/verfuegbar') return json(res, 200, { verfuegbar: gespraechVerfuegbar(ich.id) }), true
      if (req.method === 'GET' && url.pathname === '/server/sprechen') {
        const vokId = String(url.searchParams.get('kurs') ?? '')
        const vok = vokZeile(vokId)
        if (!vok || vok.lehrkraft_id !== ich.id) return json(res, 404, { fehler: 'Unbekannter Kurs.' }), true
        return json(res, 200, { verfuegbar: gespraechVerfuegbar(ich.id), sprache: vok.sprache, ...ueberblick(vokId, ich.id) }), true
      }
      if (req.method !== 'POST' || typeof req.headers['x-schulapps-token'] !== 'string') return json(res, 403, { fehler: 'Nicht erlaubt.' }), true
      const k0 = (await k.koerper()) as Record<string, unknown>
      const teile = url.pathname.split('/').filter(Boolean).slice(2)
      if (teile[0] === 'freigeben') {
        const vok = vokZeile(String(k0.kurs ?? ''))
        if (!vok || vok.lehrkraft_id !== ich.id) return json(res, 404, { fehler: 'Unbekannter Kurs.' }), true
        if (!SPRACHEN.includes(vok.sprache as SprechSprache)) return json(res, 400, { fehler: 'Das Sprechtraining gibt es für Englisch, Französisch und Spanisch.' }), true
        const t = (Array.isArray(k0.teile) ? k0.teile : []).map(String).filter((x): x is Teil => TEILE.includes(x as Teil))
        if (!t.length) return json(res, 400, { fehler: 'Bitte mindestens einen Teil wählen.' }), true
        const tage = Math.max(1, Math.min(90, Math.round(Number(k0.tage) || 14)))
        const e: SprechEinstellungen = {
          minutenWoche: Math.max(5, Math.min(300, Math.round(Number(k0.minutenWoche) || 30))),
          nurSchulzeit: k0.nurSchulzeit !== false,
          ...(NIVEAUS.includes(k0.niveau as Niveau) ? { niveau: k0.niveau as Niveau } : {})
        }
        const schueler = (Array.isArray(k0.schueler) ? k0.schueler : []).map(String).slice(0, 200)
        const id = `s${randomBytes(8).toString('hex')}`
        db()
          .prepare('INSERT INTO sprech_freigaben (id, lehrkraft_id, vok_id, lerngruppe_id, schueler, teile, bis, einstellungen, status, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(id, ich.id, vok.id, vok.lerngruppe_id ?? '', JSON.stringify(schueler), JSON.stringify(t), Date.now() + tage * TAG, JSON.stringify(e), 'offen', new Date().toISOString())
        protokolliereServer('sprechen', `Sprechtraining freigegeben (${t.join(', ')}, ${tage} Tage)`, ich.id)
        return json(res, 200, { id }), true
      }
      const f = freigabe(teile[0] ?? '')
      if (!f || f.lehrkraft_id !== ich.id) return json(res, 404, { fehler: 'Unbekannte Freigabe.' }), true
      if (teile[1] === 'beenden') return db().prepare("UPDATE sprech_freigaben SET status = 'beendet' WHERE id = ?").run(f.id), json(res, 200, { ok: true }), true
      if (teile[1] === 'entsperren') {
        // Für alle Freigaben dieses Kurses (die Sperre gilt der Person, nicht einer einzelnen Freigabe)
        const sid = String(k0.schueler ?? '')
        for (const x of db().prepare('SELECT id FROM sprech_freigaben WHERE vok_id = ? AND lehrkraft_id = ?').all(f.vok_id, ich.id) as { id: string }[]) {
          const st = standVon(x.id, sid)
          if (st.gesperrt) standSpeichern(x.id, sid, { ...st, gesperrt: false })
          db().prepare('DELETE FROM sprech_vorfaelle WHERE freigabe_id = ? AND schueler_id = ?').run(x.id, sid)
        }
        return json(res, 200, { ok: true }), true
      }
      return json(res, 404, { fehler: 'Unbekannt.' }), true
    }

    // ---------- Lernende
    if (req.method === 'GET' && url.pathname === '/s/api/sprechen') return json(res, 200, { freigaben: meineFreigaben(ich) }), true
    if (req.method === 'GET' && url.pathname === '/s/api/sprechen/status') {
      const s = sitzungen.get(String(url.searchParams.get('sitzung') ?? ''))
      if (!s || s.schuelerId !== ich.id) return json(res, 404, { fehler: 'Unbekannte Sitzung.' }), true
      return json(res, 200, { beendet: s.beendet, grund: s.grund ?? null }), true
    }
    if (req.method !== 'POST') return json(res, 405, { fehler: 'Nicht erlaubt.' }), true
    const k0 = (await k.koerper()) as Record<string, unknown>

    if (url.pathname === '/s/api/sprechen/start') {
      const f = freigabe(String(k0.freigabe ?? ''))
      const jetzt = Date.now()
      if (!f || !sprechIstFuer(f, ich, jetzt)) return json(res, 404, { fehler: 'Dieses Sprechtraining ist nicht (mehr) für dich freigegeben.' }), true
      const teil = String(k0.teil ?? '') as Teil
      if (!teileVon(f).includes(teil)) return json(res, 400, { fehler: 'Dieser Teil ist nicht freigegeben.' }), true
      const e = einstellungenVon(f)
      const st = standVon(f.id, ich.id)
      if (st.gesperrt) return json(res, 403, { fehler: 'Das Sprechtraining ist für dich gesperrt. Bitte sprich mit deiner Lehrkraft.' }), true
      const stunde = new Date(jetzt).getHours()
      if (e.nurSchulzeit && (stunde < 7 || stunde >= 21)) return json(res, 403, { fehler: 'Das Sprechtraining geht zwischen 7 und 21 Uhr.' }), true
      const rest = e.minutenWoche - minutenDieseWoche(st.uebungen, jetzt)
      if (rest < 1) return json(res, 403, { fehler: 'Deine Übungszeit für diese Woche ist aufgebraucht.' }), true
      const { sprache } = sprachUndJahrgang(f)
      const niveau = niveauVon(f)
      const oberstufe = ((sprachUndJahrgang(f).jahrgang ?? 0) >= 11)
      const minuten = Math.min(rest, hoechstMinuten(teil, niveau, oberstufe))
      const karten = karteWaehlen(sprache, niveau, teil)
      if (!karten.length) return json(res, 409, { fehler: 'Für diesen Teil gibt es noch keine Aufgabenkarten. Bitte die Lehrkraft, welche anzulegen.' }), true
      const modus = teil === 'simulation' || k0.modus === 'pruefung' ? 'pruefung' : 'ueben'
      const vorname = (ich.name || '').split(/\s+/)[0] ?? ''
      const g: Gespraech = { sprache, teil, niveau, modus, vorname, karten, minuten }
      const s: Sitzung = {
        id: `t${randomBytes(10).toString('hex')}`,
        freigabeId: f.id,
        schuelerId: ich.id,
        lehrkraftId: f.lehrkraft_id,
        teil,
        modus,
        sprache,
        niveau,
        start: jetzt,
        maxMs: minuten * 60000,
        anweisungen: anweisungen(g, oberstufe),
        transkript: [],
        themenfremd: 0,
        beendet: false,
        attrappe: Boolean(process.env.SCHULAPPS_KI_ATTRAPPE)
      }
      sitzungen.set(s.id, s)
      s.uhr = setTimeout(() => void beenden(s, 'zeit'), s.maxMs + 15000)
      const anzeige = { karten: karten.map(karteFuerAnzeige), minuten, niveau, sprache }
      if (s.attrappe) return json(res, 200, { sitzung: s.id, attrappe: true, ...anzeige }), true
      const ks = schluesselUndModell(f.lehrkraft_id, teil)
      if (!ks) return sitzungen.delete(s.id), json(res, 409, { fehler: 'Die Gesprächs-KI ist nicht eingerichtet.' }), true
      const sdp = String(k0.sdp ?? '')
      if (!sdp.startsWith('v=')) return sitzungen.delete(s.id), json(res, 400, { fehler: 'Verbindung fehlgeschlagen.' }), true
      s.key = ks.key
      const sitzungKonfig = {
        type: 'realtime',
        model: ks.modell,
        instructions: s.anweisungen,
        audio: {
          input: { transcription: { model: 'gpt-4o-mini-transcribe', language: sprache }, turn_detection: { type: 'semantic_vad', eagerness: 'low' } },
          output: { voice: STIMME[sprache] }
        },
        tools: [WERKZEUG_BEENDEN],
        tool_choice: 'auto'
      }
      const form = new FormData()
      form.set('sdp', sdp)
      form.set('session', JSON.stringify(sitzungKonfig))
      const r = await fetch('https://api.openai.com/v1/realtime/calls', { method: 'POST', headers: { Authorization: `Bearer ${ks.key}` }, body: form }).catch(() => null)
      if (!r || !r.ok) {
        sitzungen.delete(s.id)
        protokolliereServer('sprechen', `Gesprächs-KI lehnt ab (${r?.status ?? 'nicht erreichbar'})`, f.lehrkraft_id)
        return json(res, 502, { fehler: 'Die Gesprächs-KI ist gerade nicht erreichbar.' }), true
      }
      const antwortSdp = await r.text()
      s.callId = (r.headers.get('location') ?? '').split('/').pop() || undefined
      kontrollkanal(s)
      protokolliereServer('sprechen', `Sprechübung gestartet (${teil})`, ich.id)
      return json(res, 200, { sitzung: s.id, sdp: antwortSdp, ...anzeige }), true
    }

    const s = sitzungen.get(String(k0.sitzung ?? ''))
    if (!s || s.schuelerId !== ich.id) return json(res, 404, { fehler: 'Unbekannte Sitzung.' }), true

    // Attrappe (Browsertests): Gespräch ohne KI – die „KI" antwortet mit einer festen Frage
    if (url.pathname === '/s/api/sprechen/attrappe') {
      if (!s.attrappe) return json(res, 403, { fehler: 'Nicht erlaubt.' }), true
      await schuelerSagt(s, String(k0.text ?? ''))
      if (!s.beendet) s.transkript.push({ rolle: 'ki', text: s.themenfremd ? "Let's get back to our exam. Tell me about your family." : 'That sounds great. Why do you like it?' })
      return json(res, 200, { antwort: s.transkript[s.transkript.length - 1]?.text ?? '', beendet: s.beendet, grund: s.grund ?? null }), true
    }

    if (url.pathname === '/s/api/sprechen/ende') {
      await beenden(s, s.grund ?? 'fertig')
      sitzungen.delete(s.id)
      const kn = (k0.kennzahlen ?? {}) as Partial<Kennzahlen>
      const kennzahlen: Kennzahlen = {
        sprechzeitMs: Math.max(0, Math.min(3_600_000, Number(kn.sprechzeitMs) || 0)),
        dauerMs: Math.max(0, Math.min(3_600_000, Date.now() - s.start)),
        langePausen: Math.max(0, Math.min(500, Math.round(Number(kn.langePausen) || 0)))
      }
      const minuten = Math.max(1, Math.round(kennzahlen.dauerMs / 60000))
      const st = standVon(s.freigabeId, s.schuelerId)
      // Missbrauch oder zu wenig gesprochen: zählt nicht, keine Einschätzung (die Minuten zählen)
      const eigene = s.transkript.filter((z) => z.rolle === 'schueler')
      if (s.grund === 'themenfremd' || s.grund === 'unangemessen' || eigene.length < 2) {
        standSpeichern(s.freigabeId, s.schuelerId, { ...st, uebungen: [...st.uebungen, { zeit: Date.now(), teil: s.teil, modus: s.modus, minuten, wertung: {}, punkte: 0, staerke: '', tipps: [], ausspracheUnsicher: true }] })
        return json(res, 200, { gewertet: false, grund: s.grund === 'themenfremd' || s.grund === 'unangemessen' ? s.grund : 'zu_kurz' }), true
      }
      let ein: Einschaetzung
      if (s.attrappe) ein = ATTRAPPE_EINSCHAETZUNG
      else {
        const lk = lehrkraftVon(s.lehrkraftId)
        if (!lk) return json(res, 500, { fehler: 'Lehrkraft nicht gefunden.' }), true
        try {
          const roh = await imNutzer(alsNutzer(lk), () =>
            aufruf('ai:structured', [bewertungsAnfrage({ sprache: s.sprache, teil: s.teil, niveau: s.niveau, transkript: s.transkript, kennzahlen })])
          )
          ein = einschaetzungAus(roh, true)
        } catch (e) {
          return json(res, 502, { fehler: `Die Einschätzung ist gerade nicht möglich (${e instanceof Error ? e.message : String(e)}).` }), true
        }
      }
      // Transkript verwerfen – gespeichert werden nur Werte, Kennzahlen und Tipps
      s.transkript = []
      const u: Uebung = {
        zeit: Date.now(),
        teil: s.teil,
        modus: s.modus,
        minuten,
        wertung: ein.wertung,
        punkte: punkteVon(ein.wertung),
        staerke: ein.staerke,
        tipps: ein.tipps,
        ...(ein.proaktiv ? { proaktiv: ein.proaktiv } : {}),
        ausspracheUnsicher: ein.ausspracheUnsicher
      }
      standSpeichern(s.freigabeId, s.schuelerId, { ...st, uebungen: [...st.uebungen, u] })
      return json(res, 200, { gewertet: true, uebung: u }), true
    }
    return json(res, 404, { fehler: 'Unbekannt.' }), true
  }
}
