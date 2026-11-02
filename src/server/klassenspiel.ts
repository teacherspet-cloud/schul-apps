/**
 * Klassenspiele am Server (02.11.2026, Plan „wise-sauteeing-bubble", abgestimmt mit der Lehrkraft): Die Lehrkraft
 * startet ein Vokabel-/Grammatikspiel für die ganze Lerngruppe (Kurs der Klasse). Lernende treten per Code/QR oder über
 * das Banner der Startseite bei, antworten am eigenen Gerät auf eigene Fragen (adaptiv); der Beamer zeigt nur den
 * gemeinsamen Stand. Der Server prüft jede Antwort, Lösungen gehen erst nach der Antwort an das Gerät.
 *
 * Räume nur im Speicher (wie spiel.ts). Nach dem Spiel: Fehler machen Wörter/Aufgaben wackelig (wie die übrigen Spiele),
 * Achievements „Zusammen", Klassenrekord (klassen_rekorde) und eine Auswertung je Person (klassenspiel_personen, nur für
 * die Lehrkraft, verschlüsselt, 400 Tage – loeschkonzept.ts KLASSENSPIEL_TAGE).
 *
 *  Lehrkraft: GET  /server/klassenspiel?kurs=<vokId>             Auswahl (Spiele, Abschnitte), laufendes Spiel, Rekorde
 *             POST /server/klassenspiel/neu {kurs, einstellungen} → {code}
 *             GET  /server/klassenspiel/<code>/strom · /zustand    Beamer und Steuerung
 *             POST /server/klassenspiel/<code>/steuern {aktion, wer?}  losen | start | pause | weiter | ende | nochmal | schliessen | entfernen
 *  Lernende:  GET  /s/api/klassenspiel/offen                      laufende Klassenspiele meiner Kurse (Banner)
 *             GET  /s/api/klassenspiel/zugang?code=               Code erkennen
 *             POST /s/api/klassenspiel/beitreten {code}
 *             GET  /s/api/klassenspiel/strom?code= · /zustand?code=
 *             POST /s/api/klassenspiel/antwort {code, wert, nr}
 *             POST /s/api/klassenspiel/zug {code, aktion, wert}           Einsatz (Wett-Quiz), Sterne (Gebiet)
 */
import { randomInt } from 'node:crypto'
import { datenbank, protokolliereServer, type NutzerInfo } from './datenbank'
import { json, type Anfrage } from './http'
import { Stroeme, PULS_MS } from './stroeme'
import { sechsstelligerCode } from './codes'
import { lerngruppe } from './onlinetest'
import { jahrgangDerGruppe } from './ueberthemen'
import { spielCodeBelegt } from './spiel'
import {
  json_,
  kursAbschnitteFuerVorrang,
  lernendeVon,
  standSpeichern as vokSpeichern,
  standVon as vokStand,
  testEintraege,
  titelFuerLernende,
  vokIstFuer,
  zeile as vokZeile
} from './vokabeln'
import { grammatikFuerSpiel as G } from './grammatik'
import { achievementKlasse, achievementZusammen } from './achievementsDaten'
import { kursFuerLernende } from '../shared/freigabePlan'
import { GRAM_PRAEFIX } from '../shared/testAbschnitte'
import { nachSpielfehler } from '../shared/vokabelSpiele'
import { nachSpielfehlerGrammatik } from '../shared/grammatikSicher'
import { kurzNamen } from '../shared/namenListe'
import type { Vokabel, WortStand } from '../shared/vokabeltrainer'
import { gramItems, leererInhalt, vokItems } from '../shared/mehrspieler/inhalt'
import { bandEinzeln, bandGemeinsam } from '../shared/mehrspieler/schwierigkeit'
import type { Band, MehrspielId } from '../shared/mehrspieler/typen'
import {
  antworten,
  geraetSicht,
  gramKennung,
  kennungAus,
  kNeu,
  kTakt,
  pausieren,
  personDazu,
  teamsLosen,
  top3,
  vokKennung,
  type BBlock,
  type KBasis,
  type KErgebnis,
  type KInhalt
} from '../shared/klassenspiel/kern'
import { KLASSEN_REGELN, spielbar } from '../shared/klassenspiel/regeln'
import { einstellungenBereinigt, istKlassenCode, klassenspielInfo, KLASSENSPIELE, type KlassenEinstellungen } from '../shared/klassenspiel/typen'
import { kt } from '../shared/klassenspiel/texte'
import type { Block } from '../shared/mehrspieler/kern'

type VokZeile = NonNullable<ReturnType<typeof vokZeile>>

const SCHEMA = `
CREATE TABLE IF NOT EXISTS klassen_rekorde (
  vok_id TEXT NOT NULL,
  spiel TEXT NOT NULL,
  daten TEXT NOT NULL,
  geaendert INTEGER NOT NULL,
  PRIMARY KEY (vok_id, spiel)
);
CREATE TABLE IF NOT EXISTS klassenspiel_personen (
  id TEXT NOT NULL,
  vok_id TEXT NOT NULL,
  lehrkraft_id TEXT NOT NULL,
  schueler_id TEXT NOT NULL,
  spiel TEXT NOT NULL,
  daten TEXT NOT NULL,
  zeit INTEGER NOT NULL,
  PRIMARY KEY (id, schueler_id)
);
CREATE INDEX IF NOT EXISTS klassenspiel_personen_kurs ON klassenspiel_personen(vok_id, zeit);`

