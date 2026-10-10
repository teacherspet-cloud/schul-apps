/**
 * Lernstand und Lerntipps der Schüler-Startseite (06.10.2026, abgestimmt mit der Lehrkraft;
 * Recherche recherche/schueler-startseite-lerntipps-2026-10-06.md, Abschnitt 4).
 *
 *  GET  /s/api/lernstand          Stand (je Bereich), Fleiß, Leistung, Zustand der Begrüßung, Wochenserie, genau ein Tipp
 *  POST /s/api/lernstand/gelesen  Wochenrückblick (KI-Tipp) gelesen – danach wieder die festen Tipps
 *
 * Getragen von dem, was es schon gibt: Kästen (Vokabeln, Grammatik), Arbeitsblätter, Reihen, Tests.
 * Neu ist nur ein Wochen-Schnappschuss je Person (für den Trend gegenüber früher – nie gegen andere)
 * und der wöchentliche KI-Tipp; beides verschlüsselt in `lern_wochen` (feldschutz.ts).
 *
 * KI-Tipp (Entscheidung der Lehrkraft: wöchentlich): einmal je Woche als Wochenrückblick, im Namen der
 * Lehrkraft der Lerngruppe mit ihrem KI-Zugang (Schlüssel oder Abo) – wie das Feedback zu Arbeitsblättern.
 * In den Prompt gehen nur Zahlen, Fächer und Titel der Materialien, die Person heißt „S1" (Klarnamen filtert
 * der Server zusätzlich, namensschutz.ts). Die Antwort wird geprüft (lernstand.ts: Verbotsliste, Länge);
 * fällt sie durch oder fehlt der KI-Zugang, gilt der feste Tipp aus der Regel-Liste. Dazwischen: feste Tipps.
 */
