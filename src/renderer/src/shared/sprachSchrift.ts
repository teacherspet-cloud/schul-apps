/**
 * Schrift und Schreibrichtung je Sprache – für Eingabe, Vorschau/Druck und Word (30.09.2026).
 *
 * Calibri (Grundschrift der Tests) kann Kyrillisch, Griechisch ohne Akzente und die lateinischen
 * Diakritika, aber keine polytonen griechischen Zeichen, keine chinesischen/japanischen
 * Schriftzeichen und kein Arabisch. Deshalb je Sprache eine Schrift, die unter Windows vorhanden
 * ist (Standardschriften von Windows 10/11):
 * - Altgriechisch: Palatino Linotype (vollständiger Block „Greek Extended", Rückfall Times New Roman).
 * - Chinesisch: Microsoft YaHei (vereinfachte Zeichen), Rückfall SimSun.
 * - Japanisch: Yu Gothic, Rückfall Meiryo / MS Gothic.
 * - Arabisch: Arial (arabischer Zeichensatz, gut lesbar im Druck), Rückfall Segoe UI / Tahoma –
 *   dazu die Schreibrichtung rechts nach links.
 * Alle übrigen Sprachen bleiben bei der Grundschrift.
 */
import { istRtl } from './kopfSprache'

export { istRtl }

interface Schrift {
  /** CSS-Schriftstapel */
  css: string
  /** Schriftname für Word (w:rFonts) */
  word: string
  /** Word: Schrift für ostasiatische bzw. komplexe Schrift (eastAsia/cs) */
  wordArt?: 'eastAsia' | 'cs'
}

const SCHRIFTEN: Record<string, Schrift> = {
  grc: { css: "'Palatino Linotype', 'Book Antiqua', 'Times New Roman', serif", word: 'Palatino Linotype' },
  zh: { css: "'Microsoft YaHei', 'SimSun', 'Noto Sans SC', sans-serif", word: 'Microsoft YaHei', wordArt: 'eastAsia' },
  ja: { css: "'Yu Gothic', 'Meiryo', 'MS Gothic', 'Noto Sans JP', sans-serif", word: 'Yu Gothic', wordArt: 'eastAsia' },
  ar: { css: "Arial, 'Segoe UI', Tahoma, sans-serif", word: 'Arial', wordArt: 'cs' }
}

/** CSS-Schriftstapel für Texte in dieser Sprache; undefined = Grundschrift behalten */
export const schriftFamilie = (code: string | undefined): string | undefined => SCHRIFTEN[code ?? '']?.css

/** Schrift für Word; undefined = Grundschrift (Calibri) */
export const wordSchrift = (code: string | undefined): Schrift | undefined => SCHRIFTEN[code ?? '']

/** HTML-lang-Attribut: grc bleibt grc (BCP 47), sonst der Code */
export const htmlLang = (code: string | undefined): string | undefined => code || undefined

/** Attribute für ein Eingabefeld oder einen Textbereich in dieser Sprache */
export function sprachAttribute(code: string | undefined): { lang?: string; dir?: 'rtl' | 'auto'; style?: { fontFamily: string } } {
  const f = schriftFamilie(code)
  return {
    lang: htmlLang(code),
    ...(istRtl(code) ? { dir: 'auto' as const } : {}),
    ...(f ? { style: { fontFamily: f } } : {})
  }
}
