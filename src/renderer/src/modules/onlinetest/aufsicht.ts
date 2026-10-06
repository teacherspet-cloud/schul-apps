/**
 * Aufsicht im Onlinetest (06.10.2026, abgestimmt mit der Lehrkraft).
 *
 * Befunde: Ein ausgeschaltetes iPad galt als „Seite verlassen" und damit als abgegeben; ein langsam verschobenes
 * zweites Fenster fiel nicht auf; markierter Aufgabentext ließ sich über „Übersetzen" übersetzen.
 *
 * Abgestimmt:
 *  - Seite verlassen (Tab, App, Bildschirmsperre, ausgeschaltetes Gerät) → NUR protokollieren, nicht abgeben.
 *  - PC: Vollbild ist Pflicht. Ohne Vollbild verdeckt eine Sperre den Test (und es wird protokolliert).
 *  - iPad/Tablet: Erkennung in der Seite – geteilte Ansicht (Split View, Stage Manager) und Fokuswechsel
 *    (Slide Over) werden sofort protokolliert.
 *  - Markieren des Aufgabentexts gesperrt (damit kein „Übersetzen"/„Nachschlagen" im Menü), Seitenübersetzung
 *    erkannt, Kopieren/Einfügen protokolliert.
 *
 * Jeder Vorfall geht mit Art, Zeit und – sobald bekannt – Dauer an den Server (`/s/api/vorfall`). Beim
 * Unsichtbarwerden per sendBeacon, weil die Seite danach eingefroren sein kann.
 */
import { useEffect, useRef } from 'react'

export type VorfallArt = 'verlassen' | 'fokus' | 'geteilt' | 'vollbild' | 'uebersetzt' | 'kopieren' | 'einfuegen'

export interface VorfallMeldung {
  art: VorfallArt
  /** Dauer in Sekunden (beim Abschluss eines Zeitraums) */
  dauer?: number
  /** Schließt den zuletzt offenen Vorfall derselben Art ab, statt einen neuen anzulegen */
  ende?: boolean
  info?: string
}

export type Melden = (m: VorfallMeldung, eilig?: boolean) => void

/** Meldung an den Server – eilig (Seite wird gerade unsichtbar) per sendBeacon */
export function vorfallSender(id: string, geheim: string): Melden {
  return (m, eilig) => {
    const koerper = JSON.stringify({ id, geheim, ...m })
    if (eilig && navigator.sendBeacon?.('/s/api/vorfall', new Blob([koerper], { type: 'text/plain' }))) return
    void fetch('/s/api/vorfall', { method: 'POST', body: koerper, keepalive: true }).catch(() => undefined)
  }
}

/** Seitenübersetzung erkennen (Chrome/Edge: Klasse „translated-…", <font>-Hüllen, lang; Safari/Firefox: Wächtertext) */
export const WAECHTER_TEXT = 'Please keep this page open until you have handed in your test.'
export function istUebersetzt(doc: Document, sprache: string): string | null {
  const html = doc.documentElement
  if (/\btranslated-(ltr|rtl)\b/.test(html.className)) return 'Browser-Übersetzung'
  if (html.lang && sprache && html.lang.toLowerCase() !== sprache.toLowerCase()) return `Sprache ${html.lang}`
  const w = doc.getElementById('sa-uebersetzungs-waechter')
  if (w && w.textContent?.trim() !== WAECHTER_TEXT) return 'Text verändert'
  if (doc.querySelector('[data-onlinetest-blatt] font, #sa-uebersetzungs-waechter font')) return 'Browser-Übersetzung'
  return null
}

/**
 * Alle Wächter, solange der Test läuft. `zeitraum` liefert Beginn/Ende von Zeiträumen (Fenster daneben, Vollbild
 * verlassen), die die Seite selbst erkennt (fensterWaechter.ts).
 */
