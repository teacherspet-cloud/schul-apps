/**
 * Vokabeltrainer der Lern-App (03.10.2026) – Regeln in shared/vokabeltrainer.ts.
 *
 *  Lehrkraft: Vokabeln (Lehrwerk-Abschnitt oder eigene Liste) einer Lerngruppe oder Einzelnen
 *  zuweisen, optional mit Testtermin (Termin-Anker); Statistik je Lerngruppe und Kind (ohne Ranglisten):
 *  Verteilung auf die Fächer, Erkennen vs. Schreiben, Aktivität der letzten 7 Tage, Problemwörter
 *  mit typischen Falschantworten, Prognose zum Testtermin.
 *  Lernende: ihre Listen, Lernstand je Wort, Abfragen (der Server wertet und plant).
 *  Der Lernstand je Person liegt verschlüsselt (feldschutz.ts: vok_stand.daten, vok_zuweisungen.schueler).
 *
 *  Lehrkraft: GET /server/vokabeln · POST /server/vokabeln/freigeben · GET /server/vokabeln/<id>
 *             POST /server/vokabeln/<id>/termin|zeitraum|status|loeschen
 *  Lernende:  GET /s/api/vokabeln · GET /s/api/vokabeln/liste?id= · POST /s/api/vokabeln/antwort
 *  Gäste (eigene App „Vokabeltraining", 03.10.2026): per QR-Code/Code über einen längeren Zeitraum –
 *             GET /s/api/vokabeln/zugang?code= · POST /s/api/vokabeln/gast {code, name} → persönlicher
 *             Wiedereinstiegs-Code · POST /s/api/vokabeln/wieder {code, name, wieder}
 */
