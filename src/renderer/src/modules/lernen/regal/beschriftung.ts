/**
 * Beschriftung der Fachordner im Regal (08.10.2026, abgestimmt mit der Lehrkraft): Fremdsprachen tragen Fachnamen und
 * Register in der Fremdsprache („English" · „Vocabulary · Grammar · Materials"), alle anderen Fächer deutsch.
 * Fachnamen wie im Kopf der Klassenarbeiten (klassenarbeit/model/faecher.ts).
 */
import { fachAusName, FAECHER, type Fach } from '@shared/faecher'

/** Fach aus Kennung, Name oder Sprachkürzel („en") */
const fachFinden = (f: string): Fach | undefined => fachAusName(f) ?? FAECHER.find((x) => x.sprache === f.trim().toLowerCase())

/** Register des Fachordners; „wort" = Wortliste (09.10.2026) */
export type Register = 'vok' | 'wort' | 'gram' | 'mat'

interface Sprachbeschriftung {
  fach: string
  vok: string
  /** Wortliste (09.10.2026): alle freigegebenen Wörter des Fachs */
  wort: string
  gram: string
  mat: string
  /** Wort vor der Klassenstufe im Grammatik-Register (08.10.2026): „Year 6", „Classe 6" – deutsche Zählung */
  jahrgang?: string
}

const DEUTSCH: Omit<Sprachbeschriftung, 'fach'> = { vok: 'Vokabeln', wort: 'Wortliste', gram: 'Grammatik', mat: 'Materialien' }

const SPRACHEN: Record<string, Sprachbeschriftung> = {
  en: { fach: 'English', vok: 'Vocabulary', wort: 'Word list', gram: 'Grammar', mat: 'Materials', jahrgang: 'Year' },
  fr: { fach: 'Français', vok: 'Vocabulaire', wort: 'Lexique', gram: 'Grammaire', mat: 'Documents', jahrgang: 'Classe' },
  es: { fach: 'Español', vok: 'Vocabulario', wort: 'Léxico', gram: 'Gramática', mat: 'Materiales', jahrgang: 'Curso' },
  it: { fach: 'Italiano', vok: 'Vocabolario', wort: 'Lessico', gram: 'Grammatica', mat: 'Materiali', jahrgang: 'Classe' },
  la: { fach: 'Latina', vok: 'Vocabula', wort: 'Index verborum', gram: 'Grammatica', mat: 'Materia', jahrgang: 'Classis' },
  ru: { fach: 'Русский язык', vok: 'Лексика', wort: 'Словарь', gram: 'Грамматика', mat: 'Материалы', jahrgang: 'Класс' },
  nl: { fach: 'Nederlands', vok: 'Woordenschat', wort: 'Woordenlijst', gram: 'Grammatica', mat: 'Materialen' },
  pl: { fach: 'Język polski', vok: 'Słownictwo', wort: 'Słowniczek', gram: 'Gramatyka', mat: 'Materiały' },
  cs: { fach: 'Český jazyk', vok: 'Slovní zásoba', wort: 'Slovníček', gram: 'Gramatika', mat: 'Materiály' },
  pt: { fach: 'Português', vok: 'Vocabulário', wort: 'Glossário', gram: 'Gramática', mat: 'Materiais' },
  tr: { fach: 'Türkçe', vok: 'Kelimeler', wort: 'Sözlük', gram: 'Dilbilgisi', mat: 'Materyaller' },
  da: { fach: 'Dansk', vok: 'Ordforråd', wort: 'Ordliste', gram: 'Grammatik', mat: 'Materialer' },
  // Weitere Sprachen (09.10.2026): auch Altgriechisch, Neugriechisch, Chinesisch, Japanisch und Arabisch in der Fremdsprache
  grc: { fach: 'Ἑλληνική', vok: 'Λέξεις', wort: 'Λεξικόν', gram: 'Γραμματική', mat: 'Ὕλη' },
  el: { fach: 'Ελληνικά', vok: 'Λεξιλόγιο', wort: 'Γλωσσάρι', gram: 'Γραμματική', mat: 'Υλικό', jahrgang: 'Τάξη' },
  zh: { fach: '中文', vok: '词汇', wort: '生词表', gram: '语法', mat: '材料' },
  ja: { fach: '日本語', vok: '語彙', wort: '単語リスト', gram: '文法', mat: '教材' },
  ar: { fach: 'العربية', vok: 'المفردات', wort: 'قائمة الكلمات', gram: 'القواعد', mat: 'المواد' }
}

/** Sprache eines Fachs (lebende Sprache oder Latein) */
const spracheVon = (fach: string): string | undefined => {
  const f = fachFinden(fach)
  return f?.sprache ?? (f?.id === 'latein' ? 'la' : f?.id === 'griechisch' ? 'grc' : undefined)
}

export function beschriftung(fach: string): Sprachbeschriftung & { sprache?: string } {
  const sprache = spracheVon(fach)
  const s = sprache ? SPRACHEN[sprache] : undefined
  return s ? { ...s, sprache } : { fach: fachFinden(fach)?.label ?? fach, ...DEUTSCH }
}

const ROEMISCH: [number, string][] = [
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I']
]
/** Römische Zahl (1–39) – Latein zählt die Klassen so („Classis VI") */
export function roemisch(n: number): string {
  let r = ''
  let rest = Math.round(n)
  for (const [w, z] of ROEMISCH)
    while (rest >= w) {
      r += z
      rest -= w
    }
  return r
}

/**
 * Überschrift eines Jahrgangs im Grammatik-Register (08.10.2026, abgestimmt): Wort in der Fremdsprache, Zählung
 * deutsch – „Year 6", „Classe 6", „Curso 6", „Classis VI", „Класс 6"; sonst „Klasse 6".
 */
export function jahrgangName(fach: string, jahrgang: number): string {
  const b = beschriftung(fach)
  if (b.sprache === 'la') return `${b.jahrgang} ${roemisch(jahrgang)}`
  return `${b.jahrgang ?? 'Klasse'} ${jahrgang}`
}

/** Einheitlicher Fachname (Kennung oder Name → Name), wie auf dem Server (lernen.ts `fachName`) */
export const fachName = (f: string): string => fachFinden(f)?.label ?? (f.trim() || 'Weitere')

/**
 * Rückweg aus einem Training (08.10.2026): im Regal-Modus zurück in den Fachordner aufs passende Register,
 * sonst wie bisher zu „Meine Materialien" (Gäste) bzw. in den Lernraum.
 */
export function rueckweg(fach: string | undefined, register: Register, gast: boolean, regal: boolean): { href: string; text: string } {
  if (regal && fach) return { href: `/s/ordner/${encodeURIComponent(fachName(fach))}?r=${register}`, text: 'In den Ordner' }
  return gast ? { href: '/s/', text: 'Meine Materialien' } : { href: '/s/lernen', text: 'Lernraum' }
}
