/**
 * Gastkonto ↔ IServ (09.10.2026, Wunsch der Lehrkraft): Lernende einer Klasse (z. B. 10b) wurden als Gäste mit Code/QR
 * angelegt („Jil v."). Meldet sich so jemand das erste Mal über IServ an, landet die Anmeldung im BISHERIGEN Gastkonto –
 * aller Fortschritt bleibt, der Code bzw. QR-Zugang geht weiter (ein Konto, zwei Wege hinein).
 *
 * Zuordnung bei der ersten IServ-Anmeldung (noch kein Konto zu dieser IServ-Kennung):
 *  - Kandidaten: Gäste (Schüler/in), die Mitglied einer Lerngruppe sind, noch mit keinem IServ-Konto verknüpft, und deren
 *    Name „Vorname N." passt: Vorname gleich, N = Anfangsbuchstabe(n) des ganzen Nachnamens samt „von"/„de" … Gelesen
 *    aus given_name/family_name und aus dem Benutzernamen „jil.von.bargen" (Vorname = erster Teil, Nachname = Rest);
 *    Groß-/Kleinschreibung, Akzente, Umlaut-Umschrift (ae/oe/ue/ss) und Bindestriche egal.
 *  - Klasse: aus den IServ-Gruppen („10b", „Klasse 10b", „klasse.10b") – muss zum Namen der Lerngruppe passen (oder
 *    deren IServ-Gruppe sein).
 *  - Genau ein Kandidat in der eigenen Klasse → automatisch verknüpfen, ohne Rückfrage.
 *  - Mehrere – oder keine Klassenangabe von IServ → normales IServ-Konto und ein Vorschlag an die Lehrkraft
 *    (Meine Klassen › Lernende: „… hat sich mit IServ angemeldet – mit dem bisherigen Konto zusammenführen?").
 *    Bestätigen führt zusammen: Stände, Abgaben, Achievements … wandern ins Gastkonto (bei Doppeltem gilt das des
 *    Gastes), die IServ-Kennung geht ans Gastkonto, das leere IServ-Konto wird entfernt.
 *  - Nie für Lehrkräfte/Admins, nie an einen schon verknüpften Gast. Protokoll ohne Namen.
 *
 * Hinweis: Dieses Modul darf onlinetest.ts nicht importieren (onlinetest → anmeldung → hier); Lerngruppen werden direkt gelesen.
 */
import { alleNutzer, datenbank, iservKennungen, kontoEntfernen, nutzerNachId, protokolliereServer, type NutzerInfo } from './datenbank'
import { kennung } from './feldschutz'

export interface IservIdentitaet {
  /** IServ-Benutzername (klein) */
  benutzer: string
  /** UUID bzw. sub (klein), leer wenn unbekannt */
  sub: string
}

const jetzt = (): string => new Date().toISOString()

// ---------------------------------------------------------------- Verknüpfungen

interface VerknuepfungZeile {
  nutzer_id: string
  benutzer_v: string
  iserv_sub: string | null
}

export function alleVerknuepfungen(): { nutzerId: string; benutzer: string; sub: string }[] {
  return (datenbank().prepare('SELECT nutzer_id, benutzer_v, iserv_sub FROM konto_iserv').all() as unknown as VerknuepfungZeile[]).map((z) => ({
    nutzerId: z.nutzer_id,
    benutzer: String(z.benutzer_v ?? '').toLowerCase(),
    sub: String(z.iserv_sub ?? '').toLowerCase()
  }))
}

export const verknuepfungVon = (nutzerId: string): { benutzer: string; sub: string } | null => alleVerknuepfungen().find((v) => v.nutzerId === nutzerId) ?? null

/** IServ-Identität an ein (Gast-)Konto hängen; eine ältere Verknüpfung desselben IServ-Kontos weicht */
export function verknuepfen(nutzerId: string, id: IservIdentitaet): void {
  const d = datenbank()
  d.prepare('DELETE FROM konto_iserv WHERE benutzer_k = ? AND nutzer_id != ?').run(kennung(id.benutzer), nutzerId)
  d.prepare(
    'INSERT INTO konto_iserv (nutzer_id, benutzer_k, benutzer_v, iserv_sub, erstellt) VALUES (?, ?, ?, ?, ?) ON CONFLICT(nutzer_id) DO UPDATE SET benutzer_k = excluded.benutzer_k, benutzer_v = excluded.benutzer_v, iserv_sub = excluded.iserv_sub'
  ).run(nutzerId, kennung(id.benutzer), id.benutzer, id.sub || null, jetzt())
}

export const verknuepfungLoesen = (nutzerId: string): void => void datenbank().prepare('DELETE FROM konto_iserv WHERE nutzer_id = ?').run(nutzerId)

