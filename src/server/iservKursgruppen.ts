/**
 * Kurse aus IServ als Lerngruppen (10.10.2026, Wunsch der Lehrkraft; Erkennen in shared/iservKurse.ts).
 *
 * Bei jeder Anmeldung über IServ (anmeldung.ts `anmeldeHaken`), beim „Mit IServ abgleichen" und beim Start des Servers:
 *  - je Person die erkannte Klasse und die erkannten Kurse speichern (`iserv_erkannt`, verschlüsselt) – Grundlage für
 *    „Meine Kurse" der Lernenden und das Kürzel der Lehrkraft;
 *  - je Lehrkraft die Kurse, die sie unterrichtet (Mitglied der IServ-Gruppe, Kürzel passt bzw. ist unbekannt), als
 *    Lerngruppe anlegen – verbunden mit der IServ-Gruppe, also mit genau deren Lernenden (onlinetest.ts `gehoertZu`), nicht
 *    mit ganzen Klassen. Fremdsprachen bekommen dabei wie jede Lerngruppe ihren Kurs in „Sprachenlernen"
 *    (`lerngruppenHaken`). Eine vorhandene Lerngruppe, die dieser Kurs ist (gleiche IServ-Gruppe, gleicher Name oder
 *    ≥ 80 % gleiche Lernende), wird nur verknüpft – nie verändert, nie doppelt angelegt;
 *  - Gastkonten mit IServ-Anmeldung (kontoVerknuepfung.ts) tragen keine IServ-Gruppen – sie werden in den Kursgruppen
 *    ihrer IServ-Kurse als Mitglied eingetragen.
 * Was die Lehrkraft ausblendet oder löscht, entsteht nicht wieder (`iserv_kursgruppen`, verschlüsselt). Im neuen Schuljahr
 * folgen die Kursgruppen ihrer IServ-Nachfolgegruppe (schuljahrWechsel.ts); ein schon wartender Kurs bekommt keinen Zwilling.
 */
import { randomBytes } from 'node:crypto'
import {
  eigenesKuerzel,
  gruppenErkennen,
  kursgruppenPlanen,
  kursName,
  type GruppeErkannt,
  type KursVerknuepfung
} from '../shared/iservKurse'
import { alleNutzer, datenbank, nutzerNachId, protokolliereServer, type NutzerInfo } from './datenbank'
import { json, type Anfrage } from './http'
import { lerngruppe, lerngruppeErgaenzen, lerngruppenHaken, lerngruppenVon, mitgliederVon } from './onlinetest'

export type Erkannt = GruppeErkannt & { iservId: string }

export interface PersonErkannt {
  klasse: string
  kurse: Erkannt[]
  /** Lehrkraft: Kürzel aus den Kursen (bzw. eingestellt) */
  kuerzel?: string | null
  /** Lehrkraft: selbst eingestelltes Kürzel (Meine Klassen › IServ-Erkennung) */
  kuerzelEigen?: string
}

export interface KursLink {
  id: string
  lehrkraftId: string
  lerngruppeId: string
  iservId: string
  roh: string
  erkannt: GruppeErkannt
  art: 'angelegt' | 'verknuepft'
  grund?: 'iserv' | 'name' | 'mitglieder'
  verborgen?: boolean
  /** Lerngruppe wurde gelöscht – der Kurs entsteht nicht wieder */
  geloescht?: boolean
  /** Von der Lehrkraft umbenannt */
  eigenerName?: boolean
}

// ---------------------------------------------------------------- Ablage

let bereit = false
const db = () => {
  const d = datenbank()
  if (!bereit) {
    d.exec(`CREATE TABLE IF NOT EXISTS iserv_erkannt (
  nutzer_id TEXT PRIMARY KEY REFERENCES nutzer(id) ON DELETE CASCADE,
  daten TEXT NOT NULL,
  zeit INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS iserv_kursgruppen (
  id TEXT PRIMARY KEY,
  lehrkraft_id TEXT NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  lerngruppe_id TEXT NOT NULL,
  daten TEXT NOT NULL,
  zeit INTEGER NOT NULL
)`)
    bereit = true
  }
  return d
}
/** Nur für Tests: neue Datenbank im Speicher */
export const iservKursgruppenZuruecksetzen = (): void => void (bereit = false)

