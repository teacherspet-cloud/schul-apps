/**
 * Regeln des Löschkonzepts (23.10.2026, Prüfung des Schulträgers, Punkt 7) – reine Entscheidungen ohne Datenbank, damit
 * sie mit festen Daten prüfbar sind (tests/loeschkonzept.test.ts). Die Ausführung steht in loeschkonzept.ts.
 *
 * Entscheidungen der Lehrkraft (23.10.2026):
 *  - Daten der Lernenden bleiben bis zum ENDE DER SCHULLAUFBAHN (nicht je Schuljahr). Abgegangen ist, wer in IServ nicht
 *    mehr gesehen wird: keine Anmeldung und nicht mehr in der IServ-Benutzerliste – länger als die Karenzzeit (120 Tage,
 *    deckt die Sommerferien). Dann „zur Löschung vorgesehen"; nach der Frist (30 Tage, in der Zeit sichtbar und
 *    aufschiebbar) wird ALLES der Person gelöscht.
 *  - Gäste gehen mit ihrer Freigabe (gaeste.ts); zusätzlich Gäste, deren Freigaben seit mehr als einem Schuljahr beendet
 *    sind (bzw. die so lange nicht mehr da waren).
 *  - Lehrkräfte werden nie automatisch gelöscht (Material!) – nur gelistet, Löschen von Hand mit Bestätigung.
 */

export const TAG = 86_400_000

export interface LoeschEinstellung {
  /** Konten automatisch vormerken und löschen (Lernende, Gäste); die Zeitfristen laufen immer */
  an: boolean
  /** Karenzzeit: so lange ohne Anmeldung und ohne IServ-Liste, bis jemand als abgegangen gilt */
  abgangTage: number
  /** Frist zwischen „zur Löschung vorgesehen" und dem Löschen */
  fristTage: number
  /** „Aufschieben" verlängert die Frist um so viele Tage */
  aufschubTage: number
  /** Gäste: so lange nach dem Ende ihrer Freigaben bzw. ihrem letzten Besuch (ein Schuljahr) */
  gastTage: number
  /** Prüfprotokoll: Einträge älter als das werden gelöscht (zusätzlich zur Obergrenze von 20 000) */
  protokollTage: number
  /** Schutz: Würden auf einmal mehr als so viel Prozent der Lernenden neu vorgemerkt, wird niemand vorgemerkt */
  schwelle: number
}

export const LOESCH_STANDARD: LoeschEinstellung = {
  an: true,
  abgangTage: 120,
  fristTage: 30,
  aufschubTage: 90,
  gastTage: 365,
  protokollTage: 180,
  schwelle: 25
}

/** Grenzen der Einstellungen (Verwaltung) – unsinnige Werte fallen auf die Grenze */
export const LOESCH_GRENZEN: Record<Exclude<keyof LoeschEinstellung, 'an'>, [number, number]> = {
  abgangTage: [60, 730],
  fristTage: [7, 180],
  aufschubTage: [7, 365],
  gastTage: [30, 1095],
  protokollTage: [30, 730],
  schwelle: [1, 100]
}

/** Gespeicherte (oder geschickte) Einstellung auf gültige Werte bringen */
export function einstellungBereinigen(roh: unknown, alt: LoeschEinstellung = LOESCH_STANDARD): LoeschEinstellung {
  const o = roh && typeof roh === 'object' ? (roh as Record<string, unknown>) : {}
  const aus: LoeschEinstellung = { ...alt, an: typeof o.an === 'boolean' ? o.an : alt.an }
  for (const [k, [min, max]] of Object.entries(LOESCH_GRENZEN) as [keyof typeof LOESCH_GRENZEN, [number, number]][]) {
    const v = Number(o[k])
    if (o[k] !== undefined && o[k] !== null && o[k] !== '' && Number.isFinite(v)) aus[k] = Math.min(max, Math.max(min, Math.round(v)))
  }
  return aus
}

/** ISO-Zeit bzw. ms → ms (0, wenn nichts Brauchbares) */
export const ms = (z: string | number | null | undefined): number => {
  if (typeof z === 'number') return Number.isFinite(z) ? z : 0
  if (!z) return 0
  const t = Date.parse(z)
  return Number.isFinite(t) ? t : 0
}

/** Zuletzt gesehen: letzte Anmeldung/Sitzung, sonst Anlage des Kontos; dazu der letzte Eintrag in der IServ-Liste */
export const zuletztGesehen = (n: { erstellt: string; zuletzt: string | null }, iservGesehen?: number | null): number =>
  Math.max(ms(n.erstellt), ms(n.zuletzt), iservGesehen ?? 0)

