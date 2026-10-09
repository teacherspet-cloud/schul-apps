/**
 * Beschriftung der Fachordner im Regal (08.10.2026, abgestimmt mit der Lehrkraft): Fremdsprachen tragen Fachnamen und
 * Register in der Fremdsprache („English" · „Vocabulary · Grammar · Materials"), alle anderen Fächer deutsch.
 * Fachnamen wie im Kopf der Klassenarbeiten (klassenarbeit/model/faecher.ts).
 */
import { fachAusName, FAECHER, type Fach } from '@shared/faecher'

/** Fach aus Kennung, Name oder Sprachkürzel („en") */
const fachFinden = (f: string): Fach | undefined => fachAusName(f) ?? FAECHER.find((x) => x.sprache === f.trim().toLowerCase())

/** Register des Fachordners; „wort" = Meine Bücher (bis 09.10.2026 „Wortliste"), „abc" = alphabetische Liste (09.10.2026) */
export type Register = 'vok' | 'wort' | 'abc' | 'gram' | 'mat'

interface Sprachbeschriftung {
  fach: string
  vok: string
  /** Meine Bücher (09.10.2026, vorher „Wortliste"): Bücherbord mit den Wörtern der Bände */
  wort: string
  /** Alphabetische Liste aller Wörter aus „Meine Bücher" (09.10.2026) */
  abc: string
  gram: string
  mat: string
  /** Wort vor der Klassenstufe im Grammatik-Register (08.10.2026): „Year 6", „Classe 6" – deutsche Zählung */
  jahrgang?: string
}

const DEUTSCH: Omit<Sprachbeschriftung, 'fach'> = { vok: 'Vokabeln', wort: 'Meine Bücher', abc: 'Alphabetisch', gram: 'Grammatik', mat: 'Materialien' }

const SPRACHEN: Record<string, Sprachbeschriftung> = {
  en: { fach: 'English', vok: 'Vocabulary', wort: 'My Books', abc: 'Alphabetical list', gram: 'Grammar', mat: 'Materials', jahrgang: 'Year' },
  fr: { fach: 'Français', vok: 'Vocabulaire', wort: 'Mes livres', abc: 'Liste alphabétique', gram: 'Grammaire', mat: 'Documents', jahrgang: 'Classe' },
  es: { fach: 'Español', vok: 'Vocabulario', wort: 'Mis libros', abc: 'Lista alfabética', gram: 'Gramática', mat: 'Materiales', jahrgang: 'Curso' },
  it: { fach: 'Italiano', vok: 'Vocabolario', wort: 'I miei libri', abc: 'Elenco alfabetico', gram: 'Grammatica', mat: 'Materiali', jahrgang: 'Classe' },
  la: { fach: 'Latina', vok: 'Vocabula', wort: 'Libri mei', abc: 'Index alphabeticus', gram: 'Grammatica', mat: 'Materia', jahrgang: 'Classis' },
  ru: { fach: 'Русский язык', vok: 'Лексика', wort: 'Мои книги', abc: 'Алфавитный список', gram: 'Грамматика', mat: 'Материалы', jahrgang: 'Класс' },
  nl: { fach: 'Nederlands', vok: 'Woordenschat', wort: 'Mijn boeken', abc: 'Alfabetische lijst', gram: 'Grammatica', mat: 'Materialen' },
  pl: { fach: 'Język polski', vok: 'Słownictwo', wort: 'Moje książki', abc: 'Lista alfabetyczna', gram: 'Gramatyka', mat: 'Materiały' },
  cs: { fach: 'Český jazyk', vok: 'Slovní zásoba', wort: 'Moje knihy', abc: 'Abecední seznam', gram: 'Gramatika', mat: 'Materiály' },
  pt: { fach: 'Português', vok: 'Vocabulário', wort: 'Os meus livros', abc: 'Lista alfabética', gram: 'Gramática', mat: 'Materiais' },
  tr: { fach: 'Türkçe', vok: 'Kelimeler', wort: 'Kitaplarım', abc: 'Alfabetik liste', gram: 'Dilbilgisi', mat: 'Materyaller' },
  da: { fach: 'Dansk', vok: 'Ordforråd', wort: 'Mine bøger', abc: 'Alfabetisk liste', gram: 'Grammatik', mat: 'Materialer' },
  // Weitere Sprachen (09.10.2026): auch Altgriechisch, Neugriechisch, Chinesisch, Japanisch und Arabisch in der Fremdsprache
  grc: { fach: 'Ἑλληνική', vok: 'Λέξεις', wort: 'Τὰ βιβλία μου', abc: 'Ἀλφαβητικὸς κατάλογος', gram: 'Γραμματική', mat: 'Ὕλη' },
  el: { fach: 'Ελληνικά', vok: 'Λεξιλόγιο', wort: 'Τα βιβλία μου', abc: 'Αλφαβητική λίστα', gram: 'Γραμματική', mat: 'Υλικό', jahrgang: 'Τάξη' },
  zh: { fach: '中文', vok: '词汇', wort: '我的书', abc: '按字母顺序', gram: '语法', mat: '材料' },
  ja: { fach: '日本語', vok: '語彙', wort: '私の本', abc: '索引', gram: '文法', mat: '教材' },
  ar: { fach: 'العربية', vok: 'المفردات', wort: 'كتبي', abc: 'قائمة أبجدية', gram: 'القواعد', mat: 'المواد' }
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
