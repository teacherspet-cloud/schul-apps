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

/** Ordnernamen der Programme – die Materialart, unterste Ebene (05.10.2026; vorher nur unter „Allgemein") */
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

/**
 * Die Ordner unterhalb von Schulmaterial, von oben nach unten (05.10.2026, Wunsch der Lehrkraft):
 * Fach / Jahrgang / Thema / Materialart – z. B. Geschichte › Jahrgang 8 › Der Erste Weltkrieg ›
 * Arbeitsblätter. Thema ist der Themenbereich der Bibliothek (mit Unterbereichen), sonst das Thema
 * des Materials; was fehlt, entfällt als Ebene. Ohne Fach: Allgemein › Materialart.
 */
export function schulmaterialTeile(ziel: AblageZiel): string[] {
  const fach = ordnerName(ziel.fach)
  const art = PROGRAMM_ORDNER[ziel.programm]
  if (!fach) return art ? [ALLGEMEIN, art] : [ALLGEMEIN]
  const jahrgang = ziel.jahrgang && ziel.jahrgang >= 1 && ziel.jahrgang <= 13 ? `Jahrgang ${Math.round(ziel.jahrgang)}` : ''
  const bereiche = (ziel.themenbereich ?? []).map(ordnerName).filter(Boolean).slice(0, MAX_EBENEN)
  const thema = bereiche.length ? bereiche : [ordnerName(ziel.thema)].filter(Boolean)
  return [fach, ...(jahrgang ? [jahrgang] : []), ...thema, ...(art ? [art] : [])]
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
  return [
    'Auf meinem iPad',
    'Schul-Apps',
    ...pfad
      .slice(i + 1)
      .split('/')
      .filter(Boolean)
  ].join(' › ')
}
