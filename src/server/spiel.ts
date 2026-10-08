/**
 * Mehrspieler-Spiele „Kooperativ" und „Versus" (08.10.2026, Plan refactored-wishing-iverson B–F) – Server.
 *
 * Räume nur im Speicher: Lobby (shared/mehrspieler/lobby.ts), Spielzustand (Regelmodule in shared/mehrspieler/spiele),
 * Ströme der Geräte. Der Server prüft jede Antwort; die Geräte bekommen nur ihre Sicht (Bausteine ohne Lösung).
 * Nach dem Spiel wie bei den Einzelspielen: Rekordbuch (`koop:<id>`/`versus:<id>`), „nochmal ansehen", Fehler machen
 * das Wort wackelig; Achievements der Gruppe „Zusammen" (nicht für Beschreib-Raten).
 *
 *  Lernende: GET  /s/api/spiel/angebot?bereich=vok|gram&kurs=<id>&stimme=0|1  → { frei, grund?, spiele }
 *            POST /s/api/spiel/neu {bereich, kurs, spiel}                   → { code }
 *            GET  /s/api/spiel/zugang?code=                                 → { code, spiel, titel } (Code erkennen)
 *            POST /s/api/spiel/beitreten {code}
 *            GET  /s/api/spiel/strom?lobby=<code>                           → Server-Sent Events „spiel:sicht"
 *            GET  /s/api/spiel/zustand?lobby=<code>                         → { sicht } (Rückfall: Abfrage je Sekunde)
 *            POST /s/api/spiel/einstellen {lobby, schwierigkeit?, form?, spiel?} · /entfernen {lobby, spieler}
 *            POST /s/api/spiel/start {lobby} · /zug {lobby, aktion, wert} · /ruf {lobby, ruf} · /verlassen {lobby}
 *            POST /s/api/spiel/nochmal {lobby}
 */
import type { ServerResponse } from 'node:http'
import { randomInt } from 'node:crypto'
import { json, type Anfrage } from './http'
import { nutzerNachId, protokolliereServer, type NutzerInfo } from './datenbank'
import {
  json_,
  klasseFuer,
  kursHaken,
  spieleHeuteFrei,
  standardVerben,
  standSpeichern as vokSpeichern,
  standVon as vokStand,
  tageszielVon,
  titelFuerLernende,
  vokIstFuer,
  zeile as vokZeile
} from './vokabeln'
import { grammatikFuerSpiel as G } from './grammatik'
import { rekordEintragen } from './rekordbuch'
import { achievementZusammen } from './achievementsDaten'
import { nachSpielfehler } from '../shared/vokabelSpiele'
import { sitzungsWoerter, tagVon, type Vokabel, type WortStand } from '../shared/vokabeltrainer'
import { alsKarten, type GrammatikAufgabe } from '../shared/grammatiktrainer'
import { verbenFrei } from '../shared/verbFreigabe'
import { istVerbSprache } from '../shared/verben'
import { formSpalten, type VerbKarte } from '../shared/verbTraining'
import { kurzNamen } from '../shared/namenListe'
import { ohneKlasse } from '../shared/ohneKlasse'
import { REGELN, angebotFuer, type Angebot } from '../shared/mehrspieler/regeln'
import { gramItems, leererInhalt, synonymeAus, verbFormenAus, vokItems, zeitSaetzeAus } from '../shared/mehrspieler/inhalt'
import { bandEinzeln, bandGemeinsam } from '../shared/mehrspieler/schwierigkeit'
import { aufraeumen, beitreten, einstellen, entfernen, lobbyNeu, startPruefen, verbindung, verlassen, type Lobby } from '../shared/mehrspieler/lobby'
import { aktive, type Basis, type Block } from '../shared/mehrspieler/kern'
import {
  KURZRUFE,
  istMehrspielId,
  istSchwierigkeit,
  istSpielCode,
  mehrspielInfo,
  SCHWIERIGKEITEN,
  type Band,
  type Bereich,
  type SpielErgebnis,
  type SpielInhalt
} from '../shared/mehrspieler/typen'

const PULS_MS = 5000
const ANWESEND_MS = 4000
const RUF_ABSTAND_MS = 2000

