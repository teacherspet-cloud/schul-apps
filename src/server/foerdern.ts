/**
 * Förder- und Fordermaterial (12.10.2026, Wunsch der Lehrkraft) – Server-Teil: Lerndaten je Kind für den Dialog
 * „Für wen", die Gruppen eines Auftrags (befristet, nur für dieses Material) und die Bündel „Für dich".
 *
 *   GET  /server/foerdern/daten?gruppe=<ID>          Lerndaten je Kind der Lerngruppe (nur die eigene Lerngruppe)
 *   POST /server/foerdern/auftrag   {gruppe, gruppen}  Gruppen eines Auftrags merken → {id} (Ablauf 6 Wochen)
 *   GET  /server/foerdern/auftrag?id=<ID>&gruppe=<S>  Benutzernamen der Kinder einer Gruppe → {schueler, titel, art}
 *   GET  /server/foerdern/buendel?gruppe=<ID>        Bündel der Lerngruppe (Vorschläge und freigegebene)
 *   POST /server/foerdern/buendel    {gruppe, buendel: [{schueler, inhalt}]}  als Vorschlag ablegen
 *   POST /server/foerdern/buendel/freigeben {id}      EIN Bündel für das Kind freigeben (kein Sammelklick)
 *   POST /server/foerdern/buendel/verwerfen {id}      Bündel löschen
 *   GET  /s/api/fuerdich                            Lernende: die eigenen freigegebenen Bündel (bis zum Ablauf)
 *
 * Datenquellen je Kind: Vokabeln (laufende Kurse der Lerngruppe, sicher/gesamt, gerade wackelnde Wörter nach
 * shared/problemWoerter.ts), Grammatik-Ampel je Regel (grammatik.ts grammatikProfil, „erster Versuch"),
 * Arbeitsblätter (Ampeln aus dem KI-Feedback je Aufgabe, nächste Schritte aus dem Bogen), Onlinetests (Schnitt aus
 * teilnahmen.bewertung über `historie`) und Handlungsbedarf der Kurse (klassen.ts). Nur die eigene Lerngruppe, nur an die
 * Lehrkraft; Namen gehen nie an eine KI (die KI bekommt nur Fach, Jahrgang, Ziel und Bedarf – foerdernFordern.ts).
 *
 * Datenschutz: Auftrag und Bündel liegen verschlüsselt (feldschutz.ts SENSIBEL: foerder_auftraege.daten,
 * foerder_buendel.daten) und laufen nach 6 Wochen ab (beim nächsten Zugriff gelöscht). Konten weg → Zeilen weg (FK).
 */
