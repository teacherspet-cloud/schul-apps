/**
 * Achievements der Lernenden (08.10.2026, mit der Lehrkraft abgestimmt) – Server. Katalog und Berechnung in
 * shared/achievements.ts, gespeicherter Teil (erreicht, Zähler, Übungstage) in achievementsDaten.ts.
 *
 * Berechnet wird aus dem, was ohnehin da ist (Kästen der Vokabeln, Vokabelweg, Grammatik, Rekordbuch, Wochenziel),
 * und zwar beim Öffnen des Fensters und nach Antworten/Spielen (der Trainer fragt kurz danach nach Neuem für den
 * Glückwunsch). Die Lehrkraft sieht die Achievements nicht.
 * Seit 09.10.2026: Lernende sehen alle Achievements mit Fortschritt (geheime erst, wenn erreicht), den Anteil der
 * Lernenden der Schule und ihren eigenen Platz in der Klasse – nur Zahlen, keine Namen (achievementsVergleich.ts).
 *
 *  Lernende: GET /s/api/achievements      → { alle, erreicht, verborgen, gruppen, neu, lernende, platz }
 *            GET /s/api/achievements/neu  → { neu, auszeichnungen } (noch nicht gemeldete, danach als gemeldet markiert)
 *
 * Medaillen und Titel je Sprache (10.10.2026, shared/auszeichnungen.ts, Konzept recherche/achievements-medaillen-titel.md):
 * werden in derselben Auswertung fortgeschrieben (nie entzogen); die alten Achievements einmalig übernommen.
 *  Lernende: GET  /s/api/auszeichnungen        → { sprachen, wahl, anzeige, formOffen }
 *            GET  /s/api/auszeichnungen/titel  → { wahl, anzeige, formOffen } (Startseite; nur Gespeichertes)
 *            POST /s/api/auszeichnungen/wahl   {form?, anzeige?} → wie GET /titel
 */
import { datenbank, type NutzerInfo } from './datenbank'
import { json, type Anfrage } from './http'
import { db as vokDb, json_, klasseFuer, vokIstFuer, zeile as vokZeile, type VokStand, type Zeile as VokZeile } from './vokabeln'
import { buchFuer, buchNamen } from './vokabelweg'
import { grammatikFuerAchievements } from './grammatik'
import { gespielteSpiele } from './rekordbuch'
import { achDatenLesen, achDatenSchreiben, auszeichnungenVon, rundeAbschliessen, tageVereinen, titelWahlSetzen, type AchDaten, type Erreicht } from './achievementsDaten'
import { bildInfo, bildSvg, bilderFuerSprache, freigeschaltet, freigeschaltetIn } from '../shared/auszeichnungenBilder'
import { RESSOURCEN } from './pfade'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  angezeigterTitel,
  fortschreiben,
  hatFormen,
  hauptsprache,
  jahrgangsBand,
  KATEGORIEN,
  LEERE_SPRACH_ZAEHLER,
  medaillen,
  punkteVon,
  sprachName,
  sprachWerte,
  stufenName,
  TITEL_AB,
  titelLeiter,
  titelFuerSprache,
  titelText,
  uebernahmeAnwenden,
  zaehlerAusAlt,
  type AuszNeu,
  type SprachEingabe,
  type TitelForm,
  type TitelWahl
} from '../shared/auszeichnungen'
import { ACH_GRUPPEN, achievementSicht, berechneAchievements, type Achievement, type AchEingabe } from '../shared/achievements'
import { klassenPlatz, schulAnteile } from './achievementsVergleich'
import { abschnitteAus, quelleAusTitel, quelleUnits, reiheVon, type Buch, type Quelle } from '../shared/vokabelLaufbahn'
import { istSicher, kernform, type Vokabel, type WortStand } from '../shared/vokabeltrainer'

const normal = (t: string): string => kernform(t).toLowerCase()
const sicher = <T>(f: () => T, r: T): T => {
  try {
    return f()
  } catch {
    return r
  }
}