let bereit = false
const db = () => {
  const d = datenbank()
  if (!bereit) {
    d.exec(SCHEMA)
    bereit = true
  }
  return d
}

const ROH_HOECHSTENS = { vok: 400, gram: 200 }
const MINDEST_ITEMS = 6

// ---------------------------------------------------------------- Räume

type Phase = 'lobby' | 'teams' | 'spiel' | 'ende'

interface Raum {
  code: string
  id: string
  lehrkraftId: string
  kurs: string
  titel: string
  sprache: string
  jahrgang: number | null
  einst: KlassenEinstellungen
  phase: Phase
  inhalt: KInhalt
  /** Gesamte Lernende des Kurses (zum Berechnen der Schwächen und für den Zugang) */
  nutzer: Map<string, NutzerInfo>
  namen: Map<string, string>
  zustand: KBasis
  losenSeit: number | null
  ergebnis: KErgebnis | null
  rekord: { bisher: number | null; neu: boolean; text: string } | null
  lernende: Stroeme
  lehrkraft: Stroeme
  erstellt: number
  aktiv: number
  /** Beamer-Takt drosseln (höchstens 4 Sichten je Sekunde) */
  beamerZuletzt: number
  beamerOffen: boolean
  /** Gedrosselte Sichten der Lernenden stehen noch aus (der Takt reicht sie nach) */
  lernendeOffen: boolean
}

const raeume = new Map<string, Raum>()
export const klassenCodeBelegt = (c: string): boolean => raeume.has(c)
const neuerCode = (): string => sechsstelligerCode((c) => raeume.has(c) || spielCodeBelegt(c))

const RAUM_LEBT_MS = 3 * 60 * 60_000
const ENDE_LEBT_MS = 30 * 60_000

// ---------------------------------------------------------------- Kurs und Inhalt

function kurzNamenVon(nutzer: NutzerInfo[]): Map<string, string> {
  const personen = nutzer.map((n) => {
    const t = (n.name || n.benutzer).trim().split(/\s+/)
    return { vorname: t.length > 1 ? t.slice(0, -1).join(' ') : t[0] || 'Gast', nachname: t.length > 1 ? t[t.length - 1] : 'X' }
  })
  const k = kurzNamen(personen)
  const aus = new Map<string, string>()
  nutzer.forEach((n, i) => aus.set(n.id, k.length === personen.length ? k[i] : `${personen[i].vorname} ${personen[i].nachname[0]}.`))
  return aus
}

const jahrgangVon = (z: VokZeile): number | null => {
  const g = z.lerngruppe_id ? lerngruppe(z.lerngruppe_id) : null
  return g ? jahrgangDerGruppe(g) : null
}

/** Grammatik der Klasse: die mit dem Kurs verbundenen Freigaben (wie „Test planen") */
const gramEintraege = (z: VokZeile): { id: string; titel: string }[] =>
  testEintraege(z)
    .filter((e) => e.art === 'gram')
    .map((e) => ({ id: e.key.slice(GRAM_PRAEFIX.length), titel: e.titel }))
    .filter((e) => G.paket(e.id))

/**
 * Inhalt aus Auswahl bzw. allem Behandelten (Sicht der Lernenden – nichts Geplantes), Vokabeln/Grammatik nach Wahl.
 * Schwächen der Klasse: Items, die im Schnitt aller Lernenden „schwer" oder „unmöglich" sind.
 */
function inhaltBauen(z: VokZeile, e: KlassenEinstellungen, leute: NutzerInfo[], saat: number): KInhalt {
  const frei = kursFuerLernende(z)
  const woerter = json_(frei.woerter, [] as Vokabel[])
  const keys = e.quelle === 'auswahl' ? new Set(e.keys) : null
  let vokWoerter: Vokabel[] = []
  if (e.vok) {
    if (keys) {
      const ids = new Set(kursAbschnitteFuerVorrang(frei as VokZeile, { keys: [...keys] }).flatMap((a) => (a.test ? a.ids : [])))
      vokWoerter = woerter.filter((w) => ids.has(w.id))
    } else vokWoerter = woerter
  }
  const formen = e.gram ? gramEintraege(z).filter((g) => !keys || keys.has(`${GRAM_PRAEFIX}${g.id}`)) : []

  const vok = leererInhalt('vok', z.sprache)
  vok.items = vokItems(vokWoerter).map((i) => ({ ...i, id: vokKennung(i.id) }))
  const gram = leererInhalt('gram', z.sprache)
  for (const f of formen) gram.items.push(...gramItems(G.paket(f.id)?.aufgaben ?? []).map((i) => ({ ...i, id: gramKennung(f.id, i.id) })))

  // Schwächen der Klasse (aus dem Lernstand aller Lernenden des Kurses)
  const vorrang: string[] = []
  if (e.schwaechen && leute.length) {
    const vokSt = leute.map((n) => vokStand(z.id, n.id).woerter)
    for (const i of vok.items) {
      const b = bandGemeinsam(vokSt.map((s) => s[kennungAus(i.id)!.orig]))
      if (b === 'schwer' || b === 'unmoeglich') vorrang.push(i.id)
    }
    const gramSt = new Map(formen.map((f) => [f.id, leute.map((n) => G.stand(f.id, n.id).aufgaben)]))
    for (const i of gram.items) {
      const k = kennungAus(i.id)!
      const b = bandGemeinsam((gramSt.get(k.form!) ?? []).map((s) => s[k.orig]))
      if (b === 'schwer' || b === 'unmoeglich') vorrang.push(i.id)
    }
  }
  // Höchstzahlen: Schwächen und Neueste zuerst behalten, sonst gemischt
  const kuerzen = (items: typeof vok.items, n: number): typeof vok.items => {
    if (items.length <= n) return items
    const vor = new Set(vorrang)
    let s = saat
    const r = (): number => ((s = (s * 16807) % 2147483647) / 2147483647)
    return [...items]
      .map((i, k) => ({ i, w: (vor.has(i.id) ? -1 : 0) - (k / items.length) * 0.5 + r() * 0.5 }))
      .sort((a, b) => a.w - b.w)
      .slice(0, n)
      .map((x) => x.i)
  }
  vok.items = kuerzen(vok.items, ROH_HOECHSTENS.vok)
  gram.items = kuerzen(gram.items, ROH_HOECHSTENS.gram)
  return { sprache: z.sprache, vok, gram, vorrang: vorrang.filter((id) => vok.items.some((i) => i.id === id) || gram.items.some((i) => i.id === id)) }
}

