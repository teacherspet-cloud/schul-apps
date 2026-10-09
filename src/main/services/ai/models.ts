import { AI_PROVIDERS, AiProviderId, AppSettings, DEFAULT_SETTINGS, KompatibelEinstellung, KompatibelId, ModelKind, ModelListResult } from '@shared/types'
import { istKompatibel, kompatibelVorgabe } from '@shared/kiAnbieter'
import { KompatibelProvider, adressePruefen, type KompatibelZiel } from './kompatibel'
import { aufServer } from './cli'
import { getSecret, getSettings, readJson, setSettings, writeJson } from '../storage/settings'
import { AnthropicProvider } from './anthropic'
import { createCliProvider } from './cli'
import { builtinOptions, filterModels } from './catalog'
import { GoogleProvider } from './google'
import { OpenAiProvider } from './openai'
import { AttrappeProvider, attrappeAktiv } from './attrappe'
import { AiProvider, RawModel } from './provider'

const CACHE_FILE = 'model-cache.json'
/** Nach dieser Zeit wird die Modellliste automatisch neu beim Anbieter abgefragt. */
const MAX_AGE_MS = 12 * 60 * 60 * 1000

type Cache = Partial<Record<AiProviderId, { fetchedAt: string; models: RawModel[] }>>

/**
 * Server (09.10.2026): Adresse und API-Version, die der Admin für einen OpenAI-kompatiblen Anbieter
 * der Schule hinterlegt hat – gilt, wenn die Lehrkraft keine eigene Adresse eingetragen hat (wie
 * `setzeGeheimRueckfall` für den Schlüssel). Am PC nie gesetzt.
 */
let endpunktRueckfall: ((id: KompatibelId) => KompatibelEinstellung | undefined) | null = null
export const setzeEndpunktRueckfall = (fn: typeof endpunktRueckfall): void => {
  endpunktRueckfall = fn
}

/** Adresse, Schlüssel und Azure-Angaben eines OpenAI-kompatiblen Anbieters */
export function kompatibelZiel(id: KompatibelId, eigene = getSettings().ai.kompatibel?.[id]): KompatibelZiel {
  const vorgabe = kompatibelVorgabe(id)
  const label = vorgabe?.label ?? id
  const server = aufServer()
  if (vorgabe?.nurPc && server) throw new Error(`${label} steht nur in der App am PC zur Verfügung.`)
  const schule = endpunktRueckfall?.(id)
  const basisUrl = eigene?.basisUrl?.trim() || schule?.basisUrl?.trim() || vorgabe?.basisUrl || ''
  if (!basisUrl) throw new Error(`Für ${label} ist keine Adresse eingetragen. Bitte in den Einstellungen ergänzen.`)
  const fehler = adressePruefen(basisUrl, server)
  if (fehler) throw new Error(fehler)
  const schluessel = getSecret(id)
  if (!schluessel && !vorgabe?.ohneSchluessel) throw new Error(`Kein API-Schlüssel für ${label} hinterlegt. Bitte in den Einstellungen eintragen.`)
  return {
    id,
    basisUrl,
    schluessel,
    azure: vorgabe?.azure,
    apiVersion: (eigene?.basisUrl?.trim() ? eigene?.apiVersion : (eigene?.apiVersion ?? schule?.apiVersion))?.trim() || undefined
  }
}

/** API-Zugang vorhanden? (Schlüssel – oder bei lokalen Modellen ohne Schlüssel einfach ja; nicht auf dem Server) */
export function hatApiZugang(id: AiProviderId): boolean {
  if (getSecret(id)) return true
  const v = istKompatibel(id) ? kompatibelVorgabe(id) : undefined
  return Boolean(v?.ohneSchluessel && !(v.nurPc && aufServer()))
}

export function createProvider(id: AiProviderId): AiProvider {
  if (istKompatibel(id)) return new KompatibelProvider(kompatibelZiel(id))
  const key = getSecret(id)
  const label = AI_PROVIDERS.find((p) => p.id === id)?.label ?? id
  if (!key) throw new Error(`Kein API-Schlüssel für ${label} hinterlegt. Bitte in den Einstellungen eintragen.`)
  if (id === 'anthropic') return new AnthropicProvider(key)
  if (id === 'google') return new GoogleProvider(key)
  return new OpenAiProvider(key)
}

/** Anbieter für Texte und Texterkennung – je nach Einstellung über API-Schlüssel oder privates Abo. */
export function createTextProvider(id: AiProviderId): { provider: AiProvider; model: string } {
  // Nur in den Oberflächentests (Umgebungsvariable, siehe attrappe.ts) – nie im Betrieb
  if (attrappeAktiv()) return { provider: new AttrappeProvider(), model: 'attrappe' }
  const { ai } = getSettings()
  if (ai.access[id] === 'subscription' && !istKompatibel(id)) {
    if (!ai.subscriptionAccepted[id]) {
      throw new Error('Der Abo-Zugang ist noch nicht freigegeben. Bitte in den Einstellungen den Hinweis zu den Nutzungsbedingungen bestätigen.')
    }
    return { provider: createCliProvider(id), model: ai.subscriptionModels[id] }
  }
  return { provider: createProvider(id), model: istKompatibel(id) ? kompatibelModell(id, ai) : ai.textModels[id] }
}

