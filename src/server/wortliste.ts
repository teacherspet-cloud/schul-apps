/**
 * Wortliste im Fachordner der Lernenden (09.10.2026, Wunsch der Lehrkraft; Regeln: shared/wortliste.ts,
 * shared/meineBuecher.ts, shared/sprachstand.ts).
 *
 *  GET /s/api/wortliste?fach=<Fach>[&alle=1]   Wörter des Fachs mit dem eigenen Stand – als Bücherbord
 *
 * „Meine Bücher" (Entscheidung der Lehrkraft, seit 10.10.2026 nach Schuljahren): Aufs Bord kommen der AKTUELLE Band (der
 * höchste mit Freigaben in diesem Schuljahr) nur mit seinen freigegebenen Abschnitten und die Bände FRÜHERER Jahre ganz
 * (Klasse und Schuljahr, Medaille). Die Bände ergeben sich je Abschnitt (server/sprachstand.ts) – nicht mehr nur aus der
 * Herkunft des Kurses, die nur den zuletzt hinzugefügten Band nennt (Befund 10.10.2026: Green Line 6 stand als „More
 * words", seine Abschnitte in falscher Reihenfolge). Abschnitte stehen aufsteigend wie im Buch.
 * Gelesen werden alle Kurse der Person (auch beendete, in denen sie geübt hat – mitgenommener Lernstand zählt), die
 * Lehrwerksdaten (im Kontext der Lehrkraft des Kurses) und nur der eigene Lernstand.
 * Wörter aus Kursen, die in keinem Band auf dem Bord stehen (eigene Listen), bleiben als `gruppen` („Weitere Wörter").
 *
 * „Alle Wörter" (`alle=1`, 10.10.2026, Wunsch der Lehrkraft für die alphabetische Liste): dazu `nichtDran` – die übrigen
 * Wörter aller Bände der Reihe (auch spätere Bände und noch nicht freigegebene Abschnitte), ohne eigenen Stand. Erst auf
 * Anforderung geladen (einige tausend Wörter).
 *
 * Doppelte (gleicher Begriff, gemeinsame Bedeutung) führt die alphabetische Liste zusammen (shared/meineBuecher.ts);
 * `doppeltePruefen` zählt sie beim Start und nach Freigaben je Kurs und schreibt – nur wenn es welche gibt – eine Zeile
 * ins Protokoll (ohne Namen).
 */
import { gzipSync } from 'zlib'
import { fachAusName } from '../shared/faecher'
import { abschnitteEinordnen } from '../shared/kursAbschnitte'
import { bandMedaille, freieAbschnitte, prozent, zahlenAus } from '../shared/sprachstand'
import { buchKurz, doppelteZaehlen, type MeinBuch } from '../shared/meineBuecher'
import { abschnitteAus, reiheVon, type Buch } from '../shared/vokabelLaufbahn'
import type { Vokabel, WortStand } from '../shared/vokabeltrainer'
import { kursGruppen, suchform, wortAus, wortStatus, zusammenfuehren, type Wortliste, type WortlisteGruppe, type WortStatus } from '../shared/wortliste'
import { protokolliereServer } from './datenbank'
import { json, type Anfrage } from './http'
import { baendeDerLehrkraft, sprachAnalyse, type BuchMeta } from './sprachstand'
import { db, json_, kursHaken, teileVon, vokIstFuer } from './vokabeln'
import { buchFuer, wegStand } from './vokabelweg'
import { kursFuerLernende } from '../shared/freigabePlan'

/** Fachname einheitlich (Kennung, Name oder Sprachkürzel → Name) */
const fachName = (f: string): string => fachAusName(f)?.label ?? f.trim()

type Ich = Parameters<typeof vokIstFuer>[1]

const RANG: Record<WortStatus, number> = { neu: 0, aufbau: 1, sicher: 2 }
const besser = (a: WortStatus | undefined, b: WortStatus): WortStatus => (a && RANG[a] >= RANG[b] ? a : b)

