/**
 * Schuljahreswechsel am Server (10.10.2026, abgestimmt mit der Lehrkraft: „Automatisch"; Regeln in
 * shared/schuljahrWechsel.ts, Kalender in shared/schulkalender.ts).
 *
 * Wichtigstes Ziel (Klarstellung der Lehrkraft): Der LERNSTAND aus der bisherigen Klasse geht ins neue Schuljahr mit –
 * Karteikasten (vok_stand), Grammatik (gram_stand), Vokabelweg/Laufbahn, Achievements, Übungstage und Lehrwerk-Stand.
 * Deshalb wird nichts neu angelegt: Lerngruppe und Kurse behalten ihre Kennungen, nur Name und Jahrgang rücken auf.
 *
 * Ablauf (einmal je Schuljahr, am ersten Schultag laut Schulkalender; gemerkt in server_einstellungen
 * 'schuljahr-wechsel'):
 *  1. Sicherung der Datenbank (VACUUM INTO <DATEN>/sicherung-vor-schuljahreswechsel-<Datum>.db, nur die jüngste bleibt).
 *  2. Klassenliste der Verwaltung („klasse:5b" an den Schülerkonten): rückt für alle auf („klasse:6b").
 *  3. Je Lerngruppe einer Lehrkraft, deren Name mit einem Jahrgang beginnt:
 *     - ohne IServ (eigene Mitgliederliste oder Klassenliste): umbenennen „5b" → „6b"; Kurstitel mit dem Klassennamen
 *       („Englisch 5b") ebenso;
 *     - Abschlussjahrgang: kein Umbenennen, offene Kurse/Grammatik/Reihen werden beendet (Daten bleiben zum Ansehen);
 *     - IServ-Gruppe: den Namen verwaltet IServ – NICHT umbenennen. Die Gruppe wartet, bis die Nachfolgegruppe über die
 *       Mitglieder erkannt ist (gleiche Kennung mit neuem Namen oder neue Gruppe mit ≥ 60 % der Lernenden; Lernende
 *       bringen ihre IServ-Gruppen bei der Anmeldung mit). Dann zeigt die Lerngruppe auf die Nachfolgegruppe und heißt
 *       wie sie – Kurse und Lernstände bleiben an der Lerngruppe. Gesucht wird bis zu 60 Tage lang (alle 6 Stunden).
 *  4. Wechsler (andere Klasse des neuen Jahrgangs) und Wiederholer (wieder im alten Jahrgang) aus IServ-Gruppen: Ihr
 *     Lernstand zieht in den passenden Kurs ihrer neuen Klasse um (gleiche Sprache bzw. gleiches Grammatikthema), sobald
 *     es dort einen gibt – Einträge über Wort/Aufgabe zugeordnet, Übungstage vereinigt. Der alte Stand bleibt erhalten.
 *  5. Je Lehrkraft ein Hinweis in „Meine Klassen" (Zuordnung alt → neu) mit „Rückgängig" für 14 Tage: stellt Namen,
 *     IServ-Verknüpfung, Kurstitel und -status her und nimmt Übernahmen zurück. Bei Klassen aus der Klassenliste gilt
 *     das für die ganze Klasse (auch die Lerngruppen anderer Lehrkräfte mit derselben Klasse).
 *
 * Gespeichert in `schuljahr_wechsel` (Zeile je Lehrkraft und Schuljahr, Daten verschlüsselt; die Klassenliste in der
 * Zeile der Lehrkraft „*"). Das Protokoll nennt nur Zahlen. Erster Start mit Kalender: das laufende Schuljahr gilt als
 * erledigt (keine Hochstufung mitten im Jahr).
 */
import { chmodSync, existsSync, readdirSync, rmSync, statfsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  abschlussJahrgang,
  klasseHochstufen,
  klassenZusatz,
  nachfolgerFinden,
  NACHSUCHE_TAGE,
  RUECKGAENGIG_TAGE,
  standZusammenfuehren,
  titelUmbenennen,
  vergleichsSchluessel,
  zuordnungUeber
} from '@shared/schuljahrWechsel'
import { ersterSchultag, letzterSchultag, schulkalender, schuljahrText, schuljahrVon, tagPlus, tagVon } from '@shared/schulkalender'
import { schulformVon } from '@shared/schulformen'
import type { Vokabel } from '@shared/vokabeltrainer'
import type { GrammatikPaket } from '@shared/grammatiktrainer'
import { alleNutzer, datenbank, nutzerAendern, protokolliereServer, serverWert, setzeServerWert } from './datenbank'
import { json, type Anfrage } from './http'
import { lerngruppe, lerngruppenHaken, lerngruppenVon, mitgliederVon, type Lerngruppe } from './onlinetest'
import { leseSchule } from './schule'
import { kalenderHaken } from './schulkalender'
import { db as vokDb } from './vokabeln'
import { DATEN } from './pfade'
import { klassenGruppe } from './klassenliste'

export const MARKE = 'schuljahr-wechsel'
const TAG = 864e5

