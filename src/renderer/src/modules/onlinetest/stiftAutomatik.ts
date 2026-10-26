/**
 * Stift-Automatik (26.10.2026, Wunsch der Lehrkraft: „intelligent darauf reagieren, ob der Nutzer mit einem Stift zu
 * schreiben versucht, damit man nicht extra das Werkzeug vorher auswählen muss" – auch im Browser).
 *
 *  - Nähert sich ein Stift (Apple Pencil mit Schweben, Surface-Stift: Zeigerereignisse mit pointerType „pen" ohne
 *    Kontakt) oder setzt er auf dem Blatt auf, wechselt das Werkzeug von selbst auf den Stift – der Radiererknopf
 *    bzw. das umgedrehte Stiftende (buttons & 32) auf den Radierer. Der ERSTE Strich geht nicht verloren: Beim Aufsetzen
 *    beginnt die Tintenseite unter der Spitze den Strich sofort (`beginneWenn`), die Leinwand übernimmt danach.
 *  - Nur aus der Tastatur-Stellung heraus: Wer Textkästchen, Linien oder Formen gewählt hat, arbeitet damit weiter.
 *    Tippt der Stift in ein Feld, einen Knopf oder ein gesetztes Objekt, bleibt es beim Antippen (kein Strich).
 *  - Hat jemand die Tastatur nach einem Stift bewusst wieder gewählt, schaltet das Schweben nicht mehr um – nur ein
 *    Aufsetzen auf dem Blatt.
 *  - Das Blatt liegt in einem Rahmen ohne Skripte (iframe): Stiftereignisse darin sieht das Fenster nicht – darum hören
 *    wir auch am Dokument des Rahmens mit (gleicher Ursprung).
 *  Mit bekanntem Stift rollt und zoomt der Finger über der Tinte (tintenSeite.tsx) – wie in den Handschrift-Feldern.
 */
export type StiftArt = 'stift' | 'radierer'

export interface TintenApi {
  /** Beginnt einen Strich, wenn der Punkt (Fensterkoordinaten) auf dieser Leinwand liegt – dann true */
  beginneWenn(clientX: number, clientY: number, druck: number, art: StiftArt): boolean
  /** Bewegung weiterreichen, solange die Leinwand den Zeiger noch nicht selbst bekommt */
  weiter(clientX: number, clientY: number): void
}

/** Dort beginnt kein Strich: Eingaben, Knöpfe, Leiste, gesetzte Objekte, Fenster */
const KEIN_STRICH =
  'input, textarea, select, button, a[href], [contenteditable], [role="button"], [data-werkzeuge], [data-objekt-id], [data-objekt-form], [data-objekt-linie], [data-objekt-text], [data-objekt-punkt], .mantine-Popover-dropdown, .mantine-Modal-root, .mantine-Menu-dropdown'

export const istRadiererEnde = (e: PointerEvent): boolean => (e.buttons & 32) !== 0

export function stiftAutomatikEinrichten(o: {
  ziele: () => (Window | Document | null | undefined)[]
  /** Darf gerade umgeschaltet werden (Blatt schreibbar, Werkzeuge da, Tastatur gewählt)? */
  darf: (kontakt: boolean) => boolean
  aktivieren: (art: StiftArt) => void
  /** Strich an der Spitze beginnen; true, wenn eine Tintenseite ihn übernommen hat */
  beginne: (clientX: number, clientY: number, druck: number, art: StiftArt) => boolean
  weiter: (clientX: number, clientY: number) => void
}): () => void {
  // Ein von der Automatik begonnener Strich läuft, bis der Stift abhebt
  let laeuft = false
  const schweben = (e: PointerEvent): void => {
    if (e.pointerType !== 'pen' || e.buttons !== 0) return
    if (!o.darf(false)) return
    o.aktivieren('stift')
  }
  const aufsetzen = (e: PointerEvent): void => {
    if (e.pointerType !== 'pen' || !e.isPrimary) return
    if (!o.darf(true)) return
    const art: StiftArt = istRadiererEnde(e) ? 'radierer' : 'stift'
    const ziel = e.target instanceof Element ? e.target : null
    if (ziel?.closest(KEIN_STRICH)) return
    o.aktivieren(art)
    if (o.beginne(e.clientX, e.clientY, e.pressure, art)) {
      laeuft = true
      e.preventDefault()
    }
  }
  const bewegen = (e: PointerEvent): void => {
    if (laeuft && e.pointerType === 'pen') o.weiter(e.clientX, e.clientY)
  }
  const abheben = (e: PointerEvent): void => {
    if (e.pointerType === 'pen') laeuft = false
  }
  const ziele = o.ziele().filter((z): z is Window | Document => Boolean(z))
  for (const z of ziele) {
    z.addEventListener('pointerover', schweben as EventListener, { capture: true, passive: true })
    z.addEventListener('pointerdown', aufsetzen as EventListener, { capture: true })
    z.addEventListener('pointermove', bewegen as EventListener, { capture: true, passive: true })
    z.addEventListener('pointerup', abheben as EventListener, { capture: true, passive: true })
    z.addEventListener('pointercancel', abheben as EventListener, { capture: true, passive: true })
  }
  return () => {
    for (const z of ziele) {
      z.removeEventListener('pointerover', schweben as EventListener, { capture: true })
      z.removeEventListener('pointerdown', aufsetzen as EventListener, { capture: true })
      z.removeEventListener('pointermove', bewegen as EventListener, { capture: true })
      z.removeEventListener('pointerup', abheben as EventListener, { capture: true })
      z.removeEventListener('pointercancel', abheben as EventListener, { capture: true })
    }
  }
}
