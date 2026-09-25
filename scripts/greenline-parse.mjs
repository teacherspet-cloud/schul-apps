// Aufbau der Green-Line-Vokabellisten (Klett, Ausgabe Niedersachsen ab 2021).
//
// Die Spalte „Vokabellektion" trägt die Gliederung, durch „ - " getrennt:
//   GL1 - Unit 2 - Station 1              → Band, Unit, Abschnitt
//   GL1 - Hello - Check-in                → „Hello" ist der Auftaktteil vor Unit 1
//   GL1 - Media smart                     → Sonderteil ohne Abschnitt
//   GL1 - Hello - Station 1 - Numbers 0-12 → zusätzlich der Name des Kastens
//
// Kasten-Vokabeln werden mit `inBox` markiert und tragen den Kastennamen in `note`,
// damit sie sich beim Zusammenstellen eines Tests gezielt dazunehmen lassen.

/**
 * Band und Jahrgang aus dem Kürzel der Lektionsangabe.
 * GL1 … GL6 sind die Klassen 5 bis 10, GLT ist der Transition-Band der Einführungsphase (Klasse 11).
 */
export function bookFromCode(code) {
  const m = /^GL(\d+)$/i.exec(code)
  if (m) return { id: `green-line-${m[1]}`, name: `Green Line ${m[1]}`, grade: 4 + Number(m[1]) }
  if (/^GLT$/i.test(code)) return { id: 'green-line-transition', name: 'Green Line Transition', grade: 11 }
  return { id: `green-line-${code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name: `Green Line ${code}`, grade: undefined }
}

/** Zerlegt eine Lektionsangabe in Band, Unit, Abschnitt und (bei Kästen) den Kastennamen. */
export function splitLesson(lesson) {
  const parts = String(lesson || '')
    .split(' - ')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length < 2) return null
  const [code, ...rest] = parts
  if (rest.length === 1) {
    // Sonderteil wie „Media smart", „Across cultures 1", „Trailer"
    return { code, unit: rest[0], section: 'Wortschatz', box: '' }
  }
  return { code, unit: rest[0], section: rest[1], box: rest.slice(2).join(' - ') }
}

// Geschlossene Wortklassen – daran lässt sich die Wortart sicher erkennen.
// Mehrwortfügungen stehen als Ganzes in der Liste, getrennt durch Komma.
const PRONOUNS =
  'i, you, he, she, it, we, they, me, him, her, us, them, my, your, his, its, our, their, mine, yours, hers, ours, theirs, this, that, these, those, who, whom, whose, what, which, myself, yourself, himself, herself, itself, ourselves, themselves, someone, somebody, something, anyone, anybody, anything, everyone, everybody, everything, no one, nobody, nothing, each other, one another'
const PREPOSITIONS =
  'about, above, across, after, against, along, among, around, at, before, behind, below, beside, between, by, down, during, for, from, in, inside, into, near, next to, of, off, on, onto, opposite, out, out of, outside, over, past, round, since, through, to, towards, under, until, up, with, within, without'
const CONJUNCTIONS = 'and, but, or, so, because, if, when, while, although, though, than, as, unless, since, either, neither, nor'
const DETERMINERS = 'a, an, the, some, any, much, many, more, most, all, both, every, each, another, few, several, enough'
const MODALS = "can, cannot, could, may, might, must, shall, should, will, would, need to, have to"
const INTERJECTIONS = 'yes, no, hello, hi, hey, bye, goodbye, oh, ah, ouch, wow, please, thanks, thank you, sorry, ok, okay, hooray, well done'
// Häufige Adverbien, die nicht auf -ly enden
const ADVERBS =
  'again, ago, already, also, always, away, back, ever, fast, here, home, how, just, later, maybe, never, not, now, often, once, only, outside, perhaps, quite, rather, really, sometimes, soon, still, then, there, today, together, tomorrow, tonight, too, twice, usually, very, well, when, where, why, yesterday, yet'
// Adjektive auf -ly, die sonst als Adverb durchgingen
const LY_ADJECTIVES = 'ugly, silly, friendly, lovely, lonely, early, curly, daily, weekly, lively'

const set = (words) => new Set(words.split(',').map((w) => w.trim()))
const WORD_CLASSES = [
  ['pronoun', set(PRONOUNS)],
  ['preposition', set(PREPOSITIONS)],
  ['conjunction', set(CONJUNCTIONS)],
  ['determiner', set(DETERMINERS)],
  ['verb', set(MODALS)],
  ['interjection', set(INTERJECTIONS)],
  ['adverb', set(ADVERBS)]
]

/** Erste Bedeutung der deutschen Übersetzung ohne Klammern und Zusätze */
const firstMeaning = (translation) =>
  String(translation || '')
    .replace(/\([^)]*\)/g, ' ')
    .split(/[,;/]/)[0]
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Wortart aus Wort und Übersetzung erschließen – das Lehrwerk liefert keine.
 * Verlässliche Merkmale: „to …" beim Verb, große Anfangsbuchstaben bei deutschen
 * Substantiven, Ziffern bei Zahlwörtern und die geschlossenen Wortklassen oben.
 */
export function guessPos(term, translation) {
  const raw = String(term || '').trim()
  if (!raw) return ''
  // Zusätze wie „[pl]", „(sth)" und Auslassungen stören die Erkennung
  const clean = raw
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[’ʼ]/g, "'") // typografischer Apostroph → gerader
    .replace(/\s+/g, ' ')
    .trim()
  const lower = clean.toLowerCase()
  const meaning = firstMeaning(translation)

  const words = lower.split(' ')
  // Ganze Wendungen und Sätze: Satzzeichen, Auslassungen oder ein vorangestelltes „It's …"
  const isSentence = /[.!?…]/.test(raw) || /^(it's|it is|let's|how|what|where|there's)\b/i.test(lower)
  // Kurzformen wie „we're", „he's", „can't" sind Verbformen
  if (/^\w+(n't|'(s|re|m|ve|ll|d))$/.test(lower)) return 'verb'
  // Deutsche Substantive werden großgeschrieben – das trägt weiter als jede englische Endung
  const germanNoun = /^[A-ZÄÖÜ]/.test(meaning)

  if (/^to\s+\S/i.test(clean)) return 'verb'
  if (/^\d/.test(meaning) || /^(\d+\.?)$/.test(lower)) return 'number'
  // vor den geschlossenen Klassen, sonst wird „home – Zuhause" zum Adverb
  if (germanNoun && words.length === 1 && !isSentence) return 'noun'
  for (const [name, list] of WORD_CLASSES) if (list.has(lower)) return name
  if (isSentence) return 'phrase'
  if (words.length > 1) {
    // Mehrwortnomen wie „power socket" erkennt man am großen Anfangsbuchstaben im Deutschen
    if (germanNoun && meaning.split(' ').length <= 2) return 'noun'
    return 'phrase'
  }
  if (/ly$/.test(lower) && !set(LY_ADJECTIVES).has(lower)) return 'adverb'
  return 'adjective'
}

/**
 * Baut aus den Zeilen beider Dateien ein Lehrwerk.
 * rows/boxRows: [Englisch, Anmerkung, Deutsch, Vokabellektion, Kontext, Übersetzung, Merkhilfe]
 *
 * Kasten-Vokabeln kommen in genau den Abschnitt (Station, Check-in, Story …), der in
 * ihrer Lektionsangabe steht – nie in die Unit als Ganzes.
 *
 * Eine Zeile darf als `{ cells, explained }` kommen: `explained` markiert die im Buch
 * farbig gedruckten Einträge, die eine Erklärung statt einer Übersetzung tragen.
 */
export function parseGreenLine(rows, boxRows = []) {
  const units = []
  let book = null

  const add = (row, inBox) => {
    // Zeilen kommen entweder als reines Feld-Array oder als { cells, explained }
    const cells = Array.isArray(row) ? row : row.cells
    const explained = Array.isArray(row) ? false : Boolean(row.explained)
    const [term, note, translation, lesson, context, contextTranslation] = cells
    if (!term || !lesson) return
    const split = splitLesson(lesson)
    if (!split) return
    if (!book) book = bookFromCode(split.code)
    let unit = units.find((u) => u.name === split.unit)
    if (!unit) {
      unit = { name: split.unit, sections: [] }
      units.push(unit)
    }
    let section = unit.sections.find((s) => s.name === split.section)
    if (!section) {
      section = { name: split.section, entries: [] }
      unit.sections.push(section)
    }
    const extra = [note, inBox && split.box ? `Kasten: ${split.box}` : ''].filter(Boolean).join(' · ')
    const pos = guessPos(term, translation)
    section.entries.push({
      term,
      translation,
      ...(pos ? { pos } : {}),
      ...(extra ? { note: extra } : {}),
      ...(context ? { example: context } : {}),
      ...(contextTranslation ? { exampleTranslation: contextTranslation } : {}),
      ...(inBox ? { inBox: true } : {}),
      ...(explained ? { explained: true } : {})
    })
  }

  for (const row of rows) add(row, false)
  for (const row of boxRows) add(row, true)

  return {
    id: book?.id ?? 'green-line',
    name: book?.name ?? 'Green Line',
    language: 'en',
    grade: book?.grade,
    publisher: 'Klett',
    edition: 'Niedersachsen',
    // Die Ausgabe ist für das niedersächsische Gymnasium gedacht
    stateId: 'NI',
    schoolTypeId: 'gymnasium',
    units,
    importedAt: new Date().toISOString()
  }
}
