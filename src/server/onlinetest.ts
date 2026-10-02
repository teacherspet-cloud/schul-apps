/**
 * Onlinetest und Lerngruppen auf dem Server (02.10.2026).
 *
 * Wunsch der Lehrkraft:
 *  - „Onlinetest" am Vokabeltest; eigene App mit Lerngruppen und Historie (Datum, Ergebnisse,
 *    Notenverteilung, Durchschnitt, Durchschnitt je Schülerin/Schüler)
 *  - Zugang der Lernenden über QR-Code oder Link, Anmeldung über IServ
 *  - einfache Antworten sofort auswerten, komplexere per KI auf Korrektheit/Plausibilität; keine halben Punkte
 *  - Zeitlimit durch die Lehrkraft; wer die Seite verlässt, gibt automatisch ab (gegen Nachschlagen)
 *  - Hinweis, dass die Lehrkraft die Abgaben trotzdem prüfen muss (steht in der App)
 *
 * Die Lösungen bleiben auf dem Server: Die Lernenden bekommen nur die Schülerfassung
 * (renderer/modules/onlinetest/kern.ts). Die Uhr läuft auf dem Server – ein verstelltes Gerät ändert nichts.
 * Abgeben geht auch per sendBeacon (beim Verlassen der Seite): Statt der Kopfzeile schützt dort
 * das Geheimnis der Teilnahme (nur dieses Gerät kennt es).
 */