/** Gruppen eines Bandes (aufsteigend wie im Buch) mit dem Stand je Wort */
function buchGruppen(abschnitte: ReturnType<typeof abschnitteAus>, status: (v: Vokabel) => WortStatus | null): WortlisteGruppe[] {
  return abschnitte.map((a, i) => ({
    key: a.key,
    titel: a.section && a.section !== a.unit ? `${a.unit} · ${a.section}` : a.unit,
    unit: a.unit,
    abschnitt: a.section,
    zeit: 0,
    folge: i,
    woerter: a.woerter.map((v) => {
      const s = status(v)
      return { ...wortAus(v, undefined), status: s ?? 'neu' }
    })
  }))
}

function meinBuch(buch: BuchMeta, gruppen: WortlisteGruppe[], aktuell: boolean, schuljahr: number | null, klasse: number | null): MeinBuch {
  const z = zahlenAus(gruppen.flatMap((g) => g.woerter.map((w) => w.status)))
  return {
    id: buch.id,
    name: buch.name,
    ...(buch.reihe ? { reihe: buch.reihe } : {}),
    ...(buch.band ? { band: buch.band } : {}),
    ...(buch.ausgabe ? { ausgabe: buch.ausgabe } : {}),
    ...(buch.stateId ? { stateId: buch.stateId } : {}),
    ...(typeof buch.grade === 'number' ? { grade: buch.grade } : {}),
    aktuell,
    kurz: buchKurz({ name: buch.name, reihe: buch.reihe, band: buch.band }),
    gruppen,
    schuljahr,
    klasse,
    sicherProzent: prozent(z.sicher, z.gesamt),
    kennenProzent: prozent(z.kennengelernt, z.gesamt),
    medaille: aktuell ? null : bandMedaille(z)
  }
}

export async function wortlisteFuer(ich: Ich, fach: string, alle = false): Promise<Wortliste & { nichtDran?: MeinBuch[] }> {
  const ziel = fachName(fach)
  const analysen = (await sprachAnalyse(ich)).filter((a) => a.fach === ziel || a.kurse.some((k) => fachName(k.z.fach) === ziel))
  const buecher: MeinBuch[] = []
  const nichtDran: MeinBuch[] = []
  const gruppen: WortlisteGruppe[] = []
  let sprache = ''
  const konto = ich.quelle !== 'gast'
  for (const a of analysen) {
    sprache ||= a.sprache
    const stand = (buch: Buch): ((v: Vokabel) => WortStatus) => {
      const weg = konto ? wegStand(ich.id, reiheVon(buch)).woerter : ({} as Record<string, WortStand>)
      return (v) => besser(a.nachTerm.get(suchform(v.term))?.status, wortStatus(weg[v.id]))
    }
    const lk = [...a.baende.values()][0]?.lehrkraftId ?? a.kurse[0]?.z.lehrkraft_id
    const laden = async (id: string): Promise<BuchMeta | null> => a.baende.get(id)?.buch ?? (lk ? ((await buchFuer(id, lk).catch(() => null)) as BuchMeta | null) : null)
    // Frühere Jahre ganz (älteste zuerst), dann der aktuelle Band mit dem Freigegebenen
    for (const f of a.frueher) {
      const buch = await laden(f.id)
      if (!buch) continue
      const g = buchGruppen(abschnitteAus(buch), stand(buch))
      if (g.length) buecher.push(meinBuch(buch, g, false, f.schuljahr, f.klasse))
    }
    const akt = a.aktuell ? a.baende.get(a.aktuell.id) : undefined
    if (a.aktuell && akt) {
      const g = buchGruppen(freieAbschnitte(akt.buch, akt.frei), stand(akt.buch))
      if (g.length) buecher.push(meinBuch(akt.buch, g, true, a.aktuell.schuljahr, a.aktuell.klasse))
    }
    // Weitere Wörter: Kurswörter, die in keinem Band auf dem Bord stehen (eigene Listen, Platzhalter-Bände)
    for (const k of a.kurse) {
      const z = kursFuerLernende(k.z)
      const teile = teileVon(z)
      const staende = Object.fromEntries(k.woerter.filter((w) => w.st).map((w) => [w.v.id, w.st!]))
      gruppen.push(...kursGruppen(z.id, teile, abschnitteEinordnen(teile, json_(z.quelle || '{}', {})), json_(z.woerter, [] as Vokabel[]), staende))
    }
    if (alle) {
      // Alle Bände der Reihe(n): was noch nicht auf dem Bord steht
      const reihen = new Set([...a.baende.values()].map((b) => reiheVon(b.buch)))
      const ids = new Set([...a.baende.keys(), ...(lk ? (await baendeDerLehrkraft(lk)).filter((b) => reihen.has(reiheVon(b))).map((b) => b.id) : [])])
      for (const id of ids) {
        const buch = await laden(id)
        if (!buch) continue
        const da = buecher.find((b) => b.id === id)
        const vorhanden = new Set(da?.gruppen.map((g) => g.key) ?? [])
        const rest = abschnitteAus(buch).filter((x) => !vorhanden.has(x.key))
        if (rest.length) nichtDran.push(meinBuch(buch, buchGruppen(rest, () => 'neu'), false, null, null))
      }
    }
  }
  const imBuch = new Set(buecher.flatMap((b) => b.gruppen.flatMap((g) => g.woerter.map((w) => suchform(w.term)))))
  const weitere = zusammenfuehren(gruppen.map((g) => ({ ...g, woerter: g.woerter.filter((w) => !imBuch.has(suchform(w.term))) })))
    // Wie im Buch: älteste zuerst (10.10.2026)
    .reverse()
  return { fach: ziel, sprache, gruppen: weitere, buecher, ...(alle ? { nichtDran } : {}) }
}

