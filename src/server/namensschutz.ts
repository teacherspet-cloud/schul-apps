/**
 * Namensfilter auf dem Server einbinden (02.10.2026) – siehe namensfilter.ts.
 *
 * Umhüllt den Aufruf der Kanäle: KI-Anfragen werden geschützt und die Antworten wieder mit
 * Klarnamen versehen, Hörtexte mit echten Namen gesperrt. Das Register der Namen kommt aus der
 * Datenbank (alle Konten der Schule) und aus den Einstellungen des Nutzers (Briefkopf); die
 * Muster werden eine Minute zwischengespeichert.
 */
import type { StructuredRequest, TtsRequest } from '@shared/types'
import { getSettings } from '../main/services/storage/settings'
import { alleNutzer, protokolliereServer } from './datenbank'
import { aktuellerNutzer } from './kontext'
import { musterFuer, personAus, pruefeHoertext, schuetzeAnfrage, schuetzeText, stelleWiederHer, type Muster, type Person } from './namensfilter'
import type { Aufruf } from './http'

let schule: { zeit: number; personen: Person[] } | null = null

/** Alle Menschen der Schule, die der Server kennt (Konten) */
function personenDerSchule(): Person[] {
  if (schule && Date.now() - schule.zeit < 60_000) return schule.personen
  const personen = alleNutzer()
    .filter((n) => n.quelle !== 'test')
    .map((n) => personAus(n.name, n.benutzer))
    .filter((p): p is Person => Boolean(p))
  schule = { zeit: Date.now(), personen }
  return personen
}

/** Nach dem Anlegen/Ändern von Konten neu lesen */
export const registerVergessen = (): void => {
  schule = null
}

/** Muster für den angemeldeten Nutzer: Schule + eigene Namen aus den Einstellungen */
export function namensMuster(zusatz: Person[] = []): Muster[] {
  const eigene: Person[] = []
  try {
    const lehrkraft = getSettings().briefkopf?.lehrkraft
    const p = lehrkraft ? personAus(lehrkraft.replace(/^(Herr|Frau|Dr\.|StR|OStR|StD)\s+/gi, '')) : null
    if (p) eigene.push(p)
  } catch {
    // ohne Einstellungen nur die Schule
  }
  return musterFuer([...personenDerSchule(), ...eigene, ...zusatz])
}

/** Den Aufruf der Kanäle mit dem Namensschutz umhüllen */
export function mitNamensschutz(aufruf: Aufruf): Aufruf {
  return async (kanal, args) => {
    const n = aktuellerNutzer()
    if (kanal === 'ai:structured' && args[0] && typeof args[0] === 'object') {
      const { req, z } = schuetzeAnfrage(args[0] as StructuredRequest, namensMuster())
      if (z.anzahl) protokolliereServer('namensschutz', `${z.anzahl} Namen vor der KI ersetzt (${req.schemaName})`, n?.id)
      return stelleWiederHer(await aufruf(kanal, [req, ...args.slice(1)]), z)
    }
    if ((kanal === 'ai:websuche' || kanal === 'ai:image') && typeof args[0] === 'string') {
      const { text, z } = schuetzeText(args[0], namensMuster())
      if (z.anzahl) protokolliereServer('namensschutz', `${z.anzahl} Namen vor der KI ersetzt (${kanal})`, n?.id)
      return stelleWiederHer(await aufruf(kanal, [text, ...args.slice(1)]), z)
    }
    if (kanal === 'audio:speak' && args[0] && typeof args[0] === 'object') {
      try {
        pruefeHoertext(args[0] as TtsRequest, namensMuster())
      } catch (e) {
        protokolliereServer('namensschutz', 'Hörtext mit echtem Namen gesperrt', n?.id)
        throw e
      }
    }
    return aufruf(kanal, args)
  }
}
