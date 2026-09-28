/**
 * „Rückmeldung …" aus einem anderen Programm heraus (Großprogramm 0.4, F3): Das Programm legt
 * sich die Vorgabe (welches Material) hier ab und öffnet „Rückmeldung"; dort entsteht eine neue
 * Rückmeldung mit diesem Material als Grundlage.
 */
import { sichereAlles } from '../../shared/autosave'
import { openModule } from '../../shared/navigation'
import type { MaterialEintrag } from './generation'

let offen: { art: MaterialEintrag['art']; id: string } | null = null
const hoerer = new Set<() => void>()

export async function rueckmeldungZu(art: MaterialEintrag['art'], id: string): Promise<void> {
  // Das Material muss gespeichert sein, damit die Rückmeldung es laden kann
  await sichereAlles()
  offen = { art, id }
  openModule('rueckmeldung')
  hoerer.forEach((h) => h())
}

export function nimmRueckmeldungVorgabe(): { art: MaterialEintrag['art']; id: string } | null {
  const v = offen
  offen = null
  return v
}

export function horcheAufVorgabe(h: () => void): () => void {
  hoerer.add(h)
  return () => hoerer.delete(h)
}