export interface WechselMarke {
  /** Zuletzt hochgestuftes Schuljahr (Beginn-Jahr) */
  schuljahr: number
  zeit: number
  /** Erste Einrichtung: das laufende Schuljahr galt als erledigt, nichts hochgestuft */
  eingerichtet?: boolean
  zahlen?: { lehrkraefte: number; umbenannt: number; abschluss: number; wartet: number; klassenliste: number }
}

type KursTabelle = 'vok_zuweisungen' | 'gram_zuweisungen' | 'reihen_zuweisungen'

export interface KursVorher {
  tabelle: KursTabelle
  id: string
  titel?: string
  ueberschrift?: string
  status?: string
}

export interface WechselEintrag {
  gruppeId: string
  fach: string
  alt: { name: string; iserv: string }
  neu?: { name: string; iserv: string }
  art: 'umbenannt' | 'abschluss' | 'wartet' | 'iserv' | 'unklar'
  /** IServ: Mitglieder (Kennungen) beim Wechsel */
  mitglieder?: string[]
  kurse: KursVorher[]
  wechsler?: number
  wiederholer?: number
  rueckgaengig?: boolean
}

export interface Uebernahme {
  schuelerId: string
  vonGruppe: string
  grund: 'wechsel' | 'wiederholung'
  ziel: { id: string; name: string }
  erledigt: { art: 'vok' | 'gram'; von: string; nach: string; vorher: string | null }[]
  fertig?: boolean
}

export interface WechselDaten {
  schuljahr: number
  zeit: number
  /** Rückgängig bis (ms) */
  bis: number
  eintraege: WechselEintrag[]
  uebernahmen: Uebernahme[]
  /** Nur Zeile „*": Klassenliste der Verwaltung */
  klassenliste?: { alt: { id: string; name: string }; neu: { id: string; name: string }; schueler: string[]; rueckgaengig?: boolean }[]
  status: 'aktiv' | 'rueckgaengig'
  ausgeblendet?: boolean
}

// ---------------------------------------------------------------- Ablage

let bereit = false
const db = () => {
  const d = datenbank()
  if (!bereit) {
    d.exec(`CREATE TABLE IF NOT EXISTS schuljahr_wechsel (
  lehrkraft_id TEXT NOT NULL,
  schuljahr INTEGER NOT NULL,
  zeit INTEGER NOT NULL,
  daten TEXT NOT NULL,
  PRIMARY KEY (lehrkraft_id, schuljahr)
)`)
    bereit = true
  }
  return d
}
/** Nur für Tests: Tabellen neu anlegen lassen (neue Datenbank im Speicher) */
export const schuljahrWechselZuruecksetzen = (): void => void (bereit = false)

const lies = (lehrkraftId: string, schuljahr: number): WechselDaten | null => {
  const z = db().prepare('SELECT daten FROM schuljahr_wechsel WHERE lehrkraft_id = ? AND schuljahr = ?').get(lehrkraftId, schuljahr) as { daten: string } | undefined
  try {
    return z ? (JSON.parse(z.daten) as WechselDaten) : null
  } catch {
    return null
  }
}
const schreib = (lehrkraftId: string, w: WechselDaten): void => {
  db()
    .prepare(
      'INSERT INTO schuljahr_wechsel (lehrkraft_id, schuljahr, zeit, daten) VALUES (?, ?, ?, ?) ON CONFLICT (lehrkraft_id, schuljahr) DO UPDATE SET daten = excluded.daten, zeit = excluded.zeit'
    )
    .run(lehrkraftId, w.schuljahr, w.zeit, JSON.stringify(w))
}
const alleDes = (schuljahr: number): { lehrkraftId: string; w: WechselDaten }[] =>
  (db().prepare('SELECT lehrkraft_id, daten FROM schuljahr_wechsel WHERE schuljahr = ?').all(schuljahr) as { lehrkraft_id: string; daten: string }[]).flatMap((z) => {
    try {
      return [{ lehrkraftId: z.lehrkraft_id, w: JSON.parse(z.daten) as WechselDaten }]
    } catch {
      return []
    }
  })

const tabelleDa = (t: string): boolean => Boolean(datenbank().prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t))

// ---------------------------------------------------------------- Sicherung

const SICHERUNG = /^sicherung-vor-schuljahreswechsel-.*\.db$/
/** Sicherung der Datenbank vor dem Wechsel (nur die jüngste bleibt); wirft bei Platzmangel */
export function sicherungVorWechsel(ordner = DATEN, jetzt = new Date()): string {
  const datei = join(ordner, 'schulapps.db')
  const groesse = existsSync(datei) ? statSync(datei).size : 0
  try {
    const s = statfsSync(ordner)
    if (s.bavail * s.bsize < groesse * 1.5 + 50 * 1024 * 1024) throw new Error('Zu wenig Platz für die Sicherung vor dem Schuljahreswechsel')
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Zu wenig')) throw e
  }
  const ziel = join(ordner, `sicherung-vor-schuljahreswechsel-${jetzt.toISOString().slice(0, 16).replace(/[:T]/g, '-')}.db`)
  rmSync(ziel, { force: true })
  datenbank().exec(`VACUUM INTO '${ziel.replace(/'/g, "''")}'`)
  try {
    chmodSync(ziel, 0o600)
  } catch {
    // Windows/Test
  }
  for (const f of readdirSync(ordner)) if (SICHERUNG.test(f) && join(ordner, f) !== ziel) rmSync(join(ordner, f), { force: true })
  return ziel
}

