/**
 * KI-Zugänge der Schule (09.10.2026, Auftrag des Admins) – ergänzt die freigegebenen Schlüssel
 * aus verwaltung.ts um:
 *
 *   GET  /server/verwaltung/ki-zugaenge   – Adressen/Vorgabemodelle der OpenAI-kompatiblen Anbieter + Nutzungsübersicht
 *                                           (?zeitraum=woche|monat|schuljahr, 10.10.2026: Diagramme, Kosten, Budget, anonym je Lehrkraft)
 *   POST /server/verwaltung/ki-preise     – Preise je 1 Mio. Eingabe-/Ausgabe-Token je Anbieter/Modell (Schätzung, 10.10.2026)
 *   POST /server/verwaltung/ki-budget     – Monatsbudget der Schule in Token oder Euro (10.10.2026)
 *   POST /server/verwaltung/ki-endpunkt   – Adresse, Azure-Version, Vorgabemodell eines Anbieters speichern
 *   POST /server/verwaltung/ki-test       – Schlüssel der Schule mit einer winzigen Anfrage prüfen (nur auf Knopfdruck)
 *   POST /server/verwaltung/ki-lehrkraft-budget – hartes Monatsbudget je Lehrkraft in Euro (22.10.2026, Vorgabe 20 €)
 *   POST /server/verwaltung/ki-schulmodelle – Modelle, die über die Schlüssel der Schule laufen dürfen (22.10.2026)
 *   POST /server/verwaltung/ki-missbrauch – „Missbrauch prüfen": Namen zur anonymen Übersicht, nur mit Grund und
 *                                           Protokolleintrag (22.10.2026)
 *
 * Nutzungsübersicht: kiNutzung.ts – ausschließlich Aufrufe über Schlüssel der Schule, keine
 * privaten Zugänge, keine Lernenden.
 */
import { BUILTIN_MODELS } from '../main/services/ai/catalog'
import { KompatibelProvider, adressePruefen } from '../main/services/ai/kompatibel'
import { OpenAiProvider } from '../main/services/ai/openai'
import { AnthropicProvider } from '../main/services/ai/anthropic'
import { GoogleProvider } from '../main/services/ai/google'
import type { AiProvider } from '../main/services/ai/provider'
import { istKompatibel, kompatibelVorgabe, type KompatibelEinstellung, type KompatibelId } from '@shared/kiAnbieter'
import { AI_PROVIDERS, DEFAULT_SETTINGS, type AiProviderId, type SecretName, type StructuredRequest } from '@shared/types'
import { nutzerNachId, protokolliereServer, serverGeheimnis, serverWert, setzeServerWert } from './datenbank'
import { json, type Anfrage } from './http'
import { budgetUebersicht, KI_ZEITRAEUME, kiNutzungDashboard, LEHRKRAFT_BUDGET, lehrkraftBudget, type KiZeitraum } from './kiNutzung'
import { getSettings, hatEigenesGeheimnis } from '../main/services/storage/settings'
import type { ModellWahl } from '../main/services/ai/schulGrenzen'
import { budgetBereinigen, preiseBereinigen, type KiBudget, type KiPreise } from '@shared/kiKosten'
import { ersterSchultag, schuljahrVon } from '@shared/schulkalender'
import { namensMuster } from './namensschutz'
import { schuetzeAnfrage } from './namensfilter'
import { freigegebenerSchluessel, TEILBARE_SCHLUESSEL } from './verwaltung'

const ENDPUNKTE = 'ki-endpunkte'
const PREISE = 'ki-preise'
const BUDGET = 'ki-budget'

// ---------------------------------------------------------------- Modelle über den Schlüssel der Schule (22.10.2026)

