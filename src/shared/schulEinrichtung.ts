/**
 * Schul-Einrichtung des Servers (09.10.2026).
 *
 * Wunsch der Verwaltung: In „Schule & Daten" › Schule wird die Schule eingerichtet, die den Server nutzt – Name,
 * Bundesland, Schulform(en), Anschrift, Telefon/E-Mail für Briefköpfe und ein Logo. Gespeichert serverweit
 * (server_einstellungen, Schlüssel 'schule'; das Logo als Datei im Datenordner), lesbar für alle Lehrkräfte,
 * änderbar nur für Admins.
 *
 * Drei Verwendungen:
 * - Prüfen der Eingaben (`pruefeSchule`) – der Server nimmt nur Geprüftes an.
 * - Vorbelegen (`schulVorbelegung`): beim ersten Anmelden im Einrichtungsassistenten und – für Lehrkräfte ohne
 *   eigene Schuldaten – auf Nachfrage. Gefüllt wird NUR, was leer ist; Eingaben der Lehrkraft bleiben immer.
 * - Rückfall (`mitSchulRueckfall`): Wo die Programme Bundesland und Schulform brauchen (Lehrwerk, Grammatikstufe,
 *   Vorwahl …), gelten die der Schule, solange die Lehrkraft keine eigenen gewählt hat. „Keine eigene Wahl" heißt:
 *   kein Schulname, Bundesland und Schulform noch auf der Voreinstellung und nie selbst geändert (`schulwahlEigen`).
 *
 * Lehrwerke je Fach gehören bewusst nicht hierher. Ferien und Feiertage gibt man nicht ein: Der Server holt sie für das
 * Bundesland der Schule selbst (10.10.2026, src/server/schulkalender.ts, shared/schulkalender.ts).
 */
import { DEFAULT_SETTINGS, type AppSettings, type DeepPartial } from './types'
import { LAENDER, schulformenDes } from './schulformen'

export interface SchulEinrichtung {
  name: string
  /** Land (Kürzel aus LAENDER) */
  stateId: string
  /** Schulformen der Schule (Kennungen aus dem Katalog des Landes), die erste ist die Vorwahl */
  schulformen: string[]
  strasse: string
  plz: string
  ort: string
  telefon: string
  email: string
  /** Ein Logo liegt auf dem Server */
  logo?: boolean
  /** Zuletzt geändert (ISO) */
  geaendert?: string
}

/** Logo höchstens 1 MB (PNG nach dem Verkleinern in der Oberfläche auf 800 px) */
export const LOGO_GRENZE = 1024 * 1024

const text = (v: unknown, max: number): string =>
  typeof v === 'string'
    ? v
        // Steuerzeichen raus, Leerraum zusammenfassen
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : ''

/** Prüft und bereinigt die Angaben aus dem Formular der Verwaltung */
export function pruefeSchule(roh: unknown): { schule: SchulEinrichtung } | { fehler: string } {
  const r = (roh && typeof roh === 'object' ? roh : {}) as Record<string, unknown>
  const name = text(r.name, 150)
  if (name.length < 2) return { fehler: 'Bitte den Namen der Schule angeben.' }
  const stateId = text(r.stateId, 4).toUpperCase()
  if (!LAENDER.some((l) => l.id === stateId)) return { fehler: 'Bitte ein Bundesland wählen.' }
  const erlaubt = new Set(schulformenDes(stateId).map((s) => s.id))
  const schulformen = [...new Set((Array.isArray(r.schulformen) ? r.schulformen : []).map((x) => text(x, 60)))].filter(Boolean)
  if (!schulformen.length) return { fehler: 'Bitte mindestens eine Schulform wählen.' }
  const fremd = schulformen.find((s) => !erlaubt.has(s))
  if (fremd) return { fehler: `Die Schulform „${fremd}“ gibt es in diesem Bundesland nicht.` }
  if (schulformen.length > 8) return { fehler: 'Höchstens acht Schulformen.' }
  const plz = text(r.plz, 10)
  if (plz && !/^\d{5}$/.test(plz)) return { fehler: 'Die Postleitzahl hat fünf Ziffern.' }
  const telefon = text(r.telefon, 40)
  if (telefon && !/^[0-9+()/.\- ]{3,40}$/.test(telefon)) return { fehler: 'Die Telefonnummer enthält unerwartete Zeichen.' }
  const email = text(r.email, 120)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { fehler: 'Die E-Mail-Adresse ist nicht gültig.' }
  return { schule: { name, stateId, schulformen, strasse: text(r.strasse, 120), plz, ort: text(r.ort, 80), telefon, email } }
}