const lies = <T>(s: string | undefined, r: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : r
  } catch {
    return r
  }
}

export function erkanntVon(nutzerId: string): PersonErkannt | null {
  const z = db().prepare('SELECT daten FROM iserv_erkannt WHERE nutzer_id = ?').get(nutzerId) as { daten: string } | undefined
  return z ? lies<PersonErkannt | null>(z.daten, null) : null
}
function erkanntSchreiben(nutzerId: string, p: PersonErkannt): void {
  db()
    .prepare(
      'INSERT INTO iserv_erkannt (nutzer_id, daten, zeit) VALUES (?, ?, ?) ON CONFLICT (nutzer_id) DO UPDATE SET daten = excluded.daten, zeit = excluded.zeit'
    )
    .run(nutzerId, JSON.stringify(p), Date.now())
}

export function linksVon(lehrkraftId: string): KursLink[] {
  return (db().prepare('SELECT id, lerngruppe_id, daten FROM iserv_kursgruppen WHERE lehrkraft_id = ?').all(lehrkraftId) as {
    id: string
    lerngruppe_id: string
    daten: string
  }[]).flatMap((z) => {
    const d = lies<Omit<KursLink, 'id' | 'lehrkraftId' | 'lerngruppeId'> | null>(z.daten, null)
    return d ? [{ ...d, id: z.id, lehrkraftId, lerngruppeId: z.lerngruppe_id }] : []
  })
}
function linkSchreiben(l: KursLink): void {
  const { id, lehrkraftId, lerngruppeId, ...daten } = l
  db()
    .prepare(
      'INSERT INTO iserv_kursgruppen (id, lehrkraft_id, lerngruppe_id, daten, zeit) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET lerngruppe_id = excluded.lerngruppe_id, daten = excluded.daten, zeit = excluded.zeit'
    )
    .run(id, lehrkraftId, lerngruppeId, JSON.stringify(daten), Date.now())
}
const linkLoeschen = (id: string): void => void db().prepare('DELETE FROM iserv_kursgruppen WHERE id = ?').run(id)

/** Verknüpfung einer Lerngruppe (sichtbar oder verborgen) – null, wenn sie nicht aus IServ erkannt ist */
export const linkDerGruppe = (lehrkraftId: string, gruppeId: string): KursLink | null =>
  linksVon(lehrkraftId).find((l) => l.lerngruppeId === gruppeId && !l.geloescht) ?? null

// ---------------------------------------------------------------- Erkennen und Anlegen

/** Wartende Kursgruppen im Schuljahreswechsel (schuljahrWechsel.ts trägt sich ein): dort kommt die Nachfolge her */
export const kursHaken: { wartend?: (lehrkraftId: string) => { gruppeId: string; roh: string }[] } = {}

/** Klasse und Kurse einer Person speichern */
export function erkennungSpeichern(n: Pick<NutzerInfo, 'id' | 'gruppen' | 'rolle' | 'benutzer'>, gruppen = n.gruppen): PersonErkannt {
  const alle = gruppenErkennen(gruppen)
  const alt = erkanntVon(n.id)
  const klasse =
    alle.find((g) => g.art === 'klasse' && g.iservId.startsWith('klasse:'))?.klassen?.[0] ?? alle.find((g) => g.art === 'klasse')?.klassen?.[0] ?? ''
  const kurse = alle.filter((g) => g.art === 'kurs')
  const p: PersonErkannt = { klasse, kurse }
  if (n.rolle !== 'schueler') {
    if (alt?.kuerzelEigen) p.kuerzelEigen = alt.kuerzelEigen
    p.kuerzel = eigenesKuerzel(kurse, n.benutzer, p.kuerzelEigen)
  }
  erkanntSchreiben(n.id, p)
  return p
}

/** Benutzernamen der Lernenden je IServ-Gruppe (aus ihrer letzten Anmeldung) */
function lernendeJeGruppe(): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const n of alleNutzer())
    if (n.rolle === 'schueler' && !n.gesperrt)
      for (const g of n.gruppen) {
        const l = m.get(g.id) ?? []
        l.push(n.benutzer)
        m.set(g.id, l)
      }
  return m
}

/**
 * Kurse einer Lehrkraft als Lerngruppen sichern. Gelöschte Kursgruppen werden gemerkt (entstehen nicht wieder).
 * Liefert, was neu angelegt bzw. verknüpft wurde.
 */
