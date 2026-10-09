/**
 * Kurze Zusammenfassungen für die Köpfe der zugeklappten Karten in Einstellungen › KI-Zugang und › Bilder und Hörtexte
 * (09.10.2026, Wunsch der Lehrkraft): alle Karten sind eingeklappt, der Kopf sagt in einer Zeile, was eingerichtet ist –
 * etwa „Claude · Abo eingerichtet" oder „ElevenLabs · Schlüssel hinterlegt". Unpersönlich (tests/anrede.test.ts).
 */
import type { Stimmen } from './medienbank'

/** „Anthropic (Claude)" → „Claude"; ohne Klammer der ganze Name */
export const kurzName = (label: string): string => /\(([^)]+)\)/.exec(label)?.[1]?.trim() || label

interface TextStand {
  hasTextKey?: boolean
  textAccess?: string
}

export function textKiStatus(stand: TextStand | null, label: string, ueberPc = false): string {
  if (ueberPc) return 'Über Schul-Apps am PC'
  const name = kurzName(label)
  if (!stand) return name
  if (!stand.hasTextKey) return `${name} · noch nicht eingerichtet`
  return `${name} · ${stand.textAccess === 'subscription' ? 'Abo eingerichtet' : 'Schlüssel hinterlegt'}`
}

interface BildStand {
  imageProvider?: string
  imageAccess?: string
  hasImageKey?: boolean
}

export function bildKiStatus(stand: BildStand | null, label: string | null, ueberPc = false): string {
  if (ueberPc) return 'Über Schul-Apps am PC'
  if (!label || stand?.imageProvider === 'none') return 'Keine KI-Bilder'
  const name = kurzName(label)
  if (!stand) return name
  if (!stand.hasImageKey) return `${name} · noch nicht eingerichtet`
  return `${name} · ${stand.imageAccess === 'subscription' ? 'Abo eingerichtet' : 'Schlüssel hinterlegt'}`
}

export function hoertextStatus(elevenlabs: boolean | null, openai: boolean | null, ueberPc = false): string {
  if (ueberPc) return 'Über Schul-Apps am PC'
  if (elevenlabs) return 'ElevenLabs · Schlüssel hinterlegt'
  if (openai) return 'OpenAI-Stimmen über den API-Schlüssel'
  if (elevenlabs === null) return 'ElevenLabs'
  return 'Kein Schlüssel – Skripte bleiben Lesetexte'
}

export function bildsucheStatus(pixabay: boolean | null): string {
  return pixabay ? 'Openverse und Pixabay · Schlüssel hinterlegt' : 'Openverse (ohne Schlüssel)'
}

/** „4 Stimmen für 2 Sprachen" aus der Wahl je Sprache */
export function stimmenStatus(wahl: Record<string, Stimmen> | null): string {
  if (!wahl) return 'Standardstimmen je Sprache'
  const sprachen = Object.values(wahl).filter((s) => s && (s.w || s.m))
  const n = sprachen.reduce((z, s) => z + (s.w ? 1 : 0) + (s.m ? 1 : 0), 0)
  if (!n) return 'Noch keine Stimmen gewählt'
  return `${n} ${n === 1 ? 'Stimme' : 'Stimmen'} für ${sprachen.length} ${sprachen.length === 1 ? 'Sprache' : 'Sprachen'}`
}

/** Kopf der Verbrauchskarte: Aufrufe im Zeitraum und erreichte Limits */
export function verbrauchStatus(aufrufe: number | null, limits = 0, tage = 30): string {
  if (aufrufe === null) return 'Anfragen der eigenen KI-Zugänge'
  const teil = aufrufe ? `${aufrufe.toLocaleString('de-DE')} ${aufrufe === 1 ? 'Anfrage' : 'Anfragen'} in ${tage} Tagen` : `Keine Anfragen in ${tage} Tagen`
  return limits ? `${teil} · ${limits} ${limits === 1 ? 'Limit' : 'Limits'} erreicht` : teil
}

/** Gemerkter Zustand der Karten (je Gerät): Kennung → offen */
export const KLAPP_SCHLUESSEL = 'schulapps.einstellungen.offen'

export function leseOffen(roh: string | null): Record<string, boolean> {
  try {
    const d = roh ? (JSON.parse(roh) as unknown) : null
    if (!d || typeof d !== 'object' || Array.isArray(d)) return {}
    return Object.fromEntries(Object.entries(d as Record<string, unknown>).filter(([, v]) => typeof v === 'boolean')) as Record<string, boolean>
  } catch {
    return {}
  }
}
