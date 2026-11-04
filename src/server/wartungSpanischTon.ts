/**
 * Spanische Aufnahmen nach den alten Sprechregeln aussortieren (01.11.2026, Wunsch der Lehrkraft: „prüfe, bei welchen
 * Spanischvokabeln die Aussprache über ElevenLabs schwierig werden könnte, und entwickle wie bei den Englischvokabeln
 * eine Lösung"). Befunde und Regeln: recherche/aussprache-spanisch.md, shared/sprechtext.ts, shared/abkuerzungen/spanisch.ts.
 *
 * Einmalige Wartung `spanisch-ton-2026-11-01` nach dem Muster von `verbform-ton-2026-10-09`: In der gemeinsamen
 * Medienbank kommen spanische Aufnahmen der Sprach-KI (beide Stimmen) in die Sicherung, deren Sprechtext nach den neuen
 * Regeln anders lautet UND deren bisheriger Sprechtext eine der behobenen Stellen enthält – Schrägstrich, angehängte
 * Endung in Klammern („primer(o)"), Großbuchstaben-Abkürzung („GPS", „EE. UU.", „IA"), Grad- und Ordnungszeichen
 * („2° de ESO"), Prozent, „g" bzw. „pm" nach Zahl, römisches Jahrhundert („siglo XX"). Eigene Aussprachen der
 * Lehrkraft („Aussprache als …") enthalten so etwas nicht und bleiben.
 *
 * Index und Dateien kommen vorher nach <Medienbank>/sicherung-spanisch-ton-2026-11-01/ (verschoben, nicht gelöscht).
 * Danach spricht bis zur neuen Erzeugung die Stimme des Geräts nach den neuen Regeln. Das Protokoll nennt nur Zahlen.
 */
import type { DatabaseSync } from 'node:sqlite'
import { sprechText, sprechTextFuerWort } from '../shared/sprechtext'
import { toeneAussortieren } from '../main/services/storage/medienbank'
import type { MedienTon, TonArt } from '../shared/medienbank'

export const SPANISCH_SICHERUNG = 'sicherung-spanisch-ton-2026-11-01'

const norm = (s: string): string => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()

/** Stellen, die die neuen Regeln anders sprechen */
const BEHOBEN = /\/|\p{L}\(\p{Ll}{1,7}\)|\p{Lu}{2,}|\p{Lu}\.\s?\p{Lu}\.|[°ºª%]|\d\s?(?:g|pm|am)(?!\p{L})|siglos?\s+[IVXLC]+/u

/** Gehört diese Aufnahme in die Sicherung? */
export function spanischTonVeraltet(ton: MedienTon, art: TonArt, sprache: string): boolean {
  if (
    String(sprache ?? '')
      .toLowerCase()
      .split(/[-_]/)[0] !== 'es'
  )
    return false
  if (!ton || typeof ton.stimme !== 'string' || !ton.stimme.trim() || typeof ton.text !== 'string') return false
  const bisher = typeof ton.gesprochen === 'string' && ton.gesprochen.trim() ? ton.gesprochen : ton.text
  if (!BEHOBEN.test(bisher)) return false
  const neu = art === 'wort' ? sprechTextFuerWort({ term: ton.text }, 'es') : sprechText(ton.text, 'es')
  return norm(neu) !== norm(bisher)
}

export function spanischToeneAussortieren(): string {
  try {
    const z = toeneAussortieren(spanischTonVeraltet, SPANISCH_SICHERUNG)
    return `${z.woerter} Wort- und ${z.saetze} Satz-Aufnahmen auf Spanisch nach alten Sprechregeln entfernt (${z.dateien} Dateien, gesichert in ${SPANISCH_SICHERUNG})`
  } catch (e) {
    // Ohne Medienbank oder bei unlesbarem Index: nichts entfernen, aber die Wartung nicht blockieren
    return `nichts entfernt (${e instanceof Error ? e.name : 'Fehler'})`
  }
}

export const SPANISCH_TON: [string, (d: DatabaseSync) => string] = ['spanisch-ton-2026-11-01', () => spanischToeneAussortieren()]

/**
 * Spanische Satzaufnahmen vom 04.11.2026 entfernen (Wunsch der Lehrkraft: Sätze für Lernende zu schnell gesprochen). Ab
 * jetzt gehen spanische Beispielsätze mit Tempo 0.85 an ElevenLabs (SATZ_TTS_SETTINGS in shared/voiceSettings.ts). Die
 * Aufnahmen dieses Tages (am Server 76: je 38 weiblich/männlich, 13:08–13:20 Uhr, ältere spanische Sätze gab es keine)
 * kommen in die Sicherung und werden beim nächsten Erzeugen neu und langsamer gesprochen. Einzelwörter bleiben.
 */
export const SPANISCH_SATZ_SICHERUNG = 'sicherung-spanisch-saetze-2026-11-04'
const TAG_VON = Date.parse('2026-11-04T00:00:00+01:00')
const TAG_BIS = Date.parse('2026-11-05T00:00:00+01:00')

export function spanischSatzVomTag(ton: MedienTon, art: TonArt, sprache: string): boolean {
  if (art !== 'satz' || String(sprache ?? '').toLowerCase().split(/[-_]/)[0] !== 'es') return false
  return typeof ton?.zeit === 'number' && ton.zeit >= TAG_VON && ton.zeit < TAG_BIS
}

export const SPANISCH_SAETZE_LANGSAM: [string, (d: DatabaseSync) => string] = [
  'spanisch-saetze-langsam-2026-11-04',
  () => {
    try {
      const z = toeneAussortieren(spanischSatzVomTag, SPANISCH_SATZ_SICHERUNG)
      return `${z.saetze} spanische Satz-Aufnahmen vom 04.11.2026 entfernt (${z.dateien} Dateien, gesichert in ${SPANISCH_SATZ_SICHERUNG})`
    } catch (e) {
      return `nichts entfernt (${e instanceof Error ? e.name : 'Fehler'})`
    }
  }
]