export function kursgruppenSichern(lehrkraftId: string, jeGruppe: Map<string, string[]> = lernendeJeGruppe()): { angelegt: number; verknuepft: number } {
  const ich = nutzerNachId(lehrkraftId)
  if (!ich || ich.rolle === 'schueler' || ich.gesperrt) return { angelegt: 0, verknuepft: 0 }
  const erkannt = erkennungSpeichern(ich)
  const links = linksVon(lehrkraftId)
  for (const l of links)
    if (!l.geloescht && !lerngruppe(l.lerngruppeId)) {
      l.geloescht = true
      l.verborgen = true
      linkSchreiben(l)
    }
  const gruppen = lerngruppenVon(lehrkraftId)
  const plan = kursgruppenPlanen({
    lehrkraft: { benutzer: ich.benutzer, gruppen: ich.gruppen, kuerzel: erkannt.kuerzelEigen },
    mitglieder: (id) => jeGruppe.get(id) ?? [],
    vorhanden: gruppen.map((g) => ({ id: g.id, name: g.name, fach: g.fach, iserv_gruppe: g.iserv_gruppe, mitglieder: mitgliederVon(g).map((n) => n.benutzer) })),
    bekannt: links.map((l): KursVerknuepfung => ({ iservId: l.iservId, lerngruppeId: l.lerngruppeId, verborgen: l.verborgen }))
  })
  // Im Schuljahreswechsel wartende Kurse: der neue IServ-Kurs (Jahrgang + 1, gleiches Fach und Kürzel) ist ihr Nachfolger
  const wartend = (kursHaken.wartend?.(lehrkraftId) ?? []).flatMap((w) => {
    const l = links.find((x) => x.lerngruppeId === w.gruppeId)
    return l ? [l.erkannt] : []
  })
  const istNachfolger = (p: GruppeErkannt): boolean =>
    wartend.some(
      (w) => w.fachId === p.fachId && w.jahrgang + 1 === p.jahrgang && (w.kuerzel ?? '').toLowerCase() === (p.kuerzel ?? '').toLowerCase()
    )
  let angelegt = 0
  for (const a of plan.anlegen) {
    if (istNachfolger(a.erkannt)) continue
    const id = randomBytes(10).toString('hex')
    datenbank()
      .prepare('INSERT INTO lerngruppen (id, lehrkraft_id, name, fach, iserv_gruppe, mitglieder, erstellt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, lehrkraftId, a.name.slice(0, 80), a.fach.slice(0, 40), a.iservId.slice(0, 120), '[]', new Date().toISOString())
    linkSchreiben({ id: randomBytes(8).toString('hex'), lehrkraftId, lerngruppeId: id, iservId: a.iservId, roh: a.erkannt.roh, erkannt: a.erkannt, art: 'angelegt' })
    angelegt++
  }
  for (const v of plan.verknuepfen)
    linkSchreiben({
      id: randomBytes(8).toString('hex'),
      lehrkraftId,
      lerngruppeId: v.lerngruppeId,
      iservId: v.iservId,
      roh: v.erkannt.roh,
      erkannt: v.erkannt,
      art: 'verknuepft',
      grund: v.grund
    })
  if (angelegt) lerngruppenHaken.geaendert?.(lehrkraftId)
  if (angelegt || plan.verknuepfen.length)
    protokolliereServer('klassen', `Kurse aus IServ erkannt: ${angelegt} Lerngruppen angelegt, ${plan.verknuepfen.length} mit vorhandenen verknüpft`, lehrkraftId)
  return { angelegt, verknuepft: plan.verknuepfen.length }
}

/** Nach der Anmeldung über IServ (anmeldung.ts): erkennen, bei Lehrkräften die Kurse sichern, Gäste in ihre Kurse eintragen */
export function nachIservAnmeldung(n: NutzerInfo, iservGruppen: { id: string; name: string }[]): void {
  if (n.quelle === 'gast') {
    gastInKurseEintragen(n, iservGruppen)
    return
  }
  if (n.rolle === 'schueler') erkennungSpeichern(n)
  else kursgruppenSichern(n.id)
}

/** Gastkonto mit IServ-Anmeldung: in die Kursgruppen seiner IServ-Kurse eintragen (nur Kurse, keine Klassen) */
export function gastInKurseEintragen(n: Pick<NutzerInfo, 'id' | 'benutzer' | 'rolle' | 'gruppen'>, iservGruppen: { id: string; name: string }[]): number {
  const alle = gruppenErkennen(iservGruppen)
  const kurse = new Set(alle.filter((g) => g.art === 'kurs').map((g) => g.iservId))
  erkanntSchreiben(n.id, { klasse: alle.find((g) => g.art === 'klasse')?.klassen?.[0] ?? '', kurse: alle.filter((g) => g.art === 'kurs') })
  if (!kurse.size) return 0
  let n0 = 0
  for (const z of db().prepare('SELECT lehrkraft_id FROM iserv_kursgruppen GROUP BY lehrkraft_id').all() as { lehrkraft_id: string }[])
    for (const l of linksVon(z.lehrkraft_id)) {
      if (l.art !== 'angelegt' || l.verborgen || !kurse.has(l.iservId)) continue
      const g = lerngruppe(l.lerngruppeId)
      if (g && g.iserv_gruppe === l.iservId && lerngruppeErgaenzen(g, [n.benutzer]).length) n0++
    }
  return n0
}

/** Alle Lehrkräfte (Start des Servers, „Mit IServ abgleichen") */
export function alleKursgruppenSichern(): { lehrkraefte: number; angelegt: number; verknuepft: number } {
  const jeGruppe = lernendeJeGruppe()
  const aus = { lehrkraefte: 0, angelegt: 0, verknuepft: 0 }
  for (const n of alleNutzer()) {
    if (n.rolle === 'schueler' || n.gesperrt || !n.gruppen.length) continue
    const r = kursgruppenSichern(n.id, jeGruppe)
    aus.lehrkraefte++
    aus.angelegt += r.angelegt
    aus.verknuepft += r.verknuepft
  }
  return aus
}

// ---------------------------------------------------------------- Korrigieren (Meine Klassen)

/** Erkannt-Angaben der eigenen Lerngruppen (sichtbar) für „Meine Klassen" */
export function kursInfoVon(lehrkraftId: string): Map<string, KursLink> {
  return new Map(linksVon(lehrkraftId).filter((l) => !l.verborgen).map((l) => [l.lerngruppeId, l]))
}

/** Ausgeblendete Lerngruppen (Meine Klassen zeigt sie nicht) */
export const verborgeneGruppen = (lehrkraftId: string): Set<string> =>
  new Set(linksVon(lehrkraftId).filter((l) => l.verborgen && !l.geloescht).map((l) => l.lerngruppeId))

/** Ausgeblendete und gelöschte Kurse zum Wieder-Einblenden */
export function ausgeblendeteKurse(lehrkraftId: string): { id: string; name: string; roh: string; geloescht: boolean }[] {
  return linksVon(lehrkraftId)
    .filter((l) => l.verborgen)
    .map((l) => ({ id: l.id, name: kursName(l.erkannt), roh: l.roh, geloescht: Boolean(l.geloescht) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }))
}

/**
 * „Nicht meine Gruppe" (Meine Klassen): Kurs ausblenden. Selbst angelegte Lerngruppe ohne Material → gelöscht (entsteht nicht
 * wieder); mit Material → nur ausgeblendet (Material bleibt für die Lernenden). Verknüpfte eigene Lerngruppe → bleibt,
 * nur die Verknüpfung fällt weg.
 */
export function kursAusblenden(lehrkraftId: string, gruppeId: string, material: number): 'geloescht' | 'ausgeblendet' | 'getrennt' | null {
  const l = linkDerGruppe(lehrkraftId, gruppeId)
  if (!l) return null
  l.verborgen = true
  if (l.art === 'verknuepft') {
    linkSchreiben(l)
    return 'getrennt'
  }
  if (!material) {
    datenbank().prepare('DELETE FROM lerngruppen WHERE id = ? AND lehrkraft_id = ?').run(gruppeId, lehrkraftId)
    l.geloescht = true
    linkSchreiben(l)
    return 'geloescht'
  }
  datenbank().prepare('UPDATE lerngruppen SET ausgeblendet = 1 WHERE id = ?').run(gruppeId)
  linkSchreiben(l)
  return 'ausgeblendet'
}

/** Wieder einblenden; eine gelöschte Kursgruppe entsteht neu */
export function kursEinblenden(lehrkraftId: string, linkId: string): boolean {
  const l = linksVon(lehrkraftId).find((x) => x.id === linkId)
  if (!l) return false
  if (l.geloescht || !lerngruppe(l.lerngruppeId)) {
    linkLoeschen(l.id)
    kursgruppenSichern(lehrkraftId)
    return true
  }
  l.verborgen = false
  linkSchreiben(l)
  if (l.art === 'angelegt') datenbank().prepare('UPDATE lerngruppen SET ausgeblendet = 0 WHERE id = ?').run(l.lerngruppeId)
  return true
}

/** Lerngruppe umbenennen (Anzeigename); bei erkannten Kursen gemerkt */
export function kursUmbenennen(lehrkraftId: string, gruppeId: string, name: string): string {
  const g = lerngruppe(gruppeId)
  if (!g || g.lehrkraft_id !== lehrkraftId) throw new Error('Diese Lerngruppe gibt es nicht.')
  const neu = name.replace(/\s+/g, ' ').trim().slice(0, 80)
  if (!neu) throw new Error('Bitte einen Namen angeben.')
  datenbank().prepare('UPDATE lerngruppen SET name = ? WHERE id = ?').run(neu, gruppeId)
  const l = linkDerGruppe(lehrkraftId, gruppeId)
  if (l) linkSchreiben({ ...l, eigenerName: true })
  lerngruppenHaken.geaendert?.(lehrkraftId)
  return neu
}

/** Eigenes Kürzel einstellen ('' = wieder automatisch) und die Kurse neu prüfen */
export function kuerzelSetzen(lehrkraftId: string, kuerzel: string): PersonErkannt | null {
  const n = nutzerNachId(lehrkraftId)
  if (!n) return null
  const k = kuerzel.trim().slice(0, 6)
  if (k && !/^[\p{L}]{2,5}\d?$/u.test(k)) throw new Error('Das Kürzel besteht aus 2–5 Buchstaben (z. B. Kon).')
  const alt = erkanntVon(lehrkraftId) ?? { klasse: '', kurse: [] }
  erkanntSchreiben(lehrkraftId, { ...alt, kuerzelEigen: k || undefined })
  kursgruppenSichern(lehrkraftId)
  return erkanntVon(lehrkraftId)
}

/** Nach dem Schuljahreswechsel: die Kursgruppe zeigt auf ihre IServ-Nachfolgegruppe */
export function kursNachfolgeMerken(lehrkraftId: string, gruppeId: string, neu: { id: string; name: string }, erkannt: GruppeErkannt | null): void {
  const l = linkDerGruppe(lehrkraftId, gruppeId)
  if (!l) return
  linkSchreiben({ ...l, iservId: neu.id, roh: neu.name, erkannt: erkannt ?? { ...l.erkannt, jahrgang: l.erkannt.jahrgang + 1, roh: neu.name } })
}

// ---------------------------------------------------------------- Lernende: „Meine Klasse und Kurse"

/**
 *   GET /s/api/iserv-kurse   Klasse und Kurse aus IServ (Lernende; Lehrkräfte bekommen ihre eigenen samt Kürzel)
 */
export function iservKurseRoute(): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { url, req, res, sitzung } = k
    if (url.pathname !== '/s/api/iserv-kurse') return false
    if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
    if (req.method !== 'GET') return (json(res, 405, { fehler: 'Nicht erlaubt.' }), true)
    const ich = nutzerNachId(sitzung.nutzer.id)
    if (!ich) return (json(res, 404, { fehler: 'Unbekannt.' }), true)
    const p = erkanntVon(ich.id) ?? (ich.quelle === 'gast' ? { klasse: '', kurse: [] } : erkennungSpeichern(ich))
    return (
      json(res, 200, {
        klasse: p.klasse,
        kurse: p.kurse.map((x) => ({ name: kursName(x), fach: x.fach ?? '', jahrgang: x.jahrgang, niveau: x.niveau ?? null, klassen: x.klassen ?? [] })),
        ...(ich.rolle !== 'schueler' ? { kuerzel: p.kuerzel ?? null, kuerzelEigen: p.kuerzelEigen ?? '' } : {})
      }),
      true
    )
  }
}
