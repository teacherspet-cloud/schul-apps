/**
 * ZEILEN EINES MATERIALS LESEN, wie sie gedruckt umbrechen (23.10.2026).
 *
 * Befund der Lehrkraft: Erwartungshorizont und Bewertungstabelle der Rückmeldung blieben allgemein
 * und gingen nicht auf das Material ein. Für Zeilenangaben muss die Rückmeldung das Material sehen,
 * wie die Lernenden es bekommen – die Zeilennummern entstehen aber erst beim Setzen im Browser
 * (render/SheetPages.tsx, `textZeilen`; render/zeilenTeilung.ts).
 *
 * Deshalb wird im Messbereich (render/seitenMessen.tsx) gelesen: Dort steht jeder Baustein in voller
 * Breite der Inhaltsfläche, die Absätze brechen also um wie gedruckt. Gezählt wird wie beim Setzen:
 * je Text ab 1, nur die Absätze (nicht Titel, Einleitung, Worterklärungen), hochgestellte Ziffern
 * zählen nicht als eigene Zeile.
 */
import type { WsBlock } from '../model/types'
import { layoutKey } from './SheetPages'
import { woerterInZeilen, type WortLage } from './zeilenTeilung'

/** Weiche Trennstellen (Silbentrennung der Anzeige) gehören nicht in den Text für die KI */
const ohneTrennzeichen = (s: string): string => s.replace(/­/g, '')

/** Wörter eines gesetzten Absatzes mit ihrer Lage (ohne hochgestellte Ziffern) */
function woerterVon(absatz: HTMLElement): WortLage[] {
  const oben = absatz.getBoundingClientRect().top
  const aus: WortLage[] = []
  const range = document.createRange()
  const gang = document.createTreeWalker(absatz, NodeFilter.SHOW_TEXT)
  for (let n = gang.nextNode(); n; n = gang.nextNode()) {
    const inhalt = n.textContent ?? ''
    if (!inhalt.trim() || n.parentElement?.closest('sup, sub')) continue
    for (const m of inhalt.matchAll(/\S+/g)) {
      const start = m.index ?? 0
      range.setStart(n, start)
      range.setEnd(n, start + m[0].length)
      const rects = Array.from(range.getClientRects()).filter((r) => r.bottom - r.top > 0.5)
      if (!rects.length) continue
      const r = rects[0]
      if (rects.every((x) => Math.abs(x.top - r.top) < 2)) {
        aus.push({ text: ohneTrennzeichen(m[0]), top: r.top - oben, bottom: r.bottom - oben })
        continue
      }
      // Silbengetrenntes Wort über zwei Zeilen: wie gedruckt teilen („Nieder-" | „schlag")
      let stueck = ''
      let lage: DOMRect | null = null
      const fertig = (letztes: boolean): void => {
        const t = ohneTrennzeichen(stueck)
        if (t && lage) aus.push({ text: letztes || t.endsWith('-') ? t : `${t}-`, top: lage.top - oben, bottom: lage.bottom - oben })
      }
      for (let i = 0; i < m[0].length; i++) {
        range.setStart(n, start + i)
        range.setEnd(n, start + i + 1)
        // Am Umbruch meldet der Browser zusätzlich ein leeres Rechteck am Ende der Vorzeile – es zählt das mit Breite
        const z = Array.from(range.getClientRects())
          .filter((x) => x.bottom - x.top > 0.5)
          .sort((a, b) => b.width - a.width)[0]
        if (z && z.width <= 0.1 && m[0][i] === '­') {
          stueck += m[0][i]
          continue
        }
        if (z && lage && Math.abs(z.top - lage.top) >= 2) {
          fertig(false)
          stueck = ''
          lage = z
        }
        if (z && !lage) lage = z
        stueck += m[0][i]
      }
      fertig(true)
    }
  }
  return aus
}

/**
 * Zeilen aller Texte MIT Zeilennummern im Schülerteil der Blätter, gelesen aus dem Messbereich.
 * Schlüssel: Kennung des Bausteins; Wert: Zeile 1, 2, 3 … als Text.
 */
export function leseMaterialZeilen(bereich: HTMLElement, blaetter: readonly { id: string; blocks: readonly WsBlock[] }[]): Map<string, string[]> {
  const aus = new Map<string, string[]>()
  for (const blatt of blaetter) {
    const teil = bereich.querySelector<HTMLElement>(`[data-layout="${CSS.escape(layoutKey(blatt.id, false))}"]`)
    if (!teil) continue
    for (const b of blatt.blocks) {
      if (b.type !== 'text' || !b.lineNumbers) continue
      const el = teil.querySelector<HTMLElement>(`[data-measure-block="${CSS.escape(b.id)}"]`)
      if (!el) continue
      const absaetze = Array.from(el.querySelectorAll<HTMLElement>('.ws-text-body [data-absatz]')).filter((u) => !u.closest('.ws-glossary'))
      const zeilen = absaetze.flatMap((u) => woerterInZeilen(woerterVon(u)))
      if (zeilen.length) aus.set(b.id, zeilen)
    }
  }
  return aus
}
