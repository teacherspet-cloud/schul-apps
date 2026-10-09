import { AiProviderId, KernAnbieterId, ModelKind, ModelOption } from '@shared/types'
import { istKompatibel, KOMPATIBLE_ANBIETER, kompatibelVorgabe } from '@shared/kiAnbieter'
import { RawModel } from './provider'

/**
 * Filtert die Modellliste eines Anbieters auf Modelle, die für die Schul-Apps taugen
 * (Text: strukturierte Ausgabe + Bildeingabe; Bilder: Bilderzeugung), und markiert das empfohlene.
 * Neue Modelle erscheinen automatisch, sobald der Anbieter sie in seiner Liste führt.
 */
export function filterModels(provider: AiProviderId, kind: ModelKind, raw: RawModel[]): ModelOption[] {
  const picked = raw.filter((m) => accepts(provider, kind, m))
  const sorted = [...picked].sort((a, b) => compareNewest(a, b))
  const recommended = pickRecommended(provider, kind, sorted)
  const options = sorted.map((m) => ({
    id: m.id,
    label: m.label && m.label !== m.id ? `${m.label} (${m.id})` : m.id,
    recommended: m.id === recommended?.id
  }))
  // Empfohlenes Modell zuerst
  return [...options.filter((o) => o.recommended), ...options.filter((o) => !o.recommended)]
}

/** Solange noch keine Liste vom Anbieter vorliegt (z. B. ohne Schlüssel). */
export const BUILTIN_MODELS: Record<AiProviderId, Record<ModelKind, string[]>> = {
  ...({
    openai: { text: ['gpt-5.5', 'gpt-5.4-mini'], image: ['gpt-image-2'] },
    anthropic: { text: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'], image: [] },
    google: { text: ['gemini-2.5-pro', 'gemini-2.5-flash'], image: ['imagen-4.0-generate-001'] }
  } satisfies Record<KernAnbieterId, Record<ModelKind, string[]>>),
  // OpenAI-kompatible Anbieter (09.10.2026): Modelle aus den Voreinstellungen, Bilder vorerst nicht
  ...(Object.fromEntries(KOMPATIBLE_ANBIETER.map((a) => [a.id, { text: a.modelle, image: [] }])) as Record<string, Record<ModelKind, string[]>>)
} as unknown as Record<AiProviderId, Record<ModelKind, string[]>>

export function builtinOptions(provider: AiProviderId, kind: ModelKind): ModelOption[] {
  return BUILTIN_MODELS[provider][kind].map((id, i) => ({ id, label: id, recommended: i === 0 }))
}

/** Versionsnummer aus einer Modell-ID, z. B. „gpt-5.4-mini" → 5.4, „gemini-2.5-pro" → 2.5. */
export function modelVersion(id: string): number {
  const m = /(?:gpt|gemini|imagen|gpt-image|claude-[a-z]+)-(\d+(?:[.-]\d+)?)/.exec(id)
  return m ? Number(m[1].replace('-', '.')) : 0
}

const DATED = /-\d{4}-?\d{2}-?\d{2}$|-\d{8}$|-\d{3}$/

function accepts(provider: AiProviderId, kind: ModelKind, m: RawModel): boolean {
  const id = m.id.toLowerCase()
  if (istKompatibel(provider)) {
    // Was der Endpunkt meldet, ohne offensichtliche Nicht-Textmodelle; Bilder über diesen Weg vorerst nicht
    if (kind === 'image') return false
    return !/(embed|whisper|tts|transcri|audio|rerank|moderation|guard|flux|dall-e|imagen|stable-diffusion|sdxl|ocr)/.test(id)
  }
  if (provider === 'openai') {
    if (kind === 'image') return /^(gpt-image-\d+(\.\d+)?(-mini)?|dall-e-3)$/.test(id)
    if (!/^(gpt-(4o|4\.1|[5-9])|o[1-9])/.test(id)) return false
    return (
      !/(audio|realtime|tts|transcribe|search|image|embedding|moderation|instruct|codex|chat-latest|oss|deep-research|computer-use|preview)/.test(id) &&
      !DATED.test(id)
    )
  }
  if (provider === 'anthropic') {
    if (kind === 'image') return false
    return id.startsWith('claude-') && m.meta?.imageInput !== false && m.meta?.structuredOutputs !== false
  }
  // Google
  const actions = (m.meta?.actions as string[] | undefined) ?? []
  if (kind === 'image') {
    return (id.startsWith('imagen-') && actions.includes('predict')) || (/^gemini-.*image/.test(id) && actions.includes('generateContent'))
  }
  if (!id.startsWith('gemini-') || !actions.includes('generateContent')) return false
  return !/(image|tts|audio|live|embedding|robotics|computer-use|exp|learnlm|nano|aqa|gemma|latest)/.test(id) && !/-\d{3}$/.test(id)
}

function compareNewest(a: RawModel, b: RawModel): number {
  if (a.created && b.created && a.created !== b.created) return b.created - a.created
  const v = modelVersion(b.id) - modelVersion(a.id)
  if (v !== 0) return v
  // Vorschau-Versionen hinter stabile Versionen
  return Number(a.id.includes('preview')) - Number(b.id.includes('preview')) || a.id.localeCompare(b.id)
}

function pickRecommended(provider: AiProviderId, kind: ModelKind, sorted: RawModel[]): RawModel | undefined {
  if (istKompatibel(provider)) {
    const vorgabe = kompatibelVorgabe(provider)?.modelle ?? []
    return vorgabe.map((v) => sorted.find((m) => m.id === v)).find(Boolean) ?? sorted[0]
  }
  const byVersion = (list: RawModel[]): RawModel | undefined => [...list].sort((a, b) => modelVersion(b.id) - modelVersion(a.id) || compareNewest(a, b))[0]
  if (provider === 'openai') {
    if (kind === 'image') return byVersion(sorted.filter((m) => /^gpt-image-[\d.]+$/.test(m.id))) ?? sorted[0]
    return byVersion(sorted.filter((m) => /^gpt-\d+(\.\d+)?$/.test(m.id))) ?? sorted[0]
  }
  if (provider === 'anthropic') {
    return sorted.find((m) => m.id.includes('opus')) ?? sorted[0]
  }
  if (kind === 'image') return byVersion(sorted.filter((m) => /^imagen-.*generate/.test(m.id) && !m.id.includes('fast'))) ?? sorted[0]
  const stable = sorted.filter((m) => !m.id.includes('preview'))
  return byVersion(stable.filter((m) => m.id.includes('pro'))) ?? byVersion(sorted.filter((m) => m.id.includes('pro'))) ?? sorted[0]
}
