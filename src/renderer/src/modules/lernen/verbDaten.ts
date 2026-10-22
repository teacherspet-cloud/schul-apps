/**
 * Daten der Verbspiele (07.10.2026): Karten der unregelmäßigen Verben mit Bild und Ton aus der Medienbank – im
 * Vokabeltraining (Verben der Liste) und im Grammatiktraining (Freigabe „Unregelmäßige Verben").
 */
import { useEffect, useState } from 'react'
import { satzSchluessel } from '@shared/medienbank'
import { bildVon } from '@shared/medienBedeutung'
import { lernendenNachweis } from '@shared/bildLizenz'
import { formSchluessel, formSpalten, type VerbKarte } from '@shared/verbTraining'
import type { VerbSprache } from '@shared/verben'
import { medienErgaenzen, medium } from './medienCache'
import { kannSprechen } from './VokabelTrainer'
import { musterDer, type VerbDaten } from './spiele/SpieleVerben'

export function useVerbDaten(
  karten: VerbKarte[] | undefined,
  sprache: VerbSprache | undefined,
  klasse?: number | null,
  schreiben?: (k: VerbKarte) => boolean
): VerbDaten | undefined {
  const [geladen, setGeladen] = useState(0)
  const schluessel = (karten ?? []).map((k) => k.schluessel).join('|')
  useEffect(() => {
    if (!karten?.length || !sprache) return
    // Verben ausdrücklich als Verb mit ihrer Bedeutung (21.10.2026): „bear" (ertragen) bekommt nicht das Bild des Bären
    void medienErgaenzen(
      sprache,
      karten.map((k) => ({ w: k.schluessel, de: k.de, art: 'verb' as const })),
      klasse
    ).then(() => setGeladen((x) => x + 1))
  }, [schluessel, sprache, klasse]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!karten?.length || !sprache) return undefined
  void geladen
  const aufnahme = (k: VerbKarte): boolean =>
    Object.entries(k.formen).some(([spalte, f]) => Boolean(medium(k.schluessel)?.saetze?.[satzSchluessel(formSchluessel(f, sprache, spalte))]?.url))
  return {
    karten,
    spalten: formSpalten(sprache),
    sprache,
    tonSprache: sprache,
    bild: (k) => bildVon(medium(k.schluessel), { term: k.schluessel, translation: k.de, wortart: 'verb' }, sprache)?.bild?.url,
    // Bildnachweis für Lernende (23.10.2026, Bildnachweise): „KI-generiert“ bzw. Urheber · Lizenz
    nachweis: (k) => {
      const b = bildVon(medium(k.schluessel), { term: k.schluessel, translation: k.de, wortart: 'verb' }, sprache)?.bild
      return (b?.url && lernendenNachweis(b)) || undefined
    },
    mitTon: kannSprechen(sprache) || karten.some(aufnahme),
    mitMuster: musterDer(karten, sprache).size >= 4,
    schreiben
  }
}