interface Raum {
  lobby: Lobby
  nutzer: Map<string, NutzerInfo>
  zustand: Basis | null
  ergebnis: SpielErgebnis | null
  stroeme: Map<string, Set<ServerResponse>>
  abfrage: Map<string, number>
  rufe: { name: string; text: string; zeit: number }[]
  rufZeit: Map<string, number>
  titel: string
  sprache: string
  jahrgang: number | null
  angebot: Angebot[]
  formen: { id: string; name: string; waehlbar: boolean; hinweis?: string }[]
  abbruch?: string
}

const raeume = new Map<string, Raum>()

// ---------------------------------------------------------------- Kurs, Zugang, Freigabe

/** Kurzname „Vorname N." – Gäste sind schon so gespeichert */
function kurzNamenVon(nutzer: NutzerInfo[]): Map<string, string> {
  const personen = nutzer.map((n) => {
    const t = n.name.trim().split(/\s+/)
    return { vorname: t.length > 1 ? t.slice(0, -1).join(' ') : t[0] || 'Gast', nachname: t.length > 1 ? t[t.length - 1] : 'X' }
  })
  const k = kurzNamen(personen)
  const aus = new Map<string, string>()
  nutzer.forEach((n, i) => aus.set(n.id, k.length === personen.length ? k[i] : `${personen[i].vorname} ${personen[i].nachname[0]}.`))
  return aus
}

function darf(bereich: Bereich, kurs: string, n: NutzerInfo): boolean {
  if (bereich === 'vok') {
    const z = vokZeile(kurs)
    return Boolean(z && vokIstFuer(z, n))
  }
  return G.istFuer(kurs, n)
}

/** Spiele frei? Wie bei den Einzelspielen: nach der Tagesrunde bzw. wenn die Lehrkraft sie heute freigeschaltet hat */
export function spieleFrei(bereich: Bereich, kurs: string, n: NutzerInfo, jetzt = Date.now()): boolean {
  if (bereich === 'vok') {
    const z = vokZeile(kurs)
    if (!z) return false
    // Lehrkraft hat „Zusammen spielen" für den Kurs abgeschaltet (z. B. vor einem Test)
    if (z.zusammen === 'aus') return false
    if (spieleHeuteFrei(z)) return true
    const ziel = tageszielVon(z)
    return sitzungsWoerter(json_(z.woerter, [] as Vokabel[]), vokStand(z.id, n.id).woerter, jetzt, ziel, ziel + 25).length === 0
  }
  const vokId = G.kopf(kurs)?.vokId
  if (vokId && vokZeile(vokId)?.zusammen === 'aus') return false
  const p = G.paket(kurs)
  if (!p) return false
  const st = G.stand(kurs, n.id).aufgaben
  const karten = alsKarten(p.aufgaben) as Vokabel[]
  if (sitzungsWoerter(karten, st, jetzt, 0).length) return false
  const heute = tagVon(jetzt)
  const schonNeu = p.aufgaben.filter((a) => st[a.id]?.erstmals && tagVon(st[a.id].erstmals!) === heute).length
  return p.aufgaben.filter((a) => !st[a.id]?.versuche).slice(0, Math.max(0, 10 - schonNeu)).length === 0
}

function kursKopf(bereich: Bereich, kurs: string, host: NutzerInfo): { titel: string; sprache: string; jahrgang: number | null } {
  if (bereich === 'vok') {
    const z = vokZeile(kurs)!
    return { titel: titelFuerLernende(z), sprache: z.sprache, jahrgang: klasseFuer(z, host) }
  }
  const k = G.kopf(kurs)!
  const info = G.info(kurs)
  const v = k.vokId ? vokZeile(k.vokId) : null
  const jahrgang = info?.jahrgang ?? (v ? klasseFuer(v, host) : klasseFuer({ lerngruppe_id: k.lerngruppe }, host))
  return { titel: ohneKlasse(k.titel), sprache: k.sprache, jahrgang }
}

/** Gibt es Themen gemeinsam? (Katalog-Kennungen; Teilformen zählen zu ihrem Thema) */
const themenTreffen = (a: string[], b: string[]): boolean => a.some((t) => b.includes(t) || b.includes(t.split('/')[0]))

/**
 * Inhalt für eine Gruppe: Vokabeln (gelernt von mindestens einer Person, sonst alle) bzw. Grammatik der Form samt
 * Aufgaben derselben Katalogform aus anderen Kursen (nur die Texte). Dazu die Bänder je Item.
 */
