/**
 * Sitzung der Oberfläche (09.10.2026, Entscheidung der Lehrkraft):
 *  - Beim ERSTEN Öffnen einer App in der aktuellen Anmeldesitzung steht ihre Übersicht (Bibliothek bzw. Startbild) da –
 *    nicht das zuletzt offene Dokument oder ein Unterschritt. Danach bleibt innerhalb der Sitzung alles, wie es war
 *    (App wechseln und zurück behält den Stand). Gezielte Sprünge (Dokument von der Startseite, aus der Suche, aus der
 *    Auftragsleiste, „Meine Klassen" …) öffnen weiterhin ihr Ziel.
 *  - Auf- und zugeklappte Kästen (Karten, Bereiche, „Weitere Optionen", Gruppen der Bibliotheken …) gelten nur für die
 *    Sitzung: In einer neuen Sitzung stehen sie wieder wie vorgegeben (die eingeklappten eingeklappt), auch wenn sie
 *    zuletzt offen waren. Ansichtswünsche, die KEIN Auf/Zu sind (Karten oder Liste, Sortierung, Schalter wie „Material
 *    aus Unterrichtsreihen einblenden"), bleiben dauerhaft je Gerät – die laufen nicht hierüber.
 *
 * Was ist eine Sitzung?
 *  - Exe am PC: jeder Programmstart (Kennung vom Hauptprozess, gleich für alle Fenster dieses Starts).
 *  - Server / Web / Exe „Schul-Apps Online": jede Anmeldung (IServ, Notzugang, Test, Schülerkonto) – der Server nennt
 *    eine aus der Sitzung abgeleitete Kennung in /server/ich.js. Neuladen der Seite in derselben Anmeldung ist KEINE neue
 *    Sitzung.
 *  - Browser am PC (PIN): jede Anmeldung mit der PIN (abgeleitet von der Anmeldekennung).
 *  - Sonst (iPad-App, Tests): Kennung im sessionStorage – gilt, bis die App bzw. der Tab geschlossen wird.
 *
 * Gespeichert wird ein Auf/Zu als `{"s": <Sitzung>, "v": <Wert>}`; stammt es aus einer anderen Sitzung (oder aus der Zeit
 * vor dieser Regel), gilt die Vorgabe.
 */
import { useState } from 'react'

declare global {
  interface Window {
    /** Setzt der Preload der Exe am PC (src/preload/index.ts): Kennung dieses Programmstarts */
    __schulappsSitzung?: string
  }
}

let kennung: string | null = null

const zufall = (): string => {
  try {
    return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  }
}

/** Kurzer, nicht umkehrbarer Fingerabdruck (FNV-1a) – die Anmeldekennung selbst landet so nicht im Speicher */
export const fingerabdruck = (s: string): string => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}

function ermittle(): string {
  if (typeof window === 'undefined') return 'ohne-fenster'
  // Server: aus der Anmeldung abgeleitet
  const server = window.__schulappsServer?.sitzung
  if (server) return `server-${server}`
  // Exe am PC: Programmstart
  if (window.__schulappsSitzung) return `pc-${window.__schulappsSitzung}`
  // Browser am PC (PIN): je Anmeldung
  try {
    const token = localStorage.getItem('schulapps-netz-token')
    if (token && window.location.protocol.startsWith('http')) return `pin-${fingerabdruck(token)}`
  } catch {
    /* kein Speicher */
  }
  // Sonst: solange Tab bzw. App offen ist
  try {
    const da = sessionStorage.getItem('schulapps-sitzung')
    if (da) return da
    const neu = `tab-${zufall()}`
    sessionStorage.setItem('schulapps-sitzung', neu)
    return neu
  } catch {
    return `lauf-${zufall()}`
  }
}

/** Kennung der aktuellen Sitzung (siehe oben) */
export function sitzungsKennung(): string {
  if (kennung === null) kennung = ermittle()
  return kennung
}

/** Nur für Tests: Sitzung vorgeben (null = neu ermitteln) */
export function sitzungFuerTests(k: string | null): void {
  kennung = k
  besucht.clear()
}

// ---------------------------------------------------------------- Auf/Zu je Sitzung

/** Gespeicherten Text lesen: den Wert, wenn er aus dieser Sitzung stammt – sonst undefined (dann gilt die Vorgabe) */
export function entpacke<T>(roh: string | null, sitzung: string): T | undefined {
  if (!roh) return undefined
  try {
    const d = JSON.parse(roh) as unknown
    if (!d || typeof d !== 'object' || Array.isArray(d)) return undefined
    const o = d as { s?: unknown; v?: unknown }
    return o.s === sitzung && 'v' in o ? (o.v as T) : undefined
  } catch {
    return undefined
  }
}

export const verpacke = (wert: unknown, sitzung: string): string => JSON.stringify({ s: sitzung, v: wert })

/** Auf/Zu-Zustand lesen – nur aus der aktuellen Sitzung */
export function offenLesen<T>(schluessel: string): T | undefined {
  try {
    return entpacke<T>(localStorage.getItem(schluessel), sitzungsKennung())
  } catch {
    return undefined
  }
}

/** Auf/Zu-Zustand für die aktuelle Sitzung merken */
export function offenMerken(schluessel: string, wert: unknown): void {
  try {
    localStorage.setItem(schluessel, verpacke(wert, sitzungsKennung()))
  } catch {
    // ohne Speicher gilt es nur, solange die Ansicht steht
  }
}

/** React: Auf/Zu-Zustand, gemerkt für diese Sitzung; in einer neuen Sitzung gilt `vorgabe` */
export function useOffenGemerkt<T>(schluessel: string, vorgabe: T): [T, (v: T | ((alt: T) => T)) => void] {
  const [wert, setWert] = useState<T>(() => offenLesen<T>(schluessel) ?? vorgabe)
  const setzen = (v: T | ((alt: T) => T)): void =>
    setWert((alt) => {
      const neu = typeof v === 'function' ? (v as (a: T) => T)(alt) : v
      offenMerken(schluessel, neu)
      return neu
    })
  return [wert, setzen]
}

// ---------------------------------------------------------------- Erstes Öffnen einer App

/*
 * Die Programme bleiben geladen, ihr Stand liegt im Speicher der Seite. Eine neue Sitzung beginnt deshalb immer mit einer
 * neu geladenen Seite – „erstes Öffnen in der Sitzung" heißt: erstes Öffnen, seit diese Seite steht.
 */
const besucht = new Set<string>()

/** App als geöffnet vermerken (jeder Weg dorthin, auch ein gezielter Sprung zu einem Dokument) */
export function alsGeoeffnetMerken(id: string): void {
  besucht.add(id)
}

/** Wurde die App in dieser Sitzung schon geöffnet? */
export const schonGeoeffnet = (id: string): boolean => besucht.has(id)

/**
 * Öffnen über die Leiste (bzw. Programmliste, Tastenkürzel, „Alle …"): true beim ersten Mal in dieser Sitzung – dann
 * zeigt die App ihre Übersicht. Vermerkt die App zugleich als geöffnet.
 */
export function erstesOeffnen(id: string): boolean {
  const erstes = !besucht.has(id)
  besucht.add(id)
  return erstes
}