/** Das mit dieser IServ-Identität verknüpfte Gastkonto (über die Kennung, sonst den Benutzernamen) */
export function gastFuerIserv(id: IservIdentitaet): NutzerInfo | null {
  const alle = alleVerknuepfungen()
  const v = (id.sub && alle.find((x) => x.sub && x.sub === id.sub)) || alle.find((x) => x.benutzer === id.benutzer)
  if (!v) return null
  const n = nutzerNachId(v.nutzerId)
  if (!n || n.quelle !== 'gast') return null
  // Umbenannt in IServ oder Kennung erstmals bekannt: nachziehen
  if (v.benutzer !== id.benutzer || (id.sub && v.sub !== id.sub)) verknuepfen(n.id, { benutzer: id.benutzer, sub: id.sub || v.sub })
  return n
}

// ---------------------------------------------------------------- Namen und Klassen vergleichen

/** klein, ohne Akzente, Umlaute als ae/oe/ue/ss, nur Buchstaben und Ziffern */
export const falte = (s: string): string =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '')

/** Vorname (Wörter) und Nachname einer IServ-Person – aus den Angaben und aus dem Benutzernamen „jil.von.bargen" */
export function namenVarianten(claims: Record<string, unknown>, benutzer: string): { vor: string[]; nach: string }[] {
  const aus: { vor: string[]; nach: string }[] = []
  const woerter = (s: string): string[] => s.split(/[\s-]+/).filter(Boolean)
  const vorname = typeof claims.given_name === 'string' ? claims.given_name.trim() : ''
  const nachname = typeof claims.family_name === 'string' ? claims.family_name.trim() : ''
  if (vorname && nachname) aus.push({ vor: woerter(vorname), nach: nachname })
  else if (typeof claims.name === 'string' && claims.name.trim().includes(' ')) {
    const t = claims.name.trim().split(/\s+/)
    aus.push({ vor: woerter(t[0]), nach: t.slice(1).join(' ') })
  }
  const teile = benutzer.split('.').filter(Boolean)
  if (teile.length >= 2) aus.push({ vor: woerter(teile[0]), nach: teile.slice(1).join('') })
  return aus
}

/** Passt der Gastname „Jil v." / „Anna-Lena Ko." zu einer Namensvariante? */
export function namePasst(gastName: string, varianten: { vor: string[]; nach: string }[]): boolean {
  const m = /^(.+?)\s+(\p{L}{1,3})\.?$/u.exec(gastName.normalize('NFC').trim())
  if (!m) return false
  const vorG = falte(m[1])
  const anfang = falte(m[2])
  if (!vorG || !anfang) return false
  return varianten.some((v) => {
    const vorI = falte(v.vor.join(''))
    const vorOk = vorI === vorG || falte(v.vor[0] ?? '') === vorG
    return vorOk && falte(v.nach).startsWith(anfang)
  })
}

/** „Klasse 10b", „klasse.10b", „10b-englisch" → „10b" (und der ganze gefaltete Text) */
export function klassenAus(gruppen: { id: string; name: string }[]): Set<string> {
  const aus = new Set<string>()
  for (const g of gruppen)
    for (const t of [g.name, g.id]) {
      const roh = String(t ?? '').toLowerCase()
      const ganz = falte(roh.replace(/klasse/g, ''))
      if (ganz) aus.add(ganz)
      for (const m of roh.matchAll(/(?:^|[^a-z0-9])(\d{1,2}\s?[a-z]{0,3})(?=$|[^a-z0-9])/g)) aus.add(falte(m[1]))
    }
  return aus
}

/** Sieht nach Klasse aus: „5a", „10b", „12" */
const KLASSE = /^\d{1,2}[a-z]{0,3}$/

/** Klassenschlüssel einer Lerngruppe („10b", „Klasse 10b" → „10b") */
export const lerngruppenKlasse = (name: string): string => falte(name.toLowerCase().replace(/klasse/g, ''))

interface GruppenZeile {
  id: string
  lehrkraft_id: string
  name: string
  iserv_gruppe: string | null
  mitglieder: string[]
}

function alleLerngruppen(): GruppenZeile[] {
  try {
    return (datenbank().prepare('SELECT id, lehrkraft_id, name, iserv_gruppe, mitglieder FROM lerngruppen').all() as Record<string, unknown>[]).map((z) => {
      let mitglieder: string[] = []
      try {
        mitglieder = JSON.parse(String(z.mitglieder ?? '[]')) as string[]
      } catch {
        mitglieder = []
      }
      return { id: String(z.id), lehrkraft_id: String(z.lehrkraft_id), name: String(z.name ?? ''), iserv_gruppe: (z.iserv_gruppe as string | null) ?? null, mitglieder }
    })
  } catch {
    return [] // noch keine Lerngruppen
  }
}

