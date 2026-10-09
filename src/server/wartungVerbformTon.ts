/**
 * Aufnahmen mit „slash" und falsch gesprochenen Verbformen löschen (09.10.2026, Wunsch der Lehrkraft: „was / were" soll
 * als „was … were" klingen, nie „slash"; Regeln in shared/sprechtext.ts, Recherche in
 * recherche/aussprache-unregelmaessige-verben.md).
 *
 * Einmalige Wartung `verbform-ton-2026-10-09` – nach dem Muster von `abkuerzung-ton-2026-10-09`
 * (wartungAbkuerzungTon.ts). Gelöscht werden in der gemeinsamen Medienbank beide Fassungen (weiblich/männlich)
 *  a) jeder Wort- und Satz-Aufnahme, deren gesprochener Text einen Schrägstrich zwischen Wörtern hatte („was/were",
 *     „he/she", „be (was/were, been)") – die Sprach-KI sagte dort oft „slash";
 *  b) jeder Aufnahme einer Verbform (Satz im Eintrag eines Verbs, ohne eigenen Sprechtext), die nach den neuen Regeln
 *     anders klingt: Varianten „was, were" (jetzt mit Pause), „je suis allée"/„sono stato, a" (jetzt Grundform), „—",
 *     Marker „AE"/„BE", Homographen „lead", „wind", „wound", „tear" (jetzt mit Ersatzschreibung).
 * „read" der Vergangenheit hat einen neuen Schlüssel („read (Vergangenheit)") – die alte Aufnahme „read" bleibt für den
 * Infinitiv.
 *
 * Sicherheit wie bei der Abkürzungs-Wartung, dazu eine Sicherung: Nur Aufnahmen der Sprach-KI (mit Stimmenkennung),
 * Bilder bleiben. Vor der ersten Löschung kommt index.json nach <Medienbank>/sicherung-verbform-ton-2026-10-09/, die
 * betroffenen Dateien werden dorthin verschoben statt gelöscht. Das Protokoll nennt nur Zahlen. Danach erzeugt die App
 * die fehlenden Aufnahmen wie gewohnt bei Bedarf neu (bis dahin spricht die Stimme des Geräts nach den neuen Regeln).
 */
import type { DatabaseSync } from 'node:sqlite'
import { ohneSchraegstrich, verbFormSprechtext } from '../shared/sprechtext'
import { toeneAussortieren } from '../main/services/storage/medienbank'
import type { MedienTon, TonArt } from '../shared/medienbank'

export const VERBFORM_SICHERUNG = 'sicherung-verbform-ton-2026-10-09'

const norm = (s: string): string => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()

/** Ist der Eintrag ein Verb der Verblisten? Dann liegt die Grundform selbst als „Satz" darin („go", „to be", „aller") */
export const istVerbEintrag = (e: { wort: string; saetze: string[] }): boolean => {
  const w = norm(e.wort)
  return Boolean(w) && e.saetze.some((s) => norm(s) === w || norm(s) === `to ${w}`)
}

/** Sieht der Satz wie eine Verbform aus (kurz, ohne Satzzeichen am Ende, ohne Doppelpunkt)? Hinweise sind meist länger */
const wieForm = (t: string): boolean => t.length <= 60 && !/[.!?:]\s*$|:/.test(t.trim()) && t.split(',').every((x) => x.trim().split(' ').length <= 4)

/** Gehört diese Aufnahme gelöscht? `eintrag`: Wort des Medienbank-Eintrags und seine Sätze */
export function verbformTonVeraltet(ton: MedienTon, art: TonArt, sprache: string, eintrag: { wort: string; saetze: string[] }): boolean {
  if (!ton || typeof ton.stimme !== 'string' || !ton.stimme.trim() || typeof ton.text !== 'string') return false
  const gesprochen = (typeof ton.gesprochen === 'string' && ton.gesprochen.trim() ? ton.gesprochen : ton.text).trim()
  // a) Schrägstrich zwischen Wörtern im gesprochenen Text
  if (ohneSchraegstrich(gesprochen) !== gesprochen) return true
  // b) Verbform ohne eigenen Sprechtext, die jetzt anders klingt
  if (art !== 'satz' || ton.gesprochen || !istVerbEintrag(eintrag) || / \(Vergangenheit\)$/.test(ton.text) || !wieForm(ton.text)) return false
  const w = norm(eintrag.wort)
  const spalte = norm(ton.text) === w || norm(ton.text) === `to ${w}` ? 'inf' : 'past'
  return verbFormSprechtext(ton.text, sprache, spalte) !== gesprochen
}

export function verbformToeneLoeschen(): string {
  try {
    const z = toeneAussortieren(verbformTonVeraltet, VERBFORM_SICHERUNG)
    return `${z.woerter} Wort- und ${z.saetze} Satz-Aufnahmen mit Schrägstrich bzw. alter Verbform-Aussprache entfernt (${z.dateien} Dateien, gesichert in ${VERBFORM_SICHERUNG})`
  } catch (e) {
    // Ohne Medienbank oder bei unlesbarem Index: nichts löschen, aber die Wartung nicht blockieren
    return `nichts gelöscht (${e instanceof Error ? e.name : 'Fehler'})`
  }
}

export const VERBFORM_TON: [string, (d: DatabaseSync) => string] = ['verbform-ton-2026-10-09', () => verbformToeneLoeschen()]