/** Wortschatz über alle Listen und den Vokabelweg: gleiches Wort (je Sprache) zählt einmal, mit seinem besten Stand */
async function wortschatz(ich: NutzerInfo): Promise<{
  woerter: AchEingabe['woerter']
  lehrwerk: AchEingabe['lehrwerk']
  tage: string[]
  /** Je Sprache (10.10.2026): Wörter ab Fach 2, sichere Wörter, Übungstage */
  jeSprache: Map<string, { ab2: number; sicher: number; tage: Set<string> }>
}> {
  const best = new Map<string, { g: boolean; s: boolean; f: number }>()
  const merke = (k: string, st: WortStand | undefined): void => {
    if (!st || !st.versuche) return
    const b = best.get(k) ?? { g: false, s: false, f: 0 }
    b.g = true
    b.s = b.s || istSicher(st)
    b.f = Math.max(b.f, st.fach)
    best.set(k, b)
  }
  const tage = new Set<string>()
  const tageJe = new Map<string, Set<string>>()
  const tagJe = (sprache: string | undefined, t: string): void => {
    if (!sprache) return
    const m = tageJe.get(sprache) ?? new Set<string>()
    m.add(t)
    tageJe.set(sprache, m)
  }
  const buecher = new Map<string, { buch: Buch; units: Set<string> }>()
  const zeilen = sicher(() => vokDb().prepare('SELECT zuweisung_id, daten FROM vok_stand WHERE schueler_id = ?').all(ich.id) as { zuweisung_id: string; daten: string }[], [])
  for (const r of zeilen) {
    const z = vokZeile(r.zuweisung_id)
    if (!z) continue
    const st = json_(r.daten, { woerter: {}, tage: [] } as VokStand)
    for (const t of st.tage ?? []) {
      tage.add(t)
      tagJe(z.sprache, t)
    }
    for (const v of json_(z.woerter, [] as Vokabel[])) merke(`${z.sprache}:${normal(v.term)}`, st.woerter?.[v.id])
    // Herkunft aus dem Lehrwerk: gespeichert oder aus dem Titel
    let q = json_(z.quelle, null as Quelle | null)
    if (!q) q = quelleAusTitel(z.titel, await buchNamen(z.lehrkraft_id).catch(() => []))
    if (!q) continue
    const buch = await buchFuer(q.lehrwerk, z.lehrkraft_id).catch(() => null)
    if (!buch) continue
    const e = buecher.get(buch.id) ?? { buch, units: new Set<string>() }
    for (const u of quelleUnits(q)) e.units.add(u.unit)
    buecher.set(buch.id, e)
  }
  // Vokabelweg: Lehrwerkswörter über die geladenen Bände auf ihr Wort abbilden, sonst nach Kennung
  const begriff = new Map<string, string>()
  const reiheSprache = new Map<string, string>()
  for (const { buch } of buecher.values()) reiheSprache.set(reiheVon(buch), buch.language)
  for (const { buch } of buecher.values())
    for (const a of abschnitteAus(buch)) for (const v of a.woerter) begriff.set(`${reiheVon(buch)}|${v.id}`, `${buch.language}:${normal(v.term)}`)
  const weg = sicher(() => datenbank().prepare('SELECT reihe, daten FROM vok_laufbahn WHERE schueler_id = ?').all(ich.id) as { reihe: string; daten: string }[], [])
  for (const r of weg) {
    const st = json_(r.daten, { woerter: {}, tage: [] } as VokStand)
    const sprache = reiheSprache.get(r.reihe)
    for (const t of st.tage ?? []) {
      tage.add(t)
      tagJe(sprache, t)
    }
    // Ohne geladenen Band: eigene Kennung (Sprache vorn, wenn bekannt – für die Medaillen je Sprache)
    for (const [id, s] of Object.entries(st.woerter ?? {})) merke(begriff.get(`${r.reihe}|${id}`) ?? `${sprache ?? 'lb'}:§lb:${r.reihe}:${id}`, s)
  }
  const lehrwerk: AchEingabe['lehrwerk'] = []
  for (const { buch, units } of buecher.values()) {
    const abschnitte = abschnitteAus(buch)
    const zaehle = (woerter: Vokabel[]): { gesamt: number; gelernt: number; sicher: number } => {
      const terme = new Set(woerter.map((v) => `${buch.language}:${normal(v.term)}`))
      let gelernt = 0
      let sicherN = 0
      for (const t of terme) {
        const b = best.get(t)
        if (b?.g) gelernt++
        if (b?.s) sicherN++
      }
      return { gesamt: terme.size, gelernt, sicher: sicherN }
    }
    const alle = zaehle(abschnitte.flatMap((a) => a.woerter))
    lehrwerk.push({
      buch: buch.id,
      name: buch.name,
      gesamt: alle.gesamt,
      gelernt: alle.gelernt,
      sprache: buch.language,
      units: [...new Set(abschnitte.map((a) => a.unit))]
        .filter((u) => units.has(u))
        .map((u) => {
          const x = zaehle(abschnitte.filter((a) => a.unit === u).flatMap((a) => a.woerter))
          return { unit: u, gesamt: x.gesamt, sicher: x.sicher, gelernt: x.gelernt }
        })
    })
  }
  const werte = [...best.values()]
  const jeSprache = new Map<string, { ab2: number; sicher: number; tage: Set<string> }>()
  const eintrag = (sprache: string): { ab2: number; sicher: number; tage: Set<string> } => {
    const e = jeSprache.get(sprache) ?? { ab2: 0, sicher: 0, tage: new Set<string>() }
    jeSprache.set(sprache, e)
    return e
  }
  for (const [k, b] of best) {
    const sprache = k.slice(0, k.indexOf(':'))
    if (!SPRACHE.test(sprache)) continue
    const e = eintrag(sprache)
    if (b.f >= 2) e.ab2++
    if (b.s) e.sicher++
  }
  for (const [sprache, t] of tageJe) if (SPRACHE.test(sprache)) for (const x of t) eintrag(sprache).tage.add(x)
  return {
    woerter: { gelernt: werte.filter((b) => b.g).length, sicher: werte.filter((b) => b.s).length, langzeit: werte.filter((b) => b.f >= 6).length },
    lehrwerk,
    tage: [...tage],
    jeSprache
  }
}