export interface Zuordnung {
  /** genau ein passender Gast in der eigenen Klasse → automatisch verknüpfen */
  eindeutig: NutzerInfo | null
  /** sonst: Vorschläge an die Lehrkraft */
  vorschlaege: NutzerInfo[]
  klasseBekannt: boolean
}

/** Gastkonto für eine erste IServ-Anmeldung suchen */
export function gastSuchen(claims: Record<string, unknown>, benutzer: string, gruppen: { id: string; name: string }[]): Zuordnung {
  const varianten = namenVarianten(claims, benutzer)
  const klassen = klassenAus(gruppen)
  const gruppenIds = new Set(gruppen.map((g) => g.id))
  // Klassenangabe: eine Gruppe, die nach Klasse aussieht („10b"), oder eine Lerngruppe, die zu den Gruppen passt
  let klasseBekannt = [...klassen].some((t) => KLASSE.test(t))
  const verknuepft = new Set(alleVerknuepfungen().map((v) => v.nutzerId))
  const gaeste = new Map(alleNutzer().filter((n) => n.quelle === 'gast' && n.rolle === 'schueler' && !n.gesperrt && !verknuepft.has(n.id)).map((n) => [n.benutzer, n]))
  const inKlasse = new Map<string, NutzerInfo>()
  const irgendwo = new Map<string, NutzerInfo>()
  for (const g of alleLerngruppen()) {
    const eigene = [...klassenAus([{ id: '', name: g.name }])].filter((t) => KLASSE.test(t))
    const klassePasst =
      klassen.has(lerngruppenKlasse(g.name)) || eigene.some((t) => klassen.has(t)) || Boolean(g.iserv_gruppe && gruppenIds.has(g.iserv_gruppe))
    if (klassePasst) klasseBekannt = true
    for (const b of g.mitglieder) {
      const n = gaeste.get(b)
      if (!n || !namePasst(n.name, varianten)) continue
      irgendwo.set(n.id, n)
      if (klassePasst) inKlasse.set(n.id, n)
    }
  }
  if (klasseBekannt) {
    const k = [...inKlasse.values()]
    return k.length === 1 ? { eindeutig: k[0], vorschlaege: [], klasseBekannt } : { eindeutig: null, vorschlaege: k, klasseBekannt }
  }
  // Ohne Klassenangabe nie automatisch – nur Vorschläge
  return { eindeutig: null, vorschlaege: [...irgendwo.values()], klasseBekannt }
}

// ---------------------------------------------------------------- Vorschläge an die Lehrkraft

export function vorschlaegeAnlegen(iservId: string, gastIds: string[]): void {
  const st = datenbank().prepare("INSERT OR IGNORE INTO konto_vorschlaege (iserv_id, gast_id, status, erstellt) VALUES (?, ?, 'offen', ?)")
  for (const g of gastIds) st.run(iservId, g, jetzt())
}

export interface Vorschlag {
  iservId: string
  iservName: string
  iservBenutzer: string
  gastId: string
  gastName: string
}

/** Offene Vorschläge zu Gästen einer Lerngruppe der Lehrkraft */
export function vorschlaegeFuer(gruppeId: string, lehrkraftId: string): Vorschlag[] {
  const g = alleLerngruppen().find((x) => x.id === gruppeId && x.lehrkraft_id === lehrkraftId)
  if (!g) return []
  const zeilen = datenbank().prepare("SELECT iserv_id, gast_id FROM konto_vorschlaege WHERE status = 'offen'").all() as { iserv_id: string; gast_id: string }[]
  const aus: Vorschlag[] = []
  for (const z of zeilen) {
    const gast = nutzerNachId(z.gast_id)
    const iserv = nutzerNachId(z.iserv_id)
    if (!gast || !iserv || !g.mitglieder.includes(gast.benutzer)) continue
    aus.push({ iservId: iserv.id, iservName: iserv.name, iservBenutzer: iserv.benutzer, gastId: gast.id, gastName: gast.name })
  }
  return aus
}

/** Darf diese Lehrkraft über den Vorschlag entscheiden? (Gast in einer ihrer Lerngruppen, Vorschlag offen) */
function vorschlagPruefen(iservId: string, gastId: string, lehrkraftId: string): { gast: NutzerInfo; iserv: NutzerInfo } | string {
  const offen = datenbank().prepare("SELECT 1 FROM konto_vorschlaege WHERE iserv_id = ? AND gast_id = ? AND status = 'offen'").get(iservId, gastId)
  if (!offen) return 'Diesen Vorschlag gibt es nicht (mehr).'
  const gast = nutzerNachId(gastId)
  const iserv = nutzerNachId(iservId)
  if (!gast || !iserv) return 'Eines der Konten gibt es nicht mehr.'
  if (!alleLerngruppen().some((g) => g.lehrkraft_id === lehrkraftId && g.mitglieder.includes(gast.benutzer))) return 'Nur Lehrkräfte dieser Klasse können zusammenführen.'
  return { gast, iserv }
}

