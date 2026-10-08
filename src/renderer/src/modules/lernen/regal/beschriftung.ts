/**
 * Beschriftung der Fachordner im Regal (08.10.2026, abgestimmt mit der Lehrkraft): Fremdsprachen tragen Fachnamen und
 * Register in der Fremdsprache („English" · „Vocabulary · Grammar · Materials"), alle anderen Fächer deutsch.
 * Fachnamen wie im Kopf der Klassenarbeiten (klassenarbeit/model/faecher.ts).
 */
import { fachAusName, FAECHER, type Fach } from '@shared/faecher'

/** Fach aus Kennung, Name oder Sprachkürzel („en") */
const fachFinden = (f: string): Fach | undefined => fachAusName(f) ?? FAECHER.find((x) => x.sprache === f.trim().toLowerCase())

export type Register = 'vok' | 'gram' | 'mat'

interface Sprachbeschriftung {
  fach: string
  vok: string
  gram: string
  mat: string
  /** Wort vor der Klassenstufe im Grammatik-Register (08.10.2026): „Year 6", „Classe 6" – deutsche Zählung */
  jahrgang?: string
}

const DEUTSCH: Omit<Sprachbeschriftung, 'fach'> = { vok: 'Vokabeln', gram: 'Grammatik', mat: 'Materialien' }

const SPRACHEN: Record<string, Sprachbeschriftung> = {
  en: { fach: 'English', vok: 'Vocabulary', gram: 'Grammar', mat: 'Materials', jahrgang: 'Year' },
  fr: { fach: 'Français', vok: 'Vocabulaire', gram: 'Grammaire', mat: 'Documents', jahrgang: 'Classe' },
  es: { fach: 'Español', vok: 'Vocabulario', gram: 'Gramática', mat: 'Materiales', jahrgang: 'Curso' },
  it: { fach: 'Italiano', vok: 'Vocabolario', gram: 'Grammatica', mat: 'Materiali', jahrgang: 'Classe' },
  la: { fach: 'Latina', vok: 'Vocabula', gram: 'Grammatica', mat: 'Materia', jahrgang: 'Classis' },
  ru: { fach: 'Русский язык', vok: 'Лексика', gram: 'Грамматика', mat: 'Материалы', jahrgang: 'Класс' },
  nl: { fach: 'Nederlands', vok: 'Woordenschat', gram: 'Grammatica', mat: 'Materialen' },
  pl: { fach: 'Język polski', vok: 'Słownictwo', gram: 'Gramatyka', mat: 'Materiały' },
  cs: { fach: 'Český jazyk', vok: 'Slovní zásoba', gram: 'Gramatika', mat: 'Materiály' },
  pt: { fach: 'Português', vok: 'Vocabulário', gram: 'Gramática', mat: 'Materiais' },
  tr: { fach: 'Türkçe', vok: 'Kelimeler', gram: 'Dilbilgisi', mat: 'Materyaller' },
  da: { fach: 'Dansk', vok: 'Ordforråd', gram: 'Grammatik', mat: 'Materialer' }
}

/** Sprache eines Fachs (lebende Sprache oder Latein) */
const spracheVon = (fach: string): string | undefined => {
  const f = fachFinden(fach)
  return f?.sprache ?? (f?.id === 'latein' ? 'la' : undefined)
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
