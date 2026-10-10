/**
 * Vokabeln je Sprache für Lernende (10.10.2026, Entscheidung der Lehrkraft „Option A"; Regeln: shared/sprachstand.ts).
 * Ersetzt die Seite „Mein Vokabelweg" (/s/vw/… leitet in den Fachordner um).
 *
 *  GET  /s/api/sprachstand[?fach=Englisch]        je Sprache: aktueller Band (Units, Abschnitte, Zahlen), frühere
 *                                                 Jahre (Medaille, sicher, kennengelernt), Größe der heutigen Runde
 *  GET  /s/api/vokabeln/liste?id=sp:<sprache>     die Tagesrunde der Sprache als Kasten: alle Abschnitte DIESES
 *                                                 Schuljahres aus allen Kursen, dazu 2–3 wackelige Wörter früherer Bände
 *                                                 (mit Herkunft); in den 3 Tagen vor einem Test nur der Teststoff
 *  GET  /s/api/vokabeln/liste?id=bd:<band>        ein früherer Band zum freiwilligen Wiederholen und Weiterlernen
 *                                                 (keine Pflicht-Neuwörter)
 *  POST /s/api/vokabeln/antwort|spiel {id: sp:…|bd:…}
 *
 * Wörter aus Kursen behalten ihre Kennung „z:<kurs>:<wort>" (der Lernstand bleibt im Kurs), Lehrwerkswörter ohne Kurs
 * „b:<band>:<u>:<s>:<i>" (Lernstand der Reihe in vok_laufbahn, wie bisher der Vokabelweg). Rekorde der Sprachrunde:
 * eigene Zeile in vok_laufbahn („sprache:<code>") – keine neue Tabelle.
 *
 * Band je Abschnitt (10.10.2026, Befund der Lehrkraft: Green Line 6 stand als „More words"): Die Herkunft eines Kurses
 * (`quelle`) nennt nur den zuletzt hinzugefügten Band; maßgeblich ist der Band JE ABSCHNITT (`teile[].lehrwerk`, seit
 * der Wartung vokabel-baende-2026-10-10 für alle Kurse gesetzt). Die Herkunft gilt nur noch für Kurse ohne diese Angabe.
 */
import { listTextbooks } from '../main/services/storage/textbooks'
import { fachAusName } from '../shared/faecher'
import { kursFuerLernende } from '../shared/freigabePlan'
import { bandRang, buchKurz } from '../shared/meineBuecher'
import { schuljahrVon } from '../shared/schulkalender'
import {
  abschnittKennen,
  bandMedaille,
  baendeNachJahren,
  naechsteMedaille,
  nachUnitsImBuch,
  rundenWoerter,
  summe,
  testPause,
  zahlenAus,
  abschnittSchluessel,
  abschnitteDesTeils,
  freieAbschnitte,
  type AktuellerBand,
  type AltKandidat,
  type BandAnsicht,
  type FruehererBand,
  type SprachStand,
  type StandZahlen
} from '../shared/sprachstand'
import { abschnitteAus, quelleAusTitel, quelleUnits, reiheVon, type Buch, type Quelle } from '../shared/vokabelLaufbahn'
import { tagesRunde, type Vokabel, type WortStand } from '../shared/vokabeltrainer'
import { suchform, wortStatus, type WortStatus } from '../shared/wortliste'
import type { NutzerInfo } from './datenbank'
import { nutzerNachId } from './datenbank'
import { alsNutzer, json, type Anfrage } from './http'
import { imNutzer } from './kontext'
import {
  abfrageAuswerten,
  db,
  fachfarbeDerLehrkraft,
  istOffen,
  json_,
  klasseFuer,
  spielEintragen,
  spieleHeuteFrei,
  standSpeichern,
  standVon,
  standardVerben,
  tageszielVon,
  teileEingeordnet,
  teileVon,
  vokIstFuer,
  zeile,
  type VokStand,
  type Zeile
} from './vokabeln'
import { buchFuer, buchNamen, wegSpeichern, wegStand } from './vokabelweg'