// ---------------------------------------------------------------- Abschlussjahrgang

/** Schulort der Lehrkraft (Land/Schulform aus ihren Einstellungen) – von außen gesetzt (start.ts: grammatik.ts schulOrtVon) */
let ortVon: (lehrkraftId: string) => { land?: string; schulform?: string } = () => ({})
export const setzeOrtQuelle = (f: typeof ortVon): void => void (ortVon = f)

/** Höchster Jahrgang: Schulformen der Schule, sonst die Schulform der Lehrkraft, sonst 13 */
export function abschlussFuer(lehrkraftId: string): number {
  const s = leseSchule()
  if (s?.stateId && s.schulformen.length)
    return abschlussJahrgang(s.schulformen.flatMap((id) => {
      const f = schulformVon(s.stateId, id)
      return f ? [f] : []
    }))
  try {
    const o = ortVon(lehrkraftId)
    const f = o.land && o.schulform ? schulformVon(o.land, o.schulform) : undefined
    if (f) return abschlussJahrgang([f])
  } catch {
    // ohne Einstellungen
  }
  return 13
}

// ---------------------------------------------------------------- Kurse der Lerngruppe

/** Kurse (Vokabeln, Grammatik, Reihen) einer Lerngruppe mit Titel und Status */
function kurseDerGruppe(gruppeId: string): KursVorher[] {
  const aus: KursVorher[] = []
  if (tabelleDa('vok_zuweisungen'))
    for (const z of datenbank().prepare('SELECT id, titel, ueberschrift, status FROM vok_zuweisungen WHERE lerngruppe_id = ?').all(gruppeId) as {
      id: string
      titel: string
      ueberschrift: string
      status: string
    }[])
      aus.push({ tabelle: 'vok_zuweisungen', id: z.id, titel: z.titel, ueberschrift: z.ueberschrift ?? '', status: z.status })
  if (tabelleDa('gram_zuweisungen'))
    for (const z of datenbank().prepare('SELECT id, titel, status FROM gram_zuweisungen WHERE lerngruppe_id = ?').all(gruppeId) as { id: string; titel: string; status: string }[])
      aus.push({ tabelle: 'gram_zuweisungen', id: z.id, titel: z.titel, status: z.status })
  if (tabelleDa('reihen_zuweisungen'))
    for (const z of datenbank().prepare('SELECT id, status FROM reihen_zuweisungen WHERE lerngruppe_id = ?').all(gruppeId) as { id: string; status: string }[])
      aus.push({ tabelle: 'reihen_zuweisungen', id: z.id, status: z.status })
  return aus
}

/** Kurstitel mit dem Klassennamen umbenennen; liefert die geänderten Kurse (mit altem Stand) */
function kurstitelUmbenennen(kurse: KursVorher[], alt: string, neu: string): void {
  for (const k of kurse) {
    if (k.tabelle === 'reihen_zuweisungen') continue
    const titel = k.titel !== undefined ? titelUmbenennen(k.titel, alt, neu) : undefined
    const ueberschrift = k.ueberschrift ? titelUmbenennen(k.ueberschrift, alt, neu) : k.ueberschrift
    if (titel !== k.titel) datenbank().prepare(`UPDATE ${k.tabelle} SET titel = ? WHERE id = ?`).run(titel ?? '', k.id)
    if (k.tabelle === 'vok_zuweisungen' && ueberschrift !== k.ueberschrift) datenbank().prepare('UPDATE vok_zuweisungen SET ueberschrift = ? WHERE id = ?').run(ueberschrift ?? '', k.id)
  }
}

/** Offene Kurse beenden (Abschlussjahrgang) */
function kurseBeenden(kurse: KursVorher[]): number {
  let n = 0
  for (const k of kurse)
    if (k.status === 'offen') n += Number(datenbank().prepare(`UPDATE ${k.tabelle} SET status = 'beendet' WHERE id = ? AND status = 'offen'`).run(k.id).changes)
  return n
}

function gruppeSetzen(id: string, name: string, iserv: string): void {
  datenbank().prepare('UPDATE lerngruppen SET name = ?, iserv_gruppe = ? WHERE id = ?').run(name, iserv, id)
}

/** Klassenname aus dem IServ-Gruppennamen („Klasse 6b" → „6b", wie beim Übernehmen der IServ-Gruppen) */
export const nameAusIserv = (n: string): string => n.replace(/^klasse\s+/i, '').trim()

// ---------------------------------------------------------------- Wechsel

export interface WechselErgebnis {
  art: 'ohne-kalender' | 'eingerichtet' | 'gewechselt' | 'schon' | 'zu-spaet' | 'noch-nicht'
  schuljahr?: number
  zahlen?: WechselMarke['zahlen']
  nachsuche?: { gefunden: number; uebernommen: number }
}

const istIserv = (iserv: string): boolean => Boolean(iserv) && !iserv.startsWith('klasse:') && !iserv.startsWith('vorschau:')

