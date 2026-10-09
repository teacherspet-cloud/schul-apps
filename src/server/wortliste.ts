/**
 * Wortliste im Fachordner der Lernenden (09.10.2026, Wunsch der Lehrkraft; Regeln: shared/wortliste.ts,
 * shared/meineBuecher.ts).
 *
 *  GET /s/api/wortliste?fach=<Fach>&id=<Kurs>&id=…   Wörter des Fachs mit dem eigenen Stand – als Bücherbord
 *
 * Die Kurse nennt der Ordner (dieselben wie im Register „Vokabeln"); jeder wird hier noch einmal geprüft (für die
 * Person freigegeben, offen) und nur mit seinen freien Abschnitten gelesen (geplante Freischaltung, kursFuerLernende).
 *
 * „Meine Bücher" (09.10.2026, Entscheidung der Lehrkraft): Aus der Herkunft der Kurse ergibt sich das Lehrwerk. Aufs
 * Bord kommen alle FRÜHEREN Bände der Reihe vollständig (bis zur Klassenstufe) und der aktuelle Band (der höchste mit
 * Freigaben) nur mit seinen freigegebenen Abschnitten. Gelesen wird dafür nur Lehrwerksdaten (im Kontext der Lehrkraft
 * des Kurses, wie der Vokabelweg) und der Lernstand der anfragenden Person – nichts von anderen Lernenden.
 * Wörter aus Kursen, die in keinem Band stehen (eigene Listen), bleiben als `gruppen` („Weitere Wörter").
 * Die Gruppen „Vokabelweg …" gibt es hier nicht mehr.
 */
import { gzipSync } from 'zlib'
import { listTextbooks } from '../main/services/storage/textbooks'
import { fachAusName } from '../shared/faecher'
import { kursFuerLernende } from '../shared/freigabePlan'
import { abschnitteEinordnen } from '../shared/kursAbschnitte'
import { baendeWahl, bandRang, buchKurz, type MeinBuch } from '../shared/meineBuecher'
import { abschnitteAus, quelleAusTitel, quelleUnits, reiheVon, type Buch, type Quelle } from '../shared/vokabelLaufbahn'
import type { Vokabel, WortStand } from '../shared/vokabeltrainer'
import { kursGruppen, suchform, wortAus, wortStatus, zusammenfuehren, type Wortliste, type WortlisteGruppe, type WortStatus } from '../shared/wortliste'
import { nutzerNachId } from './datenbank'
import { alsNutzer, json, type Anfrage } from './http'
import { imNutzer } from './kontext'
import { istOffen, json_, klasseFuer, standVon, teileVon, vokIstFuer, zeile } from './vokabeln'
import { buchFuer, buchNamen, wegStand } from './vokabelweg'

/** Fachname einheitlich (Kennung, Name oder Sprachkürzel → Name) */
const fachName = (f: string): string => fachAusName(f)?.label ?? f.trim()

type Ich = Parameters<typeof vokIstFuer>[1]

interface BandMeta {
  id: string
  name: string
  language: string
  reihe?: string
  band?: string
  edition?: string
  ausgabe?: string
  stateId?: string
  grade?: number
}

// Lehrwerke einer Lehrkraft (Übersicht ohne Wörter) – kurz zwischengespeichert, je Lehrkraft
const listenCache = new Map<string, { liste: BandMeta[]; zeit: number }>()
async function baendeDerLehrkraft(lehrkraftId: string): Promise<BandMeta[]> {
  const c = listenCache.get(lehrkraftId)
  if (c && Date.now() - c.zeit < 10 * 60_000) return c.liste
  const lk = nutzerNachId(lehrkraftId)
  const liste = lk ? ((await imNutzer(alsNutzer(lk), async () => listTextbooks()).catch(() => [])) as BandMeta[]) : []
  listenCache.set(lehrkraftId, { liste, zeit: Date.now() })
  return liste
}

const RANG: Record<WortStatus, number> = { neu: 0, aufbau: 1, sicher: 2 }
const besser = (a: WortStatus | undefined, b: WortStatus): WortStatus => (a && RANG[a] >= RANG[b] ? a : b)

/** Ein Lehrwerksband, aus dem die Person etwas freigegeben bekam */
interface Genutzt {
  buch: Buch
  lehrkraftId: string
  /** freigegebene Abschnitte: „unit\u0001abschnitt" (klein) */
  frei: Set<string>
  jahrgang: number | null
}

const abschnittSchluessel = (unit: string, abschnitt: string): string => `${unit.trim().toLowerCase()}\u0001${abschnitt.trim().toLowerCase()}`

