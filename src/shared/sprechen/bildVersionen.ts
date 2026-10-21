/**
 * Bildversionen einer Bildkarte (21.10.2026, Wunsch der Lehrkraft: „Bild neu erzeugen", alle Fassungen behalten,
 * die aktuelle wählen, veraltete löschen). `bilder` bleibt die AKTUELLE Auswahl – so drucken Prüfungsset, Training und
 * Kacheln unverändert; `bildVersionen` hält alle Fassungen (die aktuelle eingeschlossen). Rein rechnend, für Tests.
 */
import type { BildKarte } from './karten'

type MitBildern = Pick<BildKarte, 'bilder' | 'bildVersionen'>

/** Alle Fassungen, ohne Dopplungen, die aktuelle(n) zuerst nicht nötig – Reihenfolge der Entstehung */
export const bildVersionen = (k: MitBildern): string[] => [...new Set([...(k.bildVersionen ?? []), ...k.bilder])]

/** Neue Fassung: kommt dazu und wird die aktuelle */
export function versionHinzu<K extends MitBildern>(k: K, datei: string): K {
  return { ...k, bildVersionen: [...bildVersionen(k).filter((x) => x !== datei), datei], bilder: [datei] }
}

/** Fassung wählen: wird die aktuelle (nur eine vorhandene) */
export function versionWaehlen<K extends MitBildern>(k: K, datei: string): K {
  return bildVersionen(k).includes(datei) ? { ...k, bildVersionen: bildVersionen(k), bilder: [datei] } : k
}

/** Fassung löschen – war sie die aktuelle, wird die jüngste übrige aktuell */
export function versionLoeschen<K extends MitBildern>(k: K, datei: string): K {
  const rest = bildVersionen(k).filter((x) => x !== datei)
  const bilder = k.bilder.filter((x) => x !== datei)
  return { ...k, bildVersionen: rest, bilder: bilder.length ? bilder : rest.slice(-1) }
}

/**
 * Beim Speichern aus dem Fenster zusammenführen: Während das Fenster offen war, kann im Hintergrund eine neue Fassung
 * entstanden sein (`aktuell` = Stand am Server). Sie bleibt erhalten; im Fenster gelöschte Fassungen fallen weg; die
 * im Fenster gewählte Fassung bleibt aktuell, wenn es sie noch gibt – sonst die jüngste.
 */
export function versionenZusammenfuehren<K extends MitBildern>(bearbeitet: K, aktuell: MitBildern | undefined, geloescht: string[]): K {
  const weg = new Set(geloescht)
  const alle = [...new Set([...bildVersionen(bearbeitet), ...(aktuell ? bildVersionen(aktuell) : [])])].filter((x) => !weg.has(x))
  const neuImHintergrund = aktuell ? bildVersionen(aktuell).filter((x) => !bildVersionen(bearbeitet).includes(x) && !weg.has(x)) : []
  // Eine im Hintergrund fertig gewordene Fassung ist die gewünschte neue – sie wird aktuell
  const wahl = neuImHintergrund.length ? neuImHintergrund.slice(-1) : bearbeitet.bilder.filter((x) => alle.includes(x))
  return { ...bearbeitet, bildVersionen: alle, bilder: wahl.length ? wahl : alle.slice(-1) }
}

/** Dateien, die eine Karte nicht mehr nennt (zum Aufräumen am Server) */
export const entfalleneBilder = (alt: MitBildern | undefined, neu: MitBildern | undefined): string[] => {
  const bleibt = new Set(neu ? bildVersionen(neu) : [])
  return alt ? bildVersionen(alt).filter((x) => !bleibt.has(x)) : []
}