/**
 * Prüfen und ggf. wechseln – vom Zeitplaner (schulkalender.ts) alle 6 Stunden und beim Start. `heute` = Tag in deutscher
 * Zeit. `sichern` (Tests): Sicherung ersetzen.
 */
export function schuljahrPruefen(heute: string, o: { sichern?: () => void; jetzt?: number } = {}): WechselErgebnis {
  const k = schulkalender()
  if (!k) return { art: 'ohne-kalender' }
  const jetzt = o.jetzt ?? Date.now()
  const sj = schuljahrVon(heute, k)
  const marke = serverWert<WechselMarke | null>(MARKE, null)
  let ergebnis: WechselErgebnis
  if (!marke) {
    setzeServerWert(MARKE, { schuljahr: sj, zeit: jetzt, eingerichtet: true } satisfies WechselMarke)
    protokolliereServer('schuljahr', `Schuljahreswechsel eingerichtet: ${schuljahrText(sj)} gilt als laufend (keine Hochstufung)`)
    ergebnis = { art: 'eingerichtet', schuljahr: sj }
  } else if (marke.schuljahr >= sj) ergebnis = { art: 'schon', schuljahr: sj }
  else {
    const erster = ersterSchultag(sj, k)
    if (!erster || heute < erster) ergebnis = { art: 'noch-nicht', schuljahr: sj }
    else if (heute > tagPlus(erster, 30)) {
      // Erst Wochen später bemerkt (Server lange aus): nicht mehr automatisch – sonst stimmen Namen evtl. schon
      setzeServerWert(MARKE, { schuljahr: sj, zeit: jetzt } satisfies WechselMarke)
      protokolliereServer('schuljahr', `Schuljahreswechsel ${schuljahrText(sj)} erst nach dem ${erster} bemerkt – nicht automatisch hochgestuft`)
      ergebnis = { art: 'zu-spaet', schuljahr: sj }
    } else ergebnis = { art: 'gewechselt', schuljahr: sj, zahlen: schuljahrWechseln(sj, { jetzt, sichern: o.sichern }) }
  }
  ergebnis.nachsuche = nachsuchen(jetzt)
  return ergebnis
}

/** Der Wechsel selbst (einmal je Schuljahr; die Marke wird VOR dem Ändern gesetzt, damit nie doppelt hochgestuft wird) */
export function schuljahrWechseln(sj: number, o: { jetzt?: number; sichern?: () => void } = {}): NonNullable<WechselMarke['zahlen']> {
  const jetzt = o.jetzt ?? Date.now()
  const marke = serverWert<WechselMarke | null>(MARKE, null)
  if (marke && marke.schuljahr >= sj) return marke.zahlen ?? { lehrkraefte: 0, umbenannt: 0, abschluss: 0, wartet: 0, klassenliste: 0 }
  ;(o.sichern ?? (() => sicherungVorWechsel()))()
  setzeServerWert(MARKE, { schuljahr: sj, zeit: jetzt } satisfies WechselMarke)
  const zahlen = { lehrkraefte: 0, umbenannt: 0, abschluss: 0, wartet: 0, klassenliste: 0 }
  const bis = jetzt + RUECKGAENGIG_TAGE * TAG
  // Tabellen (samt nachgerüsteter Spalten) sicher anlegen lassen
  lerngruppe('')
  vokDb()

  // 2. Klassenliste der Verwaltung („klasse:…" an den Schülerkonten)
  const lehrkraefteIds = (datenbank().prepare('SELECT DISTINCT lehrkraft_id FROM lerngruppen').all() as { lehrkraft_id: string }[]).map((z) => z.lehrkraft_id)
  const schulAbschluss = abschlussFuer(lehrkraefteIds[0] ?? '')
  const klassen = new Map<string, { alt: { id: string; name: string }; neu: { id: string; name: string }; schueler: string[] }>()
  for (const n of alleNutzer(true)) {
    if (n.rolle !== 'schueler') continue
    const k = n.gruppen.find((g) => g.id.startsWith('klasse:'))
    if (!k) continue
    const h = klasseHochstufen(k.name, schulAbschluss)
    if (!h || h.art !== 'hoch') continue
    const neu = klassenGruppe(h.neu)
    const e = klassen.get(k.id) ?? { alt: { id: k.id, name: k.name }, neu, schueler: [] }
    e.schueler.push(n.id)
    klassen.set(k.id, e)
  }
  const konten = new Map(alleNutzer(true).map((n) => [n.id, n]))
  for (const e of klassen.values())
    for (const id of e.schueler) {
      const n = konten.get(id)
      if (n) nutzerAendern(id, { gruppen: n.gruppen.map((g) => (g.id === e.alt.id ? { ...e.neu } : g)) })
    }
  zahlen.klassenliste = klassen.size
  if (klassen.size) schreib('*', { schuljahr: sj, zeit: jetzt, bis, eintraege: [], uebernahmen: [], klassenliste: [...klassen.values()], status: 'aktiv' })

  // 3. Lerngruppen je Lehrkraft – nur, was schon im alten Schuljahr bestand: In den Sommerferien angelegte Gruppen sind
  // schon die des neuen Schuljahres (etwa die neue 5a) und bleiben, wie sie sind
  const altEnde = letzterSchultag(sj - 1)
  const neuAngelegt = (g: Lerngruppe): boolean => Boolean(altEnde && g.erstellt && tagVon(g.erstellt) > altEnde)
  for (const lk of lehrkraefteIds) {
    const abschluss = abschlussFuer(lk)
    const eintraege: WechselEintrag[] = []
    for (const g of lerngruppenVon(lk)) {
      const h = klasseHochstufen(g.name, abschluss)
      if (!h || neuAngelegt(g)) continue
      const kurse = kurseDerGruppe(g.id)
      const alt = { name: g.name, iserv: g.iserv_gruppe }
      if (h.art === 'abschluss') {
        kurseBeenden(kurse)
        eintraege.push({ gruppeId: g.id, fach: g.fach, alt, art: 'abschluss', kurse })
        zahlen.abschluss++
        continue
      }
      if (istIserv(g.iserv_gruppe)) {
        const mitglieder = mitgliederVon(g).map((n) => n.id)
        // Ohne Mitglieder gibt es nichts, dem die Gruppe folgen könnte
        if (!mitglieder.length) continue
        eintraege.push({ gruppeId: g.id, fach: g.fach, alt, art: 'wartet', mitglieder, kurse })
        zahlen.wartet++
        continue
      }
      const iserv = g.iserv_gruppe.startsWith('klasse:') ? (klassen.get(g.iserv_gruppe)?.neu.id ?? g.iserv_gruppe) : g.iserv_gruppe
      gruppeSetzen(g.id, h.neu, iserv)
      kurstitelUmbenennen(kurse, g.name, h.neu)
      eintraege.push({ gruppeId: g.id, fach: g.fach, alt, neu: { name: h.neu, iserv }, art: 'umbenannt', kurse })
      zahlen.umbenannt++
    }
    if (!eintraege.length) continue
    zahlen.lehrkraefte++
    schreib(lk, { schuljahr: sj, zeit: jetzt, bis, eintraege, uebernahmen: [], status: 'aktiv' })
    lerngruppenHaken.geaendert?.(lk)
  }
  setzeServerWert(MARKE, { schuljahr: sj, zeit: jetzt, zahlen } satisfies WechselMarke)
  protokolliereServer(
    'schuljahr',
    `Schuljahreswechsel ${schuljahrText(sj)}: ${zahlen.umbenannt} Lerngruppen hochgestuft, ${zahlen.abschluss} Abschlussgruppen beendet, ${zahlen.wartet} IServ-Gruppen warten auf ihre Nachfolgegruppe, ${zahlen.klassenliste} Klassen der Klassenliste (${zahlen.lehrkraefte} Lehrkräfte)`
  )
  return zahlen
}

