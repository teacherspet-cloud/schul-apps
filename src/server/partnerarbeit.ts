/**
 * Partnerarbeit Sprechen am Server (24.10.2026, Plan „cryptic-gathering-jellyfish", abgestimmt mit der Lehrkraft).
 *
 * Lehrkräfte bereiten je Kurs (Vokabelkurs der Klasse, Sprache en/fr/es) eine Partnerarbeit vor: Teile, Karten aus dem
 * Pool, Gruppengröße 2 oder 3, Zuteilung per Einladungscode oder Zufall, Uhr, Ende. Sie aktivieren sofort, planen über
 * freigabePlan.ts (PlanTyp 'partner') oder beenden. Lernende sehen die Partnerarbeit nur, solange sie aktiv ist oder
 * läuft (Status, Ende, kein geplanter Beginn mehr). Zufall: Die Lehrkraft hakt die Anwesenden ab, sieht den Vorschlag
 * (shared/partnerarbeit/zuteilung.ts), tauscht oder mischt neu und startet. Code: Lernende bilden ihre Gruppen selbst.
 *
 * Datenschutz: Lernende sehen voneinander nur Bildsymbole (OpenMoji aus resources/openmoji), nie Namen; die
 * Zuteilungsregeln der Lehrkraft (Einstufung, „nicht mit", „nicht wie zuletzt") stehen nur in partner_regeln (ver-
 * schlüsselt) und gehen nie an Lernende. Rückmeldungen unter den Partnern bleiben im Speicher und werden nie gespeichert.
 * Partnerarbeiten werden 90 Tage nach dem Ende gelöscht (loeschkonzept.ts), Regeln leben mit dem Kurs (personDaten WAISEN).
 *
 * Live: Sichten je Gerät über Server-Sent Events (stroeme.ts) mit Abfrage-Rückfall; der Zustand liegt im Speicher und wird
 * bei jeder Änderung in die Datenbank geschrieben (übersteht einen Neustart; Codes und Rückmeldungen sind dann weg).
 *
 *   GET  /server/partnerarbeit?kurs=<vokId>                 Lernende, aktuelle, frühere, Regeln (+ Vorschlag), Abdeckung
 *   POST /server/partnerarbeit/anlegen {kurs, teile, karten, bisStand, gruppengroesse, modus, uhr, ende, plan?}
 *   POST /server/partnerarbeit/<id>/aktivieren · /beenden · /anwesend {ids} · /vorschlag {anwesend, strategie, nichtWieZuletzt, saat}
 *        /zuteilen {gruppen} · /gruppe {aktion, gruppe, gruppe2, schueler} · /loeschen
 *   GET  /server/partnerarbeit/<id>/strom · /zustand         Live-Sicht der Lehrkraft (Namen, Online, Gruppen)
 *   POST /server/partnerarbeit/regeln {kurs, einstufung?, nichtMit?}
 *   GET  /server/partnerarbeit/symbol/<hex> · /s/api/partnerarbeit/symbol/<hex>   SVG aus der Symbolliste
 *   GET  /s/api/partnerarbeit                                 aktive Partnerarbeiten für mich (Kacheln, Register)
 *   POST /s/api/partnerarbeit/<id>/da                         anmelden (Symbol, ggf. Code) → {sicht}
 *   GET  /s/api/partnerarbeit/<id>/strom · /zustand           eigene Sicht
 *   POST /s/api/partnerarbeit/<id>/code {code}                Partner per Code (Selbstwahl)
 *   POST /s/api/partnerarbeit/<id>/aktion {aktion, wert}      Schritt-Aktionen (ablauf.ts)
 */
