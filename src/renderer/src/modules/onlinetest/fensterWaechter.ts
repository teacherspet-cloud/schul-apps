/**
 * Kein zweites Fenster neben dem Onlinetest (03.10.2026, Wunsch der Lehrkraft: „Sorge dafür, dass
 * kein weiteres Fenster neben der Seite zu sehen ist … und dass Schüler vor Beginn eine deutliche
 * Warnung erhalten").
 *
 * Der Fokus-Wächter fängt das BENUTZEN eines anderen Fensters (PC). Ein Fenster daneben, aus dem man
 * nur abliest, behält aber nie den Fokus. Darum wird hier die Größe geprüft:
 *  - PC: Das Browserfenster muss (fast) den ganzen Bildschirm füllen – sonst ist daneben Platz.
 *  - Tablet/Handy: Die Seite muss so breit sein wie der Bildschirm in der aktuellen Ausrichtung
 *    (Split View, Slide Over, Stage Manager, geteilter Bildschirm unter Android verkleinern sie).
 * Gemessen wird die Breite des Layouts (clientWidth), die sich weder durch die Bildschirmtastatur
 * noch durch Zoomen mit zwei Fingern ändert.
 */
export interface FensterLage {
  geteilt: boolean
  amPc: boolean
}

export function amPcGeraet(): boolean {
  return window.matchMedia?.('(pointer: fine)').matches === true && !('ontouchstart' in window) && navigator.maxTouchPoints === 0
}

/** Reine Prüfung (testbar): Fenster- und Bildschirmmaße → geteilt? */
export function istGeteilt(m: {
  amPc: boolean
  aussenBreite: number
  aussenHoehe: number
  innenBreite: number
  bildBreite: number
  bildHoehe: number
  quer: boolean
}): boolean {
  if (m.amPc) {
    // Nicht maximiert (etwas Spiel für Fensterränder und Taskleisten-Eigenheiten)
    return m.aussenBreite < m.bildBreite * 0.92 || m.aussenHoehe < m.bildHoehe * 0.8
  }
  const voll = m.quer ? Math.max(m.bildBreite, m.bildHoehe) : Math.min(m.bildBreite, m.bildHoehe)
  return voll > 0 && m.innenBreite < voll * 0.9
}

export function fensterLage(): FensterLage {
  const amPc = amPcGeraet()
  const geteilt = istGeteilt({
    amPc,
    aussenBreite: window.outerWidth,
    aussenHoehe: window.outerHeight,
    innenBreite: document.documentElement.clientWidth || window.innerWidth,
    bildBreite: amPc ? screen.availWidth : screen.width,
    bildHoehe: amPc ? screen.availHeight : screen.height,
    quer: window.matchMedia?.('(orientation: landscape)').matches === true
  })
  return { geteilt, amPc }
}

/** Auf dem PC: Vollbild anbieten (der einfachste Weg zu „nichts daneben") */
export async function vollbild(): Promise<void> {
  try {
    await document.documentElement.requestFullscreen?.()
  } catch {
    // nicht erlaubt (z. B. iPhone) – dann bleibt der Hinweis
  }
}
