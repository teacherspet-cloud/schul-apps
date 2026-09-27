/**
 * Kopf- und Schlussfigur des Vokabeltests (27.09.2026).
 *
 * Bis dahin hatten Arbeitsblatt, Klassenarbeit, Grammatiktest und Lernzielkontrolle ihr
 * Maskottchen, der Vokabeltest nicht – er rendert nicht über das Arbeitsblatt-Modell. Die
 * Regel ist dieselbe wie bei Arbeiten: nur am Kopf (winkend) und am Schluss (jubelnd), keine
 * Sprechblasen, nur auf dem Schülerblatt. Ob überhaupt: ausdrückliche Wahl am Test, sonst
 * der Jahrgang; ohne angelegte Figur nie (arbeitsblatt/generation/illustrationen.ts).
 */
import { illustrationenAktiv, illustrationenVorschlag } from '../../arbeitsblatt/generation/illustrationen'
import type { TestDocument } from '../model/types'

export interface VokabeltestFigur {
  maskottchenId?: string
}

/** Figur des Tests oder null, wenn keine auf das Blatt kommt. */
export function vokabeltestFigur(doc: Pick<TestDocument, 'settings' | 'header'>): VokabeltestFigur | null {
  if (!illustrationenAktiv({ grade: doc.settings.grade, illustrationen: doc.header.illustrationen })) return null
  return { maskottchenId: doc.header.illustrationen?.maskottchenId }
}

/** Vorschlag der Automatik für den Schalter im Kopf-Dialog */
export const vokabeltestFigurVorschlag = (grade: number): boolean => illustrationenVorschlag(grade)