import { istRekord, nachSpielfehler, SPIELE, type SpielId } from '../shared/vokabelSpiele'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { codePruefwert } from './feldschutz'
import { ohneKlasse, ohneKlassenname } from '../shared/ohneKlasse'
import { alleNutzer, datenbank, nutzerAnlegen, nutzerLoeschen, nutzerNachId, protokolliereServer, sitzungAnlegen, type NutzerInfo } from './datenbank'
import { alsNutzer, json, setzeSitzungsCookie, type Anfrage } from './http'
import { imNutzer } from './kontext'
import { getSettings } from '../main/services/storage/settings'
import { fachFarbeAus } from '../renderer/src/shared/fachfarben'
import {
  alleLernenden,
  gastInLerngruppe,
  gastName,
  gehoertZu,
  gleicheMengen,
  lerngruppe,
  lerngruppeErgaenzen,
  lerngruppenHaken,
  lerngruppenVon,
  mitgliederErgaenzen,
  mitgliederVon,
  type Lerngruppe
} from './onlinetest'
import { iservBereit } from './anmeldung'
import { bereinigeVerbKarten, verbenUnterWoertern, verbKarten, type VerbKarte } from '../shared/verbTraining'
import { istVerbSprache, type VerbSprache } from '../shared/verben'
import { verbenFrei } from '../shared/verbFreigabe'
import { standardListe } from '../renderer/src/shared/verben/standard'
import { jahrgangAus } from '../shared/lernstand'
import { quelleText, quelleUnits, type Quelle } from '../shared/vokabelLaufbahn'
import { fachAusName } from '../shared/faecher'
import { gastEntfernen } from './gaeste'
import { registerVergessen } from './namensschutz'
import { rekordEintragen, woerterEintragen } from './rekordbuch'
import { achievementAntwort } from './achievementsDaten'
import { entfernteKennungen, kennungenWiederverwenden, nurAktuell, teilEntfernen, type EntfernterTeil } from '../shared/kursEntfernen'
import {
  bewerte,
  istSicher,
  nachAbfrage,
  nachFreiwillig,
  neuerStand,
  satzMitLuecke,
  TAG,
  uebersicht,
  UEBUNGEN,
  type Urteil,
  type Uebung,
  type Vokabel,
  type WortStand
} from '../shared/vokabeltrainer'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS vok_zuweisungen (
  id TEXT PRIMARY KEY,
  lehrkraft_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  lerngruppe_id TEXT NOT NULL DEFAULT '',
  schueler TEXT NOT NULL DEFAULT '[]',
  titel TEXT NOT NULL,
  sprache TEXT NOT NULL DEFAULT '',
  fach TEXT NOT NULL DEFAULT '',
  woerter TEXT NOT NULL,
  test_termin INTEGER,
  reihe TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'offen',
  erstellt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vok_stand (
  zuweisung_id TEXT NOT NULL REFERENCES vok_zuweisungen(id) ON DELETE CASCADE,
  schueler_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  daten TEXT NOT NULL,
  aktualisiert INTEGER NOT NULL,
  PRIMARY KEY (zuweisung_id, schueler_id)
);
CREATE TABLE IF NOT EXISTS vok_gaeste (
  zuweisung_id TEXT NOT NULL REFERENCES vok_zuweisungen(id) ON DELETE CASCADE,
  nutzer_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  wieder TEXT NOT NULL,
  PRIMARY KEY (zuweisung_id, nutzer_id)
);`

let bereit = false
export const db = () => {
  const d = datenbank()
  if (!bereit) {
    d.exec(SCHEMA)
    const spalten = new Set((d.prepare('PRAGMA table_info(vok_zuweisungen)').all() as { name: string }[]).map((x) => x.name))
    if (!spalten.has('code')) d.exec("ALTER TABLE vok_zuweisungen ADD COLUMN code TEXT NOT NULL DEFAULT ''")
    if (!spalten.has('bis')) d.exec('ALTER TABLE vok_zuweisungen ADD COLUMN bis INTEGER')
    // Herkunft aus dem Lehrwerk (Vokabelweg, 03.10.2026): {lehrwerk, unit, abschnitte}
    if (!spalten.has('quelle')) d.exec("ALTER TABLE vok_zuweisungen ADD COLUMN quelle TEXT NOT NULL DEFAULT ''")
    // Unregelmäßige Verben der Liste (07.10.2026): {sprache, karten} – für Stammformen-Übung und Verbspiele
    if (!spalten.has('verben')) d.exec("ALTER TABLE vok_zuweisungen ADD COLUMN verben TEXT NOT NULL DEFAULT ''")
    // Spiele für heute freigeschaltet (08.10.2026): Tag „JJJJ-MM-TT", leer = wie sonst erst nach der Tagesrunde
    if (!spalten.has('spiele_frei')) d.exec("ALTER TABLE vok_zuweisungen ADD COLUMN spiele_frei TEXT NOT NULL DEFAULT ''")
    // Neue Vokabeln je Tag, bevor die Spiele frei werden (08.10.2026, Lehrkraft wählt; die Lernenden üben in 10er-Schritten)
    if (!spalten.has('tagesziel')) d.exec('ALTER TABLE vok_zuweisungen ADD COLUMN tagesziel INTEGER NOT NULL DEFAULT 10')
    // Übersicht (08.10.2026): eigene Überschrift der Lehrkraft und Symbol als Lernstand-Verlauf oder feste Farbe
    if (!spalten.has('ueberschrift')) d.exec("ALTER TABLE vok_zuweisungen ADD COLUMN ueberschrift TEXT NOT NULL DEFAULT ''")
    if (!spalten.has('symbol')) d.exec("ALTER TABLE vok_zuweisungen ADD COLUMN symbol TEXT NOT NULL DEFAULT ''")
    // Freigegebene Abschnitte mit Zeitpunkt (08.10.2026): für den Kasten in den Details und „neu in 2 Wochen"
    if (!spalten.has('teile')) d.exec("ALTER TABLE vok_zuweisungen ADD COLUMN teile TEXT NOT NULL DEFAULT ''")
    // Problemwörter, die die Lehrkraft aus der Liste genommen hat (08.10.2026): JSON {wortId: Fehlerzahl beim Entfernen}
    // Verbspiele (08.10.2026): '' = automatisch ab bekannter Vergangenheit, 'an'/'aus' = Schalter der Lehrkraft
    if (!spalten.has('verbspiele')) d.exec("ALTER TABLE vok_zuweisungen ADD COLUMN verbspiele TEXT NOT NULL DEFAULT ''")
    if (!spalten.has('problem_aus')) d.exec("ALTER TABLE vok_zuweisungen ADD COLUMN problem_aus TEXT NOT NULL DEFAULT ''")
    // Entfernte Abschnitte (08.10.2026): JSON [{teil, woerter, zeit}] – Wörter samt Kennungen, der Lernstand bleibt in vok_stand
    if (!spalten.has('entfernt')) d.exec("ALTER TABLE vok_zuweisungen ADD COLUMN entfernt TEXT NOT NULL DEFAULT ''")
    // Zusammen spielen (08.10.2026): 'aus' = Kooperativ/Versus für diesen Kurs (samt Grammatik) abgeschaltet
    if (!spalten.has('zusammen')) d.exec("ALTER TABLE vok_zuweisungen ADD COLUMN zusammen TEXT NOT NULL DEFAULT ''")
    const gSpalten = new Set((d.prepare('PRAGMA table_info(vok_gaeste)').all() as { name: string }[]).map((s) => s.name))
    if (!gSpalten.has('code_v')) d.exec("ALTER TABLE vok_gaeste ADD COLUMN code_v TEXT NOT NULL DEFAULT ''")
    // Persönlicher Anmeldecode (08.10.2026: von der Lehrkraft eingetragene Lernende) – nur als Prüfwert, eindeutig
    if (!gSpalten.has('anmelde')) d.exec("ALTER TABLE vok_gaeste ADD COLUMN anmelde TEXT NOT NULL DEFAULT ''")
    d.exec('CREATE INDEX IF NOT EXISTS vok_gaeste_anmelde ON vok_gaeste(anmelde)')
    bereit = true
  }
  return d
}
export const json_ = <T>(s: string | null | undefined, r: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : r
  } catch {
    return r
  }
}

export interface Zeile {
  id: string
  lehrkraft_id: string
  lerngruppe_id: string
  schueler: string
  titel: string
  sprache: string
  fach: string
  woerter: string
  test_termin: number | null
  reihe: string
  status: 'offen' | 'beendet'
  erstellt: string
  /** Code für Gäste (QR), leer = ohne Gäste */
  code: string
  /** Lernzeitraum bis (ms); danach abgeschlossen */
  bis: number | null
  /** Herkunft aus dem Lehrwerk (JSON), leer bei eigenen Listen */
  quelle?: string
  /** Unregelmäßige Verben der Liste (JSON {sprache, karten}, 07.10.2026) */
  verben?: string
  /** Spiele für diesen Tag freigeschaltet (JJJJ-MM-TT, 08.10.2026) */
  spiele_frei?: string
  verbspiele?: string
  /** 'aus' = Zusammen spielen abgeschaltet (08.10.2026) */
  zusammen?: string
  /** Neue Vokabeln je Tag (08.10.2026) */
  tagesziel?: number
  /** Überschrift der Lehrkraft ('' = Standard „Lerngruppe - Fach", seit 08.10.2026 ohne Jahr) und Symbol ('' = Verlauf, 'farbe') */
  ueberschrift?: string
  symbol?: string
  /** JSON [{titel, anzahl, zeit}] – die freigegebenen Abschnitte; leer = nur der erste (Titel) */
  teile?: string
  /** JSON {wortId: falsch beim Entfernen} – aus den Problemwörtern genommen, bis neue Fehler dazukommen (08.10.2026) */
  problem_aus?: string
  /** JSON EntfernterTeil[] – entfernte Abschnitte mit ihren Wörtern (08.10.2026, shared/kursEntfernen.ts) */
  entfernt?: string
}

/**
 * „Aus der Liste nehmen" (08.10.2026, Problemwörter/häufigste Fehler): ein Eintrag bleibt verborgen, solange seine
 * Fehlerzahl nicht über die beim Entfernen gemerkte steigt. Gibt die sichtbaren Einträge und die noch gültige Merkliste
 * zurück (überholte Einträge fallen heraus).
 */
export function ausgeblendetFiltern<T extends { id: string; falsch: number }>(
  liste: T[],
  gemerkt: Record<string, number>
): { sichtbar: T[]; gueltig: Record<string, number> } {
  const gueltig: Record<string, number> = {}
  const sichtbar: T[] = []
  for (const p of liste) {
    const n = gemerkt[p.id]
    if (typeof n === 'number' && p.falsch <= n) gueltig[p.id] = n
    else sichtbar.push(p)
  }
  return { sichtbar, gueltig }
}

/** Problemwörter eines Trainings (ohne Grenze): ab 3 Versuchen mit Fehlern, höchste Fehlerquote zuerst */
function problemWoerter(woerter: Vokabel[], staende: Record<string, WortStand>[]) {
  return woerter
    .map((v) => {
      let versuche = 0
      let falsch = 0
      const texte = new Map<string, number>()
      for (const st of staende) {
        const s = st[v.id]
        if (!s) continue
        versuche += s.versuche
        falsch += s.falsch
        for (const t of s.fehlerTexte) texte.set(t, (texte.get(t) ?? 0) + 1)
      }
      return {
        id: v.id,
        term: v.term,
        translation: v.translation,
        versuche,
        falsch,
        quote: versuche ? falsch / versuche : 0,
        typisch: [...texte.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([t]) => t)
      }
    })
    .filter((p) => p.versuche >= 3 && p.falsch > 0)
    .sort((a, b) => b.quote - a.quote)
}

export interface VokTeil {
  titel: string
  anzahl: number
  zeit: number
}
/** Abschnitte eines Trainings; ältere Freigaben: einer mit dem Titel und allen Wörtern */
export function teileVon(z: Pick<Zeile, 'teile' | 'titel' | 'woerter' | 'erstellt'>): VokTeil[] {
  const t = json_(z.teile || '[]', [] as VokTeil[])
  return t.length ? t : [{ titel: z.titel, anzahl: json_(z.woerter, [] as unknown[]).length, zeit: Date.parse(z.erstellt) || 0 }]
}

/** Entfernte Abschnitte eines Kurses (08.10.2026) */
export const entferntVon = (z: Pick<Zeile, 'entfernt'>): EntfernterTeil[] => json_(z.entfernt || '[]', [] as EntfernterTeil[])

/** Lernstand zu Wörtern löschen („Endgültig löschen", 08.10.2026, Datenschutz) – bei allen, die je geübt haben */
export function lernstandLoeschen(zid: string, wortIds: string[]): void {
  if (!wortIds.length) return
  for (const r of db().prepare('SELECT schueler_id FROM vok_stand WHERE zuweisung_id = ?').all(zid) as { schueler_id: string }[]) {
    const st = standVon(zid, r.schueler_id)
    let anders = false
    for (const id of wortIds) if (id in st.woerter) (delete st.woerter[id], (anders = true))
    if (anders) standSpeichern(zid, r.schueler_id, st)
  }
}

/**
 * Standard-Überschrift „6b - Englisch" (08.10.2026, abgestimmt): ohne Jahr, denn der Kurs läuft über die Schuljahre
 * weiter; der Klassenname kommt jeweils aus der Lerngruppe (5b → 6b umbenannt = neue Überschrift). Eine eigene Überschrift
 * der Lehrkraft (`ueberschrift`) bleibt unberührt. Ohne Lerngruppe und Fach: der Titel.
 */
export function ueberschriftVon(z: Pick<Zeile, 'ueberschrift' | 'lerngruppe_id' | 'fach'> & Partial<Pick<Zeile, 'erstellt' | 'titel'>>): string {
  if (z.ueberschrift) return z.ueberschrift
  const gruppe = z.lerngruppe_id ? lerngruppe(z.lerngruppe_id)?.name ?? '' : ''
  return [gruppe, z.fach].filter(Boolean).join(' - ') || z.titel || ''
}

/** Lernende sehen nie die Klasse im Titel (08.10.2026): „Englisch" statt „10b - Englisch" */
export const titelFuerLernende = (z: Parameters<typeof ueberschriftVon>[0]): string => ohneKlasse(ueberschriftVon(z))

/** Wörter, die in den letzten 7 Tagen neu gelernt bzw. wiederholt wurden */
function sieben(staende: Record<string, WortStand>, jetzt: number): { neu7: number; wiederholt7: number } {
  const grenze = jetzt - 7 * TAG
  let neu7 = 0
  let wiederholt7 = 0
  for (const st of Object.values(staende)) {
    if (!st.versuche || (st.zuletzt ?? 0) < grenze) continue
    const neu = st.erstmals ? st.erstmals >= grenze : st.versuche <= 2
    if (neu) neu7++
    else wiederholt7++
  }
  return { neu7, wiederholt7 }
}

/**
 * Verbindung zur Grammatik (Sprachenlernen, 08.10.2026). grammatik.ts importiert dieses Modul – umgekehrt ginge es im
 * Kreis; deshalb trägt grammatik.ts seine Funktionen hier ein.
 */
export const kursHaken: {
  vorListe?: (lehrkraftId: string) => void
  grammatikZahl?: (vokId: string) => number
  /** Stärken/Schwächen in Grammatik je Person (grammatik.ts `grammatikProfil`) */
  profil?: (n: NutzerInfo, sprache: string, lehrkraftId: string) => unknown
  /** Bekannte Grammatik eines Kindes (grammatik.ts `bekannteGrammatikFuer`) – für die Freigabe der Verbspiele */
  bekannt?: (n: NutzerInfo) => string[]
} = {}

/** Status eines Kurses setzen (Überführung beendeter Grammatiktrainings) */
export function vokStatusSetzen(id: string, status: 'offen' | 'beendet'): void {
  db().prepare('UPDATE vok_zuweisungen SET status = ? WHERE id = ?').run(status, id)
}

/** Gast in einen Kurs aufnehmen (Überführung eines Grammatiktrainings: seine Gäste kommen mit) */
export function kursGastAufnehmen(vokId: string, nutzerId: string, wieder: string): void {
  db().prepare('INSERT OR IGNORE INTO vok_gaeste (zuweisung_id, nutzer_id, wieder) VALUES (?, ?, ?)').run(vokId, nutzerId, wieder)
}

/** Tagesziel begrenzt (1–200, Vorgabe 10) */
export const tageszielVon = (z: Pick<Zeile, 'tagesziel'>): number => Math.max(1, Math.min(200, Math.round(Number(z.tagesziel) || 10)))

/** Heutiger Tag in Deutschland (JJJJ-MM-TT) – für die Freischaltung der Spiele */
export const heuteTag = (jetzt = new Date()): string => jetzt.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
/** Hat die Lehrkraft die Spiele für heute freigeschaltet? */
export const spieleHeuteFrei = (z: Pick<Zeile, 'spiele_frei'>, jetzt = new Date()): boolean => z.spiele_frei === heuteTag(jetzt)

/** Offen = nicht beendet und Zeitraum nicht abgelaufen */
export const istOffen = (z: Pick<Zeile, 'status' | 'bis'>): boolean => z.status === 'offen' && !(z.bis && z.bis < Date.now())

const CODE_ZEICHEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function neuerCode(n = 6): string {
  for (;;) {
    const c = Array.from(randomBytes(n), (b) => CODE_ZEICHEN[b % CODE_ZEICHEN.length]).join('')
    if (n !== 6 || !db().prepare('SELECT 1 FROM vok_zuweisungen WHERE code = ?').get(c)) return c
  }
}
/** Persönlicher Anmeldecode: 8 Zeichen ohne Verwechsler, eindeutig über alle Trainings (08.10.2026) */
const ANMELDE_ZEICHEN = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function anmeldeCode(): string {
  for (;;) {
    const c = Array.from(randomBytes(8), (b) => ANMELDE_ZEICHEN[b % ANMELDE_ZEICHEN.length]).join('')
    if (!db().prepare('SELECT 1 FROM vok_gaeste WHERE anmelde = ?').get(hashVon(c))) return c
  }
}
/** Neuen persönlichen Code für einen Gast setzen – gilt als Anmeldecode und für „Schon dabei?" (in allen seinen Trainings) */
function gastCodeSetzen(nutzerId: string): string {
  const c = anmeldeCode()
  db().prepare('UPDATE vok_gaeste SET wieder = ?, code_v = ?, anmelde = ? WHERE nutzer_id = ?').run(hashVon(c), c, hashVon(c), nutzerId)
  return c
}
// Prüfwert des Anmelde-/Wiedereinstiegscodes: HMAC mit dem Hauptschlüssel statt ungesalzenem SHA-256 (08.10.2026, feldschutz.ts)
const hashVon = codePruefwert
const nachCode = (code: string): Zeile | null =>
  code ? (db().prepare("SELECT * FROM vok_zuweisungen WHERE code = ? AND code != ''").get(code.toUpperCase()) as Zeile | undefined) ?? null : null
const gaesteVon = (zid: string): NutzerInfo[] =>
  (db().prepare('SELECT nutzer_id FROM vok_gaeste WHERE zuweisung_id = ?').all(zid) as { nutzer_id: string }[])
    .map((g) => nutzerNachId(g.nutzer_id))
    // Vorschaukonten (vorschau.ts) zählen nie mit
    .filter((n): n is NutzerInfo => Boolean(n && n.quelle !== 'vorschau'))
/** Gäste lernen über Wochen: Sitzung bis zum Ende des Zeitraums (höchstens 120 Tage, mindestens 1 Tag) */
const gastDauer = (z: Pick<Zeile, 'bis'>): number => Math.max(864e5, Math.min(120 * 864e5, (z.bis ?? Date.now() + 90 * 864e5) - Date.now() + 864e5))

/** Lernstand einer Person in einer Liste: je Wort + Übungstage (für „aktiv in den letzten 7 Tagen") */
export interface VokStand {
  woerter: Record<string, WortStand>
  tage: string[]
  /** Spiele (03.10.2026): eigener Rekord je Spiel; Wörter, die im Spiel danebengingen („nochmal ansehen") */
  rekorde?: Record<string, number>
  ansehen?: string[]
}

export const zeile = (id: string): Zeile | null => (db().prepare('SELECT * FROM vok_zuweisungen WHERE id = ?').get(id) as Zeile | undefined) ?? null
export const standVon = (zid: string, sid: string): VokStand => {
  const z = db().prepare('SELECT daten FROM vok_stand WHERE zuweisung_id = ? AND schueler_id = ?').get(zid, sid) as { daten: string } | undefined
  return json_(z?.daten, { woerter: {}, tage: [] } as VokStand)
}
export function standSpeichern(zid: string, sid: string, s: VokStand): void {
  db()
    .prepare(
      'INSERT INTO vok_stand (zuweisung_id, schueler_id, daten, aktualisiert) VALUES (?, ?, ?, ?) ON CONFLICT (zuweisung_id, schueler_id) DO UPDATE SET daten = excluded.daten, aktualisiert = excluded.aktualisiert'
    )
    .run(zid, sid, JSON.stringify(s), Date.now())
}

/** Klassenstufe der Lernenden zu einer Freigabe – Name der Lerngruppe („7a"), sonst die IServ-Gruppen; null = unbekannt */
export function klasseFuer(z: Pick<Zeile, 'lerngruppe_id'>, ich: NutzerInfo): number | null {
  const g = z.lerngruppe_id ? lerngruppe(z.lerngruppe_id) : null
  const aus = [g?.name, ...ich.gruppen.map((x) => x.name)].map((n) => jahrgangAus(n)).find((j) => j && j >= 1 && j <= 13)
  return aus ?? null
}

export function vokIstFuer(z: Pick<Zeile, 'lerngruppe_id' | 'schueler'> & { id?: string }, ich: NutzerInfo): boolean {
  if (ich.rolle !== 'schueler') return false
  // Gäste (QR-Code) und Lernende mit Konto, die per Code dazugekommen sind
  if (z.id && db().prepare('SELECT 1 FROM vok_gaeste WHERE zuweisung_id = ? AND nutzer_id = ?').get(z.id, ich.id)) return true
  // Gäste nur, wenn die Lehrkraft sie in die Lerngruppe eingetragen hat (08.10.2026, „Lernende einer Klasse zuordnen")
  if (ich.quelle === 'gast' && !gastInLerngruppe(z.lerngruppe_id, ich)) return false
  const nur = json_(z.schueler, [] as string[])
  if (!z.lerngruppe_id) return nur.includes(ich.benutzer)
  const g = lerngruppe(z.lerngruppe_id)
  if (!g || !gehoertZu(g, ich)) return false
  return !nur.length || nur.includes(ich.benutzer)
}

export function lernendeVon(z: Zeile): NutzerInfo[] {
  const nur = json_(z.schueler, [] as string[])
  const g = z.lerngruppe_id ? lerngruppe(z.lerngruppe_id) : null
  const feste = !z.lerngruppe_id
    ? alleNutzer().filter((n) => n.rolle === 'schueler' && n.quelle !== 'gast' && nur.includes(n.benutzer))
    : g
    ? mitgliederVon(g).filter((n) => !nur.length || nur.includes(n.benutzer))
    : []
  const ids = new Set(feste.map((n) => n.id))
  return [...feste, ...gaesteVon(z.id).filter((n) => !ids.has(n.id))]
}

// ---------------------------------------------------------------- Lernende einer Klasse zuordnen (08.10.2026)

/** Wer aus dem Training in eine Lerngruppe kann: eingetragene Gäste (Anmeldecode) und Schülerkonten, nie Vorschaukonten */
function zuordenbareLernende(z: Zeile): NutzerInfo[] {
  return lernendeVon(z).filter((n) => n.rolle === 'schueler' && n.quelle !== 'vorschau')
}

/** Schon Mitglied? Gäste nur über den Eintrag, Konten auch über die IServ-Gruppe */
const schonMitglied = (g: Lerngruppe, n: NutzerInfo): boolean => (n.quelle === 'gast' ? g.mitglieder.includes(n.benutzer) : gehoertZu(g, n))

/**
 * Darf das Training (bisher ohne Lerngruppe) mit `g` verbunden werden? Nur wenn danach – mit den zugeordneten
 * Lernenden in `g` – genau dieselben Personen Zugang haben wie jetzt: keine weiteren Mitglieder bekommen das Training,
 * niemand verliert es (Codes gelten über vok_gaeste ohnehin weiter).
 */
function verknuepfenOhneFolgen(z: Zeile, g: Lerngruppe, lernende: NutzerInfo[]): boolean {
  if (z.lerngruppe_id) return false
  const vorher = new Set(lernendeVon(z).map((n) => n.id))
  const g2: Lerngruppe = { ...g, mitglieder: mitgliederErgaenzen(g.mitglieder, lernende.map((n) => n.benutzer)).mitglieder }
  const nur = json_(z.schueler, [] as string[])
  const nachher = new Set([
    ...mitgliederVon(g2)
      .filter((n) => !nur.length || nur.includes(n.benutzer))
      .map((n) => n.id),
    ...gaesteVon(z.id).map((n) => n.id)
  ])
  return gleicheMengen(vorher, nachher)
}

/** Wörter bereinigen (Bilder höchstens 200 KB, höchstens 400 Wörter) */
function bereinigeWoerter(roh: unknown): Vokabel[] {
  return (Array.isArray(roh) ? roh : [])
    .slice(0, 400)
    .map((x, i) => {
      const y = (x ?? {}) as Record<string, unknown>
      const t = (k: string, n = 400): string => String(y[k] ?? '').slice(0, n)
      const bild = typeof y.bild === 'string' && y.bild.startsWith('data:image/') && y.bild.length < 200_000 ? y.bild : undefined
      return {
        id: /^[a-z0-9-]{1,40}$/i.test(String(y.id ?? '')) ? String(y.id) : `w${i}`,
        term: t('term'),
        translation: t('translation'),
        ...(y.example ? { example: t('example', 600) } : {}),
        ...(y.exampleTranslation ? { exampleTranslation: t('exampleTranslation', 600) } : {}),
        ...(y.pos ? { pos: t('pos', 60) } : {}),
        ...(y.note ? { note: t('note', 200) } : {}),
        ...(bild ? { bild } : {})
      }
    })
    .filter((v) => v.term && v.translation)
}

/**
 * Herkunft aus dem Lehrwerk prüfen (nur Kennung, Units, Abschnittsnamen). Mehrere Units (08.10.2026):
 * `{lehrwerk, units: [{unit, abschnitte}]}` in Buchreihenfolge; gespeichert werden dazu `unit` (die höchste = letzte)
 * und `abschnitte` (alle hintereinander), damit ältere Leser weiter funktionieren. Ältere Form `{lehrwerk, unit, abschnitte}`
 * gilt als eine Unit.
 */
export function quelleBereinigt(roh: unknown): string {
  const q = (roh ?? {}) as Record<string, unknown>
  if (typeof q.lehrwerk !== 'string' || !/^[a-z0-9-]{1,60}$/.test(q.lehrwerk)) return ''
  const abschnitteVon = (x: unknown): string[] =>
    (Array.isArray(x) ? x : [])
      .map(String)
      .map((a) => a.slice(0, 120))
      .filter(Boolean)
      .slice(0, 20)
  const roheUnits: { unit: string; abschnitte: string[] }[] = Array.isArray(q.units)
    ? (q.units as unknown[]).map((u) => {
        const x = (u ?? {}) as Record<string, unknown>
        return { unit: typeof x.unit === 'string' ? x.unit.slice(0, 120) : '', abschnitte: abschnitteVon(x.abschnitte) }
      })
    : typeof q.unit === 'string' && Array.isArray(q.abschnitte)
    ? [{ unit: q.unit.slice(0, 120), abschnitte: abschnitteVon(q.abschnitte) }]
    : []
  // Gleiche Unit zweimal: zusammenlegen (Reihenfolge der ersten Nennung)
  const units: { unit: string; abschnitte: string[] }[] = []
  for (const u of roheUnits) {
    if (!u.unit) continue
    const da = units.find((x) => x.unit === u.unit)
    if (da) da.abschnitte = [...new Set([...da.abschnitte, ...u.abschnitte])].slice(0, 20)
    else units.push({ unit: u.unit, abschnitte: [...new Set(u.abschnitte)] })
  }
  const auswahl = units.slice(0, 30)
  if (!auswahl.length) return ''
  if (auswahl.length === 1) return JSON.stringify({ lehrwerk: q.lehrwerk, unit: auswahl[0].unit, abschnitte: auswahl[0].abschnitte })
  return JSON.stringify({
    lehrwerk: q.lehrwerk,
    units: auswahl,
    unit: auswahl[auswahl.length - 1].unit,
    abschnitte: auswahl.flatMap((u) => u.abschnitte)
  })
}

/**
 * Herkunft beim Hinzufügen weiterer Vokabeln (08.10.2026) fortschreiben: gleiches Lehrwerk → Units zusammenlegen
 * (neue hinten), anderes Lehrwerk (z. B. der nächste Band im neuen Schuljahr) → die neue Herkunft gilt.
 */
export function quelleZusammen(alt: string, neu: string): string {
  if (!neu) return alt
  const a = json_(alt, null as Quelle | null)
  const n = json_(neu, null as Quelle | null)
  if (!a || !n || a.lehrwerk !== n.lehrwerk) return neu
  return quelleBereinigt({ lehrwerk: a.lehrwerk, units: [...quelleUnits(a), ...quelleUnits(n)] }) || neu
}

/** Abschnitte einer Erstfreigabe aus dem Lehrwerk (08.10.2026): `[{titel, anzahl}]`, nur wenn sie die Wörter genau abdecken */
function teileBereinigt(roh: unknown, woerter: number, zeit: number): VokTeil[] | null {
  if (!Array.isArray(roh) || !roh.length) return null
  const teile = (roh as unknown[]).slice(0, 60).map((t) => {
    const x = (t ?? {}) as Record<string, unknown>
    return { titel: String(x.titel ?? '').slice(0, 160), anzahl: Math.max(0, Math.round(Number(x.anzahl) || 0)), zeit }
  })
  return teile.every((t) => t.titel && t.anzahl > 0) && teile.reduce((s, t) => s + t.anzahl, 0) === woerter ? teile : null
}

/** Verben der Liste prüfen: {sprache, karten} */
function verbenBereinigt(roh: unknown): string {
  const v = (roh ?? {}) as Record<string, unknown>
  if (!istVerbSprache(v.sprache)) return ''
  const karten = bereinigeVerbKarten(v.karten)
  return karten.length ? JSON.stringify({ sprache: v.sprache, karten }) : ''
}

/**
 * Ohne Verben der Lehrkraft (Unterrichtsreihe, Vokabelweg, ältere Freigaben): die unregelmäßigen Verben der Wörter
 * aus der mitgelieferten Standardliste (07.10.2026).
 */
export function standardVerben(woerter: { term: string }[], sprache: string): { sprache: VerbSprache; karten: VerbKarte[] } | null {
  if (!istVerbSprache(sprache)) return null
  const karten = verbKarten(verbenUnterWoertern(woerter, [], standardListe(sprache), sprache), sprache)
  return karten.length ? { sprache, karten } : null
}

/** Neue Zuweisung anlegen (auch für einen Schritt einer Unterrichtsreihe) */
export function vokabelnZuweisen(e: {
  lehrkraftId: string
  lerngruppeId: string
  schueler: string[]
  titel: string
  sprache: string
  fach: string
  woerter: unknown
  testTermin?: number | null
  reihe?: string
  gaeste?: boolean
  bis?: number | null
  quelle?: unknown
  /** Unregelmäßige Verben der Liste (07.10.2026) */
  verben?: unknown
  /** Kurs nur mit Grammatik (Sprachenlernen, 08.10.2026): ohne Vokabeln erlaubt */
  leer?: boolean
  /** Abschnitte der Erstfreigabe aus dem Lehrwerk [{titel, anzahl}] (08.10.2026, mehrere Units) */
  teile?: unknown
}): string {
  const id = randomBytes(8).toString('hex')
  const woerter = bereinigeWoerter(e.woerter)
  if (!woerter.length && !e.leer) throw new Error('Die Liste hat keine Vokabeln.')
  db()
    .prepare(
      "INSERT INTO vok_zuweisungen (id, lehrkraft_id, lerngruppe_id, schueler, titel, sprache, fach, woerter, test_termin, reihe, status, erstellt, code, bis, quelle, verben, teile) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'offen', ?, ?, ?, ?, ?, ?)"
    )
    .run(
      id,
      e.lehrkraftId,
      e.lerngruppeId,
      JSON.stringify(e.schueler),
      e.titel.slice(0, 160),
      e.sprache.slice(0, 8),
      e.fach.slice(0, 40),
      JSON.stringify(woerter),
      e.testTermin ?? null,
      e.reihe ?? '',
      new Date().toISOString(),
      e.gaeste ? neuerCode() : '',
      e.bis ?? null,
      quelleBereinigt(e.quelle),
      verbenBereinigt(e.verben ?? standardVerben(woerter, e.sprache)),
      (() => {
        const t = teileBereinigt(e.teile, woerter.length, Date.now())
        return t && t.length > 1 ? JSON.stringify(t) : ''
      })()
    )
  return id
}

// ---------------------------------------------------------------- Kurse für die eigenen Klassen (08.10.2026, abgestimmt)

/** Fremdsprachen (auch Latein/Griechisch) im Fach einer Lerngruppe – je Sprache Katalogname und Sprachcode */
export function sprachfaecherDerGruppe(fach: string): { fach: string; sprache: string; id: string }[] {
  const aus: { fach: string; sprache: string; id: string }[] = []
  for (const teil of [fach, ...fach.split(/\s*[,;]\s*/)]) {
    const f = teil.trim() ? fachAusName(teil) : undefined
    const sprache = f ? f.sprache ?? f.uebersetzungssprache : undefined
    if (!f || !sprache || (f.art !== 'fremdsprache' && f.art !== 'alte-sprache') || aus.some((x) => x.id === f.id)) continue
    aus.push({ fach: f.label, sprache, id: f.id })
  }
  return aus
}

/**
 * Jede eigene Lerngruppe mit einer Fremdsprache bekommt einen Kurs in „Sprachenlernen" (08.10.2026, abgestimmt): fehlt er,
 * entsteht ein leerer Kurs (ohne Wörter, Empfänger = die Lerngruppe). Idempotent: Als vorhanden zählt jeder Kurs (auch
 * beendet) dieser Lehrkraft, der mit der Lerngruppe – oder einer gleichnamigen der Lehrkraft (dieselbe Klasse mit
 * anderem Fach) – verbunden ist und dieselbe Sprache hat. Lernende sehen leere Kurse erst, wenn Inhalt da ist
 * (vokabelListenFuer, Grammatik nur mit Freigabe). Gibt die Zahl der neu angelegten Kurse zurück.
 */
export function klassenKurseSichern(lehrkraftId: string): number {
  const gruppen = lerngruppenVon(lehrkraftId)
  const kurse = db()
    .prepare("SELECT id, lerngruppe_id, sprache, fach FROM vok_zuweisungen WHERE lehrkraft_id = ? AND reihe = '' AND lerngruppe_id != ''")
    .all(lehrkraftId) as { id: string; lerngruppe_id: string; sprache: string; fach: string }[]
  let neu = 0
  for (const g of gruppen) {
    if (!g.name.trim()) continue
    const name = g.name.trim().toLowerCase()
    const geschwister = new Set(gruppen.filter((x) => x.name.trim().toLowerCase() === name).map((x) => x.id))
    for (const s of sprachfaecherDerGruppe(g.fach)) {
      const da = kurse.some(
        (k) => geschwister.has(k.lerngruppe_id) && (k.sprache === s.sprache || fachAusName(k.fach)?.id === s.id)
      )
      if (da) continue
      const id = vokabelnZuweisen({ lehrkraftId, lerngruppeId: g.id, schueler: [], titel: s.fach, sprache: s.sprache, fach: s.fach, woerter: [], leer: true })
      kurse.push({ id, lerngruppe_id: g.id, sprache: s.sprache, fach: s.fach })
      neu++
    }
  }
  if (neu) protokolliereServer('vokabeln', `${neu} Kurs(e) für eigene Klassen angelegt`, lehrkraftId)
  return neu
}
/** Leeren Kurs (ohne Wörter) löschen – z. B. wenn das Fach in der Klasse abgewählt wird (08.10.2026) */
export function leerenKursLoeschen(id: string, lehrkraftId: string): void {
  const z = zeile(id)
  if (!z || z.lehrkraft_id !== lehrkraftId || json_(z.woerter, [] as unknown[]).length) return
  db().prepare('DELETE FROM vok_zuweisungen WHERE id = ?').run(id)
}

/**
 * Neuer Kurs für eine Lerngruppe, die schon einen leeren Kurs derselben Sprache hat (ohne Wörter, ohne Grammatik, offen,
 * für die ganze Gruppe; 08.10.2026): Inhalt und Einstellungen des neuen gehen in den leeren (seine Überschrift, eingetragene
 * Lernende usw. bleiben), der neue entfällt. Liefert die Kennung des Kurses, der bleibt.
 */
export function leerenKursFuellen(neuId: string, lehrkraftId: string, lerngruppeId: string): string {
  const neu = zeile(neuId)
  if (!neu) return neuId
  const leer = (
    db()
      .prepare("SELECT * FROM vok_zuweisungen WHERE lehrkraft_id = ? AND lerngruppe_id = ? AND reihe = '' AND status = 'offen' AND id != ? ORDER BY erstellt ASC")
      .all(lehrkraftId, lerngruppeId, neuId) as unknown as Zeile[]
  ).find(
    (z) =>
      istOffen(z) &&
      z.sprache === neu.sprache &&
      !json_(z.woerter, [] as unknown[]).length &&
      !json_(z.schueler, [] as unknown[]).length &&
      !(kursHaken.grammatikZahl?.(z.id) ?? 0)
  )
  if (!leer) return neuId
  db()
    .prepare(
      'UPDATE vok_zuweisungen SET titel = ?, fach = ?, woerter = ?, test_termin = ?, bis = ?, quelle = ?, verben = ?, teile = ?, code = ?, erstellt = ? WHERE id = ?'
    )
    .run(
      neu.titel,
      neu.fach || leer.fach,
      neu.woerter,
      neu.test_termin,
      neu.bis,
      neu.quelle ?? '',
      neu.verben ?? '',
      // Freigabezeitpunkt der Wörter = jetzt (nicht das Anlegedatum des leeren Kurses – „reife Wörter")
      neu.teile || (json_(neu.woerter, [] as unknown[]).length ? JSON.stringify(teileVon(neu)) : ''),
      leer.code || neu.code,
      // Sichtbar ab jetzt – zählt für „neueste Materialien" der Lernenden
      neu.erstellt,
      leer.id
    )
  db().prepare('DELETE FROM vok_zuweisungen WHERE id = ?').run(neuId)
  return leer.id
}

// Meine Klassen: neue Lerngruppe oder neues Fach → gleich sichern (onlinetest.ts ruft den Haken, ohne dieses Modul zu laden)
lerngruppenHaken.geaendert = (lehrkraftId) => {
  try {
    klassenKurseSichern(lehrkraftId)
  } catch (e) {
    protokolliereServer('vokabeln', `Kurse für Klassen nicht angelegt: ${e instanceof Error ? e.message : String(e)}`, lehrkraftId)
  }
}

/** Für die Unterrichtsreihe: Anteil der Wörter, die mindestens in Fach 2 sind (eingeübt), in Prozent */
export function vokabelStand(zid: string, sid: string): { eingereicht: number; runden: number; prozent: number } | null {
  const z = zeile(zid)
  if (!z) return null
  const woerter = json_(z.woerter, [] as Vokabel[])
  const st = standVon(z.id, sid)
  const geuebt = woerter.filter((v) => (st.woerter[v.id]?.fach ?? 0) >= 2).length
  const prozent = woerter.length ? Math.round((geuebt / woerter.length) * 100) : 0
  return { eingereicht: Object.keys(st.woerter).length ? 1 : 0, runden: 99, prozent }
}

/** Kurzfassung für die Lernenden (auch für die Lern-App) */
export function vokabelListenFuer(
  ich: NutzerInfo
): { id: string; titel: string; name: string; fach: string; sprache: string; testTermin: number | null; erstellt: string; uebersicht: ReturnType<typeof uebersicht> }[] {
  return (
    (db().prepare("SELECT * FROM vok_zuweisungen WHERE status = 'offen' ORDER BY erstellt DESC").all() as unknown as Zeile[])
      // Kurse nur mit Grammatik (08.10.2026) sind kein Vokabeltraining – ihre Grammatik kommt über grammatikFuer
      .filter((z) => istOffen(z) && vokIstFuer(z, ich) && json_(z.woerter, [] as unknown[]).length > 0)
      .map((z) => ({
        id: z.id,
        // Lernende sehen die Überschrift ohne Klasse („Englisch" statt „5b - Englisch"), nicht „Green Line 1 - Unit 1 - …" (08.10.2026)
        titel: titelFuerLernende(z),
        // Eigener Kursname ohne Klasse (09.10.2026): unterscheidet mehrere Kurse eines Fachs im Ordner
        name: ohneKlassenname(z.titel, z.lerngruppe_id ? lerngruppe(z.lerngruppe_id)?.name ?? '' : ''),
        fach: z.fach,
        sprache: z.sprache,
        testTermin: z.test_termin,
        // Freigabedatum für „Mein Lernraum" auf der Startseite (08.10.2026: die neuesten Materialien)
        erstellt: z.erstellt,
        uebersicht: uebersicht(json_(z.woerter, [] as Vokabel[]), standVon(z.id, ich.id).woerter, Date.now(), tageszielVon(z))
      }))
  )
}

/**
 * Fachfarbe des Kopfbands, wie die Lehrkraft sie eingestellt hat (sonst der Vorschlag des Fachs) –
 * das Vokabeltraining der Lernenden sieht aus wie ihre Arbeitsblätter (03.10.2026)
 */
export async function fachfarbeDerLehrkraft(z: Zeile): Promise<string | null> {
  const lk = nutzerNachId(z.lehrkraft_id)
  const eigene = lk ? await imNutzer(alsNutzer(lk), async () => getSettings().fachfarben).catch(() => undefined) : undefined
  return fachFarbeAus(z.fach, eigene)
}

/**
 * Eine Abfrage auswerten und den Stand des Wortes fortschreiben – für die Liste und den Vokabelweg.
 */
export function abfrageAuswerten(
  v: Vokabel,
  k0: Record<string, unknown>,
  stand: VokStand,
  testTermin?: number,
  /** Rekordbuch (08.10.2026): wer übt, in welcher Klasse */
  buch?: { ich: NutzerInfo; klasse: number | null }
): { ergebnis: { urteil: Urteil; hinweis?: string; richtig: string }; neu: WortStand } | null {
  const uebung = String(k0.uebung ?? '') as Uebung
  if (!UEBUNGEN.includes(uebung)) return null
  const antwort = String(k0.antwort ?? '').slice(0, 200)
  // Lernkarte: Selbsteinschätzung nur beim ersten Kontakt; „Stimmt das Paar?": richtig, wenn das Urteil zur gezeigten Übersetzung passt
  const paarStimmt = uebung === 'paar' ? bewerte(String(k0.gezeigt ?? ''), v.translation, true).urteil === 'richtig' : false
  const ergebnis: { urteil: Urteil; hinweis?: string; richtig: string } =
    uebung === 'karte'
      ? { urteil: k0.gewusst === true ? 'richtig' : 'falsch', richtig: v.term }
      : uebung === 'paar'
      ? { urteil: (antwort === 'stimmt') === paarStimmt ? 'richtig' : 'falsch', richtig: `${v.term} – ${v.translation}` }
      : bewerte(antwort, loesungFuer(v, uebung), uebung === 'auswahlFs')
  const jetzt = Date.now()
  const alt = stand.woerter[v.id]
  // Freiwillig weiter üben (08.10.2026): rückt nur vor, wenn fällig und heute noch nicht vorgerückt; Fehler ohne Zurückstufen
  const neu = (k0.freiwillig === true ? nachFreiwillig : nachAbfrage)(
    stand.woerter[v.id] ?? neuerStand(),
    uebung,
    ergebnis.urteil,
    // „Typische Falschantworten" nur aus eigenen Antworten – nicht aus vorgegebenen Falschschreibungen oder „stimmt nicht"
    uebung === 'karte' || uebung === 'paar' || uebung === 'auswahlFs' ? '' : antwort,
    jetzt,
    testTermin
  )
  stand.woerter[v.id] = neu
  // Rekordbuch: neu gelernt (erster Kontakt) und sicher geworden – je Schuljahr
  if (buch)
    woerterEintragen(buch.ich, { gelernt: !alt?.versuche ? 1 : 0, sicher: istSicher(neu) && !(alt && istSicher(alt)) ? 1 : 0 }, buch.klasse, jetzt)
  // Achievements (08.10.2026): Tagesrunde, Diktate, „Lege das Wort" von Hand (`eingabe` schickt der Trainer mit)
  if (buch) achievementAntwort(buch.ich, { uebung, urteil: ergebnis.urteil, eingabe: k0.eingabe }, jetzt)
  // Richtig geübt: von der Liste „nochmal ansehen" (aus den Spielen) streichen
  if (ergebnis.urteil === 'richtig' && stand.ansehen?.includes(v.id)) stand.ansehen = stand.ansehen.filter((x) => x !== v.id)
  const heute = new Date(jetzt).toISOString().slice(0, 10)
  if (!stand.tage.includes(heute)) stand.tage = [...stand.tage, heute].slice(-60)
  return { ergebnis, neu }
}

/** Spiel beendet: Rekord und „nochmal ansehen" in einen Stand eintragen */
export function spielEintragen(
  stand: VokStand,
  k0: Record<string, unknown>,
  gueltig: (wortId: string) => boolean,
  buch?: { ich: NutzerInfo; klasse: number | null }
): { rekord: boolean } | null {
  const spiel = String(k0.spiel ?? '') as SpielId
  const wert = Number(k0.wert)
  if (!SPIELE.some((x) => x.id === spiel) || !Number.isFinite(wert) || wert < 0 || wert > 100000) return null
  const rekord = istRekord(spiel, wert, stand.rekorde?.[spiel])
  if (rekord) stand.rekorde = { ...(stand.rekorde ?? {}), [spiel]: wert }
  const fehler = (Array.isArray(k0.fehler) ? k0.fehler : []).map(String).filter(gueltig)
  stand.ansehen = [...new Set([...(stand.ansehen ?? []), ...fehler])].slice(-30)
  // Fehler im Spiel wirken auf den Kasten (06.10.2026): wackelig, gleich wieder dran; sicher → ein Fach zurück
  const jetzt = Date.now()
  for (const id of new Set(fehler)) if (stand.woerter[id]) stand.woerter[id] = nachSpielfehler(stand.woerter[id], jetzt)
  const heute = new Date().toISOString().slice(0, 10)
  if (!stand.tage.includes(heute)) stand.tage = [...stand.tage, heute].slice(-60)
  // Rekordbuch (08.10.2026): persönlicher Rekord des Schuljahres über alle Trainings
  if (buch) rekordEintragen(buch.ich, `vok:${spiel}`, wert, buch.klasse, jetzt, fehler.length)
  return { rekord }
}

/** Was eine Übung als Lösung erwartet */
function loesungFuer(v: Vokabel, uebung: Uebung): string {
  if (uebung === 'auswahl' || uebung === 'hoeren') return v.translation
  if (uebung === 'luecke' && v.example) return satzMitLuecke(v.example, v.term)?.loesung ?? v.term
  return v.term
}

export function vokabelRoute(adresse = ''): (k: Anfrage) => Promise<boolean> {
  const link = (code: string): string => `${adresse.replace(/\/$/, '')}/s/vt/${code}`
  return async (k) => {
    const { url, req, res, sitzung } = k
    const schueler = url.pathname === '/s/api/vokabeln' || url.pathname.startsWith('/s/api/vokabeln/')
    const lehrer = url.pathname === '/server/vokabeln' || url.pathname.startsWith('/server/vokabeln/')
    if (!schueler && !lehrer) return false
    if (req.method === 'POST' && typeof req.headers['x-schulapps-token'] !== 'string') return json(res, 403, { fehler: 'Nur aus der App.' }), true
    const sicher = Boolean((req.socket as { encrypted?: boolean }).encrypted)

    // ---------------------------------------------------------------- Zugang per Code (auch ohne Anmeldung)
    if (req.method === 'GET' && url.pathname === '/s/api/vokabeln/zugang') {
      const z = nachCode(String(url.searchParams.get('code') ?? ''))
      if (!z || !istOffen(z)) return json(res, 404, { fehler: 'Dieses Vokabeltraining gibt es nicht (mehr). Bitte den Code prüfen.' }), true
      return (
        json(res, 200, {
          id: z.id,
          nurGrammatik: json_(z.woerter, [] as unknown[]).length === 0,
          titel: titelFuerLernende(z),
          gaeste: !iservBereit(),
          dabei: Boolean(sitzung && vokIstFuer(z, sitzung.nutzer)),
          bis: z.bis
        }),
        true
      )
    }
    // Anmelden mit persönlichem Code (08.10.2026, Zettel der Lehrkraft): öffnet alle Trainings dieses Kontos
    if (req.method === 'POST' && url.pathname === '/s/api/vokabeln/anmelden') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      const roh = String(k0.code ?? '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
      const zeilen =
        roh.length === 8
          ? (db().prepare('SELECT zuweisung_id, nutzer_id FROM vok_gaeste WHERE anmelde = ?').all(hashVon(roh)) as {
              zuweisung_id: string
              nutzer_id: string
            }[])
          : []
      const offen = zeilen
        .map((g) => ({ g, z: zeile(g.zuweisung_id) }))
        .filter((x): x is { g: (typeof zeilen)[number]; z: Zeile } => Boolean(x.z && istOffen(x.z)))
      if (!offen.length) return json(res, 404, { fehler: 'Diesen Code gibt es nicht (mehr). Bitte den Code prüfen.' }), true
      const dauer = Math.max(...offen.map((x) => gastDauer(x.z)))
      const neu = sitzungAnlegen(offen[0].g.nutzer_id, 'schueler', dauer)
      setzeSitzungsCookie(res, neu.cookie, dauer, sicher)
      protokolliereServer('vokabeln', 'Anmeldung mit persönlichem Code', offen[0].g.nutzer_id)
      return json(res, 200, { ok: true, id: offen.length === 1 ? offen[0].z.id : '', anzahl: offen.length }), true
    }
    if (req.method === 'POST' && (url.pathname === '/s/api/vokabeln/gast' || url.pathname === '/s/api/vokabeln/wieder')) {
      const k0 = (await k.koerper()) as Record<string, unknown>
      const z = nachCode(String(k0.code ?? ''))
      if (!z || !istOffen(z)) return json(res, 404, { fehler: 'Dieses Vokabeltraining gibt es nicht (mehr). Bitte den Code prüfen.' }), true
      if (sitzung && vokIstFuer(z, sitzung.nutzer)) return json(res, 200, { ok: true, id: z.id }), true
      // Lernende mit Konto kommen über den Code dazu – ohne Wiedereinstiegs-Code, ihr Konto reicht
      if (sitzung && sitzung.nutzer.quelle !== 'gast' && sitzung.nutzer.rolle === 'schueler') {
        db().prepare('INSERT OR IGNORE INTO vok_gaeste (zuweisung_id, nutzer_id, wieder) VALUES (?, ?, ?)').run(z.id, sitzung.nutzer.id, '')
        return json(res, 200, { ok: true, id: z.id }), true
      }
      if (iservBereit()) return json(res, 403, { fehler: 'Bitte mit IServ anmelden.' }), true
      const name = gastName(k0.name)
      if (!name) return json(res, 400, { fehler: 'Bitte Vorname und Anfangsbuchstaben des Nachnamens eingeben, z. B. „Anna K.“' }), true
      const gaeste = gaesteVon(z.id).filter((n) => n.quelle === 'gast')
      const gleich = gaeste.find((n) => n.name.toLowerCase() === name.toLowerCase())
      if (url.pathname === '/s/api/vokabeln/wieder') {
        // Weiterlernen an einem anderen Tag oder Gerät: Name + persönlicher Code
        const soll = gleich
          ? (db().prepare('SELECT wieder FROM vok_gaeste WHERE zuweisung_id = ? AND nutzer_id = ?').get(z.id, gleich.id) as { wieder: string } | undefined)
              ?.wieder
          : undefined
        const ist = hashVon(String(k0.wieder ?? ''))
        if (!gleich || !soll || soll.length !== ist.length || !timingSafeEqual(Buffer.from(soll), Buffer.from(ist)))
          return json(res, 403, { fehler: 'Name und persönlicher Code passen nicht zusammen.' }), true
        const neu = sitzungAnlegen(gleich.id, 'schueler', gastDauer(z))
        setzeSitzungsCookie(res, neu.cookie, gastDauer(z), sicher)
        protokolliereServer('vokabeln', 'Wiedereinstieg mit persönlichem Code', gleich.id)
        return json(res, 200, { ok: true, id: z.id }), true
      }
      if (gleich)
        return (
          json(res, 409, {
            fehler: `„${name}“ ist schon dabei. Zum Weiterlernen unten „Schon dabei?“ wählen – oder einen zweiten Buchstaben des Nachnamens dazunehmen, z. B. „Anna Ko.“`
          }),
          true
        )
      if (gaeste.length >= 120) return json(res, 429, { fehler: 'Für dieses Training sind schon zu viele Gäste angemeldet.' }), true
      const gast = nutzerAnlegen({ benutzer: `gast-${randomBytes(6).toString('hex')}`, name, rolle: 'schueler', quelle: 'gast' })
      registerVergessen()
      const wieder = neuerCode(6)
      db().prepare('INSERT INTO vok_gaeste (zuweisung_id, nutzer_id, wieder, code_v) VALUES (?, ?, ?, ?)').run(z.id, gast.id, hashVon(wieder), wieder)
      const neu = sitzungAnlegen(gast.id, 'schueler', gastDauer(z))
      setzeSitzungsCookie(res, neu.cookie, gastDauer(z), sicher)
      protokolliereServer('vokabeln', 'Beitritt mit Namen (ohne IServ)', gast.id)
      return json(res, 200, { ok: true, id: z.id, wieder }), true
    }

    if (!sitzung) return json(res, 401, { fehler: 'Nicht angemeldet.' }), true
    const ich = sitzung.nutzer

    // ---------------------------------------------------------------- Lernende
    if (schueler) {
      if (req.method === 'GET' && url.pathname === '/s/api/vokabeln') return json(res, 200, { listen: vokabelListenFuer(ich) }), true
      const id = req.method === 'GET' ? String(url.searchParams.get('id') ?? '') : String(((await k.koerper()) as Record<string, unknown>).id ?? '')
      const z = zeile(id)
      if (!z || !vokIstFuer(z, ich)) return json(res, 404, { fehler: 'Diese Vokabeln sind nicht für dich freigegeben.' }), true
      const woerter = json_(z.woerter, [] as Vokabel[])
      const st = standVon(z.id, ich.id)
      if (req.method === 'GET' && url.pathname === '/s/api/vokabeln/liste')
        return (
          json(res, 200, {
            id: z.id,
            titel: titelFuerLernende(z),
            sprache: z.sprache,
            fach: z.fach,
            testTermin: z.test_termin,
            woerter,
            staende: st.woerter,
            farbe: await fachfarbeDerLehrkraft(z),
            // Spiele heute schon vor der Tagesrunde (Freischaltung der Lehrkraft, 08.10.2026)
            spieleFrei: spieleHeuteFrei(z),
            tagesziel: tageszielVon(z),
            // Unregelmäßige Verben der Liste (07.10.2026) – erst ab bekannter Vergangenheit oder per Schalter (08.10.2026)
            verben: verbenFrei(z.sprache, kursHaken.bekannt?.(ich) ?? [], z.verbspiele ?? '')
              ? json_(z.verben, null as unknown) ?? standardVerben(woerter, z.sprache)
              : null,
            // Klasse der Lernenden (Bildstufe der Beispielbilder, 07.10.2026): aus der Lerngruppe, sonst aus den eigenen Gruppen
            klasse: klasseFuer(z, ich),
            rekorde: st.rekorde ?? {},
            ansehen: st.ansehen ?? []
          }),
          true
        )
      // Spiel beendet: Rekord und „nochmal ansehen" – der Karteikasten bleibt unverändert (abgestimmt 03.10.2026)
      if (req.method === 'POST' && url.pathname === '/s/api/vokabeln/spiel') {
        const r = spielEintragen(st, (await k.koerper()) as Record<string, unknown>, (wid) => woerter.some((w) => w.id === wid), { ich, klasse: klasseFuer(z, ich) })
        if (!r) return json(res, 400, { fehler: 'Unbekanntes Spiel.' }), true
        standSpeichern(z.id, ich.id, st)
        return json(res, 200, { rekord: r.rekord, rekorde: st.rekorde ?? {}, ansehen: st.ansehen }), true
      }
      if (req.method === 'POST' && url.pathname === '/s/api/vokabeln/antwort') {
        if (!istOffen(z)) return json(res, 409, { fehler: 'Diese Liste ist abgeschlossen.' }), true
        const k0 = (await k.koerper()) as Record<string, unknown>
        const v = woerter.find((w) => w.id === k0.wortId)
        const r = v ? abfrageAuswerten(v, k0, st, z.test_termin ?? undefined, { ich, klasse: klasseFuer(z, ich) }) : null
        if (!r) return json(res, 400, { fehler: 'Unbekannte Abfrage.' }), true
        standSpeichern(z.id, ich.id, st)
        const { ergebnis, neu } = r
        return json(res, 200, { ...ergebnis, stand: neu, sicher: istSicher(neu) }), true
      }
      return json(res, 404, { fehler: 'Unbekannt.' }), true
    }

    // ---------------------------------------------------------------- Lehrkraft
    if (ich.rolle === 'schueler') return json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true
    const teile = url.pathname.split('/').filter(Boolean).slice(2)
    if (req.method === 'GET' && teile.length === 0) {
      // Sprachenlernen (08.10.2026): Grammatiktrainings ohne Kurs werden einmalig zu Kursen
      kursHaken.vorListe?.(ich.id)
      // Jede eigene Klasse mit Fremdsprache hat einen Kurs (08.10.2026) – fehlt er, entsteht ein leerer
      try {
        klassenKurseSichern(ich.id)
      } catch (e) {
        protokolliereServer('vokabeln', `Kurse für Klassen nicht angelegt: ${e instanceof Error ? e.message : String(e)}`, ich.id)
      }
      const liste = db().prepare("SELECT * FROM vok_zuweisungen WHERE lehrkraft_id = ? AND reihe = '' ORDER BY erstellt DESC").all(ich.id) as unknown as Zeile[]
      return (
        json(res, 200, {
          zuweisungen: liste.map((z) => {
            const woerter = json_(z.woerter, [] as Vokabel[])
            const lernende = lernendeVon(z)
            const ue = lernende.map((n) => uebersicht(woerter, standVon(z.id, n.id).woerter))
            const sicher = ue.map((u) => u.sicher)
            return {
              id: z.id,
              titel: z.titel,
              ueberschrift: ueberschriftVon(z),
              eigeneUeberschrift: Boolean(z.ueberschrift),
              symbol: z.symbol === 'farbe' ? 'farbe' : 'verlauf',
              // Wörter je Fach über alle Lernenden – für den Verlauf im Symbol
              faecher: ue.reduce((s, u) => s.map((n, i) => n + (u.faecher[i] ?? 0)), [0, 0, 0, 0, 0, 0, 0]),
              fach: z.fach,
              lerngruppe: z.lerngruppe_id
                ? lerngruppe(z.lerngruppe_id)?.name ?? ''
                : z.code && !json_(z.schueler, [] as string[]).length
                ? 'Per QR-Code'
                : 'Einzelne Lernende',
              woerter: woerter.length,
              lernende: lernende.length,
              sicherSchnitt: lernende.length && woerter.length ? sicher.reduce((a, b) => a + b, 0) / lernende.length / woerter.length : 0,
              testTermin: z.test_termin,
              status: istOffen(z) ? 'offen' : 'beendet',
              erstellt: z.erstellt,
              bis: z.bis,
              gaeste: gaesteVon(z.id).filter((n) => n.quelle === 'gast').length,
              grammatik: kursHaken.grammatikZahl?.(z.id) ?? 0,
              ...(z.code ? { code: z.code, link: link(z.code) } : {})
            }
          })
        }),
        true
      )
    }
    if (req.method === 'POST' && teile[0] === 'freigeben') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      const gid = String(k0.lerngruppeId ?? '')
      const g = gid ? lerngruppe(gid) : null
      if (gid && (!g || g.lehrkraft_id !== ich.id)) return json(res, 400, { fehler: 'Bitte eine eigene Lerngruppe wählen.' }), true
      const erlaubt = new Set((g ? mitgliederVon(g) : alleLernenden()).map((n) => n.benutzer))
      const einzelne = Array.isArray(k0.schueler) ? [...new Set((k0.schueler as unknown[]).map(String).filter((b) => erlaubt.has(b)))] : []
      const mitGaesten = k0.gaeste === true
      if (!g && !einzelne.length && !mitGaesten)
        return json(res, 400, { fehler: 'Bitte eine Lerngruppe, einzelne Lernende oder den Zugang per QR-Code wählen.' }), true
      const bis = typeof k0.bis === 'number' && k0.bis > Date.now() ? k0.bis : null
      try {
        const id = vokabelnZuweisen({
          lehrkraftId: ich.id,
          lerngruppeId: g?.id ?? '',
          schueler: einzelne,
          titel: String(k0.titel ?? 'Vokabeln'),
          sprache: String(k0.sprache ?? ''),
          fach: String(k0.fach ?? ''),
          woerter: k0.woerter,
          leer: k0.nurGrammatik === true,
          verben: k0.verben,
          testTermin: typeof k0.testTermin === 'number' ? k0.testTermin : null,
          gaeste: mitGaesten,
          bis,
          quelle: k0.quelle,
          teile: k0.teile
        })
        // Leerer Kurs der Klasse (automatisch angelegt, 08.10.2026) wird gefüllt statt daneben einen zweiten anzulegen
        const ziel = g && !einzelne.length ? leerenKursFuellen(id, ich.id, g.id) : id
        protokolliereServer('vokabeln', 'Vokabeln zum Lernen freigegeben', ich.id)
        return json(res, 200, { id: ziel }), true
      } catch (e) {
        return json(res, 400, { fehler: e instanceof Error ? e.message : String(e) }), true
      }
    }
    const z = teile[0] ? zeile(teile[0]) : null
    if (!z || z.lehrkraft_id !== ich.id) return json(res, 404, { fehler: 'Unbekannt.' }), true
    if (req.method === 'GET' && teile.length === 1) {
      const woerter = json_(z.woerter, [] as Vokabel[])
      const jetzt = Date.now()
      const vor7 = new Date(jetzt - 7 * TAG).toISOString().slice(0, 10)
      // Per Code/QR beigetreten – lässt sich wieder entfernen (05.10.2026)
      const gastZeilen = db().prepare('SELECT nutzer_id, code_v FROM vok_gaeste WHERE zuweisung_id = ?').all(z.id) as { nutzer_id: string; code_v: string }[]
      const perCode = new Set(gastZeilen.map((g) => g.nutzer_id))
      // Persönlicher Zugangscode je Gast – die Lehrkraft sieht ihn per Klick auf den Namen (08.10.2026)
      const codes = new Map(gastZeilen.map((g) => [g.nutzer_id, g.code_v]))
      const lernende = lernendeVon(z).map((n) => {
        const st = standVon(z.id, n.id)
        return {
          id: n.id,
          name: n.name || n.benutzer,
          gast: n.quelle === 'gast',
          perCode: perCode.has(n.id),
          ...(n.quelle === 'gast' ? { zugang: codes.get(n.id) ?? '' } : {}),
          uebersicht: uebersicht(woerter, st.woerter, jetzt),
          tage7: st.tage.filter((t) => t >= vor7).length,
          // In 7 Tagen neu gelernt bzw. wiederholt (08.10.2026, statt nur der Übungstage); ältere Stände ohne
          // „erstmals": höchstens zwei Abfragen gelten als neu
          // Nur die Wörter des Kurses – entfernte Abschnitte zählen nicht (08.10.2026)
          ...sieben(nurAktuell(st.woerter, woerter), jetzt),
          // Sprachenlernen (08.10.2026): Stärken/Schwächen in Grammatik und laufende Extra-Aufgaben
          grammatik: kursHaken.profil?.(n, z.sprache, z.lehrkraft_id),
          stand: st.woerter
        }
      })
      // Problemwörter: höchste Fehlerquote über die Lerngruppe, mit typischen Falschantworten; aus der Liste
      // genommene erst wieder bei neuen Fehlern (08.10.2026), die 12 erst nach dem Ausblenden
      const problem = ausgeblendetFiltern(
        problemWoerter(woerter, lernende.map((l) => l.stand)),
        json_(z.problem_aus, {} as Record<string, number>)
      ).sichtbar.slice(0, 12)
      return (
        json(res, 200, {
          id: z.id,
          titel: z.titel,
          ueberschrift: ueberschriftVon(z),
          fach: z.fach,
          sprache: z.sprache,
          testTermin: z.test_termin,
          status: istOffen(z) ? 'offen' : 'beendet',
          bis: z.bis,
          spieleFrei: spieleHeuteFrei(z),
          verbspiele: z.verbspiele ?? '',
          zusammen: z.zusammen !== 'aus',
          tagesziel: tageszielVon(z),
          // Freigegebene Abschnitte (08.10.2026)
          teile: woerter.length ? teileVon(z) : [],
          // Entfernte Abschnitte (08.10.2026): Lernstand gespeichert, kommt beim erneuten Hinzufügen zurück
          entfernt: entferntVon(z).map((e) => ({ teil: e.teil, anzahl: e.woerter.length, zeit: e.zeit })),
          lerngruppeId: z.lerngruppe_id,
          // Lehrwerk und Unit – für „Grammatik dazu freigeben" (08.10.2026)
          quelle: json_(z.quelle ?? '', null as unknown),
          // Adresse der Lernseite – für die Zettel (08.10.2026)
          adresse: adresse.replace(/\/$/, ''),
          ...(z.code ? { code: z.code, link: link(z.code) } : {}),
          lerngruppe: z.lerngruppe_id
            ? lerngruppe(z.lerngruppe_id)?.name ?? ''
            : z.code && !json_(z.schueler, [] as string[]).length
            ? 'Per QR-Code'
            : 'Einzelne Lernende',
          woerter,
          lernende: lernende.map(({ stand: _s, ...rest }) => rest),
          gesamt: uebersicht(
            woerter.flatMap((v) => lernende.map((l) => ({ ...v, id: `${l.id}:${v.id}` }))),
            Object.fromEntries(lernende.flatMap((l) => Object.entries(l.stand).map(([wid, s]) => [`${l.id}:${wid}`, s]))),
            jetzt
          ),
          problem
        }),
        true
      )
    }
    // Lernende einer Klasse zuordnen (08.10.2026): Vorschau für den Dialog – je eigene Lerngruppe, wer schon dazugehört
    if (req.method === 'GET' && teile[1] === 'klasse-zuordnen') {
      const lernende = zuordenbareLernende(z)
      return (
        json(res, 200, {
          lerngruppeId: z.lerngruppe_id,
          lernende: lernende.map((n) => ({ id: n.id, name: n.name || n.benutzer, gast: n.quelle === 'gast' })),
          gruppen: lerngruppenVon(ich.id).map((g) => ({
            id: g.id,
            name: g.name,
            fach: g.fach,
            schon: lernende.filter((n) => schonMitglied(g, n)).map((n) => n.id),
            verknuepfbar: !z.lerngruppe_id && verknuepfenOhneFolgen(z, g, lernende)
          }))
        }),
        true
      )
    }
    if (req.method === 'POST') {
      const k0 = (await k.koerper()) as Record<string, unknown>
      // Lernende einer Klasse zuordnen (08.10.2026): Konten und Codes bleiben unverändert (vok_gaeste, Sitzungen, Namen) –
      // die Lernenden stehen danach zusätzlich in der Lerngruppe und sehen deren Freigaben. Auf Wunsch wird das Training mit
      // der Lerngruppe verbunden, aber nur, wenn das an den Zugängen nichts ändert.
      if (teile[1] === 'klasse-zuordnen') {
        const g = lerngruppe(String(k0.lerngruppeId ?? ''))
        if (!g || g.lehrkraft_id !== ich.id) return json(res, 400, { fehler: 'Bitte eine eigene Lerngruppe wählen.' }), true
        const lernende = zuordenbareLernende(z)
        if (!lernende.length) return json(res, 400, { fehler: 'In diesem Training sind noch keine Lernenden.' }), true
        const verknuepfen = k0.verknuepfen === true && !z.lerngruppe_id
        if (verknuepfen && !verknuepfenOhneFolgen(z, g, lernende))
          return json(res, 409, { fehler: 'Die Lerngruppe hat weitere Mitglieder – mit ihr verbunden, bekämen sie das Training auch. Bitte ohne Verbinden zuordnen.' }), true
        const dazu = lerngruppeErgaenzen(g, lernende.filter((n) => !schonMitglied(g, n)).map((n) => n.benutzer))
        if (verknuepfen) db().prepare('UPDATE vok_zuweisungen SET lerngruppe_id = ? WHERE id = ?').run(g.id, z.id)
        protokolliereServer('vokabeln', `${dazu.length} Lernende einer Lerngruppe zugeordnet${verknuepfen ? ' (Training verbunden)' : ''}`, ich.id)
        return json(res, 200, { ok: true, dazu: dazu.length, schon: lernende.length - dazu.length, verknuepft: verknuepfen }), true
      }
      if (teile[1] === 'termin') {
        db()
          .prepare('UPDATE vok_zuweisungen SET test_termin = ? WHERE id = ?')
          .run(typeof k0.testTermin === 'number' ? k0.testTermin : null, z.id)
        return json(res, 200, { ok: true }), true
      }
      // Problemwort aus der Liste nehmen (08.10.2026): gemerkt wird die jetzige Fehlerzahl – steigt sie, kommt es wieder
      if (teile[1] === 'problem-aus') {
        const wid = String(k0.id ?? '')
        const alle = problemWoerter(
          json_(z.woerter, [] as Vokabel[]),
          lernendeVon(z).map((n) => standVon(z.id, n.id).woerter)
        )
        const p = alle.find((x) => x.id === wid)
        if (!p) return json(res, 404, { fehler: 'Dieses Wort steht nicht in der Liste.' }), true
        const { gueltig } = ausgeblendetFiltern(alle, json_(z.problem_aus, {} as Record<string, number>))
        gueltig[wid] = p.falsch
        db().prepare('UPDATE vok_zuweisungen SET problem_aus = ? WHERE id = ?').run(JSON.stringify(gueltig), z.id)
        return json(res, 200, { ok: true }), true
      }
      // Spiele für heute freischalten bzw. wieder sperren (08.10.2026, Wunsch der Lehrkraft)
      // Verbspiele: automatisch, immer oder nie (08.10.2026)
      if (teile[1] === 'zusammen') {
        const w = k0.an === false ? 'aus' : ''
        db().prepare('UPDATE vok_zuweisungen SET zusammen = ? WHERE id = ?').run(w, z.id)
        return json(res, 200, { ok: true, zusammen: w !== 'aus' }), true
      }
      if (teile[1] === 'verbspiele') {
        const w = k0.wert === 'an' || k0.wert === 'aus' ? k0.wert : ''
        db().prepare('UPDATE vok_zuweisungen SET verbspiele = ? WHERE id = ?').run(w, z.id)
        return json(res, 200, { ok: true, verbspiele: w }), true
      }
      if (teile[1] === 'spiele') {
        db()
          .prepare('UPDATE vok_zuweisungen SET spiele_frei = ? WHERE id = ?')
          .run(k0.frei === true ? heuteTag() : '', z.id)
        protokolliereServer('vokabeln', k0.frei === true ? 'Spiele für heute freigeschaltet' : 'Spiele-Freischaltung aufgehoben', ich.id)
        return json(res, 200, { ok: true, spieleFrei: k0.frei === true }), true
      }
      // Überschrift umbenennen ('' = Standard) und Symbol umschalten (08.10.2026)
      if (teile[1] === 'ueberschrift') {
        db()
          .prepare('UPDATE vok_zuweisungen SET ueberschrift = ? WHERE id = ?')
          .run(
            String(k0.text ?? '')
              .trim()
              .slice(0, 120),
            z.id
          )
        return json(res, 200, { ok: true }), true
      }
      if (teile[1] === 'symbol') {
        db()
          .prepare('UPDATE vok_zuweisungen SET symbol = ? WHERE id = ?')
          .run(k0.art === 'farbe' ? 'farbe' : '', z.id)
        return json(res, 200, { ok: true }), true
      }
      // Neue Vokabeln je Tag (08.10.2026)
      if (teile[1] === 'tagesziel') {
        const n = tageszielVon({ tagesziel: Number(k0.tagesziel) })
        db().prepare('UPDATE vok_zuweisungen SET tagesziel = ? WHERE id = ?').run(n, z.id)
        return json(res, 200, { ok: true, tagesziel: n }), true
      }
      // Gast: neuen persönlichen Code erzeugen (ältere Gäste haben keinen lesbaren; 08.10.2026)
      if (teile[1] === 'gast-code') {
        const nid = String(k0.id ?? '')
        const g = gaesteVon(z.id).find((n) => n.id === nid && n.quelle === 'gast')
        if (!g) return json(res, 404, { fehler: 'Diese Person ist kein Gast dieses Trainings.' }), true
        const wieder = gastCodeSetzen(nid)
        protokolliereServer('vokabeln', 'Neuer persönlicher Code für einen Gast', ich.id)
        return json(res, 200, { ok: true, zugang: wieder }), true
      }
      // Lernende eintragen (08.10.2026): Gastkonto „Vorname N." mit persönlichem Anmeldecode für den Zettel. Gibt es
      // die Person schon in einem anderen Training dieser Lehrkraft, bekommt sie dasselbe Konto und denselben Code.
      if (teile[1] === 'eintragen') {
        const namen = (Array.isArray(k0.namen) ? (k0.namen as unknown[]) : [])
          .slice(0, 200)
          .map(gastName)
          .filter((n): n is string => Boolean(n))
        const hier = new Set(gaesteVon(z.id).map((n) => n.name.toLowerCase()))
        if (hier.size + namen.length > 200) return json(res, 400, { fehler: 'Höchstens 200 Lernende je Training.' }), true
        const andere = (
          db()
            .prepare(
              "SELECT g.nutzer_id, g.wieder, g.code_v, g.anmelde FROM vok_gaeste g JOIN vok_zuweisungen z ON z.id = g.zuweisung_id WHERE z.lehrkraft_id = ? AND g.anmelde != ''"
            )
            .all(ich.id) as { nutzer_id: string; wieder: string; code_v: string; anmelde: string }[]
        )
          .map((g) => ({ ...g, n: nutzerNachId(g.nutzer_id) }))
          .filter((g) => g.n?.quelle === 'gast')
        const neu: { name: string; zugang: string }[] = []
        for (const name of namen) {
          if (hier.has(name.toLowerCase())) continue
          hier.add(name.toLowerCase())
          const schon = andere.find((g) => g.n!.name.toLowerCase() === name.toLowerCase())
          if (schon) {
            db()
              .prepare('INSERT OR IGNORE INTO vok_gaeste (zuweisung_id, nutzer_id, wieder, code_v, anmelde) VALUES (?, ?, ?, ?, ?)')
              .run(z.id, schon.nutzer_id, schon.wieder, schon.code_v, schon.anmelde)
            neu.push({ name, zugang: schon.code_v })
            continue
          }
          const gast = nutzerAnlegen({ benutzer: `gast-${randomBytes(6).toString('hex')}`, name, rolle: 'schueler', quelle: 'gast' })
          const c = anmeldeCode()
          db()
            .prepare('INSERT INTO vok_gaeste (zuweisung_id, nutzer_id, wieder, code_v, anmelde) VALUES (?, ?, ?, ?, ?)')
            .run(z.id, gast.id, hashVon(c), c, hashVon(c))
          neu.push({ name, zugang: c })
        }
        if (neu.length) registerVergessen()
        protokolliereServer('vokabeln', `${neu.length} Lernende eingetragen`, ich.id)
        return json(res, 200, { ok: true, eingetragen: neu }), true
      }
      // Vokabeln nachträglich hinzufügen (08.10.2026): Lernstand bleibt, neue Wörter kommen als „neu" in den Kasten
      if (teile[1] === 'woerter') {
        const alt = json_(z.woerter, [] as Vokabel[])
        const schluessel = (v: Vokabel): string => `${v.term.trim().toLowerCase()}|${v.translation.trim().toLowerCase()}`
        const da = new Set(alt.map(schluessel))
        // Kennungen entfernter Wörter bleiben reserviert – neue Wörter erben nie fremden Lernstand (08.10.2026)
        const entferntVorher = entferntVon(z)
        const ids = new Set([...alt.map((v) => v.id), ...entfernteKennungen(entferntVorher)])
        const neu: Vokabel[] = []
        const neuTeil: (string | undefined)[] = []
        // Mehrere Abschnitte/Units auf einmal (08.10.2026): je Abschnitt ein Teil, gezählt nach dem Überspringen von Doppeltem
        const rohe = (Array.isArray(k0.woerter) ? (k0.woerter as unknown[]) : []).slice(0, 400)
        const teilGrenzen = (Array.isArray(k0.teile) ? (k0.teile as unknown[]) : []).slice(0, 60).map((t) => {
          const x = (t ?? {}) as Record<string, unknown>
          return { titel: String(x.titel ?? '').slice(0, 160), anzahl: Math.max(0, Math.round(Number(x.anzahl) || 0)) }
        })
        const teilePassen = teilGrenzen.length > 1 && teilGrenzen.every((t) => t.titel && t.anzahl > 0) && teilGrenzen.reduce((s, t) => s + t.anzahl, 0) === rohe.length
        const teilIndex = (i: number): number => {
          let summe = 0
          for (const [j, t] of teilGrenzen.entries()) if (i < (summe += t.anzahl)) return j
          return teilGrenzen.length - 1
        }
        const neuJeTeil = teilGrenzen.map(() => 0)
        for (const [i, roh] of rohe.entries()) {
          const v = bereinigeWoerter([roh])[0]
          if (!v || !v.term.trim() || da.has(schluessel(v))) continue
          da.add(schluessel(v))
          let id = v.id
          for (let n = alt.length + neu.length; ids.has(id); n++) id = `w${n}`
          ids.add(id)
          neu.push({ ...v, id })
          neuTeil.push(teilePassen ? teilGrenzen[teilIndex(i)].titel : String(k0.titel ?? '') || undefined)
          if (teilePassen) neuJeTeil[teilIndex(i)]++
        }
        // Früher entfernte Wörter bekommen ihre alte Kennung zurück – der Lernstand gilt weiter (08.10.2026)
        const wieder = kennungenWiederverwenden(
          neu.map((wort, i) => ({ wort, teil: neuTeil[i] })),
          entferntVorher
        )
        neu.splice(0, neu.length, ...wieder.woerter)
        if (alt.length + neu.length > 1500) return json(res, 400, { fehler: 'Höchstens 1500 Vokabeln je Training.' }), true
        const verbenAlt = json_(z.verben, null as { sprache: string; karten: { id: string }[] } | null)
        const verbenNeu = verbenBereinigt(k0.verben) ? (JSON.parse(verbenBereinigt(k0.verben)) as { sprache: string; karten: { id: string }[] }) : null
        const verben =
          verbenAlt && verbenNeu
            ? { ...verbenAlt, karten: [...verbenAlt.karten, ...verbenNeu.karten.filter((k) => !verbenAlt.karten.some((a) => a.id === k.id))] }
            : verbenAlt ?? verbenNeu
        const jetzt = Date.now()
        const teile = [
          // Leerer Kurs (z. B. automatisch für eine Klasse angelegt): sein „Titel-Teil" ohne Wörter fällt weg
          ...(alt.length ? teileVon(z) : []),
          ...(!neu.length
            ? []
            : teilePassen
            ? teilGrenzen.map((t, j) => ({ titel: t.titel, anzahl: neuJeTeil[j], zeit: jetzt })).filter((t) => t.anzahl > 0)
            : [{ titel: String(k0.titel ?? 'Weitere Vokabeln').slice(0, 160), anzahl: neu.length, zeit: jetzt }])
        ]
        // Herkunft fortschreiben (08.10.2026): weitere Units zählen für „bekannte Grammatik", Vokabelweg und Abzeichen
        const quelle = neu.length ? quelleZusammen(z.quelle ?? '', quelleBereinigt(k0.quelle)) : z.quelle ?? ''
        db()
          .prepare('UPDATE vok_zuweisungen SET woerter = ?, verben = ?, teile = ?, quelle = ?, entfernt = ? WHERE id = ?')
          .run(
            JSON.stringify([...alt, ...neu]),
            verben ? JSON.stringify(verben) : z.verben ?? '',
            JSON.stringify(teile),
            quelle,
            wieder.entfernt.length ? JSON.stringify(wieder.entfernt) : '',
            z.id
          )
        return json(res, 200, { ok: true, neu: neu.length, wieder: wieder.wieder }), true
      }
      /*
       * Abschnitt entfernen (08.10.2026, abgestimmt): die Wörter verlassen die Wortliste, der Lernstand bleibt – kommt der
       * Abschnitt wieder dazu, gilt er weiter. „Endgültig löschen" (auch für schon entfernte) löscht den Lernstand mit.
       */
      if (teile[1] === 'abschnitt-entfernen' || teile[1] === 'abschnitt-loeschen') {
        const endgueltig = teile[1] === 'abschnitt-loeschen'
        const woerter = json_(z.woerter, [] as Vokabel[])
        let entfernt = entferntVon(z)
        let weg: Vokabel[] = []
        if (endgueltig && typeof k0.entfernt === 'number') {
          // schon entfernter Abschnitt
          const e = entfernt[k0.entfernt]
          if (!e || (typeof k0.titel === 'string' && e.teil !== k0.titel)) return json(res, 404, { fehler: 'Diesen Abschnitt gibt es nicht (mehr).' }), true
          weg = e.woerter
          entfernt = entfernt.filter((_, i) => i !== k0.entfernt)
          db().prepare('UPDATE vok_zuweisungen SET entfernt = ? WHERE id = ?').run(entfernt.length ? JSON.stringify(entfernt) : '', z.id)
        } else {
          const tl = woerter.length ? teileVon(z) : []
          const i = Math.round(Number(k0.index))
          if (!tl[i] || (typeof k0.titel === 'string' && tl[i].titel !== k0.titel)) return json(res, 404, { fehler: 'Diesen Abschnitt gibt es nicht (mehr).' }), true
          const r = teilEntfernen(woerter, tl, i, Date.now())!
          weg = r.entfernt.woerter
          if (!endgueltig) entfernt = [...entfernt, r.entfernt]
          db()
            .prepare('UPDATE vok_zuweisungen SET woerter = ?, teile = ?, entfernt = ? WHERE id = ?')
            .run(JSON.stringify(r.woerter), r.teile.length ? JSON.stringify(r.teile) : '', entfernt.length ? JSON.stringify(entfernt) : '', z.id)
        }
        if (endgueltig) lernstandLoeschen(z.id, weg.map((v) => v.id))
        protokolliereServer('vokabeln', `Abschnitt ${endgueltig ? 'endgültig gelöscht' : 'entfernt'} (${weg.length} Wörter)`, ich.id)
        return json(res, 200, { ok: true, woerter: weg.length }), true
      }
      if (teile[1] === 'zeitraum') {
        db()
          .prepare('UPDATE vok_zuweisungen SET bis = ? WHERE id = ?')
          .run(typeof k0.bis === 'number' ? k0.bis : null, z.id)
        return json(res, 200, { ok: true }), true
      }
      if (teile[1] === 'status') {
        const auf = k0.status !== 'beendet'
        db()
          .prepare('UPDATE vok_zuweisungen SET status = ? WHERE id = ?')
          .run(auf ? 'offen' : 'beendet', z.id)
        // Wieder öffnen nach abgelaufenem Zeitraum: Zeitraum aufheben
        if (auf && z.bis && z.bis < Date.now()) db().prepare('UPDATE vok_zuweisungen SET bis = NULL WHERE id = ?').run(z.id)
        return json(res, 200, { ok: true }), true
      }
      if (teile[1] === 'gast-entfernen') {
        const ok = gastEntfernen(
          { tabelle: 'vok_gaeste', spalte: 'zuweisung_id', freigabeId: z.id, stand: [{ tabelle: 'vok_stand', spalte: 'zuweisung_id' }] },
          String(k0.id ?? ''),
          ich.id
        )
        return ok ? (json(res, 200, { ok: true }), true) : (json(res, 404, { fehler: 'Diese Person ist nicht per Code beigetreten.' }), true)
      }
      if (teile[1] === 'loeschen') {
        // Gastkonten, die nur für dieses Training angelegt wurden, gehen mit
        const gaeste = gaesteVon(z.id).filter((n) => n.quelle === 'gast')
        db().prepare('DELETE FROM vok_zuweisungen WHERE id = ?').run(z.id)
        // Eingetragene Lernende in weiteren Trainings behalten ihr Konto (08.10.2026)
        for (const n of gaeste) if (!db().prepare('SELECT 1 FROM vok_gaeste WHERE nutzer_id = ?').get(n.id)) nutzerLoeschen(n.id)
        return json(res, 200, { ok: true }), true
      }
    }
    return json(res, 404, { fehler: 'Unbekannt.' }), true
  }
}

/**
 * „Meine Klassen" (06.10.2026): Vokabeltrainings einer Lerngruppe – Anteil sicherer Wörter je Person, letzter Übungstag,
 * Testtermin und die wackeligsten Wörter der ganzen Gruppe (Grundlage für den Vorschlag „Wackelige Wörter").
 * Runde 2 (06.10.2026): auch beendete Trainings (Status), Umfang, Zeitraum, Lehrwerk, aktive Lernende der letzten
 * 7 Tage und die schwierigsten Wörter je Training mit typischer Falschantwort. Lernstand je Person und „wackelig"
 * nur aus den laufenden Trainings (Handlungsbedarf).
 */
export function vokabelnDerGruppe(
  lehrkraftId: string,
  lerngruppeId: string,
  jetzt = Date.now()
): {
  trainings: {
    id: string
    titel: string
    sprache: string
    fach: string
    testTermin: number | null
    sicherSchnitt: number
    status: 'offen' | 'beendet'
    erstellt: string
    bis: number | null
    woerter: number
    quelle: string
    lernende: number
    aktiv7: number
    probleme: { term: string; translation: string; quote: number; typisch: string[] }[]
    /** Kurs-Karte in „Meine Klassen" (08.10.2026): Anteile aller Wörter aller Lernenden – sicher, im Aufbau (kennengelernt), neu */
    anteil: { sicher: number; aufbau: number; neu: number }
    /** Lernende, die heute geübt haben */
    heuteAktiv: number
    /** Erster Übungstag eines Lernenden in diesem Kurs (JJJJ-MM-TT) – wie lange schon geübt wird */
    ersterTag: string | null
    /** Wörter, die seit mindestens 14 Tagen freigegeben sind („sicher" braucht zwei Treffer im Abstand einer Woche) */
    reifeWoerter: number
  }[]
  jePerson: Record<string, { sicher: number; gesamt: number; zuletzt: string | null; reifSicher: number; reifGesamt: number }>
  /** `kurs` und `id`: wo das Wort steht (erster offener Kurs) – „Im Kurs wiederholen" in „Meine Klassen" (09.10.2026) */
  wackelig: { term: string; translation: string; example?: string; quote: number; sprache: string; fach: string; betroffen: number; kurs: string; id: string }[]
} {
  const zs = db()
    .prepare("SELECT * FROM vok_zuweisungen WHERE lehrkraft_id = ? AND lerngruppe_id = ? AND reihe = '' ORDER BY erstellt DESC")
    .all(lehrkraftId, lerngruppeId) as unknown as Zeile[]
  const jePerson: Record<string, { sicher: number; gesamt: number; zuletzt: string | null; reifSicher: number; reifGesamt: number }> = {}
  // Wackelige Wörter der Klasse (08.10.2026, abgestimmt): nur aktuell wackelig (Fach 1–2, Fehler, in den letzten 14 Tagen geübt),
  // Rang: Test in den nächsten 14 Tagen → bei wie vielen Kindern wackelig → wie oft falsch → Fehlerquote; höchstens 20
  const woerterFehler = new Map<
    string,
    { v: Vokabel; versuche: number; falsch: number; sprache: string; fach: string; betroffen: number; testBald: boolean; kurs: string }
  >()
  const vor7 = new Date(jetzt - 7 * TAG).toISOString().slice(0, 10)
  const trainings = zs.map((z) => {
    const offen = istOffen(z)
    const woerter = json_(z.woerter, [] as Vokabel[])
    const anteile: number[] = []
    let aktiv7 = 0
    const jeWort = new Map<string, { v: Vokabel; versuche: number; falsch: number; texte: Map<string, number> }>()
    const lernende = lernendeVon(z)
    // Reife Wörter (08.10.2026): die Abschnitte stehen in Freigabe-Reihenfolge hintereinander in der Wortliste
    const reifGrenze = jetzt - 14 * TAG
    const reifeWoerter = Math.min(
      woerter.length,
      teileVon(z)
        .filter((t) => t.zeit && t.zeit <= reifGrenze)
        .reduce((a, t) => a + t.anzahl, 0)
    )
    const reif = woerter.slice(0, reifeWoerter)
    const heute = new Date(jetzt).toISOString().slice(0, 10)
    let heuteAktiv = 0
    let ersterTag: string | null = null
    const summe = { sicher: 0, aufbau: 0, neu: 0 }
    for (const n of lernende) {
      const st = standVon(z.id, n.id)
      const u = uebersicht(woerter, st.woerter, jetzt)
      anteile.push(u.gesamt ? u.sicher / u.gesamt : 0)
      summe.sicher += u.sicher
      summe.aufbau += u.imAufbau
      summe.neu += u.neu
      if (st.tage.some((t) => t >= vor7)) aktiv7++
      if (st.tage.includes(heute)) heuteAktiv++
      for (const t of st.tage) if (!ersterTag || t < ersterTag) ersterTag = t
      // Leerer Kurs (automatisch für die Klasse angelegt, 08.10.2026): kein Lernstand, kein „nicht geübt"
      if (offen && woerter.length) {
        const p = (jePerson[n.id] ??={ sicher: 0, gesamt: 0, zuletzt: null, reifSicher: 0, reifGesamt: 0 })
        p.sicher += u.sicher
        p.gesamt += u.gesamt
        if (reif.length) {
          p.reifSicher += reif.filter((v) => st.woerter[v.id] && istSicher(st.woerter[v.id])).length
          p.reifGesamt += reif.length
        }
        const letzter = st.tage[st.tage.length - 1] ?? null
        if (letzter && (!p.zuletzt || letzter > p.zuletzt)) p.zuletzt = letzter
      }
      for (const v of woerter) {
        const w = st.woerter[v.id]
        if (!w || !w.versuche) continue
        const j = jeWort.get(v.id) ?? { v, versuche: 0, falsch: 0, texte: new Map<string, number>() }
        j.versuche += w.versuche
        j.falsch += w.falsch
        for (const t of w.fehlerTexte ?? []) j.texte.set(t, (j.texte.get(t) ?? 0) + 1)
        jeWort.set(v.id, j)
        if (!offen) continue
        const k = `${z.sprache}|${v.term}`
        const e = woerterFehler.get(k) ?? { v, versuche: 0, falsch: 0, sprache: z.sprache, fach: z.fach, betroffen: 0, testBald: false, kurs: z.id }
        const aktuellWackelig = w.fach >= 1 && w.fach <= 2 && w.falsch > 0 && jetzt - (w.zuletzt || 0) < 14 * TAG
        if (aktuellWackelig) {
          e.betroffen++
          e.versuche += w.versuche
          e.falsch += w.falsch
        }
        if (z.test_termin && z.test_termin >= jetzt && z.test_termin - jetzt <= 14 * TAG) e.testBald = true
        woerterFehler.set(k, e)
      }
    }
    const q = json_(z.quelle || '{}', {} as Partial<Quelle>)
    return {
      id: z.id,
      titel: z.titel,
      sprache: z.sprache,
      fach: z.fach,
      testTermin: z.test_termin ?? null,
      sicherSchnitt: anteile.length ? anteile.reduce((a, b) => a + b, 0) / anteile.length : 0,
      status: offen ? ('offen' as const) : ('beendet' as const),
      erstellt: z.erstellt,
      bis: z.bis ?? null,
      woerter: woerter.length,
      // Mehrere Units (08.10.2026): „Lehrwerk · Unit 1: … · Unit 2: …"
      quelle: quelleText(q),
      lernende: lernende.length,
      aktiv7,
      anteil: (() => {
        const ges = summe.sicher + summe.aufbau + summe.neu
        return ges ? { sicher: summe.sicher / ges, aufbau: summe.aufbau / ges, neu: summe.neu / ges } : { sicher: 0, aufbau: 0, neu: 1 }
      })(),
      heuteAktiv,
      ersterTag,
      reifeWoerter,
      probleme: [...jeWort.values()]
        .filter((e) => e.versuche >= 3 && e.falsch > 0)
        .sort((a, b) => b.falsch / b.versuche - a.falsch / a.versuche)
        .slice(0, 5)
        .map((e) => ({
          term: e.v.term,
          translation: e.v.translation,
          quote: e.falsch / e.versuche,
          typisch: [...e.texte.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .map(([t]) => t)
        }))
    }
  })
  const wackelig = [...woerterFehler.values()]
    .filter((e) => e.betroffen > 0 && e.falsch > 0)
    .sort(
      (a, b) =>
        Number(b.testBald) - Number(a.testBald) || b.betroffen - a.betroffen || b.falsch - a.falsch || b.falsch / b.versuche - a.falsch / a.versuche
    )
    .slice(0, 20)
    .map((e) => ({
      term: e.v.term,
      translation: e.v.translation,
      ...(e.v.example ? { example: e.v.example } : {}),
      quote: e.falsch / e.versuche,
      sprache: e.sprache,
      fach: e.fach,
      betroffen: e.betroffen,
      kurs: e.kurs,
      id: e.v.id
    }))
  return { trainings, jePerson, wackelig }
}