export function vorschlagIgnorieren(iservId: string, gastId: string, lehrkraftId: string): string | null {
  const p = vorschlagPruefen(iservId, gastId, lehrkraftId)
  if (typeof p === 'string') return p
  datenbank().prepare("UPDATE konto_vorschlaege SET status = 'ignoriert' WHERE iserv_id = ? AND gast_id = ?").run(iservId, gastId)
  protokolliereServer('klassen', 'Vorschlag zum Zusammenführen ignoriert', lehrkraftId)
  return null
}

// ---------------------------------------------------------------- Zusammenführen

/** Tabellen, deren Zeilen nicht „wandern" (Konto selbst, Anmeldungen, Protokoll, Verknüpfung) */
const NICHT_UMZIEHEN = new Set(['nutzer', 'sitzungen', 'protokoll', 'konto_iserv', 'konto_vorschlaege'])

/** Spalten, die auf ein Konto als Lernende/r zeigen (Fremdschlüssel auf nutzer, ohne Lehrkraft-Spalten) */
function personenSpalten(): { tabelle: string; spalte: string }[] {
  const d = datenbank()
  const aus: { tabelle: string; spalte: string }[] = []
  for (const { name } of d.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]) {
    if (NICHT_UMZIEHEN.has(name) || !/^\w+$/.test(name)) continue
    const fk = (d.prepare(`PRAGMA foreign_key_list(${name})`).all() as { table: string; from: string }[]).filter((f) => f.table === 'nutzer').map((f) => f.from)
    const spalten = (d.prepare(`PRAGMA table_info(${name})`).all() as { name: string }[]).map((s) => s.name)
    const kandidaten = new Set([...fk, ...spalten.filter((s) => s === 'schueler_id' || s === 'nutzer_id')])
    for (const s of kandidaten) if (!/lehrkraft/i.test(s) && /^\w+$/.test(s)) aus.push({ tabelle: name, spalte: s })
  }
  return aus
}

/**
 * Daten des IServ-Kontos ins Gastkonto übernehmen: Zeilen wandern, wo der Gast noch nichts hat; bei Doppeltem bleibt
 * die Zeile des Gastes (UPDATE OR IGNORE) und die des IServ-Kontos geht mit dem Konto. Mitgliedschaften in Lerngruppen
 * gehen an den Gast. Danach trägt der Gast die IServ-Kennung, das IServ-Konto wird entfernt.
 */
export function zusammenfuehren(iserv: NutzerInfo, gast: NutzerInfo): void {
  const d = datenbank()
  const sub = iservKennungen().get(iserv.id) ?? ''
  for (const { tabelle, spalte } of personenSpalten()) d.prepare(`UPDATE OR IGNORE ${tabelle} SET ${spalte} = ? WHERE ${spalte} = ?`).run(gast.id, iserv.id)
  // Lerngruppen: wo das IServ-Konto Mitglied war (eingetragen oder über die IServ-Gruppe), steht künftig der Gast
  for (const g of alleLerngruppen()) {
    const drin = g.mitglieder.includes(iserv.benutzer) || Boolean(g.iserv_gruppe && iserv.gruppen.some((x) => x.id === g.iserv_gruppe))
    if (!drin) continue
    const neu = [...g.mitglieder.filter((b) => b !== iserv.benutzer)]
    if (!neu.includes(gast.benutzer)) neu.push(gast.benutzer)
    d.prepare('UPDATE lerngruppen SET mitglieder = ? WHERE id = ?').run(JSON.stringify(neu), g.id)
  }
  d.prepare('DELETE FROM konto_vorschlaege WHERE gast_id = ? OR iserv_id = ?').run(gast.id, iserv.id)
  kontoEntfernen(iserv)
  verknuepfen(gast.id, { benutzer: iserv.benutzer, sub })
}

export function vorschlagBestaetigen(iservId: string, gastId: string, lehrkraftId: string): string | null {
  const p = vorschlagPruefen(iservId, gastId, lehrkraftId)
  if (typeof p === 'string') return p
  if (p.iserv.quelle !== 'iserv' || p.iserv.rolle !== 'schueler') return 'Zusammenführen geht nur mit einem Schülerkonto aus IServ.'
  if (p.gast.quelle !== 'gast' || p.gast.rolle !== 'schueler') return 'Zusammenführen geht nur mit einem Gastkonto (Code/QR).'
  if (verknuepfungVon(p.gast.id)) return 'Dieses Konto ist schon mit IServ verbunden.'
  zusammenfuehren(p.iserv, p.gast)
  protokolliereServer('klassen', 'IServ-Konto mit Gastkonto zusammengeführt', lehrkraftId)
  return null
}