/*
 * KI-Sicherheitsprüfung M1 (22.10.2026): `ai:structured` nimmt Anbieter und Modell von der Oberfläche (req.provider,
 * req.model, dazu das eingestellte Modell der Lehrkraft). Über den Schlüssel der Schule konnte so jede Lehrkraft das
 * teuerste Modell wählen. Jetzt gilt dort eine Freigabeliste des Admins; ein anderes Modell wird durch das erste der
 * Liste ersetzt. Vorgabe ohne Liste: die Modelle, die die Schule ohnehin vorsieht (Vorgabemodell der App, eingebaute
 * Liste, Vorgabemodell aus „KI-Zugänge"). Eigener Schlüssel oder eigenes Abo der Lehrkraft: keine Einschränkung.
 */
const SCHULMODELLE = 'ki-schulmodelle'

/** KI-Anbieter, für die die Schule einen Schlüssel freigeben kann */
const KI_ANBIETER = (): AiProviderId[] => AI_PROVIDERS.map((p) => p.id).filter((id) => TEILBARE_SCHLUESSEL.includes(id as SecretName))

/** Vorgabe ohne eigene Liste des Admins */
export function vorgabeSchulModelle(): Record<string, string[]> {
  const aus: Record<string, string[]> = {}
  for (const id of KI_ANBIETER()) {
    const liste = [DEFAULT_SETTINGS.ai.textModels[id], ...(BUILTIN_MODELS[id]?.text ?? []), istKompatibel(id) ? schulEndpunkt(id)?.modell?.trim() : '']
    aus[id] = [...new Set(liste.filter((m): m is string => Boolean(m)))]
  }
  // Bildmodelle (22.10.2026, offener Punkt der KI-Sicherheitsprüfung): eigene Einträge „openai-bild“, „google-bild“
  for (const id of BILD_ANBIETER) aus[`${id}-bild`] = [...new Set([DEFAULT_SETTINGS.ai.imageModels[id], ...(BUILTIN_MODELS[id]?.image ?? [])].filter(Boolean))]
  return aus
}

/** Anbieter mit Bildmodellen über einen API-Schlüssel */
const BILD_ANBIETER = ['openai', 'google'] as const

/** Geltende Freigabeliste je Anbieter (Admin, sonst Vorgabe) */
export function schulModelle(): { modelle: Record<string, string[]>; eigen: boolean } {
  const eigen = serverWert<Record<string, string[]> | null>(SCHULMODELLE, null)
  const vorgabe = vorgabeSchulModelle()
  if (!eigen) return { modelle: vorgabe, eigen: false }
  return { modelle: { ...vorgabe, ...eigen }, eigen: true }
}

/** Liste prüfen: bekannte Anbieter, je höchstens 20 Modellnamen */
export function schulModelleBereinigen(roh: unknown): Record<string, string[]> | null {
  if (!roh || typeof roh !== 'object') return null
  const erlaubt = new Set<string>([...KI_ANBIETER(), ...BILD_ANBIETER.map((id) => `${id}-bild`)])
  const aus: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(roh as Record<string, unknown>)) {
    if (!erlaubt.has(k)) continue
    const liste = (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,\n]/) : [])
      .map((m) => String(m).trim())
      .filter((m) => /^[\w.:/@-]{1,120}$/.test(m))
    aus[k] = [...new Set(liste)].slice(0, 20)
  }
  return aus
}

/** Läuft diese Anfrage über den Schlüssel der Schule? (wie kiNutzung.ts › zugangsArt, für Text) */
function ueberSchulSchluessel(anbieter: string): boolean {
  if (!KI_ANBIETER().includes(anbieter as AiProviderId)) return false
  const ai = getSettings().ai
  if (!istKompatibel(anbieter) && ai.access?.[anbieter as AiProviderId] === 'subscription') return false
  if (hatEigenesGeheimnis(anbieter as SecretName)) return false
  return Boolean(freigegebenerSchluessel(anbieter as SecretName))
}

/**
 * Haken für main/services/ai/schulGrenzen.ts › setzeSchulModellPruefer (server/start.ts): über den Schlüssel der Schule
 * nur freigegebene Modelle, sonst das erste freigegebene; ohne jede Freigabe für den Anbieter ein klarer Fehler.
 */
