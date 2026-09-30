import type { LatinWordClass, VocabEntry } from '../model/types'

/**
 * Vokabeltests im Fach Griechisch (Altgriechisch) – nach dem Latein-Sonderweg (30.09.2026).
 *
 * Altgriechisch ist wie Latein eine Reflexions- und Übersetzungssprache: Die Lehrpläne nennen als
 * Ziel das Übersetzen und Erschließen von Texten, nicht den aktiven Sprachgebrauch
 * (LehrplanPLUS Bayern Griechisch; Kernlehrplan Griechisch NRW Sek I 2019; EPA Griechisch 2004).
 * Deshalb gilt dasselbe wie in `latein.ts`: nur Griechisch → Deutsch, zu jeder Vokabel ihr
 * grammatisches Beiwerk und alle Bedeutungen, keine Sprech- und Schreibformate.
 *
 * Nennformen, wie sie die gängigen Lehrwerke drucken (Kantharos, Klett; Hellas, C. C. Buchner;
 * Xenia, C. C. Buchner – Wortschatzteile):
 *
 *   ὁ λόγος, τοῦ λόγου            → Substantiv: Artikel, Nominativ, Genitiv
 *   λόγος, -ου ὁ                  → dasselbe in Kurzform
 *   παιδεύω, παιδεύσω, ἐπαίδευσα … → Verb: Stammformen (Anfangsunterricht oft nur 1. Sg. Präsens)
 *   ἀγαθός, -ή, -όν               → Adjektiv: Endungen für Femininum und Neutrum
 *   ἐν + Dat.                     → Präposition mit Kasus
 *   εὖ Adv.                       → Adverb, keine Nennform
 *
 * Unterschied zu Latein: Beim Substantiv gehört der ARTIKEL dazu, denn er zeigt das Genus
 * (ὁ/ἡ/τό). Die Formspalte heißt daher „Genitiv, Artikel:" statt „Genitiv, Genus:".
 *
 * Akzente und Spiritus: Sie gehören zur richtigen Schreibung und werden so übernommen, wie sie in
 * der Liste stehen (Unicode NFC, vorkomponierte Zeichen). `griechischNormal` fasst zerlegte Eingaben
 * (Buchstabe + kombinierendes Zeichen) zusammen, ändert aber nichts an Akzent oder Spiritus.
 */

export const GRIECHISCH = 'grc'

export const istGriechisch = (targetLanguage: string): boolean => targetLanguage === GRIECHISCH

export const GRIECHISCH_NENNFORM_LABEL: Record<LatinWordClass, string> = {
  substantiv: 'Genitiv, Artikel:',
  verb: 'Stammformen:',
  adjektiv: 'f., n.:',
  praeposition: 'mit Kasus:',
  pronomen: 'Formen:',
  adverb: '—',
  sonstiges: '—'
}

/** Vorkomponierte Zeichen (NFC) – zerlegte Eingaben aus Word oder PDF werden zusammengefasst */
export const griechischNormal = (s: string): string => s.normalize('NFC')

const ARTIKEL = /(^|[\s,])(ὁ|ἡ|τό|οἱ|αἱ|τά|τοῦ|τῆς|τῶν)(?=$|[\s,.])/u
const KASUS = /\b(Akk|Gen|Dat)\b\.?/i
const GRIECHISCHES_VERB = /(ω|ῶ|ομαι|οῦμαι|ῶμαι|μι|μαι)$/u

/**
 * Wortart aus der Nennform einer griechischen Vokabel. Wie bei Latein entscheidet sie nur, welche
 * Form der Test verlangt – die Nennform selbst wird unverändert übernommen.
 */
