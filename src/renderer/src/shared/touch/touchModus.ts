/**
 * Touch-Modus der Oberfläche (30.09.2026, Recherche: recherche/mobile-bedienung-2026-09-30.md).
 *
 * Auftrag der Lehrkraft: „Entwickle eine gute Bedienbarkeit für die App auf mobilen Geräten."
 * Die Oberfläche ist für Maus und ≥ 1280 Punkte gebaut. Auf dem iPad, dem iPhone und im Browser
 * eines Tablets (Netzzugang) bedient der Finger – dort gelten eigene Regeln: Ziele ≥ 44 Punkte,
 * Eingaben ≥ 16 px (sonst zoomt iOS beim Antippen hinein), kein Überfahren, langes Drücken statt
 * Rechtsklick, Wischen und Zwei-Finger-Zoom mit Knopf-Alternative.
 *
 * Diese Datei entscheidet EINMAL, ob der Finger bedient, und schreibt das als `data-touch` an
 * das `<html>`-Element. Alle Anpassungen hängen daran (touch.css und die Gesten in diesem
 * Ordner) – am PC mit Maus ändert sich nichts.
 *
 *  - In der iPad-/iPhone-App immer (auch mit Tastatur und Trackpad bleibt der Finger das Hauptgerät).
 *  - Sonst, wenn das HAUPTZEIGEGERÄT grob ist (`pointer: coarse`): Tablet und Telefon im Browser.
 *    Ein Notebook mit Touchscreen hat die Maus bzw. das Touchpad als Hauptgerät – dort bleibt alles.
 */
import { useSyncExternalStore } from 'react'
import { aufIos } from '../plattform'

const GROB = '(pointer: coarse)'
/** Telefonbreite: darunter Navigation unten, Dialoge als Vollbild (Material „compact" < 600 dp, mit Luft für iPhone quer nicht) */
export const TELEFON = '(max-width: 700px)'

const medien = (abfrage: string): MediaQueryList | null => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(abfrage) : null)

/** Bedient gerade der Finger? */
export function touchAktiv(): boolean {
  if (typeof document === 'undefined') return false
  return document.documentElement.hasAttribute('data-touch')
}

function ermitteln(): boolean {
  return aufIos() || Boolean(medien(GROB)?.matches)
}

const hoerer = new Set<() => void>()
const melden = (): void => hoerer.forEach((h) => h())

function setzen(): void {
  const an = ermitteln()
  const html = document.documentElement
  if (an === html.hasAttribute('data-touch')) return
  if (an) html.setAttribute('data-touch', '')
  else html.removeAttribute('data-touch')
  melden()
}

/**
 * Der Browser eines Tablets bekommt die Seite ohne Viewport-Angabe (src/renderer/index.html ist
 * für Electron gebaut) – Safari rechnete dann mit 980 Punkten Breite und verkleinerte alles.
 * `maximum-scale=1` verhindert das Hineinzoomen beim Antippen kleiner Eingabefelder; den
 * Zwei-Finger-Zoom der Blätter übernimmt die App selbst (ZoomFlaeche.tsx).
 */
function viewportSetzen(): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'viewport'
    meta.content = 'width=device-width, initial-scale=1, viewport-fit=cover'
    document.head.appendChild(meta)
  }
  if (!/maximum-scale/.test(meta.content)) meta.content = `${meta.content}, maximum-scale=1`
}

import { kartenTabellenEinrichten } from './kartenTabellen'

let installiert = false

/** Einmal beim Start: `data-touch` setzen und bei Wechsel (Tastatur/Maus am iPad an- und abstecken) nachführen */
export function touchModusEinrichten(): void {
  if (installiert || typeof document === 'undefined') return
  installiert = true
  setzen()
  medien(GROB)?.addEventListener('change', setzen)
  if (touchAktiv()) viewportSetzen()
  // Übersichtstabellen als Kartenliste am Telefon (07.10.2026)
  if (document.body) kartenTabellenEinrichten()
  else document.addEventListener('DOMContentLoaded', kartenTabellenEinrichten, { once: true })
}

/** React: bedient der Finger? (folgt dem Wechsel) */
export function useTouch(): boolean {
  return useSyncExternalStore(
    (h) => {
      hoerer.add(h)
      return () => hoerer.delete(h)
    },
    touchAktiv,
    () => false
  )
}

/** React: Finger UND Telefonbreite – Navigation unten, Dialoge als Vollbild */
export function useTelefon(): boolean {
  const touch = useTouch()
  const breite = useSyncExternalStore(
    (h) => {
      const m = medien(TELEFON)
      m?.addEventListener('change', h)
      return () => m?.removeEventListener('change', h)
    },
    () => Boolean(medien(TELEFON)?.matches),
    () => false
  )
  return touch && breite
}