/** Band je Item für eine Person (aus ihrem Kasten bzw. Grammatik-Lernstand) */
function baenderFuer(r: Raum, n: NutzerInfo): Record<string, Band | null> {
  const aus: Record<string, Band | null> = {}
  const vokSt = r.inhalt.vok.items.length ? vokStand(r.kurs, n.id).woerter : {}
  for (const i of r.inhalt.vok.items) aus[i.id] = bandEinzeln(vokSt[kennungAus(i.id)!.orig])
  const gramSt = new Map<string, Record<string, WortStand>>()
  for (const i of r.inhalt.gram.items) {
    const k = kennungAus(i.id)!
    if (!gramSt.has(k.form!)) gramSt.set(k.form!, G.stand(k.form!, n.id).aufgaben)
    aus[i.id] = bandEinzeln(gramSt.get(k.form!)![k.orig])
  }
  return aus
}

// ---------------------------------------------------------------- Rekord und Auswertung

function rekordLesen(vokId: string, spiel: string): { wert: number; text: string; zeit: number } | null {
  const z = db().prepare('SELECT daten FROM klassen_rekorde WHERE vok_id = ? AND spiel = ?').get(vokId, spiel) as { daten: string } | undefined
  return z ? json_(z.daten, null as { wert: number; text: string; zeit: number } | null) : null
}

function rekordeVon(vokId: string): Record<string, { wert: number; text: string; zeit: number }> {
  const aus: Record<string, { wert: number; text: string; zeit: number }> = {}
  for (const z of db().prepare('SELECT spiel, daten FROM klassen_rekorde WHERE vok_id = ?').all(vokId) as { spiel: string; daten: string }[]) {
    const d = json_(z.daten, null as { wert: number; text: string; zeit: number } | null)
    if (d) aus[z.spiel] = d
  }
  return aus
}

