/**
 * Ersatz für main/services/ai/setup.ts in der iPad-App: Das Programm des KI-Anbieters lässt sich
 * dort weder herunterladen noch starten (siehe stubs/cli.ts).
 */
import { ABO_NUR_AM_PC } from './cli'

export async function installCli(): Promise<string> {
  throw new Error(ABO_NUR_AM_PC)
}

export function startLogin(): void {
  throw new Error(ABO_NUR_AM_PC)
}

export function submitLoginCode(): void {
  throw new Error(ABO_NUR_AM_PC)
}

export function cancelLogin(): void {
  // Es läuft keine Anmeldung
}

export function reopenLoginPage(): void {
  throw new Error(ABO_NUR_AM_PC)
}
