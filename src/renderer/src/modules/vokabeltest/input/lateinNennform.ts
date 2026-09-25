import type { LatinWordClass, VocabEntry } from '../model/types'

/**
 * Wortart und Nennform aus einer eingelesenen lateinischen Vokabel herauslesen.
 *
 * Lehrwerke drucken die Nennform in einer eigenen Spalte oder hinter dem Lemma, durch Komma
 * getrennt. Belegt an den frei zugänglichen Pontes-Vokabellisten (Klett):
 *
 *   servus | servī m.                    → Substantiv, Genitiv + Genus
 *   avus | avum m.                       → Substantiv, in den Anfangslektionen Akkusativ
 *   cantāre | cantō, cantāvī, cantātum   → Verb, drei Stammformen
 *   praeclārus | -a, -um                 → Adjektiv
 *   omnis | omne                         → Adjektiv der 3. Deklination
 *   cum | Präp. + Abl.                   → Präposition mit Kasus
 *   hodiē | Adv.                         → Adverb, keine Nennform
 *
 * Die Nennform wird NICHT zerlegt, sondern so übernommen, wie sie dasteht: Genitiv oder
 * Akkusativ, mit oder ohne Makra, mit Klammern für noch nicht behandelte Stammformen. Was
 * das Lehrwerk druckt, ist das, was die Lernenden geschrieben haben – und genau das soll im
 * Test abgefragt werden.
 *
 * Erkannt wird die WORTART, denn nur sie entscheidet, welche Form der Test verlangt.
 */

/** Genus- und Wortartkürzel, wie sie in Vokabellisten stehen. */
const GENUS = /\b(m|f|n)\.?$/
const KASUS = /\b(Akk|Abl|Gen|Dat)\b/i
const ADVERB = /\bAdv\b/i
const PRONOMEN = /\bPron\b/i
const KONJUNKTION = /\b(Konj|Subj)\b/i

/**
 * Drei durch Komma getrennte Wortformen, von denen mindestens eine auf eine typische
 * Perfekt- oder Supinum-Endung ausgeht – das sind Stammformen.
 */
const STAMMFORMEN = /,/

export function erkenneWortart(nennform: string, lemma: string): LatinWordClass {
  const n = nennform.trim()
  if (!n) return 'sonstiges'
  if (KASUS.test(n) && /präp|prep/i.test(n)) return 'praeposition'
  if (KASUS.test(n) && /^\s*\+/.test(n.replace(/präp\.?/i, '').trim())) return 'praeposition'
  if (PRONOMEN.test(n)) return 'pronomen'
  if (ADVERB.test(n)) return 'adverb'
  if (KONJUNKTION.test(n)) return 'sonstiges'
  // „-a, -um" oder „omne": weitere Endungen eines Adjektivs
  if (/^-?[a-zäöüā-ū]+,\s*-?[a-zäöüā-ū]+$/i.test(n) && /^-/.test(n)) return 'adjektiv'
  if (GENUS.test(n)) return 'substantiv'
  // Stammformen: mehrere Formen, und das Lemma endet auf eine Infinitivendung
  if (STAMMFORMEN.test(n) && /(āre|ēre|ere|īre|rī)$/i.test(lemma.trim())) return 'verb'
  if (/^-?[a-zäöüā-ū]+$/i.test(n) && /(is|er|us|x)$/i.test(lemma.trim())) return 'adjektiv'
  return 'sonstiges'
}

/**
 * Ergänzt Wortart und Nennform an einer eingelesenen Vokabel.
 *
 * `pos` trägt beim Einlesen die dritte Spalte – in lateinischen Listen steht dort die
 * Nennform. Steht sie stattdessen hinter dem Lemma („servus, servī m."), wird sie dort
 * abgetrennt.
 */
export function mitNennform(v: VocabEntry): VocabEntry {
  if (v.nennform) return v
  let lemma = v.term.trim()
  let nennform = (v.pos ?? '').trim()
  if (!nennform && lemma.includes(',')) {
    const [erstes, ...rest] = lemma.split(',')
    // Nur abtrennen, wenn danach wirklich etwas steht – „nihil," wäre sonst zerlegt
    if (rest.join(',').trim()) {
      lemma = erstes.trim()
      nennform = rest.join(',').trim()
    }
  }
  if (!nennform) return { ...v, wordClass: 'sonstiges' }
  return { ...v, term: lemma, nennform, wordClass: erkenneWortart(nennform, lemma) }
}

/** Ganze Liste aufbereiten – nur sinnvoll, wenn die Zielsprache Latein ist. */
export const nennformenErgaenzen = (liste: VocabEntry[]): VocabEntry[] => liste.map(mitNennform)
