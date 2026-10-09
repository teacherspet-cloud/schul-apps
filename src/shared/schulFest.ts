/**
 * Feste Schule für IServ-Lehrkräfte (09.10.2026, Entscheidung der Lehrkraft).
 *
 * Wer sich am Server über IServ anmeldet, gehört zur Schule dieses Servers. Für diese Konten gibt es keine eigene
 * Schulwahl mehr: Schulname, Bundesland, Schulform und die Anschrift des Briefkopfs kommen IMMER aus der
 * Schul-Einrichtung der Verwaltung („Schule & Daten" › Schule, shared/schulEinrichtung.ts) – nicht aus früheren
 * eigenen Angaben. Was die Person betrifft (Name im Briefkopf, Funktion, Unterschrift/Zertifikat), bleibt änderbar.
 * Bei mehreren Schulformen der Schule darf die Lehrkraft unter DIESEN wählen.
 *
 * Lokale Konten, Testkonten und die Exe behalten die eigene Schulwahl.
 */
import type { AppSettings, DeepPartial } from './types'
import type { SchulEinrichtung } from './schulEinrichtung'

/** Feste Schule nur für Lehrkräfte und Admins, die über IServ angemeldet sind */
export function schuleFest(nutzer: { quelle?: string; rolle?: string } | null | undefined): boolean {
  return Boolean(nutzer && nutzer.quelle === 'iserv' && nutzer.rolle !== 'schueler')
}

/** Die Einstellungen mit den Angaben der Schule (ohne eingerichtete Schule unverändert) */
export function mitFesterSchule(s: AppSettings, schule: SchulEinrichtung | null | undefined): AppSettings {
  if (!schule?.name) return s
  const formen = schule.schulformen ?? []
  const schoolTypeId = formen.includes(s.defaults.schoolTypeId) ? s.defaults.schoolTypeId : (formen[0] ?? s.defaults.schoolTypeId)
  return {
    ...s,
    schoolName: schule.name,
    defaults: { ...s.defaults, stateId: schule.stateId || s.defaults.stateId, schoolTypeId },
    briefkopf: {
      ...(s.briefkopf ?? {}),
      strasse: schule.strasse ?? '',
      plz: schule.plz ?? '',
      ort: schule.ort ?? '',
      telefon: schule.telefon ?? '',
      email: schule.email ?? ''
    }
  }
}

/** Eine Änderung ohne die festen Schulangaben (die Schulform nur, wenn sie zur Schule gehört) */
export function ohneSchulangaben(patch: DeepPartial<AppSettings>, schule: SchulEinrichtung | null | undefined): DeepPartial<AppSettings> {
  if (!schule?.name || !patch || typeof patch !== 'object') return patch
  const { schoolName: _n, schulwahlEigen: _e, ...rest } = patch
  const aus: DeepPartial<AppSettings> = { ...rest }
  if (patch.defaults) {
    const { stateId: _s, schoolTypeId, ...d } = patch.defaults
    aus.defaults = { ...d, ...(schoolTypeId && schule.schulformen.includes(schoolTypeId) ? { schoolTypeId } : {}) }
  }
  if (patch.briefkopf) {
    const { strasse: _st, plz: _p, ort: _o, telefon: _t, email: _m, ...b } = patch.briefkopf
    aus.briefkopf = b
  }
  return aus
}
