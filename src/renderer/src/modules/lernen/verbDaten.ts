/**
 * Daten der Verbspiele (07.10.2026): Karten der unregelmäßigen Verben mit Bild und Ton aus der Medienbank – im
 * Vokabeltraining (Verben der Liste) und im Grammatiktraining (Freigabe „Unregelmäßige Verben").
 */
import { useEffect, useState } from 'react'
import { satzSchluessel } from '@shared/medienbank'
import { formSpalten, sprechtext, type VerbKarte } from '@shared/verbTraining'
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
    void medienErgaenzen(
      sprache,
      karten.map((k) => k.schluessel),
      klasse
    ).then(() => setGeladen((x) => x + 1))
  }, [schluessel, sprache, klasse]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!karten?.length || !sprache) return undefined
  void geladen
  const aufnahme = (k: VerbKarte): boolean => Object.values(k.formen).some((f) => Boolean(medium(k.schluessel)?.saetze?.[satzSchluessel(sprechtext(f))]?.url))
  return {
    karten,
    spalten: formSpalten(sprache),
    sprache,
    tonSprache: sprache,
    bild: (k) => medium(k.schluessel)?.bild?.url,
    mitTon: kannSprechen(sprache) || karten.some(aufnahme),
    mitMuster: musterDer(karten, sprache).size >= 4,
    schreiben
  }
}