/** Sprachkürzel (en, fr, la, grc …) */
const SPRACHE = /^[a-z]{2,3}$/

/**
 * Sprachen, in denen die Person einen Kurs hat (Vokabeltrainings der eigenen Lerngruppen, auch beendete), mit dem
 * Jahrgang des neuesten Kurses mit Angabe – für die Medaillen je Sprache (10.10.2026).
 */
export function sprachKurse(ich: NutzerInfo): Map<string, number | null> {
  const aus = new Map<string, number | null>()
  const zeilen = sicher(() => vokDb().prepare('SELECT * FROM vok_zuweisungen ORDER BY erstellt ASC').all() as unknown as VokZeile[], [])
  for (const z of zeilen) {
    const s = String(z.sprache ?? '').toLowerCase()
    if (!SPRACHE.test(s) || !sicher(() => vokIstFuer(z, ich), false)) continue
    aus.set(s, sicher(() => klasseFuer(z, ich), null) ?? aus.get(s) ?? null)
  }
  return aus
}

/** Wochenziel aus Einstellungen › Lernen (wie lernstand.ts) */
function wochenzielVon(nutzerId: string): number {
  const d = sicher(
    () =>
      json_((datenbank().prepare('SELECT daten FROM nutzer_darstellung WHERE nutzer_id = ?').get(nutzerId) as { daten: string } | undefined)?.daten, {} as {
        wochenziel?: number
      }),
    {} as { wochenziel?: number }
  )
  const z = Number(d.wochenziel)
  return Number.isFinite(z) && z >= 1 && z <= 7 ? Math.round(z) : 3
}

/** Wer gespeichert wird: Lernende ohne Vorschaukonten */
const zaehlt = (n: NutzerInfo): boolean => n.rolle === 'schueler' && n.quelle !== 'vorschau'
/**
 * Wer die Liste sieht: alle Lernenden, auch die Musterschüler-Vorschau (09.10.2026: dort stand „0 von 0") – die
 * Vorschau wird nur berechnet, nicht gespeichert, und meldet nichts als neu (sonst käme der Glückwunsch bei jedem Öffnen).
 */
const siehtListe = (n: NutzerInfo): boolean => n.rolle === 'schueler'

/** Laufende Auswertung je Person – gleichzeitige Anfragen teilen sie */
const laufend = new Map<string, Promise<Auswertung>>()

interface Auswertung {
  d: AchDaten
  katalog: Achievement[]
  /** Medaillen je Sprache: was gesammelt wurde (Sprachen mit Kurs zuerst) */
  eingaben: SprachEingabe[]
}

