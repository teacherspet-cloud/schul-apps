/**
 * Fachobleute in der Oberfläche (12.10.2026, Regeln in @shared/fachobleute): Wer darf gemeinsame Lehrwerke eines Fachs
 * bearbeiten, wer sieht „Vokabellisten" und „Grammatikformen"? Am Server aus /server/ich.js, am PC ohne Server ist die
 * eine Lehrkraft berechtigt. Die Prüfung, die zählt, macht der Server (main/services/rolle.ts) – hier geht es nur um
 * Anzeige und Sperren der Eingabe.
 */
import { darfLehrwerkFach, siehtLehrwerkPflege } from '@shared/fachobleute'
import { aufServer, serverIch } from './plattform'

/** Fächer, für die die angemeldete Lehrkraft Fachobfrau/-mann ist (am Server) */
export const eigeneObmannFaecher = (): string[] => serverIch()?.fachobmann ?? []

/** Darf gemeinsame Lehrwerke dieser Sprache bearbeiten? */
export function darfLehrwerkBearbeiten(sprache: string): boolean {
  if (!aufServer()) return true
  const ich = serverIch()
  return darfLehrwerkFach(ich?.rolle, ich?.fachobmann, sprache)
}

/** Sieht die Apps „Vokabellisten" und „Grammatikformen"? */
export function siehtLehrwerkApps(): boolean {
  if (!aufServer()) return true
  const ich = serverIch()
  return siehtLehrwerkPflege(ich?.rolle, ich?.fachobmann)
}
