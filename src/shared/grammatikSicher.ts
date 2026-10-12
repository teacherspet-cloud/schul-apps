/**
 * Wann ist eine Grammatikform „sicher"? (12.10.2026, Entscheidung der Lehrkraft) – EINE Regel für die Ampel der
 * Lehrkraft, die Ansicht der Lernenden, Klassenzahlen und Achievements (Medaillen nutzen `formBefund`).
 *
 * Begründung: Zu einer Form gibt es eine Aufgabenreihe, die nicht wiederholt wird – maßgeblich ist darum, wie viele
 * VERSCHIEDENE Aufgaben beim ERSTEN Versuch gelangen (nicht die Summe aller Versuche samt Wiederholungen).
 *
 *  - sicher: mindestens 80 % der bearbeiteten Aufgaben der Form beim ersten Versuch richtig, bearbeitet sind mindestens
 *    5 Aufgaben (bzw. alle, wenn die Reihe weniger hat); enthält die Reihe Bilden-Aufgaben (Stufe 2/3), müssen auch
 *    von diesen mindestens 80 % beim ersten Versuch richtig sein (mindestens eine bearbeitet).
 *  - Ein späterer Fehler (Wiederholung, Spiel) stuft auf „im Aufbau" zurück, bis die Aufgabe wieder richtig gelöst ist.
 *  - Schwäche: weniger als 60 % beim ersten Versuch richtig (bei genug bearbeiteten Aufgaben).
 *  - wenig: noch zu wenige Aufgaben bearbeitet.
 *  - „fast richtig" (Tippfehler) gilt beim ersten Versuch als richtig – wie in der Ableitung für ältere Stände.
 *
 * Ältere Stände ohne `erster`: aus `versuche`/`falsch` abgeleitet – nie falsch → erster Versuch richtig, sonst
 * vorsichtig falsch; ohne `nachFehler` gilt kein späterer Fehler als offen.
 */
import type { Urteil, WortStand } from './vokabeltrainer'

export const SICHER_ERSTE_AB = 0.8
export const SCHWAECHE_ERSTE_UNTER = 0.6
/** So viele verschiedene Aufgaben (bzw. alle, wenn es weniger gibt) braucht ein Befund */
export const MIN_AUFGABEN = 5

export type FormAmpel = 'sicher' | 'aufbau' | 'schwaeche' | 'wenig'

type Stand = Pick<WortStand, 'versuche' | 'falsch'> & Partial<Pick<WortStand, 'erster' | 'nachFehler'>>

/** Ergebnis des ersten Versuchs; null = noch nicht bearbeitet */
export function ersterVersuch(s: Stand | undefined | null): 'r' | 'f' | null {
  if (!s || !s.versuche) return null
  if (s.erster === 'r' || s.erster === 'f') return s.erster
  return s.falsch === 0 ? 'r' : 'f'
}

/** Steht ein späterer Fehler noch offen (nicht durch eine richtige Antwort ausgeglichen)? */
export const spaeterFehlerOffen = (s: Stand | undefined | null): boolean => Boolean(s && s.versuche && s.nachFehler)

/** Stand nach einer Antwort im Grammatiktrainer: ersten Versuch festhalten, spätere Fehler merken bzw. ausgleichen */
export function mitErstemVersuch<S extends WortStand>(alt: Stand | undefined | null, neu: S, urteil: Urteil): S {
  if (!alt || !alt.versuche) return { ...neu, erster: urteil === 'falsch' ? 'f' : 'r', nachFehler: false }
  const erster = ersterVersuch(alt) ?? 'f'
  const nachFehler = urteil === 'falsch' ? true : urteil === 'richtig' ? false : Boolean(alt.nachFehler)
  return { ...neu, erster, nachFehler }
}

/** Fehler im Spiel (Einzel- und Mehrspieler): gilt als späterer Fehler der Aufgabe */
export function nachSpielfehlerGrammatik<S extends WortStand>(s: S): S {
  if (!s.versuche) return s
  return { ...s, erster: ersterVersuch(s) ?? 'f', nachFehler: true }
}

export interface FormBefund {
  ampel: FormAmpel
  /** Aufgaben der Reihe */
  gesamt: number
  /** Davon bearbeitet (mindestens ein Versuch) */
  bearbeitet: number
  /** Davon beim ersten Versuch richtig */
  ersteRichtig: number
  /** Anteil beim ersten Versuch richtig (0–1) */
  quote: number
  /** Bilden-Aufgaben (Stufe 2/3) – null, wenn die Reihe keine hat */
  bilden: { gesamt: number; bearbeitet: number; ersteRichtig: number } | null
  /** Ein späterer Fehler steht offen */
  nachFehler: boolean
}

/**
 * Befund einer Form aus ihrer Aufgabenreihe (alle Aufgaben der Regel, ggf. über mehrere Freigaben) und den Ständen der
 * Person. `stufe` 2/3 = Bilden-Aufgabe.
 */
export function formBefund(aufgaben: readonly { id: string; stufe?: number }[], staende: Record<string, Stand | undefined>): FormBefund {
  const gesehen = new Set<string>()
  const liste = aufgaben.filter((a) => (gesehen.has(a.id) ? false : (gesehen.add(a.id), true)))
  let bearbeitet = 0
  let ersteRichtig = 0
  let nachFehler = false
  const bildenListe = liste.filter((a) => a.stufe === 2 || a.stufe === 3)
  let bB = 0
  let bR = 0
  for (const a of liste) {
    const s = staende[a.id]
    const e = ersterVersuch(s)
    if (!e) continue
    bearbeitet++
    if (e === 'r') ersteRichtig++
    if (spaeterFehlerOffen(s)) nachFehler = true
    if (a.stufe === 2 || a.stufe === 3) {
      bB++
      if (e === 'r') bR++
    }
  }
  const quote = bearbeitet ? ersteRichtig / bearbeitet : 0
  const bilden = bildenListe.length ? { gesamt: bildenListe.length, bearbeitet: bB, ersteRichtig: bR } : null
  const noetig = Math.max(1, Math.min(MIN_AUFGABEN, liste.length))
  let ampel: FormAmpel
  if (!liste.length || bearbeitet < noetig) ampel = 'wenig'
  else if (quote < SCHWAECHE_ERSTE_UNTER) ampel = 'schwaeche'
  else if (quote >= SICHER_ERSTE_AB && (!bilden || (bB > 0 && bR / bB >= SICHER_ERSTE_AB)) && !nachFehler) ampel = 'sicher'
  else ampel = 'aufbau'
  return { ampel, gesamt: liste.length, bearbeitet, ersteRichtig, quote, bilden, nachFehler }
}

/** Kurzform: ist die Form sicher? */
export const formSicher = (aufgaben: readonly { id: string; stufe?: number }[], staende: Record<string, Stand | undefined>): boolean =>
  formBefund(aufgaben, staende).ampel === 'sicher'