/** Auswertung des Spiels für die Lehrkraft: schwierigste Items (Klasse) und je Person (nur Lehrkraft) */
function auswertung(r: Raum) {
  const z = r.zustand
  const itemText = (id: string): string => {
    const i = [...z.inhalt.vok.items, ...z.inhalt.gram.items].find((x) => x.id === id)
    if (!i) return id
    return i.vok ? `${i.vok.term} – ${i.vok.translation}` : `${i.frage || i.zusatz || ''} → ${i.loesung}`.slice(0, 140)
  }
  const items = Object.entries(z.stat)
    .map(([id, s]) => ({ id, text: itemText(id), bereich: kennungAus(id)?.bereich ?? 'vok', richtig: s.r, falsch: s.f }))
    .filter((x) => x.falsch > 0)
    .sort((a, b) => b.falsch / (b.richtig + b.falsch) - a.falsch / (a.richtig + a.falsch) || b.falsch - a.falsch)
    .slice(0, 30)
  const personen = Object.values(z.personen)
    .map((p) => ({
      id: p.id,
      name: r.namen.get(p.id) ?? p.name,
      richtig: p.richtig,
      falsch: p.falsch,
      punkte: p.punkte,
      // Niveau als Wort (θ selbst bleibt intern)
      entwicklung: p.n < 5 ? 'zu wenige Antworten' : p.theta - p.theta0 > 0.3 ? 'gesteigert' : p.theta - p.theta0 < -0.3 ? 'fiel schwerer als erwartet' : 'stabil',
      fehler: p.fehler.slice(0, 15).map(itemText)
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
  return { items, personen }
}

/** Spiel zu Ende: Ergebnis, Rekord, Eintragen (Kasten, Achievements, Auswertung je Person) – einmal */
function beenden(r: Raum, jetzt: number): void {
  if (r.phase === 'ende') return
  const regeln = KLASSEN_REGELN[r.einst.spiel]!
  r.zustand.ende = true
  r.ergebnis = regeln.ergebnis(r.zustand)
  r.phase = 'ende'
  r.aktiv = jetzt
  const beteiligte = Object.values(r.zustand.personen).filter((p) => p.n > 0)
  // Klassenrekord nur, wenn mindestens drei mitgespielt haben
  const alt = rekordLesen(r.kurs, r.einst.spiel)
  if (beteiligte.length >= 3 && r.ergebnis.klassenwert > 0) {
    const neu = !alt || r.ergebnis.klassenwert > alt.wert
    r.rekord = { bisher: alt?.wert ?? null, neu, text: neu ? r.ergebnis.klassenwertText : alt!.text }
    if (neu)
      db()
        .prepare('INSERT INTO klassen_rekorde (vok_id, spiel, daten, geaendert) VALUES (?, ?, ?, ?) ON CONFLICT (vok_id, spiel) DO UPDATE SET daten = excluded.daten, geaendert = excluded.geaendert')
        .run(r.kurs, r.einst.spiel, JSON.stringify({ wert: r.ergebnis.klassenwert, text: r.ergebnis.klassenwertText, zeit: jetzt }), jetzt)
  } else r.rekord = alt ? { bisher: alt.wert, neu: false, text: alt.text } : null
  try {
    eintragen(r, jetzt)
  } catch (e) {
    protokolliereServer('klassenspiel', `Ergebnis nicht eingetragen: ${e instanceof Error ? e.message : String(e)}`)
  }
}

function eintragen(r: Raum, jetzt: number): void {
  const z = r.zustand
  const e = r.ergebnis!
  const info = klassenspielInfo(r.einst.spiel)!
  const heute = new Date(jetzt).toISOString().slice(0, 10)
  const kurs = vokZeile(r.kurs)
  const kursWoerter = new Set(kurs ? json_(kursFuerLernende(kurs).woerter, [] as Vokabel[]).map((w) => w.id) : [])
  const schreib = db().prepare(
    'INSERT OR REPLACE INTO klassenspiel_personen (id, vok_id, lehrkraft_id, schueler_id, spiel, daten, zeit) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  for (const p of Object.values(z.personen)) {
    const n = r.nutzer.get(p.id)
    if (!n || p.n === 0) continue
    // Fehler in den Kasten (wackelig) – Vokabeln des Kurses und Grammatik je Form
    const vokFehler = p.fehler.map(kennungAus).filter((k) => k?.bereich === 'vok' && kursWoerter.has(k.orig)).map((k) => k!.orig)
    if (kurs && (vokFehler.length || p.n)) {
      const st = vokStand(kurs.id, p.id)
      st.ansehen = [...new Set([...(st.ansehen ?? []), ...vokFehler])].slice(-30)
      for (const f of vokFehler) if (st.woerter[f]) st.woerter[f] = nachSpielfehler(st.woerter[f], jetzt)
      if (!st.tage.includes(heute)) st.tage = [...st.tage, heute].slice(-60)
      vokSpeichern(kurs.id, p.id, st)
    }
    const jeForm = new Map<string, string[]>()
    for (const k of p.fehler.map(kennungAus)) if (k?.bereich === 'gram') jeForm.set(k.form!, [...(jeForm.get(k.form!) ?? []), k.orig])
    for (const [form, fehler] of jeForm) {
      if (!G.paket(form)) continue
      const st = G.stand(form, p.id)
      st.ansehen = [...new Set([...(st.ansehen ?? []), ...fehler])].slice(-30)
      for (const f of fehler) if (st.aufgaben[f]) st.aufgaben[f] = nachSpielfehlerGrammatik(nachSpielfehler(st.aufgaben[f], jetzt))
      if (!st.tage.includes(heute)) st.tage = [...st.tage, heute].slice(-60)
      G.speichern(form, p.id, st)
    }
    // Achievements „Zusammen" (Koop: Ziel erreicht; Teams: im Siegerteam)
    const sieger = (e.siegerTeams ?? []).includes(p.team) && (e.siegerTeams ?? []).length === 1
    achievementZusammen(
      n,
      {
        spiel: `klasse-${r.einst.spiel}` as unknown as MehrspielId,
        art: info.art === 'koop' ? 'koop' : 'versus',
        teamZiel: e.sieg === true,
        gewonnen: sieger,
        comeback: false,
        fehlerfrei: p.falsch === 0 && p.richtig >= 5,
        unmoeglich: false
      },
      jetzt,
      r.sprache,
      true
    )
    const extra = KLASSEN_REGELN[r.einst.spiel]?.auszeichnung?.(z, p.id) ?? {}
    achievementKlasse(n, {
      boss: r.einst.spiel === 'boss' && e.sieg === true,
      gipfel: r.einst.spiel === 'expedition' && e.sieg === true,
      rekord: r.rekord?.neu === true && r.rekord.bisher !== null,
      tischSiege: extra.tischSiege ?? 0,
      einschaetzung: extra.einschaetzung === true
    })
    schreib.run(
      r.id,
      r.kurs,
      r.lehrkraftId,
      p.id,
      r.einst.spiel,
      JSON.stringify({ richtig: p.richtig, falsch: p.falsch, punkte: p.punkte, theta0: p.theta0, theta: p.theta, fehler: p.fehler.slice(0, 60) }),
      jetzt
    )
  }
}

// ---------------------------------------------------------------- Sichten

function lernSicht(r: Raum, wer: string, jetzt: number) {
  const z = r.zustand
  const info = klassenspielInfo(r.einst.spiel)!
  const regeln = KLASSEN_REGELN[r.einst.spiel]!
  const p = z.personen[wer]
  const team = p && p.team >= 0 ? z.teams[p.team] : null
  const t3 = r.phase === 'ende' ? top3(z) : []
  // Erst die Sicht (legt die Aufgabe an), dann ihre Nummer
  const bloecke = r.phase === 'spiel' && p ? (geraetSicht(z, regeln, wer, jetzt) as Block[]) : null
  return {
    code: r.code,
    phase: r.phase,
    titel: r.titel,
    spiel: r.einst.spiel,
    // In der Zielsprache des Kurses (02.11.2026)
    spielName: kt(r.sprache, `n_${r.einst.spiel}` as const),
    art: info.art,
    regel: kt(r.sprache, `r_${r.einst.spiel}` as const),
    sprache: r.sprache,
    jahrgang: r.jahrgang,
    dabei: Boolean(p),
    name: r.namen.get(wer) ?? '',
    // Nummer der laufenden Aufgabe – die Antwort nennt sie (doppelt getippt zählt nicht zweimal)
    ...(r.phase === 'spiel' && p?.aufgabe ? { aufgabeNr: p.aufgabe.nr } : {}),
    bis: z.bis,
    jetzt,
    pause: z.pause !== null,
    ...(r.phase === 'teams' && r.losenSeit ? { losenSeit: r.losenSeit } : {}),
    team: team ? { name: kt(r.sprache, 'team', team.name), farbe: team.farbe, symbol: team.symbol, mitglieder: team.mitglieder.map((id) => r.namen.get(id) ?? '') } : null,
    ...(bloecke ? { bloecke } : {}),
    ...(r.phase === 'ende' && r.ergebnis
      ? {
          ergebnis: {
            text: r.ergebnis.text,
            sieg: r.ergebnis.sieg ?? null,
            teams: r.ergebnis.teams ?? null,
            siegerTeams: r.ergebnis.siegerTeams ?? [],
            top3: t3.map((x) => ({ name: r.namen.get(x.id) ?? x.name, ich: x.id === wer })),
            eigen: p ? { richtig: p.richtig, falsch: p.falsch, punkte: p.punkte, gewonnen: team ? (r.ergebnis.siegerTeams ?? []).includes(p.team) : null } : null,
            // Private Rückmeldung des Spiels (Wett-Quiz: Treffsicherheit je Einsatz)
            eigenText: p ? regeln.eigenText?.(z, wer) ?? null : null,
            rekord: r.rekord?.neu ? r.rekord.text : null
          }
        }
      : {})
  }
}

function lehrSicht(r: Raum, jetzt: number) {
  const z = r.zustand
  const info = klassenspielInfo(r.einst.spiel)!
  const regeln = KLASSEN_REGELN[r.einst.spiel]!
  const online = new Set(r.lernende.verbundene(jetzt))
  const bloecke: BBlock[] =
    r.phase === 'spiel' || r.phase === 'ende'
      ? [
          ...regeln.beamer(z, jetzt),
          ...(z.ticker.length ? [{ typ: 'ticker' as const, eintraege: z.ticker.slice(-4).map(({ text, ton }) => ({ text, ton })) }] : [])
        ]
      : []
  return {
    code: r.code,
    phase: r.phase,
    titel: r.titel,
    spiel: r.einst.spiel,
    // Am Beamer in der Zielsprache (Steuerung und Auswertung der Lehrkraft bleiben Deutsch)
    spielName: kt(r.sprache, `n_${r.einst.spiel}` as const),
    spielNameDe: info.name,
    art: info.art,
    regel: kt(r.sprache, `r_${r.einst.spiel}` as const),
    sprache: r.sprache,
    einst: r.einst,
    jetzt,
    bis: z.bis,
    pause: z.pause !== null,
    level: z.level,
    inhalt: { vok: z.inhalt.vok.items.length, gram: z.inhalt.gram.items.length, schwaechen: z.inhalt.vorrang.length },
    personen: Object.values(z.personen).map((p) => ({ id: p.id, name: r.namen.get(p.id) ?? p.name, online: online.has(p.id), team: p.team, n: p.n })),
    kurs: lernendeVon(vokZeile(r.kurs)!).length,
    teams: z.teams.map((t) => ({ name: kt(r.sprache, 'team', t.name), farbe: t.farbe, symbol: t.symbol, mitglieder: t.mitglieder.map((id) => r.namen.get(id) ?? '') })),
    losenSeit: r.losenSeit,
    bloecke,
    ...(r.phase === 'ende' && r.ergebnis
      ? {
          ergebnis: {
            text: r.ergebnis.text,
            sieg: r.ergebnis.sieg ?? null,
            teams: r.ergebnis.teams ?? null,
            siegerTeams: r.ergebnis.siegerTeams ?? [],
            top3: top3(z).map((x) => ({ name: r.namen.get(x.id) ?? x.name, punkte: x.punkte })),
            rekord: r.rekord
          },
          auswertung: auswertung(r)
        }
      : {})
  }
}

function verteilen(r: Raum, jetzt = Date.now()): void {
  r.lernende.verteilen((id) => lernSicht(r, id, jetzt))
  r.beamerOffen = true
  beamerVerteilen(r, jetzt)
}

function beamerVerteilen(r: Raum, jetzt: number): void {
  if (!r.beamerOffen || jetzt - r.beamerZuletzt < 250) return
  r.beamerZuletzt = jetzt
  r.beamerOffen = false
  r.lehrkraft.verteilen(() => lehrSicht(r, jetzt))
}

function schliessen(r: Raum): void {
  r.lernende.schliessen()
  r.lehrkraft.schliessen()
  raeume.delete(r.code)
}

// ---------------------------------------------------------------- Takt

function takt(jetzt = Date.now()): void {
  for (const r of [...raeume.values()]) {
    if (jetzt - r.erstellt > RAUM_LEBT_MS || (r.phase === 'ende' && jetzt - r.aktiv > ENDE_LEBT_MS && !r.lehrkraft.anzahl)) {
      schliessen(r)
      continue
    }
    if (r.phase === 'spiel') {
      const regeln = KLASSEN_REGELN[r.einst.spiel]!
      const geaendert = kTakt(r.zustand, regeln, jetzt)
      if (r.zustand.ende) beenden(r, jetzt)
      if (geaendert || r.zustand.ende || r.lernendeOffen) {
        r.lernendeOffen = false
        verteilen(r, jetzt)
      }
    }
    if (r.phase === 'teams' && r.losenSeit && jetzt - r.losenSeit < 6000) r.beamerOffen = true
    // Beamer: ausstehende Änderungen nachreichen, Anwesenheit jede Sekunde
    r.beamerOffen = true
    beamerVerteilen(r, jetzt)
  }
}

let taktUhr: ReturnType<typeof setInterval> | null = null
let pulsUhr: ReturnType<typeof setInterval> | null = null
function uhrenStarten(): void {
  if (taktUhr) return
  taktUhr = setInterval(() => takt(), 1000)
  pulsUhr = setInterval(() => {
    for (const r of raeume.values()) r.lernende.puls(), r.lehrkraft.puls()
  }, PULS_MS)
  taktUhr.unref?.()
  pulsUhr.unref?.()
}

// ---------------------------------------------------------------- Ablauf

function raumNeu(z: VokZeile, ich: NutzerInfo, einst: KlassenEinstellungen, jetzt: number): Raum | string {
  const nutzer = lernendeVon(z).filter((n) => n.quelle !== 'vorschau')
  const saat = randomInt(1, 2 ** 31)
  const inhalt = inhaltBauen(z, einst, nutzer, saat)
  const anzahl = (einst.vok ? inhalt.vok.items.length : 0) + (einst.gram ? inhalt.gram.items.length : 0)
  if (anzahl < MINDEST_ITEMS)
    return anzahl
      ? `Zu wenig Inhalt: nur ${anzahl} Aufgaben – bitte mehr Abschnitte oder Grammatik wählen.`
      : 'In der Auswahl ist noch nichts für Lernende freigegeben.'
  const jahrgang = jahrgangVon(z)
  const zustand = kNeu({ spiel: einst.spiel, einst, jahrgang, inhalt, saat, jetzt })
  return {
    code: neuerCode(),
    id: `k${randomInt(1, 2 ** 31).toString(16)}${jetzt.toString(16)}`,
    lehrkraftId: ich.id,
    kurs: z.id,
    titel: titelFuerLernende(z),
    sprache: z.sprache,
    jahrgang,
    einst,
    phase: 'lobby',
    inhalt,
    nutzer: new Map(nutzer.map((n) => [n.id, n])),
    namen: kurzNamenVon(nutzer),
    zustand,
    losenSeit: null,
    ergebnis: null,
    rekord: null,
    lernende: new Stroeme('klasse:sicht'),
    lehrkraft: new Stroeme('klasse:beamer'),
    erstellt: jetzt,
    aktiv: jetzt,
    beamerZuletzt: 0,
    beamerOffen: true,
    lernendeOffen: false
  }
}

function starten(r: Raum, jetzt: number): string | null {
  const info = klassenspielInfo(r.einst.spiel)!
  const z = r.zustand
  const n = Object.keys(z.personen).length
  if (n < info.min) return `Für ${info.name} braucht es mindestens ${info.min} Mitspielende.`
  if (info.teams !== 'keine' && !z.teams.length) teamsLosen(z)
  z.start = jetzt
  z.bis = jetzt + r.einst.dauer * 60_000
  // „Klasse gegen den Rekord" (und die Anzeige der anderen Spiele) kennt den bisherigen Bestwert
  const rek = rekordLesen(r.kurs, r.einst.spiel)
  z.rekordBisher = rek ? { wert: rek.wert, text: rek.text } : null
  KLASSEN_REGELN[r.einst.spiel]!.start(z, jetzt)
  r.phase = 'spiel'
  r.aktiv = jetzt
  return null
}

/** Dasselbe Spiel noch einmal (gleiche Einstellungen und Leute, neue Teams) */
function nochmal(r: Raum, jetzt: number): void {
  const alt = r.zustand
  const z = kNeu({ spiel: r.einst.spiel, einst: r.einst, jahrgang: r.jahrgang, inhalt: r.inhalt, saat: randomInt(1, 2 ** 31), jetzt })
  for (const p of Object.values(alt.personen)) {
    const q = personDazu(z, p.id, p.name, alt.band[p.id] ?? {}, jetzt)
    // Was im ersten Spiel gelernt wurde, bleibt als Startwert
    q.theta = p.theta
    q.theta0 = p.theta
  }
  r.zustand = z
  r.phase = 'lobby'
  r.ergebnis = null
  r.rekord = null
  r.losenSeit = null
  r.aktiv = jetzt
}

// ---------------------------------------------------------------- Routen

export function klassenspielRoute(adresse = ''): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { url, req, res, sitzung } = k
    const lern = url.pathname.startsWith('/s/api/klassenspiel/')
    const lehr = url.pathname === '/server/klassenspiel' || url.pathname.startsWith('/server/klassenspiel/')
    if (!lern && !lehr) return false
    const jetzt = Date.now()
    const teile = url.pathname.split('/').filter(Boolean).slice(lehr ? 2 : 3)

    // Code erkennen (ohne Anmeldung – verrät nur, dass es die Runde gibt)
    if (lern && req.method === 'GET' && teile[0] === 'zugang') {
      const r = raeume.get(String(url.searchParams.get('code') ?? ''))
      if (!r || r.phase === 'ende') return json(res, 404, { fehler: 'Dieses Klassenspiel gibt es nicht (mehr).' }), true
      return json(res, 200, { code: r.code, spiel: klassenspielInfo(r.einst.spiel)?.name ?? '' }), true
    }
    if (!sitzung) return json(res, 401, { fehler: 'Nicht angemeldet.' }), true
    if (req.method === 'POST' && typeof req.headers['x-schulapps-token'] !== 'string') return json(res, 403, { fehler: 'Nur aus der App.' }), true
    const ich = sitzung.nutzer
    uhrenStarten()

    // ---------- Lernende
    if (lern) {
      if (ich.rolle !== 'schueler') return json(res, 403, { fehler: 'Für Lernende.' }), true
      if (req.method === 'GET' && teile[0] === 'offen') {
        const offen = [...raeume.values()]
          .filter((r) => r.phase !== 'ende')
          .filter((r) => {
            const z = vokZeile(r.kurs)
            return Boolean(z && vokIstFuer(z, ich))
          })
          .map((r) => ({ code: r.code, titel: r.titel, spiel: klassenspielInfo(r.einst.spiel)?.name ?? '', fach: vokZeile(r.kurs)?.fach ?? '' }))
        return json(res, 200, { klassenspiele: offen }), true
      }
      const k0 = req.method === 'POST' ? ((await k.koerper()) as Record<string, unknown>) : {}
      const code = String((req.method === 'GET' ? url.searchParams.get('code') : k0.code) ?? '')
      const r = istKlassenCode(code) ? raeume.get(code) : undefined
      if (!r) return json(res, 404, { fehler: 'Dieses Klassenspiel gibt es nicht (mehr).' }), true
      const kurs = vokZeile(r.kurs)
      if (!kurs || !vokIstFuer(kurs, ich)) return json(res, 403, { fehler: 'Dieses Klassenspiel ist für eine andere Lerngruppe.' }), true

      if (req.method === 'POST' && teile[0] === 'beitreten') {
        if (!r.nutzer.has(ich.id)) {
          r.nutzer.set(ich.id, ich)
          r.namen = kurzNamenVon([...r.nutzer.values()])
        }
        if (r.phase !== 'ende' && !r.zustand.personen[ich.id]) personDazu(r.zustand, ich.id, r.namen.get(ich.id) ?? ich.name, baenderFuer(r, ich), jetzt)
        r.lernende.abgefragt(ich.id, jetzt)
        verteilen(r, jetzt)
        return json(res, 200, { ok: true }), true
      }
      if (req.method === 'GET' && teile[0] === 'strom') {
        r.lernende.oeffnen(req, res, ich.id)
        r.lernende.schreibe(ich.id, lernSicht(r, ich.id, jetzt))
        r.beamerOffen = true
        return true
      }
      if (req.method === 'GET' && teile[0] === 'zustand') {
        r.lernende.abgefragt(ich.id, jetzt)
        return json(res, 200, { sicht: lernSicht(r, ich.id, jetzt) }), true
      }
      if (req.method === 'POST' && teile[0] === 'zug') {
        if (r.phase !== 'spiel') return json(res, 409, { fehler: 'Gerade läuft kein Spiel.' }), true
        const regeln = KLASSEN_REGELN[r.einst.spiel]!
        if (!r.zustand.personen[ich.id] || r.zustand.pause !== null) return json(res, 200, { sicht: lernSicht(r, ich.id, jetzt) }), true
        const ok = regeln.zug?.(r.zustand, ich.id, String(k0.aktion ?? '').slice(0, 30), String(k0.wert ?? '').slice(0, 30), jetzt) ?? false
        if (ok) r.beamerOffen = true
        return json(res, 200, { sicht: lernSicht(r, ich.id, jetzt) }), true
      }
      if (req.method === 'POST' && teile[0] === 'antwort') {
        if (r.phase !== 'spiel') return json(res, 409, { fehler: 'Gerade läuft kein Spiel.' }), true
        const regeln = KLASSEN_REGELN[r.einst.spiel]!
        const nr = Number(k0.nr)
        const p = r.zustand.personen[ich.id]
        // Doppelt geschickte Antwort (zweimal getippt) nicht zweimal werten
        if (p?.aufgabe && Number.isFinite(nr) && nr && p.aufgabe.nr !== nr) return json(res, 200, { sicht: lernSicht(r, ich.id, jetzt) }), true
        antworten(r.zustand, regeln, ich.id, String(k0.wert ?? '').slice(0, 300), jetzt)
        r.aktiv = jetzt
        if (r.zustand.ende) beenden(r, jetzt)
        if (r.zustand.ende) verteilen(r, jetzt)
        else {
          r.lernende.schreibe(ich.id, lernSicht(r, ich.id, jetzt))
          // Das eigene Team sofort (Team-Puzzle: neue gemeinsame Frage, Rückmeldung für alle)
          const team = p && p.team >= 0 ? r.zustand.teams[p.team]?.mitglieder ?? [] : []
          for (const id of team) if (id !== ich.id) r.lernende.schreibe(id, lernSicht(r, id, jetzt))
          // Die anderen sehen den gemeinsamen Stand (Kopf) – gedrosselt mit dem Beamer; sonst holt der Takt es nach
          r.beamerOffen = true
          if (jetzt - r.beamerZuletzt >= 250) {
            r.lernende.verteilen((id) => lernSicht(r, id, jetzt))
            r.lernendeOffen = false
            beamerVerteilen(r, jetzt)
          } else r.lernendeOffen = true
        }
        return json(res, 200, { sicht: lernSicht(r, ich.id, jetzt) }), true
      }
      return json(res, 404, { fehler: 'Unbekannt.' }), true
    }

    // ---------- Lehrkraft
    if (ich.rolle === 'schueler') return json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true
    const meinKurs = (id: string): VokZeile | null => {
      const z = vokZeile(id)
      return z && z.lehrkraft_id === ich.id ? z : null
    }
    if (req.method === 'GET' && !teile.length) {
      const z = meinKurs(String(url.searchParams.get('kurs') ?? ''))
      if (!z) return json(res, 404, { fehler: 'Unbekannter Kurs.' }), true
      const laufend = [...raeume.values()].find((r) => r.kurs === z.id && r.lehrkraftId === ich.id)
      return (
        json(res, 200, {
          titel: titelFuerLernende(z),
          sprache: z.sprache,
          // Adresse der Lernseite – für den QR-Code am Beamer
          adresse: adresse.replace(/\/$/, ''),
          spiele: KLASSENSPIELE.map((s) => ({ ...s, spielbar: spielbar(s.id) })),
          eintraege: testEintraege(z, true),
          lernende: lernendeVon(z).filter((n) => n.quelle !== 'vorschau').length,
          laufend: laufend ? { code: laufend.code, spiel: laufend.einst.spiel, phase: laufend.phase } : null,
          rekorde: rekordeVon(z.id)
        }),
        true
      )
    }
    const k0 = req.method === 'POST' ? ((await k.koerper()) as Record<string, unknown>) : {}
    if (req.method === 'POST' && teile[0] === 'neu') {
      const z = meinKurs(String(k0.kurs ?? ''))
      if (!z) return json(res, 404, { fehler: 'Unbekannter Kurs.' }), true
      const einst = einstellungenBereinigt((k0.einstellungen ?? {}) as Record<string, unknown>)
      if (!einst || !spielbar(einst.spiel)) return json(res, 400, { fehler: 'Dieses Spiel gibt es noch nicht.' }), true
      // Höchstens ein Klassenspiel je Kurs: ein altes schließen
      for (const alt of [...raeume.values()]) if (alt.kurs === z.id && alt.lehrkraftId === ich.id) schliessen(alt)
      const r = raumNeu(z, ich, einst, jetzt)
      if (typeof r === 'string') return json(res, 409, { fehler: r }), true
      raeume.set(r.code, r)
      protokolliereServer('klassenspiel', `Klassenspiel ${einst.spiel} gestartet`, ich.id)
      return json(res, 200, { code: r.code }), true
    }
    const r = istKlassenCode(String(teile[0] ?? '')) ? raeume.get(String(teile[0])) : undefined
    if (!r || r.lehrkraftId !== ich.id) return json(res, 404, { fehler: 'Dieses Klassenspiel gibt es nicht (mehr).' }), true
    if (req.method === 'GET' && teile[1] === 'strom') {
      r.lehrkraft.oeffnen(req, res, ich.id)
      r.lehrkraft.schreibe(ich.id, lehrSicht(r, jetzt))
      return true
    }
    if (req.method === 'GET' && teile[1] === 'zustand') {
      r.lehrkraft.abgefragt(ich.id, jetzt)
      return json(res, 200, { sicht: lehrSicht(r, jetzt) }), true
    }
    if (req.method === 'POST' && teile[1] === 'steuern') {
      const aktion = String(k0.aktion ?? '')
      const z = r.zustand
      switch (aktion) {
        case 'losen':
          if (r.phase === 'spiel' || r.phase === 'ende') return json(res, 409, { fehler: 'Das Spiel läuft schon.' }), true
          teamsLosen(z)
          r.phase = 'teams'
          r.losenSeit = jetzt
          break
        case 'start': {
          if (r.phase === 'spiel') break
          const f = starten(r, jetzt)
          if (f) return json(res, 409, { fehler: f }), true
          break
        }
        case 'pause':
          pausieren(z, true, jetzt)
          break
        case 'weiter':
          pausieren(z, false, jetzt)
          break
        case 'ende':
          if (r.phase === 'spiel') beenden(r, jetzt)
          break
        case 'nochmal':
          nochmal(r, jetzt)
          break
        case 'schliessen':
          if (r.phase === 'spiel') beenden(r, jetzt)
          verteilen(r, jetzt)
          schliessen(r)
          return json(res, 200, { ok: true }), true
        case 'entfernen': {
          const wer = String(k0.wer ?? '')
          const p = z.personen[wer]
          if (p) {
            delete z.personen[wer]
            for (const t of z.teams) t.mitglieder = t.mitglieder.filter((x) => x !== wer)
          }
          break
        }
        default:
          return json(res, 400, { fehler: 'Unbekannte Aktion.' }), true
      }
      r.aktiv = jetzt
      r.beamerZuletzt = 0
      verteilen(r, jetzt)
      return json(res, 200, { sicht: lehrSicht(r, jetzt) }), true
    }
    return json(res, 404, { fehler: 'Unbekannt.' }), true
  }
}

/** Für Tests */
export const _klassenIntern = { raeume, takt, inhaltBauen }
