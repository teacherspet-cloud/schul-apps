/**
 * Weitere KI-Anbieter über die OpenAI-kompatible Schnittstelle (09.10.2026, Auftrag des Admins).
 *
 * Recherche: recherche/ki-anbieter-2026-10-09.md. Viele Anbieter – auch solche mit Datenort in der
 * EU oder in Deutschland – sprechen dasselbe Format wie OpenAI (`/chat/completions` mit
 * `response_format`). Statt je Anbieter ein eigenes Programmpaket einzubinden, gibt es EINEN
 * Zugang (main/services/ai/kompatibel.ts) und hier die Voreinstellungen: Adresse, Modelle,
 * Hinweise zum Datenort. Für alles Übrige (T-Systems, Vertex, ein Landes-Zugang …) gibt es
 * „Eigener Endpunkt" mit frei eintragbarer Adresse.
 *
 * Bewusst ohne Importe: types.ts liest diese Liste beim Laden (sonst Kreisbezug).
 */

export type KompatibelId = 'mistral' | 'azure' | 'ionos' | 'stackit' | 'gemini_oai' | 'openrouter' | 'lokal' | 'eigener'

export interface KompatibelVorgabe {
  id: KompatibelId
  label: string
  /** Kurzer Hinweis zu Datenort und Eignung (Einstellungen, Verwaltung) */
  datenort: string
  /** Für Schulen empfohlen (Datenort EU/DE, AVV) */
  empfohlen?: boolean
  /** Voreingestellte Adresse ('' = muss eingetragen werden) */
  basisUrl: string
  /** Platzhalter für das Adressfeld */
  basisUrlBeispiel?: string
  /** Wo es den Schlüssel gibt */
  keyUrl: string
  keyPlaceholder: string
  /** Kein Schlüssel nötig (lokal) */
  ohneSchluessel?: boolean
  /** Nur am PC – der Server erreicht den Rechner der Lehrkraft nicht */
  nurPc?: boolean
  /** Azure: Kopf `api-key` statt Bearer; Modell = Name der Bereitstellung */
  azure?: boolean
  /** Bekannte Modelle (das erste ist die Vorgabe); weitere lassen sich von Hand eintragen */
  modelle: string[]
  /** Modelle mit Bildeingabe (Schulbuchseiten, Fotos von Arbeiten); ohne Angabe: unbekannt */
  bildEingabe?: string[]
}