const FACH_ZU: Record<string, string> = { en: 'Englisch', fr: 'Französisch', es: 'Spanisch', it: 'Italienisch', la: 'Latein', ru: 'Russisch' }

/** Lehrwerk mit den Angaben der Datei (Klassenstufe, Band, Land) */
export type BuchMeta = Buch & { grade?: number; stateId?: string; ausgabe?: string }

export interface BandMetaKurz {
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
const listenCache = new Map<string, { liste: BandMetaKurz[]; zeit: number }>()
export async function baendeDerLehrkraft(lehrkraftId: string): Promise<BandMetaKurz[]> {
  const c = listenCache.get(lehrkraftId)
  if (c && Date.now() - c.zeit < 10 * 60_000) return c.liste
  const lk = nutzerNachId(lehrkraftId)
  const liste = lk ? ((await imNutzer(alsNutzer(lk), async () => listTextbooks()).catch(() => [])) as BandMetaKurz[]) : []
  listenCache.set(lehrkraftId, { liste, zeit: Date.now() })
  return liste
}

// ---------------------------------------------------------------- Kurse der Person

interface KursWort {
  v: Vokabel
  /** Kennung im Kasten „z:<kurs>:<wort>" */
  zid: string
  st: WortStand | undefined
  buch: string | null
  unit: string
  jahr: number
}

interface Kurs {
  z: Zeile
  offen: boolean
  woerter: KursWort[]
  klasse: number | null
}

interface BandInfo {
  buch: BuchMeta
  lehrkraftId: string
  /** freigegebene Abschnitte „unit\u0001abschnitt" (klein) */
  frei: Set<string>
  jahre: Set<number>
}

export interface SprachAnalyse {
  /** Wessen Stand (für die Lehrwerks-Stände der Reihe) */
  ichId: string
  sprache: string
  fach: string
  farbe: string | null
  kurse: Kurs[]
  baende: Map<string, BandInfo>
  /** Bände der Reihe(n) aus der Übersicht der Lehrkraft (ohne Wörter) */
  geschwister: BandMetaKurz[]
  jahrgang: number | null
  schuljahr: number
  /** bester Stand je Begriff (Suchform) über alle Kurse */
  nachTerm: Map<string, { status: WortStatus; st: WortStand; id: string }>
  aktuell: { id: string; klasse: number | null; schuljahr: number } | null
  frueher: { id: string; klasse: number | null; schuljahr: number | null }[]
}

const RANG: Record<WortStatus, number> = { neu: 0, aufbau: 1, sicher: 2 }

/** Alle Kurse der Person (auch beendete, wenn sie darin geübt hat), Wörter mit Band, Unit und Schuljahr */
async function kurseVon(ich: NutzerInfo, jetzt: number): Promise<Kurs[]> {
  const zeilen = (db().prepare('SELECT * FROM vok_zuweisungen ORDER BY erstellt ASC').all() as unknown as Zeile[]).filter((z) => vokIstFuer(z, ich))
  const aus: Kurs[] = []
  for (const z0 of zeilen) {
    // Nur freie Abschnitte (geplante Freischaltung, 09.10.2026)
    const z = kursFuerLernende(z0, jetzt)
    const woerter = json_(z.woerter, [] as Vokabel[])
    if (!woerter.length) continue
    const st = standVon(z.id, ich.id).woerter
    const offen = istOffen(z)
    if (!offen && !Object.keys(st).length) continue
    const teile = teileVon(z)
    let quelle = json_(z.quelle || '{}', {} as Partial<Quelle>)
    if (!quelle.lehrwerk) quelle = quelleAusTitel(z.titel, await buchNamen(z.lehrkraft_id).catch(() => [])) ?? {}
    const einordnung = teileEingeordnet(z, teile)
    const kw: KursWort[] = []
    let pos = 0
    teile.forEach((t, i) => {
      const letzter = i === teile.length - 1
      const stueck = letzter ? woerter.slice(pos) : woerter.slice(pos, pos + Math.max(0, t.anzahl))
      pos += stueck.length
      const jahr = schuljahrVon(t.zeit || Date.parse(z.erstellt) || jetzt)
      const buch = t.lehrwerk || quelle.lehrwerk || null
      for (const v of stueck) kw.push({ v, zid: `z:${z.id}:${v.id}`, st: st[v.id], buch, unit: einordnung[i]?.unit ?? '', jahr })
    })
    aus.push({ z, offen, woerter: kw, klasse: klasseFuer(z, ich) })
  }
  return aus
}

const besser = (a: WortStatus | undefined, b: WortStatus): boolean => !a || RANG[b] > RANG[a]

/** Alles, was die Ansichten einer Person je Sprache brauchen */
export async function sprachAnalyse(ich: NutzerInfo, jetzt = Date.now()): Promise<SprachAnalyse[]> {
  const kurse = await kurseVon(ich, jetzt)
  const schuljahr = schuljahrVon(jetzt)
  const nachSprache = new Map<string, Kurs[]>()
  for (const k of kurse) {
    const s = (k.z.sprache || '').toLowerCase()
    nachSprache.set(s, [...(nachSprache.get(s) ?? []), k])
  }
  const aus: SprachAnalyse[] = []
  for (const [sprache, liste] of nachSprache) {
    const baende = new Map<string, BandInfo>()
    const nachTerm = new Map<string, { status: WortStatus; st: WortStand; id: string }>()
    for (const k of liste) {
      for (const w of k.woerter)
        if (w.st) {
          const t = suchform(w.v.term)
          const s = wortStatus(w.st)
          if (besser(nachTerm.get(t)?.status, s)) nachTerm.set(t, { status: s, st: w.st, id: w.zid })
        }
      const teile = teileVon(k.z)
      const einordnung = teileEingeordnet(k.z, teile)
      const q = json_(k.z.quelle || '{}', {} as Partial<Quelle>)
      const ohneJeAbschnitt = !teile.some((t) => t.lehrwerk)
      const ids = new Set(k.woerter.map((w) => w.buch).filter((b): b is string => Boolean(b)))
      for (const id of ids) {
        if (!baende.has(id)) {
          const buch = (await buchFuer(id, k.z.lehrkraft_id).catch(() => null)) as BuchMeta | null
          if (!buch) continue
          baende.set(id, { buch, lehrkraftId: k.z.lehrkraft_id, frei: new Set(), jahre: new Set() })
        }
        const b = baende.get(id)!
        teile.forEach((t, i) => {
          if ((t.lehrwerk || q.lehrwerk) !== id) return
          b.jahre.add(schuljahrVon(t.zeit || Date.parse(k.z.erstellt) || jetzt))
          for (const x of abschnitteDesTeils(einordnung[i] ?? { unit: '', name: t.titel })) b.frei.add(abschnittSchluessel(x.unit, x.abschnitt))
        })
        // Ältere Kurse ohne Band je Abschnitt: die Units der Herkunft
        if (ohneJeAbschnitt && q.lehrwerk === id) for (const u of quelleUnits(q)) for (const a of u.abschnitte) b.frei.add(abschnittSchluessel(u.unit, a))
      }
    }
    // Geschwister der Reihe (frühere Bände ganz)
    const geschwister: BandMetaKurz[] = []
    const reihen = new Set([...baende.values()].map((b) => reiheVon(b.buch)))
    const lehrkraefte = new Set([...baende.values()].map((b) => b.lehrkraftId))
    for (const lk of lehrkraefte)
      for (const b of await baendeDerLehrkraft(lk)) if (reihen.has(reiheVon(b)) && !geschwister.some((x) => x.id === b.id)) geschwister.push(b)
    const jahrgang = [...liste].reverse().find((k) => k.offen && k.klasse)?.klasse ?? [...liste].reverse().find((k) => k.klasse)?.klasse ?? null
    const meta = (id: string): { band?: string; grade?: number } =>
      (baende.get(id)?.buch as BuchMeta | undefined) ?? geschwister.find((g) => g.id === id) ?? {}
    const eingaben = [...new Set([...baende.keys(), ...geschwister.map((g) => g.id)])].map((id) => ({
      id,
      rang: bandRang(meta(id)),
      grade: meta(id).grade,
      jahre: [...(baende.get(id)?.jahre ?? [])]
    }))
    const wahl = baendeNachJahren(eingaben, schuljahr, jahrgang)
    const juengste = [...liste].reverse().find((k) => k.offen) ?? liste[liste.length - 1]
    aus.push({
      ichId: ich.id,
      sprache,
      fach: FACH_ZU[sprache] ?? fachAusName(juengste.z.fach)?.label ?? juengste.z.fach,
      farbe: await fachfarbeDerLehrkraft(juengste.z),
      kurse: liste,
      baende,
      geschwister,
      jahrgang,
      schuljahr,
      nachTerm,
      aktuell: wahl.aktuell ? { id: wahl.aktuell.id, klasse: wahl.aktuell.klasse, schuljahr } : null,
      frueher: wahl.frueher
    })
  }
  return aus
}

/** Ein Band mit Wörtern laden (aktuell: aus den Kursen bekannt, sonst über die Lehrkraft eines Kurses der Sprache) */
async function bandLaden(a: SprachAnalyse, id: string): Promise<BuchMeta | null> {
  const b = a.baende.get(id)
  if (b) return b.buch
  const lk = [...a.baende.values()][0]?.lehrkraftId ?? a.kurse[0]?.z.lehrkraft_id
  return lk ? ((await buchFuer(id, lk).catch(() => null)) as BuchMeta | null) : null
}

/** Stand eines Lehrwerkswortes: bester über alle Kurse (gleicher Begriff) und den Lehrwerks-Stand der Reihe */
function statusImBuch(a: SprachAnalyse, weg: Record<string, WortStand>, v: Vokabel): WortStatus {
  const t = a.nachTerm.get(suchform(v.term))?.status ?? 'neu'
  const w = wortStatus(weg[v.id])
  return RANG[w] > RANG[t] ? w : t
}

const ansicht = (b: BuchMeta, klasse: number | null, schuljahr: number | null, zahlen: StandZahlen): BandAnsicht => ({
  id: b.id,
  name: b.name,
  ...(b.reihe ? { reihe: b.reihe } : {}),
  ...(b.band ? { band: b.band } : {}),
  ...(b.stateId ? { stateId: b.stateId } : {}),
  ...(typeof b.grade === 'number' ? { grade: b.grade } : {}),
  kurz: buchKurz({ name: b.name, reihe: b.reihe, band: b.band }),
  klasse,
  schuljahr,
  zahlen
})

async function sprachStandAus(a: SprachAnalyse, jetzt: number): Promise<SprachStand> {
  let aktuell: AktuellerBand | null = null
  const reiheWeg = new Map<string, Record<string, WortStand>>()
  const wegVon = (b: Buch, ich: string): Record<string, WortStand> => {
    const k = reiheVon(b)
    if (!reiheWeg.has(k)) reiheWeg.set(k, wegStand(ich, k).woerter)
    return reiheWeg.get(k)!
  }
  const ichId = a.ichId
  if (a.aktuell) {
    const info = a.baende.get(a.aktuell.id)
    const buch = info?.buch
    const abschnitte = buch && info ? freieAbschnitte(buch, info.frei) : []
    if (buch && abschnitte.length) {
      const weg = wegVon(buch, ichId)
      const units = nachUnitsImBuch(
        abschnitte.map((x) => ({ key: x.key, unit: x.unit, name: x.section, zahlen: zahlenAus(x.woerter.map((v) => statusImBuch(a, weg, v))) }))
      )
      const alleUnits = [...new Set(abschnitteAus(buch).map((x) => x.unit))]
      const letzte = units[units.length - 1]?.unit ?? ''
      aktuell = {
        ...ansicht(buch, a.aktuell.klasse, a.aktuell.schuljahr, summe(units.map((u) => u.zahlen))),
        units,
        abschnitte: abschnitte.length,
        abschnitteKennen: units.reduce((n, u) => n + u.abschnitte.filter((x) => abschnittKennen(x.zahlen)).length, 0),
        aktuelleUnit: letzte,
        weitereUnits: Math.max(0, alleUnits.length - 1 - alleUnits.indexOf(letzte))
      }
    }
  }
  const frueher: FruehererBand[] = []
  for (const f of a.frueher) {
    const buch = await bandLaden(a, f.id)
    if (!buch) continue
    const woerter = abschnitteAus(buch).flatMap((x) => x.woerter)
    // Platzhalter ohne Wörter: kein Cover mit Zahlen (die Kurswörter stehen in der Kursliste)
    if (!woerter.length) continue
    const weg = wegVon(buch, ichId)
    const z = zahlenAus(woerter.map((v) => statusImBuch(a, weg, v)))
    frueher.push({ ...ansicht(buch, f.klasse, f.schuljahr, z), medaille: bandMedaille(z), naechste: naechsteMedaille(z), wiederholen: z.aufbau, neu: z.neu })
  }
  const runde = await rundeAus(a, jetzt)
  return {
    sprache: a.sprache,
    fach: a.fach,
    farbe: a.farbe,
    aktuell,
    frueher,
    heute: { anzahl: runde.heute, extra: runde.extra, pause: runde.pause, alt: runde.alt.length, tagesziel: runde.tagesziel },
    kurse: a.kurse.filter((k) => k.offen).map((k) => ({ id: k.z.id, titel: k.z.titel })),
    nurKurse: !aktuell && !frueher.length
  }
}

export async function sprachStaende(ich: NutzerInfo, jetzt = Date.now()): Promise<SprachStand[]> {
  const liste = await sprachAnalyse(ich, jetzt)
  return Promise.all(liste.map((a) => sprachStandAus(a, jetzt)))
}

// ---------------------------------------------------------------- Kasten der Sprachrunde und früherer Bände

type Herkunft = { art: 'z'; kurs: string; wort: string } | { art: 'b'; reihe: string }

interface Kasten {
  woerter: Vokabel[]
  staende: Record<string, WortStand>
  herkunft: Map<string, Herkunft>
  testTermin: number | null
  tagesziel: number
  spieleFrei: boolean
  /** Stand für Rekorde und „nochmal ansehen" */
  wsSchluessel: string
}

/** Herkunftstext eines Wortes aus einem früheren Band: „aus Green Line 1 · Unit 2" */
const herkunftText = (buchName: string, unit: string): string => `aus ${[buchName, unit].filter(Boolean).join(' · ')}`

async function rundeAus(
  a: SprachAnalyse,
  jetzt: number
): Promise<{ kasten: Kasten; heute: number; extra: number; pause: boolean; alt: string[]; tagesziel: number }> {
  const ichId = a.ichId
  const woerter: Vokabel[] = []
  const staende: Record<string, WortStand> = {}
  const herkunft = new Map<string, Herkunft>()
  const gesehen = new Set<string>()
  const offen = a.kurse.filter((k) => k.offen)
  // Test in den nächsten drei Tagen: nur dessen Kurse
  const testKurse = offen.filter((k) => testPause([k.z.test_termin], jetzt))
  const test = testKurse.length ? new Set(testKurse.flatMap((k) => k.woerter.map((w) => w.zid))) : null
  const aktuellIds = new Set<string>()
  for (const k of offen)
    for (const w of k.woerter) {
      // Alte Abschnitte (früheres Schuljahr) eines weiterlaufenden Kurses: nur als Wiederholung
      if (w.jahr < a.schuljahr && !test?.has(w.zid)) continue
      const n = suchform(w.v.term)
      if (gesehen.has(n)) continue
      gesehen.add(n)
      woerter.push({ ...w.v, id: w.zid })
      aktuellIds.add(w.zid)
      if (w.st) staende[w.zid] = w.st
      herkunft.set(w.zid, { art: 'z', kurs: k.z.id, wort: w.v.id })
    }
  // Kandidaten aus früheren Bänden: Kurswörter früherer Schuljahre, dazu Lehrwerkswörter mit eigenem Stand
  const alt: AltKandidat[] = []
  const altHerkunft = new Map<string, Herkunft>()
  const bandName = (id: string | null): string => (id ? a.baende.get(id)?.buch.name ?? '' : '')
  for (const k of a.kurse)
    for (const w of k.woerter) {
      if (w.jahr >= a.schuljahr && k.offen) continue
      if (!w.st) continue
      alt.push({ v: { ...w.v, id: w.zid }, st: w.st, herkunft: herkunftText(bandName(w.buch), w.unit) })
      altHerkunft.set(w.zid, { art: 'z', kurs: k.z.id, wort: w.v.id })
    }
  for (const f of a.frueher) {
    const buch = await bandLaden(a, f.id)
    if (!buch) continue
    const reihe = reiheVon(buch)
    const weg = wegStand(ichId, reihe).woerter
    for (const x of abschnitteAus(buch))
      for (const v of x.woerter)
        if (weg[v.id]) {
          alt.push({ v, st: weg[v.id], herkunft: herkunftText(buch.name, x.unit) })
          altHerkunft.set(v.id, { art: 'b', reihe })
        }
  }
  const r = rundenWoerter(woerter, alt, { test, jetzt })
  for (const v of r.woerter.slice(woerter.length)) {
    const h = altHerkunft.get(v.id)
    if (!h) continue
    herkunft.set(v.id, h)
    const st = alt.find((x) => x.v.id === v.id)?.st
    // Im Kasten gleich fällig: sie sind für diese Runde gewählt
    if (st) staende[v.id] = { ...st, faellig: Math.min(st.faellig, jetzt) }
  }
  const tagesziel = Math.max(0, ...offen.map((k) => tageszielVon(k.z))) || 10
  const testTermin = offen.map((k) => k.z.test_termin).filter((t): t is number => typeof t === 'number' && t >= jetzt - 864e5).sort((x, y) => x - y)[0] ?? null
  const kasten: Kasten = {
    woerter: r.woerter,
    staende,
    herkunft,
    testTermin,
    tagesziel,
    spieleFrei: offen.some((k) => spieleHeuteFrei(k.z)),
    wsSchluessel: `sprache:${a.sprache}`
  }
  const t = tagesRunde(r.woerter, staende, jetzt, tagesziel)
  const heute = t.woerter.length
  return { kasten, heute, extra: t.extra, pause: r.pause, alt: r.alt, tagesziel }
}

/** Ein früherer Band als Kasten: Kurswörter behalten ihre Kennung, die übrigen Lehrwerkswörter mit dem Reihen-Stand */
async function bandKasten(a: SprachAnalyse, bandId: string): Promise<Kasten | null> {
  if (!a.frueher.some((f) => f.id === bandId)) return null
  const buch = await bandLaden(a, bandId)
  if (!buch) return null
  const ichId = a.ichId
  const reihe = reiheVon(buch)
  const weg = wegStand(ichId, reihe).woerter
  // Begriff → Kurswort (mit Stand bevorzugt)
  const kursWort = new Map<string, { w: KursWort; kurs: string }>()
  for (const k of a.kurse)
    for (const w of k.woerter) {
      const t = suchform(w.v.term)
      const da = kursWort.get(t)
      if (!da || (!da.w.st && w.st)) kursWort.set(t, { w, kurs: k.z.id })
    }
  const woerter: Vokabel[] = []
  const staende: Record<string, WortStand> = {}
  const herkunft = new Map<string, Herkunft>()
  const gesehen = new Set<string>()
  for (const x of abschnitteAus(buch))
    for (const v of x.woerter) {
      const t = suchform(v.term)
      if (gesehen.has(t)) continue
      gesehen.add(t)
      const kw = kursWort.get(t)
      if (kw && (kw.w.st || !weg[v.id])) {
        woerter.push({ ...kw.w.v, id: kw.w.zid, herkunft: herkunftText(buch.name, x.unit) })
        if (kw.w.st) staende[kw.w.zid] = kw.w.st
        herkunft.set(kw.w.zid, { art: 'z', kurs: kw.kurs, wort: kw.w.v.id })
      } else {
        woerter.push({ ...v, herkunft: herkunftText(buch.name, x.unit) })
        if (weg[v.id]) staende[v.id] = weg[v.id]
        herkunft.set(v.id, { art: 'b', reihe })
      }
    }
  // Keine Pflicht-Neuwörter: die Tagesration enthält nur Fälliges; Neues nur freiwillig
  return { woerter, staende, herkunft, testTermin: null, tagesziel: 0, spieleFrei: false, wsSchluessel: reihe }
}

// ---------------------------------------------------------------- Route

export function sprachstandRoute(): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { url, req, res, sitzung } = k
    if (url.pathname === '/server/sprachstand/testzeit') return testzeit(k)
    const istStand = url.pathname === '/s/api/sprachstand'
    const istListe = url.pathname === '/s/api/vokabeln/liste' || url.pathname === '/s/api/vokabeln/antwort' || url.pathname === '/s/api/vokabeln/spiel'
    if (!istStand && !istListe) return false
    let id = ''
    if (istListe) {
      id = req.method === 'GET' ? String(url.searchParams.get('id') ?? '') : String(((await k.koerper()) as Record<string, unknown>).id ?? '')
      if (!/^(sp|bd):/.test(id)) return false
    }
    if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
    const ich = sitzung.nutzer
    if (ich.rolle !== 'schueler') return (json(res, 403, { fehler: 'Nur für Lernende.' }), true)
    if (req.method === 'POST' && typeof req.headers['x-schulapps-token'] !== 'string') return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
    const jetzt = Date.now()
    if (istStand) {
      const fach = String(url.searchParams.get('fach') ?? '').trim()
      const fachLabel = fach ? fachAusName(fach)?.label ?? fach : ''
      const alle = await sprachStaende(ich, jetzt)
      return (json(res, 200, { sprachen: fach ? alle.filter((s) => s.fach === fachLabel || s.sprache === fach.toLowerCase()) : alle }), true)
    }
    const analysen = await sprachAnalyse(ich, jetzt)
    let a: SprachAnalyse | undefined
    let kasten: Kasten | null = null
    let titel = ''
    if (id.startsWith('sp:')) {
      a = analysen.find((x) => `sp:${x.sprache}` === id)
      if (a) {
        kasten = (await rundeAus(a, jetzt)).kasten
        titel = `${a.fach} · Heute üben`
      }
    } else {
      const band = id.slice(3)
      a = analysen.find((x) => x.frueher.some((f) => f.id === band))
      if (a) {
        kasten = await bandKasten(a, band)
        titel = (await bandLaden(a, band))?.name ?? ''
      }
    }
    if (!a || !kasten) return (json(res, 404, { fehler: 'Diese Vokabeln gibt es (noch) nicht für dich.' }), true)
    const ws: VokStand = wegStand(ich.id, kasten.wsSchluessel)
    const sprache = a.sprache
    const klasse = a.jahrgang
    if (req.method === 'GET' && url.pathname === '/s/api/vokabeln/liste')
      return (
        json(res, 200, {
          id,
          titel,
          sprache,
          fach: a.fach,
          testTermin: kasten.testTermin,
          woerter: kasten.woerter,
          staende: kasten.staende,
          farbe: a.farbe,
          rekorde: ws.rekorde ?? {},
          ansehen: ws.ansehen ?? [],
          spieleFrei: kasten.spieleFrei,
          tagesziel: kasten.tagesziel,
          klasse,
          verben: standardVerben(kasten.woerter, sprache)
        }),
        true
      )
    const k0 = (await k.koerper()) as Record<string, unknown>
    if (url.pathname === '/s/api/vokabeln/spiel') {
      const r = spielEintragen(ws, k0, (wid) => kasten!.herkunft.has(wid), { ich, klasse, sprache })
      if (!r) return (json(res, 400, { fehler: 'Unbekanntes Spiel.' }), true)
      wegSpeichern(ich.id, kasten.wsSchluessel, ws)
      return (json(res, 200, { rekord: r.rekord, rekorde: ws.rekorde ?? {}, ansehen: ws.ansehen }), true)
    }
    const wid = String(k0.wortId ?? '')
    const v = kasten.woerter.find((x) => x.id === wid)
    const h = kasten.herkunft.get(wid)
    if (!v || !h) return (json(res, 400, { fehler: 'Unbekannte Abfrage.' }), true)
    if (h.art === 'z') {
      const z = zeile(h.kurs)
      if (!z || !vokIstFuer(z, ich)) return (json(res, 404, { fehler: 'Unbekannt.' }), true)
      const st = standVon(z.id, ich.id)
      const r = abfrageAuswerten({ ...v, id: h.wort }, k0, st, z.test_termin ?? undefined, { ich, klasse: klasseFuer(z, ich), sprache: z.sprache || sprache })
      if (!r) return (json(res, 400, { fehler: 'Unbekannte Abfrage.' }), true)
      standSpeichern(z.id, ich.id, st)
      if (r.ergebnis.urteil === 'richtig' && ws.ansehen?.includes(wid)) {
        ws.ansehen = ws.ansehen.filter((x) => x !== wid)
        wegSpeichern(ich.id, kasten.wsSchluessel, ws)
      }
      return (json(res, 200, { ...r.ergebnis, stand: r.neu, sicher: false }), true)
    }
    const reiheStand = wegStand(ich.id, h.reihe)
    const r = abfrageAuswerten(v, k0, reiheStand, undefined, { ich, klasse, sprache })
    if (!r) return (json(res, 400, { fehler: 'Unbekannte Abfrage.' }), true)
    wegSpeichern(ich.id, h.reihe, reiheStand)
    return (json(res, 200, { ...r.ergebnis, stand: r.neu, sicher: false }), true)
  }
}