import { randomBytes } from 'node:crypto'
import { fachAusName } from '../shared/faecher'
import { buendelAblauf, buendelBereinigt, buendelSichtbar, type BuendelInhalt } from '../shared/fuerDich'
import { wackeltAktuell } from '../shared/problemWoerter'
import { kursFuerLernende } from '../shared/freigabePlan'
import type { Vokabel } from '../shared/vokabeltrainer'
import { datenbank, protokolliereServer, type NutzerInfo } from './datenbank'
import { alsNutzer, json, type Anfrage } from './http'
import { historie, lerngruppe, mitgliederVon, type Lerngruppe } from './onlinetest'
import { db as vokDb, istOffen, json_, standVon, type Zeile as VokZeile } from './vokabeln'
import { grammatikProfil } from './grammatik'
import { blattAmpelnJePerson } from './arbeitsblaetter'
import { bedarfJePerson } from './klassen'
import { uebersicht } from '../shared/vokabeltrainer'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS foerder_auftraege (
  id TEXT PRIMARY KEY,
  lehrkraft_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  lerngruppe_id TEXT NOT NULL,
  erstellt INTEGER NOT NULL,
  ablauf INTEGER NOT NULL,
  daten TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS foerder_buendel (
  id TEXT PRIMARY KEY,
  lehrkraft_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  lerngruppe_id TEXT NOT NULL,
  schueler_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  erstellt INTEGER NOT NULL,
  ablauf INTEGER NOT NULL,
  daten TEXT NOT NULL
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

/** Abgelaufenes löschen (befristet, Faustregel 6 Wochen) */
function aufraeumen(jetzt = Date.now()): void {
  db().prepare('DELETE FROM foerder_auftraege WHERE ablauf < ?').run(jetzt)
  db().prepare('DELETE FROM foerder_buendel WHERE ablauf < ?').run(jetzt)
}

/** Sprache der Lerngruppe für Vokabeln/Grammatik (Fach → Sprachcode) */
const spracheVon = (g: Lerngruppe): string => {
  const f = fachAusName(g.fach)
  return f?.sprache ?? f?.uebersetzungssprache ?? ''
}

export interface KindDatenServer {
  id: string
  name: string
  benutzer: string
  vokabeln: { sicher: number; gesamt: number } | null
  wackelig: { term: string; translation: string }[]
  grammatik: { titel: string; ampel: 'sicher' | 'aufbau' | 'schwaeche'; quote: number; erklaerung?: string; beispiele?: string[] }[]
  blaetter: { gruen: number; gelb: number; rot: number; schwierig: string[]; schritte: string[] } | null
  tests: { schnitt: number; prozent: number; anzahl: number } | null
  handlungsbedarf: string[]
}

/**
 * Lerndaten je Kind einer Lerngruppe (nur für deren Lehrkraft). `mitBedarf` (13.10.2026): Das Vorwissen aus fremden Kursen
 * (vorwissen.ts) braucht den Handlungsbedarf nicht – und dessen Berechnung räumt Ausgeblendetes der Lehrkraft auf.
 */
export function foerderDaten(g: Lerngruppe, lehrkraftId: string, jetzt = Date.now(), mitBedarf = true): KindDatenServer[] {
  const mitglieder = mitgliederVon(g)
  const sprache = spracheVon(g)
  // Vokabeln: laufende Kurse der Lerngruppe (nur freigeschaltete Abschnitte, wie in „Meine Klassen")
  const kurse = (
    vokDb().prepare("SELECT * FROM vok_zuweisungen WHERE lehrkraft_id = ? AND lerngruppe_id = ? AND reihe = ''").all(lehrkraftId, g.id) as unknown as VokZeile[]
  )
    .map((z) => kursFuerLernende(z, jetzt))
    .filter((z) => istOffen(z))
  const blaetter = blattAmpelnJePerson(lehrkraftId, g.id)
  const h = historie(g)
  const bedarf = mitBedarf ? bedarfJePerson(g, lehrkraftId, jetzt) : new Map<string, string[]>()
  return mitglieder
    .map((n): KindDatenServer => {
      let sicher = 0
      let gesamt = 0
      const wackelig: { term: string; translation: string }[] = []
      for (const z of kurse) {
        const woerter = json_(z.woerter, [] as Vokabel[])
        if (!woerter.length) continue
        const st = standVon(z.id, n.id)
        const u = uebersicht(woerter, st.woerter, jetzt)
        sicher += u.sicher
        gesamt += u.gesamt
        for (const v of woerter)
          if (wackeltAktuell(st.woerter[v.id], jetzt) && wackelig.length < 30 && !wackelig.some((w) => w.term === v.term))
            wackelig.push({ term: v.term, translation: v.translation })
      }
      const grammatik = sprache
        ? grammatikProfil(n, sprache, lehrkraftId)
            .regeln.filter((r) => r.ampel && r.ampel !== 'wenig')
            .map((r) => ({
              titel: r.titel,
              ampel: r.ampel as 'sicher' | 'aufbau' | 'schwaeche',
              quote: r.quote,
              ...(r.erklaerung ? { erklaerung: r.erklaerung.slice(0, 600) } : {}),
              ...(r.beispiele?.length ? { beispiele: r.beispiele.slice(0, 3) } : {})
            }))
        : []
      const gast = n.quelle === 'gast'
      const t = h.schueler.find((s) => s.ids.includes(n.id)) ?? h.schueler.find((s) => (gast ? !s.benutzer && s.name === n.name : s.benutzer === n.benutzer))
      return {
        id: n.id,
        name: n.name || n.benutzer,
        // Interne Kennung der Gäste ist kein IServ-Name – für die Einzel-Freigabe bleibt der Benutzername nötig
        benutzer: n.benutzer,
        vokabeln: gesamt ? { sicher, gesamt } : null,
        wackelig,
        grammatik,
        blaetter: blaetter[n.id] ?? null,
        tests: t ? { schnitt: t.durchschnitt, prozent: t.prozent, anzahl: t.tests } : null,
        handlungsbedarf: bedarf.get(n.id) ?? []
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

interface AuftragGruppe {
  schluessel: string
  titel: string
  art: 'foerder' | 'forder'
  kinder: string[]
}

/** Gruppen eines Auftrags prüfen: nur Kinder der Lerngruppe, höchstens 12 Gruppen */
function auftragGruppen(roh: unknown, erlaubt: Set<string>): AuftragGruppe[] {
  if (!Array.isArray(roh)) return []
  return roh
    .slice(0, 12)
    .map((x) => x as Record<string, unknown>)
    .map((x) => ({
      schluessel: String(x.schluessel ?? '').slice(0, 80),
      titel: String(x.titel ?? '').slice(0, 120),
      art: x.art === 'forder' ? ('forder' as const) : ('foerder' as const),
      kinder: (Array.isArray(x.kinder) ? (x.kinder as unknown[]) : []).map(String).filter((id) => erlaubt.has(id))
    }))
    .filter((x) => x.schluessel && x.kinder.length)
}

interface BuendelZeile {
  id: string
  lehrkraft_id: string
  lerngruppe_id: string
  schueler_id: string
  status: string
  erstellt: number
  ablauf: number
  daten: string
}

/** Freigegebene, gültige Bündel einer Person (Lernende) */
export function buendelFuer(ich: Pick<NutzerInfo, 'id' | 'rolle'>, jetzt = Date.now()): ({ id: string; erstellt: number } & BuendelInhalt)[] {
  const zeilen = db()
    .prepare("SELECT * FROM foerder_buendel WHERE schueler_id = ? AND status = 'frei' ORDER BY erstellt DESC")
    .all(ich.id) as unknown as BuendelZeile[]
  return zeilen
    .filter((z) => buendelSichtbar(z, ich, jetzt))
    .map((z) => ({
      id: z.id,
      erstellt: z.erstellt,
      ...(buendelBereinigt(json_(z.daten, {})) ?? { fach: '', ziel: '', woerter: [], grammatik: [], hinweise: [] })
    }))
}

export function foerdernRoute(): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { url, req, res, sitzung } = k
    const lernende = url.pathname === '/s/api/fuerdich'
    if (!lernende && url.pathname !== '/server/foerdern' && !url.pathname.startsWith('/server/foerdern/')) return false
    if (!sitzung) return json(res, 401, { fehler: 'Nicht angemeldet.' }), true
    const jetzt = Date.now()
    aufraeumen(jetzt)

    // ---------- Lernende: nur die eigenen, freigegebenen Bündel
    if (lernende) {
      if (req.method !== 'GET') return json(res, 405, { fehler: 'Nicht erlaubt.' }), true
      if (sitzung.nutzer.rolle !== 'schueler') return json(res, 200, { buendel: [] }), true
      return json(res, 200, { buendel: buendelFuer(sitzung.nutzer, jetzt) }), true
    }

    if (sitzung.nutzer.rolle === 'schueler') return json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true
    const ich = alsNutzer(sitzung.nutzer, sitzung.kennung)
    const was = url.pathname.slice('/server/foerdern'.length).replace(/^\//, '')
    const eigeneGruppe = (id: string): Lerngruppe | null => {
      const g = lerngruppe(id)
      return g && g.lehrkraft_id === ich.id ? g : null
    }

    if (req.method === 'GET') {
      if (was === 'daten') {
        const g = eigeneGruppe(String(url.searchParams.get('gruppe') ?? ''))
        if (!g) return json(res, 404, { fehler: 'Diese Lerngruppe gibt es nicht.' }), true
        return json(res, 200, { fach: g.fach, name: g.name, kinder: foerderDaten(g, ich.id, jetzt) }), true
      }
      if (was === 'auftrag') {
        const z = db()
          .prepare('SELECT * FROM foerder_auftraege WHERE id = ? AND lehrkraft_id = ?')
          .get(String(url.searchParams.get('id') ?? ''), ich.id) as { lerngruppe_id: string; daten: string } | undefined
        if (!z) return json(res, 404, { fehler: 'Diese Gruppen sind abgelaufen – bitte beim Freischalten die Lernenden selbst wählen.' }), true
        const gruppen = json_(z.daten, { gruppen: [] as AuftragGruppe[] }).gruppen
        const gr = gruppen.find((x) => x.schluessel === String(url.searchParams.get('gruppe') ?? ''))
        const g = eigeneGruppe(z.lerngruppe_id)
        if (!gr || !g) return json(res, 404, { fehler: 'Diese Gruppe gibt es nicht (mehr).' }), true
        const nachId = new Map(mitgliederVon(g).map((n) => [n.id, n.benutzer]))
        return json(res, 200, { lerngruppe: g.id, titel: gr.titel, art: gr.art, schueler: gr.kinder.map((id) => nachId.get(id)).filter(Boolean) }), true
      }
      if (was === 'buendel') {
        const g = eigeneGruppe(String(url.searchParams.get('gruppe') ?? ''))
        if (!g) return json(res, 404, { fehler: 'Diese Lerngruppe gibt es nicht.' }), true
        const namen = new Map(mitgliederVon(g).map((n) => [n.id, n.name || n.benutzer]))
        const zeilen = db()
          .prepare('SELECT * FROM foerder_buendel WHERE lehrkraft_id = ? AND lerngruppe_id = ? ORDER BY erstellt DESC')
          .all(ich.id, g.id) as unknown as BuendelZeile[]
        return (
          json(res, 200, {
            buendel: zeilen
              .filter((z) => namen.has(z.schueler_id))
              .map((z) => ({
                id: z.id,
                schueler: z.schueler_id,
                name: namen.get(z.schueler_id) ?? '',
                status: z.status,
                erstellt: z.erstellt,
                ablauf: z.ablauf,
                inhalt: buendelBereinigt(json_(z.daten, {}))
              }))
          }),
          true
        )
      }
      return json(res, 404, { fehler: 'Unbekannt.' }), true
    }

    if (req.method !== 'POST') return json(res, 405, { fehler: 'Nicht erlaubt.' }), true
    if (typeof req.headers['x-schulapps-token'] !== 'string') return json(res, 403, { fehler: 'Nur aus der App.' }), true
    const k0 = (await k.koerper()) as Record<string, unknown>

    if (was === 'auftrag') {
      const g = eigeneGruppe(String(k0.gruppe ?? ''))
      if (!g) return json(res, 404, { fehler: 'Diese Lerngruppe gibt es nicht.' }), true
      const gruppen = auftragGruppen(k0.gruppen, new Set(mitgliederVon(g).map((n) => n.id)))
      if (!gruppen.length) return json(res, 400, { fehler: 'Keine Gruppe mit Lernenden.' }), true
      const id = randomBytes(8).toString('hex')
      db()
        .prepare('INSERT INTO foerder_auftraege (id, lehrkraft_id, lerngruppe_id, erstellt, ablauf, daten) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, ich.id, g.id, jetzt, buendelAblauf(jetzt), JSON.stringify({ gruppen }))
      protokolliereServer('foerdern', `Förder-/Fordermaterial: ${gruppen.length} Gruppe(n) bestätigt`, ich.id)
      return json(res, 200, { id }), true
    }
    if (was === 'buendel') {
      const g = eigeneGruppe(String(k0.gruppe ?? ''))
      if (!g) return json(res, 404, { fehler: 'Diese Lerngruppe gibt es nicht.' }), true
      const erlaubt = new Set(mitgliederVon(g).map((n) => n.id))
      const liste = (Array.isArray(k0.buendel) ? (k0.buendel as unknown[]) : []).slice(0, 60).map((x) => x as Record<string, unknown>)
      let n = 0
      for (const b of liste) {
        const sid = String(b.schueler ?? '')
        const inhalt = buendelBereinigt(b.inhalt)
        if (!erlaubt.has(sid) || !inhalt) continue
        // Ein offener Vorschlag je Kind und Lerngruppe – ein neuer ersetzt den alten
        db()
          .prepare("DELETE FROM foerder_buendel WHERE lehrkraft_id = ? AND lerngruppe_id = ? AND schueler_id = ? AND status = 'vorschlag'")
          .run(ich.id, g.id, sid)
        db()
          .prepare(
            'INSERT INTO foerder_buendel (id, lehrkraft_id, lerngruppe_id, schueler_id, status, erstellt, ablauf, daten) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          )
          .run(randomBytes(8).toString('hex'), ich.id, g.id, sid, 'vorschlag', jetzt, buendelAblauf(jetzt), JSON.stringify(inhalt))
        n++
      }
      return json(res, 200, { angelegt: n }), true
    }
    if (was === 'buendel/freigeben' || was === 'buendel/verwerfen') {
      const z = db()
        .prepare('SELECT * FROM foerder_buendel WHERE id = ? AND lehrkraft_id = ?')
        .get(String(k0.id ?? ''), ich.id) as unknown as BuendelZeile | undefined
      if (!z) return json(res, 404, { fehler: 'Dieses Bündel gibt es nicht (mehr).' }), true
      if (was === 'buendel/verwerfen') {
        db().prepare('DELETE FROM foerder_buendel WHERE id = ?').run(z.id)
        return json(res, 200, { ok: true }), true
      }
      db().prepare("UPDATE foerder_buendel SET status = 'frei', ablauf = ? WHERE id = ?").run(buendelAblauf(jetzt), z.id)
      protokolliereServer('foerdern', 'Bündel „Für dich" freigegeben', ich.id)
      return json(res, 200, { ok: true }), true
    }
    return json(res, 404, { fehler: 'Unbekannt.' }), true
  }
}