/** Hat die Lehrkraft Bundesland/Schulform selbst festgelegt? (auf den GESPEICHERTEN Einstellungen) */
export function eigeneSchulwahl(s: Pick<AppSettings, 'schoolName' | 'defaults' | 'schulwahlEigen'>): boolean {
  return (
    Boolean(s.schulwahlEigen) ||
    Boolean(s.schoolName?.trim()) ||
    s.defaults.stateId !== DEFAULT_SETTINGS.defaults.stateId ||
    s.defaults.schoolTypeId !== DEFAULT_SETTINGS.defaults.schoolTypeId
  )
}

/** Bundesland und Schulform der Schule, wo die Lehrkraft keine eigenen gewählt hat */
export function mitSchulRueckfall(s: AppSettings, schule: SchulEinrichtung | null | undefined): AppSettings {
  if (!schule?.stateId || !schule.schulformen?.length || eigeneSchulwahl(s)) return s
  return { ...s, defaults: { ...s.defaults, stateId: schule.stateId, schoolTypeId: schule.schulformen[0] } }
}

/** Berührt die Änderung Schulangaben? Dann wird zuvor der Rückfall festgeschrieben und die Wahl als eigene gemerkt. */
export const aendertSchulangaben = (patch: DeepPartial<AppSettings>): boolean =>
  Boolean((typeof patch.schoolName === 'string' && patch.schoolName.trim()) || patch.defaults?.stateId || patch.defaults?.schoolTypeId)

/**
 * Gespeicherte Einstellungen vor einer Änderung (main/services/storage/settings.ts): Schreibt die Lehrkraft erstmals
 * eigene Schulangaben, wird das, was sie bisher sah (der Rückfall), festgeschrieben – sonst spränge etwa nach dem
 * Eintragen des Schulnamens das Bundesland auf die Voreinstellung zurück.
 */
export function vorSchulAenderung(gespeichert: AppSettings, patch: DeepPartial<AppSettings>, schule: SchulEinrichtung | null | undefined): AppSettings {
  if (!aendertSchulangaben(patch)) return gespeichert
  return { ...mitSchulRueckfall(gespeichert, schule), schulwahlEigen: true }
}

/** Ohne eigene Schuldaten: kein Schulname und kein Briefkopf mit Anschrift oder Telefon */
export function ohneSchuldaten(s: Pick<AppSettings, 'schoolName' | 'briefkopf'>): boolean {
  const b = s.briefkopf ?? {}
  return !s.schoolName?.trim() && !b.strasse?.trim() && !b.ort?.trim() && !b.telefon?.trim() && !b.plz?.trim()
}

/**
 * Was aus der Schul-Einrichtung übernommen würde – nur leere Felder, nie Eingaben der Lehrkraft.
 * Bundesland/Schulform nur ohne eigene Wahl; der Briefkopf feldweise. `null`, wenn nichts zu übernehmen ist.
 */
export function schulVorbelegung(s: AppSettings, schule: SchulEinrichtung | null | undefined): DeepPartial<AppSettings> | null {
  if (!schule?.name) return null
  const patch: DeepPartial<AppSettings> = {}
  if (!s.schoolName?.trim()) patch.schoolName = schule.name
  /*
   * Bundesland/Schulform: nur, wenn noch die Voreinstellung steht (oder schon die der Schule – die Einstellungen in der
   * Oberfläche enthalten den Rückfall bereits). Eine andere, selbst gewählte Kombination bleibt.
   */
  const d = s.defaults
  const voreinstellung = d.stateId === DEFAULT_SETTINGS.defaults.stateId && d.schoolTypeId === DEFAULT_SETTINGS.defaults.schoolTypeId
  const wieSchule = d.stateId === schule.stateId && schule.schulformen.includes(d.schoolTypeId)
  if (!s.schulwahlEigen && !s.schoolName?.trim() && (voreinstellung || wieSchule) && schule.stateId && schule.schulformen.length)
    // Steht schon eine passende Schulform (etwa die zweite der Schule), bleibt sie
    patch.defaults = { stateId: schule.stateId, schoolTypeId: wieSchule ? d.schoolTypeId : schule.schulformen[0] }
  const b = s.briefkopf ?? {}
  const kopf: Record<string, string> = {}
  for (const feld of ['strasse', 'plz', 'ort', 'telefon', 'email'] as const) if (!b[feld]?.trim() && schule[feld]) kopf[feld] = schule[feld]
  if (Object.keys(kopf).length) patch.briefkopf = { ...b, ...kopf }
  return Object.keys(patch).length ? patch : null
}