export async function wortlisteFuer(ich: Ich, fach: string, kursIds: string[]): Promise<Wortliste> {
  const gruppen: WortlisteGruppe[] = []
  let sprache = ''
  // Bester eigener Stand je Wort (Suchform) über alle Kurse – gilt auch für dasselbe Wort im Buch
  const standNachTerm = new Map<string, WortStatus>()
  const genutzt = new Map<string, Genutzt>()
  for (const id of [...new Set(kursIds)].slice(0, 40)) {
    const z0 = zeile(id)
    if (!z0 || !istOffen(z0) || !vokIstFuer(z0, ich)) continue
    // Nur freie Abschnitte (geplante Freischaltung, 09.10.2026)
    const z = kursFuerLernende(z0)
    const woerter = json_(z.woerter, [] as Vokabel[])
    if (!woerter.length) continue
    sprache ||= z.sprache
    const teile = teileVon(z)
    let quelle = json_(z.quelle, null as Partial<Quelle> | null)
    const staende = standVon(z.id, ich.id).woerter
    gruppen.push(...kursGruppen(z.id, teile, abschnitteEinordnen(teile, quelle), woerter, staende))
    for (const v of woerter) {
      const k = suchform(v.term)
      standNachTerm.set(k, besser(standNachTerm.get(k), wortStatus(staende[v.id])))
    }
    // Herkunft: gespeichert oder (ältere Kurse) aus dem Titel
    if (!quelle?.lehrwerk) quelle = quelleAusTitel(z.titel, await buchNamen(z.lehrkraft_id).catch(() => []))
    if (!quelle?.lehrwerk) continue
    const buch = await buchFuer(quelle.lehrwerk, z.lehrkraft_id).catch(() => null)
    if (!buch) continue
    const g = genutzt.get(buch.id) ?? { buch, lehrkraftId: z.lehrkraft_id, frei: new Set<string>(), jahrgang: null }
    for (const u of quelleUnits(quelle)) for (const a of u.abschnitte) g.frei.add(abschnittSchluessel(u.unit, a))
    g.jahrgang ??= klasseFuer(z, ich)
    genutzt.set(buch.id, g)
  }

  // Bücherbord je Lehrwerksreihe
  const buecher: MeinBuch[] = []
  const reihen = new Map<string, Genutzt[]>()
  for (const g of genutzt.values()) reihen.set(reiheVon(g.buch), [...(reihen.get(reiheVon(g.buch)) ?? []), g])
  const konto = ich.quelle !== 'gast'
  for (const [key, liste] of reihen) {
    const aktuell = [...liste].sort((a, b) => bandRang(b.buch as BandMeta) - bandRang(a.buch as BandMeta))[0]
    const geschwister = (await baendeDerLehrkraft(aktuell.lehrkraftId)).filter((b) => reiheVon(b) === key)
    if (!geschwister.some((b) => b.id === aktuell.buch.id)) geschwister.push(aktuell.buch as BandMeta)
    const wahl = baendeWahl(geschwister, aktuell.buch.id, aktuell.jahrgang ?? liste.find((x) => x.jahrgang)?.jahrgang ?? null)
    // Lernstand des Vokabelwegs (nur Konten): gleiche Kennungen wie abschnitteAus
    const weg = konto ? wegStand(ich.id, key).woerter : ({} as Record<string, WortStand>)
    const status = (v: Vokabel): WortStatus => besser(standNachTerm.get(suchform(v.term)), wortStatus(weg[v.id]))
    for (const id of [...wahl.frueher, ...(wahl.aktuell ? [wahl.aktuell] : [])]) {
      const istAktuell = id === wahl.aktuell
      const buch = istAktuell ? aktuell.buch : await buchFuer(id, aktuell.lehrkraftId).catch(() => null)
      if (!buch) continue
      sprache ||= buch.language
      const meta = (geschwister.find((b) => b.id === id) ?? buch) as BandMeta
      const abschnitte = abschnitteAus(buch).filter((a) => !istAktuell || aktuell.frei.has(abschnittSchluessel(a.unit, a.section)))
      if (!abschnitte.length) continue
      buecher.push({
        id: buch.id,
        name: buch.name,
        ...(meta.reihe ? { reihe: meta.reihe } : {}),
        ...(meta.band ? { band: meta.band } : {}),
        ...(meta.ausgabe ? { ausgabe: meta.ausgabe } : {}),
        ...(meta.stateId ? { stateId: meta.stateId } : {}),
        ...(typeof meta.grade === 'number' ? { grade: meta.grade } : {}),
        aktuell: istAktuell,
        kurz: buchKurz({ name: buch.name, reihe: meta.reihe, band: meta.band }),
        gruppen: abschnitte.map((a, i) => ({
          key: a.key,
          titel: a.section && a.section !== a.unit ? `${a.unit} · ${a.section}` : a.unit,
          zeit: 0,
          folge: i,
          woerter: a.woerter.map((v) => ({ ...wortAus(v, undefined), status: status(v) }))
        }))
      })
    }
  }

  // Weitere Wörter: was in keinem Band auf dem Bord steht (eigene Listen, Ergänzungen der Lehrkraft)
  const imBuch = new Set(buecher.flatMap((b) => b.gruppen.flatMap((g) => g.woerter.map((w) => suchform(w.term)))))
  const weitere = zusammenfuehren(gruppen.map((g) => ({ ...g, woerter: g.woerter.filter((w) => !imBuch.has(suchform(w.term))) })))
  return { fach: fachName(fach), sprache, gruppen: weitere, buecher }
}

export function wortlisteRoute(): (k: Anfrage) => Promise<boolean> {
  return async ({ url, req, res, sitzung }) => {
    if (url.pathname !== '/s/api/wortliste') return false
    if (req.method !== 'GET') return (json(res, 405, { fehler: 'Nur lesen.' }), true)
    if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
    if (sitzung.nutzer.rolle !== 'schueler') return (json(res, 403, { fehler: 'Die Wortliste gibt es für Lernende.' }), true)
    const fach = String(url.searchParams.get('fach') ?? '').slice(0, 60)
    const ids = url.searchParams.getAll('id').map((x) => x.slice(0, 64))
    const wert = await wortlisteFuer(sitzung.nutzer, fach, ids)
    // Mehrere Bände sind schnell 1–2 MB: gepackt schicken, wenn der Browser es kann
    const roh = JSON.stringify(wert)
    if (roh.length > 32_000 && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))) {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-encoding': 'gzip', vary: 'accept-encoding' })
      res.end(gzipSync(roh))
      return true
    }
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(roh)
    return true
  }
}