// ---------------------------------------------------------------- Nachsuche: IServ-Nachfolger und Übernahmen

/** Wartende IServ-Gruppen auflösen und offene Übernahmen erledigen (alle Wechsel der letzten 60 Tage) */
export function nachsuchen(jetzt = Date.now()): { gefunden: number; uebernommen: number } {
  const marke = serverWert<WechselMarke | null>(MARKE, null)
  if (!marke || marke.eingerichtet) return { gefunden: 0, uebernommen: 0 }
  const zeilen = alleDes(marke.schuljahr).filter((z) => z.lehrkraftId !== '*' && z.w.status === 'aktiv' && jetzt - z.w.zeit <= NACHSUCHE_TAGE * TAG)
  if (!zeilen.length) return { gefunden: 0, uebernommen: 0 }
  const personen = alleNutzer().filter((n) => n.rolle === 'schueler')
  let gefunden = 0
  let uebernommen = 0
  for (const { lehrkraftId, w } of zeilen) {
    let geaendert = false
    const abschluss = abschlussFuer(lehrkraftId)
    for (const e of w.eintraege) {
      if ((e.art !== 'wartet' && e.art !== 'unklar') || e.rueckgaengig) continue
      const g = lerngruppe(e.gruppeId)
      if (!g) continue
      const f = nachfolgerFinden({ id: e.alt.iserv, name: e.alt.name, mitglieder: e.mitglieder ?? [] }, personen, abschluss)
      if (!f.gruppe || (f.art !== 'gleich' && f.art !== 'neu')) {
        if (f.art === 'unklar' && e.art !== 'unklar' && jetzt - w.zeit > (NACHSUCHE_TAGE - 1) * TAG) (e.art = 'unklar'), (geaendert = true)
        continue
      }
      const hoch = klasseHochstufen(e.alt.name, abschluss)
      const name = hoch?.art === 'hoch' && klassenZusatz(nameAusIserv(f.gruppe.name)) === klassenZusatz(e.alt.name) ? hoch.neu : nameAusIserv(f.gruppe.name)
      gruppeSetzen(g.id, name, f.gruppe.id)
      kurstitelUmbenennen(e.kurse, e.alt.name, name)
      e.neu = { name, iserv: f.gruppe.id }
      e.art = 'iserv'
      e.wechsler = f.wechsler.length
      e.wiederholer = f.wiederholer.length
      for (const p of f.wechsler) w.uebernahmen.push({ schuelerId: p.id, vonGruppe: g.id, grund: 'wechsel', ziel: p.gruppe, erledigt: [] })
      for (const p of f.wiederholer) w.uebernahmen.push({ schuelerId: p.id, vonGruppe: g.id, grund: 'wiederholung', ziel: p.gruppe, erledigt: [] })
      gefunden++
      geaendert = true
      lerngruppenHaken.geaendert?.(lehrkraftId)
      protokolliereServer(
        'schuljahr',
        `IServ-Nachfolgegruppe erkannt (${f.art === 'gleich' ? 'umbenannt' : 'neue Gruppe'}, ${Math.round(f.anteil * 100)} % der Lernenden; ${f.wechsler.length} Wechsel, ${f.wiederholer.length} Wiederholung)`,
        lehrkraftId
      )
    }
    for (const u of w.uebernahmen) {
      if (u.fertig) continue
      const n = uebernahmeVersuchen(u)
      if (n) (uebernommen += n), (geaendert = true)
      if (jetzt - w.zeit > (NACHSUCHE_TAGE - 1) * TAG) (u.fertig = true), (geaendert = true)
    }
    if (geaendert) schreib(lehrkraftId, w)
  }
  return { gefunden, uebernommen }
}