import { datenbank, nutzerNachId, protokolliereServer, type NutzerInfo } from './datenbank'
import { imNutzer } from './kontext'
import { alsNutzer, json, type Anfrage, type Aufruf } from './http'
import { gehoertZu, klasseVon, lerngruppe, onlinetestStand } from './onlinetest'
import { vokabelListenFuer, standVon as vokStandVon, zeile as vokZeile } from './vokabeln'
import { grammatikFuer } from './grammatik'
import { sprachStaende } from './sprachstand'
import type { SprachStand } from '../shared/sprachstand'
import { fachAusName } from '../shared/faecher'
import { blattIstFuer, blattKurz } from './arbeitsblaetter'
import type { WortStand } from '../shared/vokabeltrainer'
import type { StructuredRequest } from '../shared/types'
import {
  fleissAus,
  jahrgangAus,
  leistungAus,
  mitUebung,
  regelTipp,
  STIL,
  stufeVon,
  TAG_MS,
  tippPruefen,
  wocheVon,
  wochenSerie,
  zustandAus,
  type Strategie,
  type Tipp,
  type TippDaten,
  type Bereich,
  type LernstandAntwort
} from '../shared/lernstand'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS lern_wochen (
  schueler_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  woche TEXT NOT NULL,
  daten TEXT NOT NULL,
  aktualisiert INTEGER NOT NULL,
  PRIMARY KEY (schueler_id, woche)
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
/** Eine Abfrage, die fehlschlägt (Tabelle gibt es noch nicht), liefert nichts */
const sicher = <T>(fn: () => T, r: T): T => {
  try {
    return fn()
  } catch {
    return r
  }
}

/** Wochen-Schnappschuss: Summen über alle Kästen der Person */
interface Schnappschuss {
  sicher: number
  gesamt: number
  versuche: number
  falsch: number
  zeit: number
}

/** Eine Woche einer Person */
interface WochenDaten {
  schnapp?: Schnappschuss
  /** Wochenrückblick der KI (geprüft) */
  ki?: { text: string; strategie: Strategie; aktion: string; zeit: number; gelesen?: boolean }
  /** Letzter Versuch (auch gescheitert) – höchstens drei je Woche, frühestens nach einem Tag erneut */
  versuche?: number[]
  fehler?: string
  /** Vorschaukonto (vorschau.ts, Zeile „vorschau"): Beispiel-Übungstage und Treffer, auch ohne Listen der Klasse */
  vorschau?: { tage: string[]; versuche: number; falsch: number; zuletzt: number }
}

const wocheLesen = (sid: string, woche: string): WochenDaten =>
  json_((db().prepare('SELECT daten FROM lern_wochen WHERE schueler_id = ? AND woche = ?').get(sid, woche) as { daten: string } | undefined)?.daten, {})
export function wocheSchreiben(sid: string, woche: string, w: WochenDaten): void {
  db()
    .prepare(
      'INSERT INTO lern_wochen (schueler_id, woche, daten, aktualisiert) VALUES (?, ?, ?, ?) ON CONFLICT (schueler_id, woche) DO UPDATE SET daten = excluded.daten, aktualisiert = excluded.aktualisiert'
    )
    .run(sid, woche, JSON.stringify(w), Date.now())
}
/** Die jüngste frühere Woche mit Schnappschuss (für den Trend) */
function fruehereWoche(sid: string, woche: string): WochenDaten | null {
  const zeilen = db().prepare('SELECT woche, daten FROM lern_wochen WHERE schueler_id = ? AND woche < ? ORDER BY woche DESC LIMIT 4').all(sid, woche) as {
    woche: string
    daten: string
  }[]
  for (const z of zeilen) {
    const w = json_(z.daten, {} as WochenDaten)
    if (w.schnapp) return w
  }
  return null
}

/** Einstellungen der Person (Einstellungen › Lernen), gespeichert mit der Darstellung (http.ts) */
function lernWahl(sid: string): { wochenziel: number; tipps: boolean; wochenzielGesetzt: boolean } {
  const d = sicher(
    () =>
      json_(
        (db().prepare('SELECT daten FROM nutzer_darstellung WHERE nutzer_id = ?').get(sid) as { daten: string } | undefined)?.daten,
        {} as { wochenziel?: number; tipps?: boolean; wochenzielGesetzt?: boolean }
      ),
    {} as { wochenziel?: number; tipps?: boolean; wochenzielGesetzt?: boolean }
  )
  const ziel = Number(d.wochenziel)
  const wochenziel = Number.isFinite(ziel) && ziel >= 1 && ziel <= 7 ? Math.round(ziel) : 3
  // Ausdrücklich gewählt (10.10.2026) – ältere Konten ohne Merker: ein vom Standard (3) abweichender Wert zählt auch
  return { wochenziel, tipps: d.tipps !== false, wochenzielGesetzt: d.wochenzielGesetzt === true || (d.wochenziel !== undefined && wochenziel !== 3) }
}

/** Lerngruppen der Person (mit Lehrkraft) */
const gruppenVon = (ich: NutzerInfo) =>
  sicher(() => (db().prepare('SELECT id FROM lerngruppen').all() as { id: string }[]).map((g) => lerngruppe(g.id)), [] as ReturnType<typeof lerngruppe>[]).filter(
    (g): g is NonNullable<typeof g> => Boolean(g && gehoertZu(g, ich))
  )

/** Jahrgang aus der Klasse; sonst aus Gruppen- oder Lerngruppennamen; sonst neutral */
function jahrgangVon(ich: NutzerInfo): number | null {
  for (const t of [klasseVon(ich), ...ich.gruppen.map((g) => g.name), ...gruppenVon(ich).map((g) => g.name)]) {
    const j = jahrgangAus(t)
    if (j) return j
  }
  return null
}

/**
 * Heute dran: die Tagesrunde wie im Trainer (shared/vokabeltrainer `tagesRunde`, über `uebersicht.heuteOffen`).
 * Ursache des Befunds vom 10.10.2026 („88 Vokabeln sind heute dran", im Ordner „heute noch 45"): Hier stand eine eigene
 * Rechnung (alle fälligen + 10 neue, höchstens 25 je Kurs), die Startseite nahm alle fälligen ohne Grenze (auch aus
 * Abschnitten früherer Schuljahre), der Ordner die Tagesration bis Tagesziel + 25. Jetzt zählt überall dieselbe Runde –
 * bei Konten die EINE Runde je Sprache (server/sprachstand.ts).
 */
const heuteDran = (u: { faellig: number; neu: number; heuteOffen?: number }): number => u.heuteOffen ?? Math.min(25, u.faellig + Math.min(10, u.neu))
const istWackelig = (s: WortStand, jetzt: number): boolean => s.fach >= 1 && s.fach <= 2 && s.falsch > 0 && jetzt - (s.zuletzt || 0) < 14 * TAG_MS

interface Gesammelt {
  antwort: LernstandAntwort
  daten: TippDaten
  /** Für den KI-Prompt: weitere Zahlen ohne Personenbezug */
  prompt: string[]
  aktionen: Record<string, { text: string; href: string }>
}

function sammeln(ich: NutzerInfo, jetzt = Date.now(), sprachen: SprachStand[] = []): Gesammelt {
  const { wochenziel, tipps, wochenzielGesetzt } = lernWahl(ich.id)
  const jahrgang = jahrgangVon(ich)
  const stufe = stufeVon(jahrgang)
  const tage = new Set<string>()
  const tagVon = (ms: number | string | null | undefined): void => {
    const t = typeof ms === 'string' ? Date.parse(ms) : ms
    if (t && Number.isFinite(t) && t > 0) tage.add(new Date(t).toISOString().slice(0, 10))
  }
  let sicherJetzt = 0
  let gesamt = 0
  let versuche = 0
  let falsch = 0
  let faelligGesamt = 0
  // Genauigkeit ohne früheren Schnappschuss: nur zuletzt (14 Tage) geübte Einträge
  let versucheZuletzt = 0
  let falschZuletzt = 0
  const zaehle = (s: WortStand): void => {
    versuche += s.versuche || 0
    falsch += s.falsch || 0
    if (jetzt - (s.zuletzt || 0) < 14 * TAG_MS) {
      versucheZuletzt += s.versuche || 0
      falschZuletzt += s.falsch || 0
    }
  }
  const prompt: string[] = []
  const bereiche: Bereich[] = []

  // Vokabeln (offene Listen der Person) und alle Kästen für die Übungstage
  const vok = sicher(() => vokabelListenFuer(ich), [])
  const vokDaten: NonNullable<TippDaten['vokabeln']> = []
  for (const v of vok) {
    const st = sicher(() => vokStandVon(v.id, ich.id), { woerter: {}, tage: [] })
    const woerter = json_(sicher(() => vokZeile(v.id)?.woerter ?? '[]', '[]'), [] as { id: string; term: string }[])
    const wackelig = woerter.filter((w) => st.woerter[w.id] && istWackelig(st.woerter[w.id], jetzt))
    sicherJetzt += v.uebersicht.sicher
    gesamt += v.uebersicht.gesamt
    faelligGesamt += heuteDran(v.uebersicht)
    const testInTagen = v.testTermin ? Math.ceil((v.testTermin - jetzt) / TAG_MS) : null
    bereiche.push({
      art: 'vokabeln',
      titel: v.titel,
      fach: v.fach,
      href: `/s/v/${v.id}`,
      neu: v.uebersicht.neu,
      inArbeit: v.uebersicht.imAufbau,
      sicher: v.uebersicht.sicher,
      gesamt: v.uebersicht.gesamt,
      faellig: heuteDran(v.uebersicht)
    })
    vokDaten.push({ id: v.id, titel: v.titel, faellig: heuteDran(v.uebersicht), wackelig: wackelig.length, testInTagen, href: `/s/v/${v.id}` })
    prompt.push(
      `Vokabelliste „${v.titel}" (${v.fach || v.sprache}): ${v.uebersicht.sicher} von ${v.uebersicht.gesamt} sicher, ${v.uebersicht.imAufbau} im Aufbau, ${v.uebersicht.neu} noch neu, ${heuteDran(v.uebersicht)} heute dran` +
        (wackelig.length ? `, wackelig: ${wackelig.slice(0, 5).map((w) => w.term).join(', ')}` : '') +
        (testInTagen !== null && testInTagen >= 0 ? `, Vokabeltest in ${testInTagen} Tagen` : '')
    )
  }
  // Eine Runde je Sprache (10.10.2026): Tipp und Knopf nennen die Größe der heutigen Sprachrunde und öffnen sie im Ordner
  if (sprachen.length) {
    const jeSprache = sprachen.filter((s) => !s.nurKurse && (s.kurse.length || s.heute.anzahl))
    const kursSprache = new Map(vok.map((v) => [v.id, (v.sprache || '').toLowerCase()]))
    const ersetzt = jeSprache.map((s) => {
      const eigene = vokDaten.filter((v) => kursSprache.get(v.id) === s.sprache)
      const tests = eigene.map((v) => v.testInTagen).filter((t): t is number => t !== null && t >= 0)
      return {
        id: `sp:${s.sprache}`,
        titel: s.fach,
        faellig: s.heute.anzahl,
        wackelig: eigene.reduce((n, v) => n + v.wackelig, 0),
        testInTagen: tests.length ? Math.min(...tests) : null,
        href: `/s/ordner/${encodeURIComponent(s.fach)}?r=vok`
      }
    })
    const andere = vokDaten.filter((v) => !jeSprache.some((s) => s.sprache === kursSprache.get(v.id)))
    faelligGesamt += ersetzt.reduce((n, v) => n + v.faellig, 0) + andere.reduce((n, v) => n + v.faellig, 0) - vokDaten.reduce((n, v) => n + v.faellig, 0)
    for (const b of bereiche) {
      const fl = fachAusName(b.fach ?? '')?.label ?? b.fach
      const s = jeSprache.find((x) => x.fach === fl || x.sprache === b.fach)
      if (b.art === 'vokabeln' && s) Object.assign(b, { href: `/s/ordner/${encodeURIComponent(s.fach)}?r=vok`, faellig: s.heute.anzahl })
    }
    vokDaten.splice(0, vokDaten.length, ...ersetzt, ...andere)
  }
  for (const z of sicher(() => db().prepare('SELECT zuweisung_id, daten FROM vok_stand WHERE schueler_id = ?').all(ich.id) as { zuweisung_id: string; daten: string }[], [])) {
    const st = json_(z.daten, { woerter: {}, tage: [] } as { woerter: Record<string, WortStand>; tage: string[] })
    for (const t of st.tage ?? []) tage.add(t)
    // Nur Wörter, die noch im Kurs stehen – entfernte Abschnitte zählen nicht (08.10.2026)
    const aktuell = new Set(sicher(() => json_(vokZeile(z.zuweisung_id)?.woerter, [] as { id: string }[]).map((v) => v.id), [] as string[]))
    for (const [id, s] of Object.entries(st.woerter ?? {})) if (aktuell.has(id)) zaehle(s)
  }

  // Grammatik
  const gram = sicher(() => grammatikFuer(ich), [])
  const gramDaten: NonNullable<TippDaten['grammatik']> = []
  for (const g of gram) {
    sicherJetzt += g.uebersicht.sicher
    gesamt += g.uebersicht.gesamt
    faelligGesamt += heuteDran(g.uebersicht)
    bereiche.push({
      art: 'grammatik',
      titel: g.titel,
      fach: g.fach,
      href: `/s/g/${g.id}`,
      neu: g.uebersicht.neu,
      inArbeit: g.uebersicht.imAufbau,
      sicher: g.uebersicht.sicher,
      gesamt: g.uebersicht.gesamt,
      faellig: heuteDran(g.uebersicht)
    })
    gramDaten.push({ id: g.id, titel: g.titel, faellig: heuteDran(g.uebersicht), href: `/s/g/${g.id}` })
    prompt.push(`Grammatiktraining „${g.titel}" (${g.fach}): ${g.uebersicht.sicher} von ${g.uebersicht.gesamt} Aufgaben sicher, ${heuteDran(g.uebersicht)} heute dran`)
  }
  // Entfernte Grammatik (08.10.2026) zählt nicht – ihr Lernstand bleibt nur für ein erneutes Hinzufügen gespeichert
  for (const z of sicher(
    () =>
      db()
        .prepare("SELECT s.daten AS daten FROM gram_stand s JOIN gram_zuweisungen g ON g.id = s.zuweisung_id WHERE s.schueler_id = ? AND g.status != 'entfernt'")
        .all(ich.id) as { daten: string }[],
    []
  )) {
    const st = json_(z.daten, { aufgaben: {}, tage: [] } as { aufgaben: Record<string, WortStand>; tage: string[] })
    for (const t of st.tage ?? []) tage.add(t)
    for (const s of Object.values(st.aufgaben ?? {})) zaehle(s)
  }

  // Vorschaukonto (vorschau.ts): Beispiel-Übungstage und Treffer des gewählten Lernstands
  if (ich.quelle === 'vorschau') {
    const z = sicher(() => wocheLesen(ich.id, 'vorschau').vorschau, undefined)
    for (const t of z?.tage ?? []) tage.add(t)
    if (z) zaehle({ versuche: z.versuche, falsch: z.falsch, zuletzt: z.zuletzt } as WortStand)
  }

  // Arbeitsblätter: offene und der Anteil treffender Aufgaben (nur mit Feedback je Aufgabe)
  const blaetter = sicher(
    () =>
      (db().prepare("SELECT * FROM blatt_freigaben WHERE reihe = '' ORDER BY erstellt DESC").all() as unknown as Parameters<typeof blattIstFuer>[0][])
        .filter((z) => blattIstFuer(z, ich))
        .map((z) => blattKurz(z, ich)),
    []
  )
  let gruen = 0
  let aufgaben = 0
  for (const b of blaetter)
    if (b.stand && b.genutzt > 0) {
      gruen += b.stand.gruen + b.stand.gelb * 0.5
      aufgaben += b.stand.aufgaben
    }
  const offenesBlatt = blaetter.find((b) => b.offen && b.genutzt < b.runden)
  if (blaetter.length)
    bereiche.push({
      art: 'blaetter',
      titel: 'Arbeitsblätter',
      fach: '',
      href: '/s/blaetter',
      neu: blaetter.filter((b) => !b.begonnen && b.genutzt === 0).length,
      inArbeit: blaetter.filter((b) => b.begonnen && b.genutzt === 0).length,
      sicher: blaetter.filter((b) => b.genutzt > 0).length,
      gesamt: blaetter.length,
      faellig: blaetter.filter((b) => b.offen && b.genutzt < b.runden).length
    })
  if (blaetter.length)
    prompt.push(
      `Arbeitsblätter: ${blaetter.filter((b) => b.offen && b.genutzt < b.runden).length} offen, ${blaetter.filter((b) => b.genutzt > 0).length} bearbeitet` +
        (aufgaben ? `, davon ${Math.round((gruen / aufgaben) * 100)} % der Aufgaben treffend` : '')
    )
  for (const z of sicher(() => db().prepare('SELECT aktualisiert FROM blatt_abgaben WHERE schueler_id = ?').all(ich.id) as { aktualisiert: number }[], []))
    tagVon(z.aktualisiert)

  // Unterrichtsreihen: Übungstage aus dem Stand, offene Reihe für den Tipp
  for (const z of sicher(() => db().prepare('SELECT aktualisiert FROM reihen_stand WHERE schueler_id = ?').all(ich.id) as { aktualisiert: number }[], [])) tagVon(z.aktualisiert)
  for (const z of sicher(() => db().prepare('SELECT aktualisiert FROM feedback_abgaben WHERE schueler_id = ?').all(ich.id) as { aktualisiert: string }[], []))
    tagVon(z.aktualisiert)

  // Tests: nur Ergebnisse, die für die Lernenden schon sichtbar sind
  const tests = sicher(
    () =>
      db()
        .prepare(
          `SELECT t.test_id, t.abgabe, o.einstellungen, o.status, (SELECT COUNT(*) FROM teilnahmen x WHERE x.test_id = t.test_id AND x.abgabe IS NULL) AS offen
           FROM teilnahmen t JOIN onlinetests o ON o.id = t.test_id WHERE t.schueler_id = ? AND t.abgabe IS NOT NULL ORDER BY t.abgabe DESC`
        )
        .all(ich.id) as { test_id: string; abgabe: number; einstellungen: string; status: string; offen: number }[],
    []
  )
  const prozente: number[] = []
  for (const t of tests) {
    tagVon(t.abgabe)
    const frei = json_(t.einstellungen, {} as { ergebnisFrei?: boolean }).ergebnisFrei === true || (t.status !== 'wartend' && t.offen === 0)
    const p = frei ? sicher(() => onlinetestStand(t.test_id, ich.id)?.prozent, undefined) : undefined
    if (typeof p === 'number') prozente.push(p)
  }
  if (prozente.length) prompt.push(`Onlinetests: ${prozente.length} mit Ergebnis, zuletzt ${prozente.slice(0, 3).join(' %, ')} % (neueste zuerst)`)

  // Fleiß, Leistung, Zustand
  const alleTage = [...tage].sort()
  const fleiss = fleissAus(alleTage, jetzt, wochenziel)
  const woche = wocheVon(jetzt)
  const diese = sicher(() => wocheLesen(ich.id, woche), {} as WochenDaten)
  const frueher = sicher(() => fruehereWoche(ich.id, woche), null)
  const vorher = frueher?.schnapp ?? null
  const dVers = vorher ? versuche - vorher.versuche : 0
  const genauigkeit =
    vorher && dVers >= 8
      ? Math.max(0, Math.min(1, (dVers - (falsch - vorher.falsch)) / dVers))
      : versucheZuletzt >= 8
        ? (versucheZuletzt - falschZuletzt) / versucheZuletzt
        : null
  const leistung = leistungAus({
    genauigkeit,
    sicherJetzt,
    sicherVorher: vorher?.sicher ?? null,
    gesamt,
    tests: prozente,
    blattAnteil: aufgaben >= 3 ? gruen / aufgaben : null
  })
  const zustand = zustandAus(fleiss, leistung)
  const serie = wochenSerie(alleTage, jetzt, wochenziel)

  // Schnappschuss der Woche: beim ersten Besuch (vergleicht die nächste Woche damit)
  if (!diese.schnapp && ich.rolle === 'schueler') sicher(() => wocheSchreiben(ich.id, woche, { ...diese, schnapp: { sicher: sicherJetzt, gesamt, versuche, falsch, zeit: jetzt } }), undefined)

  // Reihen: Den nächsten Schritt zeigt „Als Nächstes" auf der Startseite – der Tipp bleibt bei Kasten und Blatt
  const daten: TippDaten = {
    stufe,
    fleiss,
    leistung,
    vokabeln: vokDaten,
    grammatik: gramDaten,
    blatt: offenesBlatt ? { titel: offenesBlatt.titel, href: `/s/b/${offenesBlatt.id}` } : null,
    reihe: null,
    wochenziel: wochenzielGesetzt ? wochenziel : null
  }
  const aktionen: Gesammelt['aktionen'] = {}
  const vf = vokDaten.find((v) => v.faellig > 0) ?? vokDaten[0]
  // Knopf öffnet die Runde selbst, nicht nur die Kursseite (09.10.2026)
  if (vf)
    aktionen.vokabeln = { text: vf.faellig ? `Jetzt ${Math.min(10, vf.faellig)} Vokabeln abfragen` : 'Vokabeln üben', href: vf.faellig ? mitUebung(vf.href, 'runde') : vf.href }
  const gf = gramDaten.find((g) => g.faellig > 0) ?? gramDaten[0]
  if (gf) aktionen.grammatik = { text: 'Grammatik üben', href: gf.href }
  if (daten.blatt) aktionen.arbeitsblatt = { text: 'Arbeitsblatt öffnen', href: daten.blatt.href }
  aktionen.lernraum = { text: 'Zum Lernraum', href: '/s/lernen' }
  // Schon gewählt (10.10.2026): kein „festlegen" mehr anbieten, nur ändern
  aktionen.wochenziel = { text: wochenzielGesetzt ? 'Wochenziel ändern' : 'Wochenziel festlegen', href: '/s/einstellungen#lernen' }

  const tipp = tipps ? regelTipp(daten, jetzt) : null
  return {
    antwort: {
      jahrgang,
      stufe,
      zustand,
      fleiss,
      leistung,
      serie,
      tage: alleTage.filter((t) => Date.parse(`${t}T00:00:00Z`) > jetzt - 15 * TAG_MS),
      zahlen: {
        sicher: sicherJetzt,
        gesamt,
        sicherNeu: vorher ? Math.max(0, sicherJetzt - vorher.sicher) : null,
        faellig: faelligGesamt,
        tests: tests.length,
        testsZuletzt: prozente[0] ?? null
      },
      bereiche,
      tipp,
      wochenrueckblick: false,
      tippsAn: tipps
    },
    daten,
    prompt,
    aktionen
  }
}

// ---------------------------------------------------------------- KI-Wochenrückblick

const STRATEGIEN: Strategie[] = ['abruf', 'verteilen', 'interleaving', 'selbsterklaerung', 'elaboration', 'fehleranalyse', 'planung']

/** Der Prompt (Recherche 4.2: Soll/Soll-nicht) – nur Kürzel und Zahlen */
export function lerntippAnfrage(g: Pick<Gesammelt, 'antwort' | 'prompt' | 'aktionen'>, frueherTipp?: string): StructuredRequest {
  const a = g.antwort
  const stufeText = a.jahrgang ? `Jahrgang ${a.jahrgang}` : 'Jahrgang unbekannt'
  return {
    system:
      'Du bist eine erfahrene, zugewandte Lehrkraft und schreibst einer lernenden Person (Kennung S1) einen einzigen, kurzen Lerntipp als Wochenrückblick. Du sprichst sie mit „du" an. Du stützt dich ausschließlich auf die gelieferten Daten.',
    user: [
      `LERNENDE PERSON: S1 · ${stufeText}`,
      `STIL: ${STIL[a.stufe]}`,
      `AKTIVITÄT: ${a.fleiss.tage7} Übungstage in den letzten 7 Tagen, ${a.fleiss.tage14} in den letzten 14 Tagen` +
        (a.fleiss.seitTagen !== null ? `, letzte Übung vor ${a.fleiss.seitTagen} Tagen` : ', noch keine Übung') +
        `; eigenes Wochenziel: ${a.serie.ziel} Übungstage; Lernwochen in Folge: ${a.serie.serie}`,
      `LEISTUNG (nur gegenüber früher): Stand ${a.leistung.stand}, Trend ${a.leistung.trend}` +
        (a.zahlen.sicherNeu !== null ? `; seit letzter Woche ${a.zahlen.sicherNeu} Einträge neu sicher` : '') +
        `; insgesamt ${a.zahlen.sicher} von ${a.zahlen.gesamt} sicher`,
      'DATEN:',
      ...(g.prompt.length ? g.prompt.map((p) => `- ${p}`) : ['- Bisher gibt es wenig Daten.']),
      ...(frueherTipp ? [`LETZTER TIPP (nicht wiederholen): ${frueherTipp}`] : []),
      `MÖGLICHE AKTIONEN (genau eine wählen, Feld aktion): ${Object.entries(g.aktionen)
        .map(([k, v]) => `${k} = „${v.text}"`)
        .join('; ')}`,
      'REGELN – du sollst:',
      '1. Genau einen Tipp formulieren; Strategie aus: Abruf, Verteilen, Interleaving, Selbsterklärung, Elaboration, Fehleranalyse, Planung – gestützt auf die Daten (Fehlermuster, Abstände zwischen Übungen, Themenstand).',
      '2. Lob nur für Vorgehen, Strategie oder Fortschritt gegenüber früher – und nur, wenn die Daten es stützen; dann eine konkrete Zahl oder Beobachtung nennen.',
      '3. Länge, Wortwahl und Ton nach dem Stil oben; ab Klasse 7 respektvoll, nicht kindlich und nicht belehrend; erst Beobachtung oder Stärke, dann Hinweis, dann Schritt.',
      '4. Auf das App-Angebot verweisen, das den Schritt ausführbar macht (die gewählte Aktion).',
      '5. Unsicherheit ehrlich sagen, wenn die Datenlage dünn ist („Bisher gibt es wenig Daten …").',
      'REGELN – du sollst NICHT:',
      '1. Keine Aussagen über Person oder Fähigkeit (begabt, schwach, faul, klug), keine Lerntypen.',
      '2. Keine Vergleiche mit anderen, keinem Klassendurchschnitt, keine Ränge.',
      '3. Nichts Bloßstellendes nach Misserfolg, kein „endlich", „schon wieder", „leider nur".',
      '4. Keine Drohung oder Verlustandrohung, keine Schuldzuweisung bei Pausen.',
      '5. Keine wenig wirksamen Strategien empfehlen (Markieren, bloßes Wiederlesen, Abschreiben), kein „Mehr üben!" ohne Strategie.',
      '6. Keine Zusagen über Noten oder Prüfungsergebnisse, keine gesundheitlichen oder psychologischen Diagnosen, keine erfundenen Daten, keine Namen, nicht die Kennung S1.',
      '7. Nicht länger als der Stil erlaubt; ab Klasse 7 keine Emojis, sonst höchstens eines; keine Rückfragen, keine Aufzählungszeichen, keine Formatierung.',
      '8. Bei sehr schwachen Daten und hoher Aktivität: Strategiewechsel vorschlagen und Hilfe der Lehrkraft anbieten („Zeig deiner Lehrkraft diesen Fehler"), nicht „Gib nicht auf".'
    ].join('\n'),
    schemaName: 'schueler_lerntipp',
    schema: {
      type: 'object',
      properties: {
        tipp: { type: 'string', description: 'Der Tipp, 1–3 Sätze, Anrede du' },
        strategie: { type: 'string', enum: STRATEGIEN },
        aktion: { type: 'string', enum: Object.keys(g.aktionen) }
      },
      required: ['tipp', 'strategie', 'aktion'],
      additionalProperties: false
    }
  }
}

/** Lehrkraft, in deren Namen der Tipp entsteht: die mit den meisten Materialien für die Person, sonst die einer Lerngruppe */
function lehrkraftFuer(ich: NutzerInfo): NutzerInfo | null {
  const punkte = new Map<string, number>()
  const plus = (id: string | undefined, n: number): void => void (id && punkte.set(id, (punkte.get(id) ?? 0) + n))
  for (const g of gruppenVon(ich)) plus(g.lehrkraft_id, 1)
  for (const v of sicher(() => vokabelListenFuer(ich), [])) plus(sicher(() => vokZeile(v.id)?.lehrkraft_id, undefined), 2)
  for (const g of sicher(() => grammatikFuer(ich), []))
    plus(sicher(() => (db().prepare('SELECT lehrkraft_id FROM gram_zuweisungen WHERE id = ?').get(g.id) as { lehrkraft_id: string } | undefined)?.lehrkraft_id, undefined), 2)
  const beste = [...punkte.entries()].sort((a, b) => b[1] - a[1])
  for (const [id] of beste) {
    const n = nutzerNachId(id)
    if (n && n.rolle !== 'schueler' && !n.gesperrt) return n
  }
  return null
}

const laufend = new Set<string>()

/** Wochenrückblick im Hintergrund erzeugen (einmal je Woche; nach einem Fehlschlag frühestens am nächsten Tag erneut) */
async function wochenrueckblick(ich: NutzerInfo, g: Gesammelt, aufruf: Aufruf, jetzt = Date.now()): Promise<void> {
  const woche = wocheVon(jetzt)
  if (laufend.has(ich.id)) return
  const w = wocheLesen(ich.id, woche)
  const vers = w.versuche ?? []
  if (w.ki || vers.length >= 3 || (vers.length && jetzt - Math.max(...vers) < TAG_MS)) return
  const lehrkraft = lehrkraftFuer(ich)
  if (!lehrkraft) return
  laufend.add(ich.id)
  wocheSchreiben(ich.id, woche, { ...w, versuche: [...vers, jetzt] })
  try {
    const frueher = fruehereWoche(ich.id, woche)?.ki?.text
    const anfrage = lerntippAnfrage(g, frueher)
    const roh = (await imNutzer(alsNutzer(lehrkraft), () => aufruf('ai:structured', [anfrage]))) as { tipp?: unknown; strategie?: unknown; aktion?: unknown }
    const text = String(roh?.tipp ?? '')
      .replace(/\s+/g, ' ')
      .trim()
    const aktion = String(roh?.aktion ?? '')
    const strategie = STRATEGIEN.includes(roh?.strategie as Strategie) ? (roh.strategie as Strategie) : 'planung'
    const pruefung = tippPruefen(text, g.antwort.stufe)
    const neu = wocheLesen(ich.id, woche)
    if (!pruefung.ok || !g.aktionen[aktion]) {
      wocheSchreiben(ich.id, woche, { ...neu, fehler: pruefung.ok ? 'unbekannte Aktion' : pruefung.grund })
      protokolliereServer('lernen', `Lerntipp der KI verworfen (${pruefung.ok ? 'Aktion' : pruefung.grund}) – fester Tipp gilt`, ich.id)
      return
    }
    wocheSchreiben(ich.id, woche, { ...neu, ki: { text, strategie, aktion, zeit: Date.now() }, fehler: undefined })
    protokolliereServer('lernen', 'Wochenrückblick (Lerntipp) erzeugt', ich.id)
  } catch (e) {
    const neu = sicher(() => wocheLesen(ich.id, woche), {} as WochenDaten)
    sicher(() => wocheSchreiben(ich.id, woche, { ...neu, fehler: e instanceof Error ? e.message.slice(0, 200) : 'Fehler' }), undefined)
  } finally {
    laufend.delete(ich.id)
  }
}

/** Gilt der Wochenrückblick noch? Bis gelesen, höchstens vier Tage */
function kiTippAnzeigen(ich: NutzerInfo, g: Gesammelt, jetzt = Date.now()): Tipp | null {
  const w = sicher(() => wocheLesen(ich.id, wocheVon(jetzt)), {} as WochenDaten)
  if (!w.ki || w.ki.gelesen || jetzt - w.ki.zeit > 4 * TAG_MS) return null
  const knopf = g.aktionen[w.ki.aktion] ?? null
  return { text: w.ki.text, knopf, strategie: w.ki.strategie, quelle: 'ki' }
}

export function lernstandRoute(aufruf: Aufruf): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { url, req, res, sitzung } = k
    if (url.pathname !== '/s/api/lernstand' && url.pathname !== '/s/api/lernstand/gelesen') return false
    if (!sitzung || sitzung.nutzer.quelle === 'gast') return (json(res, 401, { fehler: 'Nur mit Konto.' }), true)
    const ich = sitzung.nutzer
    if (req.method === 'GET' && url.pathname === '/s/api/lernstand') {
      // Konten: die Runde je Sprache (gleiche Zahl wie im Ordner); Fehler dort bremsen den Lernstand nicht
      const sprachen = ich.rolle === 'schueler' ? await sprachStaende(ich).catch(() => []) : []
      const g = sammeln(ich, Date.now(), sprachen)
      if (g.antwort.tippsAn) {
        const ki = kiTippAnzeigen(ich, g)
        if (ki) {
          g.antwort.tipp = ki
          g.antwort.wochenrueckblick = true
        }
        // Wochenrückblick nur, wenn es etwas zurückzublicken gibt (Übung in den letzten 14 Tagen) – sonst der feste Tipp
        const datenDa = g.antwort.fleiss.tage14 > 0
        // Vorschaukonto (Musterschüler): nur der Regel-Tipp – keine KI-Anfrage im Namen der Lehrkraft
        if (ich.rolle === 'schueler' && ich.quelle !== 'vorschau' && datenDa) void wochenrueckblick(ich, g, aufruf).catch(() => undefined)
      }
      return (json(res, 200, g.antwort), true)
    }
    if (req.method === 'POST' && url.pathname === '/s/api/lernstand/gelesen' && typeof req.headers['x-schulapps-token'] === 'string') {
      const woche = wocheVon(Date.now())
      const w = wocheLesen(ich.id, woche)
      if (w.ki) wocheSchreiben(ich.id, woche, { ...w, ki: { ...w.ki, gelesen: true } })
      return (json(res, 200, { ok: true }), true)
    }
    return (json(res, 405, { fehler: 'Nicht erlaubt.' }), true)
  }
}
