/**
 * Ablage auf dem iPad: Dokumente/Schulmaterial/<Fach>/<Themenbereich>/<Datei> (30.09.2026).
 *
 * Wunsch der Lehrkraft: Was die iPad-App erzeugt (PDF, Word, Hördateien …), soll nicht nur über
 * das Teilen-Menü hinausgehen, sondern geordnet auf dem Gerät liegen – in der Dateien-App unter
 * „Auf meinem iPad › Schul-Apps › Schulmaterial", nach Fach und Themenbereich wie in der
 * Bibliothek. Ohne Themenbereich direkt im Fachordner, ohne Fach unter „Allgemein" (dort je
 * Programm ein Unterordner, damit Elternbriefe und Rückmeldungen nicht durcheinanderliegen).
 *
 * Reine Funktionen ohne Dateisystem: Die iPad-Umgebung (mobil/umgebung.ts) baut damit den
 * Pfad, die Oberfläche zeigt damit den Ort an, die Tests prüfen beides (tests/schulmaterial.test.ts).
 */
import type { AblageZiel } from './types'

export const SCHULMATERIAL = 'Schulmaterial'
export const ALLGEMEIN = 'Allgemein'

/** Ordnernamen der Programme – nur unter „Allgemein" (Material ohne Fach) */
export const PROGRAMM_ORDNER: Record<string, string> = {
  arbeitsblatt: 'Arbeitsblätter',
  vokabeltest: 'Vokabeltests',
  grammatiktest: 'Grammatiktests',
  lernzielkontrolle: 'Lernzielkontrollen',
  klassenarbeit: 'Klassenarbeiten',
  rueckmeldung: 'Rückmeldungen',
  elternbrief: 'Elternbriefe',
  tafelbild: 'Tafelbilder'
}

/** Höchstens so viele Ebenen Themenbereich (die Oberfläche ist für drei gebaut) */
const MAX_EBENEN = 4
const MAX_ZEICHEN = 60

/**
 * Ein Ordnername, der in der Dateien-App funktioniert: ohne Schrägstriche und die unter
 * Windows verbotenen Zeichen (Sicherungen wandern auch dorthin), ohne Steuerzeichen, ohne Punkt
 * am Anfang (sonst unsichtbar) oder am Ende, höchstens 60 Zeichen. „.." und Leeres ergeben ''.
 */
export function ordnerName(teil: string | undefined): string {
  let s = String(teil ?? '')
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  s = s.replace(/^[.\s]+/, '').replace(/[.\s]+$/, '')
  if (s.length > MAX_ZEICHEN) s = s.slice(0, MAX_ZEICHEN).replace(/[.\s]+$/, '')
  return s
}

/** Die Ordner unterhalb von Schulmaterial, von oben nach unten */
export function schulmaterialTeile(ziel: AblageZiel): string[] {
  const fach = ordnerName(ziel.fach)
  if (!fach) {
    const programm = PROGRAMM_ORDNER[ziel.programm]
    return programm ? [ALLGEMEIN, programm] : [ALLGEMEIN]
  }
  const bereiche = (ziel.themenbereich ?? []).map(ordnerName).filter(Boolean).slice(0, MAX_EBENEN)
  return [fach, ...bereiche]
}

/** Der Ordner für eine Datei, z. B. /documents/Schulmaterial/Englisch/Unit 1 */
export const schulmaterialOrdner = (dokumente: string, ziel: AblageZiel): string => [dokumente, SCHULMATERIAL, ...schulmaterialTeile(ziel)].join('/')

/**
 * Der Ort, wie ihn die Dateien-App zeigt: „Auf meinem iPad › Schul-Apps › Schulmaterial ›
 * Englisch › Unit 1 › Test.pdf". null, wenn die Datei nicht unter Schulmaterial liegt.
 */
export function anzeigeOrt(pfad: string): string | null {
  const i = pfad.indexOf(`/${SCHULMATERIAL}/`)
  if (i < 0) return null
  return ['Auf meinem iPad', 'Schul-Apps', ...pfad.slice(i + 1).split('/').filter(Boolean)].join(' › ')
}