export type AbgangEntscheidung =
  /** wird gesehen – nichts zu tun */
  | 'aktiv'
  /** Karenzzeit überschritten: jetzt „zur Löschung vorgesehen" */
  | 'vormerken'
  /** vorgemerkt, die Frist läuft */
  | 'vorgemerkt'
  /** vorgemerkt und die Frist (samt Aufschub) ist um: löschen */
  | 'loeschen'
  /** war vorgemerkt, ist aber wieder da (Anmeldung oder IServ-Liste): Vormerkung aufheben */
  | 'zuruecknehmen'

export interface AbgangLage {
  gesehen: number
  /** ms der Vormerkung, sonst null */
  markiert: number | null
  aufschubBis?: number | null
}

/** Ab wann darf eine vorgemerkte Person gelöscht werden? */
export const loeschenAb = (l: Pick<AbgangLage, 'markiert' | 'aufschubBis'>, e: LoeschEinstellung): number | null =>
  l.markiert === null ? null : Math.max(l.markiert + e.fristTage * TAG, l.aufschubBis ?? 0)

export function abgangEntscheiden(l: AbgangLage, e: LoeschEinstellung, jetzt: number): AbgangEntscheidung {
  if (l.markiert !== null) {
    if (l.gesehen > l.markiert) return 'zuruecknehmen'
    return jetzt >= (loeschenAb(l, e) ?? Infinity) ? 'loeschen' : 'vorgemerkt'
  }
  return jetzt - l.gesehen >= e.abgangTage * TAG ? 'vormerken' : 'aktiv'
}

/** Freigabe, an der ein Gast hängt: noch offen? Wann endete sie (ms, 0 = unbekannt)? */
export interface GastFreigabe {
  offen: boolean
  ende: number
}

export interface GastLage {
  /** Gast mit IServ-Anmeldung oder Mitglied einer Lerngruppe: zählt wie Lernende (Abgangsregel), nicht hier */
  wieLernende: boolean
  freigaben: GastFreigabe[]
  gesehen: number
}

export type GastEntscheidung = 'behalten' | 'loeschen' | 'wieLernende'

/**
 * Gast löschen, wenn keine seiner Freigaben mehr offen ist und das Ende der letzten Freigabe bzw. sein letzter Besuch
 * länger als `gastTage` (ein Schuljahr) zurückliegt. Hängt er an gar keiner Freigabe mehr (Rest aus alter Zeit), gilt
 * nur der letzte Besuch.
 */
export function gastEntscheiden(g: GastLage, e: LoeschEinstellung, jetzt: number): GastEntscheidung {
  if (g.wieLernende) return 'wieLernende'
  if (g.freigaben.some((f) => f.offen)) return 'behalten'
  const zuletzt = Math.max(g.gesehen, ...g.freigaben.map((f) => f.ende))
  return jetzt - zuletzt > e.gastTage * TAG ? 'loeschen' : 'behalten'
}

/** Ist eine Freigabe noch offen? Status nicht beendet/entfernt und ein gesetztes Ende („bis") nicht vorbei */
export function freigabeLage(status: string | null | undefined, bis: number | null | undefined, beendet: string | null | undefined, jetzt: number): GastFreigabe {
  const s = String(status ?? '')
  const abgelaufen = typeof bis === 'number' && bis > 0 && bis < jetzt
  const zu = s === 'beendet' || s === 'entfernt' || s === 'geschlossen' || s === 'archiviert' || abgelaufen || ms(beendet) > 0
  return { offen: !zu, ende: zu ? Math.max(typeof bis === 'number' && bis < jetzt ? bis : 0, ms(beendet)) : 0 }
}

/**
 * Schutz vor einer Massenvormerkung (z. B. die IServ-Liste fehlt seit Wochen, Server lange aus): Würden mehr als
 * `schwelle` % der Lernenden auf einmal neu vorgemerkt (und mehr als 5), wird in dieser Nacht niemand vorgemerkt.
 */
export const massenSchutz = (neu: number, gesamt: number, schwelle: number): boolean => neu > 5 && neu > (gesamt * schwelle) / 100

/** Zeitgrenze für eine Frist in Tagen (für DELETE … WHERE zeit < ?) */
export const grenze = (jetzt: number, tage: number): number => jetzt - tage * TAG

/** Stunde in Deutschland (der Container läuft in UTC) */
export const stundeBerlin = (jetzt: number): number =>
  Number(new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }).format(new Date(jetzt)))

/**
 * Nachtlauf fällig? Zwischen 3 und 6 Uhr deutscher Zeit (nach der Sicherung des Hosts um 2:30) und der letzte Lauf
 * liegt mehr als 20 Stunden zurück.
 */
export const nachtlaufFaellig = (jetzt: number, letzter: number, stunde = stundeBerlin(jetzt)): boolean => stunde >= 3 && stunde < 6 && jetzt - letzter > 20 * 36e5