export function schulModellPruefen(w: ModellWahl, liste: Record<string, string[]> = schulModelle().modelle, ueberSchule = ueberSchulSchluessel): ModellWahl {
  if (!ueberSchule(w.anbieter)) return w
  // Bildaufträge gegen die Bildliste (22.10.2026)
  const erlaubt = liste[w.art === 'bild' ? `${w.anbieter}-bild` : w.anbieter] ?? []
  if (erlaubt.includes(w.modell)) return w
  if (!erlaubt.length) throw new Error('Über den KI-Zugang der Schule ist für diesen Anbieter kein Modell freigegeben. Bitte die Verwaltung fragen.')
  return { anbieter: w.anbieter, modell: erlaubt[0] }
}

/** Übersicht für die Verwaltung: Zeitraum, Preise und Budget aus den Servereinstellungen, Schuljahr aus dem Schulkalender */
export function nutzungFuerVerwaltung(zeitraumRoh: string | null, jetzt = new Date(), mitKennungen = false): ReturnType<typeof kiNutzungDashboard> {
  const zeitraum = (KI_ZEITRAEUME as string[]).includes(zeitraumRoh ?? '') ? (zeitraumRoh as KiZeitraum) : 'monat'
  let schuljahrBeginn: string | undefined
  try {
    schuljahrBeginn = ersterSchultag(schuljahrVon(jetzt)) ?? undefined
  } catch {
    schuljahrBeginn = undefined
  }
  return kiNutzungDashboard(zeitraum, { jetzt, preise: serverWert<KiPreise>(PREISE, {}), budget: serverWert<KiBudget | null>(BUDGET, null), schuljahrBeginn, mitKennungen })
}

/** Adresse/Version/Vorgabemodell, die der Admin für einen OpenAI-kompatiblen Anbieter hinterlegt hat */
export function schulEndpunkt(id: KompatibelId): KompatibelEinstellung | undefined {
  return serverWert<Record<string, KompatibelEinstellung>>(ENDPUNKTE, {})[id]
}

const PING: StructuredRequest = {
  system: 'Antworte nur mit dem verlangten JSON.',
  user: 'Gib ok=true zurück.',
  schemaName: 'verbindungstest',
  schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false }
}

/** Anbieter mit dem Schlüssel der SCHULE (nicht dem eigenen des Admins) */
function schulAnbieter(id: AiProviderId, schluessel: string): { provider: AiProvider; modell: string } {
  if (istKompatibel(id)) {
    const v = kompatibelVorgabe(id)
    const e = schulEndpunkt(id) ?? {}
    const basisUrl = e.basisUrl?.trim() || v?.basisUrl || ''
    if (!basisUrl) throw new Error('Bitte zuerst die Adresse eintragen.')
    const fehler = adressePruefen(basisUrl, true)
    if (fehler) throw new Error(fehler)
    return {
      provider: new KompatibelProvider({ id, basisUrl, schluessel, azure: v?.azure, apiVersion: e.apiVersion?.trim() || undefined }),
      modell: e.modell?.trim() || v?.modelle[0] || ''
    }
  }
  const modell = BUILTIN_MODELS[id].text[0]
  if (id === 'anthropic') return { provider: new AnthropicProvider(schluessel), modell }
  if (id === 'google') return { provider: new GoogleProvider(schluessel), modell }
  return { provider: new OpenAiProvider(schluessel), modell }
}

