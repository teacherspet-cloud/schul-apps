/**
 * Seitenwechsel im Schülerbereich ohne Neuladen (09.10.2026, Befund der Lehrkraft: Beim Aufschlagen und Zuklappen eines
 * Ordners blitzte zwischen Regal und Ordner kurz eine leere Seite auf – das war das Neuladen der Seite).
 * Der Schülerbereich wählt seine Seite allein aus der Adresse (SchuelerBereich.tsx). `geheZu` setzt deshalb nur die
 * Adresse (pushState) und meldet den Wechsel; `usePfad` zeichnet daraufhin neu – auch bei „Zurück"/„Vorwärts" des
 * Browsers zwischen solchen Einträgen. Ohne angemeldeten Schülerbereich (andere Seiten): wie bisher ein echter Wechsel.
 */
import { useEffect, useState } from 'react'

const EREIGNIS = 'sa-seitenwechsel'
let hoerer = 0

/** Aktueller Pfad – zeichnet bei `geheZu` und bei Zurück/Vorwärts neu */
export function usePfad(): string {
  const [pfad, setPfad] = useState(() => window.location.pathname)
  useEffect(() => {
    hoerer++
    const neu = (): void => setPfad(window.location.pathname)
    window.addEventListener('popstate', neu)
    window.addEventListener(EREIGNIS, neu)
    return () => {
      hoerer--
      window.removeEventListener('popstate', neu)
      window.removeEventListener(EREIGNIS, neu)
    }
  }, [])
  return pfad
}

/** Kann ohne Neuladen gewechselt werden? */
export const ohneNeuladen = (): boolean => hoerer > 0

/** Zu einer Seite des Schülerbereichs wechseln – ohne Neuladen, wenn möglich */
export function geheZu(ziel: string): void {
  if (!ohneNeuladen() || !ziel.startsWith('/s')) return void window.location.assign(ziel)
  window.history.pushState({}, '', ziel)
  window.scrollTo(0, 0)
  window.dispatchEvent(new Event(EREIGNIS))
}