export const KOMPATIBLE_ANBIETER: KompatibelVorgabe[] = [
  {
    id: 'mistral',
    label: 'Mistral (EU)',
    datenort: 'Verarbeitung in der EU (Frankreich), AVV, kein Training mit API-Daten',
    empfohlen: true,
    basisUrl: 'https://api.mistral.ai/v1',
    keyUrl: 'console.mistral.ai',
    keyPlaceholder: 'Mistral-API-Schlüssel',
    modelle: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest'],
    bildEingabe: ['mistral-medium-latest', 'mistral-small-latest', 'mistral-large-latest']
  },
  {
    id: 'azure',
    label: 'Azure OpenAI (EU-Datenzone)',
    datenort: 'Mit „Data Zone Standard" in einer EU-Region nur EU-Verarbeitung; Microsoft-AVV',
    empfohlen: true,
    basisUrl: '',
    basisUrlBeispiel: 'https://meine-ressource.openai.azure.com',
    keyUrl: 'ai.azure.com',
    keyPlaceholder: 'Azure-Schlüssel',
    azure: true,
    modelle: ['gpt-5.4', 'gpt-5.4-mini']
  },
  {
    id: 'ionos',
    label: 'IONOS AI Model Hub (DE)',
    datenort: 'Verarbeitung nur in Deutschland (Berlin), deutscher Anbieter mit AVV',
    empfohlen: true,
    basisUrl: 'https://openai.inference.de-txl.ionos.com/v1',
    keyUrl: 'dcd.ionos.com',
    keyPlaceholder: 'IONOS-Token',
    modelle: ['openai/gpt-oss-120b', 'Qwen/Qwen3.5-397B-A17B', 'meta-llama/Llama-3.3-70B-Instruct', 'mistralai/Mistral-Small-24B-Instruct']
  },
  {
    id: 'stackit',
    label: 'STACKIT AI Model Serving (DE)',
    datenort: 'Rechenzentren in Deutschland/Österreich, Anfragen werden nicht gespeichert, AVV',
    empfohlen: true,
    basisUrl: 'https://api.openai-compat.model-serving.eu01.onstackit.cloud/v1',
    keyUrl: 'portal.stackit.cloud',
    keyPlaceholder: 'STACKIT-Token',
    modelle: ['openai/gpt-oss-120b', 'Qwen/Qwen3-VL-235B-A22B-Instruct-FP8', 'cortecs/Llama-3.3-70B-Instruct-FP8-Dynamic'],
    bildEingabe: ['Qwen/Qwen3-VL-235B-A22B-Instruct-FP8']
  },
  {
    id: 'gemini_oai',
    label: 'Gemini (OpenAI-kompatibel)',
    datenort: 'Google AI Studio: keine EU-Zusage; nur bezahlte Stufe ohne Training – für EU-Verarbeitung Vertex AI als eigenen Endpunkt',
    basisUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyUrl: 'aistudio.google.com',
    keyPlaceholder: 'AIza…',
    modelle: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    bildEingabe: ['gemini-2.5-pro', 'gemini-2.5-flash']
  },
  {
    id: 'openrouter',
    label: 'OpenRouter (zum Ausprobieren)',
    datenort: 'USA, leitet an viele Unteranbieter weiter – nicht für Material mit Personenbezug',
    basisUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'openrouter.ai',
    keyPlaceholder: 'sk-or-…',
    modelle: ['mistralai/mistral-medium-3.1', 'openai/gpt-5.4-mini', 'google/gemini-2.5-flash']
  },
  {
    id: 'lokal',
    label: 'Lokal (Ollama / LM Studio)',
    datenort: 'Auf diesem Rechner – keine Daten verlassen das Gerät; Qualität hängt an Modell und Grafikkarte',
    basisUrl: 'http://localhost:11434/v1',
    basisUrlBeispiel: 'http://localhost:11434/v1 (Ollama) oder http://localhost:1234/v1 (LM Studio)',
    keyUrl: 'ollama.com',
    keyPlaceholder: 'nicht nötig',
    ohneSchluessel: true,
    nurPc: true,
    modelle: ['qwen3:30b', 'gemma3:27b', 'mistral-small3.2']
  },
  {
    id: 'eigener',
    label: 'Eigener Endpunkt (OpenAI-kompatibel)',
    datenort: 'Hängt vom Anbieter ab (z. B. T-Systems AI Foundation Services, Landes-Zugang)',
    basisUrl: '',
    basisUrlBeispiel: 'https://…/v1',
    keyUrl: '',
    keyPlaceholder: 'Schlüssel des Anbieters',
    modelle: []
  }
]

export const KOMPATIBEL_IDS: KompatibelId[] = KOMPATIBLE_ANBIETER.map((a) => a.id)

export const kompatibelVorgabe = (id: string): KompatibelVorgabe | undefined => KOMPATIBLE_ANBIETER.find((a) => a.id === id)

export const istKompatibel = (id: string): id is KompatibelId => KOMPATIBEL_IDS.includes(id as KompatibelId)

/** Adresse und (Azure) API-Version je Anbieter – in den Einstellungen der Lehrkraft bzw. vom Admin für die Schule */
export interface KompatibelEinstellung {
  basisUrl?: string
  /** Nur Azure mit älteren Ressourcen: z. B. „2025-04-01-preview"; leer = v1-Schnittstelle ohne Version */
  apiVersion?: string
  /** Nur in der Einrichtung der Schule: Vorgabemodell bzw. Azure-Bereitstellung für alle, die nichts Eigenes gewählt haben */
  modell?: string
}