/**
 * Doppelte Vokabeln zählen (10.10.2026): je Kurs gleiche Begriffe mit gemeinsamer Bedeutung. Günstig (nur Wörter, kein
 * Lernstand); eine Protokollzeile nur, wenn es welche gibt – ohne Namen. Die alphabetische Liste führt sie zusammen.
 */
export function doppeltePruefen(anlass: string, kursId?: string): { kurse: number; doppelte: number } {
  let kurse = 0
  let doppelte = 0
  try {
    const zeilen = (kursId
      ? db().prepare('SELECT id, woerter FROM vok_zuweisungen WHERE id = ?').all(kursId)
      : db().prepare("SELECT id, woerter FROM vok_zuweisungen WHERE status = 'offen'").all()) as { id: string; woerter: string }[]
    for (const z of zeilen) {
      const n = doppelteZaehlen(json_(z.woerter, [] as Vokabel[]))
      if (n) (kurse++, (doppelte += n))
    }
    if (doppelte)
      protokolliereServer(
        'vokabeln',
        `Doppelte Vokabeln (${anlass}): ${doppelte} in ${kurse} Kurs${kurse === 1 ? '' : 'en'} – die alphabetische Liste führt sie zusammen`
      )
  } catch {
    // Die Prüfung darf nie den Betrieb stören
  }
  return { kurse, doppelte }
}

// Nach jeder Freigabe die Wörter dieses Kurses prüfen
kursHaken.nachFreigabe = (kursId) => void doppeltePruefen('Freigabe', kursId)

export function wortlisteRoute(): (k: Anfrage) => Promise<boolean> {
  return async ({ url, req, res, sitzung }) => {
    if (url.pathname !== '/s/api/wortliste') return false
    if (req.method !== 'GET') return (json(res, 405, { fehler: 'Nur lesen.' }), true)
    if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
    if (sitzung.nutzer.rolle !== 'schueler') return (json(res, 403, { fehler: 'Die Wortliste gibt es für Lernende.' }), true)
    const fach = String(url.searchParams.get('fach') ?? '').slice(0, 60)
    const wert = await wortlisteFuer(sitzung.nutzer, fach, url.searchParams.get('alle') === '1')
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

