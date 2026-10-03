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
 *             POST /server/vokabeln/<id>/termin|status|loeschen
 *  Lernende:  GET /s/api/vokabeln · GET /s/api/vokabeln/liste?id= · POST /s/api/vokabeln/antwort
 */
import { randomBytes } from 'node:crypto'
import { alleNutzer, datenbank, protokolliereServer, type NutzerInfo } from './datenbank'
import { json, type Anfrage } from './http'
import { alleLernenden, gehoertZu, lerngruppe, mitgliederVon } from './onlinetest'
import {
  bewerte,
  istSicher,
  nachAbfrage,
  neuerStand,
  satzMitLuecke,
  TAG,
  uebersicht,
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

interface Zeile {
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
}

/** Lernstand einer Person in einer Liste: je Wort + Übungstage (für „aktiv in den letzten 7 Tagen") */
export interface VokStand {
  woerter: Record<string, WortStand>
  tage: string[]
}

const zeile = (id: string): Zeile | null => (db().prepare('SELECT * FROM vok_zuweisungen WHERE id = ?').get(id) as Zeile | undefined) ?? null
const standVon = (zid: string, sid: string): VokStand => {
  const z = db().prepare('SELECT daten FROM vok_stand WHERE zuweisung_id = ? AND schueler_id = ?').get(zid, sid) as { daten: string } | undefined
  return json_(z?.daten, { woerter: {}, tage: [] } as VokStand)
}
function standSpeichern(zid: string, sid: string, s: VokStand): void {
  db()
    .prepare(
      'INSERT INTO vok_stand (zuweisung_id, schueler_id, daten, aktualisiert) VALUES (?, ?, ?, ?) ON CONFLICT (zuweisung_id, schueler_id) DO UPDATE SET daten = excluded.daten, aktualisiert = excluded.aktualisiert'
    )
    .run(zid, sid, JSON.stringify(s), Date.now())
}

export function vokIstFuer(z: Pick<Zeile, 'lerngruppe_id' | 'schueler'>, ich: NutzerInfo): boolean {
  if (ich.quelle === 'gast' || ich.rolle !== 'schueler') return false
  const nur = json_(z.schueler, [] as string[])
  if (!z.lerngruppe_id) return nur.includes(ich.benutzer)
  const g = lerngruppe(z.lerngruppe_id)
  if (!g || !gehoertZu(g, ich)) return false
  return !nur.length || nur.includes(ich.benutzer)
}

function lernendeVon(z: Zeile): NutzerInfo[] {
  const nur = json_(z.schueler, [] as string[])
  if (!z.lerngruppe_id) return alleNutzer().filter((n) => n.rolle === 'schueler' && n.quelle !== 'gast' && nur.includes(n.benutzer))
  const g = lerngruppe(z.lerngruppe_id)
  return g ? mitgliederVon(g).filter((n) => !nur.length || nur.includes(n.benutzer)) : []
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
}): string {
  const id = randomBytes(8).toString('hex')
  const woerter = bereinigeWoerter(e.woerter)
  if (!woerter.length) throw new Error('Die Liste hat keine Vokabeln.')
  db()
    .prepare(
      "INSERT INTO vok_zuweisungen (id, lehrkraft_id, lerngruppe_id, schueler, titel, sprache, fach, woerter, test_termin, reihe, status, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'offen', ?)"
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
      new Date().toISOString()
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
    .filter((z) => vokIstFuer(z, ich))
    .map((z) => ({
      id: z.id,
      titel: z.titel,
      fach: z.fach,
      sprache: z.sprache,
      testTermin: z.test_termin,
      uebersicht: uebersicht(json_(z.woerter, [] as Vokabel[]), standVon(z.id, ich.id).woerter)
    }))
}

/** Was eine Übung als Lösung erwartet */
function loesungFuer(v: Vokabel, uebung: Uebung): string {
  if (uebung === 'auswahl' || uebung === 'hoeren') return v.translation
  if (uebung === 'luecke' && v.example) return satzMitLuecke(v.example, v.term)?.loesung ?? v.term
  return v.term
}

export function vokabelRoute(): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { url, req, res, sitzung } = k
    const schueler = url.pathname === '/s/api/vokabeln' || url.pathname.startsWith('/s/api/vokabeln/')
    const lehrer = url.pathname === '/server/vokabeln' || url.pathname.startsWith('/server/vokabeln/')
    if (!schueler && !lehrer) return false
    if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
    const ich = sitzung.nutzer
    if (req.method === 'POST' && typeof req.headers['x-schulapps-token'] !== 'string') return (json(res, 403, { fehler: 'Nur aus der App.' }), true)

    // ---------------------------------------------------------------- Lernende
    if (schueler) {
      if (req.method === 'GET' && url.pathname === '/s/api/vokabeln') return (json(res, 200, { listen: vokabelListenFuer(ich) }), true)
      const id = req.method === 'GET' ? String(url.searchParams.get('id') ?? '') : String(((await k.koerper()) as Record<string, unknown>).id ?? '')
      const z = zeile(id)
      if (!z || !vokIstFuer(z, ich)) return (json(res, 404, { fehler: 'Diese Vokabeln sind nicht für dich freigegeben.' }), true)
      const woerter = json_(z.woerter, [] as Vokabel[])
      const st = standVon(z.id, ich.id)
      if (req.method === 'GET' && url.pathname === '/s/api/vokabeln/liste')
        return (json(res, 200, { id: z.id, titel: z.titel, sprache: z.sprache, fach: z.fach, testTermin: z.test_termin, woerter, staende: st.woerter }), true)
      if (req.method === 'POST' && url.pathname === '/s/api/vokabeln/antwort') {
        if (z.status !== 'offen') return (json(res, 409, { fehler: 'Diese Liste ist abgeschlossen.' }), true)
        const k0 = (await k.koerper()) as Record<string, unknown>
        const v = woerter.find((w) => w.id === k0.wortId)
        const uebung = String(k0.uebung ?? '') as Uebung
        if (!v || !['karte', 'auswahl', 'hoeren', 'buchstaben', 'frei', 'diktat', 'luecke'].includes(uebung))
          return (json(res, 400, { fehler: 'Unbekannte Abfrage.' }), true)
        const antwort = String(k0.antwort ?? '').slice(0, 200)
        // Lernkarte: Selbsteinschätzung nur beim ersten Kontakt; alles andere wertet der Server
        const ergebnis: { urteil: Urteil; hinweis?: string; richtig: string } =
          uebung === 'karte' ? { urteil: k0.gewusst === true ? 'richtig' : 'falsch', richtig: v.term } : bewerte(antwort, loesungFuer(v, uebung))
        const jetzt = Date.now()
        const neu = nachAbfrage(st.woerter[v.id] ?? neuerStand(), uebung, ergebnis.urteil, uebung === 'karte' ? '' : antwort, jetzt, z.test_termin ?? undefined)
        st.woerter[v.id] = neu
        const heute = new Date(jetzt).toISOString().slice(0, 10)
        if (!st.tage.includes(heute)) st.tage = [...st.tage, heute].slice(-60)
        standSpeichern(z.id, ich.id, st)
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
              lerngruppe: z.lerngruppe_id ? (lerngruppe(z.lerngruppe_id)?.name ?? '') : 'Einzelne Lernende',
              woerter: woerter.length,
              lernende: lernende.length,
              sicherSchnitt: lernende.length && woerter.length ? sicher.reduce((a, b) => a + b, 0) / lernende.length / woerter.length : 0,
              testTermin: z.test_termin,
              status: z.status,
              erstellt: z.erstellt
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
      if (!g && !einzelne.length) return (json(res, 400, { fehler: 'Bitte eine Lerngruppe oder einzelne Lernende wählen.' }), true)
      try {
        const id = vokabelnZuweisen({
          lehrkraftId: ich.id,
          lerngruppeId: g?.id ?? '',
          schueler: einzelne,
          titel: String(k0.titel ?? 'Vokabeln'),
          sprache: String(k0.sprache ?? ''),
          fach: String(k0.fach ?? ''),
          woerter: k0.woerter,
          testTermin: typeof k0.testTermin === 'number' ? k0.testTermin : null
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
      const lernende = lernendeVon(z).map((n) => {
        const st = standVon(z.id, n.id)
        return {
          id: n.id,
          name: n.name || n.benutzer,
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
          status: z.status,
          lerngruppe: z.lerngruppe_id ? (lerngruppe(z.lerngruppe_id)?.name ?? '') : 'Einzelne Lernende',
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
      if (teile[1] === 'status') {
        db()
          .prepare('UPDATE vok_zuweisungen SET status = ? WHERE id = ?')
          .run(k0.status === 'beendet' ? 'beendet' : 'offen', z.id)
        return (json(res, 200, { ok: true }), true)
      }
      if (teile[1] === 'loeschen') {
        db().prepare('DELETE FROM vok_zuweisungen WHERE id = ?').run(z.id)
        return (json(res, 200, { ok: true }), true)
      }
    }
    return (json(res, 404, { fehler: 'Unbekannt.' }), true)
  }
}