/**
 * Alles neu berechnen und Neues mit Zeitpunkt festhalten (nie entziehen). Erst wird gesammelt (asynchron, Lehrwerke),
 * dann in einem Zug gelesen, ergänzt und geschrieben – so gehen gleichzeitig gezählte Antworten nicht verloren.
 */
export function achievementsAuswerten(ich: NutzerInfo, jetzt = Date.now()): Promise<Auswertung> {
  const da = laufend.get(ich.id)
  if (da) return da
  const p = (async () => {
    const ws = await wortschatz(ich)
    const gr = sicher(() => grammatikFuerAchievements(ich), { regeln: [], extrasGeschafft: 0, tage: [] as string[], tageJe: {} as Record<string, string[]> })
    const spiele = sicher(() => gespielteSpiele(ich.id).size, 0)
    const wochenziel = wochenzielVon(ich.id)
    const kurse = sprachKurse(ich)
    const d = achDatenLesen(ich.id)
    // Medaillen je Sprache (10.10.2026): Eingaben sammeln; Übernahme der alten Achievements vor deren Neuberechnung
    const eingaben = sprachEingaben(kurse, ws, gr, d)
    if (!d.uebernommen) uebernehmen(d, eingaben, spiele, jetzt)
    rundeAbschliessen(d, jetzt)
    d.tage = tageVereinen(d.tage, [...ws.tage, ...gr.tage])
    for (const r of gr.regeln) if (r.schwaeche && !d.warSchwaeche.includes(r.schluessel)) d.warSchwaeche.push(r.schluessel)
    const katalog = berechneAchievements({
      tage: d.tage,
      wochenziel,
      woerter: ws.woerter,
      lehrwerk: ws.lehrwerk,
      regeln: gr.regeln,
      warSchwaeche: d.warSchwaeche,
      extrasGeschafft: gr.extrasGeschafft,
      spiele,
      zaehler: d.zaehler
    })
    for (const a of katalog)
      if (a.erreicht && !d.erreicht[a.id]) {
        d.erreicht[a.id] = { am: jetzt, titel: a.titel, text: a.text, gruppe: a.gruppe, medaille: a.medaille }
        d.offen.push(a.id)
      }
    const neu = fortschreiben(d.ausz, eingaben, jetzt)
    d.offenAusz = [...d.offenAusz, ...neu].slice(-30)
    if (zaehlt(ich)) achDatenSchreiben(ich.id, d)
    return { d, katalog, eingaben }
  })().finally(() => laufend.delete(ich.id))
  laufend.set(ich.id, p)
  return p
}

/** Je Sprache die Eingabe für die Medaillen */
function sprachEingaben(
  kurse: Map<string, number | null>,
  ws: Awaited<ReturnType<typeof wortschatz>>,
  gr: { regeln: { sicher: boolean; sprache?: string }[]; tageJe?: Record<string, string[]> },
  d: AchDaten
): SprachEingabe[] {
  const sprachen = new Set<string>(kurse.keys())
  for (const s of [...ws.jeSprache.keys(), ...Object.keys(d.je), ...Object.keys(d.ausz.medaillen), ...gr.regeln.map((r) => r.sprache ?? '')]) if (SPRACHE.test(s)) sprachen.add(s)
  return [...sprachen]
    .sort((a, b) => Number(kurse.has(b)) - Number(kurse.has(a)) || sprachName(a).localeCompare(sprachName(b), 'de'))
    .map((s) => {
      const w = ws.jeSprache.get(s)
      const regeln = gr.regeln.filter((r) => r.sprache === s)
      const tage = new Set<string>([...(w?.tage ?? []), ...(gr.tageJe?.[s] ?? []), ...(d.je[s]?.tage ?? [])])
      return {
        sprache: s,
        jahrgang: kurse.get(s) ?? null,
        woerterAb2: w?.ab2 ?? 0,
        woerterSicher: w?.sicher ?? 0,
        regelnGeuebt: regeln.length,
        regelnSicher: regeln.filter((r) => r.sicher).length,
        tage: tage.size,
        units: ws.lehrwerk.filter((b) => b.sprache === s).flatMap((b) => b.units.map((u) => ({ gesamt: u.gesamt, gelernt: u.gelernt ?? 0, sicher: u.sicher }))),
        zaehler: d.je[s]?.z ?? {}
      }
    })
}