/**
 * Nur für Browsertests (SCHULAPPS_KALENDER_TESTUHR=1, wie die Testuhr des Schulkalenders): Freigabezeit von Abschnitten
 * eines eigenen Kurses setzen (`teile`: Stellen, `zeit`: ms) und die Lernstände des Kurses um `staendeTage` Tage
 * zurückdatieren – so lassen sich „frühere Schuljahre" und „seit Tagen fällig" prüfen. Sonst gibt es den Weg nicht.
 */
async function testzeit(k: Anfrage): Promise<boolean> {
  const { req, res, sitzung } = k
  if (process.env.SCHULAPPS_KALENDER_TESTUHR !== '1' || req.method !== 'POST') return false
  if (!sitzung || sitzung.nutzer.rolle === 'schueler') return (json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true)
  const k0 = (await k.koerper()) as Record<string, unknown>
  const z = zeile(String(k0.kurs ?? ''))
  if (!z || z.lehrkraft_id !== sitzung.nutzer.id) return (json(res, 404, { fehler: 'Unbekannter Kurs.' }), true)
  if (typeof k0.zeit === 'number' && Array.isArray(k0.teile)) {
    const teile = teileVon(z)
    for (const i of k0.teile as number[]) if (teile[i]) teile[i] = { ...teile[i], zeit: k0.zeit }
    db()
      .prepare('UPDATE vok_zuweisungen SET teile = ?, erstellt = ? WHERE id = ?')
      .run(JSON.stringify(teile), new Date(Math.min(Date.parse(z.erstellt) || Date.now(), k0.zeit)).toISOString(), z.id)
  }
  if (typeof k0.staendeTage === 'number' && k0.staendeTage > 0) {
    const ms = k0.staendeTage * 86_400_000
    const zurueck = (x: number | undefined): number | undefined => (typeof x === 'number' && x > 0 ? x - ms : x)
    for (const r of db().prepare('SELECT schueler_id FROM vok_stand WHERE zuweisung_id = ?').all(z.id) as { schueler_id: string }[]) {
      const st = standVon(z.id, r.schueler_id)
      for (const [id, w] of Object.entries(st.woerter))
        st.woerter[id] = { ...w, faellig: zurueck(w.faellig) ?? 0, zuletzt: zurueck(w.zuletzt) ?? 0, erstmals: zurueck(w.erstmals), vor: zurueck(w.vor), frei: w.frei.map((x) => x - ms) }
      standSpeichern(z.id, r.schueler_id, st)
    }
  }
  return (json(res, 200, { ok: true }), true)
}
