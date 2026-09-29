/**
 * Ersatz für main/services/ai/cli.ts in der iPad-App (vite.mobil.config.ts tauscht das Modul).
 *
 * Der Abo-Zugang startet am PC das Programm des KI-Anbieters (Codex, Claude Code, Antigravity)
 * als eigenen Prozess. Auf dem iPad gibt es keine Prozesse – dort geht die KI nur über einen
 * API-Schlüssel. Der Start (mobil/start.ts) stellt gespeicherte Abo-Einstellungen deshalb auf
 * „API-Schlüssel" um; diese Fassung liefert klare Meldungen, falls doch jemand danach fragt.
 */
import type { AiProviderId, ModelOption, SubscriptionStatus } from '@shared/types'
import type { AiProvider } from '../../main/services/ai/provider'

export const ABO_NUR_AM_PC = 'Der Abo-Zugang steht nur in der App am PC zur Verfügung – auf dem iPad bitte einen API-Schlüssel eintragen.'

export function createCliProvider(_provider: AiProviderId): AiProvider {
  throw new Error(ABO_NUR_AM_PC)
}

export async function subscriptionStatus(provider: AiProviderId): Promise<SubscriptionStatus> {
  return { provider, path: null, loggedIn: false, detail: ABO_NUR_AM_PC }
}

export async function subscriptionModels(_provider: AiProviderId): Promise<ModelOption[]> {
  return [{ id: '', label: 'Voreinstellung des Programms', recommended: true }]
}

/** Arbeitsordner gibt es keine */
export function cleanupWorkDirs(): number {
  return 0
}

export function findCli(): string | null {
  return null
}