/**
 * Einmalige Übernahme (10.10.2026): Wer schon alte Achievements hat, bekommt sie als Medaillen in der Hauptsprache
 * (die alten galten für alle Sprachen zusammen), dazu die alten Zähler als Startwerte – abzüglich dessen, was seit der
 * Umstellung schon je Sprache gezählt wurde. Ohne Sprache wird gewartet, bis eine da ist.
 */
function uebernehmen(d: AchDaten, eingaben: SprachEingabe[], spiele: number, jetzt: number): void {
  if (!Object.keys(d.erreicht).length) {
    d.uebernommen = '-'
    return
  }
  const h = hauptsprache(eingaben)
  if (!h) return
  const schon = Object.values(d.je).reduce(
    (a, e) => ({
      rekorde: a.rekorde + (e.z?.rekorde ?? 0),
      hoeren: a.hoeren + (e.z?.hoeren ?? 0),
      zusammenRunden: a.zusammenRunden + (e.z?.zusammenRunden ?? 0),
      teamZiele: a.teamZiele + (e.z?.teamZiele ?? 0)
    }),
    { rekorde: 0, hoeren: 0, zusammenRunden: 0, teamZiele: 0 }
  )
  const alt = zaehlerAusAlt(d.zaehler, spiele)
  const e = (d.je[h] ??= { z: LEERE_SPRACH_ZAEHLER(), tage: [] })
  e.z = { ...LEERE_SPRACH_ZAEHLER(), ...e.z }
  e.z.spielrunden += alt.spielrunden
  e.z.rekorde += Math.max(0, alt.rekorde - schon.rekorde)
  e.z.hoeren += Math.max(0, alt.hoeren - schon.hoeren)
  e.z.zusammenRunden += Math.max(0, alt.zusammenRunden - schon.zusammenRunden)
  e.z.teamZiele += Math.max(0, alt.teamZiele - schon.teamZiele)
  const ein = eingaben.find((x) => x.sprache === h)
  if (ein) ein.zaehler = e.z
  uebernahmeAnwenden(d.ausz, d.erreicht, h, jetzt)
  d.uebernommen = h
}

/** Text eines neuen Medaillen- oder Titel-Ereignisses für den Glückwunsch */
function auszText(n: AuszNeu, form: TitelForm | undefined): { art: AuszNeu['art']; sprache: string; stufe: number; titel: string; text: string } {
  if (n.art === 'titel')
    return { art: 'titel', sprache: n.sprache, stufe: n.stufe, titel: `Neuer Titel in ${sprachName(n.sprache)}`, text: titelText(n.sprache, n.stufe, form) ?? '' }
  const k = KATEGORIEN.find((x) => x.id === n.kategorie)
  return { art: 'medaille', sprache: n.sprache, stufe: n.stufe, titel: `${stufenName(n.stufe)} in ${sprachName(n.sprache)}`, text: k?.name ?? '' }
}

/** Was die Seite „Medaillen und Titel" braucht */
function auszeichnungenSicht(a: Auswertung): Record<string, unknown> {
  const { d, eingaben } = a
  const sprachen = eingaben.map((e) => {
    const m = medaillen(sprachWerte(e), e.jahrgang, d.ausz.medaillen[e.sprache] ?? {})
    const stufe = d.ausz.titel[e.sprache]?.stufe ?? 0
    return {
      sprache: e.sprache,
      name: sprachName(e.sprache),
      jahrgang: e.jahrgang,
      band: jahrgangsBand(e.jahrgang).name,
      punkte: punkteVon(d.ausz, e.sprache),
      medaillen: m,
      titel: {
        stufe,
        text: titelText(e.sprache, stufe, d.titelWahl.form),
        am: d.ausz.titel[e.sprache]?.am ?? null,
        naechsteAb: stufe < TITEL_AB.length ? TITEL_AB[stufe] : null,
        leiter: titelLeiter(e.sprache).map((x, i) => ({ stufe: i + 1, ab: TITEL_AB[i], ...x }))
      },
      // Sammlung (10.10.2026): alle Bilder dieser Sprache, gesperrt oder frei
      sammlung: bilderFuerSprache(e.sprache).map((b) => ({ id: b.id, art: b.art, name: b.name, wie: b.wie, stufe: b.stufe, frei: freigeschaltetIn(d.ausz, e.sprache, b.id) }))
    }
  })
  return { sprachen, ...titelKurz(d) }
}

