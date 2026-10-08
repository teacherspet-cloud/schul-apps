/**
 * „Rückmeldung …" aus einem anderen Programm heraus (Großprogramm 0.4, F3): Das Programm legt
 * sich die Vorgabe (welches Material) hier ab und öffnet „Rückmeldung"; dort öffnet sich die
 * Rückmeldung zu diesem Material bzw. entsteht neu (08.10.2026: je Material nur eine).
 */
import { sichereAlles } from '../../shared/autosave'
import { openModule } from '../../shared/navigation'
import type { MaterialEintrag } from './generation'
import type { Rueckmeldung } from './model/types'

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

/**
 * Gespeicherte Rückmeldung zu einem Material (08.10.2026, Wunsch der Lehrkraft: „Rückmeldung …"
 * öffnet die vorhandene statt jedes Mal eine neue). Schaut nur ins Verzeichnis der Bibliothek
 * (`quelleArt`/`quelleId` aus `rueckmeldungStats`) – billig genug für jeden Editor-Knopf.
 */
export async function rueckmeldungIdZu(art: MaterialEintrag['art'], id: string): Promise<string | null> {
  const liste = await window.api.rueckmeldungen.list()
  return liste.find((m) => m.quelleId === id && m.quelleArt === art)?.id ?? null
}

/**
 * Ältere Rückmeldungen (vor 08.10.2026) haben die Quelle nicht im Verzeichnis: Nur die ohne
 * Quelle mit passendem Thema (= Name des Materials) werden geladen und nachgesehen.
 */
export async function aeltereRueckmeldungZu(art: MaterialEintrag['art'], id: string, titel: string): Promise<string | null> {
  if (!titel.trim()) return null
  const liste = await window.api.rueckmeldungen.list()
  for (const m of liste.filter((x) => x.quelleId === undefined && x.thema === titel)) {
    try {
      const g = ((await window.api.rueckmeldungen.get(m.id)).payload as Rueckmeldung | null)?.grundlage
      if (g?.docId === id && g.art === art) return m.id
    } catch {
      // Nicht lesbar – dann eben nicht diese
    }
  }
  return null
}