interface VokZeile {
  id: string
  sprache: string
  woerter: string
  lerngruppe_id: string
  status: string
}

const vokKurse = (gruppeId: string): VokZeile[] =>
  tabelleDa('vok_zuweisungen')
    ? (datenbank().prepare('SELECT id, sprache, woerter, lerngruppe_id, status FROM vok_zuweisungen WHERE lerngruppe_id = ?').all(gruppeId) as unknown as VokZeile[])
    : []
const gramKurse = (gruppeId: string): { id: string; thema: string; paket: string; status: string }[] =>
  tabelleDa('gram_zuweisungen')
    ? (datenbank().prepare('SELECT id, thema, paket, status FROM gram_zuweisungen WHERE lerngruppe_id = ?').all(gruppeId) as { id: string; thema: string; paket: string; status: string }[])
    : []
const standRoh = (tabelle: 'vok_stand' | 'gram_stand', kurs: string, schueler: string): string | null =>
  (datenbank().prepare(`SELECT daten FROM ${tabelle} WHERE zuweisung_id = ? AND schueler_id = ?`).get(kurs, schueler) as { daten: string } | undefined)?.daten ?? null
const standSchreiben = (tabelle: 'vok_stand' | 'gram_stand', kurs: string, schueler: string, daten: string | null): void => {
  if (daten === null) datenbank().prepare(`DELETE FROM ${tabelle} WHERE zuweisung_id = ? AND schueler_id = ?`).run(kurs, schueler)
  else
    datenbank()
      .prepare(
        `INSERT INTO ${tabelle} (zuweisung_id, schueler_id, daten, aktualisiert) VALUES (?, ?, ?, ?) ON CONFLICT (zuweisung_id, schueler_id) DO UPDATE SET daten = excluded.daten, aktualisiert = excluded.aktualisiert`
      )
      .run(kurs, schueler, daten, Date.now())
}
const json_ = <T>(s: string | null | undefined, r: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : r
  } catch {
    return r
  }
}

/** Lerngruppen (aller Lehrkräfte), die zur IServ-Gruppe gehören – außer der bisherigen */
function zielGruppen(ziel: { id: string }, ohne: string): Lerngruppe[] {
  return (datenbank().prepare('SELECT id FROM lerngruppen').all() as { id: string }[])
    .map((z) => lerngruppe(z.id))
    .filter((g): g is Lerngruppe => Boolean(g && g.id !== ohne && g.iserv_gruppe === ziel.id))
}

