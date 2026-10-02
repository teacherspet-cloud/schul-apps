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
 */
import { randomBytes } from 'node:crypto'
import { datenbank, nutzerNachId, protokolliereServer, type NutzerInfo } from './datenbank'
import { json, type Anfrage, type Aufruf } from './http'
import { gehoertZu, lerngruppe, mitgliederVon, onlinetestStand, reihenTestAnlegen, reihenTestCode } from './onlinetest'
import { blattFassung, feedbackStand, verknuepfteFreigabeAnlegen, verknuepfteFreigabeStatus } from './schuelerfeedback'
import { blattStand, reihenBlattAnlegen } from './arbeitsblaetter'
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
  type Weg
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
    bereit = true
  }
  return d
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
}

const reiheVon = (id: string): (Reihe & { lehrkraftId: string }) | null => {
  const z = db().prepare('SELECT * FROM reihen WHERE id = ?').get(id) as { daten: string; lehrkraft_id: string } | undefined
  return z ? { ...json_(z.daten, {} as Reihe), id, lehrkraftId: z.lehrkraft_id } : null
}
const zuweisung = (id: string): ZuweisungZeile | null =>
  (db().prepare('SELECT * FROM reihen_zuweisungen WHERE id = ?').get(id) as ZuweisungZeile | undefined) ?? null

/** Gehört die Zuweisung dieser Person? (Lerngruppe, ggf. nur Ausgewählte) */
function istFuer(z: ZuweisungZeile, ich: NutzerInfo): boolean {
  if (ich.quelle === 'gast') return false
  const g = lerngruppe(z.lerngruppe_id)
  if (!g || !gehoertZu(g, ich)) return false
  const nur = json_(z.schueler, [] as string[])
  return !nur.length || nur.includes(ich.benutzer)
}

function lernendeVon(z: ZuweisungZeile): NutzerInfo[] {
  const g = lerngruppe(z.lerngruppe_id)
  if (!g) return []
  const nur = json_(z.schueler, [] as string[])
  return mitgliederVon(g).filter((n) => !nur.length || nur.includes(n.benutzer))
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
      if (i.art === 'arbeitsblatt' && i.html)
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
          reiheId: r.id
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
  }
}

/** Stand der verknüpften Aufgaben einer Person */
function externVon(r: Reihe, z: ZuweisungZeile, sid: string): Record<string, Extern> {
  const v = json_(z.verknuepft, {} as Record<string, string>)
  const aus: Record<string, Extern> = {}
  for (const s of r.schritte) {
    const id = v[s.id]
    if (!id) continue
    const e =
      s.inhalt.art === 'arbeitsblatt'
        ? blattStand(id, sid)
        : s.inhalt.art === 'rueckmeldung'
          ? feedbackStand(id, sid)
          : s.inhalt.art === 'onlinetest'
            ? onlinetestStand(id, sid)
            : null
    if (e) aus[s.id] = e
  }
  return aus
}

function wegVon(r: Reihe, z: ZuweisungZeile, sid: string, stand = standVon(z.id, sid)): Weg {
  return berechneWeg(r, stand, externVon(r, z, sid), json_(z.halte_frei, [] as string[]))
}

/** Link zu einer verknüpften Aufgabe (für die Lernenden) */
function linkFuer(s: Schritt, z: ZuweisungZeile): string | undefined {
  const id = json_(z.verknuepft, {} as Record<string, string>)[s.id]
  if (!id) return undefined
  if (s.inhalt.art === 'arbeitsblatt') return `/s/b/${id}`
  if (s.inhalt.art === 'rueckmeldung') return `/s/a/${id}`
  if (s.inhalt.art === 'onlinetest') {
    const code = reihenTestCode(id)
    return code ? `/s/t/${code}` : undefined
  }
  return undefined
}

/** Stand für die Ansicht ohne große Daten */
const standKurz = (s: Stand): Stand => ({ ...s, schritte: Object.fromEntries(Object.entries(s.schritte).map(([k, v]) => [k, { ...v }])) })

const MAX_DATEI = 12 * 1024 * 1024