export function erkenneGriechischeWortart(nennform: string, lemma: string): LatinWordClass {
  const n = griechischNormal(nennform.trim())
  const l = griechischNormal(lemma.trim())
  if (!n) return /^(ὁ|ἡ|τό)\s/u.test(l) ? 'substantiv' : 'sonstiges'
  if (KASUS.test(n) && (/präp|prep/i.test(n) || /^\s*\+/.test(n))) return 'praeposition'
  if (/\bPron\b/i.test(n)) return 'pronomen'
  if (/\bAdv\b/i.test(n)) return 'adverb'
  if (/\b(Konj|Partikel|Subj)\b/i.test(n)) return 'sonstiges'
  if (ARTIKEL.test(n) || /^-\p{Script=Greek}+\s+(ὁ|ἡ|τό)(?=$|[\s,.])/u.test(n) || /^(ὁ|ἡ|τό)\s/u.test(l)) return 'substantiv'
  // „-ή, -όν" / „-α, -ον" / „ή, όν": weitere Endungen eines Adjektivs
  if (/^-?\p{Script=Greek}+,\s*-?\p{Script=Greek}+$/u.test(n) && /^-/.test(n)) return 'adjektiv'
  if (n.includes(',') && GRIECHISCHES_VERB.test(l.replace(/[\s,].*$/u, ''))) return 'verb'
  return 'sonstiges'
}

/**
 * Ergänzt Wortart und Nennform an einer eingelesenen griechischen Vokabel. Wie bei Latein steht
 * die Nennform in der dritten Spalte (`pos`) oder hinter dem Lemma, durch Komma getrennt; ein
 * vorangestellter Artikel („ὁ λόγος, τοῦ λόγου") bleibt beim Lemma.
 */
export function mitGriechischerNennform(v: VocabEntry): VocabEntry {
  if (v.nennform) return v
  let lemma = griechischNormal(v.term.trim())
  let nennform = griechischNormal((v.pos ?? '').trim())
  if (!nennform && lemma.includes(',')) {
    const [erstes, ...rest] = lemma.split(',')
    if (rest.join(',').trim()) {
      lemma = erstes.trim()
      nennform = rest.join(',').trim()
    }
  }
  const wordClass = erkenneGriechischeWortart(nennform, lemma)
  return { ...v, term: lemma, ...(nennform ? { nennform } : {}), wordClass }
}

/**
 * Regeln für die KI, wenn die Zielsprache Altgriechisch ist – Gegenstück zu `lateinRegeln`.
 */
export function griechischRegeln(): string {
  return [
    'ALTGRIECHISCH – dieses Fach arbeitet wie Latein, nicht wie eine moderne Fremdsprache:',
    '- Abgefragt wird ausschließlich Griechisch → Deutsch. Keine Aufgabe verlangt, etwas auf Griechisch zu formulieren, zu sprechen oder zu schreiben.',
    '- Zu jeder Vokabel gehört ihr grammatisches Beiwerk: Substantiv mit Artikel und Genitiv, Verb mit den Stammformen, Adjektiv mit den Endungen für f. und n., Präposition mit ihrem Kasus.',
    '- Gib zu jeder Vokabel ALLE im Lehrwerk üblichen Bedeutungen an, nicht nur eine.',
    '- Schreibe polytonisch mit korrekten Akzenten (Akut, Gravis, Zirkumflex), Spiritus (lenis/asper) und Iota subscriptum – genau wie in der Vorlage; keine Akzente weglassen, keine monotone Schrift, keine Umschrift statt griechischer Schrift.',
    '- Attisches Griechisch des Lehrwerks (Grundwortschatz, Xenophon/Platon), keine neugriechischen Formen.',
    '- KEINE Formenbestimmung, keine Partizipialkonstruktionen, kein AcI: Das gehört in den Grammatiktest, nicht in den Vokabeltest.',
    '- Sinnvoll sind stattdessen: deutsche Fremdwörter griechischen Ursprungs (Demokratie, Theater, Biologie) auf das griechische Wort zurückführen, Wortbildung, Wortfamilien, und die passende Bedeutung im Satzzusammenhang wählen.'
  ].join('\n')
}