export function useAufsicht(aktiv: boolean, melden: Melden | null, eigenerDialog: React.MutableRefObject<boolean>): void {
  const meldenRef = useRef(melden)
  meldenRef.current = melden

  useEffect(() => {
    if (!aktiv) return
    const m: Melden = (x, eilig) => meldenRef.current?.(x, eilig)
    const sekSeit = (t: number): number => Math.max(1, Math.round((Date.now() - t) / 1000))

    // ---------- Seite verlassen: sofort melden (eilig), beim Zurückkommen mit Dauer abschließen
    let wegSeit: number | null = null
    const sichtbar = (): void => {
      if (document.visibilityState === 'hidden') {
        if (wegSeit === null) {
          wegSeit = Date.now()
          m({ art: 'verlassen' }, true)
        }
      } else if (wegSeit !== null) {
        m({ art: 'verlassen', ende: true, dauer: sekSeit(wegSeit) })
        wegSeit = null
      }
    }
    const raus = (): void => {
      if (wegSeit === null) {
        wegSeit = Date.now()
        m({ art: 'verlassen' }, true)
      }
    }

    // ---------- Fokus weg (anderes Fenster am PC, Slide Over am iPad): nach 1 s melden, mit Dauer abschließen
    let fokusWeg: number | null = null
    let fokusGemeldet = false
    let fokusUhr: ReturnType<typeof setTimeout> | null = null
    const blur = (): void => {
      if (eigenerDialog.current || document.visibilityState === 'hidden') return
      fokusWeg = Date.now()
      fokusUhr = setTimeout(() => {
        if (fokusWeg === null || document.visibilityState === 'hidden') return
        fokusGemeldet = true
        m({ art: 'fokus' })
      }, 1000)
    }
    const focus = (): void => {
      if (fokusUhr) clearTimeout(fokusUhr)
      if (fokusWeg !== null && fokusGemeldet) m({ art: 'fokus', ende: true, dauer: sekSeit(fokusWeg) })
      fokusWeg = null
      fokusGemeldet = false
    }

    // ---------- Kopieren/Ausschneiden gesperrt und protokolliert, Einfügen protokolliert, kein Kontextmenü
    const istFeld = (e: Event): boolean => {
      const z = e.target as HTMLElement | null
      return Boolean(z?.closest?.('input, textarea, [contenteditable="true"]'))
    }
    let letzteKopie = 0
    const kopieren = (e: ClipboardEvent): void => {
      e.preventDefault()
      if (Date.now() - letzteKopie > 5000) m({ art: 'kopieren', info: istFeld(e) ? 'aus einem Eingabefeld' : 'Aufgabentext' })
      letzteKopie = Date.now()
    }
    const einfuegen = (e: ClipboardEvent): void => {
      const text = e.clipboardData?.getData('text') ?? ''
      m({ art: 'einfuegen', info: `${text.trim().split(/\s+/).filter(Boolean).length} Wörter` })
    }
    const menue = (e: Event): void => {
      if (!istFeld(e)) e.preventDefault()
    }
    const auswahlStart = (e: Event): void => {
      if (!istFeld(e)) e.preventDefault()
    }

    // ---------- Übersetzung: Wächtertext außerhalb des Tests, Beobachter auf <html> und den Test
    const sprache = document.documentElement.lang
    const waechter = document.createElement('div')
    waechter.id = 'sa-uebersetzungs-waechter'
    waechter.setAttribute('aria-hidden', 'true')
    waechter.lang = 'en'
    waechter.textContent = WAECHTER_TEXT
    Object.assign(waechter.style, {
      position: 'fixed',
      left: '0',
      bottom: '0',
      width: '1px',
      height: '1px',
      overflow: 'hidden',
      opacity: '0.01',
      pointerEvents: 'none'
    })
    document.body.appendChild(waechter)
    const meta = document.createElement('meta')
    meta.name = 'google'
    meta.content = 'notranslate'
    document.head.appendChild(meta)
    let uebersetztGemeldet = 0
    const pruefen = (): void => {
      const grund = istUebersetzt(document, sprache)
      if (grund && Date.now() - uebersetztGemeldet > 30_000) {
        uebersetztGemeldet = Date.now()
        m({ art: 'uebersetzt', info: grund })
      }
    }
    const beobachter = new MutationObserver(pruefen)
    beobachter.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'lang'] })
    beobachter.observe(waechter, { childList: true, characterData: true, subtree: true })
    const blatt = document.querySelector('[data-onlinetest-blatt]')
    if (blatt) beobachter.observe(blatt, { childList: true, subtree: true })
    const pruefUhr = setInterval(pruefen, 3000)

    document.addEventListener('visibilitychange', sichtbar)
    window.addEventListener('pagehide', raus)
    window.addEventListener('blur', blur)
    window.addEventListener('focus', focus)
    document.addEventListener('copy', kopieren)
    document.addEventListener('cut', kopieren)
    document.addEventListener('paste', einfuegen)
    document.addEventListener('contextmenu', menue)
    document.addEventListener('selectstart', auswahlStart)
    return () => {
      document.removeEventListener('visibilitychange', sichtbar)
      window.removeEventListener('pagehide', raus)
      window.removeEventListener('blur', blur)
      window.removeEventListener('focus', focus)
      document.removeEventListener('copy', kopieren)
      document.removeEventListener('cut', kopieren)
      document.removeEventListener('paste', einfuegen)
      document.removeEventListener('contextmenu', menue)
      document.removeEventListener('selectstart', auswahlStart)
      if (fokusUhr) clearTimeout(fokusUhr)
      clearInterval(pruefUhr)
      beobachter.disconnect()
      waechter.remove()
      meta.remove()
    }
  }, [aktiv, eigenerDialog])
}

/** Zeitraum-Vorfall (Fenster daneben, Vollbild aus): Beginn sofort melden, Ende mit Dauer */
export function useZeitraum(aktiv: boolean, an: boolean, art: VorfallArt, melden: Melden | null): void {
  const seit = useRef<number | null>(null)
  const meldenRef = useRef(melden)
  meldenRef.current = melden
  useEffect(() => {
    if (aktiv && an && seit.current === null) {
      seit.current = Date.now()
      meldenRef.current?.({ art })
    } else if ((!aktiv || !an) && seit.current !== null) {
      meldenRef.current?.({ art, ende: true, dauer: Math.max(1, Math.round((Date.now() - seit.current) / 1000)) })
      seit.current = null
    }
  }, [aktiv, an, art])
}

/** Bezeichnung für die Lehrkraft */
export const VORFALL_TEXT: Record<VorfallArt, string> = {
  verlassen: 'Seite verlassen',
  fokus: 'Anderes Fenster/App benutzt',
  geteilt: 'Fenster/App daneben',
  vollbild: 'Vollbild verlassen',
  uebersetzt: 'Seite übersetzt',
  kopieren: 'Kopieren versucht',
  einfuegen: 'Text eingefügt'
}