function inhaltFuer(
  bereich: Bereich,
  kurs: string,
  form: string | undefined,
  leute: NutzerInfo[]
): { inhalt: SpielInhalt; band: { gemeinsam: Record<string, Band | null>; je: Record<string, Record<string, Band | null>> } } {
  if (bereich === 'vok') {
    const z = vokZeile(kurs)!
    const woerter = json_(z.woerter, [] as Vokabel[])
    const staende = leute.map((n) => vokStand(z.id, n.id).woerter)
    const gelernt = woerter.filter((w) => staende.some((st) => (st[w.id]?.fach ?? 0) >= 1))
    const auswahl = gelernt.length >= 9 ? gelernt : woerter
    const inhalt = leererInhalt('vok', z.sprache)
    inhalt.items = vokItems(auswahl)
    inhalt.synonyme = synonymeAus(auswahl)
    const host = leute[0]
    if (istVerbSprache(z.sprache) && host && verbenFrei(z.sprache, kursHaken.bekannt?.(host) ?? [], z.verbspiele ?? '')) {
      const v = json_(z.verben, null as { karten?: VerbKarte[] } | null) ?? standardVerben(woerter, z.sprache)
      inhalt.verben = verbFormenAus(v?.karten ?? [], formSpalten(z.sprache))
    }
    return { inhalt, band: baender(inhalt, leute, staende) }
  }
  const f = form && G.paket(form) ? form : kurs
  const kopf = G.kopf(f)!
  const info = G.info(f)
  const eigene = G.paket(f)?.aufgaben ?? []
  const fremde: GrammatikAufgabe[] = []
  if (info?.themen.length)
    for (const id of G.alle(kopf.sprache))
      if (id !== f && themenTreffen(G.info(id)?.themen ?? [], info.themen)) fremde.push(...(G.paket(id)?.aufgaben ?? []))
  const inhalt = leererInhalt('gram', kopf.sprache)
  const gesehen = new Set<string>()
  inhalt.items = gramItems([...eigene, ...fremde].filter((a) => !gesehen.has(a.id) && Boolean(gesehen.add(a.id))).slice(0, 200))
  // Zeitstrahl: Sätze aus Freigaben mit genau einer Zeitform, die alle schon hatten
  if (kopf.sprache === 'en') {
    const bekannt = leute.map((n) => G.bekannt(n))
    const gruppen = G.alle('en')
      .map((id) => ({ themen: G.info(id)?.themen ?? [], aufgaben: G.paket(id)?.aufgaben ?? [] }))
      .filter((g) => g.themen.length && bekannt.every((b) => themenTreffen(g.themen, b)))
    inhalt.zeitSaetze = zeitSaetzeAus(gruppen).slice(0, 120)
  }
  const staende = leute.map((n) => G.stand(f, n.id).aufgaben)
  return { inhalt, band: baender(inhalt, leute, staende) }
}

function baender(inhalt: SpielInhalt, leute: NutzerInfo[], staende: Record<string, WortStand>[]) {
  const gemeinsam: Record<string, Band | null> = {}
  const je: Record<string, Record<string, Band | null>> = Object.fromEntries(leute.map((n) => [n.id, {}]))
  for (const i of inhalt.items) {
    gemeinsam[i.id] = bandGemeinsam(staende.map((st) => st[i.id]))
    leute.forEach((n, k) => (je[n.id][i.id] = bandEinzeln(staende[k][i.id])))
  }
  return { gemeinsam, je }
}

/** Formen (Grammatik) für die Lobby: wählbar nur, wenn alle Beigetretenen sie schon hatten */
function formenFuer(r: Raum): Raum['formen'] {
  if (r.lobby.bereich !== 'gram') return []
  const leute = [...r.nutzer.values()].filter((n) => r.lobby.spieler.some((s) => s.id === n.id))
  const bekannt = new Map(leute.map((n) => [n.id, G.bekannt(n)]))
  const host = r.nutzer.get(r.lobby.host)
  const aus: Raum['formen'] = []
  for (const id of G.alle(r.sprache)) {
    const info = G.info(id)
    const kopf = G.kopf(id)
    if (!info || !kopf || !host) continue
    const hatte = (n: NutzerInfo): boolean => G.istFuer(id, n) || (info.themen.length > 0 && themenTreffen(info.themen, bekannt.get(n.id) ?? []))
    if (!hatte(host) && id !== r.lobby.kurs) continue
    const fehlt = leute.filter((n) => !hatte(n))
    aus.push({
      id,
      name: `${kopf.thema || kopf.titel}${info.jahrgang ? ` · Klasse ${info.jahrgang}` : ''}`,
      waehlbar: !fehlt.length,
      ...(fehlt.length ? { hinweis: `Noch nicht bei: ${fehlt.map((n) => kurz(r, n.id)).join(', ')}` } : {})
    })
    if (aus.length >= 30) break
  }
  return aus.sort((a, b) => Number(b.id === r.lobby.kurs) - Number(a.id === r.lobby.kurs))
}

