/**
 * KI-Zugänge der Schule (09.10.2026, Auftrag des Admins) – ergänzt die freigegebenen Schlüssel
 * aus verwaltung.ts um:
 *
 *   GET  /server/verwaltung/ki-zugaenge   – Adressen/Vorgabemodelle der OpenAI-kompatiblen Anbieter + Nutzungsübersicht
 *   POST /server/verwaltung/ki-endpunkt   – Adresse, Azure-Version, Vorgabemodell eines Anbieters speichern
 *   POST /server/verwaltung/ki-test       – Schlüssel der Schule mit einer winzigen Anfrage prüfen (nur auf Knopfdruck)
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
import { AI_PROVIDERS, type AiProviderId, type StructuredRequest } from '@shared/types'
import { protokolliereServer, serverGeheimnis, serverWert, setzeServerWert } from './datenbank'
import { json, type Anfrage } from './http'
import { kiNutzungUebersicht } from './kiNutzung'
import { namensMuster } from './namensschutz'
import { schuetzeAnfrage } from './namensfilter'
import { TEILBARE_SCHLUESSEL } from './verwaltung'

const ENDPUNKTE = 'ki-endpunkte'

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
  const pfade = ['/server/verwaltung/ki-zugaenge', '/server/verwaltung/ki-endpunkt', '/server/verwaltung/ki-test']
  if (!pfade.includes(url.pathname)) return false
  if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
  if (sitzung.nutzer.rolle !== 'admin') return (json(res, 403, { fehler: 'Nur für die Verwaltung.' }), true)

  if (req.method === 'GET' && url.pathname === '/server/verwaltung/ki-zugaenge') {
    return (json(res, 200, { endpunkte: serverWert<Record<string, KompatibelEinstellung>>(ENDPUNKTE, {}), nutzung: kiNutzungUebersicht() }), true)
  }
  if (req.method !== 'POST') return (json(res, 405, { fehler: 'Nicht erlaubt.' }), true)
  if (typeof req.headers['x-schulapps-token'] !== 'string') return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
  const k0 = (await k.koerper()) as Record<string, unknown>
  const name = String(k0.name ?? '') as AiProviderId

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
