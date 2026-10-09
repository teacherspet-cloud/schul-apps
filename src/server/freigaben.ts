/**
 * Welche Aufrufe der Oberfläche der Server annimmt (02.10.2026).
 *
 * Grundlage ist die Erlaubnisliste des Netzzugangs am PC (main/services/lanServer.ts,
 * ERLAUBTE_KANAELE) – weiter gilt: Was nicht ausdrücklich erlaubt ist, wird abgelehnt.
 * Anders als am PC arbeitet hier jede Lehrkraft in ihrer EIGENEN Ablage. Deshalb darf sie dort,
 * was sie am eigenen PC auch darf: API-Schlüssel hinterlegen, eigenes Material löschen, ihr
 * Abo anmelden. Gesperrt bleibt, was den Server selbst beträfe oder ihn nicht gibt:
 * Programme starten (cliPaths), Dateien/Ordner des Servers, Netzzugang, Wartung, IServ-WebDAV
 * (bräuchte das IServ-Passwort), direktes Drucken.
 */
import { ERLAUBTE_KANAELE } from '../main/services/lanServer'

const MATERIAL = [
  'sheets',
  'exams',
  'tests',
  'kurztests',
  'grammarTests',
  'rueckmeldungen',
  'elternbriefe',
  'tafelbilder',
  'bewertungstabellen',
  'nachteilsausgleiche'
]

export const SERVER_KANAELE: ReadonlySet<string> = new Set([
  ...ERLAUBTE_KANAELE,
  // Eigene Schlüssel und eigenes Abo (je Nutzer verschlüsselt, server/geheim.ts)
  'secrets:set',
  'ai:test',
  'ai:subscription-models',
  'ai:subscription-test',
  'ai:subscription-image-test',
  'ai:login-start',
  'ai:login-code',
  'ai:login-cancel',
  'verbrauch:get',
  'verbrauch:kontingent',
  // Eigenes Material löschen – die eigene Ablage, nicht die eines anderen
  ...MATERIAL.map((m) => `${m}:delete`),
  'nachteilsausgleiche:list',
  'textbooks:delete',
  'verbLists:delete',
  'library:delete',
  'themen:delete',
  'designs:delete',
  'maskottchen:save',
  'maskottchen:pose',
  'maskottchen:delete-pose',
  'maskottchen:delete',
  // Unterschrift für Briefe (Bild, je Nutzer)
  'branding:get-unterschrift',
  'branding:set-unterschrift',
  'branding:remove-unterschrift',
  // Antworten ohne Wirkung, die die Oberfläche beim Aufbau abfragt
  'fenster:gesichert',
  'fenster:rueckfrage',
  'fenster:bleiben',
  'lan:status',
  'lan:freigabe-status',
  'iserv:status',
  'protokoll:melden',
  // Medienbank der Vokabeln: ändern (nur Admins – prüft der Dienst selbst, main/services/rolle.ts)
  'medien:stimme-setzen',
  'medien:bild-setzen',
  'medien:bild-loeschen',
  'medien:ohne-bild',
  'medien:ton-setzen',
  'medien:ton-loeschen'
])

/** Einstellungen, die eine Lehrkraft auf dem Server nicht setzen darf */
export function beschneideEinstellungen(patch: unknown): unknown {
  if (!patch || typeof patch !== 'object') return patch
  // IServ-Angaben (Schule, Benutzer, Ziel – nie ein Passwort) bleiben: die Exe „Schul-Apps Online“ braucht sie
  // Fachfarben legt am Server die Verwaltung fest (09.10.2026, fachfarben.ts)
  const { lan: _l, sicherung: _s, pcKi: _p, fachfarben: _f, ...rest } = patch as Record<string, unknown>
  if (rest.briefkopf && typeof rest.briefkopf === 'object') {
    // Zertifikat (Datei) und Signieren gehören an den eigenen Rechner
    const { zertifikat: _z, signieren: _si, ...kopf } = rest.briefkopf as Record<string, unknown>
    rest.briefkopf = kopf
  }
  if (rest.ai && typeof rest.ai === 'object') {
    // Programmpfade: Der Server startet nur seine eigenen, fest eingebauten KI-Programme
    const { cliPaths: _c, ...ai } = rest.ai as Record<string, unknown>
    rest.ai = ai
  }
  return rest
}

export const beschneideServer = (kanal: string, args: unknown[]): unknown[] =>
  kanal === 'settings:set' ? [beschneideEinstellungen(args[0]), ...args.slice(1)] : args