const kurz = (r: Raum, id: string): string => kurzNamenVon([...r.nutzer.values()]).get(id) ?? 'Jemand'

// ---------------------------------------------------------------- Sicht und Ströme

function sichtFuer(r: Raum, wer: string, jetzt: number) {
  const l = r.lobby
  const namen = kurzNamenVon(l.spieler.map((s) => r.nutzer.get(s.id)!).filter(Boolean))
  const info = mehrspielInfo(l.spiel)!
  const eigen = r.ergebnis?.jeSpieler[wer]
  const anzahl = r.zustand?.spieler.length ?? l.spieler.length
  return {
    code: l.code,
    phase: l.phase,
    spiel: l.spiel,
    spielName: info.name,
    art: info.art,
    bereich: l.bereich,
    titel: r.titel,
    ich: wer,
    host: l.host === wer,
    min: info.min,
    max: info.max,
    spieler: l.spieler.map((s) => ({ id: s.id, name: namen.get(s.id) ?? s.name, verbunden: s.verbunden, host: s.id === l.host })),
    schwierigkeit: l.schwierigkeit,
    schwierigkeiten: SCHWIERIGKEITEN,
    form: l.form ?? (l.bereich === 'gram' ? l.kurs : undefined),
    formen: l.phase === 'warten' ? r.formen : [],
    spiele: l.phase === 'warten' && l.host === wer ? r.angebot : [],
    rufe: r.rufe.filter((x) => jetzt - x.zeit < 8000),
    kurzrufe: KURZRUFE,
    ...(l.phase === 'spiel' && r.zustand ? { bloecke: REGELN[l.spiel].sicht(r.zustand, wer, jetzt) as Block[] } : {}),
    ...(r.ergebnis && l.phase === 'ende'
      ? {
          ergebnis: {
            text: r.ergebnis.text,
            ...(r.ergebnis.teamZiel !== undefined ? { teamZiel: r.ergebnis.teamZiel } : {}),
            ...(r.ergebnis.unentschieden ? { unentschieden: true } : {}),
            sieger: (r.ergebnis.sieger ?? []).map((id) => namen.get(id) ?? r.zustand?.spieler.find((s) => s.id === id)?.name ?? ''),
            einheit: info.einheit,
            // Eigene Leistung nur für mich; Platz nur, wenn er nicht der letzte ist (abgestimmt: kein öffentlicher letzter Platz)
            eigen: eigen
              ? {
                  wert: eigen.wert,
                  richtig: eigen.richtig,
                  fehler: eigen.fehler.length,
                  gewonnen: Boolean(eigen.gewonnen),
                  ...(eigen.platz && eigen.platz < anzahl ? { platz: eigen.platz } : {})
                }
              : null
          }
        }
      : {}),
    ...(r.abbruch ? { abbruch: r.abbruch } : {})
  }
}

function schreibe(res: ServerResponse, wert: unknown): void {
  res.write(`data: ${JSON.stringify({ kanal: 'spiel:sicht', wert })}\n\n`)
}

/** Allen im Raum ihre Sicht schicken */
function verteilen(r: Raum, jetzt = Date.now()): void {
  for (const [id, set] of r.stroeme) {
    if (!set.size) continue
    const s = sichtFuer(r, id, jetzt)
    for (const res of set) schreibe(res, s)
  }
}

function schliessen(r: Raum): void {
  for (const set of r.stroeme.values()) for (const res of set) res.end()
  raeume.delete(r.lobby.code)
}

// ---------------------------------------------------------------- Ablauf

function neuerCode(): string {
  for (;;) {
    const c = String(randomInt(0, 1_000_000)).padStart(6, '0')
    if (!raeume.has(c)) return c
  }
}