/** Profilbild aus der Darstellung – nur, wenn es (noch) freigeschaltet ist */
function avatarVon(nutzerId: string, ausz: AchDaten['ausz']): string | null {
  const d = sicher(
    () => json_((datenbank().prepare('SELECT daten FROM nutzer_darstellung WHERE nutzer_id = ?').get(nutzerId) as { daten: string } | undefined)?.daten, {} as { avatar?: unknown }),
    {} as { avatar?: unknown }
  )
  return typeof d.avatar === 'string' && d.avatar && freigeschaltet(ausz, d.avatar) ? d.avatar : null
}

const profile = new Map<string, { t: number; v: { titel: string | null; avatar: string | null } }>()

/**
 * Titel und Profilbild einer Person im Spielraum einer Sprache (10.10.2026): der Titel dieser Sprache (der gewählte,
 * wenn er aus ihr stammt, sonst der höchste) – nichts, wenn die Person „keinen Titel zeigen" gewählt hat.
 * Kurz zwischengespeichert, die Lobby fragt oft.
 */
export function profilFuer(nutzerId: string, sprache: string, jetzt = Date.now()): { titel: string | null; avatar: string | null } {
  const k = `${nutzerId}|${sprache}`
  const c = profile.get(k)
  if (c && jetzt - c.t < 20_000) return c.v
  const { ausz, titelWahl } = auszeichnungenVon(nutzerId)
  const v = { titel: titelFuerSprache(sprache, ausz.titel[sprache]?.stufe ?? 0, titelWahl), avatar: avatarVon(nutzerId, ausz) }
  profile.set(k, { t: jetzt, v })
  if (profile.size > 2000) profile.clear()
  return v
}

/**
 * Für die Lehrkraft (Meine Klassen, 10.10.2026): Medaillen, Titel und Profilbild in der Sprache der Lerngruppe – als
 * Gesprächsanlass, nicht als Rangliste. Der Titel steht in der gewählten Form (ohne Wahl neutral); hat die Person
 * „Keinen Titel zeigen" gewählt, sieht auch die Lehrkraft keinen (Entscheidung der Lehrkraft, 10.10.2026).
 */
export function auszeichnungFuerLehrkraft(
  nutzerId: string,
  sprache: string
): { titel: string | null; titelStufe: number; punkte: number; avatar: string | null; medaillen: { kategorie: string; stufe: number }[] } {
  const { ausz, titelWahl } = auszeichnungenVon(nutzerId)
  const m = ausz.medaillen[sprache] ?? {}
  const stufe = ausz.titel[sprache]?.stufe ?? 0
  return {
    titel: titelWahl.anzeige === 'aus' ? null : titelText(sprache, stufe, titelWahl.form),
    titelStufe: stufe,
    punkte: punkteVon(ausz, sprache),
    avatar: avatarVon(nutzerId, ausz),
    medaillen: KATEGORIEN.map((k) => ({ kategorie: k.id, stufe: m[k.id]?.stufe ?? 0 }))
  }
}

