import { useEffect } from 'react'
import { htmlMitTrennung } from '../silbentrennung'

/**
 * Für die Wachen (nur im Selbsttest, `window.__selftest`): das Druck-HTML des gerade bearbeiteten
 * Dokuments – gebaut von der Ansicht selbst, mit IHRER Seitenaufteilung, genau wie der Export.
 *
 * Anlass: die Seitenrand-Wache (tests/e2e/seitenrand.mjs, 30.09.2026) prüft für jedes Programm,
 * dass im Druck nichts über den Satzspiegel ragt. Eine Wache, die das Blatt für den Druck selbst
 * nachbaut, prüft am Ende sich selbst – deshalb liefert die Ansicht die Funktion.
 * Ohne Selbsttest tut der Haken nichts.
 */
export function useDruckFuerWachen(bauen: (() => string) | null, abhaengig: readonly unknown[]): void {
  useEffect(() => {
    const w = window as unknown as { __selftest?: Record<string, unknown> }
    if (!w.__selftest || !bauen) return
    w.__selftest.druckHtmlJetzt = bauen
    /*
     * Wie es wirklich ins PDF geht (05.10.2026): mit den weichen Trennstrichen, die window.api vor dem
     * Umrechnen einsetzt (silbentrennung.ts). Ohne sie brechen Tabellenzellen anders um als in der
     * Ansicht – die Wache maß dann ein Blatt, das es so nie gibt.
     */
    w.__selftest.druckHtmlGetrennt = () => htmlMitTrennung(bauen())
    // Neu gesetzt wird nur, wenn sich Dokument oder Seitenaufteilung ändern
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, abhaengig)
}