function spielStarten(r: Raum, jetzt: number): string | null {
  const l = r.lobby
  const leute = l.spieler.filter((s) => s.verbunden).map((s) => r.nutzer.get(s.id)!)
  const regeln = REGELN[l.spiel]
  const { inhalt, band } = inhaltFuer(l.bereich, l.kurs, l.form, leute)
  const grund = regeln.passt(inhalt, true)
  if (grund) return grund
  const namen = kurzNamenVon(leute)
  r.zustand = regeln.start({
    spiel: l.spiel,
    spieler: leute.map((n) => ({ id: n.id, name: namen.get(n.id) ?? n.name })),
    schwierigkeit: l.schwierigkeit,
    jahrgang: r.jahrgang,
    inhalt,
    band,
    saat: randomInt(1, 2 ** 31),
    jetzt
  })
  r.ergebnis = null
  r.abbruch = undefined
  l.phase = 'spiel'
  l.aktiv = jetzt
  return null
}

/** Spiel zu Ende: Ergebnis festhalten und einmal wie bei den Einzelspielen eintragen */
function spielBeenden(r: Raum, jetzt: number): void {
  const z = r.zustand
  if (!z || r.lobby.phase !== 'spiel') return
  const regeln = REGELN[r.lobby.spiel]
  r.ergebnis = regeln.ergebnis(z)
  r.lobby.phase = 'ende'
  r.lobby.aktiv = jetzt
  try {
    eintragen(r, r.ergebnis, jetzt)
  } catch (e) {
    protokolliereServer('spiel', `Ergebnis nicht eingetragen: ${e instanceof Error ? e.message : String(e)}`)
  }
}

function eintragen(r: Raum, e: SpielErgebnis, jetzt: number): void {
  const l = r.lobby
  const info = mehrspielInfo(l.spiel)!
  if (r.abbruch) return
  const form = l.bereich === 'gram' ? (l.form && G.paket(l.form) ? l.form : l.kurs) : l.kurs
  const heute = new Date(jetzt).toISOString().slice(0, 10)
  for (const [id, x] of Object.entries(e.jeSpieler)) {
    const n = r.nutzer.get(id)
    if (!n) continue
    if (l.bereich === 'vok') {
      const z = vokZeile(l.kurs)
      if (!z) continue
      const st = vokStand(z.id, id)
      const woerter = new Set(json_(z.woerter, [] as Vokabel[]).map((w) => w.id))
      const fehler = x.fehler.filter((f) => woerter.has(f))
      st.ansehen = [...new Set([...(st.ansehen ?? []), ...fehler])].slice(-30)
      for (const f of fehler) if (st.woerter[f]) st.woerter[f] = nachSpielfehler(st.woerter[f], jetzt)
      if (!st.tage.includes(heute)) st.tage = [...st.tage, heute].slice(-60)
      vokSpeichern(z.id, id, st)
    } else {
      const st = G.stand(form, id)
      const ids = new Set((G.paket(form)?.aufgaben ?? []).map((a) => a.id))
      const fehler = x.fehler.filter((f) => ids.has(f))
      st.ansehen = [...new Set([...(st.ansehen ?? []), ...fehler])].slice(-30)
      for (const f of fehler) if (st.aufgaben[f]) st.aufgaben[f] = nachSpielfehler(st.aufgaben[f], jetzt)
      if (!st.tage.includes(heute)) st.tage = [...st.tage, heute].slice(-60)
      G.speichern(form, id, st)
    }
    // Rekordbuch und Achievements – nicht für Beschreib-Raten (abgestimmt)
    if (!info.achievements) continue
    const klasse = r.jahrgang
    if (x.wert !== null && Number.isFinite(x.wert)) rekordEintragen(n, `${info.art}:${l.spiel}`, x.wert, klasse, jetzt, x.fehler.length)
    achievementZusammen(
      n,
      {
        spiel: l.spiel,
        art: info.art,
        teamZiel: e.teamZiel === true,
        gewonnen: Boolean(x.gewonnen) && !e.unentschieden,
        comeback: Boolean(e.comeback && x.gewonnen),
        fehlerfrei: e.fehlerfrei === true,
        unmoeglich: l.schwierigkeit === 'unmoeglich'
      },
      jetzt
    )
  }
}