import { randomBytes } from 'node:crypto'
import type { TestDocument } from '../renderer/src/modules/vokabeltest/model/types'
import { bewerte, offeneEinheiten, onlineFassung, summe, type Antworten, type Bewertung, type OnlineFassung } from '../renderer/src/modules/onlinetest/kern'
import { kiAnfrage, urteileAus, type KiFall } from '../renderer/src/modules/onlinetest/kiBewertung'
import { gradeForPoints, thresholdsForSubject } from '../renderer/src/shared/gradeScale'
import { FAECHER } from '@shared/faecher'
import { getSettings } from '../main/services/storage/settings'
import { alleNutzer, datenbank, nutzerNachId, protokolliereServer, type NutzerInfo } from './datenbank'
import { imNutzer, type Nutzer } from './kontext'
import { alsNutzer, json, leseKoerper, type Anfrage, type Aufruf } from './http'
import { PULS_MS } from '../main/services/lanServer'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS lerngruppen (
  id TEXT PRIMARY KEY,
  lehrkraft_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  fach TEXT NOT NULL DEFAULT '',
  iserv_gruppe TEXT NOT NULL DEFAULT '',
  mitglieder TEXT NOT NULL DEFAULT '[]',
  erstellt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS onlinetests (
  id TEXT PRIMARY KEY,
  lehrkraft_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  lerngruppe_id TEXT REFERENCES lerngruppen(id) ON DELETE SET NULL,
  titel TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  fassungen TEXT NOT NULL,
  einstellungen TEXT NOT NULL,
  status TEXT NOT NULL,
  erstellt TEXT NOT NULL,
  beendet TEXT
);
CREATE TABLE IF NOT EXISTS teilnahmen (
  id TEXT PRIMARY KEY,
  test_id TEXT NOT NULL REFERENCES onlinetests(id) ON DELETE CASCADE,
  schueler_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  variante INTEGER NOT NULL,
  geheim TEXT NOT NULL,
  beginn INTEGER NOT NULL,
  ende INTEGER NOT NULL,
  abgabe INTEGER,
  grund TEXT,
  antworten TEXT NOT NULL DEFAULT '{}',
  bewertung TEXT NOT NULL DEFAULT '{}',
  verlassen INTEGER NOT NULL DEFAULT 0,
  UNIQUE (test_id, schueler_id)
);
`

let bereit = false
const db = () => {
  const d = datenbank()
  if (!bereit) {
    d.exec(SCHEMA)
    bereit = true
  }
  return d
}
export const onlinetestZuruecksetzen = (): void => {
  bereit = false
}

const neueId = (): string => randomBytes(10).toString('hex')
const json_ = <T>(s: string, rueck: T): T => {
  try {
    return JSON.parse(s) as T
  } catch {
    return rueck
  }
}

// ---------------------------------------------------------------- Lerngruppen

export interface Lerngruppe {
  id: string
  lehrkraft_id: string
  name: string
  fach: string
  iserv_gruppe: string
  mitglieder: string[]
  erstellt: string
}

const alsGruppe = (z: Record<string, unknown>): Lerngruppe => ({ ...(z as unknown as Lerngruppe), mitglieder: json_(String(z.mitglieder ?? '[]'), [] as string[]) })

export function lerngruppenVon(lehrkraftId: string): Lerngruppe[] {
  return (db().prepare('SELECT * FROM lerngruppen WHERE lehrkraft_id = ? ORDER BY name').all(lehrkraftId) as Record<string, unknown>[]).map(alsGruppe)
}

export function lerngruppe(id: string): Lerngruppe | null {
  const z = db().prepare('SELECT * FROM lerngruppen WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return z ? alsGruppe(z) : null
}

/** Gehört die Schülerin/der Schüler zur Lerngruppe? (IServ-Gruppe oder von Hand eingetragen) */
export function gehoertZu(g: Lerngruppe, n: Pick<NutzerInfo, 'benutzer' | 'gruppen'>): boolean {
  if (g.mitglieder.includes(n.benutzer)) return true
  return Boolean(g.iserv_gruppe) && n.gruppen.some((x) => x.id === g.iserv_gruppe)
}

export function mitgliederVon(g: Lerngruppe): NutzerInfo[] {
  return alleNutzer().filter((n) => n.rolle === 'schueler' && gehoertZu(g, n))
}

// ---------------------------------------------------------------- Tests

export interface Einstellungen {
  zeitMin: number
  /** abwechselnd = A, B, A, B … in der Reihenfolge des Beitretens */
  zuteilung: 'abwechselnd' | 'zufall' | number
  fach: string
  zielsprache: string
  niveau: string
  schwellen: number[]
  /** Hinweis der Lehrkraft an die Lernenden (optional) */
  hinweis?: string
}

interface TestZeile {
  id: string
  lehrkraft_id: string
  lerngruppe_id: string | null
  titel: string
  code: string
  fassungen: string
  einstellungen: string
  status: 'offen' | 'beendet'
  erstellt: string
  beendet: string | null
}

interface Test extends Omit<TestZeile, 'fassungen' | 'einstellungen'> {
  fassungen: { label: string; fassung: OnlineFassung }[]
  einstellungen: Einstellungen
}

const alsTest = (z: TestZeile): Test => ({ ...z, fassungen: json_(z.fassungen, []), einstellungen: json_(z.einstellungen, {} as Einstellungen) })

function testNachCode(code: string): Test | null {
  const z = db().prepare('SELECT * FROM onlinetests WHERE code = ?').get(code.toUpperCase()) as TestZeile | undefined
  return z ? alsTest(z) : null
}

function testNachId(id: string): Test | null {
  const z = db().prepare('SELECT * FROM onlinetests WHERE id = ?').get(id) as TestZeile | undefined
  return z ? alsTest(z) : null
}

const CODE_ZEICHEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function neuerCode(): string {
  for (;;) {
    const c = Array.from(randomBytes(6), (b) => CODE_ZEICHEN[b % CODE_ZEICHEN.length]).join('')
    if (!db().prepare('SELECT 1 FROM onlinetests WHERE code = ?').get(c)) return c
  }
}

/** Fach zur Zielsprache des Vokabeltests (für den Notenschlüssel je Fach) */
const fachZuSprache = (sprache: string): string => FAECHER.find((f) => f.sprache === sprache)?.id ?? 'englisch'

export function testErstellen(
  lehrkraft: NutzerInfo,
  e: { titel: string; test: TestDocument; lerngruppeId?: string; zeitMin?: number; zuteilung?: Einstellungen['zuteilung']; hinweis?: string }
): Test {
  if (!e.test?.variants?.length) throw new Error('Der Test hat keine Variante.')
  if (e.lerngruppeId) {
    const g = lerngruppe(e.lerngruppeId)
    if (!g || g.lehrkraft_id !== lehrkraft.id) throw new Error('Unbekannte Lerngruppe.')
  }
  const fach = fachZuSprache(e.test.settings.targetLanguage)
  // Notenschlüssel der Lehrkraft (Einstellungen › Material) – in ihrem Kontext gelesen
  const schwellen = imNutzer(alsNutzer(lehrkraft), () => thresholdsForSubject(getSettings().gradeScale, fach))
  const einstellungen: Einstellungen = {
    zeitMin: Math.max(1, Math.min(240, Math.round(e.zeitMin ?? 20))),
    zuteilung: e.zuteilung ?? 'abwechselnd',
    fach,
    zielsprache: e.test.settings.targetLanguage,
    niveau: e.test.settings.level,
    schwellen,
    ...(e.hinweis ? { hinweis: e.hinweis.slice(0, 500) } : {})
  }
  const fassungen = e.test.variants.map((v) => ({ label: v.label, fassung: onlineFassung(v) }))
  const id = neueId()
  const code = neuerCode()
  db()
    .prepare('INSERT INTO onlinetests (id, lehrkraft_id, lerngruppe_id, titel, code, fassungen, einstellungen, status, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, lehrkraft.id, e.lerngruppeId ?? null, e.titel.slice(0, 160) || e.test.header.title || 'Onlinetest', code, JSON.stringify(fassungen), JSON.stringify(einstellungen), 'offen', new Date().toISOString())
  protokolliereServer('onlinetest', `Onlinetest erstellt (${fassungen.length} Fassung(en))`, lehrkraft.id)
  return testNachId(id)!
}

// ---------------------------------------------------------------- Teilnahmen

interface TeilnahmeZeile {
  id: string
  test_id: string
  schueler_id: string
  variante: number
  geheim: string
  beginn: number
  ende: number
  abgabe: number | null
  grund: string | null
  antworten: string
  bewertung: string
  verlassen: number
}

const NACHFRIST_MS = 30_000

function teilnahme(id: string): TeilnahmeZeile | null {
  return (db().prepare('SELECT * FROM teilnahmen WHERE id = ?').get(id) as TeilnahmeZeile | undefined) ?? null
}

function teilnahmenVon(testId: string): TeilnahmeZeile[] {
  return db().prepare('SELECT * FROM teilnahmen WHERE test_id = ? ORDER BY beginn').all(testId) as unknown as TeilnahmeZeile[]
}

/** Endgültig abgeben: Antworten festschreiben, sofort bewerten, was eindeutig ist */
function abschliessen(t: TeilnahmeZeile, test: Test, antworten: Antworten, grund: string): void {
  if (t.abgabe) return
  const fassung = test.fassungen[t.variante]?.fassung
  if (!fassung) return
  const bewertung = bewerte(fassung, antworten, json_(t.bewertung, {} as Bewertung))
  db()
    .prepare('UPDATE teilnahmen SET abgabe = ?, grund = ?, antworten = ?, bewertung = ?, verlassen = ? WHERE id = ? AND abgabe IS NULL')
    .run(Date.now(), grund, JSON.stringify(antworten), JSON.stringify(bewertung), grund === 'verlassen' ? 1 : t.verlassen, t.id)
}

/** Antworten nur für bekannte Felder, als kurze Texte */
function bereinigeAntworten(f: OnlineFassung, roh: unknown): Antworten {
  const felder = new Set(f.einheiten.flatMap((e) => e.felder).concat(f.aufgaben.flatMap((a) => a.eintraege.flatMap((x) => x.felder.map((y) => y.id)))))
  const out: Antworten = {}
  if (!roh || typeof roh !== 'object') return out
  for (const [k, v] of Object.entries(roh as Record<string, unknown>)) if (felder.has(k) && typeof v === 'string') out[k] = v.slice(0, 4000)
  return out
}

function abgelaufeneAbschliessen(test: Test): void {
  for (const t of teilnahmenVon(test.id)) if (!t.abgabe && Date.now() > t.ende + NACHFRIST_MS) abschliessen(t, test, json_(t.antworten, {}), 'zeit')
}

// ---------------------------------------------------------------- Auswertung

const noteFuer = (test: Test, punkte: number, max: number): number => gradeForPoints(punkte, max, test.einstellungen.schwellen).grade

/** Übersicht einer Teilnahme für die Lehrkraft */
function ueberblick(test: Test, t: TeilnahmeZeile, namen: Map<string, NutzerInfo>) {
  const b = json_(t.bewertung, {} as Bewertung)
  const max = test.fassungen[t.variante]?.fassung.punkte ?? 0
  const punkte = summe(b)
  const n = namen.get(t.schueler_id)
  return {
    id: t.id,
    name: n?.name ?? '',
    benutzer: n?.benutzer ?? '',
    variante: test.fassungen[t.variante]?.label ?? '',
    beginn: t.beginn,
    ende: t.ende,
    abgabe: t.abgabe,
    grund: t.grund,
    verlassen: Boolean(t.verlassen),
    punkte,
    max,
    offen: offeneEinheiten(b),
    note: t.abgabe ? noteFuer(test, punkte, max) : null
  }
}

/**
 * KI-Auswertung offener Antworten – im Namen der LEHRKRAFT (ihr Schlüssel bzw. Abo), über den
 * Namensschutz des Servers. Eine Anfrage je Aufgabe und Fassung, alle Abgaben gesammelt.
 */
async function kiAuswerten(test: Test, lehrkraft: NutzerInfo, aufruf: Aufruf): Promise<{ anfragen: number; bewertet: number }> {
  const alle = teilnahmenVon(test.id).filter((t) => t.abgabe)
  let anfragen = 0
  let bewertet = 0
  for (let v = 0; v < test.fassungen.length; v++) {
    const { fassung } = test.fassungen[v]
    const teil = alle.filter((t) => t.variante === v)
    for (const aufgabe of fassung.aufgaben) {
      const einheiten = fassung.einheiten.filter((e) => e.aufgabe === aufgabe.id)
      const faelle: (KiFall & { teilnahme: string; einheit: string; feld: string })[] = []
      let nr = 0
      for (const t of teil) {
        const b = json_(t.bewertung, {} as Bewertung)
        const antworten = json_(t.antworten, {} as Antworten)
        for (const e of einheiten) {
          if (b[e.id]?.status !== 'ki') continue
          for (const feld of e.felder) {
            const l = fassung.loesungen[feld]
            if (!l || (l.art !== 'ki' && l.art !== 'menge')) continue
            faelle.push({
              id: `A${++nr}`,
              frage: l.frage,
              erwartung: l.art === 'ki' ? l.erwartung : `eines dieser Wörter oder ein anderes passendes: ${l.werte.join(', ')}`,
              antwort: antworten[feld] ?? '',
              teilnahme: t.id,
              einheit: e.id,
              feld
            })
          }
        }
      }
      // In Paketen zu höchstens 40 Antworten
      for (let i = 0; i < faelle.length; i += 40) {
        const paket = faelle.slice(i, i + 40)
        const antwort = await imNutzer(alsNutzer(lehrkraft), () => aufruf('ai:structured', [kiAnfrage(test.einstellungen.zielsprache, test.einstellungen.niveau, paket)]))
        anfragen++
        const urteile = urteileAus(antwort, paket)
        // Je Teilnahme die Urteile einarbeiten: Einheit richtig nur, wenn ALLE ihre KI-Felder richtig sind
        const jeTeilnahme = new Map<string, typeof paket>()
        for (const f of paket) jeTeilnahme.set(f.teilnahme, [...(jeTeilnahme.get(f.teilnahme) ?? []), f])
        for (const [tid, fs] of jeTeilnahme) {
          const t = teilnahme(tid)
          if (!t) continue
          const b = json_(t.bewertung, {} as Bewertung)
          const jeEinheit = new Map<string, typeof fs>()
          for (const f of fs) jeEinheit.set(f.einheit, [...(jeEinheit.get(f.einheit) ?? []), f])
          for (const [eid, efs] of jeEinheit) {
            const us = efs.map((f) => urteile.get(f.id))
            if (us.some((u) => !u)) continue
            const richtig = us.every((u) => u!.richtig)
            const e = fassung.einheiten.find((x) => x.id === eid)!
            b[eid] = { status: richtig ? 'richtig' : 'falsch', punkte: richtig ? e.punkte : 0, quelle: 'ki', hinweis: us.map((u) => u!.begruendung).join(' ') }
            bewertet++
          }
          db().prepare('UPDATE teilnahmen SET bewertung = ? WHERE id = ?').run(JSON.stringify(b), tid)
        }
      }
    }
  }
  protokolliereServer('onlinetest', `KI-Auswertung: ${anfragen} Anfrage(n), ${bewertet} Antworten bewertet`, lehrkraft.id)
  return { anfragen, bewertet }
}

// ---------------------------------------------------------------- Routen: Lernende

async function koerperRoh(k: Anfrage): Promise<Record<string, unknown>> {
  // sendBeacon schickt text/plain – darum selbst lesen
  const t = await leseKoerper(k.req, 2 * 1024 * 1024)
  return t ? (JSON.parse(t) as Record<string, unknown>) : {}
}

export function schuelerRoute(): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { url, req, res, sitzung } = k
    if (!url.pathname.startsWith('/s/api/')) return false
    if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
    const ich = sitzung.nutzer
    const was = url.pathname.slice('/s/api/'.length)
    const mitKopf = typeof req.headers['x-schulapps-token'] === 'string'

    if (req.method === 'GET' && was === 'ich') return (json(res, 200, { name: ich.name, benutzer: ich.benutzer, rolle: ich.rolle }), true)
    if (req.method === 'GET' && was === 'tests') {
      // Offene Tests der eigenen Lerngruppen
      const tests = (db().prepare("SELECT * FROM onlinetests WHERE status = 'offen' AND lerngruppe_id IS NOT NULL").all() as unknown as TestZeile[])
        .map(alsTest)
        .filter((t) => {
          const g = t.lerngruppe_id ? lerngruppe(t.lerngruppe_id) : null
          return g && gehoertZu(g, ich)
        })
      const meine = new Map((db().prepare('SELECT test_id, abgabe FROM teilnahmen WHERE schueler_id = ?').all(ich.id) as { test_id: string; abgabe: number | null }[]).map((x) => [x.test_id, x.abgabe]))
      return (json(res, 200, { tests: tests.map((t) => ({ code: t.code, titel: t.titel, zeitMin: t.einstellungen.zeitMin, abgegeben: Boolean(meine.get(t.id)) })) }), true)
    }
    if (req.method !== 'POST') return (json(res, 405, { fehler: 'Nicht erlaubt.' }), true)

    if (was === 'beitreten') {
      if (!mitKopf) return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
      const k0 = await koerperRoh(k)
      const test = testNachCode(String(k0.code ?? ''))
      if (!test) return (json(res, 404, { fehler: 'Diesen Test gibt es nicht. Bitte den Code prüfen.' }), true)
      if (test.lerngruppe_id) {
        const g = lerngruppe(test.lerngruppe_id)
        if (g && !gehoertZu(g, ich) && ich.rolle === 'schueler') return (json(res, 403, { fehler: 'Dieser Test ist für eine andere Lerngruppe.' }), true)
      }
      abgelaufeneAbschliessen(test)
      let t = db().prepare('SELECT * FROM teilnahmen WHERE test_id = ? AND schueler_id = ?').get(test.id, ich.id) as TeilnahmeZeile | undefined
      if (!t) {
        if (test.status !== 'offen') return (json(res, 409, { fehler: 'Dieser Test ist beendet.' }), true)
        const n = (db().prepare('SELECT COUNT(*) AS n FROM teilnahmen WHERE test_id = ?').get(test.id) as { n: number }).n
        const z = test.einstellungen.zuteilung
        const variante = typeof z === 'number' ? Math.min(test.fassungen.length - 1, Math.max(0, z)) : z === 'zufall' ? randomBytes(1)[0] % test.fassungen.length : n % test.fassungen.length
        const jetzt = Date.now()
        const id = neueId()
        db()
          .prepare('INSERT INTO teilnahmen (id, test_id, schueler_id, variante, geheim, beginn, ende) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(id, test.id, ich.id, variante, randomBytes(18).toString('base64url'), jetzt, jetzt + test.einstellungen.zeitMin * 60_000)
        t = teilnahme(id)!
      }
      const fassung = test.fassungen[t.variante].fassung
      return (
        json(res, 200, {
          id: t.id,
          geheim: t.abgabe ? undefined : t.geheim,
          titel: test.titel,
          hinweis: test.einstellungen.hinweis ?? '',
          variante: test.fassungen[t.variante].label,
          ende: t.ende,
          jetzt: Date.now(),
          abgegeben: Boolean(t.abgabe),
          // NUR die Schülerfassung – die Lösungen bleiben hier
          aufgaben: t.abgabe ? [] : fassung.aufgaben,
          antworten: t.abgabe ? {} : json_(t.antworten, {})
        }),
        true
      )
    }

    if (was === 'speichern' || was === 'abgeben' || was === 'verlassen') {
      // Abgeben geht auch per sendBeacon (keine Kopfzeile) – geschützt durch das Geheimnis der Teilnahme
      if (was === 'speichern' && !mitKopf) return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
      const k0 = await koerperRoh(k)
      const t = teilnahme(String(k0.id ?? ''))
      if (!t || t.schueler_id !== ich.id || t.geheim !== String(k0.geheim ?? '')) return (json(res, 404, { fehler: 'Unbekannte Teilnahme.' }), true)
      const test = testNachId(t.test_id)!
      if (t.abgabe) return (json(res, 200, { abgegeben: true }), true)
      const antworten = bereinigeAntworten(test.fassungen[t.variante].fassung, k0.antworten)
      const zuSpaet = Date.now() > t.ende + NACHFRIST_MS
      if (was === 'speichern' && !zuSpaet) {
        db().prepare('UPDATE teilnahmen SET antworten = ? WHERE id = ? AND abgabe IS NULL').run(JSON.stringify(antworten), t.id)
        return (json(res, 200, { ok: true, ende: t.ende, jetzt: Date.now() }), true)
      }
      // Nach Ablauf zählen die zuletzt (rechtzeitig) gespeicherten Antworten
      const gueltig = zuSpaet ? json_(t.antworten, {}) : antworten
      const grund = zuSpaet ? 'zeit' : was === 'verlassen' ? 'verlassen' : String(k0.grund ?? 'selbst') === 'zeit' ? 'zeit' : 'selbst'
      abschliessen(t, test, gueltig, grund)
      return (json(res, 200, { abgegeben: true }), true)
    }
    return (json(res, 404, { fehler: 'Unbekannt.' }), true)
  }
}

// ---------------------------------------------------------------- Routen: Lehrkraft

export function lehrkraftRoute(aufruf: Aufruf, adresse: string): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { url, req, res, sitzung } = k
    const istTest = url.pathname.startsWith('/server/onlinetest')
    const istGruppe = url.pathname.startsWith('/server/lerngruppen')
    if (!istTest && !istGruppe) return false
    if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
    const ich = sitzung.nutzer
    if (ich.rolle === 'schueler') return (json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true)
    const mitKopf = typeof req.headers['x-schulapps-token'] === 'string'
    if (req.method === 'POST' && !mitKopf) return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
    const teile = url.pathname.split('/').filter(Boolean).slice(2)
    const link = (code: string): string => `${adresse.replace(/\/$/, '')}/s/t/${code}`

    // ---------- Lerngruppen
    if (istGruppe) {
      if (req.method === 'GET' && teile.length === 0) {
        const gruppen = lerngruppenVon(ich.id).map((g) => ({ ...g, anzahl: mitgliederVon(g).length }))
        return (json(res, 200, { gruppen, iservGruppen: nutzerNachId(ich.id)?.gruppen ?? [] }), true)
      }
      if (req.method === 'GET' && teile.length === 1) {
        const g = lerngruppe(teile[0])
        if (!g || g.lehrkraft_id !== ich.id) return (json(res, 404, { fehler: 'Unbekannt.' }), true)
        return (json(res, 200, historie(g)), true)
      }
      if (req.method === 'POST' && teile[0] === 'anlegen') {
        const k0 = (await k.koerper()) as Record<string, unknown>
        const name = String(k0.name ?? '').trim().slice(0, 80)
        if (!name) return (json(res, 400, { fehler: 'Bitte einen Namen angeben.' }), true)
        const id = neueId()
        const mitglieder = Array.isArray(k0.mitglieder) ? (k0.mitglieder as unknown[]).map((x) => String(x).trim().toLowerCase()).filter((x) => /^[a-z0-9._-]{2,64}$/.test(x)) : []
        db()
          .prepare('INSERT INTO lerngruppen (id, lehrkraft_id, name, fach, iserv_gruppe, mitglieder, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(id, ich.id, name, String(k0.fach ?? '').slice(0, 40), String(k0.iservGruppe ?? '').slice(0, 120), JSON.stringify(mitglieder), new Date().toISOString())
        return (json(res, 200, { id }), true)
      }
      if (req.method === 'POST' && teile[0] === 'aendern') {
        const k0 = (await k.koerper()) as Record<string, unknown>
        const g = lerngruppe(String(k0.id ?? ''))
        if (!g || g.lehrkraft_id !== ich.id) return (json(res, 404, { fehler: 'Unbekannt.' }), true)
        const mitglieder = Array.isArray(k0.mitglieder) ? (k0.mitglieder as unknown[]).map((x) => String(x).trim().toLowerCase()).filter((x) => /^[a-z0-9._-]{2,64}$/.test(x)) : g.mitglieder
        db()
          .prepare('UPDATE lerngruppen SET name = ?, fach = ?, iserv_gruppe = ?, mitglieder = ? WHERE id = ?')
          .run(String(k0.name ?? g.name).slice(0, 80), String(k0.fach ?? g.fach).slice(0, 40), String(k0.iservGruppe ?? g.iserv_gruppe).slice(0, 120), JSON.stringify(mitglieder), g.id)
        return (json(res, 200, { ok: true }), true)
      }
      if (req.method === 'POST' && teile[0] === 'loeschen') {
        const k0 = (await k.koerper()) as Record<string, unknown>
        db().prepare('DELETE FROM lerngruppen WHERE id = ? AND lehrkraft_id = ?').run(String(k0.id ?? ''), ich.id)
        return (json(res, 200, { ok: true }), true)
      }
      return (json(res, 404, { fehler: 'Unbekannt.' }), true)
    }

    // ---------- Tests
    if (req.method === 'GET' && teile.length === 0) {
      const tests = (db().prepare('SELECT * FROM onlinetests WHERE lehrkraft_id = ? ORDER BY erstellt DESC').all(ich.id) as unknown as TestZeile[]).map(alsTest)
      return (
        json(res, 200, {
          tests: tests.map((t) => {
            abgelaufeneAbschliessen(t)
            const ts = teilnahmenVon(t.id)
            return {
              id: t.id,
              titel: t.titel,
              code: t.code,
              link: link(t.code),
              status: t.status,
              erstellt: t.erstellt,
              lerngruppe: t.lerngruppe_id ? (lerngruppe(t.lerngruppe_id)?.name ?? '') : '',
              teilnehmer: ts.length,
              abgegeben: ts.filter((x) => x.abgabe).length,
              offen: ts.reduce((s, x) => s + offeneEinheiten(json_(x.bewertung, {})), 0)
            }
          })
        }),
        true
      )
    }
    if (req.method === 'POST' && teile[0] === 'erstellen') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      try {
        const t = testErstellen(ich, {
          titel: String(k0.titel ?? ''),
          test: k0.test as TestDocument,
          lerngruppeId: typeof k0.lerngruppeId === 'string' && k0.lerngruppeId ? k0.lerngruppeId : undefined,
          zeitMin: Number(k0.zeitMin) || 20,
          zuteilung: k0.zuteilung === 'zufall' ? 'zufall' : typeof k0.zuteilung === 'number' ? k0.zuteilung : 'abwechselnd',
          hinweis: typeof k0.hinweis === 'string' ? k0.hinweis : undefined
        })
        return (json(res, 200, { id: t.id, code: t.code, link: link(t.code) }), true)
      } catch (e) {
        return (json(res, 400, { fehler: e instanceof Error ? e.message : String(e) }), true)
      }
    }
    const test = teile[0] ? testNachId(teile[0]) : null
    if (!test || test.lehrkraft_id !== ich.id) return (json(res, 404, { fehler: 'Unbekannter Test.' }), true)
    abgelaufeneAbschliessen(test)
    const namen = new Map(alleNutzer().map((n) => [n.id, n]))

    if (req.method === 'GET' && teile.length === 1) {
      const ts = teilnahmenVon(test.id)
      const mitglieder = test.lerngruppe_id ? mitgliederVon(lerngruppe(test.lerngruppe_id)!) : []
      return (
        json(res, 200, {
          id: test.id,
          titel: test.titel,
          code: test.code,
          link: link(test.code),
          status: test.status,
          einstellungen: test.einstellungen,
          erstellt: test.erstellt,
          lerngruppe: test.lerngruppe_id ? lerngruppe(test.lerngruppe_id) : null,
          // Wer aus der Lerngruppe noch nicht begonnen hat
          fehlend: mitglieder.filter((m) => !ts.some((t) => t.schueler_id === m.id)).map((m) => ({ name: m.name, benutzer: m.benutzer })),
          fassungen: test.fassungen.map((f) => ({ label: f.label, punkte: f.fassung.punkte, aufgaben: f.fassung.aufgaben, einheiten: f.fassung.einheiten, loesungen: f.fassung.loesungen })),
          teilnahmen: ts.map((t) => ({ ...ueberblick(test, t, namen), antworten: json_(t.antworten, {}), bewertung: json_(t.bewertung, {}), varianteNr: t.variante }))
        }),
        true
      )
    }
    if (req.method !== 'POST') return (json(res, 405, { fehler: 'Nicht erlaubt.' }), true)
    const k0 = (await k.koerper()) as Record<string, unknown>
    if (teile[1] === 'status') {
      const status = k0.status === 'beendet' ? 'beendet' : 'offen'
      db().prepare('UPDATE onlinetests SET status = ?, beendet = ? WHERE id = ?').run(status, status === 'beendet' ? new Date().toISOString() : null, test.id)
      // Beenden: alle Laufenden mit dem zuletzt gespeicherten Stand abgeben
      if (status === 'beendet') for (const t of teilnahmenVon(test.id)) if (!t.abgabe) abschliessen(t, test, json_(t.antworten, {}), 'lehrkraft')
      return (json(res, 200, { ok: true }), true)
    }
    if (teile[1] === 'abschliessen') {
      const t = teilnahme(String(k0.teilnahme ?? ''))
      if (!t || t.test_id !== test.id) return (json(res, 404, { fehler: 'Unbekannt.' }), true)
      abschliessen(t, test, json_(t.antworten, {}), 'lehrkraft')
      return (json(res, 200, { ok: true }), true)
    }
    if (teile[1] === 'korrektur') {
      const t = teilnahme(String(k0.teilnahme ?? ''))
      if (!t || t.test_id !== test.id) return (json(res, 404, { fehler: 'Unbekannt.' }), true)
      const e = test.fassungen[t.variante].fassung.einheiten.find((x) => x.id === k0.einheit)
      if (!e) return (json(res, 404, { fehler: 'Unbekannte Aufgabe.' }), true)
      const b = json_(t.bewertung, {} as Bewertung)
      // Ganze Punkte zwischen 0 und dem Höchstwert der Einheit (Freitext); sonst richtig/falsch
      const punkte = typeof k0.punkte === 'number' ? Math.max(0, Math.min(e.punkte, Math.round(k0.punkte))) : k0.richtig ? e.punkte : 0
      b[e.id] = { status: punkte > 0 ? 'richtig' : 'falsch', punkte, quelle: 'lehrkraft', ...(typeof k0.hinweis === 'string' && k0.hinweis ? { hinweis: k0.hinweis.slice(0, 300) } : {}) }
      db().prepare('UPDATE teilnahmen SET bewertung = ? WHERE id = ?').run(JSON.stringify(b), t.id)
      return (json(res, 200, { ok: true }), true)
    }
    if (teile[1] === 'auswerten') {
      // Lange Anfrage: Lebenszeichen wie bei /api
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      const puls = setInterval(() => res.write(' '), PULS_MS)
      res.on('close', () => clearInterval(puls))
      try {
        const lehrkraft = nutzerNachId(ich.id)!
        res.end(JSON.stringify({ ok: true, ...(await kiAuswerten(test, lehrkraft, aufruf)) }))
      } catch (e) {
        res.end(JSON.stringify({ ok: false, fehler: e instanceof Error ? e.message : String(e) }))
      } finally {
        clearInterval(puls)
      }
      return true
    }
    if (teile[1] === 'loeschen') {
      db().prepare('DELETE FROM onlinetests WHERE id = ?').run(test.id)
      protokolliereServer('onlinetest', 'Onlinetest gelöscht', ich.id)
      return (json(res, 200, { ok: true }), true)
    }
    return (json(res, 404, { fehler: 'Unbekannt.' }), true)
  }
}

/** Historie einer Lerngruppe: je Test Datum, Ergebnisse, Notenverteilung, Durchschnitt; je Schüler Durchschnitt */
export function historie(g: Lerngruppe) {
  const namen = new Map(alleNutzer().map((n) => [n.id, n]))
  const tests = (db().prepare('SELECT * FROM onlinetests WHERE lerngruppe_id = ? ORDER BY erstellt').all(g.id) as unknown as TestZeile[]).map(alsTest)
  const jeSchueler = new Map<string, { name: string; benutzer: string; noten: number[]; prozente: number[] }>()
  const liste = tests.map((t) => {
    abgelaufeneAbschliessen(t)
    const ts = teilnahmenVon(t.id).filter((x) => x.abgabe)
    const ergebnisse = ts.map((x) => ueberblick(t, x, namen))
    const verteilung = [1, 2, 3, 4, 5, 6].map((n) => ergebnisse.filter((e) => e.note === n).length)
    for (const e of ergebnisse) {
      if (e.note == null) continue
      const s = jeSchueler.get(e.benutzer) ?? { name: e.name, benutzer: e.benutzer, noten: [], prozente: [] }
      s.noten.push(e.note)
      s.prozente.push(e.max ? (e.punkte / e.max) * 100 : 0)
      jeSchueler.set(e.benutzer, s)
    }
    const noten = ergebnisse.map((e) => e.note).filter((n): n is number => n != null)
    return {
      id: t.id,
      titel: t.titel,
      datum: t.erstellt,
      status: t.status,
      teilnehmer: ergebnisse.length,
      offen: ergebnisse.reduce((s, e) => s + e.offen, 0),
      durchschnitt: noten.length ? Math.round((noten.reduce((a, b) => a + b, 0) / noten.length) * 100) / 100 : null,
      verteilung,
      ergebnisse: ergebnisse.map((e) => ({ name: e.name, benutzer: e.benutzer, punkte: e.punkte, max: e.max, note: e.note, verlassen: e.verlassen }))
    }
  })
  return {
    gruppe: { ...g, mitglieder: g.mitglieder },
    mitglieder: mitgliederVon(g).map((m) => ({ name: m.name, benutzer: m.benutzer })),
    tests: liste,
    schueler: [...jeSchueler.values()]
      .map((s) => ({
        name: s.name,
        benutzer: s.benutzer,
        tests: s.noten.length,
        durchschnitt: Math.round((s.noten.reduce((a, b) => a + b, 0) / s.noten.length) * 100) / 100,
        prozent: Math.round(s.prozente.reduce((a, b) => a + b, 0) / s.prozente.length)
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
  }
}

export type { Nutzer }