export function reihenRoute(aufruf: Aufruf): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { url, req, res, sitzung } = k
    const schueler = url.pathname === '/s/api/reihen' || url.pathname === '/s/api/reihe' || url.pathname.startsWith('/s/api/reihe/')
    const lehrer = url.pathname === '/server/reihen' || url.pathname.startsWith('/server/reihen/')
    if (!schueler && !lehrer) return false
    if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
    const ich = sitzung.nutzer
    const mitKopf = typeof req.headers['x-schulapps-token'] === 'string'
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
                ? { inhalt: inhaltFuerLernende(s.inhalt), link: linkFuer(s, z) }
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
        if (st.diagnose) return (json(res, 409, { fehler: 'Die Diagnose ist schon ausgewertet.' }), true)
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
                lerngruppe: lerngruppe(z.lerngruppe_id)?.name ?? '',
                schueler: json_(z.schueler, [] as string[]).length,
                status: z.status
              }))
            }
          })
        }),
        true
      )
    }
    if (req.method === 'POST' && teile[0] === 'speichern') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      const r = k0.reihe as Reihe | undefined
      if (!r?.titel?.trim() || !Array.isArray(r.schritte)) return (json(res, 400, { fehler: 'Die Reihe braucht einen Titel.' }), true)
      const roh = JSON.stringify(r)
      if (roh.length > 40 * 1024 * 1024) return (json(res, 413, { fehler: 'Die Reihe ist zu groß.' }), true)
      const jetzt = new Date().toISOString()
      const alt = r.id ? reiheVon(r.id) : null
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
        verknuepfe(z, neu)
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
        const bedarf: { art: string; schueler?: string; name?: string; schritt?: string; text: string }[] = []
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
          return { id: n.id, name: n.name, benutzer: n.benutzer, weg, stand: standKurz(stand) }
        })
        // Haltepunkte, an denen schon jemand wartet
        for (const s of r.schritte)
          if (s.halt?.art === 'freigabe' && !halteFrei.includes(s.id)) {
            const wartend = lernende.filter((l) => l.weg.schritte.find((x) => x.id === s.id)?.hinweis?.startsWith('Wartet auf die gemeinsame')).length
            if (wartend) bedarf.push({ art: 'halt', schritt: s.id, text: `Haltepunkt vor „${s.titel}“: ${wartend} warten auf die Besprechung` })
          }
        return (
          json(res, 200, {
            reihe: r,
            zuweisung: { id: z.id, lerngruppe: lerngruppe(z.lerngruppe_id)?.name ?? '', status: z.status, halteFrei },
            lernende,
            bedarf
          }),
          true
        )
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
        else if (art === 'bewerten') st.bewertung = { text: String(k0.text ?? '').slice(0, 2000), geschafft: k0.geschafft !== false, zeit: Date.now() }
        else return (json(res, 400, { fehler: 'Unbekannte Aktion.' }), true)
        stand.schritte[s.id] = st
        standSpeichern(z.id, n.id, stand)
        return (json(res, 200, { ok: true }), true)
      }
      return (json(res, 404, { fehler: 'Unbekannt.' }), true)
    }
    const r = teile[0] ? reiheVon(teile[0]) : null
    if (!r || r.lehrkraftId !== ich.id) return (json(res, 404, { fehler: 'Unbekannte Reihe.' }), true)
    if (req.method === 'GET' && teile.length === 1) {
      const { lehrkraftId: _l, ...rein } = r
      return (json(res, 200, { reihe: rein }), true)
    }
    if (req.method === 'POST' && teile[1] === 'zuweisen') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      const g = lerngruppe(String(k0.lerngruppeId ?? ''))
      if (!g || g.lehrkraft_id !== ich.id) return (json(res, 400, { fehler: 'Bitte eine eigene Lerngruppe wählen.' }), true)
      const erlaubt = new Set(mitgliederVon(g).map((n) => n.benutzer))
      const einzelne = Array.isArray(k0.schueler) ? [...new Set((k0.schueler as unknown[]).map(String).filter((b) => erlaubt.has(b)))] : []
      const id = neueId()
      db()
        .prepare(
          'INSERT INTO reihen_zuweisungen (id, reihe_id, lehrkraft_id, lerngruppe_id, schueler, halte_frei, verknuepft, status, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .run(id, r.id, ich.id, g.id, JSON.stringify(einzelne), '[]', '{}', 'offen', new Date().toISOString())
      verknuepfe(zuweisung(id)!, r)
      protokolliereServer('reihe', 'Unterrichtsreihe zugewiesen', ich.id)
      return (json(res, 200, { id }), true)
    }
    if (req.method === 'POST' && teile[1] === 'loeschen') {
      db().prepare('DELETE FROM reihen WHERE id = ?').run(r.id)
      return (json(res, 200, { ok: true }), true)
    }
    return (json(res, 404, { fehler: 'Unbekannt.' }), true)
  }
}