/** Takt: Uhr der Spiele, Anwesenheit, verlorene Plätze, Ablauf */
function takt(jetzt = Date.now()): void {
  for (const r of [...raeume.values()]) {
    let geaendert = false
    for (const s of r.lobby.spieler) {
      const da = (r.stroeme.get(s.id)?.size ?? 0) > 0 || jetzt - (r.abfrage.get(s.id) ?? 0) < ANWESEND_MS
      if (da !== s.verbunden) {
        verbindung(r.lobby, s.id, da, jetzt)
        geaendert = true
      }
    }
    const { raus, abgelaufen } = aufraeumen(r.lobby, jetzt)
    if (raus.length) {
      geaendert = true
      r.formen = formenFuer(r)
      if (r.zustand && r.lobby.phase === 'spiel') for (const id of raus) wegImSpiel(r, id)
    }
    if (abgelaufen) {
      schliessen(r)
      continue
    }
    if (r.zustand && r.lobby.phase === 'spiel') {
      const regeln = REGELN[r.lobby.spiel]
      if (regeln.tick?.(r.zustand, jetzt)) geaendert = true
      if (r.zustand.ende) spielBeenden(r, jetzt)
    }
    if (geaendert || r.lobby.phase === 'spiel') verteilen(r, jetzt)
  }
}

function wegImSpiel(r: Raum, id: string): void {
  const z = r.zustand
  if (!z || z.weg.includes(id)) return
  z.weg.push(id)
  REGELN[r.lobby.spiel].weg?.(z, id)
  if (aktive(z).length < (mehrspielInfo(r.lobby.spiel)?.min ?? 2)) {
    z.ende = true
    r.abbruch = 'Zu wenige Mitspielende – die Runde ist beendet.'
  }
}

let taktUhr: ReturnType<typeof setInterval> | null = null
let pulsUhr: ReturnType<typeof setInterval> | null = null
function uhrenStarten(): void {
  if (taktUhr) return
  taktUhr = setInterval(() => takt(), 1000)
  pulsUhr = setInterval(() => {
    for (const r of raeume.values()) for (const set of r.stroeme.values()) for (const res of set) res.write(': puls\n\n')
  }, PULS_MS)
  taktUhr.unref?.()
  pulsUhr.unref?.()
}

// ---------------------------------------------------------------- Routen

