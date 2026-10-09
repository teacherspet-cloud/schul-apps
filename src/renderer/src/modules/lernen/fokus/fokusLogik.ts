/**
 * Vollbild beim Lernen (09.10.2026, Entscheidung der Lehrkraft) – die reinen Regeln hinter FokusRahmen.tsx:
 *  - Vorgabe: an (Einstellungen › Lernen › „Vollbild beim Lernen"), die Lernenden können es abschalten.
 *  - Echter Vollbildmodus des Browsers, wo es ihn gibt (Fullscreen-API, am iPad mit „webkit"-Vorsilbe);
 *    das iPhone kennt ihn für Seiten nicht – dort bleibt es bei der Fokusansicht.
 *  - Esc beendet die Übung – aber nicht, wenn gerade ein Fenster, eine Auswahlliste o. Ä. offen ist oder der Browser mit
 *    derselben Taste gerade den echten Vollbildmodus verlassen hat.
 *  - Ein eigener Eintrag im Verlauf, damit die Zurück-Geste die Fokusansicht verlässt statt der Seite.
 */

/** Vorgabe für eine neue Übung: an, solange die Lernenden es nicht ausgeschaltet haben */
export const fokusVorgabe = (vollbild: boolean | undefined): boolean => vollbild !== false

// ---------------------------------------------------------------- Fullscreen-API (mit webkit-Vorsilbe)

interface VollbildElement {
  requestFullscreen?: () => Promise<void> | void
  webkitRequestFullscreen?: () => Promise<void> | void
}
export interface VollbildDokument {
  fullscreenEnabled?: boolean
  webkitFullscreenEnabled?: boolean
  fullscreenElement?: unknown
  webkitFullscreenElement?: unknown
  exitFullscreen?: () => Promise<void> | void
  webkitExitFullscreen?: () => Promise<void> | void
  documentElement: VollbildElement
}

/** Kann diese Seite in den echten Vollbildmodus? (iPhone: nein) */
export const vollbildMoeglich = (doc: VollbildDokument): boolean =>
  Boolean(
    (doc.fullscreenEnabled || doc.webkitFullscreenEnabled) &&
      (typeof doc.documentElement.requestFullscreen === 'function' || typeof doc.documentElement.webkitRequestFullscreen === 'function')
  )

/** Ist gerade etwas im echten Vollbild? */
export const imVollbild = (doc: VollbildDokument): boolean => Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement)

/** Echtes Vollbild anfordern (still: abgelehnt oder nicht möglich → false) */
export function vollbildAnfordern(doc: VollbildDokument): boolean {
  if (!vollbildMoeglich(doc) || imVollbild(doc)) return false
  const el = doc.documentElement
  try {
    const r = typeof el.requestFullscreen === 'function' ? el.requestFullscreen() : el.webkitRequestFullscreen?.()
    if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => undefined)
    return true
  } catch {
    return false
  }
}

/** Echtes Vollbild verlassen (still) */
export function vollbildVerlassen(doc: VollbildDokument): void {
  if (!imVollbild(doc)) return
  try {
    const r = typeof doc.exitFullscreen === 'function' ? doc.exitFullscreen() : doc.webkitExitFullscreen?.()
    if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => undefined)
  } catch {
    /* nichts zu tun */
  }
}

// ---------------------------------------------------------------- Esc

export interface EscLage {
  key: string
  /** Schon von einem Fenster, einer Auswahl o. Ä. behandelt */
  behandelt: boolean
  /** Ziel liegt in einem anderen Fenster (Dialog außerhalb der Übung) oder in einer offenen Auswahlliste */
  inFenster: boolean
  /** Gerade im echten Vollbild – dann verlässt der Browser mit Esc das Vollbild, nicht die Übung */
  vollbild: boolean
  /** Millisekunden seit dem letzten Verlassen des echten Vollbilds */
  seitVollbildEnde: number
}

/** Beendet diese Taste die Übung? */
export const escBeendet = (l: EscLage): boolean =>
  l.key === 'Escape' && !l.behandelt && !l.inFenster && !l.vollbild && l.seitVollbildEnde > 400

// ---------------------------------------------------------------- Verlauf

/** Eintrag im Verlauf für die Fokusansicht – übernimmt den bisherigen Zustand (etwa die Ebene im Fachordner) */
export const mitFokus = (state: unknown, id: string): Record<string, unknown> => ({
  ...(state && typeof state === 'object' ? (state as Record<string, unknown>) : {}),
  saFokus: id
})

/** Steht oben im Verlauf der eigene Eintrag? */
export const istEigenerEintrag = (state: unknown, id: string): boolean =>
  Boolean(state && typeof state === 'object' && (state as Record<string, unknown>).saFokus === id)
