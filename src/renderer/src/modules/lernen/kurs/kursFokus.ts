/**
 * Sprung aus dem Handlungsbedarf an die passende Stelle (09.10.2026, Befund der Lehrkraft: ein Grammatik-Eintrag führte
 * zur Vokabeltabelle). Kursseite und „Meine Klassen" setzen hier den Fokus (Kurs, Art des Hinweises, Reiter, Betroffene);
 * die Tabelle „je Lernende/r" schaltet daraufhin auf die passende Ansicht (Grammatik bzw. Vokabeln), klappt auf und
 * öffnet bei genau einer betroffenen Person deren Grammatik-Details. Danach wird die Stelle ins Bild geholt.
 */
import { create } from 'zustand'
import type { KursReiter } from './kursDaten'

export interface KursFokus {
  kurs: string
  hinweis: string
  reiter: KursReiter
  ids?: string[]
  /** Zeitpunkt – jeder Klick ist ein neuer Fokus; alte (über 5 s) gelten nicht mehr */
  zeit: number
}

/*
 * Ein Fokus gilt genau einmal (09.10.2026, Befund im Test): Wer ihn umsetzt, meldet ihn mit `erledige` ab. Sonst griff er
 * nach einem Reiterwechsel innerhalb der 5 s im neu aufgebauten Reiter noch einmal (Grammatik-Details öffneten sich erneut).
 */
export const useKursFokus = create<{ fokus: KursFokus | null; setze: (f: KursFokus | null) => void; erledige: (zeit: number) => void }>((set) => ({
  fokus: null,
  setze: (fokus) => set({ fokus }),
  erledige: (zeit) => set((s) => (s.fokus?.zeit === zeit ? { fokus: null } : s))
}))

/** Gilt der Fokus (noch) für diesen Kurs? */
export const fokusFuer = (f: KursFokus | null, kurs: string, jetzt = Date.now()): f is KursFokus => Boolean(f && f.kurs === kurs && jetzt - f.zeit < 5000)

/** Wohin der Sprung zielt: Entwürfe oben in der Grammatik-Tabelle, Grammatik je Lernende/r, Lernenden-Tabelle, Abschnitte */
export function fokusZiele(f: Pick<KursFokus, 'kurs' | 'hinweis' | 'reiter'>): string[] {
  const k = `[data-kurs-seite="${f.kurs}"]`
  if (f.hinweis === 'entwurf') return [`${k} [data-grammatik-entwurf]`, `${k} [data-kurs-grammatik]`]
  if (f.reiter === 'grammatik') return [`${k} [data-je-lernende-kopf="grammatik"]`, `${k} [data-kurs-grammatik]`]
  if (f.reiter === 'lernende') return [`${k} [data-lernende-kasten]`, `${k} [data-lernende-knoepfe]`]
  if (f.reiter === 'vokabeln') return [`${k} [data-kurs-abschnitte]`, `${k} [data-vokabel-kasten]`]
  return [k]
}

/** Fokus setzen und die Stelle ins Bild holen, sobald der Reiter steht (lädt erst – kurz warten) */
export function zumHinweis(f: Omit<KursFokus, 'zeit'>): void {
  useKursFokus.getState().setze({ ...f, zeit: Date.now() })
  const ziele = fokusZiele({ ...f, kurs: CSS.escape(f.kurs) })
  const bis = Date.now() + 4000
  const versuch = (): void => {
    const el = ziele.map((s) => document.querySelector<HTMLElement>(s)).find(Boolean)
    if (!el) {
      if (Date.now() < bis) window.setTimeout(versuch, 100)
      return
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  window.setTimeout(versuch, 60)
}