export function spielRoute(): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { url, req, res, sitzung } = k
    if (!url.pathname.startsWith('/s/api/spiel/')) return false
    if (req.method === 'POST' && typeof req.headers['x-schulapps-token'] !== 'string') return json(res, 403, { fehler: 'Nur aus der App.' }), true
    const aktion = url.pathname.slice('/s/api/spiel/'.length)
    const jetzt = Date.now()

    // Code erkennen (auch ohne Anmeldung – verrät nur, dass es die Runde gibt)
    if (req.method === 'GET' && aktion === 'zugang') {
      const r = raeume.get(String(url.searchParams.get('code') ?? ''))
      if (!r) return json(res, 404, { fehler: 'Diese Spielrunde gibt es nicht (mehr).' }), true
      return json(res, 200, { code: r.lobby.code, spiel: mehrspielInfo(r.lobby.spiel)?.name ?? '' }), true
    }
    if (!sitzung) return json(res, 401, { fehler: 'Nicht angemeldet.' }), true
    const ich = sitzung.nutzer
    if (ich.rolle !== 'schueler') return json(res, 403, { fehler: 'Zusammen spielen ist für Lernende.' }), true
    uhrenStarten()

    if (req.method === 'GET' && aktion === 'angebot') {
      const bereich: Bereich = url.searchParams.get('bereich') === 'gram' ? 'gram' : 'vok'
      const kurs = String(url.searchParams.get('kurs') ?? '')
      if (!darf(bereich, kurs, ich)) return json(res, 404, { fehler: 'Nicht für dich freigegeben.' }), true
      const kopf = kursKopf(bereich, kurs, ich)
      const { inhalt } = inhaltFuer(bereich, kurs, undefined, [ich])
      const frei = spieleFrei(bereich, kurs, ich, jetzt)
      return json(res, 200, { frei, spiele: angebotFuer(inhalt, kopf.jahrgang, url.searchParams.get('stimme') !== '0') }), true
    }

    const k0 = req.method === 'POST' ? ((await k.koerper()) as Record<string, unknown>) : {}

    if (req.method === 'POST' && aktion === 'neu') {
      const bereich: Bereich = k0.bereich === 'gram' ? 'gram' : 'vok'
      const kurs = String(k0.kurs ?? '')
      const spiel = k0.spiel
      if (!istMehrspielId(spiel) || !mehrspielInfo(spiel)!.bereiche.includes(bereich)) return json(res, 400, { fehler: 'Unbekanntes Spiel.' }), true
      if (!darf(bereich, kurs, ich)) return json(res, 404, { fehler: 'Nicht für dich freigegeben.' }), true
      if (!spieleFrei(bereich, kurs, ich, jetzt)) return json(res, 409, { fehler: 'Die Spiele gibt es nach der Übung für heute.' }), true
      // Höchstens eine offene Runde je Person: alte verlassen
      for (const r of [...raeume.values()]) if (r.lobby.spieler.some((s) => s.id === ich.id)) raumVerlassen(r, ich.id, jetzt)
      const kopf = kursKopf(bereich, kurs, ich)
      const code = neuerCode()
      const r: Raum = {
        lobby: lobbyNeu({ code, bereich, kurs, spiel, host: { id: ich.id, name: ich.name }, jetzt, ...(bereich === 'gram' ? { form: kurs } : {}) }),
        nutzer: new Map([[ich.id, ich]]),
        zustand: null,
        ergebnis: null,
        stroeme: new Map(),
        abfrage: new Map([[ich.id, jetzt]]),
        rufe: [],
        rufZeit: new Map(),
        titel: kopf.titel,
        sprache: kopf.sprache,
        jahrgang: kopf.jahrgang,
        angebot: [],
        formen: []
      }
      r.angebot = angebotFuer(inhaltFuer(bereich, kurs, undefined, [ich]).inhalt, kopf.jahrgang)
      r.formen = formenFuer(r)
      raeume.set(code, r)
      return json(res, 200, { code }), true
    }

    const code = String((req.method === 'GET' ? url.searchParams.get('lobby') : k0.lobby ?? k0.code) ?? '')
    const r = istSpielCode(code) ? raeume.get(code) : undefined
    if (!r) return json(res, 404, { fehler: 'Diese Spielrunde gibt es nicht (mehr).' }), true
    const l = r.lobby
    const dabei = l.spieler.some((s) => s.id === ich.id)

    if (req.method === 'POST' && aktion === 'beitreten') {
      if (!dabei) {
        if (!darf(l.bereich, l.kurs, ich)) return json(res, 403, { fehler: 'Diese Runde ist für einen anderen Kurs.' }), true
        if (!spieleFrei(l.bereich, l.kurs, ich, jetzt)) return json(res, 409, { fehler: 'Die Spiele gibt es nach deiner Übung für heute.' }), true
      }
      const f = beitreten(l, { id: ich.id, name: ich.name }, jetzt)
      if (f) return json(res, f.status, { fehler: f.fehler }), true
      r.nutzer.set(ich.id, ich)
      r.abfrage.set(ich.id, jetzt)
      r.formen = formenFuer(r)
      verteilen(r, jetzt)
      return json(res, 200, { ok: true }), true
    }
    if (!dabei) return json(res, 403, { fehler: 'Du bist nicht in dieser Runde.' }), true

    if (req.method === 'GET' && aktion === 'strom') {
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' })
      req.socket.setNoDelay(true)
      res.write(': verbunden\n\n')
      const set = r.stroeme.get(ich.id) ?? new Set<ServerResponse>()
      set.add(res)
      r.stroeme.set(ich.id, set)
      if (!l.spieler.find((s) => s.id === ich.id)?.verbunden) verbindung(l, ich.id, true, jetzt)
      verteilen(r, jetzt)
      res.on('close', () => set.delete(res))
      return true
    }
    if (req.method === 'GET' && aktion === 'zustand') {
      r.abfrage.set(ich.id, jetzt)
      verbindung(l, ich.id, true, jetzt)
      return json(res, 200, { sicht: sichtFuer(r, ich.id, jetzt) }), true
    }
    if (req.method !== 'POST') return json(res, 405, { fehler: 'Nicht erlaubt.' }), true
    r.abfrage.set(ich.id, jetzt)

    let fehler: { fehler: string; status: number } | null = null
    switch (aktion) {
      case 'einstellen': {
        const e: Parameters<typeof einstellen>[2] = {}
        if (istSchwierigkeit(k0.schwierigkeit)) e.schwierigkeit = k0.schwierigkeit
        if (istMehrspielId(k0.spiel)) {
          if (!r.angebot.some((a) => a.id === k0.spiel)) return json(res, 409, { fehler: 'Dieses Spiel passt nicht zum Kurs.' }), true
          e.spiel = k0.spiel
        }
        if (typeof k0.form === 'string') {
          const f = r.formen.find((x) => x.id === k0.form)
          if (!f || !f.waehlbar) return json(res, 409, { fehler: 'Diese Form hatten noch nicht alle.' }), true
          e.form = f.id
        }
        fehler = einstellen(l, ich.id, e, jetzt)
        break
      }
      case 'entfernen':
        fehler = entfernen(l, ich.id, String(k0.spieler ?? ''), jetzt)
        if (!fehler) {
          const weg = String(k0.spieler)
          for (const res2 of r.stroeme.get(weg) ?? []) res2.end()
          r.stroeme.delete(weg)
          r.formen = formenFuer(r)
        }
        break
      case 'start': {
        fehler = startPruefen(l, ich.id)
        if (!fehler && r.formen.length && l.form && !r.formen.find((f) => f.id === l.form)?.waehlbar)
          fehler = { fehler: 'Diese Form hatten noch nicht alle – bitte eine andere wählen.', status: 409 }
        if (!fehler) {
          const grund = spielStarten(r, jetzt)
          if (grund) fehler = { fehler: grund, status: 409 }
        }
        break
      }
      case 'zug': {
        if (l.phase !== 'spiel' || !r.zustand) return json(res, 409, { fehler: 'Gerade läuft kein Spiel.' }), true
        if (r.zustand.weg.includes(ich.id) || !r.zustand.spieler.some((s) => s.id === ich.id)) return json(res, 403, { fehler: 'Du spielst in dieser Runde nicht mit.' }), true
        const zugAktion = String(k0.aktion ?? '').slice(0, 40)
        const wert = Array.isArray(k0.wert)
          ? (k0.wert as unknown[]).slice(0, 10).map((x) => String(x).slice(0, 200))
          : k0.wert && typeof k0.wert === 'object'
          ? Object.fromEntries(Object.entries(k0.wert as Record<string, unknown>).slice(0, 12).map(([a, b]) => [a.slice(0, 20), String(b ?? '').slice(0, 200)]))
          : String(k0.wert ?? '').slice(0, 300)
        REGELN[l.spiel].zug(r.zustand, ich.id, { aktion: zugAktion, wert }, jetzt)
        l.aktiv = jetzt
        if (r.zustand.ende) spielBeenden(r, jetzt)
        break
      }
      case 'ruf': {
        const i = Number(k0.ruf)
        if (!Number.isInteger(i) || i < 0 || i >= KURZRUFE.length) return json(res, 400, { fehler: 'Unbekannter Ruf.' }), true
        if (jetzt - (r.rufZeit.get(ich.id) ?? 0) < RUF_ABSTAND_MS) return json(res, 200, { ok: true }), true
        r.rufZeit.set(ich.id, jetzt)
        r.rufe = [...r.rufe.filter((x) => jetzt - x.zeit < 8000), { name: kurz(r, ich.id), text: KURZRUFE[i], zeit: jetzt }].slice(-5)
        break
      }
      case 'verlassen':
        raumVerlassen(r, ich.id, jetzt)
        return json(res, 200, { ok: true }), true
      case 'nochmal':
        if (l.host !== ich.id) return json(res, 403, { fehler: 'Nur wer die Runde eröffnet hat.' }), true
        l.phase = 'warten'
        r.zustand = null
        r.ergebnis = null
        r.abbruch = undefined
        l.aktiv = jetzt
        break
      default:
        return json(res, 404, { fehler: 'Unbekannt.' }), true
    }
    if (fehler) return json(res, fehler.status, { fehler: fehler.fehler }), true
    verteilen(r, jetzt)
    return json(res, 200, { ok: true, sicht: sichtFuer(r, ich.id, jetzt) }), true
  }
}

function raumVerlassen(r: Raum, id: string, jetzt: number): void {
  if (r.zustand && r.lobby.phase === 'spiel') wegImSpiel(r, id)
  for (const res of r.stroeme.get(id) ?? []) res.end()
  r.stroeme.delete(id)
  const leer = verlassen(r.lobby, id, jetzt)
  if (leer) return schliessen(r)
  if (r.zustand?.ende && r.lobby.phase === 'spiel') spielBeenden(r, jetzt)
  r.formen = formenFuer(r)
  verteilen(r, jetzt)
}

/** Für Tests und Diagnose */
export const offeneSpielraeume = (): number => raeume.size
export const _spielIntern = { raeume, takt, inhaltFuer, nutzerNachId }