export async function kiZugaengeRoute(k: Anfrage): Promise<boolean> {
  const { url, req, res, sitzung } = k
  const pfade = [
    '/server/verwaltung/ki-zugaenge',
    '/server/verwaltung/ki-endpunkt',
    '/server/verwaltung/ki-test',
    '/server/verwaltung/ki-preise',
    '/server/verwaltung/ki-budget',
    '/server/verwaltung/ki-lehrkraft-budget',
    '/server/verwaltung/ki-schulmodelle',
    '/server/verwaltung/ki-missbrauch'
  ]
  if (!pfade.includes(url.pathname)) return false
  if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
  if (sitzung.nutzer.rolle !== 'admin') return (json(res, 403, { fehler: 'Nur für die Verwaltung.' }), true)

  if (req.method === 'GET' && url.pathname === '/server/verwaltung/ki-zugaenge') {
    const sm = schulModelle()
    return (
      json(res, 200, {
        endpunkte: serverWert<Record<string, KompatibelEinstellung>>(ENDPUNKTE, {}),
        nutzung: nutzungFuerVerwaltung(url.searchParams.get('zeitraum')),
        // KI-Sicherheitsprüfung (22.10.2026): Budget je Lehrkraft (anonym: nur Anzahlen), Modelle über den Schulzugang
        schutz: { lehrkraftBudget: lehrkraftBudget(), budgetLehrkraefte: budgetUebersicht(), schulModelle: sm.modelle, schulModelleEigen: sm.eigen }
      }),
      true
    )
  }
  if (req.method !== 'POST') return (json(res, 405, { fehler: 'Nicht erlaubt.' }), true)
  if (typeof req.headers['x-schulapps-token'] !== 'string') return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
  const k0 = (await k.koerper()) as Record<string, unknown>
  const name = String(k0.name ?? '') as AiProviderId

  // Preise (Schätzung) und Monatsbudget (10.10.2026)
  if (url.pathname === '/server/verwaltung/ki-preise') {
    const preise = preiseBereinigen(k0.preise)
    setzeServerWert(PREISE, preise)
    protokolliereServer('verwaltung', `KI-Preise geändert (${Object.keys(preise).length} Einträge)`, sitzung.nutzer.id)
    return (json(res, 200, { ok: true, preise }), true)
  }
  if (url.pathname === '/server/verwaltung/ki-budget') {
    const budget = budgetBereinigen(k0.budget)
    setzeServerWert(BUDGET, budget)
    protokolliereServer('verwaltung', budget ? `KI-Budget gesetzt (${budget.wert} ${budget.art === 'euro' ? '€' : 'Token'} je Monat)` : 'KI-Budget entfernt', sitzung.nutzer.id)
    return (json(res, 200, { ok: true, budget }), true)
  }

  // Hartes Budget je Lehrkraft (22.10.2026): Euro je Monat, 0 = ohne Grenze
  if (url.pathname === '/server/verwaltung/ki-lehrkraft-budget') {
    const roh = typeof k0.wert === 'string' ? Number(k0.wert.replace(',', '.')) : k0.wert
    if (typeof roh !== 'number' || !Number.isFinite(roh) || roh < 0 || roh > 10000) return (json(res, 400, { fehler: 'Bitte einen Betrag zwischen 0 und 10 000 € angeben.' }), true)
    const wert = Math.round(roh * 100) / 100
    setzeServerWert(LEHRKRAFT_BUDGET, wert)
    protokolliereServer('verwaltung', wert ? `KI-Budget je Lehrkraft gesetzt (${wert} € je Monat)` : 'KI-Budget je Lehrkraft aufgehoben', sitzung.nutzer.id)
    return (json(res, 200, { ok: true, wert }), true)
  }
  // Modelle über den Schlüssel der Schule (22.10.2026): null = Vorgabe
  if (url.pathname === '/server/verwaltung/ki-schulmodelle') {
    const modelle = k0.modelle === null ? null : schulModelleBereinigen(k0.modelle)
    setzeServerWert(SCHULMODELLE, modelle)
    protokolliereServer('verwaltung', modelle ? `Modelle über den Schulzugang geändert (${Object.values(modelle).flat().length} Einträge)` : 'Modelle über den Schulzugang: Vorgabe', sitzung.nutzer.id)
    return (json(res, 200, { ok: true, ...schulModelle() }), true)
  }
  /*
   * „Missbrauch prüfen" (22.10.2026, KI-Sicherheitsprüfung M1): Die Übersicht bleibt anonym. Nur mit einem Grund (mind.
   * 15 Zeichen) zeigt der Server für GENAU diese eine Abfrage die Namen zu „Lehrkraft A, B …" – nachdem er Grund,
   * Zeitraum und Admin im Serverprotokoll vermerkt hat. Nichts davon wird gespeichert oder an die Lehrkräfte gemeldet.
   */
  if (url.pathname === '/server/verwaltung/ki-missbrauch') {
    const grund = String(k0.grund ?? '')
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .trim()
      .slice(0, 500)
    if (grund.length < 15) return (json(res, 400, { fehler: 'Bitte den Grund der Prüfung angeben (mindestens 15 Zeichen). Er wird protokolliert.' }), true)
    const zeitraumRoh = String(k0.zeitraum ?? '')
    const zeitraum = (KI_ZEITRAEUME as string[]).includes(zeitraumRoh) ? (zeitraumRoh as KiZeitraum) : 'monat'
    protokolliereServer('verwaltung', `Missbrauch prüfen (KI-Nutzung, ${zeitraum}): Namen angezeigt – Grund: ${grund}`, sitzung.nutzer.id)
    const d = nutzungFuerVerwaltung(zeitraum, new Date(), true)
    const lehrkraefte = d.lehrkraefte.map(({ kennung, ...l }) => {
      const n = kennung ? nutzerNachId(kennung) : null
      return { ...l, name: n?.name ?? 'unbekannt', benutzer: n?.benutzer ?? '' }
    })
    return (json(res, 200, { zeitraum, von: d.von, bis: d.bis, lehrkraefte }), true)
  }

  if (url.pathname === '/server/verwaltung/ki-endpunkt') {
    if (!istKompatibel(name) || !TEILBARE_SCHLUESSEL.includes(name)) return (json(res, 400, { fehler: 'Unbekannter Anbieter.' }), true)
    const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')
    const neu: KompatibelEinstellung = { basisUrl: text(k0.basisUrl, 300), apiVersion: text(k0.apiVersion, 40), modell: text(k0.modell, 120) }
    if (neu.basisUrl) {
      const fehler = adressePruefen(neu.basisUrl, true)
      if (fehler) return (json(res, 400, { fehler }), true)
    }
    setzeServerWert(ENDPUNKTE, { ...serverWert<Record<string, KompatibelEinstellung>>(ENDPUNKTE, {}), [name]: neu })
    protokolliereServer('verwaltung', `KI-Adresse ${name} geändert`, sitzung.nutzer.id)
    return (json(res, 200, { ok: true }), true)
  }

  // Verbindungstest – eine echte, winzige Anfrage, nur auf Knopfdruck. Auch sie läuft durch den Namensschutz.
  if (!TEILBARE_SCHLUESSEL.includes(name) || !(AI_PROVIDERS.some((p) => p.id === name))) return (json(res, 400, { fehler: 'Unbekannter Anbieter.' }), true)
  const schluessel = serverGeheimnis(`schluessel:${name}`)
  if (!schluessel) return (json(res, 400, { fehler: 'Für diesen Anbieter ist kein Schlüssel hinterlegt.' }), true)
  const beginn = Date.now()
  try {
    const { provider, modell } = schulAnbieter(name, schluessel)
    if (!modell) throw new Error('Bitte zuerst ein Modell bzw. eine Bereitstellung eintragen.')
    const { req: geschuetzt } = schuetzeAnfrage(PING, namensMuster())
    const antwort = await provider.structured<{ ok?: boolean }>(geschuetzt, modell)
    if (antwort?.ok !== true) throw new Error('Unerwartete Antwort der KI.')
    return (json(res, 200, { ok: true, modell, sekunden: Math.round((Date.now() - beginn) / 100) / 10 }), true)
  } catch (e) {
    return (json(res, 200, { ok: false, fehler: e instanceof Error ? e.message : String(e) }), true)
  }
}
