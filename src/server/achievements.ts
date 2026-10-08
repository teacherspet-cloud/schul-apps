/**
 * Achievements der Lernenden (08.10.2026, mit der Lehrkraft abgestimmt) – Server. Katalog und Berechnung in
 * shared/achievements.ts, gespeicherter Teil (erreicht, Zähler, Übungstage) in achievementsDaten.ts.
 *
 * Berechnet wird aus dem, was ohnehin da ist (Kästen der Vokabeln, Vokabelweg, Grammatik, Rekordbuch, Wochenziel),
 * und zwar beim Öffnen des Fensters und nach Antworten/Spielen (der Trainer fragt kurz danach nach Neuem für den
 * Glückwunsch). Lernende sehen nur Erreichtes und die Zahl der noch verborgenen – nie, welche. Keine Rangliste; die
 * Lehrkraft sieht die Achievements nicht.
 *
 *  Lernende: GET /s/api/achievements      → { erreicht, verborgen, gruppen, neu }
 *            GET /s/api/achievements/neu  → { neu } (noch nicht gemeldete, danach als gemeldet markiert)
 */
import { datenbank, type NutzerInfo } from './datenbank'
import { json, type Anfrage } from './http'
import { db as vokDb, json_, zeile as vokZeile, type VokStand } from './vokabeln'
import { buchFuer, buchNamen } from './vokabelweg'
import { grammatikFuerAchievements } from './grammatik'
import { gespielteSpiele } from './rekordbuch'
import { achDatenLesen, achDatenSchreiben, rundeAbschliessen, tageVereinen, type AchDaten, type Erreicht } from './achievementsDaten'
import { ACH_GRUPPEN, berechneAchievements, type Achievement, type AchEingabe } from '../shared/achievements'
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
async function wortschatz(ich: NutzerInfo): Promise<{ woerter: AchEingabe['woerter']; lehrwerk: AchEingabe['lehrwerk']; tage: string[] }> {
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
  const buecher = new Map<string, { buch: Buch; units: Set<string> }>()
  const zeilen = sicher(() => vokDb().prepare('SELECT zuweisung_id, daten FROM vok_stand WHERE schueler_id = ?').all(ich.id) as { zuweisung_id: string; daten: string }[], [])
  for (const r of zeilen) {
    const z = vokZeile(r.zuweisung_id)
    if (!z) continue
    const st = json_(r.daten, { woerter: {}, tage: [] } as VokStand)
    for (const t of st.tage ?? []) tage.add(t)
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
  for (const { buch } of buecher.values())
    for (const a of abschnitteAus(buch)) for (const v of a.woerter) begriff.set(`${reiheVon(buch)}|${v.id}`, `${buch.language}:${normal(v.term)}`)
  const weg = sicher(() => datenbank().prepare('SELECT reihe, daten FROM vok_laufbahn WHERE schueler_id = ?').all(ich.id) as { reihe: string; daten: string }[], [])
  for (const r of weg) {
    const st = json_(r.daten, { woerter: {}, tage: [] } as VokStand)
    for (const t of st.tage ?? []) tage.add(t)
    for (const [id, s] of Object.entries(st.woerter ?? {})) merke(begriff.get(`${r.reihe}|${id}`) ?? `lb:${r.reihe}:${id}`, s)
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
      units: [...new Set(abschnitte.map((a) => a.unit))]
        .filter((u) => units.has(u))
        .map((u) => {
          const x = zaehle(abschnitte.filter((a) => a.unit === u).flatMap((a) => a.woerter))
          return { unit: u, gesamt: x.gesamt, sicher: x.sicher }
        })
    })
  }
  const werte = [...best.values()]
  return {
    woerter: { gelernt: werte.filter((b) => b.g).length, sicher: werte.filter((b) => b.s).length, langzeit: werte.filter((b) => b.f >= 6).length },
    lehrwerk,
    tage: [...tage]
  }
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

const zaehlt = (n: NutzerInfo): boolean => n.rolle === 'schueler' && n.quelle !== 'vorschau'

/** Laufende Auswertung je Person – gleichzeitige Anfragen teilen sie */
const laufend = new Map<string, Promise<{ d: AchDaten; katalog: Achievement[] }>>()

/**
 * Alles neu berechnen und Neues mit Zeitpunkt festhalten (nie entziehen). Erst wird gesammelt (asynchron, Lehrwerke),
 * dann in einem Zug gelesen, ergänzt und geschrieben – so gehen gleichzeitig gezählte Antworten nicht verloren.
 */
export function achievementsAuswerten(ich: NutzerInfo, jetzt = Date.now()): Promise<{ d: AchDaten; katalog: Achievement[] }> {
  const da = laufend.get(ich.id)
  if (da) return da
  const p = (async () => {
    const ws = await wortschatz(ich)
    const gr = sicher(() => grammatikFuerAchievements(ich), { regeln: [], extrasGeschafft: 0, tage: [] as string[] })
    const spiele = sicher(() => gespielteSpiele(ich.id).size, 0)
    const wochenziel = wochenzielVon(ich.id)
    const d = achDatenLesen(ich.id)
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
    if (zaehlt(ich)) achDatenSchreiben(ich.id, d)
    return { d, katalog }
  })().finally(() => laufend.delete(ich.id))
  laufend.set(ich.id, p)
  return p
}

type Eintrag = Erreicht & { id: string }
const eintraege = (d: AchDaten, ids: string[]): Eintrag[] => ids.filter((id) => d.erreicht[id]).map((id) => ({ id, ...d.erreicht[id] }))

/** Gemeldete aus „offen" streichen (frisch gelesen, damit nichts anderes überschrieben wird) */
function alsGemeldet(ich: NutzerInfo, ids: string[]): void {
  if (!ids.length || !zaehlt(ich)) return
  const d = achDatenLesen(ich.id)
  d.offen = d.offen.filter((x) => !ids.includes(x))
  achDatenSchreiben(ich.id, d)
}

export function achievementsRoute(): (k: Anfrage) => Promise<boolean> {
  return async ({ req, res, url, sitzung }) => {
    if (url.pathname !== '/s/api/achievements' && url.pathname !== '/s/api/achievements/neu') return false
    if (req.method !== 'GET') return json(res, 405, { fehler: 'Nur lesen.' }), true
    if (!sitzung) return json(res, 401, { fehler: 'Nicht angemeldet.' }), true
    const ich = sitzung.nutzer
    if (!zaehlt(ich))
      return json(res, 200, url.pathname.endsWith('/neu') ? { neu: [] } : { erreicht: [], verborgen: 0, gruppen: ACH_GRUPPEN, neu: [] }), true
    const { d, katalog } = await achievementsAuswerten(ich)
    const offen = [...d.offen]
    alsGemeldet(ich, offen)
    if (url.pathname.endsWith('/neu')) return json(res, 200, { neu: eintraege(d, offen) }), true
    const reihenfolge = ACH_GRUPPEN.map((g) => g.id)
    const erreicht = eintraege(d, Object.keys(d.erreicht)).sort(
      (a, b) => reihenfolge.indexOf(a.gruppe) - reihenfolge.indexOf(b.gruppe) || b.am - a.am || a.titel.localeCompare(b.titel, 'de')
    )
    return (
      json(res, 200, {
        erreicht,
        // Nur die Zahl – welche, bleibt verborgen
        verborgen: katalog.filter((a) => !d.erreicht[a.id]).length,
        gruppen: ACH_GRUPPEN,
        neu: offen
      }),
      true
    )
  }
}
