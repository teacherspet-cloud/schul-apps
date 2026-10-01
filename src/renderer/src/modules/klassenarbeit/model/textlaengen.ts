/**
 * Ziel-Länge des Materialtextes je Teil einer Klassenarbeit (01.10.2026).
 *
 * Anlass: Eine Internetadresse als Material landete ungekürzt in der Arbeit. Der Zielbereich
 * hängt an Art des Teils, Stufe und Sprachniveau.
 *
 * BELEGT (recherche/sprachliche-bewertungsmassstaebe-2026-09-29.md):
 * - NRW Abitur moderne Fremdsprachen: Sprachmittlungsvorlage GK/LK 450–650 Wörter.
 * - Sek I: Die Werte je GER-Niveau aus `skillSizes` (A1 80 … C1 350 Wörter) – dieselben, mit denen
 *   das Arbeitsblatt Ausgangstexte plant; ±15 % wie im Auftrag an die KI (prompts/sprache.ts).
 *
 * FAUSTREGELN (keine amtliche Zahl gefunden – als solche in `grund` gekennzeichnet):
 * - Einführungsphase der Oberstufe: Sprachmittlung 350–500 Wörter (unterhalb der Abiturvorlage).
 * - Leseverstehen Oberstufe: 500–800 (Qualifikationsphase) bzw. 400–600 Wörter.
 * - Quellen- und Sachtexte der übrigen Fächer: Sek II 300–600, Sek I 200–400 Wörter.
 * Eine Klausur mit weniger als 90 Minuten bekommt höchstens drei Viertel des Maximums.
 */
import { skillSizes } from '../../arbeitsblatt/generation/prompts/schreiben'
import { stageForGrade } from '../../arbeitsblatt/didactics/profile'
import type { Zielbereich } from '../../arbeitsblatt/generation/zuschnitt'
import { formatArt } from './faecher'
import type { Exam, ExamPart } from './types'

/** Erstes Jahr der Oberstufe – die Einführungsphase (G9: Klasse 11) */
const einfuehrungsphase = (grade: number): boolean => grade <= 11

export function materialZiel(exam: Exam, part: Pick<ExamPart, 'formatId' | 'minutes'>): Zielbereich {
  const m = exam.meta
  const sek2 = stageForGrade(m.grade, m.schoolTypeId) === 'sek2'
  const art = formatArt(part.formatId)
  let ziel: Zielbereich
  if (art === 'mediation' || art === 'reading') {
    if (sek2) {
      if (art === 'mediation')
        ziel = einfuehrungsphase(m.grade)
          ? { min: 350, max: 500, grund: 'Faustregel Einführungsphase, unterhalb der Abiturvorlage' }
          : { min: 450, max: 650, grund: 'NRW-Abitur: Sprachmittlungsvorlage GK/LK 450–650 Wörter' }
      else
        ziel = einfuehrungsphase(m.grade)
          ? { min: 400, max: 600, grund: 'Faustregel Leseverstehen Einführungsphase' }
          : { min: 500, max: 800, grund: 'Faustregel Leseverstehen Qualifikationsphase' }
    } else {
      const basis = skillSizes(m.cefrLevel || 'B1').source
      ziel = { min: Math.round(basis * 0.85), max: Math.round(basis * 1.15), grund: `Richtwert für GER-Niveau ${m.cefrLevel || 'B1'} (±15 %)` }
    }
  } else {
    ziel = sek2
      ? { min: 300, max: 600, grund: 'Faustregel Quellen- und Sachtexte Sek II' }
      : { min: 200, max: 400, grund: 'Faustregel Quellen- und Sachtexte Sek I' }
  }
  // Kurze Arbeiten: weniger Lesestoff (Faustregel)
  const minuten = exam.meta.minutes || part.minutes || 90
  if (sek2 && minuten < 90) {
    const max = Math.round(ziel.max * 0.75)
    ziel = { min: Math.min(ziel.min, Math.round(max * 0.75)), max, grund: `${ziel.grund}; gekürzt für ${minuten} Minuten` }
  }
  return ziel
}
