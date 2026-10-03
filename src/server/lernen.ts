/**
 * Lern-App der Lernenden (03.10.2026): je Fach eine „Tür", dahinter Karteikästen und Mappen.
 *
 * Abgestimmt mit der Lehrkraft:
 *  - Karteikästen: Vokabeln der zugewiesenen Listen (Leitner-Kasten), Merkzettel aus dem Wissens-
 *    speicher der Unterrichtsreihen, Merkkästen der bearbeiteten Arbeitsblätter.
 *  - Mappen (umblätterbar): ausgefüllte Arbeitsblätter mit Feedback, freigegebene Tafelbilder,
 *    Schreibaufgaben mit Bogen, Tests und Lernprodukte – je Themenbereich.
 * Hier wird nur zusammengetragen, was es schon gibt; Daten bleiben in ihren Tabellen (verschlüsselt).
 * Dazu die Freigabe von Tafelbildern an Lernende (Lehrkraft: POST /server/tafeln/freigeben).
 *
 *  Lernende: GET /s/api/lernen · GET /s/api/tafel?id=
 */
import { randomBytes } from 'node:crypto'
import { datenbank, protokolliereServer, type NutzerInfo } from './datenbank'
import { json, type Anfrage } from './http'
import { gehoertZu, lerngruppe, lerngruppenVon, mitgliederVon } from './onlinetest'
import { blaetterFuerLernen } from './arbeitsblaetter'
import { vokabelListenFuer } from './vokabeln'
import { reihenFuerLernen } from './reihen'
import { fachVon, FAECHER } from '../shared/faecher'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tafel_freigaben (
  id TEXT PRIMARY KEY,
  lehrkraft_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  lerngruppe_id TEXT NOT NULL DEFAULT '',
  schueler TEXT NOT NULL DEFAULT '[]',
  titel TEXT NOT NULL,
  fach TEXT NOT NULL DEFAULT '',
  thema TEXT NOT NULL DEFAULT '',
  bilder TEXT NOT NULL,
  erstellt TEXT NOT NULL
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
/** Eine Abfrage, die fehlschlägt, weil eine Tabelle noch nicht existiert, liefert nichts */
const sicher = <T>(fn: () => T[]): T[] => {
  try {
    return fn()
  } catch {
    return []
  }
}

interface TafelZeile {
  id: string
  lehrkraft_id: string
  lerngruppe_id: string
  schueler: string
  titel: string
  fach: string
  thema: string
  bilder: string
  erstellt: string
}

function tafelIstFuer(z: TafelZeile, ich: NutzerInfo): boolean {
  if (ich.quelle === 'gast' || ich.rolle !== 'schueler') return false
  const nur = json_(z.schueler, [] as string[])
  if (!z.lerngruppe_id) return nur.includes(ich.benutzer)
  const g = lerngruppe(z.lerngruppe_id)
  if (!g || !gehoertZu(g, ich)) return false
  return !nur.length || nur.includes(ich.benutzer)
}

/** Fachname einheitlich (Kennung oder Name → Name) */
const fachName = (f: string): string => fachVon(f)?.label ?? FAECHER.find((x) => x.label.toLowerCase() === f.toLowerCase())?.label ?? (f || 'Weitere')

export interface Karteikasten {
  art: 'vokabeln' | 'merkzettel'
  titel: string
  /** vokabeln: Zuweisung (Trainer), Übersicht des Kastens */
  id?: string
  uebersicht?: unknown
  testTermin?: number | null
  /** merkzettel: die Karten */
  karten?: { titel: string; text: string }[]
}

export interface MappenSeite {
  art: 'blatt' | 'tafel' | 'schreiben' | 'test' | 'produkt'
  titel: string
  datum: number
  link?: string
  /** Kurzfassung des Feedbacks */
  feedback?: { staerken?: string[]; schritte?: string[] }
  /** Tafelbild: Kennung zum Laden der Bilder; Produkt: Bildadresse */
  id?: string
  bild?: string
  text?: string
}

export interface Mappe {
  titel: string
  seiten: MappenSeite[]
}

export interface FachRaum {
  fach: string
  karteikaesten: Karteikasten[]
  mappen: Mappe[]
}

/** Alles, was eine Person hat – je Fach */
export function lernRaeume(ich: NutzerInfo): FachRaum[] {
  const raeume = new Map<string, FachRaum>()
  const raum = (f: string): FachRaum => {
    const n = fachName(f)
    if (!raeume.has(n)) raeume.set(n, { fach: n, karteikaesten: [], mappen: [] })
    return raeume.get(n)!
  }
  const mappe = (r: FachRaum, titel: string): Mappe => {
    const t = titel || 'Weitere Arbeiten'
    let m = r.mappen.find((x) => x.titel === t)
    if (!m) r.mappen.push((m = { titel: t, seiten: [] }))
    return m
  }

  // Vokabeln
  for (const v of sicher(() => vokabelListenFuer(ich)))
    raum(v.fach).karteikaesten.push({ art: 'vokabeln', titel: v.titel, id: v.id, uebersicht: v.uebersicht, testTermin: v.testTermin })

  // Arbeitsblätter: Mappe je Thema, Merkkästen als Karteikasten je Thema
  for (const b of sicher(() => blaetterFuerLernen(ich.id))) {
    const r = raum(b.fach)
    mappe(r, b.thema).seiten.push({ art: 'blatt', titel: b.titel, datum: b.datum, link: `/s/b/${b.id}`, id: b.id, ...(b.bogen ? { feedback: b.bogen } : {}) })
    if (b.merk.length) {
      const titel = `Merkkästen${b.thema ? `: ${b.thema}` : ''}`
      let k = r.karteikaesten.find((x) => x.art === 'merkzettel' && x.titel === titel)
      if (!k) r.karteikaesten.push((k = { art: 'merkzettel', titel, karten: [] }))
      for (const m of b.merk) if (!k.karten!.some((x) => x.text === m.text)) k.karten!.push(m)
    }
  }

  // Unterrichtsreihen: Wissensspeicher als Karteikasten, Lernprodukte in die Mappe der Reihe
  for (const rh of sicher(() => reihenFuerLernen(ich))) {
    const r = raum(rh.fach)
    if (rh.hefter.length) r.karteikaesten.push({ art: 'merkzettel', titel: `Merkzettel: ${rh.titel}`, karten: rh.hefter })
    for (const p of rh.produkte)
      mappe(r, rh.oberthema || rh.titel).seiten.push({ art: 'produkt', titel: p.titel, datum: p.datum, bild: p.bild, link: `/s/r/${rh.id}` })
  }

  // Schreibaufgaben mit Bogen (Rückmeldung)
  for (const z of sicher(
    () =>
      db()
        .prepare(
          "SELECT f.id, f.titel, f.vorlage, f.art, a.fassungen, a.aktualisiert FROM feedback_freigaben f JOIN feedback_abgaben a ON a.freigabe_id = f.id WHERE a.schueler_id = ? AND f.art IN ('', 'reihe')"
        )
        .all(ich.id) as { id: string; titel: string; vorlage: string; fassungen: string; aktualisiert: string }[]
  )) {
    const v = json_(z.vorlage, {} as { meta?: { subjectLabel?: string; title?: string } })
    const f = json_(z.fassungen, [] as { text: string; bogen?: { staerken?: string[]; schritte?: string[] } }[])
    const letzte = [...f].reverse().find((x) => x.bogen)
    mappe(raum(v.meta?.subjectLabel ?? ''), 'Schreibaufgaben').seiten.push({
      art: 'schreiben',
      titel: z.titel,
      datum: Date.parse(z.aktualisiert) || 0,
      link: `/s/a/${z.id}`,
      text: f.at(-1)?.text?.slice(0, 600),
      ...(letzte?.bogen ? { feedback: { staerken: letzte.bogen.staerken, schritte: letzte.bogen.schritte } } : {})
    })
  }

  // Tests (nur mit Konto)
  for (const t of sicher(
    () =>
      db()
        .prepare(
          'SELECT t.id, t.abgabe, o.titel, o.einstellungen FROM teilnahmen t JOIN onlinetests o ON o.id = t.test_id WHERE t.schueler_id = ? AND t.abgabe IS NOT NULL'
        )
        .all(ich.id) as { id: string; abgabe: number; titel: string; einstellungen: string }[]
  )) {
    const e = json_(t.einstellungen, {} as { fach?: string })
    mappe(raum(e.fach ?? ''), 'Tests').seiten.push({ art: 'test', titel: t.titel, datum: t.abgabe, link: `/s/e/${t.id}` })
  }

  // Tafelbilder
  for (const z of sicher(() =>
    (db().prepare('SELECT * FROM tafel_freigaben ORDER BY erstellt DESC').all() as unknown as TafelZeile[]).filter((x) => tafelIstFuer(x, ich))
  )) {
    mappe(raum(z.fach), z.thema || 'Tafelbilder').seiten.push({ art: 'tafel', titel: z.titel, datum: Date.parse(z.erstellt) || 0, id: z.id })
  }

  for (const r of raeume.values()) for (const m of r.mappen) m.seiten.sort((a, b) => b.datum - a.datum)
  return [...raeume.values()].sort((a, b) => a.fach.localeCompare(b.fach, 'de'))
}

export function lernenRoute(): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { url, req, res, sitzung } = k
    const schueler = url.pathname === '/s/api/lernen' || url.pathname === '/s/api/tafel'
    const lehrer = url.pathname === '/server/tafeln/freigeben'
    if (!schueler && !lehrer) return false
    if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
    const ich = sitzung.nutzer
    if (req.method === 'GET' && url.pathname === '/s/api/lernen') return (json(res, 200, { raeume: lernRaeume(ich) }), true)
    if (req.method === 'GET' && url.pathname === '/s/api/tafel') {
      const z = db()
        .prepare('SELECT * FROM tafel_freigaben WHERE id = ?')
        .get(String(url.searchParams.get('id') ?? '')) as TafelZeile | undefined
      if (!z || !tafelIstFuer(z, ich)) return (json(res, 404, { fehler: 'Dieses Tafelbild ist nicht für dich freigegeben.' }), true)
      return (json(res, 200, { titel: z.titel, bilder: json_(z.bilder, [] as string[]) }), true)
    }
    // ---------- Lehrkraft: Tafelbild freigeben
    if (req.method !== 'POST' || typeof req.headers['x-schulapps-token'] !== 'string') return (json(res, 403, { fehler: 'Nicht erlaubt.' }), true)
    if (ich.rolle === 'schueler') return (json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true)
    const k0 = (await k.koerper()) as Record<string, unknown>
    const gid = String(k0.lerngruppeId ?? '')
    const g = gid ? lerngruppe(gid) : null
    if (gid && (!g || g.lehrkraft_id !== ich.id)) return (json(res, 400, { fehler: 'Bitte eine eigene Lerngruppe wählen.' }), true)
    const erlaubt = new Set((g ? [g] : lerngruppenVon(ich.id)).flatMap((x) => mitgliederVon(x).map((n) => n.benutzer)))
    const einzelne = Array.isArray(k0.schueler) ? [...new Set((k0.schueler as unknown[]).map(String).filter((b) => erlaubt.has(b)))] : []
    if (!g && !einzelne.length) return (json(res, 400, { fehler: 'Bitte eine Lerngruppe oder einzelne Lernende wählen.' }), true)
    const bilder = (Array.isArray(k0.bilder) ? k0.bilder : [])
      .map(String)
      .filter((b) => b.startsWith('<svg') && b.length < 3_000_000)
      .slice(0, 6)
    if (!bilder.length) return (json(res, 400, { fehler: 'Das Tafelbild fehlt.' }), true)
    const id = randomBytes(8).toString('hex')
    db()
      .prepare(
        'INSERT INTO tafel_freigaben (id, lehrkraft_id, lerngruppe_id, schueler, titel, fach, thema, bilder, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        id,
        ich.id,
        g?.id ?? '',
        JSON.stringify(einzelne),
        String(k0.titel ?? 'Tafelbild').slice(0, 160),
        String(k0.fach ?? '').slice(0, 60),
        String(k0.thema ?? '').slice(0, 160),
        JSON.stringify(bilder),
        new Date().toISOString()
      )
    protokolliereServer('lernen', 'Tafelbild für Lernende freigegeben', ich.id)
    return (json(res, 200, { id }), true)
  }
}
