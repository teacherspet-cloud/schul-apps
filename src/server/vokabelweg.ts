/**
 * Vokabelweg – laufbahnbegleitendes Vokabellernen (03.10.2026, mit der Lehrkraft abgestimmt; Regeln:
 * shared/vokabelLaufbahn.ts).
 *
 *  GET  /s/api/vokabelweg                       Wege der Person (je Lehrwerksreihe): Leiter des aktuellen Bandes
 *  GET  /s/api/vokabeln/liste?id=lb:<reihe>     gemeinsamer Kasten (wie eine Liste – der Trainer bleibt derselbe)
 *  POST /s/api/vokabeln/antwort {id: lb:…}      Wort „z:<zuweisung>:<wort>" → Stand der Zuweisung,
 *                                               Wort „b:<band>:<u>:<s>:<i>" → Stand des Vokabelwegs
 *  POST /s/api/vokabeln/spiel {id: lb:…}        Rekorde und „nochmal ansehen" des Vokabelwegs
 *
 * Gezählt werden alle Zuweisungen, die die Person je hatte (auch beendete, auch anderer Lehrkräfte).
 * Der Stand der Lehrwerkswörter liegt verschlüsselt in vok_laufbahn.daten (feldschutz.ts).
 */
import { getTextbook, listTextbooks } from '../main/services/storage/textbooks'
import type { NutzerInfo } from './datenbank'
import { nutzerNachId } from './datenbank'
import { alsNutzer, json, type Anfrage } from './http'
import { imNutzer } from './kontext'
import {
  abschnitteAus,
  leiter,
  quelleAusTitel,
  reiheVon,
  SCHWELLE,
  EINGEUEBT_AB,
  type Abschnitt,
  type Buch,
  type Quelle,
  type Stufe
} from '../shared/vokabelLaufbahn'
import type { VerbKarte } from '../shared/verbTraining'
import { kernform, type Vokabel, type WortStand } from '../shared/vokabeltrainer'
import {
  abfrageAuswerten,
  standardVerben,
  spieleHeuteFrei,
  tageszielVon,
  db,
  fachfarbeDerLehrkraft,
  istOffen,
  json_,
  spielEintragen,
  standSpeichern,
  standVon,
  vokIstFuer,
  zeile,
  type VokStand,
  type Zeile
} from './vokabeln'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS vok_laufbahn (
  schueler_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  reihe TEXT NOT NULL,
  daten TEXT NOT NULL,
  aktualisiert INTEGER NOT NULL,
  PRIMARY KEY (schueler_id, reihe)
);`
let bereit = false
const ldb = () => {
  const d = db()
  if (!bereit) {
    d.exec(SCHEMA)
    bereit = true
  }
  return d
}
const wegStand = (sid: string, reihe: string): VokStand => {
  const z = ldb().prepare('SELECT daten FROM vok_laufbahn WHERE schueler_id = ? AND reihe = ?').get(sid, reihe) as { daten: string } | undefined
  return json_(z?.daten, { woerter: {}, tage: [] } as VokStand)
}
function wegSpeichern(sid: string, reihe: string, s: VokStand): void {
  ldb()
    .prepare(
      'INSERT INTO vok_laufbahn (schueler_id, reihe, daten, aktualisiert) VALUES (?, ?, ?, ?) ON CONFLICT (schueler_id, reihe) DO UPDATE SET daten = excluded.daten, aktualisiert = excluded.aktualisiert'
    )
    .run(sid, reihe, JSON.stringify(s), Date.now())
}

// Lehrwerke: im Kontext der Lehrkraft gelesen (auch ihre importierten), kurz zwischengespeichert
const buchCache = new Map<string, { buch: Buch; zeit: number }>()
async function buchFuer(id: string, lehrkraftId: string): Promise<Buch | null> {
  const c = buchCache.get(id)
  if (c && Date.now() - c.zeit < 10 * 60_000) return c.buch
  const lk = nutzerNachId(lehrkraftId)
  if (!lk) return null
  const buch = (await imNutzer(alsNutzer(lk), async () => getTextbook(id)).catch(() => null)) as Buch | null
  if (buch) buchCache.set(id, { buch, zeit: Date.now() })
  return buch
}
let namenCache: { liste: { id: string; name: string }[]; zeit: number } | null = null
async function buchNamen(lehrkraftId: string): Promise<{ id: string; name: string }[]> {
  if (namenCache && Date.now() - namenCache.zeit < 10 * 60_000) return namenCache.liste
  const lk = nutzerNachId(lehrkraftId)
  const liste = lk ? ((await imNutzer(alsNutzer(lk), async () => listTextbooks()).catch(() => [])) as { id: string; name: string }[]) : []
  namenCache = { liste: liste.map((b) => ({ id: b.id, name: b.name })), zeit: Date.now() }
  return namenCache.liste
}

const normal = (t: string): string => kernform(t).toLowerCase()
const bandNummer = (b: Buch): number => {
  const n = parseFloat(String(b.band ?? '').replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : 99
}

interface Weg {
  key: string
  name: string
  fach: string
  sprache: string
  buch: Buch
  abschnitte: Abschnitt[]
  stufen: Stufe[]
  /** Zuweisungen dieser Reihe bzw. Sprache (alle, auch beendete) */
  zuweisungen: Zeile[]
  farbe: string | null
}

const FACH_ZU: Record<string, string> = { en: 'Englisch', fr: 'Französisch', es: 'Spanisch', it: 'Italienisch', la: 'Latein', ru: 'Russisch' }

/** Alle Vokabelwege einer Person */
async function wegeFuer(ich: NutzerInfo): Promise<Weg[]> {
  const alle = (db().prepare('SELECT * FROM vok_zuweisungen ORDER BY erstellt ASC').all() as unknown as Zeile[]).filter((z) => vokIstFuer(z, ich))
  // Herkunft: gespeichert oder aus dem Titel
  const mitQuelle: { z: Zeile; q: Quelle; buch: Buch }[] = []
  for (const z of alle) {
    let q = json_(z.quelle, null as Quelle | null)
    if (!q) q = quelleAusTitel(z.titel, await buchNamen(z.lehrkraft_id))
    if (!q) continue
    const buch = await buchFuer(q.lehrwerk, z.lehrkraft_id)
    if (buch) mitQuelle.push({ z, q, buch })
  }
  const reihen = new Map<string, typeof mitQuelle>()
  for (const x of mitQuelle) reihen.set(reiheVon(x.buch), [...(reihen.get(reiheVon(x.buch)) ?? []), x])
  // Eingeübte Wörter aus allen Listen der Person (gleiches Wort zählt überall)
  const termFach = new Map<string, number>()
  for (const z of alle) {
    const st = standVon(z.id, ich.id)
    for (const v of json_(z.woerter, [] as Vokabel[])) {
      const f = st.woerter[v.id]?.fach ?? 0
      if (f > (termFach.get(normal(v.term)) ?? 0)) termFach.set(normal(v.term), f)
    }
  }
  const wege: Weg[] = []
  for (const [key, liste] of reihen) {
    // Aktueller Band: der höchste, aus dem die Lerngruppe schon etwas zugewiesen bekam
    const buch = [...liste].sort((a, b) => bandNummer(b.buch) - bandNummer(a.buch))[0].buch
    const abschnitte = abschnitteAus(buch)
    const zugewiesen = new Set(
      liste
        .filter((x) => x.buch.id === buch.id)
        .flatMap((x) => abschnitte.filter((a) => a.unit === x.q.unit && x.q.abschnitte.includes(a.section)).map((a) => a.key))
    )
    const ws = wegStand(ich.id, key)
    const fachVon = (v: Vokabel): number => Math.max(ws.woerter[v.id]?.fach ?? 0, termFach.get(normal(v.term)) ?? 0)
    const anteil = (k: string): number => {
      const a = abschnitte.find((x) => x.key === k)
      return a && a.woerter.length ? a.woerter.filter((v) => fachVon(v) >= EINGEUEBT_AB).length / a.woerter.length : 0
    }
    const sprache = buch.language
    const zuw = alle.filter((z) => z.sprache === sprache || liste.some((x) => x.z.id === z.id))
    const juengste = liste[liste.length - 1].z
    wege.push({
      key,
      name: buch.reihe || buch.name,
      fach: FACH_ZU[sprache] ?? juengste.fach,
      sprache,
      buch,
      abschnitte,
      stufen: leiter(abschnitte, zugewiesen, anteil),
      zuweisungen: zuw,
      farbe: await fachfarbeDerLehrkraft(juengste)
    })
  }
  return wege
}

/** Der gemeinsame Kasten eines Weges: Zugewiesenes, aktueller Abschnitt, Wiederholung aus allem Freien */
/** Verben der Freigaben eines Wegs zusammen, dazu die Standardliste für die Lehrwerkswörter */
function verbenDesWegs(w: Weg, woerter: Vokabel[]): { sprache: string; karten: VerbKarte[] } | null {
  const karten = new Map<string, VerbKarte>()
  let sprache = w.sprache
  for (const z of w.zuweisungen) {
    const v = json_(z.verben, null as { sprache: string; karten: VerbKarte[] } | null)
    if (!v) continue
    sprache = v.sprache
    for (const k of v.karten) karten.set(k.schluessel.toLowerCase(), k)
  }
  const std = standardVerben(woerter, w.sprache)
  for (const k of std?.karten ?? []) if (!karten.has(k.schluessel.toLowerCase())) karten.set(k.schluessel.toLowerCase(), k)
  return karten.size ? { sprache, karten: [...karten.values()] } : null
}

function kastenVon(w: Weg, ich: NutzerInfo): { woerter: Vokabel[]; staende: Record<string, WortStand>; ws: VokStand } {
  const ws = wegStand(ich.id, w.key)
  const woerter: Vokabel[] = []
  const staende: Record<string, WortStand> = {}
  const gesehen = new Set<string>()
  const dazu = (v: Vokabel, st: WortStand | undefined): void => {
    const n = normal(v.term)
    if (gesehen.has(n)) return
    gesehen.add(n)
    woerter.push(v)
    if (st) staende[v.id] = st
  }
  // 1) offene Zuweisungen (zuerst), 2) beendete nur mit Lernstand
  for (const offen of [true, false])
    for (const z of w.zuweisungen.filter((x) => istOffen(x) === offen)) {
      const st = standVon(z.id, ich.id)
      for (const v of json_(z.woerter, [] as Vokabel[])) {
        if (!offen && !st.woerter[v.id]) continue
        dazu({ ...v, id: `z:${z.id}:${v.id}` }, st.woerter[v.id])
      }
    }
  // 3) der aktuelle Abschnitt (Neues), 4) alles Freie mit Lernstand (Wiederholung)
  const frei = new Set(w.stufen.filter((s) => s.frei).map((s) => s.key))
  const aktuell = w.stufen.find((s) => s.aktuell)?.key
  for (const a of w.abschnitte) {
    if (!frei.has(a.key)) continue
    for (const v of a.woerter) if (a.key === aktuell || ws.woerter[v.id]) dazu(v, ws.woerter[v.id])
  }
  return { woerter, staende, ws }
}

/** Kurzfassung der Leiter für die Oberfläche */
const leiterKurz = (w: Weg) => ({
  key: w.key,
  name: w.name,
  band: w.buch.name,
  fach: w.fach,
  sprache: w.sprache,
  farbe: w.farbe,
  schwelle: SCHWELLE,
  stufen: w.stufen
})

export function vokabelwegRoute(): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { url, req, res, sitzung } = k
    const istWeg = url.pathname === '/s/api/vokabelweg'
    const istListe = url.pathname === '/s/api/vokabeln/liste' || url.pathname === '/s/api/vokabeln/antwort' || url.pathname === '/s/api/vokabeln/spiel'
    if (!istWeg && !istListe) return false
    let id = ''
    if (istListe) {
      id = req.method === 'GET' ? String(url.searchParams.get('id') ?? '') : String(((await k.koerper()) as Record<string, unknown>).id ?? '')
      if (!id.startsWith('lb:')) return false
    }
    if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
    const ich = sitzung.nutzer
    if (ich.rolle !== 'schueler' || ich.quelle === 'gast') return (json(res, 403, { fehler: 'Den Vokabelweg gibt es mit einem Schülerkonto.' }), true)
    if (req.method === 'POST' && typeof req.headers['x-schulapps-token'] !== 'string') return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
    const wege = await wegeFuer(ich)
    if (istWeg) return (json(res, 200, { wege: wege.map(leiterKurz) }), true)

    const w = wege.find((x) => `lb:${x.key}` === id)
    if (!w) return (json(res, 404, { fehler: 'Diesen Vokabelweg gibt es nicht.' }), true)
    const { woerter, staende, ws } = kastenVon(w, ich)
    if (req.method === 'GET' && url.pathname === '/s/api/vokabeln/liste')
      return (
        json(res, 200, {
          id,
          titel: `Mein Vokabelweg · ${w.buch.name}`,
          sprache: w.sprache,
          fach: w.fach,
          testTermin: null,
          woerter,
          staende,
          farbe: w.farbe,
          rekorde: ws.rekorde ?? {},
          ansehen: ws.ansehen ?? [],
          weg: leiterKurz(w),
          // Spiele heute frei, wenn eine Freigabe dieses Wegs sie freigeschaltet hat (08.10.2026)
          spieleFrei: w.zuweisungen.some((z) => istOffen(z) && spieleHeuteFrei(z)),
          tagesziel: Math.max(0, ...w.zuweisungen.filter((z) => istOffen(z)).map((z) => tageszielVon(z))) || 10,
          // Unregelmäßige Verben (07.10.2026): aus den Freigaben dieses Wegs, sonst aus der Standardliste
          verben: verbenDesWegs(w, woerter)
        }),
        true
      )
    const k0 = (await k.koerper()) as Record<string, unknown>
    if (url.pathname === '/s/api/vokabeln/spiel') {
      const r = spielEintragen(ws, k0, (wid) => woerter.some((v) => v.id === wid))
      if (!r) return (json(res, 400, { fehler: 'Unbekanntes Spiel.' }), true)
      wegSpeichern(ich.id, w.key, ws)
      return (json(res, 200, { rekord: r.rekord, rekorde: ws.rekorde ?? {}, ansehen: ws.ansehen }), true)
    }
    // Antwort: Wort aus einer Zuweisung oder aus dem Lehrwerk
    const wid = String(k0.wortId ?? '')
    const v = woerter.find((x) => x.id === wid)
    if (!v) return (json(res, 400, { fehler: 'Unbekannte Abfrage.' }), true)
    if (wid.startsWith('z:')) {
      const [, zid, original] = wid.split(':')
      const z = zeile(zid)
      if (!z || !vokIstFuer(z, ich)) return (json(res, 404, { fehler: 'Unbekannt.' }), true)
      const st = standVon(z.id, ich.id)
      const r = abfrageAuswerten({ ...v, id: original }, k0, st, z.test_termin ?? undefined)
      if (!r) return (json(res, 400, { fehler: 'Unbekannte Abfrage.' }), true)
      standSpeichern(z.id, ich.id, st)
      // Auch der Weg merkt sich den Tag (Aktivität) und streicht „nochmal ansehen"
      if (r.ergebnis.urteil === 'richtig' && ws.ansehen?.includes(wid)) ws.ansehen = ws.ansehen.filter((x) => x !== wid)
      wegSpeichern(ich.id, w.key, ws)
      return (json(res, 200, { ...r.ergebnis, stand: r.neu, sicher: false }), true)
    }
    const r = abfrageAuswerten(v, k0, ws)
    if (!r) return (json(res, 400, { fehler: 'Unbekannte Abfrage.' }), true)
    wegSpeichern(ich.id, w.key, ws)
    return (json(res, 200, { ...r.ergebnis, stand: r.neu, sicher: false }), true)
  }
}