/** Lernstand einer Person aus den Kursen der alten Lerngruppe in die Kurse der neuen übernehmen; liefert die Zahl der Kurse */
export function uebernahmeVersuchen(u: Uebernahme): number {
  const ziele = zielGruppen(u.ziel, u.vonGruppe)
  if (!ziele.length) return 0
  let n = 0
  const schon = new Set(u.erledigt.map((x) => `${x.art}:${x.von}`))
  // Vokabeln: gleiche Sprache, offener Kurs
  for (const von of vokKurse(u.vonGruppe)) {
    if (schon.has(`vok:${von.id}`)) continue
    const altRoh = standRoh('vok_stand', von.id, u.schuelerId)
    if (!altRoh) continue
    const nach = ziele.flatMap((g) => vokKurse(g.id)).find((k) => k.status === 'offen' && k.sprache === von.sprache)
    if (!nach) continue
    const woerterAlt = json_(von.woerter, [] as Vokabel[])
    const woerterNeu = json_(nach.woerter, [] as Vokabel[])
    const zuordnung = zuordnungUeber(woerterAlt, woerterNeu, (w) => w.id, (w) => vergleichsSchluessel(w.term, w.translation))
    const alt = json_(altRoh, { woerter: {}, tage: [] } as { woerter: Record<string, never>; tage: string[] })
    const neuRoh = standRoh('vok_stand', nach.id, u.schuelerId)
    const neu = json_(neuRoh, { woerter: {}, tage: [] } as { woerter: Record<string, never>; tage: string[] } & Record<string, unknown>)
    const z = standZusammenfuehren({ eintraege: alt.woerter ?? {}, tage: alt.tage ?? [] }, { eintraege: neu.woerter ?? {}, tage: neu.tage ?? [] }, zuordnung)
    standSchreiben('vok_stand', nach.id, u.schuelerId, JSON.stringify({ ...neu, woerter: z.eintraege, tage: z.tage }))
    u.erledigt.push({ art: 'vok', von: von.id, nach: nach.id, vorher: neuRoh })
    n++
  }
  // Grammatik: gleiches Thema, offenes Training
  for (const von of gramKurse(u.vonGruppe)) {
    if (schon.has(`gram:${von.id}`)) continue
    const altRoh = standRoh('gram_stand', von.id, u.schuelerId)
    if (!altRoh || !von.thema) continue
    const nach = ziele.flatMap((g) => gramKurse(g.id)).find((k) => k.status === 'offen' && k.thema === von.thema)
    if (!nach) continue
    const schl = (a: GrammatikPaket['aufgaben'][number]): string => vergleichsSchluessel(a.art, a.satz, a.vorgabe)
    const zuordnung = zuordnungUeber(json_(von.paket, { aufgaben: [] } as unknown as GrammatikPaket).aufgaben ?? [], json_(nach.paket, { aufgaben: [] } as unknown as GrammatikPaket).aufgaben ?? [], (a) => a.id, schl)
    const alt = json_(altRoh, { aufgaben: {}, tage: [] } as { aufgaben: Record<string, never>; tage: string[] })
    const neuRoh = standRoh('gram_stand', nach.id, u.schuelerId)
    const neu = json_(neuRoh, { aufgaben: {}, tage: [] } as { aufgaben: Record<string, never>; tage: string[] } & Record<string, unknown>)
    const z = standZusammenfuehren({ eintraege: alt.aufgaben ?? {}, tage: alt.tage ?? [] }, { eintraege: neu.aufgaben ?? {}, tage: neu.tage ?? [] }, zuordnung)
    standSchreiben('gram_stand', nach.id, u.schuelerId, JSON.stringify({ ...neu, aufgaben: z.eintraege, tage: z.tage }))
    u.erledigt.push({ art: 'gram', von: von.id, nach: nach.id, vorher: neuRoh })
    n++
  }
  if (n) u.fertig = true
  return n
}

// ---------------------------------------------------------------- Rückgängig

/** Den Wechsel einer Lehrkraft zurücknehmen (14 Tage lang); Klassen der Klassenliste für die ganze Klasse */
export function rueckgaengig(lehrkraftId: string, jetzt = Date.now()): { ok: true; gruppen: number } | { fehler: string } {
  const marke = serverWert<WechselMarke | null>(MARKE, null)
  const w = marke ? lies(lehrkraftId, marke.schuljahr) : null
  if (!w || w.status !== 'aktiv') return { fehler: 'Es gibt keinen Schuljahreswechsel zum Zurücknehmen.' }
  if (jetzt > w.bis) return { fehler: `Rückgängig ging nur ${RUECKGAENGIG_TAGE} Tage lang.` }
  const klassenliste = lies('*', w.schuljahr)
  const klassenZurueck = new Set<string>()
  const zurueck = (lk: string, x: WechselDaten, nurKlasse?: string): number => {
    let n = 0
    for (const e of x.eintraege) {
      if (e.rueckgaengig) continue
      if (nurKlasse && e.alt.iserv !== nurKlasse) continue
      if (lerngruppe(e.gruppeId)) {
        if (e.neu) gruppeSetzen(e.gruppeId, e.alt.name, e.alt.iserv)
        for (const k of e.kurse) {
          if (k.tabelle !== 'reihen_zuweisungen' && k.titel !== undefined) datenbank().prepare(`UPDATE ${k.tabelle} SET titel = ? WHERE id = ?`).run(k.titel, k.id)
          if (k.tabelle === 'vok_zuweisungen' && k.ueberschrift !== undefined) datenbank().prepare('UPDATE vok_zuweisungen SET ueberschrift = ? WHERE id = ?').run(k.ueberschrift, k.id)
          if (k.status && tabelleDa(k.tabelle)) datenbank().prepare(`UPDATE ${k.tabelle} SET status = ? WHERE id = ?`).run(k.status, k.id)
        }
      }
      if (e.alt.iserv.startsWith('klasse:') && e.neu && e.neu.iserv !== e.alt.iserv) klassenZurueck.add(e.alt.iserv)
      e.rueckgaengig = true
      n++
    }
    if (!nurKlasse) {
      for (const u of x.uebernahmen) for (const r of u.erledigt.reverse()) standSchreiben(r.art === 'vok' ? 'vok_stand' : 'gram_stand', r.nach, u.schuelerId, r.vorher)
      x.uebernahmen = x.uebernahmen.map((u) => ({ ...u, erledigt: [], fertig: true }))
      x.status = 'rueckgaengig'
    }
    schreib(lk, x)
    lerngruppenHaken.geaendert?.(lk)
    return n
  }
  const gruppen = zurueck(lehrkraftId, w)
  // Klassen der Klassenliste: Schülerkonten zurück, andere Lehrkräfte mit derselben Klasse ebenso
  if (klassenliste?.klassenliste)
    for (const kl of klassenliste.klassenliste) {
      if (kl.rueckgaengig || !klassenZurueck.has(kl.alt.id)) continue
      const konten = new Map(alleNutzer(true).map((n) => [n.id, n]))
      for (const id of kl.schueler) {
        const n = konten.get(id)
        if (n && n.gruppen.some((g) => g.id === kl.neu.id)) nutzerAendern(id, { gruppen: n.gruppen.map((g) => (g.id === kl.neu.id ? { ...kl.alt } : g)) })
      }
      kl.rueckgaengig = true
      for (const z of alleDes(w.schuljahr)) if (z.lehrkraftId !== '*' && z.lehrkraftId !== lehrkraftId) zurueck(z.lehrkraftId, z.w, kl.alt.id)
    }
  if (klassenliste) schreib('*', klassenliste)
  protokolliereServer('schuljahr', `Schuljahreswechsel ${schuljahrText(w.schuljahr)} von einer Lehrkraft zurückgenommen (${gruppen} Lerngruppen)`, lehrkraftId)
  return { ok: true, gruppen }
}