/**
 * Modell eines OpenAI-kompatiblen Anbieters: Hat die Lehrkraft weder eigene Adresse noch ein eigenes Modell gewählt
 * und die Schule ein Vorgabemodell (bei Azure der Name der Bereitstellung) hinterlegt, gilt das der Schule.
 */
export function kompatibelModell(id: KompatibelId, ai: AppSettings['ai'] = getSettings().ai): string {
  const eigenes = ai.textModels[id]
  const schule = endpunktRueckfall?.(id)?.modell?.trim()
  const vorgabe = DEFAULT_SETTINGS.ai.textModels[id]
  if (schule && !ai.kompatibel?.[id]?.basisUrl?.trim() && (!eigenes || eigenes === vorgabe)) return schule
  return eigenes
}

/** Fragt die Modelle live beim Anbieter ab und legt sie im Zwischenspeicher ab. */
export async function refreshProvider(id: AiProviderId): Promise<RawModel[]> {
  const models = await createProvider(id).listModels()
  const cache = readJson<Cache>(CACHE_FILE, {})
  cache[id] = { fetchedAt: new Date().toISOString(), models }
  writeJson(CACHE_FILE, cache)
  return models
}

export async function getModelList(provider: AiProviderId, kind: ModelKind, forceRefresh = false): Promise<ModelListResult> {
  const cached = readJson<Cache>(CACHE_FILE, {})[provider]
  const stale = !cached || Date.now() - Date.parse(cached.fetchedAt) > MAX_AGE_MS
  let error: string | undefined

  if ((forceRefresh || stale) && hatApiZugang(provider)) {
    try {
      const models = await refreshProvider(provider)
      return { provider, kind, models: filterModels(provider, kind, models), fetchedAt: new Date().toISOString(), source: 'live' }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  }
  if (cached) {
    const models = filterModels(provider, kind, cached.models)
    if (models.length) return { provider, kind, models, fetchedAt: cached.fetchedAt, source: 'cache', error }
  }
  return { provider, kind, models: builtinOptions(provider, kind), source: 'builtin', error }
}

/**
 * Hält die Modellauswahl aktuell:
 * - mit „immer neuestes Modell" wird auf das empfohlene Modell des Anbieters gewechselt,
 * - ein nicht mehr verfügbares Modell (z. B. abgekündigt) wird immer ersetzt.
 * Liefert Hinweise für die Oberfläche.
 */
export async function healModelSelection(): Promise<string[]> {
  const settings = getSettings()
  const notes: string[] = []
  const patch: AppSettings['ai'] = structuredClone(settings.ai)

  for (const provider of AI_PROVIDERS.map((p) => p.id)) {
    // OpenAI-kompatible: Modell von Hand bzw. Name der Azure-Bereitstellung – nie automatisch ersetzen (09.10.2026)
    if (istKompatibel(provider) || !getSecret(provider)) continue
    const text = await getModelList(provider, 'text')
    const textNote = pickCurrent(text.source, text.models, patch.textModels[provider], settings.ai.autoLatest)
    if (textNote) {
      notes.push(`${label(provider)}: ${textNote.reason} Textmodell jetzt „${textNote.next}".`)
      patch.textModels[provider] = textNote.next
    }
    if (provider === 'openai' || provider === 'google') {
      const image = await getModelList(provider, 'image')
      const imageNote = pickCurrent(image.source, image.models, patch.imageModels[provider], settings.ai.autoLatest)
      if (imageNote) {
        notes.push(`${label(provider)}: ${imageNote.reason} Bildmodell jetzt „${imageNote.next}".`)
        patch.imageModels[provider] = imageNote.next
      }
    }
  }
  if (notes.length) setSettings({ ai: patch })
  return notes
}

function pickCurrent(
  source: ModelListResult['source'],
  models: ModelListResult['models'],
  current: string,
  autoLatest: boolean
): { next: string; reason: string } | null {
  if (source === 'builtin' || models.length === 0) return null
  const recommended = models.find((m) => m.recommended) ?? models[0]
  if (!models.some((m) => m.id === current)) return { next: recommended.id, reason: `„${current}" ist nicht mehr verfügbar.` }
  if (autoLatest && recommended.id !== current) return { next: recommended.id, reason: 'Neueres Modell verfügbar.' }
  return null
}

const label = (id: AiProviderId): string => AI_PROVIDERS.find((p) => p.id === id)?.label ?? id