import { randomBytes, randomInt } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { datenbank, protokolliereServer, type NutzerInfo } from './datenbank'
import { json, type Anfrage } from './http'
import { lerngruppe } from './onlinetest'
import { lernendeVon, vokIstFuer, zeile as vokZeile } from './vokabeln'
import { jahrgangDerGruppe } from './ueberthemen'
import { foerderDaten } from './foerdern'
import { lehrwerkAutomatisch, lehrwerkStandVon, schulOrtVon } from './grammatik'
import { LEHRWERK_GRAMMATIK, ABSCHNITT_FOLGE } from '../renderer/src/shared/lehrwerkGrammatik'
import { bandRang } from '../shared/lehrwerkBand'
import { bankKarten } from './sprechBank'
import { nachFreigabe, nochGeplant, planLoeschen } from './freigabePlan'
import { RESSOURCEN } from './pfade'
import { Stroeme, PULS_MS } from './stroeme'
import { istSechsstellig, sechsstelligerCode } from './codes'
import { kurzNamen } from '../shared/namenListe'
import { mischen } from '../shared/mehrspieler/kern'
import { fehlendeInhalte, karteFuer3, type SprechKarte, type SprechStand } from '../shared/sprechen/karten'
import { zielNiveau, type SprechSprache } from '../shared/sprechen/niveaus'
import {
  einstellungenBereinigt,
  regelnBereinigt,
  type MeinePartnerarbeit,
  type MitgliedSicht,
  type PaGruppe,
  type PaLehrkraftSicht,
  type PaRegeln,
  type PaSicht,
  type PaStatus,
  type Partnerarbeit,
  type Rolle
} from '../shared/partnerarbeit/typen'
import { istSymbol, symboleFuer, symboleVergeben, symbolTeile } from '../shared/partnerarbeit/symbole'
import {
  aufloesen,
  einstufungVorschlag,
  hinzufuegen,
  tauschen,
  warnungen,
  zusammenlegen,
  zuteilen,
  zuletztFortschreiben,
  type ZuteilungEingabe
} from '../shared/partnerarbeit/zuteilung'
import { gruppeStarten, schrittAktion, sichtSchritt, type Karten } from '../shared/partnerarbeit/ablauf'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS partner_arbeiten (
  id TEXT PRIMARY KEY,
  lehrkraft_id TEXT NOT NULL,
  vok_id TEXT NOT NULL,
  lerngruppe_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'vorbereitet',
  einstellungen TEXT NOT NULL DEFAULT '{}',
  daten TEXT NOT NULL DEFAULT '{}',
  ende INTEGER NOT NULL,
  erstellt INTEGER NOT NULL,
  geaendert INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS partner_arbeiten_kurs ON partner_arbeiten(vok_id);
CREATE TABLE IF NOT EXISTS partner_regeln (
  vok_id TEXT PRIMARY KEY,
  lehrkraft_id TEXT NOT NULL,
  daten TEXT NOT NULL,
  geaendert INTEGER NOT NULL
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

const json_ = <T>(s: unknown, leer: T): T => {
  try {
    return s ? (JSON.parse(String(s)) as T) : leer
  } catch {
    return leer
  }
}

const SPRACHEN: SprechSprache[] = ['en', 'fr', 'es']
const ID = /^p[a-f0-9]{16}$/

// ---------------------------------------------------------------- Laden und Speichern

interface Zeile {
  id: string
  lehrkraft_id: string
  vok_id: string
  lerngruppe_id: string
  status: string
  einstellungen: string
  daten: string
  ende: number
  erstellt: number
  geaendert: number
}

function ausZeile(z: Zeile): Partnerarbeit {
  const d = json_<Partial<Pick<Partnerarbeit, 'anwesend' | 'symbole' | 'gruppen' | 'aktiviert' | 'beendet'>>>(z.daten, {})
  const status: PaStatus = ['vorbereitet', 'aktiv', 'laeuft', 'beendet'].includes(z.status) ? (z.status as PaStatus) : 'vorbereitet'
  const e = einstellungenBereinigt({ ...json_(z.einstellungen, {}), ende: z.ende }, 0)
  return {
    id: z.id,
    vokId: z.vok_id,
    lehrkraftId: z.lehrkraft_id,
    lerngruppeId: z.lerngruppe_id,
    status,
    einstellungen: { ...e, ende: z.ende },
    anwesend: Array.isArray(d.anwesend) ? d.anwesend.map(String) : [],
    symbole: d.symbole && typeof d.symbole === 'object' ? d.symbole : {},
    gruppen: Array.isArray(d.gruppen) ? d.gruppen : [],
    erstellt: z.erstellt,
    ...(d.aktiviert ? { aktiviert: d.aktiviert } : {}),
    ...(d.beendet ? { beendet: d.beendet } : {})
  }
}

function speichern(pa: Partnerarbeit): void {
  const daten = {
    anwesend: pa.anwesend,
    symbole: pa.symbole,
    gruppen: pa.gruppen.map((g) => ({ ...g, benutzt: g.benutzt.slice(-200) })),
    aktiviert: pa.aktiviert,
    beendet: pa.beendet
  }
  db()
    .prepare('UPDATE partner_arbeiten SET status = ?, einstellungen = ?, daten = ?, ende = ?, geaendert = ? WHERE id = ?')
    .run(pa.status, JSON.stringify(pa.einstellungen), JSON.stringify(daten), pa.einstellungen.ende, Date.now(), pa.id)
}

const lesen = (id: string): Partnerarbeit | null => {
  const z = db().prepare('SELECT * FROM partner_arbeiten WHERE id = ?').get(id) as Zeile | undefined
  return z ? ausZeile(z) : null
}

export function regelnVon(vokId: string): PaRegeln {
  const z = db().prepare('SELECT daten FROM partner_regeln WHERE vok_id = ?').get(vokId) as { daten: string } | undefined
  return regelnBereinigt(json_(z?.daten, {}))
}

function regelnSpeichern(vokId: string, lehrkraftId: string, r: PaRegeln): void {
  db()
    .prepare(
      'INSERT INTO partner_regeln (vok_id, lehrkraft_id, daten, geaendert) VALUES (?, ?, ?, ?) ON CONFLICT (vok_id) DO UPDATE SET daten = excluded.daten, geaendert = excluded.geaendert'
    )
    .run(vokId, lehrkraftId, JSON.stringify(r), Date.now())
}

// ---------------------------------------------------------------- Live-Zustand

interface Live {
  pa: Partnerarbeit
  lernende: Stroeme
  lehrkraft: Stroeme
  /** Einladungscodes (Selbstwahl): Code → Kennung */
  codes: Map<string, string>
  /** Fehlversuche beim Code je Person: Zeitpunkte der letzten Minute */
  fehlversuche: Map<string, number[]>
  /** Rückmeldungen unter den Partnern – nur im Speicher, nie in der Datenbank */
  rueckmeldungen: Map<string, { von: string; smileys: number[]; satz: string; zeit: number }[]>
  karten: Karten | null
}

const lebend = new Map<string, Live>()

function live(id: string): Live | null {
  let l = lebend.get(id)
  if (l) return l
  const pa = lesen(id)
  if (!pa) return null
  l = {
    pa,
    lernende: new Stroeme('partner:sicht'),
    lehrkraft: new Stroeme('partner:lehrkraft'),
    codes: new Map(),
    fehlversuche: new Map(),
    rueckmeldungen: new Map(),
    karten: null
  }
  lebend.set(id, l)
  uhrenStarten()
  return l
}

function vergessen(id: string): void {
  const l = lebend.get(id)
  if (!l) return
  l.lernende.schliessen()
  l.lehrkraft.schliessen()
  lebend.delete(id)
}

// ---------------------------------------------------------------- Kurs, Karten, Namen

function kursKopf(pa: Partnerarbeit): { fach: string; sprache: SprechSprache; jahrgang: number | null } {
  const vok = vokZeile(pa.vokId)
  const sprache = (SPRACHEN.includes((vok?.sprache ?? '') as SprechSprache) ? vok!.sprache : 'en') as SprechSprache
  const g = pa.lerngruppeId ? lerngruppe(pa.lerngruppeId) : null
  return { fach: vok?.fach ?? '', sprache, jahrgang: g ? jahrgangDerGruppe(g) : null }
}

/** Karten der Partnerarbeit: Vorgabe oder der Pool des Jahrgangs, begrenzt auf den Lehrwerk-Stand */
function kartenFuer(pa: Partnerarbeit): Karten {
  const { sprache, jahrgang } = kursKopf(pa)
  const alle = bankKarten(sprache, jahrgang ?? undefined).map((b) => b.karte)
  const e = pa.einstellungen
  // „Bis Lehrwerk-Stand" rechnet die Oberfläche der Lehrkraft (sie kennt die Bandfolge) und schickt die Karten-Kennungen
  const liste = e.karten.length ? alle.filter((k) => e.karten.includes(k.id)) : alle
  const nach = new Map<string, SprechKarte>()
  for (const k of liste) nach.set(k.id, k)
  return nach
}

function kartenVon(l: Live): Karten {
  if (!l.karten) l.karten = kartenFuer(l.pa)
  return l.karten
}

/** Kurzname „Vorname N." je Kennung */
function kurzNamenVon(nutzer: NutzerInfo[]): Record<string, string> {
  const personen = nutzer.map((n) => {
    const t = n.name.trim().split(/\s+/)
    return { vorname: t.length > 1 ? t.slice(0, -1).join(' ') : t[0] || 'Gast', nachname: t.length > 1 ? t[t.length - 1] : 'X' }
  })
  const k = kurzNamen(personen)
  const aus: Record<string, string> = {}
  nutzer.forEach((n, i) => (aus[n.id] = k.length === personen.length ? k[i] : `${personen[i].vorname} ${personen[i].nachname[0]}.`))
  return aus
}

const lernendeDes = (pa: Partnerarbeit): NutzerInfo[] => {
  const vok = vokZeile(pa.vokId)
  return vok ? lernendeVon(vok).filter((n) => n.quelle !== 'vorschau') : []
}

/**
 * Vorschlag für „Bis Lehrwerk-Stand" (24.10.2026, abgestimmt): 1. höchste freigegebene Unit/Station der Vokabelkurse der
 * Lerngruppe, 2. höchste Unit, zu der freigegebene Grammatik laut Lehrwerk-Katalog gehört, 3. der von Hand gesetzte
 * Lehrwerk-Stand (Meine Klassen). Rang: Band (bandRang), Unit (Katalogfolge, sonst Nummer im Namen), Abschnitt (ABSCHNITT_FOLGE).
 */
export interface StandVorschlag {
  stand: SprechStand
  quelle: 'vokabeln' | 'grammatik' | 'hand'
}
function unitRang(buch: string, unit: string): number {
  const i = Object.keys(LEHRWERK_GRAMMATIK[buch] ?? {}).indexOf(unit)
  if (i >= 0) return i
  const n = /(\d+)/.exec(unit)
  return n ? Number(n[1]) - 1 : 999
}
const standRangVon = (s: SprechStand): number[] => [bandRang(s.band), unitRang(s.band, s.unit), s.abschnitt ? ABSCHNITT_FOLGE.indexOf(s.abschnitt) : 1000]
const spaeter = (a: SprechStand, b: SprechStand): boolean => {
  const ra = standRangVon(a)
  const rb = standRangVon(b)
  for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] > rb[i]
  return false
}
export function standVorschlag(lerngruppeId: string): StandVorschlag | null {
  if (!lerngruppeId) return null
  let auto: ReturnType<typeof lehrwerkAutomatisch> = null
  try {
    auto = lehrwerkAutomatisch(lerngruppeId)
  } catch {
    auto = null
  }
  // 1. Vokabeln: höchste freigegebene Unit (mit Abschnitt, wenn bekannt)
  let best: SprechStand | null = null
  for (const f of auto?.freigegeben ?? []) {
    const kandidaten: SprechStand[] = f.abschnitte.length
      ? f.abschnitte.map((a) => ({ band: f.buch, unit: f.unit, abschnitt: a }))
      : [{ band: f.buch, unit: f.unit }]
    for (const k of kandidaten) if (!best || spaeter(k, best)) best = k
  }
  if (best) return { stand: best, quelle: 'vokabeln' }
  // 2. Grammatik: freigegebene Themen der Lerngruppe → Unit laut Katalog des erkannten/gesetzten Bands
  const hand = lehrwerkStandVon(lerngruppeId)
  const buch = auto?.buch ?? hand?.buch
  if (buch && LEHRWERK_GRAMMATIK[buch]) {
    const themen = new Set<string>()
    try {
      for (const z of db().prepare("SELECT info FROM gram_zuweisungen WHERE lerngruppe_id = ? AND status = 'offen'").all(lerngruppeId) as { info: string }[]) {
        const i = json_<{ themen?: string[]; teilformen?: string[] }>(z.info, {})
        for (const t of [...(i.themen ?? []), ...(i.teilformen ?? [])]) themen.add(t.split('/')[0])
      }
    } catch {
      // ohne Grammatik-Tabelle
    }
    let bestG: SprechStand | null = null
    for (const [unit, stationen] of Object.entries(LEHRWERK_GRAMMATIK[buch]))
      for (const [station, punkte] of Object.entries(stationen))
        if (punkte.some((p) => p.t.some((t) => themen.has(t.split('/')[0])))) {
          const k: SprechStand = { band: buch, unit, ...(station ? { abschnitt: station } : {}) }
          if (!bestG || spaeter(k, bestG)) bestG = k
        }
    if (bestG) return { stand: bestG, quelle: 'grammatik' }
  }
  // 3. Von Hand gesetzter Stand
  if (hand) return { stand: { band: hand.buch, unit: hand.unit }, quelle: 'hand' }
  return null
}

/** Abdeckung des Pools für den Hinweis beim Vorbereiten */
function abdeckung(pa: Partnerarbeit): Record<string, { gesamt: number; fehlt: number; ohneDritte: number; ohneBild: number }> {
  const aus: Record<string, { gesamt: number; fehlt: number; ohneDritte: number; ohneBild: number }> = {}
  for (const k of kartenFuer(pa).values()) {
    const a = (aus[k.art] ??= { gesamt: 0, fehlt: 0, ohneDritte: 0, ohneBild: 0 })
    const f = fehlendeInhalte(k)
    a.gesamt++
    if (f.includes('hilfen')) a.fehlt++
    if (f.includes('bild')) a.ohneBild++
    if (k.art === 'dialog' && !karteFuer3(k)) a.ohneDritte++
  }
  return aus
}

// ---------------------------------------------------------------- Zustand fortschreiben

const mischer = (): ((l: string[]) => string[]) => {
  const z = { saat: randomInt(1, 2 ** 31) }
  return (l) => mischen(z, l)
}

function symboleSicherstellen(pa: Partnerarbeit, ids: string[]): void {
  const fehlen = ids.filter((id) => !pa.symbole[id])
  // Altersgerechte Liste je Jahrgang der Lerngruppe (24.10.2026)
  if (fehlen.length) pa.symbole = symboleVergeben(fehlen, pa.symbole, mischer(), symboleFuer(kursKopf(pa).jahrgang))
}

const gruppeVon = (pa: Partnerarbeit, id: string): PaGruppe | undefined => pa.gruppen.find((g) => g.mitglieder.includes(id))

/** Gruppen aus Kennungslisten anlegen (Zuteilung oder Umbau), laufende Schritte der unveränderten Gruppen behalten */
function gruppenSetzen(l: Live, listen: string[][], jetzt: number): void {
  const pa = l.pa
  const alt = pa.gruppen
  const neu: PaGruppe[] = []
  for (const m of listen) {
    const gleiche = alt.find((g) => g.mitglieder.length === m.length && g.mitglieder.every((x) => m.includes(x)))
    if (gleiche) neu.push(gleiche)
    else
      neu.push(
        gruppeStarten(
          { id: `g${randomBytes(4).toString('hex')}`, mitglieder: m, runde: 1, teilIndex: 0, schritt: null, benutzt: [], seit: jetzt },
          pa.einstellungen,
          kartenVon(l),
          jetzt
        )
      )
  }
  pa.gruppen = neu
  symboleSicherstellen(pa, listen.flat())
}

function statusSetzen(l: Live, status: PaStatus, jetzt: number): void {
  const pa = l.pa
  if (pa.status === status) return
  pa.status = status
  if (status === 'aktiv' || status === 'laeuft') pa.aktiviert ??= jetzt
  if (status === 'beendet') pa.beendet = jetzt
  if (status === 'laeuft' && pa.einstellungen.modus === 'zufall' && pa.gruppen.length) {
    // „nicht wie zuletzt": Partner dieser Zuteilung merken
    const r = regelnVon(pa.vokId)
    regelnSpeichern(pa.vokId, pa.lehrkraftId, { ...r, zuletzt: { ...r.zuletzt, ...zuletztFortschreiben(pa.gruppen.map((g) => g.mitglieder)) } })
  }
}

function alleVerteilen(l: Live, jetzt = Date.now()): void {
  speichern(l.pa)
  l.lernende.verteilen((id) => sichtFuer(l, id, jetzt))
  l.lehrkraft.verteilen(() => lehrkraftSicht(l, jetzt))
}

// ---------------------------------------------------------------- Sichten

function sichtFuer(l: Live, ich: string, jetzt: number): PaSicht {
  const pa = l.pa
  const { fach, sprache, jahrgang } = kursKopf(pa)
  const g = gruppeVon(pa, ich)
  const code = [...l.codes.entries()].find(([, id]) => id === ich)?.[0]
  const mitglieder = (gr: PaGruppe): MitgliedSicht[] =>
    gr.mitglieder.map((id) => ({
      symbol: pa.symbole[id] ?? '',
      ich: id === ich,
      online: l.lernende.verbunden(id, jetzt),
      ...(gr.schritt ? { rolle: gr.schritt.rollen[id] } : {}),
      ...(gr.schritt?.dran === id ? { dran: true } : {})
    }))
  const hinweis =
    pa.status === 'beendet'
      ? 'Die Partnerarbeit ist beendet.'
      : g
      ? ''
      : pa.einstellungen.modus === 'code'
      ? 'Sag deinen Code deinem Partner oder gib seinen Code ein.'
      : 'Deine Lehrkraft teilt gleich ein.'
  return {
    id: pa.id,
    status: pa.status,
    fach,
    sprache,
    jahrgang,
    modus: pa.einstellungen.modus,
    gruppengroesse: pa.einstellungen.gruppengroesse,
    uhr: pa.einstellungen.uhr,
    ende: pa.einstellungen.ende,
    jetzt,
    symbol: pa.symbole[ich] ?? '',
    ...(code && !g ? { code } : {}),
    gruppe: g
      ? {
          id: g.id,
          mitglieder: mitglieder(g),
          rolle: (g.schritt?.rollen[ich] ?? 'A') as Rolle,
          runde: g.runde,
          teil: g.schritt?.teil ?? null,
          schritt: g.schritt
            ? sichtSchritt(
                g,
                ich,
                kartenVon(l),
                { sprache, niveau: zielNiveau(sprache, jahrgang, schulOrtVon(pa.lehrkraftId).schulform), uhr: pa.einstellungen.uhr, jetzt },
                l.rueckmeldungen.get(g.id) ?? []
              )
            : null
        }
      : null,
    hinweis
  }
}

function lehrkraftSicht(l: Live, jetzt: number): PaLehrkraftSicht {
  const pa = l.pa
  const namen = kurzNamenVon(lernendeDes(pa))
  const inGruppe = new Set(pa.gruppen.flatMap((g) => g.mitglieder))
  const online = l.lernende.verbundene(jetzt)
  return { pa, online, namen, unzugeteilt: online.filter((id) => !inGruppe.has(id)), jetzt }
}

// ---------------------------------------------------------------- Takt

function takt(jetzt = Date.now()): void {
  for (const l of [...lebend.values()]) {
    const pa = l.pa
    let geaendert = false
    if (pa.status !== 'beendet' && pa.einstellungen.ende <= jetzt) {
      statusSetzen(l, 'beendet', jetzt)
      geaendert = true
    }
    // Geplanter Beginn erreicht: Warteraum öffnen (Selbstwahl läuft dann sofort)
    if (pa.status === 'vorbereitet' && pa.aktiviert === undefined && !nochGeplant('partner', pa.id, jetzt) && pa.einstellungen.ende > jetzt) {
      const geplant = db().prepare("SELECT 1 FROM freigabe_plan WHERE typ = 'partner' AND ziel_id = ?").get(pa.id)
      if (geplant) {
        statusSetzen(l, pa.einstellungen.modus === 'code' ? 'laeuft' : 'aktiv', jetzt)
        geaendert = true
      }
    }
    if (geaendert || pa.status === 'aktiv' || pa.status === 'laeuft') alleVerteilen(l, jetzt)
    // Beendete nach kurzer Zeit aus dem Speicher nehmen (die Datenbank hat alles)
    if (pa.status === 'beendet' && (pa.beendet ?? 0) < jetzt - 10 * 60_000 && !l.lernende.anzahl && !l.lehrkraft.anzahl) vergessen(pa.id)
  }
}

let taktUhr: ReturnType<typeof setInterval> | null = null
let pulsUhr: ReturnType<typeof setInterval> | null = null
function uhrenStarten(): void {
  if (taktUhr) return
  taktUhr = setInterval(() => takt(), 1000)
  pulsUhr = setInterval(() => {
    for (const l of lebend.values()) l.lernende.puls(), l.lehrkraft.puls()
  }, PULS_MS)
  taktUhr.unref?.()
  pulsUhr.unref?.()
}

// ---------------------------------------------------------------- Lernende: meine Partnerarbeiten

/** Aktive Partnerarbeiten für diese Person (Startseite, Register „Speaking") */
export function meinePartnerarbeiten(ich: NutzerInfo, jetzt = Date.now()): MeinePartnerarbeit[] {
  if (ich.rolle !== 'schueler') return []
  const zeilen = db().prepare("SELECT * FROM partner_arbeiten WHERE status IN ('aktiv', 'laeuft') AND ende > ?").all(jetzt) as unknown as Zeile[]
  return zeilen
    .map((z) => lebend.get(z.id)?.pa ?? ausZeile(z))
    .filter((pa) => {
      const vok = vokZeile(pa.vokId)
      return Boolean(vok && vokIstFuer(vok, ich)) && !nochGeplant('partner', pa.id, jetzt)
    })
    .map((pa) => {
      const { fach, sprache } = kursKopf(pa)
      return {
        id: pa.id,
        fach,
        sprache,
        status: pa.status,
        modus: pa.einstellungen.modus,
        gruppengroesse: pa.einstellungen.gruppengroesse,
        ende: pa.einstellungen.ende
      }
    })
}

function istFuer(pa: Partnerarbeit, ich: NutzerInfo, jetzt: number): boolean {
  if (ich.rolle !== 'schueler') return false
  if (pa.status === 'vorbereitet' || pa.einstellungen.ende <= jetzt || nochGeplant('partner', pa.id, jetzt)) return false
  const vok = vokZeile(pa.vokId)
  return Boolean(vok && vokIstFuer(vok, ich))
}

// ---------------------------------------------------------------- Symbole (SVG)

let svgs: Map<string, string> | null = null
/** Farbige Fassung (partner.json, scripts/prepare-openmoji.mjs), sonst die schwarze Linienzeichnung aus svgs.json */
function symbolSvg(hex: string): string | null {
  if (!istSymbol(hex)) return null
  if (!svgs) {
    svgs = new Map()
    for (const datei of ['svgs.json', 'partner.json'])
      try {
        const alle = JSON.parse(readFileSync(join(RESSOURCEN, 'openmoji', datei), 'utf8')) as Record<string, string>
        for (const [h, s] of Object.entries(alle)) if (istSymbol(h)) svgs.set(h, s)
      } catch {
        // ohne Ressourcen keine Bilder – der Browser zeigt den Namen
      }
  }
  return svgs.get(hex) ?? null
}

// ---------------------------------------------------------------- Route

export function partnerarbeitRoute(): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { url, req, res, sitzung } = k
    const lernende = url.pathname === '/s/api/partnerarbeit' || url.pathname.startsWith('/s/api/partnerarbeit/')
    const lehrer = url.pathname === '/server/partnerarbeit' || url.pathname.startsWith('/server/partnerarbeit/')
    if (!lernende && !lehrer) return false
    if (!sitzung) return json(res, 401, { fehler: 'Nicht angemeldet.' }), true
    const ich = sitzung.nutzer
    const jetzt = Date.now()
    const teile = url.pathname
      .split('/')
      .filter(Boolean)
      .slice(lehrer ? 2 : 3)

    // Symbole (angemeldet, beide Wege)
    if (req.method === 'GET' && teile[0] === 'symbol') {
      const svg = symbolSvg(symbolTeile(String(teile[1] ?? '')).hex.toUpperCase())
      if (!svg) return json(res, 404, { fehler: 'Unbekanntes Symbol.' }), true
      res.writeHead(200, {
        'content-type': 'image/svg+xml; charset=utf-8',
        'cache-control': 'private, max-age=86400',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'"
      })
      res.end(svg)
      return true
    }

    // ---------- Lernende
    if (lernende) {
      if (ich.rolle !== 'schueler') return json(res, 403, { fehler: 'Für Lernende.' }), true
      if (req.method === 'GET' && !teile.length) return json(res, 200, { partnerarbeiten: meinePartnerarbeiten(ich, jetzt) }), true
      if (req.method === 'POST' && typeof req.headers['x-schulapps-token'] !== 'string') return json(res, 403, { fehler: 'Nur aus der App.' }), true
      const id = String(teile[0] ?? '')
      const l = ID.test(id) ? live(id) : null
      if (!l || !istFuer(l.pa, ich, jetzt)) return json(res, 404, { fehler: 'Diese Partnerarbeit gibt es nicht (mehr).' }), true
      const pa = l.pa
      const aktion = teile[1] ?? ''
      if (req.method === 'GET' && aktion === 'strom') {
        l.lernende.oeffnen(req, res, ich.id)
        l.lernende.schreibe(ich.id, sichtFuer(l, ich.id, jetzt))
        return true
      }
      if (req.method === 'GET' && aktion === 'zustand') {
        l.lernende.abgefragt(ich.id, jetzt)
        return json(res, 200, { sicht: sichtFuer(l, ich.id, jetzt) }), true
      }
      if (req.method !== 'POST') return json(res, 405, { fehler: 'Nicht erlaubt.' }), true
      const k0 = (await k.koerper()) as Record<string, unknown>
      l.lernende.abgefragt(ich.id, jetzt)
      if (aktion === 'da') {
        symboleSicherstellen(pa, [ich.id])
        if (pa.einstellungen.modus === 'code' && !gruppeVon(pa, ich.id) && ![...l.codes.values()].includes(ich.id))
          l.codes.set(
            sechsstelligerCode((c) => l.codes.has(c)),
            ich.id
          )
        alleVerteilen(l, jetzt)
        return json(res, 200, { sicht: sichtFuer(l, ich.id, jetzt) }), true
      }
      if (aktion === 'code') {
        if (pa.einstellungen.modus !== 'code') return json(res, 400, { fehler: 'Hier teilt die Lehrkraft ein.' }), true
        if (gruppeVon(pa, ich.id)) return json(res, 409, { fehler: 'Du hast schon eine Gruppe.' }), true
        const versuche = (l.fehlversuche.get(ich.id) ?? []).filter((t) => jetzt - t < 60_000)
        if (versuche.length >= 5) return json(res, 429, { fehler: 'Zu viele Versuche – bitte kurz warten.' }), true
        const code = String(k0.code ?? '').trim()
        const partner = istSechsstellig(code) ? l.codes.get(code) : undefined
        if (!partner || partner === ich.id) {
          l.fehlversuche.set(ich.id, [...versuche, jetzt])
          return json(res, 404, { fehler: 'Diesen Code gibt es hier nicht.' }), true
        }
        const g = gruppeVon(pa, partner)
        if (g && g.mitglieder.length >= pa.einstellungen.gruppengroesse) return json(res, 409, { fehler: 'Diese Gruppe ist schon voll.' }), true
        const listen = pa.gruppen.map((x) => x.mitglieder)
        gruppenSetzen(l, g ? listen.map((m) => (m.includes(partner) ? [...m, ich.id] : m)) : [...listen, [partner, ich.id]], jetzt)
        // Codes der Gruppenmitglieder einziehen, wenn die Gruppe voll ist
        const neu = gruppeVon(pa, ich.id)!
        if (neu.mitglieder.length >= pa.einstellungen.gruppengroesse) for (const [c, wer] of [...l.codes]) if (neu.mitglieder.includes(wer)) l.codes.delete(c)
        alleVerteilen(l, jetzt)
        return json(res, 200, { sicht: sichtFuer(l, ich.id, jetzt) }), true
      }
      if (aktion === 'aktion') {
        const g = gruppeVon(pa, ich.id)
        if (!g || pa.status !== 'laeuft') return json(res, 409, { fehler: 'Noch keine Gruppe.' }), true
        const was = String(k0.aktion ?? '')
        if (was === 'rueckmeldung') {
          // Nur im Speicher (abgestimmt): drei Smileys und ein Satz, sichtbar für die Gruppe
          const smileys = (Array.isArray(k0.smileys) ? k0.smileys : []).map((x) => Math.max(0, Math.min(2, Math.round(Number(x) || 0)))).slice(0, 3)
          const satz = String(k0.satz ?? '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 200)
          const liste = (l.rueckmeldungen.get(g.id) ?? []).filter((r) => r.von !== ich.id || r.zeit < (g.schritt?.seit ?? 0))
          liste.push({ von: ich.id, smileys, satz, zeit: jetzt })
          l.rueckmeldungen.set(g.id, liste.slice(-12))
        } else {
          const f = schrittAktion(g, ich.id, was, k0.wert, pa.einstellungen, kartenVon(l), jetzt)
          if (f) return json(res, 400, { fehler: f }), true
        }
        alleVerteilen(l, jetzt)
        return json(res, 200, { sicht: sichtFuer(l, ich.id, jetzt) }), true
      }
      return json(res, 404, { fehler: 'Unbekannt.' }), true
    }

    // ---------- Lehrkraft
    if (ich.rolle === 'schueler') return json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true
    const meinKurs = (vokId: string) => {
      const vok = vokZeile(vokId)
      return vok && vok.lehrkraft_id === ich.id ? vok : null
    }
    if (req.method === 'GET' && !teile.length) {
      const vok = meinKurs(String(url.searchParams.get('kurs') ?? ''))
      if (!vok) return json(res, 404, { fehler: 'Unbekannter Kurs.' }), true
      if (!SPRACHEN.includes(vok.sprache as SprechSprache))
        return json(res, 400, { fehler: 'Die Partnerarbeit gibt es für Englisch, Französisch und Spanisch.' }), true
      const zeilen = db()
        .prepare('SELECT * FROM partner_arbeiten WHERE vok_id = ? AND lehrkraft_id = ? ORDER BY erstellt DESC')
        .all(vok.id, ich.id) as unknown as Zeile[]
      const alle = zeilen.map((z) => lebend.get(z.id)?.pa ?? ausZeile(z))
      const aktuelle = alle.find((p) => p.status !== 'beendet' && p.einstellungen.ende > jetzt) ?? null
      if (aktuelle) live(aktuelle.id)
      const g = vok.lerngruppe_id ? lerngruppe(vok.lerngruppe_id) : null
      const nutzer = lernendeVon(vok).filter((n) => n.quelle !== 'vorschau')
      // Vorschlag für die Einstufung aus dem Lernstand (nur Vorschlag)
      const vorschlag: Record<string, string> = {}
      if (g)
        try {
          for (const kind of foerderDaten(g, ich.id, jetzt, false)) vorschlag[kind.id] = einstufungVorschlag(kind.vokabeln, kind.grammatik)
        } catch {
          // ohne Lernstand kein Vorschlag
        }
      const online = aktuelle ? lebend.get(aktuelle.id)?.lernende.verbundene(jetzt) ?? [] : []
      const probe: Partnerarbeit = aktuelle ?? {
        id: '',
        vokId: vok.id,
        lehrkraftId: ich.id,
        lerngruppeId: vok.lerngruppe_id ?? '',
        status: 'vorbereitet',
        einstellungen: einstellungenBereinigt({}, jetzt),
        anwesend: [],
        symbole: {},
        gruppen: [],
        erstellt: jetzt
      }
      return (
        json(res, 200, {
          sprache: vok.sprache,
          jahrgang: g ? jahrgangDerGruppe(g) : null,
          schulform: schulOrtVon(ich.id).schulform ?? '',
          lernende: nutzer.map((n) => ({ id: n.id, name: n.name || n.benutzer, benutzer: n.benutzer, online: online.includes(n.id) })),
          namen: kurzNamenVon(nutzer),
          aktuelle,
          geplant: aktuelle ? nochGeplant('partner', aktuelle.id, jetzt) : false,
          fruehere: alle.filter((p) => p !== aktuelle).slice(0, 20),
          regeln: regelnVon(vok.id),
          vorschlag,
          standVorschlag: standVorschlag(vok.lerngruppe_id ?? ''),
          abdeckung: abdeckung(probe),
          karten: [...kartenFuer({ ...probe, einstellungen: { ...probe.einstellungen, karten: [], bisStand: undefined } }).values()].map((kk) => ({
            id: kk.id,
            art: kk.art,
            titel: kk.art === 'interview' ? kk.thema : kk.titel,
            stand: kk.stand
          }))
        }),
        true
      )
    }
    const id = String(teile[0] ?? '')
    if (req.method === 'GET' && ID.test(id) && (teile[1] === 'strom' || teile[1] === 'zustand')) {
      const l = live(id)
      if (!l || l.pa.lehrkraftId !== ich.id) return json(res, 404, { fehler: 'Unbekannte Partnerarbeit.' }), true
      if (teile[1] === 'strom') {
        l.lehrkraft.oeffnen(req, res, ich.id)
        l.lehrkraft.schreibe(ich.id, lehrkraftSicht(l, jetzt))
        return true
      }
      return json(res, 200, { sicht: lehrkraftSicht(l, jetzt) }), true
    }
    if (req.method !== 'POST' || typeof req.headers['x-schulapps-token'] !== 'string') return json(res, 403, { fehler: 'Nicht erlaubt.' }), true
    const k0 = (await k.koerper()) as Record<string, unknown>

    if (teile[0] === 'regeln') {
      const vok = meinKurs(String(k0.kurs ?? ''))
      if (!vok) return json(res, 404, { fehler: 'Unbekannter Kurs.' }), true
      const alt = regelnVon(vok.id)
      const neu = regelnBereinigt({
        ...alt,
        ...(k0.einstufung !== undefined ? { einstufung: k0.einstufung } : {}),
        ...(k0.nichtMit !== undefined ? { nichtMit: k0.nichtMit } : {})
      })
      regelnSpeichern(vok.id, ich.id, neu)
      return json(res, 200, { regeln: neu }), true
    }
    if (teile[0] === 'anlegen') {
      const vok = meinKurs(String(k0.kurs ?? ''))
      if (!vok) return json(res, 404, { fehler: 'Unbekannter Kurs.' }), true
      if (!SPRACHEN.includes(vok.sprache as SprechSprache))
        return json(res, 400, { fehler: 'Die Partnerarbeit gibt es für Englisch, Französisch und Spanisch.' }), true
      // Höchstens eine laufende je Kurs: ältere beenden
      for (const z of db().prepare("SELECT id FROM partner_arbeiten WHERE vok_id = ? AND status != 'beendet'").all(vok.id) as { id: string }[]) {
        const l = live(z.id)
        if (l) statusSetzen(l, 'beendet', jetzt), alleVerteilen(l, jetzt)
      }
      const e = einstellungenBereinigt(k0, jetzt)
      const pid = `p${randomBytes(8).toString('hex')}`
      db()
        .prepare(
          'INSERT INTO partner_arbeiten (id, lehrkraft_id, vok_id, lerngruppe_id, status, einstellungen, daten, ende, erstellt, geaendert) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .run(pid, ich.id, vok.id, vok.lerngruppe_id ?? '', 'vorbereitet', JSON.stringify(e), '{}', e.ende, jetzt, jetzt)
      const geplant = nachFreigabe('partner', [pid], k0, ich.id, vok.lerngruppe_id ?? '')
      const l = live(pid)!
      if (!geplant && k0.sofort !== false) {
        statusSetzen(l, e.modus === 'code' ? 'laeuft' : 'aktiv', jetzt)
        alleVerteilen(l, jetzt)
      }
      protokolliereServer(
        'partnerarbeit',
        `Partnerarbeit ${geplant ? 'geplant' : 'angelegt'} (${e.teile.join(', ')}, ${e.modus}, zu ${e.gruppengroesse})`,
        ich.id
      )
      return json(res, 200, { id: pid, geplant }), true
    }
    const l = ID.test(id) ? live(id) : null
    if (!l || l.pa.lehrkraftId !== ich.id) return json(res, 404, { fehler: 'Unbekannte Partnerarbeit.' }), true
    const pa = l.pa
    const aktion = teile[1] ?? ''
    if (aktion === 'aktivieren') {
      if (pa.status === 'beendet') return json(res, 409, { fehler: 'Schon beendet – bitte neu anlegen.' }), true
      if (pa.einstellungen.ende <= jetzt) pa.einstellungen.ende = jetzt + 45 * 60_000
      planLoeschen('partner', pa.id)
      statusSetzen(l, pa.einstellungen.modus === 'code' || pa.gruppen.length ? 'laeuft' : 'aktiv', jetzt)
      alleVerteilen(l, jetzt)
      return json(res, 200, { ok: true }), true
    }
    if (aktion === 'beenden') {
      statusSetzen(l, 'beendet', jetzt)
      alleVerteilen(l, jetzt)
      return json(res, 200, { ok: true }), true
    }
    if (aktion === 'loeschen') {
      if (pa.status !== 'vorbereitet' && pa.status !== 'beendet') return json(res, 409, { fehler: 'Bitte zuerst beenden.' }), true
      vergessen(pa.id)
      planLoeschen('partner', pa.id)
      db().prepare('DELETE FROM partner_arbeiten WHERE id = ?').run(pa.id)
      return json(res, 200, { ok: true }), true
    }
    if (aktion === 'aendern') {
      const e = einstellungenBereinigt({ ...pa.einstellungen, ...k0 }, jetzt)
      pa.einstellungen = e
      l.karten = null
      alleVerteilen(l, jetzt)
      return json(res, 200, { ok: true }), true
    }
    if (aktion === 'anwesend') {
      pa.anwesend = (Array.isArray(k0.ids) ? k0.ids : []).map(String).slice(0, 200)
      alleVerteilen(l, jetzt)
      return json(res, 200, { ok: true }), true
    }
    const eingabe = (): ZuteilungEingabe => ({
      anwesend: (Array.isArray(k0.anwesend) ? k0.anwesend : pa.anwesend).map(String),
      groesse: pa.einstellungen.gruppengroesse,
      strategie: k0.strategie === 'gemischt' || k0.strategie === 'aehnlich' ? k0.strategie : 'zufall',
      regeln: regelnVon(pa.vokId),
      nichtWieZuletzt: k0.nichtWieZuletzt !== false,
      saat: Math.round(Number(k0.saat)) || randomInt(1, 2 ** 31)
    })
    if (aktion === 'vorschlag') {
      const e = eingabe()
      const gruppen = zuteilen(e)
      return json(res, 200, { gruppen, warnungen: warnungen(gruppen, e.regeln, e.nichtWieZuletzt), saat: e.saat }), true
    }
    if (aktion === 'zuteilen') {
      const erlaubt = new Set(lernendeDes(pa).map((n) => n.id))
      const listen = (Array.isArray(k0.gruppen) ? k0.gruppen : [])
        .map((g) => (Array.isArray(g) ? g.map(String).filter((x) => erlaubt.has(x)) : []))
        .filter((g) => g.length)
      if (!listen.length) return json(res, 400, { fehler: 'Keine Gruppen.' }), true
      gruppenSetzen(l, listen, jetzt)
      planLoeschen('partner', pa.id)
      statusSetzen(l, 'laeuft', jetzt)
      alleVerteilen(l, jetzt)
      protokolliereServer('partnerarbeit', `Partnerarbeit zugeteilt (${listen.length} Gruppen)`, ich.id)
      return json(res, 200, { ok: true }), true
    }
    if (aktion === 'gruppe') {
      const regeln = regelnVon(pa.vokId)
      const listen = pa.gruppen.map((g) => g.mitglieder)
      const was = String(k0.aktion ?? '')
      const index = pa.gruppen.findIndex((g) => g.id === String(k0.gruppe ?? ''))
      const index2 = pa.gruppen.findIndex((g) => g.id === String(k0.gruppe2 ?? ''))
      const schueler = String(k0.schueler ?? '')
      let neu: string[][] | null = null
      if (was === 'aufloesen' && index >= 0) neu = aufloesen(listen, index, regeln, 3)
      else if (was === 'zusammenlegen' && index >= 0 && index2 >= 0) neu = zusammenlegen(listen, index, index2, 3)
      else if (was === 'hinzufuegen' && schueler) neu = hinzufuegen(listen, schueler, regeln, 3)
      else if (was === 'entfernen' && schueler) neu = listen.map((g) => g.filter((x) => x !== schueler)).filter((g) => g.length)
      else if (was === 'tauschen' && schueler && typeof k0.schueler2 === 'string') neu = tauschen(listen, schueler, k0.schueler2)
      else if (was === 'paaren' && Array.isArray(k0.schueler)) {
        const ids = k0.schueler.map(String).filter(Boolean)
        neu = [...listen.map((g) => g.filter((x) => !ids.includes(x))).filter((g) => g.length), ids]
      }
      if (!neu) return json(res, 400, { fehler: 'Das geht so nicht (Gruppengröße höchstens 3).' }), true
      gruppenSetzen(l, neu, jetzt)
      if (pa.status === 'aktiv' && pa.gruppen.length) statusSetzen(l, 'laeuft', jetzt)
      alleVerteilen(l, jetzt)
      return json(res, 200, { ok: true }), true
    }
    return json(res, 404, { fehler: 'Unbekannt.' }), true
  }
}

/** Nur für Tests */
export const _partnerIntern = { lebend, takt, lesen, live, kartenFuer }