/** Bild ausliefern: Ersatz aus resources/auszeichnungen (nur freigeschaltete Ansicht), sonst der Platzhalter */
function bildAusliefern(res: Parameters<typeof json>[0], id: string, gesperrt: boolean): void {
  if (!gesperrt)
    for (const [endung, typ] of [
      ['svg', 'image/svg+xml'],
      ['png', 'image/png']
    ] as const) {
      const pfad = join(RESSOURCEN, 'auszeichnungen', `${id}.${endung}`)
      if (existsSync(pfad)) {
        res.writeHead(200, { 'content-type': typ, 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff' })
        res.end(readFileSync(pfad))
        return
      }
    }
  res.writeHead(200, {
    'content-type': 'image/svg+xml; charset=utf-8',
    'cache-control': 'private, max-age=86400',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'"
  })
  res.end(bildSvg(id, gesperrt) ?? '')
}

/** Angezeigter Titel und ob die Form noch gewählt werden sollte */
function titelKurz(d: AchDaten): {
  wahl: TitelWahl
  anzeige: ReturnType<typeof angezeigterTitel>
  formOffen: boolean
  /** Formen des höchsten erreichten Titels – Beispiel für die Wahl der Form */
  beispiel: { m: string; w: string; n: string } | null
} {
  const erreicht = Object.fromEntries(Object.entries(d.ausz.titel).map(([s, t]) => [s, { stufe: t.stufe, punkte: punkteVon(d.ausz, s) }]))
  // Gefragt wird beim ersten Titel – auch wenn er selbst in allen Formen gleich lautet (Traveller), dann mit dem Beispiel
  // der ersten Stufe, deren Formen sich unterscheiden (Sir / Dame / Knight)
  const formOffen = !d.titelWahl.form && Object.entries(d.ausz.titel).some(([s, t]) => t.stufe >= 1 && titelLeiter(s).some((_, i) => hatFormen(s, i + 1)))
  const hoechster = Object.entries(d.ausz.titel).sort((a, b) => b[1].stufe - a[1].stufe)[0]
  const leiter = hoechster ? titelLeiter(hoechster[0]) : []
  const x = hoechster ? leiter.slice(hoechster[1].stufe - 1).find((_, i) => hatFormen(hoechster[0], hoechster[1].stufe + i)) ?? leiter[hoechster[1].stufe - 1] : undefined
  return { wahl: d.titelWahl, anzeige: angezeigterTitel(erreicht, d.titelWahl), formOffen, beispiel: x ? { m: x.m, w: x.w, n: x.n } : null }
}

/** Eingabe der Wahl prüfen – null, wenn etwas nicht passt */
function wahlAus(k0: Record<string, unknown>, d: AchDaten): TitelWahl | null {
  const wahl: TitelWahl = {}
  if ('form' in k0) {
    if (k0.form !== 'm' && k0.form !== 'w' && k0.form !== 'n') return null
    wahl.form = k0.form
  }
  if ('anzeige' in k0) {
    const x = k0.anzeige
    if (x === 'aus') wahl.anzeige = 'aus'
    else if (x === null) wahl.anzeige = undefined
    else if (x && typeof x === 'object') {
      const sprache = String((x as Record<string, unknown>).sprache ?? '')
      const stufe = Math.floor(Number((x as Record<string, unknown>).stufe))
      // Nur ein erreichter Titel lässt sich zeigen
      if (!SPRACHE.test(sprache) || !(stufe >= 1) || stufe > (d.ausz.titel[sprache]?.stufe ?? 0)) return null
      wahl.anzeige = { sprache, stufe }
    } else return null
  }
  return wahl
}

type Eintrag = Erreicht & { id: string }
const eintraege = (d: AchDaten, ids: string[]): Eintrag[] => ids.filter((id) => d.erreicht[id]).map((id) => ({ id, ...d.erreicht[id] }))

/** Gemeldete aus „offen" streichen (frisch gelesen, damit nichts anderes überschrieben wird) */
function alsGemeldet(ich: NutzerInfo, ids: string[], auszeichnungen = 0): void {
  if ((!ids.length && !auszeichnungen) || !zaehlt(ich)) return
  const d = achDatenLesen(ich.id)
  d.offen = d.offen.filter((x) => !ids.includes(x))
  d.offenAusz = d.offenAusz.slice(auszeichnungen)
  achDatenSchreiben(ich.id, d)
}

/** Medaillen und Titel (10.10.2026) */
async function auszeichnungenRoute({ req, res, url, sitzung, koerper }: Anfrage): Promise<boolean> {
  if (!sitzung) return json(res, 401, { fehler: 'Nicht angemeldet.' }), true
  const ich = sitzung.nutzer
  // Bilder (Platzhalter oder Ersatz) – für alle Angemeldeten (auch die Lehrkraft sieht Profilbilder)
  if (url.pathname.startsWith('/s/api/auszeichnungen/bild/')) {
    if (req.method !== 'GET') return json(res, 405, { fehler: 'Nur lesen.' }), true
    const id = decodeURIComponent(url.pathname.slice('/s/api/auszeichnungen/bild/'.length)).replace(/\.svg$/, '')
    if (!bildInfo(id)) return json(res, 404, { fehler: 'Unbekanntes Bild.' }), true
    bildAusliefern(res, id, url.searchParams.get('gesperrt') === '1')
    return true
  }
  if (url.pathname === '/s/api/auszeichnungen' || url.pathname === '/s/api/auszeichnungen/titel') {
    if (req.method !== 'GET') return json(res, 405, { fehler: 'Nur lesen.' }), true
    if (!siehtListe(ich)) return json(res, 200, { sprachen: [], wahl: {}, anzeige: null, formOffen: false }), true
    if (url.pathname.endsWith('/titel')) {
      // Startseite: nur Gespeichertes – gerechnet wird, wenn noch nie gerechnet wurde (und immer in der Vorschau)
      const d0 = achDatenLesen(ich.id)
      const d = d0.uebernommen && zaehlt(ich) ? d0 : (await achievementsAuswerten(ich)).d
      return json(res, 200, { ...titelKurz(d), avatar: avatarVon(ich.id, d.ausz) }), true
    }
    const a = await achievementsAuswerten(ich)
    return json(res, 200, { ...auszeichnungenSicht(a), avatar: avatarVon(ich.id, a.d.ausz) }), true
  }
  if (url.pathname === '/s/api/auszeichnungen/wahl') {
    if (req.method !== 'POST') return json(res, 405, { fehler: 'Nicht erlaubt.' }), true
    if (typeof req.headers['x-schulapps-token'] !== 'string') return json(res, 403, { fehler: 'Nur aus der App.' }), true
    if (!siehtListe(ich)) return json(res, 403, { fehler: 'Nur für Lernende.' }), true
    const d = achDatenLesen(ich.id)
    const wahl = wahlAus(((await koerper()) ?? {}) as Record<string, unknown>, d)
    if (!wahl) return json(res, 400, { fehler: 'Diese Auswahl gibt es nicht.' }), true
    d.titelWahl = titelWahlSetzen(ich, wahl)
    return json(res, 200, { ...titelKurz(d), avatar: avatarVon(ich.id, d.ausz) }), true
  }
  return json(res, 404, { fehler: 'Unbekannt.' }), true
}

export function achievementsRoute(): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { req, res, url, sitzung } = k
    if (url.pathname.startsWith('/s/api/auszeichnungen')) return auszeichnungenRoute(k)
    if (url.pathname !== '/s/api/achievements' && url.pathname !== '/s/api/achievements/neu') return false
    if (req.method !== 'GET') return json(res, 405, { fehler: 'Nur lesen.' }), true
    if (!sitzung) return json(res, 401, { fehler: 'Nicht angemeldet.' }), true
    const ich = sitzung.nutzer
    if (!siehtListe(ich) || (!zaehlt(ich) && url.pathname.endsWith('/neu')))
      return (
        json(res, 200, url.pathname.endsWith('/neu') ? { neu: [], auszeichnungen: [] } : { alle: [], erreicht: [], verborgen: 0, gruppen: ACH_GRUPPEN, neu: [], lernende: 0, platz: null }),
        true
      )
    const { d, katalog } = await achievementsAuswerten(ich)
    const offen = zaehlt(ich) ? [...d.offen] : []
    // Neue Medaillen und Titel (10.10.2026) meldet nur der Glückwunsch
    const offenAusz = zaehlt(ich) && url.pathname.endsWith('/neu') ? [...d.offenAusz] : []
    alsGemeldet(ich, offen, offenAusz.length)
    if (url.pathname.endsWith('/neu'))
      return json(res, 200, { neu: eintraege(d, offen), auszeichnungen: offenAusz.map((n) => auszText(n, d.titelWahl.form)), ...titelKurz(d) }), true
    const reihenfolge = ACH_GRUPPEN.map((g) => g.id)
    const erreicht = eintraege(d, Object.keys(d.erreicht)).sort(
      (a, b) => reihenfolge.indexOf(a.gruppe) - reihenfolge.indexOf(b.gruppe) || b.am - a.am || a.titel.localeCompare(b.titel, 'de')
    )
    // Alle mit Fortschritt (09.10.2026); geheime nur als Zahl, bis sie erreicht sind
    const schule = schulAnteile()
    const { liste, verborgen } = achievementSicht(katalog, d.erreicht, schule.anteile)
    return (
      json(res, 200, {
        alle: liste,
        erreicht,
        verborgen,
        gruppen: ACH_GRUPPEN,
        neu: offen,
        // Zahl der Lernenden im Schulvergleich nur, wenn Anteile gezeigt werden
        lernende: schule.anteile ? schule.lernende : 0,
        platz: klassenPlatz(ich)
      }),
      true
    )
  }
}