// ---------------------------------------------------------------- Hinweis für „Meine Klassen"

export interface WechselHinweis {
  schuljahr: string
  zeit: number
  bis: number
  status: WechselDaten['status']
  rueckgaengigMoeglich: boolean
  eintraege: { alt: string; neu: string | null; fach: string; art: WechselEintrag['art']; wechsler: number; wiederholer: number; rueckgaengig: boolean }[]
  uebernommen: number
}

export function hinweisFuer(lehrkraftId: string, jetzt = Date.now()): WechselHinweis | null {
  const marke = serverWert<WechselMarke | null>(MARKE, null)
  const w = marke ? lies(lehrkraftId, marke.schuljahr) : null
  if (!w || w.ausgeblendet) return null
  // Nach der Nachsuche-Zeit verschwindet der Hinweis von selbst
  if (jetzt - w.zeit > NACHSUCHE_TAGE * TAG) return null
  return {
    schuljahr: schuljahrText(w.schuljahr),
    zeit: w.zeit,
    bis: w.bis,
    status: w.status,
    rueckgaengigMoeglich: w.status === 'aktiv' && jetzt <= w.bis,
    eintraege: w.eintraege.map((e) => ({
      alt: e.alt.name,
      neu: e.neu?.name ?? null,
      fach: e.fach,
      art: e.art,
      wechsler: e.wechsler ?? 0,
      wiederholer: e.wiederholer ?? 0,
      rueckgaengig: Boolean(e.rueckgaengig)
    })),
    uebernommen: w.uebernahmen.reduce((a, u) => a + u.erledigt.length, 0)
  }
}

export function hinweisAusblenden(lehrkraftId: string): boolean {
  const marke = serverWert<WechselMarke | null>(MARKE, null)
  const w = marke ? lies(lehrkraftId, marke.schuljahr) : null
  if (!w) return false
  w.ausgeblendet = true
  schreib(lehrkraftId, w)
  return true
}

/**
 *   GET  /server/schuljahr               Hinweis zum letzten Schuljahreswechsel (Lehrkraft) oder null
 *   POST /server/schuljahr/rueckgaengig  zurücknehmen (14 Tage)
 *   POST /server/schuljahr/ausblenden    Hinweis nicht mehr zeigen
 */
export async function schuljahrRoute(k: Anfrage): Promise<boolean> {
  const { url, req, res, sitzung } = k
  if (url.pathname !== '/server/schuljahr' && !url.pathname.startsWith('/server/schuljahr/')) return false
  if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
  if (sitzung.nutzer.rolle === 'schueler') return (json(res, 403, { fehler: 'Kein Zugang.' }), true)
  const ich = sitzung.nutzer.id
  if (req.method === 'GET' && url.pathname === '/server/schuljahr') return (json(res, 200, { wechsel: hinweisFuer(ich) }), true)
  if (req.method !== 'POST') return (json(res, 405, { fehler: 'Nicht erlaubt.' }), true)
  if (typeof req.headers['x-schulapps-token'] !== 'string') return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
  if (url.pathname === '/server/schuljahr/rueckgaengig') {
    const r = rueckgaengig(ich)
    return (json(res, 'fehler' in r ? 400 : 200, 'fehler' in r ? r : { ...r, wechsel: hinweisFuer(ich) }), true)
  }
  if (url.pathname === '/server/schuljahr/ausblenden') return (json(res, 200, { ok: hinweisAusblenden(ich) }), true)
  return (json(res, 404, { fehler: 'Unbekannt.' }), true)
}

/** Beim Start: in den Zeitplaner des Schulkalenders einhängen */
export function schuljahrWechselStarten(): void {
  kalenderHaken.pruefen = (heute) => schuljahrPruefen(heute)
}
