/**
 * Bremsen gegen Massenanfragen (22.10.2026, KI-Sicherheitsprüfung M5) – Gäste je Adresse, allgemeine Rate je Schlüssel
 * und die Adressprüfung der KI-Anbieter (SSRF). Bewusst ohne Abhängigkeiten zu anderen Routen (wird überall eingebunden).
 *
 * Anlass: Wer den sechsstelligen Code einer Freigabe kennt, konnte bis zu 80 (Grammatik/Vokabeln 120) Gäste je Freigabe
 * anlegen – jeder mit vollen KI-Runden auf Kosten der Lehrkraft. Ein Skript schafft das in Sekunden.
 *
 * `gastBremse(ip)` – FAUSTREGEL: höchstens 30 neue Gäste je Adresse und Minute und 90 je 10 Minuten. Großzügig, weil in
 * der Schule oft alle Kinder hinter EINER Adresse stehen (NAT): Eine Klasse (≈ 30) meldet sich in einer Minute an, drei
 * Klassen in zehn Minuten – ein Skript mit Hunderten Gästen wird gestoppt.
 *
 * `rate(schluessel, proSekunde)` – allgemeiner Eimer (Token-Bucket) für andere Stellen, z. B. je Sitzung: füllt sich mit
 * `proSekunde` und fasst fünf Sekunden davon (mindestens 1) als Stoß.
 *
 * Alles nur im Speicher: Nach einem Neustart beginnt die Zählung neu – für eine Bremse genügt das.
 */
import { lookup } from 'node:dns/promises'
import { adresseAufgeloestPruefen } from '../main/services/ai/kompatibel'

export const GAST_BREMSE_MELDUNG = 'Gerade melden sich von hier sehr viele Gäste an. Bitte in ein paar Minuten noch einmal versuchen.'

const GAST_FENSTER: { ms: number; max: number }[] = [
  { ms: 60_000, max: 30 },
  { ms: 10 * 60_000, max: 90 }
]
const LAENGSTES = Math.max(...GAST_FENSTER.map((f) => f.ms))

const gaeste = new Map<string, number[]>()

/** Darf von dieser Adresse jetzt ein neuer Gast angelegt werden? Zählt den Versuch mit, wenn ja. */
export function gastBremse(ip: string, jetzt = Date.now()): boolean {
  const schluessel = String(ip || '?').replace(/^::ffff:/, '')
  const liste = (gaeste.get(schluessel) ?? []).filter((t) => jetzt - t < LAENGSTES)
  if (GAST_FENSTER.some((f) => liste.filter((t) => jetzt - t < f.ms).length >= f.max)) {
    gaeste.set(schluessel, liste)
    return false
  }
  liste.push(jetzt)
  gaeste.set(schluessel, liste)
  if (gaeste.size > 5000) for (const [k, l] of gaeste) if (!l.some((t) => jetzt - t < LAENGSTES)) gaeste.delete(k)
  return true
}

const eimer = new Map<string, { stand: number; zeit: number }>()

/**
 * Allgemeine Rate: liefert true, solange `schluessel` im Mittel höchstens `proSekunde` Anfragen stellt (Stoß bis zum
 * Fünffachen, mindestens 1). Zum Beispiel `if (!rate(`hilfe:${sitzung.kennung}`, 0.2)) return json(res, 429, …)`.
 */
export function rate(schluessel: string, proSekunde: number, jetzt = Date.now()): boolean {
  const p = Number.isFinite(proSekunde) && proSekunde > 0 ? proSekunde : 1
  const fasst = Math.max(1, p * 5)
  const e = eimer.get(schluessel) ?? { stand: fasst, zeit: jetzt }
  e.stand = Math.min(fasst, e.stand + ((jetzt - e.zeit) / 1000) * p)
  e.zeit = jetzt
  const ok = e.stand >= 1
  if (ok) e.stand -= 1
  eimer.set(schluessel, e)
  if (eimer.size > 20_000) for (const [k, v] of eimer) if (jetzt - v.zeit > 10 * 60_000) eimer.delete(k)
  return ok
}

/** Für Tests */
export function bremsenVergessen(): void {
  gaeste.clear()
  eimer.clear()
}

/** SSRF (22.10.2026): Namen der KI-Adresse auflösen und interne Ziele ablehnen (kompatibel.ts › adresseAufgeloestPruefen) */
export const dnsAdressPruefer = (url: string): Promise<string | null> =>
  adresseAufgeloestPruefen(url, async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address))
