/**
 * Haken der KI-Kanäle auf dem Server (22.10.2026, KI-Sicherheitsprüfung H7/M1/SSRF) – eigene Datei, damit bremse.ts
 * ohne Abhängigkeiten zu den Routen bleibt.
 */
import { setzeAbruf, setzeAdressPruefer } from '../main/services/ai/kompatibel'
import { sichererAbruf } from './sichererAbruf'
import { setzePlatzSchluessel, setzeSchulBudgetQuelle, setzeSchulModellPruefer } from '../main/services/ai/schulGrenzen'
import { dnsAdressPruefer } from './bremse'
import { aktuellerNutzer } from './kontext'
import { budgetStandFuer } from './kiNutzung'
import { schulModellPruefen } from './kiZugaenge'

/**
 * Haken der KI-Kanäle auf dem Server setzen (server/start.ts): Wechsel je Lehrkraft in der Schlange, Freigabeliste der
 * Modelle über den Schulzugang, Stand des Budgets für Einstellungen › Verbrauch, Adressprüfung der KI-Anbieter.
 */
export function kiSchutzEinrichten(): void {
  setzePlatzSchluessel(() => aktuellerNutzer()?.id)
  setzeSchulModellPruefer(schulModellPruefen)
  setzeSchulBudgetQuelle(() => {
    const n = aktuellerNutzer()
    if (!n || n.rolle === 'schueler') return null
    const stand = budgetStandFuer(n.id)
    // Nur zeigen, wenn überhaupt etwas über den Schulzugang lief
    return stand && stand.verbraucht > 0 ? stand : null
  })
  setzeAdressPruefer(dnsAdressPruefer)
  // DNS-Rebinding: die Adresse der tatsächlichen Verbindung wird geprüft (sichererAbruf.ts)
  setzeAbruf(sichererAbruf as typeof fetch)
}
